import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { APPROVED_CUSTOMER_SCHEMA_VERSION, APPROVE_CUSTOMER_ACCESS_PATH, ApprovedCustomerApprovalInput,
  CustomerApprovalResult, CustomerClaimResult, CustomerAccessDenial, type CustomerApprovalInput } from "@shared/research/approved-customer-access";
import { decodeJwtClaims } from "./member-auth";

export interface ApprovedCustomerAccessDependencies {
  authority(): Promise<unknown>;
  approve(input: CustomerApprovalInput & { actorAuthUserId: string }): Promise<unknown>;
  claim(applicationId: string, authUserId: string): Promise<unknown>;
  createAuth(email: string, password: string): Promise<{ kind: "created"; userId: string; email: string; emailVerified: boolean } | { kind: "exists" } | { kind: "failed" }>;
  verifySignIn(authorization: string): Promise<{ userId: string; email: string; emailVerified: boolean } | null>;
  kickOutbox(): Promise<void>;
}
const authoritySchema = z.object({ schemaVersion: z.literal(APPROVED_CUSTOMER_SCHEMA_VERSION) }).strict();
const uuid = z.string().uuid();
const unavailable = { ok: false as const, code: "approved_access_unavailable", message: "Approved account access is temporarily unavailable. No approval was confirmed." };

export async function approveCustomerAccount(deps: ApprovedCustomerAccessDependencies, actorAuthUserId: string, raw: unknown) {
  const input = ApprovedCustomerApprovalInput.safeParse(raw);
  if (!input.success || !uuid.safeParse(actorAuthUserId).success) return { ok: false as const, code: "invalid_input" };
  try {
    if (!authoritySchema.safeParse(await deps.authority()).success) return unavailable;
    const result = z.union([CustomerApprovalResult, CustomerAccessDenial]).safeParse(await deps.approve({ ...input.data, actorAuthUserId }));
    if (!result.success) return unavailable;
    if (!result.data.ok) return result.data;
    if (input.data.expectedApplicationId !== null && result.data.applicationId !== input.data.expectedApplicationId) return unavailable;
    // The transaction already durably enqueued exactly one job. Dispatch is
    // best-effort, and the response never upgrades queued into delivered.
    await deps.kickOutbox().catch(() => {});
    return result.data;
  } catch { return unavailable; }
}

/** Called only after the canonical emailed account_claim token was verified. */
export async function claimApprovedCustomerAccount(deps: ApprovedCustomerAccessDependencies, input: {
  applicationId: string; email: string; password?: string; authorization?: string;
}) {
  if (!uuid.safeParse(input.applicationId).success || !z.string().email().safeParse(input.email).success) {
    return { ok: false as const, code: "invalid_input" };
  }
  try {
    if (!authoritySchema.safeParse(await deps.authority()).success) return unavailable;
    let user: { userId: string; email: string; emailVerified: boolean } | null = null;
    if (input.authorization) {
      user = await deps.verifySignIn(input.authorization);
      if (!user) return { ok: false as const, code: "verified_sign_in_required", message: "Sign in normally, then reopen your account link." };
    } else {
      if (!input.password || input.password.length < 10 || input.password.length > 200) {
        return { ok: false as const, code: "invalid_input", message: "Choose a password of 10 to 200 characters." };
      }
      const created = await deps.createAuth(input.email, input.password);
      if (created.kind === "exists") return { ok: false as const, code: "existing_sign_in_required", message: "A sign-in already exists for this email. Sign in, then reopen this account link to continue. Your password was not changed." };
      if (created.kind === "failed") return { ok: false as const, code: "auth_creation_failed", message: "Your sign-in could not be created. Please try again." };
      user = created;
    }
    if (!user.emailVerified || user.email.toLowerCase() !== input.email.toLowerCase() || !uuid.safeParse(user.userId).success) {
      return { ok: false as const, code: "identity_review_required", message: "The signed-in identity does not match this approved account link." };
    }
    const result = z.union([CustomerClaimResult, CustomerAccessDenial]).safeParse(await deps.claim(input.applicationId, user.userId));
    if (!result.success || result.data.ok && result.data.applicationId !== input.applicationId) {
      return { ok: false as const, code: "claim_incomplete", message: "Your sign-in may be ready, but account access could not be confirmed. Sign in and reopen your account link to retry." };
    }
    if (result.data.ok) await deps.kickOutbox().catch(() => {});
    return result.data;
  } catch {
    // Never delete an Auth identity or reset a password after an uncertain
    // database response: the durable claim may already have committed.
    return { ok: false as const, code: "claim_incomplete", message: "Account access could not be confirmed. Sign in and reopen your account link to retry." };
  }
}

export function registerApprovedCustomerAccessApi(app: Express, deps: ApprovedCustomerAccessDependencies, requireAdmin: RequestHandler): void {
  app.post(APPROVE_CUSTOMER_ACCESS_PATH, (_req, res, next) => {
    res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", Pragma: "no-cache", Vary: "Authorization, Cookie" }); next();
  }, requireAdmin, async (req, res) => {
    // This token has already been authenticated by the canonical admin guard.
    // Body, email, role labels and browser-selected IDs never supply the actor.
    const header = req.headers.authorization ?? "";
    const actor = header.startsWith("Bearer ") ? decodeJwtClaims(header.slice(7))?.sub : null;
    if (!uuid.safeParse(actor).success) return res.status(401).json({ ok: false, code: "admin_identity_required" });
    const result = await approveCustomerAccount(deps, actor as string, req.body);
    return res.status(result.ok ? 200 : result.code === "invalid_input" ? 400 : result.code === "approved_access_unavailable" ? 503 : 409).json(result);
  });
}
