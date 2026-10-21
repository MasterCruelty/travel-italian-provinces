// Rigenera gli screenshot del README: `npm run screenshots`.
// Usa il link sfida Caserta -> Firenze, così le immagini sono sempre le stesse.
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

const browser = await chromium.launch();

async function open({ width, height, scale = 2, dark = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale,
    colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce',
  });
  await ctx.addInitScript(() => localStorage.setItem('pi_seen_help', 'true'));
  const page = await ctx.newPage();
  await page.goto(GAME_URL);
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

// Risultato finale
page = await open({ width: 390, height: 844 });
await guess(page, 'Frosinone', 'Roma', 'Rieti', 'Viterbo', 'Siena');
await page.waitForSelector('#result-modal:not([hidden])');
await shot(page, 'risultato');
await page.context().close();

// Tema scuro, partita conclusa
page = await open({ width: 390, height: 844, dark: true });
await guess(page, 'Frosinone', 'Roma', 'Viterbo', 'Siena');
await page.waitForSelector('#result-modal:not([hidden])');
await page.keyboard.press('Escape');
await shot(page, 'tema-scuro');
await page.context().close();

// Regole
page = await open({ width: 390, height: 844 });
await page.click('#btn-help');
await shot(page, 'regole');
await page.context().close();

await browser.close();
server.kill();
