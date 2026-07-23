import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";
import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import { registerFoundingActivationApi, type FoundingActivationDependencies } from "./routes";
import { DisabledEsignProvider } from "./esign/provider";
import { createInMemoryEsignStore } from "./esign/persistence/esign-store";
import { InMemoryEsignMediaProvider } from "./esign/archive";
import type { EsignProvider, EsignStore, EsignWebhookEvent, PdfGenerator } from "./esign/contracts";
import {
  buildFoundingActivationDependencies,
  createInMemoryChecklistStore,
  type FoundingActivationWiring,
} from "./production-deps";
import { createInMemoryObligationsStore } from "./persistence/obligations-store";
import { createInMemoryPeriodsStore } from "./persistence/periods-store";
import { createInMemoryPaymentMethodsStore } from "./persistence/payment-methods-store";
import { createInMemoryBridgeStore } from "./persistence/bridge-store";
import { createInMemoryDocumentsStore, type DocumentsStore } from "./persistence/documents-store";
import { createInMemoryIdentityStore, type IdentityStore } from "./persistence/identity-store";
import {
  createInMemoryLedger,
  createInMemoryMembershipState,
  createInMemoryReceipts,
} from "./activation";
import { InMemoryIdempotencyStore } from "../commerce/persistence/idempotency-store";
import { InMemoryIdentityMediaProvider } from "./identity-documents";
import { DOCUMENT_CATEGORY_REGISTRY, DocumentLifecycle } from "./documents";
import { SUBMISSION_DISPLAY_CONTRACT } from "./obligations";
import type { InstructionCipher } from "./payment-methods";
import type { FoundingEmailEnqueueInput } from "./emails";

// ---------------------------------------------------------------------------
// The running-server harness: a REAL express app through the CANONICAL
// registration path, exactly as server/index.ts mounts it (json body parser
// with the rawBody verify hook, then registerFoundingActivationApi with
// injected guards). Guards authenticate from test headers, mirroring how the
// merged guards attach researchMember / adminEmail to the request.
//
// The flag lives ONLY in the injected env object; process.env is never
// touched and no store leaves this file.
// ---------------------------------------------------------------------------

const NOW = () => new Date("2026-07-22T00:00:00Z");

const LIVE_ENV: NodeJS.ProcessEnv = {
  RESEARCH_FOUNDING_ACTIVATION_ENABLED: "true",
  SUPABASE_URL: "https://activation.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_activation_key",
};

const MEMBER_HEADER = "x-test-member";
const ADMIN_HEADER = "x-test-admin";
const MEMBER_A = "member-aaaa-1111";
const MEMBER_B = "member-bbbb-2222";
const ADMIN_EMAIL = "samuel@admin.test";

const MEMBER_EMAILS: Record<string, string> = {
  [MEMBER_A]: "member-a@members.test",
  [MEMBER_B]: "member-b@members.test",
};

/** The exact plaintext the string-scans hunt for. Never a real destination. */
const PLAINTEXT_INSTRUCTIONS = "zelle-destination-PLAINTEXT-9911";
const CIPHERTEXT_PREFIX = "testenc:";

/** The records address the admin e-sign completion notice is sent to. */
const ADMIN_RECORDS_EMAIL = "records@xenios.test";

/** A known test secret so the signed-vs-unsigned webhook check is genuine. */
const ESIGN_WEBHOOK_SECRET = "test-esign-webhook-secret-value";

function esignSignature(rawBody: string): string {
  return crypto.createHmac("sha256", ESIGN_WEBHOOK_SECRET).update(rawBody, "utf8").digest("hex");
}

/**
 * A fake LIVE OpenSign provider: it provisions, sessions, and fetches like the
 * real one, and its verifyWebhook does a REAL HMAC-SHA256 check against the test
 * secret, so the signed-vs-unsigned test is genuine. createSigningSession is
 * counted so a test can prove idempotency; fetchCompletedFile is counted so a
 * test can prove a rejected webhook never ingests.
 */
function fakeLiveEsignProvider() {
  const counts = { provisionTemplate: 0, createSigningSession: 0, fetchCompletedFile: 0 };
  let docCounter = 0;
  const provider: EsignProvider = {
    name: "opensign",
    isLive: true,
    async provisionTemplate(spec) {
      counts.provisionTemplate += 1;
      return {
        ok: true,
        value: { providerTemplateId: `ptid-${spec.templateKey}`, providerTemplateVersion: "1" },
      };
    },
    async createSigningSession() {
      counts.createSigningSession += 1;
      docCounter += 1;
      return {
        ok: true,
        value: {
          providerDocumentId: `pdoc-${docCounter}`,
          signingUrl: `https://sign.example/${docCounter}`,
          expiresAt: null,
        },
      };
    },
    async fetchCompletedFile(input) {
      counts.fetchCompletedFile += 1;
      return { ok: true, value: { bytes: Buffer.from(`pdf:${input.fileUrl}`), contentType: "application/pdf" } };
    },
    verifyWebhook(rawBody, signatureHeader) {
      if (!signatureHeader || signatureHeader !== esignSignature(rawBody)) {
        return { ok: false, code: "invalid_signature" };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return { ok: false, code: "malformed" };
      }
      return { ok: true, event: parsed as EsignWebhookEvent };
    },
  };
  return { provider, counts };
}

let esignEventCounter = 0;

/** A completed-signing webhook event body for one provider document. */
function completedWebhookBody(
  providerDocumentId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  esignEventCounter += 1;
  return {
    eventId: `evt-${esignEventCounter}`,
    type: "completed",
    providerDocumentId,
    signedFileUrl: `https://provider.example/${providerDocumentId}/signed.pdf`,
    certificateUrl: `https://provider.example/${providerDocumentId}/certificate.pdf`,
    signerEmail: MEMBER_EMAILS[MEMBER_A],
    externalReference: providerDocumentId,
    occurredAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

/** POST a webhook body with a signature (correct by default). */
function postEsignWebhook(app: Express, body: Record<string, unknown>, signature?: string) {
  const raw = JSON.stringify(body);
  return request(app)
    .post("/api/research/webhooks/esign")
    .set("Content-Type", "application/json")
    .set("x-webhook-signature", signature ?? esignSignature(raw))
    .send(raw);
}

const testCipher: InstructionCipher = {
  encrypt: (plaintext) => `${CIPHERTEXT_PREFIX}${Buffer.from(plaintext, "utf8").toString("base64")}`,
  decrypt: (ciphertext) =>
    Buffer.from(ciphertext.slice(CIPHERTEXT_PREFIX.length), "base64").toString("utf8"),
};

const guards = {
  requireMember: (req: Request, res: Response, next: () => void) => {
    const id = req.get(MEMBER_HEADER);
    if (!id) {
      res.status(401).json({ ok: false, message: "Sign in required." });
      return;
    }
    (req as unknown as { researchMember: Record<string, unknown> }).researchMember = {
      id,
      email: MEMBER_EMAILS[id] ?? `${id}@members.test`,
      status: "pending_activation",
    };
    next();
  },
  requireSupabaseAdmin: (req: Request, res: Response, next: () => void) => {
    if (req.get(ADMIN_HEADER) !== "yes") {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    (req as unknown as { adminEmail: string }).adminEmail = ADMIN_EMAIL;
    next();
  },
};

function buildApp(deps: FoundingActivationDependencies): Express {
  const app = express();
  app.use(
    // Mirror server/index.ts: an explicit 2mb limit that admits a native drawn
    // signature (capped tighter at the route) and rejects a genuinely oversized
    // body with 413.
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: Buffer }).rawBody = buf;
      },
    }),
  );
  registerFoundingActivationApi(app, deps, guards);
  return app;
}

interface LiveContext {
  app: Express;
  enqueued: FoundingEmailEnqueueInput[];
  documentsStore: DocumentsStore;
  identityStore: IdentityStore;
  media: InMemoryIdentityMediaProvider;
  esignStore: EsignStore;
  esignMedia: InMemoryEsignMediaProvider;
  esignCounts: { provisionTemplate: number; createSigningSession: number; fetchCompletedFile: number };
}

/** A deterministic PDF generator for the native tests (no pdf-lib in the hot
 * path; real bytes so hashes are stable). */
const fakePdfGenerator: PdfGenerator = {
  generateSignedAgreementPdf: async (input) =>
    Buffer.from(`SIGNED ${input.documentVersionId} ${input.typedLegalName} ${input.signatureMethod}`, "utf8"),
  generateCompletionCertificatePdf: async (input) =>
    Buffer.from(`CERT ${input.signingRequestId} ${input.signedPdfSha256}`, "utf8"),
};

function liveContext(opts: { esignProvider?: EsignProvider; esignEnabled?: boolean } = {}): LiveContext {
  const obligationsStore = createInMemoryObligationsStore();
  const periodsStore = createInMemoryPeriodsStore();
  const methodsStore = createInMemoryPaymentMethodsStore();
  const bridgeStore = createInMemoryBridgeStore();
  const documentsStore = createInMemoryDocumentsStore();
  const identityStore = createInMemoryIdentityStore();
  const membership = createInMemoryMembershipState();
  const ledger = createInMemoryLedger();
  const receipts = createInMemoryReceipts();
  const idempotency = new InMemoryIdempotencyStore();
  const media = new InMemoryIdentityMediaProvider();
  const checklist = createInMemoryChecklistStore();
  const enqueued: FoundingEmailEnqueueInput[] = [];
  const esignStore = createInMemoryEsignStore();
  const esignMedia = new InMemoryEsignMediaProvider();
  // Default to a fake LIVE provider; a test may inject a Disabled one instead.
  const esignBits = opts.esignProvider
    ? {
        provider: opts.esignProvider,
        counts: { provisionTemplate: 0, createSigningSession: 0, fetchCompletedFile: 0 },
      }
    : fakeLiveEsignProvider();
  // The native (embedded) path is enabled by RESEARCH_ESIGN_ENABLED alone.
  const env = opts.esignEnabled ? { ...LIVE_ENV, RESEARCH_ESIGN_ENABLED: "true" } : LIVE_ENV;
  const deps = buildFoundingActivationDependencies(NOW, env, {
    resolveObligationsStore: () => obligationsStore,
    resolvePeriodsStore: () => periodsStore,
    resolvePaymentMethodsStore: () => methodsStore,
    resolveBridgeStore: () => bridgeStore,
    resolveDocumentsStore: () => documentsStore,
    resolveIdentityStore: () => identityStore,
    resolveMembershipWriter: () => membership,
    resolveLedger: () => ledger,
    resolveReceipts: () => receipts,
    resolveIdempotencyStore: () => idempotency,
    resolveIdentityMedia: () => media,
    resolveEvidenceMedia: () => media,
    resolveInstructionCipher: () => testCipher,
    resolveChecklistStore: () => checklist,
    memberEmail: async (memberId) => MEMBER_EMAILS[memberId] ?? null,
    enqueueEmail: async (input) => {
      enqueued.push(input);
      return true;
    },
    resolveEsignProvider: () => esignBits.provider,
    resolveEsignStore: () => esignStore,
    resolveEsignMedia: () => esignMedia,
    resolveEsignPdfGenerator: () => fakePdfGenerator,
    adminRecordsEmail: ADMIN_RECORDS_EMAIL,
  });
  return {
    app: buildApp(deps),
    enqueued,
    documentsStore,
    identityStore,
    media,
    esignStore,
    esignMedia,
    esignCounts: esignBits.counts,
  };
}

