export const QUICK_ORDER_PREFIX = '/api/health/quick-order';
const PATH_ORIGIN = 'https://quick-order.invalid';
const owns = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

function pathViews(target) {
  if (typeof target !== 'string') return [];
  const path = target.split(/[?#]/u, 1)[0];
  // Leading // is always an origin-form path here, never a remote authority.
  if (path.startsWith('/') || path.startsWith('\\')) return [path];
  // Retain the unnormalized path of absolute-form targets, even if their host
  // is malformed. This is ownership detection only, never request acceptance.
  const absolute = /^https?:[/\\]*[^/\\]*([/\\].*)?$/iu.exec(path)
    || /^[a-z][a-z\d+.-]*:[/\\]{2,}[^/\\]*([/\\].*)?$/iu.exec(path);
  const views = absolute ? [absolute[1] || '/'] : [];
  // WHATWG also recognizes noncanonical scheme separators. Inspect that path
  // only for refusal; lexical ownership above survives traversal out of it.
  if (/^[a-z][a-z\d+.-]*:/iu.test(path)) {
    try { views.push(new URL(target).pathname); } catch { /* Lexical view remains. */ }
  }
  return views;
}

function looksOwned(target, prefix) {
  // Decode once for conservative refusal, including encoded separators/dots.
  // Keep both views: an owned-looking prefix must stay owned when ../ exits it.
  return pathViews(target).flatMap(path => [path, path.replace(/%([\da-f]{2})/giu,
    (_match, hex) => String.fromCharCode(parseInt(hex, 16)))]).some(value => {
    const folded = value.replace(/\\/gu, '/').replace(/\/{2,}/gu, '/').toLowerCase();
    if (owns(folded, prefix)) return true;
    const normalized = new URL(PATH_ORIGIN);
    // A pathname setter cannot adopt an authority, including for leading //.
    normalized.pathname = folded;
    return owns(normalized.pathname, prefix);
  });
}

function canonicalUrl(target) {
  if (typeof target !== 'string' || !target.startsWith('/') || /[\\#\u0000-\u0020\u007f]/u.test(target)) return null;
  const path = target.split('?', 1)[0];
  // Ambiguous aliases are refused, never repaired into an accepted endpoint.
  if (path.includes('//') || path.includes('%')) return null;
  const url = new URL(PATH_ORIGIN + target);
  return url.pathname === path ? url : null;
}

/**
 * One nonthrowing ownership policy for pre-parser containment, the handler and
 * parser errors. Case/encoding/normalization aliases are conservatively owned
 * but malformed. Only unchanged canonical origin-form paths may be dispatched.
 * Express path is derived from url; originalUrl also survives router stripping.
 */
export function classifyQuickOrderTarget(req, prefix = QUICK_ORDER_PREFIX) {
  let owned = false;
  try {
    const original = req.originalUrl, effective = req.url;
    const raw = typeof original === 'string' ? original : effective;
    const foldedPrefix = prefix.toLowerCase();
    if (![original, effective].some(target => looksOwned(target, foldedPrefix))) return { kind: 'unrelated' };
    owned = true;
    const url = canonicalUrl(raw);
    if (!url || !owns(url.pathname, prefix)) return { kind: 'owned-malformed' };
    if (typeof original === 'string' && effective !== undefined && effective !== original) {
      const mounted = canonicalUrl(effective);
      // Express may strip a mount prefix, but not rewrite the endpoint/query.
      const strippedRoot = mounted?.pathname === '/' && url.pathname === prefix;
      if (!mounted || mounted.search !== url.search || (!strippedRoot && !url.pathname.endsWith(mounted.pathname))) return { kind: 'owned-malformed' };
    }
    return { kind: 'owned-valid', url };
  } catch {
    // URL parsing is never allowed to turn an unrelated malformed target into a
    // Quick Order response. Normal request strings take the explicit cases above.
    return { kind: owned ? 'owned-malformed' : 'unrelated' };
  }
}
