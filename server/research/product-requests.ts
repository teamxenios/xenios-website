import crypto from "crypto";
import net from "net";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  PRODUCT_REQUEST_CATEGORIES,
  PRODUCT_REQUEST_FILE_TYPES,
  PRODUCT_REQUEST_FREQUENCIES,
  PRODUCT_REQUEST_MAX_FILE_BYTES,
  PRODUCT_REQUEST_PRIORITIES,
  PRODUCT_REQUEST_STATUSES,
  PRODUCT_REQUEST_TIMINGS,
  type AdminProductRequestSummary,
  type MemberProductRequest,
  type MemberProductRequestEvent,
  type MemberProductRequestFile,
  type ProductRequestAnalytics,
  type ProductRequestCategory,
  type ProductRequestStatus,
} from "@shared/research/product-requests";
import { getSupabaseAdmin } from "../supabase";
import { requireSupabaseAdmin } from "../routes";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { enqueueNotification, runOutboxTick } from "./outbox";
import { enqueueProductDiagnosticEmail } from "./products-diagnostics/outbox-adapter";
import { products } from "./products-data";

const REQUESTS = "research_product_requests";
const FILES = "research_product_request_files";
const FILE_CLEANUP = "research_product_request_storage_cleanup";
const EVENTS = "research_product_request_events";
const CANDIDATES = "research_product_demand_candidates";
const MEMBERS = "research_members";
const APPLICATIONS = "research_applications";
const STORAGE_BUCKET = () =>
  process.env.RESEARCH_PRODUCT_REQUESTS_BUCKET?.trim() || "research-product-requests";
// Supabase signed upload grants currently have a provider-defined two-hour
// lifetime. Report that lifetime honestly; the application cannot shorten it.
const UPLOAD_TTL_SECONDS = 2 * 60 * 60;
const READ_TTL_SECONDS = 5 * 60;
const MAX_FILES_PER_REQUEST = 5;
let cleanupTimer: NodeJS.Timeout | null = null;

type RequestRow = {
  id: string;
  reference: string;
  member_id: string;
  idempotency_key: string;
  product_name: string;
  category: ProductRequestCategory;
  description: string;
  brand: string | null;
  product_url: string | null;
  desired_presentation: string | null;
  desired_quantity: string | null;
  expected_purchase_frequency: MemberProductRequest["expectedPurchaseFrequency"];
  interest_timing: MemberProductRequest["interestTiming"];
  additional_notes: string | null;
  contact_consent: boolean;
  status: ProductRequestStatus;
  member_visible_update: string | null;
  assigned_owner: string | null;
  priority: "low" | "normal" | "high";
  internal_notes: string | null;
  quality_review_status: string | null;
  claims_review_status: string | null;
  payment_processor_review_status: string | null;
  legal_review_status: string | null;
  commercial_model_status: string | null;
  candidate_id: string | null;
  linked_product_ref: string | null;
  attribution_source: string | null;
  attribution_code: string | null;
  version: number;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

type FileRow = {
  id: string;
  request_id: string;
  uploader_member_id: string;
  storage_path: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  state: "pending" | "confirmed" | "removed";
  uploaded_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

type EventRow = {
  id: string;
  request_id: string;
  actor_type: "member" | "admin" | "system";
  actor_ref: string | null;
  event_type: string;
  dedupe_key: string;
  previous_status: ProductRequestStatus | null;
  next_status: ProductRequestStatus | null;
  member_visible_message: string | null;
  internal_detail: Record<string, unknown> | null;
  created_at: string;
  [key: string]: unknown;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const adminOptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

export const createProductRequestSchema = z.object({
  productName: z.string().trim().min(2).max(180),
  category: z.enum(PRODUCT_REQUEST_CATEGORIES),
  description: z.string().trim().min(10).max(4000),
  brand: optionalText(180),
  productUrl: optionalText(2048),
  desiredPresentation: optionalText(300),
  desiredQuantity: optionalText(120),
  expectedPurchaseFrequency: z.enum(PRODUCT_REQUEST_FREQUENCIES).optional().nullable(),
  interestTiming: z.enum(PRODUCT_REQUEST_TIMINGS).optional().nullable(),
  additionalNotes: optionalText(3000),
  contactConsent: z.boolean().optional().default(false),
  idempotencyKey: z.string().trim().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/),
});

const fileSchema = z.object({
  originalFilename: z.string().trim().min(1).max(240),
  contentType: z.enum(PRODUCT_REQUEST_FILE_TYPES),
  sizeBytes: z.number().int().positive().max(PRODUCT_REQUEST_MAX_FILE_BYTES),
});

const versionSchema = z.object({ expectedVersion: z.number().int().positive() });

const memberMessageSchema = z.object({
  expectedVersion: z.number().int().positive(),
  message: z.string().trim().min(2).max(3000),
});

const adminUpdateSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: z.enum(PRODUCT_REQUEST_STATUSES).optional(),
    priority: z.enum(PRODUCT_REQUEST_PRIORITIES).optional(),
    assignedOwner: adminOptionalText(180),
    memberVisibleUpdate: adminOptionalText(3000),
    internalNote: adminOptionalText(5000),
    linkedProductRef: adminOptionalText(180),
    candidateId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.priority !== undefined ||
      value.assignedOwner !== undefined ||
      value.memberVisibleUpdate != null ||
      value.internalNote != null ||
      value.linkedProductRef !== undefined ||
      value.candidateId !== undefined,
    { message: "At least one update is required." },
  );

function privacyHeaders(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function memberFrom(req: Request): MemberRow | null {
  return ((req as { researchMember?: MemberRow }).researchMember as MemberRow | undefined) ?? null;
}

function adminFrom(req: Request): string {
  return String((req as { adminEmail?: string }).adminEmail ?? "").toLowerCase();
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

function sendValidation(res: Response, errors: Record<string, string[]>): void {
  res.status(400).json({ ok: false, code: "validation_failed", fieldErrors: errors });
}

export function normalizeDemandName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // Reject every IPv4-mapped IPv6 form. URL parsers may normalize the dotted
  // tail into hexadecimal, and accepting one representation while rejecting
  // another creates an avoidable private-range bypass.
  if (value.startsWith("::ffff:")) return true;
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff") ||
    value.startsWith("2001:db8")
  );
}

/**
 * Validate a reference URL for storage only. The server never fetches,
 * previews, resolves, scrapes, downloads, or executes this URL.
 */
export function validateSubmittedProductUrl(value: string | null | undefined):
  | { ok: true; value: string | null }
  | { ok: false; message: string } {
  if (!value?.trim()) return { ok: true, value: null };
  const raw = value.trim();
  if (raw.length > 2048) return { ok: false, message: "The product URL is too long." };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, message: "Enter a complete HTTPS URL." };
  }
  if (parsed.protocol !== "https:") return { ok: false, message: "Only HTTPS product URLs are accepted." };
  if (parsed.username || parsed.password) {
    return { ok: false, message: "Product URLs cannot contain credentials." };
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { ok: false, message: "Local or private-network URLs are not accepted." };
  }
  const ipVersion = net.isIP(hostname.replace(/^\[|\]$/g, ""));
  if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
    return { ok: false, message: "Local or private-network URLs are not accepted." };
  }
  parsed.hash = "";
  return { ok: true, value: parsed.toString() };
}

