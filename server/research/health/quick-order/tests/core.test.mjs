import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSubmission, publicCatalogItem, validateCurrentLine, validateAgreements, estimate, attributionSnapshot, InputError, SOURCE_KINDS, AFFILIATIONS } from '../core.mjs';
import { publishedAgreements, safeReceipt, submissionHash } from '../handler.mjs';
import { sampleInput, ITEM, AGREEMENTS } from './fixtures.mjs';

const invalid = (fn, field) => assert.throws(fn, error => error instanceof InputError && (!field || error.field === field));

test('direct/no affiliation and optional fields normalize without invented evidence', () => {
  const raw = sampleInput();
  delete raw.contact.organizationName;
  delete raw.contact.shippingAddress.line2;
  delete raw.referral.declaredCode;
  const normalized = validateSubmission(raw);
  assert.equal(normalized.contact.mobilePhone, '+12025550123');
  assert.equal(normalized.contact.shippingAddress.line2, '');
  assert.equal(normalized.referral.declaredCode, '');
  assert.equal(normalized.affiliation.kind, 'none');
  assert.deepEqual(validateSubmission(normalized), normalized);
});

for (const path of [
  'schemaVersion', 'idempotencyKey', 'contact', 'contact.fullLegalName', 'contact.email', 'contact.mobilePhone', 'contact.ageConfirmed',
  'contact.shippingAddress', 'contact.shippingAddress.line1', 'contact.shippingAddress.city', 'contact.shippingAddress.region', 'contact.shippingAddress.postalCode', 'contact.shippingAddress.countryCode', 'contact.billingSameAsShipping',
  'referral', 'referral.kind', 'referral.confirmed', 'affiliation', 'affiliation.kind', 'lines', 'agreements', 'requestAcknowledged',
]) test(`required omission is refused: ${path}`, () => {
  const raw = sampleInput(), parts = path.split('.'), leaf = parts.pop();
  const section = parts.reduce((value, key) => value[key], raw);
  delete section[leaf];
  invalid(() => validateSubmission(raw));
});

test('non-direct sources and non-none affiliations require names for every enum', () => {
  for (const kind of SOURCE_KINDS.filter(kind => kind !== 'direct')) {
    const raw = sampleInput(); raw.referral.kind = kind;
    invalid(() => validateSubmission(raw), 'referrer/source detail');
    raw.referral.detail = '  Synthetic source  ';
    assert.equal(validateSubmission(raw).referral.detail, 'Synthetic source');
  }
  for (const kind of AFFILIATIONS.filter(kind => kind !== 'none')) {
    const raw = sampleInput(); raw.affiliation.kind = kind;
    invalid(() => validateSubmission(raw), 'affiliation name');
    raw.affiliation.detail = 'Synthetic affiliation';
    assert.equal(validateSubmission(raw).affiliation.kind, kind);
  }
});

test('blank enum, whitespace names, illegal phone and false declarations refuse', () => {
  const edits = [p => { p.referral.kind = ''; }, p => { p.contact.fullLegalName = '   '; }, p => { p.contact.email = 'no-at-sign'; }, p => { p.contact.mobilePhone = '+442025550123'; }, p => { p.contact.mobilePhone = '202+5550123'; }, p => { p.contact.ageConfirmed = 'true'; }, p => { p.referral.confirmed = false; }, p => { p.requestAcknowledged = false; }, p => { p.affiliation = { kind: 'none', detail: 'Contradictory affiliation' }; }];
  for (const edit of edits) { const raw = sampleInput(); edit(raw); invalid(() => validateSubmission(raw)); }
});

test('separate billing requires every address field and never silently replaces conflicting same-address evidence', () => {
  const raw = sampleInput(); raw.contact.billingSameAsShipping = false;
  invalid(() => validateSubmission(raw), 'billing address');
  raw.contact.billingAddress = { ...raw.contact.shippingAddress, postalCode: '20001' };
  assert.equal(validateSubmission(raw).contact.billingAddress.postalCode, '20001');
  for (const field of ['line1', 'city', 'region', 'postalCode', 'countryCode']) {
    const missing = structuredClone(raw); delete missing.contact.billingAddress[field]; invalid(() => validateSubmission(missing));
  }
  raw.contact.billingSameAsShipping = true;
  invalid(() => validateSubmission(raw), 'billingSameAsShipping');
});

