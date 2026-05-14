import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, SITE } from "@/lib/content";

export default function Press() {
  return (
    <PageShell>
      <SeoHead {...PAGES.press} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">PRESS</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "20ch" }}>Press, media, podcast, and creator inquiries.</h1>
      </section>
      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-4">ONE-LINER</p>
        <p className="body-l text-ink-2 max-w-[60ch] mb-8">
          xenios is the AI-adjunct operations system for coaches, trainers, and practitioners. Built in Austin by operators behind $710M+ in prior exits.
        </p>
        <p className="mono-cap text-ink-mute mb-4">CONTACT</p>
        <p className="body-l text-ink-2 max-w-[60ch]">
          Email {SITE.email} with subject prefix [Press]. Brand assets and one-sheet on request.
        </p>
      </section>
    </PageShell>
  );
}
