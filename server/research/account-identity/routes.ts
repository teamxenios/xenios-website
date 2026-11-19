import type { Express, Request, Response } from "express";
import type { AccountApiErrorCode, AccountApiResult } from "@shared/research/account-identity";
import type { AccountIdentityDeps } from "./service";
import {
  acceptOrganizationInvitation,
  acknowledgePasswordChange,
  confirmCustomerHistoryClaim,
  getAccountContext,
  getBusinessDashboard,
  inviteOrganizationUser,
  patchBusinessProfile,
  requestCustomerHistoryClaim,
  requestOrderAgain,
} from "./service";

// Mounted only by production-mount.ts at the server composition root. The
// registrar remains dependency-injected so tests and non-production consumers
// cannot silently construct a second auth or persistence boundary.

const STATUS: Record<AccountApiErrorCode, number> = {
  AUTH_REQUIRED: 401,
  EMAIL_VERIFICATION_REQUIRED: 403,
  ACCOUNT_NOT_FOUND: 403,
  ORGANIZATION_NOT_FOUND: 404,
  ORGANIZATION_ACCESS_DENIED: 403,
  ORGANIZATION_ROLE_REQUIRED: 403,
  PASSWORD_CHANGE_REQUIRED: 428,
  CUSTOMER_NOT_FOUND: 404,
  CUSTOMER_EMAIL_MISMATCH: 403,
  CLAIM_CHALLENGE_INVALID: 400,
  CLAIM_ALREADY_BOUND: 409,
  INVITATION_INVALID: 400,
  ORDER_NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  SERVICE_UNAVAILABLE: 503,
};

function privateAccountHeaders(_req: Request, res: Response, next: () => void) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Authorization, Cookie");
  next();
}

function send<T>(res: Response, result: AccountApiResult<T>) {
  if (result.ok) return res.status(200).json({ ok: true, ...result.value });
  return res.status(STATUS[result.code]).json({ ok: false, code: result.code, message: result.message });
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

async function run<T>(res: Response, operation: () => Promise<AccountApiResult<T>>) {
  try {
    return send(res, await operation());
  } catch {
    // Do not reflect provider/database diagnostics, JWTs, challenge URLs, or
    // profile data. The mounted composition root may add a redacted logger.
    return send(res, {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: "The account service is temporarily unavailable.",
    });
  }
}

/** Server composition only: never populate these switches from a request. */
export type AccountIdentityActivation = Readonly<{
  mutationsEnabled?: boolean;
  noticeIssuanceEnabled?: boolean;
}>;

async function closedWrite(deps: AccountIdentityDeps, req: Request): Promise<AccountApiResult<never>> {
  // Use the existing canonical verifier even while closed. No account store,
  // challenge creation, audit write, password evidence or mail adapter runs.
  const user = await deps.resolveAuthenticatedUser(req);
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "Sign in is required." };
  if (!user.emailVerified) return { ok: false, code: "EMAIL_VERIFICATION_REQUIRED", message: "Verify your email address before continuing." };
  return { ok: false, code: "SERVICE_UNAVAILABLE", message: "The account service is temporarily unavailable." };
}

function runWrite<T>(res: Response, deps: AccountIdentityDeps, req: Request, enabled: boolean, operation: () => Promise<AccountApiResult<T>>) {
  return run<T>(res, () => enabled ? operation() : closedWrite(deps, req));
}

export function registerAccountIdentityApi(app: Express, deps: AccountIdentityDeps, activation: AccountIdentityActivation = {}): void {
  // Snapshot explicit booleans at registration. Omission, truthy strings and
  // later mutation of a caller's configuration cannot activate mounted writes.
  const mutationsEnabled = activation.mutationsEnabled === true;
  const issuanceEnabled = mutationsEnabled && activation.noticeIssuanceEnabled === true;
  app.get("/api/research/account/context", privateAccountHeaders, async (req, res) => {
    await run(res, () => getAccountContext(deps, req));
  });

  app.post("/api/research/account/claims/request", privateAccountHeaders, async (req, res) => {
    await runWrite(res, deps, req, issuanceEnabled, () => requestCustomerHistoryClaim(deps, req, req.body));
  });

  app.post("/api/research/account/claims/confirm", privateAccountHeaders, async (req, res) => {
    await runWrite(res, deps, req, mutationsEnabled, () => confirmCustomerHistoryClaim(deps, req, req.body));
  });

  app.post("/api/research/account/security/password-change-complete", privateAccountHeaders, async (req, res) => {
    await runWrite(res, deps, req, mutationsEnabled, () => acknowledgePasswordChange(deps, req));
  });

  app.post("/api/research/account/organization-invitations/accept", privateAccountHeaders, async (req, res) => {
    await runWrite(res, deps, req, mutationsEnabled, () => acceptOrganizationInvitation(deps, req, req.body));
  });

  app.get("/api/research/account/organizations/:organizationId/dashboard", privateAccountHeaders, async (req, res) => {
    await run(res, () => getBusinessDashboard(deps, req, routeParam(req.params.organizationId)));
  });

  app.patch("/api/research/account/organizations/:organizationId/profile", privateAccountHeaders, async (req, res) => {
    await runWrite(res, deps, req, mutationsEnabled, () => patchBusinessProfile(deps, req, routeParam(req.params.organizationId), req.body));
  });

  app.post("/api/research/account/organizations/:organizationId/users/invitations", privateAccountHeaders, async (req, res) => {
    await runWrite(res, deps, req, issuanceEnabled, () => inviteOrganizationUser(deps, req, { ...req.body, organizationId: routeParam(req.params.organizationId) }));
  });

  app.post("/api/research/account/organizations/:organizationId/orders/request-again", privateAccountHeaders, async (req, res) => {
    await runWrite(res, deps, req, mutationsEnabled, () => requestOrderAgain(deps, req, { ...req.body, organizationId: routeParam(req.params.organizationId) }));
  });
}
