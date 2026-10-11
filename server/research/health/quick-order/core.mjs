/** Quick Order input and projection boundary. It grants no catalog or write authority. */
export const SOURCE_KINDS = Object.freeze(['person', 'collective', 'organization', 'social', 'search', 'direct', 'other']);
export const AFFILIATIONS = Object.freeze(['none', 'collective', 'gym', 'team', 'clinic', 'other']);
export const US_REGIONS = Object.freeze('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
export const MODES = Object.freeze(['direct_order_request', 'provider_request', 'request_pricing', 'request_activation', 'availability_review']);
export const ESTIMATE_EXCLUSIONS = 'Shipping, tax, clinical, pharmacy and other unconfirmed charges. Not a payment quote.';

export class InputError extends Error {
  constructor(field, message, status = 422, code = 'invalid_input') {
    super(message);
    this.name = 'InputError';
    Object.assign(this, { field, status, code });
  }
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new InputError(field, 'Please complete this section.');
  }
  return value;
}
function only(value, allowed, field) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new InputError(field, 'Unexpected input field.');
}
export function text(value, field, max = 160, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) throw new InputError(field, 'Enter a valid value.');
  const normalized = value.trim().normalize('NFC');
  if ((!optional && !normalized) || normalized.length > max) throw new InputError(field, `Enter a valid value (up to ${max} characters).`);
  return normalized;
}
function enumValue(value, allowed, field) {
  if (!allowed.includes(value)) throw new InputError(field, 'Choose an option.');
  return value;
}
function address(raw, field) {
  const value = object(raw, field);
  only(value, ['line1', 'line2', 'city', 'region', 'postalCode', 'countryCode'], field);
  const region = text(value.region, `${field}.region`, 2).toUpperCase();
  if (!US_REGIONS.includes(region)) throw new InputError(`${field}.region`, 'Choose a supported US state or DC.');
  if (value.countryCode !== 'US') throw new InputError(`${field}.countryCode`, 'This form supports US addresses only.');
  const postalCode = text(value.postalCode, `${field}.postalCode`, 10);
  if (!/^\d{5}(-\d{4})?$/u.test(postalCode)) throw new InputError(`${field}.postalCode`, 'Enter a valid ZIP code.');
  return { line1: text(value.line1, `${field}.line1`, 200), line2: text(value.line2, `${field}.line2`, 120, true), city: text(value.city, `${field}.city`, 100), region, postalCode, countryCode: 'US' };
}

