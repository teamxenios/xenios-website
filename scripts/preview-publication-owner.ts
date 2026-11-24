/** Loopback-only synthetic fixture; not imported by the application. */
import express from 'express';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNativeCloseoutPreview } from './preview-native-closeout';
import { inventoryDirectory, inventorySha256 } from './evidence/lib/immutable-dist.mjs';
import { PRODUCT, EXACT, UNMAPPED, RETRY, DETAIL, PAGE, TOKEN, EMAIL,
  fixtureOrigin, previewSelection, syntheticSession, syntheticProduct, syntheticPreviewReaders } from './evidence/lib/product-studio-fixture.mjs';
import type { AdminProductDetail } from '../shared/research/product-admin';
import type { ProductAdminService } from '../server/research/products-diagnostics/product-admin';
import type { CatalogPreviewReaders } from '../server/research/products-diagnostics/catalog-content-preview';

import { assertHostedDist } from './evidence/lib/hosted-preview-dist.mjs';
import { PWA_SOURCE, readPinnedPwaAssets, pwaResponse } from './evidence/lib/hosted-preview-pwa.mjs';
import { createBootstrapDiagnosticFetch, createRequestLifecycle } from './evidence/lib/product-studio-lifecycle.mjs';
import { OWNER_SOURCE as SOURCE, OWNER_TREE as TREE, OWNER_BASE, OWNER_APPROVAL, EXPIRED_APPROVALS,
  createOwnerProtocolFixture, ownerFixtureProduct } from './evidence/lib/publication-owner-fixture.mjs';

