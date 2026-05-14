import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

const STEPS = [
  { num: "01", title: "Connect your stack.", body: "Bring the tools you already use. xenios reads from your programming app, your billing platform, your messaging inbox, your intake forms, and your client list. Day one, every client is on the new record." },
  { num: "02", title: "Teach your voice.", body: "Upload prior messages, programs, and content. The xenios agent learns how you talk, what you teach, and how you teach it. Voice fidelity is measured, not assumed." },
  { num: "03", title: "Approve the first batch.", body: "Every drafted message, program, or check-in lands in your queue first. You approve, edit, or discard. Each edit teaches the agent. The approval queue shrinks every week." },
  { num: "04", title: "Move the autonomy dial.", body: "Per workflow, per client, per surface. Suggest. Draft. Auto-approve. Move it where you want it. Move it back when you want to. The dial is yours, always." },
  { num: "05", title: "Run the practice.", body: "The xenios agent handles the back office: programming, intake, check-ins, messaging, education, billing. The xenios client agent holds the in-between in your voice. You spend the day coaching, not coordinating." },
];

const SURFACES_DETAIL = [
  { eyebrow: "the xenios agent", title: "Runs your back office.", bullets: ["Drafts messages in your voice.", "Builds and versions programs and protocols.", "Triages your inbox across SMS, in-app, and email.", "Runs scheduled and adaptive check-ins.", "Handles billing, packages, and reorder routing.", "Surfaces who needs you today and who can wait."] },
  { eyebrow: "the xenios client agent", title: "Holds the in-between.", bullets: ["Answers protocol questions in your voice.", "Reminds, nudges, and holds accountability.", "Teaches the why with your education.", "Tracks adherence, mood, and signal between sessions.", "Hands clinical or out-of-scope items back to you.", "Never speaks outside the rails you set."] },
];

export default function HowItWorks() {
  return (
    <PageShell>
      <SeoHead {...PAGES.howItWorks} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">HOW IT WORKS</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }}>Five steps. One operating system. Your voice on every surface.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          xenios is the AI-adjunct operations system for coaches, trainers, and practitioners. Here is what onboarding looks like.
        </p>
      </section>

      <section className="container-x py-20 rule-top">
        <div className="space-y-10">
          {STEPS.map((s) => (
            <div key={s.num} className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-6 md:gap-12 rule-bottom pb-10 last:rule-bottom-0" data-testid={`step-${s.num}`}>
              <p className="mono-cap text-pulse text-2xl font-800">{s.num}</p>
              <div>
                <h2 className="display-s mb-3">{s.title}</h2>
                <p className="body-l text-ink-2 max-w-[58ch]">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-10 max-w-[24ch]">The two surfaces, plain.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {SURFACES_DETAIL.map((s) => (
            <article key={s.eyebrow} className="rule-all p-8 rounded-[16px]" data-testid={`card-${s.eyebrow.replace(/\s+/g, "-")}`}>
              <p className="mono-cap text-ink-mute mb-3">{s.eyebrow}</p>
              <h3 className="display-s mb-5">{s.title}</h3>
              <ul className="space-y-2">
                {s.bullets.map((b) => <li key={b} className="body-m text-ink-2">{b}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-6 max-w-[24ch]">The autonomy dial.</h2>
        <p className="body-l text-ink-2 mb-8 max-w-[60ch]">
          Three modes per workflow per client: SUGGEST, DRAFT, AUTO-APPROVE. Set it where you want trust to start. Move it as the agent earns more.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: "SUGGEST", body: "The agent proposes. You write it." },
            { name: "DRAFT", body: "The agent drafts. You approve or edit." },
            { name: "AUTO-APPROVE", body: "The agent ships. You see the log." },
          ].map((m) => (
            <div key={m.name} className="rule-all p-6 rounded-[12px]">
              <p className="mono-cap text-pulse mb-2">{m.name}</p>
              <p className="body-m text-ink-2">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[24ch]">See it in your practice.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark">Join the waitlist</Link>
        </div>
      </section>
    </PageShell>
  );
}
