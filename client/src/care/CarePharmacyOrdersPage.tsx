import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type { CarePharmacyAction, CarePharmacyOrder } from "@shared/care/prescriptions";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; orders: CarePharmacyOrder[] };

const nextAction: Partial<Record<CarePharmacyOrder["status"], CarePharmacyAction>> = {
  pending_pharmacy: "receive",
  received: "accept",
  clarification_requested: "cancel",
  accepted: "dispense",
  dispensed: "ship",
  shipped: "deliver",
};
const actionLabel: Record<CarePharmacyAction, string> = {
  receive: "Acknowledge receipt",
  request_clarification: "Request clarification",
  accept: "Accept order",
  reject: "Reject order",
  dispense: "Confirm dispensing",
  ship: "Confirm shipment",
  deliver: "Confirm delivery",
  cancel: "Cancel order",
};

export default function CarePharmacyOrdersPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await careApiFetch("/api/care/pharmacy/orders");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) return setState({ kind: "forbidden" });
      if (response.status === 503 && body?.code === "care_disabled") return setState({ kind: "disabled" });
      if (!response.ok || body?.ok !== true || !Array.isArray(body.orders)) throw new Error("unavailable");
      setState({ kind: "ready", orders: body.orders });
    } catch {
      setState({ kind: "error" });
    }
  }, []);
  useEffect(() => void load(), [load]);

  const apply = async (order: CarePharmacyOrder, action: CarePharmacyAction) => {
    setBusyOrder(order.id);
    try {
      const reference = references[order.id]?.trim() || null;
      const response = await careApiFetch(`/api/care/pharmacy/orders/${order.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          expectedVersion: order.version,
          clarificationReference: action === "request_clarification" ? reference : null,
          trackingReference: action === "ship" ? reference : null,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error("write_failed");
      await load();
    } catch {
      setState({ kind: "error" });
    } finally {
      setBusyOrder(null);
    }
  };

  return (
    <PageShell>
      <SeoHead title="Care pharmacy, xenios" description="Restricted Care pharmacy workflow." path="/care/pharmacy" />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · PHARMACY</p>
        <h1 className="display-m max-w-[18ch]">One verified action at a time.</h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">This queue is restricted to verified operators at the assigned pharmacy. It exposes only the records required for that assignment.</p>
        <section className="mt-10 max-w-[980px]" aria-live="polite" aria-busy={state.kind === "loading"}>
          {state.kind === "loading" && <div className="card"><h2 className="h2">Loading assigned orders…</h2><p className="body-m text-ink-mute mt-4">No action is available while authorization is confirmed.</p></div>}
          {state.kind === "disabled" && <div className="card"><h2 className="h2">Pharmacy operations are disabled.</h2><p className="body-m text-ink-2 mt-4">No prescription or fulfillment action can be taken.</p></div>}
          {state.kind === "forbidden" && <div className="card"><h2 className="h2">Authorized pharmacy access is required.</h2><p className="body-m text-ink-2 mt-4">This queue is available only to an active operator at the assigned pharmacy.</p></div>}
          {state.kind === "error" && <div className="card"><h2 className="h2">The pharmacy queue is temporarily unavailable.</h2><p className="body-m text-ink-2 mt-4">Nothing was changed. Confirm the queue before continuing.</p><button type="button" className="btn btn-secondary mt-6" onClick={() => void load()}>Try again</button></div>}
          {state.kind === "ready" && state.orders.length === 0 && <div className="card"><h2 className="h2">No orders are assigned.</h2><p className="body-m text-ink-2 mt-4">New work appears only after a clinical administrator assigns a signed prescription to this verified pharmacy.</p></div>}
          {state.kind === "ready" && state.orders.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              {state.orders.map((order) => {
                const action = nextAction[order.status];
                const needsReference = action === "ship";
                const canRequestClarification =
                  order.status === "received" || order.status === "accepted";
                const reference = references[order.id]?.trim() ?? "";
                return (
                  <article className="card" key={order.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div><p className="mono-label text-pulse">{order.status.replaceAll("_", " ")}</p><h2 className="h3 mt-2">Assigned Care pharmacy order</h2></div>
                      <span className="mono-label text-ink-mute">{order.patientStateCode} COVERAGE VERIFIED</span>
                    </div>
                    {order.prescriptionContent && <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div><dt className="mono-label text-ink-mute">FORMULATION</dt><dd className="body-m mt-2">{order.prescriptionContent.formulation}</dd></div>
                      <div><dt className="mono-label text-ink-mute">CONCENTRATION</dt><dd className="body-m mt-2">{order.prescriptionContent.concentration}</dd></div>
                      <div><dt className="mono-label text-ink-mute">ROUTE</dt><dd className="body-m mt-2">{order.prescriptionContent.route}</dd></div>
                      <div><dt className="mono-label text-ink-mute">QUANTITY</dt><dd className="body-m mt-2">{order.prescriptionContent.quantity}</dd></div>
                      <div className="sm:col-span-2"><dt className="mono-label text-ink-mute">DIRECTIONS</dt><dd className="body-m mt-2 whitespace-pre-wrap">{order.prescriptionContent.directions}</dd></div>
                    </dl>}
                    {order.status === "clarification_requested" && (
                      <div className="rule-top mt-6 pt-6">
                        <p className="mono-label text-ink">CLINICIAN RESPONSE REQUIRED</p>
                        <p className="body-m text-ink-2 mt-3">This clarification remains open until the assigned clinician or a clinical administrator records a private resolution reference.</p>
                        <p className="body-m text-ink-2 mt-3">The assigned pharmacy may cancel the order without resolving or advancing the clinical workflow.</p>
                      </div>
                    )}
                    {(action || canRequestClarification) && <div className="rule-top mt-6 pt-6">
                      {(needsReference || canRequestClarification) && <label className="block max-w-[520px]">
                        <span className="mono-label text-ink">{needsReference ? "PRIVATE TRACKING REFERENCE" : "CLARIFICATION REQUEST REFERENCE"}</span>
                        <input className="input mt-3 w-full" value={references[order.id] ?? ""} onChange={(event) => setReferences((current) => ({ ...current, [order.id]: event.target.value }))} required />
                      </label>}
                      {action && <button type="button" className="btn btn-primary mt-5" disabled={busyOrder === order.id || (needsReference && !reference)} onClick={() => void apply(order, action)}>
                        {busyOrder === order.id ? "Saving…" : actionLabel[action]}
                      </button>}
                      {canRequestClarification && <button type="button" className="btn btn-secondary mt-5 sm:ml-3" disabled={busyOrder === order.id || !reference} onClick={() => void apply(order, "request_clarification")}>
                        Request clarification
                      </button>}
                    </div>}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
