import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  isRecord,
  loadCarePatientSurface,
  optionalString,
  readStorage,
  storageMissingExplanation,
  type CarePatientSurfaceState,
  type CareSurfaceStorage,
} from "./patient-surface";
import {
  CareSurfaceStateCard,
  careSurfaceHeadline,
  type CareSurfaceSubject,
} from "./CarePatientSurfaceStates";

/**
 * Patient supplies.
 *
 * Read only, and deliberately pessimistic about progress. A shipment is
 * described by the status on its record and by nothing else:
 *
 * - a shipped or delivered date is shown only when the status itself says so,
 *   so a stray timestamp can never read as "it is on its way"
 * - a tracking number is never shown and never invented; the page reports only
 *   whether one exists on the record
 * - a status this page does not recognize is reported as unrecognized rather
 *   than being guessed into the nearest familiar step
 *
 * Nothing here is an order form. There is no write path on this surface.
 */

export const CARE_SUPPLIES_PATH = "/care/supplies";

const STATUS_LABELS = {
  requested: "Requested",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
} as const;

const STATUS_EXPLANATIONS = {
  requested:
    "This has been requested. It has not been packed, and nothing has left anywhere.",
  packed: "This has been packed. It has not shipped and it is not in transit.",
  shipped: "This is recorded as shipped. It is not recorded as delivered.",
  delivered: "This is recorded as delivered.",
  cancelled: "This was cancelled. Nothing is coming from it.",
} as const;

type KnownStatus = keyof typeof STATUS_LABELS;

const SUBJECT: CareSurfaceSubject = {
  possessive: "Your supplies",
  plural: "supplies",
};

interface ShipmentRow {
  id: string;
  status: KnownStatus | null;
  rawStatusKnown: boolean;
  itemCount: number | null;
  carrierName: string | null;
  trackingAvailable: boolean;
  shippedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string | null;
}

interface SuppliesData {
  storage: CareSurfaceStorage;
  rows: readonly ShipmentRow[];
  unreadable: number;
}

function knownStatus(value: unknown): KnownStatus | null {
  return typeof value === "string" && value in STATUS_LABELS
    ? (value as KnownStatus)
    : null;
}

function toRow(value: unknown): ShipmentRow | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value.id);
  if (!id) return null;
  const status = knownStatus(value.status);
  return {
    id,
    status,
    rawStatusKnown: status !== null,
    itemCount:
      typeof value.itemCount === "number" && Number.isFinite(value.itemCount)
        ? value.itemCount
        : null,
    carrierName: optionalString(value.carrierName),
    trackingAvailable: value.trackingAvailable === true,
    // A date is read only when the status itself carries that meaning. This is
    // the same rule the server applies, restated here so a projection mistake
    // on either side cannot advertise movement that did not happen.
    shippedAt:
      status === "shipped" || status === "delivered"
        ? optionalString(value.shippedAt)
        : null,
    deliveredAt: status === "delivered" ? optionalString(value.deliveredAt) : null,
    updatedAt: optionalString(value.updatedAt),
  };
}

function parse(body: Record<string, unknown>): SuppliesData | null {
  if (!Array.isArray(body.shipments)) return null;
  const parsed = body.shipments.map(toRow);
  return {
    storage: readStorage(body),
    rows: parsed.filter((row): row is ShipmentRow => row !== null),
    unreadable: parsed.filter((row) => row === null).length,
  };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 rule-top">
      <dt className="mono-label text-ink-mute">{label}</dt>
      <dd className="body-m break-words">{value}</dd>
    </div>
  );
}

