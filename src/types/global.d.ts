import type { BookmarkImportResult, BrowserImportResult, BrowserState, DefaultBrowserResult, ImportBrowserInfo, PermissionRequest, ToolbarPopupKind } from '../../electron/preload';
import type { AppSettings, SitePermissionName } from '../../electron/storage';
import type { UpdateState } from '../../electron/updates';

declare global {
  interface Window {
    umbrella: {
      getState: () => Promise<BrowserState>;
      openToolbarPopup: (kind: ToolbarPopupKind, bounds: { right: number; bottom: number }) => Promise<boolean>;
      closeToolbarPopup: () => Promise<boolean>;
      openDownloadsHistory: () => Promise<boolean>;
      onOpenDownloadsHistory: (callback: () => void) => () => void;
      onState: (callback: (state: BrowserState) => void) => () => void;
      onFocusAddress: (callback: () => void) => () => void;
      onFindRequest: (callback: () => void) => () => void;
      onPermissionRequest: (callback: (request: PermissionRequest) => void) => () => void;
      onPermissionCancelled: (callback: (ids: string[]) => void) => () => void;
      respondToPermission: (id: string, allowed: boolean) => Promise<boolean>;
      setSitePermission: (origin: string, permission: SitePermissionName, allowed: boolean | null) => Promise<boolean>;
      setSiteAdBlockExcluded: (origin: string, excluded: boolean) => Promise<boolean>;
      setContentBounds: (bounds: { x: number; y: number; width: number; height: number; visible: boolean; rounded: boolean }) => void;
      navigate: (input: string, tabId?: string) => Promise<boolean>;
      newTab: (url?: string, incognito?: boolean) => Promise<string | null>;
      switchTab: (id: string) => Promise<void>;
      closeTab: (id: string) => Promise<void>;
      duplicateTab: (id: string) => Promise<string | null>;
      restoreClosedTab: () => Promise<string | null>;
      moveTab: (id: string, targetIndex: number) => Promise<void>;
      showTabContextMenu: (id: string, x: number, y: number) => Promise<boolean>;
      back: () => Promise<void>;
      forward: () => Promise<void>;
      reload: () => Promise<void>;
      stop: () => Promise<void>;
      toggleBookmark: () => Promise<boolean>;
      addBookmark: (title: string, url: string) => Promise<boolean>;
      removeBookmark: (id: string) => Promise<void>;
      updateBookmark: (id: string, title: string, url: string) => Promise<boolean>;
      removeHistory: (id: string) => Promise<void>;
      clearHistory: () => Promise<void>;
      downloadAction: (id: string, action: 'pause' | 'resume' | 'cancel' | 'open' | 'show') => Promise<boolean>;
      updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
      setDefaultBrowser: () => Promise<DefaultBrowserResult>;
      checkDefaultBrowser: () => Promise<DefaultBrowserResult>;
      openDiscordDeveloperPortal: () => Promise<boolean>;
      getUpdateState: () => Promise<UpdateState>;
      checkForUpdates: () => Promise<UpdateState>;
      installUpdate: () => Promise<boolean>;
      onUpdateState: (callback: (state: UpdateState) => void) => () => void;
      scanImportSources: () => Promise<ImportBrowserInfo[]>;
      chooseCustomImportSource: () => Promise<ImportBrowserInfo | null>;
      importBrowserProfile: (browserId: string, profileId: string, options: { bookmarks: boolean; history: boolean }) => Promise<BrowserImportResult>;
      chooseWallpaper: () => Promise<boolean>;
      resetWallpaper: () => Promise<boolean>;
      addExtension: () => Promise<{ ok: boolean; message: string }>;
      setExtensionEnabled: (id: string, enabled: boolean) => Promise<boolean>;
      removeExtension: (id: string) => Promise<boolean>;
      openExtensionPopup: (id: string, position: { right: number; bottom: number }) => Promise<{ ok: boolean; message?: string }>;
      clearBrowsingData: () => Promise<boolean>;
      exportBookmarks: () => Promise<boolean>;
      importBookmarks: () => Promise<BookmarkImportResult>;
      findInPage: (query: string) => Promise<void>;
      stopFind: () => Promise<void>;
      windowAction: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
    };
  }
}

export {};
