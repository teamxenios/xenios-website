import { randomUUID } from "node:crypto";
import {
  PRODUCT_AVAILABILITY,
  PRODUCT_LANES,
  type CommerceApprovalState,
  type DocumentState,
} from "@shared/research/catalog";
import {
  PRICE_AUDIENCES,
  PRODUCT_MEDIA_KINDS,
  PRODUCT_VISIBILITY_STATES,
  VARIANT_ADMIN_STATUSES,
  type AdminProductDetail,
  type AdminProductListFilters,
  type AdminProductMedia,
  type AdminProductPrice,
  type AdminProductSummary,
  type AdminProductVariant,
  type CreateAdminPriceInput,
  type CreateAdminProductInput,
  type CreateAdminVariantInput,
  type DuplicateAdminProductInput,
  type UpdateAdminProductInput,
} from "@shared/research/product-admin";
import type { RequiredInput } from "@shared/research/required-inputs";
import {
  ProductAdminConflictError,
  ProductAdminNotFoundError,
  ProductAdminStrengthDisputeError,
  ProductAdminValidationError,
} from "./product-admin-errors";
import {
  screenPriceForApproval,
  screenVariantEdit,
  screenVariantForPriceWrite,
  type VariantStrengthWriteRefusal,
} from "./variant-strength-write-gate";

export interface ProductReleaseEvaluation {
  displayReady: boolean;
  commerceReady: boolean;
  blockingKeys: string[];
}

/**
 * Website 2 implements this adapter with the canonical required-input and
 * launch-control services. Website 3 never creates a second readiness store.
 */
export interface ProductReleaseGate {
  evaluate(productId: string): Promise<ProductReleaseEvaluation>;
}

export interface ProductAdminIdempotency {
  run<T>(
    scope: string,
    key: string,
    action: () => Promise<T>,
  ): Promise<T>;
}

