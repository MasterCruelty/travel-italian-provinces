'use strict';

// ---------- Mappe ----------
// Ogni mappa ha il suo file di dati, i suoi testi e il suo spazio di
// salvataggio. L'Italia mantiene le chiavi e il seme del quotidiano storici,
// così partite e statistiche già salvate restano valide.
const MAPS = {
  italia: {
    tab: 'Italia',
    title: 'Province Italiane',
    file: 'data/italia.json',
    one: 'provincia', many: 'province',
    placeholder: 'Scrivi una provincia…',
    unknown: 'Provincia non riconosciuta',
    already: 'è già stata inserita',
    ambiguous: 'Più province corrispondono: scegline una dalla lista',
    linksNote: '⛴️ I tratti di mare tratteggiati (Stretto di Messina, traghetto Livorno–Olbia) contano come confini.',
    zoomIcon: '🇮🇹', zoomTitle: "Mostra tutta l'Italia",
    storagePrefix: 'pi_',
    seedOffset: 12345,
    minDist: 4, maxDist: 8,
    extraMin: 3, extraFactor: 0.8,
    codes: true,              // le sigle (RM, MI…) valgono come nomi
    // Nomi alternativi accettati in input (oltre al nome ufficiale e alla sigla).
    aliases: {
      AO: ['aosta', "valle d'aosta"],
      BZ: ['bolzano', 'bozen', 'alto adige', 'sudtirol'],
      FC: ['forli', 'cesena'],
      MB: ['monza', 'brianza', 'monza e brianza'],
      MS: ['massa', 'carrara'],
      PU: ['pesaro', 'urbino'],
      RC: ['reggio calabria'],
      RE: ['reggio emilia'],
      VB: ['verbania', 'vco'],
      BT: ['barletta', 'andria', 'trani', 'bat'],
      SP: ['spezia'],
      AQ: ['aquila'],
      OT: ['gallura', 'olbia', 'tempio', 'olbia tempio', 'nord est sardegna'],
      OG: ['lanusei', 'tortoli'],
      VS: ['sanluri', 'villacidro'],
      CI: ['sulcis', 'carbonia', 'iglesias', 'carbonia iglesias'],
    },
  },
  milano: {
    tab: 'Milano e Brianza',
    title: 'Comuni di Milano e Brianza',
    file: 'data/milano.json',
    one: 'comune', many: 'comuni',
    placeholder: 'Scrivi un comune…',
    unknown: 'Comune non riconosciuto',
    already: 'è già stato inserito',
    ambiguous: 'Più comuni corrispondono: scegline uno dalla lista',
    linksNote: '🛣️ San Colombano al Lambro è staccato dal resto della città metropolitana: il tratteggio che lo unisce a San Zenone al Lambro conta come un confine.',
    zoomIcon: '🗺️', zoomTitle: 'Mostra tutta la mappa',
    storagePrefix: 'pi_milano_',
    seedOffset: 54321,
    minDist: 4, maxDist: 8,
    extraMin: 4, extraFactor: 1,
    codes: false,
    aliases: {},
  },
};
const DEFAULT_MAP = 'italia';
const GAME_TITLE = 'Travel Maps';

const EMOJI = { 'g-ok': '🟩', 'g-near': '🟧', 'g-far': '🟥', hint: '💡' };
const DAILY_EPOCH = new Date(2024, 0, 1);
const REDUCED_MOTION = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Stato ----------
let mapKey = DEFAULT_MAP;
let MAP = MAPS[DEFAULT_MAP];
let DATA = null;
let NB = {};                   // id -> [id confinanti]
let SIGLAS = [];
let NAME_INDEX = {};           // testo normalizzato -> id (corrispondenze esatte)
let SEARCH_KEYS = [];          // [{sigla, key}] per l'autocompletamento
const dataCache = {};

let game = null;
let view = null;               // viewBox corrente [x, y, w, h]
let showAll = false;           // vista della mappa intera invece dello zoom sulla partita
let countdownTimer = null;

const $ = (id) => document.getElementById(id);
const statsKey = () => MAP.storagePrefix + 'stats_v1';
const dailyPrefix = () => MAP.storagePrefix + 'daily_';

