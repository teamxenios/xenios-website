import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, SITE } from "@/lib/content";

export default function Terms() {
  return (
    <PageShell>
      <SeoHead {...PAGES.terms} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">TERMS</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "20ch" }}>Terms of service.</h1>
      </section>
      <section className="container-x py-16 rule-top">
        <div className="space-y-6 max-w-[64ch] body-l text-ink-2">
          <p><strong className="text-ink">Acceptance.</strong> By using xeniostechnology.com or joining the waitlist, you agree to these terms.</p>
          <p><strong className="text-ink">Marketing site.</strong> The information on this site is for general information about the xenios product and brand, and is not medical, clinical, financial, legal, or professional advice.</p>
          <p><strong className="text-ink">Waitlist.</strong> Joining the waitlist is not a contract for service. We will follow up as the founding cohort opens.</p>
          <p><strong className="text-ink">Product terms.</strong> Use of the xenios product (post-launch) is governed by a separate Master Service Agreement provided at onboarding.</p>
          <p><strong className="text-ink">No warranty.</strong> The site is provided as-is. We do our best to keep it accurate and online.</p>
          <p><strong className="text-ink">Governing law.</strong> Delaware. Disputes resolved in courts of competent jurisdiction in Austin, Texas.</p>
          <p><strong className="text-ink">Contact.</strong> Questions: {SITE.email}, subject prefix [Legal].</p>
          <p className="mono-cap text-ink-mute pt-8">Last updated: May 2026 · Xenios Technologies, Inc.</p>
        </div>
      </section>
    </PageShell>
  );
}
