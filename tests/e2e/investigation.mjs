// Browser checks for the Investigation (plan M2/M3). Needs a served build:
//   npm run build && npm run preview   (another shell)   then   npm run test:e2e
// BROWSER=chromium|firefox|webkit (default chromium; CHANNEL=chrome uses the installed Chrome).
import { chromium, firefox, webkit } from 'playwright';

const BASE = process.env.URL ?? 'http://localhost:4321/';
const engine = { chromium, firefox, webkit }[process.env.BROWSER ?? 'chromium'];
const browser = await engine.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
let failed = 0;
const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) failed++; };

async function open(query = '', opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...opts });
  await page.goto(BASE + query + '#investigate');
  await page.locator('.inv [role="tab"]').first().waitFor();
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]')); // hydrated
  return page;
}
const visibleRefs = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent || e.getClientRects().length).map((e) => e.dataset.ref));

// 1. keyboard-only walk through all 8 steps
{
  const page = await open();
  await page.locator('#inv-tab-1').focus();
  const seen = [];
  for (let i = 0; i < 8; i++) {
    seen.push(await page.$eval('[role="tab"][aria-selected="true"]', (e) => e.id));
    check(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'tab'), `step ${i + 1}: focus stays on the tablist`);
    await page.keyboard.press('ArrowRight');
  }
  check(seen.join() === [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `inv-tab-${n}`).join(), `ArrowRight visits steps 1–8 (${seen.length})`);
  await page.keyboard.press('Home');
  check(await page.$eval('[role="tab"][aria-selected="true"]', (e) => e.id) === 'inv-tab-1', 'Home returns to step 1');
  // Tab into the panel reaches a seq hotspot and Enter pins it
  await page.keyboard.press('End');
  await page.locator('#inv-tab-4').click();
  const first = page.locator('.inv-pane pre:visible button.seq').first();
  await first.focus();
  await page.keyboard.press('Enter');
  check(await first.getAttribute('aria-pressed') === 'true', 'Enter on a focused seq pins it');
  check((await page.locator('.detail.side .pinned').count()) === 1, 'EventDetail shows the pinned event');
  check(/seq=\d+/.test(page.url()), `URL carries the pinned seq (${new URL(page.url()).search})`);
  await page.keyboard.press('Escape');
  check(await first.getAttribute('aria-pressed') === 'false', 'Esc unpins');
  await page.close();
}

// 2. every hotspot resolves to an event; every marker to a terminal row (timeline step shows every story event)
{
  const page = await open('?step=4');
  const labels = await page.$$eval('.inv-pane button.seq', (els) => els.map((e) => e.getAttribute('aria-label')));
  check(labels.length > 0 && labels.every((l) => /, \d+\.\d ms$/.test(l)), `all ${labels.length} terminal hotspots resolve to recorded events`);
  const marks = await visibleRefs(page, '.lanes [data-ref]');
  const rows = new Set(await page.$$eval('.inv-pane [data-ref]', (els) => els.map((e) => e.dataset.ref)));
  const missing = marks.filter((r) => !rows.has(r));
  check(marks.length > 0 && missing.length === 0, `all ${marks.length} markers/segments/ticks have a terminal row${missing.length ? ' — missing ' + missing : ''}`);
  // marker click pins and scrolls the row into view inside the pane, not the page
  const mk = page.locator('.lanes .mk').last();
  await mk.scrollIntoViewIfNeeded();
  const y0 = await page.evaluate(() => scrollY);
  const ref = await mk.getAttribute('data-ref');
  await mk.click();
  const inView = await page.$eval(`.inv-pane pre:not([style*="none"]) [data-ref="${ref}"]`, (el) => {
    const pre = el.closest('pre'), a = el.getBoundingClientRect(), b = pre.getBoundingClientRect();
    return a.top >= b.top && a.bottom <= b.bottom;
  }).catch(() => false);
  check(inView, `clicking marker ${ref} scrolls its terminal row into view inside the pane`);
  check(Math.abs((await page.evaluate(() => scrollY)) - y0) < 2, 'the page itself did not scroll');
  await page.close();
}

