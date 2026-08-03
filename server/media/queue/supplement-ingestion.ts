import { createHash } from "node:crypto";
import type {
  OfficialSourceAdapter,
  RightsEvidence,
  SupplementIngestionJob,
  SupplementManifestRow,
  SupplementMediaRecord,
} from "../official-sources/contracts";
import { selectBestOfficialSourceMatch } from "../official-sources/match";
import { deriveApprovalState, rightsAllowIngestion } from "../rights/policy";

export interface SupplementIngestionRun {
  schemaVersion: 1;
  batchId: string;
  startedAt: string;
  completedAt: string;
  sourceRows: number;
  jobs: SupplementIngestionJob[];
  media: SupplementMediaRecord[];
  warnings: Array<{ sourceRowId: string; message: string }>;
  summary: {
    reviewed: number;
    exactMatches: number;
    highConfidenceMatches: number;
    reviewRequired: number;
    noMatches: number;
    conflicts: number;
    rightsApproved: number;
    rightsPending: number;
    assetsDownloaded: number;
    derivativesCreated: number;
    assetsLinked: number;
    failures: number;
  };
}

export type RightsResolver = (
  row: SupplementManifestRow,
) => Promise<RightsEvidence> | RightsEvidence;

const DEFAULT_RIGHTS: RightsEvidence = {
  status: "OFFICIAL_SOURCE_RIGHTS_PENDING",
  evidenceReference: null,
  grantedBy: null,
  permissionDate: null,
  expiresAt: null,
  limitations: "Official source discovered; republication permission not yet confirmed.",
};

function hash(...values: string[]): string {
  return createHash("sha256").update(values.join("\u001f")).digest("hex");
}

function jobFor(row: SupplementManifestRow, adapterId: string): SupplementIngestionJob {
  const idempotencyKey = hash(
    "supplement-media-v2",
    row.sourceRowId,
    row.canonicalVariantId,
    row.supplierProductCode ?? "",
    row.productName,
    row.variantOrFormat ?? "",
    row.packageCount ?? "",
    row.flavor ?? "",
    row.form ?? "",
    row.sizeOrWeight ?? "",
    row.officialProductUrl ?? "",
    adapterId,
  );
  return {
    jobId: `smj_${idempotencyKey.slice(0, 24)}`,
    idempotencyKey,
    brand: row.brand,
    sourceRow: row.sourceRowId,
    canonicalVariantId: row.canonicalVariantId,
    status: "PENDING",
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    nextRetryAt: null,
    sourceAdapter: adapterId,
  };
}

function factualAltText(row: SupplementManifestRow): string {
  const detail = [row.variantOrFormat, row.packageCount]
    .map((value) => value?.trim())
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(", ");
  return `${row.brand} ${row.productName}${detail ? `, ${detail}` : ""}`;
}

