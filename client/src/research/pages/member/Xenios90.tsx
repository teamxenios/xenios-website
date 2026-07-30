import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import type {
  Xenios90Milestone,
  Xenios90Phase,
  Xenios90Plan as Xenios90ServerPlan,
} from "@shared/research/member-platform";
import { useResearch } from "../../core";
import { type ApiResult } from "../../lib/api";
import { getXenios90Plan } from "../../adapters/member";
import {
  fetchCapabilities,
  type CapabilityStatus,
  type ResearchCapability,
} from "../../lib/capabilities";
import { devFixture } from "../../lib/fixtures";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// Xenios 90 (/research/member/xenios-90): the three month arc drawn from the
// member's Blueprint, presented as three month cards (Foundation,
// Progression, Consolidation).
//
// Data comes from GET /api/research/plans/xenios90 (server/research/plans.ts),
// which answers with the REAL envelope:
//
//   res.json({
//     ok: true,
//     plan: published ? toXenios90Plan(published) : null,
//     review: await monthlyReviewStateFor(member.id, now),
//   });
//
// and toXenios90Plan serializes the shared Xenios90Plan:
//   { planId, state, version (number), currentPhase, phaseGoals, milestones,
//     monthlyVersions, publishedAt }
//
// The server has NO months array, NO per-month fitness/nutrition/supplement
// copy and NO horizonLabel. An earlier version of this page assumed all of
// those, so a fully published arc still rendered three empty month cards
// reading "Prepared after assessment" forever. The arc's real content is the
// per-phase goals plus the milestones that target each month; the working
// detail for a month is published as that month's Xenios 30 plan
// (monthlyVersions carries the link). Absent fields are still rendered as an
// honest absence, never invented.
// ---------------------------------------------------------------------------

// Milestone status is derived only from the server's boolean `done`.
export type Xenios90MilestoneView = { key: string; label: string; done: boolean };

export interface Xenios90MonthView {
  index: 1 | 2 | 3;
  phase: Xenios90Phase;
  isCurrent: boolean;
  goals: string[];
  milestones: Xenios90MilestoneView[];
  // Optional detail fields. The current server never sends these; they are
  // rendered only when a payload actually carries them.
  focus: string | null;
  fitness: string[];
  nutrition: string[];
  supplementFoundation: string[];
  productGuidance: string[];
  adherenceTargets: string[];
}

export interface Xenios90ReviewView {
  reviewWeekStart: string | null;
  checkInStatus: "not_due" | "due" | "submitted" | "reviewed" | "published";
  earlyChangeUsedThisMonth: boolean | null;
  slaDeadline: string | null;
}

export interface Xenios90View {
  version: string | number | null;
  publishedAt: string | null;
  horizonLabel: string | null;
  currentPhase: Xenios90Phase | null;
  months: Xenios90MonthView[];
  monthlyVersions: Array<{ monthLabel: string }>;
}

type Xenios90Envelope = {
  ok?: boolean;
  plan?: unknown;
  data?: unknown;
  review?: unknown;
} & Record<string, unknown>;

// --- wire normalization ----------------------------------------------------
// The wire is untrusted JSON, so every read is guarded. Nothing is defaulted
// into existence: a field the server omits stays absent.

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function milestonesForMonth(value: unknown, month: number): Xenios90MilestoneView[] {
  if (!Array.isArray(value)) return [];
  const out: Xenios90MilestoneView[] = [];
  value.forEach((item, i) => {
    if (!isRecord(item)) return;
    if (item.targetMonth !== month) return;
    const label = text(item.label);
    if (!label) return;
    out.push({ key: text(item.id) ?? `m${month}-${i}`, label, done: item.done === true });
  });
  return out;
}

function monthlyVersionsFrom(value: unknown): Array<{ monthLabel: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ monthLabel: string }> = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const monthLabel = text(item.monthLabel);
    if (monthLabel) out.push({ monthLabel });
  }
  return out;
}

// A payload may still carry an older per-month detail array; it is read when
// present and never required.
function detailForMonth(value: unknown, index: number): Record<string, unknown> {
  if (!Array.isArray(value)) return {};
  const hit = value.find((item) => isRecord(item) && item.index === index);
  return isRecord(hit) ? hit : {};
}

const MONTH_FRAMES: Array<{ index: 1 | 2 | 3; phase: Xenios90Phase; title: string; theme: string }> = [
  { index: 1, phase: "foundation", title: "Month 1", theme: "Foundation" },
  { index: 2, phase: "progression", title: "Month 2", theme: "Progression" },
  { index: 3, phase: "consolidation", title: "Month 3", theme: "Consolidation" },
];

