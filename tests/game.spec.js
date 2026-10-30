const { test, expect } = require('@playwright/test');

// Caserta -> Firenze: percorso minimo Frosinone, Roma, Viterbo, Siena.
const CHALLENGE = '/?da=CE&a=FI';

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('pi_seen_help', 'true'));
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

async function open(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof game !== 'undefined' && game !== null);
}

async function guess(page, text) {
  await page.fill('#guess-input', text);
  await page.press('#guess-input', 'Enter');
}

const state = (page) => page.evaluate(() => ({
  start: game.start, end: game.end, mode: game.mode, over: game.over, won: game.won,
  moves: game.moves.map(m => m.type + ':' + m.sigla),
}));

test('mostra il puzzle quotidiano con la mappa completa', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('.prov')).toHaveCount(110);
  const s = await state(page);
  expect(s.mode).toBe('daily');
  await expect(page.locator(`#p-${s.start}`)).toHaveClass(/start/);
  await expect(page.locator(`#p-${s.end}`)).toHaveClass(/end/);
  await expect(page.locator('#layer-labels text')).toHaveCount(2);
  await expect(page.locator('#puzzle-id')).toHaveText(/Puzzle #\d+/);
});

test('nel quotidiano la mappa si scopre man mano e compare tutta a fine partita', async ({ page }) => {
  await open(page, '/');
  const visible = page.locator('.prov:not(.hidden)');
  await expect(visible).toHaveCount(2);
  await expect(page.locator('#layer-regions')).toBeHidden();
  await expect(page.locator('.sea:not(.hidden)')).toHaveCount(0);

  const s = await state(page);
  const far = await page.evaluate(() =>
    SIGLAS.find(x => x !== game.start && x !== game.end && !NB[game.start].includes(x) && !NB[game.end].includes(x)));
  await page.evaluate(x => submitGuess(x), far);
  await expect(visible).toHaveCount(3);
  await expect(page.locator(`#p-${far}`)).not.toHaveClass(/hidden/);
  await expect(page.locator(`#p-${s.start}`)).toHaveClass(/start/);

  await page.click('#btn-giveup');
  await page.click('#btn-giveup');
  await expect(visible).toHaveCount(110);
  await expect(page.locator('#layer-regions')).toBeVisible();
  await expect(page.locator('.sea:not(.hidden)')).toHaveCount(2);
});

test('in allenamento la mappa è sempre completa', async ({ page }) => {
  await open(page, CHALLENGE);
  await expect(page.locator('.prov:not(.hidden)')).toHaveCount(110);
  await expect(page.locator('#layer-regions')).toBeVisible();
  await page.click('#mode-practice');
  await expect(page.locator('.prov:not(.hidden)')).toHaveCount(110);
});

test('il pulsante per il caffè porta al PayPal in una nuova scheda', async ({ page }) => {
  await open(page, CHALLENGE);
  const links = page.locator('a.coffee');
  await expect(links.first()).toBeVisible();
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', 'https://paypal.me/mastercruelty');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  }
  await page.click('#btn-giveup');
  await page.click('#btn-giveup');
  await expect(page.locator('#result-modal a.coffee')).toBeVisible();
});

test('l\'aiuto compare alla prima visita e si chiude con Esc', async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('/');
  await expect(page.locator('#help-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-modal')).toBeHidden();
  await page.reload();
  await expect(page.locator('#help-modal')).toBeHidden();
  await page.close();
});

test('percorso ottimale: Perfetto, statistiche e condivisione', async ({ page }) => {
  await open(page, '/');
  const names = await page.evaluate(() =>
    shortestPath(game.start, game.end).slice(1, -1).map(s => DATA.areas[s].name));
  for (const n of names) await guess(page, n);

  await expect(page.locator('#result-modal')).toBeVisible();
  await expect(page.locator('#result-title')).toHaveText(/Perfetto/);
  await expect(page.locator('#next-puzzle')).toHaveText(/Prossimo puzzle tra \d\d:\d\d:\d\d/);
  const text = await page.evaluate(() => shareText());
  expect(text).toMatch(/^Travel Maps · Province Italiane #\d+ · Perfetto\n/);
  expect(text).toContain('🟩'.repeat(names.length));

  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('pi_stats_v1')));
  expect(stats).toMatchObject({ played: 1, won: 1, streak: 1, dist: { P: 1 } });
});