function blankRecord(
  row: SupplementManifestRow,
  now: string,
  rights: RightsEvidence,
): SupplementMediaRecord {
  return {
    assetId: `sma_${hash(row.canonicalVariantId, row.sourceRowId).slice(0, 24)}`,
    canonicalProductId: row.canonicalProductId,
    canonicalVariantId: row.canonicalVariantId,
    sku: row.exactSku,
    upc: row.upc,
    brand: row.brand,
    productName: row.productName,
    variant: row.variantOrFormat,
    packageCount: row.packageCount,
    form: row.form,
    flavor: row.flavor,
    sourceType: "OFFICIAL_PAGE",
    sourceProductUrl: row.officialProductUrl,
    sourceImageUrl: null,
    sourceHash: null,
    sourceAdapter: null,
    matchState: "NO_MATCH",
    matchScore: 0,
    matchDifferences: [],
    rights,
    retrievedAt: null,
    width: null,
    height: null,
    format: null,
    viewType: null,
    storagePath: null,
    publicUrl: null,
    altText: factualAltText(row),
    approvalStatus: "PENDING_SOURCE",
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    supersededBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function runSupplementIngestionBatch(input: {
  batchId: string;
  rows: readonly SupplementManifestRow[];
  adapter: OfficialSourceAdapter;
  rightsResolver?: RightsResolver;
  previous?: SupplementIngestionRun | null;
  now?: () => Date;
}): Promise<SupplementIngestionRun> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const priorJobs = new Map(
    (input.previous?.jobs ?? []).map((job) => [job.idempotencyKey, job]),
  );
  const priorMedia = new Map(
    (input.previous?.media ?? []).map((media) => [media.canonicalVariantId, media]),
  );
  const priorWarnings = new Map<string, SupplementIngestionRun["warnings"]>();
  for (const warning of input.previous?.warnings ?? []) {
    const rowWarnings = priorWarnings.get(warning.sourceRowId) ?? [];
    rowWarnings.push(warning);
    priorWarnings.set(warning.sourceRowId, rowWarnings);
  }
  const jobs: SupplementIngestionJob[] = [];
  const media: SupplementMediaRecord[] = [];
  const warnings: SupplementIngestionRun["warnings"] = [];

  for (const row of input.rows) {
    const job = jobFor(row, input.adapter.id);
    const previousJob = priorJobs.get(job.idempotencyKey);
    const previousMedia = priorMedia.get(row.canonicalVariantId);
    const attemptAt = now().toISOString();
    const rights = await (input.rightsResolver?.(row) ?? DEFAULT_RIGHTS);
    if (previousJob && previousMedia && ["AWAITING_REVIEW", "APPROVED", "LINKED", "HELD"].includes(previousJob.status)) {
      const evidenceApproval = deriveApprovalState(previousMedia.matchState, rights, attemptAt);
      const retainsManualApproval =
        evidenceApproval === "AWAITING_REVIEW" &&
        previousMedia.approvalStatus === "APPROVED" &&
        ["APPROVED", "LINKED"].includes(previousJob.status);
      const approvalStatus = retainsManualApproval ? "APPROVED" : evidenceApproval;
      const canAdvance = ["AWAITING_REVIEW", "APPROVED"].includes(approvalStatus);
      const resumedJob: SupplementIngestionJob = {
        ...previousJob,
        status: canAdvance
          ? previousJob.status === "HELD" ? "AWAITING_REVIEW" : previousJob.status
          : "HELD",
        attemptCount: previousJob.attemptCount + 1,
        lastAttemptAt: attemptAt,
        lastError: canAdvance ? null : "Current rights evidence does not permit ingestion or publication",
        nextRetryAt: null,
      };
      const resumedMedia: SupplementMediaRecord = {
        ...previousMedia,
        rights,
        approvalStatus,
        publicUrl: rightsAllowIngestion(rights, attemptAt) ? previousMedia.publicUrl : null,
        updatedAt: attemptAt,
      };
      jobs.push(resumedJob);
      media.push(resumedMedia);
      warnings.push(...(priorWarnings.get(row.sourceRowId) ?? []));
      continue;
    }

    job.status = "SOURCE_LOOKUP";
    job.attemptCount = (previousJob?.attemptCount ?? 0) + 1;
    job.lastAttemptAt = attemptAt;
    const record = blankRecord(row, attemptAt, rights);

    try {
      if (!input.adapter.supports(row)) {
        job.status = "HELD";
        job.lastError = "No approved official-source adapter supports this row";
        warnings.push({ sourceRowId: row.sourceRowId, message: job.lastError });
        jobs.push(job);
        media.push(record);
        continue;
      }
      const lookup = await input.adapter.lookup(row);
      warnings.push(
        ...lookup.warnings.map((message) => ({ sourceRowId: row.sourceRowId, message })),
      );
      const match = selectBestOfficialSourceMatch(row, lookup.candidates);
      const candidate = match.candidate;
      record.sourceProductUrl = candidate?.officialProductUrl ?? (lookup.sourceUrl || row.officialProductUrl);
      record.sourceImageUrl = candidate?.officialImageUrl ?? null;
      record.sourceHash = candidate?.sourceHash ?? null;
      record.sourceAdapter = candidate?.sourceAdapter ?? input.adapter.id;
      record.matchState = match.state;
      record.matchScore = match.score;
      record.matchDifferences = match.differences;
      record.retrievedAt = candidate?.retrievedAt ?? attemptAt;
      record.width = candidate?.width ?? null;
      record.height = candidate?.height ?? null;
      record.format = candidate?.format ?? null;
      record.approvalStatus = deriveApprovalState(match.state, rights, attemptAt);
      record.updatedAt = attemptAt;
      if (match.state === "CONFLICT") {
        record.rejectionReason = "Official source conflicts with exact variant identity";
        job.status = "HELD";
      } else if (match.state === "NO_MATCH") {
        job.status = "HELD";
      } else if (record.approvalStatus === "RIGHTS_PENDING") {
        job.status = "HELD";
      } else if (record.approvalStatus === "DO_NOT_USE") {
        job.status = "HELD";
      } else {
        job.status = "AWAITING_REVIEW";
      }
      jobs.push(job);
      media.push(record);
    } catch (error) {
      job.status = "RETRY";
      job.lastError = error instanceof Error ? error.message : String(error);
      job.nextRetryAt = new Date(Date.parse(attemptAt) + 15 * 60 * 1000).toISOString();
      warnings.push({ sourceRowId: row.sourceRowId, message: job.lastError });
      jobs.push(job);
      media.push(record);
    }
  }

  const completedAt = now().toISOString();
  return {
    schemaVersion: 1,
    batchId: input.batchId,
    startedAt,
    completedAt,
    sourceRows: input.rows.length,
    jobs,
    media,
    warnings,
    summary: {
      reviewed: input.rows.length,
      exactMatches: media.filter((item) => item.matchState === "EXACT_MATCH").length,
      highConfidenceMatches: media.filter((item) => item.matchState === "HIGH_CONFIDENCE_MATCH").length,
      reviewRequired: media.filter((item) => item.matchState === "REVIEW_REQUIRED").length,
      noMatches: media.filter((item) => item.matchState === "NO_MATCH").length,
      conflicts: media.filter((item) => item.matchState === "CONFLICT").length,
      rightsApproved: media.filter((item) => rightsAllowIngestion(item.rights, completedAt)).length,
      rightsPending: media.filter((item) => item.rights.status === "OFFICIAL_SOURCE_RIGHTS_PENDING").length,
      assetsDownloaded: media.filter((item) => item.storagePath).length,
      derivativesCreated: 0,
      assetsLinked: media.filter((item) => item.publicUrl).length,
      failures: jobs.filter((job) => ["FAILED", "RETRY"].includes(job.status)).length,
    },
  };
}
