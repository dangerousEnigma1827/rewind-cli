// Site-level browser checks: three routes, navigation, Get Started, the source-code panel, footer, old links, overflow.
//   npm run build && npm run preview   (another shell)   then   npm run test:e2e
import { chromium, firefox, webkit } from 'playwright';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:4321';
const engine = { chromium, firefox, webkit }[process.env.BROWSER ?? 'chromium'];
const browser = await engine.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
let failed = 0;
const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) failed++; };
const ROUTES = ['/', '/investigation/', '/docs/'];

// 1. three real routes; the navigation goes to them, and Get Started reaches the install instructions from each
for (const route of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + route);
  check((await page.locator('h1').count()) === 1, `${route}: exactly one h1`);
  check(await page.locator(`.site-nav a[aria-current="page"]`).count() === 1, `${route}: the current page is marked`);
  for (const [label, path] of [['Investigation', '/investigation/'], ['Documentation', '/docs/']]) {
    const href = await page.locator('.site-nav .dest a', { hasText: label }).getAttribute('href');
    check(href === path, `${route}: nav ${label} → ${href}`);
  }
  await page.locator('.site-nav .start').click();
  await page.waitForURL('**/#install');
  const top = await page.$eval('#install', (e) => e.getBoundingClientRect().top);
  check(top >= 0 && top < 300, `${route}: navbar Install lands on the homepage install section (top ${top | 0}px)`);
  await page.close();
}

// 2. keyboard: skip link, then the navigation in order, Get Started reachable
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + '/');
  const order = [];
  for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement.textContent.trim().replace(/\s+/g, ' '))); }
  check(order[0] === 'Skip to content' && order.includes('Install'), `keyboard order: ${order.join(' · ')}`);
  await page.close();
}

// 3. the source-code panel: beside its explanations, the same height, scrolling inside
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + '/investigation/');
  const g = await page.evaluate(() => {
    const ed = document.querySelector('.editor').getBoundingClientRect(), li = document.querySelector('.lines').getBoundingClientRect();
    const body = document.querySelector('.editor-scroll');
    return { edH: ed.height, liH: li.height, edRight: ed.right, liLeft: li.left, top: Math.abs(ed.top - li.top), scroll: body.scrollHeight > body.clientHeight + 20, lines: body.querySelectorAll('.line').length };
  });
  check(g.liLeft > g.edRight, 'desktop: the three explanations sit beside the code');
  check(Math.abs(g.edH - g.liH) <= 2 || (g.edH === 360 && g.liH < 360), `desktop: code panel height ${g.edH | 0}px matches the explanations ${g.liH | 0}px`);
  check(g.scroll, 'desktop: the full source scrolls inside the panel');
  check(g.lines === 45, `the complete source is present (${g.lines} lines)`);
  await page.locator('.jump', { hasText: 'Line 23' }).click();
  const shown = await page.evaluate(() => {
    const box = document.querySelector('.editor-scroll').getBoundingClientRect(), l = document.querySelector('.editor-scroll [data-line="23"]').getBoundingClientRect();
    return l.top >= box.top && l.bottom <= box.bottom;
  });
  check(shown, '"Line 23" brings line 23 into view inside the editor');
  await page.close();
  for (const width of [390, 320]) {
    const p = await browser.newPage({ viewport: { width, height: 800 } });
    await p.goto(ORIGIN + '/investigation/');
    const m = await p.evaluate(() => {
      const ed = document.querySelector('.editor').getBoundingClientRect(), li = document.querySelector('.lines').getBoundingClientRect();
      const body = document.querySelector('.editor-scroll');
      return { stacked: li.top >= ed.bottom, h: ed.height, scroll: body.scrollHeight > body.clientHeight };
    });
    check(m.stacked && m.h <= 420 && m.scroll, `${width}px: code stacked above the explanations, ${m.h | 0}px tall, scrolling inside`);
    await p.close();
  }
}

// 4. footer, homepage content, the old single-page links
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + '/');
  check((await page.locator('footer').textContent()).includes('Built for CODEFESTTHON 2026'), 'footer: "Built for CODEFESTTHON 2026"');
  // Rewind's real terminal output keeps whatever it printed (run ids included); everything else must not expose them
  const text = await page.evaluate(() => { const b = document.body.cloneNode(true); b.querySelectorAll('.term pre').forEach((p) => p.remove()); return b.innerText ?? b.textContent; });
  check(!/\b[0-9a-f]{8}\b/.test(text) && !/@[0-9a-f]{7}/.test(text) && !/Captured from/i.test(text), 'home: no run ids, commit hashes or capture provenance');
  check(!/Phantom Discount/i.test(text), 'home: the scenario is not called "Phantom Discount"');
  for (const [from, to] of [['/#investigate', '/investigation/'], ['/?step=4', '/investigation/?step=4'], ['/#start', '/#install'], ['/#get-started', '/#install']]) {
    await page.goto(ORIGIN + from);
    await page.waitForURL((u) => u.pathname + u.search + u.hash !== from, { timeout: 3000 }).catch(() => {});
    const u = new URL(page.url());
    check(u.pathname + u.search + u.hash === to, `old link ${from} → ${u.pathname + u.search + u.hash}`);
  }
  await page.close();
}

