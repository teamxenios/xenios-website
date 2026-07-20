import { useEffect, useState } from "react";
import { useResearch, formatMoney } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchAgreementViewer,
  ResearchCapabilityBoundary,
  ResearchConfirmation,
  ResearchDataTable,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../../ui/kit";
import { apiGet, apiPost } from "../../lib/api";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { devFixture } from "../../lib/fixtures";

// ---------------------------------------------------------------------------
// Membership (/research/member/membership). The economics are fixed and
// public inside the member area: a $50 one-time activation and $25 monthly.
// There is no annual plan. Everything transactional (next charge, payment
// history, cancellation) renders ONLY from server data; when the contract is
// not published the page shows honest unavailable states, never invented
// billing facts.
// ---------------------------------------------------------------------------

type MembershipPayment = {
  id: string;
  at: string;
  label: string;
  amountCents: number;
  status: string;
};

type MembershipAgreement = {
  key: string;
  title: string;
  version: string;
  summary?: string | null;
  accepted?: boolean | null;
};

type MembershipData = {
  status?: string | null;
  startedAt?: string | null;
  nextChargeAt?: string | null;
  payments?: MembershipPayment[] | null;
  agreements?: MembershipAgreement[] | null;
};

// Agreements shown before the contract publishes real ones. Acceptance is
// never simulated: the viewer renders "Acceptance opens later".
const DEFAULT_AGREEMENTS: MembershipAgreement[] = [
  {
    key: "membership",
    title: "Membership Agreement",
    version: "pending",
    summary:
      "The full membership agreement text is published here before acceptance opens. Nothing has been accepted on your behalf.",
  },
  {
    key: "research-use",
    title: "Research Use Terms",
    version: "pending",
    summary:
      "The research use terms are published here before acceptance opens. You will review and accept them yourself.",
  },
];

type CancelState =
  | { phase: "idle" }
  | { phase: "confirming" }
  | { phase: "busy" }
  | { phase: "done" }
  | { phase: "unavailable" }
  | { phase: "error"; message: string };

