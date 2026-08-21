import { Link } from "wouter";
import { listFulfillment } from "../../adapters/adminOps";
import { MitchPortal } from "../../operations/MitchPortal";
import { ADMIN_ROUTES } from "../../lib/routes";
import { useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import {
  FULFILLMENT_STATES,
  type FulfillmentAssignmentView,
} from "@shared/research/fulfillment/contracts";

// ---------------------------------------------------------------------------
// /admin/research/fulfillment: the shipment pipeline. Publishes with the
// commerce backend and the fulfillment integration (the mitch_fulfillment
// capability); renders the live pipeline the moment the API responds. The
// Capabilities page names the exact missing configuration.
// ---------------------------------------------------------------------------

type FulfillmentRow = {
  id: string;
  fulfillment_order_id?: string | null;
  order_reference: string;
  stage: string;
  version?: number | null;
  supplier_id?: string | null;
  supplier_label?: string | null;
  expected_ship_at?: string | null;
  recipient_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
  shipping_service?: string | null;
  handling_profile?: string | null;
  lines?: Array<{
    id: string;
    sku: string;
    quantity: number;
    lot_id: string;
    lot_code: string;
  }>;
  label_reference?: string | null;
  carrier: string | null;
  tracking_reference: string | null;
  updated_at: string | null;
};

function toAssignment(row: FulfillmentRow): FulfillmentAssignmentView | null {
  if (
    !row.supplier_id ||
    !row.fulfillment_order_id ||
    !row.supplier_label ||
    !row.recipient_name ||
    !row.address_line1 ||
    !row.address_city ||
    !row.address_state ||
    !row.address_postal_code ||
    row.address_country !== "US" ||
    !row.shipping_service ||
    !Number.isSafeInteger(row.version) ||
    Number(row.version) <= 0 ||
    // Driven by the canonical contract, never a local copy. The hardcoded
    // list this replaces had already gone stale: tracking_created, replacement
    // and refunded failed it, toAssignment returned null, and the caller
    // filtered those rows out — so an operator silently could not see orders
    // that existed.
    !(FULFILLMENT_STATES as readonly string[]).includes(row.stage) ||
    !["ambient", "cold_chain"].includes(row.handling_profile ?? "")
  ) {
    return null;
  }
  return {
    assignmentId: row.id,
    fulfillmentOrderId: row.fulfillment_order_id,
    orderReference: row.order_reference,
    supplierId: row.supplier_id,
    supplierLabel: row.supplier_label,
    state: row.stage as FulfillmentAssignmentView["state"],
    version: Number(row.version),
    expectedShipAt: row.expected_ship_at ?? null,
    recipient: {
      name: row.recipient_name,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2 ?? null,
      city: row.address_city,
      state: row.address_state,
      postalCode: row.address_postal_code,
      country: "US",
      phone: null,
    },
    shippingService: row.shipping_service,
    handlingProfile: row.handling_profile as "ambient" | "cold_chain",
    lines: (row.lines ?? []).map((line) => ({
      lineId: line.id,
      sku: line.sku,
      quantity: line.quantity,
      lotId: line.lot_id,
      lotCode: line.lot_code,
    })),
    labelReference: row.label_reference ?? null,
    carrier: row.carrier,
    trackingReference: row.tracking_reference,
    updatedAt: row.updated_at ?? "",
  };
}

export default function Fulfillment() {
  return (
    <AdminScreen
      title="Fulfillment"
      lead="Shipments by stage, from picking to delivered, once the fulfillment integration connects."
    >
      {(token) => <FulfillmentBody token={token} />}
    </AdminScreen>
  );
}

function FulfillmentBody({ token }: { token: string }) {
  const resource = useAdminResource<{ ok: boolean; shipments: FulfillmentRow[] }>(token, listFulfillment);
  const assignments = (resource.data?.shipments ?? [])
    .map(toAssignment)
    .filter((row): row is FulfillmentAssignmentView => row !== null);
  return (
    <div className="grid gap-6">
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="Fulfillment publishes with the commerce backend."
        unavailableBody="The shipment pipeline renders here when orders exist and the fulfillment integration is configured. The Capabilities page names exactly what is still missing."
      >
        <MitchPortal assignments={assignments} />
      </AdminBoundary>

      <div className="card">
        <p className="mono-label text-ink-mute">Integration status</p>
        <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
          Fulfillment and live shipping rates are provider-backed capabilities. Their exact configuration state, with
          the names of any missing environment variables (names only, never values), lives on the Capabilities page.
        </p>
        <Link href={ADMIN_ROUTES.capabilities} className="body-s underline text-ink-mute mt-3 inline-block">
          Open Capabilities
        </Link>
      </div>
    </div>
  );
}
