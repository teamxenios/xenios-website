import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ReferralLifecycle } from "@shared/research/referral-v1";
import { loadReferralLifecycle } from "../../recommendation/api";
import { AdminScreen } from "./AdminResearchHome";

const eventLabels = { link_issued: "Link issued", link_revoked: "Link revoked", capture_recorded: "Referral captured", account_bound: "Account linked" };
const stateLabels = { ready: "Active", revoked: "Revoked", expired: "Expired", partner_inactive: "Partner inactive", unavailable: "Unavailable" };
const availabilityLabels = { ready: "Available", revoked: "Revoked", expired: "Expired", partner_inactive: "Partner inactive", self_referral: "Self-referral — ineligible" };
const hasStrings = (row: unknown, fields: string[]) => !!row && typeof row === "object" && fields.every(field => typeof (row as Record<string, unknown>)[field] === "string");
export function validLifecycle(value: unknown): value is ReferralLifecycle {
  if (!value || typeof value !== "object") return false;
  const data = value as ReferralLifecycle;
  return data.correctionsSupported === false
    && Array.isArray(data.links) && data.links.every(row => hasStrings(row, ["id", "partnerId", "state", "destinationPath", "createdAt", "expiresAt"])
      && Object.hasOwn(stateLabels, row.state) && Number.isSafeInteger(row.opens) && row.opens >= 0 && Number.isSafeInteger(row.accountsLinked) && row.accountsLinked >= 0)
    && Array.isArray(data.events) && data.events.every(row => hasStrings(row, ["id", "eventType", "partnerId", "linkId", "occurredAt"]) && Object.hasOwn(eventLabels, row.eventType))
    && Array.isArray(data.bindings) && data.bindings.every(row => hasStrings(row, ["accountKey", "partnerId", "linkId", "touchId", "boundAt", "availability"]) && Object.hasOwn(availabilityLabels, row.availability))
    && Array.isArray(data.touches) && data.touches.every(row => hasStrings(row, ["touchId", "linkId", "partnerId", "capturedAt", "expiresAt", "availability"]) && Object.hasOwn(availabilityLabels, row.availability))
    && !!data.lineage && ["available", "unavailable"].includes(data.lineage.state)
    && Array.isArray(data.lineage.records) && data.lineage.records.every(row => hasStrings(row, ["accountKey", "type", "reference", "state", "occurredAt"]) && ["request", "order"].includes(row.type) && row.attribution === "account_binding_only");
}
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Unavailable";
function Fields({ items }: { items: Array<[string, ReactNode]> }) {
  return <dl className="body-s grid gap-2">{items.map(([label, value]) => <div key={label} style={{ minWidth: 0, overflowWrap: "anywhere" }}><dt className="text-ink-mute">{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section aria-label={title} style={{ minWidth: 0 }}><h2 className="body-l">{title}</h2><p className="body-s text-ink-mute mt-2">{count === 0 ? "No records returned in this snapshot." : `Showing ${Math.min(count, 100)} of ${count} records returned in this snapshot.`}</p><div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", minWidth: 0 }}>{children}</div></section>;
}

export function ReferralLifecycleBody({ token }: { token: string }) {
  const [data, setData] = useState<ReferralLifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const generation = useRef(0);
  const refresh = async () => {
    const current = ++generation.current;
    setLoading(true);
    setData(null);
    setError("");
    const result = await loadReferralLifecycle(token);
    if (!alive.current || generation.current !== current) return;
    setLoading(false);
    if (result.kind === "error") {
      setError(result.status === 401 ? "Your admin session has ended. Sign in again."
        : result.status === 403 ? "This account is not authorized to read referral lifecycle records."
          : "Referral lifecycle data is unavailable. No empty totals or completed states can be inferred.");
    } else if (!validLifecycle(result.data)) setError("The lifecycle response could not be read safely. No totals or completed states can be inferred.");
    else setData(result.data);
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => { alive.current = false; generation.current++; };
  }, [token]);

  return <div className="grid gap-6" style={{ minWidth: 0 }}>
    <div className="card"><p className="body-s">Read-only, bounded server snapshot. These sections show up to 100 returned records each, not lifetime totals. Referral capture and account binding do not prove an order, settled payment, earned commission, or clinical eligibility.</p><p className="body-s mt-2">Attribution corrections are not supported here. Preserve the recorded audit trail and use the authorized review process for an exception.</p><button className="btn btn-secondary mt-3" type="button" style={{ minHeight: 44 }} disabled={loading} onClick={() => void refresh()}>Refresh lifecycle</button></div>
    {loading && <p role="status">Reading authorized referral records…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <Section title="Recommendation links" count={data.links.length}>{data.links.slice(0, 100).map(row => <article className="card" key={row.id}><Fields items={[["Link", row.id], ["Partner", row.partnerId], ["State", stateLabels[row.state]], ["Destination", row.destinationPath], ["Created", date(row.createdAt)], ["Expires", date(row.expiresAt)], ["Recorded opens", row.opens], ["Accounts linked", row.accountsLinked]]} /></article>)}</Section>
      <Section title="Referral touches" count={data.touches.length}>{data.touches.slice(0, 100).map(row => <article className="card" key={row.touchId}><Fields items={[["Touch", row.touchId], ["Link", row.linkId], ["Partner", row.partnerId], ["Current referral availability", availabilityLabels[row.availability]], ["Captured", date(row.capturedAt)], ["Expires", date(row.expiresAt)]]} /></article>)}</Section>
      <Section title="Verified account bindings" count={data.bindings.length}>{data.bindings.slice(0, 100).map((row, index) => <article className="card" key={`${row.accountKey}:${index}`}><Fields items={[["Account key", row.accountKey], ["Partner", row.partnerId], ["Link", row.linkId], ["Touch", row.touchId], ["Current referral availability", availabilityLabels[row.availability]], ["Bound", date(row.boundAt)]]} /></article>)}</Section>
      <section aria-label="Request and order lineage"><h2 className="body-l">Request and order lineage</h2>{data.lineage.state === "unavailable" ? <p role="status" className="body-s mt-2">Lineage is unavailable from the current source. This does not mean no request or order exists.</p> : <><p className="body-s text-ink-mute mt-2">These records match a verified account binding. They do not establish independently verified order-level referral attribution.</p><Section title="Returned lineage records" count={data.lineage.records.length}>{data.lineage.records.slice(0, 100).map((row, index) => <article className="card" key={`${row.type}:${row.reference}:${index}`}><Fields items={[["Account key", row.accountKey], ["Record type", row.type === "request" ? "Request" : "Order"], ["Reference", row.reference], ["Source state", row.state], ["Recorded", date(row.occurredAt)]]} /></article>)}</Section></>}</section>
      <Section title="Audit events" count={data.events.length}>{data.events.slice(0, 100).map(row => <article className="card" key={row.id}><Fields items={[["Event", eventLabels[row.eventType]], ["Event ID", row.id], ["Partner", row.partnerId], ["Link", row.linkId], ["Recorded", date(row.occurredAt)]]} /></article>)}</Section>
    </>}
  </div>;
}

export default function ReferralLifecyclePage() {
  return <AdminScreen title="Referral lifecycle" lead="Trace authorized link issuance, capture, verified account binding, and available downstream lineage.">{token => <ReferralLifecycleBody key={token} token={token} />}</AdminScreen>;
}
