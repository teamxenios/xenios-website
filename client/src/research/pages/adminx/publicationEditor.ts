// Private additive proposal. No route, storage, credentials or public authority.
import type { ApprovalPort } from "./publicationApproval";
export interface PublicationIdentity { offeringId: string; offeringVariantId: string; productId: string; variantId: string; }
export type PublicationOperation = "seal" | "publish" | "withdraw" | "rollback";
export interface EditorHead {
  identity: PublicationIdentity;
  generation: number;
  currentRevisionId: string | null;
  revisions: Array<{ revisionId: string; previouslyPublished: boolean }>;
  operations: Array<{ operation: PublicationOperation; revisionId: string | null; generation: number; at: string }>;
  historyTruncated: boolean;
}
export interface CandidatePreview {
  identity: PublicationIdentity; sourceSha256: string;
  content: { summary: string; overview: string; storage?: string };
  media: { mediaId: string; altText: string; width: number; height: number; representation: string; packagingDesign: boolean };
  approvalAvailable: true;
}
export interface PublicationReceipt {
  identity: PublicationIdentity; operation: PublicationOperation;
  revisionId: string | null; generation: number; replayed: boolean;
}
export type CommandBody = { expectedGeneration: number } & (
  { mediaId: string; sourceSha256: string } | { revisionId: string; reason?: string } | { reason: string }
);
export type ReadResult<T> = { kind: "ok"; data: T } | { kind: "denied" | "unavailable" };
export type CommandResult = { kind: "ok"; data: PublicationReceipt }
  | { kind: "conflict" | "refused" | "denied" | "unknown"; code?: string };
export interface EditorPort {
  readonly approval?: ApprovalPort;
  readCurrent(): Promise<ReadResult<EditorHead>>;
  preview(mediaId: string): Promise<ReadResult<CandidatePreview>>;
  command(operation: PublicationOperation, body: CommandBody, key: string): Promise<CommandResult>;
  newKey(): string;
}
export interface PendingCommand { operation: PublicationOperation; body: CommandBody; key: string; identity: PublicationIdentity; }
export interface EditorState {
  head: EditorHead | null; preview: CandidatePreview | null; pending: PendingCommand | null;
  busy: boolean; denied: boolean; message: string;
}
const UUID = /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const same = (a: PublicationIdentity, b: PublicationIdentity) => ["offeringId", "offeringVariantId", "productId", "variantId"].every(k => a[k as keyof PublicationIdentity] === b[k as keyof PublicationIdentity]);
const fields = (v: unknown, keys: string[]) => !!v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const validIdentity = (v: PublicationIdentity) => fields(v, ["offeringId", "offeringVariantId", "productId", "variantId"])
  && typeof v.offeringId === "string" && v.offeringId.length <= 100 && /^mo_[0-9a-f]+$/.test(v.offeringId)
  && typeof v.offeringVariantId === "string" && v.offeringVariantId.length <= 100 && /^mov_[0-9a-f]+$/.test(v.offeringVariantId)
  && typeof v.productId === "string" && UUID.test(v.productId) && typeof v.variantId === "string" && UUID.test(v.variantId);
