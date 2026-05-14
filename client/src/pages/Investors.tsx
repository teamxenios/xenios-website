import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

export default function Investors() {
  return (
    <PageShell>
      <SeoHead title={PAGES.investors.title} description={PAGES.investors.description} canonical="/investors" />
      <section className="grad grad-04-meridian section-y" data-testid="section-investors-hero">
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-6">INVESTORS</p>
          <h1 className="display-xl text-paper text-balance" style={{ maxWidth: "26ch" }}>
            If your thesis lives where the puck is going, we should talk.
          </h1>
          <p className="body-l mt-8 text-paper/90 max-w-3xl">
            xenios is the AI-native operating system for proactive health — the orchestration layer connecting every signal, every workflow, and every practitioner moving care upstream of disease.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y">
        <div className="container-x max-w-4xl space-y-6">
          <p className="quote-lead text-ink-2">
            Pre-seed. In stealth. Austin-based. From the team behind $710M+ in prior enterprise outcomes including FinDox (Donnelley) and InstaMed (JPMorgan, 2019).
          </p>
          <p className="body-l text-ink-2">
            We are not raising a coaching app. We are building the operating system underneath the most important new category in medicine. The team has shipped boring infrastructure into regulated environments before, at scale.
          </p>
          <p className="body-l text-ink-2">
            For diligence material, founder bios, and the investment narrative, please reach out directly. We share materials selectively while in stealth.
          </p>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">
            <a href="mailto:team@xeniostechnology.com?subject=%5BINVESTOR%5D" className="underline">team@xeniostechnology.com</a> — subject [INVESTOR].
          </h2>
          <Link href="/contact" className="btn btn-primary btn-on-dark mt-8 inline-flex">contact xenios →</Link>
        </div>
      </section>
    </PageShell>
  );
}
