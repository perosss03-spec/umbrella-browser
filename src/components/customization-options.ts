import type { SidebarItemVisibility, ToolbarItemVisibility } from '../../electron/storage';

export const sidebarVisibilityOptions: { key: keyof SidebarItemVisibility; label: string }[] = [
  { key: 'newTab', label: 'Pulsante Nuova scheda' },
  { key: 'bookmarks', label: 'Preferiti' },
  { key: 'history', label: 'Cronologia' },
  { key: 'downloads', label: 'Download' }
];

export const toolbarVisibilityOptions: { key: keyof ToolbarItemVisibility; label: string }[] = [
  { key: 'sidebarToggle', label: 'Mostra o nascondi barra laterale' },
  { key: 'back', label: 'Indietro' },
  { key: 'forward', label: 'Avanti' },
  { key: 'reload', label: 'Ricarica / interrompi' },
  { key: 'privacy', label: 'Privacy e permessi del sito' },
  { key: 'bookmark', label: 'Aggiungi ai preferiti' },
  { key: 'downloads', label: 'Download' },
  { key: 'adBlock', label: 'Protezione annunci e tracker del sito' },
  { key: 'incognito', label: 'Nuova scheda in incognito' },
  { key: 'extensions', label: 'Estensioni' },
  { key: 'performanceMode', label: 'Modalità performance' }
];
