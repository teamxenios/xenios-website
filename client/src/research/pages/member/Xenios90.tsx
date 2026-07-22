import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
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
// Progression, Consolidation). Data comes from
// GET /api/research/member/plans/xenios-90. The same honesty discipline as
// Xenios 30: every absent section says it is prepared after the assessment,
// and supplements are named as categories only, never with amounts, unless
// the server supplies the approved copy verbatim.
// ---------------------------------------------------------------------------

export interface Xenios90Month {
  index: number;
  focus?: string | null;
  fitness?: string[];
  nutrition?: string[];
  supplementFoundation?: string[];
  productGuidance?: string[];
  adherenceTargets?: string[];
}

export interface Xenios90Plan {
  version?: string | null;
  publishedAt?: string | null;
  horizonLabel?: string | null;
  months?: Xenios90Month[];
}

type Xenios90Envelope = Partial<Xenios90Plan> & {
  ok?: boolean;
  plan?: Xenios90Plan | null;
  data?: Xenios90Plan | null;
};

function normalizePlan(body: Xenios90Envelope | null): Xenios90Plan | null {
  if (!body) return null;
  const candidate = body.plan ?? body.data ?? null;
  if (candidate) return candidate;
  if (body.months || body.version || body.horizonLabel) return body as Xenios90Plan;
  return null;
}

// Development-only sample so the three month presentation can be reviewed
// locally. In production this is null and the page renders the honest
// pending state.
function samplePlan(): Xenios90Plan {
  return {
    version: "2026-Q3",
    publishedAt: "2026-07-01",
    horizonLabel: "July to September 2026",
    months: [
      {
        index: 1,
        focus: "Establish the baseline: consistent training, consistent logging, consistent sleep.",
        fitness: [
          "Four sessions a week on the upper and lower split.",
          "Learn the main lift patterns at controlled loads.",
        ],
        nutrition: ["Protein anchor at every meal.", "Log everything, judge nothing, for the full month."],
        supplementFoundation: ["Creatine (daily foundation category)", "Magnesium (evening category)"],
        productGuidance: ["Foundation pathway items from your Blueprint only."],
        adherenceTargets: ["14 of 16 planned sessions.", "25 logged days."],
      },
      {
        index: 2,
        focus: "Progress the load: build on month one only where the tracker shows readiness.",
        fitness: [
          "Add one working set to the main lifts.",
          "Introduce the conditioning session once weekly.",
        ],
        nutrition: ["Carbohydrates centered on training days.", "Review hydration at mid-month check-in."],
        supplementFoundation: ["Continue the month one foundation categories."],
        productGuidance: ["Recovery pathway reviewed against month one tracker data."],
        adherenceTargets: ["15 of 17 planned sessions.", "26 logged days."],
      },
      {
        index: 3,
        focus: "Consolidate: lock in what worked and set up the next quarter's Blueprint review.",
        fitness: ["Hold month two volume.", "Deload in the final week ahead of the quarterly review."],
        nutrition: ["Hold the month two structure.", "Flag anything unsustainable for the review."],
        supplementFoundation: ["Foundation categories reviewed at the quarterly check-in."],
        productGuidance: ["No new additions in the final two weeks before the review."],
        adherenceTargets: ["14 of 16 planned sessions.", "Quarterly review booked before month end."],
      },
    ],
  };
}

const MONTH_FRAMES: Array<{ index: number; title: string; theme: string }> = [
  { index: 1, title: "Month 1", theme: "Foundation" },
  { index: 2, title: "Month 2", theme: "Progression" },
  { index: 3, title: "Month 3", theme: "Consolidation" },
];

const PREPARED_AFTER = "Prepared after your assessment.";

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

function MonthSection({ title, items, note }: { title: string; items?: string[] | null; note?: string }) {
  const hasItems = Boolean(items && items.length);
  return (
    <div className="mt-4">
      <h3 className="mono-label text-ink-mute">{title}</h3>
      {note && <p className="body-s text-ink-mute mt-1">{note}</p>}
      {hasItems ? <ItemList items={items as string[]} /> : <p className="body-s text-ink-mute mt-1">{PREPARED_AFTER}</p>}
    </div>
  );
}

function MonthCard({
  frame,
  month,
}: {
  frame: { index: number; title: string; theme: string };
  month: Xenios90Month | null;
}) {
  return (
    <section className="card" aria-label={`${frame.title}: ${frame.theme}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="body-m font-700">
          {frame.title} <span className="text-ink-2">· {frame.theme}</span>
        </h2>
        {month ? (
          <ResearchStatusBadge label="Planned" tone="info" />
        ) : (
          <ResearchStatusBadge label="Prepared after assessment" tone="pending" />
        )}
      </div>
      {month?.focus ? (
        <p className="body-s text-ink-2 mt-2 max-w-[56ch]">{month.focus}</p>
      ) : (
        <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>
      )}
      <MonthSection title="Fitness" items={month?.fitness} />
      <MonthSection title="Nutrition" items={month?.nutrition} />
      <MonthSection
        title="Supplement Foundation"
        items={month?.supplementFoundation}
        note="Categories and names only. Specific usage details come from your published plan documents."
      />
      <MonthSection title="Product guidance" items={month?.productGuidance} />
      <MonthSection title="Adherence targets" items={month?.adherenceTargets} />
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

  let plan: Xenios90Plan | null = null;
  if (result?.kind === "ok") plan = normalizePlan(result.data);
  if (!plan && result?.kind === "unavailable") plan = devFixture(samplePlan);

  const monthFor = (index: number): Xenios90Month | null =>
    plan?.months?.find((m) => m.index === index) ?? null;

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
              {plan.version && <span className="chip">Version {plan.version}</span>}
              {plan.publishedAt && <span className="chip">Published {plan.publishedAt}</span>}
            </div>
            {MONTH_FRAMES.map((frame) => (
              <MonthCard key={frame.index} frame={frame} month={monthFor(frame.index)} />
            ))}
            <section className="card" aria-label="How the months connect">
              <h2 className="body-m font-700">How the months connect</h2>
              <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                Xenios 30 is the working month inside this arc. Each month's tracker data shapes the next, and the
                whole quarter feeds your Blueprint review.
              </p>
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
