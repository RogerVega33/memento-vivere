import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadComponent } from './component-render.mjs';

const { Database } = loadComponent('src/server/postgres/database.ts');
const { PostgresAuthStore } = loadComponent('src/server/postgres/auth-store.ts');
const { PostgresAuthRepository } = loadComponent('src/server/postgres/auth-repository.ts');
const { PostgresLifeRepository } = loadComponent('src/server/postgres/life-repository.ts');
const { createStorage } = loadComponent('src/server/storage.ts');
const { errorDetails } = loadComponent('src/server/logger.mjs');
const id = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const memoryId = '00000000-0000-4000-8000-000000000003';
const photoId = '00000000-0000-4000-8000-000000000004';
const now = new Date('2026-10-20T15:00:00.000Z');
const token = 'a'.repeat(43);
const hash = createHash('sha256').update(token).digest();
const password = 'una contraseña ficticia';
const phrase = 'acorn baker cabin dance eager fable giant habit';
const credential = { id, username: 'Alice', password_hash: `hash:${password}`, recovery_phrase_hash: `hash:${phrase}` };
const profileRow = { birth_date: '2000-01-01', horizon_years: 25, created_at: now, today: '2026-10-20' };
const existing = { id: memoryId, title: 'Privado', description: '', event_year: 2020, event_month: 1, event_day: null,
  version: 2, created_at: now, updated_at: now, tags: ['Viaje a Perú'], photo_ids: [photoId] };
const secrets = { hashSecret: async value => `hash:${value}`, verifySecret: async (value, expected) => expected === `hash:${value}`, generateRecoveryPhrase: () => phrase };
const result = rows => ({ rows, rowCount: rows.length });
const step = (pattern, rows = [], check) => ({ pattern, rows, check });
const begin = () => step(/^BEGIN/);
const commit = () => step(/^COMMIT$/);
const rollback = () => step(/^ROLLBACK$/);