function safeFilename(value: string): string {
  const leaf = value.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (leaf || "attachment").slice(0, 180);
}

const EXTENSIONS_BY_MIME: Record<(typeof PRODUCT_REQUEST_FILE_TYPES)[number], readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export function validateProductRequestFilename(
  originalFilename: string,
  contentType: (typeof PRODUCT_REQUEST_FILE_TYPES)[number],
): { ok: true; filename: string } | { ok: false; message: string } {
  const filename = safeFilename(originalFilename);
  const lower = filename.toLowerCase();
  const allowed = EXTENSIONS_BY_MIME[contentType];
  if (!allowed.some((extension) => lower.endsWith(extension))) {
    return { ok: false, message: "The filename extension must match the declared JPEG, PNG, WebP, or PDF type." };
  }
  const withoutAllowedExtension = lower.slice(0, -allowed.find((extension) => lower.endsWith(extension))!.length);
  if (/\.(?:exe|dll|bat|cmd|com|js|mjs|cjs|html?|svg|zip|rar|7z|tar|gz|iso|msi)$/i.test(withoutAllowedExtension)) {
    return { ok: false, message: "Executable, script, HTML, SVG, and archive files are not accepted." };
  }
  return { ok: true, filename };
}

export function fileSignatureMatches(contentType: string, bytes: Uint8Array): boolean {
  const ascii = (start: number, end: number) =>
    Array.from(bytes.slice(start, end), (value) => String.fromCharCode(value)).join("");
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= png.length && png.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      ascii(0, 4) === "RIFF" &&
      ascii(8, 12) === "WEBP"
    );
  }
  if (contentType === "application/pdf") {
    return bytes.length >= 5 && ascii(0, 5) === "%PDF-";
  }
  return false;
}

