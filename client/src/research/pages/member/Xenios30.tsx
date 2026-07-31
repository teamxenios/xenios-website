import { useCallback, useEffect, useState } from "react";
import type {
  RecommendationItem,
  TrackerMetricKey,
  Xenios30Plan,
} from "@shared/research/member-platform";
import { TRACKER_METRIC_KEYS } from "@shared/research/member-platform";
import { useResearch } from "../../core";
import {
  acknowledgeXenios30,
  getXenios30Plan,
  type Xenios30Response,
} from "../../adapters/member";
import type { ApiResult } from "../../lib/api";
import { failureText } from "../../lib/denials";
import {
  ResearchDataTable,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchStatusBadge,
} from "../../ui/kit";
import { ResearchMemberShell } from "../../ui/shells";

type Xenios30History = Xenios30Response["history"][number];

const RECOMMENDATION_DISPOSITIONS = new Set([
  "included",
  "excluded",
  "duplicate_warning",
  "possible_research_pathway",
  "needs_samuel_review",
  "not_available",
]);
const PLAN_KEYS = [
  "planId",
  "monthLabel",
  "state",
  "version",
  "fitnessDocumentId",
  "nutritionDocumentId",
  "blueprintActions",
  "supplementFoundation",
  "productGuidance",
  "adherenceTargets",
  "trackerMetricKeys",
  "checkInDueAt",
  "reviewedBy",
  "publishedAt",
  "memberAcknowledgedAt",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecommendation(value: unknown): value is RecommendationItem {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id",
    "kind",
    "title",
    "disposition",
    "explanation",
    "sourceSignals",
  ])) return false;
  return typeof value.id === "string"
    && value.id.length > 0
    && [
      "lifestyle",
      "fitness_program",
      "nutrition_program",
      "supplement_foundation",
      "product_option",
      "research_pathway",
    ].includes(String(value.kind))
    && typeof value.title === "string"
    && RECOMMENDATION_DISPOSITIONS.has(String(value.disposition))
    && typeof value.explanation === "string"
    && Array.isArray(value.sourceSignals)
    && value.sourceSignals.every((signal) => typeof signal === "string");
}

function isPlan(value: unknown): value is Xenios30Plan {
  if (!isRecord(value) || !hasExactKeys(value, PLAN_KEYS)) return false;
  return typeof value.planId === "string"
    && value.planId.length > 0
    && typeof value.monthLabel === "string"
    && value.monthLabel.length > 0
    && value.state === "published"
    && Number.isInteger(value.version)
    && (value.version as number) > 0
    && isNullableString(value.fitnessDocumentId)
    && isNullableString(value.nutritionDocumentId)
    && Array.isArray(value.blueprintActions)
    && value.blueprintActions.every((action) => typeof action === "string")
    && Array.isArray(value.supplementFoundation)
    && value.supplementFoundation.every(isRecommendation)
    && Array.isArray(value.productGuidance)
    && value.productGuidance.every(isRecommendation)
    && Array.isArray(value.adherenceTargets)
    && value.adherenceTargets.every((target) => isRecord(target)
      && hasExactKeys(target, ["key", "label", "target"])
      && typeof target.key === "string"
      && typeof target.label === "string"
      && typeof target.target === "string")
    && Array.isArray(value.trackerMetricKeys)
    && value.trackerMetricKeys.every((key) => TRACKER_METRIC_KEYS.includes(key as TrackerMetricKey))
    && isNullableString(value.checkInDueAt)
    && isNullableString(value.reviewedBy)
    && isNullableString(value.publishedAt)
    && isNullableString(value.memberAcknowledgedAt);
}

function isHistory(value: unknown): value is Xenios30History {
  return isRecord(value)
    && hasExactKeys(value, ["planId", "monthLabel", "state"])
    && typeof value.planId === "string"
    && value.planId.length > 0
    && typeof value.monthLabel === "string"
    && value.monthLabel.length > 0
    && (value.state === "published" || value.state === "superseded");
}

function isResponse(value: unknown): value is Xenios30Response {
  return isRecord(value)
    && hasExactKeys(value, ["ok", "current", "history"])
    && value.ok === true
    && (value.current === null || isPlan(value.current))
    && Array.isArray(value.history)
    && value.history.every(isHistory);
}

