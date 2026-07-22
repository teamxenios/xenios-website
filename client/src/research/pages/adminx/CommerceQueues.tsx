import { Link } from "wouter";
import type { ReactNode } from "react";
import { getCommerceQueues } from "../../adapters/adminOps";
import {
  ResearchDataTable,
  ResearchEmptyState,
  ResearchMetricCard,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { CLAIM_REASON_LABELS, formatCents } from "../member/commerce-presentation";
import { fmtDateTime, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import type { AdminCommerceQueuesDto } from "@shared/research/commerce-api";
import type { PartnerState } from "@shared/research/distribution";

// ---------------------------------------------------------------------------
// /admin/research/commerce-queues: the founder's commerce operations queues,
// built against the frozen G10 admin contract
// (docs/research-commerce/API_CONTRACTS_COMMERCE.md ->
// GET /api/admin/research/commerce/queues -> AdminCommerceQueuesDto).
//
// Six queues, one per field of the DTO, each with its own honest empty state.
// Nothing here is invented: an unpublished endpoint renders the designed
// pending state, a denial routes on the machine code, and every count is
// simply the length of the array the API returned.
// ---------------------------------------------------------------------------

// A count is the item's own length. There is no derived scoring anywhere on
// this page; the founder reads the real queue depth.
type Queues = AdminCommerceQueuesDto;

const EMPTY_QUEUES: Queues = {
  largeOrderReview: [],
  claims: [],
  supplierFactBlocks: [],
  quarantinedLots: [],
  partnerReview: [],
  commissionDisputes: [],
};

// Money never prints $0.00 for a value that is missing. The DTO has no
// nullable amounts, but a partial payload must not crash or lie.
function money(cents: number | null | undefined): string {
  if (typeof cents !== "number" || Number.isNaN(cents)) return "Amount not recorded";
  return formatCents(cents);
}

function adminOrderHref(orderId: string): string {
  return ADMIN_ROUTES.order.replace(":id", encodeURIComponent(orderId));
}

// Partner lifecycle vocabulary. The frozen union lives in
// shared/research/distribution.ts; the copy is ours, plain, and never a raw
// machine code on screen.
const PARTNER_STATE_LABELS: Record<PartnerState, string> = {
  application: "Application received",
  identity_verification_pending: "Identity verification pending",
  tax_status_pending: "Tax status pending",
  payout_status_pending: "Payout status pending",
  agreement_pending: "Agreement pending",
  training_pending: "Training pending",
  certification_pending: "Certification pending",
  active: "Active",
  quality_review: "Quality review",
  suspended: "Suspended",
  terminated: "Terminated",
};

function partnerStateTone(state: PartnerState): BadgeTone {
  if (state === "active") return "success";
  if (state === "suspended" || state === "terminated") return "danger";
  if (state === "quality_review") return "warning";
  return "pending";
}

function partnerStateLabel(state: PartnerState): string {
  return PARTNER_STATE_LABELS[state] ?? state;
}

export default function CommerceQueues() {
  return (
    <AdminScreen
      title="Commerce queues"
      lead="Everything in commerce that is waiting on a human decision, in one place: held orders, member claims, unconfirmed supplier facts, quarantined lots, partners under review, and disputed commission."
    >
      {(token) => <CommerceQueuesBody token={token} />}
    </AdminScreen>
  );
}

export function CommerceQueuesBody({ token }: { token: string }) {
  const resource = useAdminResource(token, getCommerceQueues);

  return (
    <div className="grid gap-8">
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The commerce queues publish with the commerce backend."
        unavailableBody="This endpoint is not published in this environment yet, so there is nothing waiting to show. The page renders live queues the moment it connects."
      >
        <QueuesView queues={resource.data?.queues ?? EMPTY_QUEUES} />
      </AdminBoundary>

      <ResearchSecureNotice>
        These queues carry commerce and supply metadata only: order references, claim reasons, SKUs, lot ids, and
        partner ids. No member health record is read to build this page.
      </ResearchSecureNotice>
    </div>
  );
}

function QueuesView({ queues }: { queues: Queues }) {
  const counts = [
    {
      key: "largeOrderReview",
      label: "Held orders",
      value: queues.largeOrderReview.length,
      summary: "Waiting on your personal review, against an approximate two hour target.",
    },
    { key: "claims", label: "Claims", value: queues.claims.length, summary: "Members waiting on an answer about an order." },
    {
      key: "supplierFactBlocks",
      label: "Fact blocks",
      value: queues.supplierFactBlocks.length,
      summary: "SKUs with a product fact currently withheld from members.",
    },
    {
      key: "quarantinedLots",
      label: "Quarantined lots",
      value: queues.quarantinedLots.length,
      summary: "Lots blocked from shipping until their reasons clear.",
    },
    {
      key: "partnerReview",
      label: "Partner review",
      value: queues.partnerReview.length,
      summary: "Partners whose state needs a human decision.",
    },
    {
      key: "commissionDisputes",
      label: "Commission disputes",
      value: queues.commissionDisputes.length,
      summary: "Ledger entries a partner has disputed.",
    },
  ];
  const total = counts.reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="grid gap-8">
      <section aria-label="Queue summary" data-testid="section-queue-summary">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
          <h2 className="body-l font-700">Waiting on a decision</h2>
          <p className="body-s text-ink-mute" data-testid="text-queues-total">
            {total === 0 ? "Nothing is waiting across the six queues." : `${total} ${total === 1 ? "item" : "items"} across six queues`}
          </p>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {counts.map((c) => (
            <ResearchMetricCard key={c.key} label={c.label} value={String(c.value)} summary={c.summary} />
          ))}
        </div>
      </section>

      <LargeOrderReviewQueue rows={queues.largeOrderReview} />
      <ClaimsQueue rows={queues.claims} />
      <SupplierFactBlocksQueue rows={queues.supplierFactBlocks} />
      <QuarantinedLotsQueue rows={queues.quarantinedLots} />
      <PartnerReviewQueue rows={queues.partnerReview} />
      <CommissionDisputesQueue rows={queues.commissionDisputes} />
    </div>
  );
}

// One frame per queue so every section reads the same way: a heading, a plain
// sentence saying what the queue means, then either the rows or an honest
// empty state that says what an empty queue actually means.
function QueueSection({
  id,
  title,
  lead,
  count,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} data-testid={`section-${id}`}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-2">
        <h2 className="body-l font-700">{title}</h2>
        <span className="mono-label text-ink-mute tabular" data-testid={`count-${id}`}>
          {count} waiting
        </span>
      </div>
      <p className="body-s text-ink-2 mb-4 max-w-[72ch]">{lead}</p>
      {children}
    </section>
  );
}

