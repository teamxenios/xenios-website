import { useRef, useState } from "react";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../../ui/kit";
import { acceptPartnerAgreement, getPartnerOnboarding } from "../../adapters/partner";
import {
  PARTNER_PENDING_BODY,
  PARTNER_PENDING_TITLE,
  usePartnerCapabilities,
  usePartnerResource,
} from "./shared";

// ---------------------------------------------------------------------------
// Partner onboarding (/research/partners/onboarding). Verification status,
// the agreements checklist, and payout/tax setup. Live status comes only
// from GET /api/research/partner/onboarding; until that endpoint is
// published the page shows the honest pending state. The payout and tax
// section sits behind the affiliate_payouts capability boundary.
// ---------------------------------------------------------------------------

interface AgreementItem {
  id: string;
  title: string;
  version?: string | null;
  content?: string | null;
  contentHash?: string | null;
  required?: boolean | null;
  acknowledged?: boolean | null;
  acceptedAt?: string | null;
}

interface OnboardingPayload {
  verification?: { state?: string; detail?: string } | null;
  agreements?: AgreementItem[] | null;
}

const STEPS = [
  {
    title: "Identity verification",
    body: "We confirm who you are before your link exists. One account per person, always under a real name.",
  },
  {
    title: "Partner agreement",
    body: "The full Research Rep agreement is presented for review and acceptance. Nothing is shareable before it is accepted.",
  },
  {
    title: "Compliance certification",
    body: "The training modules and the certification check. Certification is required before your link is issued.",
  },
  {
    title: "Payout and tax setup",
    body: "Payout details and tax documentation are collected before your first payout, never before.",
  },
];

export default function Onboarding() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<OnboardingPayload>(
    getPartnerOnboarding,
    memberToken,
  );
  const capabilities = usePartnerCapabilities(memberToken);
  const payoutStatus = capabilityStatusOrPending(capabilities, "affiliate_payouts");

  return (
    <ResearchPartnerShell
      title="Onboarding"
      lead="The steps between an approved application and a live rep link. Each one is confirmed by the team, and your live status appears here as it moves."
    >
      <section aria-labelledby="po-steps">
        <h2 id="po-steps" className="mono-cap text-ink-mute">
          The onboarding steps
        </h2>
        <ol className="grid gap-4 mt-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {STEPS.map((step, i) => (
            <li key={step.title} className="card flex items-start gap-4">
              <span className="mono-label text-ink-mute" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <span className="body-m font-700 block">{step.title}</span>
                <span className="body-s text-ink-2 block mt-1">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="po-status" className="mt-10">
        <h2 id="po-status" className="mono-cap text-ink-mute">
          Your live status
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state}
            errorMessage={errorMessage}
            onRetry={() => void reload()}
            unavailableTitle={PARTNER_PENDING_TITLE}
            unavailableBody="Your verification status and agreements checklist appear here once partner onboarding opens. Nothing is required from you right now."
          >
            <div className="card">
              <p className="mono-label text-ink-mute">Identity verification</p>
              <div className="mt-2 flex items-center gap-3">
                <ResearchStatusBadge
                  label={data?.verification?.state ?? "Not started"}
                  tone={data?.verification?.state === "verified" ? "success" : "pending"}
                />
                {data?.verification?.detail && <p className="body-s text-ink-2">{data.verification.detail}</p>}
              </div>
            </div>
            <div className="card mt-4">
              <p className="mono-label text-ink-mute">Agreements checklist</p>
              {(data?.agreements ?? []).length === 0 ? (
                <div className="mt-2">
                  <p className="body-m font-700">Partner agreement not published</p>
                  <p className="body-s text-ink-2 mt-1">
                    The complete agreement must be published before you can review or accept it. Your account cannot
                    become active while this requirement is unresolved.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-5">
                  {(data?.agreements ?? []).map((a) => (
                    <PartnerAgreementCard
                      key={a.id}
                      agreement={a}
                      token={memberToken}
                      onAccepted={() => void reload()}
                    />
                  ))}
                </div>
              )}
            </div>
          </ResearchRouteBoundary>
        </div>
      </section>

      <section aria-labelledby="po-payout" className="mt-10">
        <h2 id="po-payout" className="mono-cap text-ink-mute">
          Payout and tax setup
        </h2>
        <div className="mt-4">
          <ResearchCapabilityBoundary status={payoutStatus}>
            <div className="card">
              <p className="body-m font-700">Payout details</p>
              <p className="body-s text-ink-2 mt-2">
                Payout method and tax documentation are collected here once the payout system is live. Until both are on
                file, cleared commissions wait as payable and nothing is lost.
              </p>
              <div className="mt-3">
                <ResearchStatusBadge label="Setup pending" tone="pending" />
              </div>
            </div>
          </ResearchCapabilityBoundary>
        </div>
      </section>
    </ResearchPartnerShell>
  );
}

