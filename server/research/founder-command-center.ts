import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import {
  FOUNDER_COMMAND_CENTER_AREA_DEFINITIONS,
  FOUNDER_COMMAND_CENTER_AREA_IDS,
  founderCommandCenterCardSchema,
  founderCommandCenterCountMetricSchema,
  founderCommandCenterFactSchema,
  founderCommandCenterResponseSchema,
  type FounderCommandCenterAreaId,
  type FounderCommandCenterCard,
  type FounderCommandCenterCountMetric,
  type FounderCommandCenterFact,
  type FounderCommandCenterResponse,
} from "@shared/research/founder-command-center";
import { requireSupabaseAdmin } from "../routes";

const DEFAULT_SOURCE_TIMEOUT_MS = 4_000;

const timestampSchema = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");

const sourceOldestWaitingSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("available"), since: timestampSchema }).strict(),
  z
    .object({
      state: z.enum(["unavailable", "not_applicable"]),
      since: z.null(),
    })
    .strict(),
]);

const sourceSnapshotSchema = z
  .object({
    source: z
      .object({
        state: z.enum(["current", "partial", "feature_gated", "unavailable"]),
        authority: z.string().min(1).max(160),
        observedAt: timestampSchema.nullable(),
      })
      .strict(),
    primaryCount: founderCommandCenterCountMetricSchema,
    breakdown: z.array(founderCommandCenterCountMetricSchema).max(12),
    facts: z.array(founderCommandCenterFactSchema).max(12),
    oldestWaiting: sourceOldestWaitingSchema,
    attention: z
      .object({
        severity: z.enum(["none", "info", "warning", "critical", "unknown"]),
        code: z.string().min(1).max(64),
        reason: z.string().min(1).max(320),
      })
      .strict(),
  })
  .strict();

export type FounderCommandCenterSourceSnapshot = z.infer<
  typeof sourceSnapshotSchema
>;

export type FounderCommandCenterSourceContext = Readonly<{
  /** Present for the HTTP door; sources that do not need viewer context ignore it. */
  request: Request | null;
}>;

export type FounderCommandCenterSource = (
  context: FounderCommandCenterSourceContext,
) => Promise<
  FounderCommandCenterSourceSnapshot
>;

export type FounderCommandCenterSources = Partial<
  Readonly<Record<FounderCommandCenterAreaId, FounderCommandCenterSource>>
>;

export type FounderCommandCenterBuildOptions = Readonly<{
  timeoutMs?: number;
  now?: () => Date;
  request?: Request;
}>;

export type FounderCommandCenterRegistrationOptions =
  FounderCommandCenterBuildOptions &
    Readonly<{
      /** Test seam only. Production registration omits this and uses the canonical guard. */
      requireAdmin?: RequestHandler;
    }>;

export function exactCount(
  key: string,
  label: string,
  value: number,
  scope: string,
): FounderCommandCenterCountMetric {
  return { key, label, value, state: "exact", scope };
}

export function boundedCount(
  key: string,
  label: string,
  lowerBound: number,
  scope: string,
): FounderCommandCenterCountMetric {
  return { key, label, value: lowerBound, state: "bounded", scope };
}

export function unavailableCount(
  key: string,
  label: string,
  scope: string,
): FounderCommandCenterCountMetric {
  return { key, label, value: null, state: "unavailable", scope };
}

export function currentFact(
  key: string,
  label: string,
  value: string,
): FounderCommandCenterFact {
  return { key, label, value, state: "current" };
}

export function lastVerifiedFact(
  key: string,
  label: string,
  value: string,
): FounderCommandCenterFact {
  return { key, label, value, state: "last_verified" };
}

export function unavailableFact(
  key: string,
  label: string,
): FounderCommandCenterFact {
  return { key, label, value: null, state: "unavailable" };
}

export function unavailableFounderCommandCenterSource(
  area: FounderCommandCenterAreaId,
  authority = "Current read authority unavailable",
): FounderCommandCenterSourceSnapshot {
  const definition = FOUNDER_COMMAND_CENTER_AREA_DEFINITIONS.find(
    (candidate) => candidate.area === area,
  );
  if (!definition) throw new Error("Unknown founder command-center area");
  return {
    source: { state: "unavailable", authority, observedAt: null },
    primaryCount: unavailableCount(
      `${area}.attention`,
      "Needs attention",
      definition.scope,
    ),
    breakdown: [],
    facts: [],
    oldestWaiting: { state: "unavailable", since: null },
    attention: {
      severity: "unknown",
      code: "source_unavailable",
      reason: "A current privacy-safe summary is unavailable for this workflow.",
    },
  };
}

