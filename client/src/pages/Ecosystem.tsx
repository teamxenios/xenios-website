import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, ECOSYSTEM_CATEGORIES } from "@/lib/content";

export default function Ecosystem() {
  return (
    <PageShell>
      <SeoHead {...PAGES.ecosystem} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">ECOSYSTEM</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }}>Connected to the proactive health stack.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          Eighteen categories of partners and integrations across wearables, labs, recovery, nutrition, supplements, and more. The xenios agent reads them all into one client record.
        </p>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-8">CATEGORIES</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ECOSYSTEM_CATEGORIES.map((cat) => (
            <div key={cat} className="rule-all p-5 rounded-[10px]" data-testid={`tile-ecosystem-${cat.replace(/\W+/g, "-").toLowerCase()}`}>
              <p className="body-l font-700">{cat}</p>
            </div>
          ))}
        </div>
        <p className="body-s text-ink-mute mt-10 max-w-[60ch]">
          Specific brand integrations are announced as they ship. Brand names are property of their respective owners. Inclusion in a category does not imply a current partnership.
        </p>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">Build with us.</h2>
          <p className="body-l text-paper/80 mb-6 max-w-[52ch]">
            Brands, devices, labs, and content partners across the proactive health stack: tell us what you would integrate.
          </p>
          <Link href="/contact" className="btn btn-primary btn-on-dark">Talk to us</Link>
        </div>
      </section>
    </PageShell>
  );
}
