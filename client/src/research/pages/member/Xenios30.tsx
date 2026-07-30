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
import { failureText } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchDataTable,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchStatusBadge,
  capabilityStatusOrPending,
  type BadgeTone,
} from "../../ui/kit";
import type {
  PlanPublicationState,
  RecommendationDisposition,
  RecommendationItem,
  TrackerMetricKey,
  Xenios30Plan as ServerXenios30Plan,
} from "@shared/research/member-platform";

// ---------------------------------------------------------------------------
// Xenios 30 (/research/member/xenios-30): the current month working plan,
// drawn from the member's Blueprint.
//
// THE SERVER ENVELOPE (server/research/plans.ts:621, verified, not guessed):
//   GET /api/research/plans/xenios30
//   res.json({ ok: true, current: current ? toXenios30Plan(current) : null, history })
//   history = rows.filter(published | superseded).map(row =>
//     ({ planId: row.id, monthLabel: row.month_label, state: row.state }))
// so the plan lives at `current` (NOT `plan`, NOT `data`) and the version list
// lives at the ENVELOPE's `history`, not inside the plan. `current` is null
// until a plan is published, and that null is the honest pending state.
//
// The plan object is the shared Xenios30Plan (shared/research/
// member-platform.ts:355) serialized by toXenios30Plan (plans.ts:111). It
// carries planId, monthLabel, state, version, fitnessDocumentId,
// nutritionDocumentId, blueprintActions, supplementFoundation,
// productGuidance, adherenceTargets, trackerMetricKeys, checkInDueAt,
// reviewedBy, publishedAt, memberAcknowledgedAt. There is no `fitness` or
// `nutrition` array and no `archived` list, so those sections render the
// honest absence rather than an empty list that implies a blank plan.
//
// Acknowledgment posts to /api/research/plans/xenios30/{planId}/acknowledge
// (plans.ts:639 reads req.params.planId), so the plan's own id is what the
// button sends, and it tolerates an absent endpoint. Supplements are named as
// categories only, never with amounts.
// ---------------------------------------------------------------------------

export interface Xenios30HistoryEntry {
  planId: string;
  monthLabel: string;
  state?: PlanPublicationState | null;
}

// The client view of the server's plan. Names and shapes are exactly the
// server's; every field is optional because the browser must render whatever
// arrives without crashing, and must say so honestly when a field is absent.
export interface Xenios30Plan {
  planId?: string | null;
  monthLabel?: string | null;
  state?: PlanPublicationState | null;
  version?: number | null;
  fitnessDocumentId?: string | null;
  nutritionDocumentId?: string | null;
  blueprintActions?: string[];
  supplementFoundation?: RecommendationItem[];
  productGuidance?: RecommendationItem[];
  adherenceTargets?: { key: string; label: string; target: string }[];
  trackerMetricKeys?: TrackerMetricKey[];
  checkInDueAt?: string | null;
  reviewedBy?: string | null;
  publishedAt?: string | null;
  memberAcknowledgedAt?: string | null;
}

// Compile-time reconciliation with the canonical shape: if the server type
// stops being renderable by this view, tsc fails here instead of a member
// meeting an empty page.
type ServerPlanIsRenderable = ServerXenios30Plan extends Xenios30Plan ? true : never;
export const XENIOS30_SHAPE_RECONCILED: ServerPlanIsRenderable = true;

type Xenios30Envelope = Partial<Xenios30Plan> & {
  ok?: boolean;
  current?: Xenios30Plan | null;
  history?: Array<Partial<Xenios30HistoryEntry>> | null;
  // Tolerated: the admin create/publish routes answer { ok, plan }.
  plan?: Xenios30Plan | null;
  data?: Xenios30Plan | null;
};

export function normalizePlan(body: Xenios30Envelope | null): Xenios30Plan | null {
  if (!body) return null;
  const candidate = body.current ?? body.plan ?? body.data ?? null;
  if (candidate && typeof candidate === "object") return candidate;
  // A flat plan payload is accepted only when it carries the server's own
  // identity field, so an envelope with current:null can never be mistaken
  // for a plan.
  if (typeof body.planId === "string" && body.planId) return body as Xenios30Plan;
  return null;
}

export function normalizeHistory(body: Xenios30Envelope | null): Xenios30HistoryEntry[] {
  if (!body || !Array.isArray(body.history)) return [];
  return body.history.filter(
    (row): row is Xenios30HistoryEntry => Boolean(row && row.planId && row.monthLabel),
  );
}

