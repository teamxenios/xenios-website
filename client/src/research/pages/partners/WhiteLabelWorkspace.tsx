import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useResearch } from "../../core";
import { ResearchDataTable, ResearchStatusBadge } from "../../ui/kit";
import {
  addWhiteLabelSelection,
  getWhiteLabelWorkspace,
  openWhiteLabelSupport,
  requestWhiteLabelQuote,
  saveWhiteLabelBrand,
  setWhiteLabelFulfillment,
  submitWhiteLabelApplication,
} from "../../adapters/whiteLabel";
import { submitWhiteLabelPackaging } from "../../adapters/whiteLabelPackaging";
import type {
  WhiteLabelBrandMode,
  WhiteLabelFulfillmentMode,
  WhiteLabelWorkspaceView,
} from "@shared/research/partners/white-label";

type LoadState = "loading" | "ready" | "unavailable" | "unauthorized" | "error";
type Feedback = { tone: "success" | "error" | "pending"; message: string } | null;

const BRAND_OPTIONS: Array<{ value: WhiteLabelBrandMode; label: string }> = [
  { value: "partner_branded", label: "Partner-branded" },
  { value: "co_branded", label: "Co-branded" },
  { value: "powered_by_xenios", label: "Powered by Xenios" },
  { value: "backend_only", label: "Backend only" },
];

