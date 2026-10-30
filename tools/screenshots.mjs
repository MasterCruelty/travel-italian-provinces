// Rigenera gli screenshot del README: `npm run screenshots`.
// Usa link sfida fissi (es. Caserta -> Firenze, Duomo -> Monza) e una data
// fissa per il quotidiano, così le immagini sono sempre le stesse.
// CHROMIUM_PATH permette di usare un Chromium già installato.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pw from '@playwright/test';

const { chromium } = pw;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}docs/screenshots`;
const PORT = 4174;
const GAME_URL = `http://localhost:${PORT}/?da=CE&a=FI`;

const server = spawn(process.execPath, [`${ROOT}tools/serve.mjs`, String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function open({ width, height, scale = 2, dark = false, url = GAME_URL }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale,
    colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce',
  });
  await ctx.addInitScript(() => localStorage.setItem('pi_seen_help', 'true'));
  const page = await ctx.newPage();
  // Data fissa: il puzzle quotidiano dello screenshot è sempre lo stesso.
  await page.clock.setFixedTime(new Date('2026-10-22T10:00:00'));
  await page.goto(url);
  await page.waitForFunction(() => typeof game !== 'undefined' && game !== null);
  return page;
}

async function guess(page, ...names) {
  for (const n of names) {
    await page.fill('#guess-input', n);
    await page.press('#guess-input', 'Enter');
  }
}

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log('✓', name);
}

// Desktop, partita in corso con colori diversi e un suggerimento
let page = await open({ width: 1200, height: 860, scale: 1.5 });
await guess(page, 'Frosinone', 'Rieti');
await page.click('#btn-hint');
await shot(page, 'desktop');
await page.context().close();

// Mobile, partita in corso con l'autocompletamento aperto
page = await open({ width: 390, height: 844 });
await guess(page, 'Frosinone', 'Roma');
await page.fill('#guess-input', 'vit');
await shot(page, 'mobile');
await page.context().close();

// Quotidiano in corso: si vedono solo le province già scoperte
page = await open({ width: 390, height: 844, url: `http://localhost:${PORT}/` });
await guess(page, 'Mantova', 'Modena');
await shot(page, 'quotidiano');
await page.context().close();

// Risultato finale
page = await open({ width: 390, height: 844 });
await guess(page, 'Frosinone', 'Roma', 'Rieti', 'Viterbo', 'Siena');
await page.waitForSelector('#result-modal:not([hidden])');
await shot(page, 'risultato');
await page.context().close();

// Curiosità di fine partita (Gorizia -> Lecce)
page = await open({ width: 390, height: 844, url: `http://localhost:${PORT}/?da=GO&a=LE` });
await page.evaluate(() => { for (const s of shortestPath(game.start, game.end).slice(1, -1)) submitGuess(s); });
await page.waitForSelector('#result-facts:not([hidden])');
await page.locator('#result-facts').scrollIntoViewIfNeeded();
await shot(page, 'curiosita');
await page.context().close();

// Tema scuro, partita conclusa
page = await open({ width: 390, height: 844, dark: true });
await guess(page, 'Frosinone', 'Roma', 'Viterbo', 'Siena');
await page.waitForSelector('#result-modal:not([hidden])');
await page.keyboard.press('Escape');
await shot(page, 'tema-scuro');
await page.context().close();

// Milano e Brianza: dal Duomo a Monza attraverso i quartieri
page = await open({ width: 390, height: 844, url: `http://localhost:${PORT}/?mappa=milano&da=MI01&a=108033` });
await guess(page, 'Brera', 'Centrale', 'Maciachini', 'Niguarda', 'Sesto San Giovanni');
await page.waitForSelector('#result-modal:not([hidden])');
await page.keyboard.press('Escape');
await shot(page, 'milano');
await page.context().close();

// Mondo: dal Portogallo alla Polonia, con un'isola senza confini
page = await open({ width: 390, height: 844, url: `http://localhost:${PORT}/?mappa=mondo&da=PRT&a=POL` });
await guess(page, 'Spagna', 'Regno Unito', 'Francia');
await shot(page, 'mondo');
await page.context().close();

// Germania: dalla Baviera allo Schleswig-Holstein
page = await open({ width: 390, height: 844, url: `http://localhost:${PORT}/?mappa=germania&da=BY&a=SH` });
await guess(page, 'Turingia');
await page.click('#btn-hint');
await shot(page, 'germania');
await page.context().close();

// Regole
page = await open({ width: 390, height: 844 });
await page.click('#btn-help');
await shot(page, 'regole');
await page.context().close();

await browser.close();
server.kill();
