import { z } from "zod";

/**
 * Privacy-minimal, read-only contract for the founder operations summary.
 *
 * This is a projection contract only. It grants no authority and deliberately
 * carries no person, account, order, payment, Care, supplier, or referral
 * identifiers. Each linked workflow performs its own authorization again.
 */
export const FOUNDER_COMMAND_CENTER_API_PATH =
  "/api/admin/research/command-center" as const;
export const FOUNDER_COMMAND_CENTER_ADMIN_PATH =
  "/admin/research/command-center" as const;

export const FOUNDER_COMMAND_CENTER_AREA_IDS = [
  "applications",
  "care_requests",
  "assisted_orders",
  "payment_review",
  "fulfillment",
  "exceptions",
  "products",
  "draft_prices",
  "required_inputs",
  "referrals",
  "support",
  "system_status",
  "release_status",
] as const;

export type FounderCommandCenterAreaId =
  (typeof FOUNDER_COMMAND_CENTER_AREA_IDS)[number];

export const FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS = [
  "/admin/research/applications",
  "/admin/research/care-requests",
  "/admin/research/assisted-orders",
  "/admin/research/early-access/payments",
  "/admin/research/early-access/fulfillment",
  "/admin/research/products",
  "/admin/research/required-inputs",
  "/admin/research/referral-lifecycle",
  "/admin/research/questions",
  "/admin/research/security",
  "/admin/research/audit",
] as const;

export type FounderCommandCenterActionHref =
  (typeof FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS)[number];

export type FounderCommandCenterAreaDefinition = Readonly<{
  area: FounderCommandCenterAreaId;
  label: string;
  scope: string;
  workflowLabel: string;
  workflowHref: FounderCommandCenterActionHref;
  actionLabel: string;
}>;

export const FOUNDER_COMMAND_CENTER_AREA_DEFINITIONS = [
  {
    area: "applications",
    label: "Applications",
    scope: "Membership applications awaiting an operator-owned next step.",
    workflowLabel: "Application review",
    workflowHref: "/admin/research/applications",
    actionLabel: "Open applications",
  },
  {
    area: "care_requests",
    label: "Care requests",
    scope: "Nonclinical manual-access requests in the Care operations queue.",
    workflowLabel: "Care request operations",
    workflowHref: "/admin/research/care-requests",
    actionLabel: "Open Care requests",
  },
  {
    area: "assisted_orders",
    label: "Assisted orders",
    scope: "Submitted Research requests awaiting an operator-owned next step.",
    workflowLabel: "Assisted-order operations",
    workflowHref: "/admin/research/assisted-orders",
    actionLabel: "Open assisted orders",
  },
  {
    area: "payment_review",
    label: "Payment review",
    scope: "Early Access payment evidence currently awaiting named-admin review.",
    workflowLabel: "Early Access payment review",
    workflowHref: "/admin/research/early-access/payments",
    actionLabel: "Open payment review",
  },
  {
    area: "fulfillment",
    label: "Fulfillment",
    scope: "Verified, settled work awaiting fulfillment, when that authority is available.",
    workflowLabel: "Early Access fulfillment",
    workflowHref: "/admin/research/early-access/fulfillment",
    actionLabel: "Open fulfillment",
  },
  {
    area: "exceptions",
    label: "Exceptions",
    scope: "Open Early Access operational exceptions requiring human attention.",
    workflowLabel: "Early Access fulfillment",
    workflowHref: "/admin/research/early-access/fulfillment",
    actionLabel: "Open exceptions",
  },
  {
    area: "products",
    label: "Products",
    scope: "Canonical Product Control records with incomplete review or release readiness.",
    workflowLabel: "Product Control",
    workflowHref: "/admin/research/products",
    actionLabel: "Open products",
  },
  {
    area: "draft_prices",
    label: "Draft prices",
    scope: "Canonical product price records still in draft state.",
    workflowLabel: "Product Control pricing",
    workflowHref: "/admin/research/products",
    actionLabel: "Open pricing",
  },
  {
    area: "required_inputs",
    label: "Required inputs",
    scope: "Unresolved canonical readiness inputs, excluding their entered values.",
    workflowLabel: "Required-input operations",
    workflowHref: "/admin/research/required-inputs",
    actionLabel: "Open required inputs",
  },
  {
    area: "referrals",
    label: "Referrals",
    scope: "Referral lifecycle attention that can be proven without exposing people or attribution lineage.",
    workflowLabel: "Referral lifecycle",
    workflowHref: "/admin/research/referral-lifecycle",
    actionLabel: "Open referrals",
  },
  {
    area: "support",
    label: "Support",
    scope: "Member questions not yet completed, without question text or member identity.",
    workflowLabel: "Member question operations",
    workflowHref: "/admin/research/questions",
    actionLabel: "Open support",
  },
  {
    area: "system_status",
    label: "System status",
    scope: "Narrow notification and capability checks; not a claim that every dependency is healthy.",
    workflowLabel: "Security and system status",
    workflowHref: "/admin/research/security",
    actionLabel: "Open system status",
  },
  {
    area: "release_status",
    label: "Release status",
    scope: "Runtime and last-verified release facts available to this process.",
    workflowLabel: "Audit and release evidence",
    workflowHref: "/admin/research/audit",
    actionLabel: "Open release evidence",
  },
] as const satisfies readonly FounderCommandCenterAreaDefinition[];

const timestampSchema = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");

const boundedText = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

// Keys are protocol vocabulary, never record identifiers. Keeping them to a
// dotted lower-case namespace prevents common raw email, UUID, phone, and
// opaque-reference forms from being copied verbatim into a field clients may
// use for reconciliation. Clients still must not expose payload keys in DOM.
const operationalKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/u);

