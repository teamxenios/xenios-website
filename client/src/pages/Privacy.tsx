import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

export default function Privacy() {
  return (
    <PageShell>
      <SeoHead title={PAGES.privacy.title} description={PAGES.privacy.description} canonical="/privacy" />
      <section className="bg-paper section-y">
        <div className="container-x max-w-4xl">
          <p className="mono-cap text-ink-mute mb-6">PRIVACY</p>
          <h1 className="display-l text-ink mb-8">Privacy on xeniostechnology.com.</h1>
          <p className="body-l text-ink-2">
            This page describes what xeniostechnology.com — the marketing and waitlist site — collects and how it's used. It is separate from the privacy posture of the xenios platform itself, which will be governed by a Notice of Privacy Practices and BAAs at platform launch.
          </p>
          <h2 className="h2 mt-12 text-ink">What we collect on this site</h2>
          <ul className="mt-4 body-l text-ink-2 space-y-2">
            <li>— Form submissions (waitlist and contact): the data you provide.</li>
            <li>— Server logs (IP, user agent, timestamp, country).</li>
            <li>— No third-party advertising trackers.</li>
            <li>— No PHI is ever collected on this marketing site.</li>
          </ul>
          <h2 className="h2 mt-12 text-ink">How we use it</h2>
          <p className="mt-4 body-l text-ink-2">
            To respond to your request, send build updates if you opted in, and to operate this site. We do not sell your data. Ever.
          </p>
          <h2 className="h2 mt-12 text-ink">Subprocessors (this site)</h2>
          <ul className="mt-4 body-l text-ink-2 space-y-2">
            <li>— Replit (hosting, database).</li>
            <li>— Resend (transactional email).</li>
          </ul>
          <h2 className="h2 mt-12 text-ink">Your rights</h2>
          <p className="mt-4 body-l text-ink-2">
            Email <a href="mailto:team@xeniostechnology.com" className="underline">team@xeniostechnology.com</a> to access, correct, or delete your data.
          </p>
          <p className="mt-12 body-s text-ink-mute">Last updated: May 2026.</p>
        </div>
      </section>
    </PageShell>
  );
}
