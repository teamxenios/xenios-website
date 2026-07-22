import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  PLAN_DOCUMENT_TYPES,
  type DocumentAccessGrant,
  type PlanDocument,
  type PlanDocumentType,
} from "@shared/research/member-platform";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { requireSupabaseAdmin } from "../routes";
import { getSupabaseAdmin } from "../supabase";
import { capabilityEnabled } from "./capabilities";
import type { MemberPlatformDeps } from "./member-platform-deps";
import {
  isNotConfigured,
  selectDocumentRenderer,
  type RenderSection,
  type RenderedDocument,
} from "./document-renderer";

// ---------------------------------------------------------------------------
// xenios research member platform: the Document Center (Wave 3, contract 9).
//
// Documents are private records with a private door. Three rules are structural
// here, not conventions:
//
// 1. STORAGE PATHS NEVER LEAVE THE SERVER. toPlanDocument() is the only
//    serializer, and it has no storage_path field to leak. A member learns a
//    document's id, title, version, and checksum, never where the bytes live.
//
// 2. A SIGNATURE IS NOT AN AUTHORIZATION. The download route requires the
//    member SESSION (requireActiveMember) as well as the signature, and it
//    re-reads ownership from the database on every hit. The member id is also
//    bound INTO the MAC, so a grant minted for one member does not verify under
//    another member's session. Three independent checks must agree: signature,
//    session, and stored ownership. A leaked URL alone opens nothing.
//
// 3. THE DISABLED PATH IS REAL. With the capability off, access and admin
//    creation return capability_disabled and write nothing. There is no
//    placeholder URL, no fake checksum, and no half-written row.
//
// Notification payloads carry firstName and the document title only. Document
// contents are never emailed and never attached; the email carries a link into
// the member Document Center.
// ---------------------------------------------------------------------------

export const PLAN_DOCUMENTS_TABLE = "research_plan_documents";
const MEMBERS_TABLE = "research_members";

// Short-lived by design: long enough to click through, short enough that a URL
// captured from a log or a shared screen is stale before it is useful.
export const DOCUMENT_GRANT_TTL_MS = 10 * 60 * 1000;

// Display name only, matching the blueprint reviewer convention. An admin email
// is never serialized to a member.
const REVIEWER_DISPLAY_NAME = "Samuel";

export type PlanDocumentRow = {
  id: string;
  member_id: string;
  type: PlanDocumentType;
  title: string;
  version: number;
  template_version: string;
  checksum_sha256: string;
  storage_path: string;
  status: "current" | "archived";
  supersedes_document_id: string | null;
  reviewed_by: string | null;
  published_at: string;
  acknowledged_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

// The ONLY member-facing serialization. storage_path is absent by construction.
export function toPlanDocument(row: PlanDocumentRow): PlanDocument {
  return {
    documentId: row.id,
    type: row.type,
    title: row.title,
    version: row.version,
    templateVersion: row.template_version,
    checksumSha256: row.checksum_sha256,
    status: row.status,
    supersedesDocumentId: row.supersedes_document_id,
    reviewedBy: row.reviewed_by,
    publishedAt: row.published_at,
    acknowledgedAt: row.acknowledged_at,
  };
}

// ---------------------------------------------------------------------------
// Capability gate
// ---------------------------------------------------------------------------

// A signed grant is only meaningful when BOTH capabilities are live: the
// rendering capability is what produced the bytes, and the private-media
// capability is what stores and serves them. Either one off means there is
// nothing honest to hand back, so the answer is capability_disabled rather than
// a URL that would 404 later.
export function documentAccessEnabled(): boolean {
  return capabilityEnabled("document_rendering") && capabilityEnabled("private_media");
}

// ---------------------------------------------------------------------------
// Byte storage seam
// ---------------------------------------------------------------------------

export type StoredDocumentBytes = { bytes: Uint8Array; contentType: string };

export interface DocumentBytesStore {
  put(storagePath: string, document: StoredDocumentBytes): Promise<void>;
  get(storagePath: string): Promise<StoredDocumentBytes | null>;
}

// Non-production store. Deterministic and process-local: it holds exactly what
// the renderer produced, so the download path is exercised end to end in tests
// without a storage account.
const memoryDocumentBytes = new Map<string, StoredDocumentBytes>();

export const memoryDocumentBytesStore: DocumentBytesStore = {
  async put(storagePath, document) {
    memoryDocumentBytes.set(storagePath, {
      bytes: new Uint8Array(document.bytes),
      contentType: document.contentType,
    });
  },
  async get(storagePath) {
    return memoryDocumentBytes.get(storagePath) ?? null;
  },
};

export function clearMemoryDocumentBytes(): void {
  memoryDocumentBytes.clear();
}

// The production seam. The real adapter reads and writes the private Supabase
// storage bucket named by RESEARCH_MEDIA_BUCKET (the same bucket the private
// media capability declares), with the service-role client and no public URL
// ever minted. It is inert until that adapter is wired: refusing is the honest
// behavior, and callers map the refusal to capability_disabled.
export const notConfiguredDocumentBytesStore: DocumentBytesStore = {
  async put() {
    throw new NotConfiguredStore("Document byte storage is not wired.");
  },
  async get() {
    throw new NotConfiguredStore("Document byte storage is not wired.");
  },
};

class NotConfiguredStore extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConfigured";
  }
}

