import { Link } from "wouter";
import type { ProductInterestDto } from "@shared/research/customer-account/contract";
import { ResearchStatusBadge, type BadgeTone } from "../../ui/kit";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { formatAccountDate } from "../format";

type InterestPresentation = Readonly<{
  label: string;
  tone: BadgeTone;
  note: string;
  action: Readonly<{ href: string; label: string }> | null;
}>;

function interestPresentation(availability: ProductInterestDto["availability"]): InterestPresentation {
  switch (availability) {
    case "live":
      return {
        label: "Live in catalog",
        tone: "success",
        note: "This item is listed in the member catalog. The catalog remains the authority for any available action.",
        action: { href: "/research/member/catalog", label: "Open member catalog" },
      };
    case "request_only":
      return {
        label: "Request only",
        tone: "info",
        note: "This saved interest records demand only. It is not an order and does not reserve inventory.",
        action: { href: ACCOUNT_PORTAL_ROUTES.support, label: "Ask account support" },
      };
    case "provider_required":
      return {
        label: "Provider pathway required",
        tone: "info",
        note: "This interest follows a separate provider/Care pathway. It is not an order or a provider decision.",
        action: { href: ACCOUNT_PORTAL_ROUTES.care, label: "View Care status" },
      };
    case "pending_activation":
      return {
        label: "Pending activation",
        tone: "warning",
        note: "Activation is not complete. This record does not make the item orderable.",
        action: { href: ACCOUNT_PORTAL_ROUTES.support, label: "Ask account support" },
      };
    case "unavailable":
      return {
        label: "Unavailable",
        tone: "neutral",
        note: "No customer action is available for this interest from the current account record.",
        action: null,
      };
  }
}

export function AccountInterestsView({ interests }: { interests: readonly ProductInterestDto[] }) {
  return (
    <section className="account-surface" aria-labelledby="saved-interests-heading">
      <p className="account-section-label">Saved interests</p>
      <h2 id="saved-interests-heading" className="account-section-title">Availability without implied ordering</h2>
      <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
        Each status is shown exactly from the account projection. A saved interest is not an order, reservation, provider decision, or activation approval.
      </p>

      {interests.length ? (
        <div className="account-card-list mt-6">
          {interests.map((interest) => {
            const presentation = interestPresentation(interest.availability);
            return (
              <article className="account-list-card" key={interest.interestKey}>
                <div className="min-w-0">
                  <p className="mono-label text-ink-mute break-words">{interest.interestKey}</p>
                  <h3 className="body-l font-700 mt-2 break-words">{interest.displayLabel}</h3>
                  <p className="body-s text-ink-2 mt-2 max-w-[60ch]">{presentation.note}</p>
                  <p className="body-s text-ink-mute mt-3">Recorded {formatAccountDate(interest.recordedAt)}.</p>
                </div>
                <div className="account-list-card-actions">
                  <ResearchStatusBadge label={presentation.label} tone={presentation.tone} />
                  {presentation.action ? (
                    <Link href={presentation.action.href}>{presentation.action.label}</Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="account-empty mt-6">
          No saved interests are visible in this account view. Interest-history completeness is not reported here.
        </div>
      )}
    </section>
  );
}