export default function MembershipPage() {
  const { member, memberChecking, memberToken, refreshMember } = useResearch();
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  const [data, setData] = useState<MembershipData | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [cancel, setCancel] = useState<CancelState>({ phase: "idle" });

  useEffect(() => {
    let alive = true;
    void fetchCapabilities(memberToken).then((statuses) => {
      if (alive) setCapabilities(statuses);
    });
    return () => {
      alive = false;
    };
  }, [memberToken]);

  useEffect(() => {
    if (!member || !memberToken) return;
    let alive = true;
    (async () => {
      const res = await apiGet<MembershipData>("/api/research/member/membership", memberToken);
      if (!alive) return;
      if (res.kind === "ok") {
        setData(res.data);
      } else if (res.kind === "unauthorized") {
        setSessionEnded(true);
      } else {
        setData(
          devFixture<MembershipData>(() => ({
            status: "active",
            startedAt: "2026-06-02",
            nextChargeAt: "2026-08-02",
            payments: [
              { id: "pay_2", at: "2026-07-02", label: "Monthly membership", amountCents: 2500, status: "Paid" },
              { id: "pay_1", at: "2026-06-02", label: "One-time activation", amountCents: 5000, status: "Paid" },
            ],
          })),
        );
      }
      setDataLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [member, memberToken]);

  const billingStatus = capabilityStatusOrPending(capabilities, "membership_billing");
  const payments = data?.payments ?? null;
  const agreements = data?.agreements?.length ? data.agreements : DEFAULT_AGREEMENTS;

  async function confirmCancel() {
    if (!memberToken) return;
    setCancel({ phase: "busy" });
    const res = await apiPost<{ ok: boolean; message?: string }>("/api/research/member/cancel", { confirm: true }, memberToken);
    if (res.kind === "ok") {
      setCancel({ phase: "done" });
      await refreshMember();
      return;
    }
    if (res.kind === "unavailable") {
      setCancel({ phase: "unavailable" });
      return;
    }
    if (res.kind === "unauthorized") {
      setSessionEnded(true);
      setCancel({ phase: "idle" });
      return;
    }
    setCancel({
      phase: "error",
      message: res.kind === "forbidden" ? res.message ?? "This action is not permitted." : res.message,
    });
  }

  const state: "loading" | "ok" | "unauthorized" = memberChecking
    ? "loading"
    : !member || sessionEnded
      ? "unauthorized"
      : !dataLoaded
        ? "loading"
        : "ok";

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title="Membership"
      lead="Your plan, your payment history, your agreements, and how to leave."
    >
      <ResearchRouteBoundary state={state}>
        {/* The monthly membership card. Fixed economics; live facts only when supplied. */}
        <section aria-labelledby="ra-membership-plan" className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="ra-membership-plan" className="body-m font-700">
              Monthly membership
            </h2>
            {member && <ResearchStatusBadge label={member.status} tone={member.status === "active" ? "success" : "neutral"} />}
          </div>
          <dl className="mt-4 grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="body-s text-ink-2">Membership</dt>
              <dd className="body-m tabular">{formatMoney(2500)} per month</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="body-s text-ink-2">Activation</dt>
              <dd className="body-m tabular">{formatMoney(5000)} one time</dd>
            </div>
            {data?.startedAt && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="body-s text-ink-2">Member since</dt>
                <dd className="body-m tabular">{data.startedAt}</dd>
              </div>
            )}
            {data?.nextChargeAt && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="body-s text-ink-2">Next charge</dt>
                <dd className="body-m tabular">{data.nextChargeAt}</dd>
              </div>
            )}
          </dl>
          <p className="body-s text-ink-mute mt-4">
            There is no annual plan. The activation fee is paid once, when your membership starts.
          </p>
        </section>

        {/* Billing management is provider-backed: honest pending until enabled. */}
        <div className="mt-6">
          <ResearchCapabilityBoundary status={billingStatus}>
            <section aria-labelledby="ra-membership-billing" className="card">
              <h2 id="ra-membership-billing" className="body-m font-700">
                Billing
              </h2>
              <p className="body-s text-ink-2 mt-2">
                Your payment method and invoices are managed here.
              </p>
            </section>
          </ResearchCapabilityBoundary>
        </div>

        {/* Activation and payment history: server-supplied only. */}
        <section aria-labelledby="ra-membership-history" className="mt-10">
          <h2 id="ra-membership-history" className="body-m font-700">
            Activation and payment history
          </h2>
          <div className="mt-4">
            {payments && payments.length > 0 ? (
              <ResearchDataTable<MembershipPayment>
                caption="Membership payments, newest first"
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
                title="Payment history is not available yet."
                body="Your $50 activation and monthly payments will appear here once billing records are connected. Nothing is wrong with your membership."
              />
            )}
          </div>
        </section>

        {/* Agreements: never auto-accepted. */}
        <section aria-labelledby="ra-membership-agreements" className="mt-10">
          <h2 id="ra-membership-agreements" className="body-m font-700">
            Agreements
          </h2>
          <div className="mt-4 grid gap-4">
            {agreements.map((agreement) => (
              <ResearchAgreementViewer
                key={agreement.key}
                title={agreement.title}
                version={agreement.version}
                accepted={agreement.accepted ?? null}
                content={
                  <p>
                    {agreement.summary ??
                      "The full agreement text is published here before acceptance opens. Nothing has been accepted on your behalf."}
                  </p>
                }
              />
            ))}
          </div>
        </section>

        {/* Cancellation. The confirmation states the consequences exactly. */}
        <section aria-labelledby="ra-membership-cancel" className="mt-10 card">
          <h2 id="ra-membership-cancel" className="body-m font-700">
            Cancel membership
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            You can cancel at any time. Read the consequences carefully before you confirm; they take effect
            immediately.
          </p>
          <div className="mt-4">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCancel({ phase: "confirming" })}
              disabled={cancel.phase === "busy" || cancel.phase === "done"}
            >
              Cancel my membership
            </button>
          </div>
          <div role="status" aria-live="polite" className="mt-3">
            {cancel.phase === "done" && (
              <p className="body-s text-ink-2">
                Your cancellation was received. Your access has ended, and a confirmation is on record.
              </p>
            )}
            {cancel.phase === "unavailable" && (
              <p className="body-s text-ink-2">
                Online cancellation is not available yet. Email{" "}
                <a href="mailto:research@xeniostechnology.com" className="underline">
                  research@xeniostechnology.com
                </a>{" "}
                and a person will cancel it for you.
              </p>
            )}
            {cancel.phase === "error" && <p className="body-s text-ink-2">{cancel.message}</p>}
          </div>
        </section>

        <ResearchConfirmation
          open={cancel.phase === "confirming" || cancel.phase === "busy"}
          title="Cancel your membership?"
          danger
          busy={cancel.phase === "busy"}
          confirmLabel="Yes, cancel my membership"
          onConfirm={() => void confirmCancel()}
          onCancel={() => setCancel({ phase: "idle" })}
          body={
            <div>
              <p>Before you confirm, understand exactly what happens:</p>
              <ul className="mt-3 grid gap-2" style={{ paddingLeft: 18, listStyle: "disc" }}>
                <li>Access ends immediately.</li>
                <li>Remaining paid access is forfeited, subject to applicable law.</li>
                <li>Product subscriptions are handled separately and are not canceled here.</li>
                <li>Download your plans and data first.</li>
                <li>Required records may be retained.</li>
              </ul>
            </div>
          }
        />
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