export function selectDocumentBytesStore(): DocumentBytesStore {
  if (process.env.NODE_ENV === "production") return notConfiguredDocumentBytesStore;
  return memoryDocumentBytesStore;
}

// ---------------------------------------------------------------------------
// Grant signing
// ---------------------------------------------------------------------------

// Same signing rules as the rest of the research surface: the dedicated secret
// is required in production, development falls back to a fixed dev-only string,
// and the key is never derived from a password and never sent to the client.
function signingKey(): Buffer {
  const secret = process.env.RESEARCH_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEARCH_SESSION_SECRET is required in production");
    }
    return crypto.createHash("sha256").update("xenios-research-dev-only-secret").digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

// The signed value carries a "document." domain label so this MAC can never
// collide with the gate cookie or the applicant status token, which share the
// same signing secret. The member id inside the MAC is what makes a grant
// non-transferable between members.
function grantPayload(documentId: string, memberId: string, expiresAtMs: number): string {
  return `document.${documentId}.${memberId}.${expiresAtMs}`;
}

export function signDocumentGrant(documentId: string, memberId: string, expiresAtMs: number): string {
  return crypto
    .createHmac("sha256", signingKey())
    .update(grantPayload(documentId, memberId, expiresAtMs))
    .digest("base64url");
}

// Constant-time comparison. Length is checked first because timingSafeEqual
// throws on a length mismatch; the length itself is not a secret.
export function documentGrantSignatureValid(
  documentId: string,
  memberId: string,
  expiresAtMs: number,
  signature: string,
): boolean {
  const expected = signDocumentGrant(documentId, memberId, expiresAtMs);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

export function documentDownloadPath(documentId: string, expiresAtMs: number, signature: string): string {
  const query = new URLSearchParams({ exp: String(expiresAtMs), sig: signature });
  return `/api/research/documents/${encodeURIComponent(documentId)}/download?${query.toString()}`;
}

// ---------------------------------------------------------------------------
// Storage reads
// ---------------------------------------------------------------------------

// Newest first: published_at desc, then version desc. Sorted in code so the
// ordering never depends on storage behavior.
function sortNewestFirst(rows: PlanDocumentRow[]): PlanDocumentRow[] {
  return [...rows].sort((a, b) => {
    if (a.published_at === b.published_at) return b.version - a.version;
    return a.published_at < b.published_at ? 1 : -1;
  });
}

async function fetchMemberDocuments(memberId: string): Promise<PlanDocumentRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(PLAN_DOCUMENTS_TABLE)
      .select("*")
      .eq("member_id", memberId);
    if (error || !Array.isArray(data)) return [];
    return sortNewestFirst(data as PlanDocumentRow[]);
  } catch {
    return [];
  }
}

// Member scoping lives in the QUERY: another member's document id never
// resolves, so it is indistinguishable from an id that does not exist.
async function fetchMemberDocument(memberId: string, documentId: string): Promise<PlanDocumentRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(PLAN_DOCUMENTS_TABLE)
      .select("*")
      .eq("id", documentId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (error) return null;
    return (data as PlanDocumentRow) ?? null;
  } catch {
    return null;
  }
}

type NotifyMemberRow = {
  id: string;
  email: string;
  first_name?: string | null;
  [key: string]: unknown;
};

