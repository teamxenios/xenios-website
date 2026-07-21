import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  PRIVATE_MEDIA_KINDS,
  RETENTION_ELECTIONS,
  type MediaAccessGrant,
  type MediaProcessingState,
  type MediaUploadIntentGrant,
  type PrivateMediaKind,
  type PrivateMediaRecord,
  type RetentionElection,
} from "@shared/research/member-platform";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { getSupabaseAdmin } from "../supabase";
import { capabilityEnabled } from "./capabilities";
import type { MemberPlatformDeps } from "./member-platform-deps";
import {
  MEDIA_ACCESS_VARIANTS,
  MediaProviderNotConfigured,
  selectMediaProvider,
  type MediaAccessVariant,
  type PrivateMediaProvider,
} from "./media-provider";

// ---------------------------------------------------------------------------
// xenios research member platform: private media (G10, Website 2 lane, Wave 4).
//
// Progress photos, voice notes, and exercise videos are the most sensitive
// material a member gives us, so the shape of this module is defensive by
// construction:
//
// - The list endpoint NEVER serializes a storage path or transcript text.
//   Paths are server-only routing detail; the transcript is fetched through the
//   audited access endpoint, so reading it always leaves a record.
// - Every access grant writes the audit row BEFORE the signed URL is minted.
//   No access without an audit trail; if the audit write fails, the grant fails.
// - Raw deletion happens ONLY after verified successful processing plus the
//   member's delete election. A failed processing job never deletes the only
//   safe copy. The single exception is an unclean malware scan, which deletes
//   the object precisely because keeping it is the greater harm.
// - Capability off means a truthful 409 capability_disabled on every path that
//   needs storage, never a fabricated URL and never a crash. Deletion is the
//   deliberate exception: a member can always delete, whatever storage says.
//
// HARD RULES (also encoded in media-provider.ts and research-media.sql):
// - No facial recognition anywhere. The face-blurred derivative is image
//   processing only: no face templates, embeddings, descriptors, or identity
//   matching are computed, stored, or compared, ever.
// - No public URLs. Access is a short-lived signed URL per authenticated
//   request; there is no durable public link to any member object.
// - No advertising or analytics egress. Media, derivatives, and transcripts
//   never leave this system for a marketing or measurement destination.
// ---------------------------------------------------------------------------

export const PRIVATE_MEDIA_TABLE = "research_private_media";
export const MEDIA_ACCESS_LOG_TABLE = "research_media_access_log";
export const MEDIA_RETENTION_ELECTIONS_TABLE = "research_media_retention_elections";

const MB = 1024 * 1024;

// Allowlist, not a denylist: an unlisted content type is refused. Kept narrow
// on purpose, since every accepted type is one the processing pipeline and the
// scanner both understand.
export const CONTENT_TYPE_ALLOWLIST: Record<PrivateMediaKind, readonly string[]> = {
  progress_photo: ["image/jpeg", "image/png", "image/webp"],
  voice_note: ["audio/webm", "audio/mpeg", "audio/mp4"],
  exercise_video: ["video/mp4", "video/webm"],
};

export const MAX_BYTES: Record<PrivateMediaKind, number> = {
  progress_photo: 15 * MB,
  voice_note: 10 * MB,
  exercise_video: 100 * MB,
};

// Voice and video are capped at 60 seconds. The cap is enforced at COMPLETION,
// because duration is only known once the file exists and has been inspected;
// the intent request cannot be trusted to declare it.
export const MAX_DURATION_SECONDS = 60;

const DURATION_CAPPED_KINDS: readonly PrivateMediaKind[] = ["voice_note", "exercise_video"];

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const ACCESS_URL_TTL_SECONDS = 5 * 60;

