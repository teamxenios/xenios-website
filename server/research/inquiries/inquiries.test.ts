import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESEARCH_INQUIRY_API_PATH,
  researchInquiryRequestSchema,
} from "@shared/research/inquiries";
import { registerResearchApi } from "../index";
import { isCareManualAccessOperationsRow } from "../../care/manual-access-classifier";
import type { LoiRow } from "../../supabase-store";
import { isPublicInquiryOperationsRow, parsePublicInquiryPayload } from "./classifier";
import { persistInquiryWithLoiStore } from "./production";
import { registerResearchInquiryApi } from "./routes";
import {
  buildDurableInquiryRecord,
  deterministicInquiryId,
  normalizeResearchInquiry,
  researchInquiryContentHash,
  type ResearchInquiryDependencies,
} from "./service";

const NOW = new Date("2026-09-26T18:00:00.000Z");
const PRACTICE_REQUEST = {
  inquiryType: "practice" as const,
  fullName: "  Stephen   Rivera ",
  email: " STEPHEN@EXAMPLE.COM ",
  phone: "+1 (555) 555-0101",
  organizationName: "Rivera Wellness",
  organizationKind: "Wellness practice",
  role: "Owner",
  region: "Texas",
  interest: "refer_clients" as const,
  message: "We would like to learn more.",
};

function dependencies(
  overrides: Partial<ResearchInquiryDependencies> = {},
): ResearchInquiryDependencies {
  return {
    persistenceReady: () => true,
    allowRequest: vi.fn(async () => true),
    verifyHuman: vi.fn(async () => true),
    persist: vi.fn(async (record) => ({
      id: record.id,
      createdAt: NOW.toISOString(),
      replayed: false,
    })),
    notify: vi.fn(async () => ({ customer: "queued", operator: "queued" })),
    now: () => NOW,
    ...overrides,
  };
}

function appFor(deps: ResearchInquiryDependencies) {
  const app = express();
  app.use(express.json());
  registerResearchInquiryApi(app, deps);
  return app;
}

function rowFor(
  record: ReturnType<typeof buildDurableInquiryRecord>,
): LoiRow {
  return {
    ...record,
    email_status: null,
    created_at: NOW.toISOString(),
  };
}