async function fetchMemberById(memberId: string): Promise<NotifyMemberRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(MEMBERS_TABLE)
      .select("*")
      .eq("id", memberId)
      .maybeSingle();
    if (error) return null;
    return (data as NotifyMemberRow) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

type ServiceErr = {
  ok: false;
  code: "validation_failed" | "state_conflict" | "not_found" | "capability_disabled";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};
type ServiceResult<T> = ({ ok: true } & T) | ServiceErr;

export async function grantDocumentAccess(
  memberId: string,
  documentId: string,
  now: Date,
): Promise<ServiceResult<{ grant: DocumentAccessGrant }>> {
  if (!documentAccessEnabled()) {
    return {
      ok: false,
      code: "capability_disabled",
      message: "Private document access is not enabled yet.",
    };
  }
  const row = await fetchMemberDocument(memberId, documentId);
  if (!row) return { ok: false, code: "not_found", message: "No document with that id." };

  const expiresAtMs = now.getTime() + DOCUMENT_GRANT_TTL_MS;
  const signature = signDocumentGrant(row.id, memberId, expiresAtMs);
  return {
    ok: true,
    grant: {
      documentId: row.id,
      signedUrl: documentDownloadPath(row.id, expiresAtMs, signature),
      expiresAt: new Date(expiresAtMs).toISOString(),
    },
  };
}

// Version-checked and idempotent, mirroring the blueprint acknowledgment: a
// stale version names the current one so the member reloads rather than
// silently acknowledging a document they are not looking at.
export async function acknowledgeDocument(
  memberId: string,
  documentId: string,
  version: number,
  now: Date,
): Promise<ServiceResult<{ acknowledgedAt: string }>> {
  const row = await fetchMemberDocument(memberId, documentId);
  if (!row) return { ok: false, code: "not_found", message: "No document with that id." };
  if (row.status !== "current") {
    return {
      ok: false,
      code: "state_conflict",
      message: "This document has been replaced. Reload to acknowledge the current version.",
    };
  }
  if (row.version !== version) {
    return {
      ok: false,
      code: "state_conflict",
      message: `The document has moved on. Current version is ${row.version}. Reload to continue.`,
    };
  }
  if (row.acknowledged_at) {
    // Idempotent: the first acknowledgment's timestamp stands.
    return { ok: true, acknowledgedAt: row.acknowledged_at };
  }

  const stamp = now.toISOString();
  const { data } = await getSupabaseAdmin()
    .from(PLAN_DOCUMENTS_TABLE)
    .update({ acknowledged_at: stamp })
    .eq("id", row.id)
    .eq("member_id", memberId)
    .eq("status", "current")
    .is("acknowledged_at", null)
    .select("*")
    .maybeSingle();
  if (!data) {
    // A concurrent acknowledgment landed first; return its timestamp.
    const raced = await fetchMemberDocument(memberId, documentId);
    if (raced?.acknowledged_at) return { ok: true, acknowledgedAt: raced.acknowledged_at };
    return { ok: false, code: "state_conflict", message: "The document could not be acknowledged." };
  }
  return { ok: true, acknowledgedAt: stamp };
}

function extensionFor(contentType: string): string {
  if (contentType.startsWith("application/pdf")) return "pdf";
  if (contentType.startsWith("text/plain")) return "txt";
  return "bin";
}

// The storage path keys on the OPAQUE member id and the checksum, never on a
// name or a title, so the path itself carries no personal detail even if it
// were ever seen.
function storagePathFor(
  memberId: string,
  type: PlanDocumentType,
  version: number,
  rendered: RenderedDocument,
): string {
  return `research-documents/${memberId}/${type}/v${version}-${rendered.checksumSha256.slice(0, 16)}.${extensionFor(
    rendered.contentType,
  )}`;
}

export type CreateDocumentInput = {
  memberId: string;
  type: PlanDocumentType;
  title: string;
  templateVersion: string;
  sections: RenderSection[];
};

