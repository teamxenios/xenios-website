import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, SITE } from "@/lib/content";

export default function Investors() {
  return (
    <PageShell>
      <SeoHead {...PAGES.investors} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">INVESTORS</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>Pre-seed. Austin. In stealth.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          xenios (Xenios Technologies, Inc.) is the AI-adjunct operations system for coaches, trainers, and practitioners. We are raising selectively, alongside operators and funds who understand category-defining infrastructure plays.
        </p>
      </section>
      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-4">CATEGORY</p>
        <p className="body-l text-ink-2 max-w-[60ch] mb-8">
          The category is operations infrastructure for proactive health: coaches, trainers, and practitioners doing the work upstream of disease. The category is large, fragmented, and underserved by incumbent tools.
        </p>
        <p className="mono-cap text-ink-mute mb-4">HERITAGE</p>
        <p className="body-l text-ink-2 max-w-[60ch] mb-8">
          The team comes from operators behind $710M+ in prior exits, including FinDox and InstaMed.
        </p>
        <p className="mono-cap text-ink-mute mb-4">CONTACT</p>
        <p className="body-l text-ink-2 max-w-[60ch]">
          Email {SITE.email} with subject prefix [Investor]. We reply inside two business days.
        </p>
      </section>
    </PageShell>
  );
}
