import { z } from "zod";
import { aeFailureSchema, aeIdentifier } from "./workspace";

export const AE_PORTAL_PATH = "/research/account-executive";
export const AE_APPLICATION_CONTEXT_PATH = "/api/research/account-executive/context";

/** Server-selected operational partition metadata only. This is neither a grant
 * nor canonical organization membership; every workspace operation still checks
 * its own current durable scoped authority. No customer or role data belongs here. */
export const aeContextEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true), value: z.object({
    scopeId: aeIdentifier.refine(value => value !== "00000000-0000-0000-0000-000000000000"),
  }).strict() }).strict(),
  aeFailureSchema,
]);
export type AeContextEnvelope = z.infer<typeof aeContextEnvelopeSchema>;
