# UMBRELLA

**Umbrella 0.4.5** è un browser desktop Windows basato su Electron, Chromium, React e TypeScript. Include modalità performance, controlli privacy per sito e sospensione delle schede inattive, oltre alla Discord Activity e alle funzionalità di primo avvio e trasferimento dati browser.

## Download

Scarica l'ultima versione per Windows x64 dalla pagina [Releases](https://github.com/perosss03-spec/umbrella-browser/releases/latest). Scegli **Umbrella Setup** per installare il browser oppure **Umbrella portable** per avviarlo senza installazione. Le build attuali non sono firmate digitalmente; Windows potrebbe mostrare un avviso di sicurezza.

## Stack

- Electron 45.4.1 / Chromium 156 / Node.js integrato 24.22.3.
- React 19 + TypeScript 7.
- Vite 8 + electron-vite 6.
- `WebContentsView` per le pagine web reali, senza iframe.
- DuckDuckGo come motore di ricerca predefinito.
- `@ghostery/adblocker-electron` per il filtro di annunci e tracker.

## Requisiti e avvio

- Windows 10/11 x64 per il prodotto desktop.
- Node.js 24 LTS consigliato per lo sviluppo, npm 10+.

```bash
npm install
npm run dev
```

Controlli e build:

```bash
npm run typecheck
npm test
npm run build
npm run dist
```

`npm run dist` è configurato per generare installer NSIS e pacchetto portable x64 in `release/`. La build distribuita va provata su Windows 10/11.

## Primo avvio

La configurazione iniziale contiene tre passaggi:

1. **Importa dati**: apre la finestra di rilevamento dei browser presenti sul PC. L'utente sceglie il browser, il profilo e i dati da trasferire.
2. **Browser predefinito**: registra Umbrella nelle app browser disponibili e apre direttamente la pagina delle app predefinite di Windows. L'utente deve selezionare Umbrella e confermare HTTP e HTTPS.
3. **Tema**: scelta tra chiaro, scuro e sistema.

Tutti i passaggi sono facoltativi: l'utente può continuare senza importare dati o senza impostare subito Umbrella come predefinito. La procedura di importazione resta disponibile anche in **Impostazioni → Trasferimento dati**.

La configurazione iniziale viene ricordata tra gli avvii e le reinstallazioni, senza cancellare i dati dell'utente. Quando viene introdotta una nuova revisione della procedura, questa viene mostrata una volta anche a chi aveva già installato Umbrella; in seguito non ricompare. Se è già stata completata, la procedura per il browser predefinito resta disponibile in **Impostazioni → Browser predefinito**.

## Importazione da altri browser

Il rilevatore cerca profili locali e li raggruppa per browser. Le cartelle profilo vengono cercate nei percorsi standard di Windows.

Browser Chromium rilevati quando i relativi profili sono presenti:

- Google Chrome (Stable, Beta, Dev e Canary).
- Microsoft Edge (Stable, Beta, Dev e Canary).
- Brave (Stable, Beta e Nightly).
- Opera, Opera GX e Opera Beta.
- Vivaldi e Vivaldi Snapshot.
- Chromium, Yandex Browser, Arc, Sidekick, Epic Privacy Browser.
- Comodo Dragon, Slimjet, SRWare Iron, Cent Browser, Cốc Cốc e Naver Whale.

Browser basati su Firefox/Gecko rilevati quando il profilo contiene `places.sqlite`:

- Mozilla Firefox e i profili Firefox registrati in `profiles.ini` (inclusi i profili separati di Beta/Developer Edition/Nightly quando registrati lì).
- Waterfox, LibreWolf, Floorp, Zen Browser, Pale Moon, SeaMonkey e Mullvad Browser.

È disponibile anche l'importazione dei Preferiti di Windows/Internet Explorer quando la cartella Favorites contiene file `.url`.

### Dati trasferibili

Per ogni profilo vengono mostrate le categorie disponibili:

