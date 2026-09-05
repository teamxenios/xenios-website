import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import type { ApprovedUserAccess } from "@shared/research/approved-user-access";
import { ApprovedCustomerApprovalInput, type CustomerApprovalInput } from "@shared/research/approved-customer-access";
import { approveCustomerAccess } from "../../adapters/adminOps";
import { ADMIN_ROUTES } from "../../lib/routes";

const REVIEWABLE = new Set(["draft", "submitted", "under_review", "more_information_requested", "resubmitted",
  "approved_pending_payment", "approved_customer", "payment_pending", "expired"]);

// Presentation only. The audited RPC rechecks authority, identity, current
// status and the exact optimistic-concurrency snapshot before any mutation.
function blockedReason(inspection: ApprovedUserAccess): string | null {
  if (inspection.boundaries.customerAccessApproval !== "available") return "Customer approval is unavailable in this environment. No approval or email action is enabled.";
  if (inspection.identityState !== "absent" && inspection.identityState !== "verified") return "Identity verification or a conflicting account needs review before customer approval.";
  if (inspection.authAccounts.length > 1 || inspection.identityState === "absent" && inspection.authAccounts.length !== 0
    || inspection.identityState === "verified" && (inspection.authAccounts.length !== 1 || !inspection.authAccounts[0].emailVerified)) {
    return "The inspected authentication identity is not a single verified account or a confirmed absence. Review the identity first.";
  }
  if (inspection.applications.length > 1 || inspection.members.length > 1) return "Multiple account or application records need an identity review before approval.";
  const member = inspection.members[0];
  if (member && (!["pending_activation", "past_due"].includes(member.status) || member.binding !== "verified"
    || member.authUserId !== inspection.authAccounts[0]?.authUserId)) {
    return "The existing customer account is not eligible for this approval. Active accounts should sign in normally; restricted or conflicting accounts need separate review.";
  }
  if (inspection.partners.some(partner => partner.binding !== "verified" || partner.memberId !== member?.id)) return "The partner identity binding needs review. Customer approval cannot repair or grant a partner relationship.";
  const application = inspection.applications[0];
  if (!application && member) return "The existing customer record has no inspected application. Review the identity binding before approval.";
  const reviewedSuspension = application?.status === "active" && member && ["pending_activation", "past_due"].includes(member.status);
  if (application && ((!REVIEWABLE.has(application.status) && !reviewedSuspension) || !application.updatedAt)) return "The application is not eligible or its current revision is unavailable. Refresh diagnosis or request an account review.";
  return null;
}

type Result = Awaited<ReturnType<typeof approveCustomerAccess>>;
type State = { kind: "editing"; message?: string }
  | { kind: "confirm" | "sending" | "uncertain"; input: CustomerApprovalInput }
  | { kind: "refused"; message: string }
  | { kind: "success"; result: Extract<Result, { kind: "ok" }>["data"] };

const REFUSALS: Record<string, string> = {
  stale_inspection: "The account changed after inspection. Refresh diagnosis and review the current record before another approval.",
  identity_review_required: "The server requires identity review. This form cannot override the account or identity restriction.",
  verified_sign_in_required: "A verified sign-in is required. Refresh diagnosis and resolve the identity requirement before approval.",
  invalid_input: "The server refused the approval details. Refresh diagnosis and review the required fields.",
  idempotency_conflict: "This request conflicts with an earlier approval attempt. Review its outcome before starting another request.",
  claim_not_available: "The server did not permit this account transition. Refresh diagnosis for its current state.",
};

type Props = { token: string; inspection: ApprovedUserAccess; onPendingChange?: (pending: boolean) => void };

