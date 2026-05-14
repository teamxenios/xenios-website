import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

export default function Press() {
  return (
    <PageShell>
      <SeoHead title={PAGES.press.title} description={PAGES.press.description} canonical="/press" />
      <section className="grad grad-02-tide section-y" data-testid="section-press-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">PRESS · CREATORS · INFLUENCERS</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "26ch" }}>
            The story we'll tell when we're ready.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            xenios is in stealth. We talk to journalists, creators, and influencers carefully and on the record. If you cover proactive health, longevity, performance, or the AI-in-medicine story — we want to know you.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y">
        <div className="container-x max-w-4xl space-y-6">
          <h2 className="h2 text-ink">What we'll share now</h2>
          <ul className="space-y-2 body-l text-ink-2">
            <li>— The category thesis (on the record).</li>
            <li>— The platform architecture, at a high level.</li>
            <li>— The team's prior work in regulated infrastructure.</li>
            <li>— The Austin proactive-health gravity story.</li>
          </ul>
          <h2 className="h2 text-ink mt-12">What we won't share yet</h2>
          <ul className="space-y-2 body-l text-ink-2">
            <li>— Founder names or photos. (Stealth.)</li>
            <li>— Customer names. (We're not yet shipping.)</li>
            <li>— Specific funding figures. (Pre-seed.)</li>
          </ul>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">
            <a href="mailto:team@xeniostechnology.com?subject=%5BPRESS%5D" className="underline">team@xeniostechnology.com</a> — subject [PRESS] or [CREATOR].
          </h2>
        </div>
      </section>
    </PageShell>
  );
}
