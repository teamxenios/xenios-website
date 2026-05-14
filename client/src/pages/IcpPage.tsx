import { Link, useRoute } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import NotFound from "./not-found";
import { ICP_BY_SLUG, SITE } from "@/lib/content";

export default function IcpPage() {
  const [, params] = useRoute("/for/:slug");
  const icp = params?.slug ? ICP_BY_SLUG[params.slug] : null;
  if (!icp) return <NotFound />;

  const title = `${icp.label}, xenios`;
  const description = icp.oneLiner;
  const path = `/for/${icp.slug}`;

  return (
    <PageShell>
      <SeoHead title={title} description={description} path={path} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">{icp.label.toUpperCase()}</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>{icp.oneLiner}</h1>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">THE PROBLEM</p>
        <p className="quote-lead max-w-[60ch]">{icp.problem}</p>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">WHAT XENIOS DOES FOR YOU</p>
        <ul className="space-y-3 max-w-[60ch]">
          {icp.bullets.map((b) => (
            <li key={b} className="body-l text-ink-2 grid grid-cols-[16px_1fr] gap-3">
              <span className="text-pulse mt-1">→</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">THE STACK YOU WOULD RETIRE</p>
        <div className="flex flex-wrap gap-2">
          {icp.replaces.map((r) => (
            <span key={r} className="rule-all px-3 py-2 rounded-[8px] body-s text-ink-2 line-through opacity-80">{r}</span>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[24ch]">Ready to put your practice on one rail?</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark">Join the waitlist</Link>
            <Link href="/for-practitioners" className="btn btn-ghost-on-dark">All categories</Link>
          </div>
          <p className="mono-cap text-paper/60 mt-8">{SITE.location}</p>
        </div>
      </section>
    </PageShell>
  );
}
