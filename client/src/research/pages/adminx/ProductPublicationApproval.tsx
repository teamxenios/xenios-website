import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { createApprovalEditor, validApprovalMetadata, type ApprovalMetadata, type ApprovalPort, type ApprovalView } from "./publicationApproval";
import type { PublicationIdentity } from "./publicationEditor";

const empty = { mediaId: "", contentReference: "", rightsReference: "", width: "", height: "", representation: "", packaging: "", expiresAt: "", approvalId: "", reason: "" };
/** The existing staff editor supplies this optional port from the same session.
 * A role label, approved media row or supplied digest never grants owner access. */
export function ProductPublicationApproval({ token, product, variantId, identity, port, refresh, onRecorded }: {
  token: string; product: AdminProductDetail; variantId: string; identity: PublicationIdentity; port: ApprovalPort; refresh: number; onRecorded: () => void;
}) {
  const id = useId(), recorded = useRef(onRecorded); recorded.current = onRecorded;
  const controller = useMemo(() => createApprovalEditor(identity, port, () => recorded.current()), [token, product.id, variantId, identity.offeringId, identity.offeringVariantId, identity.productId, identity.variantId, port]);
  const [observed, setObserved] = useState<{ owner: typeof controller; value: ApprovalView } | null>(null);
  const [local, setLocal] = useState<{ owner: typeof controller; value: typeof empty } | null>(null);
  const view = observed?.owner === controller ? observed.value : controller.snapshot();
  const values = local?.owner === controller ? local.value : empty;
  const update = (change: Partial<typeof empty>) => setLocal({ owner: controller, value: { ...values, ...change } });
  useEffect(() => { controller.attach(); const off = controller.subscribe(value => setObserved({ owner: controller, value })); void controller.read(); return () => { off(); controller.dispose(); }; }, [controller]);
  useEffect(() => { void controller.read(); }, [controller, refresh]);
  if (!view.head?.ownerAuthorized) return view.pending ? <p role="status">An approval command is still unconfirmed in this tab. Owner commands are hidden until access is verified again.</p> : null;
  const media = product.media.filter(m => m.productId === product.id && m.state === "approved");
  const selected = media.some(m => m.id === values.mediaId);
  const blocked = view.busy || !!view.pending;
  const metadata = {
    contentApprovalReference: values.contentReference.trim(), rightsEvidenceReference: values.rightsReference.trim(),
    width: Number(values.width), height: Number(values.height), representation: values.representation,
    packagingDesign: values.packaging === "yes", expiresAt: values.expiresAt.trim() || null,
  } as ApprovalMetadata;
  const canApprove = !blocked && selected && view.preview?.media.mediaId === values.mediaId && values.packaging !== "" && validApprovalMetadata(metadata);
  const previous = view.head.approvals.find(r => r.approvalId === values.approvalId && r.recordedDecision === "approved");
  return <section className="grid min-w-0 grid-cols-1 gap-3 border-t pt-4" aria-labelledby={`${id}-owner`}>
    <h3 id={`${id}-owner`} className="body-m font-700">Owner content and media approval</h3>
    <p className="body-s">Owner access was verified by the server for this exact variant. Use genuine content-review and rights-evidence references. Recording a decision does not publish, create rights, or enable commerce or Care.</p>
    <p className="body-s break-words">Offering {view.head.identity.offeringId} · offering variant {view.head.identity.offeringVariantId} · product {view.head.identity.productId} · variant {view.head.identity.variantId}</p>
    <p role="status" aria-live="polite">{view.message}</p>
    {view.lastResult && <p className="body-s break-words">Last command result: {view.lastResult}</p>}
    <button type="button" className="btn btn-secondary justify-self-start" disabled={view.busy} onClick={() => void controller.read()}>Read approval access and history</button>
    {view.pending && <div role="alert" className="grid min-w-0 gap-2">
      <p>Unconfirmed {view.pending.operation}. A missing history row or reload does not prove failure. Keep this tab; do not replace the command key.</p>
      <button type="button" className="btn btn-secondary justify-self-start" disabled={view.busy} onClick={() => void controller.retry()}>Retry exact approval command</button>
    </div>}
    <label className="form-label" htmlFor={`${id}-media`}>Current approved media for owner review</label>
    <select id={`${id}-media`} className="input-field min-w-0 w-full" value={selected ? values.mediaId : ""} disabled={blocked} onChange={e => { setLocal({ owner: controller, value: { ...empty, mediaId: e.target.value } }); controller.clearPreview(); }}>
      <option value="">Choose media — no automatic selection</option>
      {media.map(m => <option key={m.id} value={m.id}>{m.filename} · {m.id}</option>)}
    </select>
    {!media.length && <p>No current approved media is available. Use the existing private media review workflow.</p>}
    <button type="button" className="btn btn-secondary justify-self-start" disabled={blocked || !selected} onClick={() => { setLocal({ owner: controller, value: { ...empty, mediaId: values.mediaId } }); void controller.preview(values.mediaId); }}>Preview exact bytes for approval</button>
    {view.preview && <article className="grid min-w-0 gap-3" aria-label="Exact owner approval preview">
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{view.preview.content.summary}</p>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{view.preview.content.overview}</p>
      {view.preview.content.storage && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{view.preview.content.storage}</p>}
      <p className="body-s break-words">Source SHA-256: {view.preview.sourceSha256}</p>
      <p className="body-s break-words">Private-read media SHA-256: {view.preview.media.sha256}</p>
      <p className="body-s break-words">Media {view.preview.media.mediaId} · version {view.preview.media.mediaVersion} · {view.preview.media.contentType} · {view.preview.media.sizeBytes} bytes · {view.preview.media.altText}</p>
      <p className="body-s">No private image locator or signed URL is exposed. The server reads and compares the bytes again when recording this decision.</p>
      <label className="form-label" htmlFor={`${id}-content`}>Existing content-review reference</label>
      <input id={`${id}-content`} className="input-field min-w-0 w-full" value={values.contentReference} maxLength={512} disabled={blocked} onChange={e => update({ contentReference: e.target.value })} />
      <label className="form-label" htmlFor={`${id}-rights`}>Existing rights-evidence reference</label>
      <input id={`${id}-rights`} className="input-field min-w-0 w-full" value={values.rightsReference} maxLength={512} disabled={blocked} onChange={e => update({ rightsReference: e.target.value })} />
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1"><label htmlFor={`${id}-width`}>Reviewed width (pixels)</label><input id={`${id}-width`} className="input-field min-w-0 w-full" type="number" min={1} max={20000} step={1} value={values.width} disabled={blocked} onChange={e => update({ width: e.target.value })} /></div>
        <div className="grid min-w-0 gap-1"><label htmlFor={`${id}-height`}>Reviewed height (pixels)</label><input id={`${id}-height`} className="input-field min-w-0 w-full" type="number" min={1} max={20000} step={1} value={values.height} disabled={blocked} onChange={e => update({ height: e.target.value })} /></div>
      </div>
      <label htmlFor={`${id}-representation`}>Reviewed representation</label>
      <select id={`${id}-representation`} className="input-field min-w-0 w-full" value={values.representation} disabled={blocked} onChange={e => update({ representation: e.target.value })}><option value="">Choose explicitly</option><option value="catalog_reference">Catalog reference</option><option value="proposed_carton">Proposed carton</option><option value="proposed_vial">Proposed vial</option></select>
      <label htmlFor={`${id}-packaging`}>Does this show a proposed packaging design?</label>
      <select id={`${id}-packaging`} className="input-field min-w-0 w-full" value={values.packaging} disabled={blocked} onChange={e => update({ packaging: e.target.value })}><option value="">Choose explicitly</option><option value="yes">Yes</option><option value="no">No</option></select>
      <label htmlFor={`${id}-expiry`}>Approval expiry, if applicable (RFC3339 with timezone; blank means no expiry)</label>
      <input id={`${id}-expiry`} className="input-field min-w-0 w-full" value={values.expiresAt} maxLength={64} disabled={blocked} onChange={e => update({ expiresAt: e.target.value })} />
      <button type="button" className="btn btn-primary justify-self-start" disabled={!canApprove} onClick={() => void controller.approve(metadata)}>Record approval for this exact preview</button>
    </article>}
    <h4 className="body-m font-700">Recorded approval history</h4>
    <p className="body-s">A recorded decision is historical, not proof of current rights. Rights can lapse or be revoked independently.</p>
    {view.head.historyTruncated && <p className="body-s">Only bounded history is shown. A missing record does not prove a timed-out command failed.</p>}
    <ol className="grid min-w-0 gap-2">{view.head.approvals.map(a => <li key={a.approvalId} className="body-s break-words">{a.approvalId} · recorded {a.recordedDecision} · approval version {a.approvalVersion} · media {a.mediaId} version {a.mediaVersion} · SHA-256 {a.mediaSha256}</li>)}</ol>
    <label htmlFor={`${id}-record`}>Recorded approval to revoke</label>
    <select id={`${id}-record`} className="input-field min-w-0 w-full" value={previous ? values.approvalId : ""} disabled={blocked} onChange={e => update({ approvalId: e.target.value })}><option value="">Choose a recorded approval ID</option>{view.head.approvals.filter(a => a.recordedDecision === "approved").map(a => <option key={a.approvalId} value={a.approvalId}>{a.approvalId}</option>)}</select>
    <label htmlFor={`${id}-reason`}>Revocation reason</label>
    <textarea id={`${id}-reason`} className="input-field min-w-0 w-full" maxLength={1000} value={values.reason} disabled={blocked} onChange={e => update({ reason: e.target.value })} />
    <button type="button" className="btn btn-secondary justify-self-start" disabled={blocked || !previous || !values.reason.trim()} onClick={() => void controller.revoke(values.approvalId, values.reason.trim())}>Revoke recorded approval</button>
    <p className="body-s">Reload recovers committed IDs from the server, not an exact private command body. Exact-key retry is available only while the original command remains in this tab.</p>
  </section>;
}
