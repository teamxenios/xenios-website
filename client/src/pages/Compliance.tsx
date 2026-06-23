import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { SITE } from "@/lib/content";

const ITEMS = [
  { name: "Health-aware posture", body: "xenios is designed with higher privacy expectations in mind. Formal use in regulated settings should be reviewed with the team before launch." },
  { name: "Security roadmap", body: "Controls, documentation, and review processes are being built as the product matures. This page does not claim a completed certification." },
  { name: "Agreement review", body: "Contract and data handling needs depend on customer use case and data scope. Ask the team for current availability and review status." },
  { name: "Scope of practice", body: "Professionals operate within their own licensure, credentials, and scope. xenios is software, not a provider of care." },
  { name: "AI boundary", body: "AI does not diagnose, prescribe, or replace licensed professional judgment. Clinical workflows require appropriate professionals and legal review." },
  { name: "Privacy posture", body: "Client context is treated as sensitive. Questions about use, access, retention, or deletion should be sent directly to the team." },
];

const ROADMAP = [
  "Documented security review process",
  "Expanded audit logs and access controls",
  "Customer-facing data handling overview",
  "Compliance packet for qualified customers",
  "Formal audit path as the product matures",
];

export default function Compliance() {
  return (
    <PageShell>
      <SeoHead
        title="Compliance, xenios"
        description="xenios keeps compliance language honest, with clear AI boundaries, scope of practice rules, and a roadmap for trust documentation."
        path="/compliance"
      />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">COMPLIANCE</p>
        <h1 className="display-xl text-balance max-w-[18ch]">Honest posture. Clear boundaries.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[62ch]">
          xenios is built for coaches, trainers, and practitioners who handle sensitive client context. We keep trust language specific and cautious because credibility depends on accuracy.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <Link href="/contact" className="btn btn-primary">Talk to the Team</Link>
          <Link href="/security" className="btn btn-ghost">View Security</Link>
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">CURRENT POSTURE</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ITEMS.map((p) => (
            <div key={p.name} className="rule-all p-6 rounded-[16px]" data-testid={`card-${p.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-3">{p.name}</h3>
              <p className="body-m text-ink-2">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20">
          <div>
            <p className="mono-cap text-ink-mute mb-6">ROADMAP</p>
            <h2 className="display-m max-w-[18ch]">The trust layer matures with the product.</h2>
          </div>
          <div className="rule-all rounded-[18px] p-6 md:p-8 bg-paper">
            <div className="space-y-4">
              {ROADMAP.map((item) => (
                <p key={item} className="body-l text-ink-2 grid grid-cols-[16px_1fr] gap-3">
                  <span className="text-pulse">→</span>
                  <span>{item}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-4">REQUEST DOCUMENTS</p>
        <p className="body-l text-ink-2 max-w-[60ch]">
          Security review packets, posture summaries, and compliance questions can be sent to {SITE.email} with subject prefix [Compliance].
        </p>
      </section>
    </PageShell>
  );
}