test('only states/DC, US country and ZIP formats are accepted', () => {
  for (const [field, value] of [['region', 'PR'], ['region', 'ZZ'], ['countryCode', 'CA'], ['postalCode', 'abcde'], ['postalCode', '1234']]) {
    const raw = sampleInput(); raw.contact.shippingAddress[field] = value; invalid(() => validateSubmission(raw));
  }
  const raw = sampleInput(); raw.contact.shippingAddress.region = 'dc'; raw.contact.shippingAddress.postalCode = '20001-1234';
  assert.equal(validateSubmission(raw).contact.shippingAddress.region, 'DC');
});

test('closed objects reject browser price, trusted attribution, grants and arbitrary authority', () => {
  for (const key of ['commissionRate', 'affiliateAttributionRef', 'totalCents', 'paid', 'actorId']) { const raw = sampleInput(); raw[key] = 'forged'; invalid(() => validateSubmission(raw)); }
  const cases = [p => { p.lines[0].unitPriceCents = 1; }, p => { p.contact.role = 'partner'; }, p => { p.referral.trusted = true; }, p => { p.affiliation.activated = true; }, p => { p.agreements[0].acceptedBy = 'operator'; }];
  for (const edit of cases) { const raw = sampleInput(); edit(raw); invalid(() => validateSubmission(raw)); }
});

test('quantity, composite identity and duplicate agreement boundaries are enforced', () => {
  for (const quantity of [0, -1, 1.5, 100001, '1', NaN]) { const raw = sampleInput(); raw.lines[0].quantity = quantity; invalid(() => validateSubmission(raw), 'quantity'); }
  const duplicate = sampleInput(); duplicate.lines.push({ ...duplicate.lines[0] }); invalid(() => validateSubmission(duplicate), 'lines');
  const agreement = sampleInput(); agreement.agreements.push({ ...agreement.agreements[0], version: 'old' }); invalid(() => validateSubmission(agreement), 'agreements');
});

test('published agreement requirements are exact and required authority cannot duplicate kinds', () => {
  validateAgreements(sampleInput().agreements, AGREEMENTS);
  invalid(() => validateAgreements([], AGREEMENTS));
  invalid(() => validateAgreements(sampleInput().agreements, []));
  invalid(() => validateAgreements(sampleInput().agreements, [...AGREEMENTS, AGREEMENTS[0]]));
  const raw = sampleInput(); raw.agreements[0].version = 'stale'; invalid(() => validateAgreements(raw.agreements, AGREEMENTS));
});

test('form acknowledgments match canonical source bytes and remain separate from legal publication', () => {
  const source = readFileSync(new URL('../../../../../shared/research/assisted-order/form.ts', import.meta.url), 'utf8');
  for (const agreement of AGREEMENTS.filter(item => item.type === 'form_acknowledgment')) {
    assert.ok(source.includes(`copy: "${agreement.label}"`));
    assert.ok(source.includes(`copyHash: "${agreement.version}"`));
  }
  assert.equal(publishedAgreements({ agreements: AGREEMENTS }), true);
  assert.equal(publishedAgreements({ agreements: AGREEMENTS.slice(1) }), false);
  for (const edit of [a => { a[0].url = 'javascript:alert(1)'; }, a => { a[0].url = '//evil.test'; }, a => { a[0].url = '/\\evil.test'; }, a => { a[0].url = 'https://user:secret@example.test'; }, a => { a[1].label += ' Forged.'; }, a => { a[1].type = 'legal'; }, a => { a[1].kind = 'assisted_order_form_v1:research_use_only'; }]) {
    const agreements = structuredClone(AGREEMENTS); edit(agreements); assert.equal(publishedAgreements({ agreements }), false);
  }
});

test('projection never defaults missing bounds, classification or request authority', () => {
  for (const field of ['minimumQuantity', 'maximumQuantity', 'quantityIncrement', 'researchUseOnly', 'requestable', 'currency']) {
    const item = { ...ITEM }; delete item[field]; invalid(() => publicCatalogItem(item));
  }
  for (const field of ['minimumQuantity', 'maximumQuantity', 'quantityIncrement']) invalid(() => publicCatalogItem({ ...ITEM, [field]: null }));
  assert.equal(publicCatalogItem({ ...ITEM, requestable: false }).requestable, false);
});

test('projection strips private fields and keeps actual lower quantity cap', () => {
  const item = publicCatalogItem({ ...ITEM, supplierName: 'private', costCents: 1, patientNotes: 'private', affiliateAttributionRef: 'private' });
  assert.equal(item.maximumQuantity, 50);
  for (const field of ['supplierName', 'costCents', 'patientNotes', 'affiliateAttributionRef']) assert.equal(field in item, false);
});

