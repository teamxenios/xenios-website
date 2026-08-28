import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { ResearchSecureNotice } from "../ui/kit";
import { ACCESS_ROUTES } from "../lib/routes";
import "./public-editorial.css";

// ---------------------------------------------------------------------------
// Support (/research/support). Pre-member support under the section's minimal
// chrome: how to reach a person, how to check an application, how to claim an
// approved account, and how to reset a password. This page never discloses
// anything about the shared gateway credential.
// ---------------------------------------------------------------------------

export const RESEARCH_SUPPORT_EMAIL = "research@xeniostechnology.com";

export default function Support() {
  return (
    <>
      <SeoHead
        title="Support, xenios research"
        description="Contact xenios research support, check an application, claim an approved account, or reset a password."
        path={ACCESS_ROUTES.support}
      />
      <ResearchPublicShell
        eyebrow="Support"
        title="How to reach us"
        lead="Pick the path that matches where you are. Research Support handles operational questions and account help; clinical questions stay with the authorized Care or provider workflow."
      >
        {/* Contact */}
        <section aria-labelledby="ra-support-contact" className="card mt-6">
          <h2 id="ra-support-contact" className="body-m font-700">
            Email support
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            For applications, membership, Research requests, orders, access, documents, organization inquiries,
            or an operational question this page does not answer, email Research Support directly.
          </p>
          <div className="mt-4">
            <a
              href={`mailto:${RESEARCH_SUPPORT_EMAIL}`}
              className="btn btn-primary public-editorial-action"
              style={{
                maxWidth: "100%",
                minHeight: 52,
                height: "auto",
                paddingTop: 12,
                paddingBottom: 12,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                textAlign: "center",
              }}
            >
              Email {RESEARCH_SUPPORT_EMAIL}
            </a>
          </div>
          <p className="body-s text-ink-mute mt-4">
            A member of the Xenios team will respond when support coverage is available. No response time is promised here.
          </p>
        </section>

        {/* Application status */}
        <section aria-labelledby="ra-support-application" className="card mt-6">
          <h2 id="ra-support-application" className="body-m font-700">
            Check your application
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            If you received a valid secure status link, it opens the application status returned by the current
            source. Links can expire or be unavailable; the status page also offers a generic request for another
            link without disclosing whether an address has an application.
          </p>
          <div className="mt-4">
            <Link href={ACCESS_ROUTES.applicationStatus} className="btn btn-secondary public-editorial-action">
              Application status
            </Link>
          </div>
        </section>

        {/* Account claim */}
        <section aria-labelledby="ra-support-claim" className="card mt-6">
          <h2 id="ra-support-claim" className="body-m font-700">
            Approved but no account?
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            Use the secure link in your approval email. It opens your status page, where you create your member
            account and choose your own password. If the link is missing or expired, use Application status above
            to request another status link. The response remains generic for privacy.
          </p>
        </section>

        {/* Password help */}
        <section aria-labelledby="ra-support-password" className="card mt-6">
          <h2 id="ra-support-password" className="body-m font-700">
            Forgot your password?
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            Members can request a password reset link by email. The link is single use and expires; if yours
            has expired, simply request a new one.
          </p>
          <div className="mt-4">
            <Link href={ACCESS_ROUTES.resetPassword} className="btn btn-secondary public-editorial-action">
              Reset password
            </Link>
          </div>
        </section>

        <div className="mt-8">
          <ResearchSecureNotice>
            Support will never ask you for your password. Account help always goes through the secure links we
            email you.
          </ResearchSecureNotice>
        </div>

        <section aria-labelledby="ra-support-boundary" className="card bg-paper-2 mt-6">
          <h2 id="ra-support-boundary" className="body-m font-700">Research Support does not make clinical decisions.</h2>
          <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
            Support cannot diagnose, recommend treatment, prescribe, interpret a personal clinical result, or promise pharmacy fulfillment.
            Use the provider-governed Care path for those questions.
          </p>
          <div className="mt-4 public-editorial-actions">
            <Link href="/care" className="btn btn-secondary public-editorial-action">Open Care</Link>
            <Link href="/research/faq" className="btn btn-ghost public-editorial-action">Read the FAQ</Link>
          </div>
        </section>
      </ResearchPublicShell>
    </>
  );
}
