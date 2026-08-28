import { useRef, useState, type FormEvent } from "react";
import {
  FULFILLMENT_ACTIONS,
  FULFILLMENT_STATES,
  SUPPLIER_PERMITTED_ACTIONS,
  type FulfillmentAction,
  type FulfillmentAssignmentView,
  type FulfillmentState,
} from "@shared/research/fulfillment/contracts";
import {
  ResearchEmptyState,
  ResearchStatusBadge,
} from "../ui/kit";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const STATE_TONES = Object.fromEntries(
  FULFILLMENT_STATES.map((state) => {
    if (state === "delivered") return [state, "success"];
    if (["exception", "damaged", "lost", "recalled"].includes(state)) {
      return [state, "danger"];
    }
    if (
      [
        "assigned",
        "acknowledged",
        "picking",
        "packed",
        "tracking_created",
        "shipped",
      ].includes(state)
    ) {
      return [state, "info"];
    }
    if (["returned", "replacement", "refunded"].includes(state)) {
      return [state, "warning"];
    }
    return [state, "neutral"];
  }),
) as Record<FulfillmentState, BadgeTone>;

/** Mirrors the canonical engine transition graph for UI authorization only. */
const LEGAL_ACTIONS_BY_STATE: Readonly<Record<FulfillmentState, readonly FulfillmentAction[]>> = {
  assigned: ["acknowledge", "record_exception", "cancel", "record_recall"],
  acknowledged: ["start_picking", "record_exception", "cancel", "record_recall"],
  picking: ["pack", "record_exception", "record_damage", "record_loss", "record_recall"],
  packed: ["record_tracking", "record_exception", "record_damage", "record_loss", "record_recall"],
  tracking_created: ["ship", "record_exception", "cancel", "record_damage", "record_loss", "record_recall"],
  shipped: ["deliver", "record_exception", "record_return", "record_damage", "record_loss", "record_recall"],
  delivered: ["record_return", "record_damage", "record_loss", "record_recall"],
  exception: [
    "start_picking",
    "pack",
    "record_tracking",
    "cancel",
    "record_return",
    "record_replacement",
    "record_refund",
    "record_damage",
    "record_loss",
    "record_recall",
  ],
  returned: ["record_replacement", "record_refund"],
  damaged: ["record_replacement", "record_refund"],
  lost: ["record_replacement", "record_refund"],
  recalled: ["record_replacement", "record_refund"],
  cancelled: ["record_refund"],
  replacement: [],
  refunded: [],
};

const PRIMARY_ACTION_BY_STATE: Partial<Record<FulfillmentState, FulfillmentAction>> = {
  assigned: "acknowledge",
  acknowledged: "start_picking",
  picking: "pack",
  packed: "record_tracking",
  tracking_created: "ship",
  shipped: "deliver",
  exception: "start_picking",
};

const REASON_REQUIRED_ACTIONS = new Set<FulfillmentAction>([
  "record_exception",
  "record_return",
  "record_replacement",
  "record_refund",
  "record_damage",
  "record_loss",
  "record_recall",
  "cancel",
]);

const SUPPLIER_ACTION_SET = new Set<FulfillmentAction>(SUPPLIER_PERMITTED_ACTIONS);

const ACTION_LABELS: Record<FulfillmentAction, string> = {
  acknowledge: "Acknowledge",
  start_picking: "Start picking",
  pack: "Record packing",
  record_tracking: "Record tracking",
  ship: "Record shipment",
  deliver: "Record delivery",
  record_exception: "Report exception",
  record_return: "Record return",
  record_replacement: "Record replacement disposition",
  record_refund: "Record refund disposition",
  record_damage: "Record damage",
  record_loss: "Record loss",
  record_recall: "Record recall",
  cancel: "Cancel",
};

export interface FulfillmentCommandRequest {
  action: FulfillmentAction;
  labelReference?: string;
  carrier?: string;
  service?: string;
  trackingReference?: string;
  reason?: string;
}

export interface MitchPortalProps {
  assignments: FulfillmentAssignmentView[];
  /** Supplier-safe by default; internal authority must be opted into explicitly. */
  authority?: "supplier" | "internal";
  onCommand?: (
    assignment: FulfillmentAssignmentView,
    command: FulfillmentCommandRequest,
  ) => void | Promise<void>;
}

function clean(value: string): string {
  return value.trim();
}

