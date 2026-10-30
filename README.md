# Travel Maps

Un puzzle geografico quotidiano su più mappe: collega due **province italiane**, due **comuni o quartieri di Milano e Brianza**, due **Länder tedeschi** o due **nazioni del mondo**, nominando quelli che attraverseresti lungo il tragitto, nel minor numero di mosse possibile.

**Gioca online: <https://mastercruelty.github.io/travel-maps/>**

Ispirato a [travle](https://travle.earth/ita), riscritto da zero in HTML, CSS e JavaScript, senza framework né build. Ogni mappa ha il suo puzzle quotidiano, e il progetto è pensato per aggiungerne altre (vedi [Aggiungere una mappa](#aggiungere-una-mappa)).

![Partita in corso su desktop](docs/screenshots/desktop.png)

## Mappe

Si sceglie la mappa dalle linguette in alto. Ognuna ha il suo puzzle quotidiano, i suoi salvataggi e le sue statistiche.

| Linguetta | Aree | Collegamenti tratteggiati | Distanza dei puzzle | Indirizzo |
| --- | --- | --- | --- | --- |
| **Italia** | 110 province | ⛴️ Stretto di Messina e traghetto Livorno–Olbia, per raggiungere Sicilia e Sardegna | 4–8 confini | `/` |
| **Milano** | 187 comuni della Città metropolitana di Milano e della provincia di Monza e della Brianza, più gli 88 quartieri (NIL) del comune di Milano | 🛣️ San Colombano al Lambro, staccato dal resto della città metropolitana, collegato a San Zenone al Lambro | 4–8 confini | `/?mappa=milano` |
| **Germania · Länder** | 16 Länder | — | 3–5 confini | `/?mappa=germania` |
| **Germania · Distretti** | 400 distretti (Kreise) | — | 4–7 confini | `/?mappa=distretti` |
| **Mondo** | 199 nazioni | 🚆 tunnel della Manica, 🌉 ponti dell'Øresund e di re Fahd | 4–8 confini | `/?mappa=mondo` |

- **Milano**: il comune di Milano non è un'unica area ma è diviso nei suoi 88 quartieri, che confinano tra loro e con i comuni intorno. Se scrivi "Milano" il gioco ti ricorda di indicare un quartiere.
- **Germania**: sotto la linguetta un selettore sceglie tra **Länder** e **Distretti**, ognuno con quotidiano e statistiche propri. Per i Länder si accettano anche i nomi in tedesco (`Bayern`, `Hessen`, `NRW`…) e le sigle (`BY`, `HE`…). I distretti usano i nomi tedeschi; città e circondario omonimi sono distinti, ad esempio `München (città)` e `München (circondario)`.
- **Mondo**: come in travle, le nazioni senza confini terrestri (Giappone, Australia, Islanda…) si possono nominare ma non collegano nulla: si colorano di nero ⬛ e non sono mai partenza o arrivo. La Francia comprende la Guyana francese, quindi confina con Brasile e Suriname.

## Come si gioca

- Ogni partita ha un'area di **partenza** e una di **arrivo**, alla distanza indicata nella tabella.
- Scrivi il nome di un'area qualsiasi della mappa: vinci quando quelli inseriti formano una **catena continua di aree confinanti** tra partenza e arrivo.
- I tentativi sono il numero minimo di aree necessarie più un margine: almeno 3 in più (4 a Milano, dove i nomi sono meno noti; 2 in Germania, dove i percorsi sono brevi), e circa l'80% del minimo per i percorsi lunghi (il 100% a Milano).
- Ogni area si colora in base a quanto allunga il percorso ideale:
  🟩 nessuna deviazione · 🟧 fino a 2 aree in più · 🟥 oltre · ⬛ nessun collegamento via terra (solo nel mondo).
- Il punteggio è **Perfetto** se usi esattamente il numero minimo di aree, altrimenti **+N**.
- Il 💡 **suggerimento** funziona a livelli sul prossimo passo utile, calcolato a partire da ciò che hai già inserito: il primo aiuto ne mostra il contorno sulla mappa senza nome, il secondo le iniziali (es. `R_____ n___'E_____`). Ogni aiuto costa un tentativo; il nome compare solo quando lo indovini o a fine partita.
- Per arrenderti premi 🏳️ due volte: la prima chiede conferma.
- A partita vinta compare **Lo sapevi?**: una curiosità sulla località di partenza e una su quella di arrivo, ognuna con la sua fonte.
- I collegamenti tratteggiati della tabella sopra contano come confini.

### Quotidiano e allenamento

- **Quotidiano**: lo stesso puzzle per tutti, cambia a mezzanotte (ora locale). La **mappa è nascosta**: all'inizio vedi solo partenza e arrivo, e ogni area che inserisci compare sulla cartina. La mappa intera, con i confini di regioni o province e i collegamenti tratteggiati, si svela a fine partita, che tu vinca, perda o ti arrenda. Le statistiche contano solo le partite quotidiane.
- **Allenamento**: partite casuali illimitate con la mappa sempre completa. Il risultato include un **link sfida** per far giocare a un amico lo stesso percorso, ad esempio `?da=CE&a=FI` (Caserta → Firenze) o `?mappa=milano&da=MI01&a=108033` (Duomo → Monza).

## Funzionalità

- **Mappa interattiva**: zoom automatico sulla zona della partita, nomi sulle aree scoperte (se due nomi si sovrappongono resta il più importante, l'altro si legge toccando l'area) e pulsante 🇮🇹 / 🗺️ / 🇩🇪 / 🌍 per vedere la mappa intera.
- **Autocompletamento** tollerante: accenti, apostrofi, sigle (`RM`) e nomi alternativi (`Reggio Emilia`, `Olbia`, `Bozen`…). Con Invio la provincia viene scelta solo se il testo non è ambiguo: `reggio` chiede quale delle due.
- **Risultato condivisibile** con griglia di emoji, conto alla rovescia al prossimo quotidiano e percorso ideale.
- **Statistiche** salvate nel browser: partite, percentuale di vittorie, serie di giorni consecutivi e distribuzione dei punteggi.
- Partita quotidiana **salvata** automaticamente: puoi chiudere la pagina e riprendere.
- **Tema scuro** automatico, layout per mobile, navigazione da tastiera.

| Quotidiano | Allenamento | Milano | Germania | Mondo |
| :---: | :---: | :---: | :---: | :---: |
| ![Quotidiano con la mappa nascosta](docs/screenshots/quotidiano.png) | ![Allenamento su mobile](docs/screenshots/mobile.png) | ![Milano dal Duomo a Monza attraverso i quartieri](docs/screenshots/milano.png) | ![Germania con un suggerimento](docs/screenshots/germania.png) | ![Mondo dal Portogallo alla Polonia](docs/screenshots/mondo.png) |

| Risultato | Curiosità | Tema scuro | Regole |
| :---: | :---: | :---: | :---: |
| ![Risultato](docs/screenshots/risultato.png) | ![Curiosità a fine partita](docs/screenshots/curiosita.png) | ![Tema scuro](docs/screenshots/tema-scuro.png) | ![Regole](docs/screenshots/regole.png) |

## Avvio in locale

### Con Docker

```bash
docker compose up --build
```

Poi apri <http://localhost:8000>. Per fermarlo: `docker compose down`.

L'immagine usa nginx con compressione gzip e un controllo di salute del container.

### Con Node.js

```bash
npm start
```

Avvia un piccolo server statico, senza dipendenze, su <http://localhost:8000>.

## Pubblicazione

Il workflow `.github/workflows/pages.yml` pubblica il gioco su GitHub Pages a ogni push su `main`, copiando solo i file del gioco (`index.html`, `style.css`, `game.js`, `data/`).

## Sviluppo

### Test

I test end-to-end usano [Playwright](https://playwright.dev) e girano su un browser desktop e su uno mobile emulato:

```bash
npm ci
npx playwright install chromium
npm test
```

Coprono tutte le mappe e il passaggio tra le linguette, il puzzle quotidiano con la mappa nascosta, l'allenamento, i salvataggi, l'autocompletamento, il tocco sui suggerimenti, i colori, i suggerimenti, la sconfitta, la resa, le statistiche, i link sfida e lo zoom. La CI (`.github/workflows/ci.yml`) li esegue con Node.js 22 a ogni pull request e a ogni push su `main`.

### Screenshot

```bash
npm run screenshots
```

Rigenera le immagini di questo README in `docs/screenshots/`. Usa sempre le stesse partite di allenamento (es. Caserta → Firenze, Duomo → Monza) e, per il quotidiano, una data fissa, così le immagini non cambiano da un giorno all'altro. Con `CHROMIUM_PATH` si può indicare un Chromium già installato.

### Dati delle mappe

`data/italia.json`, `milano.json`, `germania.json` e `mondo.json` sono generati da `tools/build_data.py`:

```bash
pip install shapely
python3 tools/build_data.py            # tutte le mappe
python3 tools/build_data.py milano     # solo una
```

Per ogni mappa lo script:

1. scarica i confini da fonti pubblicate su GitHub, ognuna fissata a un commit preciso (vedi [Crediti](#crediti)); per Milano sostituisce il comune con i suoi 88 quartieri, ritagliati sul confine ufficiale del comune così da combaciare con i comuni vicini;
2. calcola quali aree confinano tra loro;
3. aggiunge i collegamenti fissi (ponti, tunnel) e, in Italia e a Milano, collega le parti staccate (isole, exclavi) all'area più vicina, come un traghetto;
4. semplifica i confini mantenendo identici i tratti condivisi tra aree vicine;
5. calcola per ogni area il punto in cui scrivere il nome, il riquadro per lo zoom e il contorno dei gruppi (regioni, province, continenti). Il mondo usa la proiezione Equal Earth.

### Curiosità

Le curiosità di fine partita sono in `data/facts/<mappa>.json`, una voce per area:

```json
{ "FI": { "facts": ["...", "..."], "sources": ["https://..."] } }
```

Sono scritte a mano, una o due per area, verificate su fonti indicate in `sources` (Wikipedia, siti istituzionali, cataloghi dei beni culturali). Le regole: al massimo 220 caratteri, solo fatti duraturi (niente popolazione, sindaci o cronaca), tradizioni e ipotesi presentate come tali. Oggi coprono tutte le 110 province, 180 dei 187 comuni di Milano e Brianza e il quartiere Duomo, i 16 Länder e 181 delle 199 nazioni; i quartieri di Milano e i distretti tedeschi non ne hanno ancora. Per le aree senza curiosità il gioco mostra solo l'altra località. Un test controlla che ogni voce corrisponda a un'area della mappa, abbia una fonte valida e rispetti la lunghezza massima.

### Aggiungere una mappa

1. In `tools/build_data.py` aggiungi una funzione che carica le aree (codice, nome, gruppo, geometria) e una voce a `MAPS` con tolleranze e proiezione, poi rigenera i dati.
2. In `game.js` aggiungi la stessa chiave a `MAPS`, con i testi (singolare e plurale, messaggi), il prefisso dei salvataggi e la distanza dei puzzle.
3. In `index.html` aggiungi la linguetta con `data-map="<chiave>"`.

## Struttura

```
├── index.html, style.css, game.js   il gioco
├── data/<mappa>.json                aree, confini e disegno di ogni mappa (generati)
├── data/facts/                      curiosità di fine partita per ogni mappa
├── tools/
│   ├── build_data.py                genera i dati delle mappe dai confini ufficiali
│   ├── serve.mjs                    server statico per `npm start` e per i test
│   └── screenshots.mjs              genera gli screenshot del README
├── tests/game.spec.js               test end-to-end
├── playwright.config.js             configurazione dei test (desktop e mobile)
├── Dockerfile, docker-compose.yml, nginx.conf
└── .github/workflows/               CI e pubblicazione su GitHub Pages
```

## Supporta il progetto

Il gioco è gratuito e senza pubblicità. Se ti piace puoi [offrirmi un caffè su PayPal](https://paypal.me/mastercruelty).

## Crediti

- Idea e meccanica di gioco: [travle](https://travle.earth) di Oisín Carroll (Teuteuf Games).
- Confini di province e comuni: dati ISTAT con licenza CC BY 4.0, distribuiti da [openpolis/geojson-italy](https://github.com/openpolis/geojson-italy) (province, nomi e codici) e da [l1n00/confini-comuni-istat](https://github.com/l1n00/confini-comuni-istat) (confini comunali dettagliati, Istat, *Confini delle unità amministrative a fini statistici al 1° gennaio 2026*, versione non generalizzata).
- Quartieri di Milano: NIL (Nuclei d'Identità Locale) dal portale open data del Comune di Milano, nella conversione di [abahgat/opendata-milano](https://github.com/abahgat/opendata-milano).
- Nazioni e Länder: [Natural Earth](https://www.naturalearthdata.com), pubblico dominio, da [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector).
- Distretti tedeschi: © GeoBasis-DE / BKG 2018, VG250, [Datenlizenz Deutschland – Namensnennung 2.0](https://www.govdata.de/dl-de/by-2-0), nella conversione GeoJSON di [opendatalab-de/simple-geodata-selector](https://github.com/opendatalab-de/simple-geodata-selector); Eisenach è unita al Wartburgkreis come dal 2021.
- Tutte le geometrie sono semplificate per l'uso sul web.
- Curiosità: testi originali basati sulle fonti indicate per ogni voce in `data/facts/`.

Codice rilasciato con licenza [MIT](LICENSE).
