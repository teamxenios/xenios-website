import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import type { SubscriptionActionRequest, SubscriptionDto } from "@shared/research/commerce-api";
import { SUBSCRIPTION_FREQUENCIES, type SubscriptionFrequencyDays } from "@shared/research/commerce";
import { useResearch } from "../../core";
import { listSubscriptions, subscriptionAction } from "../../adapters/commerce";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  capabilityStatusOrPending,
  ResearchCapabilityBoundary,
  ResearchConfirmation,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchModal,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { formatDate, frequencyLabel, subscriptionStateMeta } from "./commerce-presentation";

// ---------------------------------------------------------------------------
// Member Product Subscriptions (/research/member/subscriptions), driven by the
// frozen GET /api/research/subscriptions (SubscriptionDto) and
// POST /api/research/subscriptions/:id (SubscriptionActionRequest).
//
// This is the PRODUCT subscription manager, deliberately distinct from
// membership (the $50 one-time activation and $25 monthly membership live on
// the Membership page).
//
// Rules baked in from the frozen contract:
// - Every subscription fact is a SubscriptionDto field. Nothing is invented,
//   and SubscriptionDto carries no price, so no money is shown here.
// - Every control is rendered so the member can see what managing a
//   subscription looks like, and every control is DISABLED with honest copy
//   while product_commerce is not enabled.
// - Every action routes on the RESULT KIND, and a denial routes on
//   result.code through the designed copy. Message text is never branched on.
// - An unpublished endpoint (kind "unavailable") renders the designed pending
//   state. It is never an error, because nothing is wrong.
// ---------------------------------------------------------------------------

const COMMERCE_CAPABILITY: ResearchCapability = "product_commerce";

const DISABLED_CONTROLS_COPY =
  "Subscription controls unlock when ordering opens. Nothing about your account is wrong; you can see how managing a subscription will work, and no change can be made yet.";

const NOT_SCHEDULED = "Not scheduled yet";

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; subscriptions: SubscriptionDto[] }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

// The outcome of the last action, scoped to the subscription it was run
// against, so a denial or a confirmation renders beside that card only.
type ActionOutcome =
  | { phase: "idle" }
  | { phase: "busy"; subscriptionId: string }
  | { phase: "done"; subscriptionId: string; text: string }
  | { phase: "denied"; subscriptionId: string; code: string; message?: string }
  | { phase: "unavailable"; subscriptionId: string }
  | { phase: "error"; subscriptionId: string; message: string };

// The four confirmed actions. Reschedule has its own dated modal, and the
// frequency and quantity controls submit inline.
type ConfirmableAction = "pause" | "resume" | "skip" | "cancel";

type ConfirmTarget = { subscription: SubscriptionDto; action: ConfirmableAction } | null;

const CONFIRM_COPY: Record<ConfirmableAction, { title: string; body: string; label: string; danger: boolean }> = {
  pause: {
    title: "Pause this subscription?",
    body: "Charges and shipments stop until you resume. Nothing is cancelled.",
    label: "Pause subscription",
    danger: false,
  },
  resume: {
    title: "Resume this subscription?",
    body: "Charges and shipments continue on the subscription's schedule.",
    label: "Resume subscription",
    danger: false,
  },
  skip: {
    title: "Skip the next shipment?",
    body: "Only the next shipment (and its charge) is skipped. The schedule continues after it.",
    label: "Skip next shipment",
    danger: false,
  },
  cancel: {
    title: "Cancel this subscription?",
    body: "Future charges and shipments stop. This does not affect your membership, and you can start a new subscription any time.",
    label: "Cancel subscription",
    danger: true,
  },
};

const CONFIRM_SUCCESS: Record<ConfirmableAction, string> = {
  pause: "Subscription paused. Resume it any time.",
  resume: "Subscription resumed.",
  skip: "The next shipment is skipped. Your schedule continues after it.",
  cancel: "Subscription cancelled. You can start a new one any time.",
};

// ---------------------------------------------------------------------------
// One subscription card: facts on the left, controls beneath. Controls are
// always rendered; `enabled` gates whether they can do anything.
// ---------------------------------------------------------------------------

