import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanelHistory } from '../src/components/panel-history.mjs';

// Model browser traversal (popstate is deferred) without an app, network or DB.
function fixture(initialState = { __NA: true, tree: ['fictional-next-tree'] }) {
  const entries = [null, structuredClone(initialState)];
  const listeners = new Set();
  const pending = [];
  let index = 1;
  let backCalls = 0;
  const history = {
    get state() { return entries[index]; },
    pushState(state, _title, url) {
      assert.equal(url, undefined, 'panel navigation keeps the current URL');
      entries.splice(index + 1, entries.length, structuredClone(state));
      index++;
    },
    replaceState(state, _title, url) {
      assert.equal(url, undefined);
      entries[index] = structuredClone(state);
    },
    back() { backCalls++; pending.push(-1); },
    forward() { pending.push(1); },
  };
  const browser = {
    history,
    addEventListener(name, listener) { assert.equal(name, 'popstate'); listeners.add(listener); },
    removeEventListener(name, listener) { assert.equal(name, 'popstate'); listeners.delete(listener); },
  };
  return {
    browser, entries,
    get index() { return index; },
    get backCalls() { return backCalls; },
    flush() {
      while (pending.length) {
        index = Math.min(entries.length - 1, Math.max(0, index + pending.shift()));
        for (const listener of listeners) listener({ state: entries[index] });
      }
    },
  };
}
const auth = (f, changes) => createPanelHistory(f.browser, {
  initial: 'login', panels: ['login', 'register', 'recover'], onChange: panel => changes.push(panel),
});

test('Back returns from registration/recovery to login; Forward restores that screen', () => {
  for (const target of ['register', 'recover']) {
    const f = fixture();
    const changes = [];
    const controller = auth(f, changes);
    controller.navigate(target);
    assert.equal(f.index, 2);
    f.browser.history.back(); f.flush();
    assert.equal(f.index, 1, 'stays on the app entry');
    assert.deepEqual(changes, [target, 'login']);
    f.browser.history.forward(); f.flush();
    assert.deepEqual(changes, [target, 'login', target]);
    controller.dispose();
  }
});

test('return button consumes its entry once, and reopening does not accumulate panels', () => {
  const f = fixture();
  const changes = [];
  const controller = auth(f, changes);
  controller.navigate('register');
  controller.navigate('login'); controller.navigate('login');
  assert.equal(f.backCalls, 1);
  f.flush();
  controller.navigate('recover');
  assert.equal(f.entries.length, 3);
  controller.navigate('register');
  assert.equal(f.entries.length, 3, 'switching temporary screens uses the same entry');
  f.browser.history.back(); f.flush();
  assert.equal(changes.at(-1), 'login');
  controller.dispose();
});

test('Back only closes password dialog, restoring the underlying signed-in screen', () => {
  const f = fixture();
  const changes = [];
  const controller = createPanelHistory(f.browser, { initial: 'closed', panels: ['closed', 'password'], onChange: value => changes.push(value) });
  controller.navigate('password');
  f.browser.history.back(); f.flush();
  assert.equal(f.index, 1);
  assert.deepEqual(changes, ['password', 'closed']);
  controller.navigate('password');
  controller.navigate('closed'); f.flush();
  assert.equal(f.index, 1, 'Cancel/X/saving consume the dialog entry as well');
  assert.equal(changes.at(-1), 'closed');
  controller.dispose();
});

test('preserves Next history state, ignores foreign/invalid panels and stores no form content', () => {
  const f = fixture();
  const controller = auth(f, []);
  controller.navigate('recover');
  assert.equal(f.browser.history.state.__NA, true);
  assert.deepEqual(f.browser.history.state.tree, ['fictional-next-tree']);
  assert.deepEqual(Object.keys(f.browser.history.state.mementoPanel).sort(), ['owner', 'panel']);
  const changes = [];
  const replacement = auth(f, changes);
  f.browser.history.back(); f.flush();
  f.browser.history.forward(); f.flush();
  assert.deepEqual(changes, [], 'old entries cannot select a form in a new instance');
  replacement.navigate('invalid');
  assert.deepEqual(changes, []);
  controller.dispose(); replacement.dispose();
});

test('unmount/session change invalidates a panel without traversing history', () => {
  const f = fixture();
  const changes = [];
  const controller = auth(f, changes);
  controller.navigate('register');
  controller.dispose();
  assert.equal(f.backCalls, 0);
  assert.equal(f.browser.history.state.mementoPanel.panel, 'login');
  controller.navigate('recover');
  f.browser.history.back(); f.flush();
  assert.deepEqual(changes, ['register'], 'disposed screens no longer receive updates');
  const nextChanges = [];
  const next = auth(f, nextChanges);
  f.browser.history.forward(); f.flush();
  assert.deepEqual(nextChanges, []);
  next.dispose();
});

test('the base screen does not trap Back or add entries during initial load', () => {
  const f = fixture(null);
  const controller = auth(f, []);
  assert.equal(f.entries.length, 2);
  controller.navigate('login');
  assert.equal(f.entries.length, 2);
  f.browser.history.back(); f.flush();
  assert.equal(f.index, 0, 'Back on the root screen retains normal browser behavior');
  controller.dispose();
});
