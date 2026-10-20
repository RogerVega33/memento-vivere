import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestRequest } from '../src/components/latest-request.mjs';

test('a newer refresh aborts the previous request and invalidates late results', async () => {
  const requests = createLatestRequest();
  let resolveOld;
  let resolveNew;
  let entries = [];
  const old = requests.start();
  const oldResult = new Promise(resolve => { resolveOld = resolve; }).then(value => { if (old.isCurrent()) entries = value; });
  const current = requests.start();
  const currentResult = new Promise(resolve => { resolveNew = resolve; }).then(value => { if (current.isCurrent()) entries = value; });
  assert.equal(old.signal.aborted, true);
  resolveNew(['febrero ficticio']);
  await currentResult;
  resolveOld(['enero ficticio']);
  await oldResult;
  assert.deepEqual(entries, ['febrero ficticio']);
  assert.equal(current.isCurrent(), true);
});

test('navigation or unmount cancels even a manual refresh without an external signal', () => {
  const requests = createLatestRequest();
  const pending = requests.start();
  requests.cancel();
  assert.equal(pending.signal.aborted, true);
  assert.equal(pending.isCurrent(), false);
  requests.cancel();
  const next = requests.start();
  assert.equal(next.isCurrent(), true);
  assert.equal(next.signal.aborted, false);
});
