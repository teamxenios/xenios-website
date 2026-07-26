import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type { CareLabCase } from "@shared/care/communications";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; labCases: CareLabCase[] };

export default function CareLabReviewPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [inputs, setInputs] = useState<Record<string, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await careApiFetch("/api/care/labs/reviewer");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) return setState({ kind: "forbidden" });
      if (response.status === 503 && body?.code === "care_disabled") return setState({ kind: "disabled" });
      if (!response.ok || !Array.isArray(body.labCases)) throw new Error("unavailable");
      setState({ kind: "ready", labCases: body.labCases });
    } catch {
      setState({ kind: "error" });
    }
  }, []);
  useEffect(() => void load(), [load]);

  const act = async (labCase: CareLabCase) => {
    const action =
      labCase.status === "awaiting_order_reference" ? "record_order_reference"
      : labCase.status === "order_reference_recorded" ? "record_result_reference"
      : labCase.status === "result_reference_recorded" ? "review"
      : labCase.status === "reviewed" ? "close"
      : null;
    if (!action) return;
    setBusyId(labCase.id);
    try {
      const values = inputs[labCase.id] ?? {};
      const response = await careApiFetch(`/api/care/labs/reviewer/${labCase.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: labCase.version,
          action,
          providerReference: values.providerReference || null,
          orderReference: values.orderReference || null,
          resultReference: values.resultReference || null,
          secureObjectReference: values.secureObjectReference || null,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error("lab_action_failed");
      await load();
    } catch {
      setState({ kind: "error" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="overflow-x-clip">
      <PageShell>
        <SeoHead title="Assigned laboratory review, xenios" description="Restricted Care laboratory reference workflow." path="/care/labs/review" />
        <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
          <p className="mono-cap text-pulse mb-6">CARE · LABORATORY REVIEW</p>
          <h1 className="display-m max-w-[18ch]">Verify references without inventing results.</h1>
          <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
            This queue records real provider, order, result, and private object
            references. It does not place an order, display ranges, interpret a
            result, or contact a laboratory.
          </p>
          <section className="mt-10 max-w-[920px]" aria-live="polite" aria-busy={state.kind === "loading"}>
            {state.kind === "loading" && <div className="card"><h2 className="h2">Checking laboratory assignments…</h2><p className="body-m text-ink-mute mt-4">No action is available while authorization is confirmed.</p></div>}
            {state.kind === "disabled" && <div className="card"><h2 className="h2">Laboratory review is disabled.</h2><p className="body-m text-ink-2 mt-4">No provider or order action can occur.</p></div>}
            {state.kind === "forbidden" && <div className="card"><h2 className="h2">Assigned lab-reviewer access is required.</h2><p className="body-m text-ink-2 mt-4">Only the active reviewer assigned to the record can continue.</p></div>}
            {state.kind === "error" && <div className="card"><h2 className="h2">Laboratory references are temporarily unavailable.</h2><p className="body-m text-ink-2 mt-4">Nothing was changed.</p><button type="button" className="btn btn-secondary mt-6" onClick={() => void load()}>Try again</button></div>}
            {state.kind === "ready" && state.labCases.length === 0 && <div className="card"><h2 className="h2">No laboratory records are assigned.</h2><p className="body-m text-ink-2 mt-4">No provider, order, result, or interpretation is implied.</p></div>}
            {state.kind === "ready" && state.labCases.length > 0 && (
              <div className="grid grid-cols-1 gap-4">
                {state.labCases.map((labCase) => {
                  const values = inputs[labCase.id] ?? {};
                  return (
                    <article className="card" key={labCase.id}>
                      <p className="mono-label text-pulse">{labCase.status.replaceAll("_", " ")}</p>
                      <h2 className="h3 mt-2">Assigned laboratory metadata</h2>
                      {labCase.status === "awaiting_order_reference" && (
                        <div className="mt-5 grid grid-cols-1 gap-4">
                          <label className="body-m">Laboratory provider reference<input className="input mt-2 w-full" value={values.providerReference ?? ""} onChange={(event) => setInputs((current) => ({ ...current, [labCase.id]: { ...values, providerReference: event.target.value } }))} /></label>
                          <label className="body-m">Laboratory order reference<input className="input mt-2 w-full" value={values.orderReference ?? ""} onChange={(event) => setInputs((current) => ({ ...current, [labCase.id]: { ...values, orderReference: event.target.value } }))} /></label>
                        </div>
                      )}
                      {labCase.status === "order_reference_recorded" && (
                        <div className="mt-5 grid grid-cols-1 gap-4">
                          <label className="body-m">Laboratory result reference<input className="input mt-2 w-full" value={values.resultReference ?? ""} onChange={(event) => setInputs((current) => ({ ...current, [labCase.id]: { ...values, resultReference: event.target.value } }))} /></label>
                          <label className="body-m">Private file reference<input className="input mt-2 w-full" value={values.secureObjectReference ?? ""} onChange={(event) => setInputs((current) => ({ ...current, [labCase.id]: { ...values, secureObjectReference: event.target.value } }))} /></label>
                        </div>
                      )}
                      <button type="button" className="btn btn-primary mt-6" disabled={busyId === labCase.id || labCase.status === "closed"} onClick={() => void act(labCase)}>
                        {busyId === labCase.id ? "Recording…" : labCase.status === "awaiting_order_reference" ? "Record order references" : labCase.status === "order_reference_recorded" ? "Record result references" : labCase.status === "result_reference_recorded" ? "Confirm metadata review" : labCase.status === "reviewed" ? "Close metadata record" : "Closed"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </PageShell>
    </div>
  );
}
