import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import {
  ArrowUpRight, BookmarkPlus, Code2, Mail, Pencil,
  Play, Plus, Search, Send, Settings2, Trash2, X
} from 'lucide-react';
import type { Bookmark } from '../../electron/storage';

type Props = {
  bookmarks: Bookmark[];
  onSearch: (value: string) => void;
  onOpen: (url: string) => void;
  onAddBookmark: (title: string, url: string) => Promise<boolean>;
  onUpdateBookmark: (id: string, title: string, url: string) => Promise<boolean>;
  onRemoveBookmark: (id: string) => Promise<void>;
  onSettings: () => void;
  wallpaperUrl: string | null;
};

const defaults = [
  { title: 'GitHub', url: 'https://github.com/', icon: Code2, tone: 'github' },
  { title: 'Telegram', url: 'https://web.telegram.org/', icon: Send, tone: 'telegram' },
  { title: 'YouTube', url: 'https://youtube.com/', icon: Play, tone: 'youtube' },
  { title: 'Gmail', url: 'https://mail.google.com/', icon: Mail, tone: 'gmail' }
];

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const seconds = new Intl.DateTimeFormat('it-IT', { second: '2-digit' }).format(now);
  const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const greeting = now.getHours() < 12 ? 'BUONGIORNO' : now.getHours() < 18 ? 'BUON POMERIGGIO' : 'BUONA SERATA';

  return (
    <>
      <div className="clock-greeting">{greeting}</div>
      <div className="clock-face" aria-label={`Sono le ${time}`}>
        <span className="clock-time">{time}</span>
        <span className="clock-seconds">{seconds}</span>
      </div>
      <div className="clock-date">{date}</div>
    </>
  );
}