/** Publish one version of every category through the real lifecycle. */
async function publishAllCategories(store: DocumentsStore): Promise<void> {
  const lifecycle = new DocumentLifecycle(store, { now: NOW });
  for (const definition of DOCUMENT_CATEGORY_REGISTRY) {
    const draft = await lifecycle.createDraft({
      category: definition.category,
      semver: "1.0.0",
      jurisdiction: "US-TX",
      content: `Reviewed test text for ${definition.category}.`,
    });
    await lifecycle.setCounselReview(draft.id, "approved");
    await lifecycle.transition(draft.id, "under_legal_review");
    await lifecycle.transition(draft.id, "approved_for_publication");
    await lifecycle.publish(draft.id, { publisher: "counsel-test" });
  }
}

const METHOD_BODY = {
  methodId: "zelle-1",
  providerCode: "zelle",
  memberFacingName: "Zelle",
  adminFacingName: "Zelle business account",
  duration: "permanent",
  activationEligible: true,
  renewalEligible: true,
  settlementTime: "same day",
  receivingLegalEntity: "Xenios Technology LLC",
  ownershipClassification: "business",
  receivingInstructions: PLAINTEXT_INSTRUCTIONS,
  memoInstructions: "Include your XRM reference in the payment memo.",
};

const VERIFY_BODY = {
  amountReceivedCents: 5000,
  dateReceived: "2026-07-21",
  receivingDestinationRef: "recv-acct-1",
  methodId: "zelle-1",
  externalRef: "ZP-1001",
  reconciliationDate: "2026-07-22",
  note: null,
  confirmedReceived: true,
  idempotencyKey: "verify-key-1",
};

/**
 * Drive a member all the way through the identity review and every required
 * agreement, over HTTP, so both activation gates (verified identity + satisfied
 * agreements) pass. select-method enforces exactly these gates before it will
 * mint the $50 obligation, so any test that needs an obligation must run this
 * first (the happy-path test does the same steps inline).
 */
