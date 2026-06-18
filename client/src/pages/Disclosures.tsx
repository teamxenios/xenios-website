import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";

const CONTACT_EMAIL = "team@xeniostechnology.com";

export default function Disclosures() {
  return (
    <PageShell>
      <SeoHead
        title="Disclosures - xenios"
        description="Cookie and tracking, AI disclosure, medical disclaimer, and data deletion for xenios."
        path="/disclosures"
      />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">DISCLOSURES</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "20ch" }}>The things we want you to know, in plain language.</h1>
      </section>
      <section className="container-x py-16 rule-top">
        <div className="space-y-10 max-w-[64ch] body-l text-ink-2">
          <div className="space-y-3">
            <h2 className="display-s text-ink" data-testid="text-section-cookie">Cookie and tracking</h2>
            <p>xenios uses cookies and the Meta Pixel to understand how the site is used and to measure advertising. This helps us see which pages are useful and how people find us. You can control cookies through your browser settings.</p>
          </div>
          <div className="space-y-3">
            <h2 className="display-s text-ink" data-testid="text-section-ai">AI disclosure</h2>
            <p>The client-facing agent is always disclosed as AI. It never pretends to be a person. The coach reviews and approves what goes out, so the human stays in control of the relationship.</p>
          </div>
          <div className="space-y-3">
            <h2 className="display-s text-ink" data-testid="text-section-medical">Medical disclaimer</h2>
            <p>xenios is not medical advice, diagnosis, treatment, or emergency care. It does not replace a licensed clinician. If you have a medical concern, speak with a qualified professional. In an emergency, contact your local emergency services.</p>
          </div>
          <div className="space-y-3">
            <h2 className="display-s text-ink" data-testid="text-section-deletion">Data deletion</h2>
            <p>You can request deletion of your data by emailing <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink font-700 hover:text-pulse" data-testid="link-data-deletion">{CONTACT_EMAIL}</a>. We will confirm once it is done.</p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