function ApprovalForm({ token, inspection, onPendingChange }: Props) {
  const id = useId();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<State>({ kind: "editing" });
  const lifecycle = useRef({ active: false, sending: false });
  useEffect(() => {
    lifecycle.current.active = true;
    return () => { lifecycle.current.active = false; };
  }, []);
  const blocked = blockedReason(inspection);
  if (blocked) return <p className="body-s mt-4" data-testid="customer-approval-blocked">{blocked}</p>;

  function prepare(event: FormEvent) {
    event.preventDefault();
    if (!lifecycle.current.active || !token || state.kind !== "editing") return;
    let idempotencyKey: string;
    try { idempotencyKey = crypto.randomUUID(); } catch {
      setState({ kind: "editing", message: "A safe request identifier could not be created. Refresh the page before trying again." }); return;
    }
    const application = inspection.applications[0];
    const input = ApprovedCustomerApprovalInput.safeParse({ email: inspection.email, firstName, lastName, reason,
      expectedApplicationId: application?.id ?? null, expectedUpdatedAt: application?.updatedAt ?? null, idempotencyKey });
    if (!input.success) { setState({ kind: "editing", message: "Enter a first and last name (1–80 characters each) and a review reason (8–1,000 characters)." }); return; }
    setState({ kind: "confirm", input: input.data });
  }

  async function confirm(input: CustomerApprovalInput) {
    if (!lifecycle.current.active || lifecycle.current.sending || !token) return;
    lifecycle.current.sending = true;
    onPendingChange?.(true);
    setState({ kind: "sending", input });
    let result: Result;
    try { result = await approveCustomerAccess(token, input); }
    catch { result = { kind: "error", message: "Unconfirmed outcome" }; }
    if (!lifecycle.current.active) return;
    lifecycle.current.sending = false;
    if (result.kind === "ok") { onPendingChange?.(false); setState({ kind: "success", result: result.data }); }
    else if (result.kind === "unauthorized" || result.kind === "forbidden") { onPendingChange?.(false); setState({ kind: "refused", message: "Your admin session is not authorized for this approval. Sign in again and refresh diagnosis." }); }
    else if (result.kind === "denied" && REFUSALS[result.code]) { onPendingChange?.(false); setState({ kind: "refused", message: REFUSALS[result.code] }); }
    else setState({ kind: "uncertain", input });
  }

  if (state.kind === "success") return (
    <section className="card mt-5 min-w-0" role="status" aria-live="polite">
      <h3 className="body-m font-700">Customer approval recorded</h3>
      <p className="body-s mt-2">Onboarding email queued. Delivery and account claim are not confirmed. The configured worker may send the queued email immediately.</p>
      <p className="body-s mt-2">Approval version {state.result.approvalVersion}; expires {new Date(state.result.expiresAt).toISOString()} (UTC).</p>
      {state.result.replayed ? <p className="body-s mt-2">The server returned the earlier result for this same request.</p> : null}
      <p className="body-s mt-2">Customer access still requires the approved account claim. No partner, referral, organization or Care access is granted by this approval.</p>
      <Link href={ADMIN_ROUTES.application.replace(":id", state.result.applicationId)} className="btn btn-secondary mt-3">Open approved application</Link>
    </section>
  );
  if (state.kind === "refused") return <p role="alert" className="body-s mt-5">{state.message}</p>;
  const frozen = state.kind !== "editing" ? state.input : null;
  return (
    <section className="card mt-5 min-w-0" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="body-m font-700">Separate customer approval</h3>
      <p className="body-s mt-2">This is a record-changing action, separate from the read-only diagnosis. It records approval and queues an onboarding email, which may be sent immediately. It does not verify delivery, sign the customer in or certify a partner.</p>
      <p className="body-s mt-2">Exact recipient: <strong>{inspection.email}</strong>. Paid membership is not required. Historical billing records are retained.</p>
      {state.kind === "editing" ? (
        <form onSubmit={prepare} noValidate autoComplete="off" className="grid gap-4 mt-4" aria-label="Prepare customer approval">
          <div><label htmlFor={`${id}-first`} className="form-label">First name</label><input id={`${id}-first`} className="input-field w-full" value={firstName} onChange={event => setFirstName(event.target.value)} required maxLength={80} /></div>
          <div><label htmlFor={`${id}-last`} className="form-label">Last name</label><input id={`${id}-last`} className="input-field w-full" value={lastName} onChange={event => setLastName(event.target.value)} required maxLength={80} /></div>
          <div><label htmlFor={`${id}-reason`} className="form-label">Internal approval reason</label><textarea id={`${id}-reason`} className="input-field w-full" value={reason} onChange={event => setReason(event.target.value)} rows={3} required maxLength={1000} /></div>
          {state.message ? <p role="alert" className="body-s">{state.message}</p> : null}
          <button type="submit" className="btn btn-secondary" style={{ minHeight: 44, whiteSpace: "normal" }}>Review approval and email</button>
        </form>
      ) : frozen ? (
        <div className="grid gap-3 mt-4">
          <h4 className="body-s font-700">Confirm the exact approval</h4>
          <p className="body-s">Name: {frozen.firstName} {frozen.lastName}</p>
          <p className="body-s whitespace-pre-wrap">Internal reason: {frozen.reason}</p>
          <p className="body-s">Application: {frozen.expectedApplicationId ?? "No application found in this inspection"}</p>
          <p className="body-s">Inspected revision: {frozen.expectedUpdatedAt ?? "No existing application revision"}</p>
          {state.kind === "uncertain" ? <p role="alert" className="body-s">The outcome was not confirmed. Approval or email queuing may already have occurred. Retry this same request to recover its result; do not create a new approval to work around an uncertain response.</p> : null}
          <button type="button" className="btn btn-primary" style={{ minHeight: 44, whiteSpace: "normal" }} disabled={state.kind === "sending"} onClick={() => void confirm(frozen)}>
            {state.kind === "sending" ? "Submitting approval…" : state.kind === "uncertain" ? "Retry the same approval request" : "Approve customer and queue onboarding email"}
          </button>
          {state.kind === "confirm" ? <button type="button" className="btn btn-ghost" onClick={() => setState({ kind: "editing" })}>Back to details</button> : null}
        </div>
      ) : null}
    </section>
  );
}

export function CustomerAccessApprovalForm({ token, inspection, onPendingChange }: Props) {
  if (!token) return null;
  return <ApprovalForm key={`${token}:${inspection.email}:${inspection.observedAt}`} token={token} inspection={inspection} onPendingChange={onPendingChange} />;
}
