import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpRight, Bookmark, Check, Clock3, Download,
  ExternalLink, FileDown, FileUp, FolderOpen, ImagePlus, Pause, Play,
  Puzzle, RefreshCw, Search, Settings2, ShieldCheck, Trash2, X
} from 'lucide-react';
import type { BrowserState, DefaultBrowserResult } from '../../electron/preload';
import UpdateCard from './UpdateCard';

type Panel = 'bookmarks' | 'history' | 'downloads' | 'extensions' | 'settings';
type Props = {
  panel: Panel;
  state: BrowserState;
  onOpen: (url: string) => void;
  onSettings: (patch: Partial<BrowserState['settings']>) => void;
  onClearHistory: () => void;
  onChooseWallpaper: () => void;
  onResetWallpaper: () => void;
  onAddExtension: () => Promise<{ ok: boolean; message: string }> ;
  onSetExtensionEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  onRemoveExtension: (id: string) => Promise<boolean>;
  onOpenBrowserImport: () => void;
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};
const formatDate = (value: number) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function ManagerPanel({ panel, state, onOpen, onSettings, onClearHistory, onChooseWallpaper, onResetWallpaper, onAddExtension, onSetExtensionEnabled, onRemoveExtension, onOpenBrowserImport }: Props) {
  const [search, setSearch] = useState('');
  const [extensionFeedback, setExtensionFeedback] = useState('');
  const [installingExtension, setInstallingExtension] = useState(false);
  const [bookmarkFeedback, setBookmarkFeedback] = useState('');
  const [defaultBrowserStatus, setDefaultBrowserStatus] = useState<DefaultBrowserResult | null>(null);
  const [defaultBrowserFeedback, setDefaultBrowserFeedback] = useState('');
  const [defaultBrowserBusy, setDefaultBrowserBusy] = useState(false);
  const [discordClientId, setDiscordClientId] = useState(state.settings.discordClientId);
  const [discordFeedback, setDiscordFeedback] = useState('');
  const bookmarks = useMemo(() => state.bookmarks.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(search.toLowerCase())), [state.bookmarks, search]);
  const history = useMemo(() => state.history.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(search.toLowerCase())), [state.history, search]);
  const downloads = state.downloads;

  useEffect(() => {
    setDiscordClientId(state.settings.discordClientId);
  }, [state.settings.discordClientId]);

  useEffect(() => {
    if (panel !== 'settings') return;
    let active = true;
    void window.umbrella.checkDefaultBrowser().then((result) => {
      if (active) setDefaultBrowserStatus(result);
    }).catch((error) => {
      console.error('[Umbrella] Could not check default browser:', error);
      if (active) setDefaultBrowserFeedback('Non è stato possibile verificare il browser predefinito.');
    });
    return () => { active = false; };
  }, [panel]);

  const openDefaultBrowserSettings = async () => {
    setDefaultBrowserBusy(true);
    setDefaultBrowserFeedback('');
    try {
      const result = await window.umbrella.setDefaultBrowser();
      setDefaultBrowserStatus(result);
      setDefaultBrowserFeedback(result.isDefault
        ? 'Umbrella è già il browser predefinito.'
        : result.settingsOpened
          ? 'Nelle Impostazioni di Windows seleziona Umbrella per HTTP e HTTPS, poi torna qui e verifica.'
          : result.message || 'Non è stato possibile aprire le Impostazioni di Windows.');
    } catch (error) {
      console.error('[Umbrella] Could not open default browser settings:', error);
      setDefaultBrowserFeedback('Non è stato possibile aprire le Impostazioni di Windows.');
    } finally {
      setDefaultBrowserBusy(false);
    }
  };

  const verifyDefaultBrowser = async () => {
    setDefaultBrowserBusy(true);
    setDefaultBrowserFeedback('');
    try {
      const result = await window.umbrella.checkDefaultBrowser();
      setDefaultBrowserStatus(result);
      setDefaultBrowserFeedback(result.isDefault
        ? 'Umbrella è il browser predefinito.'
        : 'Windows non ha ancora assegnato entrambi i protocolli HTTP e HTTPS a Umbrella.');
    } catch (error) {
      console.error('[Umbrella] Could not verify default browser:', error);
      setDefaultBrowserFeedback('Non è stato possibile verificare il browser predefinito.');
    } finally {
      setDefaultBrowserBusy(false);
    }
  };

  const saveDiscordClientId = () => {
    const clientId = discordClientId.trim();
    if (clientId && !/^\d{17,20}$/.test(clientId)) {
      setDiscordFeedback('L’ID applicazione Discord deve contenere da 17 a 20 cifre.');
      return;
    }
    onSettings({
      discordClientId: clientId,
      discordActivityEnabled: clientId ? state.settings.discordActivityEnabled : false
    });
    setDiscordFeedback(clientId ? 'ID applicazione salvato.' : 'ID rimosso; attività Discord disattivata.');
  };

  const openDiscordDeveloperPortal = async () => {
    try {
      const opened = await window.umbrella.openDiscordDeveloperPortal();
      if (!opened) setDiscordFeedback('Non è stato possibile aprire il Discord Developer Portal.');
    } catch (error) {
      console.error('[Umbrella] Could not open the Discord Developer Portal:', error);
      setDiscordFeedback('Non è stato possibile aprire il Discord Developer Portal.');
    }
  };

  const importBookmarks = async () => {
    try {
      const result = await window.umbrella.importBookmarks();
      setBookmarkFeedback(result.message);
    } catch (error) {
      console.error('[Umbrella] Could not import bookmarks:', error);
      setBookmarkFeedback('Importazione dei preferiti non riuscita.');
    }
  };

  if (panel === 'settings') return (
    <main className="manager-page settings-page">
      <div className="manager-header"><div className="manager-icon"><Settings2 size={18} /></div><div><span className="manager-kicker">PERSONALIZZA</span><h1>Impostazioni</h1><p>Umbrella, come piace a te.</p></div></div>
      <div className="settings-grid">
        <section className="settings-card"><div className="settings-card-title"><span>Aspetto</span><span>01</span></div><h3>Il tuo tema</h3><p>Scegli l'aspetto del browser e delle ricerche DuckDuckGo.</p>
          <div className="theme-options">
            {(['dark', 'light', 'system'] as const).map((theme) => <button key={theme} className={`theme-option ${state.settings.theme === theme ? 'selected' : ''}`} onClick={() => onSettings({ theme })}>
              <span className={`theme-preview ${theme}`}><i /><i /></span><span>{theme === 'dark' ? 'Scuro' : theme === 'light' ? 'Chiaro' : 'Sistema'}</span>{state.settings.theme === theme && <Check size={14} />}
            </button>)}
          </div>
        </section>
        <section className="settings-card"><div className="settings-card-title"><span>Wallpaper</span><span>02</span></div><h3>Il tuo sfondo</h3><p>Personalizza la Nuova scheda con una tua immagine. Puoi cambiarla o tornare allo sfondo neutro.</p>
          <div className={`wallpaper-preview ${state.wallpaperUrl ? 'custom' : ''}`} style={state.wallpaperUrl ? { backgroundImage: `linear-gradient(90deg, rgba(10,14,27,.25), rgba(10,14,27,.05)), url("${state.wallpaperUrl}")` } : undefined}><span>{state.wallpaperUrl ? 'SFONDO PERSONALIZZATO' : 'SFONDO UMBRELLA'}</span></div>
          <div className="settings-button-row"><button className="button-primary" onClick={onChooseWallpaper}><ImagePlus size={15} /> Cambia sfondo</button>{state.wallpaperUrl && <button className="button-quiet" onClick={onResetWallpaper}>Rimuovi</button>}</div>
          <small className="setting-note">JPG, PNG, WEBP o GIF · massimo 30 MB · salvato sul dispositivo</small>
        </section>
        <section className="settings-card"><div className="settings-card-title"><span>Esperienza</span><span>03</span></div><h3>All'avvio</h3><p>Riprendi la navigazione da dove avevi lasciato.</p>
          <label className="setting-toggle"><span><strong>Ripristina le schede</strong><small>Riapri le schede normali dopo la chiusura.</small></span><input type="checkbox" checked={state.settings.restoreSession} onChange={(e) => onSettings({ restoreSession: e.target.checked })} /><i /></label>
          <label className="setting-field" htmlFor="tab-suspend-time"><strong>Sospensione automatica delle schede inattive</strong><select id="tab-suspend-time" value={state.settings.tabSuspendAfterMinutes} onChange={(event) => onSettings({ tabSuspendAfterMinutes: Number(event.target.value) })}>
            <option value={0}>Mai</option><option value={5}>Dopo 5 minuti</option><option value={15}>Dopo 15 minuti</option><option value={30}>Dopo 30 minuti</option><option value={60}>Dopo 60 minuti</option>
          </select></label>
          <small className="setting-note">Le schede inattive vengono scaricate dalla memoria e ricaricate quando le riapri. Eventuali dati non salvati nei moduli della pagina potrebbero andare persi.</small>
        </section>
        <section className="settings-card"><div className="settings-card-title"><span>Browser predefinito</span><span>04</span></div><h3>{defaultBrowserStatus?.isDefault ? 'Umbrella è il browser predefinito' : 'Apri i link con Umbrella'}</h3><p>Windows richiede una conferma esplicita per i protocolli web. Puoi avviare la procedura anche dopo aver completato la configurazione iniziale.</p>
          <div className="settings-button-row"><button className="button-primary" onClick={() => void openDefaultBrowserSettings()} disabled={defaultBrowserBusy}><Settings2 size={15} /> {defaultBrowserBusy ? 'Apertura…' : 'Apri impostazioni Windows'}</button><button className="button-quiet" onClick={() => void verifyDefaultBrowser()} disabled={defaultBrowserBusy}><ShieldCheck size={14} /> Verifica</button></div>
          {defaultBrowserFeedback && <small className="setting-note" role="status">{defaultBrowserFeedback}</small>}
        </section>
        <section className="settings-card"><div className="settings-card-title"><span>Download</span><span>05</span></div><h3>Gestione file</h3><p>Personalizza il comportamento dei download.</p>
          <label className="setting-toggle"><span><strong>Chiedi dove salvare</strong><small>Mostra la finestra di scelta prima di scaricare.</small></span><input type="checkbox" checked={state.settings.askDownloadLocation} onChange={(e) => onSettings({ askDownloadLocation: e.target.checked })} /><i /></label>
          <label className="setting-toggle"><span><strong>Notifiche di completamento</strong><small>Mostra feedback quando un download termina.</small></span><input type="checkbox" checked={state.settings.downloadNotifications} onChange={(e) => onSettings({ downloadNotifications: e.target.checked })} /><i /></label>
        </section>
        <section className="settings-card"><div className="settings-card-title"><span>Protezione</span><span>06</span></div><h3>Blocco annunci integrato</h3><p>Filtra richieste pubblicitarie e tracker nelle pagine web.</p>
          <label className="setting-toggle"><span><strong>Ad blocker</strong><small>{state.settings.adBlockEnabled ? state.adBlockReady ? 'Filtri attivi nelle sessioni del browser.' : state.adBlockError ? 'Filtri non caricati: controlla la connessione.' : 'Caricamento dei filtri in corso…' : 'Blocco annunci disattivato.'}</small></span><input type="checkbox" checked={state.settings.adBlockEnabled} onChange={(e) => onSettings({ adBlockEnabled: e.target.checked })} /><i /></label>
          <small className="setting-note">I filtri pubblicitari e anti-tracker vengono scaricati al primo avvio e conservati localmente. Gestisci i permessi e le eccezioni per il sito corrente con l’icona a sinistra della barra degli indirizzi.</small>
        </section>
        <section className="settings-card"><div className="settings-card-title"><span>Privacy</span><span>07</span></div><h3>Dati di navigazione</h3><p>Cookie, cache e dati salvati dai siti web.</p>
          <div className="settings-action-row"><span><ShieldCheck size={17} /> Gestisci i dati dei siti</span><button className="button-quiet" onClick={() => void window.umbrella.clearBrowsingData()}>Cancella dati</button></div>
        </section>
        <section className="settings-card"><div className="settings-card-title"><span>Trasferimento dati</span><span>08</span></div><h3>Importa da un altro browser</h3><p>Rileva i browser e i profili presenti su questo PC. Puoi trasferire preferiti e cronologia da Chrome, Edge, Firefox, Brave, Opera, Vivaldi e altri profili compatibili.</p>
          <div className="settings-button-row"><button className="button-primary" onClick={onOpenBrowserImport}><FileUp size={15} /> Importa dati</button><button className="button-quiet" onClick={() => void window.umbrella.exportBookmarks()}><FileDown size={15} /> Esporta preferiti</button></div>
          <div className="settings-button-row"><button className="button-quiet" onClick={() => void importBookmarks()}><FileUp size={14} /> Importa file HTML / JSON</button></div>
          {bookmarkFeedback && <small className="setting-note" role="status">{bookmarkFeedback}</small>}
        </section>
        <section className="settings-card"><div className="settings-card-title"><span>Discord Activity</span><span>09</span></div><h3>Mostra Umbrella su Discord</h3><p>Mostra sul tuo profilo che stai usando Umbrella. Non vengono condivisi i siti visitati o i titoli delle schede.</p>
          <label className="setting-field" htmlFor="discord-client-id"><strong>ID applicazione Discord</strong><input id="discord-client-id" type="text" inputMode="numeric" autoComplete="off" maxLength={20} value={discordClientId} onChange={(event) => { setDiscordClientId(event.target.value); setDiscordFeedback(''); }} placeholder="Es. 123456789012345678" /></label>
          <div className="settings-button-row"><button className="button-primary" onClick={saveDiscordClientId}>Salva ID</button><button className="button-quiet" onClick={() => void openDiscordDeveloperPortal()}><ExternalLink size={14} /> Developer Portal</button></div>
          {discordFeedback && <small className="setting-note" role="status">{discordFeedback}</small>}
          <label className="setting-toggle"><span><strong>Attività Discord</strong><small>{state.settings.discordActivityEnabled ? 'Umbrella proverà a mostrare la presenza quando Discord è aperto.' : 'Inserisci e salva un ID applicazione per attivarla.'}</small></span><input type="checkbox" checked={state.settings.discordActivityEnabled} disabled={!/^\d{17,20}$/.test(state.settings.discordClientId)} onChange={(event) => onSettings({ discordActivityEnabled: event.target.checked })} /><i /></label>
          <small className="setting-note">Crea un’applicazione nel Discord Developer Portal e copia il suo Application ID. Discord deve essere aperto sul computer perché l’attività sia visibile.</small>
          <small className="setting-note">Per mostrare il logo, carica <code>umbrella-icon.png</code> (nella cartella <code>resources</code> accanto a Umbrella.exe) in Rich Presence → Art Assets nel Developer Portal e usa la chiave <code>umbrella</code>.</small>
        </section>
        <UpdateCard />
        <section className="settings-card about-card"><div className="settings-card-title"><span>Informazioni</span><span>11</span></div><div className="about-brand"><div><strong>UMBRELLA</strong><small>Versione {state.appVersion} · Chromium / Electron</small></div></div><p>Un browser indipendente, progettato per lasciare spazio a ciò che conta.</p></section>
      </div>
    </main>
  );

  if (panel === 'extensions') return (
    <main className="manager-page extensions-page">
      <div className="manager-header"><div className="manager-icon"><Puzzle size={18} /></div><div><span className="manager-kicker">PERSONALIZZA IL BROWSER</span><h1>Estensioni</h1><p>Aggiungi strumenti compatibili con Chromium e gestiscili da qui.</p></div><span className="manager-total">{state.extensions.length} installate</span></div>
      <section className="settings-card extensions-install-card">
        <div className="extensions-install-copy"><span className="extension-feature-icon"><Puzzle size={19} /></span><div><h3>Installa un’estensione</h3><p>Seleziona la cartella di un’estensione Chromium Manifest V3 già estratta, contenente manifest.json.</p></div></div>
        <button className="button-primary" disabled={installingExtension} onClick={async () => { setInstallingExtension(true); try { const result = await onAddExtension(); setExtensionFeedback(result.message); } catch { setExtensionFeedback('Installazione non riuscita.'); } finally { setInstallingExtension(false); } }}><Puzzle size={15} /> {installingExtension ? 'Installazione…' : 'Aggiungi estensione'}</button>
        {extensionFeedback && <div className="extension-feedback">{extensionFeedback}</div>}
        <small className="setting-note">Nota: sono accettate cartelle Manifest V3 già estratte (non file .crx). Electron supporta solo una parte delle API Chrome: non tutte le estensioni del Web Store funzionano e le estensioni non sono disponibili nelle schede private.</small>
      </section>
      <div className="extensions-list">
        {state.extensions.length ? state.extensions.map((extension) => <article className="extension-row" key={extension.id}>
          <span className="extension-feature-icon"><Puzzle size={17} /></span>
          <div className="extension-meta"><strong>{extension.name}</strong><small>Versione {extension.version} · {extension.enabled ? 'Attiva' : 'Disattivata'}</small></div>
          <label className="extension-toggle" title={extension.enabled ? 'Disattiva estensione' : 'Attiva estensione'}><input type="checkbox" checked={extension.enabled} onChange={(e) => void onSetExtensionEnabled(extension.id, e.target.checked)} /><i /></label>
          <button className="icon-button danger-hover" title="Rimuovi estensione" aria-label={`Rimuovi ${extension.name}`} onClick={() => void onRemoveExtension(extension.id)}><X size={15} /></button>
        </article>) : <div className="empty-state"><span><Puzzle size={20} /></span><strong>Nessuna estensione installata</strong><p>Aggiungi una cartella di estensione compatibile per iniziare.</p></div>}
      </div>
    </main>
  );

  const headings = {
    bookmarks: { title: 'Preferiti', caption: 'I siti che vuoi tenere a portata di mano.', icon: Bookmark, count: state.bookmarks.length },
    history: { title: 'Cronologia', caption: 'Le tue visite recenti su questo dispositivo.', icon: Clock3, count: state.history.length },
    downloads: { title: 'Download', caption: 'File scaricati e trasferimenti in corso.', icon: Download, count: downloads.length }
  } as const;
  const config = headings[panel];
  const Icon = config.icon;

  return (
    <main className="manager-page">
      <div className="manager-header"><div className="manager-icon"><Icon size={18} /></div><div><span className="manager-kicker">LA TUA LIBRERIA</span><h1>{config.title}</h1><p>{config.caption}</p></div><span className="manager-total">{config.count} elementi</span></div>
      {panel !== 'downloads' && <div className="manager-toolbar"><div className="manager-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Cerca ${panel === 'history' ? 'nella cronologia' : 'nei preferiti'}...`} /></div>
        {panel === 'history' && <button className="button-quiet danger-quiet" onClick={onClearHistory}><Trash2 size={14} /> Cancella cronologia</button>}
      </div>}

      {panel === 'bookmarks' && <div className="manager-list">
        {bookmarks.length ? bookmarks.map((item) => <div className="manager-row" key={item.id}>
          <span className="manager-favicon"><Search size={17} /></span><button className="manager-row-main" onClick={() => onOpen(item.url)}><strong>{item.title}</strong><small>{item.url}</small></button>
          <button className="icon-button" title="Apri in una nuova scheda" onClick={() => onOpen(item.url)}><ArrowUpRight size={16} /></button>
          <button className="icon-button danger-hover" title="Rimuovi preferito" onClick={() => void window.umbrella.removeBookmark(item.id)}><X size={15} /></button>
        </div>) : <Empty icon={<Bookmark size={20} />} title="Nessun preferito trovato" detail="Aggiungi i siti che visiti più spesso con l'icona a forma di segnalibro." />}
      </div>}

      {panel === 'history' && <div className="manager-list">
        {history.length ? history.map((item) => <div className="manager-row" key={item.id}>
          <span className="manager-favicon"><Clock3 size={16} /></span><button className="manager-row-main" onClick={() => onOpen(item.url)}><strong>{item.title}</strong><small>{item.url}</small></button>
          <span className="history-date">{formatDate(item.visitedAt)}</span>
          <button className="icon-button danger-hover" title="Rimuovi voce" onClick={() => void window.umbrella.removeHistory(item.id)}><X size={15} /></button>
        </div>) : <Empty icon={<Clock3 size={20} />} title="La cronologia è vuota" detail="Le pagine visitate appariranno qui. La navigazione privata non viene registrata." />}
      </div>}

      {panel === 'downloads' && <div className="manager-list downloads-list">
        {downloads.length ? [...downloads].reverse().map((item) => {
          const percent = item.totalBytes > 0 ? Math.min(100, (item.receivedBytes / item.totalBytes) * 100) : 0;
          const complete = item.state === 'completed';
          const failed = item.state === 'interrupted';
          return <div className="download-row" key={item.id}>
            <div className="download-file-icon"><Download size={18} /></div>
            <div className="download-info"><strong>{item.filename}</strong><small>{item.state === 'progressing' ? `${formatBytes(item.receivedBytes)} di ${formatBytes(item.totalBytes)}` : item.state === 'completed' ? `Completato · ${formatBytes(item.receivedBytes)}` : failed ? 'Download non riuscito' : item.state}</small>
              {!complete && !failed && <div className="download-progress"><span style={{ width: `${percent}%` }} /></div>}
            </div>
            <div className="download-actions">
              {item.state === 'progressing' && <button className="icon-button" aria-label={item.paused ? 'Riprendi' : 'Pausa'} onClick={() => void window.umbrella.downloadAction(item.id, item.paused ? 'resume' : 'pause')}>{item.paused ? <Play size={15} /> : <Pause size={15} />}</button>}
              {complete && <><button className="icon-button" title="Apri file" onClick={() => void window.umbrella.downloadAction(item.id, 'open')}><ArrowUpRight size={15} /></button><button className="icon-button" title="Mostra nella cartella" onClick={() => void window.umbrella.downloadAction(item.id, 'show')}><FolderOpen size={15} /></button></>}
              {!complete && !failed && <button className="icon-button danger-hover" title="Annulla" onClick={() => void window.umbrella.downloadAction(item.id, 'cancel')}><X size={15} /></button>}
              {failed && <RefreshCw size={15} className="muted-icon" />}
            </div>
          </div>;
        }) : <Empty icon={<Download size={20} />} title="Nessun download" detail="Quando scarichi un file, il trasferimento apparirà qui." />}
      </div>}
    </main>
  );
}

function Empty({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{detail}</p></div>;
}
