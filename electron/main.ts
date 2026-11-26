import {
  app, BrowserWindow, WebContentsView, ipcMain, session, dialog, shell, nativeTheme, Notification, Menu, screen, clipboard,
  type DownloadItem, type Session, type MessageBoxOptions, type MenuItemConstructorOptions
} from 'electron';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import fetch from 'cross-fetch';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { parseBookmarkHtml } from './bookmarks';
import { shouldSuspendTab } from './tab-suspension';
import { DiscordPresenceController, isValidDiscordClientId } from './discord-presence';
import { getDatabase, getDataDirectory, loadDatabase, saveDatabase, type Bookmark, type PersistedTab, type SitePermissionName } from './storage';
import { isSafeWebUrl, resolveNavigation } from './navigation';
import type { AppSettings } from './storage';
import { discoverBrowserProfiles, importBrowserProfile, registerCustomBrowserProfile } from './browser-import';
import { PendingPermissionRegistry } from './pending-permissions';
import { buildBrowserContextMenu, type BrowserContextMenuAction } from './context-menu';
import { autoUpdater } from 'electron-updater';
import { UpdateController, type AutoUpdaterLike } from './updates';
import { buildReleaseApiUrls } from './update-assets';

app.setAppUserModelId('com.umbrella.browser');
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const DEFAULT_PARTITION = 'persist:umbrella';
const execFileAsync = promisify(execFile);
const discordPresence = new DiscordPresenceController();
const pendingContextSavePaths = new Map<number, { url: string; filePath: string }>();
// Releases may publish installer assets with different separators or spacing.
async function fetchReleaseAssetNames(version: string): Promise<string[]> {
  for (const url of buildReleaseApiUrls(version)) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Umbrella-Updater', Accept: 'application/vnd.github+json' }
    });
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`GitHub ha risposto ${response.status}.`);
    const release = await response.json() as { assets?: Array<{ name?: unknown }> };
    return (release.assets ?? [])
      .map((asset) => (typeof asset?.name === 'string' ? asset.name : ''))
      .filter(Boolean);
  }
  return [];
}

// electron-updater types its emitter with literal event names; the controller only
// needs the structural subset it drives, and tests replace it with a fake.
const updateController = new UpdateController({
  updater: autoUpdater as unknown as AutoUpdaterLike,
  environment: {
    isPackaged: app.isPackaged,
    platform: process.platform,
    portable: !!process.env.PORTABLE_EXECUTABLE_DIR
  },
  currentVersion: app.getVersion(),
  resolveAssetNames: fetchReleaseAssetNames,
  onChange: (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:state', state);
  }
});
type Tab = {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  audible: boolean;
  incognito: boolean;
  faviconUrl: string | null;
  suspended: boolean;
  inactiveSince: number | null;
  view: WebContentsView | null;
};
type DownloadRecord = {
  id: string;
  filename: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  state: string;
  paused: boolean;
  savePath: string;
};
type ContentBounds = { x: number; y: number; width: number; height: number; visible: boolean };

let mainWindow: BrowserWindow | null = null;
let extensionPopupWindow: BrowserWindow | null = null;
let extensionPopupId = '';
let database = getDatabase();
let tabs: Tab[] = [];
let activeTabId = '';
let contentBounds: ContentBounds = { x: 58, y: 48, width: 800, height: 600, visible: false };
const recentlyClosed: PersistedTab[] = [];
const downloads = new Map<string, { record: DownloadRecord; item: DownloadItem }>();
const wiredPartitions = new Set<string>();
const activeSessions = new Map<string, Session>();
const blockedRequestsByOrigin = new Map<string, Map<string, number>>();
let blockedRequestUpdateTimer: NodeJS.Timeout | null = null;
let tabSuspensionTimer: NodeJS.Timeout | null = null;
let adBlocker: ElectronBlocker | null = null;
let adBlockerLoading: Promise<ElectronBlocker> | null = null;
let trackedAdBlocker: ElectronBlocker | null = null;
let adBlockReady = false;
let adBlockError: string | null = null;
type PendingPermissionRequest = { callback: (allowed: boolean) => void; origin: string; permission: SitePermissionName };
// Chromium keeps the page blocked until this callback runs, so a request must never
// stay pending forever: it is answered, cancelled with its tab, or expired.
const PERMISSION_REQUEST_MAX_AGE_MS = 60_000;
const pendingPermissionRequests = new PendingPermissionRegistry<PendingPermissionRequest>(PERMISSION_REQUEST_MAX_AGE_MS);
let permissionRequestSweepTimer: NodeJS.Timeout | null = null;
const sitePermissionNames: SitePermissionName[] = ['media', 'geolocation', 'notifications', 'clipboard-read', 'midiSysex'];

const activeTab = () => tabs.find((tab) => tab.id === activeTabId) ?? null;
const getHttpOrigin = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
};
const toTabInfo = (tab: Tab) => ({
  id: tab.id, title: tab.title || 'Nuova scheda', url: tab.url,
  isNewTab: !tab.url, loading: tab.loading,
  canGoBack: !!tab.view?.webContents.canGoBack(),
  canGoForward: !!tab.view?.webContents.canGoForward(),
  audible: tab.audible, incognito: tab.incognito, faviconUrl: tab.faviconUrl, suspended: tab.suspended
});

const currentDownloads = () => [...downloads.values()].map(({ record }) => ({ ...record }));

function getSitePrivacyState() {
  const tab = activeTab();
  const origin = tab?.incognito ? null : getHttpOrigin(tab?.url);
  const trackers = origin ? blockedRequestsByOrigin.get(origin) : undefined;
  return {
    origin,
    permissions: origin ? { ...database.settings.sitePermissions[origin] } : {},
    adBlockEnabled: database.settings.adBlockEnabled,
    adBlockExcluded: origin ? database.settings.adBlockExcludedSites.includes(origin) : false,
    blockedTrackers: trackers
      ? [...trackers.entries()].map(([hostname, count]) => ({ hostname, count })).sort((left, right) => right.count - left.count).slice(0, 20)
      : []
  };
}

function denyPendingPermissions(entries: Array<{ id: string; value: PendingPermissionRequest }>) {
  if (!entries.length) return;
  for (const { value } of entries) value.callback(false);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('permissions:cancelled', entries.map(({ id }) => id));
  }
}

function isSiteAdBlockExcluded(origin: string | null) {
  return !!origin && database.settings.adBlockExcludedSites.includes(origin);
}

function recordBlockedRequest(origin: string, requestUrl: string) {
  let hostname = '';
  try { hostname = new URL(requestUrl).hostname; } catch { return; }
  if (!hostname) return;
  let trackers = blockedRequestsByOrigin.get(origin);
  if (!trackers) {
    trackers = new Map();
    blockedRequestsByOrigin.set(origin, trackers);
  }
  trackers.set(hostname, (trackers.get(hostname) ?? 0) + 1);
  if (trackers.size > 100) {
    const leastRecent = trackers.keys().next().value;
    if (leastRecent) trackers.delete(leastRecent);
  }
  if (blockedRequestsByOrigin.size > 100) {
    const leastRecentOrigin = blockedRequestsByOrigin.keys().next().value;
    if (leastRecentOrigin && leastRecentOrigin !== origin) blockedRequestsByOrigin.delete(leastRecentOrigin);
  }
  if (blockedRequestUpdateTimer) return;
  blockedRequestUpdateTimer = setTimeout(() => {
    blockedRequestUpdateTimer = null;
    emitState();
  }, 500);
}

function installAdBlockerTracking(blocker: ElectronBlocker) {
  const originalBeforeRequest = blocker.onBeforeRequest.bind(blocker);
  const originalHeadersReceived = blocker.onHeadersReceived.bind(blocker);
  const originalInjectCosmetics = blocker.onInjectCosmeticFilters.bind(blocker);

  blocker.onBeforeRequest = (details, callback) => {
    const tab = tabs.find((item) => item.view?.webContents.id === details.webContentsId);
    const origin = tab?.incognito ? null : (details.resourceType === 'mainFrame' ? getHttpOrigin(details.url) : null)
      ?? getHttpOrigin(tab?.url) ?? getHttpOrigin(details.initiatorOrigin) ?? getHttpOrigin(details.referrer);
    if (isSiteAdBlockExcluded(origin)) {
      callback({});
      return;
    }
    originalBeforeRequest(details, (response) => {
      if (response.cancel && origin) recordBlockedRequest(origin, details.url);
      callback(response);
    });
  };
  blocker.onHeadersReceived = (details, callback) => {
    const tab = tabs.find((item) => item.view?.webContents.id === details.webContentsId);
    const origin = tab?.incognito ? null : (details.resourceType === 'mainFrame' ? getHttpOrigin(details.url) : null)
      ?? getHttpOrigin(tab?.url) ?? getHttpOrigin(details.initiatorOrigin) ?? getHttpOrigin(details.referrer);
    if (isSiteAdBlockExcluded(origin)) {
      callback({});
      return;
    }
    originalHeadersReceived(details, callback);
  };
  blocker.onInjectCosmeticFilters = (event, url, message) => {
    if (isSiteAdBlockExcluded(getHttpOrigin(url))) return Promise.resolve();
    return originalInjectCosmetics(event, url, message);
  };
}

