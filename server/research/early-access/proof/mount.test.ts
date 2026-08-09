import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_PROOF_FILENAME_HEADER,
  EARLY_ACCESS_PROOF_METHOD_HEADER,
  registerPrivateEarlyAccessApi,
} from "../register";
import { EARLY_ACCESS_CART_ENV } from "../cart/feature-flag";
import { InMemoryEarlyAccessCartStore } from "../cart/store";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_CONTACT,
  SHIP_TO,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
  StubSupplierDirectory,
  SUPPLIER_ASSIGNMENT,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  sequentialOrderNumbers,
  sequentialProofIds,
} from "../routes/route-fixtures";
import { EARLY_ACCESS_PROOF_CONTENT_TYPES } from "../commerce/payment-proof";
import { createMemoryProofSubmissionStore } from "./memory-store";
import { createProofBodyErrorHandler, isProofUploadPath } from "./route";
import { TRANSIENT_PROOF_MAX_BYTES } from "./transient-proof";
import { validPng } from "./test-fixtures";
import type { InternalEmailSendResult, ProductDisplayPort } from "./internal-order-email";
import type { ProofSubmissionDeps } from "./submission-service";

/**
 * THE DOOR, MOUNTED, THROUGH THE REAL REGISTRATION AND THE REAL BODY SEAM.
 *
 * Every other proof test drives the service directly. This one exists because
 * the defect the fusion report named was not in the service at all: the route
 * was fully built, fully tested, and registered nowhere, so the customer's last
 * step 404'd. These tests fail if the mount disappears, if it stops being
 * conditional on the durable dependencies, or if the raw-body seam widens.
 *
 * The app is composed in the SAME order as server/index.ts: the scoped raw
 * parser first, then the global 2 MB JSON parser, then the scoped body-error
 * boundary. A test that composes them in a different order would prove nothing
 * about the file that matters.
 */

const UNLOCK = "/api/research/early-access/unlock";
const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";
const AGREEMENT_ACCEPT = "/api/research/early-access/agreements/accept";

const CART_ON = {
  NODE_ENV: "test",
  [EARLY_ACCESS_CART_ENV]: "true",
} as NodeJS.ProcessEnv;

const MEMBER_ID = "11111111-1111-4111-8111-111111111111";

type Sent = Readonly<{
  subject: string;
  text: string;
  filename: string;
  contentType: string;
  byteLength: number;
  idempotencyKey: string;
}>;

/** A display port that answers with real language, as Product Control would. */
const PRODUCTS: ProductDisplayPort = {
  async describe() {
    return Object.freeze({ displayName: "Clean Unit Research Material", strength: "10 mg" });
  },
};

function proofDependencies(
  overrides: Partial<Omit<ProofSubmissionDeps, "checkouts" | "now">> = {},
): {
  deps: Omit<ProofSubmissionDeps, "checkouts" | "now">;
  sent: Sent[];
  submissions: ReturnType<typeof createMemoryProofSubmissionStore>;
  storeWrites: unknown[];
} {
  const sent: Sent[] = [];
  const inner = createMemoryProofSubmissionStore();
  const storeWrites: unknown[] = [];
  const submissions = Object.freeze({
    ...inner,
    async claimPending(row: Parameters<typeof inner.claimPending>[0]) {
      storeWrites.push(row);
      return inner.claimPending(row);
    },
    async recordAcceptance(input: Parameters<typeof inner.recordAcceptance>[0]) {
      storeWrites.push(input);
      return inner.recordAcceptance(input);
    },
  }) as ReturnType<typeof createMemoryProofSubmissionStore>;

  const deps: Omit<ProofSubmissionDeps, "checkouts" | "now"> = {
    submissions,
    bindings: {
      async forCustomer(customerRef: string) {
        return Object.freeze({
          ok: true as const,
          binding: Object.freeze({
            customerRef,
            memberId: MEMBER_ID,
            establishedBy: "verified_link" as const,
            verifiedAt: "2026-08-01T00:00:00.000Z",
            attestedBy: null,
            aliasRefs: Object.freeze([]),
          }),
        });
      },
      async ownsCheckout() {
        return true;
      },
    },
    agreements: {
      async currentPackage() {
        return Object.freeze({
          packageId: "xenios-research@1.0.0",
          packageVersion: "pkgversion0001",
          requirements: Object.freeze([]),
        });
      },
      async standingFor(memberId: string) {
        return Object.freeze({
          satisfied: true,
          packageId: "xenios-research@1.0.0",
          packageVersion: "pkgversion0001",
          memberId,
          blocking: Object.freeze([]),
          evaluatedAt: "2026-08-09T00:00:00.000Z",
        });
      },
    },
    presentation: {
      async resolveChosenMethod(method: unknown) {
        if (method !== "zelle") return Object.freeze({ state: "not_enabled" as const });
        return Object.freeze({
          state: "resolved" as const,
          snapshot: Object.freeze({
            code: "zelle" as const,
            methodName: "Zelle",
            registryVersion: "a".repeat(64),
            presentedAt: "2026-08-09T00:00:00.000Z",
          }),
        });
      },
    },
    products: PRODUCTS,
    sender: {
      async send(input): Promise<InternalEmailSendResult> {
        sent.push(
          Object.freeze({
            subject: input.subject,
            text: input.text,
            filename: input.filename,
            contentType: input.contentType,
            byteLength: input.bytes.length,
            idempotencyKey: input.idempotencyKey,
          }),
        );
        return Object.freeze({ outcome: "accepted" as const, providerMessageId: "msg_1" });
      },
    },
    pdfParser: {
      async pageCount() {
        return 1;
      },
    },
    ...overrides,
  } as Omit<ProofSubmissionDeps, "checkouts" | "now">;

  return { deps, sent, submissions, storeWrites };
}

