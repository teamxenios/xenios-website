import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { type ApiResult } from "../../lib/api";
import { acknowledgeXenios30, getXenios30Plan } from "../../adapters/member";
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
  ResearchDataTable,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// Xenios 30 (/research/member/xenios-30): the current month working plan,
// drawn from the member's Blueprint. Data comes from
// GET /api/research/member/plans/xenios-30; the acknowledgment posts to
// /api/research/member/plans/xenios-30/acknowledge and tolerates an absent
// endpoint. Every section is honest about absence and supplements are named
// as categories only, never with amounts, unless the server supplies the
// approved copy verbatim.
// ---------------------------------------------------------------------------

export interface Xenios30Archive {
  version: string;
  monthLabel: string;
  publishedAt?: string | null;
}

export interface Xenios30Plan {
  monthLabel?: string | null;
  version?: string | null;
  publishedAt?: string | null;
  checkInDate?: string | null;
  acknowledgedAt?: string | null;
  fitness?: string[];
  nutrition?: string[];
  supplementFoundation?: string[];
  productGuidance?: string[];
  adherenceTargets?: string[];
  trackerMetrics?: string[];
  archived?: Xenios30Archive[];
}

type Xenios30Envelope = Partial<Xenios30Plan> & {
  ok?: boolean;
  plan?: Xenios30Plan | null;
  data?: Xenios30Plan | null;
};

function normalizePlan(body: Xenios30Envelope | null): Xenios30Plan | null {
  if (!body) return null;
  const candidate = body.plan ?? body.data ?? null;
  if (candidate) return candidate;
  // A flat payload is accepted only when it carries recognizable plan fields.
  if (body.monthLabel || body.fitness || body.nutrition || body.adherenceTargets) {
    return body as Xenios30Plan;
  }
  return null;
}

// Development-only sample so the plan presentation can be reviewed locally.
// In production this is null and the page renders the honest pending state.
function samplePlan(): Xenios30Plan {
  return {
    monthLabel: "July 2026",
    version: "2026-07",
    publishedAt: "2026-07-01",
    checkInDate: "2026-07-28",
    acknowledgedAt: null,
    fitness: [
      "Four strength sessions this month: upper and lower split, two of each per week.",
      "Add one working set to the main lift in weeks two and three.",
      "Week four is a planned deload: reduce volume, keep the movement pattern.",
    ],
    nutrition: [
      "Protein anchor at every meal.",
      "Whole-food carbohydrates concentrated around training days.",
      "One planned flexible meal each week, logged like any other.",
    ],
    supplementFoundation: [
      "Creatine (daily foundation category)",
      "Magnesium (evening category)",
      "Omega-3 (with meals category)",
    ],
    productGuidance: [
      "Stay on the Foundation pathway items from your Blueprint this month.",
      "No new additions until the month's tracker data is reviewed at check-in.",
    ],
    adherenceTargets: [
      "Complete at least 14 of 16 planned sessions.",
      "Log nutrition on at least 25 days.",
      "Keep the sleep window on at least 5 nights each week.",
    ],
    trackerMetrics: ["Morning weight", "Sleep hours", "Training sessions completed", "Daily steps"],
    archived: [
      { version: "2026-06", monthLabel: "June 2026", publishedAt: "2026-06-01" },
      { version: "2026-05", monthLabel: "May 2026", publishedAt: "2026-05-01" },
    ],
  };
}

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

function TrackerCard({ metrics }: { metrics?: string[] | null }) {
  return (
    <section className="card" aria-label="Tracker metrics">
      <h2 className="body-m font-700">Tracker metrics</h2>
      {metrics?.length ? (
        <>
          <p className="body-s text-ink-2 mt-2">These are the measures your check-in reads. Log them in the tracker.</p>
          <ItemList items={metrics} />
        </>
      ) : (
        <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>
      )}
      <div className="mt-4">
        <Link href={MEMBER_ROUTES.tracker} className="btn btn-secondary">
          Open the tracker
        </Link>
      </div>
    </section>
  );
}