async function completeIdentityAndAgreements(
  ctx: LiveContext,
  member: string = MEMBER_A,
): Promise<void> {
  await publishAllCategories(ctx.documentsStore);
  // Identity: consent -> upload -> mark uploaded -> admin verifies.
  await request(ctx.app)
    .post("/api/research/activation/identity/consent")
    .set(MEMBER_HEADER, member)
    .send({ accepted: true, consentVersion: "icv-1" });
  await request(ctx.app)
    .post("/api/research/activation/identity/upload-url")
    .set(MEMBER_HEADER, member)
    .send({ contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg" });
  await request(ctx.app)
    .post("/api/research/activation/identity/mark-uploaded")
    .set(MEMBER_HEADER, member)
    .send({});
  const identityQueue = await request(ctx.app)
    .get("/api/admin/research/activation/identity/queue")
    .set(ADMIN_HEADER, "yes");
  const caseId = identityQueue.body.queue.find(
    (c: { memberId: string }) => c.memberId === member,
  ).caseId as string;
  await request(ctx.app)
    .post(`/api/admin/research/activation/identity/${caseId}/review`)
    .set(ADMIN_HEADER, "yes")
    .send({ nameMatch: "match", ageThresholdMet: true, documentNotExpired: true, jurisdiction: "TX", licenseLast4: null });
  // Agreements: sign every published category in the returned order.
  const required = await request(ctx.app)
    .get("/api/research/activation/agreements")
    .set(MEMBER_HEADER, member);
  for (const agreement of required.body.agreements) {
    await request(ctx.app)
      .post("/api/research/activation/agreements/sign")
      .set(MEMBER_HEADER, member)
      .send({
        documentVersionId: agreement.documentVersionId,
        typedLegalName: "Member Aye Test",
        fullDocumentShown: true,
        affirmativeConsent: true,
        separateAcknowledgment: true,
      });
  }
}

/** Stand up a method (created + approved) and an active bridge, over HTTP. */
async function provisionMethodAndBridge(app: Express): Promise<void> {
  const created = await request(app)
    .post("/api/admin/research/activation/methods")
    .set(ADMIN_HEADER, "yes")
    .send(METHOD_BODY);
  expect(created.status).toBe(200);
  const approved = await request(app)
    .post("/api/admin/research/activation/methods/zelle-1/approve")
    .set(ADMIN_HEADER, "yes")
    .send({ complianceReviewNote: "reviewed" });
  expect(approved.status).toBe(200);
  const bridge = await request(app)
    .put("/api/admin/research/activation/bridge/settings")
    .set(ADMIN_HEADER, "yes")
    .send({ action: "initialize", startAt: "2026-07-20T00:00:00Z", timezone: "America/Chicago" });
  expect(bridge.status).toBe(200);
  expect(bridge.body.phase).toBe("active");
}

// ---------------------------------------------------------------------------
// The three states, per route group, spy-proven side-effect free
// ---------------------------------------------------------------------------

const REPRESENTATIVE_ROUTES: Array<{ method: "get" | "post" | "put"; path: string }> = [
  { method: "get", path: "/api/research/activation/status" },
  { method: "post", path: "/api/research/activation/identity/consent" },
  { method: "get", path: "/api/research/activation/identity/status" },
  { method: "get", path: "/api/research/activation/agreements" },
  { method: "post", path: "/api/research/activation/agreements/sign" },
  { method: "get", path: "/api/research/activation/payment/methods" },
  { method: "post", path: "/api/research/activation/payment/select-method" },
  { method: "post", path: "/api/research/activation/payment/report" },
  { method: "post", path: "/api/research/activation/payment/evidence-upload-url" },
  { method: "get", path: "/api/admin/research/activation/queue" },
  { method: "post", path: "/api/admin/research/activation/queue/ob-1/verify" },
  { method: "post", path: "/api/admin/research/activation/queue/ob-1/reject" },
  { method: "get", path: "/api/admin/research/activation/bridge/settings" },
  { method: "put", path: "/api/admin/research/activation/bridge/checklist" },
  { method: "post", path: "/api/admin/research/activation/methods" },
  { method: "get", path: "/api/admin/research/activation/reconciliation" },
  { method: "get", path: "/api/admin/research/activation/readiness" },
  { method: "get", path: "/api/admin/research/activation/identity/queue" },
  { method: "post", path: "/api/admin/research/activation/identity/c-1/review" },
  // E-signature: a member route, the unguarded webhook, and an admin route are
  // all behind the three-state gate first.
  { method: "post", path: "/api/research/activation/esign/session" },
  { method: "post", path: "/api/research/activation/esign/native/sign" },
  { method: "post", path: "/api/research/webhooks/esign" },
  { method: "get", path: "/api/admin/research/activation/esign/member/m-1" },
];

function refusingWiring(): {
  wiring: Partial<FoundingActivationWiring>;
  spies: ReturnType<typeof vi.fn>[];
} {
  const spies: ReturnType<typeof vi.fn>[] = [];
  const refuse = () => {
    const fn = vi.fn(() => {
      throw new Error("no store or provider may be touched in this state");
    });
    spies.push(fn);
    return fn;
  };
  const wiring = {
    resolveObligationsStore: refuse(),
    resolvePeriodsStore: refuse(),
    resolvePaymentMethodsStore: refuse(),
    resolveBridgeStore: refuse(),
    resolveDocumentsStore: refuse(),
    resolveIdentityStore: refuse(),
    resolveMembershipWriter: refuse(),
    resolveLedger: refuse(),
    resolveReceipts: refuse(),
    resolveIdempotencyStore: refuse(),
    resolveIdentityMedia: refuse(),
    resolveEvidenceMedia: refuse(),
    resolveInstructionCipher: refuse(),
    resolveChecklistStore: refuse(),
  } as unknown as Partial<FoundingActivationWiring>;
  return { wiring, spies };
}

describe("state 1: flag off, every route group answers capability_disabled", () => {
  const { wiring, spies } = refusingWiring();
  const app = buildApp(buildFoundingActivationDependencies(NOW, {}, wiring));

  it("refuses every representative route, with no auth backend consulted", async () => {
    for (const route of REPRESENTATIVE_ROUTES) {
      // No auth headers on purpose: the state gate answers BEFORE the guard,
      // so even the auth path is never touched while the flag is off.
      const res = await request(app)[route.method](route.path).send({});
      expect(res.status, `${route.method} ${route.path}`).toBe(503);
      expect(res.body).toMatchObject({ ok: false, code: "capability_disabled" });
    }
  });

  it("touched no store, provider, or resolver (spy-proven)", () => {
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("state 2: flag on, storage unprovisioned, every route group answers precisely", () => {
  const { wiring, spies } = refusingWiring();
  const app = buildApp(
    buildFoundingActivationDependencies(NOW, { RESEARCH_FOUNDING_ACTIVATION_ENABLED: "true" }, wiring),
  );

  it("refuses every representative route with not_provisioned and no partial write", async () => {
    for (const route of REPRESENTATIVE_ROUTES) {
      const res = await request(app)[route.method](route.path).send({});
      expect(res.status, `${route.method} ${route.path}`).toBe(503);
      expect(res.body).toMatchObject({ ok: false, code: "not_provisioned" });
    }
  });

  it("touched no store, provider, or resolver (spy-proven)", () => {
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// State 3: authentication and the pre-auth boundary
// ---------------------------------------------------------------------------

describe("state 3: the auth boundary", () => {
  it("refuses the payment methods endpoint pre-auth, and before the activation gates", async () => {
    const ctx = liveContext();
    await provisionMethodAndBridge(ctx.app);

    // NEVER pre-auth: without a member session the guard answers 401 and no
    // method detail of any kind is served.
    const anonymous = await request(ctx.app).get("/api/research/activation/payment/methods");
    expect(anonymous.status).toBe(401);
    expect(JSON.stringify(anonymous.body)).not.toContain(PLAINTEXT_INSTRUCTIONS);
    expect(JSON.stringify(anonymous.body)).not.toContain("••••");

    // Authenticated but with NO obligation and NO verified identity: the
    // precise identity denial, and still no method detail of any kind.
    const noIdentity = await request(ctx.app)
      .get("/api/research/activation/payment/methods")
      .set(MEMBER_HEADER, MEMBER_B);
    expect(noIdentity.status).toBe(409);
    expect(noIdentity.body.code).toBe("identity_not_verified");
    expect(JSON.stringify(noIdentity.body)).not.toContain("••••");

    // Identity verified through the real flow, but agreements NOT satisfied
    // (no published paper): the precise agreements denial, still no methods.
    await request(ctx.app)
      .post("/api/research/activation/identity/consent")
      .set(MEMBER_HEADER, MEMBER_B)
      .send({ accepted: true, consentVersion: "icv-1" });
    await request(ctx.app)
      .post("/api/research/activation/identity/upload-url")
      .set(MEMBER_HEADER, MEMBER_B)
      .send({ contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg" });
    await request(ctx.app)
      .post("/api/research/activation/identity/mark-uploaded")
      .set(MEMBER_HEADER, MEMBER_B)
      .send({});
    const identityQueue = await request(ctx.app)
      .get("/api/admin/research/activation/identity/queue")
      .set(ADMIN_HEADER, "yes");
    await request(ctx.app)
      .post(`/api/admin/research/activation/identity/${identityQueue.body.queue[0].caseId}/review`)
      .set(ADMIN_HEADER, "yes")
      .send({ nameMatch: "match", ageThresholdMet: true, documentNotExpired: true, jurisdiction: "TX", licenseLast4: null });

    const noAgreements = await request(ctx.app)
      .get("/api/research/activation/payment/methods")
      .set(MEMBER_HEADER, MEMBER_B);
    expect(noAgreements.status).toBe(409);
    expect(noAgreements.body.code).toBe("agreements_unsatisfied");
    expect(JSON.stringify(noAgreements.body)).not.toContain("••••");
    expect(JSON.stringify(noAgreements.body)).not.toContain(PLAINTEXT_INSTRUCTIONS);
  });

  it("refuses admin routes without the admin guard", async () => {
    const ctx = liveContext();
    const res = await request(ctx.app).get("/api/admin/research/activation/queue");
    expect(res.status).toBe(401);
    const asMember = await request(ctx.app)
      .get("/api/admin/research/activation/queue")
      .set(MEMBER_HEADER, MEMBER_A);
    expect(asMember.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// State 3: the full happy path over HTTP, plus isolation and the string-scan
// ---------------------------------------------------------------------------

describe("state 3: the full happy path over HTTP", () => {
  it("runs consent -> upload -> agreements -> obligation -> methods -> report -> verify -> active", async () => {
    const ctx = liveContext();
    await publishAllCategories(ctx.documentsStore);
    await provisionMethodAndBridge(ctx.app);

    /** Every member-visible and admin-visible body, scanned at the end. */
    const scannedBodies: unknown[] = [];
    const asA = (res: request.Response) => {
      scannedBodies.push(res.body);
      return res;
    };

    // The method create response never echoes the plaintext or ciphertext.
    const methodList = await request(ctx.app)
      .get("/api/admin/research/activation/methods")
      .set(ADMIN_HEADER, "yes");
    expect(methodList.status).toBe(200);
    scannedBodies.push(methodList.body);
    expect(methodList.body.methods[0].receivingInstructionsMasked).toBe("••••11");
    expect(JSON.stringify(methodList.body)).not.toContain("receivingInstructionsEncrypted");

    // Initial tracker: nothing done yet beyond account steps.
    const initial = asA(
      await request(ctx.app).get("/api/research/activation/status").set(MEMBER_HEADER, MEMBER_A),
    );
    expect(initial.status).toBe(200);
    expect(initial.body.active).toBe(false);
    expect(initial.body.currentStep).toBe("consents");
    expect(initial.body.submissionContract).toBe(SUBMISSION_DISPLAY_CONTRACT);

    // Identity: consent first, then the upload path.
    const consent = asA(
      await request(ctx.app)
        .post("/api/research/activation/identity/consent")
        .set(MEMBER_HEADER, MEMBER_A)
        .send({ accepted: true, consentVersion: "icv-1" }),
    );
    expect(consent.status).toBe(200);
    expect(consent.body.case.status).toBe("consent_recorded");

    const uploadUrl = asA(
      await request(ctx.app)
        .post("/api/research/activation/identity/upload-url")
        .set(MEMBER_HEADER, MEMBER_A)
        .send({ contentType: "image/jpeg", contentLengthBytes: 123_456, fileName: "id-front.jpg" }),
    );
    expect(uploadUrl.status).toBe(200);
    expect(uploadUrl.body.grant.uploadUrl).toContain("identity-upload");
    // The storage path is server-only; the member grant does not carry it.
    expect(uploadUrl.body.grant.storagePath).toBeUndefined();

    const uploaded = asA(
      await request(ctx.app)
        .post("/api/research/activation/identity/mark-uploaded")
        .set(MEMBER_HEADER, MEMBER_A)
        .send({}),
    );
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.case.status).toBe("review_pending");

    // Admin identity review: queue, audited view, manual_name_age outcome.
    const identityQueue = await request(ctx.app)
      .get("/api/admin/research/activation/identity/queue")
      .set(ADMIN_HEADER, "yes");
    expect(identityQueue.status).toBe(200);
    expect(identityQueue.body.queue).toHaveLength(1);
    const caseId = identityQueue.body.queue[0].caseId as string;
    expect(identityQueue.body.queue[0].memberId).toBe(MEMBER_A);
    expect(JSON.stringify(identityQueue.body)).not.toContain("storagePath");

    const view = await request(ctx.app)
      .get(`/api/admin/research/activation/identity/${caseId}/view`)
      .set(ADMIN_HEADER, "yes");
    expect(view.status).toBe(200);
    expect(view.body.grant.signedUrl).toContain("identity-signed");
    const auditEvents = await ctx.identityStore.listAuditEvents("xenios-research", caseId);
    expect(auditEvents.some((event) => event.kind === "admin_viewed" && event.actorId === ADMIN_EMAIL)).toBe(true);

    const review = await request(ctx.app)
      .post(`/api/admin/research/activation/identity/${caseId}/review`)
      .set(ADMIN_HEADER, "yes")
      .send({
        nameMatch: "match",
        ageThresholdMet: true,
        documentNotExpired: true,
        jurisdiction: "TX",
        licenseLast4: "1234",
      });
    expect(review.status).toBe(200);
    expect(review.body.review.outcome).toBe("verified");
    expect(review.body.review.reviewerId).toBe(ADMIN_EMAIL);

    // Agreements: published versions with content + hash, signed in order.
    const required = asA(
      await request(ctx.app).get("/api/research/activation/agreements").set(MEMBER_HEADER, MEMBER_A),
    );
    expect(required.status).toBe(200);
    expect(required.body.agreements).toHaveLength(DOCUMENT_CATEGORY_REGISTRY.length);
    expect(required.body.satisfied).toBe(false);
    expect(required.body.agreements[0].category).toBe("electronic_record_consent");
    for (const agreement of required.body.agreements) {
      expect(agreement.content.length).toBeGreaterThan(0);
      expect(agreement.contentHash).toMatch(/^[0-9a-f]{64}$/);
      const signed = asA(
        await request(ctx.app)
          .post("/api/research/activation/agreements/sign")
          .set(MEMBER_HEADER, MEMBER_A)
          .send({
            documentVersionId: agreement.documentVersionId,
            typedLegalName: "Member Aye Test",
            fullDocumentShown: true,
            affirmativeConsent: true,
            separateAcknowledgment: true,
          }),
      );
      expect(signed.status, agreement.category).toBe(200);
      expect(signed.body.signature.contentHash).toBe(agreement.contentHash);
    }
    const afterSigning = asA(
      await request(ctx.app).get("/api/research/activation/agreements").set(MEMBER_HEADER, MEMBER_A),
    );
    expect(afterSigning.body.satisfied).toBe(true);

    // Durable copies.
    const signedCopies = asA(
      await request(ctx.app).get("/api/research/activation/agreements/signed").set(MEMBER_HEADER, MEMBER_A),
    );
    expect(signedCopies.status).toBe(200);
    expect(signedCopies.body.signed).toHaveLength(DOCUMENT_CATEGORY_REGISTRY.length);
    expect(signedCopies.body.signed[0].document.content.length).toBeGreaterThan(0);

    // Methods BEFORE any obligation exists: the identity and agreements gates
    // both pass, so the first-time member can actually choose. Masked
    // instructions only, no memo reference yet, and each method carries its
    // activation eligibility from the bridge creation gate.
    const preMethods = asA(
      await request(ctx.app)
        .get("/api/research/activation/payment/methods")
        .set(MEMBER_HEADER, MEMBER_A),
    );
    expect(preMethods.status).toBe(200);
    expect(preMethods.body.methods).toHaveLength(1);
    expect(preMethods.body.methods[0].receivingInstructionsMasked).toBe("••••11");
    expect(preMethods.body.methods[0].activationEligibleNow).toBe(true);
    expect(preMethods.body.methods[0].memoReference).toBeUndefined();
    expect(preMethods.body.memoReference).toBeNull();

    // The obligation: created through the bridge gate.
    const selected = asA(
      await request(ctx.app)
        .post("/api/research/activation/payment/select-method")
        .set(MEMBER_HEADER, MEMBER_A)
        .send({ methodId: "zelle-1" }),
    );
    expect(selected.status).toBe(200);
    expect(selected.body.created).toBe(true);
    const xeniosRef = selected.body.obligation.xeniosRef as string;
    expect(xeniosRef).toMatch(/^XRM-[A-Z2-9]{8}$/);
    expect(selected.body.obligation.status).toBe("due");
    expect(selected.body.obligation.expectedAmountCents).toBe(5000);

    const obligation = asA(
      await request(ctx.app)
        .get("/api/research/activation/payment/obligation")
        .set(MEMBER_HEADER, MEMBER_A),
    );
    expect(obligation.status).toBe(200);
    expect(obligation.body.obligation.xeniosRef).toBe(xeniosRef);
    expect(obligation.body.submissionContract).toBe(SUBMISSION_DISPLAY_CONTRACT);

    // Methods for the authenticated member WITH an obligation: masked only.
    const methods = asA(
      await request(ctx.app)
        .get("/api/research/activation/payment/methods")
        .set(MEMBER_HEADER, MEMBER_A),
    );
    expect(methods.status).toBe(200);
    expect(methods.body.methods).toHaveLength(1);
    expect(methods.body.methods[0].receivingInstructionsMasked).toBe("••••11");
    expect(methods.body.methods[0].memoReference).toBe(xeniosRef);
    expect(methods.body.memoReference).toBe(xeniosRef);

    // Evidence upload through the media seam, evidence configuration.
    const evidence = asA(
      await request(ctx.app)
        .post("/api/research/activation/payment/evidence-upload-url")
        .set(MEMBER_HEADER, MEMBER_A)
        .send({ contentType: "image/png", contentLengthBytes: 2048, fileName: "proof.png" }),
    );
    expect(evidence.status).toBe(200);
    const evidenceRef = evidence.body.grant.evidenceRef as string;
    expect(evidenceRef).toContain("payment-evidence/");

    // The member's report: a report, never an activation.
    const reported = asA(
      await request(ctx.app)
        .post("/api/research/activation/payment/report")
        .set(MEMBER_HEADER, MEMBER_A)
        .send({
          amountCents: 5000,
          sentDate: "2026-07-21",
          sentTime: "14:05",
          senderName: "Member Aye Test",
          externalRef: "ZP-1001",
          evidenceRef,
          accuracyCertified: true,
        }),
    );
    expect(reported.status).toBe(200);
    expect(reported.body.obligation.status).toBe("submitted");

    // Still not active: submitting does not activate.
    const midStatus = asA(
      await request(ctx.app).get("/api/research/activation/status").set(MEMBER_HEADER, MEMBER_A),
    );
    expect(midStatus.body.active).toBe(false);

    // The admin queue carries the full domain record plus duplicates and
    // prior attempts.
    const queue = await request(ctx.app)
      .get("/api/admin/research/activation/queue")
      .set(ADMIN_HEADER, "yes");
    expect(queue.status).toBe(200);
    expect(queue.body.queue).toHaveLength(1);
    const entry = queue.body.queue[0];
    const obligationId = entry.obligationId as string;
    expect(entry.humanRef).toBe(xeniosRef);
    expect(entry.submission.senderName).toBe("Member Aye Test");
    expect(entry.submission.accuracyCertified).toBe(true);
    expect(entry.duplicates).toEqual([]);
    expect(entry.priorAttempts).toBe(1);

    const detail = await request(ctx.app)
      .get(`/api/admin/research/activation/queue/${obligationId}`)
      .set(ADMIN_HEADER, "yes");
    expect(detail.status).toBe(200);
    expect(detail.body.auditHistory.length).toBeGreaterThanOrEqual(2);
    expect(detail.body.auditHistory.some((e: { action: string }) => e.action === "member_submitted")).toBe(true);

    // A mismatched amount is refused before anything moves.
    const wrongAmount = await request(ctx.app)
      .post(`/api/admin/research/activation/queue/${obligationId}/verify`)
      .set(ADMIN_HEADER, "yes")
      .send({ ...VERIFY_BODY, amountReceivedCents: 4000, idempotencyKey: "verify-key-wrong" });
    expect(wrongAmount.status).toBe(409);
    expect(wrongAmount.body.code).toBe("amount_mismatch");

    // The verification: every field, explicit confirmation, idempotency key.
    const verified = await request(ctx.app)
      .post(`/api/admin/research/activation/queue/${obligationId}/verify`)
      .set(ADMIN_HEADER, "yes")
      .send(VERIFY_BODY);
    expect(verified.status).toBe(200);
    expect(verified.body.replayed).toBe(false);
    expect(verified.body.obligation.status).toBe("verified");
    expect(verified.body.obligation.verification.confirmedReceived).toBe(true);
    expect(verified.body.period.endsAt).toBe("2026-08-21T00:00:00.000Z");
    expect(verified.body.renewalObligation.type).toBe("renewal_25");
    expect(verified.body.renewalObligation.status).toBe("upcoming");
    expect(verified.body.receipt.receiptNumber).toBe(`RCPT-${xeniosRef}`);
    expect(verified.body.membership.status).toBe("active");
    const periodId = verified.body.period.periodId as string;

    // TWO CLICKS, ONE ACTIVATION: the same idempotency key replays the
    // stored result; nothing activates twice.
    const replay = await request(ctx.app)
      .post(`/api/admin/research/activation/queue/${obligationId}/verify`)
      .set(ADMIN_HEADER, "yes")
      .send(VERIFY_BODY);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.period.periodId).toBe(periodId);

    // A second attempt with a DIFFERENT key hits the status guard.
    const secondKey = await request(ctx.app)
      .post(`/api/admin/research/activation/queue/${obligationId}/verify`)
      .set(ADMIN_HEADER, "yes")
      .send({ ...VERIFY_BODY, idempotencyKey: "verify-key-2" });
    expect(secondKey.status).toBe(409);
    expect(secondKey.body.code).toBe("already_verified");

    // The tracker shows active with the renewal date.
    const finalStatus = asA(
      await request(ctx.app).get("/api/research/activation/status").set(MEMBER_HEADER, MEMBER_A),
    );
    expect(finalStatus.body.active).toBe(true);
    expect(finalStatus.body.renewalDate).toBe("2026-08-21T00:00:00.000Z");
    expect(finalStatus.body.currentStep).toBeNull();
    for (const step of finalStatus.body.steps) {
      expect(step.state, step.step).toBe("complete");
    }

    // The next payable obligation is the $25 renewal, due at the period end.
    const nextObligation = asA(
      await request(ctx.app)
        .get("/api/research/activation/payment/obligation")
        .set(MEMBER_HEADER, MEMBER_A),
    );
    expect(nextObligation.body.obligation.type).toBe("renewal_25");
    expect(nextObligation.body.obligation.dueAt).toBe("2026-08-21T00:00:00.000Z");

    // Reconciliation aggregates, JSON and CSV, no images and no references.
    const reconciliation = await request(ctx.app)
      .get("/api/admin/research/activation/reconciliation")
      .set(ADMIN_HEADER, "yes");
    expect(reconciliation.status).toBe(200);
    expect(reconciliation.body.report.days).toEqual([
      {
        date: "2026-07-22",
        count: 1,
        totalCents: 5000,
        byMethod: { Zelle: { count: 1, totalCents: 5000 } },
      },
    ]);
    const csv = await request(ctx.app)
      .get("/api/admin/research/activation/reconciliation?format=csv")
      .set(ADMIN_HEADER, "yes");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("date,method_label,verified_count,total_cents");
    expect(csv.text).toContain("2026-07-22,Zelle,1,5000");
    expect(csv.text).not.toContain("payment-evidence");
    expect(csv.text).not.toContain(PLAINTEXT_INSTRUCTIONS);
    expect(csv.text).not.toContain(MEMBER_A);

    // The emails: enqueued at the right transitions, through the outbox seam,
    // to the member's address, with no instruction material in any payload.
    const templates = ctx.enqueued.map((row) => row.templateKey);
    expect(templates).toContain("fm_activation_obligation_created");
    expect(templates).toContain("fm_payment_report_received");
    expect(templates).toContain("fm_payment_verified_receipt");
    expect(templates).toContain("fm_membership_activated");
    expect(templates).toContain("fm_renewal_obligation_created");
    expect(templates).toContain("fm_identity_verified");
    for (const row of ctx.enqueued) {
      expect(row.recipient).toBe(MEMBER_EMAILS[MEMBER_A]);
    }
    expect(JSON.stringify(ctx.enqueued)).not.toContain(PLAINTEXT_INSTRUCTIONS);
    expect(JSON.stringify(ctx.enqueued)).not.toContain(CIPHERTEXT_PREFIX);

    // MEMBER ISOLATION: member B sees none of member A's state.
    const bObligation = await request(ctx.app)
      .get("/api/research/activation/payment/obligation")
      .set(MEMBER_HEADER, MEMBER_B);
    expect(bObligation.status).toBe(200);
    expect(bObligation.body.obligation).toBeNull();
    const bIdentity = await request(ctx.app)
      .get("/api/research/activation/identity/status")
      .set(MEMBER_HEADER, MEMBER_B);
    expect(bIdentity.body.case).toBeNull();
    const bSigned = await request(ctx.app)
      .get("/api/research/activation/agreements/signed")
      .set(MEMBER_HEADER, MEMBER_B);
    expect(bSigned.body.signed).toEqual([]);
    const bReport = await request(ctx.app)
      .post("/api/research/activation/payment/report")
      .set(MEMBER_HEADER, MEMBER_B)
      .send({ amountCents: 5000, sentDate: "2026-07-21", senderName: "Bee", accuracyCertified: true });
    expect(bReport.status).toBe(409);
    expect(bReport.body.code).toBe("no_obligation");
    const bStatus = await request(ctx.app)
      .get("/api/research/activation/status")
      .set(MEMBER_HEADER, MEMBER_B);
    expect(bStatus.body.active).toBe(false);

    // THE STRING SCAN: the receiving-instruction plaintext (and the test
    // ciphertext prefix) appear in NO member-facing serialization, and in no
    // admin serialization either.
    const everything = JSON.stringify(scannedBodies);
    expect(everything).not.toContain(PLAINTEXT_INSTRUCTIONS);
    expect(everything).not.toContain(CIPHERTEXT_PREFIX);
    expect(everything).toContain("••••11");
  }, 30_000);
});

// ---------------------------------------------------------------------------
// State 3: gates and refusals
// ---------------------------------------------------------------------------

describe("state 3: consent-first identity", () => {
  it("never opens an upload path before consent is recorded", async () => {
    const ctx = liveContext();
    const res = await request(ctx.app)
      .post("/api/research/activation/identity/upload-url")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("consent_required");
    expect(ctx.media.calls).toHaveLength(0);
  });

  it("rejects script-container and unlisted content types", async () => {
    const ctx = liveContext();
    await request(ctx.app)
      .post("/api/research/activation/identity/consent")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ accepted: true, consentVersion: "icv-1" });
    for (const contentType of ["image/svg+xml", "application/pdf", "text/html"]) {
      const res = await request(ctx.app)
        .post("/api/research/activation/identity/upload-url")
        .set(MEMBER_HEADER, MEMBER_A)
        .send({ contentType, contentLengthBytes: 1000, fileName: "id.jpg" });
      expect(res.status, contentType).toBe(400);
      expect(res.body.code).toBe("content_type_rejected");
    }
    expect(ctx.media.calls).toHaveLength(0);
  });

  it("declining consent is terminal for the case and collects nothing", async () => {
    const ctx = liveContext();
    const declined = await request(ctx.app)
      .post("/api/research/activation/identity/consent")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ accepted: false, consentVersion: "icv-1" });
    expect(declined.status).toBe(200);
    expect(declined.body.case.status).toBe("consent_declined");
    const upload = await request(ctx.app)
      .post("/api/research/activation/identity/upload-url")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg" });
    // A declined case is not reusable; the member must consent again first.
    expect(upload.status).toBe(409);
    expect(ctx.media.calls).toHaveLength(0);
  });
});

describe("state 3: signature gates", () => {
  async function signBody(documentVersionId: string, overrides: Record<string, unknown> = {}) {
    return {
      documentVersionId,
      typedLegalName: "Member Aye Test",
      fullDocumentShown: true,
      affirmativeConsent: true,
      ...overrides,
    };
  }

  it("requires the electronic-record consent before any other signature", async () => {
    const ctx = liveContext();
    await publishAllCategories(ctx.documentsStore);
    const required = await request(ctx.app)
      .get("/api/research/activation/agreements")
      .set(MEMBER_HEADER, MEMBER_A);
    const arbitration = required.body.agreements.find(
      (a: { category: string }) => a.category === "founding_membership_agreement",
    );
    const res = await request(ctx.app)
      .post("/api/research/activation/agreements/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(await signBody(arbitration.documentVersionId));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("electronic_consent_required");
  });

  it("never accepts a prechecked or defaulted consent", async () => {
    const ctx = liveContext();
    await publishAllCategories(ctx.documentsStore);
    const required = await request(ctx.app)
      .get("/api/research/activation/agreements")
      .set(MEMBER_HEADER, MEMBER_A);
    expect(required.body.formState).toEqual({
      affirmativeConsent: false,
      fullDocumentShown: false,
      separateAcknowledgment: false,
      typedLegalName: "",
    });
    const consentDoc = required.body.agreements[0];
    const notAffirmative = await request(ctx.app)
      .post("/api/research/activation/agreements/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(await signBody(consentDoc.documentVersionId, { affirmativeConsent: false }));
    expect(notAffirmative.status).toBe(400);
    expect(notAffirmative.body.code).toBe("consent_not_affirmative");
  });

  it("requires arbitration's own separate acknowledgment", async () => {
    const ctx = liveContext();
    await publishAllCategories(ctx.documentsStore);
    const required = await request(ctx.app)
      .get("/api/research/activation/agreements")
      .set(MEMBER_HEADER, MEMBER_A);
    const consentDoc = required.body.agreements[0];
    await request(ctx.app)
      .post("/api/research/activation/agreements/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(await signBody(consentDoc.documentVersionId));
    const arbitration = required.body.agreements.find(
      (a: { category: string }) => a.category === "arbitration_agreement",
    );
    expect(arbitration.requiresSeparateAcknowledgment).toBe(true);
    const bundled = await request(ctx.app)
      .post("/api/research/activation/agreements/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(await signBody(arbitration.documentVersionId));
    expect(bundled.status).toBe(400);
    expect(bundled.body.code).toBe("separate_acknowledgment_required");
  });

  it("a draft can never be signed", async () => {
    const ctx = liveContext();
    await publishAllCategories(ctx.documentsStore);
    // A NEW draft of a published category: published versions stay signable,
    // the draft is not.
    const lifecycle = new DocumentLifecycle(ctx.documentsStore, { now: NOW });
    const draft = await lifecycle.createDraft({
      category: "privacy_notice",
      semver: "2.0.0",
      jurisdiction: "US-TX",
      content: "Draft-only text.",
    });
    const required = await request(ctx.app)
      .get("/api/research/activation/agreements")
      .set(MEMBER_HEADER, MEMBER_A);
    await request(ctx.app)
      .post("/api/research/activation/agreements/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({
        documentVersionId: required.body.agreements[0].documentVersionId,
        typedLegalName: "Member Aye Test",
        fullDocumentShown: true,
        affirmativeConsent: true,
      });
    const res = await request(ctx.app)
      .post("/api/research/activation/agreements/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({
        documentVersionId: draft.id,
        typedLegalName: "Member Aye Test",
        fullDocumentShown: true,
        affirmativeConsent: true,
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("not_published");
  });
});

describe("state 3: the bridge gate on obligation creation", () => {
  it("refuses a new obligation after an emergency disable (sunset)", async () => {
    const ctx = liveContext();
    await provisionMethodAndBridge(ctx.app);
    await completeIdentityAndAgreements(ctx);
    const disabled = await request(ctx.app)
      .put("/api/admin/research/activation/bridge/settings")
      .set(ADMIN_HEADER, "yes")
      .send({ action: "emergency_disable", reason: "compliance stop" });
    expect(disabled.status).toBe(200);
    expect(disabled.body.phase).toBe("sunset");
    const res = await request(ctx.app)
      .post("/api/research/activation/payment/select-method")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ methodId: "zelle-1" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("bridge_sunset");
  });

  it("refuses an unconfigured bridge fail-closed", async () => {
    const ctx = liveContext();
    await request(ctx.app)
      .post("/api/admin/research/activation/methods")
      .set(ADMIN_HEADER, "yes")
      .send(METHOD_BODY);
    await request(ctx.app)
      .post("/api/admin/research/activation/methods/zelle-1/approve")
      .set(ADMIN_HEADER, "yes")
      .send({});
    // The member has cleared identity + agreements, so the ONLY thing left to
    // fail is the unconfigured bridge.
    await completeIdentityAndAgreements(ctx);
    const res = await request(ctx.app)
      .post("/api/research/activation/payment/select-method")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ methodId: "zelle-1" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("bridge_not_configured");
  });

  it("audits an extension with reason and expiry through the domain path", async () => {
    const ctx = liveContext();
    await provisionMethodAndBridge(ctx.app);
    const missingReason = await request(ctx.app)
      .put("/api/admin/research/activation/bridge/settings")
      .set(ADMIN_HEADER, "yes")
      .send({ action: "extend", expiresAt: "2026-08-10T00:00:00Z" });
    expect(missingReason.status).toBe(400);
    const extended = await request(ctx.app)
      .put("/api/admin/research/activation/bridge/settings")
      .set(ADMIN_HEADER, "yes")
      .send({ action: "extend", reason: "provider onboarding slipped", expiresAt: "2026-08-10T00:00:00Z" });
    expect(extended.status).toBe(200);
    expect(extended.body.event.kind).toBe("bridge_extension");
    expect(extended.body.event.actorId).toBe(ADMIN_EMAIL);
    expect(extended.body.effectiveEndAt).toBe("2026-08-10T00:00:00.000Z");
    const settings = await request(ctx.app)
      .get("/api/admin/research/activation/bridge/settings")
      .set(ADMIN_HEADER, "yes");
    expect(
      settings.body.auditEvents.some((event: { kind: string }) => event.kind === "bridge_extension"),
    ).toBe(true);
  });
});

describe("state 3: select-method composes the identity and agreements gates", () => {
  it("refuses to mint an obligation until identity is verified, then until agreements are satisfied", async () => {
    const ctx = liveContext();
    await provisionMethodAndBridge(ctx.app);

    // No identity review, no signed papers: select-method fails closed on the
    // identity gate. NO obligation is created.
    const noIdentity = await request(ctx.app)
      .post("/api/research/activation/payment/select-method")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ methodId: "zelle-1" });
    expect(noIdentity.status).toBe(409);
    expect(noIdentity.body.code).toBe("identity_not_verified");
    const afterIdentityBlock = await request(ctx.app)
      .get("/api/research/activation/payment/obligation")
      .set(MEMBER_HEADER, MEMBER_A);
    expect(afterIdentityBlock.body.obligation).toBeNull();

    // Verify identity through the real flow, but publish and sign NOTHING.
    await request(ctx.app)
      .post("/api/research/activation/identity/consent")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ accepted: true, consentVersion: "icv-1" });
    await request(ctx.app)
      .post("/api/research/activation/identity/upload-url")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg" });
    await request(ctx.app)
      .post("/api/research/activation/identity/mark-uploaded")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({});
    const identityQueue = await request(ctx.app)
      .get("/api/admin/research/activation/identity/queue")
      .set(ADMIN_HEADER, "yes");
    await request(ctx.app)
      .post(`/api/admin/research/activation/identity/${identityQueue.body.queue[0].caseId}/review`)
      .set(ADMIN_HEADER, "yes")
      .send({ nameMatch: "match", ageThresholdMet: true, documentNotExpired: true, jurisdiction: "TX", licenseLast4: null });

    // Identity now passes; select-method still fails CLOSED on the agreements
    // gate because no required category has a published version (nothing to
    // sign is not the same as signed). Still no obligation.
    const noAgreements = await request(ctx.app)
      .post("/api/research/activation/payment/select-method")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ methodId: "zelle-1" });
    expect(noAgreements.status).toBe(409);
    expect(noAgreements.body.code).toBe("agreements_unsatisfied");
    expect(noAgreements.body.message).toContain("no_published_version");
    const afterAgreementsBlock = await request(ctx.app)
      .get("/api/research/activation/payment/obligation")
      .set(MEMBER_HEADER, MEMBER_A);
    expect(afterAgreementsBlock.body.obligation).toBeNull();
  });
});

describe("state 3: the activation verify re-composes the gates as defense in depth", () => {
  it("blocks verification when agreements lapse into reacceptance AFTER the obligation was minted", async () => {
    const ctx = liveContext();
    await provisionMethodAndBridge(ctx.app);
    // The member clears both gates and mints an obligation the legitimate way.
    await completeIdentityAndAgreements(ctx);
    const selected = await request(ctx.app)
      .post("/api/research/activation/payment/select-method")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ methodId: "zelle-1" });
    expect(selected.status).toBe(200);
    await request(ctx.app)
      .post("/api/research/activation/payment/report")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ amountCents: 5000, sentDate: "2026-07-21", senderName: "Member Aye", accuracyCertified: true });
    const queue = await request(ctx.app)
      .get("/api/admin/research/activation/queue")
      .set(ADMIN_HEADER, "yes");
    const obligationId = queue.body.queue[0].obligationId as string;

    // A new mandatory version of a required category is published AFTER the
    // obligation exists: the agreements gate now fails closed again. The verify
    // path re-composes the gate, so activation cannot slip through on a stale
    // obligation whose agreements have since lapsed.
    const lifecycle = new DocumentLifecycle(ctx.documentsStore, { now: NOW });
    const draft = await lifecycle.createDraft({
      category: "privacy_notice",
      semver: "2.0.0",
      jurisdiction: "US-TX",
      content: "Materially revised privacy notice requiring reacceptance.",
      reacceptanceRequired: true,
    });
    await lifecycle.setCounselReview(draft.id, "approved");
    await lifecycle.transition(draft.id, "under_legal_review");
    await lifecycle.transition(draft.id, "approved_for_publication");
    await lifecycle.publish(draft.id, { publisher: "counsel-test" });

    const blocked = await request(ctx.app)
      .post(`/api/admin/research/activation/queue/${obligationId}/verify`)
      .set(ADMIN_HEADER, "yes")
      .send(VERIFY_BODY);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("agreements_unsatisfied");
    expect(blocked.body.message).toContain("reacceptance_required");
  });
});

describe("state 3: verification wire validation", () => {
  it("refuses a verification whose confirmation is missing or prechecked-false", async () => {
    const ctx = liveContext();
    const { confirmedReceived: _dropped, ...withoutConfirmation } = VERIFY_BODY;
    const res = await request(ctx.app)
      .post("/api/admin/research/activation/queue/ob-any/verify")
      .set(ADMIN_HEADER, "yes")
      .send(withoutConfirmation);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors).toContain("confirmedReceived must be exactly true");
    const falseConfirmation = await request(ctx.app)
      .post("/api/admin/research/activation/queue/ob-any/verify")
      .set(ADMIN_HEADER, "yes")
      .send({ ...VERIFY_BODY, confirmedReceived: false });
    expect(falseConfirmation.status).toBe(400);
  });

  it("requires an idempotency key at the wire", async () => {
    const ctx = liveContext();
    const { idempotencyKey: _dropped, ...withoutKey } = VERIFY_BODY;
    const res = await request(ctx.app)
      .post("/api/admin/research/activation/queue/ob-any/verify")
      .set(ADMIN_HEADER, "yes")
      .send(withoutKey);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toContain("idempotencyKey is required");
  });

  it("refuses a payment report whose certification is not the literal true", async () => {
    const ctx = liveContext();
    const res = await request(ctx.app)
      .post("/api/research/activation/payment/report")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ amountCents: 5000, sentDate: "2026-07-21", senderName: "Aye", accuracyCertified: "yes" });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toContain("accuracyCertified must be exactly true");
  });
});

describe("state 3: admin obligation transitions", () => {
  it("requests info with a detail, emails the member, and lets them resubmit", async () => {
    const ctx = liveContext();
    await provisionMethodAndBridge(ctx.app);
    await completeIdentityAndAgreements(ctx);
    await request(ctx.app)
      .post("/api/research/activation/payment/select-method")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ methodId: "zelle-1" });
    await request(ctx.app)
      .post("/api/research/activation/payment/report")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ amountCents: 5000, sentDate: "2026-07-21", senderName: "Member Aye", accuracyCertified: true });
    const queue = await request(ctx.app)
      .get("/api/admin/research/activation/queue")
      .set(ADMIN_HEADER, "yes");
    const obligationId = queue.body.queue[0].obligationId as string;

    const noDetail = await request(ctx.app)
      .post(`/api/admin/research/activation/queue/${obligationId}/request-info`)
      .set(ADMIN_HEADER, "yes")
      .send({});
    expect(noDetail.status).toBe(400);

    const requested = await request(ctx.app)
      .post(`/api/admin/research/activation/queue/${obligationId}/request-info`)
      .set(ADMIN_HEADER, "yes")
      .send({ detail: "Send the confirmation number from the app." });
    expect(requested.status).toBe(200);
    expect(requested.body.obligation.status).toBe("info_requested");
    expect(ctx.enqueued.some((row) => row.templateKey === "fm_payment_info_requested")).toBe(true);

    const resubmitted = await request(ctx.app)
      .post("/api/research/activation/payment/report")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({
        amountCents: 5000,
        sentDate: "2026-07-21",
        senderName: "Member Aye",
        externalRef: "ZP-1002",
        accuracyCertified: true,
      });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.obligation.status).toBe("submitted");
  });
});

