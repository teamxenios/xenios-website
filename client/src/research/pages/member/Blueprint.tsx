import { useCallback, useEffect, useState } from "react";
import type { BlueprintState, BlueprintView, RecommendationItem } from "@shared/research/member-platform";
import { BLUEPRINT_STATES } from "@shared/research/member-platform";
import { useResearch } from "../../core";
import { getBlueprint, type BlueprintResponse } from "../../adapters/member";
import type { ApiResult } from "../../lib/api";
import { ResearchEmptyState, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import { ResearchMemberShell } from "../../ui/shells";

const STATES = new Set<BlueprintState>(BLUEPRINT_STATES);
const VISIBLE_STATES = new Set<BlueprintState>(["published", "updated"]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function recommendationValid(value: unknown): value is RecommendationItem {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<RecommendationItem>;
  return typeof row.id === "string"
    && typeof row.title === "string"
    && typeof row.explanation === "string"
    && isStringArray(row.sourceSignals);
}

function blueprintValid(value: BlueprintView): boolean {
  return !!value
    && typeof value.blueprintId === "string"
    && STATES.has(value.state)
    && Number.isInteger(value.version)
    && value.version > 0
    && typeof value.primaryGoal === "string"
    && isStringArray(value.secondaryGoals)
    && isStringArray(value.topPriorities)
    && Array.isArray(value.recommendations)
    && value.recommendations.every(recommendationValid)
    && isStringArray(value.questionsForReview)
    && (value.unansweredImportantFields === undefined || isStringArray(value.unansweredImportantFields))
    && (value.safetyFlags === undefined || isStringArray(value.safetyFlags));
}

function responseValid(value: BlueprintResponse): boolean {
  if (value?.ok !== true || !STATES.has(value.state)) return false;
  if (value.blueprint === null) return !VISIBLE_STATES.has(value.state);
  return VISIBLE_STATES.has(value.state)
    && value.blueprint.state === value.state
    && blueprintValid(value.blueprint);
}

export default function Blueprint() {
  const { memberToken } = useResearch();
  const [result, setResult] = useState<ApiResult<BlueprintResponse> | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    setResult(await getBlueprint(memberToken));
  }, [memberToken]);

  useEffect(() => {
    let current = true;
    setResult(null);
    void getBlueprint(memberToken).then((next) => { if (current) setResult(next); });
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
    <ResearchMemberShell title="Blueprint" lead="Your reviewed goals, priorities and recommendations.">
      <ResearchRouteBoundary
        state={state}
        errorMessage={invalid ? "The Blueprint response was incomplete." : result?.kind === "error" ? result.message : undefined}
        unavailableTitle="Your Blueprint is unavailable."
        unavailableBody="No Blueprint details have been inferred or filled in."
        onRetry={() => void load()}
      >
        {body?.blueprint === null && (
          <ResearchEmptyState
            title={body.state.replaceAll("_", " ")}
            body={body.memberVisibleMessage ?? "Your Blueprint is not published yet."}
          />
        )}
        {body?.blueprint && (
          <div className="grid gap-5">
            <section className="card" aria-labelledby="blueprint-goal">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="blueprint-goal" className="body-m font-700">Primary goal</h2>
                <ResearchStatusBadge label={`Version ${body.blueprint.version}`} tone="success" />
              </div>
              <p className="body-m text-ink-2 mt-3">{body.blueprint.primaryGoal}</p>
            </section>
            <section className="card" aria-labelledby="blueprint-priorities">
              <h2 id="blueprint-priorities" className="body-m font-700">Top priorities</h2>
              <ul className="mt-3 grid gap-2">{body.blueprint.topPriorities.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section className="card" aria-labelledby="blueprint-recommendations">
              <h2 id="blueprint-recommendations" className="body-m font-700">Recommendations</h2>
              {body.blueprint.recommendations.length === 0 ? (
                <p className="body-s text-ink-2 mt-3">No recommendations are published.</p>
              ) : (
                <ul className="mt-3 grid gap-4">
                  {body.blueprint.recommendations.map((item) => (
                    <li key={item.id}>
                      <p className="font-700">{item.title}</p>
                      <p className="body-s text-ink-2">{item.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
