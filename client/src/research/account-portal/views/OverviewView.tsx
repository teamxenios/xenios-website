import { Link } from "wouter";
import type {
  CustomerAccountOverviewDto,
  ProductInterestDto,
} from "@shared/research/customer-account/contract";
import type { ProductActivationStatus } from "@shared/research/product-activation/contract";
import { ResearchStatusBadge } from "../../ui/kit";
import { CurrentDemandCollection } from "../../catalog-priority/CurrentDemandCollection";
import type { PriorityCatalogItem } from "../../catalog-priority/priority-config";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { formatAccountDate, safeExternalUrl, sentenceCase, statusTone } from "../format";

function interestStatus(availability: ProductInterestDto["availability"]): ProductActivationStatus {
  return availability === "pending_activation" ? "pending_pharmacy_activation" : availability;
}

function interestAction(interest: ProductInterestDto): string | null {
  if (interest.availability === "provider_required") return ACCOUNT_PORTAL_ROUTES.care;
  if (interest.availability === "request_only" || interest.availability === "pending_activation") {
    return ACCOUNT_PORTAL_ROUTES.support;
  }
  if (interest.availability === "live") return "/research/member/catalog";
  return null;
}

function savedInterestItems(interests: readonly ProductInterestDto[]): readonly PriorityCatalogItem[] {
  return interests.map((interest) => ({
    key: interest.interestKey,
    title: interest.displayLabel,
    formulation: null,
    lanes: interest.availability === "provider_required"
      ? ["Provider / Care"]
      : interest.availability === "pending_activation" || interest.availability === "request_only"
        ? ["Request-only / Pending activation"]
        : ["Research"],
    activationStatus: interestStatus(interest.availability),
    detailsPath: interest.availability === "live" ? "/research/member/catalog" : null,
    actionPath: interestAction(interest),
  }));
}

