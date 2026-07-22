import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { ResearchSecureNotice } from "../ui/kit";
import { ACCESS_ROUTES } from "../lib/routes";

// ---------------------------------------------------------------------------
// Support (/research/support). Pre-member support under the section's minimal
// chrome: how to reach a person, how to check an application, how to claim an
// approved account, and how to reset a password. This page never discloses
// anything about the shared gateway credential.
// ---------------------------------------------------------------------------

const SUPPORT_EMAIL = "research@xeniostechnology.com";

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
        lead="Every message is read by a person. Pick the path that matches where you are."
      >
        {/* Contact */}
        <section aria-labelledby="ra-support-contact" className="card">
          <h2 id="ra-support-contact" className="body-m font-700">
            Email support
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            For anything at all, applications, membership, orders, access, or a question this page does not
            answer, email us directly.
          </p>
          <div className="mt-4">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn-primary">
              Email {SUPPORT_EMAIL}
            </a>
          </div>
          <p className="body-s text-ink-mute mt-4">
            We aim to reply within two business days. If your message needs more time, we will tell you that
            instead of leaving you waiting.
          </p>
        </section>

        {/* Application status */}
        <section aria-labelledby="ra-support-application" className="card mt-6">
          <h2 id="ra-support-application" className="body-m font-700">
            Check your application
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            If you applied for membership, your status page shows exactly where the review stands. The link in
            any email we sent you opens it directly.
          </p>
          <div className="mt-4">
            <Link href={ACCESS_ROUTES.applicationStatus} className="btn btn-secondary">
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
            account and choose your own password. If you cannot find the email, contact support and a person
            will resend it after verifying you.
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
            <Link href={ACCESS_ROUTES.resetPassword} className="btn btn-secondary">
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
      </ResearchPublicShell>
    </>
  );
}
