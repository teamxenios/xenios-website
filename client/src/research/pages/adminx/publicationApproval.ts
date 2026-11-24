import { validIdentity, type PublicationIdentity, type ReadResult } from "./publicationEditor";

export interface RecordedApproval {
  approvalId: string; recordedDecision: "approved" | "revoked"; approvalVersion: number;
  sourceSha256: string; mediaId: string; mediaVersion: number; mediaSha256: string; expiresAt: string | null;
}
export interface ApprovalHead {
  identity: PublicationIdentity; approvalVersion: number; ownerAuthorized: boolean;
  approvals: RecordedApproval[]; historyTruncated: boolean;
}
export interface ApprovalPreview {
  identity: PublicationIdentity; approvalVersion: number; ownerAuthorized: true; sourceSha256: string;
  content: { summary: string; overview: string; storage?: string };
  media: { mediaId: string; mediaVersion: number; altText: string; contentType: string; sizeBytes: number; sha256: string };
}
export interface ApprovalMetadata {
  contentApprovalReference: string; rightsEvidenceReference: string; expiresAt: string | null;
  width: number; height: number; representation: "proposed_carton" | "proposed_vial" | "catalog_reference"; packagingDesign: boolean;
}
export type ApprovalOperation = "approve" | "revoke";
export type ApprovalBody = ({ expectedApprovalVersion: number } & ApprovalMetadata & { mediaId: string; sourceSha256: string; expectedMediaSha256: string })
  | { expectedApprovalVersion: number; reason: string };
export interface ApprovalReceipt { identity: PublicationIdentity; operation: ApprovalOperation; approvalId: string; approvalVersion: number; decision: "approved" | "revoked"; replayed: boolean; }
export type ApprovalResult = { kind: "ok"; data: ApprovalReceipt } | { kind: "unknown" | "denied" | "conflict" | "refused" };
export interface ApprovalPort {
  readCurrent(): Promise<ReadResult<ApprovalHead>>;
  preview(mediaId: string): Promise<ReadResult<ApprovalPreview>>;
  command(operation: ApprovalOperation, body: ApprovalBody, key: string, approvalId?: string): Promise<ApprovalResult>;
  newKey(): string;
}
export interface ApprovalPending { identity: PublicationIdentity; operation: ApprovalOperation; body: ApprovalBody; key: string; approvalId?: string; }
export interface ApprovalView { head: ApprovalHead | null; preview: ApprovalPreview | null; pending: ApprovalPending | null; busy: boolean; message: string; lastResult: string | null; }
const UUID = /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const same = (a: PublicationIdentity, b: PublicationIdentity) => ["offeringId", "offeringVariantId", "productId", "variantId"].every(k => a[k as keyof PublicationIdentity] === b[k as keyof PublicationIdentity]);
const fields = (v: unknown, keys: string[]) => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v === v.trim() && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(v);
const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const safe = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const priceFree = (v: string) => !/[$€£¥]|\b(?:USD|EUR|GBP)\s*\d|\bprice\s*:/i.test(v);

