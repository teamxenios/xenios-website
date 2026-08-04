import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it, vi } from "vitest";
import { EARLY_ACCESS_PAYMENT_OPTION_CODES } from "@shared/research/early-access-payment-options";
import type {
  ManualOrderPaymentMethod,
  ManualPaymentClockPort,
  ManualPaymentMethodRegistryPort,
} from "../commerce/manual-order-payments";
import {
  PRIVATE_ACCESS_SESSION_TTL_SECONDS,
  issuePrivateAccessSession,
} from "./private-access-session";
import {
  PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH,
  createPrivateEarlyAccessPaymentOptionsContainmentMiddleware,
  createPrivateEarlyAccessPaymentOptionsRoute,
  type PrivateEarlyAccessPaymentOptionsResponsePort,
  type PrivateEarlyAccessPaymentOptionsRouteDependencies,
} from "./private-access-route";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SESSION_SECRET = "s".repeat(64);
const OTHER_SESSION_SECRET = "t".repeat(64);
const EXPECTED_NONCE = Buffer.alloc(32, 7).toString("base64url");
const OTHER_NONCE = Buffer.alloc(32, 8).toString("base64url");
const ISSUED_AT_MS = Date.parse("2026-08-04T09:00:00.000Z");
const SESSION_NOW_MS = Date.parse("2026-08-04T09:05:00.000Z");
const PAYMENT_NOW = "2026-08-04T09:05:00.000Z";
const ENABLED_AT = "2026-08-04T08:30:00.000Z";
const PRIVATE_SENTINEL = "PRIVATE-RECIPIENT-SENTINEL-MUST-NOT-LEAK";

function issueToken(
  overrides: Partial<{
    nonce: string;
    now: number;
    sessionSecret: string;
  }> = {},
): string {
  const result = issuePrivateAccessSession({
    accessPassword: "synthetic-access-password",
    nonce: overrides.nonce ?? EXPECTED_NONCE,
    now: overrides.now ?? ISSUED_AT_MS,
    presentedPassword: "synthetic-access-password",
    sessionSecret: overrides.sessionSecret ?? SESSION_SECRET,
  });
  if (!result.ok)
    throw new Error(`synthetic token issue failed: ${result.code}`);
  return result.value.token;
}