// 4b. the homepage: hero within the viewport, the six commands, the evidence labels, every footer link
for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(ORIGIN + '/');
  const r = await page.$eval('#top', (e) => {
    const intro = e.querySelector('.intro').getBoundingClientRect(), term = e.querySelector('.exhibit .term').getBoundingClientRect();
    return { right: term.left >= intro.right, below: term.top >= intro.bottom, visible: term.width > 200 && term.height > 200, actions: [...e.querySelectorAll('.actions a')].map((a) => a.textContent.replace('→', '').trim()) };
  });
  check(r.visible && (w >= 960 ? r.right : r.below), `${w}px: the hero terminal is ${w >= 960 ? 'on the right of' : 'below'} the introduction`);
  check(r.actions.join('|') === 'Open the investigation|Read the documentation|Get Started', `${w}px: hero actions ${r.actions.join(' · ')}`);
  await page.close();
}
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + '/');
  const tabs = page.locator('#commands [role="tab"]');
  check((await tabs.count()) === 6, `command showcase lists ${await tabs.count()} commands`);
  for (let i = 0; i < 6; i++) {
    await tabs.nth(i).click();
    const name = (await tabs.nth(i).locator('.name').textContent()).trim();
    const shown = await page.$$eval('#commands [role="tabpanel"]', (ps) => ps.filter((p) => !p.hidden).map((p) => p.querySelector('.term-title').textContent));
    check(shown.length === 1 && shown[0].startsWith(name), `selecting "${name}" shows only its terminal: ${shown[0]}`);
  }
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowDown');
  check(await page.evaluate(() => document.activeElement.getAttribute('aria-selected')) === 'true' &&
    (await page.evaluate(() => document.activeElement.textContent)).includes('rewind runs'), 'ArrowDown moves to and selects the next command');
  const cards = await page.$$eval('#features li', (ls) => ls.map((l) => { const c = getComputedStyle(l); return c.backgroundColor === 'rgba(0, 0, 0, 0)' && parseFloat(c.borderRadius) === 0 && parseFloat(c.borderLeftWidth) === 0 && parseFloat(c.borderTopWidth) > 0; }));
  check(cards.length === 3 && cards.every(Boolean), 'features: three open items, a rule above each, no card background, radius or side borders');
  const active = await page.$eval('#commands [aria-selected="true"]', (t) => { const c = getComputedStyle(t); return { side: parseFloat(c.borderLeftWidth), shadow: c.boxShadow }; });
  check(active.side === 0 && active.shadow === 'none', `active command: no left border or side accent (border ${active.side}px, shadow ${active.shadow})`);
  const lv = await page.$eval('#features .levels', (e) => ({ own: e.tagName === 'P' && e.querySelectorAll('.lv').length === 3, colours: [...e.querySelectorAll('.lv')].map((x) => getComputedStyle(x).color) }));
  check(lv.own && new Set(lv.colours).size === 3, `evidence labels: their own line, three colours (${lv.colours.join(' ')})`);
  const links = await page.$$eval('footer a', (as) => as.map((a) => a.getAttribute('href')));
  for (const href of links) {
    if (href.startsWith('http')) { check(/^https:\/\/github\.com\//.test(href), `footer link ${href} (external)`); continue; }
    const r = await page.request.get(ORIGIN + href.split('#')[0]);
    const id = href.split('#')[1];
    let target = true;
    if (id) { await page.goto(ORIGIN + href); target = (await page.locator(`#${id}`).count()) === 1; }
    check(r.ok() && target, `footer link ${href} resolves`);
  }
  check(new Set(links).size === links.length, 'footer has no repeated links');
  await page.close();
}

// 5. favicons on every route: linked, served with an image type, and the browser can decode them
for (const route of ROUTES) {
  const page = await browser.newPage();
  await page.goto(ORIGIN + route);
  const links = await page.$$eval('link[rel~="icon"]', (ls) => ls.map((l) => l.getAttribute('href')));
  check(['/favicon.ico', '/favicon.svg', '/favicon-32x32.png', '/favicon-16x16.png'].every((n) => links.some((l) => l.split('?')[0] === n)), `${route}: favicon links ${links.join(' ')}`);
  for (const href of links) {
    const r = await page.request.get(ORIGIN + href);
    const type = r.headers()['content-type'] ?? '';
    const decoded = await page.evaluate(async (u) => { const i = new Image(); i.src = u; try { await i.decode(); return i.naturalWidth; } catch { return 0; } }, href);
    check(r.ok() && /image/.test(type) && decoded > 0, `${route}: ${href} ${r.status()} ${type} decodes at ${decoded}px`);
  }
  await page.close();
}

// 6. no horizontal overflow on any page
for (const route of ROUTES) for (const width of [320, 390, 768, 1024, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(ORIGIN + route);
  let worst = 0;
  for (const y of [0, 2000, 5000, 99999]) {
    await page.evaluate((y) => scrollTo(0, y), y);
    worst = Math.max(worst, await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  }
  if (worst > 0) check(false, `${route} ${width}px: page overflows by ${worst}px`);
  await page.close();
}
check(true, 'overflow scan: 3 routes × 320/390/768/1024/1440');

await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
