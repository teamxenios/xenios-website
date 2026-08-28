import { useCallback, useRef } from "react";
import { Link } from "wouter";
import { apiGet, apiPost, type ApiResult } from "../../lib/api";
import {
  MitchPortal,
  type FulfillmentCommandRequest,
} from "../../operations/MitchPortal";
import { ResearchEmptyState } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import {
  FULFILLMENT_STATES,
  type FulfillmentAssignmentView,
  type FulfillmentCommandResult,
  type FulfillmentState,
} from "@shared/research/fulfillment/contracts";

// The canonical fulfillment engine owns this path. A missing/unmounted engine
// normalizes to `unavailable`; this screen never falls back to the legacy
// `/api/admin/research/fulfillment` projection or invents an empty queue.
const ADMIN_ASSIGNMENTS_PATH = "/api/research/fulfillment/admin/assignments";

interface AdminFulfillmentQueueResponse {
  ok: true;
  assignments: unknown[];
}

interface AdminFulfillmentTransitionResponse {
  ok: true;
  result: FulfillmentCommandResult;
}

const loadFulfillmentAssignments = (token: string) =>
  apiGet<AdminFulfillmentQueueResponse>(ADMIN_ASSIGNMENTS_PATH, token);

let idempotencySequence = 0;

function createIdempotencyKey(): string {
  idempotencySequence += 1;
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${idempotencySequence}`;
  return `fulfillment:${random}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TRACKING_EVIDENCE_REQUIRED_STATES = new Set<FulfillmentState>([
  "tracking_created",
  "shipped",
  "delivered",
]);

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonBlankString(value: unknown): value is string | null {
  return value === null || isNonBlankString(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isNormalizedInstant(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

/** Runtime validation keeps malformed rows from becoming invisible work. */
export function isFulfillmentAssignmentView(
  value: unknown,
): value is FulfillmentAssignmentView {
  if (!isRecord(value) || !isRecord(value.recipient) || !Array.isArray(value.lines)) {
    return false;
  }
  const recipient = value.recipient;
  if (
    !isUuid(value.assignmentId) ||
    !isUuid(value.fulfillmentOrderId) ||
    !isNonBlankString(value.orderReference) ||
    !isUuid(value.supplierId) ||
    !isNonBlankString(value.supplierLabel) ||
    !(FULFILLMENT_STATES as readonly unknown[]).includes(value.state) ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) <= 0 ||
    (value.expectedShipAt !== null && !isNormalizedInstant(value.expectedShipAt)) ||
    !isNonBlankString(value.shippingService) ||
    !["ambient", "cold_chain"].includes(String(value.handlingProfile)) ||
    !isOptionalNonBlankString(value.labelReference) ||
    !isOptionalNonBlankString(value.carrier) ||
    !isOptionalNonBlankString(value.trackingReference) ||
    !isNormalizedInstant(value.updatedAt) ||
    !isNonBlankString(recipient.name) ||
    !isNonBlankString(recipient.addressLine1) ||
    !isOptionalNonBlankString(recipient.addressLine2) ||
    !isNonBlankString(recipient.city) ||
    typeof recipient.state !== "string" ||
    !/^[A-Z]{2}$/.test(recipient.state) ||
    !isNonBlankString(recipient.postalCode) ||
    recipient.country !== "US" ||
    !isOptionalNonBlankString(recipient.phone) ||
    value.lines.length === 0
  ) {
    return false;
  }

  const state = value.state as FulfillmentState;
  const labelPresent = value.labelReference !== null;
  const carrierPresent = value.carrier !== null;
  const trackingPresent = value.trackingReference !== null;
  if (carrierPresent !== trackingPresent) return false;
  if (state === "packed" && !labelPresent) return false;
  if (
    TRACKING_EVIDENCE_REQUIRED_STATES.has(state) &&
    (!labelPresent || !carrierPresent || !trackingPresent)
  ) {
    return false;
  }

  const lineIds = new Set<string>();
  for (const line of value.lines) {
    if (
      !isRecord(line) ||
      !isUuid(line.lineId) ||
      !isNonBlankString(line.sku) ||
      typeof line.quantity !== "number" ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      !isUuid(line.lotId) ||
      !isNonBlankString(line.lotCode) ||
      lineIds.has(line.lineId)
    ) {
      return false;
    }
    lineIds.add(line.lineId);
  }
  return true;
}

function commandFingerprint(
  assignment: FulfillmentAssignmentView,
  command: FulfillmentCommandRequest,
): string {
  return JSON.stringify([
    assignment.assignmentId,
    assignment.version,
    command.action,
    command.labelReference ?? "",
    command.carrier ?? "",
    command.service ?? "",
    command.trackingReference ?? "",
    command.reason ?? "",
  ]);
}

function commandError(result: Exclude<ApiResult<unknown>, { kind: "ok" }>): Error {
  switch (result.kind) {
    case "unavailable":
      return new Error(
        "Fulfillment commands are unavailable because the canonical engine is not mounted in this environment.",
      );
    case "unauthorized":
      return new Error("Your admin session ended before the fulfillment update was recorded.");
    case "forbidden":
      return new Error(result.message ?? "This account cannot perform that fulfillment action.");
    case "denied":
      return new Error(result.message ?? `The fulfillment engine refused this action (${result.code}).`);
    case "error":
      return new Error(result.message);
  }
}

export default function Fulfillment() {
  return (
    <AdminScreen
      title="Fulfillment"
      lead="The canonical assignment pipeline from supplier acknowledgment through tracking, shipment, and delivery."
    >
      {(token) => <FulfillmentBody token={token} />}
    </AdminScreen>
  );
}

export function FulfillmentBody({ token }: { token: string }) {
  const resource = useAdminResource<AdminFulfillmentQueueResponse>(
    token,
    loadFulfillmentAssignments,
  );
  const inFlightAssignments = useRef(new Set<string>());
  const idempotencyKeys = useRef(new Map<string, string>());

  const handleCommand = useCallback(
    async (
      assignment: FulfillmentAssignmentView,
      command: FulfillmentCommandRequest,
    ) => {
      if (inFlightAssignments.current.has(assignment.assignmentId)) {
        throw new Error("A fulfillment update for this assignment is already being recorded.");
      }

      const fingerprint = commandFingerprint(assignment, command);
      let idempotencyKey = idempotencyKeys.current.get(fingerprint);
      if (!idempotencyKey) {
        idempotencyKey = createIdempotencyKey();
        idempotencyKeys.current.set(fingerprint, idempotencyKey);
      }

      inFlightAssignments.current.add(assignment.assignmentId);
      try {
        const result = await apiPost<AdminFulfillmentTransitionResponse>(
          `${ADMIN_ASSIGNMENTS_PATH}/${encodeURIComponent(assignment.assignmentId)}/transition`,
          {
            action: command.action,
            expectedVersion: assignment.version,
            idempotencyKey,
            ...(command.labelReference !== undefined
              ? { labelReference: command.labelReference }
              : {}),
            ...(command.carrier !== undefined ? { carrier: command.carrier } : {}),
            ...(command.service !== undefined ? { service: command.service } : {}),
            ...(command.trackingReference !== undefined
              ? { trackingReference: command.trackingReference }
              : {}),
            ...(command.reason !== undefined ? { reason: command.reason } : {}),
          },
          token,
        );
        if (result.kind !== "ok") throw commandError(result);
        if (
          result.data.ok !== true ||
          !result.data.result ||
          result.data.result.assignmentId !== assignment.assignmentId ||
          !(FULFILLMENT_STATES as readonly string[]).includes(result.data.result.state) ||
          !Number.isSafeInteger(result.data.result.version) ||
          result.data.result.version <= assignment.version
        ) {
          throw new Error(
            "The fulfillment engine returned an invalid transition result; the queue was not updated.",
          );
        }
        resource.reload();
      } finally {
        inFlightAssignments.current.delete(assignment.assignmentId);
      }
    },
    [resource.reload, token],
  );

  const response = resource.data;
  const envelopeValid =
    response !== null && response.ok === true && Array.isArray(response.assignments);
  const rawAssignments = envelopeValid ? response.assignments : [];
  const assignments = rawAssignments.filter(isFulfillmentAssignmentView);
  const invalidCount = rawAssignments.length - assignments.length;

  return (
    <div className="grid gap-6">
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The canonical fulfillment engine is not available."
        unavailableBody="No queue or zero count is inferred. This surface publishes only after the engine route, internal actor resolver, paid-order evidence, and reviewed persistence are wired."
      >
        {!envelopeValid || invalidCount > 0 ? (
          <ResearchEmptyState
            title="Fulfillment queue data is unavailable."
            body={
              invalidCount > 0
                ? `The engine returned ${invalidCount} invalid assignment${invalidCount === 1 ? "" : "s"}. No partial queue is shown.`
                : "The engine response did not match the canonical assignment envelope. No empty queue is inferred."
            }
          />
        ) : (
          <MitchPortal assignments={assignments} authority="internal" onCommand={handleCommand} />
        )}
      </AdminBoundary>

      <div className="card">
        <p className="mono-label text-ink-mute">Integration status</p>
        <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
          This screen reads and commands only the canonical fulfillment engine. Missing route composition, paid-order
          evidence, reviewed persistence, or provider configuration remains unavailable and cannot look like an empty
          or completed queue. The fulfillment tracking-state migration must also be reviewed, registered, and applied
          through the Lead-owned release process before these transitions can be enabled.
        </p>
        <Link href={ADMIN_ROUTES.capabilities} className="body-s underline text-ink-mute mt-3 inline-block">
          Open Capabilities
        </Link>
      </div>
    </div>
  );
}
