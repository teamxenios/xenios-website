import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

export default function Terms() {
  return (
    <PageShell>
      <SeoHead title={PAGES.terms.title} description={PAGES.terms.description} canonical="/terms" />
      <section className="bg-paper section-y">
        <div className="container-x max-w-4xl">
          <p className="mono-cap text-ink-mute mb-6">TERMS</p>
          <h1 className="display-l text-ink mb-8">Terms of service for xeniostechnology.com.</h1>
          <p className="body-l text-ink-2">
            These terms govern your use of the xeniostechnology.com marketing and waitlist site. Use of the xenios platform itself, when it ships, will be governed by a separate Master Services Agreement and a Business Associate Agreement where applicable.
          </p>
          <h2 className="h2 mt-12 text-ink">Site usage</h2>
          <p className="mt-4 body-l text-ink-2">You agree to use this site lawfully and not to interfere with its operation. You will not attempt to circumvent rate limits, security controls, or the honeypot on our forms.</p>
          <h2 className="h2 mt-12 text-ink">Not medical advice</h2>
          <p className="mt-4 body-l text-ink-2">Nothing on this site is medical advice. xenios is not a medical device. Brand names referenced in the ecosystem are property of their respective owners and indicate design intent, not partnership.</p>
          <h2 className="h2 mt-12 text-ink">No warranties</h2>
          <p className="mt-4 body-l text-ink-2">This site is provided "as is" without warranty of any kind. To the maximum extent permitted by law, Xenios Technologies disclaims all liability arising from use of this site.</p>
          <h2 className="h2 mt-12 text-ink">Governing law</h2>
          <p className="mt-4 body-l text-ink-2">Texas. Disputes resolved in Travis County, Texas.</p>
          <p className="mt-12 body-s text-ink-mute">Last updated: May 2026.</p>
        </div>
      </section>
    </PageShell>
  );
}
