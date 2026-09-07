import { Link } from "wouter";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES, PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchSecureNotice } from "../../ui/kit";

// ---------------------------------------------------------------------------
// Static partner support handoff. This page does not read account data,
// create a ticket, send a message, or infer permissions from navigation.
// ---------------------------------------------------------------------------

const TOPICS = [
  {
    title: "Application and onboarding",
    body: "Where your application stands, verification, agreements, and certification questions.",
    href: PARTNER_ROUTES.onboarding,
    linkLabel: "Onboarding status",
  },
  {
    title: "Content and compliance",
    body: "Whether something can be said, how to get content cleared, and what the hard lines mean in practice.",
    href: PARTNER_ROUTES.compliance,
    linkLabel: "Compliance rules",
  },
  {
    title: "Commissions and payouts",
    body: "How the ledger works, what hold and reversal mean, and payout setup.",
    href: PARTNER_ROUTES.commissions,
    linkLabel: "Commission ledger",
  },
  {
    title: "Account security",
    body: "Sign-in problems, suspicious messages, or anything that feels off about your account.",
    href: PARTNER_ROUTES.security,
    linkLabel: "Security basics",
  },
];

export default function Support() {
  return (
    <ResearchPartnerShell
      title="Support"
      lead="Contact the Xenios team about your partner account or find the relevant account page. This page provides guidance, not a support inbox or ticket status."
    >
      <nav aria-label="Account help" className="flex flex-wrap gap-3 my-6">
        <Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link>
        <Link href={ACCESS_ROUTES.signIn} className="btn btn-secondary">Sign in</Link>
      </nav>
      <p className="body-s mb-6">
        Use your ordinary Xenios sign-in. These links do not approve an account or grant partner, organization,
        product, or payout access; each destination verifies its own access requirements.
      </p>
      <section aria-labelledby="ps-contact">
        <h2 id="ps-contact" className="mono-cap text-ink-mute">
          Contact
        </h2>
        <div className="card mt-4" style={{ maxWidth: 640 }}>
          <p className="body-m font-700">Email the partner team</p>
          <p className="body-s text-ink-2 mt-2">
            The email link asks your device to open an email app. Review and send your message there if you choose.
            If no email app opens, copy the address into your usual email service.
          </p>
          <a className="btn btn-primary mt-4" href="mailto:team@xeniostechnology.com?subject=Partner%20support">
            Email team@xeniostechnology.com
          </a>
          <p className="body-s text-ink-2 mt-4">
            Opening this link does not send a message or create a support ticket. This page cannot confirm receipt,
            delivery, a reply, or a response time. Nothing is submitted by this page.
          </p>
        </div>
      </section>

      <section aria-labelledby="ps-checklist" className="mt-10">
        <h2 id="ps-checklist" className="mono-cap text-ink-mute">Before you send</h2>
        <ul className="body-s mt-4 space-y-3" style={{ paddingLeft: "1.25rem", maxWidth: 680 }}>
          <li>Briefly name the topic and the page you were using, what you expected, and what happened instead.</li>
          <li>Include an approximate time and a non-sensitive reference if useful. Describe the page by name rather than copying a full URL or sign-in link.</li>
          <li>Remove other people's information, secret values, and private account details from screenshots or copied error text. If you cannot safely remove them, describe the issue without attaching them.</li>
          <li>Do not email passwords, sign-in codes, password-reset links, access tokens, customer health information, bank details, or payout credentials.</li>
        </ul>
      </section>

      <section aria-labelledby="ps-topics" className="mt-10">
        <h2 id="ps-topics" className="mono-cap text-ink-mute">
          Answers by topic
        </h2>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {TOPICS.map((t) => (
            <div key={t.title} className="card">
              <p className="body-m font-700">{t.title}</p>
              <p className="body-s text-ink-2 mt-2">{t.body}</p>
              <div className="mt-3">
                <Link href={t.href} className="btn btn-ghost">
                  {t.linkLabel}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8">
        <ResearchSecureNotice>
          The team will never ask for your password, sign-in codes, or payout credentials over email. If a message asks
          for any of those, do not reply or follow its links. Contact the team using the address above and describe the
          concern without forwarding secret values, account-access links, or private customer information.
        </ResearchSecureNotice>
      </div>
    </ResearchPartnerShell>
  );
}
