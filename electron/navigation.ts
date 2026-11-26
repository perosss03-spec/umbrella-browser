export type BrowserTheme = 'dark' | 'light' | 'system';

function duckDuckGoUrl(query: string | null, theme: BrowserTheme) {
  const url = new URL('https://duckduckgo.com/');
  if (query) url.searchParams.set('q', query);
  if (theme === 'dark') url.searchParams.set('kae', 'd');
  else if (theme === 'light') url.searchParams.set('kae', 'l');
  return url.toString();
}

export function resolveNavigation(input: string, theme: BrowserTheme = 'system'): string {
  const value = input.trim();
  if (!value) return duckDuckGoUrl(null, theme);

  const bangUrl = resolveBang(value);
  if (bangUrl) return bangUrl;

  // A host-like value is treated as a direct URL; everything else is a search.
  const hasWhitespace = /\s/.test(value);
  const looksLikeHost = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[\w-]+\.)+[a-z]{2,})(?::\d+)?(?:[\/?#].*)?$/i.test(value)
    || /^\[[0-9a-f:]+\](?::\d+)?(?:[\/?#].*)?$/i.test(value)
    || /^https?:\/\//i.test(value);

  if (!hasWhitespace && looksLikeHost) {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        if (url.hostname === 'duckduckgo.com') applyDuckDuckGoTheme(url, theme);
        return url.toString();
      }
    } catch { /* fall through to a DuckDuckGo search */ }
  }

  return duckDuckGoUrl(value, theme);
}

const bangSearchTargets: Record<string, { url: string; parameter: string }> = {
  youtube: { url: 'https://www.youtube.com/results', parameter: 'search_query' },
  yt: { url: 'https://www.youtube.com/results', parameter: 'search_query' },
  google: { url: 'https://www.google.com/search', parameter: 'q' },
  g: { url: 'https://www.google.com/search', parameter: 'q' },
  wikipedia: { url: 'https://en.wikipedia.org/w/index.php', parameter: 'search' },
  wiki: { url: 'https://en.wikipedia.org/w/index.php', parameter: 'search' },
  reddit: { url: 'https://www.reddit.com/search/', parameter: 'q' },
  r: { url: 'https://www.reddit.com/search/', parameter: 'q' },
  github: { url: 'https://github.com/search', parameter: 'q' },
  gh: { url: 'https://github.com/search', parameter: 'q' },
  amazon: { url: 'https://www.amazon.com/s', parameter: 'k' },
  bing: { url: 'https://www.bing.com/search', parameter: 'q' },
  maps: { url: 'https://www.google.com/maps/search/', parameter: 'query' }
};

function resolveBang(input: string): string | null {
  const match = /^!([\w-]+)(?:\s+([\s\S]*))?$/.exec(input);
  if (!match) return null;
  const target = bangSearchTargets[match[1].toLowerCase()];
  if (!target) return null;
  const url = new URL(target.url);
  const query = match[2]?.trim();
  if (query) url.searchParams.set(target.parameter, query);
  return url.toString();
}

function applyDuckDuckGoTheme(url: URL, theme: BrowserTheme) {
  if (theme === 'dark') url.searchParams.set('kae', 'd');
  else if (theme === 'light') url.searchParams.set('kae', 'l');
}

export function isSafeWebUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
}

export function isGoogleOAuthPopupUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'accounts.google.com';
  } catch { return false; }
}