const PHASE_VALUES: Xenios90Phase[] = MONTH_FRAMES.map((frame) => frame.phase);

function phaseOrNull(value: unknown): Xenios90Phase | null {
  return PHASE_VALUES.includes(value as Xenios90Phase) ? (value as Xenios90Phase) : null;
}

function buildView(source: Record<string, unknown>): Xenios90View {
  const phaseGoals = isRecord(source.phaseGoals) ? source.phaseGoals : {};
  const currentPhase = phaseOrNull(source.currentPhase);
  const version =
    typeof source.version === "number" || typeof source.version === "string" ? source.version : null;

  return {
    version,
    publishedAt: text(source.publishedAt),
    horizonLabel: text(source.horizonLabel),
    currentPhase,
    monthlyVersions: monthlyVersionsFrom(source.monthlyVersions),
    months: MONTH_FRAMES.map((frame) => {
      const detail = detailForMonth(source.months, frame.index);
      return {
        index: frame.index,
        phase: frame.phase,
        isCurrent: currentPhase === frame.phase,
        goals: strings(phaseGoals[frame.phase]),
        milestones: milestonesForMonth(source.milestones, frame.index),
        focus: text(detail.focus),
        fitness: strings(detail.fitness),
        nutrition: strings(detail.nutrition),
        supplementFoundation: strings(detail.supplementFoundation),
        productGuidance: strings(detail.productGuidance),
        adherenceTargets: strings(detail.adherenceTargets),
      };
    }),
  };
}

function hasPlanShape(body: Record<string, unknown>): boolean {
  return Boolean(
    body.phaseGoals || body.milestones || body.monthlyVersions || body.months || body.version || body.horizonLabel,
  );
}

export function normalizePlan(body: Xenios90Envelope | null): Xenios90View | null {
  if (!body) return null;
  const candidate = isRecord(body.plan) ? body.plan : isRecord(body.data) ? body.data : null;
  const source = candidate ?? (hasPlanShape(body) ? body : null);
  if (!source) return null;
  return buildView(source);
}

const CHECK_IN_STATUSES: Xenios90ReviewView["checkInStatus"][] = [
  "not_due",
  "due",
  "submitted",
  "reviewed",
  "published",
];

export function normalizeReview(value: unknown): Xenios90ReviewView | null {
  if (!isRecord(value)) return null;
  const status = CHECK_IN_STATUSES.find((known) => known === value.checkInStatus);
  if (!status) return null;
  return {
    reviewWeekStart: text(value.reviewWeekStart),
    checkInStatus: status,
    earlyChangeUsedThisMonth:
      typeof value.earlyChangeUsedThisMonth === "boolean" ? value.earlyChangeUsedThisMonth : null,
    slaDeadline: text(value.slaDeadline),
  };
}

function monthHasContent(month: Xenios90MonthView): boolean {
  return Boolean(
    month.goals.length ||
      month.milestones.length ||
      month.focus ||
      month.fitness.length ||
      month.nutrition.length ||
      month.supplementFoundation.length ||
      month.productGuidance.length ||
      month.adherenceTargets.length,
  );
}

// Both dates on this route are UTC calendar dates produced server side, and
// reviewWeekStart is specifically midnight UTC on a Monday
// (firstMondayAfterMonthEnd). Formatting in local time would shift it back to
// Sunday for every member west of UTC, so the UTC calendar date is what is
// rendered. An unparseable value is shown as sent, never dropped.
function fmtDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

// Development-only sample so the three month presentation can be reviewed
// locally. It is typed as the SERVER contract, so a shared-type change breaks
// this build rather than shipping a fixture that lies about the API. In
// production this is null and the page renders the honest pending state.
function samplePlan(): Xenios90ServerPlan {
  return {
    planId: "sample-90",
    state: "published",
    version: 1,
    currentPhase: "foundation",
    phaseGoals: {
      foundation: [
        "Establish the baseline: consistent training, consistent logging, consistent sleep.",
        "Learn the main lift patterns at controlled loads.",
      ],
      progression: ["Progress the load only where the tracker shows readiness."],
      consolidation: ["Lock in what worked and set up the next quarterly Blueprint review."],
    },
    milestones: [
      { id: "m1", label: "Four steady weeks logged", targetMonth: 1, done: false },
      { id: "m2", label: "Conditioning session added weekly", targetMonth: 2, done: false },
      { id: "m3", label: "Quarterly review booked", targetMonth: 3, done: false },
    ],
    monthlyVersions: [{ monthLabel: "2026-07", xenios30PlanId: "sample-30" }],
    publishedAt: "2026-07-01T00:00:00.000Z",
  };
}

const PREPARED_AFTER = "Prepared after your assessment.";