export function validateSubmission(raw) {
  raw = object(raw, 'request');
  only(raw, ['schemaVersion', 'idempotencyKey', 'contact', 'referral', 'affiliation', 'lines', 'agreements', 'requestAcknowledged'], 'request');
  if (raw.schemaVersion !== 'quick-order-v1') throw new InputError('schemaVersion', 'Refresh the form to use the current version.');
  const idempotencyKey = text(raw.idempotencyKey, 'idempotencyKey', 80);
  if (!/^[a-zA-Z0-9_-]{16,80}$/u.test(idempotencyKey)) throw new InputError('idempotencyKey', 'Invalid request key.');
  const c = object(raw.contact, 'contact');
  only(c, ['fullLegalName', 'email', 'mobilePhone', 'organizationName', 'ageConfirmed', 'shippingAddress', 'billingSameAsShipping', 'billingAddress'], 'contact');
  const email = text(c.email, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new InputError('email', 'Enter a valid email address.');
  const phone = text(c.mobilePhone, 'phone', 32);
  if (!/^\+?[\d ().-]+$/u.test(phone)) throw new InputError('phone', 'Enter a valid US phone number.');
  let digits = phone.replace(/\D/gu, '');
  if (phone.startsWith('+') && !(digits.length === 11 && digits.startsWith('1'))) throw new InputError('phone', 'Enter a valid US phone number.');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/u.test(digits)) throw new InputError('phone', 'Enter a valid 10-digit US phone number.');
  if (c.ageConfirmed !== true) throw new InputError('ageConfirmed', 'Confirm you are 18 or older.');
  if (typeof c.billingSameAsShipping !== 'boolean') throw new InputError('billingSameAsShipping', 'Choose your billing-address option.');
  const shippingAddress = address(c.shippingAddress, 'shipping address');
  const billingAddress = c.billingSameAsShipping ? { ...shippingAddress } : address(c.billingAddress, 'billing address');
  if (c.billingSameAsShipping && c.billingAddress !== undefined && JSON.stringify(address(c.billingAddress, 'billing address')) !== JSON.stringify(shippingAddress)) {
    throw new InputError('billingSameAsShipping', 'Separate billing details require a different billing-address choice.');
  }
  const contact = { fullLegalName: text(c.fullLegalName, 'full name', 150), email, mobilePhone: `+1${digits}`, organizationName: text(c.organizationName, 'organization name', 160, true), ageConfirmed: true, shippingAddress, billingSameAsShipping: c.billingSameAsShipping, billingAddress };
  const referral = object(raw.referral, 'referral');
  only(referral, ['kind', 'detail', 'declaredCode', 'confirmed'], 'referral');
  const kind = enumValue(referral.kind, SOURCE_KINDS, 'referral source');
  const detail = text(referral.detail, 'referrer/source detail', 180, kind === 'direct');
  const declaredCode = text(referral.declaredCode, 'referral code', 64, true).toUpperCase();
  if (declaredCode && !/^[A-Z0-9_-]{1,64}$/u.test(declaredCode)) throw new InputError('referral.declaredCode', 'Referral codes use letters, numbers, underscores or hyphens.');
  if (referral.confirmed !== true) throw new InputError('referral.confirmed', 'Confirm the referral information is accurate.');
  const a = object(raw.affiliation, 'affiliation');
  only(a, ['kind', 'detail'], 'affiliation');
  const affiliationKind = enumValue(a.kind, AFFILIATIONS, 'affiliation');
  const affiliationDetail = text(a.detail, 'affiliation name', 180, affiliationKind === 'none');
  if (affiliationKind === 'none' && affiliationDetail) throw new InputError('affiliation name', 'Choose an affiliation when providing its name.');
  const affiliation = { kind: affiliationKind, detail: affiliationDetail };
  if (!Array.isArray(raw.lines) || raw.lines.length < 1 || raw.lines.length > 100) throw new InputError('lines', 'Choose 1 to 100 catalog lines.');
  const seen = new Set();
  const lines = raw.lines.map(rawLine => {
    const line = object(rawLine, 'lines');
    only(line, ['productId', 'variantId', 'quantity', 'expectedCatalogVersion', 'expectedPriceVersion'], 'lines');
    const productId = text(line.productId, 'product ID', 200), variantId = text(line.variantId, 'variant ID', 200);
    const key = JSON.stringify([productId, variantId]);
    if (seen.has(key)) throw new InputError('lines', 'Combine duplicate variants into one line.');
    seen.add(key);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100000) throw new InputError('quantity', 'Quantity must be a positive whole number.');
    return { productId, variantId, quantity: line.quantity, expectedCatalogVersion: text(line.expectedCatalogVersion, 'catalog version', 160), expectedPriceVersion: line.expectedPriceVersion === null ? null : text(line.expectedPriceVersion, 'price version', 160) };
  });
  if (!Array.isArray(raw.agreements) || raw.agreements.length < 1 || raw.agreements.length > 30) throw new InputError('agreements', 'Review the required agreements.');
  const agreementKinds = new Set();
  const agreements = raw.agreements.map(rawAgreement => {
    const agreement = object(rawAgreement, 'agreements');
    only(agreement, ['kind', 'version'], 'agreements');
    const kind = text(agreement.kind, 'agreement kind', 100), version = text(agreement.version, 'agreement version', 100);
    if (agreementKinds.has(kind)) throw new InputError('agreements', 'Choose each required agreement once.');
    agreementKinds.add(kind);
    return { kind, version };
  });
  if (raw.requestAcknowledged !== true) throw new InputError('requestAcknowledged', 'Acknowledge that submission is a request, not payment or treatment approval.');
  return { schemaVersion: 'quick-order-v1', idempotencyKey, contact, referral: { kind, detail, declaredCode, confirmed: true }, affiliation, lines, agreements, requestAcknowledged: true };
}

export function validateAgreements(accepted, required) {
  if (!Array.isArray(required) || required.length < 1 || required.length > 30) throw new InputError('agreements', 'Published terms are unavailable.', 503, 'legal_requirements_unavailable');
  const key = value => JSON.stringify([value?.kind, value?.version]);
  const need = new Set(required.map(key));
  if (need.size !== required.length || new Set(required.map(value => value?.kind)).size !== required.length) throw new InputError('agreements', 'Published terms are unavailable.', 503, 'legal_requirements_unavailable');
  const have = new Set(Array.isArray(accepted) ? accepted.map(key) : []);
  if (!Array.isArray(accepted) || have.size !== accepted.length || have.size !== need.size || [...need].some(value => !have.has(value))) throw new InputError('agreements', 'Terms changed or are incomplete. Refresh and review them.', 409, 'terms_changed');
}