test('la partita quotidiana sopravvive al ricaricamento', async ({ page }) => {
  await open(page, '/');
  const sig = await page.evaluate(() => shortestPath(game.start, game.end)[1]);
  await page.evaluate(s => submitGuess(s), sig);
  await page.reload();
  await page.waitForFunction(() => game !== null);
  expect((await state(page)).moves).toEqual(['guess:' + sig]);

  await page.click('#btn-giveup');
  await page.click('#btn-giveup');
  await expect(page.locator('#result-modal')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => game !== null);
  await expect(page.locator('#btn-show-result')).toBeVisible();
  await expect(page.locator('#guess-input')).toBeDisabled();
  await page.click('#btn-show-result');
  await expect(page.locator('#result-title')).toHaveText(/arreso/);
});

test('autocompletamento: alias, apostrofi, sigle e ambiguità', async ({ page }) => {
  await open(page, CHALLENGE);

  await page.fill('#guess-input', 'reggio emilia');
  await expect(page.locator('#suggestions li').first()).toContainText("Reggio nell'Emilia");

  await page.fill('#guess-input', 'reggio');
  await expect(page.locator('#suggestions li')).toHaveCount(2);
  await page.press('#guess-input', 'Enter');
  await expect(page.locator('#message')).toContainText('Più province');
  expect((await state(page)).moves).toEqual([]);

  await guess(page, 'Fros');                       // prefisso univoco
  await guess(page, 'laquila');
  await guess(page, "l'aquila");                   // stessa provincia: rifiutata
  await expect(page.locator('#message')).toContainText('già stata inserita');
  await guess(page, 'rm');                         // sigla
  await guess(page, 'forlì');                      // accento
  expect((await state(page)).moves).toEqual(['guess:FR', 'guess:AQ', 'guess:RM', 'guess:FC']);

  await page.fill('#guess-input', 'Vit');
  await page.press('#guess-input', 'ArrowDown');
  await page.press('#guess-input', 'Enter');
  expect((await state(page)).moves.at(-1)).toBe('guess:VT');
});

test('input non valido o già usato non consuma tentativi', async ({ page }) => {
  await open(page, CHALLENGE);
  await guess(page, 'Atlantide');
  await expect(page.locator('#message')).toHaveText('Provincia non riconosciuta');
  await guess(page, 'Caserta');
  await expect(page.locator('#message')).toContainText('partenza');
  expect((await state(page)).moves).toEqual([]);
  await expect(page.locator('#guess-count')).toContainText('Tentativi rimasti: 7');
});

test('colori in base alla deviazione dal percorso ideale', async ({ page }) => {
  await open(page, CHALLENGE);
  await guess(page, 'Roma');
  await guess(page, 'Rieti');
  await guess(page, 'Trapani');
  await expect(page.locator('#p-RM')).toHaveClass(/g-ok/);
  await expect(page.locator('#p-RI')).toHaveClass(/g-near/);
  await expect(page.locator('#p-TP')).toHaveClass(/g-far/);
});

test('il suggerimento procede a livelli senza rivelare il nome', async ({ page }) => {
  await open(page, CHALLENGE);
  await guess(page, 'Frosinone');
  await guess(page, 'Roma');

  // 1° livello: contorno di Viterbo sulla mappa, senza nome
  await page.click('#btn-hint');
  await expect(page.locator('#p-VT')).toHaveClass(/hint/);
  await expect(page.locator('#message')).toContainText('contorno');
  await expect(page.locator('#message')).not.toContainText('Viterbo');
  await expect(page.locator('#layer-labels')).not.toContainText('Viterbo');
  await expect(page.locator('#layer-labels')).toContainText('?');
  await expect(page.locator('#guesses')).not.toContainText('Viterbo');
  await expect(page.locator('#guess-count')).toContainText('Tentativi rimasti: 4');
  await expect(page.locator('#btn-hint')).toContainText('Iniziali');

  // 2° livello: iniziali
  await page.click('#btn-hint');
  await expect(page.locator('#message .initials')).toHaveAttribute('aria-label', 'V______');
  await expect(page.locator('#message .blank')).toHaveCount(6);
  await expect(page.locator('#guesses .initials')).toHaveAttribute('aria-label', 'V______');
  await expect(page.locator('#guess-count')).toContainText('Tentativi rimasti: 3');

  // Altri tocchi: nessun costo
  await page.click('#btn-hint');
  await expect(page.locator('#guess-count')).toContainText('Tentativi rimasti: 3');

  await guess(page, 'Viterbo');
  await expect(page.locator('#layer-labels')).toContainText('Viterbo');
  await guess(page, 'Siena');
  await expect(page.locator('#result-title')).toHaveText(/Completato/);
  expect(await page.evaluate(() => shareText())).toContain('🟩🟩💡💡🟩🟩 (6/7)');
});