describe("public Research inquiry contract", () => {
  it.each([
    ["practice", PRACTICE_REQUEST],
    ["partner_interest", { inquiryType: "partner_interest", fullName: "Partner Person", email: "partner@example.com", interest: "partner_program", message: "Please tell me about the partner program." }],
    ["strategic", { inquiryType: "strategic", fullName: "Strategy Person", email: "strategy@example.com", organizationName: "Example Labs", interest: "strategic_partnership", message: "We would like to discuss a strategic relationship." }],
    ["supplier", { inquiryType: "supplier", fullName: "Supplier Person", email: "supplier@example.com", organizationName: "Example Supply", organizationKind: "Laboratory", region: "Texas", interest: "supplier_relationship", documentationAvailable: true, message: "Documentation is available for review." }],
    ["career_interest", { inquiryType: "career_interest", fullName: "Career Person", email: "career@example.com", interest: "general_interest", message: "I would like to help build Xenios." }],
  ] as const)("accepts the bounded %s payload shape", (_type, payload) => {
    expect(researchInquiryRequestSchema.safeParse(payload).success).toBe(true);
  });

  it("enforces type-specific required fields and rejects unknown input", () => {
    const missing = researchInquiryRequestSchema.safeParse({
      inquiryType: "practice",
      fullName: "Stephen Rivera",
      email: "stephen@example.com",
      message: "Hello",
    });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.flatten().fieldErrors).toMatchObject({
        organizationName: expect.any(Array),
        organizationKind: expect.any(Array),
        role: expect.any(Array),
        region: expect.any(Array),
        interest: expect.any(Array),
      });
    }

    expect(
      researchInquiryRequestSchema.safeParse({
        ...PRACTICE_REQUEST,
        authoritativeOwner: "attacker",
      }).success,
    ).toBe(false);
  });

  it("normalizes equivalent content to one deterministic UUID and non-Care row", () => {
    const first = researchInquiryRequestSchema.parse(PRACTICE_REQUEST);
    const second = researchInquiryRequestSchema.parse({
      ...PRACTICE_REQUEST,
      fullName: "Stephen Rivera",
      email: "stephen@example.com",
    });
    const firstNormalized = normalizeResearchInquiry(first);
    const secondNormalized = normalizeResearchInquiry(second);
    const firstHash = researchInquiryContentHash(firstNormalized);
    const secondHash = researchInquiryContentHash(secondNormalized);

    expect(firstHash).toBe(secondHash);
    expect(deterministicInquiryId(firstHash)).toBe(deterministicInquiryId(secondHash));
    expect(deterministicInquiryId(firstHash)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );

    const record = buildDurableInquiryRecord(first, {
      ip: "203.0.113.10",
      recordedAt: NOW.toISOString(),
    });
    expect(record.status).toBe("New");
    expect(record.business_name).toBe("Xenios public inquiry");
    expect(record.role).toBe("xenios_inquiry:practice");
    expect(isPublicInquiryOperationsRow(record)).toBe(true);
    expect(isCareManualAccessOperationsRow(record as LoiRow)).toBe(false);
    expect(parsePublicInquiryPayload(record.why_interested)).toMatchObject({
      schema: "xenios_public_inquiry_v1",
      classifier: "xenios_non_care_public_inquiry",
      inquiryType: "practice",
      contentHash: firstHash,
      notification: { customer: "outbox_pending", operator: "outbox_pending" },
    });
  });

  it("persists a deterministic primary key and resolves duplicate-conflict replay", async () => {
    const record = buildDurableInquiryRecord(
      researchInquiryRequestSchema.parse(PRACTICE_REQUEST),
      { ip: "203.0.113.10", recordedAt: NOW.toISOString() },
    );
    const durableRow = rowFor(record);
    const insert = vi.fn(async () => durableRow);
    const list = vi.fn(async () => [durableRow]);

    await expect(persistInquiryWithLoiStore(record, { insert, list })).resolves.toEqual({
      id: record.id,
      createdAt: NOW.toISOString(),
      replayed: false,
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      id: record.id,
      status: "New",
    }));
    expect(list).not.toHaveBeenCalled();

    insert.mockRejectedValueOnce(new Error("duplicate key"));
    await expect(persistInquiryWithLoiStore(record, { insert, list })).resolves.toEqual({
      id: record.id,
      createdAt: NOW.toISOString(),
      replayed: true,
    });
    expect(list).toHaveBeenCalledOnce();
  });

  it("fails closed when a deterministic-id conflict is not the same inquiry", async () => {
    const record = buildDurableInquiryRecord(
      researchInquiryRequestSchema.parse(PRACTICE_REQUEST),
      { ip: "203.0.113.10", recordedAt: NOW.toISOString() },
    );
    const collision = {
      ...rowFor(record),
      role: "care_access:new_care_request",
      business_name: "Xenios Care access request",
      why_interested: JSON.stringify({ schema: "xenios_care_manual_access_v1" }),
    };
    const duplicate = new Error("duplicate key");
    await expect(
      persistInquiryWithLoiStore(record, {
        insert: vi.fn(async () => {
          throw duplicate;
        }),
        list: vi.fn(async () => [collision]),
      }),
    ).rejects.toBe(duplicate);
  });

  it("does not invent a receipt when a duplicate cannot be reconciled after a lost acknowledgement", async () => {
    const record = buildDurableInquiryRecord(
      researchInquiryRequestSchema.parse(PRACTICE_REQUEST),
      { ip: "203.0.113.10", recordedAt: NOW.toISOString() },
    );
    const lostAcknowledgement = new Error("duplicate key after acknowledgement loss");
    await expect(persistInquiryWithLoiStore(record, {
      insert: vi.fn(async () => { throw lostAcknowledgement; }),
      list: vi.fn(async () => []),
    })).rejects.toBe(lostAcknowledgement);
  });
});