export function AccountOverviewView({ data }: { data: CustomerAccountOverviewDto }) {
  const {
    identity,
    membership,
    careEnrollment,
    researchOrders,
    productInterests,
    documents,
    supportCases,
    nextAdministrativeAction,
  } = data;
  const activeOrders = researchOrders.filter(
    (order) => !["delivered", "cancelled"].includes(order.fulfillmentState),
  );
  const manageUrl = safeExternalUrl(membership.manageUrl);
  const recentOrders = researchOrders.slice(0, 2);

  return (
    <div className="account-grid">
      <section className="account-surface account-surface-warm" aria-labelledby="next-account-action">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="account-section-label">Next administrative action</p>
            <h2 id="next-account-action" className="account-section-title">
              {nextAdministrativeAction ?? "Your account is up to date."}
            </h2>
            <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
              This is an account step only. It is not a medical recommendation or a promise of product approval.
            </p>
          </div>
          {nextAdministrativeAction ? (
            <Link className="btn btn-primary" href={ACCOUNT_PORTAL_ROUTES.support}>Review with support</Link>
          ) : (
            <ResearchStatusBadge label="Current" tone="success" />
          )}
        </div>
      </section>

      <section className="account-grid account-grid-3" aria-label="Account summary">
        <div className="account-stat">
          <p className="account-section-label">Membership</p>
          <p className="account-stat-value mt-2">{membership.planLabel ?? "No plan"}</p>
          <div className="mt-3"><ResearchStatusBadge label={sentenceCase(membership.state)} tone={statusTone(membership.state)} /></div>
        </div>
        <div className="account-stat">
          <p className="account-section-label">Open orders</p>
          <p className="account-stat-value mt-2 tabular">{activeOrders.length}</p>
          <Link className="account-inline-link mt-3 inline-flex" href={ACCOUNT_PORTAL_ROUTES.orders}>View order status</Link>
        </div>
        <div className="account-stat">
          <p className="account-section-label">Care operations</p>
          <p className="account-stat-value mt-2">{careEnrollment.status.stage ? sentenceCase(careEnrollment.status.stage) : "Not enrolled"}</p>
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
          <h2 id="membership-heading" className="account-section-title">{membership.planLabel ?? "No active membership"}</h2>
          <p className="body-s mt-3" style={{ color: "#d9d6ce" }}>
            Renewal: {formatAccountDate(membership.nextRenewalAt)}
          </p>
          <p className="body-s mt-3" style={{ color: "#d9d6ce" }}>
            Membership covers administrative and platform services. It does not guarantee treatment, a provider decision, or fulfillment.
          </p>
          {manageUrl ? (
            <a className="btn btn-on-dark btn-primary mt-5" href={manageUrl} target="_blank" rel="noopener noreferrer">Manage billing securely</a>
          ) : (
            <Link className="btn btn-on-dark btn-ghost mt-5" href={ACCOUNT_PORTAL_ROUTES.subscription}>View billing details</Link>
          )}
        </section>
      </div>

      <div className="account-grid account-grid-2">
        <section className="account-surface" aria-labelledby="recent-orders-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="account-section-label">Research orders</p><h2 id="recent-orders-heading" className="account-section-title">Recent activity</h2></div>
            <Link className="account-inline-link" href={ACCOUNT_PORTAL_ROUTES.orders}>All orders</Link>
          </div>
          {recentOrders.length ? (
            <div className="account-card-list mt-5">
              {recentOrders.map((order) => {
                const trackingUrl = safeExternalUrl(order.trackingUrl);
                return (
                  <article className="account-list-card" key={order.reference}>
                    <div className="min-w-0">
                      <p className="mono-label text-ink-mute">{order.reference} · {formatAccountDate(order.placedAt)}</p>
                      <h3 className="body-m font-700 mt-2 break-words">{order.itemLabel}</h3>
                      <p className="body-s text-ink-2 mt-1">{order.variantLabel ?? "Variant recorded with order"} · Qty {order.quantity}</p>
                    </div>
                    <div className="account-list-card-actions">
                      <ResearchStatusBadge label={sentenceCase(order.fulfillmentState)} tone={statusTone(order.fulfillmentState)} />
                      {trackingUrl ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer">Track shipment</a> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <div className="account-empty mt-5">No Research orders are attached to this account yet.</div>}
        </section>

        <section className="account-surface" aria-labelledby="care-summary-heading">
          <p className="account-section-label">Care enrollment</p>
          <h2 id="care-summary-heading" className="account-section-title">Operational status</h2>
          <div className="mt-5">
            <div className="account-data-row"><span className="account-data-label">Enrollment</span><span className="account-data-value">{careEnrollment.enrolled ? "Enrolled" : "Not enrolled"}</span></div>
            <div className="account-data-row"><span className="account-data-label">Provider stage</span><span className="account-data-value">{careEnrollment.status.stage ? sentenceCase(careEnrollment.status.stage) : "Not started"}</span></div>
            <div className="account-data-row"><span className="account-data-label">Pharmacy</span><span className="account-data-value">{sentenceCase(careEnrollment.pharmacyState)}</span></div>
          </div>
          <Link className="btn btn-secondary mt-5" href={ACCOUNT_PORTAL_ROUTES.care}>Open Care status</Link>
        </section>
      </div>

      {productInterests.length ? (
        <CurrentDemandCollection
          items={savedInterestItems(productInterests)}
          title="Your saved interests"
          lead="Availability follows the current Research or Care pathway for each item. No interest is automatically an order."
          showFilters={false}
        />
      ) : (
        <section className="account-surface" aria-labelledby="interests-empty-heading">
          <p className="account-section-label">Saved interests</p>
          <h2 id="interests-empty-heading" className="account-section-title">No interests recorded.</h2>
          <p className="body-s text-ink-2 mt-3">Availability requests can be reviewed with account support.</p>
        </section>
      )}

      <section className="account-grid account-grid-3" aria-label="Account resources">
        <Link className="account-surface" href={ACCOUNT_PORTAL_ROUTES.documents}>
          <p className="account-section-label">Documents</p>
          <p className="account-section-title tabular">{documents.length}</p>
          <p className="body-s text-ink-2 mt-3">Receipts, approved COAs, and account documents.</p>
        </Link>
        <Link className="account-surface" href={ACCOUNT_PORTAL_ROUTES.support}>
          <p className="account-section-label">Support</p>
          <p className="account-section-title tabular">{supportCases.filter((item) => item.state !== "resolved").length} open</p>
          <p className="body-s text-ink-2 mt-3">Order, account, Care, and pharmacy support.</p>
        </Link>
        <Link className="account-surface" href={ACCOUNT_PORTAL_ROUTES.subscription}>
          <p className="account-section-label">Billing</p>
          <p className="account-section-title">{membership.manualBilling ? "Manual / offline" : "Online management"}</p>
          <p className="body-s text-ink-2 mt-3">Membership billing remains separate from product fulfillment.</p>
        </Link>
      </section>
    </div>
  );
}
