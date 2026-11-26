import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, Bookmark,
  EyeOff, Gauge, LockKeyhole, MoreHorizontal, Puzzle, RotateCw, Shield, ShieldCheck, ShieldOff,
  Square, X, Minus, PanelLeft
} from 'lucide-react';
import type { ExtensionInfo, SitePrivacyState, TabInfo } from '../../electron/preload';
import type { ToolbarItemVisibility } from '../../electron/storage';

type Props = {
  activeTab: TabInfo | null;
  extensions: ExtensionInfo[];
  address: string;
  setAddress: (value: string) => void;
  onNavigate: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onBookmark: () => void;
  isBookmarked: boolean;
  onNewPrivateTab: () => void;
  onSettings: () => void;
  onExtensions: () => void;
  onToggleSidebar: () => void;
  performanceMode: boolean;
  onTogglePerformanceMode: () => void;
  sitePrivacy: SitePrivacyState | null;
  sitePrivacyAvailable: boolean;
  privacyOpen: boolean;
  onTogglePrivacy: () => void;
  toolbarItems?: ToolbarItemVisibility;
};

export default function Toolbar(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [toolbarMessage, setToolbarMessage] = useState('');
  const { activeTab, extensions, address, setAddress, onNavigate, onBack, onForward, onReload, onStop, onBookmark, isBookmarked, onNewPrivateTab, onSettings, onExtensions, onToggleSidebar, performanceMode, onTogglePerformanceMode, sitePrivacy, sitePrivacyAvailable, privacyOpen, onTogglePrivacy, toolbarItems } = props;
  const isVisible = (key: keyof ToolbarItemVisibility) => toolbarItems?.[key] !== false;

  useEffect(() => {
    const focus = () => { inputRef.current?.focus(); inputRef.current?.select(); };
    window.addEventListener('umbrella:focus-address', focus);
    return () => window.removeEventListener('umbrella:focus-address', focus);
  }, []);

  useEffect(() => {
    if (!toolbarMessage) return;
    const timeout = window.setTimeout(() => setToolbarMessage(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [toolbarMessage]);

  const secure = activeTab?.url.startsWith('https://');
  const adBlockActive = !!sitePrivacy?.adBlockEnabled && !sitePrivacy.adBlockExcluded;
  const adBlockSite = sitePrivacy?.origin ? new URL(sitePrivacy.origin).hostname : '';
  const adBlockTitle = !sitePrivacy?.adBlockEnabled
    ? 'Blocco annunci disattivato nelle impostazioni'
    : !sitePrivacy.origin
      ? activeTab?.incognito ? 'Esclusione disponibile solo nelle schede normali' : 'Disponibile quando apri un sito'
      : sitePrivacy.adBlockExcluded
        ? `Riattiva blocco annunci e tracker su ${adBlockSite}`
        : `Disattiva blocco annunci e tracker su ${adBlockSite}`;
  const openToolbarPopup = async (kind: 'downloads' | 'adblock', button: HTMLButtonElement) => {
    const bounds = button.getBoundingClientRect();
    setToolbarMessage('');
    try {
      const opened = await window.umbrella.openToolbarPopup(kind, { right: bounds.right, bottom: bounds.bottom });
      if (!opened) setToolbarMessage('Impossibile aprire il menu.');
    } catch (error) {
      console.error(`[Umbrella] Could not open ${kind} popup:`, error);
      setToolbarMessage('Impossibile aprire il menu.');
    }
  };
  return (
    <header className="toolbar">
      <div className="navigation-controls">
        {isVisible('sidebarToggle') && <button className="icon-button sidebar-toggle-top" aria-label="Mostra o nascondi sidebar" title="Sidebar" onClick={onToggleSidebar}><PanelLeft size={17} /></button>}
        {isVisible('back') && <button className="icon-button" aria-label="Indietro" onClick={onBack} disabled={!activeTab?.canGoBack}><ArrowLeft size={17} /></button>}
        {isVisible('forward') && <button className="icon-button" aria-label="Avanti" onClick={onForward} disabled={!activeTab?.canGoForward}><ArrowRight size={17} /></button>}
        {isVisible('reload') && <button className="icon-button" aria-label={activeTab?.loading ? 'Interrompi' : 'Ricarica'} onClick={activeTab?.loading ? onStop : onReload}>
          {activeTab?.loading ? <X size={16} /> : <RotateCw size={16} />}
        </button>}
      </div>

      <form className="address-form" onSubmit={(event) => { event.preventDefault(); onNavigate(); }}>
        {isVisible('privacy') && <button className={`address-security ${secure ? 'secure' : ''} ${privacyOpen ? 'selected' : ''}`} type="button" aria-label="Privacy e permessi del sito" title="Privacy e permessi del sito" aria-expanded={privacyOpen} disabled={!sitePrivacyAvailable} onClick={onTogglePrivacy}>
          {secure ? <LockKeyhole size={14} /> : <Shield size={15} />}
        </button>}
        <input
          ref={inputRef}
          className="address-input"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          placeholder="Cerca su DuckDuckGo o inserisci un indirizzo"
          aria-label="Barra degli indirizzi e ricerca"
          spellCheck={false}
        />
        {isVisible('bookmark') && <button className={`address-bookmark ${isBookmarked ? 'is-bookmarked' : ''}`} type="button" aria-label={isBookmarked ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'} onClick={onBookmark}>
          <Bookmark size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>}
      </form>

      <div className="toolbar-actions">
        {isVisible('incognito') && <button
          className="icon-button toolbar-incognito-button"
          aria-label="Apri una nuova scheda in incognito"
          title="Nuova scheda in incognito"
          onClick={onNewPrivateTab}
        ><EyeOff size={17} /></button>}
        {activeTab?.incognito && <div className="incognito-status" role="status" aria-label="Modalità incognito attiva" title="Stai navigando in incognito">
          <EyeOff size={14} />
          <span>Incognito</span>
        </div>}
        {isVisible('downloads') && <button
          className="icon-button toolbar-download-button"
          aria-label="Download recenti"
          title="Download recenti"
          aria-haspopup="dialog"
          onClick={(event) => void openToolbarPopup('downloads', event.currentTarget)}
        ><ArrowDownToLine size={17} /></button>}
        {isVisible('adBlock') && <>
          <button
            className={`icon-button toolbar-adblock-toggle ${adBlockActive ? 'is-active' : ''} ${sitePrivacy?.adBlockExcluded ? 'is-excluded' : ''}`}
            aria-label="Protezione annunci e tracker"
            aria-pressed={adBlockActive}
            title={adBlockTitle}
            aria-haspopup="dialog"
            onClick={(event) => void openToolbarPopup('adblock', event.currentTarget)}
          >
            {sitePrivacy?.adBlockExcluded ? <ShieldOff size={17} /> : <ShieldCheck size={17} />}
          </button>
        </>}
        {isVisible('extensions') && <>
          <button className="icon-button toolbar-extensions-button" aria-label="Estensioni" title="Estensioni" onClick={onExtensions}><Puzzle size={17} /></button>
          <div className="toolbar-extensions" aria-label="Estensioni installate">
            {extensions.filter((extension) => extension.enabled).map((extension) => (
            <button key={extension.id} className="toolbar-extension" title={extension.name} aria-label={`Apri estensione ${extension.name}`} onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              void window.umbrella.openExtensionPopup(extension.id, { right: bounds.right, bottom: bounds.bottom })
                .then((result) => setToolbarMessage(result.ok ? '' : result.message ?? 'Impossibile aprire l’estensione.'))
                .catch((error: unknown) => {
                  console.error('[Umbrella] Could not open extension popup:', error);
                  setToolbarMessage(error instanceof Error ? error.message : 'Impossibile aprire l’estensione.');
                });
            }}>
              {extension.iconDataUrl
                ? <img src={extension.iconDataUrl} alt="" />
                : <span>{extension.name.slice(0, 1).toUpperCase()}</span>}
            </button>
            ))}
          </div>
        </>}
        <button className="icon-button toolbar-settings-button" aria-label="Impostazioni" onClick={onSettings}><MoreHorizontal size={19} /></button>
      </div>
      {toolbarMessage && <div className="toolbar-extension-message" role="status">{toolbarMessage}</div>}
      {isVisible('performanceMode') && <button
        className={`icon-button performance-mode-toggle ${performanceMode ? 'active' : ''}`}
        aria-label={performanceMode ? 'Disattiva modalità performance' : 'Attiva modalità performance'}
        aria-pressed={performanceMode}
        title={performanceMode ? 'Disattiva modalità performance' : 'Attiva modalità performance'}
        onClick={onTogglePerformanceMode}
      >
        <Gauge size={17} />
      </button>}
      <div className="window-controls">
        <button className="window-control" aria-label="Minimizza" onClick={() => window.umbrella.windowAction('minimize')}><Minus size={14} /></button>
        <button className="window-control" aria-label="Massimizza" onClick={() => window.umbrella.windowAction('maximize')}><Square size={12} /></button>
        <button className="window-control close" aria-label="Chiudi" onClick={() => window.umbrella.windowAction('close')}><X size={15} /></button>
      </div>
    </header>
  );
}
