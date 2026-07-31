import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import type {
  TrackerMetricKey,
  TrackerObservationInput,
  TrackerProgressView,
} from "@shared/research/member-platform";
import { useResearch } from "../../core";
import {
  getTrackerProgress,
  recordTrackerObservation,
  type TrackerWindowDays,
} from "../../adapters/tracker";
import { failureText } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchErrorState,
  ResearchLoadingState,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";

const WINDOWS: readonly TrackerWindowDays[] = [7, 30, 90];

const SUBMITTABLE_METRICS: ReadonlyArray<{
  key: Exclude<TrackerMetricKey, "data_completeness">;
  label: string;
  example: string;
}> = [
  {
    key: "plan_adherence",
    label: "Plan adherence",
    example: "For example: 80 or followed 4 of 5 planned sessions",
  },
  {
    key: "body_and_appearance",
    label: "Body and appearance",
    example: "For example: 175.5 or clothing fit felt consistent",
  },
  {
    key: "sleep_and_recovery",
    label: "Sleep and recovery",
    example: "For example: 7.5 or 4/5",
  },
  {
    key: "energy_stress_vitality",
    label: "Energy, stress and vitality",
    example: "For example: 8/10 or steady through the afternoon",
  },
  {
    key: "performance_and_function",
    label: "Performance and function",
    example: "For example: 225 or completed the planned session",
  },
];

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; progress: TrackerProgressView }
  | { kind: "denied"; code: string; message?: string }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

type EntryDraft = {
  metricKey: Exclude<TrackerMetricKey, "data_completeness">;
  value: string;
  unit: string;
  notes: string;
};

const EMPTY_DRAFT: EntryDraft = {
  metricKey: "sleep_and_recovery",
  value: "",
  unit: "",
  notes: "",
};