/** Only canonical, viewer-authorized rows may reach this projection. */
export function publicCatalogItem(value) {
  const unavailable = () => { throw new InputError('catalog', 'Catalog authority is unavailable.', 503, 'catalog_unavailable'); };
  if (!value || !MODES.includes(value.workflowMode) || typeof value.researchUseOnly !== 'boolean' || typeof value.requestable !== 'boolean') return unavailable();
  if (value.currency !== 'USD') return unavailable();
  const { minimumQuantity, maximumQuantity, quantityIncrement } = value;
  if (![minimumQuantity, maximumQuantity, quantityIncrement].every(Number.isSafeInteger) || minimumQuantity < 1 || maximumQuantity < minimumQuantity || maximumQuantity > 100000 || quantityIncrement < 1) return unavailable();
  const hiddenPrice = value.workflowMode === 'provider_request' || value.workflowMode === 'request_activation';
  const price = hiddenPrice ? null : value.unitPriceCents;
  if (price !== null && (!Number.isSafeInteger(price) || price <= 0)) return unavailable();
  if (!hiddenPrice && price !== null && (typeof value.priceVersion !== 'string' || !value.priceVersion.trim())) return unavailable();
  if (!hiddenPrice && price === null && value.priceVersion !== null) return unavailable();
  try {
    return {
      productId: text(value.productId, 'product ID', 200), variantId: text(value.variantId, 'variant ID', 200), productName: text(value.productName, 'product name', 250),
      specification: value.specification == null ? null : text(value.specification, 'specification', 250, true), family: text(value.family, 'family', 100),
      workflowMode: value.workflowMode, unitPriceCents: price, currency: 'USD', catalogVersion: text(value.catalogVersion, 'catalog version', 160),
      priceVersion: hiddenPrice || value.priceVersion === null ? null : text(value.priceVersion, 'price version', 160), minimumQuantity, maximumQuantity, quantityIncrement,
      researchUseOnly: value.researchUseOnly,
      requestable: value.requestable && !value.researchUseOnly && !['availability_review', 'provider_request', 'request_activation'].includes(value.workflowMode),
      accessNotice: value.accessNotice == null ? null : text(value.accessNotice, 'access notice', 500, true),
    };
  } catch { return unavailable(); }
}

export function validateCurrentLine(input, item) {
  // Exported callers receive the same fail-closed bounds and classification
  // checks as the HTTP path, even if they forgot to project the authority row.
  if (item) item = publicCatalogItem(item);
  if (!item || item.requestable !== true || item.researchUseOnly !== false || ['provider_request', 'availability_review', 'request_activation'].includes(item.workflowMode)) throw new InputError('lines', 'An item is no longer available through this form. Review your selection.', 409, 'catalog_changed');
  if (input.productId !== item.productId || input.variantId !== item.variantId || input.expectedCatalogVersion !== item.catalogVersion || input.expectedPriceVersion !== item.priceVersion) throw new InputError('lines', 'The catalog or price changed. Refresh and review before resubmitting.', 409, 'catalog_changed');
  if (!Number.isSafeInteger(input.quantity) || input.quantity < item.minimumQuantity || input.quantity > item.maximumQuantity || (input.quantity - item.minimumQuantity) % item.quantityIncrement !== 0) throw new InputError('quantity', 'Quantity is outside this item\'s current limits.');
  return { productId: item.productId, variantId: item.variantId, quantity: input.quantity, workflowMode: item.workflowMode, unitPriceCents: item.unitPriceCents, catalogVersion: item.catalogVersion, priceVersion: item.priceVersion };
}
export function estimate(lines) {
  let knownSubtotalCents = 0, pending = false;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new InputError('lines', 'Invalid estimate quantity.');
    if (line.unitPriceCents === null) { pending = true; continue; }
    const amount = line.quantity * line.unitPriceCents;
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents <= 0 || !Number.isSafeInteger(amount) || !Number.isSafeInteger(knownSubtotalCents + amount)) throw new InputError('lines', 'Estimate exceeds the supported amount.');
    knownSubtotalCents += amount;
  }
  return { knownSubtotalCents, estimateComplete: !pending, currency: 'USD', excludes: ESTIMATE_EXCLUSIONS };
}
export function attributionSnapshot(input, receivedAt) {
  return { schemaVersion: 'attribution-v1', source: input.referral.kind, sourceDetail: input.referral.detail, declaredAffiliateCode: input.referral.declaredCode || null, affiliation: { ...input.affiliation }, confirmedByCustomer: true, receivedAt, reviewState: input.referral.kind === 'direct' && !input.referral.declaredCode ? 'direct_no_referrer' : 'captured_unmatched', commissionState: 'not_authorized' };
}
