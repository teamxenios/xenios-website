import { Link } from "wouter";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchSecureNotice } from "../../ui/kit";
import { PARTNER_SUPPORT_EMAIL } from "./shared";

// ---------------------------------------------------------------------------
// Partner support (/research/partners/support). How to reach a person, what
// to include, and where the self-serve answers live. No response-time
// promises are invented; a person reads every message.
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
      lead="Every message is read by a person on the research team. Include your partner email and the topic, and you will get a real answer."
    >
      <section aria-labelledby="ps-contact">
        <h2 id="ps-contact" className="mono-cap text-ink-mute">
          Contact
        </h2>
        <div className="card mt-4" style={{ maxWidth: 640 }}>
          <p className="body-m font-700">Email the partner team</p>
          <p className="body-s text-ink-2 mt-2">
            Write from the email on your partner account so the team can find you quickly. Include what you were doing,
            what you expected, and what happened instead.
          </p>
          <a className="btn btn-primary mt-4" href={`mailto:${PARTNER_SUPPORT_EMAIL}?subject=Partner%20support`}>
            Email {PARTNER_SUPPORT_EMAIL}
          </a>
        </div>
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
          for any of those, do not answer it, and forward it to the partner team.
        </ResearchSecureNotice>
      </div>
    </ResearchPartnerShell>
  );
}
