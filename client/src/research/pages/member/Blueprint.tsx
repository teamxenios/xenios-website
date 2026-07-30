import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import {
  BLUEPRINT_STATES,
  type BlueprintState,
  type BlueprintView,
  type RecommendationDisposition,
  type RecommendationItem,
} from "@shared/research/member-platform";
import { useResearch } from "../../core";
import { type ApiResult } from "../../lib/api";
import { getBlueprint } from "../../adapters/member";
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
  ResearchTimeline,
  capabilityStatusOrPending,
  type BadgeTone,
} from "../../ui/kit";
import { formatDate } from "./commerce-presentation";

// ---------------------------------------------------------------------------
// The member Blueprint (/research/member/blueprint), rendered from the real
// response of GET /api/research/blueprint (server/research/blueprint.ts:447).
//
// The server sends exactly one of these bodies, and nothing else:
//
//   no rows yet        { ok: true, blueprint: null, state: "assessment_due" }
//                      { ok: true, blueprint: null, state: "assessment_submitted" }
//   a row exists       { ok: true, blueprint: BlueprintView | null,
//                        state: <head row state>,
//                        memberVisibleMessage?: string | null }
//
// `blueprint` is built ONLY from the row in state "published"
// (blueprint.ts:465), so draft content never reaches the browser. `state` is
// the HEAD state, which is the row in review when one exists, otherwise the
// published row. Those two can disagree on purpose: a member with a published
// v1 and a v2 in Samuel's review gets the published view AND a review state,
// and this page shows both rather than hiding one behind the other.
//
// `memberVisibleMessage` is present only for the review states (preliminary,
// samuel_review, more_information_needed) and carries either Samuel's own
// message or the server placeholder.
//
// Every state in the frozen contract is handled, including not_started and
// assessment_submitted: the state maps are keyed by BlueprintState, so a new
// state in the contract fails the typecheck here instead of silently falling
// back to "Assessment due" and contradicting the dashboard that linked here.
//
// Nothing here invents server facts. There is no fitnessPlan or nutritionPlan
// field in the contract; the page renders the real recommendations[] grouped
// by their own kind and disposition, and says plainly when a field is absent.
// ---------------------------------------------------------------------------

export type BlueprintEnvelope = {
  ok?: boolean;
  blueprint?: BlueprintView | null;
  state?: BlueprintState;
  memberVisibleMessage?: string | null;
};

// What the page actually renders: the head state, the published view when the
// server sent one, and the review message when there is one.
export type BlueprintPresentation = {
  state: BlueprintState;
  view: BlueprintView | null;
  memberVisibleMessage: string | null;
};

function isBlueprintState(value: unknown): value is BlueprintState {
  return typeof value === "string" && (BLUEPRINT_STATES as readonly string[]).includes(value);
}

// Mirrors the server's own isMemberVisible (blueprint.ts:263). Content is
// rendered only for a state the contract allows a member to see, so a draft
// leaking into the payload would still not be displayed.
function isMemberVisibleState(state: BlueprintState): boolean {
  return state === "published" || state === "updated";
}

const REVIEW_STATES: BlueprintState[] = ["preliminary", "samuel_review", "more_information_needed"];

function isReviewState(state: BlueprintState): boolean {
  return REVIEW_STATES.includes(state);
}

function normalizeBlueprint(body: BlueprintEnvelope | null | undefined): BlueprintPresentation | null {
  if (!body || typeof body !== "object") return null;
  const raw = body.blueprint ?? null;
  const view =
    raw && typeof raw === "object" && isBlueprintState(raw.state) && isMemberVisibleState(raw.state) ? raw : null;
  // The envelope's own state wins; the view's state is the only fallback.
  const state = isBlueprintState(body.state) ? body.state : view ? view.state : null;
  if (!state) return null;
  const message =
    typeof body.memberVisibleMessage === "string" && body.memberVisibleMessage.trim().length > 0
      ? body.memberVisibleMessage.trim()
      : null;
  return { state, view, memberVisibleMessage: message };
}

function recommendationsOf(view: BlueprintView): RecommendationItem[] {
  return Array.isArray(view.recommendations) ? view.recommendations : [];
}

// Assessment question ids and safety flag keys arrive as machine keys. The
// only transform applied is underscore to space: no key is renamed, dropped,
// or given copy it did not carry.
function humanizeKey(value: string): string {
  return value.replace(/_/g, " ");
}

