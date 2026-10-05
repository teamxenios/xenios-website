import { classifyQuickOrderTarget } from './paths.mjs';
const P = '/api/health/quick-order';
const BS = String.fromCharCode(92);
const host = u => typeof u === 'string' ? u.replace(/^\/{2,}/, '/') : u; // mirrors server/index.ts:231-236
const cases = [
  P, P + '/', P + '?view=1', P + '/config?view=1', P + '/requests', P + '/config?return=%2fother%5cpath%23fragment',
  '/API/HEALTH/QUICK-ORDER/requests', '/Api/Health/Quick-Order/config',
  '/api/health/x/../quick-order/requests', '/api/health/x/%2e%2e/quick-order/requests', '/api/health/x/%252e%252e/quick-order/requests',
  '/api/health/./quick-order/requests', '/api/health/%2E/quick-order/requests',
  P + BS + 'requests', '/api' + BS + 'health' + BS + 'quick-order' + BS + 'requests', BS + 'api' + BS + 'health' + BS + 'quick-order' + BS + 'config', P + '%5crequests',
  '//api/health/quick-order/requests', '////api/health/quick-order/requests?x=1', '/api//health/quick-order/requests', P + '//requests',
  P + '%2Frequests', '/api%2Fhealth%2Fquick-order/requests', '/api/health/%71uick-order/config',
  P + '/../other', P + '/%2e%2e/other', P + '/%GG', P + '/config#frag', P + '/config?view=1#frag',
  'http://quick-order.invalid' + P + '/requests', 'http:////quick-order.invalid' + P + '/requests', 'http:////quick-order.invalid' + P + '/../other',
  'https://quick-order.invalid/api/health/x/../quick-order/requests', 'http://quick-order.invalid' + P + '/../other', 'https:/' + BS + '/elsewhere.example.test' + P + '/config',
  'http:/elsewhere.example.test' + P + '/../other', 'http:elsewhere.example.test' + P + '/../other',
  '//other', '//external.invalid' + P + '/requests', '/api/health/quick-order-other', '/API/HEALTH/QUICK-ORDER-other', '/api/health/quick-orders', '/api/healthx/quick-order',
  '/api/health', '/api/health/', '/api/health/x/../other', '/api/health/x/%2e%2e/other', '/api/health/other' + BS + 'requests', '/api/health/other%2Frequests', '/api/health/other/%ZZ',
  'http://quick-order.invalid/other', '/other?next=' + P + '/requests', '/elsewhere#' + P + '/config', 'https://[invalid-host/elsewhere', 'elsewhere/other', 'http://evil.test' + P + '/requests',
  '/api/health/quick-order.', '/api/health/quick-order%20', '/api/health/quick%E2%80%90order/requests', '/api/health/quick-order%2e/requests', '/api/health/quick-order/%2e/config',
];
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('target', 72), pad('kind (root mount: originalUrl=raw, url=host-normalized)', 20), 'pathname+search');
for (const t of cases) {
  const r = classifyQuickOrderTarget({ originalUrl: t, url: host(t) }, P);
  console.log(pad(JSON.stringify(t), 72), pad(r.kind, 20), r.url ? r.url.pathname + r.url.search : '');
}
console.log('\n--- original/effective pairs (mount-stripped and conflicting) ---');
for (const [o, u] of [[P + '/config?view=1', '/config?view=1'], [P, '/'], [P + '/config?view=1', '/config?view=2'], [P + '/config', '/requests'], ['/elsewhere', P + '/config'], [P + '/config', '/elsewhere'], [P + '/../elsewhere', '/elsewhere'], [P.toUpperCase() + '/config', P + '/config'], [P + '/config', P + '/./config'], [undefined, undefined], [undefined, 42], [P + '/config?view=1', P + '/config?view=1']]) {
  const r = classifyQuickOrderTarget({ originalUrl: o, url: u }, P);
  console.log(pad(JSON.stringify([o, u]), 72), pad(r.kind, 20), r.url ? r.url.pathname + r.url.search : '');
}
console.log('\n--- authority check: any owned-valid url with a non-sentinel host? ---');
let bad = 0;
for (const t of cases) { const r = classifyQuickOrderTarget({ originalUrl: t, url: host(t) }, P); if (r.kind === 'owned-valid' && r.url.host !== 'quick-order.invalid') { bad++; console.log('HOST LEAK', t, r.url.host); } }
console.log('non-sentinel hosts on owned-valid:', bad);
console.log('\n--- throw check over odd inputs ---');
let thrown = 0;
for (const t of [null, undefined, 42, {}, [], '', ' ', String.fromCharCode(0), '%', '%2', 'http:', 'http://', '//', '///', BS, '?', '#', P + '?%', P + '/%', 'HTTP://X' + P, 'ftp://x' + P + '/a', 'javascript:' + P, 'HTTP://x' + P + '/config']) {
  try { const r = classifyQuickOrderTarget({ originalUrl: t, url: t }, P); console.log(pad(JSON.stringify(t), 40), r.kind); } catch (e) { thrown++; console.log('THREW', JSON.stringify(t), e.message); }
}
console.log('throws:', thrown);