- **Preferiti**: segnalibri e cartelle con URL HTTP/HTTPS.
- **Cronologia**: URL visitati, titolo e data dell'ultima visita disponibile. Umbrella legge i database Chromium `History` e Gecko `places.sqlite` tramite una copia temporanea del database, senza modificare il profilo sorgente.

Gli URL già presenti vengono ignorati per evitare duplicati. L'importazione della cronologia aggiunge fino a 3.000 URL recenti per profilo e il database locale conserva fino a 5.000 voci.

**Non vengono importati password, carte di pagamento, cookie, sessioni di accesso, estensioni o schede aperte.** Questi dati sono legati alla cifratura del sistema operativo, al profilo o alle credenziali del browser e richiedono procedure di migrazione separate. Per risultati più affidabili, chiudi il vecchio browser prima dell'importazione: se un database è in uso o non può essere letto, Umbrella mostra un avviso e non modifica il file originale.

Se il browser non viene rilevato (ad esempio perché usa una cartella profilo personalizzata), scegli **Cerca cartella** nella finestra di importazione: puoi indicare la cartella `User Data`, `Profiles` o quella del singolo profilo. Questo percorso manuale riconosce i formati Chromium e Gecko. Per browser con formati diversi, puoi importare i preferiti da un file HTML o JSON esportato. La scansione non carica né invia dati a Internet. Non è possibile garantire la rilevazione automatica di ogni fork, versione portable o profilo salvato in un percorso non standard.

## Browser predefinito su Windows

Quando la procedura viene avviata, Umbrella registra sotto l'account Windows corrente:

- i ProgID `UmbrellaURL` e `UmbrellaHTML`;
- le associazioni per `http`, `https`, `.htm` e `.html`;
- la voce `Umbrella` in `HKCU\Software\RegisteredApplications`;
- i comandi di apertura che puntano all'eseguibile Umbrella.

Poi apre `ms-settings:defaultapps?registeredAppUser=Umbrella`, la pagina di Windows dedicata all'app registrata. Il comando viene eseguito dopo aver scritto la voce `Umbrella` in `HKCU\Software\RegisteredApplications`; su Windows la query `registeredAppUser` individua il nome del valore registrato in quell'hive. La verifica legge le associazioni `UserChoice` per HTTP e HTTPS e conferma Umbrella solo quando entrambi puntano al ProgID `UmbrellaURL`.

**Windows mantiene la decisione finale nelle proprie impostazioni di sistema.** Umbrella non può né deve forzare silenziosamente il browser predefinito: nella pagina che si apre seleziona Umbrella e assegna i protocolli HTTP e HTTPS. Dopo la scelta, torna alla procedura e premi **Verifica browser predefinito**.

Se hai già completato la configurazione iniziale, apri **Impostazioni → Browser predefinito** per riaprire la pagina di Windows e verificare la selezione.

La gestione del protocollo include anche l'apertura di link HTTP/HTTPS quando Umbrella è già in esecuzione (seconda istanza) oppure quando viene avviato da Windows con un link.

## Discord Activity

