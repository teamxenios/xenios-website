import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { formatMoney, useResearch } from "../core";
import { ResearchPublicShell } from "../ui/shells";
import {
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchErrorState,
  ResearchLoadingState,
  ResearchPendingPanel,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../ui/kit";
import { ACCESS_ROUTES } from "../lib/routes";
import {
  getActivationStatus,
  getIdentityStatus,
  getObligation,
  listAgreements,
  listPaymentMethods,
  markIdentityUploaded,
  recordIdentityConsent,
  reportPayment,
  requestEvidenceUploadUrl,
  requestIdentityUploadUrl,
  selectPaymentMethod,
  signAgreement,
  uploadFileToGrant,
  type ActivationStatusDto,
  type ActivationStep,
  type AgreementDto,
  type IdentityCaseDto,
  type MemberMethodDto,
  type MemberObligationDto,
} from "../adapters/activation";

// ---------------------------------------------------------------------------
// ActivationPage (/research/activate). The approved applicant's activation
// stepper for the ONE Founding Membership, driven entirely by
// GET /api/research/activation/status. Mobile-first: external payments happen
// on phones, so everything is a single column with large copy controls.
//
// Canonical pricing (the only pricing statement this flow makes): $50 due at
// activation, INCLUDING the first 30 days of membership; then $25 for each
// additional 30-day membership period; the first renewal date is computed
// when the activation payment is verified. $50 and $25 are never shown as
// competing choices, and no $25 is due at activation.
//
// Honest states only: while the founding-activation flag is off the server
// answers capability_disabled (surfaced as "unavailable" by lib/api) and the
// page says activation is not open yet. Nothing here pretends.
// ---------------------------------------------------------------------------

// The canonical pricing block, rendered VERBATIM wherever this flow states
// pricing. Do not paraphrase these lines.
export const CANONICAL_PRICING = {
  title: "Founding Membership",
  price: "$50 due today",
  includes: "Includes your activation and first 30 days of membership.",
  then: "Then $25 for each additional 30-day membership period.",
  renewal: "Your first renewal date will be calculated when your activation payment is verified.",
} as const;

/** The no-activation sentence shown wherever payment information is entered. */
export const SUBMISSION_NOT_ACTIVATION =
  "Submitting payment information does not activate your membership. " +
  "Xenios must confirm that the funds were received.";

const IDENTITY_CONSENT_VERSION = "icv-1";

const STEP_LABELS: Record<string, string> = {
  application: "Application",
  claim: "Account claim",
  email: "Email",
  consents: "Electronic records consent",
  identity: "Identity verification",
  agreements: "Agreements",
  obligation: "Payment setup",
  payment: "Payment",
  verification: "Verification by Xenios",
  active: "Membership active",
};

const STEP_BADGE: Record<ActivationStep["state"], { label: string; tone: BadgeTone }> = {
  complete: { label: "Complete", tone: "success" },
  action_required: { label: "Action required", tone: "warning" },
  pending: { label: "Pending", tone: "pending" },
  blocked: { label: "Blocked", tone: "danger" },
};

/** Member-payable statuses a payment report may be (re)submitted from
 * (mirrors the server's SUBMITTABLE_STATUSES). */
const SUBMITTABLE = new Set([
  "upcoming",
  "due",
  "overdue",
  "in_grace",
  "suspended",
  "info_requested",
  "mismatch",
  "duplicate",
  "rejected",
]);

const OBLIGATION_STATUS_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  due: { label: "Payment due", tone: "warning" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  submitted: { label: "Report submitted", tone: "info" },
  under_review: { label: "Under review", tone: "info" },
  info_requested: { label: "Information requested", tone: "warning" },
  mismatch: { label: "Amount mismatch", tone: "warning" },
  duplicate: { label: "Possible duplicate", tone: "warning" },
  rejected: { label: "Report rejected", tone: "danger" },
  verified: { label: "Verified", tone: "success" },
  overdue: { label: "Overdue", tone: "warning" },
  in_grace: { label: "In grace period", tone: "warning" },
  suspended: { label: "Suspended", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  reversed: { label: "Reversed", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
};

function fmtDay(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      data-testid={`copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : `Copy ${label}`}
    </button>
  );
}

export function FoundingPricingBlock() {
  return (
    <section aria-label="Founding Membership pricing" className="card" data-testid="activation-pricing">
      <p className="mono-label text-ink-mute">{CANONICAL_PRICING.title}</p>
      <p className="display-s tabular mt-1">{CANONICAL_PRICING.price}</p>
      <p className="body-s text-ink-2 mt-2">{CANONICAL_PRICING.includes}</p>
      <p className="body-s text-ink-2 mt-1">{CANONICAL_PRICING.then}</p>
      <p className="body-s text-ink-mute mt-2">{CANONICAL_PRICING.renewal}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

type PageState =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "not_open" }
  | { kind: "denied"; code: string; message?: string }
  | { kind: "error"; message?: string }
  | { kind: "ok"; status: ActivationStatusDto };

export default function ActivationPage() {
  const { member, memberChecking, memberToken } = useResearch();
  const [page, setPage] = useState<PageState>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (memberChecking) return;
    if (!memberToken) {
      setPage({ kind: "signed_out" });
      return;
    }
    let alive = true;
    void getActivationStatus(memberToken).then((res) => {
      if (!alive) return;
      if (res.kind === "ok") setPage({ kind: "ok", status: res.data });
      else if (res.kind === "unavailable") setPage({ kind: "not_open" });
      else if (res.kind === "unauthorized") setPage({ kind: "signed_out" });
      else if (res.kind === "denied") setPage({ kind: "denied", code: res.code, message: res.message });
      else if (res.kind === "error") setPage({ kind: "error", message: res.message });
      else setPage({ kind: "error", message: res.message });
    });
    return () => {
      alive = false;
    };
  }, [memberChecking, memberToken, nonce]);

  return (
    <>
      <SeoHead
        title="Activate membership, xenios research"
        description="Activate your xenios research Founding Membership: $50 due at activation, including your first 30 days of membership."
        path={ACCESS_ROUTES.activate}
      />
      <ResearchPublicShell
        eyebrow="Membership activation"
        title="You have been approved."
        lead="Activate your Founding Membership to open the in-depth onboarding and begin building your Whole-Life Blueprint."
      >
        {page.kind === "loading" && <ResearchLoadingState label="Loading your activation" />}

        {page.kind === "signed_out" && (
          <div className="grid gap-6">
            <FoundingPricingBlock />
            <ResearchEmptyState
              title="Sign in to continue your activation."
              body="Approved but no account? Use the secure link in your approval email. It opens your status page, where you create your account and choose your own password."
              action={
                <div className="flex flex-wrap gap-3">
                  <Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">
                    Member Login
                  </Link>
                  <Link href={ACCESS_ROUTES.applicationStatus} className="btn btn-secondary">
                    Application status
                  </Link>
                </div>
              }
            />
          </div>
        )}

        {page.kind === "not_open" && (
          <div className="grid gap-6">
            <FoundingPricingBlock />
            <ResearchPendingPanel
              kind="not_configured"
              title="Activation is not open yet."
              body="Founding membership activation has not been switched on for your account. Your approval window is honored, you will receive an email the moment it opens, and no payment is due before then."
              testid="activation-not-open"
            />
          </div>
        )}

        {page.kind === "denied" && <ResearchDenialNotice code={page.code} message={page.message} />}
        {page.kind === "error" && <ResearchErrorState message={page.message} onRetry={reload} />}

        {page.kind === "ok" && (
          <ActivationStepper
            status={page.status}
            token={memberToken}
            memberFirstName={member?.firstName ?? null}
            reload={reload}
          />
        )}

        <p className="mt-10 body-s text-ink-mute max-w-[56ch]">
          Membership does not guarantee access to every product, service, or professional pathway. Eligibility
          may depend on location, product category, documentation, and applicable requirements.
        </p>
        <Link href={ACCESS_ROUTES.gateway} className="btn btn-ghost mt-6">
          Back to xenios research
        </Link>
      </ResearchPublicShell>
    </>
  );
}

// ---------------------------------------------------------------------------
// The stepper body
// ---------------------------------------------------------------------------

function ActivationStepper({
  status,
  token,
  memberFirstName,
  reload,
}: {
  status: ActivationStatusDto;
  token: string | null;
  memberFirstName: string | null;
  reload: () => void;
}) {
  const current = status.currentStep;
  return (
    <div className="grid gap-8">
      {/* The tracker: every step, its honest state, and where the member is. */}
      <section aria-label="Activation progress" className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="mono-label text-ink-mute">Your activation</p>
          {status.active ? (
            <ResearchStatusBadge label="Active" tone="success" />
          ) : (
            <ResearchStatusBadge label="In progress" tone="info" />
          )}
        </div>
        {memberFirstName && (
          <p className="body-s text-ink-2 mt-2">
            Signed in as {memberFirstName}. This account is where your membership lives.
          </p>
        )}
        <ol className="mt-4 grid gap-2" data-testid="activation-steps">
          {status.steps.map((step) => {
            const badge = STEP_BADGE[step.state];
            const isCurrent = step.step === current;
            return (
              <li
                key={step.step}
                className="flex flex-wrap items-center justify-between gap-2"
                data-testid={`step-${step.step}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span className={`body-s ${isCurrent ? "font-700" : "text-ink-2"}`}>
                  {STEP_LABELS[step.step] ?? step.step}
                  {isCurrent ? " (you are here)" : ""}
                </span>
                <ResearchStatusBadge label={badge.label} tone={badge.tone} />
                {step.detail && <span className="body-s text-ink-mute w-full">{step.detail}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      {status.active ? (
        <ActivePanel status={status} />
      ) : (
        <>
          <IdentitySection token={token} reload={reload} />
          <AgreementsSection token={token} reload={reload} />
          <PaymentSection token={token} reload={reload} />
        </>
      )}

      <ResearchSecureNotice>
        Xenios never asks for card details, passwords, or your Social Security number by email. Every payment
        is verified by a person before your membership changes.
      </ResearchSecureNotice>
    </div>
  );
}

function ActivePanel({ status }: { status: ActivationStatusDto }) {
  return (
    <section aria-label="Membership active" className="card" data-testid="activation-active">
      <p className="body-m font-700">Your Founding Membership is active.</p>
      <dl className="mt-4 grid gap-3">
        {status.activatedAt && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="body-s text-ink-2">Activated</dt>
            <dd className="body-m tabular">{fmtDay(status.activatedAt)}</dd>
          </div>
        )}
        {status.renewalDate && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="body-s text-ink-2">First renewal date</dt>
            <dd className="body-m tabular" data-testid="activation-renewal-date">
              {fmtDay(status.renewalDate)}
            </dd>
          </div>
        )}
      </dl>
      <p className="body-s text-ink-2 mt-4 max-w-[56ch]">
        {CANONICAL_PRICING.then} You initiate each renewal payment yourself; nothing is charged automatically.
      </p>
      <Link href="/research/member" className="btn btn-primary mt-5">
        Open your member area
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Identity: consent first, then the upload path, then the review states.
// ---------------------------------------------------------------------------

type IdentityState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error"; message?: string }
  | { kind: "ok"; case: IdentityCaseDto | null; guidance: string[] };

function IdentitySection({ token, reload }: { token: string | null; reload: () => void }) {
  const [state, setState] = useState<IdentityState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localNonce, setLocalNonce] = useState(0);
  const refresh = useCallback(() => setLocalNonce((n) => n + 1), []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void getIdentityStatus(token).then((res) => {
      if (!alive) return;
      if (res.kind === "ok") setState({ kind: "ok", case: res.data.case, guidance: res.data.guidance ?? [] });
      else if (res.kind === "unavailable") setState({ kind: "unavailable" });
      else setState({ kind: "error", message: res.kind === "error" ? res.message : undefined });
    });
    return () => {
      alive = false;
    };
  }, [token, localNonce]);

  async function consent(accepted: boolean) {
    setBusy(true);
    setActionError(null);
    const res = await recordIdentityConsent(token, accepted, IDENTITY_CONSENT_VERSION);
    setBusy(false);
    if (res.kind === "ok") {
      refresh();
      reload();
    } else {
      setActionError(res.kind === "error" || res.kind === "denied" ? (res.message ?? "The consent could not be recorded.") : "The consent could not be recorded.");
    }
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setActionError(null);
    const grant = await requestIdentityUploadUrl(token, {
      contentType: file.type,
      contentLengthBytes: file.size,
      fileName: file.name,
    });
    if (grant.kind !== "ok") {
      setBusy(false);
      setActionError(
        grant.kind === "denied" || grant.kind === "error"
          ? (grant.message ?? "The upload could not be prepared.")
          : "The upload could not be prepared.",
      );
      return;
    }
    const sent = await uploadFileToGrant(grant.data.grant.uploadUrl, file, file.type);
    if (!sent) {
      setBusy(false);
      setActionError("The upload did not complete. Please try again.");
      return;
    }
    const marked = await markIdentityUploaded(token);
    setBusy(false);
    if (marked.kind === "ok") {
      setFile(null);
      refresh();
      reload();
    } else {
      setActionError(
        marked.kind === "denied" || marked.kind === "error"
          ? (marked.message ?? "The upload could not be confirmed.")
          : "The upload could not be confirmed.",
      );
    }
  }

  return (
    <section aria-labelledby="ra-activate-identity" data-testid="activation-identity">
      <h2 id="ra-activate-identity" className="body-m font-700">
        Identity verification
      </h2>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        A named person on our team confirms your legal name and that you are 21 or older. It is a manual check,
        not an automated identity service.
      </p>
      <div className="mt-4">
        {state.kind === "loading" && <ResearchLoadingState label="Loading identity status" />}
        {state.kind === "unavailable" && (
          <ResearchEmptyState
            title="Identity verification is not open yet."
            body="This step opens with activation. Nothing is needed from you today."
          />
        )}
        {state.kind === "error" && <ResearchErrorState message={state.message} onRetry={refresh} />}
        {state.kind === "ok" && (
          <IdentityBody
            kase={state.case}
            guidance={state.guidance}
            busy={busy}
            actionError={actionError}
            file={file}
            setFile={setFile}
            onConsent={(accepted) => void consent(accepted)}
            onUpload={() => void upload()}
          />
        )}
      </div>
    </section>
  );
}

function IdentityGuidance({ guidance }: { guidance: string[] }) {
  if (!guidance.length) return null;
  return (
    <div className="card" data-testid="identity-guidance">
      <p className="mono-label text-ink-mute">Before you photograph your ID</p>
      <ul className="mt-3 grid gap-2" style={{ paddingLeft: 18, listStyle: "disc" }}>
        {guidance.map((line, i) => (
          <li key={i} className="body-s text-ink-2">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdentityBody({
  kase,
  guidance,
  busy,
  actionError,
  file,
  setFile,
  onConsent,
  onUpload,
}: {
  kase: IdentityCaseDto | null;
  guidance: string[];
  busy: boolean;
  actionError: string | null;
  file: File | null;
  setFile: (f: File | null) => void;
  onConsent: (accepted: boolean) => void;
  onUpload: () => void;
}) {
  const status = kase?.status ?? null;

  // Verified: done.
  if (kase?.outcome === "verified") {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="body-s text-ink-2">Your identity review is complete.</p>
        <ResearchStatusBadge label="Verified" tone="success" />
      </div>
    );
  }

  // Rejected: the review did not pass; a fresh consent opens a new attempt.
  if (kase?.outcome === "rejected" || status === "rejected") {
    return (
      <div className="grid gap-4">
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="body-s text-ink-2">The identity review did not pass.</p>
            <ResearchStatusBadge label="Rejected" tone="danger" />
          </div>
          {kase?.rejectionCategory && (
            <p className="body-s text-ink-mute mt-2">Reason category: {kase.rejectionCategory.replace(/_/g, " ")}.</p>
          )}
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            You can start a new attempt. Consent again below and upload a clearer photo.
          </p>
          <button type="button" className="btn btn-primary mt-4" disabled={busy} onClick={() => onConsent(true)}>
            {busy ? "Working..." : "Start a new attempt"}
          </button>
        </div>
        <IdentityGuidance guidance={guidance} />
        {actionError && <p className="body-s" role="alert" style={{ color: "var(--error)" }}>{actionError}</p>}
      </div>
    );
  }

  // Under review by a person.
  if (status === "uploaded" || status === "review_pending" || status === "under_review") {
    return (
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="body-s text-ink-2">Your document is with a named reviewer.</p>
          <ResearchStatusBadge label="Under review" tone="info" />
        </div>
        <p className="body-s text-ink-mute mt-2 max-w-[56ch]">
          A person reviews it by hand; you will be emailed when the review completes. Every administrator view
          of your document is logged.
        </p>
      </div>
    );
  }

  // Consent recorded (or an upload path already open): the upload form.
  if (status === "consent_recorded" || status === "upload_url_issued" || status === "upload_expired") {
    return (
      <div className="grid gap-4">
        <IdentityGuidance guidance={guidance} />
        <div className="card">
          <p className="body-m font-700">Upload a photo of your government ID</p>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            JPEG, PNG, or WebP. Cover what you are permitted to conceal before photographing (see the guidance
            above); keep the required fields visible.
          </p>
          <div className="mt-4">
            <label htmlFor="identity-file" className="form-label">
              ID photo
            </label>
            <input
              id="identity-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="input-field"
              data-testid="identity-file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary mt-4"
            disabled={busy || !file}
            onClick={onUpload}
            data-testid="identity-upload"
          >
            {busy ? "Uploading..." : "Upload for review"}
          </button>
          {actionError && (
            <p className="body-s mt-3" role="alert" style={{ color: "var(--error)" }}>
              {actionError}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Declined earlier: nothing was collected; consent can be given again.
  const declined = status === "consent_declined";

  // No case yet, or a case awaiting consent: the disclosures + the choice.
  return (
    <div className="grid gap-4">
      {declined && (
        <div className="card">
          <p className="body-s text-ink-2 max-w-[56ch]">
            You declined the identity check earlier, so nothing was collected. Activation needs it; you can
            consent below whenever you are ready.
          </p>
        </div>
      )}
      <IdentityGuidance guidance={guidance} />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => onConsent(true)}
          data-testid="identity-consent-accept"
        >
          {busy ? "Working..." : "I consent to the identity check"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => onConsent(false)}
          data-testid="identity-consent-decline"
        >
          I decline
        </button>
      </div>
      {actionError && (
        <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
          {actionError}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agreements: full documents shown scrollable, typed-name signatures,
// nothing ever prechecked, registry-flagged documents (arbitration and the
// release waiver) acknowledged separately.
// ---------------------------------------------------------------------------

type AgreementsState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error"; message?: string }
  | { kind: "ok"; agreements: AgreementDto[]; satisfied: boolean };

function AgreementsSection({ token, reload }: { token: string | null; reload: () => void }) {
  const [state, setState] = useState<AgreementsState>({ kind: "loading" });
  const [localNonce, setLocalNonce] = useState(0);
  const refresh = useCallback(() => setLocalNonce((n) => n + 1), []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void listAgreements(token).then((res) => {
      if (!alive) return;
      if (res.kind === "ok") {
        const ordered = [...res.data.agreements].sort((a, b) => a.activationStep - b.activationStep);
        setState({ kind: "ok", agreements: ordered, satisfied: res.data.satisfied });
      } else if (res.kind === "unavailable") setState({ kind: "unavailable" });
      else setState({ kind: "error", message: res.kind === "error" ? res.message : undefined });
    });
    return () => {
      alive = false;
    };
  }, [token, localNonce]);

  return (
    <section aria-labelledby="ra-activate-agreements" data-testid="activation-agreements">
      <h2 id="ra-activate-agreements" className="body-m font-700">
        Agreements
      </h2>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Read each document in full and sign it with your typed legal name. Nothing is accepted on your behalf,
        and nothing is prechecked. The electronic records consent comes first; it makes the rest signable.
      </p>
      <div className="mt-4 grid gap-4">
        {state.kind === "loading" && <ResearchLoadingState label="Loading agreements" />}
        {state.kind === "unavailable" && (
          <ResearchEmptyState
            title="The agreements are not published yet."
            body="They appear here the moment counsel publishes them. Nothing is signed on your behalf."
          />
        )}
        {state.kind === "error" && <ResearchErrorState message={state.message} onRetry={refresh} />}
        {state.kind === "ok" && state.agreements.length === 0 && (
          <ResearchEmptyState
            title="No agreements are published yet."
            body="They appear here the moment counsel publishes them."
          />
        )}
        {state.kind === "ok" &&
          state.agreements.map((agreement) => (
            <AgreementSignCard
              key={agreement.documentVersionId}
              agreement={agreement}
              token={token}
              onSigned={() => {
                refresh();
                reload();
              }}
            />
          ))}
        {state.kind === "ok" && state.satisfied && (
          <div className="flex items-center gap-3">
            <ResearchStatusBadge label="All required agreements signed" tone="success" />
          </div>
        )}
      </div>
    </section>
  );
}

function AgreementSignCard({
  agreement,
  token,
  onSigned,
}: {
  agreement: AgreementDto;
  token: string | null;
  onSigned: () => void;
}) {
  // The blank form state: all false, empty name. Never prechecked.
  const [typedLegalName, setTypedLegalName] = useState("");
  const [affirmativeConsent, setAffirmativeConsent] = useState(false);
  const [separateAcknowledgment, setSeparateAcknowledgment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAck = agreement.requiresSeparateAcknowledgment;
  const ready = typedLegalName.trim().length > 0 && affirmativeConsent && (!needsAck || separateAcknowledgment);
  // The separate acknowledgment is required for two documents; the sentence
  // names what each one asks the member to acknowledge, so it never reads as
  // arbitration-only copy pasted onto the release.
  const ackLabel =
    agreement.category === "arbitration_agreement"
      ? "I separately acknowledge the arbitration provisions, including how disputes are resolved and the court and jury rights I am agreeing to give up. This acknowledgment is its own choice, not part of the checkbox above."
      : "I separately acknowledge this release and waiver, including the claims I am giving up and the liability limits I am agreeing to. This acknowledgment is its own choice, not part of the checkbox above.";

  async function sign() {
    setBusy(true);
    setError(null);
    const res = await signAgreement(token, {
      documentVersionId: agreement.documentVersionId,
      typedLegalName: typedLegalName.trim(),
      // True as a statement of fact: the FULL document text is rendered in
      // the scrollable viewer above, not a summary.
      fullDocumentShown: true,
      affirmativeConsent,
      ...(needsAck ? { separateAcknowledgment } : {}),
    });
    setBusy(false);
    if (res.kind === "ok") {
      onSigned();
      return;
    }
    if (res.kind === "denied") {
      if (res.code === "electronic_consent_required") {
        setError("Sign the electronic records consent first; it makes the other documents signable.");
        return;
      }
      setError(res.message ?? "This document cannot be signed right now.");
      return;
    }
    setError(res.kind === "error" ? res.message : "This document could not be signed. Please try again.");
  }

  const id = agreement.documentVersionId;
  return (
    <section className="card" aria-label={`${agreement.title} agreement`} data-testid={`agreement-${agreement.category}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mono-label text-ink-mute">
          Agreement · v{agreement.semver} · {agreement.jurisdiction}
        </p>
        {agreement.signed ? (
          <ResearchStatusBadge label="Signed" tone="success" />
        ) : (
          <ResearchStatusBadge label="Signature required" tone="warning" />
        )}
      </div>
      <p className="body-m font-700 mt-1">{agreement.title}</p>

      {/* The FULL document, scrollable; never a summary. */}
      <div
        className="ra-agreement-body body-s text-ink-2 mt-3"
        style={{ maxHeight: 320, overflowY: "auto", whiteSpace: "pre-wrap" }}
        tabIndex={0}
        role="document"
        aria-label={`${agreement.title}, full text`}
        data-testid={`agreement-content-${agreement.category}`}
      >
        {agreement.content}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          className="body-s underline text-ink-mute"
          download={`${agreement.category}-v${agreement.semver}.txt`}
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(agreement.content)}`}
          data-testid={`agreement-download-${agreement.category}`}
        >
          Download a copy
        </a>
        <span className="mono-label text-ink-mute" style={{ overflowWrap: "anywhere" }}>
          Integrity hash {agreement.contentHash.slice(0, 12)}…
        </span>
      </div>

      {!agreement.signed && (
        <div className="mt-5 grid gap-4">
          <div>
            <label htmlFor={`sign-name-${id}`} className="form-label">
              Your typed legal name (this is your signature)
            </label>
            <input
              id={`sign-name-${id}`}
              className="input-field"
              autoComplete="name"
              value={typedLegalName}
              onChange={(e) => setTypedLegalName(e.target.value)}
              data-testid={`agreement-name-${agreement.category}`}
            />
          </div>
          <label className="flex items-start gap-3 body-s text-ink-2" htmlFor={`sign-consent-${id}`}>
            <input
              id={`sign-consent-${id}`}
              type="checkbox"
              checked={affirmativeConsent}
              onChange={(e) => setAffirmativeConsent(e.target.checked)}
              data-testid={`agreement-consent-${agreement.category}`}
            />
            <span>I have read this document in full and I agree to it.</span>
          </label>
          {needsAck && (
            <label className="flex items-start gap-3 body-s text-ink-2" htmlFor={`sign-ack-${id}`}>
              <input
                id={`sign-ack-${id}`}
                type="checkbox"
                checked={separateAcknowledgment}
                onChange={(e) => setSeparateAcknowledgment(e.target.checked)}
                data-testid={`agreement-ack-${agreement.category}`}
              />
              <span>{ackLabel}</span>
            </label>
          )}
          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !ready}
              onClick={() => void sign()}
              data-testid={`agreement-sign-${agreement.category}`}
            >
              {busy ? "Signing..." : "Sign this document"}
            </button>
          </div>
          {error && (
            <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Payment: the canonical pricing, method selection (masked instructions
// only), the report form (a report, never an activation), and evidence.
// ---------------------------------------------------------------------------

type PaymentState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error"; message?: string }
  | {
      kind: "ok";
      obligation: MemberObligationDto | null;
      submissionContract: string;
      methods: MemberMethodDto[];
      memoReference: string | null;
      methodsDeniedCode: string | null;
    };

function PaymentSection({ token, reload }: { token: string | null; reload: () => void }) {
  const [state, setState] = useState<PaymentState>({ kind: "loading" });
  const [localNonce, setLocalNonce] = useState(0);
  const refresh = useCallback(() => setLocalNonce((n) => n + 1), []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void (async () => {
      const obligationRes = await getObligation(token);
      if (!alive) return;
      if (obligationRes.kind !== "ok") {
        if (obligationRes.kind === "unavailable") setState({ kind: "unavailable" });
        else if (obligationRes.kind === "error") setState({ kind: "error", message: obligationRes.message });
        else setState({ kind: "error" });
        return;
      }
      const methodsRes = await listPaymentMethods(token);
      if (!alive) return;
      setState({
        kind: "ok",
        obligation: obligationRes.data.obligation,
        submissionContract: obligationRes.data.submissionContract,
        methods: methodsRes.kind === "ok" ? methodsRes.data.methods : [],
        memoReference: methodsRes.kind === "ok" ? methodsRes.data.memoReference : null,
        methodsDeniedCode: methodsRes.kind === "denied" ? methodsRes.code : null,
      });
    })();
    return () => {
      alive = false;
    };
  }, [token, localNonce]);

  return (
    <section aria-labelledby="ra-activate-payment" data-testid="activation-payment">
      <h2 id="ra-activate-payment" className="body-m font-700">
        Payment
      </h2>
      <div className="mt-4 grid gap-4">
        <FoundingPricingBlock />
        {state.kind === "loading" && <ResearchLoadingState label="Loading payment status" />}
        {state.kind === "unavailable" && (
          <ResearchEmptyState
            title="Payment is not open yet."
            body="This step opens with activation. No payment is due before then."
          />
        )}
        {state.kind === "error" && <ResearchErrorState message={state.message} onRetry={refresh} />}
        {state.kind === "ok" && (
          <PaymentBody
            token={token}
            obligation={state.obligation}
            submissionContract={state.submissionContract}
            methods={state.methods}
            memoReference={state.memoReference}
            methodsDeniedCode={state.methodsDeniedCode}
            refresh={() => {
              refresh();
              reload();
            }}
          />
        )}
      </div>
    </section>
  );
}

function PaymentBody({
  token,
  obligation,
  submissionContract,
  methods,
  memoReference,
  methodsDeniedCode,
  refresh,
}: {
  token: string | null;
  obligation: MemberObligationDto | null;
  submissionContract: string;
  methods: MemberMethodDto[];
  memoReference: string | null;
  methodsDeniedCode: string | null;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);

  async function choose(methodId: string) {
    setBusy(true);
    setSelectError(null);
    const res = await selectPaymentMethod(token, methodId);
    setBusy(false);
    if (res.kind === "ok") {
      refresh();
      return;
    }
    if (res.kind === "denied") {
      setSelectError(
        res.code === "bridge_sunset" || res.code === "not_accepting_new_activation_payments"
          ? "New activation payments are paused right now. You will be emailed when they reopen."
          : (res.message ?? "That payment method cannot be used right now."),
      );
      return;
    }
    setSelectError(res.kind === "error" ? res.message : "The method could not be selected. Please try again.");
  }

  if (!obligation) {
    // No obligation yet. The wire only serves the methods list once an
    // obligation exists, so if methods came back denied we say so honestly.
    if (methods.length === 0) {
      return (
        <ResearchEmptyState
          title="Payment method selection is not available yet."
          body={
            methodsDeniedCode === "obligation_required"
              ? "Xenios has not published payment methods to your account yet. You will be emailed the moment your payment step opens; nothing is due until then."
              : "Payment methods appear here when your earlier steps are complete."
          }
          action={
            <button type="button" className="btn btn-secondary" onClick={refresh}>
              Check again
            </button>
          }
        />
      );
    }
    return (
      <div className="grid gap-4" data-testid="payment-method-picker">
        <p className="body-s text-ink-2 max-w-[56ch]">
          Choose how you will send your activation payment. Choosing a method creates your payment reference; it
          does not send any money.
        </p>
        {methods.map((method) => (
          <div key={method.methodId} className="card flex flex-wrap items-center justify-between gap-3">
            <div style={{ minWidth: 0 }}>
              <p className="body-m font-700">{method.memberFacingName}</p>
              {method.settlementTime && <p className="body-s text-ink-mute">Settles {method.settlementTime}.</p>}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void choose(method.methodId)}
              data-testid={`select-method-${method.methodId}`}
            >
              Use {method.memberFacingName}
            </button>
          </div>
        ))}
        {selectError && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {selectError}
          </p>
        )}
      </div>
    );
  }

  const statusBadge = OBLIGATION_STATUS_LABEL[obligation.status] ?? { label: obligation.status, tone: "neutral" as BadgeTone };
  const canSubmit = SUBMITTABLE.has(obligation.status);
  const awaitingVerification = obligation.status === "submitted" || obligation.status === "under_review";
  const selectedMethod = methods.find((m) => m.methodId === obligation.methodId) ?? null;
  const xrm = memoReference ?? obligation.xeniosRef;

  return (
    <div className="grid gap-4">
      {/* The obligation: what is due, and the reference that matches the payment to you. */}
      <div className="card" data-testid="payment-obligation">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="mono-label text-ink-mute">
            {obligation.type === "activation_50" ? "Activation payment" : "Renewal payment"}
          </p>
          <ResearchStatusBadge label={statusBadge.label} tone={statusBadge.tone} />
        </div>
        <p className="display-s tabular mt-1">{formatMoney(obligation.expectedAmountCents)}</p>
        <p className="body-s text-ink-2 mt-1">{obligation.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="mono-label" data-testid="payment-xrm">
            {obligation.xeniosRef}
          </span>
          <CopyButton value={obligation.xeniosRef} label="reference" />
        </div>
        <p className="body-s text-ink-mute mt-2">
          Include this reference in your payment memo so Xenios can match the payment to you.
        </p>
        {obligation.dueAt && <p className="body-s text-ink-mute mt-1">Due by {fmtDay(obligation.dueAt)}.</p>}
      </div>

      {/* The method and its MASKED instructions. Never a full destination. */}
      {selectedMethod ? (
        <div className="card" data-testid="payment-method-instructions">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="body-m font-700">Pay with {selectedMethod.memberFacingName}</p>
            {selectedMethod.settlementTime && (
              <span className="body-s text-ink-mute">Settles {selectedMethod.settlementTime}.</span>
            )}
          </div>
          <dl className="mt-3 grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="body-s text-ink-2">Receiving destination</dt>
              <dd className="mono-label" data-testid="payment-masked-destination">
                {selectedMethod.receivingInstructionsMasked}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="body-s text-ink-2">Memo to include</dt>
              <dd className="flex items-center gap-2">
                <span className="mono-label">{xrm}</span>
                <CopyButton value={xrm} label="memo" />
              </dd>
            </div>
          </dl>
          {selectedMethod.memoInstructions && (
            <p className="body-s text-ink-2 mt-3">{selectedMethod.memoInstructions}</p>
          )}
          {selectedMethod.mobileInstructions && (
            <p className="body-s text-ink-2 mt-2">{selectedMethod.mobileInstructions}</p>
          )}
          <p className="body-s text-ink-mute mt-3 max-w-[56ch]">
            The destination above is shown masked for your security. The full receiving details arrive in your
            payment step only through this method's own app or the instructions Xenios sends you; support will
            never ask you to send funds anywhere else.
          </p>
          <div className="mt-4" role="note" data-testid="payment-duplicate-warning">
            <p className="body-s font-700">Send exactly one payment.</p>
            <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
              If you are not sure whether a payment went through, do not send it again. Report it below and
              Xenios will check the receiving account before anything else happens.
            </p>
          </div>
          <p className="body-s font-700 mt-4 max-w-[56ch]" data-testid="payment-not-activation">
            {SUBMISSION_NOT_ACTIVATION}
          </p>
          {methods.length > 1 && (
            <details className="mt-4">
              <summary className="body-s text-ink-mute" style={{ cursor: "pointer" }}>
                Use a different method
              </summary>
              <div className="mt-3 grid gap-2">
                {methods
                  .filter((m) => m.methodId !== obligation.methodId)
                  .map((m) => (
                    <button
                      key={m.methodId}
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => void choose(m.methodId)}
                      data-testid={`select-method-${m.methodId}`}
                    >
                      Switch to {m.memberFacingName}
                    </button>
                  ))}
              </div>
            </details>
          )}
          {selectError && (
            <p className="body-s mt-3" role="alert" style={{ color: "var(--error)" }}>
              {selectError}
            </p>
          )}
        </div>
      ) : (
        <div className="card">
          <p className="body-s text-ink-2">
            Your payment is set up with {obligation.methodLabel}. The how-to-pay details are being prepared.
          </p>
        </div>
      )}

      {/* Awaiting verification: the honest in-between state. */}
      {awaitingVerification && (
        <div className="card" data-testid="payment-under-review">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="body-s text-ink-2">
              Your payment report is with Xenios. A person checks the receiving account before anything
              changes.
            </p>
            <ResearchStatusBadge label={statusBadge.label} tone="info" />
          </div>
          <p className="body-s text-ink-mute mt-2">{submissionContract}</p>
        </div>
      )}

      {/* Information requested / rejected: actionable, with the reason state. */}
      {obligation.status === "info_requested" && (
        <div className="card" data-testid="payment-info-requested">
          <p className="body-s font-700">Xenios needs more information about your payment.</p>
          <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
            Check your email for what was asked, then submit an updated report below. Your membership is not
            affected while this is open.
          </p>
        </div>
      )}
      {obligation.status === "rejected" && (
        <div className="card" data-testid="payment-rejected">
          <p className="body-s font-700">Your payment report was not accepted.</p>
          <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
            Check your email for the reason. If you already sent funds, do not send them again; submit a
            corrected report below and Xenios will re-check the receiving account.
          </p>
        </div>
      )}

      {/* The report form: a report, never an activation. */}
      {canSubmit && (
        <PaymentReportForm
          token={token}
          obligation={obligation}
          submissionContract={submissionContract}
          onReported={refresh}
        />
      )}

      {obligation.status === "verified" && obligation.receiptRef && (
        <div className="card">
          <p className="body-s text-ink-2">
            Payment verified. Receipt reference: <span className="mono-label">{obligation.receiptRef}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function PaymentReportForm({
  token,
  obligation,
  submissionContract,
  onReported,
}: {
  token: string | null;
  obligation: MemberObligationDto;
  submissionContract: string;
  onReported: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [sentDate, setSentDate] = useState("");
  const [sentTime, setSentTime] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderContact, setSenderContact] = useState("");
  const [senderIdentifierMasked, setSenderIdentifierMasked] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [note, setNote] = useState("");
  // The certification is NEVER prechecked; only the member's own click sets it.
  const [certified, setCertified] = useState(false);
  const [evidenceRef, setEvidenceRef] = useState<string | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  const amountCents = Math.round(Number.parseFloat(amount || "0") * 100);
  const ready =
    Number.isInteger(amountCents) && amountCents > 0 && sentDate.trim().length > 0 && senderName.trim().length > 0 && certified;

  async function uploadEvidence(file: File) {
    setEvidenceBusy(true);
    setEvidenceError(null);
    const grant = await requestEvidenceUploadUrl(token, {
      contentType: file.type,
      contentLengthBytes: file.size,
      fileName: file.name,
    });
    if (grant.kind !== "ok") {
      setEvidenceBusy(false);
      setEvidenceError(
        grant.kind === "denied" || grant.kind === "error"
          ? (grant.message ?? "The evidence upload could not be prepared.")
          : "The evidence upload could not be prepared.",
      );
      return;
    }
    const sent = await uploadFileToGrant(grant.data.grant.uploadUrl, file, file.type);
    setEvidenceBusy(false);
    if (!sent) {
      setEvidenceError("The evidence upload did not complete. Please try again.");
      return;
    }
    setEvidenceRef(grant.data.grant.evidenceRef);
  }

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors([]);
    const res = await reportPayment(token, {
      amountCents,
      sentDate: sentDate.trim(),
      sentTime: sentTime.trim() ? sentTime.trim() : null,
      senderName: senderName.trim(),
      senderContact: senderContact.trim() ? senderContact.trim() : null,
      senderIdentifierMasked: senderIdentifierMasked.trim() ? senderIdentifierMasked.trim() : null,
      externalRef: externalRef.trim() ? externalRef.trim() : null,
      note: note.trim() ? note.trim() : null,
      evidenceRef,
      accuracyCertified: true,
    });
    setBusy(false);
    if (res.kind === "ok") {
      onReported();
      return;
    }
    if (res.kind === "denied") {
      setError(res.message ?? "The report could not be submitted.");
      return;
    }
    if (res.kind === "error") {
      setError(res.message);
      return;
    }
    setError("The report could not be submitted. Please try again.");
  }

  return (
    <form
      className="card"
      aria-label="I sent my payment"
      data-testid="payment-report-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="body-m font-700">I sent my payment</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Tell Xenios exactly what you sent so a person can match it on the receiving account.
      </p>

      <div className="mt-4 grid gap-4">
        <div>
          <label htmlFor="report-amount" className="form-label">
            Amount sent (USD)
          </label>
          <input
            id="report-amount"
            className="input-field"
            inputMode="decimal"
            placeholder={(obligation.expectedAmountCents / 100).toFixed(2)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="report-amount"
          />
        </div>
        <div>
          <label htmlFor="report-sent-date" className="form-label">
            Date sent
          </label>
          <input
            id="report-sent-date"
            type="date"
            className="input-field"
            value={sentDate}
            onChange={(e) => setSentDate(e.target.value)}
            data-testid="report-sent-date"
          />
        </div>
        <div>
          <label htmlFor="report-sent-time" className="form-label">
            Time sent (optional)
          </label>
          <input
            id="report-sent-time"
            type="time"
            className="input-field"
            value={sentTime}
            onChange={(e) => setSentTime(e.target.value)}
            data-testid="report-sent-time"
          />
        </div>
        <div>
          <label htmlFor="report-sender-name" className="form-label">
            Name on the sending account
          </label>
          <input
            id="report-sender-name"
            className="input-field"
            autoComplete="name"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            data-testid="report-sender-name"
          />
        </div>
        <div>
          <label htmlFor="report-sender-contact" className="form-label">
            Sending phone or email (optional)
          </label>
          <input
            id="report-sender-contact"
            className="input-field"
            value={senderContact}
            onChange={(e) => setSenderContact(e.target.value)}
            data-testid="report-sender-contact"
          />
        </div>
        <div>
          <label htmlFor="report-sender-masked" className="form-label">
            Last digits of the sending account (optional, never the full number)
          </label>
          <input
            id="report-sender-masked"
            className="input-field"
            maxLength={8}
            value={senderIdentifierMasked}
            onChange={(e) => setSenderIdentifierMasked(e.target.value)}
            data-testid="report-sender-masked"
          />
        </div>
        <div>
          <label htmlFor="report-external-ref" className="form-label">
            Confirmation number from the payment app (optional)
          </label>
          <input
            id="report-external-ref"
            className="input-field"
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            data-testid="report-external-ref"
          />
        </div>
        <div>
          <label htmlFor="report-note" className="form-label">
            Anything else Xenios should know (optional)
          </label>
          <textarea
            id="report-note"
            className="input-field"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="report-note"
          />
        </div>

        {/* Evidence: optional screenshot, with redaction guidance. */}
        <div>
          <label htmlFor="report-evidence" className="form-label">
            Payment screenshot (optional)
          </label>
          <p className="body-s text-ink-mute mt-1 max-w-[56ch]" data-testid="evidence-redaction-guidance">
            Before uploading, you may redact anything unrelated: other transactions, account balances, and full
            account numbers. Keep the amount, the date, and the confirmation reference visible.
          </p>
          <input
            id="report-evidence"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="input-field mt-2"
            data-testid="report-evidence"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadEvidence(f);
            }}
          />
          {evidenceBusy && <p className="body-s text-ink-mute mt-2">Uploading evidence...</p>}
          {evidenceRef && (
            <p className="body-s text-ink-2 mt-2" data-testid="evidence-attached">
              Screenshot attached (reference <span className="mono-label">{evidenceRef}</span>).
            </p>
          )}
          {evidenceError && (
            <p className="body-s mt-2" role="alert" style={{ color: "var(--error)" }}>
              {evidenceError}
            </p>
          )}
        </div>

        <label className="flex items-start gap-3 body-s text-ink-2" htmlFor="report-certify">
          <input
            id="report-certify"
            type="checkbox"
            checked={certified}
            onChange={(e) => setCertified(e.target.checked)}
            data-testid="report-certify"
          />
          <span>I certify that the information in this report is accurate to the best of my knowledge.</span>
        </label>

        <p className="body-s font-700 max-w-[56ch]" data-testid="report-submission-contract">
          {submissionContract}
        </p>

        <div>
          <button type="submit" className="btn btn-primary" disabled={busy || !ready} data-testid="report-submit">
            {busy ? "Submitting..." : "Submit my payment report"}
          </button>
        </div>

        {fieldErrors.length > 0 && (
          <ul className="body-s" role="alert" style={{ color: "var(--error)", paddingLeft: 18, listStyle: "disc" }}>
            {fieldErrors.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {error && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
