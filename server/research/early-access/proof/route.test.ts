import { describe, expect, it } from "vitest";
import {
  classifyBodyError,
  createEarlyAccessCartPaymentProofRoute,
  createProofBodyErrorHandler,
  EARLY_ACCESS_CART_PAYMENT_PROOF_PATH,
  isProofUploadPath,
  type ProofResponsePort,
} from "./route";
import {
  EARLY_ACCESS_SUBMISSION_FORBIDDEN_CUSTOMER_KEYS,
  customerPayloadIsClean,
} from "@shared/research/early-access-hardening";
import type { ProofSubmissionOutcome } from "./submission-service";
import { pendingSubmission } from "./submission-record";
import { validPng } from "./test-fixtures";
import { TRANSIENT_PROOF_MAX_BYTES } from "./transient-proof";

function recorder() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body: unknown = undefined;
  const response: ProofResponsePort & { headersSent?: boolean } = {
    setHeader(name: string, value: string) {
      headers[name] = value;
      return undefined;
    },
    status(code: number) {
      statusCode = code;
      return {
        json(value: unknown) {
          body = value;
          return undefined;
        },
      };
    },
    json(value: unknown) {
      body = value;
      return undefined;
    },
  };
  return {
    response,
    headers,
    get status() {
      return statusCode;
    },
    get body() {
      return body as Record<string, unknown>;
    },
  };
}

const ROW = {
  ...pendingSubmission({
    cartCheckoutNumber: "XEAC-2026-0001",
    customerRef: "cust_alpha",
    memberId: "mem_alpha",
    proofSha256: "b".repeat(64),
    filename: "proof.png",
    contentType: "image/png",
    byteSize: 1024,
    method: {
      code: "zelle",
      methodName: "Zelle",
      registryVersion: "gov-secret-fingerprint",
      presentedAt: "2026-08-09T11:00:00.000Z",
    },
    packageVersion: "pkg-v1",
    at: "2026-08-09T11:00:00.000Z",
  }),
  internalEmailAcceptance: "accepted" as const,
  providerMessageId: "prov_secret_123",
};

const isCheckoutNumber = (value: unknown): value is string =>
  typeof value === "string" && /^XEAC-\d{4}-\d{4}$/.test(value);

function buildRoute(outcome: ProofSubmissionOutcome, identity: unknown = { customerRef: "cust_alpha" }) {
  const calls: unknown[] = [];
  const handler = createEarlyAccessCartPaymentProofRoute({
    identity: { async resolve() { return identity as never; } },
    async submit(input) {
      calls.push(input);
      return outcome;
    },
    isCheckoutNumber,
  });
  return { handler, calls };
}

function upload(overrides: Record<string, unknown> = {}) {
  return {
    cookieHeader: "ea_session=x",
    cartCheckoutNumber: "XEAC-2026-0001",
    bytes: validPng(),
    contentType: "image/png",
    filename: "proof.png",
    method: "zelle",
    ...overrides,
  };
}

