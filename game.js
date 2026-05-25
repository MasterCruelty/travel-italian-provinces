'use strict';

// ---------- Aliases (alternate spellings accepted as input) ----------
const ALIASES = {
  AO: ["aosta", "valle daosta", "valle d'aosta", "vallee daoste"],
  BZ: ["bolzano", "bozen", "alto adige", "sudtirol"],
  FC: ["forli", "cesena", "forli cesena"],
  MB: ["monza", "brianza", "monza e brianza", "monza e della brianza"],
  MS: ["massa", "carrara", "massa carrara"],
  PU: ["pesaro", "urbino", "pesaro e urbino"],
  RC: ["reggio calabria", "reggio di calabria"],
  RE: ["reggio emilia", "reggio nellemilia", "reggio nell'emilia"],
  VB: ["verbania", "vco", "verbano cusio ossola"],
  BT: ["barletta", "andria", "trani", "bat", "barletta andria trani"],
  SU: ["sud sardegna", "carbonia", "iglesias", "carbonia iglesias", "medio campidano"],
  SP: ["la spezia", "spezia"],
  AQ: ["laquila", "aquila", "l'aquila"],
  VS: [],
};

// ---------- State ----------
let DATA = null;
let NB = {};            // sigla -> [neighbors]
let SIGLAS = [];
let NAME_INDEX = {};    // normalized string -> sigla
let SEARCH_LIST = [];   // {sigla, name, region, norm}

let game = null;        // current puzzle/game state