describe("public Research inquiry route", () => {
  it.each([
    ["practice", PRACTICE_REQUEST],
    ["partner_interest", { inquiryType: "partner_interest", fullName: "Partner Person", email: "partner@example.com", interest: "partner_program", message: "Please tell me about the partner program." }],
    ["strategic", { inquiryType: "strategic", fullName: "Strategy Person", email: "strategy@example.com", organizationName: "Example Labs", interest: "strategic_partnership", message: "We would like to discuss a strategic relationship." }],
    ["supplier", { inquiryType: "supplier", fullName: "Supplier Person", email: "supplier@example.com", organizationName: "Example Supply", organizationKind: "Laboratory", region: "Texas", interest: "supplier_relationship", documentationAvailable: true, message: "Documentation is available for review." }],
    ["career_interest", { inquiryType: "career_interest", fullName: "Career Person", email: "career@example.com", interest: "general_interest", message: "I would like to help build Xenios." }],
  ] as const)("returns a durable %s receipt only after persistence", async (inquiryType, payload) => {
    const response = await request(appFor(dependencies()))
      .post(RESEARCH_INQUIRY_API_PATH)
      .send(payload)
      .expect(201);
    expect(response.body).toMatchObject({
      ok: true,
      accepted: true,
      inquiryType,
      status: "New",
      confirmationDelivery: "queued",
      reference: expect.stringMatching(/^INQ-[0-9A-F]{8}$/u),
    });
    expect(response.body).not.toHaveProperty("emailSent");
  });

  it("reports accepted only after durable persistence and makes delivery state explicit", async () => {
    const events: string[] = [];
    const deps = dependencies({
      persist: vi.fn(async (record) => {
        await Promise.resolve();
        events.push("persisted");
        return { id: record.id, createdAt: NOW.toISOString(), replayed: false };
      }),
      notify: vi.fn(async () => {
        events.push("notified");
        return { customer: "queued", operator: "queued" };
      }),
    });
    const response = await request(appFor(deps))
      .post(RESEARCH_INQUIRY_API_PATH)
      .set("X-Forwarded-For", "198.51.100.15")
      .send(PRACTICE_REQUEST)
      .expect(201);
    events.push("responded");

    expect(events).toEqual(["persisted", "notified", "responded"]);
    expect(response.body).toMatchObject({
      ok: true,
      accepted: true,
      replayed: false,
      reference: expect.stringMatching(/^INQ-[0-9A-F]{8}$/u),
      status: "New",
      inquiryType: "practice",
      confirmationDelivery: "queued",
    });
    expect(response.body.confirmation).toContain("doesn't create an account");
    expect(response.body.confirmation).toContain("We don't promise a response time");
    expect(response.body).not.toHaveProperty("emailSent");
    expect(response.headers["cache-control"]).toBe("no-store, max-age=0");
  });

  it("keeps an accepted durable receipt truthful when notification enqueue is unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(appFor(dependencies({
      notify: vi.fn(async () => {
        throw new Error("outbox unavailable");
      }),
    })))
      .post(RESEARCH_INQUIRY_API_PATH)
      .send(PRACTICE_REQUEST)
      .expect(201);

    expect(response.body).toMatchObject({
      accepted: true,
      reference: expect.stringMatching(/^INQ-[0-9A-F]{8}$/u),
      confirmationDelivery: "not_queued",
    });
    expect(error).toHaveBeenCalledWith(
      "[public-inquiry] notification enqueue unavailable after durable acceptance",
    );
  });

  it("returns a 200 replay with the same deterministic reference", async () => {
    const seen: string[] = [];
    const deps = dependencies({
      persist: vi.fn(async (record) => {
        seen.push(record.id);
        return { id: record.id, createdAt: NOW.toISOString(), replayed: seen.length > 1 };
      }),
    });
    const first = await request(appFor(deps))
      .post(RESEARCH_INQUIRY_API_PATH)
      .send(PRACTICE_REQUEST)
      .expect(201);
    const second = await request(appFor(deps))
      .post(RESEARCH_INQUIRY_API_PATH)
      .send(PRACTICE_REQUEST)
      .expect(200);

    expect(second.body.replayed).toBe(true);
    expect(second.body.reference).toBe(first.body.reference);
    expect(seen[1]).toBe(seen[0]);
  });

  it("separates validation, trap, human-check, rate-limit, and persistence failures", async () => {
    const invalid = await request(appFor(dependencies()))
      .post(RESEARCH_INQUIRY_API_PATH)
      .send({ inquiryType: "practice", fullName: "S", email: "bad" })
      .expect(400);
    expect(invalid.body.code).toBe("invalid_inquiry");

    const trappedDependencies = dependencies();
    const trapped = await request(appFor(trappedDependencies))
      .post(RESEARCH_INQUIRY_API_PATH)
      .send({ ...PRACTICE_REQUEST, website: "https://bot.example" })
      .expect(422);
    expect(trapped.body.code).toBe("inquiry_not_submitted");
    expect(trappedDependencies.persist).not.toHaveBeenCalled();

    const unverified = await request(appFor(dependencies({
      verifyHuman: vi.fn(async () => false),
    })))
      .post(RESEARCH_INQUIRY_API_PATH)
      .send(PRACTICE_REQUEST)
      .expect(400);
    expect(unverified.body.code).toBe("inquiry_verification_failed");

    const limited = await request(appFor(dependencies({
      allowRequest: vi.fn(async () => false),
    })))
      .post(RESEARCH_INQUIRY_API_PATH)
      .send(PRACTICE_REQUEST)
      .expect(429);
    expect(limited.body.code).toBe("inquiry_rate_limited");

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const uncertain = await request(appFor(dependencies({
      persist: vi.fn(async () => {
        throw new Error("write acknowledgement unavailable");
      }),
    })))
      .post(RESEARCH_INQUIRY_API_PATH)
      .send(PRACTICE_REQUEST)
      .expect(503);
    expect(uncertain.body.code).toBe("inquiry_temporarily_unavailable");
    expect(uncertain.body).not.toHaveProperty("reference");
  });
});

