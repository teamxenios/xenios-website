import type { SupabaseClient } from "@supabase/supabase-js";
import { adaptLegacyCatalog } from "../catalog/legacy-adapter";
import { buildCommerceDependencies } from "../commerce/production-deps";
import { products as legacyProducts } from "../products-data";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import { isSafeStoragePath } from "../media-provider";
import {
  DisabledPrivateCertificateProvider,
  ExactLotCertificateService,
  type CertificateAccessAudit,
  type PrivateCertificateProvider,
} from "./coa";
import {
  BiomarkerService,
  DEFAULT_SUPERPOWER_OFFER,
  DisabledBiomarkerUploadProvider,
  type BiomarkerPendingUpload,
  type BiomarkerRecord,
  type BiomarkerStore,
  type BiomarkerUploadProvider,
  type PublicSuperpowerOffer,
  type SuperpowerOfferConfig,
  toPublicSuperpowerOffer,
} from "./diagnostics";
import {
  DEFAULT_METABOLIC_PATHWAYS,
  MetabolicInterestService,
  type MetabolicInterestRecord,
  type MetabolicInterestStore,
  type MetabolicPathwayConfig,
  type PublicMetabolicPathway,
  toPublicMetabolicPathway,
} from "./metabolic-care";
import {
  DEFAULT_SUPPLEMENT_PLACEHOLDERS,
  SUPPLEMENT_CHANNELS,
  SUPPLEMENT_PLACEHOLDER_CATEGORIES,
  SupplementPlaceholderRepository,
  toPublicSupplementPlaceholder,
  type FutureSupplementChannel,
  type SupplementPlaceholder,
  type SupplementPlaceholderCategory,
  type SupplementPlaceholderConfig,
} from "./supplements";
import {
  buildProductMaster,
  type CanonicalCommerceReadiness,
} from "./product-master";
import type { ProductCertificateRecord, ProductLotRecord } from "./model";
import type { Website3ApiDependencies } from "./routes";
import { Website3ValidationError } from "./errors";

type DbClient = Pick<SupabaseClient, "from" | "rpc" | "storage">;

const COA_BUCKET_DEFAULT = "research-coa-production";
const BIOMARKER_BUCKET_DEFAULT = "research-biomarker-reports-production";

function databaseFailure(code: string): Error {
  return new Error(code);
}

