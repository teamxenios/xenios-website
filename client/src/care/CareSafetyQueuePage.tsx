import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import {
  CARE_EMERGENCY_GUIDANCE,
  type CareAdverseEvent,
} from "@shared/care/communications";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; adverseEvents: CareAdverseEvent[] };

export default function CareSafetyQueuePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await careApiFetch("/api/care/adverse-events/support/assigned");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) return setState({ kind: "forbidden" });
      if (response.status === 503 && body?.code === "care_disabled") return setState({ kind: "disabled" });
      if (!response.ok || !Array.isArray(body.adverseEvents)) throw new Error("unavailable");
      setState({ kind: "ready", adverseEvents: body.adverseEvents });
    } catch {
      setState({ kind: "error" });
    }
  }, []);
  useEffect(() => void load(), [load]);

  const act = async (
    item: CareAdverseEvent,
    action: "acknowledge" | "escalate" | "close",
  ) => {
    setBusyId(item.id);
    try {
      const response = await careApiFetch(`/api/care/adverse-events/support/${item.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: item.version,
          action,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error("issue_action_failed");
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
        <SeoHead title="Assigned Care safety records, xenios" description="Restricted internal adverse-event and quality-issue workflow." path="/care/support/safety" />
        <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
          <p className="mono-cap text-pulse mb-6">CARE · SAFETY RECORDS</p>
          <h1 className="display-m max-w-[18ch]">Assigned concerns, with explicit ownership.</h1>
          <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
            Acknowledgment and escalation update only the private Care record.
            This foundation does not diagnose, recommend treatment, notify an
            external party, or replace emergency services.
          </p>
          <div className="card mt-8 max-w-[920px]"><p className="body-m">{CARE_EMERGENCY_GUIDANCE}</p></div>
          <section className="mt-6 max-w-[920px]" aria-live="polite" aria-busy={state.kind === "loading"}>
            {state.kind === "loading" && <div className="card"><h2 className="h2">Checking assigned safety records…</h2><p className="body-m text-ink-mute mt-4">No action is available until ownership is confirmed.</p></div>}
            {state.kind === "disabled" && <div className="card"><h2 className="h2">The Care safety queue is disabled.</h2><p className="body-m text-ink-2 mt-4">No acknowledgment or escalation can be recorded.</p></div>}
            {state.kind === "forbidden" && <div className="card"><h2 className="h2">Assigned clinical-support access is required.</h2><p className="body-m text-ink-2 mt-4">Unassigned users cannot view or change these records.</p></div>}
            {state.kind === "error" && <div className="card"><h2 className="h2">Assigned safety records are temporarily unavailable.</h2><p className="body-m text-ink-2 mt-4">Nothing was changed or escalated.</p><button className="btn btn-secondary mt-6" type="button" onClick={() => void load()}>Try again</button></div>}
            {state.kind === "ready" && state.adverseEvents.length === 0 && <div className="card"><h2 className="h2">No safety records are assigned.</h2><p className="body-m text-ink-2 mt-4">Only explicitly assigned adverse events and quality concerns appear here.</p></div>}
            {state.kind === "ready" && state.adverseEvents.length > 0 && (
              <div className="grid grid-cols-1 gap-4">
                {state.adverseEvents.map((item) => (
                  <article className="card" key={item.id}>
                    <p className="mono-label text-pulse">{item.urgency} · {item.status}</p>
                    <h2 className="h3 mt-2">{item.category.replaceAll("_", " ")}</h2>
                    <p className="body-m text-ink-2 mt-4 whitespace-pre-wrap">{item.summary}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      {item.status === "reported" && <button type="button" className="btn btn-primary" disabled={busyId === item.id} onClick={() => void act(item, "acknowledge")}>Acknowledge record</button>}
                      {["reported", "acknowledged"].includes(item.status) && <button type="button" className="btn btn-secondary" disabled={busyId === item.id} onClick={() => void act(item, "escalate")}>Record internal escalation</button>}
                      {["acknowledged", "escalated"].includes(item.status) && item.urgency !== "possible_emergency" && <button type="button" className="btn btn-secondary" disabled={busyId === item.id} onClick={() => void act(item, "close")}>Close record</button>}
                      {item.status === "escalated" && item.urgency === "possible_emergency" && <button type="button" className="btn btn-secondary" disabled={busyId === item.id} onClick={() => void act(item, "close")}>Close escalated record</button>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </PageShell>
    </div>
  );
}