test('le iniziali mantengono spazi e apostrofi', async ({ page }) => {
  await open(page, CHALLENGE);
  expect(await page.evaluate(() => [initials('RE'), initials('AQ'), initials('BZ')]))
    .toEqual(["R_____ n___'E_____", "L'A_____", 'B______']);
});

test('un suggerimento salvato dalla versione precedente vale come iniziali', async ({ page }) => {
  await open(page, '/');
  await page.evaluate(() => {
    const sig = bestCompletion()[0];
    localStorage.setItem('pi_daily_' + game.id, JSON.stringify({
      start: game.start, end: game.end, moves: [{ sigla: sig, type: 'hint' }], over: false, won: false, gaveUp: false,
    }));
  });
  await page.reload();
  await page.waitForFunction(() => game !== null);
  await expect(page.locator('#guesses .initials')).toHaveCount(1);
  await expect(page.locator('#btn-hint')).toContainText('già usate');
});

test('esaurire i tentativi fa perdere la partita', async ({ page }) => {
  await open(page, CHALLENGE);
  for (const n of ['Trapani', 'Palermo', 'Agrigento', 'Enna', 'Catania', 'Ragusa', 'Siracusa']) {
    await guess(page, n);
  }
  await expect(page.locator('#result-title')).toHaveText(/Tentativi esauriti/);
  await expect(page.locator('.prov.path-hl')).toHaveCount(6);
});

test('arrendersi richiede una conferma', async ({ page }) => {
  await open(page, CHALLENGE);
  await page.click('#btn-giveup');
  await expect(page.locator('#btn-giveup')).toHaveText(/Sicuro/);
  expect((await state(page)).over).toBe(false);
  await page.click('#btn-giveup');
  await expect(page.locator('#result-title')).toHaveText(/arreso/);
});

test('la serie si azzera se si salta un giorno', async ({ page }) => {
  await open(page, '/');
  const id = await page.evaluate(() => dailyId());
  for (const [lastWonId, expected] of [[id - 1, 6], [id - 2, 1]]) {
    await page.evaluate(([last, today]) => {
      localStorage.clear();
      localStorage.setItem('pi_seen_help', 'true');
      localStorage.setItem('pi_stats_v1', JSON.stringify(
        { played: 5, won: 5, streak: 5, maxStreak: 5, dist: { P: 5 }, lastDailyId: last, lastWonId: last }));
    }, [lastWonId, id]);
    await page.reload();
    await page.waitForFunction(() => game !== null);
    await page.evaluate(() => {
      for (const s of shortestPath(game.start, game.end).slice(1, -1)) submitGuess(s);
    });
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('pi_stats_v1')));
    expect(s.streak).toBe(expected);
    expect(s.maxStreak).toBe(Math.max(5, expected));
  }
});

test('link sfida e modalità allenamento', async ({ page }) => {
  await open(page, CHALLENGE);
  await expect(page.locator('#puzzle-id')).toHaveText('Sfida');
  await expect(page.locator('#start-name')).toHaveText('Caserta');
  expect(await page.evaluate(() => shareText())).toContain('?da=CE&a=FI');

  await page.click('#mode-daily');
  await expect(page).toHaveURL(/\/$/);
  const daily = await state(page);
  expect(daily.mode).toBe('daily');

  await page.click('#mode-practice');
  await expect(page.locator('#puzzle-id')).toHaveText('Allenamento');
  await page.click('#mode-daily');
  const again = await state(page);
  expect([again.start, again.end]).toEqual([daily.start, daily.end]);
});