// Admin creation, in strict order so a failure never leaves a partial record:
// render first (a disabled or unwired renderer stops here with nothing
// written), then store the bytes, then insert the row, then archive the prior
// current document of the same type, then notify.
export async function createPlanDocument(
  input: CreateDocumentInput,
  deps: MemberPlatformDeps,
): Promise<ServiceResult<{ row: PlanDocumentRow }>> {
  const member = await fetchMemberById(input.memberId);
  if (!member) return { ok: false, code: "not_found", message: "No such member." };

  let rendered: RenderedDocument;
  try {
    const result = await selectDocumentRenderer().render({
      type: input.type,
      title: input.title,
      templateVersion: input.templateVersion,
      // Opaque reference only. The member's name never reaches the renderer.
      memberRef: member.id,
      sections: input.sections,
    });
    if (!result.ok) {
      return {
        ok: false,
        code: "capability_disabled",
        message: "Document rendering is not enabled yet.",
      };
    }
    rendered = result.value;
  } catch (err) {
    if (isNotConfigured(err)) {
      return {
        ok: false,
        code: "capability_disabled",
        message: "Document rendering is not wired yet.",
      };
    }
    throw err;
  }

  const existing = await fetchMemberDocuments(member.id);
  const sameType = existing.filter((row) => row.type === input.type);
  const version = sameType.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const prior = sameType.find((row) => row.status === "current") ?? null;
  const storagePath = storagePathFor(member.id, input.type, version, rendered);

  try {
    await selectDocumentBytesStore().put(storagePath, {
      bytes: rendered.bytes,
      contentType: rendered.contentType,
    });
  } catch (err) {
    if (isNotConfigured(err)) {
      return {
        ok: false,
        code: "capability_disabled",
        message: "Document storage is not wired yet.",
      };
    }
    throw err;
  }

  const stamp = deps.clock.now().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(PLAN_DOCUMENTS_TABLE)
    .insert({
      member_id: member.id,
      type: input.type,
      title: input.title,
      version,
      template_version: input.templateVersion,
      checksum_sha256: rendered.checksumSha256,
      storage_path: storagePath,
      status: "current",
      supersedes_document_id: prior ? prior.id : null,
      reviewed_by: REVIEWER_DISPLAY_NAME,
      published_at: stamp,
      acknowledged_at: null,
      created_at: stamp,
    })
    .select("*")
    .single();
  if (error || !data) {
    // A concurrent create claimed this version (the unique member + type +
    // version constraint); the admin retries.
    return { ok: false, code: "state_conflict", message: "The document could not be created. Try again." };
  }
  const row = data as PlanDocumentRow;

  // Exactly one current document per type: the prior one steps down. Guarded on
  // its current status so a concurrent archive loses cleanly.
  if (prior) {
    await getSupabaseAdmin()
      .from(PLAN_DOCUMENTS_TABLE)
      .update({ status: "archived" })
      .eq("id", prior.id)
      .eq("status", "current");
  }

  // Safe payload only: firstName and the document title, never document
  // content, never a storage path, never a signed URL. Best effort, so a
  // notification failure never unwrites the document.
  if (member.email) {
    try {
      await deps.notifier.notify({
        eventKey: `document-ready:${row.id}`,
        eventType: "member_document_ready",
        templateKey: "member_document_ready",
        recipient: member.email,
        memberId: member.id,
        payload: {
          firstName: typeof member.first_name === "string" ? member.first_name : "",
          title: row.title,
        },
      });
    } catch (err) {
      console.error("[documents] ready notification failed:", err instanceof Error ? err.message : err);
    }
  }
  return { ok: true, row };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const acknowledgeSchema = z.object({
  documentId: z.string().min(1).max(100),
  version: z.number().int().min(1),
});

const createSchema = z.object({
  memberId: z.string().min(1).max(100),
  type: z.enum(PLAN_DOCUMENT_TYPES),
  title: z.string().min(1).max(200),
  templateVersion: z.string().min(1).max(50),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(200),
        body: z.string().min(1).max(20000),
      }),
    )
    .min(1)
    .max(50),
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

function sendServiceErr(res: Response, err: ServiceErr) {
  const status =
    err.code === "validation_failed"
      ? 400
      : err.code === "not_found"
        ? 404
        : 409; // state_conflict and capability_disabled
  res.status(status).json({
    ok: false,
    code: err.code,
    ...(err.message ? { message: err.message } : {}),
    ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
  });
}

// One uniform denial for the download door. Every reason (bad signature,
// expired signature, unknown document, another member's document, a signature
// minted for a different member) returns exactly this, so the response
// distinguishes nothing for someone probing with a captured URL.
function denyDownload(res: Response) {
  res.status(403).json({
    ok: false,
    code: "not_found",
    message: "This document link is not valid.",
  });
}

