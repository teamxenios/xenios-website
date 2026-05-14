import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, ICP_LIST } from "@/lib/content";

export default function ForPractitioners() {
  return (
    <PageShell>
      <SeoHead {...PAGES.forPractitioners} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">FOR PRACTITIONERS</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>Built for the people doing the work upstream of disease.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          Twenty-five categories of coaches, trainers, and practitioners across performance, longevity, recovery, and clinical care. Find your fit.
        </p>
      </section>

      <section className="container-x py-20 rule-top">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ICP_LIST.map((icp) => (
            <Link
              key={icp.slug}
              href={`/for/${icp.slug}`}
              className="rule-all p-5 rounded-[10px] hover:bg-paper-2 transition-colors block"
              data-testid={`tile-icp-${icp.slug}`}
            >
              <p className="h3 mb-1">{icp.label}</p>
              <p className="body-s text-ink-2">{icp.oneLiner}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">Don't see your category?</h2>
          <Link href="/contact" className="btn btn-primary btn-on-dark">Tell us</Link>
        </div>
      </section>
    </PageShell>
  );
}
