import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS } from "@shared/research/product-admin";
import { getSupabaseAdmin } from "../../supabase";
import type {
  AdminProductContent,
  AdminProductDetail,
  AdminProductListFilters,
  AdminProductMedia,
  AdminProductPrice,
  AdminProductSummary,
  AdminProductVariant,
  CreateAdminPriceInput,
  CreateAdminProductInput,
  CreateAdminVariantInput,
  DuplicateAdminProductInput,
  UpdateAdminProductInput,
} from "@shared/research/product-admin";
import type {
  ProductAdminIdempotency,
  ProductAdminRepository,
  ProductReleaseGate,
} from "./product-admin";
import {
  ProductAdminConflictError,
  ProductAdminNotFoundError,
} from "./product-admin-errors";
import type { IdempotencyStore } from "../commerce/persistence/idempotency-store";

type Db = Pick<SupabaseClient, "from" | "rpc" | "storage">;

const PRODUCT_TABLE = "research_products";
const VARIANT_TABLE = "research_product_variants";
const PRICE_TABLE = "research_product_prices";
const MEDIA_TABLE = "research_product_media";
const CONTENT_TABLE = "research_product_content";
const AUDIT_TABLE = "research_product_admin_audit";
const REQUIRED_INPUT_TABLE = "research_required_inputs";
const MEDIA_BUCKET =
  process.env.RESEARCH_PRODUCT_MEDIA_BUCKET ?? "research-product-media-production";

function dbFailure(operation: string, error: unknown): never {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "unknown")
      : "unknown";
  throw new Error(`${operation} failed (${code})`);
}

function rowText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function rowNullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function rowBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function rowNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function productSummary(
  row: Record<string, unknown>,
  variants: AdminProductVariant[],
  missingInputCount: number,
): AdminProductSummary {
  const ownVariants = variants.filter((item) => item.productId === row.id);
  return {
    id: rowText(row.id),
    productCode: rowText(row.sku),
    slug: rowText(row.slug),
    displayName: rowText(row.display_name),
    canonicalName: rowText(row.canonical_name, rowText(row.display_name)),
    aliases: Array.isArray(row.name_aliases)
      ? row.name_aliases.filter((value): value is string => typeof value === "string")
      : [],
    lane: rowText(row.lane) as AdminProductSummary["lane"],
    category: rowText(row.category),
    classification: rowText(row.product_classification),
    status: rowText(row.admin_status, "draft") as AdminProductSummary["status"],
    active: rowBoolean(row.active_state, true),
    visibility: rowText(
      row.visibility_state,
      "hidden",
    ) as AdminProductSummary["visibility"],
    availability: rowText(
      row.availability,
      "documentation_review",
    ) as AdminProductSummary["availability"],
    commerceApproval: rowText(
      row.commerce_approval,
      "blocked_pending_written_approval",
    ) as AdminProductSummary["commerceApproval"],
    qualityDocumentState: rowText(
      row.quality_document_state,
      "missing",
    ) as AdminProductSummary["qualityDocumentState"],
    variantCount: ownVariants.length,
    approvedVariantCount: ownVariants.filter(
      (item) => item.status === "approved" && item.active,
    ).length,
    missingInputCount,
    updatedAt: rowText(row.updated_at),
    publishedAt: rowNullableText(row.published_at),
  };
}

function variantRow(row: Record<string, unknown>): AdminProductVariant {
  return {
    id: rowText(row.id),
    productId: rowText(row.product_id),
    sku: rowText(row.sku),
    catalogNumber: rowNullableText(row.catalog_number),
    label: rowText(row.label),
    strength: rowNullableText(row.strength),
    size: rowNullableText(row.size),
    format: rowNullableText(row.format),
    presentation: rowNullableText(row.presentation),
    shippingClass: rowNullableText(row.shipping_class),
    memberEligible: rowBoolean(row.member_eligible),
    status: rowText(row.status, "draft") as AdminProductVariant["status"],
    active: rowBoolean(row.active),
    sortOrder: rowNumber(row.sort_order),
    createdAt: rowText(row.created_at),
    updatedAt: rowText(row.updated_at),
  };
}