// Development-only sample so the published presentation can be reviewed
// locally. In production this is null and the page renders the honest
// assessment_due state instead. The shape is the real contract shape.
function sampleBlueprint(): BlueprintPresentation {
  return {
    state: "published",
    memberVisibleMessage: null,
    view: {
      blueprintId: "sample-blueprint",
      state: "published",
      version: 1,
      primaryGoal: "Body recomposition",
      secondaryGoals: ["Sleep quality", "Everyday energy"],
      topPriorities: [
        "Rebuild a consistent sleep routine",
        "Establish a keepable training rhythm",
        "Progress toward body recomposition",
      ],
      recommendations: [
        {
          id: "lifestyle_sleep_routine",
          kind: "lifestyle",
          title: "A consistent wind-down and sleep window",
          disposition: "recommended",
          explanation:
            "Your sleep answers point to short or unrefreshing nights. A fixed wind-down time and a steady sleep window is the highest-leverage first change, and it costs nothing.",
          sourceSignals: ["sleep_hours", "sleep_quality"],
        },
        {
          id: "fitness_program",
          kind: "fitness_program",
          title: "Strength Builder 4-Day",
          disposition: "recommended",
          explanation:
            "This program shape fits your current training frequency, your goal, and the amount of routine you said you can keep.",
          sourceSignals: ["training_frequency", "primary_goal"],
        },
        {
          id: "nutrition_program",
          kind: "nutrition_program",
          title: "Recomposition Nutrition Framework",
          disposition: "recommended",
          explanation:
            "This framework fits how you eat today, your goal, and the level of structure you said you can keep.",
          sourceSignals: ["eating_pattern", "primary_goal"],
        },
        {
          id: "supplement_multivitamin",
          kind: "supplement_foundation",
          title: "A foundation multivitamin",
          disposition: "duplicate_warning",
          explanation:
            "A generic foundation category, not a brand. You listed something in this category already, so it is marked as a possible duplicate rather than an addition.",
          sourceSignals: ["eating_pattern", "current_supplements"],
        },
        {
          id: "exclusions_allergies",
          kind: "supplement_foundation",
          title: "Exclusions from your allergy and avoid list",
          disposition: "excluded",
          explanation:
            "Anything that conflicts with the allergies, intolerances, or avoided ingredients you listed is excluded up front.",
          sourceSignals: ["has_allergies"],
        },
        {
          id: "product_options_goal_fit",
          kind: "product_option",
          title: "Product options aligned with your primary goal",
          disposition: "possible_research_pathway",
          explanation:
            "Your stated goal suggests there may be product options worth a conversation with Samuel. This marks goal fit only; it is not a claim that any product works for you.",
          sourceSignals: ["primary_goal", "monthly_budget"],
        },
      ],
      questionsForReview: [
        "The allergy and intolerance list needs a label-by-label cross-check before any product conversation.",
      ],
      unansweredImportantFields: ["stress_sources"],
      safetyFlags: ["allergy_or_intolerance"],
      confidence: "medium",
      reviewedBy: "Samuel",
      publishedAt: "2026-07-14T12:00:00.000Z",
      supersededByVersion: null,
      memberAcknowledgedAt: null,
    },
  };
}

// ---------------------------------------------------------------------------
// State machine presentation. Both maps are keyed by BlueprintState, so every
// state the server can emit has copy and a rail position, checked by tsc.
// ---------------------------------------------------------------------------

type RailStep = {
  key: string;
  label: string;
  detail: string;
  conditional?: boolean;
  conditionalLabel?: string;
};

const STEPS: RailStep[] = [
  {
    key: "assessment",
    label: "Assessment",
    detail: "Your Blueprint is drafted from your own answers, so it starts with your assessment.",
  },
  {
    key: "assessment_submitted",
    label: "Assessment received",
    detail: "Your answers are in and your Blueprint is queued to be drafted from them.",
  },
  {
    key: "preliminary",
    label: "Preliminary draft",
    detail: "A first draft is assembled from your assessment.",
  },
  {
    key: "samuel_review",
    label: "Samuel's review",
    detail: "Samuel reviews every Blueprint personally before it is published.",
  },
  {
    key: "more_information_needed",
    label: "More information needed",
    detail: "A few of your answers need clarification before publication.",
    conditional: true,
    conditionalLabel: "Only if needed",
  },
  {
    key: "published",
    label: "Published",
    detail: "Your Blueprint is live and drives your Xenios 30 and Xenios 90 plans.",
  },
  {
    key: "updated",
    label: "Updated",
    detail: "Your Blueprint has been revised since it was first published.",
    conditional: true,
    conditionalLabel: "Only if revised",
  },
];