export function validEditorHead(v: EditorHead, productId: string, variantId: string): boolean {
  return fields(v, ["identity", "generation", "currentRevisionId", "revisions", "operations", "historyTruncated"])
    && validIdentity(v.identity) && v.identity.productId === productId && v.identity.variantId === variantId
    && Number.isSafeInteger(v.generation) && v.generation >= 0 && (v.currentRevisionId === null || UUID.test(v.currentRevisionId))
    && typeof v.historyTruncated === "boolean"
    && Array.isArray(v.revisions) && v.revisions.length <= 50
    && v.revisions.every(r => fields(r, ["revisionId", "previouslyPublished"]) && typeof r.revisionId === "string" && UUID.test(r.revisionId) && typeof r.previouslyPublished === "boolean")
    && new Set(v.revisions.map(r => r.revisionId)).size === v.revisions.length
    && Array.isArray(v.operations) && v.operations.length <= 50 && v.operations.every(o => fields(o, ["operation", "revisionId", "generation", "at"])
      && ["seal", "publish", "withdraw", "rollback"].includes(o.operation)
      && (o.operation === "withdraw" ? o.revisionId === null : typeof o.revisionId === "string" && UUID.test(o.revisionId))
      && Number.isSafeInteger(o.generation) && o.generation >= 0 && o.generation <= v.generation
      && typeof o.at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(o.at) && Number.isFinite(Date.parse(o.at)))
    && (v.currentRevisionId === null || v.revisions.some(r => r.revisionId === v.currentRevisionId));
}
function validPreview(v: CandidatePreview, head: EditorHead, mediaId: string): boolean {
  return !!v && validIdentity(v.identity) && same(v.identity, head.identity) && typeof v.sourceSha256 === "string" && SHA.test(v.sourceSha256)
    && v.approvalAvailable === true && !!v.content && typeof v.content.summary === "string" && typeof v.content.overview === "string"
    && [v.content.summary, v.content.overview, ...(v.content.storage === undefined ? [] : [v.content.storage])]
      .every(s => typeof s === "string" && s.trim().length > 0 && s.length <= 20000 && !/[$€£¥]|\bprice\s*:/i.test(s))
    && !!v.media && v.media.mediaId === mediaId && UUID.test(mediaId) && typeof v.media.altText === "string"
    && Number.isSafeInteger(v.media.width) && v.media.width > 0 && Number.isSafeInteger(v.media.height) && v.media.height > 0
    && ["proposed_carton", "proposed_vial", "catalog_reference"].includes(v.media.representation) && typeof v.media.packagingDesign === "boolean";
}
function validReceipt(v: PublicationReceipt, p: PendingCommand): boolean {
  if (!v || !validIdentity(v.identity) || !same(v.identity, p.identity) || v.operation !== p.operation || typeof v.replayed !== "boolean") return false;
  const expected = p.body.expectedGeneration + (p.operation === "seal" ? 0 : 1);
  if (!Number.isSafeInteger(expected) || !Number.isSafeInteger(v.generation) || v.generation !== expected) return false;
  return p.operation === "withdraw" ? v.revisionId === null : p.operation === "seal" ? UUID.test(v.revisionId ?? "")
    : "revisionId" in p.body && v.revisionId === p.body.revisionId;
}
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** One controller per authenticated product/variant selection; dispose on change.
 * Unknown commands retain one exact key/body in memory and block new actions.
 * A read never turns an unknown historical operation into a confirmed receipt.
 */