// Development-only sample so the plan presentation can be reviewed locally.
// It is the server's real shape. In production this is null and the page
// renders the honest pending state.
function samplePlan(): Xenios30Plan {
  return {
    planId: "sample-plan-0001",
    monthLabel: "2026-07",
    state: "published",
    version: 2,
    fitnessDocumentId: "sample-fitness-doc",
    nutritionDocumentId: null,
    blueprintActions: [
      "Four strength sessions each week: upper and lower split, two of each.",
      "Week four is a planned deload: reduce volume, keep the movement pattern.",
      "Protein anchor at every meal.",
    ],
    supplementFoundation: [
      {
        id: "sf-creatine",
        kind: "supplement_foundation",
        title: "Creatine",
        disposition: "recommended",
        explanation: "A daily foundation category carried over from your Blueprint.",
        sourceSignals: ["training frequency"],
      },
    ],
    productGuidance: [
      {
        id: "pg-foundation",
        kind: "product_option",
        title: "Foundation pathway items",
        disposition: "optional",
        explanation: "No new additions until this month's tracker data is reviewed at check-in.",
        sourceSignals: ["blueprint pathway"],
      },
    ],
    adherenceTargets: [
      { key: "training_days", label: "Training days", target: "4 per week" },
      { key: "logged_days", label: "Days logged", target: "25 this month" },
    ],
    trackerMetricKeys: ["plan_adherence", "sleep_and_recovery"],
    checkInDueAt: "2026-07-28T12:00:00.000Z",
    reviewedBy: "Samuel Boadu",
    publishedAt: "2026-07-01T12:00:00.000Z",
    memberAcknowledgedAt: null,
  };
}

function sampleHistory(): Xenios30HistoryEntry[] {
  return [
    { planId: "sample-plan-0000", monthLabel: "2026-06", state: "superseded" },
    { planId: "sample-plan-0001", monthLabel: "2026-07", state: "published" },
  ];
}

