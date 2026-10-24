# Province Italiane

Un puzzle geografico quotidiano: collega due **province italiane** nominando quelle che attraverseresti lungo il tragitto, nel minor numero di mosse possibile.

**Gioca online: <https://mastercruelty.github.io/travel-italian-provinces/>**

Ispirato a [travle](https://travle.earth/ita), riscritto da zero in HTML, CSS e JavaScript, senza framework né build.

![Partita in corso su desktop](docs/screenshots/desktop.png)

## Come si gioca

- Ogni partita ha una provincia di **partenza** e una di **arrivo**, distanti tra 4 e 8 confini.
- Scrivi il nome di una provincia qualsiasi: vinci quando quelle inserite formano una **catena continua di province confinanti** tra partenza e arrivo.
- I tentativi sono il numero minimo di province necessarie più un margine: almeno 3 in più, e circa l'80% del minimo per i percorsi lunghi.
- Ogni provincia si colora in base a quanto allunga il percorso ideale:
  🟩 nessuna deviazione · 🟧 fino a 2 province in più · 🟥 oltre.
- Il punteggio è **Perfetto** se usi esattamente il numero minimo di province, altrimenti **+N**.
- Un 💡 **suggerimento** indica la prossima provincia utile a partire da quelle che hai già inserito e costa un tentativo. Finché non lo usi, chiederlo di nuovo ti mostra lo stesso senza costi.
- Per arrenderti premi 🏳️ due volte: la prima chiede conferma.
- I tratti di mare tratteggiati ⛴️ (Stretto di Messina e traghetto Livorno–Olbia) contano come confini, così anche Sicilia e Sardegna sono raggiungibili.

### Quotidiano e allenamento

- **Quotidiano**: lo stesso puzzle per tutti, cambia a mezzanotte (ora locale). La **mappa è nascosta**: all'inizio vedi solo partenza e arrivo, e ogni provincia che inserisci compare sulla cartina. L'Italia intera, con i confini regionali e i traghetti, si svela a fine partita, che tu vinca, perda o ti arrenda. Le statistiche contano solo le partite quotidiane.
- **Allenamento**: partite casuali illimitate con la mappa sempre completa. Il risultato include un **link sfida** per far giocare a un amico lo stesso percorso, ad esempio `?da=CE&a=FI` (Caserta → Firenze).

## Funzionalità

- **Mappa interattiva** delle 110 province: zoom automatico sulla zona della partita, nomi sulle province scoperte e pulsante 🇮🇹 per passare alla vista di tutta Italia.
- **Autocompletamento** tollerante: accenti, apostrofi, sigle (`RM`) e nomi alternativi (`Reggio Emilia`, `Olbia`, `Bozen`…). Con Invio la provincia viene scelta solo se il testo non è ambiguo: `reggio` chiede quale delle due.
- **Risultato condivisibile** con griglia di emoji, conto alla rovescia al prossimo quotidiano e percorso ideale.
- **Statistiche** salvate nel browser: partite, percentuale di vittorie, serie di giorni consecutivi e distribuzione dei punteggi.
- Partita quotidiana **salvata** automaticamente: puoi chiudere la pagina e riprendere.
- **Tema scuro** automatico, layout per mobile, navigazione da tastiera.

| Quotidiano | Allenamento | Risultato | Tema scuro | Regole |
| :---: | :---: | :---: | :---: | :---: |
| ![Quotidiano con la mappa nascosta](docs/screenshots/quotidiano.png) | ![Allenamento su mobile](docs/screenshots/mobile.png) | ![Risultato](docs/screenshots/risultato.png) | ![Tema scuro](docs/screenshots/tema-scuro.png) | ![Regole](docs/screenshots/regole.png) |

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

Coprono il puzzle quotidiano con la mappa nascosta, l'allenamento, i salvataggi, l'autocompletamento, il tocco sui suggerimenti, i colori, i suggerimenti, la sconfitta, la resa, le statistiche, i link sfida e lo zoom. La CI (`.github/workflows/ci.yml`) li esegue con Node.js 22 a ogni pull request e a ogni push su `main`.

### Screenshot

```bash
npm run screenshots
```

Rigenera le immagini di questo README in `docs/screenshots/`. Usa sempre la stessa partita di allenamento (Caserta → Firenze) e, per il quotidiano, una data fissa, così le immagini non cambiano da un giorno all'altro.

### Dati delle province

`data/game_data.json` è generato da `tools/build_data.py` a partire dai confini ufficiali ISTAT:

```bash
pip install shapely
python3 tools/build_data.py
```

Lo script:

1. scarica il GeoJSON delle province da [openpolis/geojson-italy](https://github.com/openpolis/geojson-italy), fissato a un commit preciso;
2. calcola quali province confinano tra loro;
3. collega Sicilia e Sardegna alla terraferma con la traversata più breve;
4. semplifica i confini mantenendo identici i tratti condivisi tra province vicine;
5. calcola per ogni provincia il punto in cui scrivere il nome, il riquadro per lo zoom e il contorno delle regioni.

## Struttura

```
├── index.html, style.css, game.js   il gioco
├── data/game_data.json              province, confini e mappa (generato)
├── tools/
│   ├── build_data.py                genera i dati dai confini ISTAT
│   ├── serve.mjs                    server statico per `npm start` e per i test
│   └── screenshots.mjs              genera gli screenshot del README
├── tests/game.spec.js               test end-to-end
├── playwright.config.js             configurazione dei test (desktop e mobile)
├── Dockerfile, docker-compose.yml, nginx.conf
└── .github/workflows/               CI e pubblicazione su GitHub Pages
```

## Crediti

- Idea e meccanica di gioco: [travle](https://travle.earth) di Oisín Carroll (Teuteuf Games).
- Confini delle province: dati ISTAT distribuiti da [openpolis/geojson-italy](https://github.com/openpolis/geojson-italy).

Codice rilasciato con licenza [MIT](LICENSE).
