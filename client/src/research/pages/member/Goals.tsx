import { Link } from "wouter";
import { ResearchMemberShell } from "../../ui/shells";
import { MEMBER_ROUTES } from "../../lib/routes";
import { RESEARCH_GOALS, goalHref } from "./goals-data";

// Shop by Goal: the 11 canonical goals as a scannable grid of link cards.
// This surface is editorial navigation copy only (goals-data.ts), so it has
// no server dependency and no loading state to fake. Product data appears
// only on the detail page, and only from the real gated catalog.

export default function Goals() {
  return (
    <ResearchMemberShell
      eyebrow="Shop by Goal"
      title="Start from what you want"
      lead="Pick the goal that matters most right now. Each page lays out the lifestyle foundation first, then how training, food, and supplement categories fit around it. No promises, just an honest map."
    >
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {RESEARCH_GOALS.map((goal) => (
          <li key={goal.slug}>
            <Link
              href={goalHref(goal.slug)}
              className="card block h-full"
              style={{ textDecoration: "none" }}
              aria-label={`${goal.name}: ${goal.plainLanguageGoal}`}
              data-testid={`goal-card-${goal.slug}`}
            >
              <p className="mono-label text-ink-mute">Goal</p>
              <p className="body-l font-700 mt-1">{goal.name}</p>
              <p className="body-s text-ink-2 mt-2">{goal.plainLanguageGoal}</p>
              <p className="mono-cap text-ink-mute mt-4" aria-hidden="true">
                View the map →
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="card mt-8" aria-labelledby="goals-honesty">
        <h2 id="goals-honesty" className="mono-label text-ink-mute">
          How to read these pages
        </h2>
        <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
          Every goal page puts lifestyle, training, and nutrition before any product. Supplement sections name
          categories only, and the products shown come from the live catalog when it is available to your
          membership. xenios does not promise outcomes, and nothing here is medical advice.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={MEMBER_ROUTES.assessment} className="btn btn-secondary">
            Take the assessment
          </Link>
          <Link href={MEMBER_ROUTES.guides} className="btn btn-ghost">
            Browse the Guides
          </Link>
        </div>
      </section>
    </ResearchMemberShell>
  );
}
