import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponent } from './component-render.mjs';

const { auth } = loadComponent('src/server/store.ts');
const { saveMemory } = loadComponent('src/server/save-memory.ts');
const images = loadComponent('src/server/images.mjs');
const { RepositoryError } = loadComponent('src/domain/errors.mjs');

function request(count) {
  const form = new FormData();
  form.set('payload', JSON.stringify({ title: 'Recuerdo ficticio', year: 2020, month: 5, day: null }));
  for (let index = 0; index < count; index++) form.append('photos', new File(['fictional HEIC'], 'fictional.heic'));
  return new Request('http://localhost/api/memories', { method: 'POST', headers: { cookie: `mv_session=${'a'.repeat(43)}` }, body: form });
}

test('conversion failure never calls persistence and releases the lock so a retry can save', async () => {
  const originalOptimize = images.optimizePhoto;
  const originalAuthenticate = auth.authenticate;
  const writes = [];
  const repository = { uploadInProgress: false, async requireProfile() { return { birthDate: '1990-01-01' }; },
    async save(input) { writes.push(input); return { id: 'saved' }; } };
  auth.authenticate = async () => ({ user: { id: 'fictional-user' }, repository });
  let processed = 0;
  const output = () => ({ data: Buffer.from('fictional photo'), width: 2, height: 3 });
  try {
    images.optimizePhoto = async () => {
      if (++processed === 2) throw new RepositoryError('Fallo de conversión simulado', 503);
      return output();
    };
    await assert.rejects(() => saveMemory(request(2)), { status: 503 });
    assert.equal(processed, 2);
    assert.equal(writes.length, 0);
    assert.equal(repository.uploadInProgress, false);
    images.optimizePhoto = async () => output();
    assert.deepEqual(await saveMemory(request(1)), { id: 'saved' });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].photos.length, 1);
    assert.equal(repository.uploadInProgress, false);
  } finally { images.optimizePhoto = originalOptimize; auth.authenticate = originalAuthenticate; }
});

test('session revocation during conversion prevents any persistence call', async () => {
  const originalOptimize = images.optimizePhoto;
  const originalAuthenticate = auth.authenticate;
  let active = true, writes = 0;
  const repository = { uploadInProgress: false, async requireProfile() { return { birthDate: '1990-01-01' }; },
    async save() { writes++; } };
  auth.authenticate = async () => active ? { user: { id: 'fictional-user' }, repository } : null;
  try {
    images.optimizePhoto = async () => { active = false; return { data: Buffer.from('fictional photo'), width: 2, height: 3 }; };
    await assert.rejects(() => saveMemory(request(1)), { status: 401 });
    assert.equal(writes, 0);
    assert.equal(repository.uploadInProgress, false);
  } finally { images.optimizePhoto = originalOptimize; auth.authenticate = originalAuthenticate; }
});
