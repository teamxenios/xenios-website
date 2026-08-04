import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";

import { resolveEarlyAccessConfig, type EarlyAccessConfig } from "./private-access-config";
import {
  PRIVATE_ACCESS_PRIVATE_HEADERS,
  createLogoutRoute,
  createSessionRoute,
  createUnlockRoute,
  type PrivateAccessRouteDependencies,
} from "./private-access-routes";
import {
  InMemoryPrivateAccessSessionRepository,
  type PrivateAccessSessionRepository,
} from "./private-access-session-repository";
import { decideEarlyAccessAdapter, isGrantIssuingRepository } from "./durable-session";

// Registration seam for the Private Early Access gate.
//
// The handlers are pure and injected; this file is the only place that binds
// them to Express, to the process clock, and to real randomness. Keeping the
// binding here means the handlers stay unit-testable with no server.

export const EARLY_ACCESS_UNLOCK_PATH = "/api/research/early-access/unlock";
export const EARLY_ACCESS_SESSION_PATH = "/api/research/early-access/session";
export const EARLY_ACCESS_LOGOUT_PATH = "/api/research/early-access/logout";

export const EARLY_ACCESS_API_PATHS = Object.freeze([
  EARLY_ACCESS_UNLOCK_PATH,
  EARLY_ACCESS_SESSION_PATH,
  EARLY_ACCESS_LOGOUT_PATH,
] as const);

/** A 43-character base64url encoding of 32 random bytes. */
function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The rate-limit identity.
 *
 * Deciding which header is trustworthy is a deployment question, so it is
 * answered here rather than inside the handler. Express's `req.ip` already
 * honours the app's configured `trust proxy` setting, which is the only source
 * that reflects what the deployment actually trusts. A spoofable
 * `X-Forwarded-For` is deliberately NOT read directly.
 *
 * Returning a stable fallback rather than nothing matters: a missing key fails
 * closed in the handler, which would refuse every unlock. Callers behind an
 * unusual proxy get one shared bucket, which is strict rather than open.
 */
function clientKeyFor(request: Request): string {
  const ip = typeof request.ip === "string" && request.ip.length > 0 ? request.ip : null;
  return ip ?? "private-early-access:unknown-client";
}

export interface EarlyAccessRegistrationOptions {
  readonly config?: EarlyAccessConfig;
  readonly repository?: PrivateAccessSessionRepository;
  readonly now?: () => number;
}

/**
 * Register the three Early Access API routes.
 *
 * Returns the resolved configuration so the caller can report deployment
 * status without re-reading the environment.
 */
export function registerPrivateEarlyAccessApi(
  app: Express,
  options: EarlyAccessRegistrationOptions = {},
): EarlyAccessConfig {
  const config = options.config ?? resolveEarlyAccessConfig();
  const repository = options.repository ?? new InMemoryPrivateAccessSessionRepository();

  // An in-memory session vanishes on restart, on redeploy, and whenever a
  // request lands on another instance, which would sign a customer out in the
  // middle of an order. Production with the gate OPEN therefore requires a
  // durable store; rather than degrade silently, the gate stays shut and says
  // why. Production with the gate closed is fine, because nobody can reach it.
  const decision = decideEarlyAccessAdapter({
    isProduction: process.env.NODE_ENV === "production",
    earlyAccessEnabled: config.enabled,
    durableAvailable: isGrantIssuingRepository(repository),
  });
  if (!decision.ok) {
    // eslint-disable-next-line no-console
    console.error(`[early-access] ${decision.reason}`);
  } else if (decision.warning !== null) {
    // eslint-disable-next-line no-console
    console.warn(`[early-access] ${decision.warning}`);
  }
  // A refused decision forces the gate closed for this process regardless of
  // the flag, so no unlock can mint a session the deployment cannot keep.
  const effectiveConfig: EarlyAccessConfig = decision.ok
    ? config
    : Object.freeze({ ...config, enabled: false });
  const now = options.now ?? (() => Date.now());

  const deps: PrivateAccessRouteDependencies = { config: effectiveConfig, repository, now, randomToken };

  const unlock = createUnlockRoute(deps);
  const session = createSessionRoute(deps);
  const logout = createLogoutRoute(deps);

  app.post(EARLY_ACCESS_UNLOCK_PATH, (req: Request, res: Response) => {
    void unlock({ body: req.body, clientKey: clientKeyFor(req) }, res);
  });

  app.get(EARLY_ACCESS_SESSION_PATH, (req: Request, res: Response) => {
    void session({ cookieHeader: req.headers.cookie }, res);
  });

  app.post(EARLY_ACCESS_LOGOUT_PATH, (req: Request, res: Response) => {
    void logout({ cookieHeader: req.headers.cookie }, res);
  });

  return effectiveConfig;
}

/** Re-exported so the caller can assert the header set without a literal. */
export { PRIVATE_ACCESS_PRIVATE_HEADERS };
