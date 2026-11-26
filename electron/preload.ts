import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, Bookmark, SitePermissionName, Visit } from './storage';
import type { UpdateState } from './updates';

export type TabInfo = {
  id: string;
  title: string;
  url: string;
  isNewTab: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  audible: boolean;
  incognito: boolean;
  faviconUrl: string | null;
  suspended: boolean;
};
export type BlockedTracker = { hostname: string; count: number };
export type SitePrivacyState = {
  origin: string | null;
  permissions: Partial<Record<SitePermissionName, boolean>>;
  adBlockEnabled: boolean;
  adBlockExcluded: boolean;
  blockedTrackers: BlockedTracker[];
};
export type DownloadInfo = {
  id: string;
  filename: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  state: string;
  paused: boolean;
  savePath: string;
};
export type ExtensionInfo = { id: string; name: string; version: string; enabled: boolean; iconDataUrl?: string };
export type BrowserState = {
  tabs: TabInfo[];
  activeTabId: string;
  appVersion: string;
  bookmarks: Bookmark[];
  history: Visit[];
  downloads: DownloadInfo[];
  settings: AppSettings;
  wallpaperUrl: string | null;
  extensions: ExtensionInfo[];
  adBlockReady: boolean;
  adBlockError: string | null;
  sitePrivacy: SitePrivacyState;
};
export type PermissionRequest = {
  id: string;
  permission: string;
  origin: string;
  hostname: string;
};
export type BookmarkImportResult = { ok: boolean; count: number; message: string };
export type DefaultBrowserResult = { registered: boolean; isDefault: boolean; settingsOpened: boolean; message?: string };
export type ImportBrowserProfile = {
  id: string;
  label: string;
  bookmarksAvailable: boolean;
  historyAvailable: boolean;
};
export type ImportBrowserInfo = {
  id: string;
  name: string;
  engine: 'Chromium' | 'Firefox' | 'Legacy';
  profiles: ImportBrowserProfile[];
};
export type BrowserImportResult = {
  ok: boolean;
  bookmarksImported: number;
  historyImported: number;
  browserName?: string;
  profileName?: string;
  message: string;
  warnings: string[];
};

