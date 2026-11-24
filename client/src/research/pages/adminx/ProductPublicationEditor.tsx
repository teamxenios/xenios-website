import { useEffect, useMemo, useState, useId } from "react";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { createPublicationEditor, type EditorPort, type EditorState } from "./publicationEditor";

/** Root mounts at the existing explicit ProductCatalogPreview selection seam.
 * makePort binds the selected existing authenticated API client; no new guard,
 * route, public rights or private storage URL is established by this component.
 */
export function ProductPublicationEditor({ token, product, variantId, makePort }: {
  token: string; product: AdminProductDetail; variantId: string;
  makePort: (token: string, productId: string, variantId: string) => EditorPort;
}) {
  const selected = product.variants.find(v => v.id === variantId && v.productId === product.id);
  if (!selected || !token) return <p>Select one exact variant in the existing preview selector to manage its publication.</p>;
  return <SelectedPublicationEditor token={token} product={product} variantId={variantId} makePort={makePort} />;
}

function SelectedPublicationEditor({ token, product, variantId, makePort }: {
  token: string; product: AdminProductDetail; variantId: string;
  makePort: (token: string, productId: string, variantId: string) => EditorPort;
}) {
  const id = useId();
  // A parent callback's referential churn must not discard an unknown command.
  // Select a port once per actual authenticated product/variant scope. Root
  // changes that scope, not a callback reference, to replace the capability.
  const controller = useMemo(() => createPublicationEditor(product.id, variantId, makePort(token, product.id, variantId)), [token, product.id, variantId]);
  const [observed, setObserved] = useState<{ owner: typeof controller; view: EditorState } | null>(null);
  // Never display the preceding product, variant or operator's result while an
  // effect for a new controller is waiting to run.
  const view = observed?.owner === controller ? observed.view : controller.snapshot();
  const [mediaSelection, setMediaSelection] = useState<{ owner: typeof controller; id: string } | null>(null);
  const [revisionSelection, setRevisionSelection] = useState<{ owner: typeof controller; id: string } | null>(null);
  const [reasonSelection, setReasonSelection] = useState<{ owner: typeof controller; value: string } | null>(null);
  const mediaId = mediaSelection?.owner === controller ? mediaSelection.id : "";
  const revisionId = revisionSelection?.owner === controller ? revisionSelection.id : "";
  const reason = reasonSelection?.owner === controller ? reasonSelection.value : "";
  const media = product.media.filter(m => m.productId === product.id && m.state === "approved");
  const selectedMedia = media.some(m => m.id === mediaId);
  const head = view.head;
  const selectedRevision = head?.revisions.find(r => r.revisionId === revisionId);
  const blocked = view.busy || view.denied || !!view.pending || !head;
  useEffect(() => {
    controller.attach();
    const off = controller.subscribe(next => setObserved({ owner: controller, view: next }));
    void controller.read();
    return () => { off(); controller.dispose(); };
  }, [controller]);
  return <section className="card grid min-w-0 grid-cols-1 gap-4" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`} className="body-l font-700">Exact variant publication</h2>
    <p className="body-s text-ink-2">Save content edits in Product Control first. This panel previews and seals that saved revision for the selected variant. Media approval alone is not public display permission.</p>
    <p className="body-s break-words">Product {product.id} · variant {variantId}</p>
    <p role="status" aria-live="polite">{view.message}</p>
    {head && <div className="grid min-w-0 gap-1">
      <p>Current generation: {head.generation}</p>
      <p className="break-words">Current revision: {head.currentRevisionId ?? "None published"}</p>
      <p className="body-s text-ink-2">A committed head is not proof of current media rights, live availability, payment readiness or clinical activation.</p>
    </div>}
    <button type="button" className="btn btn-secondary justify-self-start" disabled={view.busy} onClick={() => void controller.read()}>Read current publication</button>
    {view.pending && <div className="grid min-w-0 gap-2" role="alert">
      <p>Unconfirmed {view.pending.operation}. A new head or a missing history row does not prove this command failed. Do not send it with a replacement key.</p>
      <button type="button" className="btn btn-secondary justify-self-start" disabled={view.busy || view.denied} onClick={() => void controller.retry()}>Retry exact command</button>
    </div>}
    <div className="grid min-w-0 gap-2">
      <label className="form-label" htmlFor={`${id}-media`}>Approved media to review for this exact variant</label>
      <select id={`${id}-media`} className="input-field min-w-0 w-full" value={mediaId} disabled={blocked} onChange={e => { setMediaSelection({ owner: controller, id: e.target.value }); controller.clearPreview(); }}>
        <option value="">Choose approved media — no automatic selection</option>
        {media.map(m => <option key={m.id} value={m.id}>{m.filename} · {m.id}</option>)}
      </select>
      {!media.length && <p>No approved media on this product. Use the existing private media review workflow.</p>}
      <button type="button" className="btn btn-secondary justify-self-start" disabled={blocked || !selectedMedia} onClick={() => void controller.preview(mediaId)}>Preview proposed revision</button>
    </div>
    {view.preview && <article className="grid min-w-0 gap-2" aria-label="Proposed revision, not published">
      <h3 className="body-m font-700">Proposed revision — not published</h3>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{view.preview.content.summary}</p>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{view.preview.content.overview}</p>
      {view.preview.content.storage && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{view.preview.content.storage}</p>}
      <p className="body-s">Media: {view.preview.media.altText} · {view.preview.media.width} × {view.preview.media.height} · {view.preview.media.representation.replace(/_/g, " ")}</p>
      <p className="body-s">No image URL is inferred from private storage. The server rechecks current review and rights when sealing.</p>
      <button type="button" className="btn btn-primary justify-self-start" disabled={blocked || !selectedMedia || view.preview.media.mediaId !== mediaId} onClick={() => void controller.act("seal")}>Seal approved revision</button>
    </article>}
    <div className="grid min-w-0 gap-2">
      <label className="form-label" htmlFor={`${id}-revision`}>Sealed revision</label>
      <select id={`${id}-revision`} className="input-field min-w-0 w-full" value={selectedRevision ? revisionId : ""} disabled={blocked} onChange={e => setRevisionSelection({ owner: controller, id: e.target.value })}>
        <option value="">Choose a revision from authenticated history</option>
        {head?.revisions.map(r => <option key={r.revisionId} value={r.revisionId}>{r.revisionId}{r.previouslyPublished ? " · previously published" : " · sealed"}</option>)}
      </select>
      <label className="form-label" htmlFor={`${id}-reason`}>Reason for withdrawal or rollback</label>
      <textarea id={`${id}-reason`} className="input-field min-w-0 w-full" value={reason} maxLength={1000} disabled={blocked} onChange={e => setReasonSelection({ owner: controller, value: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={blocked || !selectedRevision || revisionId === head?.currentRevisionId} onClick={() => void controller.act("publish", { revisionId })}>Publish selected revision</button>
        <button type="button" className="btn btn-secondary" disabled={blocked || !head?.currentRevisionId || !reason.trim()} onClick={() => void controller.act("withdraw", { reason })}>Withdraw current revision</button>
        <button type="button" className="btn btn-secondary" disabled={blocked || !selectedRevision?.previouslyPublished || revisionId === head?.currentRevisionId || !reason.trim()} onClick={() => void controller.act("rollback", { revisionId, reason })}>Roll back to selected revision</button>
      </div>
      <p className="body-s text-ink-2">Withdrawal remains independent of a fresh preview or rights approval. Publish and rollback still require current server authorization, exact identity and rights.</p>
    </div>
    <div className="grid min-w-0 gap-2">
      <h3 className="body-m font-700">Recent committed operations</h3>
      {head?.historyTruncated && <p className="body-s">Only bounded recent history is shown. Older operations may be omitted; a missing row does not prove a command failed.</p>}
      {head?.operations.length ? <ol className="grid min-w-0 gap-2">{head.operations.map((o, n) => <li key={`${o.at}-${n}`} className="body-s break-words">{o.operation} · generation {o.generation} · {o.revisionId ?? "withdrawn"} · {o.at}</li>)}</ol> : <p>No operations were returned in this read. This is not evidence that a timed-out command failed.</p>}
    </div>
    <p className="body-s text-ink-2">No automatic retries or public pricing. Commerce and Care activation remain unchanged. Reload reads committed state; exact-key replay is available only while the in-tab command is retained.</p>
  </section>;
}
