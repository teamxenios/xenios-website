import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { MetricResult, ResponseChannel, ResponsePopulation } from "@shared/research/analytics/operations";
import { AdminScreen } from "../pages/adminx/AdminResearchHome";
import type { AdminSessionBinding } from "../pages/adminx/auth";
import { ResearchLoadingState } from "../ui/kit";
import { OperationsInsights } from "./OperationsInsights";
import { createOperationsAnalyticsClient, parseOperationsMetrics, type OperationsAnalyticsQuery } from "./api";

type Denial = "sign_in_required" | "forbidden" | "superseded";
type Phase = "idle" | "loading" | "ready" | "unavailable" | "invalid_request" | "cancelled";
function todayInChicago(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch { return ""; }
}
function SessionNotice({ code }: { code: Denial | "missing" }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [code]);
  return <div className="ra-state" role="alert">
    <h2 className="body-l font-700" tabIndex={-1} ref={heading}>{code === "forbidden" ? "Analytics access denied" : code === "sign_in_required" ? "Sign in again" : code === "superseded" ? "Analytics session changed" : "Analytics session unavailable"}</h2>
    <p className="body-m mt-3">Report data has been cleared. Open analytics through the current staff sign-in before loading another report.</p>
    <a href="/research/support" className="btn btn-secondary mt-4">Contact support</a>
  </div>;
}

export default function OperationsAnalyticsPage() {
  return <AdminScreen title="Operations insights" lead="Review verified operational reporting for a selected Chicago calendar day.">
    {(_token: string, binding?: AdminSessionBinding | null) => <BoundReport binding={binding ?? null} />}
  </AdminScreen>;
}

function BoundReport({ binding }: { binding: AdminSessionBinding | null }) {
  const live = useRef(binding); live.current = binding;
  const lifetime = useRef({ binding, generation: binding?.generation, serial: 0, denial: null as Denial | null });
  const [, renderDenial] = useState(0);
  if (lifetime.current.binding !== binding || lifetime.current.generation !== binding?.generation) {
    lifetime.current = { binding, generation: binding?.generation, serial: lifetime.current.serial + 1, denial: null };
  }
  const serial = lifetime.current.serial;
  const same = () => live.current === binding && lifetime.current.serial === serial;
  const current = () => {
    try {
      return same() && lifetime.current.denial === null && typeof binding?.generation === "string" && Boolean(binding.generation)
        && typeof binding.isCurrent === "function" && typeof binding.sessionFence === "function" && binding.isCurrent() === true;
    } catch { return false; }
  };
  function deny(code: Denial) {
    if (!same() || lifetime.current.denial) return;
    lifetime.current.denial = code; renderDenial((value) => value + 1);
  }
  if (lifetime.current.denial) return <SessionNotice code={lifetime.current.denial} />;
  if (!binding) return <SessionNotice code="missing" />;
  if (!current()) { lifetime.current.denial = "superseded"; return <SessionNotice code="superseded" />; }
  return <ReportLifetime key={serial} binding={binding} sameBinding={same} isCurrent={current} onDenied={deny} />;
}

