import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3000';
const OUT = '.impeccable/review';

mkdirSync(OUT, { recursive: true });

const pages = [
  { name: 'landing', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'signup', path: '/signup' },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });

for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();

  for (const p of pages) {
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500); // let animations settle
    const path = `${OUT}/${p.name}-${vp.name}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`✓ ${path}`);
  }

  await context.close();
}

await browser.close();
console.log('\nDone — screenshots saved to .impeccable/review/');
