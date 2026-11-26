import assert from 'node:assert/strict';
import test from 'node:test';
import { isGoogleOAuthPopupUrl, resolveNavigation } from './navigation.ts';

test('applies the selected light or dark theme to DuckDuckGo searches', () => {
  assert.equal(new URL(resolveNavigation('privacy browser', 'dark')).searchParams.get('kae'), 'd');
  assert.equal(new URL(resolveNavigation('privacy browser', 'light')).searchParams.get('kae'), 'l');
});

test('leaves DuckDuckGo on automatic appearance for the system theme', () => {
  assert.equal(new URL(resolveNavigation('privacy browser', 'system')).searchParams.has('kae'), false);
});

test('does not rewrite unrelated direct URLs', () => {
  assert.equal(resolveNavigation('https://example.com/path', 'dark'), 'https://example.com/path');
});

test('resolves supported bang searches directly to their search engines', () => {
  const youtube = new URL(resolveNavigation('!youtube cicciogamer89'));
  assert.equal(youtube.origin, 'https://www.youtube.com');
  assert.equal(youtube.pathname, '/results');
  assert.equal(youtube.searchParams.get('search_query'), 'cicciogamer89');

  const google = new URL(resolveNavigation('!g browser privacy'));
  assert.equal(google.origin, 'https://www.google.com');
  assert.equal(google.searchParams.get('q'), 'browser privacy');
});

test('leaves unknown bangs to DuckDuckGo for its full bang catalog', () => {
  const search = new URL(resolveNavigation('!unknown query', 'dark'));
  assert.equal(search.hostname, 'duckduckgo.com');
  assert.equal(search.searchParams.get('q'), '!unknown query');
  assert.equal(search.searchParams.get('kae'), 'd');
});

test('allows only HTTPS Google sign-in URLs as authentication popups', () => {
  assert.equal(isGoogleOAuthPopupUrl('https://accounts.google.com/o/oauth2/v2/auth'), true);
  assert.equal(isGoogleOAuthPopupUrl('http://accounts.google.com/signin'), false);
  assert.equal(isGoogleOAuthPopupUrl('https://accounts.google.com.example.com/signin'), false);
  assert.equal(isGoogleOAuthPopupUrl('https://example.com/signin'), false);
});