function ReportLifetime({ binding, sameBinding, isCurrent, onDenied }: {
  binding: AdminSessionBinding; sameBinding(): boolean; isCurrent(): boolean; onDenied(code: Denial): void;
}) {
  const id = useId();
  const [day, setDay] = useState(todayInChicago);
  const [population, setPopulation] = useState<ResponsePopulation>("request");
  const [channel, setChannel] = useState<ResponseChannel>("portal_published");
  const [phase, setPhase] = useState<Phase>("loading");
  const [report, setReport] = useState<readonly MetricResult[] | null>(null);
  const active = useRef(false), alive = useRef(false), sequence = useRef(0), lifecycle = useRef(0);
  const message = useRef<HTMLDivElement>(null);
  const owner = useRef({ sameBinding, isCurrent, onDenied }); owner.current = { sameBinding, isCurrent, onDenied };
  const client = useMemo(() => createOperationsAnalyticsClient({ sessionFence: (session) => {
    try { return owner.current.isCurrent() && binding.sessionFence(session) === true; } catch { return false; }
  } }), [binding]);
  function cancel() {
    sequence.current += 1; active.current = false; client.cancel(); setReport(null); setPhase("cancelled");
  }
  function change() {
    sequence.current += 1; active.current = false; client.cancel(); setReport(null); setPhase("idle");
  }
  async function load(query: OperationsAnalyticsQuery) {
    if (!alive.current || !owner.current.isCurrent() || active.current) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.day)
      || !["request", "support_case"].includes(query.responsePopulation ?? "")
      || !["portal_published", "email_provider_accepted"].includes(query.responseChannel ?? "")) {
      setReport(null); setPhase("invalid_request"); return;
    }
    const operation = ++sequence.current, epoch = lifecycle.current;
    active.current = true; setReport(null); setPhase("loading");
    const stillBound = () => alive.current && lifecycle.current === epoch && owner.current.sameBinding();
    try {
      const result = await client.load(query);
      if (!stillBound()) return;
      // Current-binding authentication refusal clears the report before any
      // request-order guard. An obsolete binding cannot deny its successor.
      if (result.kind === "error" && (result.code === "sign_in_required" || result.code === "forbidden")) {
        setReport(null); client.cancel(); owner.current.onDenied(result.code); return;
      }
      if (!owner.current.isCurrent()) { setReport(null); client.cancel(); owner.current.onDenied("superseded"); return; }
      if (operation !== sequence.current) return;
      if (result.kind === "ready") {
        const parsed = parseOperationsMetrics(result.report);
        if (!parsed) { setPhase("unavailable"); return; }
        setReport(parsed); setPhase("ready");
      } else if (result.code === "superseded") {
        setReport(null); owner.current.onDenied("superseded");
      } else { setReport(null); setPhase(result.code === "invalid_request" ? "invalid_request" : "unavailable"); }
    } catch {
      if (stillBound() && operation === sequence.current) { setReport(null); setPhase("unavailable"); }
    } finally { if (stillBound() && operation === sequence.current) active.current = false; }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); void load({ day, responsePopulation: population, responseChannel: channel });
  }
  useLayoutEffect(() => {
    alive.current = true; lifecycle.current += 1;
    void load({ day, responsePopulation: population, responseChannel: channel });
    return () => { alive.current = false; lifecycle.current += 1; sequence.current += 1; active.current = false; client.cancel(); };
  }, [client]);
  useEffect(() => { if (["unavailable", "invalid_request", "cancelled"].includes(phase)) message.current?.focus(); }, [phase]);
  if (!isCurrent()) return null;
  return <section aria-label="Analytics report controls and results" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <form onSubmit={submit} noValidate className="flex flex-wrap gap-4 items-end mb-6" aria-busy={phase === "loading"}>
      <div style={{ flex: "1 1 12rem", minWidth: 0 }}><label htmlFor={`${id}-day`} className="form-label">Report day (America/Chicago)</label>
        <input id={`${id}-day`} name="day" type="date" className="input-field" value={day} onChange={(event) => { change(); setDay(event.target.value); }}
          aria-invalid={phase === "invalid_request" || undefined} aria-describedby={`${id}-date-help`} required style={{ width: "100%", minHeight: 44 }} />
        <p id={`${id}-date-help`} className="body-s mt-2">A Chicago calendar day; the end of the window is excluded.</p></div>
      <div style={{ flex: "1 1 12rem", minWidth: 0 }}><label htmlFor={`${id}-population`} className="form-label">Response population</label>
        <select id={`${id}-population`} name="responsePopulation" className="input-field" value={population} style={{ width: "100%", minHeight: 44 }}
          onChange={(event) => { change(); setPopulation(event.target.value as ResponsePopulation); }}>
          <option value="request">Customer requests</option><option value="support_case">Support cases</option></select></div>
      <div style={{ flex: "1 1 12rem", minWidth: 0 }}><label htmlFor={`${id}-channel`} className="form-label">Response channel</label>
        <select id={`${id}-channel`} name="responseChannel" className="input-field" value={channel} style={{ width: "100%", minHeight: 44 }}
          onChange={(event) => { change(); setChannel(event.target.value as ResponseChannel); }}>
          <option value="portal_published">Private portal publication</option><option value="email_provider_accepted">Email provider acceptance</option></select></div>
      <button type="submit" className="btn btn-primary" disabled={phase === "loading"} style={{ minHeight: 44 }}>Load report</button>
      {phase === "loading" && <button type="button" className="btn btn-secondary" onClick={cancel} style={{ minHeight: 44 }}>Cancel report read</button>}
    </form>
    <p className="body-s mb-5">Not measured means the source cannot yet support that metric. Source coverage counts are not workload totals.</p>
    {phase === "loading" && <ResearchLoadingState label="Loading operations report" />}
    {phase === "idle" && <p className="ra-state" role="status">Select Load report to apply these filters.</p>}
    {(phase === "unavailable" || phase === "invalid_request" || phase === "cancelled") && <div className="ra-state" ref={message} tabIndex={-1} role={phase === "cancelled" ? "status" : "alert"}>
      <h2 className="body-l font-700">{phase === "cancelled" ? "Report read cancelled" : phase === "invalid_request" ? "Check the report filters" : "Report unavailable"}</h2>
      <p>{phase === "cancelled" ? "You stopped this read. No report is displayed." : phase === "invalid_request" ? "Choose a valid calendar day, population and channel." : "A complete verified report could not be loaded. No workload has been inferred."}</p>
      <button type="button" className="btn btn-secondary mt-4" onClick={() => void load({ day, responsePopulation: population, responseChannel: channel })} style={{ minHeight: 44 }}>Retry report</button>
    </div>}
    {phase === "ready" && report && <OperationsInsights data={{ state: "ready", report }} onRefresh={() => void load({ day, responsePopulation: population, responseChannel: channel })} />}
  </section>;
}