// 3. hovering a finding highlights every seq it cites
{
  const page = await open('?step=3');
  const line = page.locator('.inv-pane pre:visible .tl.fd').filter({ hasText: 'overwrote it' }).first();
  await line.hover();
  const hl = await page.$$eval('.inv-pane pre button.seq.hl', (els) => [...new Set(els.map((e) => e.dataset.ref))]);
  check(hl.length >= 3, `hovering the ordering finding highlights its seqs (${hl.join(' ')})`);
  await page.close();
}

// 4. deep links restore state; a plain visit keeps its address
{
  const plain = await open('');
  await plain.waitForTimeout(300);
  check(new URL(plain.url()).search === '', `a plain visit does not rewrite the URL (${plain.url()})`);
  await plain.close();
  const page = await open('?step=5&request=2');
  check(await page.$eval('[role="tab"][aria-selected="true"]', (e) => e.id) === 'inv-tab-5', 'step=5 restores step 5');
  check(await page.locator('.lane.r2 .lane-label').getAttribute('aria-pressed') === 'true', 'request=2 restores the lane');
  const seq = (await page.locator('.lanes .mk').first().getAttribute('data-ref')).split(':')[1];
  await page.goto(BASE + `?step=5&seq=${seq}#investigate`);
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  check((await page.locator('.detail.side .detail-head').textContent()).includes(`seq ${seq}`), `seq=${seq} restores the pinned event`);
  await page.goto(BASE + '?step=6&watch=off#investigate');
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  check(await page.locator('button.watch').getAttribute('aria-pressed') === 'false', 'watch=off restores the toggle');
  check((await page.locator('.band-none').textContent()).includes('not recorded'), 'watch off: no writes are claimed');
  await page.locator('button.watch').click();
  check(new URL(page.url()).searchParams.get('watch') === 'on', 'toggling updates the URL');
  await page.close();
}

// 5. provenance line on every visual; DiffView terminal tab
{
  const page = await open();
  for (let n = 2; n <= 8; n++) {
    await page.locator(`#inv-tab-${n}`).click();
    check((await page.locator('.inv-visual .prov').count()) > 0, `step ${n}: provenance line present`);
  }
  await page.locator('#inv-tab-7').click();
  const conn = await page.locator('.connectors path').count();
  check(conn > 0, `DiffView draws ${conn} connectors`);
  await page.getByRole('tab', { name: 'Terminal view' }).click();
  check((await page.locator('.diffview .term').count()) === 1, 'DiffView terminal tab shows the captured diff');
  await page.close();
}

// 6. reduced motion: allowed transitions become instant
{
  const page = await open('?step=4', { reducedMotion: 'reduce' });
  const d = await page.$eval('.playhead', (e) => getComputedStyle(e).transitionDuration);
  check(d.split(',').every((x) => parseFloat(x) === 0), `reduced motion: playhead transition ${d}`);
  await page.close();
}

// 7. no horizontal page overflow, desktop and tablet
for (const width of [1440, 1024, 768, 640]) {
  const page = await open('?step=7', { viewport: { width, height: 900 } });
  for (let n = 1; n <= 8; n++) {
    await page.locator(`#inv-tab-${n}`).click();
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (sw > cw) check(false, `${width}px step ${n}: page overflows (${sw} > ${cw})`);
  }
  check(true, `${width}px: checked all steps for overflow`);
  if (process.env.SHOTS) for (const n of [3, 7, 8]) {
    await page.locator(`#inv-tab-${n}`).click();
    await page.locator('#investigate').screenshot({ path: `${process.env.SHOTS}/inv-${width}-step${n}.png` });
  }
  await page.close();
}

await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