function TextList({ items, empty }: { items: readonly string[]; empty: string }) {
  return items.length ? (
    <ul className="grid gap-2 mt-3">
      {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
    </ul>
  ) : <p className="body-s text-ink-2 mt-3">{empty}</p>;
}

function RecommendationList({ items }: { items: readonly RecommendationItem[] }) {
  return items.length ? (
    <ul className="grid gap-3 mt-3">
      {items.map((item) => (
        <li key={item.id}>
          <span className="font-700">{item.title}</span>
          <span className="body-s text-ink-2"> — {item.explanation}</span>
        </li>
      ))}
    </ul>
  ) : <p className="body-s text-ink-2 mt-3">No recommendations are published in this section.</p>;
}

function AcknowledgeCard({ plan, memberToken }: { plan: Xenios30Plan; memberToken: string | null }) {
  const [acknowledgedAt, setAcknowledgedAt] = useState(plan.memberAcknowledgedAt);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const acknowledge = useCallback(async () => {
    setBusy(true);
    setNote(null);
    const result = await acknowledgeXenios30(plan.planId, memberToken);
    if (
      result.kind === "ok"
      && result.data.ok === true
      && typeof result.data.acknowledgedAt === "string"
      && !Number.isNaN(Date.parse(result.data.acknowledgedAt))
    ) {
      setAcknowledgedAt(result.data.acknowledgedAt);
      setNote("Recorded. Thank you.");
    } else if (result.kind === "unauthorized") {
      setNote("Your session has ended. Sign in again to acknowledge this plan.");
    } else {
      setNote(failureText(result, "This plan could not be acknowledged."));
    }
    setBusy(false);
  }, [memberToken, plan.planId]);

  return (
    <section className="card" aria-label="Plan acknowledgment">
      <h2 className="body-m font-700">Acknowledge this plan</h2>
      <p className="body-s text-ink-2 mt-1">Acknowledging confirms you have read this published plan.</p>
      {acknowledgedAt ? (
        <ResearchStatusBadge label="Acknowledged" tone="success" />
      ) : (
        <button type="button" className="btn btn-primary mt-3" onClick={() => void acknowledge()} disabled={busy}>
          {busy ? "Recording..." : "I have read this plan"}
        </button>
      )}
      {note && <p role="status" aria-live="polite" className="body-s text-ink-2 mt-3">{note}</p>}
    </section>
  );
}

function HistoryCard({ history }: { history: Xenios30History[] }) {
  return (
    <section className="card" aria-label="Plan history">
      <h2 className="body-m font-700">Plan history</h2>
      <div className="mt-3">
        <ResearchDataTable<Xenios30History>
          caption="Xenios 30 plan history"
          columns={[
            { key: "month", header: "Month", render: (row) => row.monthLabel },
            { key: "state", header: "Status", render: (row) => row.state },
          ]}
          rows={history}
          rowKey={(row) => row.planId}
          empty="No earlier published plans are on record."
        />
      </div>
    </section>
  );
}

function CurrentPlan({ plan, history, memberToken }: {
  plan: Xenios30Plan;
  history: Xenios30History[];
  memberToken: string | null;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ResearchStatusBadge label={plan.monthLabel} tone="info" />
        <ResearchStatusBadge label={`Version ${plan.version}`} tone="neutral" />
        {plan.publishedAt && <span className="chip">Published {plan.publishedAt}</span>}
      </div>
      <section className="card">
        <h2 className="body-m font-700">Blueprint actions</h2>
        <TextList items={plan.blueprintActions} empty="No Blueprint actions are published for this plan." />
      </section>
      <section className="card">
        <h2 className="body-m font-700">Plan documents</h2>
        <p className="body-s text-ink-2 mt-3">
          Fitness document: {plan.fitnessDocumentId ? "available in Documents" : "not published"}
        </p>
        <p className="body-s text-ink-2 mt-1">
          Nutrition document: {plan.nutritionDocumentId ? "available in Documents" : "not published"}
        </p>
      </section>
      <section className="card">
        <h2 className="body-m font-700">Supplement foundation</h2>
        <RecommendationList items={plan.supplementFoundation} />
      </section>
      <section className="card">
        <h2 className="body-m font-700">Product guidance</h2>
        <RecommendationList items={plan.productGuidance} />
      </section>
      <section className="card">
        <h2 className="body-m font-700">Adherence targets</h2>
        <TextList
          items={plan.adherenceTargets.map((target) => `${target.label}: ${target.target}`)}
          empty="No adherence targets are published for this plan."
        />
      </section>
      <section className="card">
        <h2 className="body-m font-700">Tracker metrics</h2>
        <TextList
          items={plan.trackerMetricKeys.map((key) => key.replaceAll("_", " "))}
          empty="No tracker metrics are published for this plan."
        />
      </section>
      {plan.checkInDueAt && (
        <section className="card">
          <h2 className="body-m font-700">Check-in due</h2>
          <p className="body-s text-ink-2 mt-2">{plan.checkInDueAt}</p>
        </section>
      )}
      <AcknowledgeCard plan={plan} memberToken={memberToken} />
      <HistoryCard history={history} />
    </div>
  );
}

export default function Xenios30Page() {
  const { member, memberToken, memberChecking } = useResearch();
  const [result, setResult] = useState<ApiResult<Xenios30Response> | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    setResult(await getXenios30Plan(memberToken));
  }, [memberToken]);

  useEffect(() => {
    if (!memberChecking) void load();
  }, [load, memberChecking]);

  const invalid = result?.kind === "ok" && !isResponse(result.data);
  const state = memberChecking || result === null ? "loading"
    : !member || result.kind === "unauthorized" ? "unauthorized"
      : result.kind === "unavailable" || result.kind === "forbidden" || result.kind === "denied" ? "unavailable"
        : result.kind === "error" || invalid ? "error"
          : "ok";
  const body = result?.kind === "ok" && !invalid ? result.data : null;

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title="Xenios 30"
      lead="Your current published monthly plan."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={invalid ? "The Xenios 30 response was incomplete." : result?.kind === "error" ? result.message : undefined}
        onRetry={() => void load()}
        unavailableTitle="Xenios 30 is unavailable."
        unavailableBody="No plan has been inferred or filled in."
      >
        {body?.current ? (
          <CurrentPlan plan={body.current} history={body.history} memberToken={memberToken} />
        ) : body ? (
          <div className="grid gap-4">
            <ResearchEmptyState
              title="No published Xenios 30 plan."
              body="Your review team has not published a monthly plan yet."
            />
            <HistoryCard history={body.history} />
          </div>
        ) : null}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
