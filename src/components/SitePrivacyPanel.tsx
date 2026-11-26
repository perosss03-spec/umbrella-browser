import { useState } from 'react';
import { Shield, ShieldOff, X } from 'lucide-react';
import type { SitePrivacyState } from '../../electron/preload';
import type { SitePermissionName } from '../../electron/storage';

type Props = {
  state: SitePrivacyState;
  onClose: () => void;
  onPermissionChange: (permission: SitePermissionName, allowed: boolean | null) => Promise<boolean>;
  onAdBlockChange: (excluded: boolean) => Promise<boolean>;
};

const permissionLabels: Record<SitePermissionName, string> = {
  media: 'Fotocamera e microfono',
  geolocation: 'Posizione',
  notifications: 'Notifiche',
  'clipboard-read': 'Lettura appunti',
  midiSysex: 'Dispositivi MIDI'
};
const permissionNames = Object.keys(permissionLabels) as SitePermissionName[];

export default function SitePrivacyPanel({ state, onClose, onPermissionChange, onAdBlockChange }: Props) {
  const [feedback, setFeedback] = useState('');
  const blockedCount = state.blockedRequestCount;

  const updatePermission = async (permission: SitePermissionName, value: string) => {
    try {
      const saved = await onPermissionChange(permission, value === 'ask' ? null : value === 'allow');
      setFeedback(saved ? '' : 'Impossibile aggiornare il permesso. Riprova sul sito attivo.');
    } catch (error) {
      console.error('[Umbrella] Could not update site permission:', error);
      setFeedback('Impossibile aggiornare il permesso.');
    }
  };

  const updateAdBlock = async (excluded: boolean) => {
    try {
      const saved = await onAdBlockChange(excluded);
      setFeedback(saved ? '' : 'Impossibile aggiornare l’eccezione del sito.');
    } catch (error) {
      console.error('[Umbrella] Could not update site ad-block exception:', error);
      setFeedback('Impossibile aggiornare l’eccezione del sito.');
    }
  };

  return (
    <aside className="site-privacy-panel" role="dialog" aria-label="Privacy e permessi del sito">
      <header className="site-privacy-header">
        <span className="site-privacy-icon"><Shield size={17} /></span>
        <div><strong>Privacy del sito</strong><small>{state.origin}</small></div>
        <button className="icon-button" aria-label="Chiudi pannello privacy" onClick={onClose}><X size={16} /></button>
      </header>

      <section className="site-privacy-section">
        <h3>Protezione da tracker</h3>
        <label className="setting-toggle site-privacy-adblock">
          <span><strong>Blocco annunci e tracker</strong><small>{state.adBlockEnabled ? state.adBlockExcluded ? 'Escluso per questo sito' : 'Attivo per questo sito' : 'Blocco globale disattivato'}</small></span>
          <input
            type="checkbox"
            checked={state.adBlockEnabled && !state.adBlockExcluded}
            disabled={!state.adBlockEnabled}
            onChange={(event) => void updateAdBlock(!event.target.checked)}
          /><i />
        </label>
        <p className="site-privacy-note">La modifica può richiedere il ricaricamento della pagina.</p>
        <div className="tracker-summary"><ShieldOff size={15} /><strong>{blockedCount}</strong><span>richieste bloccate</span></div>
        {state.blockedTrackers.length
          ? <ul className="tracker-list">{state.blockedTrackers.map(({ hostname, count }) => <li key={hostname}><span>{hostname}</span><small>{count}</small></li>)}</ul>
          : <p className="site-privacy-empty">Nessun tracker bloccato rilevato in questa sessione.</p>}
        <p className="site-privacy-note">Conteggi temporanei e locali; non vengono inviati.</p>
      </section>

      <section className="site-privacy-section">
        <h3>Permessi</h3>
        <div className="site-permission-list">
          {permissionNames.map((permission) => {
            const value = state.permissions[permission];
            return <label className="site-permission-row" key={permission}>
              <span>{permissionLabels[permission]}</span>
              <select aria-label={`Permesso: ${permissionLabels[permission]}`} value={value === undefined ? 'ask' : value ? 'allow' : 'block'} onChange={(event) => void updatePermission(permission, event.target.value)}>
                <option value="ask">Chiedi</option>
                <option value="allow">Consenti</option>
                <option value="block">Blocca</option>
              </select>
            </label>;
          })}
        </div>
        <p className="site-privacy-note">Le modifiche valgono per questa origine. Un sito già aperto potrebbe dover essere ricaricato.</p>
      </section>
      {feedback && <p className="site-privacy-feedback" role="status">{feedback}</p>}
    </aside>
  );
}
