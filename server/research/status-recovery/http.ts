import type { Express, Request, Response } from "express";
import {
  STATUS_RECOVERY_NEUTRAL_RESPONSE,
  type StatusRecoveryRequestInput,
} from "../../../shared/research/status-recovery/contract";
import { StatusRecoveryCredentialError, StatusRecoveryService } from "./service";

export const STATUS_RECOVERY_COOKIE = "xr_status_recovery";
export const STATUS_RECOVERY_COOKIE_PATH = "/api/research/status";

function privateHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
}

function cookieValue(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === STATUS_RECOVERY_COOKIE) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function cookieOptions(production: boolean) {
  return Object.freeze({
    httpOnly: true,
    secure: production,
    sameSite: "strict" as const,
    path: STATUS_RECOVERY_COOKIE_PATH,
    maxAge: 24 * 60 * 60 * 1000,
  });
}

function clearCookieOptions(production: boolean) {
  return Object.freeze({
    httpOnly: true,
    secure: production,
    sameSite: "strict" as const,
    path: STATUS_RECOVERY_COOKIE_PATH,
  });
}

export function registerStatusRecoveryApi(
  app: Express,
  service: StatusRecoveryService,
  options: Readonly<{
    production?: boolean;
    publicClientKey?: (request: Request) => string;
  }> = {},
): void {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const publicClientKey = options.publicClientKey ?? ((request: Request) => request.ip || request.socket.remoteAddress || "unknown");

  app.post("/api/research/status-recovery/request", async (req, res) => {
    privateHeaders(res);
    await service.request(req.body as StatusRecoveryRequestInput, publicClientKey(req));
    // Deliberately literal and invariant. No match, eligibility, enqueue or
    // rate-limit fact is reflected into the public response.
    res.status(202).json(STATUS_RECOVERY_NEUTRAL_RESPONSE);
  });

  app.post("/api/research/status-recovery/exchange", async (req, res) => {
    privateHeaders(res);
    try {
      const rawSession = await service.exchange((req.body as { token?: unknown } | null)?.token);
      res.cookie(STATUS_RECOVERY_COOKIE, rawSession, cookieOptions(production));
      res.status(204).send();
    } catch (error) {
      if (!(error instanceof StatusRecoveryCredentialError)) throw error;
      res.status(401).json({ ok: false, message: "This secure status link is invalid or has expired." });
    }
  });

  app.get("/api/research/status", async (req, res) => {
    privateHeaders(res);
    try {
      const view = await service.status(cookieValue(req));
      res.status(200).json(view);
    } catch (error) {
      if (!(error instanceof StatusRecoveryCredentialError)) throw error;
      res.status(401).json({ ok: false, message: "Secure status access is required." });
    }
  });

  app.post("/api/research/status/end", async (req, res) => {
    privateHeaders(res);
    await service.end(cookieValue(req));
    res.clearCookie(STATUS_RECOVERY_COOKIE, clearCookieOptions(production));
    res.status(204).send();
  });
}