const FULFILLMENT_OPTIONS: Array<{ value: WhiteLabelFulfillmentMode; label: string }> = [
  { value: "blind_shipping", label: "Blind shipping" },
  { value: "xenios_drop_shipping", label: "Xenios drop shipping" },
  { value: "partner_inventory", label: "Partner-held inventory" },
  { value: "hybrid", label: "Hybrid" },
];

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `white-label-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function WhiteLabelWorkspace() {
  const { memberToken } = useResearch();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [workspace, setWorkspace] = useState<WhiteLabelWorkspaceView | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const commandKeys = useRef(new Map<string, string>());

  const [applicationName, setApplicationName] = useState("");
  const [applicationContact, setApplicationContact] = useState("");
  const [applicationEmail, setApplicationEmail] = useState("");
  const [brandName, setBrandName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [brandMode, setBrandMode] = useState<WhiteLabelBrandMode>("partner_branded");
  const [packagingNotes, setPackagingNotes] = useState("");
  const [packagingReference, setPackagingReference] = useState("");
  const [fulfillmentMode, setFulfillmentMode] = useState<WhiteLabelFulfillmentMode>("blind_shipping");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [supportSubject, setSupportSubject] = useState("");
  const [supportDetail, setSupportDetail] = useState("");

  const hydrate = useCallback((value: WhiteLabelWorkspaceView) => {
    setWorkspace(value);
    setLoadState("ready");
    setBrandName(value.brand.brandName ?? "");
    setPrimaryColor(value.brand.primaryColor ?? "");
    setSecondaryColor(value.brand.secondaryColor ?? "");
    setBrandMode(value.brand.mode ?? "partner_branded");
    setPackagingNotes(value.brand.packagingNotes ?? "");
    setPackagingReference(value.brand.packagingPreviewReference ?? "");
    setFulfillmentMode(value.fulfillmentMode ?? "blind_shipping");
  }, []);

  const load = useCallback(async () => {
    if (!memberToken) {
      setLoadState("unauthorized");
      return;
    }
    setLoadState("loading");
    const result = await getWhiteLabelWorkspace(memberToken);
    if (result.kind === "ok") {
      hydrate(result.data.workspace);
    } else if (result.kind === "unauthorized") {
      setLoadState("unauthorized");
    } else if (result.kind === "unavailable" || result.kind === "forbidden" || result.kind === "denied") {
      setLoadState("unavailable");
    } else {
      setLoadState("error");
    }
  }, [hydrate, memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  function keyFor(action: string): string {
    const existing = commandKeys.current.get(action);
    if (existing) return existing;
    const created = idempotencyKey();
    commandKeys.current.set(action, created);
    return created;
  }

  async function command(
    action: string,
    request: Promise<
      | { kind: "ok"; data: { result: { workspace: WhiteLabelWorkspaceView } } }
      | { kind: "unauthorized"; code?: string }
      | { kind: "forbidden"; code?: string; message?: string }
      | { kind: "denied"; code: string; message?: string }
      | { kind: "unavailable" }
      | { kind: "error"; code?: string; message: string }
    >,
  ) {
    if (busy) return false;
    setBusy(action);
    setFeedback(null);
    const result = await request;
    setBusy(null);
    if (result.kind === "ok") {
      commandKeys.current.delete(action);
      hydrate(result.data.result.workspace);
      setFeedback({ tone: "success", message: "Saved." });
      return true;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      setFeedback({ tone: "pending", message: "This workflow is not available yet. Nothing was submitted." });
      return false;
    }
    if (result.kind === "unauthorized") {
      setFeedback({ tone: "error", message: "Your session has ended. Sign in again before retrying." });
      return false;
    }
    setFeedback({ tone: "error", message: result.message ?? "The request could not be completed." });
    return false;
  }

  async function apply(event: FormEvent) {
    event.preventDefault();
    if (!memberToken) return;
    await command(
      "application",
      submitWhiteLabelApplication(
        {
          organizationName: applicationName.trim(),
          organizationWebsite: null,
          contactName: applicationContact.trim(),
          contactEmail: applicationEmail.trim(),
          intendedBrandMode: null,
          summary: null,
          idempotencyKey: keyFor("application"),
        },
        memberToken,
      ),
    );
  }

  if (loadState === "loading") {
    return <p className="body-s text-ink-2" role="status">Loading organization operations...</p>;
  }

  if (loadState === "unauthorized") {
    return <div className="card"><h2 className="heading-s">Sign in required</h2><p className="body-s text-ink-2 mt-2">Organization operations are private to approved partner accounts.</p></div>;
  }

  if (loadState === "error") {
    return <div className="card" role="alert"><h2 className="heading-s">Organization operations could not load</h2><button className="btn btn-secondary mt-4" type="button" onClick={() => void load()}>Try again</button></div>;
  }

  if (loadState === "unavailable" || !workspace) {
    return (
      <section aria-labelledby="white-label-apply" className="mt-10">
        <h2 id="white-label-apply" className="heading-m">White-label operations</h2>
        <p className="body-s text-ink-2 mt-2">Request review for a partner-branded, co-branded, powered-by-Xenios, or backend-only program. Approval does not create inventory, purchase labels, or start fulfillment.</p>
        <form className="card mt-4" onSubmit={(event) => void apply(event)} style={{ maxWidth: 720 }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
            <label className="form-label">Organization name<input className="input-field mt-2" value={applicationName} onChange={(event) => setApplicationName(event.target.value)} required /></label>
            <label className="form-label">Contact name<input className="input-field mt-2" value={applicationContact} onChange={(event) => setApplicationContact(event.target.value)} required /></label>
            <label className="form-label">Contact email<input className="input-field mt-2" type="email" value={applicationEmail} onChange={(event) => setApplicationEmail(event.target.value)} required /></label>
          </div>
          <button className="btn btn-primary mt-6" type="submit" disabled={busy === "application"}>{busy === "application" ? "Submitting..." : "Request white-label review"}</button>
          {feedback && <p className="body-s mt-4" role={feedback.tone === "error" ? "alert" : "status"}>{feedback.message}</p>}
        </form>
      </section>
    );
  }

  const selectedIds = workspace.selections.map((selection) => selection.selectionId);

  return (
    <section aria-labelledby="white-label-workspace" className="mt-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div><p className="mono-cap text-ink-mute">Organization operations</p><h2 id="white-label-workspace" className="heading-m mt-2">{workspace.organizationName}</h2></div>
        <div className="flex gap-2 flex-wrap"><ResearchStatusBadge label={label(workspace.applicationState)} tone={workspace.applicationState === "approved" ? "success" : "pending"} /><ResearchStatusBadge label={label(workspace.trackingState)} tone="neutral" /></div>
      </div>
      <p className="body-s text-ink-2 mt-3">Affiliate commission and white-label wholesale remain separate. This workspace cannot execute payouts, buy labels, dispatch shipments, or message customers.</p>

      {feedback && <p className="body-s mt-4" role={feedback.tone === "error" ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}

      <section aria-labelledby="white-label-brand" className="mt-10">
        <h3 id="white-label-brand" className="heading-s">Brand profile</h3>
        <form className="card mt-4" onSubmit={(event) => { event.preventDefault(); if (!memberToken) return; void command("brand", saveWhiteLabelBrand({ brandName: brandName.trim(), logoAssetReference: workspace.brand.logoAssetReference, primaryColor: primaryColor.trim() || null, secondaryColor: secondaryColor.trim() || null, mode: brandMode, packagingNotes: packagingNotes.trim() || null, expectedVersion: workspace.version, idempotencyKey: keyFor("brand") }, memberToken)); }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
            <label className="form-label">Brand name<input className="input-field mt-2" value={brandName} onChange={(event) => setBrandName(event.target.value)} required /></label>
            <label className="form-label">Presentation<select className="input-field mt-2" value={brandMode} onChange={(event) => setBrandMode(event.target.value as WhiteLabelBrandMode)}>{BRAND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="form-label">Primary color<input className="input-field mt-2" placeholder="#111111" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} /></label>
            <label className="form-label">Secondary color<input className="input-field mt-2" placeholder="#ffffff" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} /></label>
          </div>
          <label className="form-label mt-4">Packaging notes<textarea className="input-field mt-2" rows={3} value={packagingNotes} onChange={(event) => setPackagingNotes(event.target.value)} /></label>
          <button className="btn btn-primary mt-6" type="submit" disabled={busy === "brand"}>{busy === "brand" ? "Saving..." : "Save brand profile"}</button>
        </form>
      </section>

      <section aria-labelledby="white-label-products" className="mt-10">
        <h3 id="white-label-products" className="heading-s">Eligible product variants</h3>
        <p className="body-s text-ink-2 mt-2">Selection is exact by SKU. Quality status is shown separately and is rechecked before a quote.</p>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
          {workspace.variants.map((variant) => <article className="card" key={variant.variantId}><p className="body-m font-700">{variant.productName}</p><p className="body-s text-ink-2 mt-1">{variant.variantName} · {variant.sku}</p><ResearchStatusBadge label={label(variant.qualityState)} tone={variant.qualityState === "verified" ? "success" : "pending"} /><label className="form-label mt-4">Requested units<input className="input-field mt-2" type="number" min={1} step={1} value={quantities[variant.sku] ?? 1} onChange={(event) => setQuantities((current) => ({ ...current, [variant.sku]: Number(event.target.value) }))} /></label><button className="btn btn-secondary mt-4" type="button" disabled={!variant.selectable || busy === `select:${variant.sku}`} onClick={() => { if (!memberToken) return; void command(`select:${variant.sku}`, addWhiteLabelSelection({ sku: variant.sku, requestedQuantity: quantities[variant.sku] ?? 1, expectedVersion: workspace.version, idempotencyKey: keyFor(`select:${variant.sku}`) }, memberToken)); }}>{variant.selectable ? "Add exact variant" : variant.unavailableReason ?? "Unavailable"}</button></article>)}
          {workspace.variants.length === 0 && <div className="card"><p className="body-s text-ink-2">No variants are approved for this workspace.</p></div>}
        </div>
      </section>

      <section aria-labelledby="white-label-quotes" className="mt-10">
        <div className="flex items-center justify-between gap-4 flex-wrap"><h3 id="white-label-quotes" className="heading-s">Selections and quotes</h3><button className="btn btn-primary" type="button" disabled={selectedIds.length === 0 || busy === "quote"} onClick={() => { if (!memberToken) return; void command("quote", requestWhiteLabelQuote({ selectionIds: selectedIds, note: null, expectedVersion: workspace.version, idempotencyKey: keyFor("quote") }, memberToken)); }}>Request quote review</button></div>
        <ResearchDataTable caption="Exact selected variants" columns={[{ key: "product", header: "Product", render: (row) => row.productName }, { key: "variant", header: "Variant", render: (row) => `${row.variantName} · ${row.sku}` }, { key: "quantity", header: "Units", render: (row) => row.requestedQuantity }, { key: "quality", header: "Quality", render: (row) => label(row.qualityState) }]} rows={[...workspace.selections]} rowKey={(row) => row.selectionId} empty="No exact variants have been selected." />
        <ResearchDataTable caption="White-label wholesale quote history" columns={[{ key: "state", header: "Status", render: (row) => label(row.state) }, { key: "amount", header: "Quoted amount", render: (row) => row.amountCents === null || row.currency === null ? "Under review" : new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency }).format(row.amountCents / 100) }, { key: "version", header: "Version", render: (row) => row.version }, { key: "expires", header: "Expires", render: (row) => row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : "—" }]} rows={[...workspace.quotes]} rowKey={(row) => row.quoteId} empty="No quote has been requested." />
      </section>

      <section aria-labelledby="white-label-packaging" className="mt-10">
        <h3 id="white-label-packaging" className="heading-s">Label and packaging review</h3>
        <form className="card mt-4" onSubmit={(event) => { event.preventDefault(); if (!memberToken) return; void command("packaging", submitWhiteLabelPackaging({ packagingPreviewReference: packagingReference.trim(), expectedVersion: workspace.version, idempotencyKey: keyFor("packaging") }, memberToken)); }}><p className="body-s text-ink-2">Submit an approved private asset reference for review. This does not purchase or print a label.</p><label className="form-label mt-4">Preview reference<input className="input-field mt-2" value={packagingReference} onChange={(event) => setPackagingReference(event.target.value)} required /></label><button className="btn btn-primary mt-6" type="submit" disabled={busy === "packaging"}>Submit preview for review</button></form>
      </section>

      <section aria-labelledby="white-label-fulfillment" className="mt-10">
        <h3 id="white-label-fulfillment" className="heading-s">Fulfillment preference</h3>
        <form className="card mt-4" onSubmit={(event) => { event.preventDefault(); if (!memberToken) return; void command("fulfillment", setWhiteLabelFulfillment({ mode: fulfillmentMode, expectedVersion: workspace.version, idempotencyKey: keyFor("fulfillment") }, memberToken)); }}><label className="form-label">Operating model<select className="input-field mt-2" value={fulfillmentMode} onChange={(event) => setFulfillmentMode(event.target.value as WhiteLabelFulfillmentMode)}>{FULFILLMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p className="body-s text-ink-2 mt-3">Saving a preference does not allocate inventory or dispatch a shipment.</p><button className="btn btn-primary mt-6" type="submit" disabled={busy === "fulfillment"}>Save fulfillment preference</button></form>
      </section>

      <section aria-labelledby="white-label-support" className="mt-10">
        <h3 id="white-label-support" className="heading-s">Support</h3>
        <form className="card mt-4" onSubmit={async (event) => { event.preventDefault(); if (!memberToken) return; const saved = await command("support", openWhiteLabelSupport({ subject: supportSubject.trim(), topic: "other", detail: supportDetail.trim(), expectedVersion: workspace.version, idempotencyKey: keyFor("support") }, memberToken)); if (saved) { setSupportSubject(""); setSupportDetail(""); } }}><label className="form-label">Subject<input className="input-field mt-2" value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} required /></label><label className="form-label mt-4">What do you need help with?<textarea className="input-field mt-2" rows={4} value={supportDetail} onChange={(event) => setSupportDetail(event.target.value)} required /></label><button className="btn btn-primary mt-6" type="submit" disabled={busy === "support"}>Open support request</button></form>
      </section>
    </section>
  );
}