function AssignmentActions({
  assignment,
  authority,
  onCommand,
}: {
  assignment: FulfillmentAssignmentView;
  authority: NonNullable<MitchPortalProps["authority"]>;
  onCommand: NonNullable<MitchPortalProps["onCommand"]>;
}) {
  const [labelReference, setLabelReference] = useState(assignment.labelReference ?? "");
  const [carrier, setCarrier] = useState(assignment.carrier ?? "");
  const [service, setService] = useState(assignment.shippingService);
  const [trackingReference, setTrackingReference] = useState(
    assignment.trackingReference ?? "",
  );
  const [reason, setReason] = useState("");
  const [busyAction, setBusyAction] = useState<FulfillmentAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const allowedActions = LEGAL_ACTIONS_BY_STATE[assignment.state].filter(
    (action) => authority === "internal" || SUPPLIER_ACTION_SET.has(action),
  );
  const allowedActionSet = new Set<FulfillmentAction>(allowedActions);

  const run = async (command: FulfillmentCommandRequest) => {
    if (
      busyRef.current ||
      !(FULFILLMENT_ACTIONS as readonly string[]).includes(command.action) ||
      !allowedActionSet.has(command.action)
    ) {
      return;
    }
    busyRef.current = true;
    setBusyAction(command.action);
    setError(null);
    try {
      await onCommand(assignment, command);
    } catch (commandError) {
      setError(
        commandError instanceof Error
          ? commandError.message
          : "The fulfillment update could not be recorded.",
      );
    } finally {
      busyRef.current = false;
      setBusyAction(null);
    }
  };

  const submitPack = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedLabel = clean(labelReference);
    if (normalizedLabel.length < 3) {
      setError("A label reference of at least three characters is required before packing.");
      return;
    }
    void run({ action: "pack", labelReference: normalizedLabel });
  };

  const submitTracking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const evidence = {
      labelReference: clean(labelReference),
      carrier: clean(carrier),
      service: clean(service),
      trackingReference: clean(trackingReference),
    };
    if (Object.values(evidence).some((value) => value.length === 0)) {
      setError("Label, carrier, service, and tracking evidence are all required.");
      return;
    }
    void run({ action: "record_tracking", ...evidence });
  };

  const submitReasonAction = (action: FulfillmentAction) => {
    const normalizedReason = clean(reason);
    if (normalizedReason.length < 3 || normalizedReason.length > 500) {
      setError("Enter a disposition reason between 3 and 500 characters.");
      return;
    }
    void run({ action, reason: normalizedReason });
  };

  const primaryCandidate = PRIMARY_ACTION_BY_STATE[assignment.state];
  const primaryAction =
    primaryCandidate && allowedActionSet.has(primaryCandidate)
      ? primaryCandidate
      : undefined;
  const reasonActions = allowedActions.filter((action) => REASON_REQUIRED_ACTIONS.has(action));
  const missingTrackingEvidence =
    assignment.state === "tracking_created" &&
    (!assignment.labelReference ||
      !assignment.carrier ||
      !assignment.shippingService ||
      !assignment.trackingReference);

  if (!primaryAction && reasonActions.length === 0) return null;

  return (
    <div className="mt-5 grid gap-4">
      {error ? (
        <p role="alert" className="body-s text-danger" data-testid="fulfillment-command-error">
          {error}
        </p>
      ) : null}

      {primaryAction === "pack" ? (
        <form onSubmit={submitPack} className="grid gap-3" aria-label={`Pack order ${assignment.orderReference}`}>
          <label className="body-s">
            Label reference
            <input
              className="input-field mt-1"
              value={labelReference}
              onChange={(event) => setLabelReference(event.target.value)}
              required
              minLength={3}
              disabled={busyRef.current}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busyRef.current}>
            {busyAction === "pack" ? "Recording..." : ACTION_LABELS.pack}
          </button>
        </form>
      ) : null}

      {primaryAction === "record_tracking" ? (
        <form
          onSubmit={submitTracking}
          className="grid gap-3"
          aria-label={`Record tracking for order ${assignment.orderReference}`}
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="body-s">
              Label reference
              <input
                className="input-field mt-1"
                value={labelReference}
                onChange={(event) => setLabelReference(event.target.value)}
                required
                disabled={busyRef.current}
              />
            </label>
            <label className="body-s">
              Carrier
              <input
                className="input-field mt-1"
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                required
                disabled={busyRef.current}
              />
            </label>
            <label className="body-s">
              Service
              <input
                className="input-field mt-1"
                value={service}
                onChange={(event) => setService(event.target.value)}
                required
                disabled={busyRef.current}
              />
            </label>
            <label className="body-s">
              Tracking reference
              <input
                className="input-field mt-1"
                value={trackingReference}
                onChange={(event) => setTrackingReference(event.target.value)}
                required
                disabled={busyRef.current}
              />
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busyRef.current}>
            {busyAction === "record_tracking" ? "Recording..." : ACTION_LABELS.record_tracking}
          </button>
        </form>
      ) : null}

      {primaryAction && !["pack", "record_tracking"].includes(primaryAction) ? (
        missingTrackingEvidence ? (
          <p role="alert" className="body-s text-danger">
            Tracking evidence is incomplete. Shipment cannot be recorded until the queue returns label, carrier,
            service, and tracking references.
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busyRef.current}
            onClick={() => void run({ action: primaryAction })}
          >
            {busyAction === primaryAction ? "Recording..." : ACTION_LABELS[primaryAction]}
          </button>
        )
      ) : null}

      {reasonActions.length > 0 ? (
        <form
          onSubmit={(event) => event.preventDefault()}
          className="grid gap-3"
          aria-label={`Record a disposition for order ${assignment.orderReference}`}
        >
          <label className="body-s">
            {authority === "internal" ? "Disposition reason" : "Exception reason"}
            <input
              className="input-field mt-1"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={3}
              maxLength={500}
              disabled={busyRef.current}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {reasonActions.map((action) => (
              <button
                key={action}
                type="button"
                className="btn btn-secondary"
                disabled={busyRef.current}
                onClick={() => submitReasonAction(action)}
              >
                {busyAction === action ? "Recording..." : ACTION_LABELS[action]}
              </button>
            ))}
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * The same minimum-necessary queue is used for the internal operations view and
 * the restricted supplier view. No member identifier, email, health data,
 * payment facts, affiliate facts, or previous-order history is accepted here.
 */
export function MitchPortal({ assignments, authority = "supplier", onCommand }: MitchPortalProps) {
  if (assignments.length === 0) {
    return (
      <ResearchEmptyState
        title="No assigned fulfillment work."
        body="The connected fulfillment engine returned an authoritative empty assignment queue."
      />
    );
  }

  return (
    <section aria-labelledby="mitch-queue-heading" className="grid gap-4">
      <div>
        <p className="mono-label text-ink-mute">
          {authority === "internal" ? "Internal fulfillment" : "Restricted fulfillment"}
        </p>
        <h2 id="mitch-queue-heading" className="display-s mt-1">
          Assigned orders
        </h2>
        <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
          Work one assignment at a time. Product, quantity, exact lot, packing,
          label, and shipment evidence stay attached to the same order.
        </p>
      </div>

      <ol className="grid gap-4" aria-label="Assigned fulfillment orders">
        {assignments.map((assignment) => (
          <li key={`${assignment.assignmentId}:${assignment.version}`} className="card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div style={{ minWidth: 0 }}>
                <p className="mono-label text-ink-mute">
                  Order {assignment.orderReference}
                </p>
                <p className="body-m font-700 mt-1">{assignment.supplierLabel}</p>
              </div>
              <ResearchStatusBadge
                label={assignment.state.replaceAll("_", " ")}
                tone={STATE_TONES[assignment.state]}
              />
            </div>

            <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              <div>
                <dt className="mono-label text-ink-mute">Ship to</dt>
                <dd className="body-s mt-1">
                  {assignment.recipient.name}
                  <br />
                  {assignment.recipient.addressLine1}
                  {assignment.recipient.addressLine2 ? (
                    <>
                      <br />
                      {assignment.recipient.addressLine2}
                    </>
                  ) : null}
                  <br />
                  {assignment.recipient.city}, {assignment.recipient.state}{" "}
                  {assignment.recipient.postalCode}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-ink-mute">Service</dt>
                <dd className="body-s mt-1">{assignment.shippingService}</dd>
              </div>
              <div>
                <dt className="mono-label text-ink-mute">Expected ship</dt>
                <dd className="body-s mt-1">
                  {assignment.expectedShipAt ?? "EXPECTED SHIP DATE REQUIRED"}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-ink-mute">Tracking</dt>
                <dd className="body-s mt-1">
                  {assignment.trackingReference ?? "TRACKING INTEGRATION REQUIRED"}
                </dd>
              </div>
            </dl>

            <div className="mt-5">
              <p className="mono-label text-ink-mute">Exact-lot lines</p>
              {assignment.lines.length === 0 ? (
                <p className="body-s mt-2">EXACT LOT ASSIGNMENT REQUIRED</p>
              ) : (
                <ul className="mt-2 divide-y" aria-label={`Lines for ${assignment.orderReference}`}>
                  {assignment.lines.map((line) => (
                    <li
                      key={line.lineId}
                      className="py-3 grid sm:grid-cols-3 gap-2 body-s"
                    >
                      <span>{line.sku}</span>
                      <span>Quantity {line.quantity}</span>
                      <span>Lot {line.lotCode}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {onCommand ? (
              <AssignmentActions assignment={assignment} authority={authority} onCommand={onCommand} />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
