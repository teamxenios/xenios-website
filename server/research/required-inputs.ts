import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  isPrelaunchRole,
  PRELAUNCH_LAUNCH_STATUSES,
  type PrelaunchLaunchStatus,
  type PrelaunchRole,
} from "@shared/research/prelaunch";
import {
  isRequiredInputBlockingLevel,
  isRequiredInputEntryMode,
  isRequiredInputState,
  isRequiredInputValueSensitivity,
  valueMayBeStored,
  type DomainReadiness,
  type RequiredInput,
  type RequiredInputAuditEvent,
  type RequiredInputState,
  type RequiredInputSummary,
} from "@shared/research/required-inputs";
import { getSupabaseAdmin } from "../supabase";

type Db = ReturnType<typeof getSupabaseAdmin>;
type GovernanceActor = {
  id: string;
  roles: PrelaunchRole[];
};

const SENSITIVE_DEFINITION_PATTERN =
  /(^|[^a-z0-9])(secret|credentials?|password|token|api[\s_.:-]*key|private[\s_.:-]*key|access[\s_.:-]*key|client[\s_.:-]*secret|signing[\s_.:-]*key)([^a-z0-9]|$)/i;

function definitionContainsSensitiveSemantics(
  value: Record<string, unknown>,
): boolean {
  const semanticValues = [
    value.key,
    value.domain,
    value.label,
    value.description,
    value.whyRequired,
    value.recordType,
    value.recordId,
    value.fieldPath,
    value.verificationMethod,
    value.publicLaunchImpact,
    value.nextAction,
    value.adminEntryHref,
    ...(Array.isArray(value.evidenceRequired) ? value.evidenceRequired : []),
  ];
  return semanticValues.some(
    (part) =>
      typeof part === "string" && SENSITIVE_DEFINITION_PATTERN.test(part),
  );
}

function normalizeRequiredInputDefinitionAliases(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const value = { ...(input as Record<string, unknown>) };
  const hasCamelCase = Object.prototype.hasOwnProperty.call(value, "recordId");
  const hasSnakeCase = Object.prototype.hasOwnProperty.call(value, "record_id");
  if (
    hasCamelCase &&
    hasSnakeCase &&
    value.recordId !== value.record_id
  ) {
    value.recordId = 0;
  } else if (!hasCamelCase && hasSnakeCase) {
    value.recordId = value.record_id;
  }
  delete value.record_id;
  return value;
}

const definitionSchema = z.preprocess(
  normalizeRequiredInputDefinitionAliases,
  z
    .object({
    key: z.string().trim().regex(/^[a-z0-9][a-z0-9_.:-]{2,199}$/),
    domain: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/),
    label: z.string().trim().min(3).max(200),
    description: z.string().trim().min(3).max(1000),
    whyRequired: z.string().trim().min(3).max(1000),
    recordType: z.string().trim().min(2).max(100),
    recordId: z.string().trim().min(1).max(200).nullable().optional(),
    fieldPath: z.string().trim().min(1).max(300),
    blockingLevel: z.string().refine(isRequiredInputBlockingLevel),
    responsibleRole: z.string().refine(isPrelaunchRole),
    verificationMethod: z.string().trim().min(3).max(1000),
    evidenceRequired: z.array(z.string().trim().min(1).max(200)).max(30),
    entryMode: z.string().refine(isRequiredInputEntryMode),
    valueSensitivity: z
      .string()
      .refine(isRequiredInputValueSensitivity),
    publicLaunchImpact: z.string().trim().min(3).max(1000),
    nextAction: z.string().trim().min(3).max(500),
    adminEntryHref: z
      .string()
      .trim()
      .max(500)
      .regex(/^\/admin\/[A-Za-z0-9/_?=&.:%-]+$/),
    })
    .superRefine((value, ctx) => {
      const sensitive =
        value.valueSensitivity === "sensitive_reference" ||
        definitionContainsSensitiveSemantics(value);
      if (sensitive && value.entryMode !== "external_secret") {
        ctx.addIssue({
          code: "custom",
          path: ["entryMode"],
          message: "Sensitive values must use external-secret references.",
        });
      }
      if (
        value.entryMode === "external_secret" &&
        value.valueSensitivity !== "sensitive_reference"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["valueSensitivity"],
          message: "External-secret entries must be classified as sensitive.",
        });
      }
    }),
);

const transitionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    targetState: z.string().refine(isRequiredInputState),
    reason: z.string().trim().min(3).max(1000),
    enteredValue: z.unknown().optional(),
    externalReferenceName: z.string().trim().min(2).max(200).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.targetState === "entered" &&
      value.enteredValue === undefined &&
      !value.externalReferenceName
    ) {
      ctx.addIssue({
        code: "custom",
        message: "An entered value or external reference is required.",
      });
    }
  });

const manifestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  manifestVersion: z.number().int().positive(),
  expectedInputCount: z.number().int().positive(),
  softwareComplete: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
});

const launchSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  targetStatus: z.enum(PRELAUNCH_LAUNCH_STATUSES),
  reason: z.string().trim().min(3).max(1000),
});

function noStore(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function governanceActor(req: Request): GovernanceActor {
  const actorId = (req as Request & { prelaunchActorId?: string })
    .prelaunchActorId;
  const roles =
    (req as Request & {
      prelaunchAccess?: { roles?: PrelaunchRole[] };
    }).prelaunchAccess?.roles ?? [];
  if (!actorId || roles.length === 0) {
    throw new Error("governance_actor_unavailable");
  }
  return { id: actorId, roles };
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function rowToAudit(row: Record<string, unknown>): RequiredInputAuditEvent {
  return {
    id: String(row.id),
    fromState: row.from_state
      ? (String(row.from_state) as RequiredInputState)
      : null,
    toState: String(row.to_state) as RequiredInputState,
    actor: String(row.actor),
    reason: String(row.reason),
    occurredAt: String(row.occurred_at),
  };
}

function rowToInput(
  row: Record<string, any>,
  history: RequiredInputAuditEvent[] = [],
): RequiredInput {
  return {
    id: String(row.id),
    key: String(row.key),
    domain: String(row.domain),
    label: String(row.label),
    description: String(row.description),
    whyRequired: String(row.why_required),
    recordType: String(row.record_type),
    recordId: row.record_id ? String(row.record_id) : null,
    fieldPath: String(row.field_path),
    currentState: String(row.current_state) as RequiredInputState,
    blockingLevel: row.blocking_level,
    responsibleRole: row.responsible_role as PrelaunchRole,
    verificationMethod: String(row.verification_method),
    evidenceRequired: Array.isArray(row.evidence_required)
      ? row.evidence_required.map(String)
      : [],
    entryMode: row.entry_mode,
    valueSensitivity: row.value_sensitivity,
    enteredValue:
      row.entry_mode === "external_secret" ? null : (row.entered_value ?? null),
    externalReferenceName: row.external_reference_name
      ? String(row.external_reference_name)
      : null,
    enteredBy: row.entered_by ? String(row.entered_by) : null,
    enteredAt: row.entered_at ? String(row.entered_at) : null,
    verifiedBy: row.verified_by ? String(row.verified_by) : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    rejectionReason: row.rejection_reason
      ? String(row.rejection_reason)
      : null,
    publicLaunchImpact: String(row.public_launch_impact),
    nextAction: String(row.next_action),
    adminEntryHref: String(row.admin_entry_href),
    version: Number(row.version),
    auditHistory: history,
  };
}

function summarize(items: RequiredInput[]): RequiredInputSummary {
  const blocking = (levels: string[]) =>
    items.filter(
      (item) =>
        levels.includes(item.blockingLevel) &&
        !["verified", "not_applicable", "superseded"].includes(
          item.currentState,
        ),
    ).length;
  return {
    total: items.length,
    missing: items.filter((item) => item.currentState === "missing").length,
    launchBlocking: blocking(["blocks_public_launch"]),
    transactionBlocking: blocking(["blocks_transaction"]),
    clinicalBlocking: blocking(["blocks_clinical_activation"]),
    entered: items.filter((item) => item.currentState === "entered").length,
    underReview: items.filter((item) => item.currentState === "under_review")
      .length,
    verified: items.filter((item) => item.currentState === "verified").length,
    rejected: items.filter((item) => item.currentState === "rejected").length,
    expired: items.filter((item) => item.currentState === "expired").length,
  };
}

export function buildRequiredInputProductionRepository(db: Db = getSupabaseAdmin()) {
  return {
    async list(domain?: string): Promise<RequiredInput[]> {
      let query = db
        .from("research_required_inputs")
        .select("*")
        .order("domain")
        .order("label");
      if (domain) query = query.eq("domain", domain);
      const { data, error } = await query;
      if (error) throw error;
      const ids = (data ?? []).map((row) => row.id);
      let auditRows: Record<string, any>[] = [];
      if (ids.length) {
        const audit = await db
          .from("research_required_input_audit")
          .select("*")
          .in("required_input_id", ids)
          .order("occurred_at", { ascending: false });
        if (audit.error) throw audit.error;
        auditRows = audit.data ?? [];
      }
      return (data ?? []).map((row) =>
        rowToInput(
          row,
          auditRows
            .filter((event) => event.required_input_id === row.id)
            .map(rowToAudit),
        ),
      );
    },

    async define(
      input: z.infer<typeof definitionSchema>,
      actor: GovernanceActor,
    ) {
      const { data, error } = await db.rpc("research_define_required_input", {
        p_definition: input,
        p_actor: actor.id,
        p_actor_roles: actor.roles,
        p_now: new Date().toISOString(),
      });
      if (error) throw error;
      return rowToInput(data as Record<string, any>);
    },

    async transition(
      id: string,
      input: z.infer<typeof transitionSchema>,
      actor: GovernanceActor,
    ) {
      const existing = await db
        .from("research_required_inputs")
        .select("entry_mode")
        .eq("id", id)
        .maybeSingle();
      if (existing.error || !existing.data) throw existing.error ?? new Error("not_found");
      if (!valueMayBeStored(existing.data.entry_mode, input.enteredValue)) {
        throw new Error("secret_value_forbidden");
      }
      if (
        existing.data.entry_mode === "external_secret" &&
        input.targetState === "entered" &&
        !/^[A-Z][A-Z0-9_]{1,199}$/.test(input.externalReferenceName ?? "")
      ) {
        throw new Error("secret_reference_name_invalid");
      }
      const { data, error } = await db.rpc("research_transition_required_input", {
        p_id: id,
        p_expected_version: input.expectedVersion,
        p_target_state: input.targetState,
        p_actor: actor.id,
        p_actor_roles: actor.roles,
        p_reason: input.reason,
        p_entered_value:
          existing.data.entry_mode === "external_secret"
            ? null
            : (input.enteredValue ?? null),
        p_external_reference_name: input.externalReferenceName ?? null,
        p_now: new Date().toISOString(),
      });
      if (error) throw error;
      return rowToInput(data as Record<string, any>);
    },

    async setManifest(
      domain: string,
      input: z.infer<typeof manifestSchema>,
      actor: GovernanceActor,
    ) {
      const { data, error } = await db.rpc("research_set_readiness_manifest", {
        p_domain: domain,
        p_expected_version: input.expectedVersion,
        p_manifest_version: input.manifestVersion,
        p_expected_input_count: input.expectedInputCount,
        p_software_complete: input.softwareComplete,
        p_actor: actor.id,
        p_actor_roles: actor.roles,
        p_reason: input.reason,
        p_now: new Date().toISOString(),
      });
      if (error) throw error;
      return data;
    },

    async readiness(domain: string): Promise<DomainReadiness> {
      const { data, error } = await db.rpc("research_domain_readiness", {
        p_domain: domain,
      });
      if (error) throw error;
      return data as DomainReadiness;
    },

    async readinessAll(): Promise<DomainReadiness[]> {
      const { data, error } = await db
        .from("research_domain_launch_controls")
        .select("domain")
        .order("domain");
      if (error) throw error;
      return Promise.all(
        (data ?? []).map(async (row) => {
          const domain = String(row.domain);
          const readiness = await db.rpc("research_domain_readiness", {
            p_domain: domain,
          });
          if (readiness.error) throw readiness.error;
          return readiness.data as DomainReadiness;
        }),
      );
    },

    async transitionLaunch(
      domain: string,
      input: z.infer<typeof launchSchema>,
      actor: GovernanceActor,
    ) {
      const { data, error } = await db.rpc("research_transition_launch_status", {
        p_domain: domain,
        p_expected_version: input.expectedVersion,
        p_target_status: input.targetStatus,
        p_actor: actor.id,
        p_actor_roles: actor.roles,
        p_reason: input.reason,
        p_now: new Date().toISOString(),
      });
      if (error) throw error;
      return data;
    },
  };
}

export type RequiredInputRepository = ReturnType<
  typeof buildRequiredInputProductionRepository
>;

type GovernanceGuard = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;

export type RequiredInputGuards = {
  read: GovernanceGuard;
  edit: GovernanceGuard;
  review: GovernanceGuard;
  release: GovernanceGuard;
};

export function registerRequiredInputApi(
  app: Express,
  repository: RequiredInputRepository,
  guards: RequiredInputGuards,
) {
  app.get(
    "/api/admin/research/required-inputs",
    guards.read,
    async (req, res) => {
      noStore(res);
      try {
        const domain =
          typeof req.query.domain === "string" &&
          /^[a-z0-9][a-z0-9_-]{2,63}$/.test(req.query.domain)
            ? req.query.domain
            : undefined;
        const [items, readiness] = await Promise.all([
          repository.list(domain),
          repository.readinessAll(),
        ]);
        return res.json({
          ok: true,
          items,
          summary: summarize(items),
          readiness,
        });
      } catch {
        return res
          .status(503)
          .json({ ok: false, code: "required_inputs_unavailable" });
      }
    },
  );

  app.post(
    "/api/admin/research/required-inputs",
    guards.edit,
    async (req, res) => {
      noStore(res);
      const parsed = definitionSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ ok: false, code: "validation_failed" });
      try {
        return res.status(201).json({
          ok: true,
          item: await repository.define(parsed.data, governanceActor(req)),
        });
      } catch {
        return res
          .status(409)
          .json({ ok: false, code: "required_input_not_defined" });
      }
    },
  );

  app.post(
    "/api/admin/research/required-inputs/:id/transition",
    (req, res, next) => {
      const reviewerStates: RequiredInputState[] = [
        "verified",
        "rejected",
        "not_applicable",
      ];
      return reviewerStates.includes(req.body?.targetState)
        ? guards.review(req, res, next)
        : guards.edit(req, res, next);
    },
    async (req, res) => {
      noStore(res);
      const id = z.string().uuid().safeParse(req.params.id);
      const parsed = transitionSchema.safeParse(req.body);
      if (!id.success || !parsed.success)
        return res.status(400).json({ ok: false, code: "validation_failed" });
      try {
        return res.json({
          ok: true,
          item: await repository.transition(
            id.data,
            parsed.data,
            governanceActor(req),
          ),
        });
      } catch {
        return res
          .status(409)
          .json({ ok: false, code: "required_input_transition_rejected" });
      }
    },
  );

  app.put(
    "/api/admin/research/readiness/:domain/manifest",
    guards.release,
    async (req, res) => {
      noStore(res);
      const routeDomain = routeParam(req.params.domain);
      const domain = z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]{2,63}$/)
        .safeParse(routeDomain);
      const parsed = manifestSchema.safeParse(req.body);
      if (!domain.success || !parsed.success)
        return res.status(400).json({ ok: false, code: "validation_failed" });
      try {
        return res.json({
          ok: true,
          readiness: await repository.setManifest(
            domain.data,
            parsed.data,
            governanceActor(req),
          ),
        });
      } catch {
        return res
          .status(409)
          .json({ ok: false, code: "readiness_manifest_rejected" });
      }
    },
  );

  app.get(
    "/api/admin/research/readiness/:domain",
    guards.read,
    async (req, res) => {
      noStore(res);
      const domain = routeParam(req.params.domain);
      if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(domain))
        return res.status(400).json({ ok: false, code: "validation_failed" });
      try {
        return res.json({
          ok: true,
          readiness: await repository.readiness(domain),
        });
      } catch {
        return res
          .status(503)
          .json({ ok: false, code: "readiness_unavailable" });
      }
    },
  );

  app.post(
    "/api/admin/research/readiness/:domain/transition",
    guards.release,
    async (req, res) => {
      noStore(res);
      const routeDomain = routeParam(req.params.domain);
      const domain = z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]{2,63}$/)
        .safeParse(routeDomain);
      const parsed = launchSchema.safeParse(req.body);
      if (!domain.success || !parsed.success)
        return res.status(400).json({ ok: false, code: "validation_failed" });
      try {
        return res.json({
          ok: true,
          readiness: await repository.transitionLaunch(
            domain.data,
            parsed.data,
            governanceActor(req),
          ),
        });
      } catch {
        return res
          .status(409)
          .json({ ok: false, code: "launch_transition_rejected" });
      }
    },
  );
}
