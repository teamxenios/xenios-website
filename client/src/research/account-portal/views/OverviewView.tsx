import { Link } from "wouter";
import type {
  CustomerAccountOverviewDto,
} from "@shared/research/customer-account/contract";
import {
  ORDER_HISTORY_SOURCE_KEYS,
  ORDER_HISTORY_SOURCE_LABELS,
} from "@shared/research/customer-account/contract";
import { billingPresentation } from "@shared/research/customer-account/billing-presentation";
import type { CatalogPriorityDto } from "@shared/research/product-activation/contract";
import { ResearchStatusBadge } from "../../ui/kit";
import { CurrentDemandCollection } from "../../catalog-priority/CurrentDemandCollection";
import {
  projectActivationQueue,
  projectDemandDefinitions,
} from "../../catalog-priority/priority-config";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { accountOrderDetailPath } from "../routes";
import {
  authoritativeOrderCount,
  cleanAccountText,
  commerceRecordPresentation,
  fulfillmentStatusLabel,
  formatAccountDate,
  formatMembershipRenewal,
  formatOrderQuantity,
  safeBillingManagementUrl,
  safeExternalUrl,
  sentenceCase,
  statusTone,
} from "../format";
import { AccountInterestsView } from "./InterestsView";

export function AccountOverviewView({
  data,
  catalogPriority,
}: {
  data: CustomerAccountOverviewDto;
  /** Null/absent when the audited projection is unavailable — the section hides. */
  catalogPriority?: CatalogPriorityDto | null;
}) {
  const {
    identity,
    membership,
    careEnrollment,
    researchOrders,
    orderHistory,
    accountStanding,
    productInterests,
    documents,
    supportCases,
    nextAdministrativeAction,
  } = data;
  const noBillingRelationship = membership.billing === "none";
  const manageUrl = membership.billing !== "none"
    ? safeBillingManagementUrl(membership.manageUrl)
    : null;
  const billing = billingPresentation(membership.billing);
  const recentOrders = researchOrders.slice(0, 2);
  const authoritativeResearchCount = authoritativeOrderCount(orderHistory);
  const historyProjectionComplete = authoritativeResearchCount !== null
    && authoritativeResearchCount === researchOrders.length;
  const incompleteSources = ORDER_HISTORY_SOURCE_KEYS
    .filter((key) => !orderHistory.sources[key].connected || !orderHistory.sources[key].complete)
    .map((key) => ORDER_HISTORY_SOURCE_LABELS[key]);
  // "Up to date" is a claim, never a default: it renders only when the server
  // proved it (accountStanding "current"). Indeterminate stays neutral.
  const standingProvedCurrent = accountStanding === "current" && historyProjectionComplete;
  const standingHeadline = accountStanding === "attention"
    ? nextAdministrativeAction ?? "An administrative item needs your attention."
    : standingProvedCurrent
      ? "Your account is up to date."
      : "No administrative action is recorded, but some account information is currently unavailable.";
  const careStageLabel = careEnrollment.sourceState === "unavailable"
    ? "Care status is managed through the provider/Tebra workflow."
    : !careEnrollment.enrolled
      ? "Not enrolled"
      : careEnrollment.status.stage
        ? sentenceCase(careEnrollment.status.stage)
        : "No stage recorded";

  return (
    <div className="account-grid">
      <section className="account-surface account-surface-warm" aria-labelledby="next-account-action">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="account-section-label">Next administrative action</p>
            <h2 id="next-account-action" className="account-section-title">
              {standingHeadline}
            </h2>
            <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
              This is an account step only. It is not a medical recommendation or a promise of product approval.
            </p>
          </div>
          {accountStanding === "attention" ? (
            <Link className="btn btn-primary" href={ACCOUNT_PORTAL_ROUTES.support}>Review with support</Link>
          ) : standingProvedCurrent ? (
            <ResearchStatusBadge label="Current" tone="success" />
          ) : (
            <ResearchStatusBadge label="Status unavailable" tone="neutral" />
          )}
        </div>
      </section>

      <section className="account-grid account-grid-3" aria-label="Account summary">
        <div className="account-stat">
          <p className="account-section-label">Membership</p>
          <p className="account-stat-value mt-2">
            {membership.planLabel ?? (membership.state === "none" ? "No plan" : "Plan unavailable")}
          </p>
          <div className="mt-3"><ResearchStatusBadge label={sentenceCase(membership.state)} tone={statusTone(membership.state)} /></div>
        </div>
        <div className="account-stat">
          <p className="account-section-label">Research history</p>
          {authoritativeResearchCount !== null ? (
            <p className="account-stat-value mt-2 tabular">{authoritativeResearchCount}</p>
          ) : (
            <>
              {/* Only Lane 01's complete-history authoritative count is numeric. */}
              <p className="account-stat-value mt-2 tabular">—</p>
              <p className="body-s text-ink-mute mt-1">
                count unavailable — commerce history incomplete
              </p>
            </>
          )}
          <Link className="account-inline-link mt-3 inline-flex" href={ACCOUNT_PORTAL_ROUTES.orders}>View commerce history</Link>
        </div>
        <div className="account-stat">
          <p className="account-section-label">Care operations</p>
          <p className="account-stat-value mt-2">{careStageLabel}</p>
          <Link className="account-inline-link mt-3 inline-flex" href={ACCOUNT_PORTAL_ROUTES.care}>View separate Care timeline</Link>
        </div>
      </section>

      <div className="account-grid account-grid-main">
        <section className="account-surface" aria-labelledby="account-identity-heading">
          <p className="account-section-label">Account identity</p>
          <h2 id="account-identity-heading" className="account-section-title">{identity.displayName}</h2>
          <div className="mt-5">
            <div className="account-data-row"><span className="account-data-label">Email</span><span className="account-data-value">{identity.email}</span></div>
            <div className="account-data-row"><span className="account-data-label">Account</span><span className="account-data-value"><ResearchStatusBadge label={sentenceCase(identity.accountStatus)} tone={statusTone(identity.accountStatus)} /></span></div>
            <div className="account-data-row"><span className="account-data-label">Member since</span><span className="account-data-value">{formatAccountDate(identity.memberSince)}</span></div>
          </div>
        </section>

        <section className="account-surface account-surface-dark" aria-labelledby="membership-heading">
          <p className="account-section-label" style={{ color: "#c8c4bb" }}>Xenios membership</p>
          <h2 id="membership-heading" className="account-section-title">
            {membership.planLabel ?? (membership.state === "none" ? "No active membership" : "Membership plan unavailable")}
          </h2>
          {/* Billing truth renders ONLY through the canonical presentation (P1-C). */}
          <div className="mt-4"><ResearchStatusBadge label={`Billing: ${billing.label}`} tone={billing.tone} /></div>
          <p className="body-s mt-3" style={{ color: "#d9d6ce" }}>
            Renewal: {formatMembershipRenewal(membership)}
          </p>
          <p className="body-s mt-3" style={{ color: "#d9d6ce" }}>
            Membership covers administrative and platform services. It does not guarantee treatment, a provider decision, or fulfillment.
          </p>
          {manageUrl ? (
            <a className="btn btn-on-dark btn-primary mt-5" href={manageUrl} target="_blank" rel="noopener noreferrer">Open billing management</a>
          ) : (
            <Link className="btn btn-on-dark btn-ghost mt-5" href={ACCOUNT_PORTAL_ROUTES.subscription}>View billing details</Link>
          )}
        </section>
      </div>

      <div className="account-grid account-grid-2">
        <section className="account-surface" aria-labelledby="recent-orders-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="account-section-label">Research commerce history</p><h2 id="recent-orders-heading" className="account-section-title">Recent activity</h2></div>
            <Link className="account-inline-link" href={ACCOUNT_PORTAL_ROUTES.orders}>All records</Link>
          </div>
          {!historyProjectionComplete ? (
            <div className="account-surface account-surface-warm mt-5" role="note">
              <p className="body-s font-700">
                {authoritativeResearchCount !== null
                  ? "The visible commerce-record list does not match the authoritative source count."
                  : orderHistory.availability === "complete"
                    ? "Authoritative commerce-record count unavailable."
                    : "Some commerce history is currently unavailable."}
              </p>
              <p className="body-s text-ink-2 mt-2">{incompleteSources.length ? `These sources do not provide a complete history: ${incompleteSources.join(", ")}.` : "This view cannot prove that the visible list is complete."}</p>
            </div>
          ) : null}
          {recentOrders.length ? (
            <div className="account-card-list mt-5">
              {recentOrders.map((order) => {
                const trackingUrl = safeExternalUrl(order.trackingUrl);
                const itemLabel = cleanAccountText(order.itemLabel);
                const variantLabel = cleanAccountText(order.variantLabel);
                const quantity = formatOrderQuantity(order.quantity);
                const recordPresentation = commerceRecordPresentation(order.recordKind);
                return (
                  <article className="account-list-card" key={order.reference}>
                    <div className="min-w-0">
                      <p className="mono-label text-ink-mute break-words">
                        {recordPresentation.label} · {order.reference} · {recordPresentation.dateVerb} {formatAccountDate(order.placedAt)}
                      </p>
                      {order.detailAvailability === "available" && itemLabel ? (
                        <h3 className="body-m font-700 mt-2 break-words">{itemLabel}</h3>
                      ) : (
                        <h3 className="body-m mt-2 break-words text-ink-mute">Commerce-record details unavailable</h3>
                      )}
                      {order.detailAvailability === "available" && itemLabel ? (
                        <p className="body-s text-ink-2 mt-1">
                          {variantLabel ?? "Variant unavailable"}
                          {quantity !== "Not available"
                            ? ` · Qty ${quantity}`
                            : null}
                        </p>
                      ) : null}
                    </div>
                    <div className="account-list-card-actions">
                      <ResearchStatusBadge label={fulfillmentStatusLabel(order.fulfillmentState)} tone={statusTone(order.fulfillmentState)} />
                      <Link href={accountOrderDetailPath(order.reference)}>Open record details</Link>
                      {trackingUrl ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer">Track shipment</a> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="account-empty mt-5">
              {authoritativeResearchCount === 0
                ? "No Research commerce records are attached to this account yet."
                : authoritativeResearchCount !== null
                  ? "The authoritative source reports commerce records, but no recent record rows are visible in this account view."
                : "Commerce history is currently unavailable or incomplete — recent records may not be shown."}
            </div>
          )}
        </section>

        <section className="account-surface" aria-labelledby="care-summary-heading">
          <p className="account-section-label">Care enrollment</p>
          <h2 id="care-summary-heading" className="account-section-title">Operational status</h2>
          <div className="mt-5">
            {/* An unavailable Care source carries no enrollment claim (P1-D). */}
            <div className="account-data-row"><span className="account-data-label">Enrollment</span><span className="account-data-value">{careEnrollment.sourceState === "unavailable" ? "Care status is managed through the provider/Tebra workflow." : careEnrollment.enrolled ? "Enrolled" : "Not enrolled"}</span></div>
            <div className="account-data-row"><span className="account-data-label">Provider stage</span><span className="account-data-value">{careEnrollment.sourceState === "unavailable" ? "—" : careEnrollment.status.stage ? sentenceCase(careEnrollment.status.stage) : "No stage recorded"}</span></div>
            <div className="account-data-row"><span className="account-data-label">Pharmacy</span><span className="account-data-value">{careEnrollment.sourceState === "unavailable" ? "—" : sentenceCase(careEnrollment.pharmacyState)}</span></div>
          </div>
          <Link className="btn btn-secondary mt-5" href={ACCOUNT_PORTAL_ROUTES.care}>Open Care status</Link>
        </section>
      </div>

      {productInterests.length ? (
        <AccountInterestsView interests={productInterests} />
      ) : (
        <section className="account-surface" aria-labelledby="interests-empty-heading">
          <p className="account-section-label">Saved interests</p>
          <h2 id="interests-empty-heading" className="account-section-title">No interests are visible in this account view.</h2>
          <p className="body-s text-ink-2 mt-3">Interest-history completeness is not reported here. Availability requests can be reviewed with account support.</p>
        </section>
      )}

      {catalogPriority ? (
        <>
          <CurrentDemandCollection
            items={projectDemandDefinitions(catalogPriority.statuses)}
            title="Current availability priorities"
            headingId="availability-priorities-title"
            lead="Statuses come from the audited activation record. Nothing here is orderable unless the catalog itself offers it."
            showFilters={false}
          />
          {catalogPriority.queue.length ? (
            <CurrentDemandCollection
              items={projectActivationQueue(catalogPriority.queue)}
              title="Exact variants pending activation"
              headingId="pending-activation-queue-title"
              lead="These exact formulations are recorded for verification and are not orderable."
              showFilters={false}
            />
          ) : null}
        </>
      ) : null}

      <section className="account-grid account-grid-3" aria-label="Account resources">
        <Link className="account-surface" href={ACCOUNT_PORTAL_ROUTES.documents}>
          <p className="account-section-label">Documents</p>
          <p className="account-section-title tabular">{documents.length ? `${documents.length} visible` : "Status unavailable"}</p>
          <p className="body-s text-ink-2 mt-3">Receipts, approved COAs, and account documents.</p>
        </Link>
        <Link className="account-surface" href={ACCOUNT_PORTAL_ROUTES.support}>
          <p className="account-section-label">Support</p>
          <p className="account-section-title tabular">{supportCases.some((item) => item.state !== "resolved") ? `${supportCases.filter((item) => item.state !== "resolved").length} visible open` : "Status unavailable"}</p>
          <p className="body-s text-ink-2 mt-3">Order, account, Care, and pharmacy support.</p>
        </Link>
        <Link className="account-surface" href={ACCOUNT_PORTAL_ROUTES.subscription}>
          <p className="account-section-label">Billing</p>
          <p className="account-section-title">{noBillingRelationship ? "No billing relationship" : membership.manualBilling ? "Manual / offline" : "Online management"}</p>
          <p className="body-s text-ink-2 mt-3">Membership billing remains separate from product fulfillment.</p>
        </Link>
      </section>
    </div>
  );
}