function asIso(value: unknown): string {
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function actionsFrom(value: unknown): MetabolicPathwayConfig["actions"] {
  const candidate = value as Partial<MetabolicPathwayConfig["actions"]> | null;
  const actions = {
    joinInterestHref: String(candidate?.joinInterestHref ?? ""),
    exploreCareHref: String(candidate?.exploreCareHref ?? ""),
    askQuestionHref: String(candidate?.askQuestionHref ?? ""),
  };
  if (!Object.values(actions).every((href) => href.startsWith("/"))) {
    throw new Website3ValidationError("Pathway actions must use internal routes.");
  }
  return actions;
}

function pathwayFromRow(row: Record<string, unknown>): MetabolicPathwayConfig {
  return {
    pathwayId: String(row.pathway_id) as MetabolicPathwayConfig["pathwayId"],
    publicName: String(row.public_name),
    internalSearchAliases: Array.isArray(row.internal_search_aliases)
      ? row.internal_search_aliases.map(String)
      : [],
    publicStatus: String(row.public_status),
    publicCopy: String(row.public_copy),
    actions: actionsFrom(row.actions),
    adminEditable: true,
    updatedAt: asIso(row.updated_at),
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

function validatePathwayPatch(
  patch: Partial<
    Pick<
      MetabolicPathwayConfig,
      "publicName" | "publicStatus" | "publicCopy" | "actions" | "internalSearchAliases"
    >
  >,
): void {
  if (patch.publicName !== undefined && (!patch.publicName.trim() || patch.publicName.length > 160)) {
    throw new Website3ValidationError("publicName must contain 1-160 characters");
  }
  if (patch.publicStatus !== undefined && (!patch.publicStatus.trim() || patch.publicStatus.length > 160)) {
    throw new Website3ValidationError("publicStatus must contain 1-160 characters");
  }
  if (patch.publicCopy !== undefined && (!patch.publicCopy.trim() || patch.publicCopy.length > 2000)) {
    throw new Website3ValidationError("publicCopy must contain 1-2000 characters");
  }
  if (
    patch.internalSearchAliases !== undefined &&
    (
      !Array.isArray(patch.internalSearchAliases) ||
      patch.internalSearchAliases.length > 20 ||
      patch.internalSearchAliases.some(
        (alias) => typeof alias !== "string" || !alias.trim() || alias.length > 120,
      )
    )
  ) {
    throw new Website3ValidationError("internalSearchAliases are invalid");
  }
  if (patch.actions !== undefined) actionsFrom(patch.actions);
}

export class SupabaseMetabolicPathwayRepository {
  constructor(private readonly db: DbClient = getSupabaseAdmin()) {}

  private async all(): Promise<MetabolicPathwayConfig[]> {
    const { data, error } = await this.db
      .from("research_metabolic_pathways")
      .select("*")
      .order("pathway_id");
    if (error) throw databaseFailure("website3_pathway_read_failed");
    return (data ?? []).map((row) => pathwayFromRow(row as Record<string, unknown>));
  }

  async listPublic(): Promise<PublicMetabolicPathway[]> {
    return (await this.all()).map(toPublicMetabolicPathway);
  }

  async searchAdmin(query: string): Promise<MetabolicPathwayConfig[]> {
    const normalized = query.trim().toLowerCase();
    return (await this.all()).filter((pathway) =>
      [
        pathway.publicName,
        pathway.publicStatus,
        ...pathway.internalSearchAliases,
      ].join(" ").toLowerCase().includes(normalized),
    );
  }

  async update(
    pathwayId: MetabolicPathwayConfig["pathwayId"],
    patch: Partial<
      Pick<
        MetabolicPathwayConfig,
        "publicName" | "publicStatus" | "publicCopy" | "actions" | "internalSearchAliases"
      >
    >,
    actor: string,
    at: string,
  ): Promise<MetabolicPathwayConfig> {
    validatePathwayPatch(patch);
    const current = (await this.all()).find((pathway) => pathway.pathwayId === pathwayId);
    if (!current) throw new Website3ValidationError("Metabolic pathway not found");
    const next: MetabolicPathwayConfig = {
      ...current,
      ...patch,
      actions: patch.actions ? actionsFrom(patch.actions) : current.actions,
      publicName: patch.publicName?.trim() ?? current.publicName,
      publicStatus: patch.publicStatus?.trim() ?? current.publicStatus,
      publicCopy: patch.publicCopy?.trim() ?? current.publicCopy,
      internalSearchAliases:
        patch.internalSearchAliases?.map((alias) => alias.trim()) ??
        current.internalSearchAliases,
      pathwayId,
      adminEditable: true,
      updatedAt: at,
      updatedBy: actor,
    };
    const { data, error } = await this.db
      .from("research_metabolic_pathways")
      .upsert({
        pathway_id: next.pathwayId,
        public_name: next.publicName,
        internal_search_aliases: next.internalSearchAliases,
        public_status: next.publicStatus,
        public_copy: next.publicCopy,
        actions: next.actions,
        updated_at: next.updatedAt,
        updated_by: next.updatedBy,
      })
      .select("*")
      .single();
    if (error || !data) throw databaseFailure("website3_pathway_write_failed");
    return pathwayFromRow(data as Record<string, unknown>);
  }
}

function interestFromRow(row: Record<string, unknown>): MetabolicInterestRecord {
  return {
    interestId: String(row.id),
    memberId: String(row.member_id),
    pathwayId: String(row.pathway_id) as MetabolicInterestRecord["pathwayId"],
    currentState: String(row.current_state) as MetabolicInterestRecord["currentState"],
    generalGoalCategory:
      String(row.general_goal_category) as MetabolicInterestRecord["generalGoalCategory"],
    preferredContact:
      String(row.preferred_contact) as MetabolicInterestRecord["preferredContact"],
    interestDate: String(row.interest_date),
    attributionSource: String(row.attribution_source),
    idempotencyKey: String(row.idempotency_key),
    createdAt: asIso(row.created_at),
  };
}

export class SupabaseMetabolicInterestStore implements MetabolicInterestStore {
  constructor(private readonly db: DbClient = getSupabaseAdmin()) {}

  async findByIdempotency(
    memberId: string,
    idempotencyKey: string,
  ): Promise<MetabolicInterestRecord | null> {
    const { data, error } = await this.db
      .from("research_metabolic_interests")
      .select("*")
      .eq("member_id", memberId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw databaseFailure("website3_interest_read_failed");
    return data ? interestFromRow(data as Record<string, unknown>) : null;
  }

  async createOrGet(
    record: MetabolicInterestRecord,
  ): Promise<{ created: boolean; record: MetabolicInterestRecord }> {
    const { data, error } = await this.db
      .from("research_metabolic_interests")
      .upsert(
        {
          id: record.interestId,
          member_id: record.memberId,
          pathway_id: record.pathwayId,
          current_state: record.currentState,
          general_goal_category: record.generalGoalCategory,
          preferred_contact: record.preferredContact,
          interest_date: record.interestDate,
          attribution_source: record.attributionSource,
          idempotency_key: record.idempotencyKey,
          created_at: record.createdAt,
        },
        {
          onConflict: "member_id,idempotency_key",
          ignoreDuplicates: true,
        },
      )
      .select("*")
      .maybeSingle();
    if (error) throw databaseFailure("website3_interest_write_failed");
    if (data) return { created: true, record: interestFromRow(data as Record<string, unknown>) };
    const existing = await this.findByIdempotency(record.memberId, record.idempotencyKey);
    if (!existing) throw databaseFailure("website3_interest_idempotency_failed");
    return { created: false, record: existing };
  }
}

function supplementFromRow(
  row: Record<string, unknown>,
): SupplementPlaceholderConfig {
  const category = String(row.category);
  if (
    !(
      SUPPLEMENT_PLACEHOLDER_CATEGORIES as readonly string[]
    ).includes(category)
  ) {
    throw databaseFailure("website3_supplement_record_invalid");
  }
  const label = String(row.label ?? "").trim();
  const description = String(row.description ?? "").trim();
  const launchInterestHref = String(row.launch_interest_href ?? "");
  const rawChannels = row.channel_metadata;
  if (
    !label ||
    !description ||
    !launchInterestHref.startsWith("/research/") ||
    !rawChannels ||
    typeof rawChannels !== "object" ||
    Array.isArray(rawChannels)
  ) {
    throw databaseFailure("website3_supplement_record_invalid");
  }
  const channelMetadata = Object.fromEntries(
    SUPPLEMENT_CHANNELS.map((channel) => {
      const raw = (
        rawChannels as Record<string, unknown>
      )[channel] as Record<string, unknown> | undefined;
      if (
        !raw ||
        typeof raw.configured !== "boolean" ||
        !(
          raw.partnerReference === null ||
          typeof raw.partnerReference === "string"
        ) ||
        !(
          raw.publicUrl === null ||
          (
            typeof raw.publicUrl === "string" &&
            raw.publicUrl.startsWith("https://")
          )
        ) ||
        (
          raw.configured &&
          (
            typeof raw.partnerReference !== "string" ||
            !raw.partnerReference.trim()
          )
        )
      ) {
        throw databaseFailure("website3_supplement_record_invalid");
      }
      return [
        channel,
        {
          configured: raw.configured,
          partnerReference:
            typeof raw.partnerReference === "string"
              ? raw.partnerReference
              : null,
          publicUrl:
            typeof raw.publicUrl === "string" ? raw.publicUrl : null,
        },
      ];
    }),
  ) as Record<
    FutureSupplementChannel,
    {
      configured: boolean;
      partnerReference: string | null;
      publicUrl: string | null;
    }
  >;
  return {
    placeholderId: String(row.placeholder_id),
    category: category as SupplementPlaceholderCategory,
    label,
    status: "coming_soon",
    description,
    priceCents: null,
    brand: null,
    stockState: null,
    servingInstructions: null,
    claims: [],
    channelMetadata,
    launchInterestHref,
    adminEditable: true,
    updatedAt: asIso(row.updated_at),
    updatedBy:
      typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

export class SupabaseSupplementPlaceholderRepository {
  constructor(private readonly db: DbClient = getSupabaseAdmin()) {}

  private async all(): Promise<SupplementPlaceholderConfig[]> {
    const { data, error } = await this.db
      .from("research_supplement_placeholders")
      .select("*")
      .order("category");
    if (error) throw databaseFailure("website3_supplement_read_failed");
    return (data ?? []).map((row) =>
      supplementFromRow(row as Record<string, unknown>),
    );
  }

  async listPublic(): Promise<SupplementPlaceholder[]> {
    return (await this.all()).map(toPublicSupplementPlaceholder);
  }

  async listAdmin(): Promise<SupplementPlaceholderConfig[]> {
    return this.all();
  }

  async update(
    category: SupplementPlaceholderCategory,
    patch: Partial<
      Pick<
        SupplementPlaceholderConfig,
        "label" | "description" | "channelMetadata" | "launchInterestHref"
      >
    >,
    actor: string,
    at: string,
  ): Promise<SupplementPlaceholderConfig> {
    const current = await this.all();
    const repository = new SupplementPlaceholderRepository(
      async (next) => {
        const { error } = await this.db
          .from("research_supplement_placeholders")
          .upsert({
            placeholder_id: next.placeholderId,
            category: next.category,
            label: next.label,
            description: next.description,
            channel_metadata: next.channelMetadata,
            launch_interest_href: next.launchInterestHref,
            updated_at: next.updatedAt,
            updated_by: next.updatedBy,
          }, { onConflict: "category" });
        if (error) {
          throw databaseFailure("website3_supplement_write_failed");
        }
      },
      current,
    );
    return repository.update(category, patch, actor, at);
  }
}

function superpowerFromRow(row: Record<string, unknown>): SuperpowerOfferConfig {
  return {
    offerId: String(row.offer_id),
    label: String(row.label),
    summary: String(row.summary),
    status: String(row.status) as SuperpowerOfferConfig["status"],
    availability: String(row.availability),
    collectionMethod:
      typeof row.collection_method === "string" ? row.collection_method : null,
    priceCents: typeof row.price_cents === "number" ? row.price_cents : null,
    priceEffectiveDate:
      typeof row.price_effective_date === "string" ? row.price_effective_date : null,
    lastVerificationDate:
      typeof row.last_verification_date === "string" ? row.last_verification_date : null,
    lastReviewedDate:
      typeof row.last_reviewed_date === "string"
        ? row.last_reviewed_date
        : null,
    verifiedPriceDate:
      typeof row.verified_price_date === "string"
        ? row.verified_price_date
        : null,
    disclosure: String(row.disclosure),
    interest: {
      enabled: row.interest_enabled === true,
      href:
        typeof row.interest_href === "string" ? row.interest_href : null,
    },
    affiliate: {
      enabled: row.affiliate_enabled === true,
      url: typeof row.affiliate_url === "string" ? row.affiliate_url : null,
    },
    adminEditable: true,
    updatedAt: asIso(row.updated_at),
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

function validDateOrNull(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateSuperpower(offer: SuperpowerOfferConfig): void {
  if (!["coming_soon", "available", "paused", "unavailable"].includes(offer.status)) {
    throw new Website3ValidationError("Superpower status is invalid");
  }
  for (const [name, value, max] of [
    ["label", offer.label, 160],
    ["summary", offer.summary, 2000],
    ["availability", offer.availability, 500],
    ["disclosure", offer.disclosure, 2000],
  ] as const) {
    if (!value.trim() || value.length > max) {
      throw new Website3ValidationError(`${name} must contain 1-${max} characters`);
    }
  }
  if (
    offer.priceCents !== null &&
    (!Number.isInteger(offer.priceCents) || offer.priceCents < 0)
  ) {
    throw new Website3ValidationError("priceCents must be a non-negative integer or null");
  }
  if (
    !validDateOrNull(offer.priceEffectiveDate) ||
    !validDateOrNull(offer.lastVerificationDate) ||
    !validDateOrNull(offer.lastReviewedDate) ||
    !validDateOrNull(offer.verifiedPriceDate)
  ) {
    throw new Website3ValidationError("Superpower dates must use YYYY-MM-DD or null");
  }
  if (
    offer.interest.enabled &&
    !offer.interest.href?.startsWith("/research/")
  ) {
    throw new Website3ValidationError(
      "An enabled interest action must stay inside the Research member area.",
    );
  }
  if (
    offer.affiliate.enabled &&
    (offer.status !== "available" || !offer.affiliate.url?.startsWith("https://"))
  ) {
    throw new Website3ValidationError(
      "An enabled affiliate offer requires available status and an HTTPS URL.",
    );
  }
}

export class SupabaseSuperpowerOfferRepository {
  constructor(private readonly db: DbClient = getSupabaseAdmin()) {}

  async readAdmin(): Promise<SuperpowerOfferConfig> {
    const { data, error } = await this.db
      .from("research_superpower_offers")
      .select("*")
      .eq("offer_id", DEFAULT_SUPERPOWER_OFFER.offerId)
      .maybeSingle();
    if (error) throw databaseFailure("website3_superpower_read_failed");
    return data
      ? superpowerFromRow(data as Record<string, unknown>)
      : structuredClone(DEFAULT_SUPERPOWER_OFFER);
  }

  async readPublic(): Promise<PublicSuperpowerOffer> {
    return toPublicSuperpowerOffer(await this.readAdmin());
  }

  async update(
    patch: Partial<
      Pick<
        SuperpowerOfferConfig,
        | "label"
        | "summary"
        | "status"
        | "availability"
        | "collectionMethod"
        | "priceCents"
        | "priceEffectiveDate"
        | "lastVerificationDate"
        | "lastReviewedDate"
        | "verifiedPriceDate"
        | "disclosure"
        | "interest"
        | "affiliate"
      >
    >,
    actor: string,
    at: string,
  ): Promise<SuperpowerOfferConfig> {
    const current = await this.readAdmin();
    const next: SuperpowerOfferConfig = {
      ...current,
      ...patch,
      interest: patch.interest ? { ...patch.interest } : current.interest,
      affiliate: patch.affiliate ? { ...patch.affiliate } : current.affiliate,
      offerId: current.offerId,
      adminEditable: true,
      updatedAt: at,
      updatedBy: actor,
    };
    validateSuperpower(next);
    const { data, error } = await this.db
      .from("research_superpower_offers")
      .upsert({
        offer_id: next.offerId,
        label: next.label.trim(),
        summary: next.summary.trim(),
        status: next.status,
        availability: next.availability.trim(),
        collection_method: next.collectionMethod?.trim() || null,
        price_cents: next.priceCents,
        price_effective_date: next.priceEffectiveDate,
        last_verification_date: next.lastVerificationDate,
        last_reviewed_date: next.lastReviewedDate,
        verified_price_date: next.verifiedPriceDate,
        disclosure: next.disclosure.trim(),
        interest_enabled: next.interest.enabled,
        interest_href: next.interest.href,
        affiliate_enabled: next.affiliate.enabled,
        affiliate_url: next.affiliate.url,
        updated_at: next.updatedAt,
        updated_by: next.updatedBy,
      })
      .select("*")
      .single();
    if (error || !data) throw databaseFailure("website3_superpower_write_failed");
    return superpowerFromRow(data as Record<string, unknown>);
  }
}

function biomarkerFromRow(row: Record<string, unknown>): BiomarkerRecord {
  return {
    biomarkerRecordId: String(row.id),
    memberId: String(row.member_id),
    state: String(row.state) as BiomarkerRecord["state"],
    partnerReference:
      typeof row.partner_reference === "string" ? row.partner_reference : null,
    reportStorageKey:
      typeof row.report_storage_key === "string" ? row.report_storage_key : null,
    reportFilename:
      typeof row.report_filename === "string" ? row.report_filename : null,
    consentVersion:
      typeof row.consent_version === "string" ? row.consent_version : null,
    consentedAt:
      typeof row.consented_at === "string" ? row.consented_at : null,
    updatedAt: asIso(row.updated_at),
  };
}

function pendingFromRow(row: Record<string, unknown>): BiomarkerPendingUpload {
  return {
    uploadId: String(row.upload_id),
    memberId: String(row.member_id),
    state: "pending",
    storageKey: String(row.storage_key),
    filename: String(row.filename),
    contentType: String(row.content_type) as BiomarkerPendingUpload["contentType"],
    sizeBytes: Number(row.expected_size_bytes),
    consentVersion: String(row.consent_version),
    consentedAt: asIso(row.consented_at),
    expiresAt: asIso(row.expires_at),
    createdAt: asIso(row.created_at),
  };
}

function biomarkerRow(record: BiomarkerRecord): Record<string, unknown> {
  return {
    id: record.biomarkerRecordId,
    member_id: record.memberId,
    state: record.state,
    partner_reference: record.partnerReference,
    report_storage_key: record.reportStorageKey,
    report_filename: record.reportFilename,
    consent_version: record.consentVersion,
    consented_at: record.consentedAt,
    updated_at: record.updatedAt,
  };
}

export class SupabaseBiomarkerStore implements BiomarkerStore {
  constructor(private readonly db: DbClient = getSupabaseAdmin()) {}

  async get(memberId: string): Promise<BiomarkerRecord | null> {
    const { data, error } = await this.db
      .from("research_biomarker_records")
      .select("*")
      .eq("member_id", memberId)
      .maybeSingle();
    if (error) throw databaseFailure("website3_biomarker_read_failed");
    return data ? biomarkerFromRow(data as Record<string, unknown>) : null;
  }

  async createIfAbsent(record: BiomarkerRecord): Promise<BiomarkerRecord> {
    const { error } = await this.db
      .from("research_biomarker_records")
      .upsert(biomarkerRow(record), {
        onConflict: "member_id",
        ignoreDuplicates: true,
      });
    if (error) throw databaseFailure("website3_biomarker_create_failed");
    const stored = await this.get(record.memberId);
    if (!stored) throw databaseFailure("website3_biomarker_create_missing");
    return stored;
  }

  async save(record: BiomarkerRecord): Promise<void> {
    const { error } = await this.db
      .from("research_biomarker_records")
      .upsert(biomarkerRow(record), { onConflict: "member_id" });
    if (error) throw databaseFailure("website3_biomarker_write_failed");
  }

  async getPendingUpload(
    memberId: string,
    uploadId: string,
  ): Promise<BiomarkerPendingUpload | null> {
    const { data, error } = await this.db
      .from("research_biomarker_uploads")
      .select("*")
      .eq("upload_id", uploadId)
      .eq("member_id", memberId)
      .eq("state", "pending")
      .maybeSingle();
    if (error) throw databaseFailure("website3_biomarker_upload_read_failed");
    return data ? pendingFromRow(data as Record<string, unknown>) : null;
  }

  async savePendingUpload(upload: BiomarkerPendingUpload): Promise<void> {
    const { error } = await this.db.from("research_biomarker_uploads").insert({
      upload_id: upload.uploadId,
      member_id: upload.memberId,
      state: upload.state,
      storage_key: upload.storageKey,
      filename: upload.filename,
      content_type: upload.contentType,
      expected_size_bytes: upload.sizeBytes,
      consent_version: upload.consentVersion,
      consented_at: upload.consentedAt,
      expires_at: upload.expiresAt,
      created_at: upload.createdAt,
    });
    if (error) throw databaseFailure("website3_biomarker_upload_write_failed");
  }

  async commitVerifiedUpload(input: {
    pending: BiomarkerPendingUpload;
    record: BiomarkerRecord;
  }): Promise<void> {
    const { data, error } = await this.db.rpc(
      "research_confirm_biomarker_upload",
      {
        p_upload_id: input.pending.uploadId,
        p_member_id: input.pending.memberId,
        p_record_id: input.record.biomarkerRecordId,
        p_updated_at: input.record.updatedAt,
      },
    );
    if (error || data !== true) {
      throw databaseFailure("website3_biomarker_confirm_failed");
    }
  }
}

function fileSignatureMatches(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "application/pdf") {
    return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  return false;
}

export class SupabaseBiomarkerUploadProvider implements BiomarkerUploadProvider {
  constructor(
    private readonly db: DbClient = getSupabaseAdmin(),
    private readonly bucketName = process.env.RESEARCH_BIOMARKER_REPORTS_BUCKET ??
      BIOMARKER_BUCKET_DEFAULT,
    private readonly enabled =
      process.env.RESEARCH_BIOMARKER_UPLOAD_ENABLED === "true",
  ) {}

  async createPrivateUpload(
    input: Parameters<BiomarkerUploadProvider["createPrivateUpload"]>[0],
  ): Promise<Awaited<ReturnType<BiomarkerUploadProvider["createPrivateUpload"]>>> {
    if (!this.enabled) return { ok: false, code: "disabled" };
    if (!this.bucketName || !isSafeStoragePath(input.storageKey)) {
      return { ok: false, code: "not_configured" };
    }
    try {
      const { data, error } = await this.db.storage
        .from(this.bucketName)
        .createSignedUploadUrl(input.storageKey);
      if (error || !data?.signedUrl) return { ok: false, code: "unavailable" };
      return {
        ok: true,
        uploadUrl: data.signedUrl,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  }

  async verifyPrivateUpload(
    input: Parameters<BiomarkerUploadProvider["verifyPrivateUpload"]>[0],
  ): Promise<Awaited<ReturnType<BiomarkerUploadProvider["verifyPrivateUpload"]>>> {
    if (!this.enabled) return { ok: false, code: "disabled" };
    if (!this.bucketName || !isSafeStoragePath(input.storageKey)) {
      return { ok: false, code: "not_configured" };
    }
    const bucket = this.db.storage.from(this.bucketName);
    try {
      const [{ data: info, error: infoError }, { data: content, error: contentError }] =
        await Promise.all([
          bucket.info(input.storageKey),
          bucket.download(input.storageKey),
        ]);
      if (infoError || contentError || !info || !content) {
        return { ok: false, code: "object_missing" };
      }
      const actualSize = Number((info as { size?: unknown }).size ?? 0);
      const actualType = String(
        (info as { contentType?: unknown }).contentType ?? "",
      );
      const bytes = new Uint8Array(await content.arrayBuffer());
      if (
        actualSize !== input.sizeBytes ||
        actualType !== input.contentType ||
        bytes.byteLength !== actualSize ||
        !fileSignatureMatches(input.contentType, bytes)
      ) {
        await bucket.remove([input.storageKey]);
        return { ok: false, code: "object_mismatch" };
      }
      return { ok: true };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  }
}

export class SupabasePrivateCertificateProvider
  implements PrivateCertificateProvider
{
  constructor(
    private readonly db: DbClient = getSupabaseAdmin(),
    private readonly bucketName =
      process.env.RESEARCH_COA_BUCKET ?? COA_BUCKET_DEFAULT,
    private readonly enabled =
      process.env.RESEARCH_COA_ACCESS_ENABLED === "true",
  ) {}

  async createSignedReadUrl(
    input: Parameters<PrivateCertificateProvider["createSignedReadUrl"]>[0],
  ): Promise<Awaited<ReturnType<PrivateCertificateProvider["createSignedReadUrl"]>>> {
    if (!this.enabled) return { ok: false, code: "disabled" };
    if (!this.bucketName || !isSafeStoragePath(input.storageKey)) {
      return { ok: false, code: "not_configured" };
    }
    try {
      const { data, error } = await this.db.storage
        .from(this.bucketName)
        .createSignedUrl(input.storageKey, input.expiresInSeconds);
      if (error || !data?.signedUrl) return { ok: false, code: "unavailable" };
      return {
        ok: true,
        signedUrl: data.signedUrl,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  }
}

export class SupabaseCertificateAccessAudit implements CertificateAccessAudit {
  constructor(private readonly db: DbClient = getSupabaseAdmin()) {}

  async record(
    event: Parameters<CertificateAccessAudit["record"]>[0],
  ): Promise<void> {
    const { error } = await this.db.from("research_certificate_access_audit").insert({
      id: event.auditId,
      member_id: event.memberId,
      certificate_id: event.certificateId,
      lot_id: event.lotId,
      outcome: event.outcome,
      reason: event.reason,
      accessed_at: event.accessedAt,
    });
    if (error) throw databaseFailure("website3_certificate_audit_failed");
  }
}

function lotState(disposition: string): ProductLotRecord["state"] {
  if (disposition === "available") return "released";
  if (["expired", "destroyed", "shipped"].includes(disposition)) return "exhausted";
  if (["quarantined", "quality_hold", "temperature_hold", "damaged", "recalled"].includes(disposition)) {
    return "quarantined";
  }
  return "pending_release";
}

function buildCertificateAccessService(
  productMaster: Website3ApiDependencies["productMaster"],
  db: DbClient,
  provider: PrivateCertificateProvider,
  audit: CertificateAccessAudit,
): Website3ApiDependencies["certificates"] {
  return {
    async requestAccess(input) {
      const variant = productMaster.variants.find((item) => item.sku === input.sku);
      if (!variant) {
        return new ExactLotCertificateService(
          [],
          [],
          [],
          provider,
          audit,
        ).requestAccess(input);
      }
      const { data: lotRow, error: lotError } = await db
        .from("research_inventory_lots")
        .select("id,lot_id,sku,disposition,created_at,updated_at,expiry_date")
        .eq("sku", input.sku)
        .eq("lot_id", input.lotCode)
        .maybeSingle();
      if (lotError) throw databaseFailure("website3_certificate_lot_read_failed");
      const lots: ProductLotRecord[] = lotRow
        ? [{
            lotId: String(lotRow.id),
            variantId: variant.variantId,
            lotCode: String(lotRow.lot_id),
            state: lotState(String(lotRow.disposition)),
            receivedAt: asIso(lotRow.created_at),
            expiresAt:
              typeof lotRow.expiry_date === "string" ? lotRow.expiry_date : null,
            createdAt: asIso(lotRow.created_at),
            updatedAt: asIso(lotRow.updated_at),
          }]
        : [];
      const { data: documentRow, error: documentError } = lotRow
        ? await db
            .from("research_lot_quality_documents")
            .select(
              "id,lot_id,document_state,private_storage_key,verification_state,reviewed_at,recorded_at",
            )
            .eq("lot_id", lotRow.id)
            .maybeSingle()
        : { data: null, error: null };
      if (documentError) throw databaseFailure("website3_certificate_document_read_failed");
      const certificates: ProductCertificateRecord[] = documentRow
        ? [{
            certificateId: String(documentRow.id),
            lotId: String(documentRow.lot_id),
            documentType: "certificate_of_analysis",
            documentState:
              String(documentRow.document_state) as ProductCertificateRecord["documentState"],
            privateStorageKey:
              typeof documentRow.private_storage_key === "string"
                ? documentRow.private_storage_key
                : null,
            verificationState:
              String(documentRow.verification_state) as ProductCertificateRecord["verificationState"],
            reviewedAt:
              typeof documentRow.reviewed_at === "string"
                ? documentRow.reviewed_at
                : null,
            createdAt: asIso(documentRow.recorded_at),
            updatedAt: asIso(documentRow.reviewed_at ?? documentRow.recorded_at),
          }]
        : [];
      return new ExactLotCertificateService(
        [variant],
        lots,
        certificates,
        provider,
        audit,
      ).requestAccess(input);
    },
  };
}

function productMasterForProduction(
  env: NodeJS.ProcessEnv,
): Website3ApiDependencies["productMaster"] {
  const catalogProducts = adaptLegacyCatalog(
    legacyProducts,
    "2026-07-20",
  ).products;
  const readiness: CanonicalCommerceReadiness[] =
    buildCommerceDependencies(() => new Date(), env).catalog
      .listProducts()
      .map((product) => ({
        sku: product.sku,
        purchasable: product.purchasable,
        priceCents: product.priceCents,
      }));
  return buildProductMaster(
    catalogProducts,
    new Date().toISOString(),
    readiness,
  );
}

export function buildWebsite3ProductionDependencies(
  env: NodeJS.ProcessEnv = process.env,
): Website3ApiDependencies {
  const productMaster = productMasterForProduction(env);
  const capabilities = {
    certificateAccess:
      supabaseConfigured() &&
      env.RESEARCH_COA_ACCESS_ENABLED === "true" &&
      Boolean(env.RESEARCH_COA_BUCKET),
    biomarkerReportUpload:
      supabaseConfigured() &&
      env.RESEARCH_BIOMARKER_UPLOAD_ENABLED === "true" &&
      Boolean(env.RESEARCH_BIOMARKER_REPORTS_BUCKET),
  };
  if (!supabaseConfigured()) {
    const pathways = new (class {
      async listPublic() {
        return DEFAULT_METABOLIC_PATHWAYS.map(toPublicMetabolicPathway);
      }
      async searchAdmin() {
        return [];
      }
      async update(): Promise<MetabolicPathwayConfig> {
        throw databaseFailure("website3_not_configured");
      }
    })();
    return {
      capabilities,
      productMaster,
      certificates: {
        requestAccess: (input) =>
          new ExactLotCertificateService(
            productMaster.variants,
            [],
            [],
            new DisabledPrivateCertificateProvider(),
            { record: async () => undefined },
          ).requestAccess(input),
      },
      pathways,
      interests: new MetabolicInterestService({
        findByIdempotency: async () => null,
        createOrGet: async () => {
          throw databaseFailure("website3_not_configured");
        },
      }),
      supplements: new SupplementPlaceholderRepository(async () => {
        throw databaseFailure("website3_not_configured");
      }),
      superpower: {
        readPublic: async () => toPublicSuperpowerOffer(DEFAULT_SUPERPOWER_OFFER),
        readAdmin: async () => structuredClone(DEFAULT_SUPERPOWER_OFFER),
        update: async () => {
          throw databaseFailure("website3_not_configured");
        },
      },
      biomarkers: new BiomarkerService(
        {
          get: async () => null,
          createIfAbsent: async () => {
            throw databaseFailure("website3_not_configured");
          },
          save: async () => {
            throw databaseFailure("website3_not_configured");
          },
          getPendingUpload: async () => null,
          savePendingUpload: async () => {
            throw databaseFailure("website3_not_configured");
          },
          commitVerifiedUpload: async () => {
            throw databaseFailure("website3_not_configured");
          },
        },
        new DisabledBiomarkerUploadProvider(),
      ),
    };
  }

  const db = getSupabaseAdmin();
  return {
    capabilities,
    productMaster,
    certificates: buildCertificateAccessService(
      productMaster,
      db,
      new SupabasePrivateCertificateProvider(db),
      new SupabaseCertificateAccessAudit(db),
    ),
    pathways: new SupabaseMetabolicPathwayRepository(db),
    interests: new MetabolicInterestService(
      new SupabaseMetabolicInterestStore(db),
    ),
    supplements: new SupabaseSupplementPlaceholderRepository(db),
    superpower: new SupabaseSuperpowerOfferRepository(db),
    biomarkers: new BiomarkerService(
      new SupabaseBiomarkerStore(db),
      new SupabaseBiomarkerUploadProvider(db),
    ),
  };
}
