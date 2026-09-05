import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { PARTNER_ROLES } from "@shared/research/distribution";
import { PartnerOperationInput, PartnerOperationResult, type PartnerOperation } from "@shared/research/partner-lifecycle";
import type { ApprovedUserAccess } from "@shared/research/approved-user-access";
import { performPartnerOperation } from "../../adapters/adminOps";

type Props = { token: string; inspection: ApprovedUserAccess; onPendingChange?: (pending: boolean) => void; onConfirmed?: () => void };
type OperationState =
  | { kind: "idle" | "editing"; message?: string }
  | { kind: "confirm" | "sending" | "uncertain"; input: PartnerOperation }
  | { kind: "success"; result: z.infer<typeof PartnerOperationResult> };

const ROLE_LABELS: Record<string, string> = {
  member_referral: "Member referral",
  affiliate: "Affiliate",
  research_rep: "Research representative",
  senior_research_rep: "Senior research representative",
  organization_partner: "Organization partner",
  private_community_partner: "Private community partner",
  professional_partner: "Professional partner",
  future_wholesale: "Future wholesale",
  future_institutional: "Future institutional",
};

const ACTIONS: Array<{ value: PartnerOperation["action"]; label: string }> = [
  { value: "record_clearance", label: "Record reviewed clearance" },
  { value: "record_agreement", label: "Record reviewed agreement" },
  { value: "record_training", label: "Record completed training" },
  { value: "certify", label: "Certify partner" },
  { value: "activate", label: "Activate partner" },
  { value: "suspend", label: "Suspend partner" },
  { value: "terminate", label: "Terminate partner" },
  { value: "reinstate", label: "Reinstate partner" },
];

function uniqueVerifiedMember(inspection: ApprovedUserAccess) {
  if (inspection.identityState !== "verified" || inspection.authAccounts.length !== 1 || !inspection.authAccounts[0].emailVerified) return null;
  if (inspection.members.length !== 1) return null;
  const member = inspection.members[0];
  return member.binding === "verified" && member.authUserId === inspection.authAccounts[0].authUserId ? member : null;
}

function evidenceHint(action: PartnerOperation["action"]): string {
  if (action === "record_clearance") return "Use a real reviewed identity, tax, or payout evidence reference. A checkbox alone is not evidence.";
  if (action === "record_agreement") return "Use the exact current agreement version and content hash from the canonical review record.";
  if (action === "record_training") return "Use the exact current module version and a real reviewed completion reference.";
  return "This operation rechecks the canonical requirements on the server; it does not create proof or change compensation.";
}

