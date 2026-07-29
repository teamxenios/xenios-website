import type {
  FulfillmentAction,
  FulfillmentAssignmentView,
} from "@shared/research/fulfillment/contracts";
import {
  ResearchEmptyState,
  ResearchStatusBadge,
} from "../ui/kit";

function toneForState(
  state: FulfillmentAssignmentView["state"],
): "neutral" | "info" | "success" | "warning" | "danger" {
  if (state === "delivered") return "success";
  if (["exception", "damaged", "lost", "recalled"].includes(state)) return "danger";
  if (["assigned", "acknowledged", "picking", "packed", "shipped"].includes(state)) {
    return "info";
  }
  if (state === "returned") return "warning";
  return "neutral";
}

export interface MitchPortalProps {
  assignments: FulfillmentAssignmentView[];
  onCommand?: (
    assignment: FulfillmentAssignmentView,
    action: FulfillmentAction,
  ) => void;
}

/**
 * The same minimum-necessary queue is used for the internal operations view and
 * the restricted supplier view. No member identifier, email, health data,
 * payment facts, affiliate facts, or previous-order history is accepted here.
 */
export function MitchPortal({ assignments, onCommand }: MitchPortalProps) {
  if (assignments.length === 0) {
    return (
      <ResearchEmptyState
        title="No assigned fulfillment work."
        body="Only orders explicitly assigned to this supplier appear here."
      />
    );
  }

  return (
    <section aria-labelledby="mitch-queue-heading" className="grid gap-4">
      <div>
        <p className="mono-label text-ink-mute">Restricted fulfillment</p>
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
          <li key={assignment.assignmentId} className="card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div style={{ minWidth: 0 }}>
                <p className="mono-label text-ink-mute">
                  Order {assignment.orderReference}
                </p>
                <p className="body-m font-700 mt-1">{assignment.supplierLabel}</p>
              </div>
              <ResearchStatusBadge
                label={assignment.state.replaceAll("_", " ")}
                tone={toneForState(assignment.state)}
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
              <div
                className="mt-5 flex flex-wrap gap-2"
                role="toolbar"
                aria-label={`Actions for order ${assignment.orderReference}`}
              >
                {assignment.state === "assigned" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onCommand(assignment, "acknowledge")}
                  >
                    Acknowledge
                  </button>
                ) : null}
                {assignment.state === "acknowledged" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onCommand(assignment, "start_picking")}
                  >
                    Start picking
                  </button>
                ) : null}
                {assignment.state === "picking" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onCommand(assignment, "pack")}
                  >
                    Record packing
                  </button>
                ) : null}
                {assignment.state === "packed" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onCommand(assignment, "ship")}
                  >
                    Record shipment
                  </button>
                ) : null}
                {!["returned", "damaged", "lost", "recalled", "cancelled"].includes(
                  assignment.state,
                ) ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onCommand(assignment, "record_exception")}
                  >
                    Report exception
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
