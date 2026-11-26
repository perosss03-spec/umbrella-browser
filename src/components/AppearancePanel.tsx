import { useState } from 'react';
import { ImagePlus, RotateCcw, X } from 'lucide-react';
import type { BrowserState } from '../../electron/preload';
import type { SidebarItemVisibility, ToolbarItemVisibility } from '../../electron/storage';
import { sidebarVisibilityOptions, toolbarVisibilityOptions } from './customization-options';

type Props = {
  state: BrowserState;
  onSettings: (patch: Partial<BrowserState['settings']>) => void;
  onChooseWallpaper: () => Promise<boolean>;
  onResetWallpaper: () => Promise<boolean>;
  onClose: () => void;
};

const themes = [
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
  { value: 'system', label: 'Sistema' }
] as const;

export default function AppearancePanel({ state, onSettings, onChooseWallpaper, onResetWallpaper, onClose }: Props) {
  const [feedback, setFeedback] = useState('');

  const chooseWallpaper = async () => {
    setFeedback('');
    try {
      await onChooseWallpaper();
    } catch (error) {
      console.error('[Umbrella] Could not choose a customization wallpaper:', error);
      setFeedback('Non è stato possibile cambiare lo sfondo.');
    }
  };

  const resetWallpaper = async () => {
    setFeedback('');
    try {
      const reset = await onResetWallpaper();
      if (!reset) setFeedback('Non è stato possibile ripristinare lo sfondo.');
    } catch (error) {
      console.error('[Umbrella] Could not reset the customization wallpaper:', error);
      setFeedback('Non è stato possibile ripristinare lo sfondo.');
    }
  };

  const updateSidebarItem = (key: keyof SidebarItemVisibility, visible: boolean) => {
    onSettings({ sidebarItems: { ...state.settings.sidebarItems, [key]: visible } });
  };
  const updateToolbarItem = (key: keyof ToolbarItemVisibility, visible: boolean) => {
    onSettings({ toolbarItems: { ...state.settings.toolbarItems, [key]: visible } });
  };

  return (
    <aside className="appearance-panel" aria-label="Personalizzazione Nuova scheda">
      <header className="appearance-panel-header">
        <div><span className="manager-kicker">PERSONALIZZA UMBRELLA</span><h2>Nuova scheda</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi personalizzazione" title="Chiudi"><X size={17} /></button>
      </header>

      <section className="appearance-panel-section">
        <h3>Aspetto</h3>
        <div className="appearance-theme-options" role="group" aria-label="Tema">
          {themes.map(({ value, label }) => <button
            key={value}
            className={state.settings.theme === value ? 'selected' : ''}
            aria-pressed={state.settings.theme === value}
            onClick={() => onSettings({ theme: value })}
          >{label}</button>)}
        </div>
        <label className="setting-field setting-color-field" htmlFor="appearance-accent"><strong>Colore principale</strong><input id="appearance-accent" type="color" value={state.settings.accent} onChange={(event) => onSettings({ accent: event.target.value })} /></label>
        <div className={`appearance-wallpaper-preview ${state.wallpaperUrl ? 'custom' : ''}`} style={state.wallpaperUrl ? { backgroundImage: `linear-gradient(90deg, rgba(10,14,27,.25), rgba(10,14,27,.05)), url("${state.wallpaperUrl}")` } : undefined}>
          <span>{state.wallpaperUrl ? 'SFONDO PERSONALIZZATO' : 'SFONDO UMBRELLA'}</span>
        </div>
        <div className="appearance-button-row">
          <button className="button-quiet" onClick={() => void chooseWallpaper()}><ImagePlus size={14} /> Cambia sfondo</button>
          {state.wallpaperUrl && <button className="button-quiet" onClick={() => void resetWallpaper()} aria-label="Ripristina sfondo"><RotateCcw size={14} /></button>}
        </div>
      </section>

      <section className="appearance-panel-section">
        <h3>Orologio</h3>
        <label className="setting-toggle"><span><strong>Mostra orologio</strong></span><input type="checkbox" checked={state.settings.startPageClockVisible} onChange={(event) => onSettings({ startPageClockVisible: event.target.checked })} /><i /></label>
        <label className="setting-field" htmlFor="appearance-clock-position"><strong>Posizione</strong><select id="appearance-clock-position" value={state.settings.startPageClockPosition} disabled={!state.settings.startPageClockVisible} onChange={(event) => {
          const value = event.target.value;
          if (value === 'center' || value === 'top-left' || value === 'top-right') onSettings({ startPageClockPosition: value });
        }}>
          <option value="center">Centrato</option><option value="top-left">In alto a sinistra</option><option value="top-right">In alto a destra</option>
        </select></label>
        <label className="setting-field setting-color-field" htmlFor="appearance-clock-color"><strong>Colore dell’orologio</strong><input id="appearance-clock-color" type="color" value={state.settings.startPageClockColor} disabled={!state.settings.startPageClockVisible} onChange={(event) => onSettings({ startPageClockColor: event.target.value })} /></label>
      </section>

      <section className="appearance-panel-section">
        <h3>Testo e scorciatoie</h3>
        <label className="setting-toggle"><span><strong>Mostra il messaggio</strong></span><input type="checkbox" checked={state.settings.startPageFooterVisible} onChange={(event) => onSettings({ startPageFooterVisible: event.target.checked })} /><i /></label>
        <label className="setting-field" htmlFor="appearance-footer-text"><strong>Testo del messaggio</strong><input id="appearance-footer-text" type="text" maxLength={160} value={state.settings.startPageFooterText} disabled={!state.settings.startPageFooterVisible} onChange={(event) => onSettings({ startPageFooterText: event.target.value })} /></label>
        <label className="setting-toggle"><span><strong>Mostra le scorciatoie</strong></span><input type="checkbox" checked={state.settings.startPageShortcutsVisible} onChange={(event) => onSettings({ startPageShortcutsVisible: event.target.checked })} /><i /></label>
      </section>

      <details className="appearance-panel-section appearance-toolbar-options">
        <summary>Barra degli strumenti</summary>
        <label className="setting-toggle"><span><strong>Barra laterale compatta</strong></span><input type="checkbox" checked={state.settings.sidebarCompact} onChange={(event) => onSettings({ sidebarCompact: event.target.checked })} /><i /></label>
        <label className="setting-toggle"><span><strong>Angoli arrotondati della pagina</strong></span><input type="checkbox" checked={state.settings.pageCornersRounded} onChange={(event) => onSettings({ pageCornersRounded: event.target.checked })} /><i /></label>
        <h4>Voci della barra laterale</h4>
        {sidebarVisibilityOptions.map(({ key, label }) => <label className="setting-toggle" key={key}><span><strong>{label}</strong></span><input type="checkbox" checked={state.settings.sidebarItems[key]} onChange={(event) => updateSidebarItem(key, event.target.checked)} /><i /></label>)}
        <h4>Pulsanti della barra superiore</h4>
        {toolbarVisibilityOptions.map(({ key, label }) => <label className="setting-toggle" key={key}><span><strong>{label}</strong></span><input type="checkbox" checked={state.settings.toolbarItems[key]} onChange={(event) => updateToolbarItem(key, event.target.checked)} /><i /></label>)}
      </details>

      {feedback && <small className="appearance-feedback" role="status">{feedback}</small>}
    </aside>
  );
}