// not_started and assessment_due share the assessment step: in both, the
// assessment is the only thing standing between the member and a draft.
const RAIL_STEP_FOR_STATE: Record<BlueprintState, string> = {
  not_started: "assessment",
  assessment_due: "assessment",
  assessment_submitted: "assessment_submitted",
  preliminary: "preliminary",
  samuel_review: "samuel_review",
  more_information_needed: "more_information_needed",
  published: "published",
  updated: "updated",
};

const STATE_COPY: Record<BlueprintState, { label: string; detail: string }> = {
  not_started: {
    label: "Not started yet",
    detail: "Your Blueprint has not been started. It begins with your assessment.",
  },
  assessment_due: {
    label: "Assessment due",
    detail: "Complete your assessment so your Blueprint can be drafted from your own answers.",
  },
  assessment_submitted: {
    label: "Assessment received",
    detail:
      "Your assessment is in. Your Blueprint is drafted from your answers and reviewed by Samuel personally before you see it. Nothing further is needed from you right now.",
  },
  preliminary: {
    label: "Preliminary draft",
    detail: "A first draft is assembled from your assessment.",
  },
  samuel_review: {
    label: "Samuel's review",
    detail: "Samuel reviews every Blueprint personally before it is published.",
  },
  more_information_needed: {
    label: "More information needed",
    detail: "A few of your answers need clarification before publication.",
  },
  published: {
    label: "Published",
    detail: "Your Blueprint is live and drives your Xenios 30 and Xenios 90 plans.",
  },
  updated: {
    label: "Updated",
    detail: "Your Blueprint has been revised since it was first published.",
  },
};

// The only states where the assessment is genuinely the member's next move.
// Every other state has already moved past it, so the assessment call to
// action must never appear.
const PRE_ASSESSMENT_STATES: BlueprintState[] = ["not_started", "assessment_due"];

function stepBadge(stepIndex: number, currentIndex: number, conditional: boolean, conditionalLabel?: string) {
  if (stepIndex === currentIndex) return <ResearchStatusBadge label="Current" tone="info" />;
  if (conditional) return <ResearchStatusBadge label={conditionalLabel ?? "Only if needed"} tone="neutral" />;
  if (stepIndex < currentIndex) return <ResearchStatusBadge label="Done" tone="success" />;
  return <ResearchStatusBadge label="Upcoming" tone="pending" />;
}

