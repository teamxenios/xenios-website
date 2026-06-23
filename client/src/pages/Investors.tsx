import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { SITE } from "@/lib/content";

const SIGNALS = [
  { label: "Market", body: "Proactive health professionals are running high-touch relationships on fragmented tools that were not built for the relationship itself." },
  { label: "Constraint", body: "Quality breaks when one coach has to hold 30 to 40 client contexts across texts, forms, notes, and scheduling tools." },
  { label: "Product", body: "Xen for the professional, Athena for the client, the Client Attention Queue, Hercules, and one shared client record." },
  { label: "Stage", body: "Pre-seed, MVP build active, live website, founding cohort forming, and early coach conversations underway." },
];

const DIFFERENTIATORS = [
  "Two-agent architecture: Xen for the professional and Athena for the client.",
  "Voice-preserving drafts that stay behind a coach approval gate.",
  "The Studio shows who needs attention and why.",
  "Hercules prepares weekly check-ins from client context.",
  "A long-term data layer for coaching, performance, and proactive health context.",
];

export default function Investors() {
  return (
    <PageShell>
      <SeoHead
        title="Investors, xenios"
        description="xenios is building the AI-native operating layer for proactive health professionals, starting with coaches and the client attention workflow."
        path="/investors"
      />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">INVESTORS</p>
        <h1 className="display-xl text-balance max-w-[18ch]">The operating layer for proactive health.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[64ch]">
          xenios is building the AI workspace under serious coaches and health professionals. The structural insight is that the professional relationship is valuable, but the current tool stack fragments attention, context, and follow-up.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <a href={`mailto:${SITE.email}?subject=Investor deck request`} className="btn btn-primary">Request the Deck</a>
          <Link href="/book" className="btn btn-ghost">Schedule a Conversation</Link>
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">THESIS</p>
        <h2 className="display-m max-w-[22ch] mb-8">The coach is the wedge. The operating layer is the company.</h2>
        <p className="body-l text-ink-2 max-w-[70ch]">
          Coaches, trainers, clinicians, and performance professionals are doing the work upstream of disease, but they manage client relationships on tools built for scheduling, notes, messaging, or billing. xenios unifies the workflow around the client record and gives the professional AI leverage without taking the relationship away from them.
        </p>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">SIGNALS</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {SIGNALS.map((signal) => (
            <article key={signal.label} className="rule-all rounded-[16px] p-6 bg-paper">
              <p className="mono-cap text-pulse mb-3">{signal.label}</p>
              <p className="body-m text-ink-2">{signal.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">DIFFERENTIATION</p>
        <h2 className="display-m max-w-[20ch] mb-8">Not a chatbot. Not another coaching app.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DIFFERENTIATORS.map((item) => (
            <p key={item} className="body-l text-ink-2 grid grid-cols-[16px_1fr] gap-3">
              <span className="text-pulse">→</span>
              <span>{item}</span>
            </p>
          ))}
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-4">ROUND DETAILS</p>
        <p className="body-l text-ink-2 max-w-[60ch] mb-8">
          Contact the founders for current round details, deck access, and data room context.
        </p>
        <a href={`mailto:${SITE.email}?subject=Investor conversation`} className="btn btn-primary">Contact the Founders</a>
      </section>
    </PageShell>
  );
}
