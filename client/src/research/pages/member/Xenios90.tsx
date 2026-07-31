import { useCallback, useEffect, useState } from "react";
import type { Xenios90Plan } from "@shared/research/member-platform";
import { XENIOS_90_PHASES } from "@shared/research/member-platform";
import { useResearch } from "../../core";
import { getXenios90Plan, type Xenios90Response } from "../../adapters/member";
import type { ApiResult } from "../../lib/api";
import { ResearchEmptyState, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import { ResearchMemberShell } from "../../ui/shells";

function planValid(plan: Xenios90Plan): boolean {
  return !!plan
    && typeof plan.planId === "string"
    && plan.state === "published"
    && Number.isInteger(plan.version)
    && plan.version > 0
    && XENIOS_90_PHASES.includes(plan.currentPhase)
    && XENIOS_90_PHASES.every((phase) => Array.isArray(plan.phaseGoals?.[phase])
      && plan.phaseGoals[phase].every((goal) => typeof goal === "string"))
    && Array.isArray(plan.milestones)
    && plan.milestones.every((item) => typeof item.id === "string"
      && typeof item.label === "string"
      && [1, 2, 3].includes(item.targetMonth)
      && typeof item.done === "boolean")
    && Array.isArray(plan.monthlyVersions);
}

function responseValid(value: Xenios90Response): boolean {
  return value?.ok === true
    && (value.plan === null || planValid(value.plan))
    && !!value.review
    && ["not_due", "due", "submitted", "reviewed", "published"].includes(value.review.checkInStatus)
    && typeof value.review.earlyChangeUsedThisMonth === "boolean";
}

export default function Xenios90() {
  const { memberToken } = useResearch();
  const [result, setResult] = useState<ApiResult<Xenios90Response> | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    setResult(await getXenios90Plan(memberToken));
  }, [memberToken]);

  useEffect(() => {
    let current = true;
    setResult(null);
    void getXenios90Plan(memberToken).then((next) => { if (current) setResult(next); });
    return () => { current = false; };
  }, [memberToken]);

  const invalid = result?.kind === "ok" && !responseValid(result.data);
  const state = result === null ? "loading"
    : result.kind === "unauthorized" ? "unauthorized"
      : result.kind === "unavailable" || result.kind === "forbidden" || result.kind === "denied" ? "unavailable"
        : result.kind === "error" || invalid ? "error"
          : "ok";
  const body = result?.kind === "ok" && !invalid ? result.data : null;

  return (
    <ResearchMemberShell title="Xenios 90" lead="Your published ninety-day arc and monthly review status.">
      <ResearchRouteBoundary
        state={state}
        errorMessage={invalid ? "The Xenios 90 response was incomplete." : result?.kind === "error" ? result.message : undefined}
        unavailableTitle="Xenios 90 is unavailable."
        unavailableBody="No plan has been inferred or filled in."
        onRetry={() => void load()}
      >
        {body?.plan === null && <ResearchEmptyState title="No published Xenios 90 plan." body="Your review team has not published a plan yet." />}
        {body?.plan && (
          <div className="grid gap-5">
            <section className="card">
              <div className="flex flex-wrap gap-3 items-center">
                <h2 className="body-m font-700">Current phase</h2>
                <ResearchStatusBadge label={body.plan.currentPhase} tone="success" />
                <ResearchStatusBadge label={`Version ${body.plan.version}`} tone="neutral" />
              </div>
            </section>
            {XENIOS_90_PHASES.map((phase) => (
              <section className="card" key={phase} aria-labelledby={`phase-${phase}`}>
                <h2 id={`phase-${phase}`} className="body-m font-700">{phase}</h2>
                {body.plan!.phaseGoals[phase].length ? (
                  <ul className="mt-3 grid gap-2">{body.plan!.phaseGoals[phase].map((goal) => <li key={goal}>{goal}</li>)}</ul>
                ) : <p className="body-s text-ink-2 mt-3">No published goals for this phase.</p>}
              </section>
            ))}
            <section className="card" aria-labelledby="x90-milestones">
              <h2 id="x90-milestones" className="body-m font-700">Milestones</h2>
              {body.plan.milestones.length ? (
                <ul className="mt-3 grid gap-2">
                  {body.plan.milestones.map((item) => <li key={item.id}>Month {item.targetMonth}: {item.label} — {item.done ? "Complete" : "Open"}</li>)}
                </ul>
              ) : <p className="body-s text-ink-2 mt-3">No milestones are published.</p>}
            </section>
            <p className="body-s text-ink-2" role="status">Monthly review: {body.review.checkInStatus.replaceAll("_", " ")}</p>
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