export const founderCommandCenterCountMetricSchema = z
  .object({
    key: operationalKeySchema,
    label: boundedText(120),
    value: z.number().int().nonnegative().nullable(),
    state: z.enum(["exact", "bounded", "unavailable"]),
    scope: boundedText(240),
  })
  .strict()
  .superRefine((metric, context) => {
    if (metric.state === "unavailable" && metric.value !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Unavailable metrics must have a null value.",
      });
    }
    if (metric.state !== "unavailable" && metric.value === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Exact and bounded metrics must have a value.",
      });
    }
  });

export const founderCommandCenterFactSchema = z
  .object({
    key: operationalKeySchema,
    label: boundedText(120),
    value: boundedText(240).nullable(),
    state: z.enum(["current", "last_verified", "unavailable"]),
  })
  .strict()
  .superRefine((fact, context) => {
    if (fact.state === "unavailable" && fact.value !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Unavailable facts must have a null value.",
      });
    }
    if (fact.state !== "unavailable" && fact.value === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Current and last-verified facts must have a value.",
      });
    }
  });

export const founderCommandCenterOldestWaitingSchema = z.discriminatedUnion(
  "state",
  [
    z
      .object({
        state: z.literal("available"),
        since: timestampSchema,
        actionHref: z.enum(FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS),
      })
      .strict(),
    z
      .object({
        state: z.enum(["unavailable", "not_applicable"]),
        since: z.null(),
        actionHref: z.enum(FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS),
      })
      .strict(),
  ],
);

export const founderCommandCenterCardSchema = z
  .object({
    area: z.enum(FOUNDER_COMMAND_CENTER_AREA_IDS),
    label: boundedText(120),
    scope: boundedText(320),
    source: z
      .object({
        state: z.enum(["current", "partial", "feature_gated", "unavailable"]),
        authority: boundedText(160),
        observedAt: timestampSchema.nullable(),
      })
      .strict(),
    primaryCount: founderCommandCenterCountMetricSchema,
    breakdown: z.array(founderCommandCenterCountMetricSchema).max(12),
    facts: z.array(founderCommandCenterFactSchema).max(12),
    oldestWaiting: founderCommandCenterOldestWaitingSchema,
    attention: z
      .object({
        severity: z.enum(["none", "info", "warning", "critical", "unknown"]),
        code: boundedText(64),
        reason: boundedText(320),
      })
      .strict(),
    owningWorkflow: z
      .object({
        label: boundedText(120),
        href: z.enum(FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS),
      })
      .strict(),
    directAction: z
      .object({
        label: boundedText(120),
        href: z.enum(FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS),
      })
      .strict(),
  })
  .strict()
  .superRefine((card, context) => {
    const definition = FOUNDER_COMMAND_CENTER_AREA_DEFINITIONS.find(
      (candidate) => candidate.area === card.area,
    );
    if (!definition) return;

    const canonicalFields: ReadonlyArray<{
      path: Array<string>;
      actual: string;
      expected: string;
    }> = [
      { path: ["label"], actual: card.label, expected: definition.label },
      { path: ["scope"], actual: card.scope, expected: definition.scope },
      {
        path: ["oldestWaiting", "actionHref"],
        actual: card.oldestWaiting.actionHref,
        expected: definition.workflowHref,
      },
      {
        path: ["owningWorkflow", "label"],
        actual: card.owningWorkflow.label,
        expected: definition.workflowLabel,
      },
      {
        path: ["owningWorkflow", "href"],
        actual: card.owningWorkflow.href,
        expected: definition.workflowHref,
      },
      {
        path: ["directAction", "label"],
        actual: card.directAction.label,
        expected: definition.actionLabel,
      },
      {
        path: ["directAction", "href"],
        actual: card.directAction.href,
        expected: definition.workflowHref,
      },
    ];

    for (const field of canonicalFields) {
      if (field.actual === field.expected) continue;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: field.path,
        message: "Command-center display and workflow vocabulary must be canonical for its area.",
      });
    }
  });

export const founderCommandCenterResponseSchema = z
  .object({
    ok: z.literal(true),
    readOnly: z.literal(true),
    generatedAt: timestampSchema,
    cards: z.array(founderCommandCenterCardSchema).length(
      FOUNDER_COMMAND_CENTER_AREA_IDS.length,
    ),
  })
  .strict()
  .superRefine((response, context) => {
    response.cards.forEach((card, index) => {
      if (card.area !== FOUNDER_COMMAND_CENTER_AREA_IDS[index]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cards", index, "area"],
          message: "Command-center cards must use the canonical area order.",
        });
      }
    });
  });

export type FounderCommandCenterCountMetric = z.infer<
  typeof founderCommandCenterCountMetricSchema
>;
export type FounderCommandCenterFact = z.infer<
  typeof founderCommandCenterFactSchema
>;
export type FounderCommandCenterOldestWaiting = z.infer<
  typeof founderCommandCenterOldestWaitingSchema
>;
export type FounderCommandCenterCard = z.infer<
  typeof founderCommandCenterCardSchema
>;
export type FounderCommandCenterResponse = z.infer<
  typeof founderCommandCenterResponseSchema
>;

export function parseFounderCommandCenterResponse(
  value: unknown,
): FounderCommandCenterResponse | null {
  const parsed = founderCommandCenterResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isFounderCommandCenterResponse(
  value: unknown,
): value is FounderCommandCenterResponse {
  return founderCommandCenterResponseSchema.safeParse(value).success;
}