function priceRow(row: Record<string, unknown>): AdminProductPrice {
  return {
    id: rowText(row.id),
    productId: rowText(row.product_id),
    variantId: rowText(row.variant_id),
    audience: rowText(row.audience) as AdminProductPrice["audience"],
    amountCents: rowNumber(row.amount_cents),
    currency: rowText(row.currency, "USD"),
    effectiveAt: rowText(row.effective_at),
    expiresAt: rowNullableText(row.expires_at),
    status: rowText(row.status, "draft") as AdminProductPrice["status"],
    approvalNote: rowNullableText(row.approval_note),
    version: rowNumber(row.version, 1),
    createdBy: rowText(row.created_by),
    approvedBy: rowNullableText(row.approved_by),
    createdAt: rowText(row.created_at),
    updatedAt: rowText(row.updated_at),
  };
}

function mediaRow(row: Record<string, unknown>): AdminProductMedia {
  return {
    id: rowText(row.id),
    productId: rowText(row.product_id),
    kind: rowText(row.kind) as AdminProductMedia["kind"],
    state: rowText(row.state, "pending_upload") as AdminProductMedia["state"],
    storageKey: rowNullableText(row.storage_key),
    filename: rowText(row.filename),
    contentType: rowText(row.content_type),
    sizeBytes: rowNumber(row.size_bytes),
    altText: rowText(row.alt_text),
    sortOrder: rowNumber(row.sort_order),
    approvedBy: rowNullableText(row.approved_by),
    createdAt: rowText(row.created_at),
    updatedAt: rowText(row.updated_at),
  };
}

const EMPTY_CONTENT: AdminProductContent = {
  shortDescription: null,
  longDescription: null,
  overview: null,
  specifications: null,
  researchInformation: null,
  storageInformation: null,
  handlingInformation: null,
  shippingInformation: null,
  returnInformation: null,
  disclaimers: null,
  citations: [],
  reviewDate: null,
};

function contentRows(rows: Record<string, unknown>[]): AdminProductContent {
  const content = { ...EMPTY_CONTENT };
  for (const row of rows) {
    const section = rowText(row.section) as keyof AdminProductContent;
    if (!(section in content)) continue;
    if (section === "citations") {
      content.citations = Array.isArray(row.metadata)
        ? row.metadata.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
    } else {
      (content as unknown as Record<string, string | null>)[section] =
        rowNullableText(row.body);
    }
  }
  return content;
}

