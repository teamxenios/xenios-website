import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, SITE } from "@/lib/content";

export default function Privacy() {
  return (
    <PageShell>
      <SeoHead {...PAGES.privacy} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">PRIVACY</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "20ch" }}>We send the email you would want to receive. Nothing else.</h1>
      </section>
      <section className="container-x py-16 rule-top">
        <div className="space-y-6 max-w-[64ch] body-l text-ink-2">
          <p><strong className="text-ink">Who we are.</strong> xenios is a product of Xenios Technologies, Inc., a Delaware corporation headquartered in Austin, Texas.</p>
          <p><strong className="text-ink">What we collect.</strong> Information you give us when you join the waitlist or contact us: name, email, role, location, and anything you write in the message field. When you use the product (post-launch), we process the data your practice runs on, under the controls described in your contract and BAA.</p>
          <p><strong className="text-ink">What we do with it.</strong> We email you about the founding cohort, product updates, and replies to your messages. We do not sell your information. We do not train third-party AI models on it.</p>
          <p><strong className="text-ink">Your rights.</strong> You can opt out of email at any time. You can request deletion of your waitlist record by emailing {SITE.email} with the subject prefix [Privacy].</p>
          <p><strong className="text-ink">Security.</strong> See our Security page for posture and disclosure policy.</p>
          <p><strong className="text-ink">Updates.</strong> When this policy changes materially, we will tell the people on our list before it takes effect.</p>
          <p className="mono-cap text-ink-mute pt-8">Last updated: May 2026</p>
        </div>
      </section>
    </PageShell>
  );
}
