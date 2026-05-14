import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, NETWORK_BLOCKS } from "@/lib/content";

export default function Network() {
  return (
    <PageShell>
      <SeoHead title={PAGES.network.title} description={PAGES.network.description} canonical="/network" />
      <section className="grad grad-03-fieldwork section-y" data-testid="section-network-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">PRACTITIONER NETWORK</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "22ch" }}>
            The proactive health team that finally talks to itself.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            Agent-to-agent referrals across coaches, clinicians, labs, and recovery operators. Scope-aware handoffs. Revenue routing.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-network-blocks">
        <div className="container-x space-y-6">
          {NETWORK_BLOCKS.map((b, i) => (
            <article key={i} className="card">
              <p className="mono-cap text-pulse">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="h1 mt-3 text-ink">{b.title}</h2>
              <p className="body-l mt-5 text-ink-2 max-w-4xl">{b.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grad grad-06-horizon section-y">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">Refer in context. Get paid in context.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark mt-8 inline-flex">join the waitlist →</Link>
        </div>
      </section>
    </PageShell>
  );
}