describe("state 3: the Day 15 checklist", () => {
  it("persists per-item state attributed to the admin", async () => {
    const ctx = liveContext();
    const initial = await request(ctx.app)
      .get("/api/admin/research/activation/bridge/checklist")
      .set(ADMIN_HEADER, "yes");
    expect(initial.status).toBe(200);
    expect(initial.body.items).toHaveLength(6);
    expect(initial.body.items.every((item: { done: boolean }) => item.done === false)).toBe(true);

    const unknown = await request(ctx.app)
      .put("/api/admin/research/activation/bridge/checklist")
      .set(ADMIN_HEADER, "yes")
      .send({ key: "not-a-real-item", done: true });
    expect(unknown.status).toBe(400);

    const updated = await request(ctx.app)
      .put("/api/admin/research/activation/bridge/checklist")
      .set(ADMIN_HEADER, "yes")
      .send({ key: "replacement_provider_selected", done: true, note: "Stripe shortlisted" });
    expect(updated.status).toBe(200);
    const item = updated.body.items.find(
      (entry: { key: string }) => entry.key === "replacement_provider_selected",
    );
    expect(item.done).toBe(true);
    expect(item.updatedBy).toBe(ADMIN_EMAIL);
  });
});

describe("state 3: the go-live readiness report", () => {
  const READINESS_PATH = "/api/admin/research/activation/readiness";
  const STATES = [
    "code_ready",
    "configuration_missing",
    "external_approval_missing",
    "production_test_missing",
  ];

  function itemOf(body: any, area: string, key: string): { state: string; detail: string | null } {
    const found = body.areas
      .find((a: { area: string }) => a.area === area)
      ?.items.find((i: { key: string }) => i.key === key);
    expect(found, `${area}.${key}`).toBeDefined();
    return found;
  }

  it("is admin-guarded and reports the four-state vocabulary without any secret value", async () => {
    const ctx = liveContext();

    // Admin-guarded: no session and a member session both refuse.
    const anonymous = await request(ctx.app).get(READINESS_PATH);
    expect(anonymous.status).toBe(401);
    const asMember = await request(ctx.app).get(READINESS_PATH).set(MEMBER_HEADER, MEMBER_A);
    expect(asMember.status).toBe(401);

    // Unprovisioned environment: every gap is named in the vocabulary.
    const before = await request(ctx.app).get(READINESS_PATH).set(ADMIN_HEADER, "yes");
    expect(before.status).toBe(200);
    expect(before.body.areas.map((a: { area: string }) => a.area)).toEqual([
      "legal",
      "identity",
      "payments",
      "email",
      "membership",
      "day15",
      "esign",
    ]);
    for (const area of before.body.areas) {
      expect(area.items.length).toBeGreaterThan(0);
      for (const item of area.items) {
        expect(STATES, `${area.area}.${item.key}`).toContain(item.state);
      }
    }
    expect(itemOf(before.body, "legal", "approved_versions").state).toBe("external_approval_missing");
    expect(itemOf(before.body, "legal", "signing_sequence").state).toBe("code_ready");
    expect(itemOf(before.body, "legal", "publication_status").state).toBe("external_approval_missing");
    // LIVE_ENV has no RESEARCH_IDENTITY_BUCKET, cipher key, or Resend key.
    expect(itemOf(before.body, "identity", "storage_configured").state).toBe("configuration_missing");
    expect(itemOf(before.body, "identity", "retention_worker").state).toBe("code_ready");
    expect(itemOf(before.body, "identity", "deletion_test").state).toBe("production_test_missing");
    expect(itemOf(before.body, "payments", "bridge_configured").state).toBe("configuration_missing");
    expect(itemOf(before.body, "payments", "methods_configured").state).toBe("configuration_missing");
    expect(itemOf(before.body, "payments", "cipher_key_present").state).toBe("configuration_missing");
    expect(itemOf(before.body, "payments", "verification_idempotency").state).toBe("code_ready");
    expect(itemOf(before.body, "email", "resend_configured").state).toBe("configuration_missing");
    expect(itemOf(before.body, "email", "domain_verification").state).toBe("external_approval_missing");
    expect(itemOf(before.body, "email", "test_send").state).toBe("production_test_missing");
    // The membership model is code, and the report cites the DB constraint.
    const pricing = itemOf(before.body, "membership", "pricing_model");
    expect(pricing.state).toBe("code_ready");
    expect(pricing.detail).toContain("research_fm_obligations_amount_matches_type");
    expect(itemOf(before.body, "membership", "portal_gate").state).toBe("code_ready");
    expect(itemOf(before.body, "day15", "sunset_scheduled").state).toBe("configuration_missing");
    expect(itemOf(before.body, "day15", "provider_account_approved").state).toBe(
      "external_approval_missing",
    );
    // E-signature: the code is ready, the OpenSign configuration is not present
    // in LIVE_ENV, and the production tests have not run.
    expect(itemOf(before.body, "esign", "provider_adapter").state).toBe("code_ready");
    expect(itemOf(before.body, "esign", "sandbox_configured").state).toBe("configuration_missing");
    expect(itemOf(before.body, "esign", "webhook_secret").state).toBe("configuration_missing");
    expect(itemOf(before.body, "esign", "webhook_verification").state).toBe("production_test_missing");
    expect(itemOf(before.body, "esign", "member_document_center").state).toBe("code_ready");
    expect(itemOf(before.body, "esign", "secure_archive").state).toBe("configuration_missing");
    expect(itemOf(before.body, "esign", "local_export").state).toBe("code_ready");

    // Provision the registry, the bridge, and the papers; record an owner on
    // one Day 15 item. The report moves, truthfully, item by item.
    await publishAllCategories(ctx.documentsStore);
    await provisionMethodAndBridge(ctx.app);
    await request(ctx.app)
      .put("/api/admin/research/activation/bridge/checklist")
      .set(ADMIN_HEADER, "yes")
      .send({ key: "replacement_provider_selected", done: true, note: "Stripe shortlisted" });

    const after = await request(ctx.app).get(READINESS_PATH).set(ADMIN_HEADER, "yes");
    expect(after.status).toBe(200);
    expect(itemOf(after.body, "legal", "approved_versions").state).toBe("code_ready");
    expect(itemOf(after.body, "legal", "publication_status").state).toBe("code_ready");
    expect(itemOf(after.body, "payments", "bridge_configured").state).toBe("code_ready");
    expect(itemOf(after.body, "payments", "methods_configured").state).toBe("code_ready");
    expect(itemOf(after.body, "payments", "methods_configured").detail).toContain("1 enabled approved");
    // The env did not change: presence booleans stay false, values never leak.
    expect(itemOf(after.body, "payments", "cipher_key_present").state).toBe("configuration_missing");
    expect(itemOf(after.body, "day15", "sunset_scheduled").state).toBe("code_ready");
    const owned = itemOf(after.body, "day15", "replacement_provider_selected");
    expect(owned.state).toBe("code_ready");
    expect(owned.detail).toContain(ADMIN_EMAIL);

    // NO SECRET VALUE, EVER: not the receiving instructions (plaintext or
    // ciphertext), not the service key, and no masked-instruction fragment.
    for (const body of [before.body, after.body]) {
      const s = JSON.stringify(body);
      expect(s).not.toContain(PLAINTEXT_INSTRUCTIONS);
      expect(s).not.toContain(CIPHERTEXT_PREFIX);
      expect(s).not.toContain(LIVE_ENV.SUPABASE_SERVICE_ROLE_KEY as string);
      expect(s).not.toContain("••••");
    }
  });
});

