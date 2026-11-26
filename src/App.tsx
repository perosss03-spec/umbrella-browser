import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Shield, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import StartPage from './components/StartPage';
import AppearancePanel from './components/AppearancePanel';
import ManagerPanel from './components/ManagerPanel';
import Onboarding from './components/Onboarding';
import BrowserImportDialog from './components/BrowserImportDialog';
import SitePrivacyPanel from './components/SitePrivacyPanel';
import type { AppSettings } from '../electron/storage';
import type { BrowserState, TabInfo } from '../electron/preload';
import type { SitePermissionName } from '../electron/storage';
import type { PermissionRequest } from '../electron/preload';

type Panel = 'home' | 'bookmarks' | 'history' | 'downloads' | 'extensions' | 'settings' | 'appearance';

export default function App() {
  const [state, setState] = useState<BrowserState | null>(null);
  const [panel, setPanel] = useState<Panel>('home');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [address, setAddress] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [browserImportOpen, setBrowserImportOpen] = useState(false);
  const [importFeedback, setImportFeedback] = useState('');
  const pageHostRef = useRef<HTMLDivElement>(null);

  const tabs = state?.tabs ?? [];
  const activeTab = useMemo<TabInfo | null>(() => tabs.find((tab) => tab.id === state?.activeTabId) ?? null, [tabs, state?.activeTabId]);
  const isBookmarked = !!activeTab?.url && !!state?.bookmarks.some((bookmark) => bookmark.url === activeTab.url);
  const performanceMode = state?.settings.performanceModeEnabled ?? false;
  const incognitoMode = !!activeTab?.incognito;
  const onboardingVisible = !!state && !state.settings.onboardingCompleted;
  const showWebPage = !onboardingVisible && (panel === 'home' || performanceMode) && !!activeTab && !activeTab.isNewTab;

  useEffect(() => {
    void window.umbrella.getState().then(setState);
    return window.umbrella.onState(setState);
  }, []);

  useEffect(() => {
    if (state) setSidebarExpanded(!state.settings.sidebarCompact);
  }, [state?.settings.sidebarCompact]);

  useEffect(() => {
    setAddress(activeTab && !activeTab.isNewTab ? activeTab.url : '');
  }, [activeTab?.id, activeTab?.url, activeTab?.isNewTab]);

  // A permission prompt belongs to the page that requested it. Keeping it on screen
  // after switching tabs would let the user answer for a different site.
  useEffect(() => {
    setPermissionRequest(null);
  }, [state?.activeTabId]);

  useEffect(() => {
    const offFocus = window.umbrella.onFocusAddress(() => window.dispatchEvent(new Event('umbrella:focus-address')));
    const offFind = window.umbrella.onFindRequest(() => setFindOpen(true));
    const offDownloads = window.umbrella.onOpenDownloadsHistory(() => setPanel('downloads'));
    const offPermission = window.umbrella.onPermissionRequest((request) => setPermissionRequest(request));
    const offPermissionCancelled = window.umbrella.onPermissionCancelled((ids) => {
      setPermissionRequest((current) => current && ids.includes(current.id) ? null : current);
    });
    return () => { offFocus(); offFind(); offDownloads(); offPermission(); offPermissionCancelled(); };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const theme = state?.settings.theme ?? 'dark';
    root.dataset.theme = theme;
    root.style.setProperty('--accent', state?.settings.accent ?? '#8299ff');
  }, [state?.settings.theme, state?.settings.accent]);

  const updateBounds = useCallback(() => {
    const host = pageHostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    window.umbrella.setContentBounds({
      x: rect.left, y: rect.top, width: rect.width, height: rect.height,
      visible: showWebPage && rect.width > 0 && rect.height > 0,
      rounded: state?.settings.pageCornersRounded ?? false
    });
  }, [showWebPage, activeTab?.id, panel, state?.settings.pageCornersRounded]);

  useEffect(() => {
    updateBounds();
    const host = pageHostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(updateBounds);
    observer.observe(host);
    window.addEventListener('resize', updateBounds);
    return () => { observer.disconnect(); window.removeEventListener('resize', updateBounds); };
  }, [updateBounds, sidebarExpanded]);

  const navigate = (input: string) => {
    if (!input.trim()) return;
    setPanel('home');
    void window.umbrella.navigate(input);
  };
  const openUrl = (url: string) => {
    setPanel('home');
    void window.umbrella.navigate(url);
  };
  const newTab = () => { setPanel('home'); void window.umbrella.newTab(); };
  const newPrivateTab = () => { setPanel('home'); void window.umbrella.newTab(undefined, true); };
  const switchTab = (id: string) => { setPanel('home'); void window.umbrella.switchTab(id); };
  const changePanel = (next: Panel) => setPanel(next);
  const updateSettings = (patch: Partial<BrowserState['settings']>) => { void window.umbrella.updateSettings(patch); };
  const completeOnboarding = async (theme: AppSettings['theme']) => {
    const settings = await window.umbrella.updateSettings({ theme, onboardingCompleted: true });
    setState((current) => current ? { ...current, settings } : current);
  };
  const setSitePermission = (permission: SitePermissionName, allowed: boolean | null) => {
    const origin = state?.sitePrivacy.origin;
    return origin ? window.umbrella.setSitePermission(origin, permission, allowed) : Promise.resolve(false);
  };
  const setSiteAdBlockExcluded = (excluded: boolean) => {
    const origin = state?.sitePrivacy.origin;
    return origin ? window.umbrella.setSiteAdBlockExcluded(origin, excluded) : Promise.resolve(false);
  };

  const runFind = (value: string) => {
    setFindQuery(value);
    if (value.trim()) void window.umbrella.findInPage(value);
    else void window.umbrella.stopFind();
  };
  const closeFind = () => { setFindOpen(false); setFindQuery(''); void window.umbrella.stopFind(); };
  const renderStartPage = (preview = false) => {
    if (!state) return null;
    return <StartPage
      bookmarks={state.bookmarks}
      wallpaperUrl={state.wallpaperUrl}
      onSearch={navigate}
      onOpen={openUrl}
      onAddBookmark={(title, url) => window.umbrella.addBookmark(title, url)}
      onUpdateBookmark={(id, title, url) => window.umbrella.updateBookmark(id, title, url)}
      onRemoveBookmark={(id) => window.umbrella.removeBookmark(id)}
      onSettings={() => setPanel('appearance')}
      clockVisible={state.settings.startPageClockVisible}
      clockPosition={state.settings.startPageClockPosition}
      clockColor={state.settings.startPageClockColor}
      shortcutsVisible={state.settings.startPageShortcutsVisible}
      footerVisible={state.settings.startPageFooterVisible}
      footerText={state.settings.startPageFooterText}
      preview={preview}
    />;
  };

  return (
    <div className={`app-shell ${sidebarExpanded ? 'sidebar-wide' : ''} ${performanceMode ? 'performance-mode' : ''} ${incognitoMode ? 'incognito-mode' : ''}`}>
      <Toolbar
        activeTab={activeTab}
        extensions={state?.extensions ?? []}
        address={address}
        setAddress={setAddress}
        onNavigate={() => navigate(address)}
        onBack={() => void window.umbrella.back()}
        onForward={() => void window.umbrella.forward()}
        onReload={() => void window.umbrella.reload()}
        onStop={() => void window.umbrella.stop()}
        onBookmark={() => void window.umbrella.toggleBookmark()}
        isBookmarked={isBookmarked}
        onNewPrivateTab={newPrivateTab}
        onExtensions={() => setPanel('extensions')}
        onSettings={() => setPanel('settings')}
        onToggleSidebar={() => setSidebarExpanded((value) => {
          const expanded = !value;
          updateSettings({ sidebarCompact: !expanded });
          return expanded;
        })}
        performanceMode={performanceMode}
        sitePrivacy={state?.sitePrivacy ?? null}
        sitePrivacyAvailable={!!state?.sitePrivacy.origin}
        privacyOpen={privacyOpen}
        onTogglePrivacy={() => setPrivacyOpen((open) => !open)}
        toolbarItems={state?.settings.toolbarItems}
        onTogglePerformanceMode={() => {
          if (state) updateSettings({ performanceModeEnabled: !performanceMode });
        }}
      />

      <div className="browser-body">
        <Sidebar
          version={state?.version ?? ''}
          tabs={tabs}
          activeTabId={state?.activeTabId ?? ''}
          panel={panel}
          expanded={performanceMode || sidebarExpanded}
          visibleItems={state?.settings.sidebarItems}
          onToggleExpanded={() => setSidebarExpanded((value) => {
            const expanded = !value;
            updateSettings({ sidebarCompact: !expanded });
            return expanded;
          })}
          onNewTab={newTab}
          onSwitchTab={switchTab}
          onCloseTab={(id) => void window.umbrella.closeTab(id)}
          onMoveTab={(id, index) => void window.umbrella.moveTab(id, index)}
          onTabContextMenu={(id, x, y) => void window.umbrella.showTabContextMenu(id, x, y)}
          onPanel={changePanel}
        />

        <section className="main-shell">
          <div className={`workspace ${panel !== 'home' ? 'workspace-panel' : ''}`}>
            {!performanceMode && panel === 'home' && activeTab?.isNewTab && renderStartPage()}
            {!performanceMode && panel === 'appearance' && state && <div className="appearance-layout">
              <div className="appearance-preview">{renderStartPage(true)}</div>
              <AppearancePanel
                state={state}
                onSettings={updateSettings}
                onChooseWallpaper={() => window.umbrella.chooseWallpaper()}
                onResetWallpaper={() => window.umbrella.resetWallpaper()}
                onClose={() => setPanel('home')}
              />
            </div>}
            {!performanceMode && panel !== 'home' && panel !== 'appearance' && state && <ManagerPanel
              panel={panel}
              state={state}
              onOpen={openUrl}
              onSettings={updateSettings}
              onClearHistory={() => void window.umbrella.clearHistory()}
              onChooseWallpaper={() => void window.umbrella.chooseWallpaper()}
              onResetWallpaper={() => void window.umbrella.resetWallpaper()}
              onAddExtension={() => window.umbrella.addExtension()}
              onSetExtensionEnabled={(id, enabled) => window.umbrella.setExtensionEnabled(id, enabled)}
              onRemoveExtension={(id) => window.umbrella.removeExtension(id)}
              onOpenBrowserImport={() => { setImportFeedback(''); setBrowserImportOpen(true); }}
              onOpenAppearance={() => setPanel('appearance')}
              onOpenExtensions={() => setPanel('extensions')}
            />}
            <div ref={pageHostRef} className={`web-page-host ${showWebPage ? 'visible' : 'hidden'}`} aria-hidden="true" />
            {privacyOpen && state?.sitePrivacy.origin && <SitePrivacyPanel
              state={state.sitePrivacy}
              onClose={() => setPrivacyOpen(false)}
              onPermissionChange={setSitePermission}
              onAdBlockChange={setSiteAdBlockExcluded}
            />}
            {findOpen && showWebPage && <div className="find-bar">
              <Search size={15} /><input autoFocus value={findQuery} onChange={(e) => runFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') closeFind(); }} placeholder="Trova nella pagina..." />
              <button className="icon-button" aria-label="Chiudi ricerca" onClick={closeFind}><X size={15} /></button>
            </div>}
            {permissionRequest && showWebPage && <div className="permission-popover" role="dialog" aria-label="Autorizzazione del sito">
              <div className="permission-popover-head">
                <span className="permission-icon"><Shield size={16} /></span>
                <div>
                  <strong>{permissionRequest.hostname}</strong>
                  <span>richiede il permesso: {{
                    media: 'fotocamera e microfono',
                    geolocation: 'posizione',
                    notifications: 'notifiche',
                    'clipboard-read': 'lettura degli appunti',
                    midiSysex: 'dispositivi MIDI'
                  }[permissionRequest.permission] ?? permissionRequest.permission}</span>
                </div>
              </div>
              <div className="permission-actions">
                <button className="button-quiet" onClick={() => {
                  void window.umbrella.respondToPermission(permissionRequest.id, false);
                  setPermissionRequest(null);
                }}>Blocca</button>
                <button className="button-primary" onClick={() => {
                  void window.umbrella.respondToPermission(permissionRequest.id, true);
                  setPermissionRequest(null);
                }}>Consenti</button>
              </div>
            </div>}
            {panel === 'home' && !activeTab && <div className="loading-shell"><span className="mini-spinner" /> Avvio di Umbrella…</div>}
          </div>
        </section>
      </div>
      {onboardingVisible && state && <Onboarding
        initialTheme={state.settings.theme}
        importFeedback={importFeedback}
        onOpenImport={() => { setImportFeedback(''); setBrowserImportOpen(true); }}
        onImportFile={async () => {
          try {
            const result = await window.umbrella.importBookmarks();
            setImportFeedback(result.message);
          } catch {
            setImportFeedback('Importazione del file non riuscita.');
          }
        }}
        onComplete={completeOnboarding}
      />}
      {browserImportOpen && <BrowserImportDialog
        onClose={() => setBrowserImportOpen(false)}
        onImported={(result) => setImportFeedback(result.message)}
      />}
    </div>
  );
}