// A list of short strings (triggers, unconfirmed facts, block reasons) reads
// as a list, not a comma run-on, so a long row stays scannable.
function ReasonList({ items, label }: { items: string[]; label: string }) {
  if (!items || items.length === 0) return <span className="text-ink-mute">None recorded</span>;
  return (
    <ul aria-label={label} style={{ margin: 0, paddingLeft: "1.1em" }}>
      {items.map((item, i) => (
        <li key={`${item}-${i}`}>{item}</li>
      ))}
    </ul>
  );
}

function LargeOrderReviewQueue({ rows }: { rows: Queues["largeOrderReview"] }) {
  return (
    <QueueSection
      id="large-order-review"
      title="Large order review (founder action queue)"
      lead="These orders are held and waiting on you personally. Members are told a held order is reviewed in about two hours, so this queue is the one with a clock on it. The order exists and nothing failed; it simply needs a human yes."
      count={rows.length}
    >
      {rows.length === 0 ? (
        <ResearchEmptyState
          title="No orders are held for review."
          body="An order lands here when it trips a large-order rule. Nothing is waiting on you right now."
        />
      ) : (
        <ResearchDataTable<Queues["largeOrderReview"][number]>
          caption="Orders held for founder review"
          columns={[
            {
              key: "order",
              header: "Order",
              render: (r) => (
                <Link href={adminOrderHref(r.orderId)} className="font-700 underline" data-testid={`link-held-order-${r.orderId}`}>
                  {r.orderId}
                </Link>
              ),
            },
            { key: "total", header: "Total", render: (r) => <span className="tabular">{money(r.totalCents)}</span> },
            { key: "triggers", header: "Why it is held", render: (r) => <ReasonList items={r.triggers} label={`Triggers for ${r.orderId}`} /> },
            { key: "held", header: "Held since", render: (r) => fmtDateTime(r.heldSince) || r.heldSince },
          ]}
          rows={rows}
          rowKey={(r) => r.orderId}
        />
      )}
    </QueueSection>
  );
}

