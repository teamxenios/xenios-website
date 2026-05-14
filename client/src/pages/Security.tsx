import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

const SECTIONS = [
  { num: "01", title: "HIPAA-AWARE BY DESIGN", body: "PHI is encrypted at rest and in transit. Every PHI interaction is logged by the Compliance Agent. BAAs available for covered entities and business associates. Scope-of-practice guardrails enforced per agent, per practitioner." },
  { num: "02", title: "SOC 2 ROADMAP", body: "SOC 2 Type II is on the roadmap. We are building toward audit-readiness from day one — not retrofitting it after the fact." },
  { num: "03", title: "ENCRYPTION", body: "Data at rest encrypted with AES-256. Data in transit over TLS 1.2+. Key rotation handled at the infrastructure layer." },
  { num: "04", title: "ACCESS CONTROL", body: "Role-based access controls. SSO available for enterprise. Audit trail on every privileged action." },
  { num: "05", title: "DATA RESIDENCY", body: "U.S. hosting by default. Multi-region available for enterprise. No data crosses borders without explicit configuration." },
  { num: "06", title: "EXPORT & DELETION", body: "Practitioners and clients can export their data at any time. Deletion is irreversible and audited." },
  { num: "07", title: "VULNERABILITY DISCLOSURE", body: "Found something? security@xeniostechnology.com. We respond to every credible report inside two business days." },
];

export default function Security() {
  return (
    <PageShell>
      <SeoHead title={PAGES.security.title} description={PAGES.security.description} canonical="/security" />
      <section className="grad grad-04-meridian section-y" data-testid="section-security-hero">
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-6">SECURITY & DATA</p>
          <h1 className="display-xl text-paper text-balance" style={{ maxWidth: "24ch" }}>
            Built for the most sensitive surface in human life.
          </h1>
          <p className="body-l mt-8 text-paper/90 max-w-3xl">
            HIPAA-aware. BAA available. SOC 2 on the roadmap. Encryption end to end. Audit on every action.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-security-detail">
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

      <section className="bg-paper section-y rule-top">
        <div className="container-x">
          <p className="body-m text-ink-2 max-w-3xl">For the formal compliance posture and subprocessor list, see <Link href="/compliance" className="underline">/compliance</Link>.</p>
        </div>
      </section>
    </PageShell>
  );
}