describe("production route ordering", () => {
  const prior = {
    password: process.env.RESEARCH_ACCESS_PASSWORD,
    secret: process.env.RESEARCH_SESSION_SECRET,
    publicMode: process.env.RESEARCH_PUBLIC,
  };

  beforeEach(() => {
    process.env.RESEARCH_ACCESS_PASSWORD = "wall-password";
    process.env.RESEARCH_SESSION_SECRET = "wall-session-secret";
    delete process.env.RESEARCH_PUBLIC;
  });

  afterEach(() => {
    if (prior.password === undefined) delete process.env.RESEARCH_ACCESS_PASSWORD;
    else process.env.RESEARCH_ACCESS_PASSWORD = prior.password;
    if (prior.secret === undefined) delete process.env.RESEARCH_SESSION_SECRET;
    else process.env.RESEARCH_SESSION_SECRET = prior.secret;
    if (prior.publicMode === undefined) delete process.env.RESEARCH_PUBLIC;
    else process.env.RESEARCH_PUBLIC = prior.publicMode;
    vi.restoreAllMocks();
  });

  it("admits only the exact anonymous inquiry POST ahead of the unchanged Research wall", async () => {
    const app = express();
    app.use(express.json());
    registerResearchInquiryApi(app, dependencies());
    registerResearchApi(app);

    await request(app)
      .post(RESEARCH_INQUIRY_API_PATH)
      .send(PRACTICE_REQUEST)
      .expect(201);
    await request(app)
      .get("/api/research/catalog")
      .expect(401, { ok: false, message: "Access required." });
    await request(app)
      .post("/api/research/inquiries/lookalike")
      .send(PRACTICE_REQUEST)
      .expect(401, { ok: false, message: "Access required." });
  });

  it("mounts the production inquiry registrar before the legacy Research registrar", () => {
    const source = readFileSync(new URL("../../index.ts", import.meta.url), "utf8");
    const inquiry = source.indexOf(
      "registerResearchInquiryApi(app, buildProductionResearchInquiryDependencies());",
    );
    const wall = source.indexOf("registerResearchApi(app);");
    expect(inquiry).toBeGreaterThan(-1);
    expect(wall).toBeGreaterThan(inquiry);
    expect(
      source.match(
        /registerResearchInquiryApi\(app, buildProductionResearchInquiryDependencies\(\)\);/gu,
      ) ?? [],
    ).toHaveLength(1);
  });
});