export type PrivateMediaRow = {
  id: string;
  member_id: string;
  kind: PrivateMediaKind;
  processing_state: MediaProcessingState;
  retention_election: RetentionElection;
  raw_storage_path: string | null;
  derivative_storage_path: string | null;
  transcript_text: string | null;
  face_blur_requested: boolean;
  // True once a malware scan reported the object unclean. Quarantined rows
  // never yield an access grant for any variant.
  quarantined?: boolean;
  has_face_blurred_derivative: boolean;
  duration_seconds: number | null;
  captured_at: string | null;
  uploaded_at: string;
  raw_deleted_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

// The member-facing record. Storage paths and transcript TEXT are deliberately
// absent: paths are server-only, and the transcript is read through the audited
// access endpoint so every read is recorded. hasTranscript is the only signal
// that a transcript exists.
export function toPrivateMediaRecord(row: PrivateMediaRow): PrivateMediaRecord {
  return {
    mediaId: row.id,
    kind: row.kind,
    processingState: row.processing_state,
    retentionElection: row.retention_election,
    hasFaceBlurredDerivative: row.has_face_blurred_derivative === true,
    hasTranscript: typeof row.transcript_text === "string" && row.transcript_text.length > 0,
    durationSeconds: row.duration_seconds ?? null,
    capturedAt: row.captured_at ?? null,
    uploadedAt: row.uploaded_at,
    rawDeletedAt: row.raw_deleted_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Storage reads (every member read filters by member_id; ordering in code so
// behavior never depends on storage ordering guarantees)
// ---------------------------------------------------------------------------

async function fetchMediaForMember(memberId: string): Promise<PrivateMediaRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(PRIVATE_MEDIA_TABLE)
      .select("*")
      .eq("member_id", memberId);
    if (error || !Array.isArray(data)) return [];
    return (data as PrivateMediaRow[])
      .slice()
      .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : a.uploaded_at > b.uploaded_at ? -1 : 0));
  } catch {
    return [];
  }
}

// Member scoping lives in the query itself, so another member's media id never
// resolves and is indistinguishable from one that does not exist.
async function fetchMemberMediaById(memberId: string, mediaId: string): Promise<PrivateMediaRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(PRIVATE_MEDIA_TABLE)
      .select("*")
      .eq("id", mediaId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (error) return null;
    return (data as PrivateMediaRow) ?? null;
  } catch {
    return null;
  }
}

// Processing runs server-side and is not member-scoped, so this read is by id
// alone. Callers are internal (completeProcessing), never a request handler.
async function fetchMediaById(mediaId: string): Promise<PrivateMediaRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(PRIVATE_MEDIA_TABLE)
      .select("*")
      .eq("id", mediaId)
      .maybeSingle();
    if (error) return null;
    return (data as PrivateMediaRow) ?? null;
  } catch {
    return null;
  }
}

// Optimistic, guarded update: the write matches only while the row is still in
// the state we read, so a concurrent transition loses cleanly instead of
// clobbering.
async function updateMediaRow(
  row: PrivateMediaRow,
  patch: Record<string, unknown>,
): Promise<PrivateMediaRow | null> {
  const { data } = await getSupabaseAdmin()
    .from(PRIVATE_MEDIA_TABLE)
    .update(patch)
    .eq("id", row.id)
    .eq("processing_state", row.processing_state)
    .select("*")
    .maybeSingle();
  return (data as PrivateMediaRow) ?? null;
}

// ---------------------------------------------------------------------------
// The standing retention election
// ---------------------------------------------------------------------------

// The member's standing election, or null when they have never chosen. The
// election table is authoritative; the most recent media row is the fallback
// for members who uploaded before the table existed.
export async function fetchStandingElection(memberId: string): Promise<RetentionElection | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from(MEDIA_RETENTION_ELECTIONS_TABLE)
      .select("*")
      .eq("member_id", memberId)
      .maybeSingle();
    const stored = (data as { retention_election?: unknown } | null)?.retention_election;
    if (typeof stored === "string" && (RETENTION_ELECTIONS as readonly string[]).includes(stored)) {
      return stored as RetentionElection;
    }
  } catch {
    // fall through to the row-derived fallback
  }
  const rows = await fetchMediaForMember(memberId);
  return rows.length > 0 ? rows[0].retention_election : null;
}

async function storeStandingElection(
  memberId: string,
  election: RetentionElection,
  now: Date,
): Promise<void> {
  const stamp = now.toISOString();
  const { data } = await getSupabaseAdmin()
    .from(MEDIA_RETENTION_ELECTIONS_TABLE)
    .update({ retention_election: election, updated_at: stamp })
    .eq("member_id", memberId)
    .select("*")
    .maybeSingle();
  if (data) return;
  await getSupabaseAdmin().from(MEDIA_RETENTION_ELECTIONS_TABLE).insert({
    member_id: memberId,
    retention_election: election,
    created_at: stamp,
    updated_at: stamp,
  });
}

// ---------------------------------------------------------------------------
// The access audit
// ---------------------------------------------------------------------------

