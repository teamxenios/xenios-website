import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, AGENTS, CONDUCTOR, AGENT_PRINCIPLES } from "@/lib/content";

const GRADS = ["grad-01-dawn","grad-02-tide","grad-03-fieldwork","grad-05-meadow"];

export default function Agents() {
  return (
    <PageShell>
      <SeoHead title={PAGES.agents.title} description={PAGES.agents.description} canonical="/agents" />
      <section className="grad grad-04-meridian section-y" data-testid="section-agents-hero">
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-6">AGENTS</p>
          <h1 className="display-xl text-paper text-balance" style={{ maxWidth: "22ch" }}>
            Eight agents and a Conductor — the first AI workforce for proactive care.
          </h1>
          <p className="body-l mt-8 text-paper/90 max-w-3xl">
            Each agent is specialized. Each agent is voice-aware. The Conductor orchestrates them as one mind, under the practitioner's judgment.
          </p>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y" data-testid="section-conductor">
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-4">00 — THE CONDUCTOR</p>
          <h2 className="display-l text-paper">{CONDUCTOR.name}</h2>
          <p className="body-l mt-6 text-paper/90 max-w-3xl">{CONDUCTOR.body}</p>
          <ul className="mt-8 space-y-2">
            {CONDUCTOR.scope.map((s, i) => (
              <li key={i} className="body-m text-paper/85">— {s}</li>
            ))}
          </ul>
          <p className="body-m mt-8 text-pulse" style={{ fontWeight: 600 }}>NEVER · {CONDUCTOR.never}</p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-agents-list">
        <div className="container-x space-y-6">
          {AGENTS.map((a, i) => (
            <article key={a.name} className={`grad ${GRADS[i % GRADS.length]} card`} data-testid={`agent-${i}`}>
              <p className="mono-cap text-ink-mute">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="h1 mt-3 text-ink">{a.name}</h2>
              <p className="body-m mt-2 mono-cap text-ink-mute">{a.short}</p>
              <p className="body-l mt-5 text-ink-2 max-w-4xl">{a.body}</p>
              <ul className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2">
                {a.scope.map((s, j) => <li key={j} className="body-m text-ink-2">— {s}</li>)}
              </ul>
              <p className="body-m mt-6 text-pulse" style={{ fontWeight: 600 }}>NEVER · {a.never}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grad grad-03-fieldwork section-y" data-testid="section-principles">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">FIVE PRINCIPLES</p>
          <h2 className="display-m text-ink text-balance max-w-4xl">How every agent is built.</h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENT_PRINCIPLES.map((p, i) => (
              <div key={i} className="card">
                <p className="mono-cap text-ink-mute">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="h3 mt-3 text-ink">{p.title}</h3>
                <p className="body-m mt-3 text-ink-2">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y" data-testid="section-agents-cta">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">Be on the list when the agents ship.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark mt-8 inline-flex">join the waitlist →</Link>
        </div>
      </section>
    </PageShell>
  );
}