describe("state 3: identity emergency delete", () => {
  it("deletes the raw source on request and stamps the record", async () => {
    const ctx = liveContext();
    await request(ctx.app)
      .post("/api/research/activation/identity/consent")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ accepted: true, consentVersion: "icv-1" });
    await request(ctx.app)
      .post("/api/research/activation/identity/upload-url")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg" });
    await request(ctx.app)
      .post("/api/research/activation/identity/mark-uploaded")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({});
    const queue = await request(ctx.app)
      .get("/api/admin/research/activation/identity/queue")
      .set(ADMIN_HEADER, "yes");
    const caseId = queue.body.queue[0].caseId as string;

    const deleted = await request(ctx.app)
      .post(`/api/admin/research/activation/identity/${caseId}/emergency-delete`)
      .set(ADMIN_HEADER, "yes")
      .send({});
    expect(deleted.status).toBe(200);
    expect(deleted.body.case.status).toBe("deleted");
    expect(deleted.body.case.rawDeletedAt).not.toBeNull();
    expect(ctx.media.deleted).toHaveLength(1);
    const audit = await ctx.identityStore.listAuditEvents("xenios-research", caseId);
    expect(audit.some((event) => event.kind === "emergency_deleted")).toBe(true);

    // The view URL now refuses: there is nothing left to sign.
    const view = await request(ctx.app)
      .get(`/api/admin/research/activation/identity/${caseId}/view`)
      .set(ADMIN_HEADER, "yes");
    expect(view.status).toBe(409);
    expect(view.body.code).toBe("invalid_state");
  });
});

