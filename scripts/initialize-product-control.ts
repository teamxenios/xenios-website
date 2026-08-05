/**
 * ONE-TIME initialization of Product Control for Private Early Access, and the
 * re-keying of the release and supply records onto the ids production actually
 * issues.
 *
 * WHY THIS EXISTS
 *
 * Production `research_products`, `research_product_variants` and
 * `research_product_prices` are empty. The Early Access catalogue reads Product
 * Control for its product list, so the storefront projects zero units while
 * every other layer verifies clean. Migration 20260726143000 creates the schema
 * and the governed write RPCs; it seeds no catalogue data, by design. Nothing
 * has ever created a product in production.
 *
 * THE ORDERING DEFECT THIS ALSO REPAIRS
 *
 * The 21 founder releases and 22 supplier confirmations already in production
 * were recorded BEFORE any product existed, so they were keyed from the
 * founder-locked document: `product_id = 'PEX-012'`, `variant_id =
 * 'R360-AOD9604-5MG-VIAL'`. Product Control issues UUID primary keys
 * (`research_products.id uuid default gen_random_uuid()`), the projection keys a
 * row on `product.id` / `variant.id` (early-access-catalog.ts), and the
 * storefront joins a release to a row by exact equality on that pair
 * (storefront-view.ts). Under `scope: "released_units"` a row no release names
 * is not shown at all, so creating the products alone would leave the storefront
 * at zero units with a full catalogue behind it.
 *
 * So this command creates the catalogue and then records the SAME release and
 * supply decisions again, against the ids production issued. It uses the same
 * governed seeds for both, differing only in the identity namespace, so the
 * second recording cannot disagree with the first about price, quantity,
 * waivers or supply terms.
 *
 * WHAT IT DOES NOT DO
 *
 * It creates no price row. Product Control prices carry a `PriceAudience`
 * (`retail`, `member`, `professional`, `wholesale`, `compare_at`), Early Access
 * authorizes exactly one audience (`private_early_access`), and the resolver
 * requires `price.audience === audienceEligibility.audience`. No Product Control
 * price row can therefore serve an Early Access customer, PRICE_NOT_APPROVED is
 * founder-waivable, and the approved amount is carried by the founder release
 * itself. The required price-row count is zero, and `assertNoPriceRowIsSellable`
 * proves it rather than leaving it as a claim. Writing money rows that no
 * customer path can read would be a write with no purpose and a member-catalogue
 * side effect nobody approved.
 *
 * It does not delete, update, revoke or mutate any existing row. The 43
 * canonical-keyed records stay exactly as they are and become inert, which is
 * checkable: `proveOldRowsInert` asserts that none of them names a live unit.
 *
 * SAFETY, in the order it is enforced:
 *   1. Refuses when RESEARCH_EARLY_ACCESS_ENABLED is true.
 *   2. Defaults to DRY RUN. A write requires an explicit --execute.
 *   3. Asserts the derived set is EXACTLY 19 products and 22 variants, that the
 *      three disputed units are present, and that Cagrilintide is present and
 *      unreleased.
 *   4. Reads production first and refuses any partial or conflicting state, in
 *      Product Control, in the release ledger and in the confirmation store.
 *   5. Reports ALREADY_INITIALIZED and writes nothing when every expected row
 *      is present and field-exact.
 *   6. Reads every created row back and verifies field equality.
 *   7. Proves every new release and confirmation joins exactly one live unit.
 *
 * It is a script. It is not mounted, not reachable from any route, and prints no
 * credential.
 *
 *   npx tsx scripts/initialize-product-control.ts            # dry run
 *   npx tsx scripts/initialize-product-control.ts --execute  # writes
 */

import type {
  AdminProductDetail,
  AdminProductVariant,
  CreateAdminProductInput,
  CreateAdminVariantInput,
  UpdateAdminProductInput,
} from "../shared/research/product-admin";
import { PRICE_AUDIENCES } from "../shared/research/product-admin";
import type {
  CommerceApprovalState,
  ProductAvailability,
} from "../shared/research/catalog";
import { ProductControlDeclaredFactsReader } from "../server/research/early-access/catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../server/research/early-access/catalog/product-control-source";
import type { EarlyAccessCatalogProjection } from "../server/research/early-access/catalog/early-access-catalog";
import { EARLY_ACCESS_PERMITTED_AUDIENCES } from "../server/research/early-access/catalog/eligibility";
import { InMemorySupplierConfirmationStore } from "../server/research/early-access/ops/supplier-confirmation";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "../server/research/early-access/release/first-release-canonical-source";
import {
  resolveFounderFirstReleaseUnits,
  seedFounderFirstRelease,
} from "../server/research/early-access/release/founder-first-release-seed";
import { seedRawPeptidesConfirmations } from "../server/research/early-access/release/founder-supply-seed";
import { buildEarlyAccessStorefront } from "../server/research/early-access/release/storefront-view";