export default function StartPage({ bookmarks, onSearch, onOpen, onAddBookmark, onUpdateBookmark, onRemoveBookmark, onSettings, wallpaperUrl }: Props) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [editingShortcut, setEditingShortcut] = useState<Bookmark | null>(null);
  const [contextMenu, setContextMenu] = useState<{ bookmark: Bookmark; x: number; y: number } | null>(null);
  const [shortcutFeedback, setShortcutFeedback] = useState('');
  const shortcuts = useMemo(() => bookmarks.slice(0, 4), [bookmarks]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [contextMenu]);

  const closeShortcutDialog = () => {
    setAdding(false);
    setEditingShortcut(null);
    setTitle('');
    setUrl('');
    setShortcutFeedback('');
  };

  const openAddDialog = () => {
    setEditingShortcut(null);
    setTitle('');
    setUrl('');
    setShortcutFeedback('');
    setAdding(true);
  };

  const openShortcutContextMenu = (event: MouseEvent<HTMLButtonElement>, bookmark: Bookmark) => {
    event.preventDefault();
    event.stopPropagation();
    setShortcutFeedback('');
    setContextMenu({
      bookmark,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 92))
    });
  };

  const editShortcut = () => {
    if (!contextMenu) return;
    setEditingShortcut(contextMenu.bookmark);
    setTitle(contextMenu.bookmark.title);
    setUrl(contextMenu.bookmark.url);
    setShortcutFeedback('');
    setContextMenu(null);
    setAdding(true);
  };

  const removeShortcut = async () => {
    if (!contextMenu) return;
    const bookmark = contextMenu.bookmark;
    setContextMenu(null);
    setShortcutFeedback('');
    try {
      await onRemoveBookmark(bookmark.id);
    } catch (error) {
      console.error('[Umbrella] Could not remove the start-page shortcut:', error);
      setShortcutFeedback('Non è stato possibile rimuovere l’accesso rapido.');
    }
  };

  const saveShortcut = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !url.trim()) return;
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    try {
      const saved = editingShortcut
        ? await onUpdateBookmark(editingShortcut.id, title.trim(), normalized)
        : await onAddBookmark(title.trim(), normalized);
      if (!saved) {
        setShortcutFeedback('Controlla l’indirizzo web e riprova.');
        return;
      }
      closeShortcutDialog();
    } catch (error) {
      console.error('[Umbrella] Could not save the start-page shortcut:', error);
      setShortcutFeedback('Non è stato possibile salvare l’accesso rapido.');
    }
  };

  return (
    <main className="start-page">
      <div className={`start-backdrop ${wallpaperUrl ? 'has-custom-wallpaper' : ''}`} style={wallpaperUrl ? { backgroundImage: `url("${wallpaperUrl}")` } : undefined} aria-hidden="true" />
      <div className="start-atmosphere" aria-hidden="true" />

      <div className="start-content">
        <Clock />

        <form className="home-search" onSubmit={(event) => { event.preventDefault(); onSearch(query); }}>
          <Search size={19} strokeWidth={1.8} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca sul web..."
            aria-label="Cerca con DuckDuckGo o inserisci un indirizzo"
          />
          <span className="search-provider">DUCKDUCKGO</span>
          <button type="submit" aria-label="Cerca"><ArrowUpRight size={18} /></button>
        </form>

        <section className="shortcuts-section" aria-label="Accessi rapidi">
          <div className="shortcut-grid">
            {shortcuts.length > 0 ? shortcuts.map((item) => (
              <button
                className="shortcut-card"
                key={item.id}
                onClick={() => onOpen(item.url)}
                onContextMenu={(event) => openShortcutContextMenu(event, item)}
                title={item.url}
              >
                <span className="shortcut-icon saved"><Search size={23} strokeWidth={1.7} /></span>
                <span className="shortcut-title">{item.title}</span>
                <ArrowUpRight className="shortcut-open" size={13} />
              </button>
            )) : defaults.map(({ title: shortcutTitle, url: shortcutUrl, icon: Icon, tone }) => (
              <button className="shortcut-card" key={shortcutUrl} onClick={() => onOpen(shortcutUrl)}>
                <span className={`shortcut-icon ${tone}`}><Icon size={25} strokeWidth={1.8} /></span>
                <span className="shortcut-title">{shortcutTitle}</span>
                <ArrowUpRight className="shortcut-open" size={13} />
              </button>
            ))}
            {shortcuts.length < 4 && <button className="shortcut-card add-shortcut" onClick={openAddDialog}>
              <span className="shortcut-icon add"><Plus size={25} strokeWidth={1.6} /></span>
              <span className="shortcut-title">Aggiungi</span>
            </button>}
          </div>
        </section>
      </div>

      <div className="start-footer">
        <span>“Meno rumore. Più spazio alle cose che contano.”</span>
        <small>— UMBRELLA</small>
      </div>

      <button className="start-settings-button" onClick={onSettings} aria-label="Apri impostazioni" title="Personalizza Umbrella">
        <Settings2 size={19} strokeWidth={1.8} />
      </button>

      {contextMenu && <div
        className="shortcut-context-backdrop"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setContextMenu(null);
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          className="shortcut-context-menu"
          role="menu"
          aria-label={`Opzioni per ${contextMenu.bookmark.title}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button role="menuitem" onClick={editShortcut}><Pencil size={15} /> Modifica</button>
          <button className="remove-shortcut-action" role="menuitem" onClick={() => void removeShortcut()}><Trash2 size={15} /> Rimuovi</button>
        </div>
      </div>}

      {!adding && shortcutFeedback && <div className="shortcut-feedback" role="status">{shortcutFeedback}</div>}

      {adding && <div className="modal-backdrop" onClick={closeShortcutDialog}>
        <form className="dialog-card" onSubmit={saveShortcut} onClick={(event) => event.stopPropagation()}>
          <div className="dialog-head"><div><span className="dialog-kicker">PERSONALIZZA</span><h2>{editingShortcut ? 'Modifica accesso rapido' : 'Nuovo accesso rapido'}</h2></div><button type="button" className="icon-button" onClick={closeShortcutDialog} aria-label="Chiudi"><X size={17} /></button></div>
          <label>Nome<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Il mio sito" required /></label>
          <label>Indirizzo web<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="esempio.com" required /></label>
          {shortcutFeedback && <small className="shortcut-dialog-feedback" role="alert">{shortcutFeedback}</small>}
          <div className="dialog-actions"><button type="button" className="button-quiet" onClick={closeShortcutDialog}>Annulla</button><button type="submit" className="button-primary"><BookmarkPlus size={15} /> {editingShortcut ? 'Salva modifiche' : 'Salva accesso'}</button></div>
        </form>
      </div>}
    </main>
  );
}
