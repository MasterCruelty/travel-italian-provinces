# 🗺️ Province Italiane

Un puzzle geografico quotidiano: collega due **province italiane** nominando quelle che attraverseresti lungo il tragitto, nel minor numero di mosse possibile.

Ispirato a [travle](https://travle.earth/ita), riscritto da zero: HTML, CSS e JavaScript puri, senza framework né build.

![Partita in corso su desktop](docs/screenshots/desktop.png)

## Come si gioca

- Ogni giorno c'è una provincia di **partenza** e una di **arrivo**.
- Nel puzzle quotidiano la **mappa è nascosta**: all'inizio vedi solo partenza e arrivo, e ogni provincia che inserisci compare sulla cartina. L'Italia intera si svela a fine partita, che tu vinca o perda. In allenamento la mappa è sempre completa.
- Scrivi il nome di una provincia qualsiasi: vinci quando quelle inserite formano una **catena continua di province confinanti** tra partenza e arrivo.
- I tentativi sono limitati: il percorso minimo più qualche tentativo extra.
- Ogni provincia si colora in base a quanto ti allontana dal percorso ideale:
  🟩 sul percorso ideale · 🟧 piccola deviazione · 🟥 grande deviazione.
- Il punteggio è **Perfetto** se usi esattamente il numero minimo di province, altrimenti **+N**.
- Un 💡 **suggerimento** rivela una provincia utile partendo da quelle che hai già inserito, ma costa un tentativo.
- I tratti di mare tratteggiati ⛴️ (Stretto di Messina e traghetto Livorno–Olbia) contano come confini, così anche Sicilia e Sardegna sono raggiungibili.

## Funzionalità

- **Puzzle quotidiano** uguale per tutti, che cambia a mezzanotte, con conto alla rovescia al prossimo.
- **Allenamento**: partite casuali illimitate e **link sfida** da mandare agli amici (`?da=CE&a=FI`).
- **Mappa interattiva** delle 110 province con zoom automatico sulla zona della partita e nomi sulle province scoperte; nel quotidiano si svela man mano che giochi.
- **Autocompletamento** tollerante: accenti, apostrofi, sigle (`RM`) e nomi alternativi (`Reggio Emilia`, `Olbia`, `Bozen`…).
- **Risultato condivisibile** con griglia di emoji, in stile Wordle.
- **Statistiche** salvate nel browser: partite, percentuale di vittorie, serie di giorni consecutivi e distribuzione dei punteggi.
- Partita quotidiana **salvata** automaticamente: puoi chiudere la pagina e riprendere.
- **Tema scuro** automatico, layout per mobile, navigazione da tastiera.

| Quotidiano | Allenamento | Risultato | Tema scuro | Regole |
| :---: | :---: | :---: | :---: | :---: |
| ![Quotidiano con la mappa nascosta](docs/screenshots/quotidiano.png) | ![Allenamento su mobile](docs/screenshots/mobile.png) | ![Risultato](docs/screenshots/risultato.png) | ![Tema scuro](docs/screenshots/tema-scuro.png) | ![Regole](docs/screenshots/regole.png) |

## Avvio

### Con Docker

```bash
docker compose up --build
```

Poi apri <http://localhost:8000>. Per fermarlo: `docker compose down`.

### Con Node.js

```bash
npm start
```

Avvia un piccolo server statico (senza dipendenze) su <http://localhost:8000>.

### Online con GitHub Pages

Il workflow `.github/workflows/pages.yml` pubblica il gioco a ogni push su `main`. Basta attivarlo una volta da **Settings → Pages → Source: GitHub Actions**.

## Sviluppo

### Test

I test end-to-end usano [Playwright](https://playwright.dev) e girano su un browser desktop e uno mobile:

```bash
npm ci
npx playwright install chromium
npm test
```

Coprono il puzzle quotidiano, i salvataggi, l'autocompletamento, i colori, i suggerimenti, la sconfitta, la resa, le statistiche, i link sfida e lo zoom. La CI li esegue a ogni pull request.

### Screenshot

```bash
npm run screenshots
```

Rigenera le immagini di questo README in `docs/screenshots/`, usando sempre la stessa partita (Caserta → Firenze).

### Dati delle province

`data/game_data.json` è generato da `tools/build_data.py` a partire dai confini ufficiali ISTAT:

```bash
pip install shapely
python3 tools/build_data.py
```

Lo script:

1. scarica il GeoJSON delle province da [openpolis/geojson-italy](https://github.com/openpolis/geojson-italy) (fissato a un commit preciso);
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
│   ├── serve.mjs                    server statico per `npm start`
│   └── screenshots.mjs              genera gli screenshot del README
├── tests/game.spec.js               test end-to-end
├── Dockerfile, docker-compose.yml, nginx.conf
└── .github/workflows/               CI e pubblicazione su GitHub Pages
```

## Crediti

- Idea e meccanica di gioco: [travle](https://travle.earth) di Oisín Carroll (Teuteuf Games).
- Confini delle province: dati ISTAT distribuiti da [openpolis/geojson-italy](https://github.com/openpolis/geojson-italy).

Codice rilasciato con licenza [MIT](LICENSE).
