import { createHash } from "node:crypto";

import { Router } from "express";
import { ZodError } from "zod";

import { rateLimitHit, requestIp } from "../rate-limit";
import { BuyerRequestConflictError, submitBuyerRequest, type BuyerCommerceDependencies } from "./service";

export const BUYER_REQUEST_RATE_WINDOW_SECONDS = 10 * 60;
export const BUYER_REQUEST_RATE_MAX_HITS = 5;
export const BUYER_REQUEST_MAX_CONTENT_LENGTH = 256 * 1024;

export interface BuyerCommerceRouteOptions {
  rateLimit?: (key: string, windowSeconds: number, maxHits: number) => Promise<boolean>;
  ip?: (request: Parameters<typeof requestIp>[0]) => string;
}

function rateKey(ip: string): string {
  return `buyer-request:${createHash("sha256").update(ip).digest("hex")}`;
}

/** Route factory only. Pack 01 deliberately does not mount it. */
export function createBuyerCommerceRouter(
  dependencies: BuyerCommerceDependencies,
  options: BuyerCommerceRouteOptions = {},
): Router {
  const router = Router();
  router.post("/api/research/buyer/order-requests", async (request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      const contentLength = Number(request.get("content-length") ?? "0");
      if (
        !Number.isFinite(contentLength) ||
        contentLength < 0 ||
        contentLength > BUYER_REQUEST_MAX_CONTENT_LENGTH
      ) {
        return response.status(413).json({ error: "request_too_large" });
      }
      const identify = options.ip ?? requestIp;
      const allowed = await (options.rateLimit ?? rateLimitHit)(
        rateKey(identify(request)),
        BUYER_REQUEST_RATE_WINDOW_SECONDS,
        BUYER_REQUEST_RATE_MAX_HITS,
      );
      if (!allowed) {
        response.set("Retry-After", String(BUYER_REQUEST_RATE_WINDOW_SECONDS));
        return response.status(429).json({ error: "too_many_requests" });
      }
      const receipt = await submitBuyerRequest(dependencies, request.body);
      return response.status(receipt.replayed ? 200 : 202).json(receipt);
    } catch (error) {
      if (error instanceof ZodError) {
        return response.status(400).json({ error: "invalid_request", issues: error.issues });
      }
      if (error instanceof BuyerRequestConflictError) {
        return response.status(409).json({ error: "idempotency_conflict" });
      }
      (request as { log?: { error?: (detail: unknown, message: string) => void } }).log?.error?.(
        { err: error },
        "buyer order request failed",
      );
      return response.status(500).json({ error: "request_failed" });
    }
  });
  return router;
}