/**
 * The app, composed exactly as server/index.ts composes it around the seam.
 */
async function proofApp(
  options: {
    readonly withProofDependencies?: boolean;
    readonly deps?: Omit<ProofSubmissionDeps, "checkouts" | "now">;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): Promise<Express> {
  const app = express();

  const rawProof = express.raw({
    type: [...EARLY_ACCESS_PROOF_CONTENT_TYPES],
    limit: TRANSIENT_PROOF_MAX_BYTES,
  });
  app.use((req, res, next) => {
    if (req.method !== "POST" || !isProofUploadPath(req.path)) {
      next();
      return;
    }
    rawProof(req, res, next);
  });
  app.use(express.json({ limit: "2mb" }));
  app.use(createProofBodyErrorHandler(isProofUploadPath));

  const unit = cleanUnit();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    env: options.env ?? CART_ON,
    cartStore: new InMemoryEarlyAccessCartStore(),
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    ...(options.withProofDependencies === false
      ? {}
      : { proofDependencies: options.deps ?? proofDependencies().deps }),
  });

  // The API 404 guard, so an unmounted /api path answers a JSON 404 here
  // exactly as it does in production rather than falling through to nothing.
  app.use("/api/{*rest}", (_req, res) => {
    res.status(404).json({ message: "Not Found" });
  });
  return app;
}