// Written before the URL is minted. Returns false when the audit row could not
// be recorded, and the caller then refuses the grant: no access without a
// trail is the safer failure for private health media.
async function writeAccessLog(
  memberId: string,
  mediaId: string,
  variant: MediaAccessVariant,
  now: Date,
): Promise<boolean> {
  try {
    const { error } = await getSupabaseAdmin().from(MEDIA_ACCESS_LOG_TABLE).insert({
      media_id: mediaId,
      member_id: memberId,
      variant,
      accessed_at: now.toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Processing completion (called by the processing worker, not by a member)
// ---------------------------------------------------------------------------

export type ProcessingOutcome =
  | {
      ok: true;
      derivativeStoragePath?: string | null;
      hasFaceBlurredDerivative?: boolean;
      transcriptText?: string | null;
      durationSeconds?: number | null;
    }
  | { ok: false; reason: string };

export type CompleteProcessingResult =
  | { ok: true; row: PrivateMediaRow }
  | { ok: false; code: "not_found" | "state_conflict"; message: string };

// Marks a job failed WITHOUT touching the raw object. This is the only safe
// copy rule in code: raw_storage_path and raw_deleted_at are never part of the
// patch, so no failure path here can destroy the member's file.
async function markProcessingFailed(row: PrivateMediaRow): Promise<PrivateMediaRow> {
  const updated = await updateMediaRow(row, { processing_state: "processing_failed" });
  return updated ?? { ...row, processing_state: "processing_failed" };
}

// A guarded update that lost its race. The caller stops rather than acting on
// state it did not write; the winning worker owns the row from here.
function raceLost(mediaId: string): CompleteProcessingResult {
  console.warn("[media] completeProcessing lost a state race; another worker owns this job.");
  void mediaId;
  return {
    ok: false,
    code: "state_conflict",
    message: "The media state changed underneath this job. Another worker owns it.",
  };
}

// The full completion path: scan, then process, then (and only then) honor the
// delete election. Ordering is the point. Nothing is destroyed before the
// derived artifact that replaces it is verified to exist.
export async function completeProcessing(
  mediaId: string,
  deps: MemberPlatformDeps,
  outcome: ProcessingOutcome,
  provider: PrivateMediaProvider = selectMediaProvider(),
): Promise<CompleteProcessingResult> {
  const row = await fetchMediaById(mediaId);
  if (!row) return { ok: false, code: "not_found", message: "No media with that id." };
  if (row.processing_state === "deleted") {
    return { ok: false, code: "state_conflict", message: "The media was deleted." };
  }
  // Idempotent: a worker retry after a successful run is a no-op rather than a
  // second pass that could re-delete or re-derive.
  if (row.processing_state === "processed") return { ok: true, row };

  const now = deps.clock.now();

  // Nothing to scan or process means the upload never landed.
  if (!row.raw_storage_path) {
    return { ok: true, row: await markProcessingFailed(row) };
  }

  // 1. Malware scan, BEFORE any processing.
  //
  // Every state advance below is an optimistic guarded update. When a guard
  // LOSES a race (another worker moved the row first), the update returns
  // null and this function ABORTS with state_conflict. It never synthesizes
  // the row it failed to write: continuing on stale state is how a second
  // worker ends up deleting a raw file the first worker had already decided
  // to retain.
  const scanning = await updateMediaRow(row, { processing_state: "scanning" });
  if (!scanning) return raceLost(mediaId);
  const scan = await provider.scanForMalware(row.raw_storage_path);

  // A scanner that cannot answer fails CLOSED: the file is not processed and
  // is not deleted. An unscannable file is not a safe file.
  if (!scan.ok) {
    return { ok: true, row: await markProcessingFailed(scanning) };
  }

  // An unclean file IS deleted, derivative and transcript left empty. This is
  // the one deletion-on-failure path, and it exists because keeping known
  // malware is the greater harm.
  if (!scan.value.clean) {
    // The delete RESULT decides what the row may claim. If storage refuses,
    // the pointer stays so the object is still reachable for a retry sweep;
    // the row is quarantined either way and the raw variant is refused for an
    // unclean row (see grantMediaAccess), so a refused delete never leaves
    // malware downloadable.
    const removed = await provider
      .deleteObject(row.raw_storage_path)
      .catch(() => ({ ok: false as const, code: "PROVIDER_ERROR" as const, message: "delete threw" }));
    const quarantined = await updateMediaRow(scanning, {
      processing_state: "processing_failed",
      quarantined: true,
      ...(removed.ok
        ? { raw_storage_path: null, raw_deleted_at: now.toISOString() }
        : {}),
      derivative_storage_path: null,
      has_face_blurred_derivative: false,
      transcript_text: null,
    });
    if (!quarantined) return raceLost(mediaId);
    if (!removed.ok) {
      console.error("[media] quarantine delete refused by storage; the object is retained for retry and access is closed.");
    }
    return { ok: true, row: quarantined };
  }

  // 2. The worker's own outcome. A failure stops here, raw intact.
  if (!outcome.ok) {
    return { ok: true, row: await markProcessingFailed(scanning) };
  }

  // The 60-second cap for voice and video, enforced now that the real duration
  // is known. Over-long media fails processing and keeps its raw file, so the
  // member can still retrieve and re-cut what they recorded.
  const duration = outcome.durationSeconds ?? null;
  if (
    DURATION_CAPPED_KINDS.includes(row.kind) &&
    duration !== null &&
    duration > MAX_DURATION_SECONDS
  ) {
    return { ok: true, row: await markProcessingFailed(scanning) };
  }

  const processing = await updateMediaRow(scanning, { processing_state: "processing" });
  if (!processing) return raceLost(mediaId);

  // 3. Success. The derivative is a blurred IMAGE or a transcript; no face
  // template, embedding, or identity match is produced or stored.
  const derivativePath = outcome.derivativeStoragePath ?? null;
  const processed = await updateMediaRow(processing, {
    processing_state: "processed",
    derivative_storage_path: derivativePath,
    has_face_blurred_derivative:
      outcome.hasFaceBlurredDerivative ?? (derivativePath !== null && row.face_blur_requested === true),
    transcript_text: outcome.transcriptText ?? null,
    duration_seconds: duration,
  });
  // The delete election below acts on PERSISTED state only. Without a
  // confirmed write there is no verified derivative, so nothing is deleted.
  if (!processed) return raceLost(mediaId);

  // 4. ONLY NOW, with processing verified successful, does the delete election
  // apply. If storage refuses the delete, the row keeps its raw file rather
  // than claiming a deletion that did not happen; a sweeper retries later.
  if (processed.retention_election === "delete_raw_after_processing" && processed.raw_storage_path) {
    const deleted = await provider.deleteObject(processed.raw_storage_path);
    if (deleted.ok) {
      const stamped = await updateMediaRow(processed, {
        raw_storage_path: null,
        raw_deleted_at: now.toISOString(),
      });
      return { ok: true, row: stamped ?? processed };
    }
    console.error("[media] raw deletion after processing failed; the raw file is retained.");
  }

  return { ok: true, row: processed };
}

// ---------------------------------------------------------------------------
// Retention election changes
// ---------------------------------------------------------------------------

// Sets the standing election and applies it forward. Switching to
// delete_raw_after_processing sweeps rows that are ALREADY processed (their
// derived artifact exists, so the raw is genuinely redundant). Rows in
// processing_failed are swept over on purpose: a failed job's raw file is the
// only safe copy, and an election change never destroys it.
export async function applyRetentionElection(
  memberId: string,
  election: RetentionElection,
  deps: MemberPlatformDeps,
  provider: PrivateMediaProvider = selectMediaProvider(),
): Promise<void> {
  const now = deps.clock.now();
  await storeStandingElection(memberId, election, now);

  const rows = await fetchMediaForMember(memberId);
  for (const row of rows) {
    if (row.processing_state === "deleted") continue;
    if (row.retention_election !== election) {
      await getSupabaseAdmin()
        .from(PRIVATE_MEDIA_TABLE)
        .update({ retention_election: election })
        .eq("id", row.id);
    }
  }

  if (election !== "delete_raw_after_processing") return;

  for (const row of rows) {
    // processed ONLY. Never uploaded, scanning, processing (not finished) and
    // never processing_failed (the only safe copy).
    if (row.processing_state !== "processed") continue;
    if (!row.raw_storage_path || row.raw_deleted_at) continue;
    const deleted = await provider.deleteObject(row.raw_storage_path);
    if (!deleted.ok) continue;
    await getSupabaseAdmin()
      .from(PRIVATE_MEDIA_TABLE)
      .update({ raw_storage_path: null, raw_deleted_at: now.toISOString() })
      .eq("id", row.id);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const intentSchema = z.object({
  kind: z.enum(PRIVATE_MEDIA_KINDS),
  contentType: z.string().min(1).max(200),
  contentLengthBytes: z.number().int().positive(),
  // A real timestamp, not any 40-character string: an unparseable value used
  // to reach the insert and surface as a state conflict instead of a field
  // error. Future capture times are refused for the same reason the tracker
  // refuses them, the server clock is the authority.
  capturedAt: z
    .string()
    .min(1)
    .max(40)
    .refine((value) => Number.isFinite(Date.parse(value)), { message: "capturedAt must be an ISO-8601 timestamp" })
    .optional(),
  retentionElection: z.enum(RETENTION_ELECTIONS).optional(),
  requestFaceBlur: z.boolean().optional(),
});

const accessSchema = z.object({
  variant: z.enum(MEDIA_ACCESS_VARIANTS),
});

const electionSchema = z.object({
  retentionElection: z.enum(RETENTION_ELECTIONS),
});

function setPrivacyHeaders(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function memberFrom(req: Request): MemberRow | null {
  return ((req as { researchMember?: MemberRow }).researchMember as MemberRow) ?? null;
}

function sendValidation(res: Response, fieldErrors: Record<string, string[]>) {
  res.status(400).json({ ok: false, code: "validation_failed", fieldErrors });
}

function sendNotFound(res: Response, message: string) {
  res.status(404).json({ ok: false, code: "not_found", message });
}

function sendConflict(res: Response, message: string) {
  res.status(409).json({ ok: false, code: "state_conflict", message });
}

function sendCapabilityDisabled(res: Response) {
  res.status(409).json({
    ok: false,
    code: "capability_disabled",
    message: "Private media storage is not available yet.",
  });
}

export function registerMediaApi(app: Express, deps: MemberPlatformDeps) {
  // The upload intent. Creates the row and returns a signed, single-use upload
  // URL. The capability gate comes first: with storage off there is no honest
  // answer to give, so the request is refused before anything is stored.
  app.post("/api/research/media/intent", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      if (!capabilityEnabled("private_media")) return sendCapabilityDisabled(res);

      const parsed = intentSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);
      const input = parsed.data;

      const fieldErrors: Record<string, string[]> = {};
      const allowed = CONTENT_TYPE_ALLOWLIST[input.kind];
      if (!allowed.includes(input.contentType)) {
        fieldErrors.contentType = [`contentType for ${input.kind} must be one of: ${allowed.join(", ")}`];
      }
      const maxBytes = MAX_BYTES[input.kind];
      if (input.contentLengthBytes > maxBytes) {
        fieldErrors.contentLengthBytes = [
          `contentLengthBytes for ${input.kind} must be at most ${maxBytes} bytes`,
        ];
      }
      // Face blur is an image operation, so it is meaningless on audio or
      // video here. Only an explicit true is refused, so a UI that always
      // sends the flag as false keeps working.
      if (input.requestFaceBlur === true && input.kind !== "progress_photo") {
        fieldErrors.requestFaceBlur = ["requestFaceBlur applies to progress_photo only"];
      }
      if (input.capturedAt && Date.parse(input.capturedAt) > deps.clock.now().getTime()) {
        fieldErrors.capturedAt = ["capturedAt cannot be in the future"];
      }

      // The first upload is where the member chooses what happens to their raw
      // files. There is no default: an unstated election is a validation
      // failure, never a silent assumption in either direction.
      const standing = await fetchStandingElection(member.id);
      const election = input.retentionElection ?? standing;
      if (!election) {
        fieldErrors.retentionElection = [
          "retentionElection is required on the first upload (retain_raw or delete_raw_after_processing)",
        ];
      }
      if (Object.keys(fieldErrors).length > 0) return sendValidation(res, fieldErrors);

      const now = deps.clock.now();
      const nowIso = now.toISOString();

      // An election supplied here also becomes the standing one, so the member
      // states it once rather than on every upload. It routes through the same
      // application path as PUT /retention-election so both entry points move
      // in-flight rows identically; that sweep only touches already-processed
      // rows, so it can never destroy a copy still being relied on.
      if (input.retentionElection && input.retentionElection !== standing) {
        await applyRetentionElection(member.id, input.retentionElection, deps);
      }

      const { data, error } = await getSupabaseAdmin()
        .from(PRIVATE_MEDIA_TABLE)
        .insert({
          member_id: member.id,
          kind: input.kind,
          processing_state: "uploaded",
          retention_election: election,
          raw_storage_path: null,
          derivative_storage_path: null,
          transcript_text: null,
          face_blur_requested: input.requestFaceBlur === true && input.kind === "progress_photo",
          quarantined: false,
          has_face_blurred_derivative: false,
          duration_seconds: null,
          captured_at: input.capturedAt ?? null,
          uploaded_at: nowIso,
          raw_deleted_at: null,
          created_at: nowIso,
        })
        .select("*")
        .single();
      if (error || !data) return sendConflict(res, "The upload could not be prepared. Try again.");
      const row = data as PrivateMediaRow;

      const provider = selectMediaProvider();
      const granted = await provider.createUploadUrl({
        mediaId: row.id,
        memberId: member.id,
        kind: input.kind,
        contentType: input.contentType,
        contentLengthBytes: input.contentLengthBytes,
        maxBytes,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        now,
      });
      if (!granted.ok) {
        // No usable URL means no usable row. Clean up so an abandoned
        // placeholder never shows in the member's list.
        await getSupabaseAdmin().from(PRIVATE_MEDIA_TABLE).delete().eq("id", row.id);
        if (granted.code === "DISABLED" || granted.code === "NOT_CONFIGURED") {
          return sendCapabilityDisabled(res);
        }
        return res.status(500).json({ ok: false, message: "The upload could not be prepared." });
      }

      // The path the provider chose is recorded server-side and never returned.
      await getSupabaseAdmin()
        .from(PRIVATE_MEDIA_TABLE)
        .update({ raw_storage_path: granted.value.storagePath })
        .eq("id", row.id);

      const grant: MediaUploadIntentGrant = {
        mediaId: row.id,
        uploadUrl: granted.value.uploadUrl,
        expiresAt: granted.value.expiresAt,
        maxBytes: granted.value.maxBytes,
      };
      res.json({ ok: true, grant });
    } catch (err) {
      if (err instanceof MediaProviderNotConfigured) return sendCapabilityDisabled(res);
      console.error("[media] intent failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The upload could not be prepared." });
    }
  });

  // The member's own media. Never carries a storage path or transcript text.
  // This route stays available with the capability off so a member can always
  // see and delete what we hold.
  app.get("/api/research/media", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const rows = await fetchMediaForMember(member.id);
      res.json({ ok: true, media: rows.map(toPrivateMediaRecord) });
    } catch (err) {
      console.error("[media] list failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "Your media could not be loaded." });
    }
  });

  // A short-lived signed URL for one variant of the member's own media. The
  // audit row is written first; a grant that cannot be audited is not granted.
  app.post("/api/research/media/:mediaId/access", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      if (!capabilityEnabled("private_media")) return sendCapabilityDisabled(res);

      const parsed = accessSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);
      const variant = parsed.data.variant;

      const row = await fetchMemberMediaById(member.id, String(req.params.mediaId));
      if (!row) return sendNotFound(res, "No media with that id.");

      // A deleted record has no objects left to sign.
      if (row.processing_state === "deleted") {
        return variant === "raw"
          ? sendConflict(res, "That file was deleted and cannot be retrieved.")
          : sendNotFound(res, "That variant does not exist for this media.");
      }

      // A quarantined row is closed to EVERY variant. The pointer may still
      // exist because a storage delete was refused and awaits a retry sweep;
      // that must never become a download of flagged content.
      if (row.quarantined === true) {
        return sendConflict(res, "That file was quarantined by a safety scan and cannot be retrieved.");
      }

      let storagePath: string | null = null;
      if (variant === "raw") {
        // The delete election is irreversible by design; say so plainly rather
        // than pretending the file is merely missing.
        if (row.raw_deleted_at || !row.raw_storage_path) {
          return sendConflict(
            res,
            "The original file was deleted after processing under your retention election.",
          );
        }
        storagePath = row.raw_storage_path;
      } else if (variant === "face_blurred") {
        if (!row.derivative_storage_path || row.has_face_blurred_derivative !== true) {
          return sendNotFound(res, "There is no blurred version of this media.");
        }
        storagePath = row.derivative_storage_path;
      } else {
        if (!row.transcript_text) return sendNotFound(res, "There is no transcript for this media.");
        // The transcript lives on the row, not in an object. Passing null is
        // deliberate: handing the provider the RAW path here would mint a
        // grant for the original recording under a transcript request.
        storagePath = null;
      }

      const now = deps.clock.now();
      const audited = await writeAccessLog(member.id, row.id, variant, now);
      if (!audited) {
        return res.status(500).json({ ok: false, message: "Access could not be recorded, so it was not granted." });
      }

      const provider = selectMediaProvider();
      const signed = await provider.createAccessUrl({
        mediaId: row.id,
        memberId: member.id,
        storagePath,
        variant,
        expiresInSeconds: ACCESS_URL_TTL_SECONDS,
        now,
      });
      if (!signed.ok) {
        if (signed.code === "DISABLED" || signed.code === "NOT_CONFIGURED") {
          return sendCapabilityDisabled(res);
        }
        return res.status(500).json({ ok: false, message: "Access could not be granted." });
      }

      const grant: MediaAccessGrant = {
        mediaId: row.id,
        variant,
        signedUrl: signed.value.signedUrl,
        expiresAt: signed.value.expiresAt,
      };
      res.json({ ok: true, grant });
    } catch (err) {
      if (err instanceof MediaProviderNotConfigured) return sendCapabilityDisabled(res);
      console.error("[media] access failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "Access could not be granted." });
    }
  });

  // Member deletion. Deliberately NOT capability-gated: a member must always be
  // able to delete what we hold, whatever storage is doing. Objects are removed
  // best effort, and the row is marked deleted either way, so access is closed
  // immediately and a sweeper reconciles any object the provider refused.
  app.delete("/api/research/media/:mediaId", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      const row = await fetchMemberMediaById(member.id, String(req.params.mediaId));
      if (!row) return sendNotFound(res, "No media with that id.");

      const now = deps.clock.now();
      // Idempotent: a repeat delete returns the original timestamp and does not
      // drive the provider again.
      if (row.processing_state === "deleted") {
        return res.json({ ok: true, deletedAt: row.raw_deleted_at ?? now.toISOString() });
      }

      const provider = selectMediaProvider();
      // A pointer is erased only when the object behind it is actually gone.
      // Erasing it after a refused delete would orphan the object with nothing
      // left to find it by, which is unrecoverable; keeping it lets a sweeper
      // finish the job while access stays closed by the deleted state.
      const removedPaths = new Set<string>();
      for (const path of [row.raw_storage_path, row.derivative_storage_path]) {
        if (!path) continue;
        try {
          const removed = await provider.deleteObject(path);
          if (removed.ok) {
            removedPaths.add(path);
          } else {
            console.error("[media] object delete refused by the provider; the pointer is retained for a retry sweep.");
          }
        } catch (err) {
          console.error("[media] object delete failed:", err instanceof Error ? err.message : err);
        }
      }

      const stamp = now.toISOString();
      // The transcript goes too: deleting media means deleting what was derived
      // from it, not just the bytes. Transcript text lives on the row, so it is
      // always cleared; object pointers clear only on a confirmed removal.
      const rawGone = !row.raw_storage_path || removedPaths.has(row.raw_storage_path);
      const derivativeGone = !row.derivative_storage_path || removedPaths.has(row.derivative_storage_path);
      const updated = await updateMediaRow(row, {
        processing_state: "deleted",
        ...(rawGone ? { raw_storage_path: null } : {}),
        ...(derivativeGone ? { derivative_storage_path: null } : {}),
        transcript_text: null,
        has_face_blurred_derivative: false,
        raw_deleted_at: row.raw_deleted_at ?? stamp,
      });
      if (!updated) {
        // A concurrent delete landed first; report that one.
        const raced = await fetchMemberMediaById(member.id, row.id);
        if (raced?.processing_state === "deleted") {
          return res.json({ ok: true, deletedAt: raced.raw_deleted_at ?? stamp });
        }
        return sendConflict(res, "The media could not be deleted. Reload and retry.");
      }
      res.json({ ok: true, deletedAt: updated.raw_deleted_at ?? stamp });
    } catch (err) {
      console.error("[media] delete failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The media could not be deleted." });
    }
  });

  // The standing retention election. Applies to future uploads and sweeps rows
  // that are already processed; a row whose processing FAILED keeps its raw
  // file, because that copy is the only one.
  app.put("/api/research/media/retention-election", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      const parsed = electionSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);

      await applyRetentionElection(member.id, parsed.data.retentionElection, deps);
      res.json({ ok: true });
    } catch (err) {
      console.error("[media] retention election failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The retention election could not be saved." });
    }
  });
}
