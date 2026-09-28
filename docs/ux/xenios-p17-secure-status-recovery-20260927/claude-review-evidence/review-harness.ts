// Claude P-17 review harness (local only, never deployed).
// Serves the exact candidate build (dist/public via the candidate's own serveStatic)
// and the candidate's real status-recovery HTTP/service/notification code over its
// shipped in-memory store. The outbox is a local capture: prepared emails are
// written to a scratch file instead of being sent. No external service is contacted.
import express from "C:/xenios-wt/p17-review/node_modules/express/index.js";
import fs from "node:fs";
import path from "node:path";
import { registerStatusRecoveryApi } from "C:/xenios-wt/p17-review/server/research/status-recovery/http";
import { StatusRecoveryService } from "C:/xenios-wt/p17-review/server/research/status-recovery/service";
import { InMemoryStatusRecoveryStore } from "C:/xenios-wt/p17-review/server/research/status-recovery/memory-store";
import { statusRecoveryCrypto } from "C:/xenios-wt/p17-review/server/research/status-recovery/crypto";
import { prepareStatusRecoveryOutboxEmail } from "C:/xenios-wt/p17-review/server/research/status-recovery/notification";
import { buildStatusRecoveryView } from "C:/xenios-wt/p17-review/server/research/status-recovery/status-copy";
import { serveStatic } from "C:/xenios-wt/p17-review/server/static";

const PORT = Number(process.env.PORT || 5320);
const DIST = "C:/xenios-wt/p17-review/dist/public";
const CAPTURE = path.join(__dirname, "p17-outbox-capture.jsonl");

const store = new InMemoryStatusRecoveryStore();
const view = (status: string) => buildStatusRecoveryView({
  reference: "XRR-20260927-ABCDEF1234",
  status,
  updatedAt: "2026-09-27T20:10:00.000Z",
  timeline: [
    { status: "submitted", occurredAt: "2026-09-27T20:00:00.000Z", customerMessage: "Your request was received." },
    { status: status, occurredAt: "2026-09-27T20:10:00.000Z", customerMessage: null },
  ],
});
store.addSubject({
  subjectType: "assisted_order",
  subjectId: "11111111-1111-4111-8111-111111111111",
  ownerId: null,
  publicReference: "XRR-20260927-ABCDEF1234",
  canonicalEmail: "owner@example.invalid",
}, view("payment_pending"));
store.addSubject({
  subjectType: "assisted_order",
  subjectId: "22222222-2222-4222-8222-222222222222",
  ownerId: null,
  publicReference: "XRR-20260927-0000000BBB",
  canonicalEmail: "other@example.invalid",
}, buildStatusRecoveryView({ reference: "XRR-20260927-0000000BBB", status: "shipped", updatedAt: "2026-09-27T20:10:00.000Z", timeline: [] }));

const hits = new Map<string, number[]>();
const rateLimit = async (key: string, windowSeconds: number, maxHits: number) => {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowSeconds * 1000);
  list.push(now);
  hits.set(key, list);
  return list.length <= maxHits;
};

const service = new StatusRecoveryService({
  store,
  outbox: {
    enqueue: async (intent) => {
      const prepared = await prepareStatusRecoveryOutboxEmail({
        job: { event_key: intent.eventKey, recipient: intent.recipient, payload: intent.payload },
        store,
        crypto: statusRecoveryCrypto,
        clock: { now: () => new Date(), nowMs: () => Date.now() },
        siteUrl: process.env.SITE_URL,
      });
      fs.appendFileSync(CAPTURE, JSON.stringify({ at: new Date().toISOString(), intentRecipient: intent.recipient, prepared }) + "\n");
      return true;
    },
  },
  rateLimit,
  clock: { now: () => new Date(), nowMs: () => Date.now() },
  crypto: statusRecoveryCrypto,
});

const app = express();
app.set("trust proxy", 2);
app.use(express.json({ limit: "32kb" }));
registerStatusRecoveryApi(app, service, { production: false });
app.use("/api", (_req, res) => res.status(503).json({ ok: false, message: "review harness: API not available" }));
serveStatic(app, DIST);
app.listen(PORT, "127.0.0.1", () => console.log(`p17 review harness on http://127.0.0.1:${PORT}`));