export interface ProductAdminRepository {
  list(filters: AdminProductListFilters): Promise<AdminProductSummary[]>;
  get(productId: string): Promise<AdminProductDetail | null>;
  create(
    input: CreateAdminProductInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
  duplicate(
    productId: string,
    input: DuplicateAdminProductInput,
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
    input: {
      status: AdminProductSummary["status"];
      active: boolean;
      visibility: AdminProductSummary["visibility"];
    },
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
    input: Partial<CreateAdminVariantInput> & {
      status?: AdminProductVariant["status"];
      active?: boolean;
    },
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
  createPrice(
    productId: string,
    input: CreateAdminPriceInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
  approvePrice(
    productId: string,
    priceId: string,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
  createMediaUpload(
    productId: string,
    input: {
      kind: AdminProductMedia["kind"];
      filename: string;
      contentType: string;
      sizeBytes: number;
      altText: string;
      sortOrder: number;
    },
    actor: string,
    at: string,
  ): Promise<{
    media: AdminProductMedia;
    uploadUrl: string;
    expiresAt: string;
  }>;
  confirmMediaUpload(
    productId: string,
    mediaId: string,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
  updateMedia(
    productId: string,
    mediaId: string,
    input: {
      state: AdminProductMedia["state"];
      altText: string;
      sortOrder: number;
      reason: string | null;
    },
    actor: string,
    at: string,
  ): Promise<AdminProductDetail>;
}

const PRODUCT_CODE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{1,95}$/;
const CURRENCIES = new Set(["USD"]);
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const COMMERCE_APPROVALS = new Set<CommerceApprovalState>([
  "approved",
  "blocked_pending_written_approval",
  "blocked_by_lane",
  "blocked_by_documentation",
]);
const DOCUMENT_STATES = new Set<DocumentState>([
  "approved",
  "pending",
  "missing",
  "expired",
]);

function requiredText(value: unknown, label: string, max = 240): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProductAdminValidationError(`${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new ProductAdminValidationError(`${label} is too long`);
  }
  return normalized;
}

function optionalText(
  value: unknown,
  label: string,
  max = 240,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, label, max);
}

function exactString<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ProductAdminValidationError(`${label} is invalid`);
  }
  return value as T;
}

function normalizeAliases(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ProductAdminValidationError("aliases must be an array");
  }
  const aliases = value.map((item) => requiredText(item, "alias", 120));
  return Array.from(new Set(aliases));
}

function normalizeCreateProduct(
  value: CreateAdminProductInput,
): CreateAdminProductInput {
  const productCode = requiredText(value.productCode, "productCode", 64).toUpperCase();
  const slug = requiredText(value.slug, "slug", 120).toLowerCase();
  if (!PRODUCT_CODE.test(productCode)) {
    throw new ProductAdminValidationError("productCode has an invalid format");
  }
  if (!SLUG.test(slug)) {
    throw new ProductAdminValidationError("slug has an invalid format");
  }
  return {
    productCode,
    slug,
    displayName: requiredText(value.displayName, "displayName"),
    canonicalName: requiredText(value.canonicalName, "canonicalName"),
    aliases: normalizeAliases(value.aliases),
    lane: exactString(value.lane, PRODUCT_LANES, "lane"),
    category: requiredText(value.category, "category", 120),
    classification: requiredText(
      value.classification,
      "classification",
      120,
    ),
  };
}

function normalizeUpdateProduct(
  value: UpdateAdminProductInput,
): UpdateAdminProductInput {
  const result: UpdateAdminProductInput = {};
  if (value.displayName !== undefined) {
    result.displayName = requiredText(value.displayName, "displayName");
  }
  if (value.canonicalName !== undefined) {
    result.canonicalName = requiredText(value.canonicalName, "canonicalName");
  }
  if (value.aliases !== undefined) result.aliases = normalizeAliases(value.aliases);
  if (value.lane !== undefined) {
    result.lane = exactString(value.lane, PRODUCT_LANES, "lane");
  }
  if (value.category !== undefined) {
    result.category = requiredText(value.category, "category", 120);
  }
  if (value.classification !== undefined) {
    result.classification = requiredText(
      value.classification,
      "classification",
      120,
    );
  }
  if (value.active !== undefined) result.active = value.active === true;
  if (value.visibility !== undefined) {
    result.visibility = exactString(
      value.visibility,
      PRODUCT_VISIBILITY_STATES,
      "visibility",
    );
  }
  if (value.availability !== undefined) {
    result.availability = exactString(
      value.availability,
      PRODUCT_AVAILABILITY,
      "availability",
    );
  }
  if (value.commerceApproval !== undefined) {
    if (!COMMERCE_APPROVALS.has(value.commerceApproval)) {
      throw new ProductAdminValidationError("commerceApproval is invalid");
    }
    result.commerceApproval = value.commerceApproval;
  }
  if (value.qualityDocumentState !== undefined) {
    if (!DOCUMENT_STATES.has(value.qualityDocumentState)) {
      throw new ProductAdminValidationError("qualityDocumentState is invalid");
    }
    result.qualityDocumentState = value.qualityDocumentState;
  }
  if (value.content !== undefined) {
    const content = value.content;
    result.content = {
      ...(content.shortDescription !== undefined
        ? {
            shortDescription: optionalText(
              content.shortDescription,
              "shortDescription",
              500,
            ),
          }
        : {}),
      ...(content.longDescription !== undefined
        ? {
            longDescription: optionalText(
              content.longDescription,
              "longDescription",
              10000,
            ),
          }
        : {}),
      ...(content.overview !== undefined
        ? {
            overview: optionalText(content.overview, "overview", 10000),
          }
        : {}),
      ...(content.specifications !== undefined
        ? {
            specifications: optionalText(
              content.specifications,
              "specifications",
              10000,
            ),
          }
        : {}),
      ...(content.researchInformation !== undefined
        ? {
            researchInformation: optionalText(
              content.researchInformation,
              "researchInformation",
              10000,
            ),
          }
        : {}),
      ...(content.storageInformation !== undefined
        ? {
            storageInformation: optionalText(
              content.storageInformation,
              "storageInformation",
              10000,
            ),
          }
        : {}),
      ...(content.handlingInformation !== undefined
        ? {
            handlingInformation: optionalText(
              content.handlingInformation,
              "handlingInformation",
              10000,
            ),
          }
        : {}),
      ...(content.shippingInformation !== undefined
        ? {
            shippingInformation: optionalText(
              content.shippingInformation,
              "shippingInformation",
              10000,
            ),
          }
        : {}),
      ...(content.returnInformation !== undefined
        ? {
            returnInformation: optionalText(
              content.returnInformation,
              "returnInformation",
              10000,
            ),
          }
        : {}),
      ...(content.disclaimers !== undefined
        ? {
            disclaimers: optionalText(
              content.disclaimers,
              "disclaimers",
              10000,
            ),
          }
        : {}),
      ...(content.citations !== undefined
        ? { citations: normalizeAliases(content.citations) }
        : {}),
      ...(content.reviewDate !== undefined
        ? {
            reviewDate: optionalText(content.reviewDate, "reviewDate", 10),
          }
        : {}),
    };
  }
  if (Object.keys(result).length === 0) {
    throw new ProductAdminValidationError("at least one product field is required");
  }
  return result;
}

function normalizeVariant(
  value: CreateAdminVariantInput,
): CreateAdminVariantInput {
  const sku = requiredText(value.sku, "sku", 96).toUpperCase();
  if (!SKU.test(sku)) {
    throw new ProductAdminValidationError("sku has an invalid format");
  }
  const sortOrder = value.sortOrder ?? 0;
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
    throw new ProductAdminValidationError(
      "sortOrder must be a non-negative integer",
    );
  }
  return {
    sku,
    catalogNumber: optionalText(value.catalogNumber, "catalogNumber", 120),
    label: requiredText(value.label, "label", 160),
    strength: optionalText(value.strength, "strength", 120),
    size: optionalText(value.size, "size", 120),
    format: optionalText(value.format, "format", 120),
    presentation: optionalText(value.presentation, "presentation", 240),
    shippingClass: optionalText(value.shippingClass, "shippingClass", 120),
    memberEligible: value.memberEligible === true,
    sortOrder,
  };
}

function normalizeVariantUpdate(
  input: Partial<CreateAdminVariantInput> & {
    status?: AdminProductVariant["status"];
    active?: boolean;
  },
): Partial<CreateAdminVariantInput> & {
  status?: AdminProductVariant["status"];
  active?: boolean;
} {
  const result: Partial<CreateAdminVariantInput> & {
    status?: AdminProductVariant["status"];
    active?: boolean;
  } = {};
  if (input.sku !== undefined) {
    const sku = requiredText(input.sku, "sku", 96).toUpperCase();
    if (!SKU.test(sku)) {
      throw new ProductAdminValidationError("sku has an invalid format");
    }
    result.sku = sku;
  }
  if (input.catalogNumber !== undefined) {
    result.catalogNumber = optionalText(
      input.catalogNumber,
      "catalogNumber",
      120,
    );
  }
  if (input.label !== undefined) {
    result.label = requiredText(input.label, "label", 160);
  }
  for (const field of [
    "strength",
    "size",
    "format",
    "presentation",
    "shippingClass",
  ] as const) {
    if (input[field] !== undefined) {
      result[field] = optionalText(input[field], field, 240);
    }
  }
  if (input.memberEligible !== undefined) {
    result.memberEligible = input.memberEligible === true;
  }
  if (input.sortOrder !== undefined) {
    if (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0) {
      throw new ProductAdminValidationError(
        "sortOrder must be a non-negative integer",
      );
    }
    result.sortOrder = input.sortOrder;
  }
  if (input.status !== undefined) {
    result.status = exactString(
      input.status,
      VARIANT_ADMIN_STATUSES,
      "status",
    );
  }
  if (input.active !== undefined) result.active = input.active === true;
  if (result.active === true && result.status !== "approved") {
    throw new ProductAdminValidationError(
      "active variants must explicitly enter the approved state",
    );
  }
  if (result.status === "archived" && result.active !== false) {
    throw new ProductAdminValidationError(
      "archived variants must explicitly be inactive",
    );
  }
  if (Object.keys(result).length === 0) {
    throw new ProductAdminValidationError("at least one variant field is required");
  }
  return result;
}

function normalizePrice(value: CreateAdminPriceInput): CreateAdminPriceInput {
  if (!Number.isSafeInteger(value.amountCents) || value.amountCents < 0) {
    throw new ProductAdminValidationError(
      "amountCents must be a non-negative integer",
    );
  }
  const currency = requiredText(value.currency, "currency", 3).toUpperCase();
  if (!CURRENCIES.has(currency)) {
    throw new ProductAdminValidationError("currency is not supported");
  }
  const effectiveAt = requiredText(value.effectiveAt, "effectiveAt", 40);
  if (Number.isNaN(Date.parse(effectiveAt))) {
    throw new ProductAdminValidationError("effectiveAt must be a valid date");
  }
  const expiresAt = optionalText(value.expiresAt, "expiresAt", 40);
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
    throw new ProductAdminValidationError("expiresAt must be a valid date");
  }
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(effectiveAt)) {
    throw new ProductAdminValidationError(
      "expiresAt must be after effectiveAt",
    );
  }
  return {
    variantId: requiredText(value.variantId, "variantId", 120),
    audience: exactString(value.audience, PRICE_AUDIENCES, "audience"),
    amountCents: value.amountCents,
    currency,
    effectiveAt,
    expiresAt,
    approvalNote: optionalText(value.approvalNote, "approvalNote", 1000),
  };
}

/**
 * Turn a strength-write refusal into the file's existing refusal idiom: a
 * conflict carrying a machine code, extended with the reason so the operator can
 * see WHICH two presentations disagree. Called for its throw, so the caller
 * cannot forget to check a returned value.
 */
function refusePriceWrite(refusal: VariantStrengthWriteRefusal | null): void {
  if (refusal === null) return;
  throw new ProductAdminStrengthDisputeError(refusal.code, refusal.reason);
}

export class ProductAdminService {
  constructor(
    private readonly repository: ProductAdminRepository,
    private readonly releaseGate: ProductReleaseGate,
    private readonly idempotency: ProductAdminIdempotency,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  list(filters: AdminProductListFilters = {}) {
    return this.repository.list(filters);
  }

  async get(productId: string): Promise<AdminProductDetail> {
    const product = await this.repository.get(requiredText(productId, "productId"));
    if (!product) throw new ProductAdminNotFoundError("product");
    return product;
  }

  create(
    input: CreateAdminProductInput,
    actor: string,
    idempotencyKey: string,
  ) {
    const normalizedActor = requiredText(actor, "actor", 320);
    return this.idempotency.run(
      "product_admin.create",
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.create(
          normalizeCreateProduct(input),
          normalizedActor,
          this.now(),
        ),
    );
  }

  duplicate(
    productId: string,
    input: DuplicateAdminProductInput,
    actor: string,
    idempotencyKey: string,
  ) {
    const id = requiredText(productId, "productId");
    const normalized = normalizeCreateProduct({
      productCode: input.productCode,
      slug: input.slug,
      displayName: input.displayName,
      canonicalName: input.displayName,
      aliases: [],
      lane: "research_material",
      category: "duplicate",
      classification: "duplicate",
    });
    return this.idempotency.run(
      `product_admin.duplicate.${id}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.duplicate(
          id,
          {
            productCode: normalized.productCode,
            slug: normalized.slug,
            displayName: normalized.displayName,
          },
          requiredText(actor, "actor", 320),
          this.now(),
        ),
    );
  }

  update(
    productId: string,
    input: UpdateAdminProductInput,
    actor: string,
    idempotencyKey: string,
  ) {
    const id = requiredText(productId, "productId");
    return this.idempotency.run(
      `product_admin.update.${id}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.update(
          id,
          normalizeUpdateProduct(input),
          requiredText(actor, "actor", 320),
          this.now(),
        ),
    );
  }

  archive(
    productId: string,
    actor: string,
    reason: string,
    idempotencyKey: string,
  ) {
    const id = requiredText(productId, "productId");
    return this.idempotency.run(
      `product_admin.archive.${id}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.setLifecycle(
          id,
          { status: "archived", active: false, visibility: "hidden" },
          requiredText(actor, "actor", 320),
          this.now(),
          requiredText(reason, "reason", 1000),
        ),
    );
  }

  restore(productId: string, actor: string, idempotencyKey: string) {
    const id = requiredText(productId, "productId");
    return this.idempotency.run(
      `product_admin.restore.${id}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.setLifecycle(
          id,
          { status: "draft", active: true, visibility: "hidden" },
          requiredText(actor, "actor", 320),
          this.now(),
          "Restored to draft.",
        ),
    );
  }

  async publish(
    productId: string,
    actor: string,
    idempotencyKey: string,
  ) {
    const id = requiredText(productId, "productId");
    return this.idempotency.run(
      `product_admin.publish.${id}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      async () => {
        const evaluation = await this.releaseGate.evaluate(id);
        if (!evaluation.displayReady || evaluation.blockingKeys.length > 0) {
          throw new ProductAdminConflictError(
            "product_release_blocked",
            evaluation.blockingKeys,
          );
        }
        return this.repository.setLifecycle(
          id,
          { status: "published", active: true, visibility: "public" },
          requiredText(actor, "actor", 320),
          this.now(),
          "Published after canonical display-readiness validation.",
        );
      },
    );
  }

  unpublish(
    productId: string,
    actor: string,
    reason: string,
    idempotencyKey: string,
  ) {
    const id = requiredText(productId, "productId");
    return this.idempotency.run(
      `product_admin.unpublish.${id}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.setLifecycle(
          id,
          { status: "approved", active: true, visibility: "hidden" },
          requiredText(actor, "actor", 320),
          this.now(),
          requiredText(reason, "reason", 1000),
        ),
    );
  }

  createVariant(
    productId: string,
    input: CreateAdminVariantInput,
    actor: string,
    idempotencyKey: string,
  ) {
    const id = requiredText(productId, "productId");
    return this.idempotency.run(
      `product_admin.create_variant.${id}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.createVariant(
          id,
          normalizeVariant(input),
          requiredText(actor, "actor", 320),
          this.now(),
        ),
    );
  }

  updateVariant(
    productId: string,
    variantId: string,
    input: Partial<CreateAdminVariantInput> & {
      status?: AdminProductVariant["status"];
      active?: boolean;
    },
    actor: string,
    idempotencyKey: string,
  ) {
    const normalized = normalizeVariantUpdate(input);
    const product = requiredText(productId, "productId");
    const variant = requiredText(variantId, "variantId");
    return this.idempotency.run(
      `product_admin.update_variant.${variant}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      async () => {
        // The price gate alone was a check-at-write-time over a MUTABLE key.
        // An adversarial review defeated it with two exploits that never write
        // a price row at all, so neither the price gate nor the SQL price
        // trigger re-fires: walk a priced variant ONTO a disputed SKU, or
        // rename a disputed variant so both the write gate and the read
        // resolver stop recognising it while the contested strength stands.
        // Screening the edit itself is what makes the invariant hold.
        // Only an edit that touches the identity triple can change the dispute
        // answer, so a lifecycle-only update (status, active, title) neither
        // runs the screen nor pays for the extra product read. This is not a
        // loosening: sku, catalogNumber and strength are the only inputs
        // findVariantStrengthDispute reads.
        const touchesIdentity =
          normalized.sku !== undefined ||
          normalized.catalogNumber !== undefined ||
          normalized.strength !== undefined;
        if (touchesIdentity) {
          refusePriceWrite(
            screenVariantEdit(await this.repository.get(product), variant, {
              sku: normalized.sku,
              catalogNumber: normalized.catalogNumber,
              strength: normalized.strength,
            }),
          );
        }
        return this.repository.updateVariant(
          product,
          variant,
          normalized,
          requiredText(actor, "actor", 320),
          this.now(),
        );
      },
    );
  }

  /**
   * A price row is the settlement of a physical presentation, so it is refused
   * before it exists whenever that presentation is contested. The gate sits
   * INSIDE the idempotent action and immediately before the repository call, so
   * no path reaches persistence without it, and it re-reads the product rather
   * than trusting the caller for the strength.
   *
   * Ordering: input validation runs first, so a malformed price still reports
   * the precise validation error rather than an identity refusal.
   */
  async createPrice(
    productId: string,
    input: CreateAdminPriceInput,
    actor: string,
    idempotencyKey: string,
  ) {
    const id = requiredText(productId, "productId");
    const normalized = normalizePrice(input);
    const normalizedActor = requiredText(actor, "actor", 320);
    return this.idempotency.run(
      `product_admin.create_price.${id}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      async () => {
        refusePriceWrite(
          screenVariantForPriceWrite(
            await this.repository.get(id),
            normalized.variantId,
          ),
        );
        return this.repository.createPrice(
          id,
          normalized,
          normalizedActor,
          this.now(),
        );
      },
    );
  }

  /**
   * Approval is the moment a draft price becomes an authority, so it is gated on
   * exactly the same fact as creation. Gating creation alone would leave drafts
   * written before this gate existed able to be approved into active prices.
   */
  async approvePrice(
    productId: string,
    priceId: string,
    actor: string,
    idempotencyKey: string,
  ) {
    const product = requiredText(productId, "productId");
    const price = requiredText(priceId, "priceId");
    const normalizedActor = requiredText(actor, "actor", 320);
    return this.idempotency.run(
      `product_admin.approve_price.${price}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      async () => {
        refusePriceWrite(
          screenPriceForApproval(await this.repository.get(product), price),
        );
        return this.repository.approvePrice(
          product,
          price,
          normalizedActor,
          this.now(),
        );
      },
    );
  }

  createMediaUpload(
    productId: string,
    input: {
      kind: AdminProductMedia["kind"];
      filename: string;
      contentType: string;
      sizeBytes: number;
      altText: string;
      sortOrder?: number;
    },
    actor: string,
    idempotencyKey: string,
  ) {
    if (!MEDIA_TYPES.has(input.contentType)) {
      throw new ProductAdminValidationError(
        "contentType must be JPEG, PNG, or WebP",
      );
    }
    if (
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > MAX_MEDIA_BYTES
    ) {
      throw new ProductAdminValidationError(
        "sizeBytes must be between 1 byte and 10 MB",
      );
    }
    const sortOrder = input.sortOrder ?? 0;
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
      throw new ProductAdminValidationError(
        "sortOrder must be a non-negative integer",
      );
    }
    const product = requiredText(productId, "productId");
    return this.idempotency.run(
      `product_admin.create_media.${product}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.createMediaUpload(
          product,
          {
            kind: exactString(input.kind, PRODUCT_MEDIA_KINDS, "kind"),
            filename: requiredText(input.filename, "filename", 240),
            contentType: input.contentType,
            sizeBytes: input.sizeBytes,
            altText: requiredText(input.altText, "altText", 500),
            sortOrder,
          },
          requiredText(actor, "actor", 320),
          this.now(),
        ),
    );
  }

  confirmMediaUpload(
    productId: string,
    mediaId: string,
    actor: string,
    idempotencyKey: string,
  ) {
    const product = requiredText(productId, "productId");
    const media = requiredText(mediaId, "mediaId");
    return this.idempotency.run(
      `product_admin.confirm_media.${media}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.confirmMediaUpload(
          product,
          media,
          requiredText(actor, "actor", 320),
          this.now(),
        ),
    );
  }

  updateMedia(
    productId: string,
    mediaId: string,
    input: {
      state: AdminProductMedia["state"];
      altText: string;
      sortOrder: number;
      reason?: string | null;
    },
    actor: string,
    idempotencyKey: string,
  ) {
    const product = requiredText(productId, "productId");
    const media = requiredText(mediaId, "mediaId");
    const state = input.state;
    if (
      !["in_review", "approved", "rejected", "archived"].includes(state)
    ) {
      throw new ProductAdminValidationError("media state is invalid");
    }
    if (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0) {
      throw new ProductAdminValidationError(
        "sortOrder must be a non-negative integer",
      );
    }
    const reason = optionalText(input.reason, "reason", 1000);
    if (state === "rejected" && !reason) {
      throw new ProductAdminValidationError("reason is required to reject media");
    }
    return this.idempotency.run(
      `product_admin.update_media.${media}`,
      requiredText(idempotencyKey, "idempotencyKey", 200),
      () =>
        this.repository.updateMedia(
          product,
          media,
          {
            state,
            altText: requiredText(input.altText, "altText", 500),
            sortOrder: input.sortOrder,
            reason,
          },
          requiredText(actor, "actor", 320),
          this.now(),
        ),
    );
  }

  static newId(): string {
    return randomUUID();
  }

  static activeBlockingInputs(
    productId: string,
    inputs: readonly RequiredInput[],
  ): RequiredInput[] {
    return inputs.filter(
      (item) =>
        item.recordId === productId &&
        item.currentState !== "verified" &&
        item.currentState !== "not_applicable" &&
        item.currentState !== "superseded" &&
        item.blockingLevel !== "informational",
    );
  }
}
