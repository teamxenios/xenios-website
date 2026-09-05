import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { PARTNER_ADMIN_OPERATION_PATH, PARTNER_LIFECYCLE_SCHEMA_VERSION, PartnerLifecycleRequirements, PartnerOperationInput, PartnerOperationResult, PartnerOperationDenial, type PartnerOperation } from "@shared/research/partner-lifecycle";
import { decodeJwtClaims } from "../member-auth";
import { DEFAULT_PARTNER_REQUIREMENTS } from "./partners";

export interface PartnerLifecycleDependencies {
  authority(): Promise<unknown>;
  operate(actorAuthUserId: string, operation: PartnerOperation): Promise<unknown>;
  now(): Date;
}
const authoritySchema = z.object({ schemaVersion: z.literal(PARTNER_LIFECYCLE_SCHEMA_VERSION), requirements: PartnerLifecycleRequirements }).strict();
export function validPartnerLifecycleAuthority(raw: unknown): boolean {
  const result = authoritySchema.safeParse(raw);
  if (!result.success) return false;
  const signature = (items: ReadonlyArray<{ key: string; version: string }>) => items.map((r) => `${r.key}@${r.version}`).sort().join("|");
  return signature(result.data.requirements.agreements) === signature(DEFAULT_PARTNER_REQUIREMENTS.agreements)
    && signature(result.data.requirements.trainingModules) === signature(DEFAULT_PARTNER_REQUIREMENTS.trainingModules);
}
const unavailable = { ok: false as const, code: "partner_lifecycle_unavailable", message: "Partner review could not be confirmed. Refresh the account diagnosis before retrying." };
export async function performPartnerOperation(deps: PartnerLifecycleDependencies, actorAuthUserId: string, raw: unknown) {
  const parsed = PartnerOperationInput.safeParse(raw);
  if (!parsed.success || !z.string().uuid().safeParse(actorAuthUserId).success) return { ok: false as const, code: "invalid_input" };
  const operation = parsed.data;
  if (operation.action === "record_agreement" && (!DEFAULT_PARTNER_REQUIREMENTS.agreements.some((r) => r.key === operation.agreementKey && r.version === operation.version) || Date.parse(operation.acceptedAt) > deps.now().getTime())) return { ok: false as const, code: "invalid_input" };
  if (operation.action === "record_training" && (!DEFAULT_PARTNER_REQUIREMENTS.trainingModules.some((r) => r.key === operation.moduleKey && r.version === operation.version) || Date.parse(operation.completedAt) > deps.now().getTime())) return { ok: false as const, code: "invalid_input" };
  try {
    if (!validPartnerLifecycleAuthority(await deps.authority())) return unavailable;
    const result = z.union([PartnerOperationResult, PartnerOperationDenial]).safeParse(await deps.operate(actorAuthUserId, operation));
    if (!result.success) return unavailable;
    if (result.data.ok && (result.data.action !== operation.action || (operation.action === "prepare" ? result.data.memberId !== operation.memberId : result.data.partnerId !== operation.partnerId))) return unavailable;
    return result.data;
  } catch { return unavailable; }
}

export function registerPartnerLifecycleApi(app: Express, deps: PartnerLifecycleDependencies, requireAdmin: RequestHandler) {
  app.post(PARTNER_ADMIN_OPERATION_PATH, (_req, res, next) => {
    res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", Vary: "Authorization, Cookie" }); next();
  }, requireAdmin, async (req, res) => {
    const header = req.headers.authorization ?? "";
    const actor = header.startsWith("Bearer ") ? decodeJwtClaims(header.slice(7))?.sub : null;
    if (!z.string().uuid().safeParse(actor).success) return res.status(401).json({ ok: false, code: "admin_identity_required" });
    const result = await performPartnerOperation(deps, actor as string, req.body);
    return res.status(result.ok ? 200 : result.code === "invalid_input" ? 400 : result.code === "partner_lifecycle_unavailable" ? 503 : 409).json(result);
  });
}