export default function CareSuppliesPage() {
  const [state, setState] = useState<CarePatientSurfaceState<SuppliesData>>({
    kind: "loading",
  });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setState(await loadCarePatientSurface(CARE_ROUTE_CONTRACTS.supplies, parse));
  }, []);

  useEffect(() => void load(), [load]);

  const headline = careSurfaceHeadline(state, SUBJECT);
  const data = state.kind === "ready" ? state.data : null;

  return (
    <PageShell>
      <SeoHead
        title="Care supplies, xenios"
        description="The recorded state of Care supply shipments, in the separate Xenios Care pathway."
        path={CARE_SUPPLIES_PATH}
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · SUPPLIES</p>
        <h1 className="display-m max-w-[20ch]">
          A shipment is only ever as far along as its record says.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          This private area reports the recorded state of supplies sent to you.
          It never reports something as shipped or delivered ahead of the
          record, never shows a tracking number, and never estimates a date.
          There is no ordering control here.
        </p>

        <section
          className="mt-10 max-w-[920px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-supplies-status"
          data-care-read-only="true"
        >
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="care-supplies-status" className="h2">
            {headline ??
              (!data?.storage.available
                ? "Your supplies cannot be read yet."
                : data.rows.length === 0
                  ? "No supply shipment is recorded for you."
                  : "Supply shipments recorded for you")}
          </h2>

          <CareSurfaceStateCard
            state={state}
            subject={SUBJECT}
            onRetry={() => void load()}
          />

          {data && !data.storage.available && (
            <div className="card mt-6">
              <p className="mono-label text-pulse mb-2">RECORD NOT AVAILABLE</p>
              <p className="body-m text-ink-2 max-w-[64ch]">
                {storageMissingExplanation(data.storage, SUBJECT.possessive)}
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}

          {data && data.storage.available && data.rows.length === 0 && (
            <div className="card mt-6">
              <p className="body-m text-ink-2 max-w-[64ch]">
                Nothing has been sent to you and nothing is being prepared. A
                shipment appears here only after one is recorded, and this page
                never invents one.
              </p>
            </div>
          )}

          {data && data.rows.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 mt-6" role="list">
              {data.rows.map((row) => (
                <li className="card" key={row.id}>
                  <p className="mono-label text-ink-mute">
                    {row.status ? STATUS_LABELS[row.status].toUpperCase() : "STATUS NOT RECOGNIZED"}
                  </p>
                  <p className="body-l mt-3 max-w-[60ch]">
                    {row.status
                      ? STATUS_EXPLANATIONS[row.status]
                      : "This shipment came back with a state this page does not recognize, so nothing is claimed about where it is."}
                  </p>
                  <dl className="mt-4">
                    <DetailRow
                      label="ITEMS RECORDED"
                      value={
                        row.itemCount === null
                          ? "Not recorded"
                          : String(row.itemCount)
                      }
                    />
                    <DetailRow
                      label="CARRIER"
                      value={row.carrierName ?? "Not recorded"}
                    />
                    <DetailRow
                      label="TRACKING"
                      value={
                        row.trackingAvailable
                          ? "A tracking number is on this record. It is not shown here."
                          : "No tracking number is recorded."
                      }
                    />
                    <DetailRow
                      label="SHIPPED"
                      value={row.shippedAt ?? "Not recorded"}
                    />
                    <DetailRow
                      label="DELIVERED"
                      value={row.deliveredAt ?? "Not recorded"}
                    />
                    <DetailRow
                      label="RECORD LAST CHANGED"
                      value={row.updatedAt ?? "Not recorded"}
                    />
                  </dl>
                </li>
              ))}
            </ul>
          )}

          {data && data.unreadable > 0 && (
            <div className="card mt-6" role="alert">
              <p className="mono-label text-pulse mb-2">NOT DISPLAYED</p>
              <p className="body-m text-ink-2 max-w-[64ch]">
                {`${data.unreadable} record${data.unreadable === 1 ? "" : "s"} came back in a shape this page could not read completely, so ${data.unreadable === 1 ? "it is" : "they are"} not shown rather than shown partly. This is reported instead of hidden.`}
              </p>
            </div>
          )}
        </section>

        <section
          className="mt-16 pt-12 rule-top max-w-[760px]"
          aria-labelledby="care-supplies-boundary"
        >
          <p className="mono-cap text-ink-mute mb-5">BOUNDARY</p>
          <h2 id="care-supplies-boundary" className="display-s">
            No delivery is promised here.
          </h2>
          <p className="body-m text-ink-2 mt-6 max-w-[64ch]">
            A recorded shipment is not a delivery commitment and no arrival date
            is estimated on this page. If you may be experiencing a medical
            emergency, contact local emergency services now.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