function PartnerAgreementCard({
  agreement,
  token,
  onAccepted,
}: {
  agreement: AgreementItem;
  token: string | null;
  onAccepted: () => void;
}) {
  const [affirmed, setAffirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${agreement.id}-${Date.now().toString(36)}`,
  );
  const complete =
    Boolean(agreement.content?.trim()) &&
    Boolean(agreement.contentHash?.match(/^[0-9a-f]{64}$/)) &&
    Boolean(agreement.version?.trim());

  const accept = async () => {
    if (!affirmed || !complete || busy || !agreement.contentHash) return;
    setBusy(true);
    setMessage(null);
    const result = await acceptPartnerAgreement(
      agreement.id,
      agreement.contentHash,
      idempotencyKey.current,
      token,
    );
    setBusy(false);
    if (result.kind === "ok") {
      setMessage(result.data.message ?? "Agreement accepted.");
      onAccepted();
      return;
    }
    if (result.kind === "unauthorized") {
      setMessage("Your session has ended. Sign in again before accepting this agreement.");
      return;
    }
    if (result.kind === "denied") {
      setMessage("The agreement changed or cannot be accepted yet. Reload and review the current version.");
      return;
    }
    if (result.kind === "forbidden" || result.kind === "unavailable") {
      setMessage("Agreement acceptance is not available for this account yet.");
      return;
    }
    setMessage(result.message);
  };

  return (
    <section
      aria-label={`${agreement.title} agreement`}
      data-testid={`partner-agreement-${agreement.id}`}
      style={{ borderTop: "1px solid var(--ra-border, var(--rule))", paddingTop: 20 }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="body-m font-700">{agreement.title}</p>
          <p className="body-s text-ink-mute mt-1">
            Version {agreement.version}
            {agreement.required === false ? " · Optional" : " · Required"}
          </p>
        </div>
        <ResearchStatusBadge
          label={agreement.acknowledged ? "Accepted" : "Awaiting acceptance"}
          tone={agreement.acknowledged ? "success" : "warning"}
        />
      </div>

      {complete ? (
        <div
          className="ra-agreement-body body-s text-ink-2 mt-4"
          tabIndex={0}
          aria-label={`${agreement.title}, full text`}
          data-testid={`partner-agreement-content-${agreement.id}`}
          style={{ whiteSpace: "pre-wrap", maxHeight: 360, overflowY: "auto" }}
        >
          {agreement.content}
        </div>
      ) : (
        <div className="mt-4">
          <ResearchSecureNotice>
            Complete agreement text and integrity evidence are required before acceptance can open.
          </ResearchSecureNotice>
        </div>
      )}

      {!agreement.acknowledged && complete && (
        <div className="mt-4">
          <label className="flex items-start gap-3 body-s" htmlFor={`partner-agreement-accept-${agreement.id}`}>
            <input
              id={`partner-agreement-accept-${agreement.id}`}
              type="checkbox"
              checked={affirmed}
              onChange={(event) => setAffirmed(event.target.checked)}
            />
            <span>I reviewed the complete agreement and accept this version.</span>
          </label>
          <button
            type="button"
            className="btn btn-primary mt-4"
            disabled={!affirmed || busy}
            onClick={() => void accept()}
          >
            {busy ? "Saving acceptance..." : "Accept agreement"}
          </button>
        </div>
      )}

      {agreement.acknowledged && agreement.acceptedAt && (
        <p className="body-s text-ink-mute mt-3">
          Accepted {new Date(agreement.acceptedAt).toLocaleDateString("en-US")}. The accepted version remains in the
          audit record.
        </p>
      )}
      {message && (
        <p className="body-s mt-3" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

export { PartnerAgreementCard };