const PREPARED_AFTER = "Prepared after your assessment.";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// The server's month label is "YYYY-MM". Anything else is passed through
// untouched rather than reshaped into something the server did not say.
export function formatMonthLabel(value?: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return value;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

function fmtDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// The tracker vocabulary, matching the server's own labels for the same keys
// (server/research/tracker.ts:69). An unrecognized key is humanized, never
// dropped and never renamed into a claim.
const TRACKER_METRIC_LABELS: Record<TrackerMetricKey, string> = {
  plan_adherence: "Plan adherence",
  body_and_appearance: "Body and appearance",
  sleep_and_recovery: "Sleep and recovery",
  energy_stress_vitality: "Energy, stress and vitality",
  performance_and_function: "Performance and function",
  data_completeness: "Data completeness",
};

function trackerMetricLabel(key: string): string {
  return TRACKER_METRIC_LABELS[key as TrackerMetricKey] ?? key.replace(/_/g, " ");
}

const DISPOSITION_PRESENTATION: Record<RecommendationDisposition, { label: string; tone: BadgeTone }> = {
  recommended: { label: "Recommended", tone: "success" },
  optional: { label: "Optional", tone: "info" },
  excluded: { label: "Excluded", tone: "neutral" },
  duplicate_warning: { label: "Duplicate warning", tone: "warning" },
  possible_research_pathway: { label: "Possible research pathway", tone: "info" },
  needs_samuel_review: { label: "In review", tone: "pending" },
  not_available: { label: "Not available", tone: "neutral" },
};

const STATE_LABELS: Record<PlanPublicationState, string> = {
  draft: "Draft",
  samuel_review: "In review",
  published: "Published",
  superseded: "Superseded",
  archived: "Archived",
};

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

function SectionCard({
  title,
  items,
  note,
  testid,
}: {
  title: string;
  items?: string[] | null;
  note?: string;
  testid?: string;
}) {
  const hasItems = Boolean(items && items.length);
  return (
    <section className="card" aria-label={title} data-testid={testid}>
      <h2 className="body-m font-700">{title}</h2>
      {note && <p className="body-s text-ink-mute mt-1">{note}</p>}
      {hasItems ? <ItemList items={items as string[]} /> : <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>}
    </section>
  );
}

// Supplement Foundation and product guidance arrive as RecommendationItem
// objects: a title, a disposition, and the plain-language reason it appears.
// Each one is rendered whole; nothing is reduced to a bare name.
function RecommendationCard({
  title,
  items,
  note,
  testid,
}: {
  title: string;
  items?: RecommendationItem[] | null;
  note?: string;
  testid: string;
}) {
  const rows = items ?? [];
  return (
    <section className="card" aria-label={title} data-testid={testid}>
      <h2 className="body-m font-700">{title}</h2>
      {note && <p className="body-s text-ink-mute mt-1">{note}</p>}
      {rows.length ? (
        <ul className="grid gap-3 mt-3" style={{ paddingLeft: 0, listStyle: "none" }}>
          {rows.map((item, i) => {
            const presentation = item.disposition ? DISPOSITION_PRESENTATION[item.disposition] : undefined;
            return (
              <li key={item.id ?? i} data-testid={`${testid}-item`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="body-s font-700">{item.title}</span>
                  {presentation && <ResearchStatusBadge label={presentation.label} tone={presentation.tone} />}
                </div>
                {item.explanation && <p className="body-s text-ink-2 mt-1">{item.explanation}</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>
      )}
    </section>
  );
}

// Adherence targets are { key, label, target } on the server, so the label and
// its target render together and no target is invented for a missing one.
function AdherenceCard({ targets }: { targets?: Xenios30Plan["adherenceTargets"] }) {
  const rows = targets ?? [];
  return (
    <section className="card" aria-label="Adherence targets" data-testid="x30-adherence">
      <h2 className="body-m font-700">Adherence targets</h2>
      {rows.length ? (
        <ul className="grid gap-2 mt-3" style={{ paddingLeft: 18 }}>
          {rows.map((row, i) => (
            <li key={row.key ?? i} className="body-s text-ink-2">
              <span className="font-700">{row.label}</span>
              {row.target ? <span>: {row.target}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>
      )}
    </section>
  );
}

// The fitness and nutrition plans are documents on the server (a document id,
// not a list of lines). The id itself is internal, so the member is pointed at
// their documents rather than shown a raw reference.
function PlanDocumentCard({
  title,
  documentId,
  present,
  testid,
}: {
  title: string;
  documentId?: string | null;
  present: string;
  testid: string;
}) {
  return (
    <section className="card" aria-label={title} data-testid={testid}>
      <h2 className="body-m font-700">{title}</h2>
      {documentId ? (
        <>
          <p className="body-s text-ink-2 mt-2">{present}</p>
          <div className="mt-3">
            <Link href={MEMBER_ROUTES.documents} className="btn btn-secondary">
              Open your documents
            </Link>
          </div>
        </>
      ) : (
        <p className="body-s text-ink-mute mt-2">{PREPARED_AFTER}</p>
      )}
    </section>
  );
}

function TrackerCard({ metricKeys }: { metricKeys?: TrackerMetricKey[] | null }) {
  const keys = metricKeys ?? [];
  return (
    <section className="card" aria-label="Tracker metrics" data-testid="x30-tracker">
      <h2 className="body-m font-700">Tracker metrics</h2>
      {keys.length ? (
        <>
          <p className="body-s text-ink-2 mt-2">These are the measures your check-in reads. Log them in the tracker.</p>
          <ItemList items={keys.map((key) => trackerMetricLabel(key))} />
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
  const planId = plan.planId ?? null;
  const done = acknowledged || Boolean(plan.memberAcknowledgedAt);

  const acknowledge = useCallback(async () => {
    if (!planId) return;
    setBusy(true);
    setNote(null);
    // The server identifies the plan by path parameter, so the plan's own id
    // is what travels.
    const res: ApiResult<{ ok?: boolean; acknowledgedAt?: string }> = await acknowledgeXenios30(
      planId,
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
    } else {
      setNote(failureText(res, "Acknowledgment needs an active membership."));
    }
    setBusy(false);
  }, [memberToken, planId]);

  return (
    <section className="card" aria-label="Plan acknowledgment" data-testid="x30-acknowledge">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div style={{ minWidth: 0, maxWidth: "52ch" }}>
          <h2 className="body-m font-700">Acknowledge this plan</h2>
          <p className="body-s text-ink-2 mt-1">
            Acknowledging confirms you have read this month's plan. It does not lock anything: questions stay open
            any time.
          </p>
          {done && plan.memberAcknowledgedAt && (
            <p className="body-s text-ink-mute mt-1">Acknowledged {fmtDate(plan.memberAcknowledgedAt)}.</p>
          )}
        </div>
        {done ? (
          <ResearchStatusBadge label="Acknowledged" tone="success" />
        ) : planId ? (
          <button
            type="button"
            className="btn btn-primary"
            data-testid="x30-acknowledge-button"
            onClick={() => void acknowledge()}
            disabled={busy}
          >
            {busy ? "Recording..." : "I have read this plan"}
          </button>
        ) : (
          // No plan id means nothing can be acknowledged yet: say so, never
          // post to an address the server does not have.
          <p className="body-s text-ink-mute" style={{ maxWidth: "34ch" }}>
            Acknowledgment is not open yet. Your plan is unaffected and nothing is wrong with your account.
          </p>
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

// The envelope's `history` lists every published and superseded head as
// { planId, monthLabel, state }. The current month is presented above, so it
// is not repeated here; there is no publish date and no version number in a
// history row, and none is invented.
function HistoryCard({ history, currentPlanId }: { history: Xenios30HistoryEntry[]; currentPlanId?: string | null }) {
  const rows = history.filter((row) => !currentPlanId || row.planId !== currentPlanId);
  return (
    <section className="card" aria-label="Plan history" data-testid="x30-history">
      <h2 className="body-m font-700">Plan history</h2>
      <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
        Every past month stays on record. Ask in questions if you need a copy of an earlier plan.
      </p>
      <div className="mt-3">
        <ResearchDataTable<Xenios30HistoryEntry>
          caption="Earlier Xenios 30 plan versions"
          columns={[
            { key: "month", header: "Month", render: (row) => formatMonthLabel(row.monthLabel) },
            {
              key: "state",
              header: "State",
              render: (row) => (row.state ? STATE_LABELS[row.state] ?? row.state : "On record"),
            },
          ]}
          rows={rows}
          rowKey={(row) => row.planId}
          empty="No earlier versions yet. Your first month is your current month."
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
  let history: Xenios30HistoryEntry[] = [];
  if (result?.kind === "ok") {
    plan = normalizePlan(result.data);
    history = normalizeHistory(result.data);
  }
  if (!plan && result?.kind === "unavailable") {
    plan = devFixture(samplePlan);
    if (plan) history = sampleHistory();
  }

  const monthLabel = formatMonthLabel(plan?.monthLabel);

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title="Xenios 30"
      lead="Your current month, in one working plan: what you train, how you eat, what you take, and what gets measured, all drawn from your Blueprint."
      actions={monthLabel ? <ResearchStatusBadge label={monthLabel} tone="info" /> : undefined}
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
            <div className="flex flex-wrap items-center gap-3" data-testid="x30-chips">
              {typeof plan.version === "number" && <span className="chip">Version {plan.version}</span>}
              {plan.publishedAt && <span className="chip">Published {fmtDate(plan.publishedAt)}</span>}
              {plan.checkInDueAt && <span className="chip">Check-in {fmtDate(plan.checkInDueAt)}</span>}
              {plan.reviewedBy && <span className="chip">Reviewed by {plan.reviewedBy}</span>}
            </div>
            <SectionCard
              title="This month's actions"
              items={plan.blueprintActions}
              note="Carried into this month from your Blueprint."
              testid="x30-actions"
            />
            <PlanDocumentCard
              title="Fitness"
              documentId={plan.fitnessDocumentId}
              present="Your fitness plan for this month is published as a document."
              testid="x30-fitness"
            />
            <PlanDocumentCard
              title="Nutrition"
              documentId={plan.nutritionDocumentId}
              present="Your nutrition plan for this month is published as a document."
              testid="x30-nutrition"
            />
            <RecommendationCard
              title="Supplement Foundation"
              items={plan.supplementFoundation}
              note="Categories and names only. Specific usage details come from your published plan documents."
              testid="x30-supplements"
            />
            <RecommendationCard title="Product guidance" items={plan.productGuidance} testid="x30-products" />
            <AdherenceCard targets={plan.adherenceTargets} />
            <TrackerCard metricKeys={plan.trackerMetricKeys} />
            {plan.checkInDueAt && (
              <section className="card" aria-label="Check-in date" data-testid="x30-checkin">
                <h2 className="body-m font-700">Check-in</h2>
                <p className="body-s text-ink-2 mt-2">
                  Your check-in for this plan is on{" "}
                  <span className="tabular font-700">{fmtDate(plan.checkInDueAt)}</span>. Keep the tracker current so
                  the review reads a real month.
                </p>
              </section>
            )}
            <AcknowledgeCard plan={plan} memberToken={memberToken} />
            <HistoryCard history={history} currentPlanId={plan.planId} />
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
