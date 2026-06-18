import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, SITE } from "@/lib/content";

const ITEMS = [
  { name: "HIPAA-aware", body: "Architected for HIPAA from day one. PHI logging on every interaction. BAA available on request." },
  { name: "SOC 2 (in progress)", body: "Type I targeted; Type II to follow. We will publish status as we progress." },
  { name: "BAA", body: "Business Associate Agreement available for licensed practitioners and clinics handling PHI on the platform." },
  { name: "Scope of practice", body: "Practitioners operate within their own scope and licensure. xenios is a workspace, not a provider of care." },
  { name: "Data residency", body: "United States primary. International residency on the roadmap." },
  { name: "Privacy", body: "We do not sell personal data. We do not train third-party models on practitioner or client data." },
];

export default function Compliance() {
  return (
    <PageShell>
      <SeoHead {...PAGES.compliance} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">COMPLIANCE</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>The posture coaches, trainers, and practitioners can build a business on.</h1>
      </section>
      <section className="container-x py-16 rule-top">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ITEMS.map((p) => (
            <div key={p.name} className="rule-all p-6 rounded-[12px]" data-testid={`card-${p.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-2">{p.name}</h3>
              <p className="body-m text-ink-2">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-4">REQUEST DOCUMENTS</p>
        <p className="body-l text-ink-2 max-w-[60ch]">
          BAA, security review packets, and posture summaries available on request. Email {SITE.email} with subject prefix [Compliance].
        </p>
      </section>
    </PageShell>
  );
}
