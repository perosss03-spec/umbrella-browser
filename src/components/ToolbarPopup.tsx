import { useEffect, useState } from 'react';
import { ArrowUpRight, ShieldCheck, ShieldOff, X } from 'lucide-react';
import type { BrowserState, DownloadInfo, ToolbarPopupKind } from '../../electron/preload';

type Props = { kind: ToolbarPopupKind };

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = new Intl.NumberFormat('it-IT', { maximumFractionDigits: index ? 1 : 0 })
    .format(bytes / Math.pow(1024, index));
  return `${amount} ${units[index]}`;
}

function formatRemainingTime(seconds: number) {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes ? `${hours} ore e ${minutes} min` : `${hours} ore`;
  }
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.max(1, seconds)} sec`;
}

function downloadStatus(download: DownloadInfo) {
  if (download.state === 'completed') return `Completato · ${formatBytes(download.receivedBytes)}`;
  if (download.state === 'cancelled') return 'Annullato';
  if (download.state === 'interrupted') return 'Download interrotto';
  if (download.paused) return `${formatBytes(download.receivedBytes)} · In pausa`;
  const size = download.totalBytes > 0
    ? `${formatBytes(download.receivedBytes)} / ${formatBytes(download.totalBytes)}`
    : `${formatBytes(download.receivedBytes)} scaricati`;
  const remaining = download.remainingSeconds === null
    ? 'Calcolo tempo rimanente…'
    : `${formatRemainingTime(download.remainingSeconds)} rimanenti`;
  return `${size} · ${remaining}`;
}

export default function ToolbarPopup({ kind }: Props) {
  const [state, setState] = useState<BrowserState | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    let receivedState = false;
    const unsubscribe = window.umbrella.onState((nextState) => {
      receivedState = true;
      setState(nextState);
    });
    void window.umbrella.getState().then((nextState) => {
      if (active && !receivedState) setState(nextState);
    }).catch((error: unknown) => {
      console.error('[Umbrella] Could not load toolbar popup state:', error);
      if (active) setMessage('Impossibile caricare le informazioni.');
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void window.umbrella.closeToolbarPopup();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state?.settings.theme ?? 'dark';
    document.documentElement.style.setProperty('--accent', state?.settings.accent ?? '#8299ff');
  }, [state?.settings.theme, state?.settings.accent]);

  const close = () => {
    void window.umbrella.closeToolbarPopup().catch((error: unknown) => {
      console.error('[Umbrella] Could not close toolbar popup:', error);
      setMessage('Impossibile chiudere il menu.');
    });
  };

  const sitePrivacy = state?.sitePrivacy;
  const downloads = [...(state?.downloads ?? [])].reverse().slice(0, 5);
  const toggleSiteProtection = async () => {
    if (!sitePrivacy?.origin) return;
    try {
      const saved = await window.umbrella.setSiteAdBlockExcluded(
        sitePrivacy.origin,
        !sitePrivacy.adBlockExcluded
      );
      if (!saved) setMessage('Impossibile modificare la protezione per questo sito.');
    } catch (error) {
      console.error('[Umbrella] Could not toggle site ad blocking:', error);
      setMessage('Impossibile modificare la protezione per questo sito.');
    }
  };

  return (
    <main className="toolbar-popup-root">
      <header className="toolbar-popup-header">
        <strong>{kind === 'downloads' ? 'Download recenti' : 'Protezione del sito'}</strong>
        <button className="icon-button" aria-label="Chiudi menu" onClick={close}><X size={15} /></button>
      </header>

      {kind === 'downloads' ? <>
        {downloads.length
          ? <div className="download-popover-list">{downloads.map((download) => {
            const progress = download.totalBytes > 0
              ? Math.min(100, Math.round((download.receivedBytes / download.totalBytes) * 100))
              : 0;
            return <div className="download-popover-item" key={download.id}>
              <strong title={download.filename}>{download.filename}</strong>
              <small>{downloadStatus(download)}</small>
              {download.state === 'progressing' && <div className="download-progress-track" aria-label={`${progress}% scaricato`}>
                <span style={{ width: `${progress}%` }} />
              </div>}
            </div>;
          })}</div>
          : <p className="download-popover-empty">Nessun download recente.</p>}
        <button className="download-history-link" onClick={() => {
          void window.umbrella.openDownloadsHistory().then((opened) => {
            if (!opened) setMessage('Impossibile aprire la cronologia dei download.');
          }).catch((error: unknown) => {
            console.error('[Umbrella] Could not open download history:', error);
            setMessage('Impossibile aprire la cronologia dei download.');
          });
        }}>Cronologia dei download completa <ArrowUpRight size={14} /></button>
      </> : <>
        <div className="toolbar-popup-site">
          {sitePrivacy?.origin
            ? new URL(sitePrivacy.origin).hostname
            : state?.tabs.find((tab) => tab.id === state.activeTabId)?.incognito
              ? 'Scheda privata'
              : 'Nessun sito aperto'}
        </div>
        <div className="adblock-count">
          <strong>{(sitePrivacy?.blockedRequestCount ?? 0).toLocaleString('it-IT')}</strong>
          <span>richieste pubblicitarie e tracker bloccate</span>
        </div>
        <p className="adblock-popover-note">
          {sitePrivacy?.origin
            ? 'Conteggio temporaneo per questo sito.'
            : state?.tabs.find((tab) => tab.id === state.activeTabId)?.incognito
              ? 'Il conteggio per sito non è disponibile nelle schede private.'
              : 'Apri un sito per vedere il conteggio.'}
        </p>
        {sitePrivacy?.adBlockEnabled
          ? <button
            className={`adblock-site-action ${sitePrivacy.adBlockExcluded ? 'is-excluded' : ''}`}
            disabled={!sitePrivacy.origin}
            onClick={() => void toggleSiteProtection()}
          >{sitePrivacy.adBlockExcluded ? <><ShieldCheck size={14} /> Riattiva protezione su questo sito</> : <><ShieldOff size={14} /> Disattiva protezione su questo sito</>}</button>
          : <p className="adblock-popover-note">Il blocco globale è disattivato nelle impostazioni.</p>}
      </>}

      {message && <p className="toolbar-popup-message" role="status">{message}</p>}
    </main>
  );
}