function opaque(kind: string, marker: string): string {
  const seed = `${kind}_${marker}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0)
    .toString(16);
  return `${kind}:${seed.padStart(64, "0").slice(-64)}`;
}

function snapshot(
  method: ManualOrderPaymentMethod,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    method,
    configurationRef: opaque("payment_config", `${method}_${PRIVATE_SENTINEL}`),
    instructionsRef: opaque(
      "payment_instructions",
      `${method}_${PRIVATE_SENTINEL}`,
    ),
    approvalRef: opaque("payment_approval", method),
    approvedByRole: "owner",
    approvedAt: "2026-08-04T08:00:00.000Z",
    verificationRef: opaque("payment_verification", method),
    verifiedByRole: "operations_admin",
    verifiedAt: "2026-08-04T08:15:00.000Z",
    enablementRef: opaque("payment_enablement", method),
    enabledByRole: "owner",
    enabledAt: ENABLED_AT,
    ...overrides,
  };
}

interface DependencyHarness {
  dependencies: PrivateEarlyAccessPaymentOptionsRouteDependencies;
  sessionNow: ReturnType<typeof vi.fn>;
  paymentNow: ReturnType<typeof vi.fn>;
  resolveEnabledMethod: ReturnType<typeof vi.fn>;
}

function dependencyHarness(
  resolver: (input: {
    method: ManualOrderPaymentMethod;
    evaluatedAt: string;
  }) => unknown = ({ method }) => snapshot(method),
): DependencyHarness {
  const sessionNow = vi.fn(() => SESSION_NOW_MS);
  const paymentNow = vi.fn(() => PAYMENT_NOW);
  const resolveEnabledMethod = vi.fn(resolver);
  return {
    dependencies: {
      session: {
        consumedNonces: [],
        expectedNonce: EXPECTED_NONCE,
        now: sessionNow,
        sessionSecret: SESSION_SECRET,
      },
      methodRegistry: {
        resolveEnabledMethod,
      } as ManualPaymentMethodRegistryPort,
      paymentClock: { now: paymentNow } as ManualPaymentClockPort,
    },
    sessionNow,
    paymentNow,
    resolveEnabledMethod,
  };
}

interface ResponseCapture {
  port: PrivateEarlyAccessPaymentOptionsResponsePort;
  headers: Record<string, string>;
  events: string[];
  statusCode: number | null;
  body: unknown;
}

function responseCapture(): ResponseCapture {
  const capture: ResponseCapture = {
    headers: {},
    events: [],
    statusCode: null,
    body: undefined,
    port: undefined as unknown as PrivateEarlyAccessPaymentOptionsResponsePort,
  };
  capture.port = {
    setHeader(name, value) {
      capture.headers[name] = value;
      capture.events.push(`header:${name}`);
    },
    status(code) {
      capture.statusCode = code;
      capture.events.push(`status:${code}`);
    },
    json(body) {
      capture.body = body;
      capture.events.push("json");
    },
  };
  return capture;
}

function requestInput(
  sessionToken: unknown,
  overrides: Partial<{ method: unknown; rawPath: unknown }> = {},
): Record<string, unknown> {
  return {
    method: overrides.method ?? "GET",
    rawPath: overrides.rawPath ?? PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH,
    sessionToken,
  };
}

function invoke(
  dependencies: PrivateEarlyAccessPaymentOptionsRouteDependencies,
  input: unknown,
): ResponseCapture {
  const capture = responseCapture();
  createPrivateEarlyAccessPaymentOptionsRoute(dependencies)(
    input,
    capture.port,
  );
  return capture;
}

function expectPrivate(capture: ResponseCapture): void {
  expect(capture.headers).toEqual({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });
  expect(capture.events.slice(0, 4)).toEqual([
    "header:Cache-Control",
    "header:Pragma",
    "header:Referrer-Policy",
    "header:X-Robots-Tag",
  ]);
  expect(capture.events[4]).toMatch(/^status:/);
}

describe("Private Early Access payment-options route factory", () => {
  it("admits one valid session and projects only the seven canonical category codes", () => {
    const harness = dependencyHarness();
    const capture = invoke(harness.dependencies, requestInput(issueToken()));

    expect(capture.statusCode).toBe(200);
    expect(capture.body).toEqual({
      state: "resolved",
      codes: EARLY_ACCESS_PAYMENT_OPTION_CODES,
    });
    expect(Object.keys(capture.body as object)).toEqual(["state", "codes"]);
    expect(Object.isFrozen(capture.body)).toBe(true);
    const codes = (capture.body as { codes: readonly string[] }).codes;
    expect(Object.isFrozen(codes)).toBe(true);
    expect(harness.sessionNow).toHaveBeenCalledTimes(1);
    expect(harness.paymentNow).toHaveBeenCalledTimes(1);
    expect(harness.resolveEnabledMethod.mock.calls).toEqual(
      EARLY_ACCESS_PAYMENT_OPTION_CODES.map((method) => [
        { method, evaluatedAt: PAYMENT_NOW },
      ]),
    );
    expectPrivate(capture);

    const serialized = JSON.stringify(capture.body);
    for (const forbidden of [
      "configurationRef",
      "instructionsRef",
      "approvalRef",
      "verificationRef",
      "enablementRef",
      "account",
      "routing",
      "handle",
      "recipient",
      "instruction",
      "qr",
      "price",
      PRIVATE_SENTINEL,
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("returns a healthy resolved empty subset without inventing availability", () => {
    const harness = dependencyHarness(() => null);
    const capture = invoke(harness.dependencies, requestInput(issueToken()));

    expect(capture.statusCode).toBe(200);
    expect(capture.body).toEqual({ state: "resolved", codes: [] });
    expect(harness.resolveEnabledMethod).toHaveBeenCalledTimes(7);
    expectPrivate(capture);
  });

  it.each([
    ["HEAD", PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH],
    ["POST", PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH],
    ["OPTIONS", PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH],
    ["get", PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH],
    ["GET", `${PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH}/`],
    ["GET", `${PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH}?source=private`],
    ["GET", "/api/research/early-access/payment-options/extra"],
    ["GET", "/api/research/early-access/payment%2Doptions"],
    ["GET", "/api/research/early-access/%70ayment-options"],
    ["GET", "/api/research/early-access//payment-options"],
    ["GET", "/api/research/early-access/payment-Options"],
    ["GET", "/api/research/early-access/payment-option"],
  ])(
    "refuses the noncanonical boundary %s %s before any injected read",
    (method, rawPath) => {
      const harness = dependencyHarness();
      const capture = invoke(
        harness.dependencies,
        requestInput(issueToken(), { method, rawPath }),
      );

      expect(capture.statusCode).toBe(404);
      expect(capture.body).toEqual({ ok: false, code: "not_found" });
      expect(harness.sessionNow).not.toHaveBeenCalled();
      expect(harness.paymentNow).not.toHaveBeenCalled();
      expect(harness.resolveEnabledMethod).not.toHaveBeenCalled();
      expectPrivate(capture);
    },
  );

  it.each([
    null,
    undefined,
    [],
    {},
    { method: "GET", rawPath: PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH },
    {
      method: "GET",
      rawPath: PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH,
      sessionToken: issueToken(),
      query: "fallback-token",
    },
    {
      ...requestInput(issueToken()),
      cookie: "private-session=fallback-token",
    },
    {
      ...requestInput(issueToken()),
      authorization: "Bearer fallback-token",
    },
    {
      ...requestInput(issueToken()),
      accessPassword: "fallback-password",
    },
    {
      ...requestInput(issueToken()),
      password: "fallback-password",
    },
    {
      ...requestInput(issueToken()),
      xr_access: "legacy-cookie-value",
    },
    {
      ...requestInput(issueToken()),
      body: { sessionToken: "fallback-token" },
    },
    Object.assign(
      Object.create({ cookie: "inherited-fallback-token" }) as Record<
        string,
        unknown
      >,
      requestInput(issueToken()),
    ),
    {
      ...requestInput(issueToken()),
      [Symbol("fallback-token")]: "hidden-fallback-token",
    },
  ])("rejects a malformed or widened explicit request shape", (input) => {
    const harness = dependencyHarness();
    const capture = invoke(harness.dependencies, input);

    expect(capture.statusCode).toBe(404);
    expect(harness.sessionNow).not.toHaveBeenCalled();
    expect(harness.paymentNow).not.toHaveBeenCalled();
    expect(harness.resolveEnabledMethod).not.toHaveBeenCalled();
    expectPrivate(capture);
  });

  it("does not invoke accessors on an untrusted request", () => {
    const tokenGetter = vi.fn(() => issueToken());
    const input = {
      method: "GET",
      rawPath: PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH,
    } as Record<string, unknown>;
    Object.defineProperty(input, "sessionToken", {
      enumerable: true,
      get: tokenGetter,
    });
    const harness = dependencyHarness();
    const capture = invoke(harness.dependencies, input);

    expect(capture.statusCode).toBe(404);
    expect(tokenGetter).not.toHaveBeenCalled();
    expect(harness.sessionNow).not.toHaveBeenCalled();
    expectPrivate(capture);
  });

  it("rejects transparent and revoked proxies without reaching injected state", () => {
    const ordinary = requestInput(issueToken());
    const transparent = new Proxy(ordinary, {});
    const revocable = Proxy.revocable(requestInput(issueToken()), {});
    revocable.revoke();

    for (const input of [transparent, revocable.proxy]) {
      const harness = dependencyHarness();
      const capture = invoke(harness.dependencies, input);
      expect(capture.statusCode).toBe(404);
      expect(harness.sessionNow).not.toHaveBeenCalled();
      expect(harness.paymentNow).not.toHaveBeenCalled();
      expect(harness.resolveEnabledMethod).not.toHaveBeenCalled();
      expectPrivate(capture);
    }
  });

  it("rejects proxy-backed or accessor-backed trusted session configuration without invoking traps", () => {
    const accessorRead = vi.fn(() => SESSION_SECRET);
    const accessorSession = {
      consumedNonces: [],
      expectedNonce: EXPECTED_NONCE,
      now: () => SESSION_NOW_MS,
    } as Record<string, unknown>;
    Object.defineProperty(accessorSession, "sessionSecret", {
      enumerable: true,
      get: accessorRead,
    });

    const configurations: Array<{
      name: string;
      build: (harness: DependencyHarness) => unknown;
    }> = [
      {
        name: "transparent session proxy",
        build: (harness) => new Proxy(harness.dependencies.session!, {}),
      },
      {
        name: "proxied replay snapshot",
        build: (harness) => ({
          ...harness.dependencies.session!,
          consumedNonces: new Proxy([] as string[], {}),
        }),
      },
      {
        name: "proxied clock",
        build: (harness) => ({
          ...harness.dependencies.session!,
          now: new Proxy(harness.sessionNow, {}),
        }),
      },
      {
        name: "accessor secret",
        build: () => accessorSession,
      },
    ];

    for (const current of configurations) {
      const harness = dependencyHarness();
      const capture = invoke(
        {
          ...harness.dependencies,
          session: current.build(harness) as NonNullable<
            PrivateEarlyAccessPaymentOptionsRouteDependencies["session"]
          >,
        },
        requestInput(issueToken()),
      );
      expect(capture.statusCode, current.name).toBe(503);
      expect(capture.body, current.name).toEqual({
        ok: false,
        code: "private_access_unavailable",
      });
      expect(harness.paymentNow, current.name).not.toHaveBeenCalled();
      expect(harness.resolveEnabledMethod, current.name).not.toHaveBeenCalled();
      expectPrivate(capture);
    }
    expect(accessorRead).not.toHaveBeenCalled();
  });

  it("returns one fixed 503 for missing or invalid injected configuration with zero registry access", () => {
    const cases: Array<{
      name: string;
      alter: (
        harness: DependencyHarness,
      ) => PrivateEarlyAccessPaymentOptionsRouteDependencies;
    }> = [
      {
        name: "missing session",
        alter: (harness) => ({ ...harness.dependencies, session: null }),
      },
      {
        name: "weak secret",
        alter: (harness) => ({
          ...harness.dependencies,
          session: { ...harness.dependencies.session!, sessionSecret: "weak" },
        }),
      },
      {
        name: "invalid nonce",
        alter: (harness) => ({
          ...harness.dependencies,
          session: {
            ...harness.dependencies.session!,
            expectedNonce: "not-a-nonce",
          },
        }),
      },
      {
        name: "invalid replay snapshot",
        alter: (harness) => ({
          ...harness.dependencies,
          session: {
            ...harness.dependencies.session!,
            consumedNonces: ["invalid"],
          },
        }),
      },
      {
        name: "throwing session clock",
        alter: (harness) => ({
          ...harness.dependencies,
          session: {
            ...harness.dependencies.session!,
            now: () => {
              throw new Error(PRIVATE_SENTINEL);
            },
          },
        }),
      },
      {
        name: "missing method registry",
        alter: (harness) => ({
          ...harness.dependencies,
          methodRegistry: null as unknown as ManualPaymentMethodRegistryPort,
        }),
      },
      {
        name: "missing payment clock",
        alter: (harness) => ({
          ...harness.dependencies,
          paymentClock: null as unknown as ManualPaymentClockPort,
        }),
      },
    ];

    for (const current of cases) {
      const harness = dependencyHarness();
      const capture = invoke(
        current.alter(harness),
        requestInput(issueToken()),
      );
      expect(capture.statusCode, current.name).toBe(503);
      expect(capture.body, current.name).toEqual({
        ok: false,
        code: "private_access_unavailable",
      });
      expect(harness.paymentNow, current.name).not.toHaveBeenCalled();
      expect(harness.resolveEnabledMethod, current.name).not.toHaveBeenCalled();
      expect(JSON.stringify(capture.body), current.name).not.toContain(
        PRIVATE_SENTINEL,
      );
      expectPrivate(capture);
    }
  });

  it.each([
    undefined,
    null,
    false,
    {},
    [],
    "",
    " padded-token",
    "padded-token ",
    "x".repeat(1_025),
  ])(
    "returns one generic 401 for an absent or malformed explicit token",
    (sessionToken) => {
      const harness = dependencyHarness();
      const capture = invoke(harness.dependencies, requestInput(sessionToken));

      expect(capture.statusCode).toBe(401);
      expect(capture.body).toEqual({
        ok: false,
        code: "private_access_required",
      });
      expect(harness.paymentNow).not.toHaveBeenCalled();
      expect(harness.resolveEnabledMethod).not.toHaveBeenCalled();
      expectPrivate(capture);
    },
  );

  it("refuses invalid, expired, future, wrong-nonce, replayed, and wrong-secret sessions without registry reads", () => {
    const cases: Array<{
      name: string;
      token: string;
      session: Partial<
        NonNullable<
          PrivateEarlyAccessPaymentOptionsRouteDependencies["session"]
        >
      >;
    }> = [
      { name: "invalid", token: "xpa1.bad.bad", session: {} },
      {
        name: "expired",
        token: issueToken(),
        session: {
          now: () => ISSUED_AT_MS + PRIVATE_ACCESS_SESSION_TTL_SECONDS * 1_000,
        },
      },
      {
        name: "not yet valid",
        token: issueToken(),
        session: { now: () => ISSUED_AT_MS - 31_000 },
      },
      {
        name: "wrong nonce",
        token: issueToken(),
        session: { expectedNonce: OTHER_NONCE },
      },
      {
        name: "replayed",
        token: issueToken(),
        session: { consumedNonces: [EXPECTED_NONCE] },
      },
      {
        name: "wrong secret",
        token: issueToken({ sessionSecret: OTHER_SESSION_SECRET }),
        session: {},
      },
    ];

    for (const current of cases) {
      const harness = dependencyHarness();
      const dependencies = {
        ...harness.dependencies,
        session: {
          ...harness.dependencies.session!,
          ...current.session,
        },
      };
      const capture = invoke(dependencies, requestInput(current.token));
      expect(capture.statusCode, current.name).toBe(401);
      expect(capture.body, current.name).toEqual({
        ok: false,
        code: "private_access_required",
      });
      expect(harness.paymentNow, current.name).not.toHaveBeenCalled();
      expect(harness.resolveEnabledMethod, current.name).not.toHaveBeenCalled();
      expectPrivate(capture);
    }
  });

  it("fails the whole response closed when the protected adapter is unresolved", () => {
    const harness = dependencyHarness(({ method }) => {
      if (method === "paypal") throw new Error(PRIVATE_SENTINEL);
      return snapshot(method);
    });
    const capture = invoke(harness.dependencies, requestInput(issueToken()));

    expect(capture.statusCode).toBe(503);
    expect(capture.body).toEqual({
      ok: false,
      code: "private_access_unavailable",
    });
    expect(harness.paymentNow).toHaveBeenCalledTimes(1);
    expect(harness.resolveEnabledMethod).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(capture.body)).not.toContain(PRIVATE_SENTINEL);
    expect(JSON.stringify(capture.body)).not.toContain("zelle");
    expectPrivate(capture);
  });

  it("maps invalid and throwing payment clocks to the same fixed 503 with zero registry reads", () => {
    const cases = [
      vi.fn(() => "2026-08-04T09:05:00Z"),
      vi.fn(() => {
        throw new Error(PRIVATE_SENTINEL);
      }),
    ];
    for (const clockNow of cases) {
      const harness = dependencyHarness();
      const capture = invoke(
        {
          ...harness.dependencies,
          paymentClock: { now: clockNow },
        },
        requestInput(issueToken()),
      );
      expect(capture.statusCode).toBe(503);
      expect(capture.body).toEqual({
        ok: false,
        code: "private_access_unavailable",
      });
      expect(clockNow).toHaveBeenCalledTimes(1);
      expect(harness.resolveEnabledMethod).not.toHaveBeenCalled();
      expect(JSON.stringify(capture.body)).not.toContain(PRIVATE_SENTINEL);
      expectPrivate(capture);
    }
  });

  it("accepts a canonical subset only and never projects protected snapshot fields", () => {
    const available = new Set<ManualOrderPaymentMethod>([
      "other",
      "cash_app",
      "zelle",
    ]);
    const harness = dependencyHarness(({ method }) =>
      available.has(method) ? snapshot(method) : null,
    );
    const capture = invoke(harness.dependencies, requestInput(issueToken()));

    expect(capture.statusCode).toBe(200);
    expect(capture.body).toEqual({
      state: "resolved",
      codes: ["zelle", "cash_app", "other"],
    });
    expect(JSON.stringify(capture.body)).not.toMatch(
      /configuration|instruction|approval|verification|enablement|recipient|account|routing|price|sentinel/i,
    );
    expectPrivate(capture);
  });

  it("re-verifies the session and re-evaluates registry revocation on every request", () => {
    let registryRead = 0;
    const harness = dependencyHarness(({ method }) => {
      const pass = Math.floor(registryRead / 7);
      registryRead += 1;
      return pass === 0 ? snapshot(method) : null;
    });
    const route = createPrivateEarlyAccessPaymentOptionsRoute(
      harness.dependencies,
    );
    const first = responseCapture();
    const second = responseCapture();
    const input = requestInput(issueToken());

    route(input, first.port);
    route(input, second.port);

    expect(first.statusCode).toBe(200);
    expect(first.body).toEqual({
      state: "resolved",
      codes: EARLY_ACCESS_PAYMENT_OPTION_CODES,
    });
    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual({ state: "resolved", codes: [] });
    expect(first.body).not.toBe(second.body);
    expect(harness.sessionNow).toHaveBeenCalledTimes(2);
    expect(harness.paymentNow).toHaveBeenCalledTimes(2);
    expect(harness.resolveEnabledMethod).toHaveBeenCalledTimes(14);
    expectPrivate(first);
    expectPrivate(second);
  });

  it("keeps the containment core free of ambient credentials, environment, network, and Research-wall reads", () => {
    const source = readFileSync(
      path.join(HERE, "private-access-route.ts"),
      "utf8",
    );
    expect(source).not.toContain("process.env");
    expect(source).not.toMatch(/from ["']express["']/);
    expect(source).not.toMatch(/\.headers\b|\.cookies?\b|\.query\b|\.body\b/);
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|sendBeacon/);
    expect(source).not.toMatch(/app\.(?:use|get|post|all)\s*\(/);
    expect(source).not.toMatch(/registerResearchApi|registerLegacyResearch/);
    expect(source).not.toMatch(
      /xr_access|verifyPrivateAccessPassword|issuePrivateAccessSession/,
    );

    expect(
      readFileSync(path.join(HERE, "..", "index.ts"), "utf8"),
    ).not.toContain("private-access-route");
    const productionSource = readFileSync(
      path.join(HERE, "..", "..", "index.ts"),
      "utf8",
    );
    expect(productionSource).toContain(
      "createPrivateEarlyAccessPaymentOptionsContainmentMiddleware",
    );
    expect(
      productionSource.match(
        /app\.use\(createPrivateEarlyAccessPaymentOptionsContainmentMiddleware\(\)\);/g,
      ) ?? [],
    ).toHaveLength(1);
    expect(
      createPrivateEarlyAccessPaymentOptionsContainmentMiddleware,
    ).toBeTypeOf("function");
  });
});
