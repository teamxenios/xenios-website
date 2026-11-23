// Isolated synthetic data/policy only. Importing does no I/O.
export const SOURCE = '83f95809d66520e7ab89588a3d99fbdf28bfc9aa';
export const TREE = '687cd9d57fc0a86a616db0731bd0a8441a4edfd5';
export const PRODUCT = '11111111-1111-4111-8111-111111111111';
export const EXACT = '22222222-2222-4222-8222-222222222222';
export const UNMAPPED = '33333333-3333-4333-8333-333333333333';
export const RETRY = '44444444-4444-4444-8444-444444444444';
export const DETAIL = `/api/admin/research/products/${PRODUCT}`;
export const PAGE = `/admin/research/products/${PRODUCT}`;
export const TOKEN = 'native-product-studio-display-not-a-credential';
export const EMAIL = 'admin@preview.invalid';
export const STAMP = '2026-11-23T00:00:00.000Z';

export function fixtureOrigin(raw) {
  if (typeof raw !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(raw)) throw Error('LOOPBACK_ORIGIN_REQUIRED');
  const u = new URL(raw);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || Number(u.port) < 1024
    || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw Error('LOOPBACK_ORIGIN_REQUIRED');
  return u.origin;
}
export function previewSelection(target) {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')
    || target.includes('%') || target.includes('#') || target.includes('\\')) return null;
  const u = new URL(target, 'http://127.0.0.1:52943');
  if (u.pathname !== DETAIL || !u.search) return null;
  const keys = [...u.searchParams.keys()];
  const id = u.searchParams.get('previewVariantId');
  return keys.length === 1 && keys[0] === 'previewVariantId' && [EXACT, UNMAPPED, RETRY].includes(id) ? id : null;
}
export function syntheticSession(now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0) throw Error('SYNTHETIC_CLOCK_REQUIRED');
  return { access_token: TOKEN, token_type: 'bearer', refresh_token: 'inert-native-display-refresh-never-used',
    expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600,
    user: { id: '55555555-5555-4555-8555-555555555555', email: EMAIL, aud: 'authenticated', role: 'authenticated',
      email_confirmed_at: STAMP, created_at: STAMP, updated_at: STAMP,
      app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [] } };
}
export function syntheticProduct() {
  return { id: PRODUCT, productCode: 'SYNTHETIC-PREVIEW', slug: 'synthetic-preview-only',
    displayName: 'Synthetic Product Studio fixture', canonicalName: 'Synthetic Product Studio fixture', aliases: [],
    lane: 'research_material', category: 'synthetic', classification: 'research_material', status: 'draft', active: false,
    visibility: 'hidden', availability: 'documentation_review', commerceApproval: 'blocked_pending_written_approval',
    qualityDocumentState: 'missing', variantCount: 3, approvedVariantCount: 0, missingInputCount: 1,
    updatedAt: STAMP, publishedAt: null,
    content: { shortDescription: 'SYNTHETIC PRIVATE DRAFT — not preview content', longDescription: null, overview: null,
      specifications: null, researchInformation: null, storageInformation: null, handlingInformation: null,
      shippingInformation: null, returnInformation: null, disclaimers: null, citations: [], reviewDate: null },
    variants: [[EXACT, 'Synthetic exact A'], [UNMAPPED, 'Synthetic unmapped B'], [RETRY, 'Synthetic retry C']].map(([id, label], sortOrder) => ({
      id, productId: PRODUCT, sku: 'SYNTHETIC-' + sortOrder, catalogNumber: null, label, strength: null, size: null,
      format: null, presentation: null, shippingClass: null, memberEligible: false, status: 'draft', active: false,
      sortOrder, createdAt: STAMP, updatedAt: STAMP,
    })), prices: [], media: [], history: [] };
}
/** Creates the actual preview core with controlled readers, not a fake UI. */
export function syntheticPreviewReaders(unavailable = false) {
  return {
    bindings: () => ({ index: new Map([
      ['mo_a|mov_a', { offeringVariantId: 'mov_a', productId: PRODUCT, variantId: EXACT }],
      ['mo_c|mov_c', { offeringVariantId: 'mov_c', productId: PRODUCT, variantId: RETRY }],
    ]), problem: unavailable ? 'SYNTHETIC_SOURCE_UNAVAILABLE' : null }),
    catalog: () => [
      { id: 'mo_a', slug: 'synthetic-a', canonicalKey: 'research_vials|synthetic-a',
        displayName: 'Synthetic approved A', canonicalName: 'Synthetic fixture A', family: 'research_vials',
        category: 'Synthetic only', subcategory: null, brand: null, aliases: [], copyState: 'needs_review',
        stateExplanation: 'Synthetic fixture remains held.', sourceReferences: [], displayState: 'approval_required', visibility: 'member',
        variants: [{ id: 'mov_a', label: 'Synthetic source A', displayState: 'approval_required', visibility: 'member', sourceReferences: [] }] },
      { id: 'mo_c', slug: 'synthetic-c', canonicalKey: 'research_vials|synthetic-c',
        displayName: 'Synthetic approved C', canonicalName: 'Synthetic fixture C', family: 'research_vials',
        category: 'Synthetic only', subcategory: null, brand: null, aliases: [], copyState: 'needs_review',
        stateExplanation: 'Synthetic fixture remains held.', sourceReferences: [], displayState: 'approval_required', visibility: 'member',
        variants: [{ id: 'mov_c', label: 'Synthetic source C', displayState: 'approval_required', visibility: 'member', sourceReferences: [] }] },
    ],
    project: (_offering, variant) => ({ label: variant.id === 'mov_a' ? 'Synthetic exact A — held' : 'Synthetic retry C — held',
      reviewedContent: { summary: variant.id === 'mov_a' ? 'Synthetic reviewed summary A.' : 'Synthetic reviewed summary C.',
        overview: 'Synthetic reviewed overview only; not actual catalog or publication evidence.' },
      reviewMessage: 'Synthetic fixture remains held. No purchase or publication is authorized.' }),
  };
}
