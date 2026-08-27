import { Link } from "wouter";
import type { CustomerOrdersDto } from "@shared/research/customer-account/contract";
import { ResearchStatusBadge } from "../../ui/kit";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { formatAccountDate, safeExternalUrl, sentenceCase, statusTone } from "../format";

export function AccountOrdersView({ data }: { data: CustomerOrdersDto }) {
  return (
    <div className="account-grid">
      <section className="account-surface" aria-labelledby="research-orders-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="account-section-label">Research orders</p>
            <h2 id="research-orders-heading" className="account-section-title">Orders and shipment status</h2>
            <p className="body-s text-ink-2 mt-3 max-w-[64ch]">Payment, fulfillment, tracking, and approved lot-document availability are shown from the order record.</p>
          </div>
          <ResearchStatusBadge label={`${data.research.length} orders`} tone="neutral" />
        </div>
        {!data.history.complete ? (
          // P1-4: an incomplete read never masquerades as the whole truth.
          <div className="account-surface account-surface-warm mt-5" role="note">
            <p className="body-s font-700">Some historical order information is not yet available.</p>
            <p className="body-s text-ink-2 mt-2">Order records from these sources are not connected to this view yet: {data.history.unavailableSources.join(", ")}.</p>
          </div>
        ) : null}
        {data.research.length ? (
          <div className="account-card-list mt-6">
            {data.research.map((order) => {
              const trackingUrl = safeExternalUrl(order.trackingUrl);
              return (
                <article className="account-list-card" key={order.reference}>
                  <div className="min-w-0">
                    <p className="mono-label text-ink-mute tabular">{order.reference}</p>
                    <h3 className="body-l font-700 mt-2 break-words">{order.itemLabel}</h3>
                    <p className="body-s text-ink-2 mt-1 break-words">{order.variantLabel ?? "Variant recorded with order"}</p>
                    <dl className="account-grid account-grid-3 mt-5">
                      <div><dt className="account-data-label">Order date</dt><dd className="account-data-value mt-1">{formatAccountDate(order.placedAt)}</dd></div>
                      <div><dt className="account-data-label">Quantity</dt><dd className="account-data-value mt-1 tabular">{order.quantity}</dd></div>
                      <div><dt className="account-data-label">Lot / COA</dt><dd className="account-data-value mt-1">{order.lotCoaAvailable ? "Approved document available" : "Not available"}</dd></div>
                    </dl>
                  </div>
                  <div className="account-list-card-actions">
                    <ResearchStatusBadge label={sentenceCase(order.paymentState)} tone={statusTone(order.paymentState)} />
                    <ResearchStatusBadge label={sentenceCase(order.fulfillmentState)} tone={statusTone(order.fulfillmentState)} />
                    {trackingUrl ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer">Track shipment</a> : null}
                    {order.lotCoaAvailable ? <Link href={ACCOUNT_PORTAL_ROUTES.documents}>Open documents</Link> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="account-empty mt-6">
            {data.history.complete
              ? "No Research orders are attached to this account."
              : "No Research orders are visible here yet — see the note above about sources that are not connected."}
          </div>
        )}
      </section>

      <section className="account-surface account-surface-warm" aria-labelledby="care-fulfillment-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="account-section-label">Care / pharmacy</p>
            <h2 id="care-fulfillment-heading" className="account-section-title">Separate operational fulfillment</h2>
            <p className="body-s text-ink-2 mt-3 max-w-[64ch]">Care intake, provider review, and pharmacy fulfillment remain separate from Research orders and membership.</p>
          </div>
          <ResearchStatusBadge label={`${data.carePharmacy.length} records`} tone="neutral" />
        </div>
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
        ) : <div className="account-empty mt-6">No Care or pharmacy fulfillment records are attached to this account.</div>}
      </section>
    </div>
  );
}