// Query recorder, not a SQL engine: no driver, network, environment or DB files.
function scripted(steps) {
  const calls = [], releases = [];
  let connections = 0;
  const pool = {
    async connect() {
      const connection = ++connections;
      return {
        async query(sql, values = []) {
          calls.push({ sql, values, connection });
          const expected = steps.shift();
          assert.ok(expected, `Unexpected SQL: ${sql}`);
          assert.match(sql, expected.pattern);
          expected.check?.(values, sql);
          if (expected.error) throw expected.error;
          return result(expected.rows);
        },
        release(broken) { releases.push({ connection, broken }); },
      };
    },
    async end() {},
  };
  return { db: new Database(pool), pool, calls, releases,
    done() { assert.equal(steps.length, 0, 'Unconsumed queries'); assert.equal(releases.length, connections); } };
}
const credentialRead = (row = credential) => [begin(), step(/FROM memento.users\s+WHERE \(lower/, row ? [row] : []), commit()];
const sessionLock = (active = true) => [step(/FROM memento.users.*FOR UPDATE/), step(/FROM memento.sessions[\s\S]*FOR UPDATE/, active ? [{ token_hash: hash }] : [])];
const context = (row = profileRow) => step(/FROM \(SELECT 1\)/, [row]);
const writeContext = () => [step(/FROM memento.profiles.*FOR UPDATE/), context()];
const readSession = (active = true) => step(/FROM memento.sessions/, active ? [{ token_hash: hash }] : []);
const repository = fake => new PostgresLifeRepository(fake.db, id, hash, { uploadInProgress: false });
const input = { id: null, draft: { title: 'Un recuerdo', year: 2020, month: 1, day: null, tags: ['Viajes'] },
  retainedPhotoIds: [], photos: [], version: null };

test('transactions use one reserved connection, roll back and retry only recoverable failures', async () => {
  const fake = scripted([begin(), { ...step(/^WORK$/), error: { code: '40001' } }, rollback(), begin(), step(/^WORK$/, [{ ok: true }]), commit()]);
  const value = await fake.db.transaction(async client => (await client.query('WORK')).rows[0]);
  assert.deepEqual(value, { ok: true });
  assert.deepEqual(fake.calls.map(call => call.connection), [1, 1, 1, 2, 2, 2]);
  fake.done();
});

test('an irrecoverable rollback destroys its connection and never retries the transaction', async () => {
  const failure = new Error('fictional connection failure');
  const fake = scripted([begin(), { ...step(/^WORK$/), error: failure }, { ...rollback(), error: failure }]);
  await assert.rejects(fake.db.transaction(client => client.query('WORK')), failure);
  assert.equal(fake.releases[0].broken, true);
  fake.done();
});

test('PostgreSQL is the only store, its construction does not query or connect', () => {
  let connected = false;
  const pool = { connect() { connected = true; throw new Error('Must not connect'); }, async end() {} };
  assert.ok(createStorage({}, pool));
  assert.equal(connected, false);
  assert.throws(() => createStorage({}), /PGHOST/);
});

test('registration atomically stores only hashes and a seven-day session, never raw secrets', async () => {
  let registeredId;
  const fake = scripted([begin(), step(/ORDER BY id FOR UPDATE/), step(/INSERT INTO memento.users/, [], values => {
    registeredId = values[0];
    assert.equal(values[2], `hash:${password}`); assert.equal(values[3], `hash:${phrase}`);
  }), step(/INSERT INTO memento.sessions[\s\S]*INTERVAL '1 second'/, [], values => {
    assert(Buffer.isBuffer(values[0])); assert.equal(values[0].length, 32);
    assert.equal(values[1], registeredId);
    assert.equal(values[2], 604800);
  }), commit()]);
  const registered = await new PostgresAuthStore(fake.db, secrets).register({ username: 'Alice', password });
  assert.equal(registered.user.id, registeredId);
  assert.equal(registered.recoveryPhrase, phrase);
  assert.notEqual(registered.token, fake.calls.find(call => /INSERT INTO memento.sessions/.test(call.sql)).values[0]);
  assert.deepEqual(Object.keys(registered.user).sort(), ['id', 'username']);
  fake.done();
});

test('a database failure propagates without creating any alternate account store', async () => {
  let connects = 0;
  const failure = new Error('fictional database unavailable');
  const pool = { async connect() { connects++; throw failure; }, async end() {} };
  const store = createStorage({}, pool);
  await assert.rejects(store.login({ username: 'Alice', password }), failure);
  assert.equal(connects, 1);
});

test('missing or malformed session tokens do not open a database connection', async () => {
  const fake = scripted([]);
  const store = new PostgresAuthStore(fake.db, secrets);
  for (const value of [null, '', 'invalid', 'a'.repeat(44)]) assert.equal(await store.authenticate(value), null);
  fake.done();
});

test('a missing profile prevents saving and cannot be replaced by a volatile profile', async () => {
  const fake = scripted([begin(), ...sessionLock(), ...writeContext().slice(0, 1),
    context({ ...profileRow, birth_date: null, horizon_years: null, created_at: null }), rollback()]);
  await assert.rejects(repository(fake).save(input, memoryId), { status: 409 });
  assert(!fake.calls.some(call => /^(?:INSERT|UPDATE|DELETE)/.test(call.sql)));
  fake.done();
});

test('a previously configured birth date cannot be overwritten through profile setup', async () => {
  const fake = scripted([begin(), ...sessionLock(), ...writeContext(), rollback()]);
  await assert.rejects(repository(fake).setup('2001-01-01'), { status: 409 });
  assert(!fake.calls.some(call => /^(?:INSERT|UPDATE|DELETE)/.test(call.sql)));
  fake.done();
});

test('a failed login commits the atomic counter increment before returning 401', async () => {
  const fake = scripted([...credentialRead(), begin(), step(/FROM memento.users.*FOR UPDATE/),
    step(/login_attempts = login_attempts \+ 1[\s\S]*password_hash = \$2/, [], values => assert.deepEqual(values, [id, credential.password_hash])), commit()]);
  await assert.rejects(new PostgresAuthStore(fake.db, secrets).login({ username: 'ALICE', password: 'incorrecta' }), { status: 401 });
  assert.equal(fake.calls.at(-1).sql, 'COMMIT');
  assert(!fake.calls.some(call => call.sql === 'ROLLBACK'));
  fake.done();
});

test('an unknown login performs the dummy verification and creates no account or counter', async () => {
  const fake = scripted(credentialRead(null));
  let expected;
  const store = new PostgresAuthStore(fake.db, { ...secrets, verifySecret: async (_value, hash) => { expected = hash; return false; } });
  await assert.rejects(store.login({ username: 'Nobody', password }), { status: 401 });
  assert.equal(expected, null);
  fake.done();
});

test('successful login resets attempts and locks both token owners in UUID order before replacement', async () => {
  const fake = scripted([...credentialRead(), begin(), step(/SELECT user_id FROM memento.sessions/, [{ user_id: otherId }]),
    step(/ORDER BY id FOR UPDATE/, [], values => assert.deepEqual(values[0], [id, otherId])),
    step(/SET login_attempts = 0[\s\S]*password_hash = \$2/, [{ id, username: 'Alice' }]),
    step(/DELETE FROM memento.sessions[\s\S]*ANY/), step(/INSERT INTO memento.sessions/), commit()]);
  const loggedIn = await new PostgresAuthStore(fake.db, secrets).login({ username: 'Alice', password }, token);
  assert.deepEqual(loggedIn.user, { id, username: 'Alice' });
  assert.notEqual(loggedIn.token, token);
  fake.done();
});

test('a recovery already consumed concurrently cannot replace credentials or revoke sessions again', async () => {
  const fake = scripted([...credentialRead(), begin(), step(/ORDER BY id FOR UPDATE/),
    step(/recovery_phrase_hash = \$2 RETURNING/), commit()]);
  await assert.rejects(new PostgresAuthStore(fake.db, secrets).recover({ username: 'Alice', password, recoveryPhrase: phrase }), { status: 401 });
  assert(!fake.calls.some(call => /^DELETE/.test(call.sql)));
  fake.done();
});

test('successful recovery rotates both hashes and revokes old sessions in the same transaction', async () => {
  const fake = scripted([...credentialRead(), begin(), step(/ORDER BY id FOR UPDATE/),
    step(/SET password_hash = \$3, recovery_phrase_hash = \$4, login_attempts = 0/, [{ id, username: 'Alice' }], values => {
      assert.equal(values[1], credential.recovery_phrase_hash);
      assert.equal(values[2], `hash:${password} nueva`);
      assert.equal(values[3], `hash:${phrase} again`);
    }), step(/DELETE FROM memento.sessions WHERE user_id/), step(/INSERT INTO memento.sessions/), commit()]);
  const store = new PostgresAuthStore(fake.db, { ...secrets, generateRecoveryPhrase: () => `${phrase} again` });
  const recovered = await store.recover({ username: 'Alice', password: password + ' nueva', recoveryPhrase: phrase });
  assert.equal(recovered.recoveryPhrase, phrase + ' again');
  fake.done();
});

test('password changes allow reuse and keep only the initiating session without touching recovery words', async () => {
  const fake = scripted([begin(), step(/FROM memento.sessions s/, [{ id, username: 'Alice' }]), commit(),
    begin(), step(/FROM memento.users WHERE id/, [credential]), commit(),
    begin(), ...sessionLock(), step(/UPDATE memento.users SET password_hash = \$3/, [{ id, username: 'Alice' }]),
    step(/DELETE FROM memento.sessions.*token_hash <> \$2/, [], values => assert.deepEqual(values[1], hash)), commit()]);
  assert.deepEqual(await new PostgresAuthStore(fake.db, secrets).changePassword({ currentPassword: password, newPassword: password }, token), { id, username: 'Alice' });
  assert(!fake.calls.some(call => /^UPDATE/.test(call.sql) && /recovery_phrase_hash/.test(call.sql)));
  fake.done();
});

test('session revocation during password hashing prevents credential writes', async () => {
  const fake = scripted([begin(), ...sessionLock(false), rollback()]);
  await assert.rejects(new PostgresAuthRepository(fake.db).changePassword(id, hash, 'old', 'new'), { status: 401 });
  assert(!fake.calls.some(call => /^UPDATE/.test(call.sql)));
  fake.done();
});

test('snapshot preserves profile horizon and searches accents/tags without reading photo bytes', async () => {
  const fake = scripted([begin(), readSession(), context(),
    step(/SELECT m.id, m.title, m.description/, [{ id: memoryId, title: 'Otro', description: '', tags: ['Viaje a Perú'] }]),
    step(/GROUP BY m.event_year, m.event_month/, [{ event_year: 2020, event_month: 1, memory_count: '2', photo_count: '7', matching_count: '1' }],
      values => assert.deepEqual(values, [id, [memoryId]])), commit()]);
  const snapshot = await repository(fake).snapshot('PERU');
  assert.equal(snapshot.profile.horizonYears, 25);
  assert.equal(snapshot.today, '2026-10-20');
  assert.equal(snapshot.photoCount, 7);
  assert.deepEqual(snapshot.search, { query: 'PERU', monthCounts: { '2020-01': 1 }, memoryCount: 1 });
  assert(!fake.calls.some(call => /p\.data/.test(call.sql)));
  fake.done();
});

test('profile setup creates one profile using the database clock and default horizon', async () => {
  const fake = scripted([begin(), ...sessionLock(), step(/FROM memento.profiles.*FOR UPDATE/),
    context({ ...profileRow, birth_date: null, horizon_years: null, created_at: null }),
    step(/INSERT INTO memento.profiles/, [{ created_at: now }], values => assert.deepEqual(values, [id, '2000-01-01', 80])), commit()]);
  const profile = await repository(fake).setup('2000-01-01');
  assert.deepEqual(profile, { birthDate: '2000-01-01', horizonYears: 80, createdAt: now.toISOString() });
  fake.done();
});

test('month reads preserve unknown days and derive precision without a stored column', async () => {
  const fake = scripted([begin(), readSession(), context(), step(/ORDER BY m.event_day ASC NULLS LAST, m.created_at, m.id/, [existing]), commit()]);
  const memories = await repository(fake).listMonth('2020-01');
  assert.equal(memories[0].precision, 'MONTH');
  assert.equal(memories[0].day, null);
  assert.deepEqual(memories[0].tags, ['Viaje a Perú']);
  fake.done();
});

test('save commits memory, tag set, photo order and binary data atomically without a global quota', async () => {
  const photo = { id: photoId, data: new Uint8Array([1, 2, 3]), width: 2400, height: 1800 };
  const fake = scripted([begin(), ...sessionLock(), ...writeContext(),
    step(/INSERT INTO memento.memories/, [{ created_at: now, updated_at: now, version: 1 }]),
    step(/DELETE FROM memento.memory_tags/), step(/INSERT INTO memento.memory_tags/, [], values => assert.deepEqual(values, [memoryId, ['Viajes']])),
    step(/SET CONSTRAINTS.*DEFERRED/), step(/DELETE FROM memento.photos/),
    step(/INSERT INTO memento.photos/, [], values => {
      assert.deepEqual(values, [photoId, memoryId, 1, Buffer.from(photo.data), 2400, 1800]);
    }), commit()]);
  const saved = await repository(fake).save({ ...input, photos: [photo] }, memoryId);
  assert.equal(saved.precision, 'MONTH'); assert.equal(saved.day, null);
  assert.equal(saved.createdAt, saved.updatedAt);
  assert.deepEqual(saved.photoIds, [photoId]);
  fake.done();
});

test('a photo write failure rolls back memory and tag changes instead of committing a partial save', async () => {
  const failure = Object.assign(new Error('fictional disk full'), { code: '53100' });
  const fake = scripted([begin(), ...sessionLock(), ...writeContext(),
    step(/INSERT INTO memento.memories/, [{ created_at: now, updated_at: now, version: 1 }]),
    step(/DELETE FROM memento.memory_tags/), step(/INSERT INTO memento.memory_tags/),
    step(/SET CONSTRAINTS/), step(/DELETE FROM memento.photos/), { ...step(/INSERT INTO memento.photos/), error: failure }, rollback()]);
  await assert.rejects(repository(fake).save({ ...input, photos: [{ id: photoId, data: new Uint8Array([1]), width: 1, height: 1 }] }, memoryId), failure);
  assert(!fake.calls.some(call => call.sql === 'COMMIT'));
  fake.done();
});

test('stale edits fail before deleting tags or changing photos', async () => {
  const fake = scripted([begin(), ...sessionLock(), ...writeContext(), step(/FOR UPDATE OF m/, [existing]), rollback()]);
  await assert.rejects(repository(fake).save({ ...input, id: memoryId, version: 1 }, memoryId), { status: 409 });
  assert(!fake.calls.some(call => /^(?:UPDATE|DELETE|INSERT)/.test(call.sql)));
  fake.done();
});

test('editing a memory retains its photo, increments version and uses timestamps returned by PostgreSQL', async () => {
  const changedAt = new Date(now.getTime() + 1000);
  const fake = scripted([begin(), ...sessionLock(), ...writeContext(), step(/FOR UPDATE OF m/, [existing]),
    step(/UPDATE memento.memories[\s\S]*version = version \+ 1/, [{ created_at: now, updated_at: changedAt, version: 3 }]),
    step(/DELETE FROM memento.memory_tags/), step(/INSERT INTO memento.memory_tags/), step(/SET CONSTRAINTS/),
    step(/DELETE FROM memento.photos/, [], values => assert.deepEqual(values, [memoryId, [photoId]])),
    step(/UPDATE memento.photos SET position/, [], values => assert.deepEqual(values, [memoryId, photoId, 1])), commit()]);
  const saved = await repository(fake).save({ ...input, id: memoryId, version: 2, retainedPhotoIds: [photoId] }, otherId);
  assert.equal(saved.id, memoryId);
  assert.equal(saved.version, 3);
  assert.equal(saved.createdAt, now.toISOString());
  assert.equal(saved.updatedAt, changedAt.toISOString());
  fake.done();
});

test('deletion confirms owner and version before deleting the memory with cascading children', async () => {
  const fake = scripted([begin(), ...sessionLock(), ...writeContext(), step(/FOR UPDATE OF m/, [existing]),
    step(/DELETE FROM memento.memories WHERE user_id = \$1::uuid AND id = \$2::uuid/, [], values => assert.deepEqual(values, [id, memoryId])), commit()]);
  await repository(fake).delete(memoryId, 2);
  fake.done();
});

test('logout locks the account before deleting only its matching session', async () => {
  const fake = scripted([begin(), step(/SELECT user_id FROM memento.sessions/, [{ user_id: id }]),
    step(/FROM memento.users.*FOR UPDATE/), step(/DELETE FROM memento.sessions.*user_id = \$2/, [], values => assert.deepEqual(values, [hash, id])), commit()]);
  await new PostgresAuthStore(fake.db, secrets).logout(token);
  fake.done();
});

test('foreign memories are filtered by owner and cannot be deleted', async () => {
  const fake = scripted([begin(), ...sessionLock(), ...writeContext(), step(/m.user_id = \$1::uuid AND m.id = \$2::uuid/, [], values => assert.deepEqual(values, [id, memoryId])), rollback()]);
  await assert.rejects(repository(fake).delete(memoryId, 1), { status: 404 });
  fake.done();
});

test('private photos require a current session, owner and visible memory; malformed IDs return no data', async () => {
  const fake = scripted([begin(), readSession(), step(/JOIN memento.visible_memories[\s\S]*m.user_id = \$1::uuid AND p.id = \$2::uuid/, [], values => assert.deepEqual(values, [id, photoId])), commit()]);
  const repo = repository(fake);
  assert.equal(await repo.getPhoto('invalid'), null);
  assert.equal(await repo.getPhoto(photoId), null);
  fake.done();
});

test('PostgreSQL diagnostics never expose SQL error text or values to application logs', () => {
  const error = Object.assign(new Error('fictional private title and credential'), { code: '23505' });
  assert.deepEqual(errorDetails(error), { name: 'DatabaseError', code: '23505' });
});