function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function Tracker() {
  const { memberToken } = useResearch();
  const [windowDays, setWindowDays] = useState<TrackerWindowDays>(30);
  const [loadState, setLoadState] = useState<LoadState>({
    kind: "loading",
  });
  const [draft, setDraft] = useState<EntryDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoadState({ kind: "loading" });
    const result = await getTrackerProgress(windowDays, memberToken);
    if (result.kind === "ok") {
      setLoadState({ kind: "ready", progress: result.data.progress });
      return;
    }
    if (result.kind === "denied") {
      setLoadState({
        kind: "denied",
        code: result.code,
        message: result.message,
      });
      return;
    }
    if (result.kind === "unauthorized") {
      setLoadState({
        kind: "denied",
        code: result.code ?? "membership_inactive",
      });
      return;
    }
    if (result.kind === "unavailable") {
      setLoadState({ kind: "unavailable" });
      return;
    }
    setLoadState({
      kind: "error",
      message: failureText(result, "The tracker could not be loaded."),
    });
  }, [memberToken, windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedMetric = useMemo(
    () => SUBMITTABLE_METRICS.find((metric) => metric.key === draft.metricKey)!,
    [draft.metricKey],
  );

  const submit = async () => {
    const value = draft.value.trim();
    if (!value) {
      setFeedback({ tone: "error", text: "Enter a value before saving." });
      return;
    }

    const numericValue = Number(value);
    const input: TrackerObservationInput = {
      metricKey: draft.metricKey,
      recordedAt: new Date().toISOString(),
      timezone: localTimezone(),
      value:
        value !== "" && Number.isFinite(numericValue)
          ? numericValue
          : value,
      ...(draft.unit.trim() ? { unit: draft.unit.trim() } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };

    setSaving(true);
    setFeedback(null);
    const result = await recordTrackerObservation(input, memberToken);
    setSaving(false);

    if (result.kind === "ok") {
      setDraft(EMPTY_DRAFT);
      setFeedback({
        tone: "success",
        text: "Entry saved to your private tracker.",
      });
      await load();
      return;
    }
    if (result.kind === "denied" || result.kind === "unauthorized") {
      setFeedback({
        tone: "error",
        text:
          result.kind === "denied"
            ? failureText(result, "This entry is not available in your current membership state.")
            : "Your session is no longer active. Sign in again before saving.",
      });
      return;
    }
    if (result.kind === "unavailable") {
      setFeedback({
        tone: "error",
        text: "Tracker saving is temporarily unavailable. Nothing was saved on this device.",
      });
      return;
    }
    setFeedback({
      tone: "error",
      text: failureText(result, "The entry could not be saved."),
    });
  };

  return (
    <ResearchMemberShell
      title="Tracker"
      lead="Your private observations, shown by domain and explained in plain language. Xenios does not combine them into an overall health score."
    >
      <div className="grid gap-6">
        <section className="card" aria-labelledby="tracker-window-title">
          <p id="tracker-window-title" className="mono-label text-ink-mute">
            Reporting window
          </p>
          <div className="mt-3 flex gap-2" style={{ flexWrap: "wrap" }}>
            {WINDOWS.map((days) => (
              <button
                key={days}
                type="button"
                className={days === windowDays ? "btn btn-primary" : "btn btn-secondary"}
                aria-pressed={days === windowDays}
                onClick={() => setWindowDays(days)}
              >
                {days} days
              </button>
            ))}
          </div>
        </section>

        {loadState.kind === "loading" && (
          <ResearchLoadingState label="Loading your tracker" />
        )}
        {loadState.kind === "error" && (
          <ResearchErrorState message={loadState.message} onRetry={() => void load()} />
        )}
        {loadState.kind === "unavailable" && (
          <ResearchErrorState
            message="The tracker is temporarily unavailable. Please try again."
            onRetry={() => void load()}
          />
        )}
        {loadState.kind === "denied" && (
          <ResearchDenialNotice
            code={loadState.code}
            message={loadState.message}
          />
        )}
        {loadState.kind === "ready" && !loadState.progress.unlocked && (
          <ResearchEmptyState
            title="The tracker opens after your assessment is submitted."
            body="No tracker entry can be recorded before that step is complete."
            action={
              <Link href={MEMBER_ROUTES.assessment} className="btn btn-primary">
                Open assessment
              </Link>
            }
          />
        )}
        {loadState.kind === "ready" && loadState.progress.unlocked && (
          <>
            <TrackerProgress progress={loadState.progress} />
            <TrackerEntryForm
              draft={draft}
              selectedMetric={selectedMetric}
              saving={saving}
              feedback={feedback}
              onDraftChange={setDraft}
              onSubmit={() => void submit()}
            />
          </>
        )}

        <ResearchSecureNotice>
          Tracker entries are sent only to the authenticated member endpoint.
          This page does not keep drafts in browser storage and does not offer
          unpublished export or deletion actions.
        </ResearchSecureNotice>
      </div>
    </ResearchMemberShell>
  );
}

function TrackerProgress({ progress }: { progress: TrackerProgressView }) {
  if (progress.metrics.length === 0) {
    return (
      <ResearchEmptyState
        title={`No entries in the last ${progress.windowDays} days.`}
        body="Add an observation below when you have something useful to record."
      />
    );
  }

  return (
    <section aria-labelledby="tracker-progress-title">
      <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap" }}>
        <h2 id="tracker-progress-title" className="heading-m">
          Your recent observations
        </h2>
        <ResearchStatusBadge
          label={`${progress.windowDays}-day view`}
          tone="info"
        />
      </div>
      <div className="mt-4 grid gap-4">
        {progress.metrics.map((metric) => (
          <article key={metric.metricKey} className="card">
            <p className="mono-label text-ink-mute">
              {metricLabel(metric.metricKey)}
            </p>
            <p className="body-s text-ink-2 mt-2">{metric.textSummary}</p>
            {metric.observations.length > 0 && (
              <ul className="mt-4 grid gap-3">
                {metric.observations.map((observation) => (
                  <li
                    key={observation.observationId}
                    className="border-t border-line pt-3"
                  >
                    <p className="body-m font-700">
                      {String(observation.originalValue)}
                      {observation.unit ? ` ${observation.unit}` : ""}
                    </p>
                    <p className="body-s text-ink-mute mt-1">
                      {new Date(observation.recordedAt).toLocaleString()}
                    </p>
                    {observation.notes && (
                      <p className="body-s text-ink-2 mt-2">{observation.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function TrackerEntryForm({
  draft,
  selectedMetric,
  saving,
  feedback,
  onDraftChange,
  onSubmit,
}: {
  draft: EntryDraft;
  selectedMetric: (typeof SUBMITTABLE_METRICS)[number];
  saving: boolean;
  feedback: { tone: "success" | "error"; text: string } | null;
  onDraftChange: (draft: EntryDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="card"
      aria-label="Add tracker observation"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="mono-label text-ink-mute">Add an observation</p>
      <div className="mt-5 grid gap-5">
        <div>
          <label className="form-label" htmlFor="tracker-metric">
            Area
          </label>
          <select
            id="tracker-metric"
            className="input-field"
            value={draft.metricKey}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                metricKey: event.target.value as EntryDraft["metricKey"],
              })
            }
          >
            {SUBMITTABLE_METRICS.map((metric) => (
              <option key={metric.key} value={metric.key}>
                {metric.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="tracker-value">
            Value or short description
          </label>
          <input
            id="tracker-value"
            className="input-field"
            value={draft.value}
            onChange={(event) =>
              onDraftChange({ ...draft, value: event.target.value })
            }
            placeholder={selectedMetric.example}
            required
          />
        </div>
        <div>
          <label className="form-label" htmlFor="tracker-unit">
            Unit <span className="text-ink-mute">(optional)</span>
          </label>
          <input
            id="tracker-unit"
            className="input-field"
            value={draft.unit}
            onChange={(event) =>
              onDraftChange({ ...draft, unit: event.target.value })
            }
            placeholder="hours, lb, sessions"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="tracker-notes">
            Notes <span className="text-ink-mute">(optional)</span>
          </label>
          <textarea
            id="tracker-notes"
            className="input-field"
            rows={4}
            value={draft.notes}
            onChange={(event) =>
              onDraftChange({ ...draft, notes: event.target.value })
            }
          />
        </div>
      </div>

      {feedback && (
        <p
          className={`body-s mt-4 ${feedback.tone === "success" ? "text-ink-2" : ""}`}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.text}
        </p>
      )}

      <button type="submit" className="btn btn-primary mt-6" disabled={saving}>
        {saving ? "Saving..." : "Save observation"}
      </button>
    </form>
  );
}

function metricLabel(metricKey: TrackerMetricKey): string {
  return (
    SUBMITTABLE_METRICS.find((metric) => metric.key === metricKey)?.label ??
    "Data completeness"
  );
}