const CHECK_IN_PRESENTATION: Record<
  Xenios90ReviewView["checkInStatus"],
  { label: string; tone: "neutral" | "info" | "success" | "warning" }
> = {
  not_due: { label: "Not due yet", tone: "neutral" },
  due: { label: "Due now", tone: "warning" },
  submitted: { label: "Submitted", tone: "info" },
  reviewed: { label: "In review", tone: "info" },
  published: { label: "Published", tone: "success" },
};

function ItemList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 mt-2" style={{ paddingLeft: 18 }}>
      {items.map((item, i) => (
        <li key={i} className="body-s text-ink-2">
          {item}
        </li>
      ))}
    </ul>
  );
}

// A detail section renders its items, or the honest pending line when the
// month carries no content at all.
function MonthSection({ title, items, note }: { title: string; items: string[]; note?: string }) {
  return (
    <div className="mt-4">
      <h3 className="mono-label text-ink-mute">{title}</h3>
      {note && <p className="body-s text-ink-mute mt-1">{note}</p>}
      {items.length ? <ItemList items={items} /> : <p className="body-s text-ink-mute mt-1">{PREPARED_AFTER}</p>}
    </div>
  );
}

function MilestoneList({ milestones }: { milestones: Xenios90MilestoneView[] }) {
  return (
    <ul className="grid gap-2 mt-2" style={{ paddingLeft: 18 }}>
      {milestones.map((milestone) => (
        <li key={milestone.key} className="body-s text-ink-2">
          <span>{milestone.label}</span>{" "}
          <ResearchStatusBadge
            label={milestone.done ? "Done" : "Not done yet"}
            tone={milestone.done ? "success" : "neutral"}
          />
        </li>
      ))}
    </ul>
  );
}