test('link sfida non valido apre il quotidiano', async ({ page }) => {
  await open(page, '/?da=XX&a=FI');
  expect((await state(page)).mode).toBe('daily');
});

test('zoom sulla partita e vista di tutta Italia', async ({ page }) => {
  await open(page, CHALLENGE);
  await page.waitForTimeout(100);
  const zoomed = await page.evaluate(() => view[2]);
  await page.click('#btn-zoom');
  await page.waitForTimeout(800);
  const full = await page.evaluate(() => view[2]);
  expect(full).toBeGreaterThan(zoomed * 1.5);
});

test('su mobile la casella di input è visibile senza scorrere', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'solo mobile');
  await open(page, '/');
  const box = await page.locator('#guess-input').boundingBox();
  const vp = page.viewportSize();
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
});

test('toccare un suggerimento non preme il pulsante sottostante', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'solo touch');
  await open(page, CHALLENGE);
  await page.evaluate(() => {
    window.strayClicks = [];
    document.addEventListener('click', e => {
      if (!e.target.closest('#suggestions')) window.strayClicks.push(e.target.closest('[id]')?.id || e.target.tagName);
    }, true);
  });
  for (const [text, sig] of [['vit', 'VT'], ['ri', 'RI'], ['lat', 'LT']]) {
    await page.fill('#guess-input', text);
    await page.locator(`#suggestions li[data-sig="${sig}"]`).tap();
    await page.waitForTimeout(300);
    expect((await state(page)).moves.at(-1)).toBe('guess:' + sig);
  }
  expect(await page.evaluate(() => strayClicks)).toEqual([]);
  expect((await state(page)).moves.filter(m => m.startsWith('hint'))).toEqual([]);
  await expect(page.locator('#btn-giveup')).not.toHaveClass(/confirm/);
});

// ---------- Mappa Milano e Brianza ----------
// Duomo -> Monza: 6 confini, da Brera a Niguarda e poi Sesto San Giovanni.
const MI_CHALLENGE = '/?mappa=milano&da=MI01&a=108033';

test('la linguetta Milano carica comuni e quartieri con il loro quotidiano', async ({ page }) => {
  await open(page, '/');
  const italia = await state(page);
  await page.click('[data-map="milano"]');
  await page.waitForFunction(() => mapKey === 'milano' && game.mode === 'daily');
  await expect(page).toHaveURL(/\?mappa=milano$/);
  await expect(page.locator('.prov')).toHaveCount(187 + 88);
  await expect(page).toHaveTitle('Travel Maps · Milano e Brianza');
  await expect(page.locator('#guess-input')).toHaveAttribute('placeholder', 'Scrivi un comune o un quartiere…');
  await expect(page.locator('[data-map="milano"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.prov:not(.hidden)')).toHaveCount(2);
  await expect(page.locator('#guess-count')).toContainText('comuni o quartieri');

  await page.click('[data-map="italia"]');
  await page.waitForFunction(() => mapKey === 'italia');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.prov')).toHaveCount(110);
  const back = await state(page);
  expect([back.start, back.end]).toEqual([italia.start, italia.end]);
});