export function validApprovalHead(v: ApprovalHead, productId: string, variantId: string): boolean {
  return fields(v, ["identity", "approvalVersion", "ownerAuthorized", "approvals", "historyTruncated"])
    && validIdentity(v.identity) && v.identity.productId === productId && v.identity.variantId === variantId
    && safe(v.approvalVersion) && typeof v.ownerAuthorized === "boolean" && typeof v.historyTruncated === "boolean"
    && Array.isArray(v.approvals) && v.approvals.length <= 50 && new Set(v.approvals.map(r => r?.approvalId)).size === v.approvals.length
    && v.approvals.every(r => fields(r, ["approvalId", "recordedDecision", "approvalVersion", "sourceSha256", "mediaId", "mediaVersion", "mediaSha256", "expiresAt"])
      && UUID.test(r.approvalId) && ["approved", "revoked"].includes(r.recordedDecision) && safe(r.approvalVersion) && r.approvalVersion > 0 && r.approvalVersion <= v.approvalVersion
      && SHA.test(r.sourceSha256) && UUID.test(r.mediaId) && safe(r.mediaVersion) && r.mediaVersion > 0 && SHA.test(r.mediaSha256) && (r.expiresAt === null || timestamp(r.expiresAt)));
}
export function validApprovalMetadata(v: ApprovalMetadata): boolean {
  return fields(v, ["contentApprovalReference", "rightsEvidenceReference", "expiresAt", "width", "height", "representation", "packagingDesign"])
    && text(v.contentApprovalReference, 512) && !/^https?:\/\//i.test(v.contentApprovalReference)
    && text(v.rightsEvidenceReference, 512) && !/^https?:\/\//i.test(v.rightsEvidenceReference)
    && (v.expiresAt === null || timestamp(v.expiresAt) && Date.parse(v.expiresAt) > Date.now())
    && Number.isSafeInteger(v.width) && v.width > 0 && v.width <= 20000 && Number.isSafeInteger(v.height) && v.height > 0 && v.height <= 20000
    && ["proposed_carton", "proposed_vial", "catalog_reference"].includes(v.representation) && typeof v.packagingDesign === "boolean";
}
function validPreview(v: ApprovalPreview, head: ApprovalHead, mediaId: string): boolean {
  return fields(v, ["identity", "approvalVersion", "ownerAuthorized", "sourceSha256", "content", "media"])
    && validIdentity(v.identity) && same(v.identity, head.identity) && v.ownerAuthorized === true && v.approvalVersion === head.approvalVersion && SHA.test(v.sourceSha256)
    && !!v.content && Object.keys(v.content).every(k => ["summary", "overview", "storage"].includes(k)) && typeof v.content.summary === "string" && typeof v.content.overview === "string"
    && Object.values(v.content).every(x => typeof x === "string" && x.trim().length > 0 && x.length <= 20000 && priceFree(x))
    && fields(v.media, ["mediaId", "mediaVersion", "altText", "contentType", "sizeBytes", "sha256"])
    && v.media.mediaId === mediaId && UUID.test(mediaId) && safe(v.media.mediaVersion) && v.media.mediaVersion > 0
    && text(v.media.altText, 1000) && priceFree(v.media.altText) && ["image/png", "image/jpeg", "image/webp"].includes(v.media.contentType)
    && safe(v.media.sizeBytes) && v.media.sizeBytes > 0 && v.media.sizeBytes <= 10485760 && SHA.test(v.media.sha256);
}
function receipt(v: ApprovalReceipt, p: ApprovalPending): boolean {
  const expected = p.body.expectedApprovalVersion + 1;
  return fields(v, ["identity", "operation", "approvalId", "approvalVersion", "decision", "replayed"])
    && validIdentity(v.identity) && same(v.identity, p.identity) && v.operation === p.operation && UUID.test(v.approvalId)
    && safe(expected) && safe(v.approvalVersion) && v.approvalVersion === expected && typeof v.replayed === "boolean"
    && v.decision === (p.operation === "approve" ? "approved" : "revoked") && (p.operation !== "revoke" || v.approvalId === p.approvalId);
}