function ClaimsQueue({ rows }: { rows: Queues["claims"] }) {
  return (
    <QueueSection
      id="claims"
      title="Claims"
      lead="Members reporting that something arrived wrong, damaged, or not at all. Each one is a person waiting on an answer."
      count={rows.length}
    >
      {rows.length === 0 ? (
        <ResearchEmptyState
          title="No open claims."
          body="A claim appears here as soon as a member submits one about an order."
        />
      ) : (
        <ResearchDataTable<Queues["claims"][number]>
          caption="Open member claims"
          columns={[
            { key: "claim", header: "Claim", render: (r) => <span className="font-700">{r.claimId}</span> },
            {
              key: "order",
              header: "Order",
              render: (r) => (
                <Link href={adminOrderHref(r.orderId)} className="underline" data-testid={`link-claim-order-${r.claimId}`}>
                  {r.orderId}
                </Link>
              ),
            },
            { key: "reason", header: "Reason", render: (r) => CLAIM_REASON_LABELS[r.reason] ?? r.reason },
            { key: "submitted", header: "Submitted", render: (r) => fmtDateTime(r.submittedAt) || r.submittedAt },
          ]}
          rows={rows}
          rowKey={(r) => r.claimId}
        />
      )}
    </QueueSection>
  );
}

function SupplierFactBlocksQueue({ rows }: { rows: Queues["supplierFactBlocks"] }) {
  return (
    <QueueSection
      id="supplier-fact-blocks"
      title="Supplier fact reconciliation (live worklist)"
      lead="An unconfirmed supplier fact is never serialized to a member, so every row here is a product fact currently withheld. Confirming or correcting a fact is what releases it. A disputed row means the supplier and our record disagree, and it stays withheld until that is settled."
      count={rows.length}
    >
      {rows.length === 0 ? (
        <ResearchEmptyState
          title="Every supplier fact is confirmed."
          body="Nothing is being withheld from members for want of a confirmed supplier fact."
        />
      ) : (
        <ResearchDataTable<Queues["supplierFactBlocks"][number]>
          caption="Supplier facts awaiting confirmation"
          columns={[
            { key: "sku", header: "SKU", render: (r) => <span className="font-700">{r.sku}</span> },
            {
              key: "facts",
              header: "Withheld from members",
              render: (r) => <ReasonList items={r.unconfirmedFacts} label={`Unconfirmed facts for ${r.sku}`} />,
            },
            {
              key: "disputed",
              header: "Dispute",
              render: (r) => (
                <span data-testid={`fact-dispute-${r.sku}`}>
                  <ResearchStatusBadge
                    label={r.disputed ? "Disputed" : "Not disputed"}
                    tone={r.disputed ? "danger" : "neutral"}
                  />
                </span>
              ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.sku}
        />
      )}
    </QueueSection>
  );
}

function QuarantinedLotsQueue({ rows }: { rows: Queues["quarantinedLots"] }) {
  return (
    <QueueSection
      id="quarantined-lots"
      title="Quarantined lots"
      lead="Lots blocked from shipping. Each lot stays blocked until every reason listed against it is cleared."
      count={rows.length}
    >
      {rows.length === 0 ? (
        <ResearchEmptyState
          title="No lots are quarantined."
          body="A lot appears here the moment it is blocked from shipping, with the reasons that blocked it."
        />
      ) : (
        <ResearchDataTable<Queues["quarantinedLots"][number]>
          caption="Quarantined lots"
          columns={[
            { key: "lot", header: "Lot", render: (r) => <span className="font-700">{r.lotId}</span> },
            { key: "sku", header: "SKU", render: (r) => r.sku },
            {
              key: "reasons",
              header: "Why it is blocked",
              render: (r) => <ReasonList items={r.blockReasons} label={`Block reasons for ${r.lotId}`} />,
            },
          ]}
          rows={rows}
          rowKey={(r) => r.lotId}
        />
      )}
    </QueueSection>
  );
}

function PartnerReviewQueue({ rows }: { rows: Queues["partnerReview"] }) {
  return (
    <QueueSection
      id="partner-review"
      title="Partner review"
      lead="Partners whose lifecycle state needs a human decision before they can earn or be paid. Nothing here is auto-advanced."
      count={rows.length}
    >
      {rows.length === 0 ? (
        <ResearchEmptyState
          title="No partners are waiting on review."
          body="A partner appears here when their state needs a decision, for example verification, certification, or a quality review."
        />
      ) : (
        <ResearchDataTable<Queues["partnerReview"][number]>
          caption="Partners awaiting review"
          columns={[
            {
              key: "partner",
              header: "Partner",
              render: (r) => (
                <Link
                  href={`${ADMIN_ROUTES.partners}/${encodeURIComponent(r.partnerId)}`}
                  className="font-700 underline"
                  data-testid={`link-partner-${r.partnerId}`}
                >
                  {r.partnerId}
                </Link>
              ),
            },
            {
              key: "state",
              header: "State",
              render: (r) => <ResearchStatusBadge label={partnerStateLabel(r.state)} tone={partnerStateTone(r.state)} />,
            },
          ]}
          rows={rows}
          rowKey={(r) => r.partnerId}
        />
      )}
    </QueueSection>
  );
}

function CommissionDisputesQueue({ rows }: { rows: Queues["commissionDisputes"] }) {
  const disputedTotal = rows.reduce((sum, r) => sum + (typeof r.amountCents === "number" && !Number.isNaN(r.amountCents) ? r.amountCents : 0), 0);
  return (
    <QueueSection
      id="commission-disputes"
      title="Commission disputes"
      lead={
        rows.length === 0
          ? "Ledger entries a partner has disputed. Money does not move on a disputed entry until it is resolved."
          : `Ledger entries a partner has disputed, ${money(disputedTotal)} in total. Money does not move on a disputed entry until it is resolved.`
      }
      count={rows.length}
    >
      {rows.length === 0 ? (
        <ResearchEmptyState
          title="No commission is disputed."
          body="A ledger entry appears here only when a partner disputes it."
        />
      ) : (
        <ResearchDataTable<Queues["commissionDisputes"][number]>
          caption="Disputed commission ledger entries"
          columns={[
            { key: "ledger", header: "Ledger entry", render: (r) => <span className="font-700">{r.ledgerId}</span> },
            {
              key: "partner",
              header: "Partner",
              render: (r) => (
                <Link
                  href={`${ADMIN_ROUTES.partners}/${encodeURIComponent(r.partnerId)}`}
                  className="underline"
                  data-testid={`link-dispute-partner-${r.ledgerId}`}
                >
                  {r.partnerId}
                </Link>
              ),
            },
            { key: "amount", header: "Amount", render: (r) => <span className="tabular">{money(r.amountCents)}</span> },
          ]}
          rows={rows}
          rowKey={(r) => r.ledgerId}
        />
      )}
    </QueueSection>
  );
}