function BlueprintStateRail({ current }: { current: BlueprintState }) {
  const currentIndex = STEPS.findIndex((step) => step.key === RAIL_STEP_FOR_STATE[current]);
  return (
    <section className="card" aria-label="Blueprint progress" data-testid="blueprint-rail">
      <h2 className="mono-label text-ink-mute">Where your Blueprint is</h2>
      <ol className="grid gap-3 mt-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {STEPS.map((step, index) => {
          const isCurrent = index === currentIndex;
          return (
            <li
              key={step.key}
              aria-current={isCurrent ? "step" : undefined}
              className="flex flex-wrap items-start justify-between gap-3"
            >
              <div style={{ minWidth: 0, maxWidth: "56ch" }}>
                <p className={`body-m ${isCurrent ? "font-700" : ""}`}>{step.label}</p>
                <p className="body-s text-ink-2 mt-1">{step.detail}</p>
              </div>
              {stepBadge(index, currentIndex, Boolean(step.conditional), step.conditionalLabel)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recommendation presentation. Disposition is the contract's ONLY vocabulary
// for availability, so it is shown as a badge and never softened into a claim.
// ---------------------------------------------------------------------------

const DISPOSITION_META: Record<RecommendationDisposition, { label: string; tone: BadgeTone }> = {
  recommended: { label: "Recommended", tone: "success" },
  optional: { label: "Optional", tone: "neutral" },
  excluded: { label: "Excluded", tone: "neutral" },
  duplicate_warning: { label: "Possible duplicate", tone: "warning" },
  possible_research_pathway: { label: "Possible research pathway", tone: "info" },
  needs_samuel_review: { label: "Needs Samuel's review", tone: "warning" },
  not_available: { label: "Not available", tone: "pending" },
};

const KIND_SECTIONS: Array<{ kind: RecommendationItem["kind"]; title: string; note?: string }> = [
  { kind: "lifestyle", title: "Lifestyle foundation" },
  { kind: "fitness_program", title: "Fitness program" },
  { kind: "nutrition_program", title: "Nutrition framework" },
  {
    kind: "supplement_foundation",
    title: "Supplement Foundation",
    note: "Categories and names only. Specific usage details come from your published plan documents.",
  },
  { kind: "product_option", title: "Product pathways" },
  { kind: "research_pathway", title: "Research pathways" },
];

function RecommendationEntry({ item }: { item: RecommendationItem }) {
  const meta = DISPOSITION_META[item.disposition];
  const signals = Array.isArray(item.sourceSignals) ? item.sourceSignals : [];
  return (
    <li data-testid={`blueprint-item-${item.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="body-s font-700">{item.title}</p>
        {meta ? (
          <ResearchStatusBadge label={meta.label} tone={meta.tone} />
        ) : (
          <ResearchStatusBadge label={humanizeKey(String(item.disposition))} tone="neutral" />
        )}
      </div>
      {item.explanation && <p className="body-s text-ink-2 mt-1 max-w-[56ch]">{item.explanation}</p>}
      {signals.length > 0 && (
        <p className="mono-label text-ink-mute mt-1">From your answers: {signals.map(humanizeKey).join(", ")}</p>
      )}
    </li>
  );
}

// An empty section is omitted rather than filled with placeholder copy: a
// published Blueprint saying "prepared after your assessment" would be false.
function RecommendationSection({
  title,
  note,
  items,
}: {
  title: string;
  note?: string;
  items: RecommendationItem[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="card" aria-label={title}>
      <h2 className="body-m font-700">{title}</h2>
      {note && <p className="body-s text-ink-mute mt-1">{note}</p>}
      <ul className="grid gap-3 mt-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => (
          <RecommendationEntry key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ItemList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 mt-3" style={{ paddingLeft: 18 }}>
      {items.map((item, i) => (
        <li key={i} className="body-s text-ink-2">
          {item}
        </li>
      ))}
    </ul>
  );
}

const NOT_IN_THIS_VERSION = "Not recorded in this version of your Blueprint.";

function GoalsCard({ view }: { view: BlueprintView }) {
  const secondary = Array.isArray(view.secondaryGoals) ? view.secondaryGoals : [];
  const hasAny = Boolean(view.primaryGoal || secondary.length);
  return (
    <section className="card" aria-label="Primary and secondary goals">
      <h2 className="body-m font-700">Primary and secondary goals</h2>
      {!hasAny && <p className="body-s text-ink-mute mt-2">{NOT_IN_THIS_VERSION}</p>}
      {view.primaryGoal && (
        <div className="mt-3">
          <p className="mono-label text-ink-mute">Primary</p>
          <p className="body-s text-ink-2 mt-1">{view.primaryGoal}</p>
        </div>
      )}
      {secondary.length > 0 && (
        <div className="mt-3">
          <p className="mono-label text-ink-mute">Secondary</p>
          <ItemList items={secondary} />
        </div>
      )}
    </section>
  );
}

function KeyList({ title, keys, note }: { title: string; keys: string[]; note?: string }) {
  if (keys.length === 0) return null;
  return (
    <section className="card" aria-label={title}>
      <h2 className="body-m font-700">{title}</h2>
      {note && <p className="body-s text-ink-mute mt-1 max-w-[56ch]">{note}</p>}
      <ItemList items={keys.map(humanizeKey)} />
    </section>
  );
}

// The engine flags these for Samuel's personal review. They ship inside the
// member view, so they are shown as what they are, not restyled into tasks
// waiting on the member.
function FlaggedForReviewCard({ questions }: { questions: string[] }) {
  return (
    <section className="card" aria-label="Flagged for Samuel's review" data-testid="blueprint-flagged">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="body-m font-700">Flagged for Samuel's review</h2>
        {questions.length > 0 ? (
          <ResearchStatusBadge label={`${questions.length} flagged`} tone="warning" />
        ) : (
          <ResearchStatusBadge label="None flagged" tone="success" />
        )}
      </div>
      {questions.length > 0 ? (
        <ItemList items={questions} />
      ) : (
        <p className="body-s text-ink-mute mt-2">Nothing was flagged on this version.</p>
      )}
      <p className="body-s text-ink-2 mt-3 max-w-[56ch]">
        If anything here needs your input, Samuel asks you directly on your questions page.
      </p>
      <div className="mt-4">
        <Link href={MEMBER_ROUTES.questions} className="btn btn-secondary">
          Go to questions
        </Link>
      </div>
    </section>
  );
}

function PlanLinksCard() {
  return (
    <section className="card" aria-label="Your plans">
      <h2 className="body-m font-700">Your plans</h2>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Your Blueprint drives two working plans: Xenios 30 covers the current month and Xenios 90 lays out the
        three month arc.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={MEMBER_ROUTES.xenios30} className="btn btn-primary">
          Open Xenios 30
        </Link>
        <Link href={MEMBER_ROUTES.xenios90} className="btn btn-secondary">
          Open Xenios 90
        </Link>
      </div>
    </section>
  );
}

// Built only from timestamps the contract actually carries. There is no
// review-history field, so no history is invented for one.
function historyItems(view: BlueprintView): Array<{ at: string; title: string; detail?: string }> {
  const items: Array<{ at: string; title: string; detail?: string }> = [];
  if (view.publishedAt) {
    items.push({
      at: formatDate(view.publishedAt) ?? view.publishedAt,
      title: `Published, version ${view.version}`,
      detail: view.reviewedBy ? `Reviewed by ${view.reviewedBy}.` : undefined,
    });
  }
  if (view.memberAcknowledgedAt) {
    items.push({
      at: formatDate(view.memberAcknowledgedAt) ?? view.memberAcknowledgedAt,
      title: "Acknowledged by you",
    });
  }
  return items;
}

function PublishedBlueprint({ view }: { view: BlueprintView }) {
  const all = recommendationsOf(view);
  const excluded = all.filter((item) => item.disposition === "excluded");
  const duplicates = all.filter((item) => item.disposition === "duplicate_warning");
  const remaining = all.filter(
    (item) => item.disposition !== "excluded" && item.disposition !== "duplicate_warning",
  );
  const priorities = Array.isArray(view.topPriorities) ? view.topPriorities : [];
  const questions = Array.isArray(view.questionsForReview) ? view.questionsForReview : [];
  const safetyFlags = Array.isArray(view.safetyFlags) ? view.safetyFlags : [];
  const unanswered = Array.isArray(view.unansweredImportantFields) ? view.unansweredImportantFields : [];
  const history = historyItems(view);

  return (
    <div className="grid gap-4">
      <GoalsCard view={view} />
      <section className="card" aria-label="Top priorities">
        <h2 className="body-m font-700">Top priorities</h2>
        {priorities.length > 0 ? (
          <ItemList items={priorities} />
        ) : (
          <p className="body-s text-ink-mute mt-2">{NOT_IN_THIS_VERSION}</p>
        )}
      </section>

      {all.length === 0 && (
        <section className="card" aria-label="Recommendations">
          <h2 className="body-m font-700">Recommendations</h2>
          <p className="body-s text-ink-mute mt-2">{NOT_IN_THIS_VERSION}</p>
        </section>
      )}
      {KIND_SECTIONS.map((section) => (
        <RecommendationSection
          key={section.kind}
          title={section.title}
          note={section.note}
          items={remaining.filter((item) => item.kind === section.kind)}
        />
      ))}
      <RecommendationSection title="Exclusions" items={excluded} />
      <RecommendationSection title="Duplicate warnings" items={duplicates} />

      <KeyList
        title="Safety context you flagged"
        keys={safetyFlags}
        note="These came from your own answers and shape how conservatively each item is dispositioned."
      />
      <KeyList
        title="Answers still missing"
        keys={unanswered}
        note="These assessment answers were blank when this version was drafted."
      />

      <PlanLinksCard />
      <FlaggedForReviewCard questions={questions} />

      {history.length > 0 && (
        <section className="card" aria-label="Review history">
          <h2 className="body-m font-700">Review history</h2>
          <div className="mt-3">
            <ResearchTimeline items={history} />
          </div>
        </section>
      )}
    </div>
  );
}

// A published Blueprint plus a newer version in review: the member keeps the
// current published content and is told plainly that a revision is in flight.
function RevisionInReviewNotice({
  state,
  message,
}: {
  state: BlueprintState;
  message: string | null;
}) {
  return (
    <section
      className="card"
      role="status"
      aria-live="polite"
      aria-label="A revision is in review"
      data-testid="blueprint-revision-notice"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="body-m font-700">A revision is in review</h2>
        <ResearchStatusBadge label={STATE_COPY[state].label} tone="info" />
      </div>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        {message ?? STATE_COPY[state].detail}
      </p>
      <p className="body-s text-ink-mute mt-2 max-w-[56ch]">
        What you see below is your current published Blueprint. It stays in force until the revision is published.
      </p>
      {state === "more_information_needed" && (
        <div className="mt-4">
          <Link href={MEMBER_ROUTES.questions} className="btn btn-primary">
            Answer the open questions
          </Link>
        </div>
      )}
    </section>
  );
}

// The presentation for every state with no member-visible content yet: the
// rail plus a card explaining exactly what happens next. The assessment call
// to action appears ONLY where the assessment is genuinely the next step.
function WaitingBlueprint({
  presentation,
  statuses,
}: {
  presentation: BlueprintPresentation;
  statuses: Map<ResearchCapability, CapabilityStatus> | null;
}) {
  const { state, memberVisibleMessage } = presentation;
  const copy = STATE_COPY[state];
  const preAssessment = PRE_ASSESSMENT_STATES.includes(state);
  return (
    <div className="grid gap-4">
      <BlueprintStateRail current={state} />
      {preAssessment ? (
        <ResearchCapabilityBoundary status={capabilityStatusOrPending(statuses, "blueprint")}>
          <ResearchEmptyState
            title="Your Blueprint starts with your assessment."
            body="Once your assessment is complete, a preliminary Blueprint is drafted and reviewed by Samuel before it is published."
            action={
              <Link href={MEMBER_ROUTES.assessment} className="btn btn-primary">
                Start your assessment
              </Link>
            }
          />
        </ResearchCapabilityBoundary>
      ) : (
        <section
          className="card"
          role="status"
          aria-live="polite"
          aria-label="What happens next"
          data-testid="blueprint-state-card"
        >
          <h2 className="body-m font-700">{copy.label}</h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">{memberVisibleMessage ?? copy.detail}</p>
          {state === "more_information_needed" && (
            <div className="mt-4">
              <Link href={MEMBER_ROUTES.questions} className="btn btn-primary">
                Answer the open questions
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BlueprintPage() {
  const { member, memberToken, memberChecking } = useResearch();
  const [result, setResult] = useState<ApiResult<BlueprintEnvelope> | null>(null);
  const [statuses, setStatuses] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    const [caps, res] = await Promise.all([
      fetchCapabilities(memberToken),
      getBlueprint<BlueprintEnvelope>(memberToken),
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

  // Resolve the data to present. A live payload wins; an absent endpoint
  // falls back to a development fixture (null in production), and finally to
  // the honest assessment_due state.
  let presentation: BlueprintPresentation | null = null;
  if (result?.kind === "ok") presentation = normalizeBlueprint(result.data);
  if (!presentation && result?.kind === "unavailable") presentation = devFixture(sampleBlueprint);
  if (!presentation) presentation = { state: "assessment_due", view: null, memberVisibleMessage: null };

  const view = presentation.view;
  const revisionInReview = view !== null && isReviewState(presentation.state);

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title="Your Blueprint"
      lead="The single document your program is built from: your goals, your foundations, and the plan pathways drawn from your own assessment."
      actions={
        view ? (
          <ResearchStatusBadge label={view.state === "updated" ? "Updated" : "Published"} tone="success" />
        ) : undefined
      }
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={result?.kind === "error" ? result.message : undefined}
        onRetry={load}
        unavailableTitle="Your Blueprint is available with an active membership."
        unavailableBody={result?.kind === "forbidden" ? result.message : "Nothing is wrong with your account."}
      >
        {view ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="chip">Version {view.version}</span>
              {view.publishedAt && <span className="chip">Published {formatDate(view.publishedAt) ?? view.publishedAt}</span>}
              {view.reviewedBy && <span className="chip">Reviewed by {view.reviewedBy}</span>}
              {view.confidence && <span className="chip">Confidence: {view.confidence}</span>}
              {view.memberAcknowledgedAt && (
                <span className="chip">
                  Acknowledged {formatDate(view.memberAcknowledgedAt) ?? view.memberAcknowledgedAt}
                </span>
              )}
              {typeof view.supersededByVersion === "number" && (
                <span className="chip">Superseded by version {view.supersededByVersion}</span>
              )}
            </div>
            {revisionInReview && (
              <RevisionInReviewNotice state={presentation.state} message={presentation.memberVisibleMessage} />
            )}
            <PublishedBlueprint view={view} />
          </div>
        ) : (
          <WaitingBlueprint presentation={presentation} statuses={statuses} />
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
