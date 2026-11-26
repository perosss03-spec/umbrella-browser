import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
} from './customization-settings';
import type { SidebarItemVisibility, StartPageClockPosition, ToolbarItemVisibility } from './customization-settings';

export type { SidebarItemVisibility, StartPageClockPosition, ToolbarItemVisibility } from './customization-settings';

export type Bookmark = { id: string; title: string; url: string; createdAt: number };
export type Visit = { id: string; title: string; url: string; visitedAt: number };
export type InstalledExtension = {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
};
export type SitePermissionName = 'media' | 'geolocation' | 'notifications' | 'clipboard-read' | 'midiSysex';
export type SitePermissionOverrides = Record<string, Partial<Record<SitePermissionName, boolean>>>;
export type AppSettings = {
  theme: 'dark' | 'light' | 'system';
  accent: string;
  restoreSession: boolean;
  askDownloadLocation: boolean;
  downloadNotifications: boolean;
  wallpaperPath: string | null;
  adBlockEnabled: boolean;
  onboardingCompleted: boolean;
  discordActivityEnabled: boolean;
  discordClientId: string;
  performanceModeEnabled: boolean;
  sitePermissions: SitePermissionOverrides;
  adBlockExcludedSites: string[];
  tabSuspendAfterMinutes: number;
  startPageClockVisible: boolean;
  startPageClockPosition: StartPageClockPosition;
  startPageClockColor: string;
  startPageShortcutsVisible: boolean;
  startPageFooterVisible: boolean;
  startPageFooterText: string;
  sidebarCompact: boolean;
  pageCornersRounded: boolean;
  sidebarItems: SidebarItemVisibility;
  toolbarItems: ToolbarItemVisibility;
};
export type PersistedTab = { url: string; title: string };
export type Database = {
  version: 4;
  onboardingRevision: number;
  bookmarks: Bookmark[];
  history: Visit[];
  settings: AppSettings;
  lastSession: PersistedTab[];
  extensions: InstalledExtension[];
};

const ONBOARDING_REVISION = 1;

const defaultDb = (): Database => ({
  version: 4,
  onboardingRevision: ONBOARDING_REVISION,
  bookmarks: [],
  history: [],
  settings: {
    theme: 'dark',
    accent: '#8299ff',
    restoreSession: true,
    askDownloadLocation: false,
    downloadNotifications: true,
    wallpaperPath: null,
    adBlockEnabled: true,
    onboardingCompleted: false,
    discordActivityEnabled: false,
    discordClientId: '',
    performanceModeEnabled: false,
    sitePermissions: {},
    adBlockExcludedSites: [],
    tabSuspendAfterMinutes: 30,
    startPageClockVisible: true,
    startPageClockPosition: 'center',
    startPageClockColor: DEFAULT_START_PAGE_CLOCK_COLOR,
    startPageShortcutsVisible: true,
    startPageFooterVisible: true,
    startPageFooterText: DEFAULT_START_PAGE_FOOTER_TEXT,
    sidebarCompact: true,
    pageCornersRounded: false,
    sidebarItems: { ...DEFAULT_SIDEBAR_ITEM_VISIBILITY },
    toolbarItems: { ...DEFAULT_TOOLBAR_ITEM_VISIBILITY }
  },
  lastSession: [],
  extensions: []
});

const dataDirectory = () => join(app.getPath('userData'), 'Umbrella');
const databasePath = () => join(dataDirectory(), 'browser-data.json');
let database: Database = defaultDb();

