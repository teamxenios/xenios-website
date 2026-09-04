import { Link } from "wouter";
import type { CustomerAccountOverviewDto } from "@shared/research/customer-account/contract";
import { ResearchStatusBadge } from "../../ui/kit";
import { ACCESS_ROUTES, ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { sentenceCase, statusTone } from "../format";
import { researchAuthPath } from "@shared/research/auth-return-to";

export function AccountSecurityView({ data }: { data: CustomerAccountOverviewDto }) {
  const { identity } = data;
  return (
    <div className="account-grid account-grid-2">
      <section className="account-surface" aria-labelledby="password-recovery-heading">
        <p className="account-section-label">Password recovery</p>
        <h2 id="password-recovery-heading" className="account-section-title">Reset your password through the existing recovery route.</h2>
        <p className="body-s text-ink-2 mt-3 break-words">
          Account email: <span className="font-700">{identity.email}</span>
        </p>
        <div className="mt-4">
          <ResearchStatusBadge
            label={`Account: ${sentenceCase(identity.accountStatus)}`}
            tone={statusTone(identity.accountStatus)}
          />
        </div>
        <Link className="btn btn-primary mt-5" href={researchAuthPath(ACCESS_ROUTES.resetPassword, ACCOUNT_PORTAL_ROUTES.security)}>Open password reset</Link>
      </section>

      <section className="account-surface account-surface-warm" aria-labelledby="security-controls-heading">
        <p className="account-section-label">Security controls</p>
        <h2 id="security-controls-heading" className="account-section-title">Session and multi-factor controls are not available here.</h2>
        <p className="body-s text-ink-2 mt-3">
          This account surface has no authoritative session list or multi-factor status, so it does not display either as enabled, disabled, or current.
        </p>
        <Link className="btn btn-secondary mt-5" href={ACCOUNT_PORTAL_ROUTES.support}>Ask account support</Link>
      </section>
    </div>
  );
}
