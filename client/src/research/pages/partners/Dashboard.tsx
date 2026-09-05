import { Link } from "wouter";
import { useResearch, formatMoney } from "../../core";
import { ACCOUNT_PORTAL_ROUTES, MEMBER_ROUTES, PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import {
  ResearchDataTable,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchLoadingState,
  ResearchMetricCard,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../../ui/kit";
import { getPartnerDashboard } from "../../adapters/partner";
import { usePartnerResource, type BoundaryState } from "./shared";
import type { PartnerDashboardDto } from "@shared/research/commerce-api";
import type { CommissionState } from "@shared/research/distribution";
import { researchAuthPath } from "@shared/research/auth-return-to";

// ---------------------------------------------------------------------------
// Partner dashboard (/research/partners/dashboard). Aggregates only, straight
// from the frozen PartnerDashboardDto (GET /api/research/partner/dashboard):
// counts, totals, and the partner-visible conversion rows. No member-level
// field exists in the payload and none is invented here. A failed read is
// not evidence of zero activity or of a platform-wide launch state. These
// navigation links never grant a role, referral eligibility, or purchase access.
// ---------------------------------------------------------------------------

const UNAVAILABLE_VALUE = "Unavailable";
const UNAVAILABLE_SUMMARY = "The current dashboard figures could not be loaded.";

const ROLE_LABEL: Record<PartnerDashboardDto["role"], string> = {
  member_referral: "Member referral",
  affiliate: "Affiliate",
  research_rep: "Research Rep",
  senior_research_rep: "Senior Research Rep",
  organization_partner: "Organization partner",
  private_community_partner: "Private community partner",
  professional_partner: "Professional partner",
  future_wholesale: "Wholesale (future)",
  future_institutional: "Institutional (future)",
};

const COMMISSION_STATE_TONES: Record<CommissionState, BadgeTone> = {
  pending: "pending",
  held: "warning",
  approved: "info",
  payable: "info",
  paid: "success",
  reversed: "danger",
  disputed: "warning",
  forfeited: "danger",
};

type ConversionRow = PartnerDashboardDto["conversions"][number] & { key: string };

const PARTNER_STATES = new Set<PartnerDashboardDto["state"]>([
  "application", "identity_verification_pending", "tax_status_pending", "payout_status_pending",
  "agreement_pending", "training_pending", "certification_pending", "active", "quality_review", "suspended", "terminated",
]);
const nonnegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

// Validate only the fields this view consumes. In particular, the legacy
// leadCount default is not an observed count and must not become a metric.
function readableDashboard(value: unknown): value is PartnerDashboardDto {
  if (!record(value) || typeof value.role !== "string" || !Object.hasOwn(ROLE_LABEL, value.role)
    || typeof value.state !== "string" || !PARTNER_STATES.has(value.state as PartnerDashboardDto["state"])
    || !nonnegativeInteger(value.conversionCount) || !nonnegativeInteger(value.totalCommissionCents)
    || !nonnegativeInteger(value.payableCents) || !Array.isArray(value.conversions)
    || !Array.isArray(value.outstandingTraining)) return false;
  return value.conversions.every((row: unknown) => record(row)
    && typeof row.attributedAt === "string" && row.attributedAt.length <= 64 && Number.isFinite(Date.parse(row.attributedAt))
    && nonnegativeInteger(row.eligibleNetCents) && nonnegativeInteger(row.commissionCents)
    && typeof row.state === "string" && Object.hasOwn(COMMISSION_STATE_TONES, row.state))
    && value.outstandingTraining.every((item: unknown) => record(item)
      && typeof item.moduleKey === "string" && /^[a-zA-Z0-9._-]{1,128}$/.test(item.moduleKey)
      && typeof item.version === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(item.version));
}

function SignInNotice() {
  return (
    <ResearchEmptyState
      title="Sign in to view your partner dashboard"
      body="Use your Xenios account. Your partner activity is shown only when it is available to that account."
      action={
        <Link href={researchAuthPath("/research/sign-in", PARTNER_ROUTES.dashboard)} className="btn btn-primary" style={{ minHeight: 44 }}>
          Sign in
        </Link>
      }
    />
  );
}

export default function Dashboard() {
  const { memberToken, memberChecking } = useResearch();
  return (
    <ResearchPartnerShell title="Partner dashboard" lead="Your partner activity, without individual customer details." showNav={false}>
      <nav aria-label="Account and partner tools" className="flex flex-wrap gap-3">
        <Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary" style={{ minHeight: 44 }}>My account</Link>
        <Link href={MEMBER_ROUTES.fullCatalog} className="btn btn-secondary" style={{ minHeight: 44 }}>Browse catalog</Link>
        <Link href={PARTNER_ROUTES.links} className="btn btn-secondary" style={{ minHeight: 44 }}>Referral links</Link>
        <Link href={ACCOUNT_PORTAL_ROUTES.support} className="btn btn-secondary" style={{ minHeight: 44 }}>Account support</Link>
      </nav>
      <p className="body-s text-ink-2 mt-3 mb-6">Referral eligibility is checked when you open the referral tools.</p>
      {memberChecking ? <ResearchLoadingState label="Checking your account" />
        : memberToken ? <DashboardActivity key={memberToken} token={memberToken} /> : <SignInNotice />}
    </ResearchPartnerShell>
  );
}

function DashboardActivity({ token }: { token: string }) {
  const { state, errorMessage, denied, data, reload } = usePartnerResource<{ partner: PartnerDashboardDto }>(
    getPartnerDashboard,
    token,
  );

  if (state === "unauthorized") return <SignInNotice />;

  if (denied && (denied.code === "partner_not_found" || denied.code === "partner_not_active")) {
    return (
      <>
        <ResearchDenialNotice code={denied.code} message={denied.message} />
        <p className="body-s text-ink-2 mt-4">Partner access is separate from your customer account and catalog access.</p>
      </>
    );
  }

  // Unavailable preserves unknown figures; the boundary owns loading/error.
  const malformed = state === "ok" && !readableDashboard(data?.partner);
  const boundaryState: BoundaryState = state === "unavailable" ? "ok" : state;
  const partner = state === "ok" && !malformed ? data!.partner : null;

  const cards = [
    {
      label: "Leads",
      value: "Not reported",
      summary: "Lead counts are not reported by this dashboard. This is not a zero count.",
    },
    {
      label: "Commission-linked conversions",
      value: partner ? String(partner.conversionCount) : UNAVAILABLE_VALUE,
      summary: partner ? "Commission records with a positive balance in pending, held, approved, payable, paid, or disputed states. Not all purchases." : UNAVAILABLE_SUMMARY,
    },
    {
      label: "Net recorded commissions",
      value: partner ? formatMoney(partner.totalCommissionCents) : UNAVAILABLE_VALUE,
      summary: partner ? "Recorded commissions after reversals, including pending, held, approved, payable, paid, and disputed amounts. Not a payout balance." : UNAVAILABLE_SUMMARY,
    },
    {
      label: "Payable balance",
      value: partner ? formatMoney(partner.payableCents) : UNAVAILABLE_VALUE,
      summary: partner ? "Remaining commissions whose current state is payable. This does not confirm a scheduled or completed payout." : UNAVAILABLE_SUMMARY,
    },
  ];

  const conversions: ConversionRow[] = (partner?.conversions ?? []).map((c, i) => ({ ...c, key: `${c.attributedAt}-${i}` }));

  return (
      <ResearchRouteBoundary
        state={malformed ? "error" : boundaryState}
        errorMessage={malformed ? "The dashboard response could not be read safely. Please refresh to try again." : errorMessage ? "The partner dashboard could not be loaded. Please try again." : undefined}
        onRetry={() => void reload()}
      >
        {state === "unavailable" && (
          <div className="mb-4" role="status" aria-live="polite">
            <p className="body-s text-ink-2">Partner activity is unavailable right now. This does not mean there is no activity or that your account access has changed.</p>
            <button type="button" className="btn btn-secondary mt-3" style={{ minHeight: 44 }} onClick={() => void reload()}>Refresh dashboard</button>
          </div>
        )}

        {partner && (
          <div className="flex items-center gap-3 flex-wrap mb-4" data-testid="pd-identity">
            <ResearchStatusBadge label={ROLE_LABEL[partner.role] ?? partner.role} tone="neutral" />
            <ResearchStatusBadge
              label={partner.state.replace(/_/g, " ")}
              tone={partner.state === "active" ? "success" : "pending"}
            />
          </div>
        )}

        <div className="grid gap-4 min-w-0" data-testid="pd-metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", overflowWrap: "anywhere" }}>
          {cards.map((c) => (
            <ResearchMetricCard key={c.label} label={c.label} value={c.value} summary={c.summary} />
          ))}
        </div>

        {partner && partner.outstandingTraining.length > 0 && (
          <section aria-labelledby="pd-training" className="mt-10">
            <h2 id="pd-training" className="mono-cap text-ink-mute">
              Training to complete
            </h2>
            <div className="card mt-4" style={{ maxWidth: 640 }}>
              <ul className="body-s text-ink-2 grid gap-2" style={{ paddingLeft: 18, margin: 0 }}>
                {partner.outstandingTraining.map((t) => (
                  <li key={`${t.moduleKey}-${t.version}`}>
                    <span className="font-700">{t.moduleKey.replace(/[-_]/g, " ")}</span>
                    <span className="text-ink-mute"> (version {t.version})</span>
                  </li>
                ))}
              </ul>
              <p className="body-s text-ink-2 mt-4">Contact account support for the next authorized training step.</p>
              <div className="mt-4">
                <Link href={ACCOUNT_PORTAL_ROUTES.support} className="btn btn-secondary" style={{ minHeight: 44 }}>
                  Account support
                </Link>
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="pd-conversions" className="mt-10">
          <h2 id="pd-conversions" className="mono-cap text-ink-mute">
            Commission-linked activity
          </h2>
          <p className="body-s text-ink-2 mt-2">One row per commission chain with remaining value, as reported by the server. Fully reversed and forfeited chains are not counted.</p>
          <div className="mt-4" style={{ minWidth: 0, maxWidth: "100%", overflowX: "auto" }}>
            {state === "ok" ? (
              <ResearchDataTable<ConversionRow>
                caption="Commission-linked activity with attribution date, eligible net, remaining commission, and current state"
                columns={[
                  { key: "attributedAt", header: "Attributed", render: (r) => <span className="tabular">{new Date(r.attributedAt).toISOString()}</span> },
                  {
                    key: "eligibleNet",
                    header: "Eligible net",
                    render: (r) => <span className="tabular">{formatMoney(r.eligibleNetCents)}</span>,
                  },
                  {
                    key: "commission",
                    header: "Remaining commission",
                    render: (r) => <span className="tabular">{formatMoney(r.commissionCents)}</span>,
                  },
                  {
                    key: "state",
                    header: "State",
                    render: (r) => (
                      <ResearchStatusBadge label={r.state} tone={COMMISSION_STATE_TONES[r.state] ?? "neutral"} />
                    ),
                  },
                ]}
                rows={conversions}
                rowKey={(r) => r.key}
                empty="No commission-linked activity is recorded in this view. This does not mean there have been no referrals or purchases."
              />
            ) : (
              <ResearchEmptyState
                title="Commission-linked activity is unavailable."
                body="No count or balance can be inferred until the current dashboard figures are available."
              />
            )}
          </div>
        </section>

        <div className="mt-8">
          <ResearchSecureNotice>
            Dashboard figures are computed by the server. This view does not display customer names, contact details,
            purchased items, or health information. Referral opens and linked accounts are separate figures on the referral links page.
          </ResearchSecureNotice>
        </div>
      </ResearchRouteBoundary>
  );
}
