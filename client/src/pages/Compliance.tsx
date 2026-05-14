import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

const SECTIONS = [
  { num: "01", title: "HIPAA", body: "xenios is designed to support HIPAA-regulated workflows. BAAs available for covered entities and business associates. PHI logged by the Compliance Agent. Scope-of-practice enforcement per agent and per practitioner." },
  { num: "02", title: "SOC 2 ROADMAP", body: "SOC 2 Type II is on the published roadmap. Controls are being implemented from day one with auditor-grade evidence collection." },
  { num: "03", title: "BAA", body: "Available on request for enterprise and any practitioner operating as a covered entity. Email team@xeniostechnology.com — subject [ENTERPRISE]." },
  { num: "04", title: "SUBPROCESSORS", body: "Stripe (payments). Resend (transactional email). Replit-managed PostgreSQL (operational data). Anthropic / OpenAI (LLM inference, no PHI in prompts without BAA). Subprocessor list will be maintained at /compliance/subprocessors." },
  { num: "05", title: "DATA RESIDENCY", body: "U.S. hosting by default. Multi-region available for enterprise. No cross-border transfer without explicit configuration." },
  { num: "06", title: "AUDIT TRAIL", body: "Every privileged action, every PHI access, every agent decision routed through the audit log. Exportable for compliance reviews." },
  { num: "07", title: "EXPORT & DELETION", body: "Practitioners and clients can export and delete their data at any time. Deletion is irreversible and audited." },
  { num: "08", title: "INCIDENT RESPONSE", body: "We disclose security incidents in line with HIPAA breach notification rules and contractual obligations. security@xeniostechnology.com." },
];

export default function Compliance() {
  return (
    <PageShell>
      <SeoHead title={PAGES.compliance.title} description={PAGES.compliance.description} canonical="/compliance" />
      <section className="grad grad-02-tide section-y" data-testid="section-compliance-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">COMPLIANCE</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "24ch" }}>
            Built to be audited.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            HIPAA. SOC 2 roadmap. BAAs. Subprocessors. Data residency. Export and deletion. Audit on every action.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y">
        <div className="container-x space-y-4">
          {SECTIONS.map((s) => (
            <article key={s.num} className="card">
              <p className="mono-cap text-pulse">{s.num}</p>
              <h2 className="h2 mt-3 text-ink">{s.title}</h2>
              <p className="body-l mt-4 text-ink-2 max-w-4xl">{s.body}</p>
            </article>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
