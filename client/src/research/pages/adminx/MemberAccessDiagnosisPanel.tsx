import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { ApprovedUserAccessInput, type ApprovedUserAccess } from "@shared/research/approved-user-access";
import { inspectApprovedUserAccess } from "../../adapters/adminOps";
import { ACCESS_ROUTES, ADMIN_ROUTES } from "../../lib/routes";
import { CustomerAccessApprovalForm } from "./CustomerAccessApprovalForm";
import { PartnerLifecycleReviewPanel } from "./PartnerLifecycleReviewPanel";

type InspectionState =
  | { kind: "idle" | "loading" | "invalid" | "unauthorized" | "denied" | "unavailable" | "disabled" | "error" }
  | { kind: "ready"; inspection: ApprovedUserAccess };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A server href is still navigation data, not permission to open an arbitrary
// URL. Only an exact observed record identity or the known application entry
// can become a link here. Never normalize queries, escapes or outside URLs.
function recordHref(kind: "application" | "member", id: string, href: string): string | null {
  if (!UUID.test(id)) return null;
  const expected = (kind === "application" ? ADMIN_ROUTES.application : ADMIN_ROUTES.member).replace(":id", id);
  return href === expected ? expected : null;
}

function nextActionHref(href: string | null, inspection: ApprovedUserAccess): string | null {
  if (href === ACCESS_ROUTES.apply) return href;
  if (href === null) return null;
  return inspection.applications.some((item) => recordHref("application", item.id, item.href) === href)
    || inspection.members.some((item) => recordHref("member", item.id, item.href) === href) ? href : null;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="body-s text-ink-mute">{label}</dt><dd className="body-s mt-1">{children}</dd></div>;
}

function RecordLink({ href, children, disabled = false }: { href: string | null; children: ReactNode; disabled?: boolean }) {
  if (disabled) return <p className="body-s text-ink-mute mt-3">Record navigation is paused until the approval outcome is reconciled.</p>;
  return href ? (
    <Link href={href} className="btn btn-secondary mt-3" style={{ minHeight: 44, maxWidth: "100%", whiteSpace: "normal" }} rel="noreferrer" referrerPolicy="no-referrer">
      {children}
    </Link>
  ) : <p className="body-s text-ink-mute mt-3">Record link unavailable.</p>;
}

const NOTIFICATION_WARNING: Record<ApprovedUserAccess["nextActions"][number]["notification"], string> = {
  none: "No notification is indicated for this next action.",
  application_email: "A separate application workflow may send email as described above. Inspecting this account or opening a record sends no email.",
  not_available: "The associated notification workflow is not available; no delivery is confirmed.",
};

