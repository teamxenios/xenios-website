import { Router } from "express";
import { ZodError } from "zod";

import { BuyerRequestConflictError, submitBuyerRequest, type BuyerCommerceDependencies } from "./service";

/** Route factory only. Pack 01 deliberately does not mount it. */
export function createBuyerCommerceRouter(dependencies: BuyerCommerceDependencies): Router {
  const router = Router();
  router.post("/api/research/buyer/order-requests", async (request, response) => {
    response.set("Cache-Control", "no-store");
    try {
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