test('ogni mappa ha salvataggi e statistiche separati', async ({ page }) => {
  await open(page, '/?mappa=milano');
  await page.evaluate(() => {
    for (const s of shortestPath(game.start, game.end).slice(1, -1)) submitGuess(s);
  });
  await expect(page.locator('#result-title')).toHaveText(/Perfetto/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pi_milano_stats_v1')))).toMatchObject({ played: 1, won: 1 });
  expect(await page.evaluate(() => localStorage.getItem('pi_stats_v1'))).toBeNull();
  await page.keyboard.press('Escape');
  await page.click('#btn-stats');
  await expect(page.locator('#stats-map')).toHaveText('Milano');
  await page.keyboard.press('Escape');

  await page.click('[data-map="italia"]');
  await page.waitForFunction(() => mapKey === 'italia');
  expect((await state(page)).over).toBe(false);
  await expect(page.locator('#guess-input')).toBeEnabled();

  await page.click('[data-map="milano"]');
  await page.waitForFunction(() => mapKey === 'milano');
  expect((await state(page)).won).toBe(true);
});

test('sfida su Milano: quartieri, testi e risultato', async ({ page }) => {
  await open(page, MI_CHALLENGE);
  await expect(page.locator('#puzzle-id')).toHaveText('Sfida');
  await expect(page.locator('#start-name')).toHaveText('Duomo');
  await expect(page.locator('#end-name')).toHaveText('Monza');
  await expect(page.locator('#guess-count')).toContainText('minimo 5 comuni o quartieri');

  await guess(page, 'Atlantide');
  await expect(page.locator('#message')).toHaveText('Comune o quartiere non riconosciuto');
  await guess(page, 'Milano');
  await expect(page.locator('#message')).toContainText('88 quartieri');
  expect((await state(page)).moves).toEqual([]);

  await guess(page, 'Brera');
  await guess(page, 'brera');
  await expect(page.locator('#message')).toContainText('è già stato inserito');
  await guess(page, 'niguarda');
  await guess(page, 'sesto s');
  expect((await state(page)).moves).toEqual(['guess:MI02', 'guess:MI14', 'guess:015209']);

  const share = await page.evaluate(() => shareText());
  expect(share).toMatch(/^Travel Maps · Milano e Brianza \(sfida\)/);
  expect(share).toContain('?mappa=milano&da=MI01&a=108033');

  await page.click('#btn-giveup');
  await page.click('#btn-giveup');
  await expect(page.locator('#result-path')).toContainText('(5 comuni o quartieri)');
  await expect(page.locator('#layer-regions path')).toHaveCount(3);
});

test('i quartieri toccano i comuni che confinavano con Milano', async ({ page }) => {
  await open(page, MI_CHALLENGE);
  const outside = await page.evaluate(() => {
    const nil = SIGLAS.filter(s => s.startsWith('MI'));
    return [...new Set(nil.flatMap(s => NB[s]).filter(s => !s.startsWith('MI')))].sort();
  });
  expect(outside).toHaveLength(23);
  expect(outside).toContain('015209');       // Sesto San Giovanni
  expect(outside).toContain('015189');       // Rozzano
});

test('San Colombano al Lambro è collegato a San Zenone al Lambro', async ({ page }) => {
  await open(page, '/?mappa=milano&da=015191&a=015140');
  const link = page.locator('.sea');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('data-a', '015191');
  await expect(link).toHaveAttribute('data-b', '015202');
  await expect(link.locator('text')).toHaveText('🛣️');
  expect(await page.evaluate(() => shortestPath(game.start, game.end)[1])).toBe('015202');
  await page.click('#btn-help');
  await expect(page.locator('#help-links')).toContainText('San Colombano al Lambro');
  await expect(page.locator('#help-modal [data-u="one"]')).toHaveText('comune o quartiere');
});

// ---------- Germania ----------
test('Germania: 16 Länder, nomi italiani e tedeschi', async ({ page }) => {
  await open(page, '/?mappa=germania&da=BY&a=SH');
  await expect(page.locator('.prov')).toHaveCount(16);
  await expect(page.locator('#start-name')).toHaveText('Baviera');
  await expect(page.locator('#end-name')).toHaveText('Schleswig-Holstein');
  await expect(page.locator('#guess-input')).toHaveAttribute('placeholder', 'Scrivi un Land…');
  await guess(page, 'Thüringen');                 // nome tedesco, su un percorso ottimale
  await expect(page.locator('#p-TH')).toHaveClass(/g-ok/);
  await guess(page, 'assia');
  await guess(page, 'Niedersachsen');
  await expect(page.locator('#result-title')).toHaveText(/Completato/);
  expect((await state(page)).moves).toEqual(['guess:TH', 'guess:HE', 'guess:NI']);
});

test('Germania: il quotidiano è tra 3 e 5 confini', async ({ page }) => {
  await open(page, '/?mappa=germania');
  const opt = await page.evaluate(() => game.opt);
  expect(opt).toBeGreaterThanOrEqual(3);
  expect(opt).toBeLessThanOrEqual(5);
  expect(await page.evaluate(() => NB.BE)).toEqual(['BB']);
});

// ---------- Mondo ----------
test('Mondo: nazioni, collegamenti fissi e isole senza confini', async ({ page }) => {
  await open(page, '/?mappa=mondo&da=PRT&a=POL');
  await expect(page.locator('.prov')).toHaveCount(199);
  await expect(page.locator('#start-name')).toHaveText('Portogallo');
  await expect(page.locator('.sea')).toHaveCount(3);
  expect(await page.evaluate(() => NB.GBR)).toEqual(expect.arrayContaining(['FRA', 'IRL']));
  expect(await page.evaluate(() => NB.JPN)).toEqual([]);

  await guess(page, 'Giappone');
  await expect(page.locator('#p-JPN')).toHaveClass(/g-none/);
  await guess(page, 'spagna');
  await guess(page, 'Francia');
  await guess(page, 'germania');
  await expect(page.locator('#result-title')).toHaveText(/Completato/);
  expect(await page.evaluate(() => shareText())).toContain('⬛🟩🟩🟩');
});

test('Mondo: il quotidiano non parte mai da un\'isola senza confini', async ({ page }) => {
  await open(page, '/?mappa=mondo');
  const s = await state(page);
  const counts = await page.evaluate(([a, b]) => [NB[a].length, NB[b].length], [s.start, s.end]);
  expect(counts[0]).toBeGreaterThan(0);
  expect(counts[1]).toBeGreaterThan(0);
  await page.click('#btn-help');
  await expect(page.locator('#legend-none')).toBeVisible();
});

test('quattro linguette leggibili anche su mobile', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('.map-tab')).toHaveCount(4);
  for (const tab of await page.locator('.map-tab').all()) {
    const fits = await tab.evaluate(el => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, await tab.textContent()).toBe(true);
  }
});

