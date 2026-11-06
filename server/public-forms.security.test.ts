// LIVE-1 synthetic safety regressions against the real routes and verifier.
// Derived from the disclosed Claude-authored LIVE1_ACCEPTANCE.md drafts.
// Real verifier and real route handlers; provider, storage and email are mocked.
import { createServer } from "node:http";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoiInput, WaitlistInput } from "./supabase-store";

const emails = vi.hoisted(() => ({
  sendConfirmationEmail: vi.fn(async () => undefined),
  sendInternalNotification: vi.fn(async () => undefined),
  sendContactMessage: vi.fn(async () => undefined),
  sendContactAutoReply: vi.fn(async () => undefined),
  sendWaitlistConfirmationV3: vi.fn(async () => true),
  sendWaitlistInternalAlertV3: vi.fn(async () => undefined),
  sendLoiConfirmationV3: vi.fn(async () => true),
  sendLoiInternalAlertV3: vi.fn(async () => undefined),
}));
vi.mock("./services/email", () => emails);

const store = vi.hoisted(() => ({
  upsertWaitlist: vi.fn(async (input: WaitlistInput) => ({
    id: "11111111-1111-4111-8111-111111111111",
    ...input,
  })),
  insertLoi: vi.fn(async (input: LoiInput) => ({
    id: "22222222-2222-4222-8222-222222222222",
    ...input,
  })),
  setWaitlistEmailStatus: vi.fn(async () => undefined),
  setLoiEmailStatus: vi.fn(async () => undefined),
  getDisplayCount: vi.fn(async () => 556),
}));
vi.mock("./supabase-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supabase-store")>()),
  ...store,
}));
vi.mock("./supabase", () => ({
  supabaseConfigured: () => true,
  getSupabaseAnon: () => {
    throw new Error("Unexpected database access in synthetic test");
  },
  getSupabaseAdmin: () => {
    throw new Error("Unexpected database access in synthetic test");
  },
}));

const legacy = vi.hoisted(() => ({
  storage: {
    ensureCounterSeeded: vi.fn(async () => undefined),
    getCounterTotal: vi.fn(async () => 556),
    findWaitlistByEmail: vi.fn(async () => null),
    getAllWaitlist: vi.fn(async () => []),
    createWaitlist: vi.fn(async (submission: Record<string, unknown>) => ({
      signup: { ...submission, position: 557 },
      totalCount: 557,
    })),
  },
}));
vi.mock("./storage", () => legacy);

import { registerRoutes } from "./routes";
import { requestIp } from "./research/rate-limit";
import { verifyTurnstile } from "./turnstile";

const SECRET = "synthetic-turnstile-secret-never-real";
const TOKEN = "synthetic-turnstile-token-never-real";
const EDGE = "192.0.2.254";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const network = vi.fn<typeof fetch>();
let clock = Date.UTC(2026, 9, 29);
let clientNumber = 1;

const uniqueClient = () => `198.51.100.${clientNumber++}`;
const chain = (client: string, prefix?: string) =>
  [prefix, client, EDGE].filter(Boolean).join(", ");

const contact = {
  name: "Jordan Test",
  email: "jordan@example.test",
  persona: "other",
  subject: "Synthetic acceptance",
  message: "A synthetic message longer than twenty characters.",
};
const quick = {
  name: "Jordan Test",
  email: "jordan@example.test",
  role: "Coach",
  consent: true,
  turnstileToken: TOKEN,
};
const loi = {
  name: "Jordan Test",
  email: "jordan@example.test",
  businessName: "Synthetic Studio",
  role: "Owner",
  nonbindingAck: true,
  turnstileToken: TOKEN,
};
const waitlist = {
  firstName: "Jordan",
  lastName: "Test",
  email: "jordan@example.test",
  practitionerType: "personal_trainers",
  city: "Austin",
  country: "US",
};
const forms: Array<[string, Record<string, unknown>]> = [
  ["/api/waitlist", waitlist],
  ["/api/waitlist/quick", quick],
  ["/api/early-interest", loi],
  ["/api/contact", contact],
];

