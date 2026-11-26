export type StartPageClockPosition = 'center' | 'top-left' | 'top-right';

export type SidebarItemVisibility = {
  newTab: boolean;
  bookmarks: boolean;
  history: boolean;
  downloads: boolean;
};

export type ToolbarItemVisibility = {
  sidebarToggle: boolean;
  back: boolean;
  forward: boolean;
  reload: boolean;
  bookmark: boolean;
  downloads: boolean;
  adBlock: boolean;
  incognito: boolean;
  extensions: boolean;
  privacy: boolean;
  performanceMode: boolean;
};

export const DEFAULT_START_PAGE_CLOCK_COLOR = '#f7f8ff';
export const DEFAULT_START_PAGE_FOOTER_TEXT = 'Meno rumore. Più spazio alle cose che contano.';
export const MAX_START_PAGE_FOOTER_TEXT_LENGTH = 160;
export const DEFAULT_SIDEBAR_ITEM_VISIBILITY: SidebarItemVisibility = {
  newTab: true,
  bookmarks: true,
  history: true,
  downloads: true
};
export const DEFAULT_TOOLBAR_ITEM_VISIBILITY: ToolbarItemVisibility = {
  sidebarToggle: true,
  back: true,
  forward: true,
  reload: true,
  bookmark: true,
  downloads: true,
  adBlock: true,
  incognito: true,
  extensions: true,
  privacy: true,
  performanceMode: true
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean) {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeSidebarItemVisibility(
  value: unknown,
  fallback: SidebarItemVisibility = DEFAULT_SIDEBAR_ITEM_VISIBILITY
): SidebarItemVisibility {
  const saved = toRecord(value);
  return {
    newTab: readBoolean(saved, 'newTab', fallback.newTab),
    bookmarks: readBoolean(saved, 'bookmarks', fallback.bookmarks),
    history: readBoolean(saved, 'history', fallback.history),
    downloads: readBoolean(saved, 'downloads', fallback.downloads)
  };
}

export function sanitizeToolbarItemVisibility(
  value: unknown,
  fallback: ToolbarItemVisibility = DEFAULT_TOOLBAR_ITEM_VISIBILITY
): ToolbarItemVisibility {
  const saved = toRecord(value);
  return {
    sidebarToggle: readBoolean(saved, 'sidebarToggle', fallback.sidebarToggle),
    back: readBoolean(saved, 'back', fallback.back),
    forward: readBoolean(saved, 'forward', fallback.forward),
    reload: readBoolean(saved, 'reload', fallback.reload),
    bookmark: readBoolean(saved, 'bookmark', fallback.bookmark),
    downloads: readBoolean(saved, 'downloads', fallback.downloads),
    adBlock: readBoolean(saved, 'adBlock', fallback.adBlock),
    incognito: readBoolean(saved, 'incognito', fallback.incognito),
    extensions: readBoolean(saved, 'extensions', fallback.extensions),
    privacy: readBoolean(saved, 'privacy', fallback.privacy),
    performanceMode: readBoolean(saved, 'performanceMode', fallback.performanceMode)
  };
}

export function sanitizeStartPageClockPosition(
  value: unknown,
  fallback: StartPageClockPosition = 'center'
): StartPageClockPosition {
  if (value === 'center' || value === 'top-left' || value === 'top-right') return value;
  return fallback;
}

export function sanitizeHexColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function sanitizeStartPageFooterText(value: unknown, fallback = DEFAULT_START_PAGE_FOOTER_TEXT) {
  return typeof value === 'string' && value.length <= MAX_START_PAGE_FOOTER_TEXT_LENGTH ? value : fallback;
}
