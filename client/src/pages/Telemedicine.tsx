import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

const CAPABILITIES = [
  { name: "Async messaging", body: "Clinical messaging on a real record, not a portal nobody loves." },
  { name: "Live visits", body: "Video and audio visits with notes drafted by the agent in your voice." },
  { name: "E-prescribing where lawful", body: "Prescription routing inside the operating system, in the states and modalities where you are licensed." },
  { name: "Lab ordering and results", body: "Order labs and read results in the same record. The xenios agent flags drift early." },
  { name: "Charting", body: "Documentation that finally feels fast, drafted with the visit and ready for your edit." },
];

export default function Telemedicine() {
  return (
    <PageShell>
      <SeoHead {...PAGES.telemedicine} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">TELEMEDICINE</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }}>Optional care delivery for licensed practitioners.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          xenios is the AI-adjunct operations system for coaches, trainers, and practitioners. For licensed practitioners who deliver care, telemedicine is one click away.
        </p>
      </section>
      <section className="container-x py-20 rule-top">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CAPABILITIES.map((c) => (
            <div key={c.name} className="rule-all p-6 rounded-[12px]" data-testid={`card-${c.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-2">{c.name}</h3>
              <p className="body-m text-ink-2">{c.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="container-x py-20 rule-top">
        <p className="quote-lead max-w-[44ch]">
          The relationship is the unit. The visit is one moment in it.
        </p>
      </section>
      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">Talk to us about care delivery.</h2>
          <Link href="/contact" className="btn btn-primary btn-on-dark">Get in touch</Link>
        </div>
      </section>
    </PageShell>
  );
}
