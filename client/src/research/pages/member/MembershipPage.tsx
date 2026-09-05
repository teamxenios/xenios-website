import { useEffect, useState } from "react";
import { Link } from "wouter";
import { z } from "zod";
import { useResearch, formatMoney } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDataTable,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchLoadingState,
  ResearchRouteBoundary,
  ResearchStatusBadge,
} from "../../ui/kit";
import { getMembership } from "../../adapters/member";
import { getStoreCredit } from "../../adapters/commerce";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import type { StoreCreditDto } from "@shared/research/commerce-api";

// ---------------------------------------------------------------------------
// Compatibility route, now read-only account access and historical billing.
// Approved customer access does not require a paid membership. Legacy records
// remain source-derived; this page does not cancel charges, refund payments,
// sell activation, or mutate account access.
// ---------------------------------------------------------------------------

const HistoricalBillingSchema = z.object({
  status: z.string().nullable().optional(),
  planLabel: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  nextChargeAt: z.string().nullable().optional(),
  payments: z.array(z.object({
    id: z.string(), at: z.string(), label: z.string(),
    amountCents: z.number().int().safe(), status: z.string(),
  })).nullable().optional(),
  agreements: z.array(z.object({
    key: z.string(), title: z.string(), version: z.string(),
    summary: z.string().nullable().optional(), accepted: z.boolean().nullable().optional(),
  })).nullable().optional(),
});
type HistoricalBillingData = z.infer<typeof HistoricalBillingSchema>;
type MembershipPayment = NonNullable<HistoricalBillingData["payments"]>[number];
type HistoryState = { kind: "loading" | "unavailable" | "unauthorized" }
  | { kind: "ready"; data: HistoricalBillingData };

