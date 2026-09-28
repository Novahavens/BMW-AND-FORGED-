// Prints docs/handover/handover.html to the branded client handover PDF.
//   node scripts/build-handover-pdf.mjs            -> docs/FORGEDSA-Client-Handover.pdf
// Needs Playwright's Chromium (npx playwright install chromium) if it isn't already on the machine.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'docs/handover/handover.html');
const out = path.join(root, 'docs/FORGEDSA-Client-Handover.pdf');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npx playwright install chromium && npm i -D playwright');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log('Wrote', path.relative(root, out));
