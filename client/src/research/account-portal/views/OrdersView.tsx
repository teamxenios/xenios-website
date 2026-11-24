import { Link } from "wouter";
import type { CustomerOrdersDto } from "@shared/research/customer-account/contract";
import {
  ORDER_HISTORY_SOURCE_KEYS,
  ORDER_HISTORY_SOURCE_LABELS,
} from "@shared/research/customer-account/contract";
import { ResearchStatusBadge } from "../../ui/kit";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { accountOrderDetailPath } from "../routes";
import { AssistedRequests } from "../../member-orders/AssistedRequests";
import { readAssistedRequestHistory } from "../../member-orders/request-read";
import {
  authoritativeCarePharmacyCount,
  authoritativeOrderCount,
  carePharmacyHistoryAvailability,
  cleanAccountText,
  commerceRecordPresentation,
  formatAccountDate,
  formatOrderQuantity,
  fulfillmentStatusLabel,
  paymentStatusLabel,
  safeExternalUrl,
  sentenceCase,
  statusTone,
} from "../format";

export function AccountOrdersView({ data }: { data: CustomerOrdersDto }) {
  const requests = readAssistedRequestHistory(data.requests, data.history.sources.xrr);
  const authoritativeResearchCount = authoritativeOrderCount(data.history);
  const rowProjectionComplete = authoritativeResearchCount !== null
    && authoritativeResearchCount === data.research.length + (requests?.requests.length ?? 0)
    && (data.requests === undefined || requests !== null);
  const researchCountLabel = authoritativeResearchCount !== null
    ? `${authoritativeResearchCount} ${authoritativeResearchCount === 1 ? "record" : "records"}`
    : data.history.availability === "partial"
      ? "Partial history · total unavailable"
      : data.history.availability === "unavailable"
        ? "History unavailable"
        : "Total unavailable";
  const careHistory = data.carePharmacyHistory;
  const careHistoryAvailability = carePharmacyHistoryAvailability(careHistory);
  const authoritativeCareCount = authoritativeCarePharmacyCount(careHistory);
  const careProjectionComplete = authoritativeCareCount !== null
    && authoritativeCareCount === data.carePharmacy.length;
  const careCountLabel = authoritativeCareCount !== null
    ? `${authoritativeCareCount} ${authoritativeCareCount === 1 ? "record" : "records"}`
    : careHistoryAvailability === "partial"
      ? "Partial history · total unavailable"
      : careHistoryAvailability === "unavailable"
        ? "History unavailable"
        : "Total unavailable";
  const incompleteSources = ORDER_HISTORY_SOURCE_KEYS
    .filter((key) => !data.history.sources[key].connected || !data.history.sources[key].complete)
    .map((key) => ORDER_HISTORY_SOURCE_LABELS[key]);
  return (
    <div className="account-grid min-w-0 grid-cols-1">
      <section className="account-surface" aria-labelledby="research-orders-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="account-section-label">Research commerce history</p>
            <h2 id="research-orders-heading" className="account-section-title">Records and available status</h2>
            <p className="body-s text-ink-2 mt-3 max-w-[64ch]">Payment, fulfillment, tracking, and approved lot-document availability are shown only when the commerce record carries that evidence.</p>
          </div>
          <ResearchStatusBadge label={researchCountLabel} tone="neutral" />
        </div>
        {!rowProjectionComplete ? (
          // P1-B: an incomplete read never masquerades as the whole truth.
          <div className="account-surface account-surface-warm mt-5" role="note">
            <p className="body-s font-700">
              {authoritativeResearchCount !== null
                ? "We couldn’t confirm that this list matches your recorded Research total."
                : data.history.availability === "complete"
                  ? "We couldn’t load your Research history total."
                  : "Some Research history is currently unavailable."}
            </p>
            <p className="body-s text-ink-2 mt-2">{incompleteSources.length ? `History is incomplete for: ${incompleteSources.join(", ")}.` : "We couldn’t confirm that all your records are shown here."}</p>
            <p className="body-s text-ink-2 mt-2">Refresh this page to try loading your records again. If something is still missing, contact account support.</p>
            <p className="body-s mt-3"><Link href={ACCOUNT_PORTAL_ROUTES.support}>Get account support</Link></p>
          </div>
        ) : null}
        {data.research.length ? (
          <div className="account-card-list mt-6">
            {data.research.map((order) => {
              const trackingUrl = safeExternalUrl(order.trackingUrl);
              const itemLabel = cleanAccountText(order.itemLabel);
              const variantLabel = cleanAccountText(order.variantLabel);
              const recordPresentation = commerceRecordPresentation(order.recordKind);
              return (
                <article className="account-list-card" key={order.reference}>
                  <div className="min-w-0">
                    <p className="account-section-label">{recordPresentation.label}</p>
                    <p className="mono-label text-ink-mute tabular break-words">{order.reference}</p>
                    {/* P1-B: no fabricated line detail — an unavailable read says so. */}
                    {order.detailAvailability === "available" && itemLabel ? (
                      <>
                        <h3 className="body-l font-700 mt-2 break-words">{itemLabel}</h3>
                        <p className="body-s text-ink-2 mt-1 break-words">{variantLabel ?? "Variant unavailable"}</p>
                      </>
                    ) : (
                      <h3 className="body-l mt-2 break-words text-ink-mute">Record details unavailable</h3>
                    )}
                    <dl className="account-grid account-grid-3 mt-5">
                      <div><dt className="account-data-label">{recordPresentation.dateVerb}</dt><dd className="account-data-value mt-1">{formatAccountDate(order.placedAt)}</dd></div>
                      <div><dt className="account-data-label">Quantity</dt><dd className="account-data-value mt-1 tabular">{order.detailAvailability === "available" && itemLabel ? formatOrderQuantity(order.quantity) : "Not available"}</dd></div>
                      <div><dt className="account-data-label">Lot / COA</dt><dd className="account-data-value mt-1">{order.lotCoaAvailable ? "Approved document available" : "Approved document not shown"}</dd></div>
                    </dl>
                  </div>
                  <div className="account-list-card-actions">
                    <ResearchStatusBadge label={paymentStatusLabel(order.paymentState)} tone={statusTone(order.paymentState)} />
                    <ResearchStatusBadge label={fulfillmentStatusLabel(order.fulfillmentState)} tone={statusTone(order.fulfillmentState)} />
                    <Link href={accountOrderDetailPath(order.reference)}>Open record details</Link>
                    {trackingUrl ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer">Track shipment</a> : null}
                    {order.lotCoaAvailable ? <Link href={ACCOUNT_PORTAL_ROUTES.documents}>Open documents</Link> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : requests?.requests.length ? (
          <p className="body-s text-ink-2 mt-6">No order records were returned; assisted requests are listed separately below.</p>
        ) : (
          <div className="account-empty mt-6">
            {authoritativeResearchCount === 0
              ? "No Research commerce records are attached to this account."
              : authoritativeResearchCount !== null
                ? "Your history includes Research records, but we couldn’t display them here."
              : "No Research records could be shown here. This does not confirm that your history is empty."}
          </div>
        )}
      </section>

      <AssistedRequests history={requests} />

      <section className="account-surface account-surface-warm" aria-labelledby="care-fulfillment-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="account-section-label">Care / pharmacy</p>
            <h2 id="care-fulfillment-heading" className="account-section-title">Care and pharmacy status</h2>
            <p className="body-s text-ink-2 mt-3 max-w-[64ch]">Care intake, provider review, and pharmacy fulfillment remain separate from Research commerce records and membership.</p>
          </div>
          <ResearchStatusBadge label={careCountLabel} tone="neutral" />
        </div>
        {!careProjectionComplete ? (
          <div className="account-surface mt-5" role="note">
            <p className="body-s font-700">
              {authoritativeCareCount !== null
                ? "We couldn’t confirm that this list matches your recorded Care and pharmacy total."
                : careHistoryAvailability === "partial"
                  ? "Some Care and pharmacy history is currently unavailable."
                  : careHistoryAvailability === "unavailable"
                    ? "Care and pharmacy history is unavailable."
                    : "We couldn’t load your Care and pharmacy total."}
            </p>
            <p className="body-s text-ink-2 mt-2">
              {careHistoryAvailability === "partial"
                ? "Only the Care and pharmacy records we could load are shown. Your total is unavailable."
                : careHistoryAvailability === "unavailable"
                  ? "We couldn’t load your complete Care and pharmacy history. This does not mean you have no records."
                  : "Your recorded total and the records shown here may differ. We couldn’t confirm that the list is complete."}
            </p>
            <p className="body-s text-ink-2 mt-2">Refresh this page to try again. You can also review the separate Care status page or contact account support about a missing record.</p>
            <div className="body-s flex flex-wrap gap-4 mt-3">
              <Link href={ACCOUNT_PORTAL_ROUTES.care}>Review Care status</Link>
              <Link href={ACCOUNT_PORTAL_ROUTES.support}>Get account support</Link>
            </div>
          </div>
        ) : null}
        {data.carePharmacy.length ? (
          <div className="account-card-list mt-6">
            {data.carePharmacy.map((item, index) => {
              const trackingUrl = safeExternalUrl(item.trackingUrl);
              return (
                <article className="account-list-card" key={`${item.updatedAt}-${index}`}>
                  <div>
                    <p className="mono-label text-ink-mute">Updated {formatAccountDate(item.updatedAt, true)}</p>
                    <h3 className="body-m font-700 mt-2">Care fulfillment record</h3>
                    <dl className="mt-4">
                      <div className="account-data-row"><dt className="account-data-label">Intake</dt><dd className="account-data-value">{sentenceCase(item.intakeState)}</dd></div>
                      <div className="account-data-row"><dt className="account-data-label">Provider review</dt><dd className="account-data-value">{sentenceCase(item.providerReviewState)}</dd></div>
                      <div className="account-data-row"><dt className="account-data-label">Pharmacy</dt><dd className="account-data-value">{sentenceCase(item.pharmacyState)}</dd></div>
                    </dl>
                  </div>
                  <div className="account-list-card-actions">
                    <ResearchStatusBadge label={sentenceCase(item.pharmacyState)} tone={statusTone(item.pharmacyState)} />
                    {trackingUrl ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer">Track shipment</a> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="account-empty mt-6">
            {authoritativeCareCount === 0
              ? "No Care or pharmacy fulfillment records are attached to this account."
              : authoritativeCareCount !== null
                ? "Your history includes Care or pharmacy records, but we couldn’t display them here."
                : careHistoryAvailability === "partial"
                  ? "No Care or pharmacy records could be shown from this partial history. Your total is unavailable."
                  : "We couldn’t load your Care or pharmacy records. This does not mean you have no records. Care is managed separately from Research orders and requests."}
          </div>
        )}
      </section>
    </div>
  );
}