function LifecycleOperation({ token, partner, memberId, requirements, onPendingChange, onConfirmed }: {
  token: string; partner: ApprovedUserAccess["partners"][number]; memberId: string; requirements: NonNullable<ApprovedUserAccess["partnerRequirements"]>;
  onPendingChange: (pending: boolean) => void; onConfirmed: () => void;
}) {
  const id = useId();
  const [action, setAction] = useState<PartnerOperation["action"]>("record_clearance");
  const [kind, setKind] = useState<"identity" | "tax" | "payout">("identity");
  const [decision, setDecision] = useState<"verified" | "rejected">("verified");
  const [reference, setReference] = useState("");
  const [agreementKey, setAgreementKey] = useState(requirements.agreements[0]?.key ?? "");
  const [moduleKey, setModuleKey] = useState(requirements.trainingModules[0]?.key ?? "");
  const [version, setVersion] = useState(requirements.agreements[0]?.version ?? "");
  const [hash, setHash] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<OperationState>({ kind: "editing" });
  const active = useRef(true);
  const sending = useRef(false);
  useEffect(() => () => { active.current = false; }, []);

  function prepare(event: FormEvent) {
    event.preventDefault();
    if (state.kind !== "editing" || !partner.updatedAt) return;
    let idempotencyKey: string;
    try { idempotencyKey = crypto.randomUUID(); } catch { setState({ kind: "editing", message: "A safe request identifier could not be created. Refresh before trying again." }); return; }
    const common = { action, partnerId: partner.id, expectedUpdatedAt: partner.updatedAt, reason, idempotencyKey } as const;
    const raw: unknown = action === "record_clearance"
      ? { ...common, kind, decision, evidenceReference: reference, reviewedEvidence: reviewed }
      : action === "record_agreement"
        ? { ...common, agreementKey, version, contentHash: hash, acceptedAt: new Date().toISOString(), evidenceReference: reference, reviewedEvidence: reviewed }
        : action === "record_training"
          ? { ...common, moduleKey, version, completedAt: new Date().toISOString(), evidenceReference: reference, reviewedEvidence: reviewed }
          : common;
    const parsed = PartnerOperationInput.safeParse(raw);
    if (!parsed.success || reason.trim().length < 8 || ["record_clearance", "record_agreement", "record_training"].includes(action) && (!reference.trim() || !reviewed)) {
      setState({ kind: "editing", message: "Enter a reason of at least 8 characters and the exact reviewed evidence required for this operation." }); return;
    }
    setState({ kind: "confirm", input: parsed.data });
  }

  async function submit(input: PartnerOperation) {
    if (!active.current || sending.current) return;
    sending.current = true; onPendingChange(true); setState({ kind: "sending", input });
    let result: Awaited<ReturnType<typeof performPartnerOperation>>;
    try { result = await performPartnerOperation(token, input, memberId); } catch { result = { kind: "error", message: "Unconfirmed outcome" }; }
    if (!active.current) return;
    sending.current = false;
    if (result.kind === "ok") { onPendingChange(false); setState({ kind: "success", result: result.data }); onConfirmed(); }
    else if (result.kind === "unauthorized" || result.kind === "forbidden" || result.kind === "denied") { onPendingChange(false); setState({ kind: "editing", message: result.kind === "denied" ? `The server did not permit this operation (${result.code}). Refresh diagnosis before another action.` : "Your admin session is not authorized for this operation." }); }
    else setState({ kind: "uncertain", input });
  }

  if (state.kind === "success") return <p role="status" className="body-s mt-3">{state.result.replayed ? "The earlier operation result was recovered." : "Operation recorded."} Refresh diagnosis before another operation; current partner state is not inferred from this result alone.</p>;
  if (!partner.updatedAt) return <p className="body-s text-ink-mute mt-3">This partner has no current revision timestamp. Refresh diagnosis before selecting an operation.</p>;
  const frozen = state.kind === "confirm" || state.kind === "sending" || state.kind === "uncertain" ? state.input : null;
  return <div className="mt-4">
    <form onSubmit={prepare} className="grid gap-3" noValidate aria-label={`Partner lifecycle operation for ${partner.id}`}>
      <label htmlFor={`${id}-action`} className="form-label">Explicit operation</label>
      <select id={`${id}-action`} className="input-field" value={action} onChange={e => setAction(e.target.value as PartnerOperation["action"])} disabled={state.kind !== "editing"}>
        {ACTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <p className="body-s text-ink-mute">{evidenceHint(action)}</p>
      {action === "record_clearance" && <>
        <label htmlFor={`${id}-kind`} className="form-label">Clearance kind</label><select id={`${id}-kind`} className="input-field" value={kind} onChange={e => setKind(e.target.value as typeof kind)} disabled={state.kind !== "editing"}><option value="identity">Identity</option><option value="tax">Tax</option><option value="payout">Payout</option></select>
        <label htmlFor={`${id}-decision`} className="form-label">Decision</label><select id={`${id}-decision`} className="input-field" value={decision} onChange={e => setDecision(e.target.value as typeof decision)} disabled={state.kind !== "editing"}><option value="verified">Verified</option><option value="rejected">Rejected</option></select>
      </>}
      {action === "record_agreement" && <><label htmlFor={`${id}-agreement`} className="form-label">Current agreement</label><select id={`${id}-agreement`} className="input-field" value={agreementKey} onChange={e => { setAgreementKey(e.target.value); setVersion(requirements.agreements.find(item => item.key === e.target.value)?.version ?? ""); }} disabled={state.kind !== "editing"}>{requirements.agreements.map(item => <option key={`${item.key}-${item.version}`} value={item.key}>{item.key} v{item.version}</option>)}</select><label htmlFor={`${id}-hash`} className="form-label">Agreement content hash</label><input id={`${id}-hash`} className="input-field" value={hash} onChange={e => setHash(e.target.value)} disabled={state.kind !== "editing"} /> </>}
      {action === "record_training" && <><label htmlFor={`${id}-module`} className="form-label">Current training module</label><select id={`${id}-module`} className="input-field" value={moduleKey} onChange={e => { setModuleKey(e.target.value); setVersion(requirements.trainingModules.find(item => item.key === e.target.value)?.version ?? ""); }} disabled={state.kind !== "editing"}>{requirements.trainingModules.map(item => <option key={`${item.key}-${item.version}`} value={item.key}>{item.key} v{item.version}</option>)}</select></>}
      {["record_clearance", "record_agreement", "record_training"].includes(action) && <><label htmlFor={`${id}-reference`} className="form-label">Reviewed evidence reference</label><input id={`${id}-reference`} className="input-field" value={reference} onChange={e => setReference(e.target.value)} disabled={state.kind !== "editing"} /><label className="body-s"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={state.kind !== "editing"} /> I reviewed the referenced evidence; this checkbox is not proof by itself.</label></>}
      <label htmlFor={`${id}-reason`} className="form-label">Internal reason</label><textarea id={`${id}-reason`} className="input-field" rows={2} value={reason} onChange={e => setReason(e.target.value)} disabled={state.kind !== "editing"} />
      {state.kind === "editing" && state.message ? <p role="alert" className="body-s">{state.message}</p> : null}
      {frozen ? <div className="card"><p className="body-s">Review this exact operation and current revision before confirming. No other operation can replace it.</p>{state.kind === "uncertain" ? <p role="alert" className="body-s mt-2">The outcome is unconfirmed. Retry this same request; the original key and payload are retained.</p> : null}<button type="button" className="btn btn-primary mt-3" style={{ minHeight: 44 }} disabled={state.kind === "sending"} onClick={() => void submit(frozen)}>{state.kind === "uncertain" ? "Retry same operation" : state.kind === "sending" ? "Submitting…" : "Confirm operation"}</button>{state.kind === "confirm" ? <button type="button" className="btn btn-ghost mt-2" onClick={() => setState({ kind: "editing" })}>Back to details</button> : null}</div> : <button type="submit" className="btn btn-secondary" style={{ minHeight: 44 }}>Review operation</button>}
    </form>
  </div>;
}

export function PartnerLifecycleReviewPanel({ token, inspection, onPendingChange = () => {}, onConfirmed = () => {} }: Props) {
  const member = uniqueVerifiedMember(inspection);
  const requirements = inspection.partnerRequirements;
  if (inspection.boundaries.partnerLifecycleReview !== "available" || !requirements) return <section className="card mt-6" data-testid="partner-lifecycle-review"><h3 className="body-m font-700">Partner lifecycle review unavailable</h3><p className="body-s mt-2">The canonical partner authority and current requirements could not be confirmed. No partner operation is enabled.</p></section>;
  if (!member || member.status !== "active") return <section className="card mt-6" data-testid="partner-lifecycle-review"><h3 className="body-m font-700">Partner lifecycle review</h3><p className="body-s mt-2">Prepare is available only for one uniquely verified active customer bound to this exact email. No partner access is inferred from a diagnosis.</p></section>;
  return <section className="card mt-6 min-w-0" data-testid="partner-lifecycle-review"><h3 className="body-m font-700">Partner lifecycle review</h3><p className="body-s text-ink-2 mt-2">Explicit admin review only. Evidence, agreements and training are recorded from canonical sources; nothing here grants customer, Care, referral or commission access automatically.</p>
    {inspection.partners.length === 0 ? <PreparePartner token={token} memberId={member.id} onPendingChange={onPendingChange} onConfirmed={onConfirmed} /> : inspection.partners.map(partner => <div key={partner.id} className="card mt-4"><p className="body-s font-700">{ROLE_LABELS[partner.role] ?? partner.role}</p><p className="body-s text-ink-mute mt-1">State: {partner.state} · partner {partner.id}</p><LifecycleOperation token={token} partner={partner} memberId={member.id} requirements={requirements} onPendingChange={onPendingChange} onConfirmed={onConfirmed} /></div>)}
  </section>;
}

export default PartnerLifecycleReviewPanel;

function PreparePartner({ token, memberId, onPendingChange, onConfirmed }: { token: string; memberId: string; onPendingChange: (pending: boolean) => void; onConfirmed: () => void }) {
  type PrepareRole = Extract<PartnerOperation, { action: "prepare" }>["role"];
  const [role, setRole] = useState<PrepareRole>(PARTNER_ROLES[0]);
  const [legalName, setLegalName] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<OperationState>({ kind: "editing" });
  const active = useRef(true); const sending = useRef(false); const id = useId();
  useEffect(() => () => { active.current = false; }, []);
  async function prepare(event: FormEvent) { event.preventDefault(); if (state.kind !== "editing") return; let idempotencyKey: string; try { idempotencyKey = crypto.randomUUID(); } catch { setState({ kind: "editing", message: "A safe request identifier could not be created. Refresh before trying again." }); return; }
    const parsed = PartnerOperationInput.safeParse({ action: "prepare", memberId, role, legalName, reason, idempotencyKey }); if (!parsed.success) { setState({ kind: "editing", message: "Enter a legal name (at least 2 characters) and a reason of at least 8 characters." }); return; } setState({ kind: "confirm", input: parsed.data }); }
  async function submit(input: PartnerOperation) { if (!active.current || sending.current) return; sending.current = true; onPendingChange(true); setState({ kind: "sending", input }); let result: Awaited<ReturnType<typeof performPartnerOperation>>; try { result = await performPartnerOperation(token, input, memberId); } catch { result = { kind: "error", message: "Unconfirmed outcome" }; } if (!active.current) return; sending.current = false; if (result.kind === "ok") { onPendingChange(false); setState({ kind: "success", result: result.data }); onConfirmed(); } else if (result.kind === "unauthorized" || result.kind === "forbidden" || result.kind === "denied") { onPendingChange(false); setState({ kind: "editing", message: result.kind === "denied" ? `The server did not permit this operation (${result.code}). Refresh diagnosis before another action.` : "Your admin session is not authorized for this operation." }); } else setState({ kind: "uncertain", input }); }
  if (state.kind === "success") return <p role="status" className="body-s mt-3">Partner application prepared. Refresh diagnosis before recording evidence or another operation.</p>;
  const frozen = state.kind === "confirm" || state.kind === "sending" || state.kind === "uncertain" ? state.input : null;
  return <form onSubmit={prepare} className="grid gap-3 mt-4" noValidate aria-label="Prepare partner application"><label htmlFor={`${id}-role`} className="form-label">Partner relationship</label><select id={`${id}-role`} className="input-field" value={role} onChange={e => setRole(e.target.value as PrepareRole)} disabled={state.kind !== "editing"}>{PARTNER_ROLES.map(item => <option key={item} value={item}>{ROLE_LABELS[item] ?? item}</option>)}</select><label htmlFor={`${id}-legal`} className="form-label">Legal name</label><input id={`${id}-legal`} className="input-field" value={legalName} onChange={e => setLegalName(e.target.value)} disabled={state.kind !== "editing"} /><label htmlFor={`${id}-reason`} className="form-label">Internal reason</label><textarea id={`${id}-reason`} className="input-field" rows={2} value={reason} onChange={e => setReason(e.target.value)} disabled={state.kind !== "editing"} />{state.kind === "editing" && state.message ? <p role="alert" className="body-s">{state.message}</p> : null}{frozen ? <div className="card"><p className="body-s">Confirm the selected relationship and exact customer binding. No certification or activation is included.</p>{state.kind === "uncertain" ? <p role="alert" className="body-s mt-2">The outcome is unconfirmed. Retry this same request with its original key.</p> : null}<button type="button" className="btn btn-primary mt-3" style={{ minHeight: 44 }} disabled={state.kind === "sending"} onClick={() => void submit(frozen)}>{state.kind === "uncertain" ? "Retry same preparation" : state.kind === "sending" ? "Submitting…" : "Confirm preparation"}</button>{state.kind === "confirm" ? <button type="button" className="btn btn-ghost mt-2" onClick={() => setState({ kind: "editing" })}>Back to details</button> : null}</div> : <button type="submit" className="btn btn-secondary" style={{ minHeight: 44 }}>Review partner preparation</button>}</form>;
}