function reference(): string {
  return `XRP-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function requestId(): string {
  return crypto.randomUUID();
}

function fileId(): string {
  return crypto.randomUUID();
}

function safeStoragePath(memberId: string, request: string, file: string): string {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  const memberPartition = crypto.createHash("sha256").update(memberId).digest("hex").slice(0, 24);
  return `requests/${memberPartition}/${clean(request)}/${clean(file)}-${crypto
    .randomBytes(8)
    .toString("hex")}`;
}

function memberFile(row: FileRow): MemberProductRequestFile {
  return {
    fileId: row.id,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    state: row.state,
    uploadedAt: row.uploaded_at,
  };
}

const MEMBER_EVENT_TYPES = new Set([
  "submitted",
  "attachment_added",
  "attachment_removed",
  "member_message_added",
  "member_withdrawn",
  "status_changed",
  "member_update_added",
]);

function memberEvent(row: EventRow): MemberProductRequestEvent | null {
  if (!MEMBER_EVENT_TYPES.has(row.event_type)) return null;
  if (row.event_type === "member_update_added" && !row.member_visible_message) {
    return null;
  }
  return {
    eventType: row.event_type as MemberProductRequestEvent["eventType"],
    createdAt: row.created_at,
    memberVisibleMessage: row.member_visible_message,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
  };
}

export function toMemberProductRequest(
  row: RequestRow,
  files: FileRow[] = [],
  events: EventRow[] = [],
): MemberProductRequest {
  return {
    reference: row.reference,
    productName: row.product_name,
    category: row.category,
    description: row.description,
    brand: row.brand,
    productUrl: row.product_url,
    desiredPresentation: row.desired_presentation,
    desiredQuantity: row.desired_quantity,
    expectedPurchaseFrequency: row.expected_purchase_frequency,
    interestTiming: row.interest_timing,
    additionalNotes: row.additional_notes,
    contactConsent: row.contact_consent,
    status: row.status,
    memberVisibleUpdate: row.member_visible_update,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    withdrawnAt: row.withdrawn_at,
    version: row.version,
    files: files.filter((file) => file.state !== "removed").map(memberFile),
    events: events
      .map(memberEvent)
      .filter((event): event is MemberProductRequestEvent => event !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function isProductRequestAdmin(email: string): boolean {
  const configured = process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS?.trim();
  if (!configured) return false;
  const allowed = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowed.includes(email.trim().toLowerCase()));
}

export function requireProductRequestAdmin(req: Request, res: Response, next: NextFunction): void {
  void requireSupabaseAdmin(req, res, () => {
    if (!process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS?.trim()) {
      res.status(503).json({
        ok: false,
        code: "product_request_permission_not_configured",
        message: "Product-request review permission is not configured.",
      });
      return;
    }
    if (!isProductRequestAdmin(adminFrom(req))) {
      res.status(403).json({
        ok: false,
        code: "product_request_permission_required",
        message: "Product-request review permission is required.",
      });
      return;
    }
    next();
  });
}

async function fetchAllRows<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await getSupabaseAdmin()
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (Array.isArray(data) ? data : []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function fetchMemberRequest(memberId: string, ref: string): Promise<RequestRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(REQUESTS)
    .select("*")
    .eq("member_id", memberId)
    .eq("reference", ref)
    .maybeSingle();
  if (error) return null;
  return (data as RequestRow | null) ?? null;
}

async function fetchAdminRequest(id: string): Promise<RequestRow | null> {
  const { data, error } = await getSupabaseAdmin().from(REQUESTS).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return (data as RequestRow | null) ?? null;
}

async function fetchFiles(requestIds: string[]): Promise<FileRow[]> {
  if (requestIds.length === 0) return [];
  const { data, error } = await getSupabaseAdmin().from(FILES).select("*").in("request_id", requestIds);
  return error || !Array.isArray(data) ? [] : (data as FileRow[]);
}

async function fetchEvents(requestIds: string[]): Promise<EventRow[]> {
  if (requestIds.length === 0) return [];
  const { data, error } = await getSupabaseAdmin().from(EVENTS).select("*").in("request_id", requestIds);
  return error || !Array.isArray(data) ? [] : (data as EventRow[]);
}

async function fetchMemberAttribution(member: MemberRow): Promise<{ source: string | null; code: string | null }> {
  if (!member.application_id) return { source: null, code: null };
  const { data, error } = await getSupabaseAdmin()
    .from(APPLICATIONS)
    .select("referral_source,referral_code")
    .eq("id", member.application_id)
    .maybeSingle();
  if (error || !data) return { source: null, code: null };
  const row = data as { referral_source?: unknown; referral_code?: unknown };
  return {
    source: typeof row.referral_source === "string" ? row.referral_source.slice(0, 200) : null,
    code: typeof row.referral_code === "string" ? row.referral_code.slice(0, 200) : null,
  };
}

async function queueMemberNotification(input: {
  eventKey: string;
  eventType: string;
  templateKey: "member_product_request_received" | "member_product_request_updated";
  member: MemberRow;
  request: RequestRow;
}): Promise<void> {
  const queued = await enqueueProductDiagnosticEmail({
    eventKey: input.eventKey,
    eventType:
      input.templateKey === "member_product_request_received"
        ? "product_request_confirmation"
        : "product_request_update",
    recipient: input.member.email,
    payload: {
      firstName: input.member.first_name,
      requestReference: input.request.reference,
      memberAreaUrl:
        "https://xeniostechnology.com/research/member/product-requests",
    },
  });
  if (queued) void runOutboxTick().catch(() => undefined);
}

function groupByRequest<T extends { request_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) grouped.set(row.request_id, [...(grouped.get(row.request_id) ?? []), row]);
  return grouped;
}

async function insertEvent(input: {
  requestId: string;
  actorType: "member" | "admin" | "system";
  actorRef: string | null;
  eventType: string;
  dedupeKey: string;
  memberVisibleMessage?: string | null;
  internalDetail?: Record<string, unknown>;
  now: string;
}): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from(EVENTS).insert({
    request_id: input.requestId,
    actor_type: input.actorType,
    actor_ref: input.actorRef,
    event_type: input.eventType,
    dedupe_key: input.dedupeKey,
    member_visible_message: input.memberVisibleMessage ?? null,
    internal_detail: input.internalDetail ?? {},
    created_at: input.now,
  });
  if (!error) return true;
  return String(error.message ?? "").toLowerCase().includes("duplicate");
}

async function attemptFileCleanup(input: {
  fileId: string;
  storagePath: string;
  attempts?: number;
}): Promise<boolean> {
  const attemptedAt = new Date().toISOString();
  await getSupabaseAdmin()
    .from(FILE_CLEANUP)
    .update({
      attempts: Number(input.attempts ?? 0) + 1,
      last_attempt_at: attemptedAt,
      updated_at: attemptedAt,
    })
    .eq("file_id", input.fileId)
    .eq("status", "pending");
  const { error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET()).remove([input.storagePath]);
  if (error) return false;
  const { error: updateError } = await getSupabaseAdmin()
    .from(FILE_CLEANUP)
    .update({ status: "deleted", deleted_at: attemptedAt, updated_at: attemptedAt })
    .eq("file_id", input.fileId)
    .eq("status", "pending");
  return !updateError;
}

export async function runProductRequestStorageCleanupTick(limit = 20): Promise<number> {
  const { error: sweepError } = await getSupabaseAdmin().rpc(
    "research_queue_abandoned_product_request_files",
    { p_now: new Date().toISOString() },
  );
  if (sweepError) return 0;
  const { data, error } = await getSupabaseAdmin()
    .from(FILE_CLEANUP)
    .select("file_id,storage_path,attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !Array.isArray(data)) return 0;
  let deleted = 0;
  for (const row of data) {
    if (
      await attemptFileCleanup({
        fileId: String(row.file_id),
        storagePath: String(row.storage_path),
        attempts: Number(row.attempts ?? 0),
      })
    ) {
      deleted += 1;
    }
  }
  return deleted;
}

function ensureStorageCleanupWorker(): void {
  if (cleanupTimer || process.env.NODE_ENV === "test") return;
  void runProductRequestStorageCleanupTick().catch(() => undefined);
  cleanupTimer = setInterval(() => {
    void runProductRequestStorageCleanupTick().catch(() => undefined);
  }, 15 * 60 * 1000);
  cleanupTimer.unref?.();
}

function statusLabel(status: ProductRequestStatus): string {
  return status.replace(/_/g, " ");
}

function toAdminProductRequest(row: RequestRow) {
  return {
    id: row.id,
    reference: row.reference,
    product_name: row.product_name,
    category: row.category,
    description: row.description,
    brand: row.brand,
    product_url: row.product_url,
    desired_presentation: row.desired_presentation,
    desired_quantity: row.desired_quantity,
    expected_purchase_frequency: row.expected_purchase_frequency,
    interest_timing: row.interest_timing,
    additional_notes: row.additional_notes,
    contact_consent: row.contact_consent,
    status: row.status,
    member_visible_update: row.member_visible_update,
    assigned_owner: row.assigned_owner,
    priority: row.priority,
    internal_notes: row.internal_notes,
    quality_review_status: row.quality_review_status,
    claims_review_status: row.claims_review_status,
    payment_processor_review_status: row.payment_processor_review_status,
    legal_review_status: row.legal_review_status,
    commercial_model_status: row.commercial_model_status,
    candidate_id: row.candidate_id,
    linked_product_ref: row.linked_product_ref,
    attribution_source: row.attribution_source,
    attribution_code: row.attribution_code,
    version: row.version,
    withdrawn_at: row.withdrawn_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function registerProductRequestApi(app: Express): void {
  ensureStorageCleanupWorker();
  app.get("/api/research/member/product-requests", requireActiveMember, async (req, res) => {
    privacyHeaders(res);
    const member = memberFrom(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    try {
      const { data, error } = await getSupabaseAdmin()
        .from(REQUESTS)
        .select("*")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as RequestRow[];
      const ids = rows.map((row) => row.id);
      const [files, events] = await Promise.all([fetchFiles(ids), fetchEvents(ids)]);
      const filesByRequest = groupByRequest(files);
      const eventsByRequest = groupByRequest(events);
      return res.json({
        ok: true,
        requests: rows.map((row) =>
          toMemberProductRequest(row, filesByRequest.get(row.id), eventsByRequest.get(row.id)),
        ),
      });
    } catch (error) {
      console.error("[product requests] member list failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ ok: false, message: "Your product requests could not be loaded." });
    }
  });

  app.get("/api/research/member/product-requests/:reference", requireActiveMember, async (req, res) => {
    privacyHeaders(res);
    const member = memberFrom(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    const row = await fetchMemberRequest(member.id, String(req.params.reference));
    if (!row) return res.status(404).json({ ok: false, code: "not_found", message: "Request not found." });
    const [files, events] = await Promise.all([fetchFiles([row.id]), fetchEvents([row.id])]);
    return res.json({ ok: true, request: toMemberProductRequest(row, files, events) });
  });

  app.post("/api/research/member/product-requests", requireActiveMember, async (req, res) => {
    privacyHeaders(res);
    const member = memberFrom(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    const parsed = createProductRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidation(res, fieldErrors(parsed.error));
    const checkedUrl = validateSubmittedProductUrl(parsed.data.productUrl);
    if (!checkedUrl.ok) return sendValidation(res, { productUrl: [checkedUrl.message] });
    const normalizedName = normalizeDemandName(parsed.data.productName);
    if (!normalizedName) return sendValidation(res, { productName: ["Enter a recognizable product name."] });
    try {
      const now = new Date().toISOString();
      const attribution = await fetchMemberAttribution(member);
      const normalizedBrand = parsed.data.brand ? normalizeDemandName(parsed.data.brand) || null : null;
      const linkDomain = checkedUrl.value ? new URL(checkedUrl.value).hostname.toLowerCase() : null;
      const { data, error } = await getSupabaseAdmin().rpc("research_create_product_request", {
        p_request_id: requestId(),
        p_reference: reference(),
        p_member_id: member.id,
        p_idempotency_key: parsed.data.idempotencyKey,
        p_product_name: parsed.data.productName,
        p_normalized_name: normalizedName,
        p_normalized_brand: normalizedBrand,
        p_link_domain: linkDomain,
        p_category: parsed.data.category,
        p_description: parsed.data.description,
        p_brand: parsed.data.brand,
        p_product_url: checkedUrl.value,
        p_desired_presentation: parsed.data.desiredPresentation,
        p_desired_quantity: parsed.data.desiredQuantity,
        p_expected_purchase_frequency: parsed.data.expectedPurchaseFrequency ?? null,
        p_interest_timing: parsed.data.interestTiming ?? null,
        p_additional_notes: parsed.data.additionalNotes,
        p_contact_consent: parsed.data.contactConsent,
        p_attribution_source: attribution.source,
        p_attribution_code: attribution.code,
        p_member_email: member.email,
        p_member_first_name: member.first_name,
        p_now: now,
      });
      if (error || !data) throw error ?? new Error("request insert returned no row");
      const row = (Array.isArray(data) ? data[0] : data) as RequestRow;
      await queueMemberNotification({
        eventKey: `product-request-received:${row.id}`,
        eventType: "product_request_received",
        templateKey: "member_product_request_received",
        member,
        request: row,
      });
      return res.status(201).json({ ok: true, request: toMemberProductRequest(row) });
    } catch (error) {
      console.error("[product requests] create failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ ok: false, message: "The request could not be saved." });
    }
  });

  app.post("/api/research/member/product-requests/:reference/withdraw", requireActiveMember, async (req, res) => {
    privacyHeaders(res);
    const member = memberFrom(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    const parsed = versionSchema.safeParse(req.body);
    if (!parsed.success) return sendValidation(res, fieldErrors(parsed.error));
    const row = await fetchMemberRequest(member.id, String(req.params.reference));
    if (!row) return res.status(404).json({ ok: false, code: "not_found", message: "Request not found." });
    const { data, error } = await getSupabaseAdmin().rpc("research_withdraw_product_request", {
      p_request_id: row.id,
      p_member_id: member.id,
      p_expected_version: parsed.data.expectedVersion,
      p_now: new Date().toISOString(),
    });
    if (error || !data) {
      const conflict = String(error?.message ?? "").includes("state_conflict");
      return res.status(conflict ? 409 : 500).json({
        ok: false,
        code: conflict ? "state_conflict" : "storage_error",
        message: conflict ? "This request changed. Reload before withdrawing it." : "The request could not be withdrawn.",
      });
    }
    const updated = (Array.isArray(data) ? data[0] : data) as RequestRow;
    return res.json({ ok: true, request: toMemberProductRequest(updated) });
  });

  app.post("/api/research/member/product-requests/:reference/messages", requireActiveMember, async (req, res) => {
    privacyHeaders(res);
    const member = memberFrom(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    const parsed = memberMessageSchema.safeParse(req.body);
    if (!parsed.success) return sendValidation(res, fieldErrors(parsed.error));
    const row = await fetchMemberRequest(member.id, String(req.params.reference));
    if (!row) return res.status(404).json({ ok: false, code: "not_found", message: "Request not found." });
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin().rpc("research_add_product_request_message", {
      p_request_id: row.id,
      p_member_id: member.id,
      p_expected_version: parsed.data.expectedVersion,
      p_message: parsed.data.message,
      p_now: now,
    });
    if (error || !data) {
      return res.status(409).json({ ok: false, code: "state_conflict", message: "Reload this request before replying." });
    }
    const updated = (Array.isArray(data) ? data[0] : data) as RequestRow;
    return res.json({ ok: true, request: toMemberProductRequest(updated) });
  });

  app.post("/api/research/member/product-requests/:reference/files/upload", requireActiveMember, async (req, res) => {
    privacyHeaders(res);
    const member = memberFrom(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    const parsed = fileSchema.safeParse(req.body);
    if (!parsed.success) return sendValidation(res, fieldErrors(parsed.error));
    const checkedFilename = validateProductRequestFilename(
      parsed.data.originalFilename,
      parsed.data.contentType,
    );
    if (!checkedFilename.ok) {
      return sendValidation(res, { originalFilename: [checkedFilename.message] });
    }
    const row = await fetchMemberRequest(member.id, String(req.params.reference));
    if (!row) return res.status(404).json({ ok: false, code: "not_found", message: "Request not found." });
    if (row.status === "withdrawn" || row.status === "closed") {
      return res.status(409).json({ ok: false, code: "state_conflict", message: "This request no longer accepts files." });
    }
    const id = fileId();
    const storagePath = safeStoragePath(member.id, row.reference, id);
    const now = new Date();
    try {
      const { data: file, error: fileError } = await getSupabaseAdmin().rpc(
        "research_reserve_product_request_file",
        {
          p_file_id: id,
          p_request_id: row.id,
          p_member_id: member.id,
          p_storage_path: storagePath,
          p_original_filename: checkedFilename.filename,
          p_content_type: parsed.data.contentType,
          p_size_bytes: parsed.data.sizeBytes,
          p_now: now.toISOString(),
        },
      );
      if (fileError || !file) throw fileError ?? new Error("file reservation missing");
      const fileRow = (Array.isArray(file) ? file[0] : file) as FileRow;
      const { data: signed, error: signError } = await getSupabaseAdmin()
        .storage.from(STORAGE_BUCKET())
        .createSignedUploadUrl(storagePath);
      if (signError || !signed) {
        await getSupabaseAdmin().rpc("research_remove_product_request_file", {
          p_file_id: fileRow.id,
          p_request_id: row.id,
          p_member_id: member.id,
          p_now: new Date().toISOString(),
        });
        throw signError ?? new Error("signed upload URL missing");
      }
      return res.status(201).json({
        ok: true,
        file: memberFile(fileRow),
        grant: {
          uploadUrl: signed.signedUrl,
          expiresAt: new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
          maxBytes: PRODUCT_REQUEST_MAX_FILE_BYTES,
        },
      });
    } catch (error) {
      const code = String(
        (error as { message?: unknown } | null)?.message ?? error ?? "",
      );
      if (code.includes("attachment_limit")) {
        return res.status(429).json({
          ok: false,
          code: "attachment_limit",
          message: `A request can include up to ${MAX_FILES_PER_REQUEST} attachments.`,
        });
      }
      if (code.includes("upload_rate_limited")) {
        return res.status(429).json({
          ok: false,
          code: "upload_rate_limited",
          message: "Too many upload grants were requested. Try again later.",
        });
      }
      console.error("[product requests] upload grant failed:", error instanceof Error ? error.message : error);
      return res.status(503).json({ ok: false, message: "Private file upload is not available." });
    }
  });

  app.post(
    "/api/research/member/product-requests/:reference/files/:fileId/confirm",
    requireActiveMember,
    async (req, res) => {
      privacyHeaders(res);
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const row = await fetchMemberRequest(member.id, String(req.params.reference));
      if (!row) return res.status(404).json({ ok: false, code: "not_found", message: "Request not found." });
      const { data: fileData, error: fileFetchError } = await getSupabaseAdmin()
        .from(FILES)
        .select("*")
        .eq("id", String(req.params.fileId))
        .eq("request_id", row.id)
        .eq("uploader_member_id", member.id)
        .maybeSingle();
      if (fileFetchError || !fileData) {
        return res.status(404).json({ ok: false, code: "not_found", message: "File not found." });
      }
      const file = fileData as FileRow;
      if (file.state === "confirmed") return res.json({ ok: true, file: memberFile(file) });
      try {
        const storage = getSupabaseAdmin().storage.from(STORAGE_BUCKET());
        const [{ data: info, error: infoError }, { data: content, error: downloadError }] =
          await Promise.all([storage.info(file.storage_path), storage.download(file.storage_path)]);
        const actualSize = Number((info as { size?: unknown } | null)?.size ?? 0);
        const actualType = String((info as { contentType?: unknown } | null)?.contentType ?? file.content_type);
        if (
          infoError ||
          downloadError ||
          !info ||
          !content ||
          actualSize <= 0 ||
          actualSize > PRODUCT_REQUEST_MAX_FILE_BYTES
        ) {
          const rejectedAt = new Date().toISOString();
          await getSupabaseAdmin().rpc("research_remove_product_request_file", {
            p_file_id: file.id,
            p_request_id: row.id,
            p_member_id: member.id,
            p_now: rejectedAt,
          });
          void runProductRequestStorageCleanupTick().catch(() => undefined);
          return res.status(400).json({ ok: false, code: "invalid_upload", message: "The uploaded file could not be verified." });
        }
        const contentBytes = new Uint8Array(await content.arrayBuffer());
        if (
          actualSize !== file.size_bytes ||
          actualType !== file.content_type ||
          contentBytes.byteLength !== actualSize ||
          !fileSignatureMatches(file.content_type, contentBytes)
        ) {
          const rejectedAt = new Date().toISOString();
          await getSupabaseAdmin().rpc("research_remove_product_request_file", {
            p_file_id: file.id,
            p_request_id: row.id,
            p_member_id: member.id,
            p_now: rejectedAt,
          });
          void runProductRequestStorageCleanupTick().catch(() => undefined);
          return res.status(400).json({ ok: false, code: "invalid_upload", message: "The uploaded file did not match its declaration." });
        }
        const now = new Date().toISOString();
        const { data: confirmed, error } = await getSupabaseAdmin().rpc(
          "research_confirm_product_request_file",
          {
            p_file_id: file.id,
            p_request_id: row.id,
            p_member_id: member.id,
            p_now: now,
          },
        );
        if (error || !confirmed) return res.status(409).json({ ok: false, code: "state_conflict" });
        const confirmedRow = (Array.isArray(confirmed) ? confirmed[0] : confirmed) as FileRow;
        return res.json({ ok: true, file: memberFile(confirmedRow) });
      } catch (error) {
        console.error("[product requests] upload confirm failed:", error instanceof Error ? error.message : error);
        return res.status(500).json({ ok: false, message: "The uploaded file could not be confirmed." });
      }
    },
  );

  app.get(
    "/api/research/member/product-requests/:reference/files/:fileId/access",
    requireActiveMember,
    async (req, res) => {
      privacyHeaders(res);
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const row = await fetchMemberRequest(member.id, String(req.params.reference));
      if (!row) return res.status(404).json({ ok: false, code: "not_found" });
      const { data } = await getSupabaseAdmin()
        .from(FILES)
        .select("*")
        .eq("id", String(req.params.fileId))
        .eq("request_id", row.id)
        .eq("uploader_member_id", member.id)
        .eq("state", "confirmed")
        .maybeSingle();
      if (!data) return res.status(404).json({ ok: false, code: "not_found" });
      const file = data as FileRow;
      const audited = await insertEvent({
        requestId: row.id,
        actorType: "member",
        actorRef: member.id,
        eventType: "attachment_accessed",
        dedupeKey: `member-attachment-accessed:${file.id}:${crypto.randomUUID()}`,
        internalDetail: { fileId: file.id },
        now: new Date().toISOString(),
      });
      if (!audited) return res.status(503).json({ ok: false, message: "The file access could not be audited." });
      const { data: signed, error } = await getSupabaseAdmin()
        .storage.from(STORAGE_BUCKET())
        .createSignedUrl(file.storage_path, READ_TTL_SECONDS);
      if (error || !signed) return res.status(503).json({ ok: false, message: "The file is not available." });
      return res.json({
        ok: true,
        signedUrl: signed.signedUrl,
        expiresAt: new Date(Date.now() + READ_TTL_SECONDS * 1000).toISOString(),
      });
    },
  );

  app.delete(
    "/api/research/member/product-requests/:reference/files/:fileId",
    requireActiveMember,
    async (req, res) => {
      privacyHeaders(res);
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const row = await fetchMemberRequest(member.id, String(req.params.reference));
      if (!row) return res.status(404).json({ ok: false, code: "not_found" });
      const { data } = await getSupabaseAdmin()
        .from(FILES)
        .select("*")
        .eq("id", String(req.params.fileId))
        .eq("request_id", row.id)
        .eq("uploader_member_id", member.id)
        .maybeSingle();
      if (!data) return res.status(404).json({ ok: false, code: "not_found" });
      const file = data as FileRow;
      if (file.state === "removed") {
        void runProductRequestStorageCleanupTick().catch(() => undefined);
        return res.json({ ok: true, cleanupPending: true });
      }
      const now = new Date().toISOString();
      const { data: removed, error: removeError } = await getSupabaseAdmin().rpc(
        "research_remove_product_request_file",
        {
          p_file_id: file.id,
          p_request_id: row.id,
          p_member_id: member.id,
          p_now: now,
        },
      );
      if (removeError || !removed) {
        return res.status(409).json({ ok: false, code: "state_conflict", message: "The file could not be removed." });
      }
      const cleaned = await attemptFileCleanup({ fileId: file.id, storagePath: file.storage_path });
      if (!cleaned) console.error("[product requests] private object cleanup queued for retry");
      return res.json({
        ok: true,
        cleanupPending: !cleaned,
      });
    },
  );

  app.get("/api/admin/research/product-requests", requireProductRequestAdmin, async (req, res) => {
    privacyHeaders(res);
    try {
      const allRows = await fetchAllRows<RequestRow>(REQUESTS, "*");
      let rows = allRows;
      const status = String(req.query.status ?? "");
      const category = String(req.query.category ?? "");
      const priority = String(req.query.priority ?? "");
      const owner = String(req.query.owner ?? "").toLowerCase();
      const search = String(req.query.search ?? "").trim().toLowerCase();
      if (PRODUCT_REQUEST_STATUSES.includes(status as ProductRequestStatus)) rows = rows.filter((r) => r.status === status);
      if (PRODUCT_REQUEST_CATEGORIES.includes(category as ProductRequestCategory)) rows = rows.filter((r) => r.category === category);
      if (PRODUCT_REQUEST_PRIORITIES.includes(priority as RequestRow["priority"])) rows = rows.filter((r) => r.priority === priority);
      if (owner) rows = rows.filter((r) => (r.assigned_owner ?? "").toLowerCase().includes(owner));
      if (search) {
        const normalizedSearch = normalizeDemandName(search);
        rows = rows.filter((r) =>
          [r.reference, r.product_name, r.brand ?? "", r.description].some(
            (value) =>
              value.toLowerCase().includes(search) ||
              (normalizedSearch.length > 0 && normalizeDemandName(value).includes(normalizedSearch)),
          ),
        );
      }
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const members = await fetchAllRows<{ id: string; email: string }>(MEMBERS, "id,email");
      const emails = new Map(
        members.map((member) => [member.id, member.email]),
      );
      const demand = new Map<string, Set<string>>();
      for (const entry of allRows) {
        const candidateId = String((entry as { candidate_id?: unknown }).candidate_id ?? "");
        const memberId = String((entry as { member_id?: unknown }).member_id ?? "");
        if (candidateId && memberId) demand.set(candidateId, (demand.get(candidateId) ?? new Set()).add(memberId));
      }
      const summaries: AdminProductRequestSummary[] = rows.map((row) => ({
        requestId: row.id,
        reference: row.reference,
        productName: row.product_name,
        category: row.category,
        status: row.status,
        priority: row.priority,
        assignedOwner: row.assigned_owner,
        memberEmail: emails.get(row.member_id) ?? "",
        desiredQuantity: row.desired_quantity,
        expectedPurchaseFrequency: row.expected_purchase_frequency,
        interestTiming: row.interest_timing,
        candidateId: row.candidate_id,
        uniqueMemberDemand: row.candidate_id ? demand.get(row.candidate_id)?.size ?? 0 : 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        version: row.version,
      }));
      return res.json({ ok: true, requests: summaries });
    } catch (error) {
      console.error("[product requests] admin queue failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ ok: false, message: "The product-request queue could not be loaded." });
    }
  });

  app.get("/api/admin/research/product-requests/analytics", requireProductRequestAdmin, async (_req, res) => {
    privacyHeaders(res);
    try {
      const [requests, candidates] = await Promise.all([
        fetchAllRows<{
          id: string;
          member_id: string;
          status: ProductRequestStatus;
          category: ProductRequestCategory;
          candidate_id: string | null;
          brand: string | null;
          expected_purchase_frequency: MemberProductRequest["expectedPurchaseFrequency"];
          interest_timing: MemberProductRequest["interestTiming"];
          attribution_source: string | null;
          created_at: string;
        }>(
          REQUESTS,
          "id,member_id,status,category,candidate_id,brand,expected_purchase_frequency,interest_timing,attribution_source,created_at",
        ),
        fetchAllRows<{ id: string; normalized_name: string; category: ProductRequestCategory }>(
          CANDIDATES,
          "id,normalized_name,category",
        ),
      ]);
      const rows = requests;
      const statusCounts = new Map<ProductRequestStatus, number>();
      const categoryCounts = new Map<ProductRequestCategory, number>();
      const brandCounts = new Map<string, number>();
      const frequencyCounts = new Map<string, number>();
      const timingCounts = new Map<string, number>();
      const attributionCounts = new Map<string, number>();
      const candidateDemand = new Map<
        string,
        {
          requests: number;
          members: Set<string>;
          firstRequestedAt: string;
          latestRequestedAt: string;
          frequencies: Map<string, number>;
          timings: Map<string, number>;
        }
      >();
      const increment = (map: Map<string, number>, key: string) =>
        map.set(key, (map.get(key) ?? 0) + 1);
      for (const row of rows) {
        statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
        categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
        increment(brandCounts, row.brand?.trim() || "Not provided");
        increment(frequencyCounts, row.expected_purchase_frequency ?? "not_provided");
        increment(timingCounts, row.interest_timing ?? "not_provided");
        increment(attributionCounts, row.attribution_source?.trim() || "Direct or not recorded");
        if (row.candidate_id) {
          const current = candidateDemand.get(row.candidate_id) ?? {
            requests: 0,
            members: new Set<string>(),
            firstRequestedAt: row.created_at,
            latestRequestedAt: row.created_at,
            frequencies: new Map<string, number>(),
            timings: new Map<string, number>(),
          };
          current.requests += 1;
          current.members.add(row.member_id);
          current.firstRequestedAt =
            row.created_at < current.firstRequestedAt ? row.created_at : current.firstRequestedAt;
          current.latestRequestedAt =
            row.created_at > current.latestRequestedAt ? row.created_at : current.latestRequestedAt;
          increment(current.frequencies, row.expected_purchase_frequency ?? "not_provided");
          increment(current.timings, row.interest_timing ?? "not_provided");
          candidateDemand.set(row.candidate_id, current);
        }
      }
      const candidateMap = new Map(
        candidates.map((candidate) => [
          String((candidate as { id: unknown }).id),
          candidate as { id: string; normalized_name: string; category: ProductRequestCategory },
        ]),
      );
      const closed = new Set<ProductRequestStatus>(["closed", "withdrawn", "not_moving_forward", "added_to_catalog"]);
      const analytics: ProductRequestAnalytics = {
        total: rows.length,
        uniqueRequesters: new Set(rows.map((row) => row.member_id)).size,
        open: rows.filter((row) => !closed.has(row.status)).length,
        demandCandidates: candidateDemand.size,
        catalogAdditionRate:
          rows.length === 0
            ? 0
            : rows.filter((row) => row.status === "added_to_catalog").length / rows.length,
        byStatus: Array.from(statusCounts).map(([status, count]) => ({ status, count })),
        byCategory: Array.from(categoryCounts).map(([category, count]) => ({ category, count })),
        byBrand: Array.from(brandCounts)
          .map(([brand, count]) => ({ brand, count }))
          .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand)),
        byFrequency: Array.from(frequencyCounts).map(([frequency, count]) => ({
          frequency: frequency as ProductRequestAnalytics["byFrequency"][number]["frequency"],
          count,
        })),
        byTiming: Array.from(timingCounts).map(([timing, count]) => ({
          timing: timing as ProductRequestAnalytics["byTiming"][number]["timing"],
          count,
        })),
        byAttributionSource: Array.from(attributionCounts)
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
        topDemand: Array.from(candidateDemand)
          .map(([candidateId, value]) => {
            const candidate = candidateMap.get(candidateId);
            return candidate
              ? {
                  candidateId,
                  normalizedName: candidate.normalized_name,
                  category: candidate.category,
                  requestCount: value.requests,
                  uniqueMemberCount: value.members.size,
                  firstRequestedAt: value.firstRequestedAt,
                  latestRequestedAt: value.latestRequestedAt,
                  frequencyDistribution: Array.from(value.frequencies).map(([frequency, count]) => ({
                    frequency:
                      frequency as ProductRequestAnalytics["topDemand"][number]["frequencyDistribution"][number]["frequency"],
                    count,
                  })),
                  timingDistribution: Array.from(value.timings).map(([timing, count]) => ({
                    timing:
                      timing as ProductRequestAnalytics["topDemand"][number]["timingDistribution"][number]["timing"],
                    count,
                  })),
                }
              : null;
          })
          .filter((value): value is ProductRequestAnalytics["topDemand"][number] => value !== null)
          .sort((a, b) => b.uniqueMemberCount - a.uniqueMemberCount || b.requestCount - a.requestCount)
          .slice(0, 20),
      };
      return res.json({ ok: true, analytics });
    } catch (error) {
      console.error("[product requests] analytics failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ ok: false, message: "Product-request analytics could not be loaded." });
    }
  });

  app.get("/api/admin/research/product-requests/:requestId", requireProductRequestAdmin, async (req, res) => {
    privacyHeaders(res);
    const row = await fetchAdminRequest(String(req.params.requestId));
    if (!row) return res.status(404).json({ ok: false, code: "not_found" });
    const opened = await insertEvent({
      requestId: row.id,
      actorType: "admin",
      actorRef: adminFrom(req),
      eventType: "administrator_opened",
      dedupeKey: `administrator-opened:${crypto.randomUUID()}`,
      now: new Date().toISOString(),
    });
    if (!opened) return res.status(503).json({ ok: false, message: "The request access could not be audited." });
    const [{ data: member }, files, events] = await Promise.all([
      getSupabaseAdmin().from(MEMBERS).select("email,first_name").eq("id", row.member_id).maybeSingle(),
      fetchFiles([row.id]),
      fetchEvents([row.id]),
    ]);
    return res.json({
      ok: true,
      request: {
        ...toAdminProductRequest(row),
        member_email: String((member as { email?: unknown } | null)?.email ?? ""),
        member_first_name: String((member as { first_name?: unknown } | null)?.first_name ?? ""),
        files: files.map((file) => ({
          fileId: file.id,
          originalFilename: file.original_filename,
          contentType: file.content_type,
          sizeBytes: file.size_bytes,
          state: file.state,
          uploadedAt: file.uploaded_at,
        })),
        events: events
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((event) => ({
            eventType: event.event_type,
            actorType: event.actor_type,
            previousStatus: event.previous_status,
            nextStatus: event.next_status,
            memberVisibleMessage: event.member_visible_message,
            internalDetail: event.internal_detail,
            createdAt: event.created_at,
          })),
      },
    });
  });

  app.patch("/api/admin/research/product-requests/:requestId", requireProductRequestAdmin, async (req, res) => {
    privacyHeaders(res);
    const parsed = adminUpdateSchema.safeParse(req.body);
    if (!parsed.success) return sendValidation(res, fieldErrors(parsed.error));
    const before = await fetchAdminRequest(String(req.params.requestId));
    if (!before) return res.status(404).json({ ok: false, code: "not_found" });
    const previousStatus = before.status;
    const requestedProductRef =
      parsed.data.linkedProductRef === undefined ? before.linked_product_ref : parsed.data.linkedProductRef;
    if (
      requestedProductRef &&
      !products.some((product) => product.slug === requestedProductRef)
    ) {
      return sendValidation(res, {
        linkedProductRef: ["Link only an existing server-catalog product slug."],
      });
    }
    if (parsed.data.status === "added_to_catalog" && !requestedProductRef) {
      return sendValidation(res, {
        linkedProductRef: ["An existing catalog product must be linked before using this status."],
      });
    }
    const requestedCandidateId =
      parsed.data.candidateId === undefined ? before.candidate_id : parsed.data.candidateId;
    if (requestedCandidateId) {
      const { data: candidate, error: candidateError } = await getSupabaseAdmin()
        .from(CANDIDATES)
        .select("id")
        .eq("id", requestedCandidateId)
        .maybeSingle();
      if (candidateError || !candidate) {
        return sendValidation(res, { candidateId: ["Link only an existing demand candidate ID."] });
      }
    }
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin().rpc("research_admin_update_product_request", {
      p_request_id: before.id,
      p_expected_version: parsed.data.expectedVersion,
      p_admin_ref: adminFrom(req),
      p_status: parsed.data.status ?? null,
      p_priority: parsed.data.priority ?? null,
      p_assigned_owner:
        parsed.data.assignedOwner === undefined ? before.assigned_owner : parsed.data.assignedOwner,
      p_member_visible_update: parsed.data.memberVisibleUpdate,
      p_internal_note: parsed.data.internalNote,
      p_linked_product_ref: requestedProductRef,
      p_candidate_id: requestedCandidateId,
      p_now: now,
    });
    if (error || !data) {
      const conflict = String(error?.message ?? "").includes("state_conflict");
      return res.status(conflict ? 409 : 500).json({
        ok: false,
        code: conflict ? "state_conflict" : "storage_error",
        message: conflict ? "This request changed in another session. Reload and retry." : "The request could not be updated.",
      });
    }
    const updated = (Array.isArray(data) ? data[0] : data) as RequestRow;
    const memberFacing =
      Boolean(parsed.data.memberVisibleUpdate) ||
      (parsed.data.status !== undefined && parsed.data.status !== previousStatus);
    if (memberFacing) {
      const { data: memberData } = await getSupabaseAdmin().from(MEMBERS).select("*").eq("id", updated.member_id).maybeSingle();
      if (memberData) {
        await queueMemberNotification({
          eventKey: `product-request-updated:${updated.id}:${updated.version}`,
          eventType: "product_request_member_update",
          templateKey: "member_product_request_updated",
          member: memberData as MemberRow,
          request: updated,
        });
      }
    }
    return res.json({
      ok: true,
      request: toAdminProductRequest(updated),
      message: parsed.data.status ? `Request moved to ${statusLabel(parsed.data.status)}.` : "Request updated.",
    });
  });

  app.get(
    "/api/admin/research/product-requests/:requestId/files/:fileId/access",
    requireProductRequestAdmin,
    async (req, res) => {
      privacyHeaders(res);
      const row = await fetchAdminRequest(String(req.params.requestId));
      if (!row) return res.status(404).json({ ok: false, code: "not_found" });
      const { data } = await getSupabaseAdmin()
        .from(FILES)
        .select("*")
        .eq("id", String(req.params.fileId))
        .eq("request_id", row.id)
        .eq("state", "confirmed")
        .maybeSingle();
      if (!data) return res.status(404).json({ ok: false, code: "not_found" });
      const file = data as FileRow;
      const audited = await insertEvent({
        requestId: row.id,
        actorType: "admin",
        actorRef: adminFrom(req),
        eventType: "attachment_accessed",
        dedupeKey: `attachment-accessed:${file.id}:${crypto.randomUUID()}`,
        internalDetail: { fileId: file.id },
        now: new Date().toISOString(),
      });
      if (!audited) {
        return res.status(503).json({ ok: false, message: "The private file access could not be audited." });
      }
      const { data: signed, error } = await getSupabaseAdmin()
        .storage.from(STORAGE_BUCKET())
        .createSignedUrl(file.storage_path, READ_TTL_SECONDS);
      if (error || !signed) return res.status(503).json({ ok: false, message: "The private file is not available." });
      return res.json({
        ok: true,
        signedUrl: signed.signedUrl,
        expiresAt: new Date(Date.now() + READ_TTL_SECONDS * 1000).toISOString(),
      });
    },
  );
}