export function registerDocumentsApi(app: Express, deps: MemberPlatformDeps) {
  // The member's own documents, current and archived, newest first. The
  // storage path is not in the serializer, so it cannot appear here.
  app.get("/api/research/documents", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const rows = await fetchMemberDocuments(member.id);
      res.json({ ok: true, documents: rows.map(toPlanDocument) });
    } catch (err) {
      console.error("[documents] list failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The documents could not be loaded." });
    }
  });

  // Mint a short-lived signed grant for the member's own document.
  app.post("/api/research/documents/:documentId/access", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const result = await grantDocumentAccess(member.id, String(req.params.documentId), deps.clock.now());
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, grant: result.grant });
    } catch (err) {
      console.error("[documents] access failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The document could not be opened." });
    }
  });

  // The signed door. requireActiveMember is deliberate and load-bearing: the
  // signature proves the grant was minted by this server, the SESSION proves
  // who is asking, and the stored row proves ownership. A signature alone is
  // never sufficient, so a URL that leaks into a log, a browser history, or a
  // shared screenshot opens nothing on its own.
  app.get("/api/research/documents/:documentId/download", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      if (!documentAccessEnabled()) {
        return res.status(409).json({
          ok: false,
          code: "capability_disabled",
          message: "Private document access is not enabled yet.",
        });
      }

      const documentId = String(req.params.documentId);
      const expRaw = typeof req.query.exp === "string" ? req.query.exp : "";
      const signature = typeof req.query.sig === "string" ? req.query.sig : "";
      if (!expRaw || !signature || !/^\d+$/.test(expRaw)) return denyDownload(res);
      const expiresAtMs = Number(expRaw);
      if (!Number.isSafeInteger(expiresAtMs)) return denyDownload(res);

      // Verified against THIS session's member id: a grant minted for another
      // member does not verify here, even before ownership is read.
      if (!documentGrantSignatureValid(documentId, member.id, expiresAtMs, signature)) {
        return denyDownload(res);
      }
      if (expiresAtMs <= deps.clock.now().getTime()) return denyDownload(res);

      // Ownership re-read at use time, not trusted from the grant: a document
      // that moved or was removed since the grant was minted stops here.
      const row = await fetchMemberDocument(member.id, documentId);
      if (!row) return denyDownload(res);

      const stored = await selectDocumentBytesStore().get(row.storage_path);
      if (!stored) {
        return res.status(404).json({
          ok: false,
          code: "not_found",
          message: "The document file is not available.",
        });
      }

      // The filename carries the opaque document id, never the title.
      res.set("Content-Type", stored.contentType);
      res.set(
        "Content-Disposition",
        `attachment; filename="${row.id}.${extensionFor(stored.contentType)}"`,
      );
      res.send(Buffer.from(stored.bytes));
    } catch (err) {
      if (isNotConfigured(err)) {
        return res.status(409).json({
          ok: false,
          code: "capability_disabled",
          message: "Document storage is not wired yet.",
        });
      }
      console.error("[documents] download failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The document could not be opened." });
    }
  });

  // Member acknowledgment of a current document version.
  app.post("/api/research/documents/:documentId/acknowledge", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      const parsed = acknowledgeSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);

      // The route parameter is authoritative; a body that disagrees is a
      // malformed request, never a silent redirect to a different document.
      const documentId = String(req.params.documentId);
      if (parsed.data.documentId !== documentId) {
        return sendValidation(res, { documentId: ["documentId must match the document in the path"] });
      }

      const result = await acknowledgeDocument(member.id, documentId, parsed.data.version, deps.clock.now());
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, acknowledgedAt: result.acknowledgedAt });
    } catch (err) {
      console.error("[documents] acknowledge failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The document could not be acknowledged." });
    }
  });

  // Admin: render and publish a document for a member.
  app.post("/api/admin/research/documents", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);

      const result = await createPlanDocument(
        {
          memberId: parsed.data.memberId,
          type: parsed.data.type,
          title: parsed.data.title,
          templateVersion: parsed.data.templateVersion,
          sections: parsed.data.sections,
        },
        deps,
      );
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, document: toPlanDocument(result.row) });
    } catch (err) {
      console.error("[documents] admin create failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The document could not be created." });
    }
  });
}
