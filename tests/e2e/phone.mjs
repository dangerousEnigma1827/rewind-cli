// Phone checks for the Investigation (plan M3), at 390 and 320 px with touch.
//   npm run build && npm run preview   (another shell)   then   npm run test:e2e
import { chromium, firefox, webkit } from 'playwright';

const BASE = process.env.URL ?? 'http://localhost:4321/';
const engine = { chromium, firefox, webkit }[process.env.BROWSER ?? 'chromium'];
const browser = await engine.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
let failed = 0;
const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) failed++; };

// every visible interactive target in the island: ≥ 44×44 and ≥ 8px from every other one
const targets = (page) => page.$$eval('.inv button, .inv a', (els) => els
  .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
  .map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: e.offsetWidth, h: e.offsetHeight, // layout size: ignores the :active press scale
 t: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 40), bar: !!e.closest('.step-nav.bar') }; }));
function spacing(ts) {
  const bad = [];
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const a = ts[i], b = ts[j];
    if (a.bar !== b.bar) continue; // the sticky bar is a layer content scrolls beneath, not a neighbour
    const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (Math.max(dx, dy) < 7.5) bad.push(`${a.t} ↔ ${b.t} (${Math.max(dx, dy).toFixed(1)}px)`);
  }
  return bad;
}

for (const width of [390, 320]) {
  const page = await browser.newPage({ viewport: { width, height: 800 }, isMobile: engine !== firefox, hasTouch: true });
  await page.goto(BASE + '#investigate');
  await page.waitForFunction(() => document.querySelector('.inv.narrow'));
  for (let n = 1; n <= 8; n++) {
    check(await page.$eval('[role="tab"][aria-selected="true"]', (e) => e.id) === `inv-tab-${n}`, `${width}px: step ${n} reached by tapping Next`);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(sw <= cw, `${width}px step ${n}: no page overflow (${sw} ≤ ${cw})`);
    const ts = await targets(page);
    const small = ts.filter((t) => t.w < 43.5 || t.h < 43.5);
    check(small.length === 0, `${width}px step ${n}: all ${ts.length} targets ≥ 44px${small.length ? ' — ' + small.map((t) => `${t.t} ${t.w.toFixed(0)}×${t.h.toFixed(0)}`).join('; ') : ''}`);
    const close = spacing(ts);
    check(close.length === 0, `${width}px step ${n}: targets ≥ 8px apart${close.length ? ' — ' + close.slice(0, 4).join('; ') : ''}`);
    // every seq in the visible terminal text has a chip
    const [spans, chips] = await page.evaluate(() => {
      const vis = [...document.querySelectorAll('.inv pre')].filter((p) => getComputedStyle(p).display !== 'none');
      return [new Set(vis.flatMap((p) => [...p.querySelectorAll('span.seq')].map((s) => s.textContent))).size,
        new Set(vis.flatMap((p) => [...p.querySelectorAll('.chip')].map((c) => c.dataset.ref.split(':')[1]))).size];
    });
    check(spans === chips, `${width}px step ${n}: every seq in the text has a chip (${spans}/${chips})`);
    if (process.env.SHOTS) await page.locator('#investigate').screenshot({ path: `${process.env.SHOTS}/phone-${width}-step${n}.png` });
    if (n < 8) await page.locator('.step-nav.bar button', { hasText: 'Next' }).tap();
  }
  // a focused target is never left under the sticky bar
  await page.goto(BASE + '?step=4#investigate');
  await page.waitForFunction(() => document.querySelector('.inv.narrow') && document.querySelector('[aria-selected="true"]#inv-tab-4'));
  let covered = 0;
  for (const c of await page.locator('.inv pre:visible .chip').all()) {
    await c.focus();
    await page.waitForTimeout(250); // the engine's focus scroll, then the island's correction
    covered += await page.evaluate(() => { const a = document.activeElement.getBoundingClientRect(), b = document.querySelector('.step-nav.bar').getBoundingClientRect(); return b.bottom >= innerHeight - 1 && a.bottom > b.top + 1 ? 1 : 0; /* only when the bar is stuck over content */ });
  }
  check(covered === 0, `${width}px: no focused chip is covered by the sticky step bar (${covered})`);
  // tapping a seq of another request switches the inspector and says so
  await page.goto(BASE + '?step=3#investigate');
  await page.waitForFunction(() => document.querySelector('.inv.narrow') && document.querySelector('[aria-selected="true"]#inv-tab-3'));
  check(await page.locator('.orow[aria-pressed="true"]').textContent().then((t) => t.includes('#3')), `${width}px: why bad selects request #3`);
  const chip = page.locator('.inv pre:visible .chip').filter({ hasText: /seq/ });
  const n = await chip.count();
  let switched = false;
  for (let i = 0; i < n && !switched; i++) {
    await chip.nth(i).tap();
    switched = (await page.locator('.notice').count()) > 0;
  }
  check(switched, `${width}px: a seq of another request switches the selection with a notice`);
  await page.close();
}

// colour independence: greyscale and simulated deuteranopia renders for review (§5.2 r1 condition)
if (process.env.SHOTS) {
  const filters = {
    grey: 'grayscale(1)',
    deutan: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='d'><feColorMatrix type='matrix' values='0.367 0.861 -0.228 0 0 0.280 0.673 0.047 0 0 -0.012 0.043 0.969 0 0 0 0 0 1 0'/></filter></svg>#d\")",
  };
  for (const [name, f] of Object.entries(filters)) for (const [w, q] of [[1024, '?step=3'], [390, '?step=3']]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, hasTouch: w < 640 });
    await page.goto(BASE + q + '#investigate');
    await page.waitForFunction(() => document.querySelector('[aria-selected="true"]#inv-tab-3'));
    await page.addStyleTag({ content: `html { filter: ${f}; }` });
    await page.locator('.inv-visual').screenshot({ path: `${process.env.SHOTS}/${name}-${w}.png` });
    await page.close();
  }
}

await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