function getExtensionsInfo() {
  return database.extensions.map(({ id, name, version, enabled, path }) => ({
    id, name, version, enabled, iconDataUrl: getExtensionIconDataUrl(path)
  }));
}

function getExtensionIconDataUrl(extensionDirectory: string): string | undefined {
  try {
    const manifestPath = join(extensionDirectory, 'manifest.json');
    if (!existsSync(manifestPath)) return undefined;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      icons?: Record<string, string>;
      action?: { default_icon?: string | Record<string, string> };
      browser_action?: { default_icon?: string | Record<string, string> };
    };
    const iconDefinitions = [manifest.action?.default_icon, manifest.browser_action?.default_icon, manifest.icons];
    const candidates = iconDefinitions.flatMap((definition) => {
      if (typeof definition === 'string') return [definition];
      if (!definition || typeof definition !== 'object') return [];
      return Object.entries(definition)
        .sort(([left], [right]) => Number(right) - Number(left))
        .map(([, iconPath]) => iconPath);
    });
    const root = realpathSync(extensionDirectory);
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || isAbsolute(candidate)) continue;
      const requestedPath = resolve(root, candidate);
      if (!existsSync(requestedPath) || !statSync(requestedPath).isFile()) continue;
      const iconPath = realpathSync(requestedPath);
      const relativePath = relative(root, iconPath);
      if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) continue;
      const mimeType = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[extname(iconPath).toLowerCase()];
      if (!mimeType || statSync(iconPath).size > 512 * 1024) continue;
      return `data:${mimeType};base64,${readFileSync(iconPath).toString('base64')}`;
    }
  } catch (error) {
    console.warn('[Umbrella] Could not load an extension icon:', error);
  }
  return undefined;
}

function getWallpaperUrl() {
  const wallpaperPath = database.settings.wallpaperPath;
  return wallpaperPath && existsSync(wallpaperPath) ? pathToFileURL(wallpaperPath).href : null;
}

async function syncAdBlocker() {
  if (!database.settings.adBlockEnabled) {
    if (adBlocker) {
      for (const ses of activeSessions.values()) {
        try { adBlocker.disableBlockingInSession(ses); } catch (error) { console.warn('[Umbrella] Could not disable ad blocking:', error); }
      }
    }
    adBlockReady = false;
    adBlockError = null;
    emitState();
    return;
  }

  try {
    if (!adBlocker) {
      if (!adBlockerLoading) {
        const filterDirectory = join(getDataDirectory(), 'filters');
        mkdirSync(filterDirectory, { recursive: true });
        adBlockerLoading = ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
          path: join(filterDirectory, 'adblock-engine.bin'),
          read: (filePath: string) => readFile(filePath),
          write: (filePath: string, data: Uint8Array) => writeFile(filePath, data)
        }).finally(() => { adBlockerLoading = null; });
      }
      adBlocker = await adBlockerLoading;
    }
    if (trackedAdBlocker !== adBlocker) {
      installAdBlockerTracking(adBlocker);
      trackedAdBlocker = adBlocker;
    }
    // Respect a toggle changed while the filter engine was being loaded.
    if (!database.settings.adBlockEnabled) {
      for (const ses of activeSessions.values()) adBlocker.disableBlockingInSession(ses);
      adBlockReady = false;
      adBlockError = null;
      emitState();
      return;
    }
    for (const ses of activeSessions.values()) adBlocker.enableBlockingInSession(ses);
    adBlockReady = true;
    adBlockError = null;
  } catch (error) {
    adBlockReady = false;
    adBlockError = error instanceof Error ? error.message : 'Impossibile caricare i filtri.';
    console.warn('[Umbrella] Ad blocker could not be initialized:', error);
  }
  emitState();
}

function readExtensionManifest(extensionDirectory: string) {
  const manifestPath = join(extensionDirectory, 'manifest.json');
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) throw new Error('Nella cartella selezionata non è presente manifest.json.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown; version?: unknown; manifest_version?: unknown };
  if (manifest.manifest_version !== 3) throw new Error('Per questa versione sono accettate estensioni Manifest V3.');
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || typeof manifest.version !== 'string') throw new Error('Il manifest dell’estensione non contiene nome e versione validi.');
  return { name: manifest.name.trim(), version: manifest.version };
}

async function restoreInstalledExtensions() {
  const ses = session.fromPartition(DEFAULT_PARTITION, { cache: true });
  let changed = false;
  for (const item of database.extensions) {
    if (!item.enabled) continue;
    try {
      if (!existsSync(item.path)) throw new Error('Cartella estensione non trovata.');
      const loaded = await ses.extensions.loadExtension(item.path);
      item.id = loaded.id;
      item.name = loaded.name || item.name;
      item.version = loaded.version || item.version;
    } catch (error) {
      item.enabled = false;
      changed = true;
      console.warn(`[Umbrella] Extension ${item.name} was not restored:`, error);
    }
  }
  if (changed) saveDatabase();
}

function emitState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('browser:state', {
    tabs: tabs.map(toTabInfo), activeTabId,
    appVersion: app.getVersion(),
    bookmarks: database.bookmarks,
    history: database.history.slice(0, 500),
    downloads: currentDownloads(),
    settings: database.settings,
    wallpaperUrl: getWallpaperUrl(),
    extensions: getExtensionsInfo(),
    adBlockReady,
    adBlockError,
    sitePrivacy: getSitePrivacyState()
  });
}

function persistSession() {
  database.lastSession = tabs
    .filter((tab) => !tab.incognito && tab.url && isSafeWebUrl(tab.url))
    .map((tab) => ({ url: tab.url, title: tab.title }))
    .slice(-30);
  saveDatabase();
}

function updateTab(tab: Tab, patch: Partial<Pick<Tab, 'title' | 'url' | 'loading' | 'audible' | 'faviconUrl' | 'suspended'>>) {
  Object.assign(tab, patch);
  emitState();
}

function applyContentViewVisibility() {
  for (const tab of tabs) {
    if (tab.view) tab.view.setVisible(false);
  }
  const current = activeTab();
  if (current?.view && contentBounds.visible && mainWindow && !mainWindow.isMinimized()) {
    current.view.setBounds({
      x: Math.max(0, Math.round(contentBounds.x)),
      y: Math.max(0, Math.round(contentBounds.y)),
      width: Math.max(1, Math.round(contentBounds.width)),
      height: Math.max(1, Math.round(contentBounds.height))
    });
    current.view.setVisible(true);
  }
}

function addHistory(tab: Tab) {
  if (tab.incognito || !isSafeWebUrl(tab.url)) return;
  database.history.unshift({ id: randomUUID(), title: tab.title || tab.url, url: tab.url, visitedAt: Date.now() });
  database.history = database.history.slice(0, 5000);
  saveDatabase();
}

function handleDownload(partitionSession: Session, item: DownloadItem, isPrivate: boolean, savePathOverride?: string) {
  if (savePathOverride) item.setSavePath(savePathOverride);
  const id = randomUUID();
  const record: DownloadRecord = {
    id,
    filename: item.getFilename(),
    url: item.getURL(),
    receivedBytes: item.getReceivedBytes(),
    totalBytes: item.getTotalBytes(),
    state: 'progressing',
    paused: false,
    savePath: item.getSavePath()
  };
  downloads.set(id, { record, item });
  emitState();

  const settings = database.settings;
  if (savePathOverride) {
    record.savePath = savePathOverride;
  } else if (settings.askDownloadLocation && !isPrivate) {
    const saveChoice = mainWindow && !mainWindow.isDestroyed()
      ? dialog.showSaveDialog(mainWindow, { defaultPath: record.filename })
      : dialog.showSaveDialog({ defaultPath: record.filename });
    void saveChoice.then((choice) => {
      if (choice.canceled || !choice.filePath) item.cancel();
      else item.setSavePath(choice.filePath);
      record.savePath = choice.filePath ?? '';
      emitState();
    }).catch(() => item.cancel());
  }

  item.on('updated', (_event, state) => {
    record.receivedBytes = item.getReceivedBytes();
    record.totalBytes = item.getTotalBytes();
    record.paused = item.isPaused();
    record.savePath = item.getSavePath();
    record.state = state;
    emitState();
  });
  item.once('done', (_event, state) => {
    record.receivedBytes = item.getReceivedBytes();
    record.totalBytes = item.getTotalBytes();
    record.paused = false;
    record.savePath = item.getSavePath();
    record.state = state;
    emitState();
    if (state === 'completed' && !isPrivate && database.settings.downloadNotifications && Notification.isSupported()) {
      new Notification({ title: 'Download completato', body: record.filename }).show();
    }
  });
}

