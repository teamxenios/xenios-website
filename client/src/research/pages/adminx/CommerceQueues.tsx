// ---------------------------------------------------------------------------
// /admin/research/commerce-queues: every commerce decision waiting on a human.
//
// This page renders the TEN queue kinds the commerce store actually derives and
// persists, straight from the shared wire contract. It used to render six named
// arrays that no server code ever produced, against a route typed
// `Promise<unknown>`, with a test that stubbed its own payload; server and
// screen had drifted apart and nothing could see it.
//
// The rule that shapes everything here: a queue that could not be read is NOT a
// queue with nothing in it. An unreadable source renders as unavailable, never
// as "0 waiting", because an operator told a queue is empty stops looking.
// ---------------------------------------------------------------------------
import { Link } from "wouter";
import { useState, type ReactNode } from "react";
import {
  getCommerceQueues,
  refundClaim,
  resolveClaimWithReplacement,
  reviewClaim,
  type AdminClaimReviewDecision,
} from "../../adapters/adminOps";
import {
  ResearchDataTable,
  ResearchEmptyState,
  ResearchMetricCard,
  ResearchSecureNotice,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { denialPresentation } from "../../lib/denials";
import { formatCents } from "../member/commerce-presentation";
import { fmtDateTime, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import {
  COMMERCE_QUEUE_KINDS,
  type AdminCommerceQueueDto,
  type AdminCommerceQueueItemDto,
  type AdminCommerceQueuesDto,
  type CommerceQueueKind,
} from "@shared/research/commerce-api";

// Plain operator language. A machine kind never reaches primary copy.
const QUEUE_LABELS: Record<CommerceQueueKind, string> = {
  large_order_review: "Held orders",
  payment_review: "Payments to review",
  refund_review: "Refunds to approve",
  replacement_review: "Replacements to approve",
  supplier_document_review: "Supplier documents",
  inventory_release: "Stock waiting for release",
  fulfillment_failure: "Fulfillment problems",
  payout_review: "Payouts to review",
  fraud_review: "Suspected fraud",
  recall_response: "Recalls to acknowledge",
};

const QUEUE_LEADS: Record<CommerceQueueKind, string> = {
  large_order_review:
    "Orders held because their value or their triggers asked for a person. Open one to approve, capture or cancel it.",
  payment_review:
    "Payments raised for a person to look at. These are queued explicitly; nothing derives them from an order.",
  refund_review:
    "Claims already dispositioned toward money going back. Money moves only on provider confirmation.",
  replacement_review: "Claims already dispositioned toward sending product again.",
  supplier_document_review:
    "Lots whose paperwork is incomplete. A lot cannot be released while a required document is missing.",
  inventory_release: "Lots that have their documents and are waiting to be released for sale.",
  fulfillment_failure:
    "Orders whose fulfillment stalled or was held. Each one is a customer waiting.",
  payout_review: "Partner payout batches waiting on a decision before money leaves.",
  fraud_review: "Store credit flagged as suspicious before it can be spent.",
  recall_response: "Recalled lots waiting for an acknowledged response.",
};

/** Where an item can be opened, when it has somewhere to go. */
function destinationFor(item: AdminCommerceQueueItemDto): { href: string; label: string } | null {
  const orderId = typeof item.detail.orderId === "string" ? item.detail.orderId : null;
  if (orderId) {
    return { href: ADMIN_ROUTES.order.replace(":id", encodeURIComponent(orderId)), label: "Open order" };
  }
  return null;
}

function money(cents: unknown): string {
  if (typeof cents !== "number" || Number.isNaN(cents)) return "Amount not recorded";
  return formatCents(cents);
}

export default function CommerceQueues() {
  return (
    <AdminScreen
      title="Commerce queues"
      lead="Everything in commerce that is waiting on a human decision, in one place. A queue that cannot be read says so rather than showing a zero."
    >
      {(token) => <CommerceQueuesBody token={token} />}
    </AdminScreen>
  );
}

export function CommerceQueuesBody({ token }: { token: string }) {
  const resource = useAdminResource(token, getCommerceQueues);
  // A completed claim action reloads the queues, which unmounts the row that
  // ran it; the confirmation lives up here so it survives the reload.
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  return (
    <div className="grid gap-8">
      {actionNotice && (
        <p className="body-s text-ink-2" role="status" aria-live="polite" data-testid="claims-action-notice">
          {actionNotice}
        </p>
      )}
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The commerce queues publish with the commerce backend."
        unavailableBody="This endpoint is not published in this environment yet, so there is nothing waiting to show. The page renders live queues the moment it connects."
      >
        <QueuesView
          view={resource.data?.queues ?? null}
          token={token}
          onChanged={(notice) => {
            setActionNotice(notice);
            resource.reload();
          }}
        />
      </AdminBoundary>

      <ResearchSecureNotice>
        These queues carry commerce and supply metadata only: order references, claim reasons, SKUs and lot ids. No
        member health record is read to build this page.
      </ResearchSecureNotice>
    </div>
  );
}

function QueuesView({
  view,
  token,
  onChanged,
}: {
  view: AdminCommerceQueuesDto | null;
  token: string;
  onChanged: (notice: string) => void;
}) {
  if (!view) {
    return (
      <ResearchEmptyState
        title="The queues did not answer."
        body="Nothing is claimed about what is waiting, because nothing could be read."
      />
    );
  }

  const byKind = new Map(view.queues.map((q) => [q.kind, q] as const));
  const answered = view.queues.filter((q) => q.availability.status === "available");
  const unavailable = view.queues.filter((q) => q.availability.status === "unavailable");
  // The total sums only over queues that actually answered. A total that
  // silently treats an unreadable queue as zero is the same lie in one number.
  const total = answered.reduce((sum, q) => sum + (q.openCount ?? 0), 0);

  return (
    <div className="grid gap-10">
      <div className="grid gap-4" data-testid="queues-summary">
        {!view.provisioned && (
          <p className="body-s text-ink-2" role="status" data-testid="queues-unprovisioned">
            Commerce storage is not provisioned in this environment, so no queue can be read.
          </p>
        )}
        <p className="body-s text-ink-mute" data-testid="text-queues-total">
          {answered.length === 0
            ? "No queue could be read."
            : total === 0
              ? `Nothing is waiting across the ${answered.length} ${answered.length === 1 ? "queue" : "queues"} that answered.`
              : `${total} ${total === 1 ? "item" : "items"} across the ${answered.length} ${answered.length === 1 ? "queue" : "queues"} that answered.`}
        </p>
        {unavailable.length > 0 && (
          <p className="body-s font-700" role="alert" data-testid="queues-degraded">
            {unavailable.length} {unavailable.length === 1 ? "source is" : "sources are"} unavailable. What they hold is
            unknown, not nothing.
          </p>
        )}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {COMMERCE_QUEUE_KINDS.map((kind) => {
            const q = byKind.get(kind);
            const available = q?.availability.status === "available";
            return (
              <ResearchMetricCard
                key={kind}
                label={QUEUE_LABELS[kind]}
                value={available ? String(q?.openCount ?? 0) : "Unavailable"}
                summary={available ? QUEUE_LEADS[kind] : "This source could not be read."}
              />
            );
          })}
        </div>
      </div>

      {COMMERCE_QUEUE_KINDS.map((kind) => {
        const queue = byKind.get(kind);
        if (!queue) return null;
        return <QueueSection key={kind} queue={queue} token={token} onChanged={onChanged} />;
      })}
    </div>
  );
}

function QueueSection({
  queue,
  token,
  onChanged,
}: {
  queue: AdminCommerceQueueDto;
  token: string;
  onChanged: (notice: string) => void;
}) {
  const { kind } = queue;
  const unavailable = queue.availability.status === "unavailable";
  return (
    <section aria-label={QUEUE_LABELS[kind]} data-testid={`section-${kind}`}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-2">
        <h2 className="body-l font-700">{QUEUE_LABELS[kind]}</h2>
        <span className="mono-label text-ink-mute tabular" data-testid={`count-${kind}`}>
          {unavailable ? "Unavailable" : `${queue.openCount ?? 0} waiting`}
        </span>
      </div>
      <p className="body-s text-ink-2 mb-4 max-w-[72ch]">{QUEUE_LEADS[kind]}</p>
      {unavailable ? (
        <div role="alert" data-testid={`unavailable-${kind}`}>
          <ResearchEmptyState
            title="This queue could not be read."
            body="Whatever is waiting here is unknown. It is not zero, and nothing should be decided from this screen until the source answers again."
          />
        </div>
      ) : (queue.items ?? []).length === 0 ? (
        <ResearchEmptyState
          title="Nothing is waiting."
          body="The source answered, and there is no open item of this kind."
        />
      ) : (
        <QueueItems kind={kind} items={queue.items ?? []} token={token} onChanged={onChanged} />
      )}
    </section>
  );
}

const CLAIM_KINDS: readonly CommerceQueueKind[] = ["refund_review", "replacement_review"];

function QueueItems({
  kind,
  items,
  token,
  onChanged,
}: {
  kind: CommerceQueueKind;
  items: readonly AdminCommerceQueueItemDto[];
  token: string;
  onChanged: (notice: string) => void;
}) {
  const showsClaimActions = CLAIM_KINDS.includes(kind);
  return (
    <ResearchDataTable<AdminCommerceQueueItemDto>
      caption={QUEUE_LABELS[kind]}
      columns={[
        {
          key: "summary",
          header: "What is waiting",
          render: (item) => (
            <div className="grid gap-1">
              <span>{item.summary}</span>
              <span className="mono-label text-ink-mute">{item.sourceRef}</span>
            </div>
          ),
        },
        {
          key: "value",
          header: "Value",
          render: (item) =>
            typeof item.detail.grossValueCents === "number" ? (
              <span className="tabular">{money(item.detail.grossValueCents)}</span>
            ) : (
              <span className="text-ink-mute">Not applicable</span>
            ),
        },
        {
          key: "opened",
          header: "Waiting since",
          render: (item) => <span className="tabular">{fmtDateTime(item.openedAt)}</span>,
        },
        {
          key: "action",
          header: "Next step",
          render: (item) => {
            const destination = destinationFor(item);
            const claimId = typeof item.detail.claimId === "string" ? item.detail.claimId : null;
            return (
              <div className="grid gap-3">
                {destination ? (
                  <Link className="btn btn-secondary min-h-11" href={destination.href}>
                    {destination.label}
                  </Link>
                ) : (
                  // No invented action. A kind with no destination says so
                  // rather than offering a control that does nothing.
                  <span className="body-s text-ink-mute" data-testid={`no-destination-${kind}`}>
                    Resolved where this record lives, not from this screen.
                  </span>
                )}
                {showsClaimActions && claimId && (
                  <ClaimActions claimId={claimId} token={token} onChanged={onChanged} />
                )}
              </div>
            );
          },
        },
      ]}
      rows={[...items]}
      rowKey={(item) => item.sourceRef}
    />
  );
}

function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the manual key
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type ClaimActionOutcome =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "done"; text: string }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "error"; message: string };