// ---------------------------------------------------------------------------
// State 3: e-signature (OpenSign), the gate advances only on a verified webhook
// ---------------------------------------------------------------------------

describe("state 3: e-signature", () => {
  /** Verify identity through the real flow WITHOUT signing any native agreement,
   * so the only way to satisfy the agreements gate is an e-sign completion. */
  async function verifyIdentityOnly(ctx: LiveContext, member: string): Promise<void> {
    await request(ctx.app)
      .post("/api/research/activation/identity/consent")
      .set(MEMBER_HEADER, member)
      .send({ accepted: true, consentVersion: "icv-1" });
    await request(ctx.app)
      .post("/api/research/activation/identity/upload-url")
      .set(MEMBER_HEADER, member)
      .send({ contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg" });
    await request(ctx.app)
      .post("/api/research/activation/identity/mark-uploaded")
      .set(MEMBER_HEADER, member)
      .send({});
    const q = await request(ctx.app)
      .get("/api/admin/research/activation/identity/queue")
      .set(ADMIN_HEADER, "yes");
    const caseId = q.body.queue.find((c: { memberId: string }) => c.memberId === member).caseId as string;
    await request(ctx.app)
      .post(`/api/admin/research/activation/identity/${caseId}/review`)
      .set(ADMIN_HEADER, "yes")
      .send({ nameMatch: "match", ageThresholdMet: true, documentNotExpired: true, jurisdiction: "TX", licenseLast4: null });
  }

  async function requiredAgreements(ctx: LiveContext, member: string) {
    const res = await request(ctx.app)
      .get("/api/research/activation/agreements")
      .set(MEMBER_HEADER, member);
    return (res.body.agreements as Array<{ category: string; documentVersionId: string; requirement: string }>).filter(
      (a) => a.requirement === "required",
    );
  }

  it("returns capability_disabled when the provider is not live", async () => {
    const ctx = liveContext({ esignProvider: new DisabledEsignProvider() });
    const res = await request(ctx.app)
      .post("/api/research/activation/esign/session")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ mode: "opensign_document", documentVersionIds: ["v-anything"], idempotencyKey: "k-1" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("capability_disabled");

    // The webhook is precisely capability_disabled too (not byte-silent, since
    // founding activation is on; the three-state gate has already passed).
    const hook = await postEsignWebhook(ctx.app, completedWebhookBody("pdoc-x"));
    expect(hook.status).toBe(503);
    expect(hook.body.code).toBe("capability_disabled");
  });

  it("creates a signing session and is idempotent on the same key", async () => {
    const ctx = liveContext();
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await requiredAgreements(ctx, MEMBER_A);

    const first = await request(ctx.app)
      .post("/api/research/activation/esign/session")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ mode: "opensign_document", documentVersionIds: [consent.documentVersionId], idempotencyKey: "idem-1" });
    expect(first.status).toBe(200);
    expect(first.body.signingUrl).toContain("https://sign.example/");
    const providerDocumentId = first.body.providerDocumentId as string;
    expect(providerDocumentId).toBeTruthy();

    const second = await request(ctx.app)
      .post("/api/research/activation/esign/session")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ mode: "opensign_document", documentVersionIds: [consent.documentVersionId], idempotencyKey: "idem-1" });
    expect(second.status).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);
    expect(second.body.providerDocumentId).toBe(providerDocumentId);
    // The provider was hit exactly once: the replay never mints a second doc.
    expect(ctx.esignCounts.createSigningSession).toBe(1);
  });

  it("advances the agreements gate ONLY after a verified completion webhook", async () => {
    const ctx = liveContext();
    await provisionMethodAndBridge(ctx.app);
    await publishAllCategories(ctx.documentsStore);
    await verifyIdentityOnly(ctx, MEMBER_A);

    const required = await requiredAgreements(ctx, MEMBER_A);
    expect(required.length).toBeGreaterThan(0);

    // Start an e-sign session for every required category.
    const sessions: Array<{ category: string; providerDocumentId: string }> = [];
    for (const agreement of required) {
      const res = await request(ctx.app)
        .post("/api/research/activation/esign/session")
        .set(MEMBER_HEADER, MEMBER_A)
        .send({
          mode: "opensign_document",
          documentVersionIds: [agreement.documentVersionId],
          idempotencyKey: `idem-${agreement.category}`,
        });
      expect(res.status, agreement.category).toBe(200);
      sessions.push({ category: agreement.category, providerDocumentId: res.body.providerDocumentId });
    }

    // REDIRECT ONLY (no webhook): the gate does NOT advance.
    const beforeWebhooks = await request(ctx.app)
      .post("/api/research/activation/payment/select-method")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ methodId: "zelle-1" });
    expect(beforeWebhooks.status).toBe(409);
    expect(beforeWebhooks.body.code).toBe("agreements_unsatisfied");

    // A correctly-signed completion webhook for each provider document.
    for (const session of sessions) {
      const hook = await postEsignWebhook(ctx.app, completedWebhookBody(session.providerDocumentId));
      expect(hook.status).toBe(200);
      expect(hook.body.applied).toBe(true);
      expect(hook.body.status).toBe("completed");
    }

    // The e-sign acceptances now satisfy the SAME agreements gate: select-method
    // succeeds and mints the $50 obligation, without a single native signature.
    const afterWebhooks = await request(ctx.app)
      .post("/api/research/activation/payment/select-method")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ methodId: "zelle-1" });
    expect(afterWebhooks.status).toBe(200);
    expect(afterWebhooks.body.created).toBe(true);
  }, 30_000);

  it("rejects a wrong-signature webhook and never ingests or advances", async () => {
    const ctx = liveContext();
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await requiredAgreements(ctx, MEMBER_A);
    const started = await request(ctx.app)
      .post("/api/research/activation/esign/session")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ mode: "opensign_document", documentVersionIds: [consent.documentVersionId], idempotencyKey: "idem-bad" });
    const providerDocumentId = started.body.providerDocumentId as string;

    const bad = await postEsignWebhook(ctx.app, completedWebhookBody(providerDocumentId), "deadbeef00");
    expect(bad.status).not.toBe(200);
    expect(bad.body.code).toBe("invalid_signature");
    // The completed file was never fetched, so nothing ingested.
    expect(ctx.esignCounts.fetchCompletedFile).toBe(0);

    // No completed request, no archive: the gate never saw a completion.
    const docs = await request(ctx.app)
      .get(`/api/admin/research/activation/esign/member/${MEMBER_A}`)
      .set(ADMIN_HEADER, "yes");
    expect(docs.body.requests).toEqual([]);
    expect(docs.body.archive).toEqual([]);
  });

  it("is idempotent on a duplicate webhook eventId", async () => {
    const ctx = liveContext();
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await requiredAgreements(ctx, MEMBER_A);
    const started = await request(ctx.app)
      .post("/api/research/activation/esign/session")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ mode: "opensign_document", documentVersionIds: [consent.documentVersionId], idempotencyKey: "idem-dup" });
    const providerDocumentId = started.body.providerDocumentId as string;

    const event = completedWebhookBody(providerDocumentId); // fixed eventId
    const firstHook = await postEsignWebhook(ctx.app, event);
    expect(firstHook.status).toBe(200);
    expect(firstHook.body.applied).toBe(true);
    const fetchesAfterFirst = ctx.esignCounts.fetchCompletedFile;

    // The SAME event id again: applied:false, and no second ingest.
    const secondHook = await postEsignWebhook(ctx.app, event);
    expect(secondHook.status).toBe(200);
    expect(secondHook.body.applied).toBe(false);
    expect(ctx.esignCounts.fetchCompletedFile).toBe(fetchesAfterFirst);
  });

  it("gives the admin a document center, downloads, a packet zip, and a resend", async () => {
    const ctx = liveContext();
    await publishAllCategories(ctx.documentsStore);
    await verifyIdentityOnly(ctx, MEMBER_A);
    const required = await requiredAgreements(ctx, MEMBER_A);

    for (const agreement of required) {
      const started = await request(ctx.app)
        .post("/api/research/activation/esign/session")
        .set(MEMBER_HEADER, MEMBER_A)
        .send({
          mode: "opensign_document",
          documentVersionIds: [agreement.documentVersionId],
          idempotencyKey: `idem-admin-${agreement.category}`,
        });
      await postEsignWebhook(ctx.app, completedWebhookBody(started.body.providerDocumentId));
    }

    // The admin document center lists completed requests AND archive records.
    const list = await request(ctx.app)
      .get(`/api/admin/research/activation/esign/member/${MEMBER_A}`)
      .set(ADMIN_HEADER, "yes");
    expect(list.status).toBe(200);
    expect(list.body.requests.length).toBe(required.length);
    expect(list.body.archive.length).toBe(required.length);
    const requestId = list.body.requests[0].requestId as string;
    // The list never carries a storage ref.
    expect(JSON.stringify(list.body)).not.toContain("research-member-records");

    // A short-lived signed download URL for the signed document and the cert.
    const dl = await request(ctx.app)
      .get(`/api/admin/research/activation/esign/request/${requestId}/download`)
      .set(ADMIN_HEADER, "yes");
    expect(dl.status).toBe(200);
    expect(dl.body.grant.signedUrl).toContain("esign-signed");
    const dlCert = await request(ctx.app)
      .get(`/api/admin/research/activation/esign/request/${requestId}/download?which=certificate`)
      .set(ADMIN_HEADER, "yes");
    expect(dlCert.status).toBe(200);
    expect(dlCert.body.which).toBe("certificate");

    // The member packet as a zip.
    const zip = await request(ctx.app)
      .get(`/api/admin/research/activation/esign/member/${MEMBER_A}/packet.zip`)
      .set(ADMIN_HEADER, "yes");
    expect(zip.status).toBe(200);
    expect(zip.headers["content-type"]).toContain("application/zip");
    expect(zip.headers["content-disposition"]).toContain(`member-${MEMBER_A}-packet.zip`);

    // Resend re-enqueues BOTH the member and the admin-records completion notice.
    ctx.enqueued.length = 0;
    const resend = await request(ctx.app)
      .post(`/api/admin/research/activation/esign/request/${requestId}/resend`)
      .set(ADMIN_HEADER, "yes")
      .send({});
    expect(resend.status).toBe(200);
    const keys = ctx.enqueued.map((row) => row.templateKey);
    expect(keys).toContain("fm_esign_completed_member");
    expect(keys).toContain("fm_admin_esign_completed");
    const adminNotice = ctx.enqueued.find((row) => row.templateKey === "fm_admin_esign_completed");
    expect(adminNotice?.recipient).toBe(ADMIN_RECORDS_EMAIL);
    // No raw storage URL, signed URL, or evidence content in any payload.
    const scan = JSON.stringify(ctx.enqueued);
    expect(scan).not.toContain("research-member-records");
    expect(scan).not.toContain("esign-signed");
    expect(scan).not.toContain("provider.example");
  }, 30_000);

  it("guards the packet filename member id against header injection", async () => {
    const ctx = liveContext();
    const res = await request(ctx.app)
      .get("/api/admin/research/activation/esign/member/bad%20id%22/packet.zip")
      .set(ADMIN_HEADER, "yes");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
  });
});

