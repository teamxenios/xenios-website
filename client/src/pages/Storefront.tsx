import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

const BLOCKS = [
  { name: "Subscriptions", body: "Monthly, quarterly, annual. Pause, resume, prorate. Native dunning." },
  { name: "Packages", body: "Multi-session, multi-month, cohort. Sell the work, not the hour." },
  { name: "One-offs", body: "Single sessions, programs, evaluations, gift cards." },
  { name: "Supplements and equipment", body: "Reorder routing, drop-ship fulfillment, HSA / FSA flagging where lawful." },
  { name: "Affiliate splits", body: "Native splits across coaches, networks, and brand partners." },
  { name: "Outcomes-based pricing", body: "Optional. Tie billing to adherence and result, not to seat." },
];

export default function Storefront() {
  return (
    <PageShell>
      <SeoHead {...PAGES.storefront} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">STOREFRONT</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }}>The commerce rail your practice deserves.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          Native subscriptions, packages, one-offs, supplements, equipment, and gift cards. One operating system, one billing rail, one report at the end of the month.
        </p>
      </section>
      <section className="container-x py-20 rule-top">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {BLOCKS.map((b) => (
            <div key={b.name} className="rule-all p-6 rounded-[12px]" data-testid={`card-${b.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-2">{b.name}</h3>
              <p className="body-m text-ink-2">{b.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">Sell the work, not the seat.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark">Join the waitlist</Link>
        </div>
      </section>
    </PageShell>
  );
}