function AcknowledgeCard({
  plan,
  memberToken,
}: {
  plan: Xenios30Plan;
  memberToken: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const done = acknowledged || Boolean(plan.acknowledgedAt);

  const acknowledge = useCallback(async () => {
    setBusy(true);
    setNote(null);
    const res: ApiResult<{ ok?: boolean; acknowledgedAt?: string }> = await acknowledgeXenios30(
      plan.version ?? null,
      memberToken,
    );
    if (res.kind === "ok") {
      setAcknowledged(true);
      setNote("Recorded. Thank you.");
    } else if (res.kind === "unavailable") {
      // Acknowledgment tolerates an absent endpoint: nothing is recorded and
      // the member is told exactly that, calmly.
      setNote("Acknowledgment is not open yet. Your plan is unaffected and nothing is wrong with your account.");
    } else if (res.kind === "unauthorized") {
      setNote("Your session has ended. Sign in again to acknowledge this plan.");
    } else if (res.kind === "forbidden") {
      setNote(res.message ?? "Acknowledgment needs an active membership.");
    } else {
      setNote(res.message);
    }
    setBusy(false);
  }, [memberToken, plan.version]);

  return (
    <section className="card" aria-label="Plan acknowledgment">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div style={{ minWidth: 0, maxWidth: "52ch" }}>
          <h2 className="body-m font-700">Acknowledge this plan</h2>
          <p className="body-s text-ink-2 mt-1">
            Acknowledging confirms you have read this month's plan. It does not lock anything: questions stay open
            any time.
          </p>
        </div>
        {done ? (
          <ResearchStatusBadge label="Acknowledged" tone="success" />
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void acknowledge()} disabled={busy}>
            {busy ? "Recording..." : "I have read this plan"}
          </button>
        )}
      </div>
      {note && (
        <p role="status" aria-live="polite" className="body-s text-ink-2 mt-3">
          {note}
        </p>
      )}
    </section>
  );
}

function ArchiveCard({ archived }: { archived?: Xenios30Archive[] }) {
  return (
    <section className="card" aria-label="Archived versions">
      <h2 className="body-m font-700">Archived versions</h2>
      <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
        Every past month stays on record. Ask in questions if you need a copy of an earlier plan.
      </p>
      <div className="mt-3">
        <ResearchDataTable<Xenios30Archive>
          caption="Archived Xenios 30 plan versions"
          columns={[
            { key: "month", header: "Month", render: (row) => row.monthLabel },
            { key: "version", header: "Version", render: (row) => <span className="tabular">{row.version}</span> },
            { key: "published", header: "Published", render: (row) => row.publishedAt ?? "On record" },
          ]}
          rows={archived ?? []}
          rowKey={(row) => row.version}
          empty="No archived versions yet. Your first month is your current month."
        />
      </div>
    </section>
  );
}

export default function Xenios30Page() {
  const { member, memberToken, memberChecking } = useResearch();
  const [result, setResult] = useState<ApiResult<Xenios30Envelope> | null>(null);
  const [statuses, setStatuses] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    const [caps, res] = await Promise.all([
      fetchCapabilities(memberToken),
      getXenios30Plan<Xenios30Envelope>(memberToken),
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

  let plan: Xenios30Plan | null = null;
  if (result?.kind === "ok") plan = normalizePlan(result.data);
  if (!plan && result?.kind === "unavailable") plan = devFixture(samplePlan);

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title="Xenios 30"
      lead="Your current month, in one working plan: what you train, how you eat, what you take, and what gets measured, all drawn from your Blueprint."
      actions={
        plan?.monthLabel ? <ResearchStatusBadge label={plan.monthLabel} tone="info" /> : undefined
      }
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={result?.kind === "error" ? result.message : undefined}
        onRetry={load}
        unavailableTitle="Xenios 30 is available with an active membership."
        unavailableBody={result?.kind === "forbidden" ? result.message : "Nothing is wrong with your account."}
      >
        {plan ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {plan.version && <span className="chip">Version {plan.version}</span>}
              {plan.publishedAt && <span className="chip">Published {plan.publishedAt}</span>}
              {plan.checkInDate && <span className="chip">Check-in {plan.checkInDate}</span>}
            </div>
            <SectionCard title="Fitness" items={plan.fitness} />
            <SectionCard title="Nutrition" items={plan.nutrition} />
            <SectionCard
              title="Supplement Foundation"
              items={plan.supplementFoundation}
              note="Categories and names only. Specific usage details come from your published plan documents."
            />
            <SectionCard title="Product guidance" items={plan.productGuidance} />
            <SectionCard title="Adherence targets" items={plan.adherenceTargets} />
            <TrackerCard metrics={plan.trackerMetrics} />
            {plan.checkInDate && (
              <section className="card" aria-label="Check-in date">
                <h2 className="body-m font-700">Check-in</h2>
                <p className="body-s text-ink-2 mt-2">
                  Your check-in for this plan is on <span className="tabular font-700">{plan.checkInDate}</span>. Keep
                  the tracker current so the review reads a real month.
                </p>
              </section>
            )}
            <AcknowledgeCard plan={plan} memberToken={memberToken} />
            <ArchiveCard archived={plan.archived} />
          </div>
        ) : (
          <ResearchCapabilityBoundary status={capabilityStatusOrPending(statuses, "blueprint")}>
            <ResearchEmptyState
              title="Your Xenios 30 plan is prepared after your Blueprint."
              body="Complete your assessment, and once your Blueprint is published your first monthly plan appears here."
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