describe("the upload door", () => {
  it("is constructed, not registered, and names its canonical path", () => {
    expect(EARLY_ACCESS_CART_PAYMENT_PROOF_PATH).toBe(
      "/api/research/early-access/cart/:cartCheckoutNumber/payment-proof",
    );
    expect(isProofUploadPath("/api/research/early-access/cart/XEAC-2026-0001/payment-proof")).toBe(true);
    expect(isProofUploadPath("/api/research/early-access/cart/XEAC-2026-0001/status")).toBe(false);
  });

  it("writes private headers before any decision", async () => {
    const { handler } = buildRoute({ ok: false, code: "not_found" });
    const sink = recorder();
    await handler(upload(), sink.response);

    expect(sink.headers["Cache-Control"]).toBe("no-store, private, max-age=0");
    expect(sink.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(sink.status).toBe(404);
  });

  it("refuses without a session and never calls the service", async () => {
    const { handler, calls } = buildRoute({ ok: false, code: "not_found" }, null);
    const sink = recorder();
    await handler(upload(), sink.response);

    expect(sink.status).toBe(401);
    expect(sink.body).toEqual({ ok: false, code: "SESSION_REQUIRED" });
    expect(calls).toHaveLength(0);
  });

  it("answers 415 for a type outside the allowlist, listing what is accepted", async () => {
    const { handler, calls } = buildRoute({ ok: false, code: "not_found" });
    const sink = recorder();
    await handler(upload({ contentType: "image/svg+xml" }), sink.response);

    expect(sink.status).toBe(415);
    expect(sink.body.code).toBe("CONTENT_TYPE_UNSUPPORTED");
    expect(sink.body.accepted).toEqual(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
    expect(calls).toHaveLength(0);
  });

  it("answers 413 on the declared length before it holds the bytes", async () => {
    const { handler, calls } = buildRoute({ ok: false, code: "not_found" });
    const sink = recorder();
    await handler(
      upload({ declaredContentLength: TRANSIENT_PROOF_MAX_BYTES + 1, bytes: undefined }),
      sink.response,
    );

    expect(sink.status).toBe(413);
    expect(sink.body.code).toBe("TOO_LARGE");
    expect(calls).toHaveLength(0);
  });

  it("answers 413 on the real length even if the declaration lied", async () => {
    const { handler } = buildRoute({ ok: false, code: "not_found" });
    const sink = recorder();
    await handler(
      upload({ declaredContentLength: 10, bytes: new Uint8Array(TRANSIENT_PROOF_MAX_BYTES + 1) }),
      sink.response,
    );
    expect(sink.status).toBe(413);
  });

  it("answers 201 with the customer projection on a new submission", async () => {
    const { handler } = buildRoute({ ok: true, state: "submitted", row: ROW });
    const sink = recorder();
    await handler(upload(), sink.response);

    expect(sink.status).toBe(201);
    expect(sink.body.ok).toBe(true);
    const submission = sink.body.submission as Record<string, unknown>;
    expect(submission.state).toBe("accepted_for_review");
    expect(submission.method).toBe("zelle");
    expect(submission.methodLabel).toBe("Zelle");
    expect(submission.retryAllowed).toBe(false);
  });

  it("answers 200 for a repeat of the same claim, because a duplicate is a success", async () => {
    const { handler } = buildRoute({ ok: true, state: "already_submitted", row: ROW });
    const sink = recorder();
    await handler(upload(), sink.response);
    expect(sink.status).toBe(200);
  });

  it("never serializes an internal field to the customer", async () => {
    const { handler } = buildRoute({ ok: true, state: "submitted", row: ROW });
    const sink = recorder();
    await handler(upload(), sink.response);

    const serialized = JSON.stringify(sink.body);
    for (const key of EARLY_ACCESS_SUBMISSION_FORBIDDEN_CUSTOMER_KEYS) {
      expect(serialized, `leaked ${key}`).not.toContain(`"${key}"`);
    }
    // The contract's own deep check, so this test cannot drift from it.
    expect(customerPayloadIsClean(sink.body)).toBe(true);
    expect(serialized).not.toContain("gov-secret-fingerprint");
    expect(serialized).not.toContain("prov_secret_123");
    expect(serialized).not.toContain("cust_alpha");
    expect(serialized).not.toContain("mem_alpha");
    expect(serialized).not.toContain("research@xeniostechnology.com");
    expect(serialized).not.toContain("b".repeat(64));
  });

  it("maps every refusal to a scoped status with a non-diagnostic message", async () => {
    const cases: ReadonlyArray<[string, number]> = [
      ["binding_absent", 409],
      ["agreements_not_current", 409],
      ["binding_owner_mismatch", 404],
      ["rate_limited", 429],
      ["capacity_exhausted", 503],
      ["presentation_unavailable", 503],
      ["store_unavailable", 503],
      ["method_required", 400],
      ["method_not_enabled", 400],
      ["payment_closed", 409],
      ["checkout_superseded", 409],
      ["send_failed", 502],
      ["too_large", 413],
      ["declared_type_mismatch", 415],
      ["signature_unrecognised", 415],
      ["checksum_invalid", 400],
      ["trailing_bytes", 400],
      ["encrypted", 400],
    ];
    for (const [code, status] of cases) {
      const { handler } = buildRoute({ ok: false, code } as ProofSubmissionOutcome);
      const sink = recorder();
      await handler(upload(), sink.response);
      expect(sink.status, code).toBe(status);
      expect(String(sink.body.message ?? "")).not.toMatch(/offset|CRC|chunk|IHDR/i);
    }
  });
});

describe("the scoped body error boundary", () => {
  it("classifies express body failures by type", () => {
    expect(classifyBodyError({ type: "entity.too.large" })).toBe(413);
    expect(classifyBodyError({ type: "encoding.unsupported" })).toBe(415);
    expect(classifyBodyError({ type: "entity.parse.failed" })).toBe(400);
    expect(classifyBodyError({ status: 400 })).toBe(400);
    expect(classifyBodyError({ message: "something else" })).toBeNull();
  });

  it("answers JSON with private headers instead of an HTML error page", () => {
    const handler = createProofBodyErrorHandler(isProofUploadPath);
    const sink = recorder();
    let passed: unknown = "not-called";
    handler(
      { type: "entity.too.large" },
      { path: "/api/research/early-access/cart/XEAC-2026-0001/payment-proof" },
      sink.response,
      (error) => {
        passed = error;
      },
    );

    expect(passed).toBe("not-called");
    expect(sink.status).toBe(413);
    expect(sink.body).toMatchObject({ ok: false, code: "TOO_LARGE" });
    expect(sink.headers["Cache-Control"]).toBe("no-store, private, max-age=0");
  });

  it("leaves every other path alone", () => {
    const handler = createProofBodyErrorHandler(isProofUploadPath);
    const sink = recorder();
    let passed: unknown = "not-called";
    handler({ type: "entity.too.large" }, { path: "/api/research/other" }, sink.response, (error) => {
      passed = error;
    });

    expect(passed).toEqual({ type: "entity.too.large" });
    expect(sink.status).toBe(0);
  });

  it("does not try to answer twice when headers are already sent", () => {
    const handler = createProofBodyErrorHandler(isProofUploadPath);
    const sink = recorder();
    (sink.response as { headersSent?: boolean }).headersSent = true;
    let passed: unknown = "not-called";
    handler(
      { type: "entity.too.large" },
      { path: "/api/research/early-access/cart/XEAC-2026-0001/payment-proof" },
      sink.response,
      (error) => {
        passed = error;
      },
    );
    expect(passed).toEqual({ type: "entity.too.large" });
  });
});
