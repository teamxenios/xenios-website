import { Link } from "wouter";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchSecureNotice } from "../../ui/kit";

// ---------------------------------------------------------------------------
// Partner landing (/research/partners). Public-facing explanation of the
// Research Rep program: education-first, compliance-first, no income claims,
// no downline. Static program description only; nothing here pretends to be
// account data.
// ---------------------------------------------------------------------------

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Apply and get certified",
    body: "Submit a short application, then complete compliance training before anything is shared. Certification comes first, always.",
  },
  {
    step: "2",
    title: "Share approved content",
    body: "You receive a unique link and a library of approved materials. Everything you share about Xenios Research comes from that library, with your relationship disclosed.",
  },
  {
    step: "3",
    title: "Earn on your own referrals",
    body: "Commissions come only from membership activity you directly referred. There are no tiers, no teams to build, and no one underneath you.",
  },
];

const NOT_THIS = [
  {
    title: "No income claims",
    body: "This is not an income opportunity. No earnings are promised, projected, or implied, by us or by you. Presenting the program as a way to make a living is a removable offense.",
  },
  {
    title: "No downline, no recruitment",
    body: "There is no recruitment tier and never will be. You are never paid for signing up other reps, and building a downline is not part of this program in any form.",
  },
  {
    title: "No medical claims",
    body: "Reps never claim that anything diagnoses, treats, cures, or prevents any condition. The program is educational, and the approved library is the boundary of what can be said.",
  },
];

export default function Landing() {
  return (
    <ResearchPartnerShell
      showNav={false}
      eyebrow="Xenios Research"
      title="The Research Rep program"
      lead="A compliance-first way for educators, practitioners, and community builders to introduce people to Xenios Research, and to be paid fairly for the introductions they personally make."
      actions={
        <>
          <Link href={PARTNER_ROUTES.apply} className="btn btn-primary">
            Apply to become a rep
          </Link>
          <Link href={PARTNER_ROUTES.dashboard} className="btn btn-ghost">
            Partner sign-in
          </Link>
        </>
      }
    >
      <section aria-labelledby="pl-what">
        <h2 id="pl-what" className="mono-cap text-ink-mute">
          What the program is
        </h2>
        <p className="body-m text-ink-2 mt-3 max-w-[62ch]">
          Research Reps share what the Xenios Research membership is: an application-gated, education-first research
          community. Reps teach and introduce; they do not sell health outcomes. Every claim a rep makes comes from the
          approved content library, and every share carries a clear disclosure of the rep relationship.
        </p>
      </section>

      <section aria-labelledby="pl-how" className="mt-10">
        <h2 id="pl-how" className="mono-cap text-ink-mute">
          How it works
        </h2>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {HOW_IT_WORKS.map((item) => (
            <div key={item.step} className="card">
              <p className="mono-label text-ink-mute">Step {item.step}</p>
              <p className="body-m font-700 mt-1">{item.title}</p>
              <p className="body-s text-ink-2 mt-2">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="pl-econ" className="mt-10">
        <h2 id="pl-econ" className="mono-cap text-ink-mute">
          What members pay
        </h2>
        <div className="card mt-4" style={{ maxWidth: 640 }}>
          <p className="body-m font-700">Membership is $50 at activation, including the first 30 days, then $25 per additional 30-day period.</p>
          <p className="body-s text-ink-2 mt-2">
            There are no annual plans and no other pricing. Reps never set, discount, or change pricing, and commission
            terms are published inside the partner portal before anything is shared.
          </p>
        </div>
      </section>

      <section aria-labelledby="pl-not" className="mt-10">
        <h2 id="pl-not" className="mono-cap text-ink-mute">
          What this program is not
        </h2>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {NOT_THIS.map((item) => (
            <div key={item.title} className="card">
              <p className="body-m font-700">{item.title}</p>
              <p className="body-s text-ink-2 mt-2">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10">
        <ResearchSecureNotice>
          Reps never see member identities, member health information, or individual purchase details. Partner reporting
          is aggregate only, by design.
        </ResearchSecureNotice>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={PARTNER_ROUTES.apply} className="btn btn-primary">
          Apply to become a rep
        </Link>
        <Link href={PARTNER_ROUTES.compliance} className="btn btn-secondary">
          Read the compliance rules
        </Link>
      </div>
    </ResearchPartnerShell>
  );
}
