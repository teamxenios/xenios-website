import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
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
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// The member Blueprint (/research/member/blueprint). The Blueprint moves
// through a small, honest state machine and this page presents exactly where
// it is. Data comes from GET /api/research/member/blueprint; when the
// endpoint is absent the page renders the assessment_due state with a CTA to
// the assessment. Nothing here invents server facts: every section that has
// no data says it is prepared after the assessment.
// ---------------------------------------------------------------------------

export type BlueprintState =
  | "assessment_due"
  | "preliminary"
  | "samuel_review"
  | "more_information_needed"
  | "published"
  | "updated";

export interface BlueprintQuestion {
  id: string;
  question: string;
  askedAt?: string | null;
  context?: string | null;
}

export interface BlueprintReviewEvent {
  at: string;
  title: string;
  detail?: string;
}

export interface BlueprintData {
  state: BlueprintState;
  version?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  primaryGoal?: string | null;
  secondaryGoals?: string[];
  topPriorities?: string[];
  lifestyleFoundation?: string[];
  fitnessPlan?: string[];
  nutritionPlan?: string[];
  supplementFoundation?: string[];
  productPathways?: string[];
  exclusions?: string[];
  duplicateWarnings?: string[];
  questionsNeedingReview?: BlueprintQuestion[];
  reviewHistory?: BlueprintReviewEvent[];
}

// The server may wrap the payload; accept the common envelopes and refuse to
// guess beyond them.
type BlueprintEnvelope = Partial<BlueprintData> & {
  ok?: boolean;
  blueprint?: BlueprintData | null;
  data?: BlueprintData | null;
};

const BLUEPRINT_STATES: BlueprintState[] = [
  "assessment_due",
  "preliminary",
  "samuel_review",
  "more_information_needed",
  "published",
  "updated",
];

function normalizeBlueprint(body: BlueprintEnvelope | null): BlueprintData | null {
  if (!body) return null;
  const candidate = body.blueprint ?? body.data ?? (body.state ? (body as BlueprintData) : null);
  if (!candidate || !candidate.state) return null;
  if (!BLUEPRINT_STATES.includes(candidate.state)) return null;
  return candidate;
}

// Development-only sample so the published presentation can be reviewed
// locally. In production this is null and the page renders the honest
// assessment_due state instead.
function sampleBlueprint(): BlueprintData {
  return {
    state: "published",
    version: "1.0",
    publishedAt: "2026-07-14",
    primaryGoal: "Recomposition: build strength while trimming body fat over the next two quarters.",
    secondaryGoals: [
      "Sleep seven or more hours on at least five nights a week.",
      "Keep training consistency above ninety percent through travel weeks.",
    ],
    topPriorities: [
      "Protein anchor at every meal.",
      "Three strength sessions plus one conditioning session weekly.",
      "A fixed wind-down time on work nights.",
    ],
    lifestyleFoundation: [
      "Morning light exposure within an hour of waking.",
      "A consistent sleep window, including weekends.",
      "Daily step floor of 8,000 steps.",
    ],
    fitnessPlan: [
      "Upper and lower split, four days a week.",
      "Progressive overload on the main lifts, reviewed monthly.",
      "One deload week each training block.",
    ],
    nutritionPlan: [
      "Protein-forward plate structure at each meal.",
      "Whole-food carbohydrates centered around training days.",
      "Hydration target reviewed at each check-in.",
    ],
    supplementFoundation: [
      "Creatine (daily foundation category)",
      "Magnesium (evening category)",
      "Omega-3 (with meals category)",
    ],
    productPathways: [
      "Foundation pathway: start with the core catalog items your assessment flagged as relevant.",
      "Recovery pathway: reviewed again after your first month of tracker data.",
    ],
    exclusions: ["No stimulant-category products after 2 pm, per your sleep priority."],
    duplicateWarnings: ["Magnesium appears in two catalog bundles. Choose one source, not both."],
    questionsNeedingReview: [
      {
        id: "q-travel",
        question: "How many travel days do you expect next month?",
        askedAt: "2026-07-12",
        context: "This shapes the fallback training template.",
      },
    ],
    reviewHistory: [
      { at: "2026-07-10", title: "Assessment received", detail: "All required sections complete." },
      { at: "2026-07-12", title: "Preliminary draft assembled" },
      { at: "2026-07-13", title: "Reviewed by Samuel", detail: "One clarification requested, then approved." },
      { at: "2026-07-14", title: "Published", detail: "Version 1.0." },
    ],
  };
}