function SubscriptionCard({
  subscription,
  enabled,
  outcome,
  onConfirm,
  onReschedule,
  onFrequency,
  onQuantity,
}: {
  subscription: SubscriptionDto;
  enabled: boolean;
  outcome: ActionOutcome;
  onConfirm: (action: ConfirmableAction) => void;
  onReschedule: () => void;
  onFrequency: (frequencyDays: SubscriptionFrequencyDays) => void;
  onQuantity: (quantity: number) => void;
}) {
  const meta = subscriptionStateMeta(subscription.state);
  const cancelled = subscription.state === "cancelled";
  const paused = subscription.state === "paused";
  const busy = outcome.phase === "busy";
  const controlsLocked = !enabled || busy || cancelled;

  const [frequencyDraft, setFrequencyDraft] = useState(String(subscription.frequencyDays));
  const [quantityDraft, setQuantityDraft] = useState(String(subscription.quantity));

  // formatDate returns null for an absent date, so an unscheduled date says
  // so plainly rather than borrowing a date that does not exist.
  const facts: Array<{ label: string; value: string }> = [
    { label: "Frequency", value: frequencyLabel(subscription.frequencyDays) },
    { label: "Quantity", value: String(subscription.quantity) },
    { label: "Next charge", value: formatDate(subscription.nextChargeAt) ?? NOT_SCHEDULED },
    { label: "Next shipment", value: formatDate(subscription.nextShipmentAt) ?? NOT_SCHEDULED },
  ];

  const submitFrequency = (e: FormEvent) => {
    e.preventDefault();
    if (controlsLocked) return;
    const days = Number(frequencyDraft);
    const match = SUBSCRIPTION_FREQUENCIES.find((f) => f === days);
    if (match === undefined) return;
    onFrequency(match);
  };

  const submitQuantity = (e: FormEvent) => {
    e.preventDefault();
    if (controlsLocked) return;
    const quantity = Number(quantityDraft);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
    onQuantity(quantity);
  };

  return (
    <section
      className="card"
      aria-label={`Subscription: ${subscription.displayName}`}
      data-testid={`sub-card-${subscription.subscriptionId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="body-m font-700">{subscription.displayName}</p>
          <p className="mono-label text-ink-mute mt-1">{subscription.sku}</p>
        </div>
        <ResearchStatusBadge label={meta.label} tone={meta.tone} />
      </div>

      <dl className="grid mt-4 gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="mono-label text-ink-mute">{fact.label}</dt>
            <dd className="body-s mt-1 tabular">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {!cancelled && (
        <div className="mt-5">
          <div className="flex flex-wrap gap-6">
            <form onSubmit={submitFrequency} className="flex items-end gap-2">
              <div>
                <label className="form-label" htmlFor={`freq-${subscription.subscriptionId}`}>
                  Frequency
                </label>
                <select
                  id={`freq-${subscription.subscriptionId}`}
                  className="input-field"
                  value={frequencyDraft}
                  disabled={controlsLocked}
                  aria-disabled={controlsLocked}
                  data-testid={`sub-frequency-${subscription.subscriptionId}`}
                  onChange={(e) => setFrequencyDraft(e.target.value)}
                >
                  {SUBSCRIPTION_FREQUENCIES.map((days) => (
                    <option key={days} value={String(days)}>
                      {frequencyLabel(days)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={controlsLocked}
                aria-disabled={controlsLocked}
                data-testid={`sub-frequency-submit-${subscription.subscriptionId}`}
              >
                Update frequency
              </button>
            </form>

            <form onSubmit={submitQuantity} className="flex items-end gap-2">
              <div>
                <label className="form-label" htmlFor={`qty-${subscription.subscriptionId}`}>
                  Quantity
                </label>
                <input
                  id={`qty-${subscription.subscriptionId}`}
                  className="input-field"
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={quantityDraft}
                  disabled={controlsLocked}
                  aria-disabled={controlsLocked}
                  data-testid={`sub-quantity-${subscription.subscriptionId}`}
                  onChange={(e) => setQuantityDraft(e.target.value)}
                  style={{ width: 96 }}
                />
              </div>
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={controlsLocked}
                aria-disabled={controlsLocked}
                data-testid={`sub-quantity-submit-${subscription.subscriptionId}`}
              >
                Update quantity
              </button>
            </form>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            {paused ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={controlsLocked}
                aria-disabled={controlsLocked}
                data-testid={`sub-resume-${subscription.subscriptionId}`}
                onClick={() => onConfirm("resume")}
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={controlsLocked}
                aria-disabled={controlsLocked}
                data-testid={`sub-pause-${subscription.subscriptionId}`}
                onClick={() => onConfirm("pause")}
              >
                Pause
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={controlsLocked}
              aria-disabled={controlsLocked}
              data-testid={`sub-skip-${subscription.subscriptionId}`}
              onClick={() => onConfirm("skip")}
            >
              Skip next shipment
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={controlsLocked}
              aria-disabled={controlsLocked}
              data-testid={`sub-reschedule-${subscription.subscriptionId}`}
              onClick={onReschedule}
            >
              Reschedule
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={controlsLocked}
              aria-disabled={controlsLocked}
              data-testid={`sub-cancel-${subscription.subscriptionId}`}
              onClick={() => onConfirm("cancel")}
            >
              Cancel subscription
            </button>
          </div>

          {!enabled && (
            <p className="body-s text-ink-mute mt-3 max-w-[56ch]" role="note">
              {DISABLED_CONTROLS_COPY}
            </p>
          )}
        </div>
      )}

      {/* The last action's outcome for THIS subscription. A denial routes on
          its machine code through the designed copy; an unpublished endpoint
          reports itself honestly instead of pretending a change happened. */}
      <div aria-live="polite" className="mt-4">
        {outcome.phase === "done" && (
          <p className="body-s text-ink-2" role="status" data-testid={`sub-done-${subscription.subscriptionId}`}>
            {outcome.text}
          </p>
        )}
        {outcome.phase === "denied" && <ResearchDenialNotice code={outcome.code} message={outcome.message} />}
        {outcome.phase === "unavailable" && (
          <p
            className="body-s text-ink-2"
            role="status"
            data-testid={`sub-unavailable-${subscription.subscriptionId}`}
          >
            This change is not available yet. The subscription service has not opened, and nothing was changed.
          </p>
        )}
        {outcome.phase === "error" && (
          <p className="body-s font-700" role="alert" data-testid={`sub-error-${subscription.subscriptionId}`}>
            {outcome.message}
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

export default function SubscriptionsPage() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  const [outcome, setOutcome] = useState<ActionOutcome>({ phase: "idle" });
  const [confirm, setConfirm] = useState<ConfirmTarget>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<SubscriptionDto | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await listSubscriptions(memberToken);
    switch (result.kind) {
      case "ok":
        setState({ phase: "ok", subscriptions: result.data.subscriptions });
        return;
      case "denied":
        setState({ phase: "denied", code: result.code, message: result.message });
        return;
      case "unauthorized":
        setState({ phase: "unauthorized" });
        return;
      case "forbidden":
      case "unavailable":
        setState({ phase: "unavailable" });
        return;
      case "error":
        setState({ phase: "error", message: result.message });
        return;
    }
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Capability statuses are fetched once per page; an absent registry degrades
  // to honest pending defaults (nothing is enabled by assumption).
  useEffect(() => {
    let cancelled = false;
    void fetchCapabilities(memberToken).then((map) => {
      if (!cancelled) setCapabilities(map);
    });
    return () => {
      cancelled = true;
    };
  }, [memberToken]);

  const commerceStatus = capabilityStatusOrPending(capabilities, COMMERCE_CAPABILITY);
  const commerceEnabled = commerceStatus.state === "enabled";

  // One action path for every subscription change. It posts the frozen
  // SubscriptionActionRequest and routes on the result kind, never on text.
  const run = useCallback(
    async (subscriptionId: string, request: SubscriptionActionRequest, successText: string): Promise<boolean> => {
      setOutcome({ phase: "busy", subscriptionId });
      const result = await subscriptionAction(memberToken, subscriptionId, request);
      switch (result.kind) {
        case "ok":
          setOutcome({ phase: "done", subscriptionId, text: successText });
          await load();
          return true;
        case "denied":
          setOutcome({ phase: "denied", subscriptionId, code: result.code, message: result.message });
          return false;
        case "unauthorized":
          setOutcome({ phase: "idle" });
          setState({ phase: "unauthorized" });
          return false;
        case "forbidden":
        case "unavailable":
          setOutcome({ phase: "unavailable", subscriptionId });
          return false;
        case "error":
          setOutcome({ phase: "error", subscriptionId, message: result.message });
          return false;
      }
    },
    [memberToken, load],
  );

  const runConfirm = async () => {
    if (!confirm) return;
    const { subscription, action } = confirm;
    setConfirm(null);
    await run(subscription.subscriptionId, { action }, CONFIRM_SUCCESS[action]);
  };

  const runReschedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !rescheduleDate) return;
    const done = await run(
      rescheduleTarget.subscriptionId,
      { action: "reschedule", rescheduleTo: rescheduleDate },
      "The next shipment is rescheduled.",
    );
    if (done) {
      setRescheduleTarget(null);
      setRescheduleDate("");
    }
  };

  const subscriptions = state.phase === "ok" ? state.subscriptions : [];

  const outcomeFor = (subscriptionId: string): ActionOutcome =>
    outcome.phase !== "idle" && outcome.subscriptionId === subscriptionId ? outcome : { phase: "idle" };

  const boundaryState: "loading" | "ok" | "error" | "unavailable" | "unauthorized" =
    state.phase === "loading"
      ? "loading"
      : state.phase === "unauthorized"
        ? "unauthorized"
        : state.phase === "error"
          ? "error"
          : "ok";

  return (
    <ResearchMemberShell
      title="Subscriptions"
      lead="Recurring product deliveries: their schedule, their next charge, and the controls to pause, skip, reschedule, or cancel."
    >
      {/* Distinct from membership, stated plainly and up front. */}
      <div className="card mb-6">
        <p className="mono-label text-ink-mute">Product subscriptions, not membership</p>
        <p className="body-s text-ink-2 mt-2 max-w-[58ch]">
          This page manages recurring product deliveries only. Your membership ($50 one-time activation, then $25
          monthly) is separate and is managed on the{" "}
          <Link href={MEMBER_ROUTES.membership} className="font-700">
            Membership page
          </Link>
          . Cancelling a product subscription never changes your membership.
        </p>
      </div>

      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
      >
        {state.phase === "denied" ? (
          <ResearchDenialNotice code={state.code} message={state.message} />
        ) : state.phase === "unavailable" ? (
          // The endpoint is not published yet. That is a pending state, not an
          // error, so it reads as designed rather than broken.
          <div className="grid gap-6">
            <ResearchEmptyState
              title="Product subscriptions have not opened yet."
              body="When ordering opens you will be able to put products on a schedule and manage everything here. Nothing is wrong with your account."
            />
            <ResearchCapabilityBoundary status={commerceStatus}>
              <p className="body-s text-ink-2" role="status">
                Ordering is enabled. Subscriptions you start will appear here.
              </p>
            </ResearchCapabilityBoundary>
          </div>
        ) : (
          <div className="grid gap-6">
            {/* The capability panel: when commerce is pending it explains why
                the controls below are locked; when enabled it confirms it. */}
            <ResearchCapabilityBoundary status={commerceStatus}>
              <p className="body-s text-ink-2" role="status">
                Ordering is enabled. Changes you make below take effect on your subscription record.
              </p>
            </ResearchCapabilityBoundary>

            {subscriptions.length === 0 ? (
              <ResearchEmptyState
                title="No product subscriptions yet."
                body="When you put a product on a recurring schedule it will appear here with its next charge and shipment dates."
              />
            ) : (
              subscriptions.map((subscription) => (
                <SubscriptionCard
                  key={subscription.subscriptionId}
                  subscription={subscription}
                  enabled={commerceEnabled}
                  outcome={outcomeFor(subscription.subscriptionId)}
                  onConfirm={(action) => setConfirm({ subscription, action })}
                  onReschedule={() => {
                    setRescheduleTarget(subscription);
                    setRescheduleDate("");
                  }}
                  onFrequency={(frequencyDays) =>
                    void run(
                      subscription.subscriptionId,
                      { action: "reschedule", frequencyDays },
                      "Delivery frequency updated.",
                    )
                  }
                  onQuantity={(quantity) =>
                    void run(subscription.subscriptionId, { action: "reschedule", quantity }, "Quantity updated.")
                  }
                />
              ))
            )}

            <ResearchSecureNotice>
              Every change goes through the server and is confirmed before anything is charged or shipped. If a
              control is locked, no change can happen; it is not waiting silently in a queue.
            </ResearchSecureNotice>
          </div>
        )}
      </ResearchRouteBoundary>

      <ResearchConfirmation
        open={confirm !== null}
        title={confirm ? CONFIRM_COPY[confirm.action].title : ""}
        body={
          confirm ? (
            <>
              <p className="font-700">{confirm.subscription.displayName}</p>
              <p className="mt-2">{CONFIRM_COPY[confirm.action].body}</p>
            </>
          ) : null
        }
        confirmLabel={confirm ? CONFIRM_COPY[confirm.action].label : "Confirm"}
        danger={confirm ? CONFIRM_COPY[confirm.action].danger : false}
        busy={
          confirm !== null && outcome.phase === "busy" && outcome.subscriptionId === confirm.subscription.subscriptionId
        }
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />

      <ResearchModal
        open={rescheduleTarget !== null}
        title={rescheduleTarget ? `Reschedule: ${rescheduleTarget.displayName}` : "Reschedule"}
        onClose={() => setRescheduleTarget(null)}
      >
        {rescheduleTarget && (
          <form onSubmit={(e) => void runReschedule(e)}>
            <p className="body-s text-ink-2 max-w-[48ch]">
              Choose a new date for the next shipment. Later shipments follow the subscription's frequency from
              this date.
            </p>
            <div className="mt-4">
              <label className="form-label" htmlFor="ra-reschedule-date">
                New next-shipment date
              </label>
              <input
                id="ra-reschedule-date"
                type="date"
                className="input-field"
                value={rescheduleDate}
                data-testid="ra-reschedule-date"
                onChange={(e) => setRescheduleDate(e.target.value)}
                required
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!rescheduleDate || outcome.phase === "busy"}
                aria-disabled={!rescheduleDate || outcome.phase === "busy"}
                data-testid="ra-reschedule-submit"
              >
                {outcome.phase === "busy" ? "Working..." : "Reschedule shipment"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRescheduleTarget(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </ResearchModal>
    </ResearchMemberShell>
  );
}