function ClaimActions({
  claimId,
  token,
  onChanged,
}: {
  claimId: string;
  token: string;
  onChanged: (notice: string) => void;
}) {
  const [outcome, setOutcome] = useState<ClaimActionOutcome>({ phase: "idle" });
  const [refundOpen, setRefundOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => newIdempotencyKey());

  const busy = outcome.phase === "busy";

  const settle = (result: { kind: string; code?: string; message?: string }, doneText: string, after?: () => void) => {
    if (result.kind === "ok") {
      setOutcome({ phase: "done", text: doneText });
      after?.();
      // The reload unmounts this row, so the confirmation is reported upward.
      onChanged(`${claimId}: ${doneText}`);
      return;
    }
    if (result.kind === "denied" && result.code) {
      setOutcome({ phase: "denied", code: result.code, message: result.message });
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      setOutcome({ phase: "unavailable" });
      return;
    }
    if (result.kind === "unauthorized") {
      setOutcome({ phase: "error", message: "Your admin session has ended. Sign in again." });
      return;
    }
    setOutcome({ phase: "error", message: result.message ?? "The action did not complete. Please try again." });
  };

  const review = async (decision: AdminClaimReviewDecision, doneText: string) => {
    if (busy) return;
    setOutcome({ phase: "busy" });
    settle(await reviewClaim<{ ok: boolean }>(token, claimId, decision), doneText);
  };

  const refund = async () => {
    if (busy) return;
    const parsed = Number.parseFloat(amountInput);
    const amountCents = Math.round(parsed * 100);
    if (!Number.isFinite(parsed) || !Number.isInteger(amountCents) || amountCents <= 0) {
      setOutcome({ phase: "error", message: "Enter a refund amount in dollars, greater than zero." });
      return;
    }
    setOutcome({ phase: "busy" });
    settle(
      await refundClaim<{ ok: boolean }>(token, claimId, amountCents, idempotencyKey),
      `Refund of ${formatCents(amountCents)} issued.`,
      () => {
        // Only a success rotates the key: the next refund is a new intent.
        setIdempotencyKey(newIdempotencyKey());
        setRefundOpen(false);
        setAmountInput("");
      },
    );
  };

  const replace = async () => {
    if (busy) return;
    setOutcome({ phase: "busy" });
    settle(await resolveClaimWithReplacement<{ ok: boolean }>(token, claimId), "Replacement arranged.");
  };

  return (
    <div className="grid gap-2" data-testid={`claim-actions-${claimId}`}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void review("approved", "Claim approved. Resolve it with a refund or a replacement.")}
          data-testid={`claim-approve-${claimId}`}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void review("declined", "Claim declined.")}
          data-testid={`claim-deny-${claimId}`}
        >
          Deny
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => setRefundOpen((open) => !open)}
          data-testid={`claim-refund-open-${claimId}`}
        >
          Refund...
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void replace()}
          data-testid={`claim-replacement-${claimId}`}
        >
          Send replacement
        </button>
      </div>

      {refundOpen && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mono-label text-ink-mute" htmlFor={`claim-refund-amount-${claimId}`}>
              Refund amount (USD)
            </label>
            <input
              id={`claim-refund-amount-${claimId}`}
              className="input-field"
              type="number"
              min={0.01}
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              style={{ width: 120 }}
              data-testid={`claim-refund-amount-${claimId}`}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void refund()}
            data-testid={`claim-refund-submit-${claimId}`}
          >
            {busy ? "Working..." : "Issue refund"}
          </button>
        </div>
      )}

      <div aria-live="polite">
        {outcome.phase === "done" && (
          <p className="body-s text-ink-2" role="status" data-testid={`claim-done-${claimId}`}>
            {outcome.text}
          </p>
        )}
        {outcome.phase === "denied" &&
          (() => {
            // Route on the machine code; copy comes from the designed table.
            const p = denialPresentation(outcome.code, outcome.message);
            return (
              <p className="body-s text-ink-2" role="status" data-testid={`claim-denied-${claimId}`}>
                {p.title} {p.body}
              </p>
            );
          })()}
        {outcome.phase === "unavailable" && (
          <p className="body-s text-ink-2" role="status" data-testid={`claim-unavailable-${claimId}`}>
            This action is not published in this environment yet, so nothing changed on the claim.
          </p>
        )}
        {outcome.phase === "error" && (
          <p className="body-s font-700" role="alert" data-testid={`claim-error-${claimId}`}>
            {outcome.message}
          </p>
        )}
      </div>
    </div>
  );
}

