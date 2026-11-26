import { useEffect, useState } from 'react';
import {
  Bookmark, CirclePlus, Clock3, CloudDownload, PanelLeftClose, PanelLeftOpen,
  Pause, Search, Settings2, Volume2, X
} from 'lucide-react';
import type { TabInfo } from '../../electron/preload';

type Panel = 'home' | 'bookmarks' | 'history' | 'downloads' | 'extensions' | 'settings';
type SidebarPanel = Exclude<Panel, 'extensions'>;
type Props = {
  tabs: TabInfo[];
  activeTabId: string;
  version: string;
  panel: Panel;
  expanded: boolean;
  onToggleExpanded: () => void;
  onNewTab: () => void;
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onMoveTab: (id: string, index: number) => void;
  onTabContextMenu: (id: string, x: number, y: number) => void;
  onPanel: (panel: SidebarPanel) => void;
};

function TabFavicon({ tab }: { tab: TabInfo }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [tab.faviconUrl]);
  if (tab.suspended) return <Pause size={14} strokeWidth={2} />;
  if (tab.loading) return <span className="mini-spinner" />;
  if (tab.faviconUrl && !failed) {
    return <img className="tab-favicon-image" src={tab.faviconUrl} alt="" onError={() => setFailed(true)} />;
  }
  if (tab.isNewTab || !tab.url) {
    return <Search size={15} strokeWidth={1.7} />;
  }
  return <Search size={15} strokeWidth={1.7} />;
}

export default function Sidebar(props: Props) {
  const [dragged, setDragged] = useState<string | null>(null);
  const { tabs, activeTabId, version, panel, expanded, onToggleExpanded, onNewTab, onSwitchTab, onCloseTab, onMoveTab, onTabContextMenu, onPanel } = props;
  const navItems: { id: SidebarPanel; label: string; icon: typeof Bookmark }[] = [
    { id: 'bookmarks', label: 'Preferiti', icon: Bookmark },
    { id: 'history', label: 'Cronologia', icon: Clock3 },
    { id: 'downloads', label: 'Download', icon: CloudDownload },
    { id: 'settings', label: 'Impostazioni', icon: Settings2 }
  ];

  return (
    <aside className={`sidebar ${expanded ? 'expanded' : 'collapsed'}`}>
      <button className="sidebar-nav-item sidebar-collapse-top" onClick={onToggleExpanded} aria-label={expanded ? 'Comprimi barra laterale' : 'Espandi barra laterale'} title={expanded ? 'Comprimi' : 'Espandi'}>
        {expanded ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        {expanded && <span>Comprimi barra</span>}
      </button>

      <div className="tab-list" role="listbox" aria-label="Schede aperte">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`tab-item ${activeTabId === tab.id ? 'active' : ''}`}
            draggable
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onTabContextMenu(tab.id, event.clientX, event.clientY);
            }}
            onAuxClick={(event) => {
              if (event.button === 1) { event.preventDefault(); onCloseTab(tab.id); }
            }}
            onDragStart={(event) => { setDragged(tab.id); event.dataTransfer.setData('text/plain', tab.id); event.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => { if (dragged && dragged !== tab.id) onMoveTab(dragged, index); setDragged(null); }}
            onDragEnd={() => setDragged(null)}
          >
            <button className={`tab-select ${tab.suspended ? 'tab-select-suspended' : ''}`} onClick={() => onSwitchTab(tab.id)} title={`${tab.title || 'Nuova scheda'}${tab.url ? ` — ${tab.url}` : ''}${tab.suspended ? ' · Scheda sospesa, verrà ricaricata' : ''}`} aria-label={`Apri scheda ${tab.title || 'Nuova scheda'}${tab.suspended ? ', sospesa' : ''}`}>
              <span className={`tab-favicon ${tab.loading ? 'loading' : ''}`}><TabFavicon tab={tab} /></span>
              {expanded && <span className="tab-title">{tab.title || 'Nuova scheda'}{tab.suspended && <small> · Sospesa</small>}{tab.incognito && <small> · Privata</small>}</span>}
              {expanded && tab.audible && <Volume2 className="tab-audio" size={13} />}
            </button>
            {expanded && <button className="tab-close" aria-label={`Chiudi ${tab.title || 'scheda'}`} title="Chiudi scheda" onClick={(event) => { event.stopPropagation(); onCloseTab(tab.id); }}><X size={13} /></button>}
            {!expanded && <button className="tab-close collapsed-tab-close" aria-label={`Chiudi ${tab.title || 'scheda'}`} title="Chiudi scheda" onClick={(event) => { event.stopPropagation(); onCloseTab(tab.id); }}><X size={12} /></button>}
          </div>
        ))}
      </div>

      <button className="new-tab-button" onClick={onNewTab} title="Nuova scheda (Ctrl+T)">
        <CirclePlus size={17} strokeWidth={1.8} />
        {expanded && <><span>Nuova scheda</span><kbd>Ctrl T</kbd></>}
      </button>

      <div className="sidebar-bottom">
        <div className="sidebar-divider" />
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`sidebar-nav-item ${panel === id ? 'selected' : ''}`} onClick={() => onPanel(id)} title={label} aria-label={label}>
            <Icon size={17} strokeWidth={1.8} />
            {expanded && <span>{label}</span>}
          </button>
        ))}
        <div className="sidebar-footer">
          <div className="privacy-indicator"><span className="status-dot" />{expanded && <span>Dati sul dispositivo</span>}</div>
          {expanded && <span className="sidebar-version">UMBRELLA · {version}</span>}
        </div>
      </div>
    </aside>
  );
}

