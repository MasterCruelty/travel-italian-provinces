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

test('il suggerimento parte dai progressi del giocatore e costa un tentativo', async ({ page }) => {
  await open(page, CHALLENGE);
  await guess(page, 'Frosinone');
  await guess(page, 'Roma');
  await page.click('#btn-hint');
  await expect(page.locator('#message')).toContainText('Viterbo');
  await expect(page.locator('#p-VT')).toHaveClass(/hint/);
  await expect(page.locator('#guess-count')).toContainText('Tentativi rimasti: 4');

  await page.click('#btn-hint');                     // stesso suggerimento, gratis
  await expect(page.locator('#guess-count')).toContainText('Tentativi rimasti: 4');

  await guess(page, 'Viterbo');
  await guess(page, 'Siena');
  await expect(page.locator('#result-title')).toHaveText(/Completato/);
  expect(await page.evaluate(() => shareText())).toContain('🟩🟩💡🟩🟩 (5/7)');
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
// Abbiategrasso -> Vimercate: 8 confini, il percorso passa da Milano.
const MI_CHALLENGE = '/?mappa=milano&da=015002&a=108050';

test('la linguetta Milano carica i comuni con il loro quotidiano', async ({ page }) => {
  await open(page, '/');
  const italia = await state(page);
  await page.click('[data-map="milano"]');
  await page.waitForFunction(() => mapKey === 'milano' && game.mode === 'daily');
  await expect(page).toHaveURL(/\?mappa=milano$/);
  await expect(page.locator('.prov')).toHaveCount(188);
  await expect(page).toHaveTitle('Travel Maps · Comuni di Milano e Brianza');
  await expect(page.locator('#guess-input')).toHaveAttribute('placeholder', 'Scrivi un comune…');
  await expect(page.locator('[data-map="milano"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.prov:not(.hidden)')).toHaveCount(2);
  await expect(page.locator('#guess-count')).toContainText('comuni');
  const milano = await state(page);
  expect(milano.start).toMatch(/^\d{6}$/);

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
  await expect(page.locator('#stats-map')).toHaveText('Milano e Brianza');
  await page.keyboard.press('Escape');

  await page.click('[data-map="italia"]');
  await page.waitForFunction(() => mapKey === 'italia');
  expect((await state(page)).over).toBe(false);
  await expect(page.locator('#guess-input')).toBeEnabled();

  await page.click('[data-map="milano"]');
  await page.waitForFunction(() => mapKey === 'milano');
  expect((await state(page)).won).toBe(true);
});

test('sfida su Milano: link, testi e risultato', async ({ page }) => {
  await open(page, MI_CHALLENGE);
  await expect(page.locator('#puzzle-id')).toHaveText('Sfida');
  await expect(page.locator('#start-name')).toHaveText('Abbiategrasso');
  await expect(page.locator('#end-name')).toHaveText('Vimercate');
  await expect(page.locator('.prov:not(.hidden)')).toHaveCount(188);
  await expect(page.locator('#guess-count')).toContainText('minimo 7 comuni');

  await guess(page, 'Atlantide');
  await expect(page.locator('#message')).toHaveText('Comune non riconosciuto');
  await guess(page, 'Milano');
  await guess(page, 'milano');
  await expect(page.locator('#message')).toContainText('è già stato inserito');
  await guess(page, 'sesto s');
  expect((await state(page)).moves).toEqual(['guess:015146', 'guess:015209']);

  const share = await page.evaluate(() => shareText());
  expect(share).toMatch(/^Travel Maps · Comuni di Milano e Brianza \(sfida\)/);
  expect(share).toContain('?mappa=milano&da=015002&a=108050');

  await page.click('#btn-giveup');
  await page.click('#btn-giveup');
  await expect(page.locator('#result-path')).toContainText('(7 comuni)');
  await expect(page.locator('#layer-regions path')).toHaveCount(2);
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
  await expect(page.locator('#help-modal [data-u="one"]')).toHaveText('comune');
});

test('una mappa sconosciuta nell\'indirizzo apre l\'Italia', async ({ page }) => {
  await open(page, '/?mappa=atlantide');
  expect(await page.evaluate(() => mapKey)).toBe('italia');
  await expect(page.locator('.prov')).toHaveCount(110);
});
