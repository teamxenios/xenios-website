import type { RequestHandler } from "express";

/** Default-off raw boundary proposed before global parsers. It has no auth,
 * persistence, logging or notification dependency and does not retain a body.
 * Replacing it with the qualified composition requires a reviewed successor.
 */
export function createQuickOrderContainment(): RequestHandler {
  return (req, res, next) => {
    // Mounted at the app root after the existing leading-slash normalizer.
    // originalUrl retains aliases such as //api/...; routing and the later
    // parsers use the rewritten url. req.path uses that effective URL with
    // Express's own pathname semantics, including absolute-form targets.
    const path = req.path;
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
