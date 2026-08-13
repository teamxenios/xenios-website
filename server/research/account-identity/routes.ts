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

// Intentionally unmounted. Pack 09's integration owner must register this
// beside the existing /api/research/member routes after final-base recreation.

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

export function registerAccountIdentityApi(app: Express, deps: AccountIdentityDeps): void {
  app.get("/api/research/account/context", privateAccountHeaders, async (req, res) => {
    await run(res, () => getAccountContext(deps, req));
  });

  app.post("/api/research/account/claims/request", privateAccountHeaders, async (req, res) => {
    await run(res, () => requestCustomerHistoryClaim(deps, req, req.body));
  });

  app.post("/api/research/account/claims/confirm", privateAccountHeaders, async (req, res) => {
    await run(res, () => confirmCustomerHistoryClaim(deps, req, req.body));
  });

  app.post("/api/research/account/security/password-change-complete", privateAccountHeaders, async (req, res) => {
    await run(res, () => acknowledgePasswordChange(deps, req));
  });

  app.post("/api/research/account/organization-invitations/accept", privateAccountHeaders, async (req, res) => {
    await run(res, () => acceptOrganizationInvitation(deps, req, req.body));
  });

  app.get("/api/research/account/organizations/:organizationId/dashboard", privateAccountHeaders, async (req, res) => {
    await run(res, () => getBusinessDashboard(deps, req, routeParam(req.params.organizationId)));
  });

  app.patch("/api/research/account/organizations/:organizationId/profile", privateAccountHeaders, async (req, res) => {
    await run(res, () => patchBusinessProfile(deps, req, routeParam(req.params.organizationId), req.body));
  });

  app.post("/api/research/account/organizations/:organizationId/users/invitations", privateAccountHeaders, async (req, res) => {
    await run(res, () => inviteOrganizationUser(deps, req, { ...req.body, organizationId: routeParam(req.params.organizationId) }));
  });

  app.post("/api/research/account/organizations/:organizationId/orders/request-again", privateAccountHeaders, async (req, res) => {
    await run(res, () => requestOrderAgain(deps, req, { ...req.body, organizationId: routeParam(req.params.organizationId) }));
  });
}