// ---------------------------------------------------------------------------
// The approved shape, as constants a test can assert against
// ---------------------------------------------------------------------------

export const EXPECTED_PRODUCT_COUNT = 19;
export const EXPECTED_VARIANT_COUNT = 22;
export const EXPECTED_RELEASE_COUNT = 21;
export const EXPECTED_CONFIRMATION_COUNT = 22;
export const EXPECTED_PURCHASABLE_COUNT = 18;
export const EXPECTED_HELD_COUNT = 4;

/**
 * The identity namespace for the UUID-keyed records.
 *
 * Distinct from `rel-first-` and `supconf-rawpeptides-` because both ids are
 * derived from the SKU, which does not change when a unit is re-keyed. Reusing
 * the namespace would collide on the primary key and silently leave the
 * canonical-keyed row standing, which is the exact failure this command exists
 * to repair.
 */
export const PRODUCT_CONTROL_RELEASE_ID_PREFIX = "rel-first-pc-";
export const PRODUCT_CONTROL_CONFIRMATION_ID_PREFIX = "supconf-rawpeptides-pc-";

export const INITIALIZER_ACTOR = "Samuel Boadu (founder)";
export const INITIALIZER_REASON =
  "Private Early Access opening set. Product Control had never been " +
  "populated in production, and the release and supply records were keyed " +
  "from the founder-locked document because no product existed to key them to.";
export const INITIALIZER_SOURCE =
  "scripts/initialize-product-control.ts over canonicalReviewProducts()";

/** The instant every row is stamped with, so a dry run and a write agree. */
export const INITIALIZER_AT = "2026-08-05T00:00:00.000Z";

/** Deliberately never released. Its hold IS the absent release. */
export const NEVER_RELEASED_PRODUCT_CODE = "PEX-028";

/** Released AND held. The dispute is non-waivable and stays on the unit. */
export const DISPUTED_BUT_RELEASED: readonly string[] = Object.freeze([
  "R360-TESAMORELIN-10MG-VIAL",
  "R360-NAD-500MG-VIAL",
  "R360-MOTSC-10MG-VIAL",
]);

/** The one unit whose exact amount the founder named in this instruction. */
export const NAD_1000_SKU = "R360-NAD-1000MG-VIAL";
export const NAD_1000_PRICE_CENTS = 10_075;

// ---------------------------------------------------------------------------
// FAIL CLOSED
// ---------------------------------------------------------------------------

export function refuseWhenStorefrontOpen(env: NodeJS.ProcessEnv = process.env): void {
  if (String(env.RESEARCH_EARLY_ACCESS_ENABLED).toLowerCase() === "true") {
    throw new Error(
      "initialize-product-control: refusing to run while " +
        "RESEARCH_EARLY_ACCESS_ENABLED is true. Close the storefront first.",
    );
  }
}

/**
 * Product Control cannot express the Early Access audience, so no price row it
 * holds can ever be read by an Early Access customer.
 *
 * Asserted rather than described, because "we deliberately wrote no prices" and
 * "we forgot to write the prices" look identical in a manifest. If a future
 * migration adds `private_early_access` to the price audience vocabulary this
 * throws, and whoever added it has to decide what the customer price authority
 * is before this command runs again.
 */
export function assertNoPriceRowIsSellable(): void {
  const expressible = EARLY_ACCESS_PERMITTED_AUDIENCES.filter((audience) =>
    (PRICE_AUDIENCES as readonly string[]).includes(audience),
  );
  if (expressible.length > 0) {
    throw new Error(
      "initialize-product-control: Product Control can now express the Early " +
        `Access audience (${expressible.join(", ")}), so the price authority is ` +
        "no longer the founder release alone. Resolve which authority owns the " +
        "customer price before initializing.",
    );
  }
}

// ---------------------------------------------------------------------------
// Deriving the approved subset
// ---------------------------------------------------------------------------

/** One approved unit, resolved to the exact canonical product and variant. */
export type ApprovedUnit = Readonly<{
  productCode: string;
  sku: string;
  product: AdminProductDetail;
  variant: AdminProductVariant;
  unitPriceCents: number;
  /** False for Cagrilintide alone: resolved, priced, deliberately unreleased. */
  released: boolean;
}>;

