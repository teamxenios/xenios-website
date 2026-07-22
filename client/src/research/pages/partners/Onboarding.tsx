import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchRouteBoundary,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../../ui/kit";
import { getPartnerOnboarding } from "../../adapters/partner";
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
  acknowledged?: boolean | null;
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
                <p className="body-s text-ink-2 mt-2">
                  No agreements have been presented yet. They appear here when onboarding reaches that step.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="mt-2 grid gap-3">
                  {(data?.agreements ?? []).map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3">
                      <span className="body-s">
                        {a.title}
                        {a.version ? ` (v${a.version})` : ""}
                      </span>
                      <ResearchStatusBadge
                        label={a.acknowledged ? "Accepted" : "Awaiting acceptance"}
                        tone={a.acknowledged ? "success" : "warning"}
                      />
                    </li>
                  ))}
                </ul>
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
