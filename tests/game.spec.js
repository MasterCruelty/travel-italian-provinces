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
    shortestPath(game.start, game.end).slice(1, -1).map(s => DATA.provinces[s].name));
  for (const n of names) await guess(page, n);

  await expect(page.locator('#result-modal')).toBeVisible();
  await expect(page.locator('#result-title')).toHaveText(/Perfetto/);
  await expect(page.locator('#next-puzzle')).toHaveText(/Prossimo puzzle tra \d\d:\d\d:\d\d/);
  const text = await page.evaluate(() => shareText());
  expect(text).toMatch(/^Province Italiane #\d+ · Perfetto\n/);
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