const effects = [
  ...Object.values(emails),
  store.upsertWaitlist,
  store.insertLoi,
  store.setWaitlistEmailStatus,
  store.setLoiEmailStatus,
  legacy.storage.createWaitlist,
];
const effectCounts = () => effects.map((mock) => mock.mock.calls.length);
const expectNoEffects = () => {
  for (const mock of effects) expect(mock).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
  // The real limiter is module-scoped. Advance past its window between cases
  // without adding a production reset API or relying on test execution order.
  clock += 11 * 60_000;
  vi.spyOn(Date, "now").mockReturnValue(clock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  network.mockReset();
  network.mockRejectedValue(new Error("Unexpected external verification"));
  vi.stubGlobal("fetch", network);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function siteverify(success: boolean) {
  network.mockImplementation(async () => new Response(
    JSON.stringify({ success }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));
}

function expectVerification(ip: string, token = TOKEN) {
  expect(network).toHaveBeenCalledTimes(1);
  const [url, init] = network.mock.calls[0];
  expect(url).toBe(SITEVERIFY);
  expect(init?.method).toBe("POST");
  expect(init?.body).toBeInstanceOf(URLSearchParams);
  const body = init!.body as URLSearchParams;
  expect(body.get("secret")).toBe(SECRET);
  expect(body.get("response")).toBe(token);
  expect(body.get("remoteip")).toBe(ip);
}

async function buildApp() {
  const app = express();
  app.set("trust proxy", 2);
  app.use(express.json());
  await registerRoutes(createServer(app), app);
  return app;
}

describe("LIVE-1 verifier", () => {
  it("refuses absent production configuration without an outbound call", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);
    await expect(verifyTurnstile(TOKEN, "203.0.113.7")).resolves.toBe(false);
    await expect(verifyTurnstile(undefined, "203.0.113.7")).resolves.toBe(false);
    expect(network).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().map(String).join("\n")).not.toContain(TOKEN);
  });

  it.each(["test", "development", undefined])(
    "preserves the documented missing-secret behavior for NODE_ENV=%s",
    async (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);
      await expect(verifyTurnstile(undefined, null)).resolves.toBe(true);
      expect(network).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, ""])("refuses missing token %s locally", async (token) => {
    await expect(verifyTurnstile(token, "203.0.113.7")).resolves.toBe(false);
    expect(network).not.toHaveBeenCalled();
  });

  it.each([true, false])("uses the provider result %s", async (success) => {
    siteverify(success);
    await expect(verifyTurnstile(TOKEN, "203.0.113.7")).resolves.toBe(success);
    expectVerification("203.0.113.7");
  });

  it("refuses transport errors without logging request material", async () => {
    network.mockRejectedValueOnce(new Error(`${SECRET} ${TOKEN}`));
    await expect(verifyTurnstile(TOKEN, "203.0.113.7")).resolves.toBe(false);
    expect(network).toHaveBeenCalledTimes(1);
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join("\n");
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(TOKEN);
  });
});

describe("LIVE-1 public form configuration boundary", () => {
  it.each(forms)("%s refuses missing production configuration before effects", async (path, body) => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);
    const app = await buildApp();
    const response = await request(app).post(path)
      .set("X-Forwarded-For", chain(uniqueClient()))
      .send(body);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      message: "This form is temporarily unavailable. Please try again shortly.",
    });
    expectNoEffects();
    expect(network).not.toHaveBeenCalled();
  });

  it.each(forms)("%s keeps the honeypot ahead of configuration and effects", async (path, body) => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);
    const app = await buildApp();
    const response = await request(app).post(path)
      .set("X-Forwarded-For", chain(uniqueClient()))
      .send({ ...body, website: "https://bot.example.invalid" });
    expect(response.status).toBe(200);
    expectNoEffects();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([forms[1], forms[2]])("%s retains an exact 400 for a missing token", async (path, body) => {
    const { turnstileToken: _token, ...withoutToken } = body;
    const app = await buildApp();
    const response = await request(app).post(path)
      .set("X-Forwarded-For", chain(uniqueClient()))
      .send(withoutToken);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "Verification failed. Please try again.",
    });
    expectNoEffects();
    expect(network).not.toHaveBeenCalled();
  });
});

