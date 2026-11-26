import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SIDEBAR_ITEM_VISIBILITY,
  DEFAULT_START_PAGE_CLOCK_COLOR,
  DEFAULT_START_PAGE_FOOTER_TEXT,
  DEFAULT_TOOLBAR_ITEM_VISIBILITY,
  sanitizeHexColor,
  sanitizeSidebarItemVisibility,
  sanitizeStartPageClockPosition,
  sanitizeStartPageFooterText,
  sanitizeToolbarItemVisibility
} from './customization-settings.ts';

test('fills missing sidebar and toolbar options with their defaults', () => {
  assert.deepEqual(sanitizeSidebarItemVisibility({ bookmarks: false }), {
    ...DEFAULT_SIDEBAR_ITEM_VISIBILITY,
    bookmarks: false
  });
  assert.deepEqual(sanitizeToolbarItemVisibility({ back: false, adBlock: false, incognito: false }), {
    ...DEFAULT_TOOLBAR_ITEM_VISIBILITY,
    back: false,
    adBlock: false,
    incognito: false
  });
});

test('retains existing options when sanitizing a partial settings update', () => {
  const current = { ...DEFAULT_TOOLBAR_ITEM_VISIBILITY, extensions: false };
  assert.deepEqual(sanitizeToolbarItemVisibility({ back: false }, current), {
    ...current,
    back: false
  });
});

test('accepts only supported clock positions and six-digit colors', () => {
  assert.equal(sanitizeStartPageClockPosition('top-right'), 'top-right');
  assert.equal(sanitizeStartPageClockPosition('left'), 'center');
  assert.equal(sanitizeHexColor('#3f82d1', DEFAULT_START_PAGE_CLOCK_COLOR), '#3f82d1');
  assert.equal(sanitizeHexColor('red', DEFAULT_START_PAGE_CLOCK_COLOR), DEFAULT_START_PAGE_CLOCK_COLOR);
});

test('preserves editable footer text while rejecting oversized values', () => {
  assert.equal(sanitizeStartPageFooterText('Una frase personalizzata'), 'Una frase personalizzata');
  assert.equal(sanitizeStartPageFooterText('x'.repeat(161)), DEFAULT_START_PAGE_FOOTER_TEXT);
});
