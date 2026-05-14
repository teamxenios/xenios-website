import { useRoute, Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import NotFound from "./not-found";
import { ICP_LIST, ICP_DETAILS, FRAGMENTED_STACK } from "@/lib/content";

export default function IcpPage() {
  const [, params] = useRoute("/for/:slug");
  const slug = params?.slug ?? "";
  const meta = ICP_LIST.find((i) => i.slug === slug);
  const detail = ICP_DETAILS[slug];
  if (!meta || !detail) return <NotFound />;

  const title = `For ${meta.label} — xenios`;
  const description = detail.display;

  return (
    <PageShell>
      <SeoHead title={title} description={description} canonical={`/for/${meta.slug}`} />

      <section className="grad grad-01-dawn section-y" data-testid="section-icp-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">FOR {meta.label.toUpperCase()}</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "26ch" }}>{detail.display}</h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">{meta.oneliner}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/waitlist" className="btn btn-primary">join the waitlist →</Link>
            <Link href="/product" className="btn btn-ghost">see the platform</Link>
          </div>
        </div>
      </section>

      <section className="bg-paper section-y rule-bottom" data-testid="section-icp-stack">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">YOUR STACK TODAY</p>
          <div className="flex flex-wrap gap-2">
            {detail.stack.map((s) => (
              <span key={s} className="chip" style={{ opacity: 0.7 }}>{s}</span>
            ))}
            {detail.stack.length < 5 && FRAGMENTED_STACK.slice(0, 5 - detail.stack.length).map((s) => (
              <span key={`f-${s}`} className="chip" style={{ opacity: 0.5 }}>{s}</span>
            ))}
          </div>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            xenios collapses every tile above into one operating system in your voice and under your scope.
          </p>
        </div>
      </section>

      <section className="grad grad-03-fieldwork section-y" data-testid="section-icp-ecosystem">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">ECOSYSTEM YOU LIVE IN</p>
          <div className="flex flex-wrap gap-2">
            {detail.ecosystem.map((s) => (
              <span key={s} className="chip" data-testid={`eco-${s.replace(/\s+/g, "-")}`}>{s}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-icp-network">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">YOUR PLACE IN THE NETWORK</p>
          <p className="display-s text-ink max-w-4xl" style={{ fontWeight: 700 }}>{detail.network}</p>
          <Link href="/network" className="btn btn-ghost mt-6 inline-flex">read the network page →</Link>
        </div>
      </section>

      <section className="grad grad-05-meadow section-y" data-testid="section-icp-revenue">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">NEW REVENUE STREAMS</p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
            {detail.revenue.map((r, i) => (
              <li key={i} className="flex items-start gap-3 body-m text-ink-2 bg-paper/60 p-4" style={{ borderRadius: 4 }}>
                <span className="mono-label text-pulse">{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontWeight: 600 }}>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">{`Built for ${meta.label}.`}</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark mt-8 inline-flex">join the waitlist →</Link>
        </div>
      </section>
    </PageShell>
  );
}
