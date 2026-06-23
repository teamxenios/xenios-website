import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";

const TEAM = [
  { name: "Samuel Boadu", role: "Founder and CEO", body: "Samuel is building from the inside of the coaching and performance world. The founding insight is simple: client relationships change behavior, but the operating layer behind those relationships is broken." },
  { name: "Brian Bentow", role: "CTO", body: "Brian brings senior healthcare and payments technology experience, including prior exits and the infrastructure judgment needed for sensitive workflows." },
  { name: "Dr. Wesley Nahm, MD", role: "CMO and Medical Director", body: "Clinical leadership informs how xenios handles boundaries, health data posture, and the future clinical surface without confusing software with care." },
];

const VALUES = [
  "Trust before automation",
  "Client relationship preservation",
  "Craftsmanship over theater",
  "Clinical boundary awareness",
  "Speed with judgment",
  "Plain language over hype",
];

export default function About() {
  return (
    <PageShell>
      <SeoHead
        title="About, xenios"
        description="Learn why xenios exists, who is building it, and how the company approaches trust, client relationships, and proactive health infrastructure."
        path="/about"
      />

      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">ABOUT</p>
        <h1 className="display-xl text-balance max-w-[18ch]">The operating layer for proactive health relationships.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[64ch]">
          xenios exists because the trusted relationship between a professional and a client is where behavior changes, but that relationship is currently held together by messages, spreadsheets, notes, forms, and memory.
        </p>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">MISSION</p>
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20">
          <h2 className="display-m max-w-[18ch]">Give great professionals more leverage without thinning the relationship.</h2>
          <div className="space-y-5">
            <p className="body-l text-ink-2">
              The current tool stack fragments the client relationship. Programming lives in one place, messages in another, notes somewhere else, billing somewhere else, and follow-up in the professional's head.
            </p>
            <p className="body-l text-ink-2">
              AI can extend the professional when it is bounded by context, approval, and trust. The AI drafts. The coach decides.
            </p>
          </div>
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">TEAM</p>
        <h2 className="display-m max-w-[24ch] mb-10">A small team built for the problem.</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TEAM.map((person) => (
            <article key={person.name} className="rule-all rounded-[16px] p-6 bg-paper">
              <h3 className="h3 mb-2">{person.name}</h3>
              <p className="mono-cap text-pulse mb-4">{person.role}</p>
              <p className="body-m text-ink-2">{person.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">MARKET THESIS</p>
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20">
          <h2 className="display-m max-w-[20ch]">The proactive health professional is underserved by legacy tools.</h2>
          <div className="space-y-5">
            <p className="body-l text-ink-2">
              Coaches, trainers, dietitians, clinicians, and performance staff are doing the work upstream of disease. Their tools were built for scheduling, notes, content, or billing. Not for the relationship itself.
            </p>
            <p className="body-l text-ink-2">
              xenios is pre-seed, MVP-building, and forming the early cohort. The goal is not to pretend the company is mature. The goal is to build the right system with the right first professionals.
            </p>
          </div>
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">HOW WE OPERATE</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {VALUES.map((value) => (
            <div key={value} className="rule-all rounded-[14px] p-5 body-l text-ink-2">{value}</div>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">Build, fund, or test the next layer with us.</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/contact" className="btn btn-primary btn-on-dark">Contact xenios</Link>
            <Link href="/careers" className="btn btn-ghost-on-dark">View Careers</Link>
            <Link href="/waitlist" className="btn btn-ghost-on-dark">Request Early Access</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
