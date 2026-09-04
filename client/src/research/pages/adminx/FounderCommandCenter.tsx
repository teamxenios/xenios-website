import { Link } from "wouter";
import {
  FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS,
  FOUNDER_COMMAND_CENTER_AREA_DEFINITIONS,
  type FounderCommandCenterAreaDefinition,
  type FounderCommandCenterAreaId,
  type FounderCommandCenterCard,
  type FounderCommandCenterCountMetric,
  type FounderCommandCenterFact,
  type FounderCommandCenterResponse,
} from "@shared/research/founder-command-center";
import { getFounderCommandCenter } from "../../adapters/founderCommandCenter";
import {
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../../ui/kit";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

const SAFE_ACTION_HREFS = new Set<string>(
  FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS,
);

const AREA_DEFINITIONS = new Map<
  FounderCommandCenterAreaId,
  FounderCommandCenterAreaDefinition
>(
  FOUNDER_COMMAND_CENTER_AREA_DEFINITIONS.map((definition) => [
    definition.area,
    definition,
  ]),
);

const BREAKDOWN_LABELS: Readonly<Record<string, string>> = {
  "applications.new": "New",
  "applications.review": "Under review",
  "applications.information": "Needs information",
  "applications.payment": "Approved / payment pending",
  "care.attention": "Attention required",
  "care.notification_failed": "Notification failed",
  "care.notification_unknown": "Notification unknown",
  "care.data_quality": "Data quality review",
  "assisted.submitted": "Submitted",
  "assisted.reviewing": "Reviewing",
  "assisted.waiting_on_customer": "Waiting on customer",
  "products.draft": "Draft",
  "products.review": "In review",
  "products.approved": "Approved",
  "required_inputs.blocking": "Blocking",
  "required_inputs.informational": "Informational",
  "support.overdue": "Past SLA target",
};

const FACT_LABELS: Readonly<Record<string, string>> = {
  "assisted.quote_state": "Quote-specific queue",
  "payment.other_states": "Other payment states",
  "products.variant_union": "Variant readiness union",
  "referrals.v1_totals": "Referral V1 lifecycle totals",
  "referrals.money": "Commission and payout readiness",
  "support.queue_api": "Dedicated admin queue API",
  "system.email_provider": "Email provider",
  "system.worker": "Outbox worker liveness",
  "system.global_health": "All-service health",
  "release.runtime_sha": "Runtime SHA",
  "release.production_sha": "Last verified production SHA",
  "release.production_observed_at": "Production observed at",
  "release.production_verification": "Production verification",
  "release.sor_source_sha": "SOR source SHA",
  "release.working_sha": "Working-tree SHA",
  "release.active_candidate": "Active release candidate",
};

const RELEASE_STATUSES = new Set([
  "source_present",
  "mounted",
  "focused_tests_pass",
  "full_suite_pass",
  "browser_verified",
  "built_not_deployed",
  "deployed_not_authenticated_smoked",
  "live_verified",
  "feature_gated",
  "blocked_external",
  "superseded",
  "unknown",
]);

const SOURCE_PRESENTATION: Record<
  FounderCommandCenterCard["source"]["state"],
  { label: string; tone: BadgeTone }
> = {
  current: { label: "Current", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  feature_gated: { label: "Feature gated", tone: "pending" },
  unavailable: { label: "Unavailable", tone: "neutral" },
};

const ATTENTION_PRESENTATION: Record<
  FounderCommandCenterCard["attention"]["severity"],
  { label: string; tone: BadgeTone }
> = {
  none: { label: "No attention", tone: "success" },
  info: { label: "Information", tone: "info" },
  warning: { label: "Attention", tone: "warning" },
  critical: { label: "Critical", tone: "danger" },
  unknown: { label: "Unknown", tone: "neutral" },
};

const ATTENTION_COPY: Record<
  FounderCommandCenterCard["attention"]["severity"],
  string
> = {
  none: "The source reports no additional attention in this scoped snapshot.",
  info: "The owning workflow reports additional operational context.",
  warning: "The owning workflow reports items requiring an operator-owned next step.",
  critical: "The owning workflow reports critical attention requiring prompt review.",
  unknown: "A current attention determination is unavailable.",
};

function countedAttention(
  card: FounderCommandCenterCard,
  singular: string,
  plural = `${singular}s`,
): string {
  const value = card.primaryCount.value;
  if (card.primaryCount.state === "unavailable" || value === null) {
    return "The owning workflow reports items requiring an operator-owned next step.";
  }
  return `${value} ${value === 1 ? singular : plural} ${
    value === 1 ? "requires" : "require"
  } an operator-owned next step.`;
}

const ATTENTION_CODE_COPY: Readonly<
  Record<string, (card: FounderCommandCenterCard) => string>
> = {
  none: () => "No items are reported as requiring an operator-owned next step in this exact scope.",
  source_unavailable: () => "A current privacy-safe summary is unavailable for this workflow.",
  applications_open: (card) => countedAttention(card, "application"),
  care_projection_bounded: () =>
    "The Care projection reached its safety cap, so its counts are bounded and a zero is not inferred.",
  care_attention: () => "The Care workflow reports requests with a canonical attention reason.",
  assisted_orders_open: (card) => countedAttention(card, "assisted request"),
  payment_review_open: (card) => countedAttention(card, "payment review"),
  settled_queue_unavailable: () =>
    "Fulfillment demand cannot be inferred because the settled work-list authority is unavailable.",
  fulfillment_waiting: (card) => countedAttention(card, "fulfillment item"),
  exceptions_open: (card) => countedAttention(card, "exception"),
  product_lifecycle_open: (card) => countedAttention(card, "product"),
  product_source_partial: () =>
    "Lifecycle work is counted, but variant readiness is not represented in this summary.",
  draft_prices_open: (card) => countedAttention(card, "draft price"),
  required_inputs_open: (card) => countedAttention(card, "required input"),
  referral_flags_open: (card) => countedAttention(card, "referral flag"),
  referral_source_partial: () =>
    "The fraud-review queue is available, but broader referral lifecycle totals remain unavailable.",
  support_overdue: () => "The support workflow reports open questions past their SLA target.",
  support_open: (card) => countedAttention(card, "support question"),
  notification_failures: (card) => countedAttention(card, "notification failure"),
  system_source_partial: () =>
    "Notification failures are counted, but worker and all-service health remain unproven.",
  email_provider_unavailable: () =>
    "The canonical email configuration resolver reports no available provider.",
  release_blockers_unavailable: () =>
    "Last-verified release facts are shown, but current blockers and candidate state are unavailable.",
};

function attentionCopy(card: FounderCommandCenterCard): string {
  return ATTENTION_CODE_COPY[card.attention.code]?.(card) ??
    ATTENTION_COPY[card.attention.severity];
}

const UNSAFE_ACTION_LABEL =
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:bearer|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+|\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b)/i;
const EMAIL_LIKE_TEXT =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function safeActionLabel(value: string): string | null {
  const text = value?.trim();
  if (
    !text ||
    CONTROL_CHARACTERS.test(text) ||
    EMAIL_LIKE_TEXT.test(text) ||
    UNSAFE_ACTION_LABEL.test(text)
  ) {
    return null;
  }
  return text;
}

function areaDefinition(
  area: FounderCommandCenterAreaId,
): FounderCommandCenterAreaDefinition {
  // `area` is parsed by the shared enum and the map is built from that same
  // tuple. Keep an explicit guard so a future contract drift fails closed.
  const definition = AREA_DEFINITIONS.get(area);
  if (!definition) throw new Error("Unknown command-center area");
  return definition;
}

function canonicalBreakdownLabel(key: string, index: number): string {
  return BREAKDOWN_LABELS[key] ?? `Additional count ${index + 1}`;
}

function canonicalFactLabel(key: string, index: number): string {
  return FACT_LABELS[key] ?? `Additional verified fact ${index + 1}`;
}

function safeFactValue(fact: FounderCommandCenterFact): string {
  if (fact.state === "unavailable" || fact.value === null) return "Unavailable";
  if (fact.key === "system.email_provider") {
    return fact.value === "Configured" ? "Configured" : "Unavailable";
  }
  if (
    fact.key === "release.runtime_sha" ||
    fact.key === "release.production_sha" ||
    fact.key === "release.sor_source_sha"
  ) {
    return /^[0-9a-f]{40}$/u.test(fact.value) ? fact.value : "Unavailable";
  }
  if (fact.key === "release.production_observed_at") {
    return fmtDateTime(fact.value) || "Unavailable";
  }
  if (fact.key === "release.production_verification") {
    return RELEASE_STATUSES.has(fact.value) ? fact.value.replaceAll("_", " ") : "Unavailable";
  }
  return "Unavailable";
}

function safeActionHref(href: string): string | null {
  return SAFE_ACTION_HREFS.has(href) ? href : null;
}

function metricValue(metric: FounderCommandCenterCountMetric): string {
  if (metric.state === "unavailable" || metric.value === null) {
    return "Unavailable";
  }
  return String(metric.value);
}

function MetricStateBadge({
  state,
}: {
  state: FounderCommandCenterCountMetric["state"];
}) {
  if (state === "unavailable") {
    return <ResearchStatusBadge label="Unavailable" tone="neutral" />;
  }
  if (state === "bounded") {
    return <ResearchStatusBadge label="Bounded" tone="info" />;
  }
  return <ResearchStatusBadge label="Exact" tone="success" />;
}

function BreakdownMetric({
  area,
  index,
  metric,
}: {
  area: FounderCommandCenterAreaId;
  index: number;
  metric: FounderCommandCenterCountMetric;
}) {
  return (
    <div className="min-w-0" data-testid={`command-center-breakdown-${area}-${index}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <dt className="body-s font-700">{canonicalBreakdownLabel(metric.key, index)}</dt>
        <MetricStateBadge state={metric.state} />
      </div>
      <dd className="body-m tabular mt-1" style={{ overflowWrap: "anywhere" }}>
        {metricValue(metric)}
      </dd>
      <dd className="body-s text-ink-mute mt-1" style={{ overflowWrap: "anywhere" }}>
        A scoped subcount from the owning workflow.
      </dd>
    </div>
  );
}

function FactRow({
  area,
  fact,
  index,
}: {
  area: FounderCommandCenterAreaId;
  fact: FounderCommandCenterFact;
  index: number;
}) {
  const stateLabel =
    fact.state === "current"
      ? "Current"
      : fact.state === "last_verified"
        ? "Last verified"
        : "Unavailable";
  const tone: BadgeTone =
    fact.state === "current"
      ? "success"
      : fact.state === "last_verified"
        ? "info"
        : "neutral";
  return (
    <div className="min-w-0" data-testid={`command-center-fact-${area}-${index}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <dt className="body-s font-700">{canonicalFactLabel(fact.key, index)}</dt>
        <ResearchStatusBadge label={stateLabel} tone={tone} />
      </div>
      <dd className="body-s text-ink-2 mt-1" style={{ overflowWrap: "anywhere" }}>
        {safeFactValue(fact)}
      </dd>
    </div>
  );
}

function OldestWaiting({
  card,
  definition,
}: {
  card: FounderCommandCenterCard;
  definition: FounderCommandCenterAreaDefinition;
}) {
  const oldest = card.oldestWaiting;
  const href = safeActionHref(definition.workflowHref);
  const label =
    oldest.state === "available"
      ? fmtDateTime(oldest.since) || "Unavailable"
      : oldest.state === "not_applicable"
        ? "Not applicable"
        : "Unavailable";

  return (
    <div className="min-w-0">
      <dt className="mono-label text-ink-mute">Oldest waiting</dt>
      <dd className="body-s text-ink-2 mt-1" style={{ overflowWrap: "anywhere" }}>
        {oldest.state === "available" && href ? (
          <Link href={href} className="underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </dd>
    </div>
  );
}

function WorkflowLink({
  href,
  label,
  emphasis = false,
}: {
  href: string;
  label: string;
  emphasis?: boolean;
}) {
  const safeHref = safeActionHref(href);
  const safeLabel = safeActionLabel(label);
  if (!safeHref || !safeLabel) {
    return <span className="body-s text-ink-mute">Unavailable</span>;
  }
  return (
    <Link
      href={safeHref}
      className={emphasis ? "btn btn-secondary" : "body-s underline text-ink-mute"}
      style={{
        minHeight: emphasis ? 44 : undefined,
        width: emphasis ? "100%" : undefined,
        whiteSpace: "normal",
        overflowWrap: "anywhere",
      }}
    >
      {safeLabel}
    </Link>
  );
}

function CommandCenterCard({ card }: { card: FounderCommandCenterCard }) {
  const definition = areaDefinition(card.area);
  const source = SOURCE_PRESENTATION[card.source.state];
  const attention = ATTENTION_PRESENTATION[card.attention.severity];
  const headingId = `command-center-${card.area}-heading`;

  return (
    <article
      className="card min-w-0 flex flex-col"
      aria-labelledby={headingId}
      data-testid={`command-center-card-${card.area}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="mono-label text-ink-mute">Needs attention</p>
          <h2 id={headingId} className="body-l font-700 mt-1" style={{ overflowWrap: "anywhere" }}>
            {definition.label}
          </h2>
        </div>
        <ResearchStatusBadge label={source.label} tone={source.tone} />
      </div>

      <p className="display-s tabular mt-5" style={{ overflowWrap: "anywhere" }}>
        {metricValue(card.primaryCount)}
      </p>
      <div className="mt-2">
        <MetricStateBadge state={card.primaryCount.state} />
      </div>
      <p className="body-s text-ink-2 mt-3" style={{ overflowWrap: "anywhere" }}>
        {definition.scope}
      </p>
      <p className="body-s text-ink-mute mt-2" style={{ overflowWrap: "anywhere" }}>
        Count scope: current records reported by the owning workflow.
      </p>

      <section className="mt-5" aria-label={`${definition.label} attention`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="mono-label text-ink-mute">Attention</p>
          <ResearchStatusBadge label={attention.label} tone={attention.tone} />
        </div>
        <p className="body-s text-ink-2 mt-2" style={{ overflowWrap: "anywhere" }}>
          {attentionCopy(card)}
        </p>
      </section>

      <dl
        className="grid gap-4 mt-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}
      >
        <OldestWaiting card={card} definition={definition} />
        <div className="min-w-0">
          <dt className="mono-label text-ink-mute">Source authority</dt>
          <dd className="body-s text-ink-2 mt-1" style={{ overflowWrap: "anywhere" }}>
            {card.source.state === "unavailable"
              ? "Unavailable"
              : definition.workflowLabel}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="mono-label text-ink-mute">Observed</dt>
          <dd className="body-s text-ink-2 mt-1" style={{ overflowWrap: "anywhere" }}>
            {card.source.observedAt
              ? fmtDateTime(card.source.observedAt) || "Unavailable"
              : "Unavailable"}
          </dd>
        </div>
      </dl>

      {card.breakdown.length > 0 ? (
        <section className="mt-5" aria-label={`${definition.label} breakdown`}>
          <h3 className="body-s font-700">Breakdown</h3>
          <dl
            className="grid gap-4 mt-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}
          >
            {card.breakdown.map((metric, index) => (
              <BreakdownMetric
                key={`${card.area}-${index}`}
                area={card.area}
                index={index}
                metric={metric}
              />
            ))}
          </dl>
        </section>
      ) : null}

      {card.facts.length > 0 ? (
        <section className="mt-5" aria-label={`${definition.label} facts`}>
          <h3 className="body-s font-700">Verified facts</h3>
          <dl
            className="grid gap-4 mt-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}
          >
            {card.facts.map((fact, index) => (
              <FactRow
                key={`${card.area}-${index}`}
                area={card.area}
                fact={fact}
                index={index}
              />
            ))}
          </dl>
        </section>
      ) : null}

      <div className="mt-6 pt-4 flex flex-col items-stretch gap-3" style={{ marginTop: "auto" }}>
        <p className="body-s text-ink-mute">
          Owning workflow:{" "}
          <WorkflowLink
            href={definition.workflowHref}
            label={definition.workflowLabel}
          />
        </p>
        <WorkflowLink
          href={definition.workflowHref}
          label={definition.actionLabel}
          emphasis
        />
      </div>
    </article>
  );
}

function CommandCenterSnapshot({ data }: { data: FounderCommandCenterResponse }) {
  return (
    <div data-testid="founder-command-center">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <ResearchSecureNotice>
          Read-only operational aggregate. It contains no person, account,
          order, payment, Care, supplier, or referral identifiers.
        </ResearchSecureNotice>
        <div className="text-right min-w-0">
          <ResearchStatusBadge label="Read only" tone="info" />
          <p className="body-s text-ink-mute mt-2" style={{ overflowWrap: "anywhere" }}>
            Generated {fmtDateTime(data.generatedAt) || "Unavailable"}
          </p>
        </div>
      </div>

      <section
        className="grid gap-4 mt-6 min-w-0"
        aria-label="Founder operational areas"
        style={{
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
        }}
      >
        {data.cards.map((card) => (
          <CommandCenterCard key={card.area} card={card} />
        ))}
      </section>
    </div>
  );
}

export function FounderCommandCenterBody({ token }: { token: string }) {
  const resource = useAdminResource(token, getFounderCommandCenter);
  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="Unavailable"
      unavailableBody="The read-only command-center aggregate is not available in this environment. No operational total is inferred."
    >
      {resource.data ? <CommandCenterSnapshot data={resource.data} /> : null}
    </AdminBoundary>
  );
}

export default function FounderCommandCenter() {
  return (
    <AdminScreen
      title="Founder command center"
      lead="A privacy-minimal, read-only operating picture across the canonical Research workflows. Each destination rechecks admin authority."
    >
      {(token) => <FounderCommandCenterBody token={token} />}
    </AdminScreen>
  );
}