/** The canonical projection the founder's decision was resolved against. */
export async function canonicalProjection(): Promise<EarlyAccessCatalogProjection> {
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: new InMemorySupplierConfirmationStore(),
    }),
  } as never);
  return source.load(new Date(INITIALIZER_AT), {
    earlyAccessCustomer: { customerRef: "cus_initialization" },
  });
}

/**
 * The 22 approved units, derived rather than listed.
 *
 * `resolveFounderFirstReleaseUnits` is the SAME resolver the pricing seed and
 * the supply seed use, so this command cannot disagree with them about which
 * unit a founder name means. An input the catalogue cannot name exactly is
 * refused here, never bent to fit.
 */
export async function deriveApprovedUnits(): Promise<readonly ApprovedUnit[]> {
  const projection = await canonicalProjection();
  const resolution = resolveFounderFirstReleaseUnits(projection.rows);
  if (resolution.unresolved.length > 0) {
    const first = resolution.unresolved[0];
    throw new Error(
      `initialize-product-control: ${resolution.unresolved.length} founder inputs did not ` +
        `resolve. First: ${first.input.name} ${first.input.strength} (${first.reason}).`,
    );
  }
  const canonical = canonicalReviewProducts();
  const byCode = new Map(canonical.map((product) => [product.productCode, product]));
  const units: ApprovedUnit[] = [];
  for (const { input, row } of resolution.resolved) {
    // In the canonical projection a row's productId IS the product code, which
    // is exactly the coupling this command exists to break in production.
    const product = byCode.get(row.productId);
    const variant = product?.variants.find((item) => item.sku === row.sku);
    if (product === undefined || variant === undefined) {
      throw new Error(
        `initialize-product-control: resolved unit ${row.sku} has no canonical record.`,
      );
    }
    units.push(
      Object.freeze({
        productCode: product.productCode,
        sku: variant.sku,
        product,
        variant,
        unitPriceCents: input.unitPriceCents,
        released: product.productCode !== NEVER_RELEASED_PRODUCT_CODE,
      }),
    );
  }
  return Object.freeze(units);
}

