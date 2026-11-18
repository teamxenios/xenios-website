import { z } from "zod";

/** A separate projection. The immutable request receipt remains pending_review. */
export const REQUEST_WORKFLOW_SCHEMA_VERSION = 1 as const;
export const REQUEST_WORKFLOW_BASE_PATH = "/api/research/early-access/request-intents";
export const requestWorkflowId = z.string().uuid();
const instant = z.string().datetime({ offset: true });
export const requestWorkflowEventSchema = z.object({
  id: requestWorkflowId,
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  kind: z.enum(["received", "queued", "review_started"]),
  occurredAt: instant,
}).strict();
export const requestCustomerNoticeSchema = z.enum([
  "pending", "provider_accepted", "delivered_to_server", "delivery_unknown",
  "failed", "suppressed", "unavailable",
]);
export const requestWorkflowSchema = z.object({
  schemaVersion: z.literal(REQUEST_WORKFLOW_SCHEMA_VERSION),
  requestId: requestWorkflowId,
  publicReference: z.string().regex(/^XRI-[0-9A-F]{32}$/),
  state: z.enum(["queued", "reviewing"]),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  changedAt: instant,
  customerNotice: requestCustomerNoticeSchema,
  events: z.array(requestWorkflowEventSchema).min(2).max(3),
}).strict().superRefine((value, ctx) => {
  const expected = value.state === "queued" ? ["received", "queued"] : ["received", "queued", "review_started"];
  if (value.publicReference !== `XRI-${value.requestId.replaceAll("-", "").toUpperCase()}` ||
      value.revision !== expected.length - 1 || value.events.length !== expected.length ||
      new Set(value.events.map(event => event.id)).size !== value.events.length ||
      value.events.some((event, index) => event.kind !== expected[index] || event.revision !== index ||
        (index > 0 && Date.parse(event.occurredAt) < Date.parse(value.events[index - 1].occurredAt))) ||
      value.changedAt !== value.events.at(-1)?.occurredAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid workflow history." });
  }
});
export const startRequestReviewSchema = z.object({
  commandId: requestWorkflowId,
  expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict();
export const startRequestReviewResultSchema = z.object({
  replay: z.boolean(), workflow: requestWorkflowSchema,
}).strict();
/** Permission is resolved afresh by the server. It never grants a command. */
export const staffRequestWorkflowSchema = z.object({
  workflow: requestWorkflowSchema, canStartReview: z.boolean(),
}).strict();

export type RequestWorkflowEventV1 = z.infer<typeof requestWorkflowEventSchema>;
export type RequestCustomerNoticeV1 = z.infer<typeof requestCustomerNoticeSchema>;
export type RequestWorkflowV1 = z.infer<typeof requestWorkflowSchema>;
export type StartReviewV1 = z.infer<typeof startRequestReviewSchema>;
export type StartReviewResultV1 = z.infer<typeof startRequestReviewResultSchema>;
export type StaffRequestWorkflowV1 = z.infer<typeof staffRequestWorkflowSchema>;
export function parseRequestWorkflow(value: unknown): RequestWorkflowV1 { return requestWorkflowSchema.parse(value); }
export function parseStartReview(value: unknown): StartReviewV1 { return startRequestReviewSchema.parse(value); }
export function parseStartReviewResult(value: unknown): StartReviewResultV1 { return startRequestReviewResultSchema.parse(value); }
export function parseStaffRequestWorkflow(value: unknown): StaffRequestWorkflowV1 { return staffRequestWorkflowSchema.parse(value); }
