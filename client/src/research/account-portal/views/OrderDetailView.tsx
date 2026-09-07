import { Link } from "wouter";
import type { CustomerOrdersDto } from "@shared/research/customer-account/contract";
import { ResearchStatusBadge } from "../../ui/kit";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import {
  cleanAccountText,
  commerceRecordPresentation,
  formatAccountDate,
  formatOrderQuantity,
  fulfillmentStatusLabel,
  paymentStatusLabel,
  statusTone,
} from "../format";
import { accountOrderGuidance, resolveAccountOrder } from "../order-journey";

export function AccountOrderDetailView({
  data,
  reference,
}: {
  data: CustomerOrdersDto;
  reference: string;
}) {
  // Exact equality against the already member-scoped list is the only lookup.
  // Prefixes such as XRR/XEA/XEC carry no authority and are never interpreted.
  const lookup = resolveAccountOrder(data, reference);

  if (lookup.kind !== "record") {
    return (
      <section className="account-surface" aria-labelledby="commerce-record-unavailable">
        <p className="account-section-label">Member-scoped commerce history</p>
        <h2 id="commerce-record-unavailable" className="account-section-title">
          Commerce record unavailable.
        </h2>
        <p className="body-s text-ink-2 mt-3 max-w-[64ch]" role="status">
          {lookup.kind === "ambiguous"
            ? "This exact reference is ambiguous in the returned account history. No record was selected. Ask account support to reconcile it."
            : lookup.kind === "unavailable"
              ? "The account history could not be read safely. No record was selected. Refresh this page or ask account support."
            : lookup.definitive
            ? "No commerce record with this exact reference is attached to this account."
            : "This reference is not currently visible in the available account history. Some commerce history is incomplete, so this is not a definitive not-found result."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="btn btn-secondary" href={ACCOUNT_PORTAL_ROUTES.orders}>Back to commerce history</Link>
          <Link className="btn btn-ghost" href={ACCOUNT_PORTAL_ROUTES.support}>Ask account support</Link>
        </div>
      </section>
    );
  }

  const record = lookup.record;
  const guidance = accountOrderGuidance(record);
  const trackingUrl = guidance.trackingUrl;
  const itemLabel = cleanAccountText(record.itemLabel);
  const variantLabel = cleanAccountText(record.variantLabel);
  const recordPresentation = commerceRecordPresentation(record.recordKind);

  return (
    <div className="account-grid">
      <section className="account-surface" aria-labelledby="commerce-record-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="account-section-label">Member-scoped {recordPresentation.label.toLowerCase()}</p>
            <h2 id="commerce-record-heading" className="account-section-title break-words">
              {record.reference}
            </h2>
            <p className="body-s text-ink-2 mt-3">
              {recordPresentation.dateVerb} {formatAccountDate(record.placedAt, true)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Commerce record status">
            <ResearchStatusBadge
              label={paymentStatusLabel(record.paymentState)}
              tone={statusTone(record.paymentState)}
            />
            <ResearchStatusBadge
              label={fulfillmentStatusLabel(record.fulfillmentState)}
              tone={statusTone(record.fulfillmentState)}
            />
          </div>
        </div>

        <dl className="mt-6">
          <div className="account-data-row">
            <dt className="account-data-label">Reference</dt>
            <dd className="account-data-value break-words">{record.reference}</dd>
          </div>
          <div className="account-data-row">
            <dt className="account-data-label">Item</dt>
            <dd className="account-data-value break-words">
              {record.detailAvailability === "available" && itemLabel
                ? itemLabel
                : "Commerce-record detail unavailable"}
            </dd>
          </div>
          <div className="account-data-row">
            <dt className="account-data-label">Variant</dt>
            <dd className="account-data-value break-words">
              {record.detailAvailability === "available" && itemLabel
                ? variantLabel ?? "Not available"
                : "Not available"}
            </dd>
          </div>
          <div className="account-data-row">
            <dt className="account-data-label">Quantity</dt>
            <dd className="account-data-value tabular">
              {record.detailAvailability === "available" && itemLabel
                ? formatOrderQuantity(record.quantity)
                : "Not available"}
            </dd>
          </div>
          <div className="account-data-row">
            <dt className="account-data-label">Approved lot / COA document</dt>
            <dd className="account-data-value">
              {record.lotCoaAvailable ? "Available in documents" : "Approved document not shown"}
            </dd>
          </div>
        </dl>

        <section className="account-surface account-surface-warm mt-6" aria-labelledby="commerce-next-step">
          <h3 id="commerce-next-step" className="body-l font-700">{guidance.fulfillment.title}</h3>
          <p className="body-s text-ink-2 mt-3">{guidance.fulfillment.detail}</p>
          <p className="body-s text-ink-2 mt-3">{guidance.payment}</p>
          {!trackingUrl && <p className="body-s text-ink-2 mt-3">A shipment tracking action is not available from this record.</p>}
          <p className="body-s text-ink-2 mt-3">Support can review the record. Opening support does not create a payment, shipment, refund, or Care request.</p>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          {trackingUrl ? (
            <a className="btn btn-secondary" href={trackingUrl} target="_blank" rel="noopener noreferrer">
              Track shipment
            </a>
          ) : null}
          {record.lotCoaAvailable ? (
            <Link className="btn btn-secondary" href={ACCOUNT_PORTAL_ROUTES.documents}>Open documents</Link>
          ) : null}
          <Link className="btn btn-ghost" href={ACCOUNT_PORTAL_ROUTES.support}>Ask account support</Link>
        </div>
      </section>

      <section className="account-surface account-surface-warm" aria-labelledby="commerce-record-boundary">
        <p className="account-section-label">Record boundary</p>
        <h2 id="commerce-record-boundary" className="account-section-title">What this page can confirm</h2>
        <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
          This page shows only the commerce record returned for this signed-in account. Payment and fulfillment remain separate facts; neither is inferred from the reference format.
        </p>
        <Link className="account-inline-link mt-4 inline-flex" href={ACCOUNT_PORTAL_ROUTES.orders}>
          Back to commerce history
        </Link>
      </section>
    </div>
  );
}