describe("LIVE-1 contact courtesy reply", () => {
  it.each(["missing", "rejected", "transport"] as const)(
    "keeps team delivery but withholds the courtesy reply on %s verification",
    async (failure) => {
      if (failure === "rejected") siteverify(false);
      const app = await buildApp();
      const response = await request(app).post("/api/contact")
        .set("X-Forwarded-For", chain(uniqueClient()))
        .send(failure === "missing" ? contact : { ...contact, turnstileToken: TOKEN });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: "We have it." });
      expect(emails.sendContactMessage).toHaveBeenCalledTimes(1);
      expect(emails.sendContactAutoReply).not.toHaveBeenCalled();
      expect(network).toHaveBeenCalledTimes(failure === "missing" ? 0 : 1);
    },
  );

  it("sends both only after verification and forwards the trusted IP", async () => {
    siteverify(true);
    const app = await buildApp();
    const client = uniqueClient();
    const response = await request(app).post("/api/contact")
      .set("X-Forwarded-For", chain(client, "10.90.0.1"))
      .send({ ...contact, turnstileToken: TOKEN });
    expect(response.status).toBe(200);
    expect(emails.sendContactMessage).toHaveBeenCalledTimes(1);
    expect(emails.sendContactAutoReply).toHaveBeenCalledTimes(1);
    expectVerification(client); // Unconditional; absence of verification fails.
  });

  it("preserves both synthetic sends outside production without a secret", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);
    const app = await buildApp();
    const response = await request(app).post("/api/contact")
      .set("X-Forwarded-For", chain(uniqueClient()))
      .send(contact);
    expect(response.status).toBe(200);
    expect(emails.sendContactMessage).toHaveBeenCalledTimes(1);
    expect(emails.sendContactAutoReply).toHaveBeenCalledTimes(1);
    expect(network).not.toHaveBeenCalled();
  });
});

describe("LIVE-1 proxy-trusted rate-limit identity", () => {
  it("models the existing two-hop deployment and its three-hop hazard", async () => {
    const client = "203.0.113.7";
    const prefix = "10.9.9.9";
    for (const [hops, spoof, expected] of [
      [2, true, client],
      [2, false, client],
      [3, true, prefix],
    ] as const) {
      const app = express();
      app.set("trust proxy", hops);
      app.get("/ip", (req, res) => res.json({ ip: req.ip, helper: requestIp(req) }));
      const response = await request(app).get("/ip")
        .set("X-Forwarded-For", chain(client, spoof ? prefix : undefined));
      expect(response.body).toEqual({ ip: expected, helper: expected });
    }
  });

  it("shares one five-hit budget across all four forms despite changing prefixes", async () => {
    siteverify(true);
    const app = await buildApp();
    const client = uniqueClient();
    const sequence = [forms[0], forms[1], forms[2], forms[3], forms[3]];
    for (const [index, [path, body]] of sequence.entries()) {
      const response = await request(app).post(path)
        .set("X-Forwarded-For", chain(client, `10.10.0.${index + 1}`))
        .send(body);
      expect(response.status).toBe(200);
    }
    const before = effectCounts();
    const verificationCount = network.mock.calls.length;
    const sixth = await request(app).post("/api/early-interest")
      .set("X-Forwarded-For", chain(client, "10.10.0.99"))
      .send(loi);
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual({
      success: false,
      message: "Too many requests. Please try again in a few minutes.",
    });
    expect(effectCounts()).toEqual(before);
    expect(network).toHaveBeenCalledTimes(verificationCount);
  });

  it("does not share a bucket between genuine clients using the same prefix", async () => {
    const app = await buildApp();
    const clientA = uniqueClient();
    const clientB = uniqueClient();
    const submit = (client: string) => request(app).post("/api/contact")
      .set("X-Forwarded-For", chain(client, "10.200.0.1"))
      .send(contact);
    for (let index = 0; index < 5; index += 1) {
      expect((await submit(clientA)).status).toBe(200);
    }
    expect((await submit(clientA)).status).toBe(429);
    expect((await submit(clientB)).status).toBe(200);
  });

  it.each([
    ["/api/waitlist/quick", quick, "upsertWaitlist"],
    ["/api/early-interest", loi, "insertLoi"],
  ] as const)("uses the same trusted identity for %s verification and storage", async (path, body, writer) => {
    siteverify(true);
    const app = await buildApp();
    const client = uniqueClient();
    const response = await request(app).post(path)
      .set("X-Forwarded-For", chain(client, "10.77.77.77"))
      .send(body);
    expect(response.status).toBe(200);
    expect(store[writer]).toHaveBeenCalledTimes(1);
    expect(store[writer].mock.calls[0][0].ip).toBe(client);
    expectVerification(client);
  });

  it("uses the socket identity without XFF and still enforces the budget", async () => {
    const app = await buildApp();
    app.get("/synthetic-identity", (req, res) => res.json({
      ip: requestIp(req),
      socket: req.socket.remoteAddress,
    }));
    const identity = await request(app).get("/synthetic-identity");
    expect(identity.body.ip).toBe(identity.body.socket);
    expect(typeof identity.body.ip).toBe("string");
    for (let index = 0; index < 5; index += 1) {
      expect((await request(app).post("/api/contact").send(contact)).status).toBe(200);
    }
    const before = effectCounts();
    expect((await request(app).post("/api/contact").send(contact)).status).toBe(429);
    expect(effectCounts()).toEqual(before);
    expect(network).not.toHaveBeenCalled();
  });
});
