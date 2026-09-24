// Isolated extension of the existing native fixture. Real signed-token reader,
// membership status route and projection; synthetic read-only PostgREST rows.
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { buildNativeCloseoutPreview } from "../../../scripts/preview-native-closeout";

const port = 5304;
const native = await buildNativeCloseoutPreview(port, path.resolve(process.argv[2] ?? "dist"));
const { registerMembershipApi, makeResearchToken } = await import("../../../server/research/membership");
const app = express();
app.use(express.json());
const rows = ["under_review", "approved_customer", "active"].map((status, i) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`, email: "status@preview.invalid", first_name: "Synthetic",
  last_name: "Audit", status, submitted_at: "2026-09-24T00:00:00.000Z",
  approval_expires_at: "2026-10-24T00:00:00.000Z",
}));
app.get("/preview-backend/rest/v1/research_applications", (req, res) => {
  if (req.headers.authorization !== "Bearer native-preview-service") return res.sendStatus(403);
  const id = String(req.query.id ?? "").replace(/^eq\./, "");
  return res.json(rows.find(row => row.id === id) ?? null);
});
app.get("/preview-backend/rest/v1/research_application_events", (req, res) => {
  if (req.headers.authorization !== "Bearer native-preview-service") return res.sendStatus(403);
  return res.json([]);
});
app.get("/__audit_tokens/:state", (req, res) => {
  const index = req.params.state === "approved" ? 1 : req.params.state === "active" ? 2 : 0;
  let token = makeResearchToken(index === 1 ? "account_claim" : "status", rows[index].id);
  if (req.params.state === "expired") {
    const payload = `v2.status.${rows[0].id}.${Date.now() - 60_000}`;
    const key = crypto.createHash("sha256").update(process.env.RESEARCH_SESSION_SECRET!).digest();
    token = payload + "." + crypto.createHmac("sha256", key).update(payload).digest("base64url");
  }
  res.redirect("/research/apply/status?token=" + encodeURIComponent(token));
});
// Only status reads reach the real membership registrar. All writes, including
// approval/claim/outbox operations, stay on the original fixture's closed wall.
app.use((req, res, next) => {
  if (req.path === "/api/research/applications/status" && req.method === "GET") return next();
  return native.app(req, res, next);
});
registerMembershipApi(app);
app.listen(port, "127.0.0.1", () => console.log("[audit-token-preview] local signed status fixtures only; 5304"));