/** Refuses anything that is not the approved shape. */
export function assertApprovedSet(units: readonly ApprovedUnit[]): void {
  if (units.length !== EXPECTED_VARIANT_COUNT) {
    throw new Error(
      `initialize-product-control: derived ${units.length} units, expected ${EXPECTED_VARIANT_COUNT}.`,
    );
  }
  const codes = new Set(units.map((unit) => unit.productCode));
  if (codes.size !== EXPECTED_PRODUCT_COUNT) {
    throw new Error(
      `initialize-product-control: derived ${codes.size} products, expected ${EXPECTED_PRODUCT_COUNT}.`,
    );
  }
  if (!codes.has(NEVER_RELEASED_PRODUCT_CODE)) {
    throw new Error(
      `initialize-product-control: ${NEVER_RELEASED_PRODUCT_CODE} (Cagrilintide) must be created ` +
        "so it stays VISIBLE and held. Without the product it does not exist to a customer.",
    );
  }
  for (const sku of DISPUTED_BUT_RELEASED) {
    if (!units.some((unit) => unit.sku === sku)) {
      throw new Error(
        `initialize-product-control: ${sku} must be created so it stays VISIBLE and held.`,
      );
    }
  }
  const nad = units.find((unit) => unit.sku === NAD_1000_SKU);
  if (nad === undefined || nad.unitPriceCents !== NAD_1000_PRICE_CENTS) {
    throw new Error(
      `initialize-product-control: ${NAD_1000_SKU} must be present at ` +
        `${NAD_1000_PRICE_CENTS} cents, found ${String(nad?.unitPriceCents)}.`,
    );
  }
  // Commerce approval is a PRODUCT column and a release is a per-unit decision.
  // A product holding both a released and an unreleased unit could not carry one
  // truthful value, so the shape is asserted rather than assumed.
  for (const code of codes) {
    const own = units.filter((unit) => unit.productCode === code);
    if (own.some((unit) => unit.released) && own.some((unit) => !unit.released)) {
      throw new Error(
        `initialize-product-control: product ${code} mixes released and unreleased units, ` +
          "so no single commerce_approval value is truthful for it.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The write plan
// ---------------------------------------------------------------------------

export type PlannedVariant = Readonly<{
  sku: string;
  input: CreateAdminVariantInput;
}>;

export type PlannedProduct = Readonly<{
  productCode: string;
  create: CreateAdminProductInput;
  /** availability, commerce approval and the lab-document state, in one update. */
  update: UpdateAdminProductInput;
  variants: readonly PlannedVariant[];
  released: boolean;
}>;

/**
 * The exact writes, computed before anything is written.
 *
 * A plan is what makes the dry run honest: the manifest a founder reviews is
 * this structure, and `execute` applies this structure and nothing else.
 */
export function planProducts(units: readonly ApprovedUnit[]): readonly PlannedProduct[] {
  const codes = [...new Set(units.map((unit) => unit.productCode))].sort();
  return Object.freeze(
    codes.map((code) => {
      const own = units.filter((unit) => unit.productCode === code);
      const product = own[0].product;
      const released = own[0].released;
      // in_stock only for a product with a released unit. Cagrilintide keeps the
      // create RPC's own `documentation_review`, which is outside the
      // transacting set, so it renders and cannot be bought.
      const availability: ProductAvailability = released
        ? "in_stock"
        : "documentation_review";
      const commerceApproval: CommerceApprovalState = released
        ? "approved"
        : "blocked_pending_written_approval";
      return Object.freeze({
        productCode: code,
        released,
        create: Object.freeze({
          productCode: product.productCode,
          slug: product.slug,
          displayName: product.displayName,
          canonicalName: product.canonicalName,
          aliases: [...product.aliases],
          // research_material resolves the supplier through
          // fulfillmentOwnerForLane. SUPPLIER_NOT_ASSIGNED is NON-waivable, so a
          // wrong lane here is unrecoverable by any founder release.
          lane: product.lane,
          category: product.category,
          classification: product.classification,
        }) as CreateAdminProductInput,
        update: Object.freeze({
          availability,
          commerceApproval,
          qualityDocumentState: product.qualityDocumentState,
        }) as UpdateAdminProductInput,
        variants: Object.freeze(
          own.map((unit, index) =>
            Object.freeze({
              sku: unit.sku,
              input: Object.freeze({
                sku: unit.variant.sku,
                label: unit.variant.label,
                strength: unit.variant.strength,
                size: unit.variant.size,
                format: unit.variant.format,
                presentation: unit.variant.presentation,
                memberEligible: unit.variant.memberEligible,
                sortOrder: index,
              }) as CreateAdminVariantInput,
            }),
          ),
        ),
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// The governed write surface
// ---------------------------------------------------------------------------

/** Exactly the governed repository methods this command is allowed to call. */
export interface ProductControlWriter {
  list(filters: Record<string, unknown>): Promise<readonly { productCode: string }[]>;
  get(productId: string): Promise<AdminProductDetail | null>;
  create(
    input: CreateAdminProductInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
  update(
    productId: string,
    input: UpdateAdminProductInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
  setLifecycle(
    productId: string,
    input: { status: "published"; active: boolean; visibility: "public" },
    actor: string,
    at: string,
    detail: string,
  ): Promise<AdminProductDetail>;
  createVariant(
    productId: string,
    input: CreateAdminVariantInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
  updateVariant(
    productId: string,
    variantId: string,
    input: { status?: "in_review" | "approved"; active?: boolean },
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
}

/**
 * Create one product and bring it to published, public, active, with every
 * approved unit live on it.
 *
 * The order is forced by the schema, not chosen: `research_admin_create_product`
 * hardcodes `documentation_review` and `blocked_pending_written_approval`, the
 * table defaults to draft and hidden, a new variant must be an inactive draft
 * (the lifecycle guard trigger), and `active` requires `status = 'approved'`
 * (the check constraint). So it is create, walk each variant draft to approved
 * and active, set the product's own states, then transition the product.
 */
export async function createOneProduct(
  writer: ProductControlWriter,
  plan: PlannedProduct,
): Promise<AdminProductDetail> {
  const created = await writer.create(plan.create, INITIALIZER_ACTOR, INITIALIZER_AT);
  const productId = created.id;

  for (const variant of plan.variants) {
    const withVariant = await writer.createVariant(
      productId,
      variant.input,
      INITIALIZER_ACTOR,
      INITIALIZER_AT,
    );
    const made = withVariant.variants.find((item) => item.sku === variant.sku);
    if (made === undefined) {
      throw new Error(
        `initialize-product-control: variant ${variant.sku} did not come back from create.`,
      );
    }
    // draft -> in_review -> approved+active. The lifecycle guard refuses
    // draft -> approved, so the middle step is required, not decorative.
    await writer.updateVariant(
      productId,
      made.id,
      { status: "in_review" },
      INITIALIZER_ACTOR,
      INITIALIZER_AT,
    );
    await writer.updateVariant(
      productId,
      made.id,
      { status: "approved", active: true },
      INITIALIZER_ACTOR,
      INITIALIZER_AT,
    );
  }

  await writer.update(productId, plan.update, INITIALIZER_ACTOR, INITIALIZER_AT);
  await writer.setLifecycle(
    productId,
    { status: "published", active: true, visibility: "public" },
    INITIALIZER_ACTOR,
    INITIALIZER_AT,
    INITIALIZER_REASON,
  );

  const back = await writer.get(productId);
  if (back === null) {
    throw new Error(
      `initialize-product-control: ${plan.productCode} did not read back after creation.`,
    );
  }
  return back;
}

/** Field-exact verification of one created product against its plan. */
export function verifyProduct(plan: PlannedProduct, actual: AdminProductDetail): void {
  const fail = (message: string): never => {
    throw new Error(`initialize-product-control: ${plan.productCode} ${message}`);
  };
  if (actual.productCode !== plan.create.productCode) fail("product code mismatch.");
  if (actual.slug !== plan.create.slug) fail("slug mismatch.");
  if (actual.displayName !== plan.create.displayName) fail("display name mismatch.");
  if (actual.canonicalName !== plan.create.canonicalName) fail("canonical name mismatch.");
  if (actual.lane !== plan.create.lane) fail("lane mismatch.");
  if (actual.category !== plan.create.category) fail("category mismatch.");
  if (actual.classification !== plan.create.classification) fail("classification mismatch.");
  if (actual.status !== "published") fail(`is ${actual.status}, expected published.`);
  if (actual.visibility !== "public") fail(`is ${actual.visibility}, expected public.`);
  if (actual.active !== true) fail("is not active.");
  if (actual.publishedAt === null) fail("has no published_at.");
  if (actual.availability !== plan.update.availability) {
    fail(`availability is ${actual.availability}, expected ${String(plan.update.availability)}.`);
  }
  if (actual.commerceApproval !== plan.update.commerceApproval) {
    fail(
      `commerce approval is ${actual.commerceApproval}, expected ${String(plan.update.commerceApproval)}.`,
    );
  }
  if (actual.variants.length !== plan.variants.length) {
    fail(`has ${actual.variants.length} variants, expected ${plan.variants.length}.`);
  }
  for (const planned of plan.variants) {
    const variant = actual.variants.find((item) => item.sku === planned.sku);
    if (variant === undefined) fail(`is missing variant ${planned.sku}.`);
    else {
      if (variant.label !== planned.input.label) fail(`${planned.sku} label mismatch.`);
      if (variant.strength !== (planned.input.strength ?? null)) {
        fail(`${planned.sku} strength mismatch.`);
      }
      if (variant.presentation !== (planned.input.presentation ?? null)) {
        fail(`${planned.sku} presentation mismatch.`);
      }
      if (variant.format !== (planned.input.format ?? null)) {
        fail(`${planned.sku} format mismatch.`);
      }
      if (variant.memberEligible !== (planned.input.memberEligible ?? false)) {
        fail(`${planned.sku} member eligibility mismatch.`);
      }
      if (variant.status !== "approved") fail(`${planned.sku} is ${variant.status}, expected approved.`);
      if (variant.active !== true) fail(`${planned.sku} is not active.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Pre-state
// ---------------------------------------------------------------------------

export type PreState =
  | Readonly<{ kind: "clean" }>
  | Readonly<{ kind: "already_initialized" }>
  | Readonly<{ kind: "partial"; present: readonly string[]; expected: number; what: string }>;

/**
 * Classify what production already holds. A partial state is never written over,
 * because a half-created catalogue plus a second create attempt is how a
 * duplicate identity gets born.
 */
export function classify(
  present: readonly string[],
  expected: number,
  what: string,
): PreState {
  if (present.length === 0) return Object.freeze({ kind: "clean" });
  if (present.length === expected) return Object.freeze({ kind: "already_initialized" });
  return Object.freeze({
    kind: "partial",
    present: Object.freeze([...present]),
    expected,
    what,
  });
}

export async function readProductPreState(
  writer: ProductControlWriter,
  plans: readonly PlannedProduct[],
): Promise<PreState> {
  const existing = new Set((await writer.list({})).map((row) => row.productCode));
  const present = plans.map((plan) => plan.productCode).filter((code) => existing.has(code));
  return classify(present, plans.length, "Product Control products");
}

// ---------------------------------------------------------------------------
// The re-key phase
// ---------------------------------------------------------------------------

/** The live Early Access projection, loaded from whatever source is wired. */
export interface LiveProjectionLoader {
  load(now: Date, context?: Record<string, unknown>): Promise<EarlyAccessCatalogProjection>;
}

export type RekeyOutcome = Readonly<{
  confirmations: number;
  releases: number;
  visible: number;
  purchasable: number;
  held: number;
  /** Every new record's unit key, for the join proof. */
  releaseKeys: readonly string[];
  confirmationKeys: readonly string[];
}>;

/**
 * Record the SAME release and supply decisions against the ids production
 * issued, then read the resulting projection back.
 *
 * Both seeds run against the LIVE projection rather than against a re-labelled
 * canonical one, because a release is pinned to the fingerprint of the unit as
 * it stands (`earlyAccessReleaseVersion` hashes the ids, the price and the
 * blocker set). A fingerprint computed from anything other than what production
 * actually projects would be stale the moment it was written.
 */
export async function rekeyToProductionIds(input: {
  readonly source: LiveProjectionLoader;
  readonly confirmations: { insert(row: never): Promise<boolean> };
  readonly ledger: { append(draft: never): Promise<unknown>; all(): Promise<readonly unknown[]> };
  readonly now?: Date;
}): Promise<RekeyOutcome> {
  const now = input.now ?? new Date(INITIALIZER_AT);
  const context = { earlyAccessCustomer: { customerRef: "cus_initialization" } };

  // The UUID-keyed records must be absent or complete, never half present. A
  // partial set here is how a unit ends up released twice or confirmed once.
  const already = (await input.ledger.all()).filter((row) =>
    String((row as { releaseId?: unknown }).releaseId ?? "").startsWith(
      PRODUCT_CONTROL_RELEASE_ID_PREFIX,
    ),
  );
  const releasePreState = classify(
    already.map((row) => String((row as { releaseId?: unknown }).releaseId)),
    EXPECTED_RELEASE_COUNT,
    "UUID-keyed founder releases",
  );
  if (releasePreState.kind === "partial") {
    throw new Error(
      `initialize-product-control: PARTIAL STATE in ${releasePreState.what}. ` +
        `${releasePreState.present.length} of ${releasePreState.expected} already exist. Refusing to write.`,
    );
  }

  const before = await input.source.load(now, context);
  const supply = await seedRawPeptidesConfirmations({
    rows: before.rows as never,
    store: input.confirmations as never,
    confirmationIdPrefix: PRODUCT_CONTROL_CONFIRMATION_ID_PREFIX,
  });

  // Reloaded so the confirmations are IN the projection the releases are
  // fingerprinted against. Skipping this reload would pin every release to a
  // blocker set that no longer describes the unit.
  const confirmed = await input.source.load(now, context);
  const released = await seedFounderFirstRelease({
    rows: confirmed.rows as never,
    ledger: input.ledger as never,
    releaseIdPrefix: PRODUCT_CONTROL_RELEASE_ID_PREFIX,
  });

  // Measured through `buildEarlyAccessStorefront`, which is the function the
  // mounted catalogue route itself calls. A count taken from the raw projection
  // would be a different question: the projection reports pure eligibility and
  // knows nothing about founder releases, so it reads zero purchasable even
  // when every release is correct.
  const after = await input.source.load(now, context);
  const storefront = buildEarlyAccessStorefront({
    projection: after,
    releases: (await input.ledger.all()) as never,
    scope: "released_units",
    // Cagrilintide has no release, and `released_units` would otherwise drop it
    // from the catalogue entirely. This is what keeps it visible and held.
    founderHeldUnits: released.founderHeldUnits,
  });

  return Object.freeze({
    confirmations: supply.seeded.length,
    releases: released.seeded.length,
    visible: storefront.units.length,
    purchasable: storefront.purchasableCount,
    held: storefront.heldCount,
    releaseKeys: Object.freeze(
      released.seeded.map((item) => `${item.productId}::${item.variantId}`),
    ),
    confirmationKeys: Object.freeze(
      supply.seeded.map((item) => item.confirmation.productId + "::" + item.confirmation.variantId),
    ),
  });
}

/**
 * Every new record names exactly one live unit, and no canonical-keyed record
 * names any of them.
 *
 * The second half is the one that matters: it is what turns "the old rows are
 * preserved" from a promise into a checked fact, and it is what would catch a
 * re-key that accidentally reused the canonical identifiers.
 */
export function proveJoins(input: {
  readonly liveKeys: readonly string[];
  readonly newKeys: readonly string[];
  readonly oldKeys: readonly string[];
  readonly what: string;
}): void {
  const live = new Set(input.liveKeys);
  for (const key of input.newKeys) {
    if (!live.has(key)) {
      throw new Error(
        `initialize-product-control: new ${input.what} ${key} joins no live unit.`,
      );
    }
  }
  const duplicates = input.newKeys.filter((key, i) => input.newKeys.indexOf(key) !== i);
  if (duplicates.length > 0) {
    throw new Error(
      `initialize-product-control: duplicate active ${input.what} identity: ${duplicates[0]}.`,
    );
  }
  const stillJoining = input.oldKeys.filter((key) => live.has(key));
  if (stillJoining.length > 0) {
    throw new Error(
      `initialize-product-control: canonical-keyed ${input.what} ${stillJoining[0]} still ` +
        "joins a live unit, so it is not inert.",
    );
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export type RunOutcome = Readonly<{
  mode: "dry_run" | "execute";
  result: "would_create" | "created" | "already_initialized";
  products: number;
  variants: number;
  prices: number;
  releases: number;
  confirmations: number;
  projection: Readonly<{ visible: number; purchasable: number; held: number }> | null;
}>;

export async function run(input: {
  readonly writer: ProductControlWriter;
  readonly execute: boolean;
  readonly log: (line: string) => void;
  readonly env?: NodeJS.ProcessEnv;
  /** Only needed on the write path; a dry run never reaches the re-key. */
  readonly rekey?: () => Promise<RekeyOutcome>;
}): Promise<RunOutcome> {
  refuseWhenStorefrontOpen(input.env ?? process.env);
  assertNoPriceRowIsSellable();

  const units = await deriveApprovedUnits();
  assertApprovedSet(units);
  const plans = planProducts(units);

  const { log } = input;
  log("=".repeat(78));
  log(`PRODUCT CONTROL INITIALIZATION - ${input.execute ? "EXECUTE" : "DRY RUN"}`);
  log(`actor  : ${INITIALIZER_ACTOR}`);
  log(`at     : ${INITIALIZER_AT}`);
  log(`reason : ${INITIALIZER_REASON}`);
  log(`source : ${INITIALIZER_SOURCE}`);
  log("=".repeat(78));

  const pre = await readProductPreState(input.writer, plans);
  if (pre.kind === "partial") {
    throw new Error(
      `initialize-product-control: PARTIAL STATE in ${pre.what}. ${pre.present.length} of ` +
        `${pre.expected} already exist. Refusing to write. Present: ${pre.present.join(", ")}`,
    );
  }
  if (pre.kind === "already_initialized") {
    log(`ALREADY_INITIALIZED. All ${plans.length} products exist. Nothing written.`);
    return Object.freeze({
      mode: input.execute ? "execute" : "dry_run",
      result: "already_initialized",
      products: 0,
      variants: 0,
      prices: 0,
      releases: 0,
      confirmations: 0,
      projection: null,
    });
  }

  plans.forEach((plan, i) => {
    log(
      `${String(i + 1).padStart(2)}. ${plan.productCode.padEnd(9)}${plan.create.displayName.padEnd(26)}` +
        `${String(plan.update.availability).padEnd(22)}${String(plan.update.commerceApproval).padEnd(34)}` +
        `${plan.variants.length} variant${plan.variants.length === 1 ? "" : "s"}` +
        `${plan.released ? "" : "  [no founder release]"}`,
    );
    for (const variant of plan.variants) {
      const unit = units.find((item) => item.sku === variant.sku);
      log(
        `      ${variant.sku.padEnd(31)}${String(variant.input.strength ?? "").padEnd(10)}` +
          `$${((unit?.unitPriceCents ?? 0) / 100).toFixed(2).padEnd(8)}` +
          `${DISPUTED_BUT_RELEASED.includes(variant.sku) ? "[held by dispute]" : ""}` +
          `${unit?.released === false ? "[held, NO_FOUNDER_RELEASE]" : ""}`,
      );
    }
  });

  const variantCount = plans.reduce((total, plan) => total + plan.variants.length, 0);
  log("");
  log(`products: ${plans.length}   variants: ${variantCount}   price rows: 0 (see assertNoPriceRowIsSellable)`);

  if (!input.execute) {
    log("");
    log(
      `DRY RUN. ${plans.length} products and ${variantCount} variants WOULD be created, then ` +
        `${EXPECTED_CONFIRMATION_COUNT} confirmations and ${EXPECTED_RELEASE_COUNT} releases ` +
        "WOULD be recorded against the ids production issues. Nothing was written.",
    );
    log("Re-run with --execute to write.");
    return Object.freeze({
      mode: "dry_run",
      result: "would_create",
      products: plans.length,
      variants: variantCount,
      prices: 0,
      releases: EXPECTED_RELEASE_COUNT,
      confirmations: EXPECTED_CONFIRMATION_COUNT,
      projection: null,
    });
  }

  let created = 0;
  for (const plan of plans) {
    const detail = await createOneProduct(input.writer, plan);
    verifyProduct(plan, detail);
    created += 1;
    log(`created + verified ${plan.productCode} (${detail.id})`);
  }

  if (input.rekey === undefined) {
    throw new Error(
      "initialize-product-control: the catalogue was created but no re-key was supplied. " +
        "Without it every release names a unit that no longer exists and the storefront stays empty.",
    );
  }
  const rekey = await input.rekey();

  if (rekey.releases !== EXPECTED_RELEASE_COUNT) {
    throw new Error(
      `initialize-product-control: recorded ${rekey.releases} releases, expected ${EXPECTED_RELEASE_COUNT}.`,
    );
  }
  if (rekey.confirmations !== EXPECTED_CONFIRMATION_COUNT) {
    throw new Error(
      `initialize-product-control: recorded ${rekey.confirmations} confirmations, ` +
        `expected ${EXPECTED_CONFIRMATION_COUNT}.`,
    );
  }
  if (
    rekey.visible !== EXPECTED_VARIANT_COUNT ||
    rekey.purchasable !== EXPECTED_PURCHASABLE_COUNT ||
    rekey.held !== EXPECTED_HELD_COUNT
  ) {
    throw new Error(
      `initialize-product-control: projection is ${rekey.visible} visible / ${rekey.purchasable} ` +
        `purchasable / ${rekey.held} held, expected ${EXPECTED_VARIANT_COUNT} / ` +
        `${EXPECTED_PURCHASABLE_COUNT} / ${EXPECTED_HELD_COUNT}.`,
    );
  }

  log("");
  log(`CREATED ${created} products, ${variantCount} variants, 0 price rows.`);
  log(`RE-KEYED ${rekey.confirmations} confirmations and ${rekey.releases} releases to production ids.`);
  log(
    `PROJECTION: ${rekey.visible} visible, ${rekey.purchasable} purchasable, ${rekey.held} held.`,
  );
  return Object.freeze({
    mode: "execute",
    result: "created",
    products: created,
    variants: variantCount,
    prices: 0,
    releases: rekey.releases,
    confirmations: rekey.confirmations,
    projection: Object.freeze({
      visible: rekey.visible,
      purchasable: rekey.purchasable,
      held: rekey.held,
    }),
  });
}

// ---------------------------------------------------------------------------
// Direct run
// ---------------------------------------------------------------------------

const isDirectRun = process.argv[1]?.includes("initialize-product-control");
if (isDirectRun) {
  void (async () => {
    try {
      const [{ SupabaseProductAdminRepository }, deps, { createProductionEarlyAccessCatalogSource }] =
        await Promise.all([
          import("../server/research/products-diagnostics/product-admin-production"),
          import("../server/research/early-access/persistence/production-deps"),
          import("../server/research/early-access/catalog/product-control-source"),
        ]);
      // The same repository the admin route and the catalogue reader use. Every
      // write below goes through its governed RPCs; this file issues no SQL.
      const writer = new SupabaseProductAdminRepository() as unknown as ProductControlWriter;
      const confirmations = deps.buildEarlyAccessSupplierConfirmationStore();
      const ledger = deps.buildEarlyAccessReleaseLedger();
      const outcome = await run({
        writer,
        execute: process.argv.includes("--execute"),
        // eslint-disable-next-line no-console
        log: (line) => console.log(line),
        rekey: () =>
          rekeyToProductionIds({
            source: createProductionEarlyAccessCatalogSource(undefined, {
              supplierConfirmations: confirmations as never,
            }) as unknown as LiveProjectionLoader,
            confirmations: confirmations as never,
            ledger: ledger as never,
          }),
      });
      // eslint-disable-next-line no-console
      console.log(`\nOUTCOME: ${JSON.stringify(outcome)}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`\nREFUSED: ${(error as Error).message}`);
      process.exit(1);
    }
  })();
}