// ---------------------------------------------------------------------------
// Native (embedded) e-signature: the member signs in-page, no OpenSign.
// ---------------------------------------------------------------------------

describe("state 3: native embedded e-signature", () => {
  function nativeSignBody(documentVersionId: string, over: Record<string, unknown> = {}) {
    return {
      documentVersionId,
      fullDocumentShown: true,
      affirmativeConsent: true,
      separateAcknowledgment: true,
      signatureMethod: "typed",
      typedLegalName: "Member Aye Test",
      drawnPngBase64: null,
      idempotencyKey: `native:${documentVersionId}`,
      ...over,
    };
  }

  async function agreementsList(ctx: LiveContext, member: string) {
    const res = await request(ctx.app).get("/api/research/activation/agreements").set(MEMBER_HEADER, member);
    return res.body.agreements as Array<{ documentVersionId: string; category: string }>;
  }

  /** Native-sign every required agreement in the returned (consent-first) order. */
  async function nativeSignAll(ctx: LiveContext, member: string) {
    for (const agreement of await agreementsList(ctx, member)) {
      const res = await request(ctx.app)
        .post("/api/research/activation/esign/native/sign")
        .set(MEMBER_HEADER, member)
        .send(nativeSignBody(agreement.documentVersionId));
      expect(res.status, agreement.category).toBe(200);
    }
  }

  it("RESEARCH_ESIGN_ENABLED off: the native sign route fails closed (capability_disabled)", async () => {
    const ctx = liveContext(); // esign NOT enabled
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await agreementsList(ctx, MEMBER_A);
    const res = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(consent.documentVersionId));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("capability_disabled");
  });

  it("native runs INDEPENDENTLY of OpenSign: enabled with the provider Disabled and no OpenSign credential", async () => {
    // OpenSign provider disabled, native enabled: the native path still works,
    // and the OpenSign session path is never touched (no external call).
    const ctx = liveContext({ esignProvider: new DisabledEsignProvider(), esignEnabled: true });
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await agreementsList(ctx, MEMBER_A);
    const res = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(consent.documentVersionId));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.signedPdfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.certificateHash).toMatch(/^[0-9a-f]{64}$/);
    // The OpenSign session was never created (native is fully local).
    expect(ctx.esignCounts.createSigningSession).toBe(0);
    // The OpenSign session route itself refuses (capability_disabled), proving
    // native and OpenSign are independent.
    const session = await request(ctx.app)
      .post("/api/research/activation/esign/session")
      .set(MEMBER_HEADER, MEMBER_A)
      .send({ mode: "opensign_document", documentVersionIds: [consent.documentVersionId], idempotencyKey: "os-1" });
    expect(session.status).toBe(503);
  });

  it("admin can view + download a COMPLETED native record in a native-only deployment (OpenSign off)", async () => {
    const ctx = liveContext({ esignProvider: new DisabledEsignProvider(), esignEnabled: true });
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await agreementsList(ctx, MEMBER_A);
    const signed = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(consent.documentVersionId));
    expect(signed.status).toBe(200);
    const requestId = signed.body.requestId as string;
    // Admin document center lists it even though OpenSign is disabled.
    const adminDocs = await request(ctx.app)
      .get(`/api/admin/research/activation/esign/member/${MEMBER_A}`)
      .set(ADMIN_HEADER, "yes");
    expect(adminDocs.status).toBe(200);
    expect(adminDocs.body.requests.some((r: { requestId: string }) => r.requestId === requestId)).toBe(true);
    // Admin download of the completed record works.
    const adminDl = await request(ctx.app)
      .get(`/api/admin/research/activation/esign/request/${requestId}/download?which=signed`)
      .set(ADMIN_HEADER, "yes");
    expect(adminDl.status).toBe(200);
    expect(adminDl.body.grant.signedUrl).toBeTruthy();
  });

  it("completes a native signature and lists it in the member document endpoint", async () => {
    const ctx = liveContext({ esignEnabled: true });
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await agreementsList(ctx, MEMBER_A);
    const signed = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(consent.documentVersionId));
    expect(signed.status).toBe(200);
    const requestId = signed.body.requestId as string;

    const docs = await request(ctx.app).get("/api/research/activation/esign/documents").set(MEMBER_HEADER, MEMBER_A);
    expect(docs.status).toBe(200);
    expect(docs.body.documents.some((d: { requestId: string; mode: string }) => d.requestId === requestId && d.mode === "esign_document")).toBe(true);

    // A duplicate submission replays (idempotent), no second record.
    const replay = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(consent.documentVersionId));
    expect(replay.status).toBe(200);
    expect(replay.body.requestId).toBe(requestId);
  });

  it("a member can download only their OWN signed document", async () => {
    const ctx = liveContext({ esignEnabled: true });
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await agreementsList(ctx, MEMBER_A);
    const signed = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(consent.documentVersionId));
    const requestId = signed.body.requestId as string;

    const mine = await request(ctx.app)
      .get(`/api/research/activation/esign/documents/${requestId}/download?which=signed`)
      .set(MEMBER_HEADER, MEMBER_A);
    expect(mine.status).toBe(200);
    expect(mine.body.grant.signedUrl).toBeTruthy();

    // Member B cannot reach member A's document (ownership is not probeable).
    const theirs = await request(ctx.app)
      .get(`/api/research/activation/esign/documents/${requestId}/download?which=signed`)
      .set(MEMBER_HEADER, MEMBER_B);
    expect(theirs.status).toBe(404);
  });

  it("the agreement gate does not advance until ALL required agreements are natively signed", async () => {
    const ctx = liveContext({ esignEnabled: true });
    await publishAllCategories(ctx.documentsStore);
    const list = await agreementsList(ctx, MEMBER_A);

    // Sign only the electronic-record consent: the gate is not satisfied yet.
    await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(list[0].documentVersionId));
    const partial = await request(ctx.app).get("/api/research/activation/agreements").set(MEMBER_HEADER, MEMBER_A);
    expect(partial.body.satisfied).toBe(false);

    // Sign the rest: the SAME gate is now satisfied by the native signatures.
    await nativeSignAll(ctx, MEMBER_A);
    const full = await request(ctx.app).get("/api/research/activation/agreements").set(MEMBER_HEADER, MEMBER_A);
    expect(full.body.satisfied).toBe(true);
  });

  it("refuses a native signature that is not affirmatively consented", async () => {
    const ctx = liveContext({ esignEnabled: true });
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await agreementsList(ctx, MEMBER_A);
    const res = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(consent.documentVersionId, { affirmativeConsent: false }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("consent_not_affirmative");
  });

  it("validates the drawn signature: malformed, non-PNG, and oversized are precise 400s", async () => {
    const ctx = liveContext({ esignEnabled: true });
    await publishAllCategories(ctx.documentsStore);
    const [consent] = await agreementsList(ctx, MEMBER_A);
    const drawn = (drawnPngBase64: string) =>
      nativeSignBody(consent.documentVersionId, { signatureMethod: "drawn", drawnPngBase64 });

    const malformed = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(drawn("not!!!base64###"));
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("signature_invalid");

    // Valid base64 of non-PNG bytes.
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]).toString("base64");
    const notPng = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(drawn(jpeg));
    expect(notPng.status).toBe(400);
    expect(notPng.body.code).toBe("signature_invalid");

    // A well-formed PNG header but 1.1MB decoded: over the 1MB cap, under the
    // 2mb body limit, so it reaches the route and is refused as too large.
    const bigPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(1_100_000),
    ]).toString("base64");
    const tooBig = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(drawn(bigPng));
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.code).toBe("signature_too_large");

    // Nothing was signed by any of the refused attempts.
    const list = await request(ctx.app).get("/api/research/activation/agreements").set(MEMBER_HEADER, MEMBER_A);
    expect(list.body.agreements[0].signed).toBe(false);
  });

  it("binds an idempotency key to its document: reuse for another document is a 409 conflict", async () => {
    const ctx = liveContext({ esignEnabled: true });
    await publishAllCategories(ctx.documentsStore);
    const list = await agreementsList(ctx, MEMBER_A);
    const consent = list[0];
    const other = list[1];
    const first = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(consent.documentVersionId, { idempotencyKey: "shared-key" }));
    expect(first.status).toBe(200);
    const clash = await request(ctx.app)
      .post("/api/research/activation/esign/native/sign")
      .set(MEMBER_HEADER, MEMBER_A)
      .send(nativeSignBody(other.documentVersionId, { idempotencyKey: "shared-key" }));
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("idempotency_conflict");
  });

  it("never lists or issues a download for a native evidence_stored (not completed) request", async () => {
    const ctx = liveContext({ esignEnabled: true });
    await publishAllCategories(ctx.documentsStore);
    const now = "2026-07-23T12:00:00.000Z";
    // An evidence_stored request: the signed PDF is uploaded but the legal
    // signature never committed. It must be invisible and non-downloadable.
    await ctx.esignStore.requests.insert({
      id: "native_evidence_1",
      memberId: MEMBER_A,
      packetOrDocumentId: "ver-x",
      mode: "esign_document",
      provider: "xenios_native",
      providerTemplateId: null,
      providerTemplateVersion: null,
      providerDocumentId: null,
      xeniosDocumentVersionIds: ["ver-x"],
      sourceContentHashes: ["a".repeat(64)],
      signerIdentifier: MEMBER_EMAILS[MEMBER_A],
      signingLinkStatus: "created",
      nativeCompletionState: "evidence_stored",
      viewedAt: null,
      signedAt: null,
      completedAt: null,
      declinedAt: null,
      expiredAt: null,
      signedPdfRef: "esign/member-a/ver-x/signed.pdf",
      certificateRef: "esign/member-a/ver-x/certificate.pdf",
      signedPdfHash: "b".repeat(64),
      certificateHash: "c".repeat(64),
      verifiedEventIds: [],
      providerEventHistory: [],
      xeniosAcceptanceEventIds: [],
      idempotencyKey: "evidence-key",
      createdAt: now,
      updatedAt: now,
    });
    // Not downloadable by the member.
    const dl = await request(ctx.app)
      .get("/api/research/activation/esign/documents/native_evidence_1/download?which=signed")
      .set(MEMBER_HEADER, MEMBER_A);
    expect(dl.status).toBe(409);
    expect(dl.body.code).toBe("invalid_state");
    // Not downloadable by an ADMIN either (the admin route gates on completion).
    const adminDl = await request(ctx.app)
      .get("/api/admin/research/activation/esign/request/native_evidence_1/download?which=signed")
      .set(ADMIN_HEADER, "yes");
    expect(adminDl.status).toBe(409);
    expect(adminDl.body.code).toBe("invalid_state");
    // Not listed as a member document, and not in the admin document center.
    const docs = await request(ctx.app).get("/api/research/activation/esign/documents").set(MEMBER_HEADER, MEMBER_A);
    expect(docs.body.documents.some((d: { requestId: string }) => d.requestId === "native_evidence_1")).toBe(false);
    const adminDocs = await request(ctx.app)
      .get(`/api/admin/research/activation/esign/member/${MEMBER_A}`)
      .set(ADMIN_HEADER, "yes");
    expect(adminDocs.body.requests.some((r: { requestId: string }) => r.requestId === "native_evidence_1")).toBe(false);
  });

  it("the activation status reports the embedded-signer capability from the flag", async () => {
    const off = liveContext();
    await publishAllCategories(off.documentsStore);
    const statusOff = await request(off.app).get("/api/research/activation/status").set(MEMBER_HEADER, MEMBER_A);
    expect(statusOff.body.embeddedEsignEnabled).toBe(false);

    const on = liveContext({ esignEnabled: true });
    await publishAllCategories(on.documentsStore);
    const statusOn = await request(on.app).get("/api/research/activation/status").set(MEMBER_HEADER, MEMBER_A);
    expect(statusOn.body.embeddedEsignEnabled).toBe(true);
  });
});