function configureSession(partition: string, isPrivate: boolean) {
  const ses = session.fromPartition(partition, { cache: true });
  activeSessions.set(partition, ses);
  if (wiredPartitions.has(partition)) return ses;
  wiredPartitions.add(partition);
  if (adBlocker && database.settings.adBlockEnabled) {
    try { adBlocker.enableBlockingInSession(ses); } catch (error) { console.warn('[Umbrella] Could not enable ad blocking in session:', error); }
  }

  ses.on('will-download', (_event, item, webContents) => {
    const pending = webContents ? pendingContextSavePaths.get(webContents.id) : undefined;
    const savePath = pending?.url === item.getURL() ? pending.filePath : undefined;
    if (savePath && webContents) pendingContextSavePaths.delete(webContents.id);
    handleDownload(ses, item, isPrivate, savePath);
  });
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const supportedPermission = sitePermissionNames.find((item) => item === permission);
    if (!supportedPermission || isPrivate) return callback(false);
    if (!mainWindow || mainWindow.isDestroyed()) return callback(false);
    const origin = getHttpOrigin(details.requestingUrl);
    if (!origin) return callback(false);
    const savedDecision = database.settings.sitePermissions[origin]?.[supportedPermission];
    if (typeof savedDecision === 'boolean') return callback(savedDecision);
    const id = randomUUID();
    const tabId = tabs.find((tab) => tab.view?.webContents.id === webContents.id)?.id ?? '';
    pendingPermissionRequests.add(id, tabId, { callback, origin, permission: supportedPermission });
    let hostname = origin;
    try { hostname = new URL(origin).hostname || origin; } catch {}
    mainWindow.webContents.send('permissions:request', {
      id,
      permission: supportedPermission,
      origin,
      hostname
    });
  });
  return ses;
}

function createPageView(tab: Tab): WebContentsView | null {
  if (!mainWindow || tab.view) return tab.view;
  const partition = tab.incognito ? `umbrella-private-${tab.id}` : DEFAULT_PARTITION;
  const ses = configureSession(partition, tab.incognito);
  const view = new WebContentsView({
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: true
    }
  });
  tab.view = view;
  mainWindow.contentView.addChildView(view);
  view.setVisible(false);

  const contents = view.webContents;
  contents.setBackgroundThrottling(true);
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeWebUrl(url)) createTab(url, tab.incognito);
    else if (url.startsWith('mailto:')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('context-menu', (event, params) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    event.preventDefault();

    const linkURL = typeof params.linkURL === 'string' && isSafeWebUrl(params.linkURL) ? params.linkURL : null;
    const imageURL = typeof params.srcURL === 'string' && isSafeWebUrl(params.srcURL) ? params.srcURL : null;
    const menuItems = buildBrowserContextMenu({
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
      hasImageContents: params.hasImageContents || params.mediaType === 'image',
      imageURL,
      isEditable: params.isEditable,
      linkURL,
      selectionText: params.selectionText
    });
    const actions: Record<BrowserContextMenuAction, () => void> = {
      back: () => { if (contents.canGoBack()) contents.goBack(); },
      'copy-image': () => contents.copyImageAt(params.x, params.y),
      'copy-image-address': () => { if (imageURL) clipboard.writeText(imageURL); },
      'copy-link': () => { if (linkURL) clipboard.writeText(linkURL); },
      'copy-selection': () => {
        if (params.isEditable) contents.copy();
        else if (params.selectionText) clipboard.writeText(params.selectionText);
      },
      forward: () => { if (contents.canGoForward()) contents.goForward(); },
      inspect: () => contents.inspectElement(params.x, params.y),
      'open-image': () => { if (imageURL) createTab(imageURL, tab.incognito); },
      'open-link': () => { if (linkURL) createTab(linkURL, tab.incognito); },
      'open-link-incognito': () => { if (linkURL) createTab(linkURL, true); },
      paste: () => contents.paste(),
      print: () => contents.print({}, (success, failureReason) => {
        if (!success) console.warn('[Umbrella] Could not print the page:', failureReason);
      }),
      reload: () => contents.reload(),
      'save-image': () => { if (imageURL) saveContextUrlAs(contents, imageURL, 'Salva immagine con nome...'); },
      'save-link': () => { if (linkURL) saveContextUrlAs(contents, linkURL, 'Salva link con nome...'); },
      'save-page': () => savePageAs(contents),
      'select-all': () => contents.selectAll(),
      cut: () => contents.cut()
    };
    const template: MenuItemConstructorOptions[] = menuItems.map((item) => {
      if ('type' in item) return item;
      const { action, ...menuItem } = item;
      return { ...menuItem, click: actions[action] };
    });
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
  contents.once('destroyed', () => pendingContextSavePaths.delete(contents.id));
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith('mailto:')) { event.preventDefault(); void shell.openExternal(url); return; }
    if (!isSafeWebUrl(url) && url !== 'about:blank') event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isSafeWebUrl(url) && url !== 'about:blank') event.preventDefault();
  });
  contents.on('did-start-loading', () => updateTab(tab, { loading: true }));
  contents.on('did-stop-loading', () => updateTab(tab, { loading: false }));
  contents.on('page-title-updated', (_event, title) => updateTab(tab, { title: title || tab.url }));
  contents.on('page-favicon-updated', (_event, favicons) => updateTab(tab, { faviconUrl: favicons?.[0] ?? null }));
  contents.on('media-started-playing', () => updateTab(tab, { audible: true }));
  contents.on('media-paused', () => updateTab(tab, { audible: false }));
  contents.on('did-navigate', (_event, url) => {
    denyPendingPermissions(pendingPermissionRequests.cancelForTab(tab.id));
    updateTab(tab, { url, title: contents.getTitle() || url, loading: false });
    addHistory(tab);
    persistSession();
  });
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) {
      updateTab(tab, { url });
      persistSession();
    }

  });
  contents.on('render-process-gone', () => updateTab(tab, { loading: false }));
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const key = input.key.toLowerCase();
    if (key === 'l') { event.preventDefault(); mainWindow?.webContents.send('ui:focus-address'); }
    else if (key === 't' && input.shift) { event.preventDefault(); const previous = recentlyClosed.shift(); if (previous) createTab(previous.url); }
    else if (key === 't') { event.preventDefault(); createTab(); }
    else if (key === 'w') { event.preventDefault(); closeTab(tab.id); }
    else if (key === 'r') { event.preventDefault(); contents.reload(); }
    else if (key === 'f') { event.preventDefault(); mainWindow?.webContents.send('ui:find'); }
    else if (key === 'tab') { event.preventDefault(); const index = tabs.findIndex((item) => item.id === activeTabId); switchTab(tabs[(index + 1) % tabs.length]?.id ?? activeTabId); }
  });
  void ses;
  return view;
}

function saveContextUrlAs(contents: Electron.WebContents, url: string, title: string) {
  const filename = new URL(url).pathname.split('/').pop() || 'download';
  const options = { title, defaultPath: filename };
  const saveChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showSaveDialog(mainWindow, options)
    : dialog.showSaveDialog(options);
  void saveChoice.then((choice) => {
    if (choice.canceled || !choice.filePath || contents.isDestroyed()) return;
    pendingContextSavePaths.set(contents.id, { url, filePath: choice.filePath });
    try {
      contents.downloadURL(url);
    } catch (error) {
      pendingContextSavePaths.delete(contents.id);
      console.warn('[Umbrella] Could not start the context-menu download:', error);
    }
  }).catch((error) => console.warn('[Umbrella] Could not select a download location:', error));
}