const api = {
  getState: () => ipcRenderer.invoke('browser:get-state') as Promise<BrowserState>,
  onState: (callback: (state: BrowserState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) => callback(state);
    ipcRenderer.on('browser:state', handler);
    return () => ipcRenderer.removeListener('browser:state', handler);
  },
  onFocusAddress: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('ui:focus-address', handler);
    return () => ipcRenderer.removeListener('ui:focus-address', handler);
  },
  onFindRequest: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('ui:find', handler);
    return () => ipcRenderer.removeListener('ui:find', handler);
  },
  onPermissionRequest: (callback: (request: PermissionRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: PermissionRequest) => callback(request);
    ipcRenderer.on('permissions:request', handler);
    return () => ipcRenderer.removeListener('permissions:request', handler);
  },
  onPermissionCancelled: (callback: (ids: string[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ids: string[]) => callback(ids);
    ipcRenderer.on('permissions:cancelled', handler);
    return () => ipcRenderer.removeListener('permissions:cancelled', handler);
  },
  respondToPermission: (id: string, allowed: boolean) =>
    ipcRenderer.invoke('permissions:respond', { id, allowed }) as Promise<boolean>,
  setSitePermission: (origin: string, permission: SitePermissionName, allowed: boolean | null) =>
    ipcRenderer.invoke('privacy:set-site-permission', { origin, permission, allowed }) as Promise<boolean>,
  setSiteAdBlockExcluded: (origin: string, excluded: boolean) =>
    ipcRenderer.invoke('privacy:set-site-adblock-excluded', { origin, excluded }) as Promise<boolean>,
  setContentBounds: (bounds: { x: number; y: number; width: number; height: number; visible: boolean }) =>
    ipcRenderer.send('browser:set-content-bounds', bounds),
  navigate: (input: string, tabId?: string) => ipcRenderer.invoke('browser:navigate', { input, tabId }),
  newTab: (url?: string, incognito = false) => ipcRenderer.invoke('tabs:new', { url, incognito }),
  switchTab: (id: string) => ipcRenderer.invoke('tabs:switch', id),
  closeTab: (id: string) => ipcRenderer.invoke('tabs:close', id),
  duplicateTab: (id: string) => ipcRenderer.invoke('tabs:duplicate', id),
  restoreClosedTab: () => ipcRenderer.invoke('tabs:restore'),
  moveTab: (id: string, targetIndex: number) => ipcRenderer.invoke('tabs:move', { id, targetIndex }),
  showTabContextMenu: (id: string, x: number, y: number) => ipcRenderer.invoke('tabs:context-menu', { id, x, y }),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  stop: () => ipcRenderer.invoke('browser:stop'),
  toggleBookmark: () => ipcRenderer.invoke('bookmarks:toggle-current'),
  addBookmark: (title: string, url: string) => ipcRenderer.invoke('bookmarks:add', { title, url }),
  removeBookmark: (id: string) => ipcRenderer.invoke('bookmarks:remove', id),
  updateBookmark: (id: string, title: string, url: string) => ipcRenderer.invoke('bookmarks:update', { id, title, url }),
  removeHistory: (id: string) => ipcRenderer.invoke('history:remove', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  downloadAction: (id: string, action: 'pause' | 'resume' | 'cancel' | 'open' | 'show') => ipcRenderer.invoke('downloads:action', { id, action }),
  updateSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', settings),
  setDefaultBrowser: () => ipcRenderer.invoke('browser:set-default') as Promise<DefaultBrowserResult>,
  checkDefaultBrowser: () => ipcRenderer.invoke('browser:check-default') as Promise<DefaultBrowserResult>,
  openDiscordDeveloperPortal: () => ipcRenderer.invoke('discord:open-developer-portal') as Promise<boolean>,
  getUpdateState: () => ipcRenderer.invoke('updates:get-state') as Promise<UpdateState>,
  checkForUpdates: () => ipcRenderer.invoke('updates:check') as Promise<UpdateState>,
  installUpdate: () => ipcRenderer.invoke('updates:install') as Promise<boolean>,
  onUpdateState: (callback: (state: UpdateState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on('updates:state', handler);
    return () => ipcRenderer.removeListener('updates:state', handler);
  },
  scanImportSources: () => ipcRenderer.invoke('browser:scan-import-sources') as Promise<ImportBrowserInfo[]>,
  chooseCustomImportSource: () => ipcRenderer.invoke('browser:choose-custom-import-source') as Promise<ImportBrowserInfo | null>,
  importBrowserProfile: (browserId: string, profileId: string, options: { bookmarks: boolean; history: boolean }) =>
    ipcRenderer.invoke('browser:import-profile', { browserId, profileId, options }) as Promise<BrowserImportResult>,
  chooseWallpaper: () => ipcRenderer.invoke('wallpaper:choose') as Promise<boolean>,
  resetWallpaper: () => ipcRenderer.invoke('wallpaper:reset') as Promise<boolean>,
  addExtension: () => ipcRenderer.invoke('extensions:add') as Promise<{ ok: boolean; message: string }>,
  setExtensionEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('extensions:set-enabled', { id, enabled }) as Promise<boolean>,
  removeExtension: (id: string) => ipcRenderer.invoke('extensions:remove', id) as Promise<boolean>,
  openExtensionPopup: (id: string, position: { right: number; bottom: number }) =>
    ipcRenderer.invoke('extensions:open-popup', { id, position }) as Promise<{ ok: boolean; message?: string }>,
  clearBrowsingData: () => ipcRenderer.invoke('settings:clear-data'),
  exportBookmarks: () => ipcRenderer.invoke('bookmarks:export'),
  importBookmarks: () => ipcRenderer.invoke('bookmarks:import') as Promise<BookmarkImportResult>,
  findInPage: (query: string) => ipcRenderer.invoke('browser:find', query),
  stopFind: () => ipcRenderer.invoke('browser:stop-find'),
  windowAction: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('window:action', action)
};

contextBridge.exposeInMainWorld('umbrella', api);