// ---------- Utils ----------
function norm(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayNumber(d) {
  // local-date day index
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

// BFS distances from a source over the full graph
function bfs(src) {
  const dist = {}; dist[src] = 0;
  const q = [src];
  while (q.length) {
    const u = q.shift();
    for (const v of NB[u]) {
      if (dist[v] === undefined) { dist[v] = dist[u] + 1; q.push(v); }
    }
  }
  return dist;
}

// shortest path (list of siglas) start->end
function shortestPath(a, b) {
  const prev = {}; prev[a] = null;
  const q = [a];
  while (q.length) {
    const u = q.shift();
    if (u === b) break;
    for (const v of NB[u]) {
      if (prev[v] === undefined) { prev[v] = u; q.push(v); }
    }
  }
  if (prev[b] === undefined) return null;
  const path = []; let c = b;
  while (c !== null) { path.unshift(c); c = prev[c]; }
  return path;
}

// connectivity within subgraph of allowed nodes
function connected(a, b, allowed) {
  if (a === b) return true;
  const seen = new Set([a]); const q = [a];
  while (q.length) {
    const u = q.shift();
    for (const v of NB[u]) {
      if (!seen.has(v) && allowed.has(v)) {
        if (v === b) return true;
        seen.add(v); q.push(v);
      }
    }
  }
  return false;
}

// ---------- Data load + index ----------
async function loadData() {
  const res = await fetch('data/game_data.json');
  DATA = await res.json();
  for (const sig in DATA.provinces) {
    NB[sig] = DATA.provinces[sig].neighbors;
    SIGLAS.push(sig);
  }
  // add sea edges into neighbor lists (data already includes them via build, but be safe)
  for (const [a, b] of DATA.sea_edges) {
    if (!NB[a].includes(b)) NB[a].push(b);
    if (!NB[b].includes(a)) NB[b].push(a);
  }
  for (const sig of SIGLAS) {
    const p = DATA.provinces[sig];
    const add = (str) => { const n = norm(str); if (n) NAME_INDEX[n] = sig; };
    add(p.name);
    add(sig);
    // strip slashed bilingual names: take each part
    p.name.split('/').forEach(part => add(part));
    (ALIASES[sig] || []).forEach(add);
    SEARCH_LIST.push({ sigla: sig, name: p.name, region: p.region, norm: norm(p.name) });
  }
  SEARCH_LIST.sort((x, y) => x.name.localeCompare(y.name, 'it'));
}

// ---------- Puzzle selection ----------
function pickPuzzle(rng) {
  // choose start, then an end at a pleasant distance
  for (let tries = 0; tries < 400; tries++) {
    const start = SIGLAS[Math.floor(rng() * SIGLAS.length)];
    const dist = bfs(start);
    const candidates = SIGLAS.filter(s => dist[s] >= 4 && dist[s] <= 8);
    if (!candidates.length) continue;
    const end = candidates[Math.floor(rng() * candidates.length)];
    return { start, end, opt: dist[end] };
  }
  // fallback
  const start = SIGLAS[0]; const dist = bfs(start);
  let end = start, best = 0;
  for (const s of SIGLAS) if (dist[s] > best) { best = dist[s]; end = s; }
  return { start, end, opt: best };
}

function makeGame(mode) {
  let rng, id, label;
  if (mode === 'daily') {
    const dn = dayNumber(new Date());
    const epoch = dayNumber(new Date(2024, 0, 1));
    id = dn - epoch + 1;
    rng = mulberry32(dn * 2654435761 % 2147483647 + 12345);
    label = 'Puzzle quotidiano #' + id;
  } else {
    id = null;
    rng = mulberry32(Math.floor(Math.random() * 2 ** 31));
    label = 'Partita casuale';
  }
  const p = pickPuzzle(rng);
  const needed = p.opt - 1;                       // min intermediate provinces
  const extra = Math.max(3, Math.round(needed * 0.8));
  const distStart = bfs(p.start);
  const distEnd = bfs(p.end);
  return {
    mode, id, label,
    start: p.start, end: p.end, opt: p.opt,
    needed, maxGuesses: needed + extra,
    distStart, distEnd,
    guesses: [],          // [{sigla, color}]
    hints: [],            // siglas revealed by hint
    over: false, won: false,
  };
}

// color class for a province given its detour from optimal
function colorFor(sig) {
  const through = game.distStart[sig] + game.distEnd[sig];
  const detour = through - game.opt;
  if (detour <= 0) return 'g-ok';
  if (detour <= 2) return 'g-near';
  return 'g-far';
}

// ---------- Rendering ----------
const $ = (id) => document.getElementById(id);

function buildMap() {
  const svg = $('map');
  svg.setAttribute('viewBox', DATA.viewBox.join(' '));
  let html = '';
  // sea edges
  for (const [a, b] of DATA.sea_edges) {
    const pa = DATA.provinces[a], pb = DATA.provinces[b];
    html += `<line class="sea-edge" x1="${pa.cx}" y1="${pa.cy}" x2="${pb.cx}" y2="${pb.cy}"/>`;
  }
  for (const sig of SIGLAS) {
    const p = DATA.provinces[sig];
    html += `<path class="prov" id="p-${sig}" data-sig="${sig}" d="${p.path}"/>`;
  }
  svg.innerHTML = html;

  svg.addEventListener('pointermove', onMapHover);
  svg.addEventListener('pointerleave', () => { $('tooltip').hidden = true; });
}

function isRevealed(sig) {
  return sig === game.start || sig === game.end ||
         game.guesses.some(g => g.sigla === sig) || game.hints.includes(sig);
}

function onMapHover(e) {
  const t = e.target;
  const tip = $('tooltip');
  if (t && t.dataset && t.dataset.sig && isRevealed(t.dataset.sig)) {
    const p = DATA.provinces[t.dataset.sig];
    tip.textContent = p.name;
    const rect = $('map-wrap').getBoundingClientRect();
    tip.style.left = (e.clientX - rect.left) + 'px';
    tip.style.top = (e.clientY - rect.top) + 'px';
    tip.hidden = false;
  } else {
    tip.hidden = true;
  }
}

function paintMap() {
  for (const sig of SIGLAS) {
    const el = $('p-' + sig);
    el.setAttribute('class', 'prov');
  }
  $('p-' + game.start).classList.add('start');
  $('p-' + game.end).classList.add('end');
  for (const g of game.guesses) {
    if (g.sigla === game.start || g.sigla === game.end) continue;
    $('p-' + g.sigla).classList.add(g.color);
  }
  for (const h of game.hints) {
    if (!isGuessed(h) && h !== game.start && h !== game.end)
      $('p-' + h).classList.add('hint');
  }
}

function isGuessed(sig) { return game.guesses.some(g => g.sigla === sig); }

function renderPrompt() {
  $('start-name').textContent = DATA.provinces[game.start].name;
  $('end-name').textContent = DATA.provinces[game.end].name;
  $('puzzle-id').textContent = game.label;
}

function renderStatus() {
  const remaining = game.maxGuesses - game.guesses.length;
  $('guess-count').textContent = 'Tentativi rimasti: ' + Math.max(0, remaining);
}

function renderGuesses() {
  const ul = $('guesses');
  ul.innerHTML = '';
  for (const g of game.guesses) {
    const p = DATA.provinces[g.sigla];
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot ${g.color}"></span><span>${p.name}</span><span class="reg">${p.region}</span>`;
    ul.appendChild(li);
  }
  for (const h of game.hints) {
    if (isGuessed(h)) continue;
    const p = DATA.provinces[h];
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot hint"></span><span>${p.name}</span><span class="reg">suggerimento</span>`;
    ul.appendChild(li);
  }
}

function showMessage(text, kind) {
  const m = $('message');
  m.textContent = text;
  m.className = 'message ' + (kind || 'info');
  m.hidden = false;
}
function clearMessage() { $('message').hidden = true; }

// ---------- Guess handling ----------
function currentAllowed() {
  // Hints are guidance only: they do NOT count toward the connecting network.
  const set = new Set([game.start, game.end]);
  for (const g of game.guesses) set.add(g.sigla);
  return set;
}

function submitGuess(raw) {
  if (game.over) return;
  const key = norm(raw);
  if (!key) return;
  const sig = NAME_INDEX[key];
  if (!sig) { showMessage('Provincia non riconosciuta', 'err'); return; }
  if (sig === game.start || sig === game.end) { showMessage('È già partenza o arrivo', 'warn'); return; }
  if (isGuessed(sig)) { showMessage(DATA.provinces[sig].name + ' è già stata inserita', 'warn'); return; }

  const color = colorFor(sig);
  game.guesses.push({ sigla: sig, color });
  // remove from hints list if it was hinted
  game.hints = game.hints.filter(h => h !== sig);
  clearMessage();

  paintMap();
  renderGuesses();
  renderStatus();
  checkEnd();
  saveState();
}

function checkEnd() {
  const allowed = currentAllowed();
  if (connected(game.start, game.end, allowed)) {
    game.won = true; game.over = true;
    finish();
    return;
  }
  if (game.guesses.length >= game.maxGuesses) {
    game.over = true;
    finish();
  }
}

// ---------- Hint ----------
function giveHint() {
  if (game.over) return;
  const path = shortestPath(game.start, game.end);
  if (!path) return;
  const mid = path.slice(1, -1);
  const candidate = mid.find(s => !isGuessed(s) && !game.hints.includes(s));
  if (!candidate) { showMessage('Nessun suggerimento disponibile', 'info'); return; }
  game.hints.push(candidate);
  showMessage('Suggerimento: ' + DATA.provinces[candidate].name + ' (' + DATA.provinces[candidate].region + ')', 'info');
  paintMap();
  renderGuesses();
  saveState();
}

// ---------- Finish / result ----------
function finish() {
  $('guess-input').disabled = true;
  $('btn-guess').disabled = true;
  $('btn-hint').disabled = true;
  $('btn-giveup').disabled = true;
  highlightSolution();
  recordStats();
  saveState();
  setTimeout(showResult, 350);
}

function highlightSolution() {
  const path = shortestPath(game.start, game.end);
  if (!path) return;
  for (const s of path) $('p-' + s).classList.add('path-hl');
}

function buildShareGrid() {
  const emoji = { 'g-ok': '🟩', 'g-near': '🟧', 'g-far': '🟥' };
  return game.guesses.map(g => emoji[g.color] || '⬜').join('');
}

function scoreText() {
  if (!game.won) return 'X';
  const over = game.guesses.length - game.needed;
  return over <= 0 ? 'Perfetto' : '+' + over;
}

function showResult() {
  const over = game.guesses.length - game.needed;
  $('result-title').textContent = game.won
    ? (over <= 0 ? '🏆 Perfetto!' : '✅ Completato!')
    : '😞 Tentativi esauriti';
  const sub = game.won
    ? `${DATA.provinces[game.start].name} → ${DATA.provinces[game.end].name} · ${scoreText()}`
    : `Percorso minimo: ${game.needed} province`;
  $('result-sub').textContent = sub;
  $('result-grid').textContent = buildShareGrid();

  // optimal path display
  const path = shortestPath(game.start, game.end);
  const names = path.map(s => DATA.provinces[s].name);
  $('result-path').innerHTML = '<b>Un percorso ideale:</b><br>' +
    names.map(n => `<span>${n}</span>`).join('<span class="sep">›</span>');

  $('btn-practice').style.display = (game.mode === 'daily') ? '' : 'none';
  $('share-ok').hidden = true;
  openModal('result-modal');
}

function shareText() {
  const head = game.mode === 'daily'
    ? `Province Italiane #${game.id} · ${scoreText()}`
    : `Province Italiane (casuale) · ${scoreText()}`;
  const route = `${DATA.provinces[game.start].name} → ${DATA.provinces[game.end].name}`;
  return `${head}\n${route}\n${buildShareGrid()} (${game.guesses.length}/${game.maxGuesses})`;
}

// ---------- Stats (localStorage) ----------
const STATS_KEY = 'pi_stats_v1';
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
  catch { return {}; }
}
function defaultStats() {
  return { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {}, lastDailyId: null };
}
function recordStats() {
  if (game.mode !== 'daily') return;
  const s = Object.assign(defaultStats(), loadStats());
  if (s.lastDailyId === game.id) return; // already recorded
  s.lastDailyId = game.id;
  s.played++;
  if (game.won) {
    s.won++;
    s.streak++;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    const over = Math.max(0, game.guesses.length - game.needed);
    const k = over === 0 ? 'P' : '+' + over;
    s.dist[k] = (s.dist[k] || 0) + 1;
  } else {
    s.streak = 0;
  }
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}
function renderStats() {
  const s = Object.assign(defaultStats(), loadStats());
  const pct = s.played ? Math.round(s.won / s.played * 100) : 0;
  const keys = Object.keys(s.dist).sort((a, b) => {
    const va = a === 'P' ? -1 : parseInt(a.slice(1));
    const vb = b === 'P' ? -1 : parseInt(b.slice(1));
    return va - vb;
  });
  const max = Math.max(1, ...keys.map(k => s.dist[k]));
  let bars = keys.length ? '' : '<p class="muted small">Nessuna partita ancora.</p>';
  for (const k of keys) {
    const w = Math.round(s.dist[k] / max * 100);
    const lbl = k === 'P' ? 'Perfetto' : k;
    bars += `<div class="dist-bar"><span class="k">${lbl}</span><span class="bar" style="width:${w}%">${s.dist[k]}</span></div>`;
  }
  $('stats-body').innerHTML = `
    <div class="stat-row">
      <div><div class="num">${s.played}</div><div class="lbl">Giocate</div></div>
      <div><div class="num">${pct}%</div><div class="lbl">Vittorie</div></div>
      <div><div class="num">${s.streak}</div><div class="lbl">Serie</div></div>
      <div><div class="num">${s.maxStreak}</div><div class="lbl">Record</div></div>
    </div>
    <div><b>Distribuzione punteggi</b>${bars}</div>`;
}

// ---------- Save/restore daily progress ----------
function stateKey() { return 'pi_daily_' + game.id; }
function saveState() {
  if (game.mode !== 'daily') return;
  const data = { guesses: game.guesses, hints: game.hints, over: game.over, won: game.won };
  localStorage.setItem(stateKey(), JSON.stringify(data));
}
function restoreState() {
  if (game.mode !== 'daily') return;
  let saved;
  try { saved = JSON.parse(localStorage.getItem(stateKey())); } catch { saved = null; }
  if (!saved) return;
  game.guesses = saved.guesses || [];
  game.hints = saved.hints || [];
  game.over = !!saved.over;
  game.won = !!saved.won;
}

// ---------- Suggestions / autocomplete ----------
let activeSug = -1;
function updateSuggestions() {
  const q = norm($('guess-input').value);
  const box = $('suggestions');
  if (!q) { box.hidden = true; return; }
  const matches = SEARCH_LIST
    .filter(it => it.norm.includes(q) || (NAME_INDEX[q] === it.sigla))
    .filter(it => it.sigla !== game.start && it.sigla !== game.end && !isGuessed(it.sigla))
    .slice(0, 8);
  // also catch alias hits
  if (!matches.length && NAME_INDEX[q]) {
    const sig = NAME_INDEX[q];
    const p = DATA.provinces[sig];
    matches.push({ sigla: sig, name: p.name, region: p.region });
  }
  if (!matches.length) { box.hidden = true; return; }
  activeSug = -1;
  box.innerHTML = matches.map((it, i) =>
    `<li data-name="${it.name.replace(/"/g, '&quot;')}" data-i="${i}"><span>${it.name}</span><span class="reg">${it.region}</span></li>`
  ).join('');
  Array.from(box.children).forEach(li => {
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      $('guess-input').value = '';
      box.hidden = true;
      submitGuess(li.dataset.name);
    });
  });
  box.hidden = false;
}

