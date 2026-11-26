import assert from 'node:assert/strict';
import test from 'node:test';
import { getTabNavigationState } from './tab-navigation-state.ts';

test('returns unavailable navigation for a missing web contents object', () => {
  assert.deepEqual(getTabNavigationState(undefined), { canGoBack: false, canGoForward: false });
  assert.deepEqual(getTabNavigationState(null), { canGoBack: false, canGoForward: false });
});

test('does not query navigation on destroyed web contents', () => {
  let queried = false;
  const state = getTabNavigationState({
    isDestroyed: () => true,
    canGoBack: () => { queried = true; return true; },
    canGoForward: () => { queried = true; return true; }
  });

  assert.deepEqual(state, { canGoBack: false, canGoForward: false });
  assert.equal(queried, false);
});

test('reports navigation availability for live web contents', () => {
  const state = getTabNavigationState({
    isDestroyed: () => false,
    canGoBack: () => true,
    canGoForward: () => false
  });

  assert.deepEqual(state, { canGoBack: true, canGoForward: false });
});
