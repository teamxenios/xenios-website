import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE, TREE, PRODUCT, EXACT, UNMAPPED, RETRY, DETAIL, TOKEN, EMAIL,
  fixtureOrigin, previewSelection, syntheticSession, syntheticProduct, syntheticPreviewReaders } from './product-studio-fixture.mjs';

test('exact subject is frozen; loopback origin cannot be a live or alternate host', () => {
  assert.match(SOURCE, /^[a-f0-9]{40}$/); assert.match(TREE, /^[a-f0-9]{40}$/);
  assert.equal(fixtureOrigin('http://127.0.0.1:52943'), 'http://127.0.0.1:52943');
  for (const value of ['https://xeniostechnology.com', 'https://xenios-research-staging.onrender.com',
    'http://localhost:52943', 'http://127.0.0.1:80', 'http://127.0.0.1:65536',
    'http://u:p@127.0.0.1:52943', 'http://127.0.0.1:52943/x', 'http://127.0.0.1:52943?x=y']) {
    assert.throws(() => fixtureOrigin(value));
  }
});
test('only the three exact owned variants enter the actual preview query', () => {
  for (const id of [EXACT, UNMAPPED, RETRY]) assert.equal(previewSelection(DETAIL + '?previewVariantId=' + id), id);
});
for (const [name, target] of [
  ['absolute origin', 'https://other.invalid' + DETAIL + '?previewVariantId=' + EXACT],
  ['protocol relative', '//other.invalid' + DETAIL + '?previewVariantId=' + EXACT],
  ['duplicate key', DETAIL + '?previewVariantId=' + EXACT + '&previewVariantId=' + RETRY],
  ['extra privilege claim', DETAIL + '?previewVariantId=' + EXACT + '&role=admin'],
  ['encoded query', DETAIL + '?previewVariantId=%32' + EXACT.slice(1)],
  ['fragment', DETAIL + '?previewVariantId=' + EXACT + '#x'],
  ['unknown identity', DETAIL + '?previewVariantId=99999999-9999-4999-8999-999999999999'],
  ['different product', '/api/admin/research/products/other?previewVariantId=' + EXACT],
]) test('refuses ' + name, () => assert.equal(previewSelection(target), null));
test('synthetic product keeps holds and contains no price or media publication evidence', () => {
  const p = syntheticProduct(); assert.equal(p.id, PRODUCT); assert.equal(p.variants.length, 3);
  assert.equal(new Set(p.variants.map(v => v.id)).size, 3);
  assert(p.variants.every(v => v.productId === PRODUCT && v.memberEligible === false && v.active === false));
  assert.equal(p.commerceApproval, 'blocked_pending_written_approval'); assert.equal(p.visibility, 'hidden');
  assert.deepEqual(p.prices, []); assert.deepEqual(p.media, []); assert.equal(p.publishedAt, null);
  p.variants[0].label = 'mutated'; assert.equal(syntheticProduct().variants[0].label, 'Synthetic exact A');
});
test('only exact A and retry C have mappings; B never borrows either mapping', () => {
  const r = syntheticPreviewReaders(); const { index, problem } = r.bindings(); assert.equal(problem, null);
  assert.deepEqual([...index.values()].map(b => b.variantId).sort(), [EXACT, RETRY].sort());
  assert(![...index.values()].some(b => b.variantId === UNMAPPED));
  assert(r.catalog().every(o => o.displayState === 'approval_required' && o.variants.every(v => v.displayState === 'approval_required')));
  assert.equal(syntheticPreviewReaders(true).bindings().problem, 'SYNTHETIC_SOURCE_UNAVAILABLE');
});
test('preset session is inert fixture data, not a real login or privileged role', () => {
  const s = syntheticSession(1_000_000); assert.equal(s.access_token, TOKEN); assert.equal(s.user.email, EMAIL);
  assert.equal(s.user.role, 'authenticated'); assert.equal(s.expires_at, 4600);
  assert(s.access_token.includes('not-a-credential')); assert(!s.user.app_metadata.admin);
  assert.throws(() => syntheticSession(NaN));
});
