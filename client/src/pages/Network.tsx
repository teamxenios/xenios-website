import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

const PILLARS = [
  { name: "Refer between coaches", body: "and the trainers, clinicians, and practitioners on the network. Bring your roster. Grow without leaving the operating system." },
  { name: "Agent-to-agent handoff", body: "When you refer, the receiving coach's xenios agent gets the context, scope-aware. The client experiences one continuous relationship." },
  { name: "Revenue routing", body: "Native splits across the chain. Transparent. Auditable. Paid on time." },
  { name: "Scope-aware guardrails", body: "The agent never refers across scope of practice without the coach's approval. Audit trail every step." },
];

const FLOW = [
  "A strength coach wants nutrition support for a client preparing for a meet.",
  "The coach taps Refer in the client record. The xenios agent suggests a nutritionist on the network whose voice and method fit.",
  "The coach approves. The client sees a single message in their xenios client agent: \"Coach added Sarah on the nutrition side. She has your record.\"",
  "Sarah's xenios agent receives a scope-bound context window. Nothing more.",
  "Sarah charts, programs, and follows up. The client experiences one practice, two coaches.",
  "Revenue is routed per the agreement. The receipt is the audit trail.",
];

export default function Network() {
  return (
    <PageShell>
      <SeoHead {...PAGES.network} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">NETWORK</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }}>Coordination, not capture.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          The proactive health team that finally talks to itself. Refer between coaches, trainers, and practitioners on the network. The xenios agent handles the handoff in your voice.
        </p>
      </section>
      <section className="container-x py-20 rule-top">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PILLARS.map((p) => (
            <div key={p.name} className="rule-all p-6 rounded-[12px]" data-testid={`card-${p.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-2">{p.name}</h3>
              <p className="body-m text-ink-2">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-10 max-w-[26ch]">A six-step example.</h2>
        <ol className="space-y-4">
          {FLOW.map((step, i) => (
            <li key={i} className="grid grid-cols-[40px_1fr] gap-4">
              <span className="mono-cap text-pulse">{String(i + 1).padStart(2, "0")}</span>
              <span className="body-l text-ink-2">{step}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">Bring your roster. Grow without leaving.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark">Join the waitlist</Link>
        </div>
      </section>
    </PageShell>
  );
}
