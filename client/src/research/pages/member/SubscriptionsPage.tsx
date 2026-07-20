import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { fetchSubscriptions, subscriptionAction } from "../../adapters/commerce";
import { devFixture } from "../../lib/fixtures";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  capabilityStatusOrPending,
  ResearchCapabilityBoundary,
  ResearchConfirmation,
  ResearchEmptyState,
  ResearchModal,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../../ui/kit";
import { formatDate, formatMoney } from "./Orders";

// ---------------------------------------------------------------------------
// Member Product Subscriptions (/research/member/subscriptions). This is the
// PRODUCT subscription manager, deliberately distinct from membership (the
// $50 one-time activation and $25 monthly membership live on the Membership
// page). Every subscription fact comes from GET
// /api/research/member/subscriptions. Every control is rendered so the
// member can see what managing a subscription looks like, but every control
// is DISABLED with honest copy while product_commerce is not enabled; when
// enabled, every action posts to the server and tolerates an endpoint that
// is not published yet (it reports "not available yet", it never pretends).
// ---------------------------------------------------------------------------

const SUB_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  skip_scheduled: { label: "Skip scheduled", tone: "info" },
  rescheduled: { label: "Rescheduled", tone: "info" },
  payment_issue: { label: "Payment issue", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function subStatusMeta(status?: string | null): { label: string; tone: BadgeTone } {
  const key = (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (SUB_STATUS_META[key]) return SUB_STATUS_META[key];
  if (!key) return { label: "Status pending", tone: "pending" };
  const label = key.replace(/_/g, " ");
  return { label: label.charAt(0).toUpperCase() + label.slice(1), tone: "neutral" };
}

interface MemberSubscription {
  id: string;
  productName?: string | null;
  status?: string | null;
  statusDetail?: string | null;
  frequency?: string | null;
  frequencyDisplay?: string | null;
  quantity?: number | null;
  priceCents?: number | null;
  priceDisplay?: string | null;
  nextChargeAt?: string | null;
  nextShipmentAt?: string | null;
}

type SubscriptionsPayload = { subscriptions?: MemberSubscription[] } | MemberSubscription[];

function normalizeSubscriptions(payload: SubscriptionsPayload): MemberSubscription[] {
  const list = Array.isArray(payload) ? payload : payload?.subscriptions ?? [];
  return list.filter((s) => s && s.id);
}

// Dev-only synthetic subscriptions exercising the state vocabulary.
// devFixture returns null in production, so a live member never sees these.
function fixtureSubscriptions(): MemberSubscription[] {
  return [
    {
      id: "fix-sub-1",
      productName: "Recovery Stack, 30 day supply",
      status: "active",
      frequency: "monthly",
      quantity: 1,
      priceCents: 8900,
      nextChargeAt: "2026-08-05",
      nextShipmentAt: "2026-08-07",
    },
    {
      id: "fix-sub-2",
      productName: "Baseline Panel Kit",
      status: "skip_scheduled",
      statusDetail: "The August shipment is skipped. The next shipment resumes in September.",
      frequency: "every_2_months",
      quantity: 1,
      priceCents: 9600,
      nextChargeAt: "2026-09-02",
      nextShipmentAt: "2026-09-04",
    },
    {
      id: "fix-sub-3",
      productName: "Hydration Formula",
      status: "payment_issue",
      statusDetail: "The last charge did not go through. Update your payment method to keep this subscription active.",
      frequency: "every_2_weeks",
      quantity: 2,
      priceCents: 2400,
      nextChargeAt: null,
      nextShipmentAt: null,
    },
  ];
}

const FREQUENCY_OPTIONS = [
  { value: "every_2_weeks", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "every_6_weeks", label: "Every 6 weeks" },
  { value: "every_2_months", label: "Every 2 months" },
];

function frequencyLabel(sub: MemberSubscription): string | null {
  if (sub.frequencyDisplay) return sub.frequencyDisplay;
  const match = FREQUENCY_OPTIONS.find((o) => o.value === sub.frequency);
  if (match) return match.label;
  return sub.frequency ? sub.frequency.replace(/_/g, " ") : null;
}

type BoundaryState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

const COMMERCE_CAPABILITY: ResearchCapability = "product_commerce";

const DISABLED_CONTROLS_COPY =
  "Subscription controls unlock when ordering opens. Nothing about your account is wrong; you can see how managing a subscription will work, and no change can be made yet.";

type Notice = { kind: "success" | "info" | "error"; text: string } | null;

type ConfirmAction = { sub: MemberSubscription; action: "pause" | "resume" | "skip" | "cancel" } | null;

// One subscription card: facts on the left, controls beneath. Controls are
// always rendered; `enabled` gates whether they can do anything.
function SubscriptionCard({
  sub,
  enabled,
  busy,
  onConfirm,
  onReschedule,
  onFrequency,
  onQuantity,
}: {
  sub: MemberSubscription;
  enabled: boolean;
  busy: boolean;
  onConfirm: (action: "pause" | "resume" | "skip" | "cancel") => void;
  onReschedule: () => void;
  onFrequency: (frequency: string) => void;
  onQuantity: (quantity: number) => void;
}) {
  const meta = subStatusMeta(sub.status);
  const statusKey = (sub.status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const cancelled = statusKey === "cancelled";
  const paused = statusKey === "paused";
  const controlsLocked = !enabled || busy || cancelled;
  const [frequencyDraft, setFrequencyDraft] = useState(
    FREQUENCY_OPTIONS.some((o) => o.value === sub.frequency) ? (sub.frequency as string) : "",
  );
  const [quantityDraft, setQuantityDraft] = useState(
    typeof sub.quantity === "number" && sub.quantity > 0 ? String(sub.quantity) : "1",
  );

  const price = formatMoney(sub.priceCents, sub.priceDisplay);
  const facts: Array<{ label: string; value: string }> = [
    { label: "Frequency", value: frequencyLabel(sub) ?? "Pending" },
    { label: "Quantity", value: typeof sub.quantity === "number" ? String(sub.quantity) : "Pending" },
    { label: "Next charge", value: formatDate(sub.nextChargeAt) ?? "Pending" },
    { label: "Next shipment", value: formatDate(sub.nextShipmentAt) ?? "Pending" },
  ];
  if (price) facts.push({ label: "Price per delivery", value: price });

  const submitFrequency = (e: FormEvent) => {
    e.preventDefault();
    if (controlsLocked || !frequencyDraft) return;
    onFrequency(frequencyDraft);
  };
  const submitQuantity = (e: FormEvent) => {
    e.preventDefault();
    if (controlsLocked) return;
    const q = Number(quantityDraft);
    if (!Number.isInteger(q) || q < 1 || q > 20) return;
    onQuantity(q);
  };

  return (
    <section className="card" aria-label={`Subscription: ${sub.productName ?? sub.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="body-m font-700">{sub.productName ?? "Product subscription"}</p>
          {sub.statusDetail && <p className="body-s text-ink-2 mt-1 max-w-[56ch]">{sub.statusDetail}</p>}
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
                <label className="form-label" htmlFor={`freq-${sub.id}`}>
                  Frequency
                </label>
                <select
                  id={`freq-${sub.id}`}
                  className="input-field"
                  value={frequencyDraft}
                  disabled={controlsLocked}
                  aria-disabled={controlsLocked}
                  onChange={(e) => setFrequencyDraft(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a frequency
                  </option>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={controlsLocked || !frequencyDraft}
                aria-disabled={controlsLocked || !frequencyDraft}
              >
                Update frequency
              </button>
            </form>

            <form onSubmit={submitQuantity} className="flex items-end gap-2">
              <div>
                <label className="form-label" htmlFor={`qty-${sub.id}`}>
                  Quantity
                </label>
                <input
                  id={`qty-${sub.id}`}
                  className="input-field"
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={quantityDraft}
                  disabled={controlsLocked}
                  aria-disabled={controlsLocked}
                  onChange={(e) => setQuantityDraft(e.target.value)}
                  style={{ width: 96 }}
                />
              </div>
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={controlsLocked}
                aria-disabled={controlsLocked}
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
              onClick={() => onConfirm("skip")}
            >
              Skip next shipment
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={controlsLocked}
              aria-disabled={controlsLocked}
              onClick={onReschedule}
            >
              Reschedule
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={controlsLocked}
              aria-disabled={controlsLocked}
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
    </section>
  );
}

export default function SubscriptionsPage() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<BoundaryState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [subscriptions, setSubscriptions] = useState<MemberSubscription[]>([]);
  const [source, setSource] = useState<"server" | "fixture">("server");
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [rescheduleSub, setRescheduleSub] = useState<MemberSubscription | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    const result = await fetchSubscriptions<SubscriptionsPayload>(memberToken);
    if (result.kind === "ok") {
      setSubscriptions(normalizeSubscriptions(result.data));
      setSource("server");
      setState("ok");
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      const fixture = devFixture(fixtureSubscriptions);
      if (fixture) {
        setSubscriptions(fixture);
        setSource("fixture");
        setState("ok");
      } else {
        setState("unavailable");
      }
      return;
    }
    setErrorMessage(result.message);
    setState("error");
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Capability statuses are fetched once per page; absent registry degrades
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

  // One unavailable-tolerant action path for every subscription change. An
  // unpublished endpoint reports itself honestly instead of pretending.
  const act = useCallback(
    async (subId: string, action: string, body: unknown, successText: string) => {
      setBusyId(subId);
      setNotice(null);
      const result = await subscriptionAction<unknown>(subId, action, body, memberToken);
      setBusyId(null);
      if (result.kind === "ok") {
        setNotice({ kind: "success", text: successText });
        await load();
        return true;
      }
      if (result.kind === "unauthorized") {
        setState("unauthorized");
        return false;
      }
      if (result.kind === "unavailable") {
        setNotice({
          kind: "info",
          text: "This change is not available yet. The subscription service has not opened; nothing was changed.",
        });
        return false;
      }
      if (result.kind === "forbidden") {
        setNotice({ kind: "error", text: result.message ?? "That change was not allowed. Nothing was changed." });
        return false;
      }
      setNotice({ kind: "error", text: result.message ?? "Something went wrong. Nothing was changed." });
      return false;
    },
    [memberToken, load],
  );

  const runConfirm = async () => {
    if (!confirm) return;
    const { sub, action } = confirm;
    const success: Record<typeof action, string> = {
      pause: "Subscription paused. Resume it any time.",
      resume: "Subscription resumed.",
      skip: "The next shipment is skipped. Your schedule continues after it.",
      cancel: "Subscription cancelled. You can start a new one any time.",
    };
    await act(sub.id, action, {}, success[action]);
    setConfirm(null);
  };

  const runReschedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!rescheduleSub || !rescheduleDate) return;
    const done = await act(
      rescheduleSub.id,
      "reschedule",
      { nextShipmentAt: rescheduleDate },
      "The next shipment is rescheduled.",
    );
    if (done) {
      setRescheduleSub(null);
      setRescheduleDate("");
    }
  };

  const confirmCopy: Record<string, { title: string; body: string; label: string; danger: boolean }> = {
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

      <div aria-live="polite">
        {notice && (
          <p
            className={`body-s mb-4 ${notice.kind === "error" ? "font-700" : "text-ink-2"}`}
            role={notice.kind === "error" ? "alert" : "status"}
            data-testid="ra-subscriptions-notice"
          >
            {notice.text}
          </p>
        )}
      </div>

      <ResearchRouteBoundary
        state={state === "unavailable" ? "ok" : state}
        errorMessage={errorMessage}
        onRetry={() => void load()}
      >
        {state === "unavailable" ? (
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
            {source === "fixture" && (
              <p className="mono-label text-ink-mute" role="note">
                Development preview data. Production shows only subscriptions recorded by the server.
              </p>
            )}

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
              subscriptions.map((sub) => (
                <SubscriptionCard
                  key={sub.id}
                  sub={sub}
                  enabled={commerceEnabled}
                  busy={busyId === sub.id}
                  onConfirm={(action) => setConfirm({ sub, action })}
                  onReschedule={() => {
                    setRescheduleSub(sub);
                    setRescheduleDate("");
                  }}
                  onFrequency={(frequency) =>
                    void act(sub.id, "frequency", { frequency }, "Delivery frequency updated.")
                  }
                  onQuantity={(quantity) => void act(sub.id, "quantity", { quantity }, "Quantity updated.")}
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
        title={confirm ? confirmCopy[confirm.action].title : ""}
        body={
          confirm ? (
            <>
              <p className="font-700">{confirm.sub.productName ?? "Product subscription"}</p>
              <p className="mt-2">{confirmCopy[confirm.action].body}</p>
            </>
          ) : null
        }
        confirmLabel={confirm ? confirmCopy[confirm.action].label : "Confirm"}
        danger={confirm ? confirmCopy[confirm.action].danger : false}
        busy={confirm ? busyId === confirm.sub.id : false}
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />

      <ResearchModal
        open={rescheduleSub !== null}
        title={rescheduleSub ? `Reschedule: ${rescheduleSub.productName ?? "subscription"}` : "Reschedule"}
        onClose={() => setRescheduleSub(null)}
      >
        {rescheduleSub && (
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
                onChange={(e) => setRescheduleDate(e.target.value)}
                required
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!rescheduleDate || busyId === rescheduleSub.id}
                aria-disabled={!rescheduleDate || busyId === rescheduleSub.id}
              >
                {busyId === rescheduleSub.id ? "Working..." : "Reschedule shipment"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRescheduleSub(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </ResearchModal>
    </ResearchMemberShell>
  );
}