test('provider, pending classification, held and research rows cannot submit', () => {
  for (const workflowMode of ['provider_request', 'request_activation', 'availability_review']) {
    const row = publicCatalogItem({ ...ITEM, workflowMode });
    assert.equal(row.requestable, false);
    if (workflowMode !== 'availability_review') { assert.equal(row.unitPriceCents, null); assert.equal(row.priceVersion, null); }
    invalid(() => validateCurrentLine(sampleInput().lines[0], row));
  }
  invalid(() => validateCurrentLine(sampleInput().lines[0], publicCatalogItem({ ...ITEM, researchUseOnly: true })));
});

test('invalid price authority, currencies and actions fail closed', () => {
  for (const update of [{ workflowMode: 'buy_anything' }, { currency: 'GBP' }, { unitPriceCents: 0 }, { unitPriceCents: -1 }, { unitPriceCents: undefined }, { unitPriceCents: null }, { priceVersion: null }]) invalid(() => publicCatalogItem({ ...ITEM, ...update }));
  assert.equal(publicCatalogItem({ ...ITEM, unitPriceCents: null, priceVersion: null, workflowMode: 'request_pricing' }).unitPriceCents, null);
});

test('current identity, versions and exact quantity increment are enforced', () => {
  const line = sampleInput().lines[0], item = publicCatalogItem({ ...ITEM, minimumQuantity: 2, maximumQuantity: 8, quantityIncrement: 3 });
  assert.equal(validateCurrentLine({ ...line, quantity: 5 }, item).quantity, 5);
  for (const update of [{ quantity: 1 }, { quantity: 3 }, { quantity: 9 }, { productId: 'other' }, { variantId: 'other' }, { expectedCatalogVersion: 'old' }, { expectedPriceVersion: 'old' }]) invalid(() => validateCurrentLine({ ...line, quantity: 5, ...update }, item));
  const missingCap = { ...item }; delete missingCap.maximumQuantity;
  invalid(() => validateCurrentLine({ ...line, quantity: 5 }, missingCap));
});

test('estimates retain pending prices and reject unsafe arithmetic', () => {
  assert.deepEqual(estimate([{ quantity: 2, unitPriceCents: 2500 }, { quantity: 1, unitPriceCents: null }]), { knownSubtotalCents: 5000, estimateComplete: false, currency: 'USD', excludes: 'Shipping, tax, clinical, pharmacy and other unconfirmed charges. Not a payment quote.' });
  invalid(() => estimate([{ quantity: 2, unitPriceCents: Number.MAX_SAFE_INTEGER }]));
  invalid(() => estimate([{ quantity: 1, unitPriceCents: -1 }]));
});

test('declared evidence is distinct and cannot authorize commissions', () => {
  const raw = sampleInput(); raw.referral = { kind: 'person', detail: 'Synthetic source', declaredCode: 'named_code', confirmed: true }; raw.affiliation = { kind: 'gym', detail: 'Synthetic gym' };
  const input = validateSubmission(raw), snapshot = attributionSnapshot(input, '2026-10-05T00:00:00.000Z');
  assert.equal(snapshot.declaredAffiliateCode, 'NAMED_CODE');
  assert.equal(snapshot.sourceDetail, 'Synthetic source');
  assert.equal(snapshot.affiliation.detail, 'Synthetic gym');
  assert.equal(snapshot.reviewState, 'captured_unmatched');
  assert.equal(snapshot.commissionState, 'not_authorized');
  assert.equal('affiliateAttributionRef' in snapshot, false);
});

test('normalized payload hashes remain stable under object key order and change with intent', () => {
  const input = validateSubmission(sampleInput());
  assert.equal(submissionHash(input), submissionHash(Object.fromEntries(Object.entries(input).reverse())));
  assert.notEqual(submissionHash(input), submissionHash({ ...input, lines: [{ ...input.lines[0], quantity: 2 }] }));
});

test('receipt validation refuses identity, estimate and attribution fabrication', () => {
  const valid = { requestId: '6c20595e-7842-4d95-9eb8-808041d8360d', publicReference: 'XRR-20261005-012345ABCD', attributionState: 'direct_no_referrer', estimate: estimate([{ quantity: 1, unitPriceCents: 2500 }]) };
  assert.equal(safeReceipt(valid).status, 'submitted');
  for (const update of [{ requestId: 'not-an-id' }, { publicReference: 'OK' }, { attributionState: 'paid_partner' }, { estimate: { ...valid.estimate, currency: 'EUR' } }, { estimate: { ...valid.estimate, excludes: 'paid' } }, { estimate: undefined }]) assert.throws(() => safeReceipt({ ...valid, ...update }));
});
