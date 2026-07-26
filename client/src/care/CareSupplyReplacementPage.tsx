import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type { CareSupplyReplacement } from "@shared/care/instructions";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; replacements: CareSupplyReplacement[] };

export default function CareSupplyReplacementPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await careApiFetch("/api/care/supplies/pharmacy/replacements");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) return setState({ kind: "forbidden" });
      if (response.status === 503 && body?.code === "care_disabled") return setState({ kind: "disabled" });
      if (!response.ok || body?.ok !== true || !Array.isArray(body.replacements)) throw new Error("unavailable");
      setState({ kind: "ready", replacements: body.replacements });
    } catch {
      setState({ kind: "error" });
    }
  }, []);
  useEffect(() => void load(), [load]);

  const act = async (
    replacement: CareSupplyReplacement,
    action: "approve" | "fulfill",
  ) => {
    setBusyId(replacement.id);
    try {
      const response = await careApiFetch(
        `/api/care/supplies/pharmacy/replacements/${replacement.id}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: replacement.version,
            action,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) throw new Error("replacement_action_failed");
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
        <SeoHead title="Care supply replacements, xenios" description="Restricted Care supply replacement workflow." path="/care/pharmacy/replacements" />
        <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · SUPPLY REPLACEMENTS</p>
        <h1 className="display-m max-w-[18ch]">Assigned replacement work, one state at a time.</h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">Only verified operators for the assigned pharmacy can see or advance this queue. No shipment or supplier action is triggered by this foundation.</p>
        <section className="mt-10 max-w-[920px]" aria-live="polite" aria-busy={state.kind === "loading"}>
          {state.kind === "loading" && <div className="card"><h2 className="h2">Loading assigned replacements…</h2><p className="body-m text-ink-mute mt-4">No action is enabled while authorization is confirmed.</p></div>}
          {state.kind === "disabled" && <div className="card"><h2 className="h2">Supply replacements are disabled.</h2><p className="body-m text-ink-2 mt-4">No replacement or external fulfillment action can occur.</p></div>}
          {state.kind === "forbidden" && <div className="card"><h2 className="h2">Authorized pharmacy access is required.</h2><p className="body-m text-ink-2 mt-4">This queue is restricted to an active operator at the assigned pharmacy.</p></div>}
          {state.kind === "error" && <div className="card"><h2 className="h2">The replacement queue is temporarily unavailable.</h2><p className="body-m text-ink-2 mt-4">Nothing was changed. Confirm the queue before continuing.</p><button type="button" className="btn btn-secondary mt-6" onClick={() => void load()}>Try again</button></div>}
          {state.kind === "ready" && state.replacements.length === 0 && <div className="card"><h2 className="h2">No replacements are assigned.</h2><p className="body-m text-ink-2 mt-4">Requests appear only for a released patient-specific supply kit.</p></div>}
          {state.kind === "ready" && state.replacements.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              {state.replacements.map((replacement) => {
                const action = replacement.status === "requested"
                  ? "approve"
                  : replacement.status === "approved"
                    ? "fulfill"
                    : null;
                return (
                  <article className="card" key={replacement.id}>
                    <p className="mono-label text-pulse">{replacement.status}</p>
                    <h2 className="h3 mt-2">Verified supply replacement</h2>
                    <p className="body-m text-ink-2 mt-4">This record contains no generic device defaults and does not itself trigger an external shipment.</p>
                    {action && <button type="button" className="btn btn-primary mt-6" disabled={busyId === replacement.id} onClick={() => void act(replacement, action)}>
                      {busyId === replacement.id ? "Saving…" : action === "approve" ? "Approve replacement" : "Confirm fulfillment"}
                    </button>}
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