export default function MembershipPage() {
  const { member, memberChecking, memberToken } = useResearch();
  const state = memberChecking ? "loading" : !member || !memberToken ? "unauthorized" : "ok";

  return (
    <ResearchMemberShell
      eyebrow="Account"
      title="Account access and billing history"
      lead="Your recorded account status, historical billing records, and separate store credit."
    >
      <ResearchRouteBoundary state={state}>
        <section aria-labelledby="ra-membership-plan" className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="ra-membership-plan" className="body-m font-700">
              Account access
            </h2>
            {member && <ResearchStatusBadge label={member.status} tone={member.status === "active" ? "success" : "neutral"} />}
          </div>
          <p className="body-s text-ink-2 mt-4">
            Paid membership is not required for approved customer access. The status above comes from your
            account record; this page does not approve access or change it.
          </p>
          <p className="body-s text-ink-mute mt-3">
            Historical charges and agreements are preserved for review. This page does not refund payments or
            cancel existing recurring charges. Product subscriptions, Care, and
            account approval remain separate.
          </p>
        </section>
        {memberToken ? <>
          <HistoricalBilling key={`billing:${memberToken}`} token={memberToken} />
          <StoreCreditSection key={`credit:${memberToken}`} token={memberToken} />
        </> : null}
        <section className="mt-10 card">
          <h2 className="body-m font-700">Review billing records</h2>
          <p className="body-s text-ink-2 mt-2">Historical billing questions need review; account access is not purchased or canceled here.</p>
          <div className="flex flex-wrap gap-3 mt-4">
            <Link className="btn btn-secondary" href={ACCOUNT_PORTAL_ROUTES.subscription}>Open billing history</Link>
            <Link className="btn btn-secondary" href={ACCOUNT_PORTAL_ROUTES.support}>Request billing support</Link>
          </div>
        </section>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}

function HistoricalBilling({ token }: { token: string }) {
  const [state, setState] = useState<HistoryState>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    void getMembership<unknown>(token).then((result) => {
      if (!alive) return;
      if (result.kind === "unauthorized") { setState({ kind: "unauthorized" }); return; }
      const parsed = result.kind === "ok" ? HistoricalBillingSchema.safeParse(result.data) : null;
      setState(parsed?.success ? { kind: "ready", data: parsed.data } : { kind: "unavailable" });
    }).catch(() => { if (alive) setState({ kind: "unavailable" }); });
    return () => { alive = false; };
  }, [token]);
  if (state.kind === "loading") return <ResearchLoadingState label="Loading historical billing records" />;
  if (state.kind === "unauthorized") return <p role="alert" className="body-s mt-6">Your session cannot read these billing records. Sign in again to review them.</p>;
  if (state.kind !== "ready") return <div className="mt-6"><ResearchEmptyState title="Historical billing records are unavailable."
    body="This does not mean there were no payments, no scheduled charges, or no agreements. No account-access change is inferred." /></div>;
  const { data } = state;
  const payments = data.payments;
  return <>
        <section className="card mt-6" aria-label="Recorded historical plan">
          <h2 className="body-m font-700">Historical plan record</h2>
          <dl className="grid gap-3 mt-3">
            <div><dt className="body-s text-ink-mute">Recorded plan</dt><dd>{data.planLabel ?? "Plan label unavailable"}</dd></div>
            <div><dt className="body-s text-ink-mute">Recorded billing-plan status</dt><dd>{data.status ?? "Status unavailable"}</dd></div>
            <div><dt className="body-s text-ink-mute">Recorded start date</dt><dd>{data.startedAt ?? "Start date unavailable"}</dd></div>
            <div><dt className="body-s text-ink-mute">Recorded legacy charge date</dt><dd>{data.nextChargeAt ?? "Charge schedule unavailable"}</dd></div>
          </dl>
          <p className="body-s text-ink-mute mt-3">These are historical source fields, not a new charge or a prerequisite for account access. Review any outstanding or scheduled charge with support.</p>
        </section>
        <section aria-labelledby="ra-membership-history" className="mt-10">
          <h2 id="ra-membership-history" className="body-m font-700">
            Historical payment records
          </h2>
          <div className="mt-4">
            {payments && payments.length > 0 ? (
              <ResearchDataTable<MembershipPayment>
                caption="Historical payments as recorded by the source"
                columns={[
                  { key: "at", header: "Date", render: (row) => <span className="tabular">{row.at}</span> },
                  { key: "label", header: "Payment", render: (row) => row.label },
                  { key: "amount", header: "Amount", render: (row) => <span className="tabular">{formatMoney(row.amountCents)}</span> },
                  {
                    key: "status",
                    header: "Status",
                    render: (row) => <ResearchStatusBadge label={row.status} tone={row.status === "Paid" ? "success" : "neutral"} />,
                  },
                ]}
                rows={payments}
                rowKey={(row) => row.id}
              />
            ) : (
              <ResearchEmptyState
                title={payments ? "No payment rows were returned." : "Payment history is unavailable."}
                body="History completeness is not reported by this endpoint. An empty or missing list does not erase past payments or confirm that no charges exist."
              />
            )}
          </div>
        </section>

        <section aria-labelledby="ra-membership-agreements" className="mt-10">
          <h2 id="ra-membership-agreements" className="body-m font-700">
            Recorded agreements
          </h2>
          <div className="mt-4 grid gap-4">
            {data.agreements?.length ? data.agreements.map((agreement) => (
              <article key={agreement.key} className="card" aria-label={`${agreement.title} historical agreement`}>
                <p className="mono-label text-ink-mute">Recorded agreement · v{agreement.version}</p>
                <h3 className="body-m font-700 mt-1">{agreement.title}</h3>
                <p className="body-s mt-3">{agreement.summary ?? "Agreement content is unavailable in this record. Nothing has been accepted on your behalf."}</p>
                <p className="body-s mt-3">{agreement.accepted === true ? "Recorded accepted" : agreement.accepted === false ? "Recorded not accepted" : "Acceptance record unavailable"}</p>
              </article>
            )) : <p className="body-s text-ink-mute">{data.agreements ? "No agreement rows were returned. History completeness is not reported." : "Agreement history is unavailable."}</p>}
          </div>
        </section>

  </>;
}

// ---------------------------------------------------------------------------
// Store credit (frozen StoreCreditDto, GET /api/research/store-credit).
// Spendable counts approved entries only; pending, held, reversed, and
// fraud-flagged credit is reported separately and is never spendable, so the
// two balances render as clearly separate cards and every non-approved entry
// is labeled "Not spendable".
// ---------------------------------------------------------------------------

type StoreCreditEntryRow = StoreCreditDto["entries"][number] & { key: string };

