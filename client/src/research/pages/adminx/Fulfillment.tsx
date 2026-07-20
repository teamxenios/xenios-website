import { Link } from "wouter";
import { listFulfillment } from "../../adapters/adminOps";
import { ResearchDataTable, ResearchStatusBadge } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/fulfillment: the shipment pipeline. Publishes with the
// commerce backend and the fulfillment integration (the mitch_fulfillment
// capability); renders the live pipeline the moment the API responds. The
// Capabilities page names the exact missing configuration.
// ---------------------------------------------------------------------------

type FulfillmentRow = {
  id: string;
  order_reference: string;
  member_email: string;
  stage: string;
  carrier: string | null;
  tracking_reference: string | null;
  updated_at: string | null;
};

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
  return (
    <div className="grid gap-6">
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        onRetry={resource.reload}
        unavailableTitle="Fulfillment publishes with the commerce backend."
        unavailableBody="The shipment pipeline renders here when orders exist and the fulfillment integration is configured. The Capabilities page names exactly what is still missing."
      >
        <ResearchDataTable<FulfillmentRow>
          caption="Shipments"
          columns={[
            {
              key: "order",
              header: "Order",
              render: (s) => (
                <Link href={`${ADMIN_ROUTES.orders}/${s.id}`} className="font-700 underline">
                  {s.order_reference}
                </Link>
              ),
            },
            { key: "member", header: "Member", render: (s) => <span style={{ overflowWrap: "anywhere" }}>{s.member_email}</span> },
            {
              key: "stage",
              header: "Stage",
              render: (s) => (
                <ResearchStatusBadge
                  label={s.stage}
                  tone={s.stage === "delivered" ? "success" : s.stage === "exception" ? "danger" : "info"}
                />
              ),
            },
            { key: "carrier", header: "Carrier", render: (s) => s.carrier ?? "" },
            { key: "tracking", header: "Tracking", render: (s) => s.tracking_reference ?? "" },
            { key: "updated", header: "Updated", render: (s) => fmtDate(s.updated_at) },
          ]}
          rows={resource.data?.shipments ?? []}
          rowKey={(s) => s.id}
          empty="No shipments in the pipeline."
        />
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
