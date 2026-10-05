import type { RequestHandler } from "express";

/** Default-off raw boundary proposed before global parsers. It has no auth,
 * persistence, logging or notification dependency and does not retain a body.
 * Replacing it with the qualified composition requires a reviewed successor.
 */
export function createQuickOrderContainment(): RequestHandler {
  return (req, res, next) => {
    const path = (req.originalUrl || req.url).split("?")[0];
    if (path !== "/api/health/quick-order" && !path.startsWith("/api/health/quick-order/")) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(503).json({ code: "feature_disabled", message: "Quick Order is not available for customer requests yet." });
  };
}
