// IC-2 computed-style smoke on RAW stylesheets of 3eaa017 (baseline), 70cd421 (reviewed), c93bf5a (successor).
// Headless Chrome; identical markup for admin root vs customer root, bare and inside .research-app / .clarity-public-shell wrappers.
// Read-only against the repository: stylesheets were exported with `git show` into this temp directory.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const LIB = 'C:/xenios-wt/closeout-review/scripts/evidence/lib/';
const { launchChromium } = await import(pathToFileURL(LIB + 'chrome.mjs').href);
const { CdpConnection, PageSession, sleep } = await import(pathToFileURL(LIB + 'cdp.mjs').href);
const T = 'C:/Users/sboad/AppData/Local/Temp/claude-ic2-c93bf5a';
const refs = ['3eaa017', '70cd421', 'c93bf5a'];
const block = root => `<div class="${root}" data-root="${root}">
  <div class="xenios-order-steps"><button class="is-active" data-k="step-active"><span data-k="step-active-num">1</span> Step</button><button data-k="step-idle"><span>2</span> Next</button></div>
  <div class="xenios-order-filter-actions"><button data-k="filter-btn">Clear filters</button></div>
  <div class="xenios-order-actions"><button data-k="actions-secondary">Back</button><button class="xenios-order-button" data-k="actions-primary">Continue</button></div>
  <a class="xenios-order-button" href="/care" data-k="care-cta">Continue through Care</a>
  <button class="xenios-order-button" data-k="primary-btn">Update status</button>
  <ol class="xenios-order-timeline"><li data-k="timeline-li"><time data-k="timeline-time">now</time><p data-k="timeline-p">event</p></li></ol>
  <a class="xenios-order-link" href="#" data-k="link">Return</a>
  <details class="xenios-order-details"><summary data-k="summary">Product details</summary></details>
  <div class="xenios-order-skeleton xenios-order-skeleton--button" data-k="skeleton"></div>
</div>`;
const wrappers = [['bare', b => b], ['research-app', b => `<div class="research-app">${b}</div>`], ['clarity-public-shell', b => `<div class="clarity-public-shell">${b}</div>`]];
const probe = () => [...document.querySelectorAll('[data-k]')].map(e => {
  const s = getComputedStyle(e); const root = e.closest('[data-root]').dataset.root;
  const wrap = e.closest('.research-app') ? 'research-app' : e.closest('.clarity-public-shell') ? 'clarity-public-shell' : 'bare';
  return { wrap, root: root.includes('customer') ? 'customer' : 'admin', k: e.dataset.k, bg: s.backgroundColor, color: s.color, radius: s.borderTopLeftRadius,
    border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`, borderLeft: `${s.borderLeftWidth} ${s.borderLeftStyle} ${s.borderLeftColor}`,
    minH: s.minHeight, h: Math.round(e.getBoundingClientRect().height), fw: s.fontWeight, deco: s.textDecorationLine, pad: s.paddingLeft };
});
const focusProbe = () => {
  const out = [];
  for (const e of document.querySelectorAll('[data-k="primary-btn"],[data-k="summary"],[data-k="step-active"]')) {
    e.focus(); const s = getComputedStyle(e);
    out.push({ root: e.closest('[data-root]').dataset.root.includes('customer') ? 'customer' : 'admin', wrap: e.closest('.research-app') ? 'research-app' : e.closest('.clarity-public-shell') ? 'clarity-public-shell' : 'bare', k: e.dataset.k, outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`, offset: s.outlineOffset });
    e.blur();
  }
  return out;
};
const results = {};
const chrome = await launchChromium({ chromePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const conn = new CdpConnection(chrome.wsUrl); await conn.open();
const page = await PageSession.create(conn);
try {
  for (const ref of refs) {
    const body = wrappers.map(([, w]) => w(block('xenios-order-page') + '<hr>' + block('xenios-order-page xenios-order-page--customer'))).join('<hr>');
    const file = `${T}/ic2-${ref}.html`;
    writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="index-${ref}.css"><link rel="stylesheet" href="ao-${ref}.css"></head><body style="padding:20px">${body}</body></html>`);
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    try { await page.navigate(pathToFileURL(file).href, { maxSettleMs: 3000 }); } catch { await sleep(800); }
    await sleep(500);
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const sheets = await page.evaluate(`[...document.styleSheets].map(s => { try { return { href: (s.href || '').split('/').pop(), rules: s.cssRules.length }; } catch (e) { return { href: (s.href || '').split('/').pop(), error: String(e) }; } })`);
    results[ref] = { sheets, styles: await page.evaluate(`(${probe.toString()})()`), focus: await page.evaluate(`(${focusProbe.toString()})()`),
      ruleToken: await page.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--rule').trim()`),
      pulseToken: await page.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--pulse').trim()`) };
  }
} finally { await page.close().catch(() => {}); await conn.close().catch(() => {}); await chrome.close(); }
writeFileSync(`${T}/ic2-smoke-results.json`, JSON.stringify(results, null, 1));
const key = x => `${x.wrap}|${x.root}|${x.k}`;
for (const ref of refs) console.log(`sheets@${ref}:`, JSON.stringify(results[ref].sheets), '| --rule', results[ref].ruleToken, '| --pulse', results[ref].pulseToken);
function cmp(a, b, label, rootFilter) {
  const A = new Map(results[a].styles.map(x => [key(x), x])); let diffs = 0;
  for (const x of results[b].styles.filter(x => !rootFilter || x.root === rootFilter)) {
    const y = A.get(key(x)); const d = Object.keys(x).filter(f => !['wrap', 'root', 'k'].includes(f) && x[f] !== y[f]);
    if (d.length) { diffs++; console.log(`  ${label} CHANGED ${key(x)}: ` + d.map(f => `${f}: ${y[f]} -> ${x[f]}`).join('; ')); }
  }
  const B = new Map(results[b].focus.map(x => [`${x.wrap}|${x.root}|${x.k}`, x]));
  for (const f of results[a].focus.filter(f => !rootFilter || f.root === rootFilter)) {
    const g = B.get(`${f.wrap}|${f.root}|${f.k}`);
    if (g.outline !== f.outline || g.offset !== f.offset) { diffs++; console.log(`  ${label} FOCUS CHANGED ${f.wrap}|${f.root}|${f.k}: ${f.outline}/${f.offset} -> ${g.outline}/${g.offset}`); }
  }
  console.log(`${label}: ${diffs} differences`);
}
console.log('== 70cd421 vs c93bf5a, all roots/wrappers (expect ONLY customer timeline-li borderLeft):'); cmp('70cd421', 'c93bf5a', 'successor');
console.log('== 3eaa017 vs c93bf5a, ADMIN root only (expect 0):'); cmp('3eaa017', 'c93bf5a', 'admin-vs-baseline', 'admin');
console.log('== timeline-li borderLeft by ref/wrap/root:');
for (const ref of refs) for (const x of results[ref].styles.filter(x => x.k === 'timeline-li')) console.log(`  ${ref} ${x.wrap.padEnd(20)} ${x.root.padEnd(8)} ${x.borderLeft}`);
console.log('== customer key styles @c93bf5a (bare):');
for (const x of results['c93bf5a'].styles.filter(x => x.root === 'customer' && x.wrap === 'bare')) console.log(`  ${x.k.padEnd(18)} bg ${x.bg} | color ${x.color} | radius ${x.radius} | border ${x.border} | minH ${x.minH} h ${x.h}`);
console.log('== focus @c93bf5a (bare):');
for (const f of results['c93bf5a'].focus.filter(f => f.wrap === 'bare')) console.log(`  ${f.root.padEnd(8)} ${f.k.padEnd(12)} ${f.outline} offset ${f.offset}`);