function savePageAs(contents: Electron.WebContents) {
  const options = {
    title: 'Salva pagina con nome...',
    defaultPath: 'pagina.html',
    filters: [{ name: 'Pagina web', extensions: ['html'] }]
  };
  const saveChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showSaveDialog(mainWindow, options)
    : dialog.showSaveDialog(options);
  void saveChoice.then(async (choice) => {
    if (choice.canceled || !choice.filePath || contents.isDestroyed()) return;
    try {
      await contents.savePage(choice.filePath, 'HTMLComplete');
    } catch (error) {
      console.warn('[Umbrella] Could not save the page:', error);
    }
  }).catch((error) => console.warn('[Umbrella] Could not select a page save location:', error));
}

function loadTab(tab: Tab) {
  if (!tab.url || tab.view) return;
  const view = createPageView(tab);
  if (!view) return;
  tab.loading = true;
  tab.suspended = false;
  void view.webContents.loadURL(tab.url).catch((error: unknown) => {
    console.warn('[Umbrella] Navigation failed:', error);
    updateTab(tab, { loading: false });
  });
}

function createTab(url?: string, incognito = false, loadImmediately = true) {
  const previous = activeTab();
  if (previous) previous.inactiveSince = Date.now();
  const tab: Tab = {
    id: randomUUID(), title: url ? url : 'Nuova scheda', url: url ?? '',
    loading: false, audible: false, incognito, faviconUrl: null, suspended: false, inactiveSince: null, view: null
  };
  tabs.push(tab);
  activeTabId = tab.id;
  if (url && loadImmediately) loadTab(tab);
  applyContentViewVisibility();
  emitState();
  persistSession();
  return tab.id;
}

function switchTab(id: string) {
  const tab = tabs.find((item) => item.id === id);
  if (!tab) return;
  const previous = activeTab();
  if (previous && previous.id !== id) previous.inactiveSince = Date.now();
  activeTabId = id;
  tab.inactiveSince = null;
  loadTab(tab);
  applyContentViewVisibility();
  emitState();
}

function closeTab(id: string) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  denyPendingPermissions(pendingPermissionRequests.cancelForTab(id));
  const wasActive = activeTabId === id;
  if (!tab.incognito && tab.url) recentlyClosed.unshift({ url: tab.url, title: tab.title });
  if (tab.view) {
    // Detach and hide the native view before destroying its WebContents. This avoids
    // stale native surfaces covering the renderer after a tab is removed.
    tab.view.setVisible(false);
    try { mainWindow?.contentView.removeChildView(tab.view); } catch { /* already detached */ }
    const closingContents = tab.view.webContents;
    tab.view = null;
    if (!closingContents.isDestroyed()) closingContents.close({ waitForBeforeUnload: false });
  }
  if (wasActive) {
    const next = tabs[Math.min(index, tabs.length - 1)];
    activeTabId = next?.id ?? '';
    if (next) {
      next.inactiveSince = null;
      loadTab(next);
    }
  }
  if (!tabs.length) {
    createTab();
    return;
  }
  applyContentViewVisibility();
  emitState();
  persistSession();
}

function suspendTab(tab: Tab) {
  const view = tab.view;
  if (!view) return;
  denyPendingPermissions(pendingPermissionRequests.cancelForTab(tab.id));
  view.setVisible(false);
  try { mainWindow?.contentView.removeChildView(view); } catch { /* already detached */ }
  tab.view = null;
  tab.loading = false;
  tab.audible = false;
  tab.suspended = true;
  if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
  emitState();
}

function suspendInactiveTabs() {
  const minutes = database.settings.tabSuspendAfterMinutes;
  if (!minutes) return;
  const now = Date.now();
  for (const tab of tabs) {
    if (!shouldSuspendTab(tab, activeTabId, minutes, now)) continue;
    const contents = tab.view?.webContents;
    if (!contents || contents.isDestroyed() || contents.isCurrentlyAudible()) continue;
    suspendTab(tab);
  }
}