export function createPublicationEditor(productId: string, variantId: string, port: EditorPort) {
  let state: EditorState = { head: null, preview: null, pending: null, busy: false, denied: false, message: "Read the current publication before taking an action." };
  let disposed = false, epoch = 0;
  const listeners = new Set<(s: EditorState) => void>();
  function emit(next: Partial<EditorState>) { if (disposed) return; state = { ...state, ...next }; for (const f of listeners) f(copy(state)); }
  async function read() {
    if (disposed || state.busy) return;
    const request = ++epoch;
    emit({ head: null, preview: null, busy: true, denied: false, message: "Reading the authenticated current head…" });
    let result: ReadResult<EditorHead>;
    try { result = await port.readCurrent(); } catch { result = { kind: "unavailable" }; }
    if (disposed || request !== epoch) return;
    if (result.kind !== "ok" || !validEditorHead(result.data, productId, variantId)) {
      emit({ busy: false, denied: result.kind === "denied", message: "The current publication could not be confirmed. Actions remain unavailable." }); return;
    }
    emit({ head: copy(result.data), busy: false, message: state.pending
      ? "Current head loaded. The previous command is still unconfirmed; retry its exact key to recover its receipt."
      : "Current head loaded. Publication does not activate commerce or clinical services." });
  }
  async function preview(mediaId: string) {
    if (disposed || state.busy || state.pending || !state.head || state.denied || !UUID.test(mediaId)) return;
    const request = ++epoch, head = copy(state.head);
    emit({ busy: true, preview: null, message: "Checking the proposed revision against current approval and rights…" });
    let result: ReadResult<CandidatePreview>;
    try { result = await port.preview(mediaId); } catch { result = { kind: "unavailable" }; }
    if (disposed || request !== epoch) return;
    emit({ busy: false, denied: result.kind === "denied", preview: result.kind === "ok" && validPreview(result.data, head, mediaId) ? copy(result.data) : null,
      message: result.kind === "ok" && validPreview(result.data, head, mediaId)
        ? "Proposed revision verified for this exact variant. It is not sealed or published."
        : "Proposed revision unavailable. Save edits and resolve exact-variant review and media rights before retrying." });
  }
  async function deliver(p: PendingCommand) {
    const request = ++epoch;
    emit({ busy: true, pending: copy(p), message: "Sending the explicit command. Do not repeat it with a new key." });
    let result: CommandResult;
    try { result = await port.command(p.operation, copy(p.body), p.key); } catch { result = { kind: "unknown" }; }
    if (disposed || request !== epoch) return;
    if (result.kind === "ok" && validReceipt(result.data, p)) {
      emit({ busy: false, pending: null, head: null, preview: null, message: "Command receipt confirmed. Reading current state separately…" });
      await read(); return;
    }
    if (result.kind === "conflict" || result.kind === "refused") {
      emit({ busy: false, pending: null, head: null, preview: null, message: "Command refused. Reading the current head; no automatic replacement command will be sent." });
      await read(); return;
    }
    emit({ busy: false, denied: result.kind === "denied", message: "Command outcome is unconfirmed. Retry only this same command and key; no new action is allowed." });
  }
  async function act(operation: PublicationOperation, input: { revisionId?: string; reason?: string } = {}) {
    const h = state.head;
    if (disposed || state.busy || state.pending || !h || state.denied) return;
    let body: CommandBody;
    if (operation === "seal") {
      if (!state.preview || !same(state.preview.identity, h.identity)) return;
      body = { expectedGeneration: h.generation, mediaId: state.preview.media.mediaId, sourceSha256: state.preview.sourceSha256 };
    } else if (operation === "withdraw") {
      if (h.currentRevisionId === null || !input.reason?.trim() || input.reason.trim().length > 1000) return;
      body = { expectedGeneration: h.generation, reason: input.reason.trim() };
    } else {
      if (!input.revisionId || !h.revisions.some(r => r.revisionId === input.revisionId && (operation !== "rollback" || r.previouslyPublished)) || input.revisionId === h.currentRevisionId) return;
      if (operation === "rollback" && (!input.reason?.trim() || input.reason.trim().length > 1000)) return;
      body = { expectedGeneration: h.generation, revisionId: input.revisionId, ...(operation === "rollback" ? { reason: input.reason!.trim() } : {}) };
    }
    const key = port.newKey();
    if (typeof key !== "string" || !key || key.length > 200) return;
    await deliver({ operation, body, key, identity: copy(h.identity) });
  }
  return {
    // React's development effect replay disposes and reattaches the same memo.
    // Epoch fencing still rejects responses from its preceding attachment.
    attach() { if (disposed) { disposed = false; epoch++; state = { head: null, preview: null, pending: state.pending, busy: false, denied: false, message: "Read the current publication before taking an action." }; } },
    snapshot: () => copy(state),
    subscribe(fn: (s: EditorState) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    read, preview, act,
    clearPreview() { if (!disposed && !state.busy) emit({ preview: null }); },
    retry: async () => { if (!disposed && !state.busy && !state.denied && state.pending) await deliver(copy(state.pending)); },
    dispose() { disposed = true; epoch++; listeners.clear(); },
  };
}