function moveSug(dir) {
  const box = $('suggestions');
  if (box.hidden) return;
  const items = Array.from(box.children);
  if (!items.length) return;
  activeSug = (activeSug + dir + items.length) % items.length;
  items.forEach((li, i) => li.classList.toggle('active', i === activeSug));
}

// ---------- Modals ----------
function openModal(id) { $(id).hidden = false; }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.hidden = true); }

// ---------- Wire up ----------
function startGame(mode) {
  game = makeGame(mode);
  if (mode === 'daily') restoreState();
  $('guess-input').disabled = game.over;
  $('btn-guess').disabled = game.over;
  $('btn-hint').disabled = game.over;
  $('btn-giveup').disabled = game.over;
  clearMessage();
  renderPrompt();
  paintMap();
  renderGuesses();
  renderStatus();
  if (game.over) { highlightSolution(); }
}

function init() {
  buildMap();
  startGame('daily');

  $('guess-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const box = $('suggestions');
    if (!box.hidden && activeSug >= 0) {
      const li = box.children[activeSug];
      if (li) { $('guess-input').value = ''; box.hidden = true; submitGuess(li.dataset.name); return; }
    }
    const val = $('guess-input').value;
    $('guess-input').value = '';
    box.hidden = true;
    submitGuess(val);
  });

  const input = $('guess-input');
  input.addEventListener('input', updateSuggestions);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSug(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSug(-1); }
    else if (e.key === 'Escape') { $('suggestions').hidden = true; }
  });
  input.addEventListener('blur', () => setTimeout(() => { $('suggestions').hidden = true; }, 150));

  $('btn-hint').addEventListener('click', giveHint);
  $('btn-giveup').addEventListener('click', () => {
    if (game.over) return;
    if (confirm('Vuoi arrenderti e vedere la soluzione?')) {
      game.over = true; game.won = false; finish();
    }
  });

  $('btn-help').addEventListener('click', () => openModal('help-modal'));
  $('btn-stats').addEventListener('click', () => { renderStats(); openModal('stats-modal'); });
  $('btn-practice').addEventListener('click', () => { closeModals(); startGame('practice'); });
  $('btn-share').addEventListener('click', async () => {
    const text = shareText();
    try {
      if (navigator.share && /Mobi/.test(navigator.userAgent)) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        $('share-ok').hidden = false;
      }
    } catch {
      await navigator.clipboard.writeText(text).catch(() => {});
      $('share-ok').hidden = false;
    }
  });

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => {
    if (e.target === m) closeModals();
  }));

  // first-visit help
  if (!localStorage.getItem('pi_seen_help')) {
    openModal('help-modal');
    localStorage.setItem('pi_seen_help', '1');
  }
}

loadData().then(init).catch(err => {
  document.querySelector('main').innerHTML = '<p style="padding:20px">Errore nel caricamento dei dati: ' + err.message + '</p>';
});
