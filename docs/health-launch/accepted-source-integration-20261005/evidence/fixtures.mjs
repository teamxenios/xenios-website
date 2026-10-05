// Private UI fixtures, not authentication, pricing, availability or image authority.
// Never imported by the repository or deployed. No writes or external transport.
import { createHash } from 'node:crypto';

export const FIXTURE_PATHS = Object.freeze([
  'GET /__preview/start', 'GET /__preview/bootstrap.js', 'GET /__preview/info',
  'GET /api/config', 'GET /auth/v1/user', 'GET /api/research/me',
  'GET /api/research/member/me', 'GET /api/research/catalog',
  'GET /api/research/member/products', 'GET /api/research/member/products/:syntheticSlug',
  'GET /api/research/early-access/assisted-orders/config',
]);

export function installPreviewFixtures(app, getOrigin) {
  const startedAt = new Date();
  const now = startedAt.toISOString();
  const expires = Math.floor(startedAt.getTime() / 1000) + 12 * 60 * 60;
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated',
    role: 'authenticated', email: 'synthetic-preview@example.invalid',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    created_at: now, updated_at: now, identities: [] };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  // Deliberately unsigned synthetic fixture. No real key, session or account.
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id,
    aud: user.aud, role: user.role, email: user.email, exp: expires,
    iat: Math.floor(startedAt.getTime() / 1000), amr: [{ method: 'password' }],
    synthetic_preview_only: true })}.c3ludGhldGljLW5vdC1hLXNpZ25hdHVyZQ`;
  const session = { access_token: token, refresh_token: 'synthetic-refresh-not-a-credential',
    expires_in: 43200, expires_at: expires, token_type: 'bearer', user };
  const stats = { syntheticReads: 0, refusedAuthorization: 0 };
  const json = (res, body) => { stats.syntheticReads += 1; return res.set('Cache-Control', 'no-store')
    .set('X-Integration-Preview', 'synthetic-ui-only-no-authority').json(body); };
  const auth = (req, res, next) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      stats.refusedAuthorization += 1;
      return res.status(401).json({ ok: false, code: 'synthetic_preview_session_required' });
    }
    next();
  };
  const description = 'Synthetic local display fixture only. No real product, price, availability, image approval or purchase offer.';
  const cases = [
    ['missing', 'Synthetic Missing Media', null],
    ['malformed', 'Synthetic Malformed Media', { width: 17, href: 'not-a-valid-image-descriptor' }],
    ['blocked', 'Synthetic Blocked Media', 'blocked'],
  ];
  const cards = cases.map(([kind, displayName, media]) => {
    const id = `synthetic-${kind}`;
    return { id, slug: id, displayName, aliases: [], lane: 'research_material',
      category: 'Synthetic preview fixtures', classification: 'Synthetic research display only',
      summary: `${description}${kind === 'blocked' ? ' This image is deliberately blocked by the local preview CSP to test onError fallback; it is not a fetched broken delivery.' : ''}`,
      displayState: 'unavailable', price: null, readiness: null, selection: null,
      variantCount: 1, updatedAt: now,
      media: media === 'blocked' ? {
        mediaId: 'synthetic-blocked-media', productId: id, variantId: `${id}-variant`,
        // Required production parser host; preview img-src prevents the request.
        href: 'https://xeniostechnology.com/research/products/synthetic-preview-do-not-fetch.png',
        altText: 'Synthetic local image error-path fixture, not approved packaging',
        filename: 'synthetic-preview-do-not-fetch.png', width: 1024, height: 1024,
        contentSha256: '0'.repeat(64), sourceVersion: 'synthetic-not-an-approval',
        policy: 'xenios_public_media_v1', illustrative: true, expiresAt: null,
      } : media,
    };
  });
  const details = new Map(cards.map(card => [card.slug, { ...card,
    canonicalName: card.displayName, audience: 'member', currency: 'USD', evaluatedAt: now,
    overview: description, specifications: 'Synthetic exact variant for UI review only.',
    researchInformation: null, storageInformation: null, shippingInformation: null,
    returnInformation: null, disclaimers: description, reviewDate: null,
    variants: [{ id: `${card.id}-variant`, productId: card.id, sku: `SYNTHETIC-${card.id.toUpperCase()}`,
      label: 'Synthetic unavailable variant', strength: null, size: null, format: null,
      presentation: null, shippingClass: null, availability: 'unavailable',
      lotCoaState: 'required', price: null, selection: null, selectionFailure: 'product_unavailable' }],
    relatedProducts: cards.filter(other => other.id !== card.id), researchOnlyBoundary: true,
  }]));
  const catalog = { audience: 'member', currency: 'USD', evaluatedAt: now,
    items: cards, categories: ['Synthetic preview fixtures'], lanes: ['research_material'] };
  const descriptor = { schemaVersion: 'integration_synthetic_read_fixtures_v1',
    paths: FIXTURE_PATHS, productSlugs: cards.map(card => card.slug),
    authorizationQualification: false, commerceEnabled: false, subscriptionOffer: null,
    prices: null, realProductData: false, realImageApproval: false,
    mediaErrorMechanism: 'CSP prevents remote image request; actual component onError must be observed',
    authMechanism: 'Unsigned local-only session fixture through unchanged production client',
    sessionExpiryHours: 12, syntheticFixtureDigest: createHash('sha256')
      .update(JSON.stringify({ catalog, details: [...details] })).digest('hex') };

  app.get('/__preview/start', (_req, res) => res.set('Cache-Control', 'no-store').type('html').send(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Synthetic integration preview</title>' +
    '<script src="/__preview/bootstrap.js" defer></script></head><body><h1>Synthetic local preview only</h1>' +
    '<p>No real authentication, customer data, product offer, approved price, email or purchase is enabled. All writes are refused.</p>' +
    '<p id="fixture-status">Preparing isolated local synthetic session.</p>' +
    '<ul><li><a href="/">Actual full-App homepage</a></li><li><a href="/partners">Partner page</a></li>' +
    '<li><a href="/research/member/products">Synthetic member catalog</a></li>' +
    '<li><a href="/research/member/products/synthetic-missing">Missing-image detail and unavailable subscription</a></li>' +
    '<li><a href="/research/member/products/synthetic-malformed">Malformed-image detail</a></li>' +
    '<li><a href="/research/member/products/synthetic-blocked">CSP-blocked image error path</a></li></ul></body></html>'));
  app.get('/__preview/bootstrap.js', (_req, res) => res.set('Cache-Control', 'no-store')
    .type('application/javascript').send(`'use strict';\nlocalStorage.setItem('sb-127-auth-token', ${JSON.stringify(JSON.stringify(session))});\ndocument.getElementById('fixture-status').textContent='Synthetic session ready on this fresh loopback origin. Not real Auth verification.';\n`));
  app.get('/__preview/info', (_req, res) => json(res, { ...descriptor, statistics: { ...stats } }));
  app.get('/api/config', (_req, res) => json(res, { metaPixelId: null, turnstileSiteKey: null,
    calendlyUrl: '', supabaseUrl: getOrigin(), supabaseAnonKey: 'synthetic-preview-public-key-not-a-real-key' }));
  app.get('/auth/v1/user', auth, (_req, res) => json(res, user));
  app.get('/api/research/me', (_req, res) => json(res, { configured: true, authed: false, publicMode: false }));
  app.get('/api/research/member/me', auth, (_req, res) => json(res, { ok: true, member: {
    firstName: 'Synthetic preview', status: 'active', applicationStatus: null } }));
  app.get('/api/research/catalog', auth, (_req, res) => json(res, { products: [],
    commerce: { research: false, consumer: false }, email: 'synthetic-preview@example.invalid' }));
  app.get('/api/research/member/products', auth, (_req, res) => json(res, { ok: true, catalog }));
  app.get('/api/research/member/products/:slug', auth, (req, res) => {
    const product = details.get(req.params.slug);
    return product ? json(res, { ok: true, product }) : res.status(404).json({ ok: false, code: 'not_found' });
  });
  app.get('/api/research/early-access/assisted-orders/config', (_req, res) =>
    res.status(503).json({ enabled: false, code: 'synthetic_preview_write_workflows_disabled' }));
  app.use(['/api', '/auth', '/rest', '/storage', '/functions'], (_req, res) =>
    res.status(404).set('Cache-Control', 'no-store').json({ ok: false, code: 'preview_api_unavailable' }));
  return { descriptor, statistics: () => ({ ...stats }) };
}
