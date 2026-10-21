import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareSchema } from '../src/server/postgres/schema.mjs';
import { prepareDatabase } from '../src/server/postgres/initialize.mjs';

const environment = { PGHOST: 'fictional-host', PGPORT: '5432', PGDATABASE: 'fictional_database', PGUSER: 'fictional_user', PGPASSWORD: 'fictional password' };
const catalog = ['users', 'profiles', 'sessions', 'memories', 'memory_tags', 'photos'].map(object_name => ({ schema_name: 'memento', object_name, kind: 'r' }));
catalog.push({ schema_name: 'memento', object_name: 'visible_memories', kind: 'v' });
const begin = () => ({ sql: /^BEGIN ISOLATION LEVEL READ COMMITTED$/ });
const settings = () => [{ sql: /^SET LOCAL lock_timeout/ }, { sql: /^SELECT pg_catalog.pg_advisory_xact_lock\(/ }, { sql: /^SET LOCAL search_path/ }];
const inventory = rows => ({ sql: /FROM pg_catalog.pg_namespace/, rows });
const probes = () => [...['users', 'profiles', 'sessions', 'memories', 'memory_tags', 'photos', 'visible_memories'].map(table => ({ sql: new RegExp(`FROM memento\\.${table} LIMIT 0$`) }))];
const commit = () => ({ sql: /^COMMIT$/ });
const rollback = () => ({ sql: /^ROLLBACK$/ });

// Records SQL sent to a fake client. It never loads a driver or opens a socket.
function scripted(steps) {
  const calls = [], releases = [];
  let connects = 0, closes = 0;
  const pool = {
    async connect() {
      connects++;
      return { async query(sql) {
        calls.push(sql);
        const expected = steps.shift();
        assert(expected, `Unexpected SQL: ${sql}`);
        assert.match(sql, expected.sql);
        if (expected.error) throw expected.error;
        return { rows: expected.rows ?? [], rowCount: expected.rows?.length ?? 0 };
      }, release(broken) { releases.push(broken); } };
    },
    async end() { closes++; },
  };
  return { pool, calls, get closes() { return closes; }, done() { assert.equal(steps.length, 0); assert.equal(releases.length, connects); }, releases };
}

test('an empty database initializes the actual bundled schema and validates its columns before commit', async () => {
  const initial = await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8');
  assert.match(initial, /CREATE TABLE memento.users/);
  assert.doesNotMatch(initial, /^BEGIN;|^COMMIT;/m);
  const fake = scripted([begin(), ...settings(), inventory([]), { sql: /CREATE SCHEMA memento;[\s\S]*CREATE TABLE memento.photos/ }, ...probes(), commit()]);
  let reads = 0;
  const result = await prepareSchema(fake.pool, async () => { reads++; return initial; });
  assert.deepEqual(result, { created: true });
  assert.equal(reads, 1);
  assert.equal(fake.calls.filter(sql => sql.includes('CREATE SCHEMA')).length, 1);
  fake.done();
});

test('an existing complete schema is checked without loading or executing initialization SQL', async () => {
  const fake = scripted([begin(), ...settings(), inventory(catalog), ...probes(), commit()]);
  assert.deepEqual(await prepareSchema(fake.pool, async () => { throw new Error('Must not read initial SQL'); }), { created: false });
  assert(!fake.calls.some(sql => /CREATE|ALTER|DROP|INSERT|UPDATE|DELETE/.test(sql)));
  fake.done();
});

test('foreign, partial and empty pre-existing app schemas stop startup without attempting repairs', async () => {
  for (const rows of [
    [{ schema_name: 'public', object_name: 'other_app', kind: 'r' }],
    catalog.filter(row => row.object_name !== 'photos'),
    [{ schema_name: 'memento', object_name: null, kind: null }],
    catalog.map(row => row.object_name === 'visible_memories' ? { ...row, kind: 'r' } : row),
  ]) {
    const fake = scripted([begin(), ...settings(), inventory(rows), rollback()]);
    await assert.rejects(prepareSchema(fake.pool, async () => { throw new Error('Must not read SQL'); }), /incompleto o pertenece/);
    assert(!fake.calls.some(sql => /CREATE|ALTER|DROP/.test(sql)));
    fake.done();
  }
});

test('missing columns in an existing schema fail validation and roll back without changing it', async () => {
  const failure = Object.assign(new Error('fictional missing column'), { code: '42703' });
  const fake = scripted([begin(), ...settings(), inventory(catalog), { ...probes()[0], error: failure }, rollback()]);
  await assert.rejects(prepareSchema(fake.pool), failure);
  assert(!fake.calls.some(sql => /CREATE|ALTER|DROP/.test(sql)));
  fake.done();
});

test('failed initial DDL rolls back and never commits a partially prepared schema', async () => {
  const failure = Object.assign(new Error('fictional DDL failure'), { code: '42501' });
  const fake = scripted([begin(), ...settings(), inventory([]), { sql: /^fictional DDL$/, error: failure }, rollback()]);
  await assert.rejects(prepareSchema(fake.pool, async () => 'fictional DDL'), failure);
  assert(!fake.calls.includes('COMMIT'));
  fake.done();
});

test('failure to roll back discards the broken initialization connection', async () => {
  const failure = new Error('fictional connection lost');
  const fake = scripted([begin(), { ...settings()[0], error: failure }, { ...rollback(), error: failure }]);
  await assert.rejects(prepareSchema(fake.pool), failure);
  assert.deepEqual(fake.releases, [true]);
  fake.done();
});

test('startup preparation uses explicit credentials, completes schema work and closes its temporary pool', async () => {
  let closed = false, prepared = false;
  const pool = { async connect() { throw new Error('No real DB'); }, async end() { assert.equal(prepared, true); closed = true; } };
  const result = await prepareDatabase(environment, {
    createPool(config) { assert.equal(config.password, environment.PGPASSWORD); return pool; },
    async prepare(received) { assert.equal(received, pool); await Promise.resolve(); prepared = true; return { created: false }; },
  });
  assert.deepEqual(result, { created: false });
  assert.equal(closed, true);
});

test('startup failure closes the temporary pool and does not expose SQL diagnostics or credentials', async () => {
  const original = console.error, logs = [];
  console.error = value => logs.push(value);
  let closed = false;
  const pool = { async connect() { throw new Error('No real DB'); }, async end() { closed = true; throw new Error('fictional close failure'); } };
  try {
    await assert.rejects(prepareDatabase(environment, {
      createPool: () => pool,
      async prepare() { throw Object.assign(new Error(`private SQL ${environment.PGPASSWORD}`), { code: '42501' }); },
    }), /No se pudo preparar PostgreSQL/);
    assert.equal(closed, true);
    const entries = logs.map(value => JSON.parse(value));
    assert.deepEqual(entries.map(entry => entry.event), ['database.prepare_failed', 'database.close_failed']);
    assert.deepEqual(entries[0].error, { name: 'DatabaseError', code: '42501' });
    assert.doesNotMatch(logs.join(''), /private SQL|fictional close failure/);
    assert(!logs.join('').includes(environment.PGPASSWORD));
  } finally { console.error = original; }
});

test('invalid startup configuration never constructs a pool', async () => {
  let created = false;
  await assert.rejects(prepareDatabase({}, { createPool() { created = true; throw new Error('Must not create pool'); } }), /PGHOST/);
  assert.equal(created, false);
});