function MonthCard({
  frame,
  month,
}: {
  frame: { index: 1 | 2 | 3; title: string; theme: string };
  month: Xenios90MonthView;
}) {
  const populated = monthHasContent(month);
  return (
    <section className="card" aria-label={`${frame.title}: ${frame.theme}`} data-testid={`x90-month-${frame.index}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="body-m font-700">
          {frame.title} <span className="text-ink-2">· {frame.theme}</span>
        </h2>
        <span className="flex flex-wrap items-center gap-2">
          {month.isCurrent && <ResearchStatusBadge label="Current phase" tone="success" />}
          {populated ? (
            <ResearchStatusBadge label="Planned" tone="info" />
          ) : (
            <ResearchStatusBadge label="Prepared after assessment" tone="pending" />
          )}
        </span>
      </div>

      {month.focus && <p className="body-s text-ink-2 mt-2 max-w-[56ch]">{month.focus}</p>}

      {populated ? (
        <>
          {month.goals.length > 0 && (
            <div className="mt-4" data-testid={`x90-month-${frame.index}-goals`}>
              <h3 className="mono-label text-ink-mute">Phase goals</h3>
              <ItemList items={month.goals} />
            </div>
          )}
          {month.milestones.length > 0 && (
            <div className="mt-4" data-testid={`x90-month-${frame.index}-milestones`}>
              <h3 className="mono-label text-ink-mute">Milestones</h3>
              <MilestoneList milestones={month.milestones} />
            </div>
          )}
          {month.fitness.length > 0 && <MonthSection title="Fitness" items={month.fitness} />}
          {month.nutrition.length > 0 && <MonthSection title="Nutrition" items={month.nutrition} />}
          {month.supplementFoundation.length > 0 && (
            <MonthSection
              title="Supplement Foundation"
              items={month.supplementFoundation}
              note="Categories and names only. Specific usage details come from your published plan documents."
            />
          )}
          {month.productGuidance.length > 0 && (
            <MonthSection title="Product guidance" items={month.productGuidance} />
          )}
          {month.adherenceTargets.length > 0 && (
            <MonthSection title="Adherence targets" items={month.adherenceTargets} />
          )}
        </>
      ) : (
        <>
          <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>
          <MonthSection title="Phase goals" items={[]} />
          <MonthSection title="Milestones" items={[]} />
        </>
      )}
    </section>
  );
}

function ReviewCard({ review }: { review: Xenios90ReviewView }) {
  const presentation = CHECK_IN_PRESENTATION[review.checkInStatus];
  const start = fmtDate(review.reviewWeekStart);
  const sla = fmtDate(review.slaDeadline);
  return (
    <section className="card" aria-label="Review Week" data-testid="x90-review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="body-m font-700">Review Week</h2>
        <ResearchStatusBadge label={presentation.label} tone={presentation.tone} />
      </div>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        {start
          ? `Review Week starts ${start}.`
          : "Review Week is scheduled once your first monthly plan is published."}
      </p>
      {sla && <p className="body-s text-ink-2 mt-2 max-w-[56ch]">Your updated plan is published by {sla}.</p>}
      {review.earlyChangeUsedThisMonth !== null && (
        <p className="body-s text-ink-mute mt-2 max-w-[56ch]">
          {review.earlyChangeUsedThisMonth
            ? "You have used the one included early plan change this month."
            : "The one included early plan change is still available this month."}
        </p>
      )}
    </section>
  );
}

export default function Xenios90Page() {
  const { member, memberToken, memberChecking } = useResearch();
  const [result, setResult] = useState<ApiResult<Xenios90Envelope> | null>(null);
  const [statuses, setStatuses] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    const [caps, res] = await Promise.all([
      fetchCapabilities(memberToken),
      getXenios90Plan<Xenios90Envelope>(memberToken),
    ]);
    setStatuses(caps);
    setResult(res);
  }, [memberToken]);

  useEffect(() => {
    if (!memberChecking) void load();
  }, [load, memberChecking]);

  const boundaryState = memberChecking
    ? "loading"
    : !member
      ? "unauthorized"
      : result === null
        ? "loading"
        : result.kind === "unauthorized"
          ? "unauthorized"
          : result.kind === "error"
            ? "error"
            : result.kind === "forbidden"
              ? "unavailable"
              : "ok";

  let plan: Xenios90View | null = null;
  let review: Xenios90ReviewView | null = null;
  if (result?.kind === "ok") {
    plan = normalizePlan(result.data);
    review = normalizeReview(result.data?.review);
  }
  if (!plan && result?.kind === "unavailable") {
    const sample = devFixture(samplePlan);
    plan = sample ? buildView(sample as unknown as Record<string, unknown>) : null;
  }

  const monthFor = (index: 1 | 2 | 3): Xenios90MonthView =>
    plan?.months.find((m) => m.index === index) ?? {
      index,
      phase: MONTH_FRAMES[index - 1].phase,
      isCurrent: false,
      goals: [],
      milestones: [],
      focus: null,
      fitness: [],
      nutrition: [],
      supplementFoundation: [],
      productGuidance: [],
      adherenceTargets: [],
    };

  const publishedLabel = fmtDate(plan?.publishedAt ?? null);

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title="Xenios 90"
      lead="Your three month arc: month one builds the foundation, month two progresses it, month three consolidates it into the next quarterly review."
      actions={
        plan?.horizonLabel ? <ResearchStatusBadge label={plan.horizonLabel} tone="info" /> : undefined
      }
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={result?.kind === "error" ? result.message : undefined}
        onRetry={load}
        unavailableTitle="Xenios 90 is available with an active membership."
        unavailableBody={result?.kind === "forbidden" ? result.message : "Nothing is wrong with your account."}
      >
        {plan ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {plan.version !== null && (
                <span className="chip" data-testid="x90-version">
                  Version {plan.version}
                </span>
              )}
              {publishedLabel && (
                <span className="chip" data-testid="x90-published">
                  Published {publishedLabel}
                </span>
              )}
            </div>
            {MONTH_FRAMES.map((frame) => (
              <MonthCard key={frame.index} frame={frame} month={monthFor(frame.index)} />
            ))}
            {review && <ReviewCard review={review} />}
            <section className="card" aria-label="How the months connect">
              <h2 className="body-m font-700">How the months connect</h2>
              <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                Xenios 30 is the working month inside this arc. Each month's tracker data shapes the next, and the
                whole quarter feeds your Blueprint review.
              </p>
              {plan.monthlyVersions.length > 0 && (
                <div className="mt-4" data-testid="x90-monthly-versions">
                  <h3 className="mono-label text-ink-mute">Monthly plans in this arc</h3>
                  <ItemList items={plan.monthlyVersions.map((entry) => entry.monthLabel)} />
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={MEMBER_ROUTES.xenios30} className="btn btn-primary">
                  Open Xenios 30
                </Link>
                <Link href={MEMBER_ROUTES.blueprint} className="btn btn-secondary">
                  Go to your Blueprint
                </Link>
              </div>
            </section>
          </div>
        ) : (
          <ResearchCapabilityBoundary status={capabilityStatusOrPending(statuses, "blueprint")}>
            <ResearchEmptyState
              title="Your Xenios 90 arc is prepared after your Blueprint."
              body="Complete your assessment, and once your Blueprint is published the three month arc appears here."
              action={
                <Link href={MEMBER_ROUTES.blueprint} className="btn btn-primary">
                  Go to your Blueprint
                </Link>
              }
            />
          </ResearchCapabilityBoundary>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
