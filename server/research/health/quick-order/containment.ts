import type { RequestHandler } from "express";
import { classifyQuickOrderTarget } from "./paths.mjs";

/** Default-off raw boundary proposed before global parsers. It has no auth,
 * persistence, logging or notification dependency and does not retain a body.
 * Replacing it with the qualified composition requires a reviewed successor.
 */
export function createQuickOrderContainment(): RequestHandler {
  return (req, res, next) => {
    // App-root mount before parsers. Retain both the incoming target and the
    // host's effective target across its existing leading-slash normalization.
    if (classifyQuickOrderTarget(req).kind === "unrelated") {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(503).json({ code: "feature_disabled", message: "Quick Order is not available for customer requests yet." });
  };
}