// ---------- Utilità ----------
// Minuscolo, senza accenti né apostrofi: "L'Aquila" -> "laquila", "Forlì" -> "forli".
function norm(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Variante con l'apostrofo trattato come spazio: "L'Aquila" -> "l aquila".
function normSpaced(s) {
  return norm(s.replace(/['’‘`]/g, ' '));
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage non disponibile */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* idem */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Indice del giorno secondo il fuso orario locale: il puzzle cambia a mezzanotte.
function dayNumber(d) {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

function dailyId() {
  return dayNumber(new Date()) - dayNumber(DAILY_EPOCH) + 1;
}

function area(sig) { return DATA.areas[sig]; }

function shortName(sig) {
  return area(sig).name.split('/')[0];
}

// ---------- URL ----------
function mapFromUrl() {
  const key = new URLSearchParams(location.search).get('mappa');
  return MAPS[key] ? key : DEFAULT_MAP;
}

function urlFor(params = {}) {
  const q = new URLSearchParams();
  if (mapKey !== DEFAULT_MAP) q.set('mappa', mapKey);
  for (const [k, v] of Object.entries(params)) q.set(k, v);
  const s = q.toString();
  return location.pathname + (s ? '?' + s : '');
}

function syncUrl(params) {
  const next = urlFor(params);
  if (next !== location.pathname + location.search) history.replaceState(null, '', next);
}

// ---------- Grafo ----------
function bfs(src) {
  const dist = { [src]: 0 };
  const q = [src];
  for (let i = 0; i < q.length; i++) {
    const u = q[i];
    for (const v of NB[u]) {
      if (dist[v] === undefined) { dist[v] = dist[u] + 1; q.push(v); }
    }
  }
  return dist;
}

function shortestPath(a, b) {
  const prev = { [a]: null };
  const q = [a];
  for (let i = 0; i < q.length && prev[b] === undefined; i++) {
    for (const v of NB[q[i]]) {
      if (prev[v] === undefined) { prev[v] = q[i]; q.push(v); }
    }
  }
  const path = [];
  for (let c = b; c != null; c = prev[c]) path.unshift(c);
  return path;
}

function connected(a, b, allowed) {
  const seen = new Set([a]);
  const q = [a];
  for (let i = 0; i < q.length; i++) {
    for (const v of NB[q[i]]) {
      if (v === b) return true;
      if (!seen.has(v) && allowed.has(v)) { seen.add(v); q.push(v); }
    }
  }
  return false;
}

// Il modo più economico per completare il percorso partendo da ciò che il
// giocatore ha già inserito: attraversare un'area già nota costa 0,
// qualsiasi altra costa 1 (BFS 0-1).
function bestCompletion() {
  const owned = ownedSet();
  const cost = { [game.start]: 0 };
  const prev = { [game.start]: null };
  const dq = [game.start];
  while (dq.length) {
    const u = dq.shift();
    for (const v of NB[u]) {
      const w = owned.has(v) ? 0 : 1;
      if (cost[v] === undefined || cost[u] + w < cost[v]) {
        cost[v] = cost[u] + w;
        prev[v] = u;
        if (w) dq.push(v); else dq.unshift(v);
      }
    }
  }
  const path = [];
  for (let c = game.end; c != null; c = prev[c]) path.unshift(c);
  return path.filter(s => !owned.has(s));
}

// ---------- Dati ----------
async function loadData(key) {
  if (!dataCache[key]) {
    const res = await fetch(MAPS[key].file);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    dataCache[key] = await res.json();
  }
  mapKey = key;
  MAP = MAPS[key];
  DATA = dataCache[key];
  NB = {};
  SIGLAS = [];
  NAME_INDEX = {};
  SEARCH_KEYS = [];
  for (const sig in DATA.areas) {
    NB[sig] = DATA.areas[sig].neighbors.slice();
    SIGLAS.push(sig);
  }
  for (const [a, b] of DATA.links) {
    if (!NB[a].includes(b)) NB[a].push(b);
    if (!NB[b].includes(a)) NB[b].push(a);
  }
  for (const sig of SIGLAS) {
    const p = area(sig);
    const names = [p.name, ...p.name.split('/'), ...(MAP.aliases[sig] || [])];
    const keys = new Set([...names.map(norm), ...names.map(normSpaced)]);
    for (const k of keys) {
      if (!k) continue;
      NAME_INDEX[k] = sig;
      SEARCH_KEYS.push({ sigla: sig, key: k });
    }
    if (MAP.codes) NAME_INDEX[norm(sig)] = sig;
  }
}

// ---------- Puzzle ----------
function pickPuzzle(rng) {
  for (let tries = 0; tries < 500; tries++) {
    const start = SIGLAS[Math.floor(rng() * SIGLAS.length)];
    const dist = bfs(start);
    const candidates = SIGLAS.filter(s => dist[s] >= MAP.minDist && dist[s] <= MAP.maxDist);
    if (candidates.length) return { start, end: candidates[Math.floor(rng() * candidates.length)] };
  }
  throw new Error('nessun puzzle valido');
}

function puzzleFromUrl() {
  const params = new URLSearchParams(location.search);
  const start = (params.get('da') || '').toUpperCase();
  const end = (params.get('a') || '').toUpperCase();
  if (!NB[start] || !NB[end] || start === end || NB[start].includes(end)) return null;
  return { start, end };
}

function makeGame(mode, fixed) {
  let puzzle, id = null, label;
  if (mode === 'daily') {
    id = dailyId();
    const dn = dayNumber(new Date());
    puzzle = pickPuzzle(mulberry32(dn * 2654435761 % 2147483647 + MAP.seedOffset));
    label = 'Puzzle #' + id;
  } else {
    puzzle = fixed || pickPuzzle(mulberry32((Math.random() * 2 ** 32) >>> 0));
    label = fixed ? 'Sfida' : 'Allenamento';
  }
  const distStart = bfs(puzzle.start);
  const distEnd = bfs(puzzle.end);
  const opt = distStart[puzzle.end];
  const needed = opt - 1;                       // aree intermedie minime
  const extra = Math.max(MAP.extraMin, Math.round(needed * MAP.extraFactor));
  return {
    mode, id, label,
    start: puzzle.start, end: puzzle.end, opt, needed,
    maxGuesses: needed + extra,
    distStart, distEnd,
    moves: [],              // [{sigla, type: 'guess'|'hint', color?}] in ordine cronologico
    over: false, won: false, gaveUp: false,
  };
}

const guesses = () => game.moves.filter(m => m.type === 'guess');
const isGuessed = (sig) => game.moves.some(m => m.type === 'guess' && m.sigla === sig);
const isHinted = (sig) => game.moves.some(m => m.type === 'hint' && m.sigla === sig);
const remaining = () => game.maxGuesses - game.moves.length;
const overPar = () => game.moves.length - game.needed;

function ownedSet() {
  const set = new Set([game.start, game.end]);
  for (const m of guesses()) set.add(m.sigla);
  return set;
}

function revealedList() {
  const list = [game.start, game.end, ...game.moves.map(m => m.sigla)];
  if (game.over) list.push(...shortestPath(game.start, game.end));
  return [...new Set(list)];
}

// Colore in base a quanto l'area allunga il percorso ottimale.
function colorFor(sig) {
  const detour = game.distStart[sig] + game.distEnd[sig] - game.opt;
  if (detour <= 0) return 'g-ok';
  if (detour <= 2) return 'g-near';
  return 'g-far';
}

// ---------- Mappa ----------
function buildMap() {
  $('layer-prov').innerHTML = SIGLAS.map(s =>
    `<path class="prov" id="p-${s}" data-sig="${s}" d="${area(s).path}"/>`).join('');
  $('layer-regions').innerHTML = Object.values(DATA.groups).map(d =>
    `<path class="region" d="${d}"/>`).join('');
  $('layer-sea').innerHTML = DATA.links.map(([a, b, icon]) => {
    const pa = area(a), pb = area(b);
    const mx = (pa.lx + pb.lx) / 2, my = (pa.ly + pb.ly) / 2;
    return `<g class="sea" data-a="${a}" data-b="${b}">` +
           `<line class="sea-edge" x1="${pa.lx}" y1="${pa.ly}" x2="${pb.lx}" y2="${pb.ly}"/>` +
           `<text class="ferry" x="${mx}" y="${my}">${icon}</text></g>`;
  }).join('');
}

function showTooltip(e) {
  const sig = e.target.dataset && e.target.dataset.sig;
  const tip = $('tooltip');
  if (!sig || !game || !revealedList().includes(sig)) { tip.hidden = true; return; }
  const p = area(sig);
  tip.innerHTML = `${esc(p.name)} <small>${esc(p.group)}</small>`;
  const rect = $('map-wrap').getBoundingClientRect();
  tip.style.left = (e.clientX - rect.left) + 'px';
  tip.style.top = (e.clientY - rect.top) + 'px';
  tip.hidden = false;
}
function hideTooltip() { $('tooltip').hidden = true; }

// Nel quotidiano in corso la mappa è nascosta: si vedono solo le aree già
// scoperte. A fine partita (e in allenamento) compare tutta la mappa.
const isFogged = () => game.mode === 'daily' && !game.over;

function paintMap() {
  const solution = game.over ? new Set(shortestPath(game.start, game.end)) : new Set();
  const fog = isFogged();
  const shown = new Set(revealedList());
  $('map').classList.toggle('fog', fog);
  for (const g of $('layer-sea').children) {
    g.classList.toggle('hidden', fog && !(shown.has(g.dataset.a) && shown.has(g.dataset.b)));
  }
  for (const sig of SIGLAS) {
    const cls = ['prov'];
    if (fog && !shown.has(sig)) cls.push('hidden');
    if (sig === game.start) cls.push('start');
    else if (sig === game.end) cls.push('end');
    else {
      const g = game.moves.find(m => m.sigla === sig && m.type === 'guess');
      if (g) cls.push(g.color);
      else if (isHinted(sig)) cls.push('hint');
      else if (solution.has(sig)) cls.push('solution');
    }
    if (solution.has(sig)) cls.push('path-hl');
    $('p-' + sig).setAttribute('class', cls.join(' '));
  }
  // Ordine di priorità: partenza, arrivo, poi le mosse dalla più recente.
  const order = [...new Set([game.start, game.end, ...game.moves.map(m => m.sigla).reverse(), ...shown])];
  $('layer-labels').innerHTML = order.map(s => {
    const p = area(s);
    return `<text class="label" x="${p.lx}" y="${p.ly}">${esc(shortName(s))}</text>`;
  }).join('');
  updateLabelSize();
}

// Nasconde le etichette che si sovrappongono a una con priorità più alta.
// Il nome resta disponibile toccando l'area e nell'elenco delle mosse.
function declutterLabels() {
  const kept = [];
  for (const el of $('layer-labels').children) {
    el.classList.remove('hidden');
    const b = el.getBBox();
    if (!b.width) continue;
    const clash = kept.some(k => b.x < k.x + k.width && k.x < b.x + b.width &&
                                 b.y < k.y + k.height && k.y < b.y + b.height);
    if (clash) el.classList.add('hidden');
    else kept.push(b);
  }
}

function bboxOf(sigs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sigs) {
    const b = area(s).bbox;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

// Adatta un riquadro alle proporzioni del contenitore.
function fitToWrap(box) {
  const wrap = $('map-wrap');
  const ratio = (wrap.clientWidth / wrap.clientHeight) || 1;
  let [x, y, w, h] = box;
  if (w / h < ratio) { const nw = h * ratio; x -= (nw - w) / 2; w = nw; }
  else { const nh = w / ratio; y -= (nh - h) / 2; h = nh; }
  return [x, y, w, h];
}

function targetView() {
  const full = DATA.viewBox;
  if (showAll) return fitToWrap(full);
  let [x, y, w, h] = bboxOf(revealedList());
  const pad = Math.max(w, h) * 0.2 + 20;
  x -= pad; y -= pad; w += 2 * pad; h += 2 * pad;
  const min = 160;
  if (w < min) { x -= (min - w) / 2; w = min; }
  if (h < min) { y -= (min - h) / 2; h = min; }
  if (w >= full[2] && h >= full[3]) return fitToWrap(full);
  return fitToWrap([x, y, w, h]);
}

function setView(v) {
  view = v;
  $('map').setAttribute('viewBox', v.map(n => n.toFixed(1)).join(' '));
  updateLabelSize();
}

function updateLabelSize() {
  if (!view) return;
  const px = $('map-wrap').clientWidth || 500;
  const unitsPerPx = view[2] / px;
  $('layer-labels').setAttribute('font-size', (13 * unitsPerPx).toFixed(2));
  $('layer-sea').setAttribute('font-size', (14 * unitsPerPx).toFixed(2));
  declutterLabels();
}

function updateZoom(animate = true) {
  const to = targetView();
  const from = view;
  if (!animate || !from || REDUCED_MOTION) { setView(to); return; }
  const t0 = performance.now();
  const dur = 550;
  cancelAnimationFrame(updateZoom.raf);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    setView(from.map((f, i) => f + (to[i] - f) * k));
    if (t < 1) updateZoom.raf = requestAnimationFrame(step);
  };
  updateZoom.raf = requestAnimationFrame(step);
}

function renderZoomButton() {
  const btn = $('btn-zoom');
  btn.textContent = showAll ? '🔍' : MAP.zoomIcon;
  btn.title = showAll ? 'Torna alla partita' : MAP.zoomTitle;
  btn.setAttribute('aria-label', btn.title);
}

function toggleShowAll() {
  showAll = !showAll;
  renderZoomButton();
  updateZoom();
}

// ---------- Interfaccia ----------
// Testi che dipendono dalla mappa: titolo, schede, input, aiuto.
function renderMapTexts() {
  document.title = `${GAME_TITLE} · ${MAP.title}`;
  for (const btn of document.querySelectorAll('[data-map]')) {
    btn.setAttribute('aria-selected', String(btn.dataset.map === mapKey));
  }
  $('guess-input').placeholder = MAP.placeholder;
  $('guess-input').setAttribute('aria-label', MAP.placeholder.replace('…', ''));
  for (const el of document.querySelectorAll('[data-u]')) el.textContent = MAP[el.dataset.u];
  $('help-links').textContent = MAP.linksNote;
  $('stats-map').textContent = MAP.tab;
}

function renderAll() {
  $('start-name').textContent = area(game.start).name;
  $('end-name').textContent = area(game.end).name;
  $('puzzle-id').textContent = game.label;
  $('mode-daily').setAttribute('aria-pressed', String(game.mode === 'daily'));
  $('mode-practice').setAttribute('aria-pressed', String(game.mode !== 'daily'));
  $('btn-new').textContent = game.mode === 'daily' ? '🎲 Allenamento' : '🎲 Nuova partita';

  const playing = !game.over;
  $('guess-input').disabled = !playing;
  $('btn-guess').disabled = !playing;
  $('actions-play').hidden = !playing;
  $('actions-over').hidden = playing;
  resetGiveUp();

  paintMap();
  renderStatus();
  renderMoves();
}

function renderStatus() {
  $('guess-count').innerHTML =
    `Tentativi rimasti: <b>${Math.max(0, remaining())}</b> <span class="muted">· minimo ${game.needed} ${MAP.many}</span>`;
  $('progress').innerHTML = Array.from({ length: game.maxGuesses }, (_, i) => {
    const m = game.moves[i];
    const cls = !m ? '' : (m.type === 'hint' ? 'hint' : m.color);
    return `<span class="seg ${cls}${i === game.needed - 1 ? ' par' : ''}"></span>`;
  }).join('');
}

function renderMoves() {
  $('guesses').innerHTML = game.moves.slice().reverse().map(m => {
    const p = area(m.sigla);
    if (m.type === 'hint') {
      return `<li class="hint-row"><span class="dot hint"></span><span>💡 ${esc(p.name)}</span><span class="reg">suggerimento</span></li>`;
    }
    return `<li><span class="dot ${m.color}"></span><span>${esc(p.name)}</span><span class="reg">${esc(p.group)}</span></li>`;
  }).join('');
}

function showMessage(text, kind = 'info') {
  const m = $('message');
  m.textContent = text;
  m.className = 'message ' + kind;
  m.hidden = false;
  clearTimeout(showMessage.timer);
  if (kind !== 'err') showMessage.timer = setTimeout(clearMessage, 4000);
}
function clearMessage() { $('message').hidden = true; }

function shake() {
  const input = $('guess-input');
  input.classList.remove('shake');
  void input.offsetWidth;          // riavvia l'animazione
  input.classList.add('shake');
}

// ---------- Mosse ----------
function submitGuess(sig) {
  if (game.over) return;
  if (!sig) { showMessage(MAP.unknown, 'err'); shake(); return; }
  const name = area(sig).name;
  if (sig === game.start || sig === game.end) { showMessage(`${name} è già la partenza o l'arrivo`, 'warn'); shake(); return; }
  if (isGuessed(sig)) { showMessage(`${name} ${MAP.already}`, 'warn'); shake(); return; }

  game.moves.push({ sigla: sig, type: 'guess', color: colorFor(sig) });
  clearMessage();
  afterMove();
}

function giveHint() {
  if (game.over) return;
  const pending = game.moves.find(m => m.type === 'hint' && !isGuessed(m.sigla));
  if (pending) { showMessage(`Hai già un suggerimento: prova con ${area(pending.sigla).name}!`, 'info'); return; }
  if (remaining() <= 1) { showMessage('Non hai abbastanza tentativi per un suggerimento', 'warn'); return; }
  const sig = bestCompletion()[0];
  if (!sig) return;
  game.moves.push({ sigla: sig, type: 'hint' });
  const p = area(sig);
  showMessage(`💡 Prova con ${p.name} (${p.group})`, 'info');
  afterMove();
}

function afterMove() {
  if (connected(game.start, game.end, ownedSet())) {
    game.won = true;
    game.over = true;
  } else if (remaining() <= 0) {
    game.over = true;
  }
  saveState();
  renderAll();
  updateZoom();
  if (game.over) finish();
}

function giveUp() {
  if (game.over) return;
  game.over = true;
  game.gaveUp = true;
  saveState();
  renderAll();
  updateZoom();
  finish();
}

function resetGiveUp() {
  const btn = $('btn-giveup');
  clearTimeout(resetGiveUp.timer);
  btn.classList.remove('confirm');
  btn.textContent = '🏳️ Mi arrendo';
}

function onGiveUpClick() {
  const btn = $('btn-giveup');
  if (btn.classList.contains('confirm')) { resetGiveUp(); giveUp(); return; }
  btn.classList.add('confirm');
  btn.textContent = 'Sicuro? Tocca di nuovo';
  resetGiveUp.timer = setTimeout(resetGiveUp, 3500);
}

function finish() {
  recordStats();
  const shown = game;
  setTimeout(() => { if (game === shown) showResult(); }, REDUCED_MOTION ? 0 : 700);
}

// ---------- Risultato e condivisione ----------
function scoreText() {
  if (!game.won) return game.gaveUp ? 'Arreso' : 'X';
  return overPar() <= 0 ? 'Perfetto' : '+' + overPar();
}

function showResult() {
  const route = `${area(game.start).name} → ${area(game.end).name}`;
  let title;
  if (game.won) title = overPar() <= 0 ? '🏆 Perfetto!' : '✅ Completato!';
  else title = game.gaveUp ? '🏳️ Ti sei arreso' : '😞 Tentativi esauriti';
  $('result-title').textContent = title;
  $('result-sub').textContent = `${route} · ${scoreText()} (${game.moves.length}/${game.maxGuesses})`;
  $('result-grid').textContent = game.moves.map(m => EMOJI[m.type === 'hint' ? 'hint' : m.color]).join('') || '—';

  const path = shortestPath(game.start, game.end);
  $('result-path').innerHTML = `<b>Un percorso ideale (${game.needed} ${MAP.many}):</b><br>` +
    path.map(s => `<span class="step">${esc(area(s).name)}</span>`).join(' <span class="sep">›</span> ');

  $('btn-practice').textContent = game.mode === 'daily' ? '🎲 Allenamento' : '🎲 Nuova partita';
  $('share-ok').hidden = true;
  openModal('result-modal');
  startCountdown();
}

function startCountdown() {
  const el = $('next-puzzle');
  clearInterval(countdownTimer);
  if (game.mode !== 'daily') { el.hidden = true; return; }
  const tick = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    if (dailyId() !== game.id) {
      el.textContent = 'È disponibile un nuovo puzzle: ricarica la pagina!';
      clearInterval(countdownTimer);
    } else {
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      el.textContent = `Prossimo puzzle tra ${hh}:${mm}:${ss}`;
    }
  };
  tick();
  el.hidden = false;
  countdownTimer = setInterval(tick, 1000);
}

function gameUrl() {
  if (!/^https?:/.test(location.protocol)) return '';
  const params = game.mode === 'daily' ? {} : { da: game.start, a: game.end };
  return location.origin + urlFor(params);
}

function shareText() {
  const head = game.mode === 'daily'
    ? `${GAME_TITLE} · ${MAP.title} #${game.id} · ${scoreText()}`
    : `${GAME_TITLE} · ${MAP.title} (${game.label.toLowerCase()}) · ${scoreText()}`;
  const route = `${area(game.start).name} → ${area(game.end).name}`;
  const grid = game.moves.map(m => EMOJI[m.type === 'hint' ? 'hint' : m.color]).join('');
  return [head, route, `${grid} (${game.moves.length}/${game.maxGuesses})`, gameUrl()].filter(Boolean).join('\n');
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback per contesti non sicuri (es. http://192.168.x.x)
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copia non riuscita');
}

async function share() {
  const text = shareText();
  const touch = matchMedia('(pointer: coarse)').matches;
  if (navigator.share && touch) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await copyText(text);
    $('share-ok').textContent = 'Copiato negli appunti!';
  } catch {
    $('share-ok').textContent = 'Impossibile copiare: seleziona il testo qui sopra.';
  }
  $('share-ok').hidden = false;
}

// ---------- Statistiche ----------
function defaultStats() {
  return { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {}, lastDailyId: null, lastWonId: null };
}

function loadStats() {
  const s = Object.assign(defaultStats(), store.get(statsKey(), {}));
  // compatibilità con la versione precedente, che non salvava lastWonId
  if (s.lastWonId == null && s.streak > 0) s.lastWonId = s.lastDailyId;
  return s;
}

function recordStats() {
  if (game.mode !== 'daily') return;
  const s = loadStats();
  if (s.lastDailyId === game.id) return;     // già registrata
  s.played++;
  if (game.won) {
    s.won++;
    s.streak = s.lastWonId === game.id - 1 ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    s.lastWonId = game.id;
    const k = overPar() <= 0 ? 'P' : '+' + overPar();
    s.dist[k] = (s.dist[k] || 0) + 1;
  } else {
    s.streak = 0;
    s.dist.X = (s.dist.X || 0) + 1;
  }
  s.lastDailyId = game.id;
  store.set(statsKey(), s);
}

function renderStats() {
  const s = loadStats();
  const streak = s.lastWonId != null && s.lastWonId >= dailyId() - 1 ? s.streak : 0;
  const pct = s.played ? Math.round(s.won / s.played * 100) : 0;
  const rank = k => k === 'P' ? -1 : k === 'X' ? 999 : parseInt(k.slice(1), 10);
  const keys = Object.keys(s.dist).sort((a, b) => rank(a) - rank(b));
  const max = Math.max(1, ...keys.map(k => s.dist[k]));
  const label = k => k === 'P' ? 'Perfetto' : k === 'X' ? 'Perse' : k;
  const bars = keys.length
    ? keys.map(k => `<div class="dist-bar"><span class="k">${label(k)}</span>` +
        `<span class="bar${k === 'X' ? ' lost' : ''}" style="width:${Math.max(8, s.dist[k] / max * 100)}%">${s.dist[k]}</span></div>`).join('')
    : '<p class="muted small">Gioca il puzzle quotidiano per iniziare a raccogliere statistiche.</p>';
  $('stats-body').innerHTML = `
    <div class="stat-row">
      <div><div class="num">${s.played}</div><div class="lbl">Giocate</div></div>
      <div><div class="num">${pct}%</div><div class="lbl">Vittorie</div></div>
      <div><div class="num">${streak}</div><div class="lbl">Serie</div></div>
      <div><div class="num">${s.maxStreak}</div><div class="lbl">Record</div></div>
    </div>
    <div class="dist"><b>Distribuzione punteggi</b>${bars}</div>`;
}

// ---------- Salvataggio della partita quotidiana ----------
function saveState() {
  if (game.mode !== 'daily') return;
  store.set(dailyPrefix() + game.id, {
    start: game.start, end: game.end,
    moves: game.moves, over: game.over, won: game.won, gaveUp: game.gaveUp,
  });
}

function restoreState() {
  const saved = store.get(dailyPrefix() + game.id, null);
  // Il salvataggio vale solo se si riferisce allo stesso puzzle.
  if (!saved || saved.start !== game.start || saved.end !== game.end || !Array.isArray(saved.moves)) return;
  game.moves = saved.moves.filter(m => NB[m.sigla]);
  game.over = !!saved.over;
  game.won = !!saved.won;
  game.gaveUp = !!saved.gaveUp;
}

function pruneOldStates() {
  const keep = dailyId() - 7;
  for (const map of Object.values(MAPS)) {
    const prefix = map.storagePrefix + 'daily_';
    for (const k of store.keys()) {
      const n = k.startsWith(prefix) ? Number(k.slice(prefix.length)) : NaN;
      if (Number.isInteger(n) && n < keep) store.remove(k);
    }
  }
}

// ---------- Autocompletamento ----------
let suggestionList = [];
let activeSug = -1;

// Restituisce [[id, punteggio]] ordinati: 0 esatto, 1 inizio, 2 inizio parola, 3 contenuto.
function searchAreas(q) {
  const best = new Map();
  const consider = (sig, score) => { if (!best.has(sig) || score < best.get(sig)) best.set(sig, score); };
  if (MAP.codes && NAME_INDEX[q] && q.length <= 2) consider(NAME_INDEX[q], 0);   // sigla esatta
  for (const { sigla, key } of SEARCH_KEYS) {
    if (key === q) consider(sigla, 0);
    else if (key.startsWith(q)) consider(sigla, 1);
    else if (key.includes(' ' + q)) consider(sigla, 2);
    else if (q.length >= 3 && key.includes(q)) consider(sigla, 3);
  }
  return [...best].sort((a, b) => a[1] - b[1] ||
    area(a[0]).name.localeCompare(area(b[0]).name, 'it'));
}

const available = (sig) => sig !== game.start && sig !== game.end && !isGuessed(sig);

function updateSuggestions() {
  const q = norm($('guess-input').value);
  suggestionList = q ? searchAreas(q).filter(([s]) => available(s)).slice(0, 8).map(([s]) => s) : [];
  activeSug = -1;
  const box = $('suggestions');
  box.innerHTML = suggestionList.map((s, i) => {
    const p = area(s);
    return `<li id="sug-${i}" role="option" data-sig="${s}"><span>${esc(p.name)}</span><span class="reg">${esc(p.group)}</span></li>`;
  }).join('');
  setSuggestionsOpen(suggestionList.length > 0);
}

function setSuggestionsOpen(open) {
  $('suggestions').hidden = !open;
  $('guess-input').setAttribute('aria-expanded', String(open));
  if (!open) $('guess-input').removeAttribute('aria-activedescendant');
}

function moveSug(dir) {
  if (!suggestionList.length) return;
  activeSug = (activeSug + dir + suggestionList.length) % suggestionList.length;
  [...$('suggestions').children].forEach((li, i) => li.classList.toggle('active', i === activeSug));
  $('guess-input').setAttribute('aria-activedescendant', 'sug-' + activeSug);
}

// Cosa inviare quando si preme Invio senza aver scelto dalla lista.
function resolveTyped(raw) {
  const q = norm(raw);
  if (!q) return { empty: true };
  if (NAME_INDEX[q]) return { sig: NAME_INDEX[q] };
  const found = searchAreas(q);
  const open = found.filter(([s]) => available(s));
  if (open.length === 1) return { sig: open[0][0] };
  if (open.length > 1 && open[0][1] < open[1][1]) return { sig: open[0][0] };
  if (open.length > 1) return { ambiguous: true };
  return { sig: found.length ? found[0][0] : null };
}

function pick(sig) {
  $('guess-input').value = '';
  setSuggestionsOpen(false);
  submitGuess(sig);
  $('guess-input').focus();
}

function onSubmit(e) {
  e.preventDefault();
  if (activeSug >= 0) { pick(suggestionList[activeSug]); return; }
  const r = resolveTyped($('guess-input').value);
  if (r.empty) return;
  if (r.ambiguous) { showMessage(MAP.ambiguous, 'warn'); return; }
  pick(r.sig);
}

// ---------- Modali ----------
let lastFocus = null;
function openModal(id) {
  closeModals(false);
  lastFocus = document.activeElement;
  $(id).hidden = false;
  const btn = $(id).querySelector('.primary') || $(id).querySelector('.close');
  if (btn) btn.focus();
}
function closeModals(restoreFocus = true) {
  document.querySelectorAll('.modal').forEach(m => { m.hidden = true; });
  clearInterval(countdownTimer);
  if (restoreFocus && lastFocus && lastFocus.focus) lastFocus.focus();
}

// ---------- Avvio ----------
function startGame(mode, fixed) {
  game = makeGame(mode, fixed);
  if (mode === 'daily') {
    restoreState();
    syncUrl();
  }
  showAll = false;
  renderZoomButton();
  clearMessage();
  setSuggestionsOpen(false);
  $('guess-input').value = '';
  renderAll();
  updateZoom(view !== null);
}

function newPractice() {
  closeModals(false);
  syncUrl();
  startGame('practice');
  $('guess-input').focus();
}

async function switchMap(key) {
  if (key === mapKey && game) return;
  closeModals(false);
  await loadData(key);
  view = null;
  buildMap();
  renderMapTexts();
  syncUrl();
  startGame('daily');
}

function init() {
  buildMap();
  renderMapTexts();
  pruneOldStates();
  const challenge = puzzleFromUrl();
  startGame(challenge ? 'practice' : 'daily', challenge);

  const svg = $('map');
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') showTooltip(e); });
  svg.addEventListener('pointerleave', hideTooltip);
  svg.addEventListener('click', (e) => {
    showTooltip(e);
    clearTimeout(showTooltip.timer);
    showTooltip.timer = setTimeout(hideTooltip, 1800);
  });

  $('guess-form').addEventListener('submit', onSubmit);
  const input = $('guess-input');
  input.addEventListener('input', updateSuggestions);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSug(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSug(-1); }
    else if (e.key === 'Escape') setSuggestionsOpen(false);
  });
  input.addEventListener('blur', () => setTimeout(() => setSuggestionsOpen(false), 120));
  // Alla pressione si evita solo che l'input perda il focus (e chiuda la lista).
  // La scelta avviene sul click: se la lista sparisse già alla pressione, su
  // touch screen il click finirebbe sul pulsante che c'è sotto.
  $('suggestions').addEventListener('pointerdown', (e) => e.preventDefault());
  $('suggestions').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) pick(li.dataset.sig);
  });

  for (const btn of document.querySelectorAll('[data-map]')) {
    btn.addEventListener('click', () => switchMap(btn.dataset.map).catch(showLoadError));
  }
  $('btn-hint').addEventListener('click', giveHint);
  $('btn-giveup').addEventListener('click', onGiveUpClick);
  $('btn-show-result').addEventListener('click', showResult);
  $('btn-new').addEventListener('click', newPractice);
  $('btn-practice').addEventListener('click', newPractice);
  $('btn-share').addEventListener('click', share);
  $('btn-zoom').addEventListener('click', toggleShowAll);
  $('mode-daily').addEventListener('click', () => { if (game.mode !== 'daily') startGame('daily'); });
  $('mode-practice').addEventListener('click', () => { if (game.mode === 'daily') newPractice(); });
  $('btn-help').addEventListener('click', () => openModal('help-modal'));
  $('btn-stats').addEventListener('click', () => { renderStats(); openModal('stats-modal'); });

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModals()));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => {
    if (e.target === m) closeModals();
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.modal:not([hidden])')) closeModals();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => updateZoom(false), 100);
  });

  if (!store.get('pi_seen_help', false)) {
    openModal('help-modal');
    store.set('pi_seen_help', true);
  }
}

function showLoadError(err) {
  document.querySelector('main').innerHTML =
    `<p class="load-error">Errore nel caricamento dei dati: ${esc(err.message)}</p>`;
}

loadData(mapFromUrl()).then(init).catch(showLoadError);