function navigate(input: string, tabId?: string) {
  let tab = tabs.find((candidate) => candidate.id === tabId) ?? activeTab();
  if (!tab) {
    createTab();
    tab = activeTab();
  }
  if (!tab) return;
  const url = resolveNavigation(input, database.settings.theme);
  if (!isSafeWebUrl(url)) return;
  if (tab.id !== activeTabId) {
    const previous = activeTab();
    if (previous) previous.inactiveSince = Date.now();
    activeTabId = tab.id;
    tab.inactiveSince = null;
  }
  if (!tab.view) createPageView(tab);
  tab.url = url;
  tab.title = url;
  tab.loading = true;
  tab.audible = false;
  tab.suspended = false;
  tab.faviconUrl = null;
  if (tab.id !== activeTabId) activeTabId = tab.id;
  applyContentViewVisibility();
  emitState();
  void tab.view?.webContents.loadURL(url).catch((error) => {
    console.warn('[Umbrella] Navigation failed:', error);
    updateTab(tab!, { loading: false });
  });
  persistSession();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#11131b',
    show: false,
    title: 'Umbrella',
    icon: app.isPackaged ? join(process.resourcesPath, 'umbrella.ico') : join(__dirname, '../../resources/umbrella.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('resize', applyContentViewVisibility);
  mainWindow.on('maximize', applyContentViewVisibility);
  mainWindow.on('unmaximize', applyContentViewVisibility);
  mainWindow.on('close', () => persistSession());
  mainWindow.on('closed', () => {
    denyPendingPermissions(pendingPermissionRequests.drain());
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));

  if (!tabs.length) {
    const saved = database.settings.restoreSession ? database.lastSession.filter((tab) => isSafeWebUrl(tab.url)) : [];
    if (saved.length) {
      saved.forEach((tab, index) => createTab(tab.url, false, index === saved.length - 1));
      const launchUrl = process.argv.find(isSafeWebUrl);
      if (launchUrl) createTab(launchUrl);
    } else {
      createTab(process.argv.find(isSafeWebUrl));
    }
  } else {
    applyContentViewVisibility();
  }
}

function currentTabView() { return activeTab()?.view?.webContents ?? null; }

ipcMain.handle('browser:get-state', () => ({
  tabs: tabs.map(toTabInfo), activeTabId,
  appVersion: app.getVersion(),
  bookmarks: database.bookmarks,
  history: database.history.slice(0, 500),
  downloads: currentDownloads(), settings: database.settings,
  wallpaperUrl: getWallpaperUrl(), extensions: getExtensionsInfo(), adBlockReady, adBlockError,
  sitePrivacy: getSitePrivacyState()
}));
ipcMain.on('browser:set-content-bounds', (_event, bounds: ContentBounds) => {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return;
  contentBounds = { ...bounds, visible: !!bounds.visible };
  applyContentViewVisibility();
});
ipcMain.handle('permissions:respond', (_event, payload: { id?: string; allowed?: boolean }) => {
  if (!payload?.id || typeof payload.allowed !== 'boolean') return false;
  const request = pendingPermissionRequests.take(payload.id);
  if (!request) return false;
  database.settings.sitePermissions[request.origin] = {
    ...database.settings.sitePermissions[request.origin],
    [request.permission]: payload.allowed
  };
  saveDatabase();
  request.callback(payload.allowed);
  emitState();
  return true;
});
ipcMain.handle('privacy:set-site-permission', (_event, payload: { origin?: string; permission?: SitePermissionName; allowed?: boolean | null }) => {
  const origin = payload?.origin;
  const permission = sitePermissionNames.find((item) => item === payload?.permission);
  if (!origin || getHttpOrigin(origin) !== origin || activeTab()?.incognito || getHttpOrigin(activeTab()?.url) !== origin || !permission) return false;
  if (payload.allowed !== null && typeof payload.allowed !== 'boolean') return false;
  const overrides = { ...database.settings.sitePermissions[origin] };
  if (payload.allowed === null) delete overrides[permission];
  else overrides[permission] = payload.allowed;
  if (Object.keys(overrides).length) database.settings.sitePermissions[origin] = overrides;
  else delete database.settings.sitePermissions[origin];
  saveDatabase();
  emitState();
  return true;
});
ipcMain.handle('privacy:set-site-adblock-excluded', (_event, payload: { origin?: string; excluded?: boolean }) => {
  const origin = payload?.origin;
  if (!origin || getHttpOrigin(origin) !== origin || activeTab()?.incognito || getHttpOrigin(activeTab()?.url) !== origin || typeof payload.excluded !== 'boolean') return false;
  const exclusions = new Set(database.settings.adBlockExcludedSites);
  if (payload.excluded) exclusions.add(origin);
  else exclusions.delete(origin);
  database.settings.adBlockExcludedSites = [...exclusions];
  saveDatabase();
  emitState();
  return true;
});
ipcMain.handle('browser:navigate', (_event, payload: { input: string; tabId?: string }) => {
  if (typeof payload?.input !== 'string' || payload.input.length > 4096) return false;
  navigate(payload.input, payload.tabId);
  return true;
});
ipcMain.handle('tabs:new', (_event, payload?: { url?: string; incognito?: boolean }) => {
  if (payload?.url && !isSafeWebUrl(resolveNavigation(payload.url))) return null;
  return createTab(payload?.url, !!payload?.incognito);
});
ipcMain.handle('tabs:switch', (_event, id: string) => switchTab(id));
ipcMain.handle('tabs:close', (_event, id: string) => closeTab(id));
ipcMain.handle('tabs:context-menu', (_event, payload: { id: string; x: number; y: number }) => {
  if (!mainWindow || !payload || typeof payload.id !== 'string' || !tabs.some((tab) => tab.id === payload.id)) return false;
  const id = payload.id;
  const menu = Menu.buildFromTemplate([
    { label: 'Nuova scheda', click: () => createTab() },
    { type: 'separator' },
    { label: 'Duplica scheda', click: () => { const tab = tabs.find((item) => item.id === id); if (tab) tab.url ? createTab(tab.url, tab.incognito) : createTab(undefined, tab.incognito); } },
    { label: 'Chiudi scheda', click: () => closeTab(id) },
    { label: 'Chiudi le altre schede', enabled: tabs.length > 1, click: () => { for (const otherId of tabs.filter((tab) => tab.id !== id).map((tab) => tab.id)) closeTab(otherId); switchTab(id); } },
    { type: 'separator' },
    { label: 'Ripristina scheda chiusa', enabled: recentlyClosed.length > 0, click: () => { const previous = recentlyClosed.shift(); if (previous) createTab(previous.url); } }
  ]);
  menu.popup({ window: mainWindow, x: Math.max(0, Math.floor(payload.x)), y: Math.max(0, Math.floor(payload.y)) });
  return true;
});
ipcMain.handle('tabs:duplicate', (_event, id: string) => {
  const tab = tabs.find((candidate) => candidate.id === id);
  if (tab?.url && isSafeWebUrl(tab.url)) return createTab(tab.url, tab.incognito);
  return createTab(undefined, !!tab?.incognito);
});
ipcMain.handle('tabs:restore', () => {
  const previous = recentlyClosed.shift();
  return previous ? createTab(previous.url) : null;
});
ipcMain.handle('tabs:move', (_event, payload: { id: string; targetIndex: number }) => {
  const from = tabs.findIndex((tab) => tab.id === payload?.id);
  if (from < 0 || !Number.isInteger(payload.targetIndex)) return;
  const [tab] = tabs.splice(from, 1);
  tabs.splice(Math.max(0, Math.min(payload.targetIndex, tabs.length)), 0, tab);
  emitState();
});
ipcMain.handle('browser:back', () => { const view = currentTabView(); if (view?.canGoBack()) view.goBack(); });
ipcMain.handle('browser:forward', () => { const view = currentTabView(); if (view?.canGoForward()) view.goForward(); });
ipcMain.handle('browser:reload', () => currentTabView()?.reload());
ipcMain.handle('browser:stop', () => currentTabView()?.stop());
ipcMain.handle('browser:find', (_event, query: string) => {
  if (typeof query === 'string' && query.length < 500) currentTabView()?.findInPage(query);
});
ipcMain.handle('browser:stop-find', () => currentTabView()?.stopFindInPage('clearSelection'));

ipcMain.handle('bookmarks:toggle-current', () => {
  const tab = activeTab();
  if (!tab || !isSafeWebUrl(tab.url) || tab.incognito) return false;
  const existing = database.bookmarks.find((bookmark) => bookmark.url === tab.url);
  if (existing) database.bookmarks = database.bookmarks.filter((bookmark) => bookmark.id !== existing.id);
  else database.bookmarks.unshift({ id: randomUUID(), title: tab.title || tab.url, url: tab.url, createdAt: Date.now() });
  saveDatabase(); emitState(); return true;
});
ipcMain.handle('bookmarks:add', (_event, payload: { title: string; url: string }) => {
  if (!payload || typeof payload.url !== 'string' || !isSafeWebUrl(payload.url)) return false;
  if (!database.bookmarks.some((bookmark) => bookmark.url === payload.url)) {
    database.bookmarks.unshift({ id: randomUUID(), title: String(payload.title || payload.url).slice(0, 160), url: payload.url, createdAt: Date.now() });
    saveDatabase(); emitState();
  }
  return true;
});
ipcMain.handle('bookmarks:remove', (_event, id: string) => {
  database.bookmarks = database.bookmarks.filter((bookmark) => bookmark.id !== id); saveDatabase(); emitState();
});
ipcMain.handle('bookmarks:update', (_event, payload: { id: string; title: string; url: string }) => {
  if (!payload || !isSafeWebUrl(payload.url)) return false;
  const bookmark = database.bookmarks.find((item) => item.id === payload.id);
  if (bookmark) { bookmark.title = String(payload.title).slice(0, 160); bookmark.url = payload.url; saveDatabase(); emitState(); }
  return !!bookmark;
});
ipcMain.handle('history:remove', (_event, id: string) => {
  database.history = database.history.filter((visit) => visit.id !== id); saveDatabase(); emitState();
});
ipcMain.handle('history:clear', () => { database.history = []; saveDatabase(); emitState(); });

ipcMain.handle('downloads:action', (_event, payload: { id: string; action: string }) => {
  const entry = downloads.get(payload?.id);
  if (!entry) return false;
  const { item, record } = entry;
  switch (payload.action) {
    case 'pause': if (!item.isPaused()) item.pause(); break;
    case 'resume': if (item.isPaused() && item.canResume()) item.resume(); break;
    case 'cancel': item.cancel(); break;
    case 'open': if (record.savePath) void shell.openPath(record.savePath); break;
    case 'show': if (record.savePath) shell.showItemInFolder(record.savePath); break;
    default: return false;
  }
  return true;
});

ipcMain.handle('settings:update', async (_event, patch: Partial<AppSettings>) => {
  const allowed: Partial<AppSettings> = {};
  if (patch.theme === 'dark' || patch.theme === 'light' || patch.theme === 'system') allowed.theme = patch.theme;
  if (typeof patch.accent === 'string' && /^#[0-9a-f]{6}$/i.test(patch.accent)) allowed.accent = patch.accent;
  if (typeof patch.restoreSession === 'boolean') allowed.restoreSession = patch.restoreSession;
  if (typeof patch.askDownloadLocation === 'boolean') allowed.askDownloadLocation = patch.askDownloadLocation;
  if (typeof patch.downloadNotifications === 'boolean') allowed.downloadNotifications = patch.downloadNotifications;
  if (typeof patch.adBlockEnabled === 'boolean') allowed.adBlockEnabled = patch.adBlockEnabled;
  if (typeof patch.onboardingCompleted === 'boolean') allowed.onboardingCompleted = patch.onboardingCompleted;
  if (typeof patch.discordClientId === 'string') {
    const clientId = patch.discordClientId.trim();
    if (!clientId || isValidDiscordClientId(clientId)) allowed.discordClientId = clientId;
  }
  if (typeof patch.discordActivityEnabled === 'boolean') {
    const clientId = allowed.discordClientId ?? database.settings.discordClientId;
    if (!patch.discordActivityEnabled || isValidDiscordClientId(clientId)) {
      allowed.discordActivityEnabled = patch.discordActivityEnabled;
    }
  }
  if (typeof patch.performanceModeEnabled === 'boolean') allowed.performanceModeEnabled = patch.performanceModeEnabled;
  if (typeof patch.tabSuspendAfterMinutes === 'number' && [0, 5, 15, 30, 60].includes(patch.tabSuspendAfterMinutes)) {
    allowed.tabSuspendAfterMinutes = patch.tabSuspendAfterMinutes;
  }
  database.settings = { ...database.settings, ...allowed };
  if (typeof patch.theme === 'string') nativeTheme.themeSource = database.settings.theme;
  saveDatabase();
  if (typeof patch.adBlockEnabled === 'boolean') await syncAdBlocker();
  discordPresence.sync(database.settings);
  emitState();
  return database.settings;
});
function getProtocolRegistrationTarget() {
  // `electron .` in development needs the app entry path; packaged builds use
  // their own executable directly. The same tuple is used for register/check.
  if (process.defaultApp && process.argv[1]) {
    return { executable: process.execPath, args: [resolve(process.argv[1])] };
  }
  return { executable: process.execPath, args: [] as string[] };
}

async function writeRegistryString(key: string, valueName: string | null, value: string) {
  const args = ['add', key, ...(valueName ? ['/v', valueName] : ['/ve']), '/t', 'REG_SZ', '/d', value, '/f'];
  await execFileAsync('reg.exe', args, { windowsHide: true });
}

async function registerWindowsBrowserCapabilities(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const { executable, args } = getProtocolRegistrationTarget();
  const launchCommand = `"${executable}"${args.length ? ` "${args[0]}"` : ''} -- "%1"`;
  const icon = `"${executable}",0`;
  const capabilities = 'HKCU\\Software\\Umbrella\\Capabilities';
  const urlAssociations = `${capabilities}\\URLAssociations`;
  const fileAssociations = `${capabilities}\\FileAssociations`;
  const startMenu = 'HKCU\\Software\\Clients\\StartMenuInternet\\Umbrella';

  try {
    // Register the browser as a candidate. Windows still requires the user to
    // confirm HTTP/HTTPS in Settings; Umbrella never changes this silently.
    const registryEntries: Array<[string, string | null, string]> = [
      ['HKCU\\Software\\Classes\\UmbrellaURL', null, 'Umbrella URL'],
      ['HKCU\\Software\\Classes\\UmbrellaURL', 'URL Protocol', ''],
      ['HKCU\\Software\\Classes\\UmbrellaURL\\DefaultIcon', null, icon],
      ['HKCU\\Software\\Classes\\UmbrellaURL\\shell\\open\\command', null, launchCommand],
      ['HKCU\\Software\\Classes\\UmbrellaHTML', null, 'Umbrella HTML Document'],
      ['HKCU\\Software\\Classes\\UmbrellaHTML\\DefaultIcon', null, icon],
      ['HKCU\\Software\\Classes\\UmbrellaHTML\\shell\\open\\command', null, launchCommand],
      [capabilities, 'ApplicationName', 'Umbrella'],
      [capabilities, 'ApplicationDescription', 'Umbrella è un browser desktop basato su Chromium.'],
      [capabilities, 'ApplicationIcon', icon],
      [urlAssociations, 'http', 'UmbrellaURL'],
      [urlAssociations, 'https', 'UmbrellaURL'],
      [fileAssociations, '.htm', 'UmbrellaHTML'],
      [fileAssociations, '.html', 'UmbrellaHTML'],
      [startMenu, null, 'Umbrella'],
      [`${startMenu}\\DefaultIcon`, null, icon],
      [`${startMenu}\\shell\\open\\command`, null, launchCommand],
      [`${startMenu}\\Capabilities`, 'ApplicationName', 'Umbrella'],
      [`${startMenu}\\Capabilities`, 'ApplicationDescription', 'Umbrella è un browser desktop basato su Chromium.'],
      [`${startMenu}\\Capabilities`, 'ApplicationIcon', icon],
      [`${startMenu}\\Capabilities\\URLAssociations`, 'http', 'UmbrellaURL'],
      [`${startMenu}\\Capabilities\\URLAssociations`, 'https', 'UmbrellaURL'],
      [`${startMenu}\\Capabilities\\FileAssociations`, '.htm', 'UmbrellaHTML'],
      [`${startMenu}\\Capabilities\\FileAssociations`, '.html', 'UmbrellaHTML'],
      ['HKCU\\Software\\RegisteredApplications', 'Umbrella', 'Software\\Umbrella\\Capabilities']
    ];
    for (const [key, name, value] of registryEntries) await writeRegistryString(key, name, value);

    // Register HTTP and HTTPS handlers for Windows' chooser, not as a forced
    // default. The OS owns the final default-app selection.
    app.setAsDefaultProtocolClient('http', executable, args);
    app.setAsDefaultProtocolClient('https', executable, args);
    // Ask Windows to refresh its list of handlers so Umbrella appears in Settings.
    try {
      const notify = `Add-Type -Namespace UmbrellaNative -Name Shell -MemberDefinition '[System.Runtime.InteropServices.DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, uint flags, System.IntPtr item1, System.IntPtr item2);'; [UmbrellaNative.Shell]::SHChangeNotify(0x08000000, 0x00001000, [IntPtr]::Zero, [IntPtr]::Zero)`;
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', notify], { windowsHide: true, timeout: 4000 });
    } catch (notifyError) {
      console.warn('[Umbrella] Windows association refresh notification failed:', notifyError);
    }
    return true;
  } catch (error) {
    console.error('[Umbrella] Windows browser registration failed:', error);
    return false;
  }
}

async function isUmbrellaRegistered(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await execFileAsync('reg.exe', [
      'query', 'HKCU\\Software\\RegisteredApplications', '/v', 'Umbrella'
    ], { windowsHide: true });
    return /Umbrella\s+REG_SZ\s+Software\\Umbrella\\Capabilities/i.test(stdout);
  } catch {
    return false;
  }
}

async function isUmbrellaDefaultBrowser(): Promise<boolean> {
  if (process.platform === 'win32') {
    // Windows 10/11 stores the user's chosen handler in UserChoice. Checking
    // these ProgIDs avoids mistaking mere protocol registration for a real
    // default-browser selection.
    try {
      const readProgId = async (protocol: 'http' | 'https') => {
        const key = `HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${protocol}\\UserChoice`;
        const { stdout } = await execFileAsync('reg.exe', ['query', key, '/v', 'ProgId'], { windowsHide: true });
        return stdout.match(/ProgId\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim() ?? '';
      };
      const [httpProgId, httpsProgId] = await Promise.all([readProgId('http'), readProgId('https')]);
      return httpProgId === 'UmbrellaURL' && httpsProgId === 'UmbrellaURL';
    } catch {
      return false;
    }
  }
  const { executable, args } = getProtocolRegistrationTarget();
  return app.isDefaultProtocolClient('http', executable, args)
    && app.isDefaultProtocolClient('https', executable, args);
}

ipcMain.handle('browser:set-default', async () => {
  if (process.platform !== 'win32') {
    return { registered: false, isDefault: await isUmbrellaDefaultBrowser(), settingsOpened: false, message: 'La selezione del browser predefinito è gestita dal sistema operativo.' };
  }
  const registered = await registerWindowsBrowserCapabilities();
  let settingsOpened = false;
  try {
    await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Umbrella');
    settingsOpened = true;
  } catch (error) {
    console.error('[Umbrella] Could not open Umbrella default-app settings:', error);
    try {
      await shell.openExternal('ms-settings:defaultapps');
      settingsOpened = true;
    } catch (fallbackError) {
      console.error('[Umbrella] Could not open the general default-app settings:', fallbackError);
    }
  }
  return {
    registered,
    isDefault: await isUmbrellaDefaultBrowser(),
    settingsOpened,
    message: registered
      ? 'Umbrella è registrato in Windows. Selezionalo nella pagina che si è aperta e assegna HTTP e HTTPS.'
      : 'La registrazione automatica non è riuscita. Puoi comunque cercare Umbrella nelle app predefinite di Windows.'
  };
});

ipcMain.handle('browser:check-default', async () => {
  const isDefault = await isUmbrellaDefaultBrowser();
  return {
    registered: await isUmbrellaRegistered(),
    isDefault,
    settingsOpened: false,
    message: isDefault
      ? 'Umbrella è il browser predefinito per HTTP e HTTPS.'
      : 'Umbrella non risulta ancora il browser predefinito.'
  };
});

ipcMain.handle('discord:open-developer-portal', async () => {
  try {
    await shell.openExternal('https://discord.com/developers/applications');
    return true;
  } catch (error) {
    console.error('[Umbrella] Could not open the Discord Developer Portal:', error);
    return false;
  }
});

ipcMain.handle('browser:scan-import-sources', () => discoverBrowserProfiles());

ipcMain.handle('browser:choose-custom-import-source', async () => {
  const options = {
    title: 'Seleziona la cartella del profilo browser',
    buttonLabel: 'Usa questa cartella',
    properties: ['openDirectory'] as Array<'openDirectory'>,
    message: 'Scegli la cartella User Data, Profiles o quella del singolo profilo. Umbrella legge solo i dati compatibili.'
  };
  const selection = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (selection.canceled || !selection.filePaths[0]) return null;
  return registerCustomBrowserProfile(selection.filePaths[0]);
});

ipcMain.handle('browser:import-profile', (_event, payload: {
  browserId: string;
  profileId: string;
  options: { bookmarks: boolean; history: boolean };
}) => {
  if (!payload || typeof payload.browserId !== 'string' || typeof payload.profileId !== 'string'
    || typeof payload.options?.bookmarks !== 'boolean' || typeof payload.options?.history !== 'boolean'
    || (!payload.options.bookmarks && !payload.options.history)) {
    return { ok: false, bookmarksImported: 0, historyImported: 0, message: 'Seleziona almeno un tipo di dato da importare.', warnings: [] };
  }
  try {
    const extracted = importBrowserProfile(payload.browserId, payload.profileId, payload.options);
    const existingBookmarks = new Set(database.bookmarks.map((bookmark) => bookmark.url));
    let bookmarksImported = 0;
    for (const item of extracted.bookmarks) {
      if (!isSafeWebUrl(item.url) || existingBookmarks.has(item.url)) continue;
      database.bookmarks.push({
        id: randomUUID(),
        title: String(item.title || item.url).slice(0, 160),
        url: item.url,
        createdAt: Date.now()
      });
      existingBookmarks.add(item.url);
      bookmarksImported += 1;
    }

    const existingVisits = new Set(database.history.map((visit) => `${visit.url}|${visit.visitedAt}`));
    let historyImported = 0;
    for (const item of extracted.history) {
      if (!isSafeWebUrl(item.url) || !Number.isFinite(item.visitedAt) || item.visitedAt <= 0 || item.visitedAt > Date.now() + 60_000) continue;
      const key = `${item.url}|${item.visitedAt}`;
      if (existingVisits.has(key)) continue;
      database.history.push({
        id: randomUUID(),
        title: String(item.title || item.url).slice(0, 160),
        url: item.url,
        visitedAt: item.visitedAt
      });
      existingVisits.add(key);
      historyImported += 1;
    }
    if (bookmarksImported || historyImported) {
      database.history.sort((a, b) => b.visitedAt - a.visitedAt);
      database.history = database.history.slice(0, 5000);
      saveDatabase();
      emitState();
    }
    const importedSomething = bookmarksImported > 0 || historyImported > 0;
    const summary = [
      bookmarksImported ? `${bookmarksImported} preferiti` : '',
      historyImported ? `${historyImported} voci di cronologia` : ''
    ].filter(Boolean).join(' e ');
    return {
      ok: importedSomething,
      bookmarksImported,
      historyImported,
      browserName: extracted.browserName,
      profileName: extracted.profileName,
      warnings: extracted.warnings,
      message: importedSomething
        ? `Importati ${summary} da ${extracted.browserName} · ${extracted.profileName}.`
        : extracted.warnings.length
          ? 'Non è stato possibile importare i dati selezionati. Controlla i dettagli.'
          : 'Non sono stati trovati nuovi dati da importare. I duplicati vengono ignorati.'
    };
  } catch (error) {
    console.error('[Umbrella] Browser data import failed:', error);
    return {
      ok: false, bookmarksImported: 0, historyImported: 0,
      message: error instanceof Error ? error.message : 'Importazione non riuscita.',
      warnings: []
    };
  }
});

ipcMain.handle('wallpaper:choose', async () => {
  const openChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showOpenDialog(mainWindow, {
    title: 'Scegli lo sfondo di Umbrella',
    properties: ['openFile'],
    filters: [{ name: 'Immagini', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
  })
    : dialog.showOpenDialog({
      title: 'Scegli lo sfondo di Umbrella',
      properties: ['openFile'],
      filters: [{ name: 'Immagini', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
    });
  const choice = await openChoice;
  const sourcePath = choice.filePaths[0];
  if (choice.canceled || !sourcePath) return false;
  try {
    const extension = extname(sourcePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) return false;
    const stats = statSync(sourcePath);
    if (!stats.isFile() || stats.size > 30 * 1024 * 1024) {
      const invalidImage = mainWindow && !mainWindow.isDestroyed()
        ? dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Immagine non valida', message: 'Scegli un file immagine inferiore a 30 MB.' })
        : dialog.showMessageBox({ type: 'warning', title: 'Immagine non valida', message: 'Scegli un file immagine inferiore a 30 MB.' });
      await invalidImage;
      return false;
    }
    const wallpaperDirectory = join(getDataDirectory(), 'wallpapers');
    mkdirSync(wallpaperDirectory, { recursive: true });
    const destination = join(wallpaperDirectory, `wallpaper-${randomUUID()}${extension}`);
    copyFileSync(sourcePath, destination);
    database.settings.wallpaperPath = destination;
    saveDatabase();
    emitState();
    return true;
  } catch (error) {
    console.error('[Umbrella] Could not set wallpaper:', error);
    return false;
  }
});
ipcMain.handle('wallpaper:reset', () => {
  database.settings.wallpaperPath = null;
  saveDatabase(); emitState(); return true;
});

ipcMain.handle('extensions:add', async () => {
  const openChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showOpenDialog(mainWindow, {
    title: 'Seleziona la cartella di un’estensione Chrome estratta',
    properties: ['openDirectory']
  })
    : dialog.showOpenDialog({
      title: 'Seleziona la cartella di un’estensione Chrome estratta',
      properties: ['openDirectory']
    });
  const choice = await openChoice;
  if (choice.canceled || !choice.filePaths[0]) return { ok: false, message: 'Installazione annullata.' };
  try {
    const extensionPath = realpathSync(choice.filePaths[0]);
    const manifest = readExtensionManifest(extensionPath);
    const ses = session.fromPartition(DEFAULT_PARTITION, { cache: true });
    const duplicate = database.extensions.find((item) => item.path === extensionPath);
    if (duplicate?.enabled) return { ok: true, message: `${duplicate.name} è già installata.` };
    const confirmOptions: MessageBoxOptions = {
      type: 'warning', title: 'Installa estensione',
      message: `Vuoi installare ${manifest.name}?`,
      detail: 'Le estensioni possono leggere e modificare i dati dei siti in base ai permessi richiesti. Installa solo estensioni di cui ti fidi.',
      buttons: ['Installa', 'Annulla'], defaultId: 1, cancelId: 1, noLink: true
    };
    const confirm = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showMessageBox(mainWindow, confirmOptions)
      : await dialog.showMessageBox(confirmOptions);
    if (confirm.response !== 0) return { ok: false, message: 'Installazione annullata.' };
    const loaded = await ses.extensions.loadExtension(extensionPath);
    database.extensions = database.extensions.filter((item) => item.path !== extensionPath && item.id !== loaded.id);
    database.extensions.push({ id: loaded.id, name: loaded.name || manifest.name, version: loaded.version || manifest.version, path: extensionPath, enabled: true });
    saveDatabase(); emitState();
    return { ok: true, message: `${loaded.name || manifest.name} è stata aggiunta.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Installazione non riuscita.' };
  }
});
ipcMain.handle('extensions:set-enabled', async (_event, payload: { id: string; enabled: boolean }) => {
  const item = database.extensions.find((entry) => entry.id === payload?.id);
  if (!item || typeof payload.enabled !== 'boolean') return false;
  const ses = session.fromPartition(DEFAULT_PARTITION, { cache: true });
  try {
    if (payload.enabled && !item.enabled) {
      if (!existsSync(item.path)) throw new Error('La cartella dell’estensione non è più disponibile.');
      const loaded = await ses.extensions.loadExtension(item.path);
      item.id = loaded.id; item.name = loaded.name || item.name; item.version = loaded.version || item.version;
    } else if (!payload.enabled && item.enabled) {
      ses.extensions.removeExtension(item.id);
    }
    item.enabled = payload.enabled;
    saveDatabase(); emitState(); return true;
  } catch (error) {
    console.warn('[Umbrella] Could not change extension state:', error);
    return false;
  }
});
ipcMain.handle('extensions:remove', (_event, id: string) => {
  const item = database.extensions.find((entry) => entry.id === id);
  if (!item) return false;
  if (item.enabled) session.fromPartition(DEFAULT_PARTITION, { cache: true }).extensions.removeExtension(item.id);
  database.extensions = database.extensions.filter((entry) => entry.id !== id);
  saveDatabase(); emitState(); return true;
});
ipcMain.handle('extensions:open-popup', async (_event, payload: { id?: string; position?: { right?: number; bottom?: number } }) => {
  const item = database.extensions.find((entry) => entry.id === payload?.id && entry.enabled);
  if (!item || !mainWindow || mainWindow.isDestroyed()) return { ok: false, message: 'Estensione non disponibile.' };

  const ses = session.fromPartition(DEFAULT_PARTITION, { cache: true });
  const extension = ses.extensions.getExtension(item.id);
  if (!extension) return { ok: false, message: 'Estensione non caricata.' };

  const manifest = extension.manifest as {
    action?: { default_popup?: unknown };
    browser_action?: { default_popup?: unknown };
  };
  const popupPath = manifest.action?.default_popup ?? manifest.browser_action?.default_popup;
  if (typeof popupPath !== 'string' || !popupPath.trim()) {
    return { ok: false, message: 'Questa estensione non definisce una finestra popup.' };
  }

  let popupUrl: URL;
  try {
    popupUrl = new URL(popupPath, extension.url);
    const extensionUrl = new URL(extension.url);
    if (popupUrl.protocol !== 'chrome-extension:' || popupUrl.host !== extensionUrl.host) {
      throw new Error('Percorso popup non valido.');
    }
    const root = realpathSync(extension.path);
    const decodedPath = decodeURIComponent(popupUrl.pathname).replace(/^[/\\]+/, '');
    const requestedPath = resolve(root, decodedPath);
    const resolvedPath = realpathSync(requestedPath);
    const relativePath = relative(root, resolvedPath);
    if (!statSync(resolvedPath).isFile() || !relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error('File popup non valido.');
    }
  } catch (error) {
    console.warn(`[Umbrella] Could not open popup for ${item.name}:`, error);
    return { ok: false, message: 'Impossibile aprire il popup dell’estensione.' };
  }

  if (extensionPopupWindow && !extensionPopupWindow.isDestroyed()) {
    if (extensionPopupId === item.id) {
      extensionPopupWindow.close();
      return { ok: true };
    }
    extensionPopupWindow.close();
  }

  const windowBounds = mainWindow.getContentBounds();
  const workArea = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  const width = Math.min(800, workArea.width);
  const height = Math.min(600, workArea.height);
  const { right, bottom } = payload.position ?? {};
  if (typeof right !== 'number' || !Number.isFinite(right) || typeof bottom !== 'number' || !Number.isFinite(bottom)) {
    return { ok: false, message: 'Posizione popup non valida.' };
  }
  const requestedX = windowBounds.x + right - width;
  const requestedY = windowBounds.y + bottom;
  const x = Math.max(workArea.x, Math.min(requestedX, workArea.x + workArea.width - width));
  const y = Math.max(workArea.y, Math.min(requestedY, workArea.y + workArea.height - height));
  const popup = new BrowserWindow({
    parent: mainWindow,
    x, y, width, height,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  popup.setMenu(null);
  extensionPopupWindow = popup;
  extensionPopupId = item.id;
  popup.on('closed', () => {
    if (extensionPopupWindow === popup) {
      extensionPopupWindow = null;
      extensionPopupId = '';
    }
  });
  popup.on('blur', () => popup.close());

  try {
    await popup.loadURL(popupUrl.href);
    if (!popup.isDestroyed()) popup.show();
    return { ok: true };
  } catch (error) {
    console.warn(`[Umbrella] Could not load popup for ${item.name}:`, error);
    if (!popup.isDestroyed()) popup.close();
    return { ok: false, message: 'Caricamento del popup non riuscito.' };
  }
});
ipcMain.handle('settings:clear-data', async () => {
  const clearOptions: MessageBoxOptions = {
    type: 'warning', title: 'Elimina dati di navigazione',
    message: 'Vuoi eliminare cookie, cache e dati dei siti?',
    detail: 'Questa operazione non elimina i preferiti. Potrebbe disconnetterti dai siti.',
    buttons: ['Elimina dati', 'Annulla'], defaultId: 1, cancelId: 1
  };
  const answer = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, clearOptions)
    : await dialog.showMessageBox(clearOptions);
  if (answer.response !== 0) return false;
  await session.fromPartition(DEFAULT_PARTITION).clearStorageData();
  await session.fromPartition(DEFAULT_PARTITION).clearCache();
  return true;
});
ipcMain.handle('bookmarks:export', async () => {
  const saveChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showSaveDialog(mainWindow, {
    title: 'Esporta preferiti', defaultPath: 'umbrella-bookmarks.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
    : dialog.showSaveDialog({
      title: 'Esporta preferiti', defaultPath: 'umbrella-bookmarks.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
  const choice = await saveChoice;
  if (choice.canceled || !choice.filePath) return false;
  writeFileSync(choice.filePath, JSON.stringify(database.bookmarks, null, 2), 'utf8');
  return true;
});
ipcMain.handle('bookmarks:import', async () => {
  const openChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showOpenDialog(mainWindow, {
    title: 'Importa preferiti da un browser',
    properties: ['openFile'],
    filters: [{ name: 'Preferiti HTML o JSON', extensions: ['html', 'htm', 'json'] }]
  })
    : dialog.showOpenDialog({
      title: 'Importa preferiti da un browser',
      properties: ['openFile'],
      filters: [{ name: 'Preferiti HTML o JSON', extensions: ['html', 'htm', 'json'] }]
    });
  const choice = await openChoice;
  if (choice.canceled || !choice.filePaths[0]) {
    return { ok: false, count: 0, message: 'Importazione annullata.' };
  }
  try {
    const filePath = choice.filePaths[0];
    if (statSync(filePath).size > 25 * 1024 * 1024) {
      return { ok: false, count: 0, message: 'Il file dei preferiti supera il limite di 25 MB.' };
    }
    const fileContents = readFileSync(filePath, 'utf8');
    const extension = extname(filePath).toLowerCase();
    const imported = extension === '.json'
      ? (JSON.parse(fileContents) as Partial<Bookmark[]>)
      : parseBookmarkHtml(fileContents);
    if (!Array.isArray(imported)) {
      return { ok: false, count: 0, message: 'Il file non contiene un elenco di preferiti valido.' };
    }
    const existing = new Set(database.bookmarks.map((item) => item.url));
    let count = 0;
    for (const item of imported) {
      if (!item || typeof item.url !== 'string' || !isSafeWebUrl(item.url) || existing.has(item.url)) continue;
      database.bookmarks.push({
        id: randomUUID(),
        title: String(item.title || item.url).slice(0, 160),
        url: item.url,
        createdAt: Date.now()
      });
      existing.add(item.url);
      count += 1;
    }
    if (count === 0) {
      return { ok: false, count: 0, message: 'Nel file non sono stati trovati nuovi preferiti web da importare.' };
    }
    saveDatabase();
    emitState();
    return { ok: true, count, message: `${count} preferiti importati.` };
  } catch (error) {
    console.error('[Umbrella] Could not import bookmarks:', error);
    return { ok: false, count: 0, message: 'Impossibile leggere il file dei preferiti. Controlla che sia un HTML o JSON valido.' };
  }
});

ipcMain.handle('updates:get-state', () => updateController.getState());
ipcMain.handle('updates:check', () => updateController.check());
ipcMain.handle('updates:install', () => updateController.install());

ipcMain.handle('window:action', (_event, action: string) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
});

app.on('second-instance', (_event, commandLine) => {
  const externalUrl = commandLine.find((argument) => isSafeWebUrl(argument));
  // Launching Umbrella while it is already running must bring the existing window
  // forward even when the second launch carries no URL.
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  if (externalUrl) navigate(externalUrl);
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  database = loadDatabase();
  tabSuspensionTimer = setInterval(suspendInactiveTabs, 30_000);
  permissionRequestSweepTimer = setInterval(() => {
    denyPendingPermissions(pendingPermissionRequests.expire(Date.now()));
  }, 15_000);
  discordPresence.sync(database.settings);
  nativeTheme.themeSource = database.settings.theme;
  // Make Umbrella visible in Windows' Default apps chooser before the user asks
  // to select it; this only registers capabilities and never takes ownership.
  if (process.platform === 'win32') void registerWindowsBrowserCapabilities();
  configureSession(DEFAULT_PARTITION, false);
  await restoreInstalledExtensions();
  createWindow();
  // Look for a new GitHub release once the window exists, without blocking startup.
  void updateController.check();
  // Do not hold the browser startup while filter lists are downloaded on first run.
  void syncAdBlocker();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  nativeTheme.on('updated', emitState);
});
app.on('before-quit', () => {
  if (tabSuspensionTimer) clearInterval(tabSuspensionTimer);
  if (blockedRequestUpdateTimer) clearTimeout(blockedRequestUpdateTimer);
  if (permissionRequestSweepTimer) clearInterval(permissionRequestSweepTimer);
  denyPendingPermissions(pendingPermissionRequests.drain());
  persistSession();
  void discordPresence.dispose();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