async function unlock(app: Express): Promise<string> {
  const res = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

/** Quote, check out, and return the real checkout number and its cookie. */
async function placedCheckout(app: Express): Promise<{ cookie: string; number: string }> {
  const cookie = await unlock(app);
  const quoted = await request(app)
    .post(QUOTE)
    .set("Cookie", cookie)
    .send({
      items: [
        {
          productId: "prod-clean",
          variantId: "var-10mg",
          quantity: 3,
          expectedUnitPriceCents: 19_900,
          expectedCurrency: "USD",
        },
      ],
      contact: ORDER_CONTACT,
      shipTo: SHIP_TO,
    });
  expect(quoted.status).toBe(200);
  const placed = await request(app)
    .post(CHECKOUT)
    .set("Cookie", cookie)
    .send({
      quoteId: quoted.body.quote.quoteId,
      idempotencyKey: "xeac_proofmount0000000001",
      expectedIntentHash: quoted.body.quote.intentHash,
    });
  expect(placed.status).toBe(201);
  return { cookie, number: placed.body.checkout.cartCheckoutNumber };
}

function proofPath(number: string): string {
  return `/api/research/early-access/cart/${number}/payment-proof`;
}

function upload(app: Express, number: string, cookie: string, bytes: Uint8Array) {
  return request(app)
    .post(proofPath(number))
    .set("Cookie", cookie)
    .set("Content-Type", "image/png")
    .set(EARLY_ACCESS_PROOF_FILENAME_HEADER, "receipt.png")
    .set(EARLY_ACCESS_PROOF_METHOD_HEADER, "zelle")
    .send(Buffer.from(bytes));
}

describe("the door only exists where it can keep a submission", () => {
  it("is NOT mounted when the durable dependencies were not supplied", async () => {
    const app = await proofApp({ withProofDependencies: false });
    const { cookie, number } = await placedCheckout(app);
    const response = await upload(app, number, cookie, validPng());
    // The API 404 guard, not the door refusing: there is no surface to probe.
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Not Found" });
  });

  it("is NOT mounted when the cart flag is off", async () => {
    const app = await proofApp({ env: { NODE_ENV: "test" } as NodeJS.ProcessEnv });
    const cookie = await unlock(app);
    const response = await request(app)
      .post(proofPath("XEC-AAAAAAAAAAAAAAAA"))
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .send(Buffer.from(validPng()));
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Not Found" });
  });
});

describe("the mounted door, over HTTP", () => {
  it("refuses an unauthenticated caller before it looks at anything", async () => {
    const app = await proofApp();
    const response = await request(app)
      .post(proofPath("XEC-AAAAAAAAAAAAAAAA"))
      .set("Content-Type", "image/png")
      .send(Buffer.from(validPng()));
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SESSION_REQUIRED");
  });

  it("answers 404, not 403, for a checkout that is not the caller's", async () => {
    const app = await proofApp();
    const cookie = await unlock(app);
    const response = await upload(app, "XEC-BBBBBBBBBBBBBBBB", cookie, validPng());
    expect(response.status).toBe(404);
  });

  it("accepts a real upload, sends exactly one internal email, and names the product", async () => {
    const built = proofDependencies();
    const app = await proofApp({ deps: built.deps });
    const { cookie, number } = await placedCheckout(app);

    const response = await upload(app, number, cookie, validPng());
    expect(response.status).toBe(201);
    expect(response.body.ok).toBe(true);
    expect(built.sent).toHaveLength(1);

    const email = built.sent[0];
    expect(email.subject).toContain(number);
    expect(email.text).toContain("Clean Unit Research Material");
    expect(email.text).toContain("10 mg");
    // The defect this whole port exists to prevent.
    expect(email.text).not.toContain("var-10mg");
    expect(email.text).not.toContain("PRODUCT NAME UNRESOLVED");
    expect(email.contentType).toBe("image/png");
  });

  it("records metadata only: no proof bytes reach the store", async () => {
    const built = proofDependencies();
    const app = await proofApp({ deps: built.deps });
    const { cookie, number } = await placedCheckout(app);
    const bytes = validPng();
    expect((await upload(app, number, cookie, bytes)).status).toBe(201);

    const written = JSON.stringify(built.storeWrites);
    expect(written).not.toContain(Buffer.from(bytes).toString("base64"));
    expect(written).not.toContain("PNG");
    for (const row of built.submissions.all()) {
      expect(Object.keys(row)).not.toContain("bytes");
      expect(row.byteSize).toBe(bytes.length);
    }
  });

  it("answers a repeat of the same claim with 200 and sends no second email", async () => {
    const built = proofDependencies();
    const app = await proofApp({ deps: built.deps });
    const { cookie, number } = await placedCheckout(app);
    const bytes = validPng();

    expect((await upload(app, number, cookie, bytes)).status).toBe(201);
    const again = await upload(app, number, cookie, bytes);
    expect(again.status).toBe(200);
    expect(built.sent).toHaveLength(1);
  });

  it("refuses when the agreement standing is not satisfied, and sends nothing", async () => {
    const base = proofDependencies();
    const built = proofDependencies({
      agreements: {
        ...base.deps.agreements,
        async standingFor(memberId: string) {
          return Object.freeze({
            satisfied: false,
            packageId: "xenios-research@undesignated:designation_missing",
            packageVersion: "undesignated:designation_missing",
            memberId,
            blocking: Object.freeze([
              Object.freeze({
                category: "electronic_record_consent" as const,
                reason: "no_published_version" as const,
              }),
            ]),
            evaluatedAt: "2026-08-09T00:00:00.000Z",
          });
        },
      },
    });
    const app = await proofApp({ deps: built.deps });
    const { cookie, number } = await placedCheckout(app);

    const response = await upload(app, number, cookie, validPng());
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("AGREEMENTS_NOT_CURRENT");
    expect(built.sent).toHaveLength(0);
    expect(built.submissions.all()).toHaveLength(0);
  });

  it("refuses a method the live presentation does not enable", async () => {
    const built = proofDependencies();
    const app = await proofApp({ deps: built.deps });
    const { cookie, number } = await placedCheckout(app);
    const response = await request(app)
      .post(proofPath(number))
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .set(EARLY_ACCESS_PROOF_FILENAME_HEADER, "receipt.png")
      .set(EARLY_ACCESS_PROOF_METHOD_HEADER, "wire")
      .send(Buffer.from(validPng()));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("METHOD_NOT_ENABLED");
    expect(built.sent).toHaveLength(0);
  });

  it("refuses with no method at all rather than defaulting to one", async () => {
    const built = proofDependencies();
    const app = await proofApp({ deps: built.deps });
    const { cookie, number } = await placedCheckout(app);
    const response = await request(app)
      .post(proofPath(number))
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .set(EARLY_ACCESS_PROOF_FILENAME_HEADER, "receipt.png")
      .send(Buffer.from(validPng()));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("METHOD_REQUIRED");
    expect(built.sent).toHaveLength(0);
  });
});

describe("the raw body seam", () => {
  it("refuses an unaccepted content type with 415 and never parses it", async () => {
    const app = await proofApp();
    const { cookie, number } = await placedCheckout(app);
    const response = await request(app)
      .post(proofPath(number))
      .set("Cookie", cookie)
      .set("Content-Type", "image/gif")
      .send(Buffer.from([0x47, 0x49, 0x46]));
    expect(response.status).toBe(415);
    expect(response.body.code).toBe("CONTENT_TYPE_UNSUPPORTED");
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("accepts a content type carrying a parameter, without widening the allowlist", async () => {
    const built = proofDependencies();
    const app = await proofApp({ deps: built.deps });
    const { cookie, number } = await placedCheckout(app);
    const response = await request(app)
      .post(proofPath(number))
      .set("Cookie", cookie)
      .set("Content-Type", "IMAGE/PNG; charset=binary")
      .set(EARLY_ACCESS_PROOF_FILENAME_HEADER, "receipt.png")
      .set(EARLY_ACCESS_PROOF_METHOD_HEADER, "zelle")
      .send(Buffer.from(validPng()));
    expect(response.status).toBe(201);
  });

  it("answers an oversized upload with a JSON 413 from the scoped handler, not HTML", async () => {
    const app = await proofApp();
    const { cookie, number } = await placedCheckout(app);
    const oversized = Buffer.alloc(TRANSIENT_PROOF_MAX_BYTES + 1_024, 0x41);
    const response = await request(app)
      .post(proofPath(number))
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .set(EARLY_ACCESS_PROOF_FILENAME_HEADER, "receipt.png")
      .set(EARLY_ACCESS_PROOF_METHOD_HEADER, "zelle")
      .send(oversized);
    expect(response.status).toBe(413);
    expect(response.body.code).toBe("TOO_LARGE");
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("leaves the global 2 MB JSON limit exactly where it was", async () => {
    const app = await proofApp();
    const cookie = await unlock(app);
    // An unrelated Early Access JSON door, with a body over the global limit.
    const response = await request(app)
      .post(AGREEMENT_ACCEPT)
      .set("Cookie", cookie)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(3 * 1024 * 1024) }));
    expect(response.status).toBe(413);
  });

  // The predicate IS the scope. `app.use(path, ...)` would have been a PREFIX
  // match, admitting every future path under `.../payment-proof/`, so the near
  // misses are pinned here rather than left to the reader.
  it.each([
    "/api/research/early-access/cart/XEC-AAAAAAAAAAAAAAAA/payment-proof/extra",
    "/api/research/early-access/cart/XEC-AAAAAAAAAAAAAAAA/payment-proofs",
    "/api/research/early-access/cart/XEC-AAAAAAAAAAAAAAAA/status",
    "/api/research/early-access/cart//payment-proof",
    "/api/admin/research/cart/XEC-AAAAAAAAAAAAAAAA/external-proof",
    "/payment-proof",
  ])("keeps %s out of the 8 MB raw parser", (path) => {
    expect(isProofUploadPath(path)).toBe(false);
  });

  it("does not mount a door one segment further down", async () => {
    const app = await proofApp();
    const cookie = await unlock(app);
    const response = await request(app)
      .post("/api/research/early-access/cart/XEC-AAAAAAAAAAAAAAAA/payment-proof/extra")
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .send(Buffer.from(validPng()));
    // No route, and nothing parsed its body.
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Not Found" });
  });
});
