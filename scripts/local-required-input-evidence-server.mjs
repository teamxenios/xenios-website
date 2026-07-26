// Local-only browser-evidence server for the required-input admin surface.
// It proxies the real Vite client and supplies isolated fixture auth/API
// responses. It never connects to production, creates an account, or mutates
// a database.
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const port = Number(
  process.argv[2] ?? process.env.REQUIRED_INPUT_EVIDENCE_PORT ?? 5181,
);
const viteTarget =
  process.argv[3] ??
  process.env.REQUIRED_INPUT_EVIDENCE_VITE ??
  "http://127.0.0.1:5180";
const origin = `http://127.0.0.1:${port}`;
const userId = "51d4d3f3-442f-46e2-bf3d-a825864991a7";
const email = "release@example.test";

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encode({ alg: "none", typ: "JWT" })}.${encode({
  sub: userId,
  email,
  aud: "authenticated",
  role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
})}.fixture`;
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-07-25T00:00:00.000Z",
};
const session = {
  access_token: accessToken,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "local-fixture-refresh",
  user,
};

const item = {
  id: "077ff55c-8787-4713-9802-1e7d697ac967",
  key: "products.payment.credentials",
  domain: "products",
  label: "PAYMENT CREDENTIAL CONFIGURATION REQUIRED",
  description: "Approved payment-provider configuration.",
  whyRequired:
    "Checkout cannot send a transaction without reviewed configuration.",
  recordType: "environment_configuration",
  recordId: null,
  fieldPath: "payments.credentials",
  currentState: "missing",
  blockingLevel: "blocks_public_launch",
  responsibleRole: "super_admin",
  verificationMethod:
    "Presence and provider account review without revealing a value.",
  evidenceRequired: ["Configuration name", "Provider approval"],
  entryMode: "external_secret",
  enteredValue: null,
  externalReferenceName: null,
  enteredBy: null,
  enteredAt: null,
  verifiedBy: null,
  verifiedAt: null,
  rejectionReason: null,
  publicLaunchImpact: "Checkout remains unavailable.",
  nextAction: "Configure and verify the approved payment credential.",
  adminEntryHref: "/admin/research/required-inputs",
  version: 1,
  auditHistory: [],
};

const readiness = {
  domain: "products",
  launchStatus: "internal_review",
  softwareComplete: true,
  realInputsRequired: true,
  publicEnabled: false,
  manifestApproved: true,
  expectedInputCount: 1,
  actualInputCount: 1,
  blockingInputCount: 1,
  blockingKeys: [item.key],
  version: 2,
};

const app = express();
app.use(express.json());
app.get("/api/config", (_req, res) =>
  res.json({
    metaPixelId: null,
    turnstileSiteKey: null,
    calendlyUrl: "",
    supabaseUrl: `${origin}/supabase`,
    supabaseAnonKey: "local-fixture-anon-key",
  }),
);
app.post("/supabase/auth/v1/token", (_req, res) => res.json(session));
app.get("/supabase/auth/v1/user", (_req, res) => res.json(user));
app.post("/supabase/auth/v1/logout", (_req, res) => res.status(204).end());
app.get("/api/admin/me", (_req, res) =>
  res.json({ success: true, email }),
);
app.get("/api/admin/research/required-inputs", (_req, res) =>
  res.json({
    ok: true,
    items: [item],
    summary: {
      total: 1,
      missing: 1,
      launchBlocking: 1,
      transactionBlocking: 0,
      clinicalBlocking: 0,
      entered: 0,
      underReview: 0,
      verified: 0,
      rejected: 0,
      expired: 0,
    },
    readiness: [readiness],
  }),
);
app.use(
  createProxyMiddleware({
    target: viteTarget,
    changeOrigin: true,
    ws: true,
  }),
);

app.listen(port, "127.0.0.1", () => {
  console.log(`Required-input evidence server: ${origin}`);
});