export function loadDatabase() {
  try {
    const path = databasePath();
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Database>;
      const savedSettings = parsed.settings;
      const settings = { ...defaultDb().settings, ...parsed.settings };
      settings.discordActivityEnabled = typeof savedSettings?.discordActivityEnabled === 'boolean'
        ? savedSettings.discordActivityEnabled
        : false;
      settings.discordClientId = typeof savedSettings?.discordClientId === 'string'
        ? savedSettings.discordClientId
        : '';
      settings.performanceModeEnabled = typeof savedSettings?.performanceModeEnabled === 'boolean'
        ? savedSettings.performanceModeEnabled
        : false;
      settings.sitePermissions = sanitizeSitePermissions(savedSettings?.sitePermissions);
      settings.adBlockExcludedSites = sanitizeSiteOrigins(savedSettings?.adBlockExcludedSites);
      settings.tabSuspendAfterMinutes = [0, 5, 15, 30, 60].includes(savedSettings?.tabSuspendAfterMinutes ?? 30)
        ? savedSettings?.tabSuspendAfterMinutes ?? 30
        : 30;
      settings.startPageClockVisible = typeof savedSettings?.startPageClockVisible === 'boolean'
        ? savedSettings.startPageClockVisible
        : true;
      settings.startPageClockPosition = sanitizeStartPageClockPosition(savedSettings?.startPageClockPosition);
      settings.startPageClockColor = sanitizeHexColor(savedSettings?.startPageClockColor, DEFAULT_START_PAGE_CLOCK_COLOR);
      settings.startPageShortcutsVisible = typeof savedSettings?.startPageShortcutsVisible === 'boolean'
        ? savedSettings.startPageShortcutsVisible
        : true;
      settings.startPageFooterVisible = typeof savedSettings?.startPageFooterVisible === 'boolean'
        ? savedSettings.startPageFooterVisible
        : true;
      settings.startPageFooterText = sanitizeStartPageFooterText(savedSettings?.startPageFooterText);
      settings.sidebarCompact = typeof savedSettings?.sidebarCompact === 'boolean'
        ? savedSettings.sidebarCompact
        : true;
      const savedPageCornersRounded = (savedSettings as (Partial<AppSettings> & { sidebarRounded?: unknown }) | undefined)?.sidebarRounded;
      settings.pageCornersRounded = typeof savedSettings?.pageCornersRounded === 'boolean'
        ? savedSettings.pageCornersRounded
        : typeof savedPageCornersRounded === 'boolean' ? savedPageCornersRounded : false;
      settings.sidebarItems = sanitizeSidebarItemVisibility(savedSettings?.sidebarItems);
      settings.toolbarItems = sanitizeToolbarItemVisibility(savedSettings?.toolbarItems);
      if ((parsed.onboardingRevision ?? 0) < ONBOARDING_REVISION) {
        settings.onboardingCompleted = false;
      }
      database = {
        ...defaultDb(),
        ...parsed,
        version: 4,
        onboardingRevision: ONBOARDING_REVISION,
        extensions: Array.isArray(parsed.extensions) ? parsed.extensions : [],
        settings
      };
      // Older database versions and onboarding flows are upgraded in place.
      saveDatabase();
    } else {
      database = defaultDb();
      saveDatabase();
    }
  } catch (error) {
    console.error('[Umbrella] Could not read local database; starting with safe defaults.', error);
    database = defaultDb();
  }
  return database;
}

export function getDatabase() { return database; }

export function saveDatabase() {
  try {
    mkdirSync(dataDirectory(), { recursive: true });
    const target = databasePath();
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, JSON.stringify(database, null, 2), 'utf8');
    renameSync(temporary, target);
  } catch (error) {
    console.error('[Umbrella] Could not persist local data.', error);
  }
}

export function getDataDirectory() { return dataDirectory(); }

function sanitizeSitePermissions(value: unknown): SitePermissionOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const permissions: SitePermissionOverrides = {};
  const supported: SitePermissionName[] = ['media', 'geolocation', 'notifications', 'clipboard-read', 'midiSysex'];
  for (const [origin, valueForOrigin] of Object.entries(value)) {
    if (!isHttpOrigin(origin) || !valueForOrigin || typeof valueForOrigin !== 'object' || Array.isArray(valueForOrigin)) continue;
    const saved: Partial<Record<SitePermissionName, boolean>> = {};
    for (const permission of supported) {
      const decision = (valueForOrigin as Record<string, unknown>)[permission];
      if (typeof decision === 'boolean') saved[permission] = decision;
    }
    if (Object.keys(saved).length) permissions[origin] = saved;
  }
  return permissions;
}

function sanitizeSiteOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((origin): origin is string => typeof origin === 'string' && isHttpOrigin(origin)))];
}

function isHttpOrigin(value: string) {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === value;
  } catch {
    return false;
  }
}