type StoreCreditState =
  | { kind: "loading" }
  | { kind: "ok"; credit: StoreCreditDto }
  | { kind: "unavailable" }
  | { kind: "denied"; code: string; message?: string }
  | { kind: "error"; message: string };

const ENTRY_STATE_LABEL: Record<string, { label: string; tone: "success" | "pending" | "warning" | "danger" }> = {
  approved: { label: "Spendable", tone: "success" },
  pending: { label: "Pending review, not spendable", tone: "pending" },
  held: { label: "Held, not spendable", tone: "warning" },
  reversed: { label: "Reversed, not spendable", tone: "danger" },
  fraud_flagged: { label: "Under review, not spendable", tone: "warning" },
};

function StoreCreditSection({ token }: { token: string | null }) {
  const [state, setState] = useState<StoreCreditState>({ kind: "loading" });

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void getStoreCredit(token).then((res) => {
      if (!alive) return;
      if (res.kind === "ok") setState({ kind: "ok", credit: res.data.storeCredit });
      else if (res.kind === "denied") setState({ kind: "denied", code: res.code, message: res.message });
      else if (res.kind === "error") setState({ kind: "error", message: res.message });
      else setState({ kind: "unavailable" });
    });
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <section aria-labelledby="ra-membership-credit" className="mt-10">
      <h2 id="ra-membership-credit" className="body-m font-700">
        Store credit
      </h2>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Referral and service credit. Only the "Available now" balance can be spent; credit pending review, held, or
        reversed is shown separately and cannot be spent while it is still reversible.
      </p>
      <div className="mt-4">
        {state.kind === "loading" && <ResearchLoadingState label="Loading store credit" />}
        {state.kind === "unavailable" && (
          <ResearchEmptyState
            title="Store credit is not available yet."
            body="The credit ledger could not provide a balance. No zero balance or account-access change is inferred."
          />
        )}
        {state.kind === "denied" && <ResearchDenialNotice code={state.code} message={state.message} />}
        {state.kind === "error" && (
          <ResearchEmptyState title="Store credit could not be loaded." body="Please try again shortly." />
        )}
        {state.kind === "ok" && (
          <>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <div className="card" data-testid="ra-credit-available">
                <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
                  <p className="mono-label text-ink-mute">Available now</p>
                  <ResearchStatusBadge label="Spendable" tone="success" />
                </div>
                <p className="display-s tabular mt-1">{formatMoney(state.credit.spendableCents)}</p>
                <p className="body-s text-ink-2 mt-2">Approved credit you can apply at checkout.</p>
              </div>
              <div className="card" data-testid="ra-credit-pending">
                <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
                  <p className="mono-label text-ink-mute">Pending review</p>
                  <ResearchStatusBadge label="Not spendable yet" tone="pending" />
                </div>
                <p className="display-s tabular mt-1">{formatMoney(state.credit.pendingCents)}</p>
                <p className="body-s text-ink-2 mt-2">
                  Credit still in its review window. It becomes spendable only when approved, and is not part of the
                  available balance.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ResearchDataTable<StoreCreditEntryRow>
                caption="Store credit entries with amount, state, reason, and when each becomes available"
                columns={[
                  {
                    key: "amount",
                    header: "Amount",
                    render: (e) => <span className="tabular">{formatMoney(e.amountCents)}</span>,
                  },
                  {
                    key: "state",
                    header: "State",
                    render: (e) => {
                      const s = ENTRY_STATE_LABEL[e.state] ?? { label: `${e.state}, not spendable`, tone: "pending" as const };
                      return <ResearchStatusBadge label={s.label} tone={s.tone} />;
                    },
                  },
                  { key: "reason", header: "Reason", render: (e) => e.reason.replace(/_/g, " ") },
                  {
                    key: "availableAt",
                    header: "Available",
                    render: (e) => (e.availableAt ? <span className="tabular">{e.availableAt}</span> : "After review"),
                  },
                ]}
                rows={state.credit.entries.map((e, i) => ({ ...e, key: `${e.reason}-${e.state}-${i}` }))}
                rowKey={(e) => e.key}
                empty="No credit entries yet. Referral credit appears here when it is earned."
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