test('una mappa sconosciuta nell\'indirizzo apre l\'Italia', async ({ page }) => {
  await open(page, '/?mappa=atlantide');
  expect(await page.evaluate(() => mapKey)).toBe('italia');
  await expect(page.locator('.prov')).toHaveCount(110);
});

// ---------- Curiosità ----------
test('a partita vinta compaiono le curiosità su partenza e arrivo', async ({ page }) => {
  await open(page, CHALLENGE);
  await page.evaluate(() => {
    factsCache.italia = {
      CE: { facts: ['Curiosità su Caserta.'], sources: ['https://example.org/ce'] },
      FI: { facts: ['Curiosità su Firenze.'], sources: ['javascript:alert(1)'] },
    };
  });
  for (const n of ['Frosinone', 'Roma', 'Viterbo', 'Siena']) await guess(page, n);
  const box = page.locator('#result-facts');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Lo sapevi?');
  await expect(box.locator('.fact')).toHaveCount(2);
  await expect(box).toContainText('Curiosità su Caserta.');
  await expect(box.locator('a')).toHaveCount(1);
  await expect(box.locator('a')).toHaveAttribute('href', 'https://example.org/ce');
});

test('senza vittoria le curiosità non compaiono', async ({ page }) => {
  await open(page, CHALLENGE);
  await page.evaluate(() => {
    factsCache.italia = { CE: { facts: ['Curiosità su Caserta.'], sources: ['https://example.org/ce'] } };
  });
  await page.click('#btn-giveup');
  await page.click('#btn-giveup');
  await expect(page.locator('#result-modal')).toBeVisible();
  await expect(page.locator('#result-facts')).toBeHidden();
});

test('i file delle curiosità sono validi', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'basta una volta');
  const fs = require('fs');
  for (const map of ['italia', 'milano', 'germania', 'mondo']) {
    const areas = JSON.parse(fs.readFileSync(`data/${map}.json`, 'utf8')).areas;
    const facts = JSON.parse(fs.readFileSync(`data/facts/${map}.json`, 'utf8'));
    for (const [id, entry] of Object.entries(facts)) {
      expect(areas[id], `${map}/${id} non esiste nella mappa`).toBeTruthy();
      expect(entry.facts.length, `${map}/${id}`).toBeGreaterThan(0);
      for (const f of entry.facts) expect(f.length, `${map}/${id}: ${f}`).toBeLessThanOrEqual(230);
      expect(entry.sources.length, `${map}/${id} senza fonte`).toBeGreaterThan(0);
      for (const s of entry.sources) expect(s, `${map}/${id}`).toMatch(/^https?:\/\//);
    }
  }
});
