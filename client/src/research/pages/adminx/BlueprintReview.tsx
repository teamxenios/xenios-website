import { useCallback, useEffect, useState } from "react";
import type { AdminQueuePage, RecommendationItem } from "@shared/research/member-platform";
import {
  getBlueprintReview,
  listBlueprintReview,
  reviewBlueprint,
} from "../../adapters/adminOps";
import { failureText } from "../../lib/denials";
import {
  ResearchEmptyState,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { useAdminResource } from "./auth";

type PlanBrief = {
  blueprintId: string;
  memberFirstName: string;
  version: number;
  state: string;
  primaryGoal: string;
  secondaryGoals: string[];
  priorities: string[];
  recommendations: RecommendationItem[];
  clarificationQuestions: string[];
  unansweredImportantFields: string[];
  safetyFlags: string[];
  biomarkerSummary: {
    state: string;
    stateLabel: string;
    followUpNeeded: boolean;
    updatedAt: string;
  } | null;
  createdAt: string;
};

type DetailState =
  | { phase: "idle" | "loading" }
  | { phase: "ok"; brief: PlanBrief }
  | { phase: "error"; message: string };

export default function BlueprintReview() {
  return (
    <AdminScreen
      title="Plan review"
      lead="Minimum-necessary plan briefs waiting for human review. Raw assessment answers never appear here."
    >
      {(token) => <BlueprintReviewBody token={token} />}
    </AdminScreen>
  );
}

function BlueprintReviewBody({ token }: { token: string }) {
  const resource = useAdminResource<{ ok: boolean; page: AdminQueuePage }>(
    token,
    listBlueprintReview,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ phase: "idle" });
  const [memberMessage, setMemberMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadDetail = useCallback(async (id: string) => {
    setDetail({ phase: "loading" });
    const result = await getBlueprintReview<{ ok: boolean; planBrief: PlanBrief }>(token, id);
    if (result.kind === "ok") {
      setDetail({ phase: "ok", brief: result.data.planBrief });
    } else {
      setDetail({
        phase: "error",
        message: failureText(result, "The plan brief could not be loaded."),
      });
    }
  }, [token]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  async function act(
    body:
      | { action: "approve_and_publish"; comment?: string }
      | { action: "request_information"; memberVisibleMessage: string; internalNote?: string }
      | { action: "revise"; internalNote: string },
  ) {
    if (!selectedId) return;
    setActionBusy(true);
    setActionMessage(null);
    const result = await reviewBlueprint<{ ok: boolean; state: string }>(token, selectedId, body);
    setActionBusy(false);
    if (result.kind !== "ok") {
      setActionMessage(failureText(result, "The review action could not be completed."));
      return;
    }
    setActionMessage(`Saved. Current state: ${result.data.state.replace(/_/g, " ")}.`);
    setMemberMessage("");
    setInternalNote("");
    await loadDetail(selectedId);
    resource.reload();
  }

  const items = resource.data?.page.items ?? [];
  const brief = detail.phase === "ok" ? detail.brief : null;
  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="Plan review is not available."
      unavailableBody="The review queue will open after the assessment migration and authorization checks are complete."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.5fr)]">
        <section aria-labelledby="plan-review-queue">
          <h2 id="plan-review-queue" className="body-l font-700">Review queue</h2>
          {items.length === 0 ? (
            <div className="mt-4">
              <ResearchEmptyState
                title="No plan briefs are waiting."
                body="Submitted assessments appear here after the private plan brief is prepared."
              />
            </div>
          ) : (
            <ol className="grid gap-3 mt-4">
              {items.map((item) => (
                <li key={item.itemId}>
                  <button
                    type="button"
                    className="card w-full text-left"
                    aria-pressed={selectedId === item.itemId}
                    onClick={() => setSelectedId(item.itemId)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="body-s font-700">{item.safeSummary}</span>
                      <ResearchStatusBadge
                        label={item.priority}
                        tone={item.priority === "critical" ? "danger" : item.priority === "high" ? "pending" : "neutral"}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="plan-review-detail">
          <h2 id="plan-review-detail" className="body-l font-700">Plan brief</h2>
          {detail.phase === "idle" ? (
            <div className="mt-4">
              <ResearchEmptyState
                title="Choose a plan brief."
                body="Only the assigned reviewer can open its minimum-necessary detail."
              />
            </div>
          ) : detail.phase === "loading" ? (
            <p role="status" className="body-s text-ink-mute mt-4">Loading plan brief...</p>
          ) : detail.phase === "error" ? (
            <div className="card mt-4">
              <p role="alert" className="body-s">{detail.message}</p>
              {selectedId && (
                <button type="button" className="btn btn-secondary mt-4" onClick={() => void loadDetail(selectedId)}>
                  Try again
                </button>
              )}
            </div>
          ) : brief ? (
            <div className="grid gap-5 mt-4">
              <div className="card">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="mono-cap text-pulse">Version {brief.version}</p>
                    <p className="body-l font-700 mt-2">{brief.memberFirstName}</p>
                    <p className="body-s text-ink-2 mt-1">Primary goal: {brief.primaryGoal || "Not stated"}</p>
                  </div>
                  <ResearchStatusBadge label={brief.state.replace(/_/g, " ")} tone="pending" />
                </div>
              </div>

              <ResearchSecureNotice>
                Review this structured brief, not raw answers. Safety flags require human judgment and never
                authorize diagnosis, dosing, or treatment.
              </ResearchSecureNotice>

              {brief.biomarkerSummary && (
                <div className="card">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="body-m font-700">Biomarker follow-up context</h3>
                      <p className="body-s text-ink-2 mt-2">
                        {brief.biomarkerSummary.stateLabel}. Updated{" "}
                        {new Date(brief.biomarkerSummary.updatedAt).toLocaleDateString()}.
                      </p>
                    </div>
                    <ResearchStatusBadge
                      label={
                        brief.biomarkerSummary.followUpNeeded
                          ? "follow-up needed"
                          : brief.biomarkerSummary.state.replaceAll("_", " ")
                      }
                      tone={
                        brief.biomarkerSummary.followUpNeeded
                          ? "pending"
                          : "neutral"
                      }
                    />
                  </div>
                  <p className="body-s text-ink-mute mt-3">
                    This minimum-necessary status excludes reports, results,
                    Storage references, partner records, and consent data.
                  </p>
                </div>
              )}

              <div className="card">
                <h3 className="body-m font-700">Draft recommendations</h3>
                {brief.recommendations.length === 0 ? (
                  <p className="body-s text-ink-mute mt-3">No draft recommendations were generated.</p>
                ) : (
                  <ul className="grid gap-4 mt-4">
                    {brief.recommendations.map((item) => (
                      <li key={item.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="body-s font-700">{item.title}</p>
                          <ResearchStatusBadge label={item.disposition.replace(/_/g, " ")} tone="neutral" />
                        </div>
                        <p className="body-s text-ink-2 mt-2">{item.explanation}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(brief.safetyFlags.length > 0 || brief.unansweredImportantFields.length > 0) && (
                <div className="card">
                  <h3 className="body-m font-700">Items requiring attention</h3>
                  <ul className="body-s text-ink-2 mt-3 grid gap-2">
                    {brief.safetyFlags.map((flag) => <li key={flag}>Safety flag: {flag.replace(/_/g, " ")}</li>)}
                    {brief.unansweredImportantFields.map((field) => (
                      <li key={field}>Unanswered: {field.replace(/_/g, " ")}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="card">
                <label htmlFor="plan-member-message" className="form-label">
                  Message to the member
                </label>
                <textarea
                  id="plan-member-message"
                  className="input-field w-full mt-2"
                  rows={3}
                  value={memberMessage}
                  onChange={(event) => setMemberMessage(event.currentTarget.value)}
                />
                <label htmlFor="plan-internal-note" className="form-label mt-4">
                  Internal review note
                </label>
                <textarea
                  id="plan-internal-note"
                  className="input-field w-full mt-2"
                  rows={3}
                  value={internalNote}
                  onChange={(event) => setInternalNote(event.currentTarget.value)}
                />
                {actionMessage && <p role="status" className="body-s text-ink-2 mt-4">{actionMessage}</p>}
                <div className="flex gap-3 flex-wrap mt-5">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={actionBusy}
                    onClick={() => void act({ action: "approve_and_publish", ...(internalNote.trim() ? { comment: internalNote.trim() } : {}) })}
                  >
                    {actionBusy ? "Saving..." : "Approve and create plan drafts"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={actionBusy || memberMessage.trim().length === 0}
                    onClick={() => void act({
                      action: "request_information",
                      memberVisibleMessage: memberMessage.trim(),
                      ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
                    })}
                  >
                    Request information
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={actionBusy || internalNote.trim().length === 0}
                    onClick={() => void act({ action: "revise", internalNote: internalNote.trim() })}
                  >
                    Return for revision
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AdminBoundary>
  );
}