// ---------------------------------------------------------------------------
// State machine presentation
// ---------------------------------------------------------------------------

const STEPS: Array<{
  key: BlueprintState;
  label: string;
  detail: string;
  conditional?: boolean;
  conditionalLabel?: string;
}> = [
  {
    key: "assessment_due",
    label: "Assessment due",
    detail: "Complete your assessment so your Blueprint can be drafted from your own answers.",
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

function stepBadge(stepIndex: number, currentIndex: number, conditional: boolean, conditionalLabel?: string) {
  if (stepIndex === currentIndex) return <ResearchStatusBadge label="Current" tone="info" />;
  if (conditional) return <ResearchStatusBadge label={conditionalLabel ?? "Only if needed"} tone="neutral" />;
  if (stepIndex < currentIndex) return <ResearchStatusBadge label="Done" tone="success" />;
  return <ResearchStatusBadge label="Upcoming" tone="pending" />;
}

function BlueprintStateRail({ current }: { current: BlueprintState }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);
  return (
    <section className="card" aria-label="Blueprint progress">
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
// Section presentation. Every section is honest about absence: no data means
// "Prepared after your assessment.", never invented content.
// ---------------------------------------------------------------------------

const PREPARED_AFTER = "Prepared after your assessment.";

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

function SectionCard({ title, items, note }: { title: string; items?: string[] | null; note?: string }) {
  const hasItems = Boolean(items && items.length);
  return (
    <section className="card" aria-label={title}>
      <h2 className="body-m font-700">{title}</h2>
      {note && <p className="body-s text-ink-mute mt-1">{note}</p>}
      {hasItems ? <ItemList items={items as string[]} /> : <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>}
    </section>
  );
}

function GoalsCard({ data }: { data: BlueprintData }) {
  const hasAny = Boolean(data.primaryGoal || data.secondaryGoals?.length);
  return (
    <section className="card" aria-label="Primary and secondary goals">
      <h2 className="body-m font-700">Primary and secondary goals</h2>
      {!hasAny && <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>}
      {data.primaryGoal && (
        <div className="mt-3">
          <p className="mono-label text-ink-mute">Primary</p>
          <p className="body-s text-ink-2 mt-1">{data.primaryGoal}</p>
        </div>
      )}
      {data.secondaryGoals?.length ? (
        <div className="mt-3">
          <p className="mono-label text-ink-mute">Secondary</p>
          <ItemList items={data.secondaryGoals} />
        </div>
      ) : null}
    </section>
  );
}

function ExclusionsCard({ data }: { data: BlueprintData }) {
  const hasAny = Boolean(data.exclusions?.length || data.duplicateWarnings?.length);
  return (
    <section className="card" aria-label="Exclusions and duplicate warnings">
      <h2 className="body-m font-700">Exclusions and duplicate warnings</h2>
      {!hasAny && <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>}
      {data.exclusions?.length ? (
        <div className="mt-3">
          <p className="mono-label text-ink-mute">Exclusions</p>
          <ItemList items={data.exclusions} />
        </div>
      ) : null}
      {data.duplicateWarnings?.length ? (
        <div className="mt-3">
          <p className="mono-label text-ink-mute">Duplicate warnings</p>
          <ItemList items={data.duplicateWarnings} />
        </div>
      ) : null}
    </section>
  );
}

function QuestionsCard({ questions }: { questions?: BlueprintQuestion[] }) {
  return (
    <section className="card" aria-label="Questions needing review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="body-m font-700">Questions needing review</h2>
        {questions?.length ? (
          <ResearchStatusBadge label={`${questions.length} open`} tone="warning" />
        ) : (
          <ResearchStatusBadge label="None open" tone="success" />
        )}
      </div>
      {questions?.length ? (
        <ul className="grid gap-3 mt-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {questions.map((q) => (
            <li key={q.id}>
              <p className="body-s font-700">{q.question}</p>
              {q.context && <p className="body-s text-ink-2 mt-1">{q.context}</p>}
              {q.askedAt && <p className="mono-label text-ink-mute mt-1">Asked {q.askedAt}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="body-s text-ink-mute mt-2">Nothing is waiting on you right now.</p>
      )}
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

function PublishedBlueprint({ data }: { data: BlueprintData }) {
  return (
    <div className="grid gap-4">
      <GoalsCard data={data} />
      <SectionCard title="Top priorities" items={data.topPriorities} />
      <SectionCard title="Lifestyle foundation" items={data.lifestyleFoundation} />
      <SectionCard title="Fitness plan" items={data.fitnessPlan} />
      <SectionCard title="Nutrition plan" items={data.nutritionPlan} />
      <SectionCard
        title="Supplement Foundation"
        items={data.supplementFoundation}
        note="Categories and names only. Specific usage details come from your published plan documents."
      />
      <SectionCard title="Product pathways" items={data.productPathways} />
      <ExclusionsCard data={data} />
      <PlanLinksCard />
      <QuestionsCard questions={data.questionsNeedingReview} />
      <section className="card" aria-label="Review history">
        <h2 className="body-m font-700">Review history</h2>
        <div className="mt-3">
          <ResearchTimeline items={data.reviewHistory ?? []} />
        </div>
      </section>
    </div>
  );
}

// The presentation for every not-yet-published state: the rail plus a card
// explaining exactly what happens next.
function WaitingBlueprint({
  data,
  statuses,
}: {
  data: BlueprintData;
  statuses: Map<ResearchCapability, CapabilityStatus> | null;
}) {
  const current = STEPS.find((step) => step.key === data.state);
  return (
    <div className="grid gap-4">
      <BlueprintStateRail current={data.state} />
      {data.state === "assessment_due" ? (
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
        <section className="card" role="status" aria-live="polite" aria-label="What happens next">
          <h2 className="body-m font-700">{current?.label ?? "In progress"}</h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">{current?.detail}</p>
          {data.state === "more_information_needed" && (
            <div className="mt-4">
              <Link href={MEMBER_ROUTES.questions} className="btn btn-primary">
                Answer the open questions
              </Link>
            </div>
          )}
        </section>
      )}
      {data.state === "more_information_needed" && <QuestionsCard questions={data.questionsNeedingReview} />}
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
  let data: BlueprintData | null = null;
  if (result?.kind === "ok") data = normalizeBlueprint(result.data);
  if (!data && result?.kind === "unavailable") data = devFixture(sampleBlueprint);
  if (!data) data = { state: "assessment_due" };

  const isPublished = data.state === "published" || data.state === "updated";

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title="Your Blueprint"
      lead="The single document your program is built from: your goals, your foundations, and the plan pathways drawn from your own assessment."
      actions={
        isPublished ? (
          <ResearchStatusBadge
            label={data.state === "updated" ? "Updated" : "Published"}
            tone="success"
          />
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
        {isPublished ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {data.version && <span className="chip">Version {data.version}</span>}
              {data.publishedAt && <span className="chip">Published {data.publishedAt}</span>}
              {data.state === "updated" && data.updatedAt && <span className="chip">Updated {data.updatedAt}</span>}
            </div>
            <PublishedBlueprint data={data} />
          </div>
        ) : (
          <WaitingBlueprint data={data} statuses={statuses} />
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