/** Only in-memory selected-session state. No bearer or operation journal is persisted. */
export function createApprovalEditor(identity: PublicationIdentity, port: ApprovalPort, recorded: () => void = () => {}) {
  if (!validIdentity(identity)) throw new Error("approval_scope_required");
  const expectedIdentity = structuredClone(identity), { productId, variantId } = expectedIdentity;
  let view: ApprovalView = { head: null, preview: null, pending: null, busy: false, message: "Read approval access and history.", lastResult: null };
  let active = true, epoch = 0;
  const listeners = new Set<(v: ApprovalView) => void>();
  const snapshot = () => structuredClone(view);
  const emit = (change: Partial<ApprovalView>) => { view = { ...view, ...change }; for (const fn of listeners) fn(snapshot()); };
  const current = (n: number) => active && n === epoch;
  const ready = () => active && !view.busy && !view.pending && view.head?.ownerAuthorized === true && view.head.approvalVersion < Number.MAX_SAFE_INTEGER;
  async function read() {
    if (!active || view.busy) return;
    const n = ++epoch; emit({ busy: true, preview: null });
    let result: ReadResult<ApprovalHead>; try { result = await port.readCurrent(); } catch { result = { kind: "unavailable" }; }
    if (!current(n)) return;
    if (result.kind !== "ok" || !validApprovalHead(result.data, productId, variantId) || !same(result.data.identity, expectedIdentity) || view.pending && !same(result.data.identity, view.pending.identity)) {
      emit({ head: null, busy: false, message: "Approval access or history unavailable. Any unconfirmed command is still retained in this tab." }); return;
    }
    emit({ head: structuredClone(result.data), busy: false, message: result.data.ownerAuthorized ? "Approval owner access verified for this exact variant." : "Owner commands are unavailable for this session." });
  }
  async function preview(mediaId: string) {
    if (!ready() || !UUID.test(mediaId)) return;
    const head = structuredClone(view.head!), n = ++epoch; emit({ busy: true, preview: null });
    let result: ReadResult<ApprovalPreview>; try { result = await port.preview(mediaId); } catch { result = { kind: "unavailable" }; }
    if (!current(n)) return;
    if (result.kind !== "ok" || !validPreview(result.data, head, mediaId)) {
      emit({ busy: false, head: result.kind === "denied" ? null : view.head, message: "Exact private-read preview unavailable. Read access and history again; no approval was sent." }); return;
    }
    emit({ busy: false, preview: structuredClone(result.data), message: "Review this exact saved content and private-read digest. Nothing is approved or published yet." });
  }
  async function send() {
    if (!active || view.busy || !view.pending || !view.head?.ownerAuthorized) return;
    const p = structuredClone(view.pending), n = ++epoch; emit({ busy: true });
    let result: ApprovalResult; try { result = await port.command(p.operation, structuredClone(p.body), p.key, p.approvalId); } catch { result = { kind: "unknown" }; }
    if (!current(n)) return;
    if (result.kind === "ok" && receipt(result.data, p)) {
      const lastResult = `Recorded ${result.data.decision}: ${result.data.approvalId} at approval version ${result.data.approvalVersion}. This receipt is not proof of current rights.`;
      emit({ busy: false, pending: null, preview: null, message: lastResult, lastResult });
      try { recorded(); } catch { /* A display refresh must not undo a valid receipt. */ }
      await read(); return;
    }
    if (result.kind === "conflict" || result.kind === "refused") {
      const lastResult = "Command explicitly refused. Read current history and make a fresh explicit decision.";
      emit({ busy: false, pending: null, preview: null, message: lastResult, lastResult }); await read(); return;
    }
    emit({ busy: false, head: result.kind === "denied" ? null : view.head, message: "Command unconfirmed. Keep this tab; only the original exact command may be retried after access is verified." });
  }
  function begin(operation: ApprovalOperation, body: ApprovalBody, approvalId?: string) {
    let key: string; try { key = port.newKey(); } catch { emit({ message: "A safe command key is unavailable. Nothing was sent." }); return; }
    if (!text(key, 200)) { emit({ message: "A safe command key is unavailable. Nothing was sent." }); return; }
    emit({ lastResult: null, pending: { identity: structuredClone(view.head!.identity), operation, body: structuredClone(body), key, ...(approvalId ? { approvalId } : {}) } }); return send();
  }
  return {
    snapshot, read, preview,
    subscribe(fn: (v: ApprovalView) => void) { listeners.add(fn); fn(snapshot()); return () => { listeners.delete(fn); }; },
    attach() { active = true; ++epoch; emit({ busy: false, preview: null }); },
    dispose() { active = false; ++epoch; view = { ...view, busy: false, preview: null }; },
    clearPreview() { if (view.busy || view.pending) return; ++epoch; emit({ preview: null }); },
    approve(metadata: ApprovalMetadata) {
      if (!ready() || !view.preview || !validApprovalMetadata(metadata)) return;
      const p = view.preview;
      return begin("approve", { ...structuredClone(metadata), expectedApprovalVersion: view.head!.approvalVersion, mediaId: p.media.mediaId, sourceSha256: p.sourceSha256, expectedMediaSha256: p.media.sha256 });
    },
    revoke(approvalId: string, reason: string) {
      if (!ready() || !text(reason, 1000) || !view.head!.approvals.some(r => r.approvalId === approvalId && r.recordedDecision === "approved")) return;
      return begin("revoke", { expectedApprovalVersion: view.head!.approvalVersion, reason }, approvalId);
    },
    retry: send,
  };
}