function normalizedTimeout(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return DEFAULT_SOURCE_TIMEOUT_MS;
  }
  return Math.max(1, Math.min(Math.trunc(value), 30_000));
}

async function withinTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("source_timeout")), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function unavailableCard(
  area: FounderCommandCenterAreaId,
): FounderCommandCenterCard {
  return cardFromSource(area, unavailableFounderCommandCenterSource(area));
}

function cardFromSource(
  area: FounderCommandCenterAreaId,
  source: FounderCommandCenterSourceSnapshot,
): FounderCommandCenterCard {
  const definition = FOUNDER_COMMAND_CENTER_AREA_DEFINITIONS.find(
    (candidate) => candidate.area === area,
  );
  if (!definition) throw new Error("Unknown founder command-center area");

  const card = {
    area,
    label: definition.label,
    scope: definition.scope,
    source: source.source,
    primaryCount: source.primaryCount,
    breakdown: source.breakdown,
    facts: source.facts,
    oldestWaiting: {
      ...source.oldestWaiting,
      actionHref: definition.workflowHref,
    },
    attention: source.attention,
    owningWorkflow: {
      label: definition.workflowLabel,
      href: definition.workflowHref,
    },
    directAction: {
      label: definition.actionLabel,
      href: definition.workflowHref,
    },
  };
  const parsed = founderCommandCenterCardSchema.safeParse(card);
  if (!parsed.success) {
    throw new Error("invalid_command_center_source");
  }
  return parsed.data;
}

/**
 * Collect all thirteen independent summaries concurrently. A rejected,
 * malformed, or timed-out source affects only its own card and is represented
 * by an explicit unavailable state; it can never turn into a fabricated zero.
 */
export async function buildFounderCommandCenterSnapshot(
  sources: FounderCommandCenterSources,
  options: FounderCommandCenterBuildOptions = {},
): Promise<FounderCommandCenterResponse> {
  const timeoutMs = normalizedTimeout(options.timeoutMs);
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  const pending = FOUNDER_COMMAND_CENTER_AREA_IDS.map((area) => {
    const source = sources[area];
    if (!source) return Promise.reject(new Error("source_missing"));
    return withinTimeout(
      Promise.resolve().then(() =>
        source({ request: options.request ?? null }),
      ),
      timeoutMs,
    );
  });
  const settled = await Promise.allSettled(pending);

  const cards = FOUNDER_COMMAND_CENTER_AREA_IDS.map((area, index) => {
    const result = settled[index];
    if (result.status !== "fulfilled") return unavailableCard(area);
    const parsed = sourceSnapshotSchema.safeParse(result.value);
    if (!parsed.success) return unavailableCard(area);
    try {
      return cardFromSource(area, parsed.data);
    } catch {
      return unavailableCard(area);
    }
  });

  return founderCommandCenterResponseSchema.parse({
    ok: true,
    readOnly: true,
    generatedAt,
    cards,
  });
}

export function setFounderCommandCenterPrivacyHeaders(res: Response): void {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
}

/** Register the single founder-only read door. No mutation verbs exist here. */
export function registerFounderCommandCenterApi(
  app: Express,
  sources: FounderCommandCenterSources,
  options: FounderCommandCenterRegistrationOptions = {},
): void {
  const requireAdmin = options.requireAdmin ?? requireSupabaseAdmin;
  app.get(
    // Literal on purpose: the release route scanner must see this protected
    // door. The contract equality is pinned in the focused route test.
    "/api/admin/research/command-center",
    (_req, res, next) => {
      setFounderCommandCenterPrivacyHeaders(res);
      next();
    },
    requireAdmin,
    async (req, res) => {
      if (Object.keys(req.query).length > 0) {
        return res.status(400).json({
          ok: false,
          code: "command_center_query_not_supported",
        });
      }
      const response = await buildFounderCommandCenterSnapshot(sources, {
        ...(options.timeoutMs === undefined
          ? {}
          : { timeoutMs: options.timeoutMs }),
        ...(options.now === undefined ? {} : { now: options.now }),
        request: req,
      });
      return res.status(200).json(response);
    },
  );
}
