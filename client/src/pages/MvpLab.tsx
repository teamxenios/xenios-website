import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";

// The xenios MVP Lab. A gated-feeling launcher for the internal synthetic MVPs. Truthful by design:
// only real, deployed MVPs link out; everything else is clearly labeled in progress or coming soon.
// No data is collected here, no secrets, no admin controls.

type Stage = "Live · Public synthetic" | "In progress" | "Coming soon";
type Status = "live" | "in_progress" | "coming_soon";

interface Mvp {
  name: string;
  slug: string;
  purpose: string;
  body: string;
  stage: Stage;
  status: Status;
  dataMode: string;
  safety: string;
  href: string | null; // external/app link when live
  route: string; // the path on this site
  owner: string;
}

const MVPS: Mvp[] = [
  {
    name: "Kairos",
    slug: "kairos",
    purpose: "Weekly check-in console for coaches.",
    body:
      "Assembles each client's week, runs a deterministic safety pass first, and drafts a source-grounded check-in in the coach's voice. The coach approves, edits, or rejects. Nothing is sent by the system.",
    stage: "Live · Public synthetic",
    status: "live",
    dataMode: "Synthetic only",
    safety: "Coach-side · no sends · sensitive topics route to the coach",
    href: "/kairos",
    route: "/kairos",
    owner: "xenios",
  },
  {
    name: "Argos",
    slug: "argos",
    purpose: "Client Attention Queue for coaches and trainers.",
    body:
      "Shows who needs attention today, why they were flagged, what source supports it, and what follow-up is ready for review. The wedge: never miss who needs attention.",
    stage: "In progress",
    status: "in_progress",
    dataMode: "Synthetic only",
    safety: "Coach-side · no sends · sensitive topics route to the coach",
    href: null,
    route: "/argos",
    owner: "xenios",
  },
];

const STAGE_LADDER = [
  "Stage 0 Local synthetic",
  "Stage 1 Public synthetic",
  "Stage 2 Coach sandbox",
  "Stage 3 Controlled pilot",
  "Stage 4 Limited beta",
  "Stage 5 Production",
];

export default function MvpLab() {
  return (
    <PageShell>
      <SeoHead
        title="xenios MVP Lab"
        description="Functional synthetic demos for testing the xenios product system. Synthetic data only."
        path="/mvps"
      />

      {/* hero */}
      <section className="container-x pt-24 md:pt-36 pb-10">
        <p className="mono-cap text-ink-mute mb-6">MVP LAB</p>
        <h1 className="display-xl text-balance max-w-[16ch]">xenios MVP Lab.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          Functional synthetic demos for testing the xenios product system. Pick an MVP, run the loop,
          and see how the professional stays in front while the AI drafts.
        </p>
        <div
          className="mt-8 rounded-lg border px-4 py-3 body-m"
          style={{ borderColor: "var(--rule)", background: "var(--paper-2)", color: "var(--ink-2)" }}
        >
          <span className="mono-cap" style={{ color: "var(--error)" }}>Synthetic only</span>
          <span className="ml-2">
            These MVPs use synthetic data only. Do not enter real client, patient, payment, or private
            information.
          </span>
        </div>
      </section>

      {/* MVP cards */}
      <section className="container-x pb-16">
        <div className="grid gap-5 md:grid-cols-2">
          {MVPS.map((m) => (
            <MvpCard key={m.slug} mvp={m} />
          ))}
        </div>
      </section>

      {/* stage legend */}
      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-6">STAGE LADDER</p>
        <div className="flex flex-wrap gap-2">
          {STAGE_LADDER.map((s, i) => (
            <span
              key={s}
              className="chip"
              style={i === 1 ? { borderColor: "var(--pulse)", color: "var(--pulse)" } : undefined}
            >
              {s}
            </span>
          ))}
        </div>
        <p className="mt-6 body-m text-ink-mute max-w-[64ch]">
          Synthetic versions are public and clearly labeled. Coach sandbox, controlled pilot, and beta
          are gated and only open after the legal, clinical, and privacy reviews clear.
        </p>
      </section>

      {/* safety posture */}
      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-6">SAFETY POSTURE</p>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { h: "Synthetic only", b: "No real client, patient, payment, or private data in any synthetic route. A gate refuses real clients until sign-off." },
            { h: "No external send", b: "The system never sends. Drafts are prepared for coach review and delivery is manual and logged." },
            { h: "Human in command", b: "Sensitive topics route to the coach with no draft. The coach approves, edits, or rejects every message." },
          ].map((c) => (
            <div key={c.h} className="card" style={{ padding: "var(--space-card-y)" }}>
              <p className="display-s">{c.h}</p>
              <p className="mt-2 body-m text-ink-2">{c.b}</p>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

function MvpCard({ mvp }: { mvp: Mvp }) {
  const live = mvp.status === "live";
  return (
    <div className="card flex flex-col" style={{ padding: "var(--space-card-y)" }}>
      <div className="flex items-center justify-between">
        <h2 className="display-m">{mvp.name}</h2>
        <span
          className="chip"
          style={
            live
              ? { borderColor: "var(--teal)", color: "var(--teal)" }
              : { borderColor: "var(--rule)", color: "var(--ink-mute)" }
          }
        >
          {mvp.stage}
        </span>
      </div>
      <p className="mt-2 body-l text-ink">{mvp.purpose}</p>
      <p className="mt-2 body-m text-ink-2 flex-1">{mvp.body}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="chip">{mvp.dataMode}</span>
        <span className="chip">No sends</span>
        <span className="chip">Coach-side</span>
      </div>
      <p className="mt-3 body-m text-ink-mute">{mvp.safety}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        {live && mvp.href ? (
          <>
            <a href={mvp.href} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Open {mvp.name}
            </a>
            <Link href={mvp.route} className="btn btn-ghost">
              Details
            </Link>
          </>
        ) : (
          <button className="btn btn-secondary" disabled aria-disabled>
            {mvp.stage === "In progress" ? "In progress" : "Coming soon"}
          </button>
        )}
      </div>
    </div>
  );
}