function InspectionResult({ inspection, id, token, diagnosisPending, approvalPending, partnerPending, onApprovalPendingChange, onPartnerPendingChange, onPartnerConfirmed }: {
  inspection: ApprovedUserAccess; id: string; token: string; diagnosisPending: boolean; approvalPending: boolean; partnerPending: boolean; onApprovalPendingChange: (pending: boolean) => void;
  onPartnerPendingChange: (pending: boolean) => void; onPartnerConfirmed: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-6 mt-5" data-testid="access-inspection-result">
      <header>
        <h3 className="body-m font-700">Observed account access</h3>
        <dl className="grid min-w-0 gap-3 mt-3 sm:grid-cols-2">
          <Fact label="Exact email">{inspection.email}</Fact>
          <Fact label="Observed at"><time dateTime={inspection.observedAt}>{new Date(inspection.observedAt).toISOString()} (UTC)</time></Fact>
        </dl>
        <p className="body-s text-ink-mute mt-3">A point-in-time inspection, not an approval or a live access guarantee.</p>
      </header>

      <section aria-labelledby={`${id}-identity`}>
        <h3 id={`${id}-identity`} className="body-m font-700">Identity and email verification</h3>
        <p className="body-s mt-2">Identity state: <strong>{inspection.identityState}</strong></p>
        {inspection.authAccounts.length === 0 ? <p className="body-s mt-2">No authentication account found in this inspection.</p> : (
          <ul className="grid min-w-0 gap-3 mt-3 sm:grid-cols-2">
            {inspection.authAccounts.map((account, index) => (
              <li key={`${account.authUserId}-${index}`} className="card min-w-0">
                <dl className="grid min-w-0 gap-3">
                  <Fact label="Authentication account ID">{account.authUserId}</Fact>
                  <Fact label="Email verification">{account.emailVerified ? "Verified" : "Not verified"}</Fact>
                  <Fact label="Sign-in evidence">{account.signInRecorded ? "Sign-in recorded" : "No sign-in recorded"}</Fact>
                </dl>
              </li>
            ))}
          </ul>
        )}
        <p className="body-s text-ink-mute mt-3">Email verification does not establish customer access, partner approval or Care eligibility.</p>
      </section>

      <section aria-labelledby={`${id}-applications`}>
        <h3 id={`${id}-applications`} className="body-m font-700">Customer applications</h3>
        {inspection.applications.length === 0 ? <p className="body-s mt-2">No customer application found in this inspection.</p> : (
          <ul className="grid min-w-0 gap-3 mt-3 sm:grid-cols-2">
            {inspection.applications.map((application, index) => (
              <li key={`${application.id}-${index}`} className="card min-w-0">
                <dl className="grid min-w-0 gap-3">
                  <Fact label="Application ID">{application.id}</Fact>
                  <Fact label="Recorded application status">{application.status}</Fact>
                </dl>
                <RecordLink href={recordHref("application", application.id, application.href)} disabled={diagnosisPending}>Open application record</RecordLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${id}-members`}>
        <h3 id={`${id}-members`} className="body-m font-700">Customer records and identity binding</h3>
        {inspection.members.length === 0 ? <p className="body-s mt-2">No customer record found in this inspection.</p> : (
          <ul className="grid min-w-0 gap-3 mt-3 sm:grid-cols-2">
            {inspection.members.map((member, index) => (
              <li key={`${member.id}-${index}`} className="card min-w-0">
                <dl className="grid min-w-0 gap-3">
                  <Fact label="Customer record ID">{member.id}</Fact>
                  <Fact label="Recorded customer status">{member.status}</Fact>
                  <Fact label="Bound authentication account ID">{member.authUserId ?? "No authentication account bound"}</Fact>
                  <Fact label="Identity binding">{member.binding}</Fact>
                </dl>
                <RecordLink href={recordHref("member", member.id, member.href)} disabled={diagnosisPending}>Open customer record</RecordLink>
              </li>
            ))}
          </ul>
        )}
        <p className="body-s text-ink-mute mt-3">Stored statuses are shown as recorded. This panel does not infer a payment requirement or change an identity binding.</p>
      </section>

      <section aria-labelledby={`${id}-partners`}>
        <h3 id={`${id}-partners`} className="body-m font-700">Linked partner records</h3>
        {inspection.partners.length === 0 ? <p className="body-s mt-2">No partner record found in this inspection.</p> : (
          <ul className="grid min-w-0 gap-3 mt-3 sm:grid-cols-2">
            {inspection.partners.map((partner, index) => (
              <li key={`${partner.id}-${index}`} className="card min-w-0">
                <dl className="grid min-w-0 gap-3">
                  <Fact label="Partner ID">{partner.id}</Fact>
                  <Fact label="Linked customer record ID">{partner.memberId}</Fact>
                  <Fact label="Recorded partner role">{partner.role}</Fact>
                  <Fact label="Recorded partner state">{partner.state}</Fact>
                  <Fact label="Identity binding">{partner.binding}</Fact>
                </dl>
                {partner.missingRequirements.length === 0 ? (
                  <p className="body-s mt-3">No missing requirements reported. This is not a new approval or a grant of referral access.</p>
                ) : (
                  <details className="mt-3">
                    <summary className="body-s font-700 cursor-pointer" style={{ minHeight: 44 }}>Reported missing requirements ({partner.missingRequirements.length})</summary>
                    <ul className="body-s grid gap-2 mt-2 list-disc pl-5">
                      {partner.missingRequirements.map((requirement, requirementIndex) => <li key={`${requirement}-${requirementIndex}`}>{requirement}</li>)}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${id}-organizations`}>
        <h3 id={`${id}-organizations`} className="body-m font-700">Organization relationships</h3>
        {inspection.organizationRelationships.state === "unavailable" ? (
          <p className="body-s mt-2">Organization relationships are unavailable. Their presence or absence is unknown; no organization access is inferred.</p>
        ) : inspection.organizationRelationships.records.length === 0 ? (
          <p className="body-s mt-2">No organization relationships found in this inspection.</p>
        ) : (
          <ul className="grid min-w-0 gap-3 mt-3 sm:grid-cols-2">
            {inspection.organizationRelationships.records.map((organization, index) => (
              <li key={`${organization.organizationId}-${index}`} className="card min-w-0">
                <dl className="grid min-w-0 gap-3">
                  <Fact label="Organization ID">{organization.organizationId}</Fact>
                  <Fact label="Recorded relationship state">{organization.state}</Fact>
                  <Fact label="Recorded organization roles">{organization.roles.length ? organization.roles.join(", ") : "No roles recorded"}</Fact>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${id}-boundaries`} className="card min-w-0">
        <h3 id={`${id}-boundaries`} className="body-m font-700">Separate access decisions</h3>
        <dl className="grid min-w-0 gap-3 mt-3">
          <Fact label="Care">Care has a separate authority. No clinical eligibility or Care permission is established here.</Fact>
          <Fact label="Referrals">Referral eligibility is checked by the referral authority. A customer or partner record does not grant referral access.</Fact>
          <Fact label="Partner lifecycle review">
            {inspection.boundaries.partnerLifecycleReview === "available"
              ? "Available in its separate workflow. No certification or activation is performed by this inspection."
              : "Unavailable. No certification, activation or partner invitation can be performed by this inspection."}
          </Fact>
        </dl>
        {inspection.boundaries.membershipBillingEnabled ? (
          <p className="body-s text-ink-mute mt-3">Legacy billing configuration is enabled. This is a configuration observation, not a payment requirement or the approved-account launch access model.</p>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-next`}>
        <h3 id={`${id}-next`} className="body-m font-700">Server-reported next steps</h3>
        <p className="body-s text-ink-2 mt-2">These consequences are reported by the server. Links open a separate page; no action is executed from this diagnosis.</p>
        {inspection.nextActions.length === 0 ? <p className="body-s mt-3">No next action reported. No permission or completion is inferred.</p> : (
          <ol className="grid min-w-0 gap-3 mt-3">
            {inspection.nextActions.map((action, index) => {
              const href = nextActionHref(action.href, inspection);
              return (
                <li key={index} className="card min-w-0">
                  <h4 className="body-s font-700">{action.label}</h4>
                  <p className="body-s whitespace-pre-wrap mt-2">{action.consequence}</p>
                  <p className="body-s text-ink-mute mt-2">Notification classification: {action.notification}</p>
                  <p className="body-s mt-2">{NOTIFICATION_WARNING[action.notification]}</p>
                  {href ? <RecordLink href={href} disabled={diagnosisPending}>Open related page</RecordLink> : action.href !== null ? (
                    <p className="body-s text-ink-mute mt-3">The reported link is outside the allowed local record paths and is not enabled.</p>
                  ) : <p className="body-s text-ink-mute mt-3">No navigation link was provided for this step.</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <PartnerLifecycleReviewPanel token={token} inspection={inspection} onPendingChange={onPartnerPendingChange} onConfirmed={onPartnerConfirmed} />
      <CustomerAccessApprovalForm token={token} inspection={inspection} onPendingChange={onApprovalPendingChange} externalPending={partnerPending} />
    </div>
  );
}

function ScopedInspectionForm({ token }: { token: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<InspectionState>({ kind: "idle" });
  const [approvalPending, setApprovalPending] = useState(false);
  const [partnerPending, setPartnerPending] = useState(false);
  const approvalPendingRef = useRef(false);
  const lifecycle = useRef({ active: false, generation: 0 });

  function noteApprovalPending(pending: boolean) {
    approvalPendingRef.current = pending;
    setApprovalPending(pending);
  }

  useEffect(() => {
    lifecycle.current.active = true;
    return () => { lifecycle.current.active = false; lifecycle.current.generation++; };
  }, []);

  function changeEmail(value: string) {
    if (approvalPendingRef.current || partnerPending) return;
    // Invalidate before publishing the new input: an older completion can
    // never repaint the former query, even if the text changes back again.
    lifecycle.current.generation++;
    setEmail(value);
    setState({ kind: "idle" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!lifecycle.current.active || !token || approvalPendingRef.current || partnerPending) return;
    const generation = ++lifecycle.current.generation;
    const input = ApprovedUserAccessInput.safeParse({ email });
    if (!input.success) { setState({ kind: "invalid" }); return; }
    setState({ kind: "loading" });
    const publish = (next: InspectionState) => {
      if (lifecycle.current.active && lifecycle.current.generation === generation) setState(next);
    };
    try {
      // Adapter validates the strict server DTO and exact normalized email.
      // POST is intentional for this read; email never enters a URL or log.
      const response = await inspectApprovedUserAccess(token, input.data.email);
      if (response.kind === "ok") publish({ kind: "ready", inspection: response.data.inspection });
      else if (response.kind === "denied") publish({ kind: response.code === "capability_disabled" ? "disabled" : "denied" });
      else if (response.kind === "forbidden") publish({ kind: "denied" });
      else if (response.kind === "unauthorized" || response.kind === "unavailable") publish({ kind: response.kind });
      else publish({ kind: "error" });
    } catch { publish({ kind: "error" }); }
  }

  async function refreshAfterPartnerOperation() {
    if (!lifecycle.current.active || !token || !email || approvalPendingRef.current) return;
    const generation = ++lifecycle.current.generation;
    setPartnerPending(true);
    setState({ kind: "loading" });
    const publish = (next: InspectionState) => {
      if (lifecycle.current.active && lifecycle.current.generation === generation) {
        setState(next);
        setPartnerPending(false);
      }
    };
    try {
      const response = await inspectApprovedUserAccess(token, email);
      if (response.kind === "ok") publish({ kind: "ready", inspection: response.data.inspection });
      else if (response.kind === "denied") publish({ kind: response.code === "capability_disabled" ? "disabled" : "denied" });
      else if (response.kind === "forbidden") publish({ kind: "denied" });
      else if (response.kind === "unauthorized" || response.kind === "unavailable") publish({ kind: response.kind });
      else publish({ kind: "error" });
    } catch { publish({ kind: "error" }); }
  }

  return (
    <>
      <form onSubmit={(event) => void submit(event)} aria-label="Exact email access diagnosis" noValidate autoComplete="off" className="mt-4 min-w-0">
        <label htmlFor={`${id}-email`} className="form-label">Exact account email</label>
        <input id={`${id}-email`} type="email" value={email} onChange={(event) => changeEmail(event.target.value)}
          disabled={approvalPending}
          required maxLength={254} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          aria-describedby={`${id}-email-help${state.kind === "invalid" ? ` ${id}-email-error` : ""}`}
          aria-invalid={state.kind === "invalid"} className="input-field" style={{ minHeight: 44, width: "100%", minWidth: 0 }} />
        <p id={`${id}-email-help`} className="body-s text-ink-mute mt-2">Enter a complete email and submit to inspect. Editing clears the previous result; no automatic search runs.</p>
        <button type="submit" className="btn btn-secondary mt-3" style={{ minHeight: 44, maxWidth: "100%", whiteSpace: "normal" }} disabled={state.kind === "loading" || approvalPending}>
          {state.kind === "loading" ? "Inspecting account…" : state.kind === "ready" ? "Refresh diagnosis" : "Inspect account access"}
        </button>
      </form>
      {approvalPending || partnerPending ? <p role="status" className="body-s mt-3">Diagnosis is locked while a record-changing operation is submitting or unconfirmed. Resolve it using the same request below before inspecting another account. Do not reload or leave this page until the outcome is reconciled.</p> : null}
      {state.kind === "idle" ? <p className="body-s text-ink-mute mt-3">No account has been inspected for this email entry.</p> : null}
      {state.kind === "invalid" ? <p id={`${id}-email-error`} role="alert" className="body-s mt-3">Enter one valid, complete email address.</p> : null}
      {state.kind === "loading" ? <p role="status" aria-live="polite" className="body-s mt-3">Reading the authorized account records. No records are being changed.</p> : null}
      {state.kind === "unauthorized" ? <p role="alert" className="body-s mt-3">Your admin session is not authorized. Sign in again through the admin page before inspecting an account.</p> : null}
      {state.kind === "denied" ? <p role="alert" className="body-s mt-3">This admin session is not permitted to inspect account access. No account facts are available from this request.</p> : null}
      {state.kind === "disabled" ? <p role="status" className="body-s mt-3">Account diagnosis is not enabled in this environment. The account’s presence and access state have not been determined.</p> : null}
      {state.kind === "unavailable" ? <p role="status" className="body-s mt-3">Account diagnosis is unavailable right now. This does not mean an account or relationship is absent.</p> : null}
      {state.kind === "error" ? <p role="alert" className="body-s mt-3">The inspection could not be completed safely. Submit again to retry; no account state can be inferred from this failed read.</p> : null}
      {state.kind === "ready" ? <InspectionResult inspection={state.inspection} id={id} token={token} diagnosisPending={approvalPending || partnerPending} approvalPending={approvalPending} partnerPending={partnerPending} onApprovalPendingChange={noteApprovalPending} onPartnerPendingChange={setPartnerPending} onPartnerConfirmed={() => void refreshAfterPartnerOperation()} /> : null}
    </>
  );
}

/** Admin-only read presentation; the server, not this panel, authorizes access. */
export function MemberAccessDiagnosisPanel({ token }: { token: string }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="card min-w-0" style={{ overflowWrap: "anywhere" }} data-testid="member-access-diagnosis">
      <h2 id={`${id}-title`} className="body-l font-700">Account access diagnosis</h2>
      <p className="body-s text-ink-2 mt-2">Read-only inspection by exact email. This does not approve access, alter records, send an invitation or send email.</p>
      <p className="body-s text-ink-mute mt-2">If a separate customer-approval action is available below, it requires review and explicit confirmation before changing records or queuing email.</p>
      {token ? <ScopedInspectionForm key={token} token={token} /> : <p role="status" className="body-s mt-3">Admin sign-in is required to inspect an account.</p>}
    </section>
  );
}