async function many(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  operation: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await query;
  if (error) dbFailure(operation, error);
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

export class SupabaseProductAdminRepository
  implements ProductAdminRepository
{
  constructor(
    private readonly db: Db = getSupabaseAdmin(),
    private readonly mediaBucket = MEDIA_BUCKET,
  ) {}

  async list(filters: AdminProductListFilters): Promise<AdminProductSummary[]> {
    let query: any = this.db
      .from(PRODUCT_TABLE)
      .select("*")
      .order("updated_at", { ascending: false });
    if (filters.lane) query = query.eq("lane", filters.lane);
    if (filters.visibility) {
      query = query.eq("visibility_state", filters.visibility);
    }
    if (filters.status) query = query.eq("admin_status", filters.status);
    if (filters.commerceApproval) {
      query = query.eq("commerce_approval", filters.commerceApproval);
    }
    if (filters.qualityDocumentState) {
      query = query.eq(
        "quality_document_state",
        filters.qualityDocumentState,
      );
    }
    if (filters.query?.trim()) {
      const safe = filters.query.trim().replace(/[%_,()]/g, " ");
      query = query.or(
        `display_name.ilike.%${safe}%,canonical_name.ilike.%${safe}%,sku.ilike.%${safe}%`,
      );
    }
    const products = await many(query, "list products");
    const ids = products.map((row) => rowText(row.id)).filter(Boolean);
    if (!ids.length) return [];

    const [variantRows, inputRows] = await Promise.all([
      many(
        this.db.from(VARIANT_TABLE).select("*").in("product_id", ids),
        "list product variants",
      ),
      many(
        this.db
          .from(REQUIRED_INPUT_TABLE)
          .select("record_id,current_state,blocking_level")
          .in("record_id", ids),
        "list product required inputs",
      ),
    ]);
    const variants = variantRows.map(variantRow);
    const missingByProduct = new Map<string, number>();
    for (const row of inputRows) {
      const state = rowText(row.current_state);
      if (
        state === "verified" ||
        state === "not_applicable" ||
        state === "superseded" ||
        rowText(row.blocking_level) === "informational"
      ) {
        continue;
      }
      const id = rowText(row.record_id);
      missingByProduct.set(id, (missingByProduct.get(id) ?? 0) + 1);
    }
    const summaries = products.map((row) =>
      productSummary(
        row,
        variants,
        missingByProduct.get(rowText(row.id)) ?? 0,
      ),
    );
    return filters.missingInputsOnly
      ? summaries.filter((item) => item.missingInputCount > 0)
      : summaries;
  }

  /**
   * The WHOLE published catalog shaped for PRICING, in three queries.
   *
   * WHY THIS EXISTS. Pricing a catalog page used to go through
   * `LiveProductControlReader.readCatalog()`, which reads the product list
   * twice and then calls `get()` TWICE per product for snapshot stability.
   * Each `get()` is seven queries — product, variants, prices, media, content,
   * audit history, required inputs. Measured against production on 2026-08-21
   * with 236 published public products that is
   *
   *     2 + (236 x 2 x 7) = 3,306 Supabase round trips PER catalog request,
   *
   * which took 27-37 seconds and, under sustained requests, made Supabase
   * answer Cloudflare 522. The price read then failed, and because the
   * request-scoped source is deliberately all-or-nothing, 417 real prices
   * became "Price on request" for the customer. That is the live defect this
   * replaces.
   *
   * FOUR of those seven per-product reads — media, content, audit history and
   * required inputs — are never consulted by the price resolver. It reads only
   * the product's id/status/visibility/active, its variants'
   * id/productId/status/active/memberEligible, and its price rows.
   * So this asks for exactly those, in bulk:
   *
   *     1 products  +  1 variants (.in product_id)  +  1 prices (.in product_id)
   *
   * WHAT IT DOES NOT CHANGE. Product Control remains the sole price authority.
   * Every later check in the resolver runs unchanged on the same rows this
   * returns. This changes HOW the rows are read, never who owns price truth.
   *
   * `missingInputCount` is reported as 0 because the required-input table is
   * not read here; no pricing decision consults it, and the field is not on
   * the customer projection.
   */
  async listForPricing(): Promise<AdminProductDetail[]> {
    const products = await many(
      this.db
        .from(PRODUCT_TABLE)
        .select("*")
        .eq("admin_status", "published")
        .eq("visibility_state", "public"),
      "list products for pricing",
    );
    const ids = products.map((row) => rowText(row.id)).filter(Boolean);
    if (!ids.length) return [];

    const [variantRows, priceRows] = await Promise.all([
      many(
        this.db
          .from(VARIANT_TABLE)
          .select("*")
          .in("product_id", ids)
          .order("sort_order", { ascending: true }),
        "list variants for pricing",
      ),
      many(
        this.db
          .from(PRICE_TABLE)
          .select("*")
          .in("product_id", ids)
          .order("created_at", { ascending: false }),
        "list prices for pricing",
      ),
    ]);

    const variants = variantRows.map(variantRow);
    const pricesByProduct = new Map<string, AdminProductPrice[]>();
    for (const row of priceRows) {
      const price = priceRow(row);
      const bucket = pricesByProduct.get(price.productId);
      if (bucket) bucket.push(price);
      else pricesByProduct.set(price.productId, [price]);
    }

    return products.map((row) => {
      const id = rowText(row.id);
      const ownVariants = variants.filter((item) => item.productId === id);
      return {
        ...productSummary(row, variants, 0),
        // The empty shape the mapper produces for a product with no content rows.
        // Pricing never reads it; this keeps the type honest rather than casting.
        content: contentRows([]),
        variants: ownVariants,
        prices: pricesByProduct.get(id) ?? [],
        media: [],
        history: [],
      };
    });
  }

  async get(productId: string): Promise<AdminProductDetail | null> {
    const productResult = await this.db
      .from(PRODUCT_TABLE)
      .select("*")
      .eq("id", productId)
      .maybeSingle();
    if (productResult.error) dbFailure("read product", productResult.error);
    if (!productResult.data) return null;

    const [variantsRaw, pricesRaw, mediaRaw, contentRaw, historyRaw, inputRaw] =
      await Promise.all([
        many(
          this.db
            .from(VARIANT_TABLE)
            .select("*")
            .eq("product_id", productId)
            .order("sort_order", { ascending: true }),
          "read variants",
        ),
        many(
          this.db
            .from(PRICE_TABLE)
            .select("*")
            .eq("product_id", productId)
            .order("created_at", { ascending: false }),
          "read prices",
        ),
        many(
          this.db
            .from(MEDIA_TABLE)
            .select("*")
            .eq("product_id", productId)
            .order("sort_order", { ascending: true }),
          "read media",
        ),
        many(
          this.db
            .from(CONTENT_TABLE)
            .select("section,body,metadata")
            .eq("product_id", productId),
          "read content",
        ),
        many(
          this.db
            .from(AUDIT_TABLE)
            .select("occurred_at,action,actor,detail")
            .eq("product_id", productId)
            .order("occurred_at", { ascending: false }),
          "read product history",
        ),
        many(
          this.db
            .from(REQUIRED_INPUT_TABLE)
            .select("current_state,blocking_level")
            .eq("record_id", productId),
          "read product required inputs",
        ),
      ]);
    const variants = variantsRaw.map(variantRow);
    const missingInputCount = inputRaw.filter((row) => {
      const state = rowText(row.current_state);
      return (
        state !== "verified" &&
        state !== "not_applicable" &&
        state !== "superseded" &&
        rowText(row.blocking_level) !== "informational"
      );
    }).length;
    return {
      ...productSummary(
        productResult.data as Record<string, unknown>,
        variants,
        missingInputCount,
      ),
      content: contentRows(contentRaw),
      variants,
      prices: pricesRaw.map(priceRow),
      media: mediaRaw.map(mediaRow),
      history: historyRaw.map((row) => ({
        at: rowText(row.occurred_at),
        action: rowText(row.action),
        actor: rowText(row.actor),
        detail: rowNullableText(row.detail),
      })),
    };
  }

  private async rpcProduct(
    fn: string,
    args: Record<string, unknown>,
    productId?: string,
  ): Promise<AdminProductDetail> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) dbFailure(fn, error);
    const id =
      productId ??
      (typeof data === "string"
        ? data
        : rowText((data as Record<string, unknown> | null)?.product_id));
    if (!id) dbFailure(fn, { code: "missing_product_id" });
    const product = await this.get(id);
    if (!product) throw new ProductAdminNotFoundError("product");
    return product;
  }

  create(
    input: CreateAdminProductInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail> {
    return this.rpcProduct("research_admin_create_product", {
      p_input: input,
      p_actor: actor,
      p_at: at,
    });
  }

  duplicate(
    productId: string,
    input: DuplicateAdminProductInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail> {
    return this.rpcProduct("research_admin_duplicate_product", {
      p_product_id: productId,
      p_product_code: input.productCode,
      p_slug: input.slug,
      p_display_name: input.displayName,
      p_actor: actor,
      p_at: at,
    });
  }

  update(
    productId: string,
    input: UpdateAdminProductInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail> {
    return this.rpcProduct(
      "research_admin_update_product",
      { p_product_id: productId, p_input: input, p_actor: actor, p_at: at },
      productId,
    );
  }

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
  ): Promise<AdminProductDetail> {
    return this.rpcProduct(
      "research_admin_transition_product",
      {
        p_product_id: productId,
        p_status: input.status,
        p_active: input.active,
        p_visibility: input.visibility,
        p_actor: actor,
        p_at: at,
        p_detail: detail,
      },
      productId,
    );
  }

  createVariant(
    productId: string,
    input: CreateAdminVariantInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail> {
    return this.rpcProduct(
      "research_admin_create_product_variant",
      { p_product_id: productId, p_input: input, p_actor: actor, p_at: at },
      productId,
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
    at: string,
  ): Promise<AdminProductDetail> {
    return this.rpcProduct(
      "research_admin_update_product_variant",
      {
        p_product_id: productId,
        p_variant_id: variantId,
        p_input: input,
        p_actor: actor,
        p_at: at,
      },
      productId,
    );
  }

  createPrice(
    productId: string,
    input: CreateAdminPriceInput,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail> {
    return this.rpcProduct(
      "research_admin_create_product_price",
      { p_product_id: productId, p_input: input, p_actor: actor, p_at: at },
      productId,
    );
  }

  approvePrice(
    productId: string,
    priceId: string,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail> {
    return this.rpcProduct(
      "research_admin_approve_product_price",
      {
        p_product_id: productId,
        p_price_id: priceId,
        p_actor: actor,
        p_at: at,
      },
      productId,
    );
  }

  async createMediaUpload(
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
  }> {
    const { data, error } = await this.db.rpc(
      "research_admin_prepare_product_media",
      {
        p_product_id: productId,
        p_input: input,
        p_actor: actor,
        p_at: at,
      },
    );
    if (error) dbFailure("prepare product media", error);
    const media = mediaRow(data as Record<string, unknown>);
    if (!media.storageKey) {
      dbFailure("prepare product media", { code: "missing_storage_key" });
    }
    const signed = await this.db.storage
      .from(this.mediaBucket)
      .createSignedUploadUrl(media.storageKey);
    if (signed.error || !signed.data?.signedUrl) {
      throw new ProductAdminConflictError("media_storage_unavailable");
    }
    return {
      media,
      uploadUrl: signed.data.signedUrl,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    };
  }

  async confirmMediaUpload(
    productId: string,
    mediaId: string,
    actor: string,
    at: string,
  ): Promise<AdminProductDetail> {
    const rowResult = await this.db
      .from(MEDIA_TABLE)
      .select("*")
      .eq("id", mediaId)
      .eq("product_id", productId)
      .maybeSingle();
    if (rowResult.error) dbFailure("read product media", rowResult.error);
    if (!rowResult.data) throw new ProductAdminNotFoundError("media");
    const media = mediaRow(rowResult.data as Record<string, unknown>);
    if (!media.storageKey) {
      throw new ProductAdminConflictError("media_object_missing");
    }
    const bucket = this.db.storage.from(this.mediaBucket);
    const [{ data: info, error: infoError }, { data: blob, error: blobError }] =
      await Promise.all([
        bucket.info(media.storageKey),
        bucket.download(media.storageKey),
      ]);
    if (infoError || blobError || !info || !blob) {
      throw new ProductAdminConflictError("media_object_missing");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const size = Number((info as { size?: unknown }).size ?? 0);
    const contentType = String(
      (info as { contentType?: unknown }).contentType ?? "",
    );
    if (
      size !== media.sizeBytes ||
      bytes.byteLength !== media.sizeBytes ||
      contentType !== media.contentType ||
      !imageSignatureMatches(media.contentType, bytes)
    ) {
      await bucket.remove([media.storageKey]);
      throw new ProductAdminConflictError("media_object_mismatch");
    }
    return this.rpcProduct(
      "research_admin_confirm_product_media",
      {
        p_product_id: productId,
        p_media_id: mediaId,
        p_actor: actor,
        p_at: at,
      },
      productId,
    );
  }

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
  ): Promise<AdminProductDetail> {
    return this.rpcProduct(
      "research_admin_update_product_media",
      {
        p_product_id: productId,
        p_media_id: mediaId,
        p_state: input.state,
        p_alt_text: input.altText,
        p_sort_order: input.sortOrder,
        p_reason: input.reason ?? "",
        p_actor: actor,
        p_at: at,
      },
      productId,
    );
  }
}

function imageSignatureMatches(
  contentType: string,
  bytes: Uint8Array,
): boolean {
  if (contentType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
      String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) ===
        "WEBP"
    );
  }
  return false;
}

export function productAdminIdempotency(
  store: IdempotencyStore,
): ProductAdminIdempotency {
  return {
    async run<T>(scope: string, key: string, action: () => Promise<T>) {
      return (await store.once(scope, key, action)).value;
    },
  };
}

/**
 * Temporary integration adapter until Website 2 supplies the canonical
 * required-input service directly. It reads only that canonical store.
 */
export function productReleaseGateFromRequiredInputs(
  db: Db = getSupabaseAdmin(),
): ProductReleaseGate {
  return {
    async evaluate(productId: string) {
      const { data, error } = await db
        .from(REQUIRED_INPUT_TABLE)
        .select(
          "key,domain,record_type,record_id,current_state,blocking_level",
        )
        .eq("record_id", productId);
      if (error) dbFailure("evaluate product release", error);
      const rows = (Array.isArray(data) ? data : []).filter(
        (row: any) => row.current_state !== "superseded",
      );
      const expected = PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS;
      const expectedKeys = new Set<string>(
        expected.map((binding) => binding.key),
      );
      const blockingKeys: string[] = [];

      for (const binding of expected) {
        const matches = rows.filter(
          (row: any) =>
            row.key === binding.key &&
            row.domain === binding.domain &&
            row.record_type === binding.recordType &&
            row.record_id === productId,
        );
        if (matches.length !== 1) {
          blockingKeys.push(binding.key);
          continue;
        }
        const row = matches[0];
        if (
          row.current_state !== "verified" &&
          row.current_state !== "not_applicable"
        ) {
          blockingKeys.push(binding.key);
        }
      }

      if (
        rows.length !== expected.length ||
        rows.some((row: any) => !expectedKeys.has(String(row.key)))
      ) {
        blockingKeys.push("product.required_inputs.record_set");
      }

      const domains = Array.from(
        new Set<string>(expected.map((binding) => binding.domain)),
      );
      const readinessResults = await Promise.all(
        domains.map((domain) =>
          db.rpc("research_domain_readiness", { p_domain: domain }),
        ),
      );
      readinessResults.forEach((result: any, index) => {
        if (result.error) dbFailure("evaluate product manifest", result.error);
        const readiness = result.data ?? {};
        const manifestCurrent =
          readiness.domain === domains[index] &&
          readiness.manifestApproved === true &&
          readiness.softwareComplete === true &&
          readiness.publicEnabled === true &&
          readiness.launchStatus === "public_enabled" &&
          readiness.realInputsRequired === false &&
          Number(readiness.expectedInputCount) > 0 &&
          Number(readiness.actualInputCount) ===
            Number(readiness.expectedInputCount) &&
          Number(readiness.blockingInputCount) === 0 &&
          Array.isArray(readiness.blockingKeys) &&
          readiness.blockingKeys.length === 0;
        if (!manifestCurrent) {
          blockingKeys.push(`product.required_inputs.manifest:${domains[index]}`);
        }
      });

      const uniqueBlockingKeys = Array.from(new Set(blockingKeys));
      return {
        displayReady: uniqueBlockingKeys.length === 0,
        commerceReady: false,
        blockingKeys: uniqueBlockingKeys,
      };
    },
  };
}