const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
let fixtureActive = false;
let fixtureConsumed = false;
export async function buildPublicationOwnerPreview(port: number, distDir: string, role: 'owner' | 'staff') {
  if (fixtureActive || fixtureConsumed) throw Error('ONE_OWNED_FIXTURE_PER_PROCESS');
  fixtureConsumed = true; // Cached SDK state must never be reused for another role/origin.
  const protocol = createOwnerProtocolFixture(role);
  const origin = fixtureOrigin(`http://127.0.0.1:${port}`);
  if (process.env.NODE_ENV === 'production') throw Error('PRODUCTION_REFUSED');
  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const dist = realpathSync(distDir);
  const provenance = assertHostedDist(dist, SOURCE, TREE);
  if (provenance.candidateSha !== SOURCE || provenance.sourceTree !== TREE) throw Error('APP_BUILD_IDENTITY');
  const inventory = inventoryDirectory(dist, new Set(['evidence-provenance.json']));
  if (inventorySha256(inventory) !== provenance.distInventorySha256) throw Error('DIST_BYTES_CHANGED');
  const admittedAssets = new Set(inventory.filter((a: { path: string }) => a.path.startsWith('public/')).map((a: { path: string }) => '/' + a.path.slice(7)));
  const pwa = readPinnedPwaAssets(repo);
  for (const asset of pwa.values()) {
    const current = execFileSync('git', ['-C', repo, 'show', `${SOURCE}:client/public/${asset.path}`]);
    if (!current.equals(asset.bytes)) throw Error('CURRENT_PWA_SOURCE_MISMATCH');
  }
  const bindings = ['scripts/preview-native-closeout.ts', 'server/routes.ts', 'server/supabase.ts',
    'server/research/products-diagnostics/product-admin-routes.ts', 'server/research/products-diagnostics/catalog-content-preview.ts']
    .map(path => {
      const actualPath = resolve(repo, path);
      if (lstatSync(actualPath).isSymbolicLink()) throw Error('RUNTIME_SOURCE_SYMLINK');
      const expected = execFileSync('git', ['-C', repo, 'show', `${SOURCE}:${path}`]);
      const actual = readFileSync(actualPath);
      if (!actual.equals(expected)) throw Error('RUNTIME_SOURCE_MISMATCH');
      return { path, bytes: actual.length, sha256: hash(actual) };
    });
  // Reuse the existing secret-scrubbing, loopback-only synthetic bootstrap.
  // Its Auth/config/statics remain intact. This wrapper supplies only synthetic
  // read data and a GoTrue-shaped response, not a second application Auth guard.
  const originalFetch = globalThis.fetch;
  const originalConnect = net.Socket.prototype.connect;
  fixtureActive = true;
  let native: Awaited<ReturnType<typeof buildNativeCloseoutPreview>> | null = null;
  try {
  const bootstrap = createBootstrapDiagnosticFetch(origin, originalFetch);
  globalThis.fetch = bootstrap.fetch;
  native = await buildNativeCloseoutPreview(port, dist);
  const [{ requireSupabaseAdmin }, { registerProductAdminApi }, { createCatalogContentPreview }] = await Promise.all([
    import('../server/routes'), import('../server/research/products-diagnostics/product-admin-routes'),
    import('../server/research/products-diagnostics/catalog-content-preview'),
  ]);
  const app = express(), product = ownerFixtureProduct() as unknown as AdminProductDetail;
  const counts = { productReads: 0, userReads: 0, writesRefused: 0, unexpectedReads: 0,
    preview: { [EXACT]: 0, [UNMAPPED]: 0, [RETRY]: 0 } };
  const lifecycle = createRequestLifecycle(origin);
  const checkFiles = () => inventorySha256(inventoryDirectory(dist, new Set(['evidence-provenance.json']))) === provenance.distInventorySha256;
  app.use((req, res, next) => {
    const complete = lifecycle.http(req.method, req.originalUrl);
    res.once('finish', () => complete('finish', res.statusCode));
    res.once('close', () => complete('close', res.statusCode));
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
    if (req.get('host') !== `127.0.0.1:${port}`) return res.status(403).end();
    const ownerPost = req.method === 'POST' && [OWNER_APPROVAL, OWNER_APPROVAL + '/preview',
      ...EXPIRED_APPROVALS.map(id => OWNER_APPROVAL + '/' + id + '/revoke')].includes(req.originalUrl);
    if (!['GET', 'HEAD'].includes(req.method) && !ownerPost) {
      counts.writesRefused++; return res.status(405).json({ code: 'fixture_operation_not_admitted' });
    }
    if (/%|\\|#/.test(req.originalUrl)) return res.status(400).end();
    const plain = !req.originalUrl.includes('?');
    const allowed = plain && [PAGE, '/api/config', '/api/admin/me', '/api/admin/research/required-inputs',
      '/preview-backend/auth/v1/user', '/__product_studio_fixture', '/__native_preview', DETAIL].includes(req.path)
      || plain && (admittedAssets.has(req.path) || pwa.has(req.path) || [OWNER_BASE, OWNER_APPROVAL].includes(req.path))
      || previewSelection(req.originalUrl) !== null || ownerPost;
    if (!allowed) { counts.unexpectedReads++; return res.status(404).json({ code: 'fixture_path_not_admitted' }); }
    next();
  });
  // Historical PWA pins also checked byte-for-byte against current app source.
  // These supplements remain outside the immutable archive subset.
  app.use((req, res, next) => {
    const asset = pwaResponse(req.method, req.originalUrl, pwa);
    return asset ? res.type(asset.type).send(asset.bytes) : next();
  });
  // Inert preset session, no login endpoint. The actual requireSupabaseAdmin
  // still calls getUser and independently checks the configured fixture email.
  app.get('/preview-backend/auth/v1/user', (req, res) => {
    counts.userReads++;
    return req.get('authorization') === `Bearer ${TOKEN}`
      ? res.json(syntheticSession().user) : res.status(401).json({ message: 'Invalid synthetic session' });
  });
  app.get('/api/admin/research/required-inputs', requireSupabaseAdmin, (_req, res) => res.json({ ok: true, items: [], summary: {}, readiness: [] }));
  // Finite, loopback-only UI protocol responses. No real approval service, SQL,
  // rights source or storage is claimed; actual Supabase-verifying admin guard
  // remains in front of every route. Role is immutable process input, not a JWT
  // claim, query, request body, browser role switch or managed owner grant.
  app.use(express.json({ limit: '16kb', verify(req, _res, body) {
    (req as express.Request & { fixtureRawBody?: string }).fixtureRawBody = body.toString('utf8');
  } }));
  app.use(OWNER_BASE, requireSupabaseAdmin, (req, res) => {
    if ((req as express.Request & { adminEmail?: string }).adminEmail !== EMAIL) return res.status(403).end();
    if (req.method === 'POST' && !/^application\/json(?:\s*;|$)/i.test(req.get('content-type') ?? '')) return res.status(400).end();
    const answer = protocol.respond(req.method, req.originalUrl,
      (req as express.Request & { fixtureRawBody?: string }).fixtureRawBody ?? '', req.get('idempotency-key'));
    return res.status(answer.status).json(answer.body);
  });
  const router = express();
  registerProductAdminApi(router, {
    requireAdmin: requireSupabaseAdmin,
    publicationPilot: { productId: PRODUCT, variantId: EXACT },
    service: { async get(id: string) { if (id !== PRODUCT) throw Error('SYNTHETIC_ID'); counts.productReads++; return structuredClone(product); } } as unknown as ProductAdminService,
    readCatalogContentPreview(currentProduct, selection) {
      if (typeof selection !== 'string' || !Object.hasOwn(counts.preview, selection)) throw Error('SYNTHETIC_VARIANT');
      const n = ++counts.preview[selection];
      // One controlled failure then success per pair of explicit C reads.
      // Count assertions detect accidental auto-retry; no control POST exists.
      const readers = syntheticPreviewReaders(selection === RETRY && n % 2 === 1) as unknown as CatalogPreviewReaders;
      return createCatalogContentPreview(readers)(currentProduct, selection);
    },
  });
  app.use((req, res, next) => req.path === DETAIL ? router(req, res, next) : next());
  app.get('/__product_studio_fixture', (_req, res) => res.json({ kind: 'PRODUCT_STUDIO_LOCAL_SYNTHETIC_ONLY',
    source: SOURCE, tree: TREE, provenance, runtimeSourceBindings: bindings, counts, protocol: protocol.snapshot(),
    lifecycle: lifecycle.snapshot(), bootstrap: { ...bootstrap.counts, realServiceRoleQualified: false },
    immutableDist: checkFiles(), actualAuthenticationQualified: false,
    productionCatalogQualified: false,
    gitPwaSupplements: [...pwa.values()].map(({ bytes, ...pin }) => ({ ...pin, bytes: bytes.length,
      historicalPinSource: PWA_SOURCE, currentSource: SOURCE, currentSourceBytesMatched: true, fromImportedArchive: false })),
    nativeScope: 'Bootstrap and loopback network confinement reused; only wrapper routes reachable.' }));
  app.use(native.app);
  let restored = false;
  return { app, restore: () => { if (restored) return; restored = true;
    try { native?.restoreFetch(); } finally { globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; fixtureActive = false; }
  } };
  } catch (error) {
    try { native?.restoreFetch(); } finally { globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; fixtureActive = false; }
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--port' || args[2] !== '--dist-dir' || args[4] !== '--role'
    || !['owner', 'staff'].includes(args[5])) throw Error('EXACT_ARGUMENTS_REQUIRED');
  const { app } = await buildPublicationOwnerPreview(Number(args[1]), args[3], args[5] as 'owner' | 'staff');
  app.listen(Number(args[1]), '127.0.0.1', () => console.log('Publication Owner UI PROTOCOL-ONLY fixture ready.'));
}