Per mostrare sul profilo Discord che stai usando Umbrella, apri **Impostazioni → Discord Activity**. Nel [Discord Developer Portal](https://discord.com/developers/applications) crea un'applicazione, copia il suo **Application ID**, incollalo in Umbrella e attiva **Attività Discord**. Per l'icona, carica [`resources/umbrella-icon.png`](./resources/umbrella-icon.png) nella sezione **Rich Presence → Art Assets** della stessa applicazione e usa il nome/chiave `umbrella`. Nell'installer il file è incluso in `resources/umbrella-icon.png` accanto a `Umbrella.exe`. Discord Desktop deve essere in esecuzione; se si avvia dopo Umbrella, la connessione viene ritentata automaticamente.

La presenza mostra solo che stai navigando con Umbrella. Non include URL, titoli delle pagine, cronologia o altri dati di navigazione. Puoi disattivarla in qualsiasi momento dalle impostazioni. Per una distribuzione pubblica, configura l'ID dell'applicazione Discord ufficiale del progetto.

## Privacy per sito e sospensione schede

L'icona a sinistra della barra degli indirizzi apre i controlli privacy per l'origine HTTP/HTTPS corrente. Da qui puoi vedere i domini delle richieste bloccate (conteggio temporaneo, locale), escludere il sito dall'ad blocker e impostare i permessi di fotocamera/microfono, posizione, notifiche, lettura appunti e MIDI su **Chiedi**, **Consenti** o **Blocca**. Le modifiche ai filtri possono richiedere il ricaricamento della pagina. In modalità privata questi controlli per sito non sono disponibili e le richieste di permesso vengono negate.

In **Impostazioni → Esperienza** scegli dopo quanto tempo sospendere le schede inattive (mai, 5, 15, 30 o 60 minuti). L'impostazione predefinita è 30 minuti. Le schede attive, private, in caricamento o con audio non vengono sospese. La sospensione scarica la pagina dalla memoria e la ricarica quando la riapri: eventuali dati non salvati nei moduli possono andare persi.

## Altre funzionalità presenti

- Toolbar compatta e sidebar verticale comprimibile.
- Schede Chromium reali tramite `WebContentsView`, favicon e menu schede nativo.
- Nuova scheda con orologio, ricerca DuckDuckGo, scorciatoie e wallpaper personalizzabile.
- Preferiti e cronologia locali.
- Download manager.
- Sessioni private separate.
- Estensioni da cartelle già estratte Manifest V3, con i limiti delle API Electron.
- Ad blocker Ghostery con filtri pubblicitari e anti-tracking.
- Discord Rich Presence/Activity facoltativa, con logo Umbrella e Application ID configurabile.
- Modalità performance attivabile dalla toolbar: mantiene schede, barra indirizzi ed estensioni, rimuove gli elementi decorativi della nuova scheda e disattiva animazioni/transizioni dell'interfaccia.
- Privacy per sito: permessi salvabili, eccezioni dell'ad blocker e conteggio locale dei domini bloccati.
- Sospensione automatica configurabile delle schede inattive per liberare memoria.
- Tema chiaro/scuro/sistema.
- Backup locale dei dati e persistenza separata dai file dell'applicazione.

## Note sulla sicurezza

L'importazione browser viene eseguita nel processo principale Electron. Gli identificatori dei profili esposti all'interfaccia sono hash, non percorsi assoluti. Durante la lettura SQLite, Umbrella copia il database e gli eventuali file WAL/SHM in una cartella temporanea e interroga la copia. Il profilo sorgente non viene modificato.

Le password non vengono lette né esportate. Le pagine web non ricevono privilegi Node.js. Il renderer usa `contextIsolation`, `nodeIntegration: false`, sandbox e IPC mediato dal preload.

Per le estensioni, installa solo cartelle attendibili: le estensioni possono leggere o modificare i siti secondo i permessi dichiarati dal loro manifest.

## Persistenza

I dati browser sono conservati nella directory `userData/Umbrella`, distinta dai file dell'applicazione. Include preferiti, cronologia, impostazioni, wallpaper, percorsi estensioni e sessione. L'aggiornamento dell'app non deve sovrascrivere il profilo dell'utente.

## Tasti rapidi

- `Ctrl+L`: barra degli indirizzi
- `Ctrl+T`: nuova scheda
- `Ctrl+W`: chiudi scheda
- `Ctrl+Shift+T`: ripristina scheda
- `Ctrl+R`: ricarica
- `Ctrl+F`: trova nella pagina
- `Ctrl+Tab`: scheda successiva
- Clic centrale sulla scheda: chiudi scheda
- Tasto destro sulla scheda: menu contestuale

## Verifiche

I test automatizzati includono la lettura di un profilo Chromium simulato e un profilo Firefox/Gecko simulato con SQLite temporaneo, oltre ai test esistenti per preferiti HTML e navigazione DuckDuckGo. Le prove su un'installazione reale Windows 10/11 restano necessarie per verificare i percorsi presenti sul PC, le autorizzazioni dei database browser e la selezione effettiva di HTTP/HTTPS nelle Impostazioni di Windows.
