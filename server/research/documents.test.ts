import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Document Center tests: A/B isolation on every surface, the storage path never
// leaving the server, the signed download door (expired, tampered, and
// valid-but-wrong-session all denied identically), version-checked idempotent
// acknowledgment, capability-off behavior that writes nothing, deterministic
// render checksums, and the privacy rule that the renderer only ever sees an
// opaque member reference. Supabase is an in-memory fake; member auth and the
// admin gate are mocked so identity and denial are chosen per test.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  documents: [] as any[],
  members: [] as any[],
}));

const auth = vi.hoisted(() => ({
  current: null as any,
  deny: null as { status: number; code: string } | null,
}));

const admin = vi.hoisted(() => ({ allow: true }));

vi.mock("../supabase", () => {
  function tableFor(name: string) {
    if (name === "research_plan_documents") return state.documents;
    if (name === "research_members") return state.members;
    throw new Error(`unexpected table in test: ${name}`);
  }
  function query(table: string) {
    const list = tableFor(table);
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    let isNullCol: string | null = null;
    let limitN: number | null = null;

    const matches = (r: any) =>
      filters.every(([c, v]) => r[c] === v) &&
      inFilters.every(([c, vs]) => vs.includes(r[c])) &&
      (isNullCol === null || r[isNullCol] === null);

    const finish = () => {
      if (mode === "insert") {
        // The unique (member_id, type, version) constraint.
        if (
          table === "research_plan_documents" &&
          list.some(
            (r: any) =>
              r.member_id === insertPayload.member_id &&
              r.type === insertPayload.type &&
              r.version === insertPayload.version,
          )
        ) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
        const row = { id: crypto.randomUUID(), ...insertPayload };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = list.filter(matches);
        if (!targets.length) return { data: null, error: null };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = list.filter(matches);
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      is: (c: string, v: any) => { if (v === null) isNullCol = c; return api; },
      in: (c: string, vs: any[]) => { inFilters.push([c, vs]); return api; },
      order: () => api,
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
        return { data: d, error: null };
      },
      single: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] : r.data;
        return d ? { data: d, error: null } : { data: null, error: r.error ?? { message: "not found" } };
      },
      then: (resolve: any) => resolve(finish()),
    };
    return api;
  }
  return {
    supabaseConfigured: () => true,
    getSupabaseAdmin: () => ({ from: query }),
    getSupabaseAnon: () => { throw new Error("not used in tests"); },
  };
});

vi.mock("./member-auth", () => ({
  requireActiveMember: (req: any, res: any, next: any) => {
    if (auth.deny) return res.status(auth.deny.status).json({ ok: false, code: auth.deny.code });
    req.researchMember = auth.current;
    next();
  },
  requireMember: (req: any, res: any, next: any) => {
    if (auth.deny) return res.status(auth.deny.status).json({ ok: false, code: auth.deny.code });
    req.researchMember = auth.current;
    next();
  },
}));

vi.mock("../routes", () => ({
  requireSupabaseAdmin: (req: any, res: any, next: any) => {
    if (!admin.allow) return res.status(403).json({ ok: false, code: "admin_required" });
    req.adminEmail = "admin@example.com";
    next();
  },
}));

// The capability gate is NOT mocked: these are the real environment inputs the
// registry reads, so the enabled and disabled paths are both genuine.
//
// process.env is shared by every test file that runs in the same worker, so the
// originals are snapshotted here and restored in afterAll. Without that,
// enabling private media for this suite silently changes provider selection in
// another suite that runs after it, and the failure surfaces far from its
// cause.
const ENV_KEYS = [
  "NODE_ENV",
  "RESEARCH_SESSION_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEARCH_MEDIA_BUCKET",
  "RESEARCH_DOCUMENT_RENDERING_ENABLED",
  "RESEARCH_PRIVATE_MEDIA_ENABLED",
] as const;

const ORIGINAL_ENV: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) ORIGINAL_ENV[key] = process.env[key];

process.env.NODE_ENV = "test";
process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-vitest";
process.env.RESEARCH_MEDIA_BUCKET = "research-private-media";
process.env.RESEARCH_DOCUMENT_RENDERING_ENABLED = "true";
process.env.RESEARCH_PRIVATE_MEDIA_ENABLED = "true";

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
  clearMemoryDocumentBytes();
});

import {
  clearMemoryDocumentBytes,
  DOCUMENT_GRANT_TTL_MS,
  registerDocumentsApi,
  signDocumentGrant,
} from "./documents";
import {
  DisabledDocumentRenderer,
  selectDocumentRenderer,
  TestDocumentRenderer,
  type RenderInput,
} from "./document-renderer";
import type { MemberPlatformDeps } from "./member-platform-deps";

const T0 = Date.parse("2026-07-10T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

let nowMs = T0;
let notifications: any[] = [];

function makeDeps(): MemberPlatformDeps {
  return {
    clock: { now: () => new Date(nowMs) },
    notifier: {
      notify: vi.fn(async (input: any) => {
        notifications.push(input);
        return true;
      }),
    },
  };
}

let deps: MemberPlatformDeps;

function makeApp() {
  const app = express();
  app.use(express.json());
  registerDocumentsApi(app, deps);
  return app;
}

const MEMBER_A = {
  id: "00000000-0000-4000-8000-0000000doca0",
  application_id: "app-a",
  auth_user_id: "auth-a",
  email: "ava@example.com",
  first_name: "Ava",
  status: "active",
  created_at: new Date(T0).toISOString(),
};

const MEMBER_B = {
  id: "00000000-0000-4000-8000-0000000docb0",
  application_id: "app-b",
  auth_user_id: "auth-b",
  email: "bo@example.com",
  first_name: "Bo",
  status: "active",
  created_at: new Date(T0).toISOString(),
};

// A marker planted in section bodies: it must never reach a notification, a
// list response, or anything else a document's CONTENT should not reach.
const CONTENT_MARKER = "XENIOS_DOCUMENT_CONTENT_MARKER";

const SECTIONS = [
  { heading: "This month", body: `Three sessions a week. ${CONTENT_MARKER}` },
  { heading: "Next month", body: "Add a fourth session if the first three hold." },
];

function seedDocument(overrides: Record<string, any> = {}) {
  const row = {
    id: crypto.randomUUID(),
    member_id: MEMBER_A.id,
    type: "fitness_plan_pdf",
    title: "Fitness plan",
    version: 1,
    template_version: "fitness-v1",
    checksum_sha256: "a".repeat(64),
    storage_path: `research-documents/${MEMBER_A.id}/fitness_plan_pdf/v1-aaaaaaaaaaaaaaaa.txt`,
    status: "current",
    supersedes_document_id: null,
    reviewed_by: "Samuel",
    published_at: new Date(nowMs).toISOString(),
    acknowledged_at: null,
    created_at: new Date(nowMs).toISOString(),
    ...overrides,
  };
  state.documents.push(row);
  return row;
}

async function createDocument(app: express.Express, overrides: Record<string, any> = {}) {
  return request(app)
    .post("/api/admin/research/documents")
    .send({
      memberId: MEMBER_A.id,
      type: "fitness_plan_pdf",
      title: "August fitness plan",
      templateVersion: "fitness-v1",
      sections: SECTIONS,
      ...overrides,
    });
}

beforeEach(() => {
  state.documents.length = 0;
  state.members.length = 0;
  clearMemoryDocumentBytes();
  auth.current = MEMBER_A;
  auth.deny = null;
  admin.allow = true;
  nowMs = T0;
  notifications = [];
  deps = makeDeps();
  process.env.RESEARCH_DOCUMENT_RENDERING_ENABLED = "true";
  process.env.RESEARCH_PRIVATE_MEDIA_ENABLED = "true";
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// The renderer (pure)
// ---------------------------------------------------------------------------

describe("document renderer", () => {
  const input: RenderInput = {
    type: "fitness_plan_pdf",
    title: "August fitness plan",
    templateVersion: "fitness-v1",
    memberRef: MEMBER_A.id,
    sections: SECTIONS,
  };

  it("is deterministic: the same input always produces the same bytes and checksum", async () => {
    const renderer = new TestDocumentRenderer();
    const first = await renderer.render(JSON.parse(JSON.stringify(input)));
    const second = await renderer.render(JSON.parse(JSON.stringify(input)));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.checksumSha256).toBe(first.value.checksumSha256);
    expect(Buffer.from(second.value.bytes).equals(Buffer.from(first.value.bytes))).toBe(true);
    expect(second.value.byteLength).toBe(first.value.byteLength);
    expect(first.value.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a changed input changes the checksum", async () => {
    const renderer = new TestDocumentRenderer();
    const base = await renderer.render(input);
    const changedBody = await renderer.render({
      ...input,
      sections: [{ ...input.sections[0], body: "Four sessions a week." }, input.sections[1]],
    });
    const changedMember = await renderer.render({ ...input, memberRef: MEMBER_B.id });
    expect(base.ok && changedBody.ok && changedMember.ok).toBe(true);
    if (!base.ok || !changedBody.ok || !changedMember.ok) return;
    expect(changedBody.value.checksumSha256).not.toBe(base.value.checksumSha256);
    expect(changedMember.value.checksumSha256).not.toBe(base.value.checksumSha256);
  });

  it("carries the opaque reference and drops any field outside the contract", async () => {
    const renderer = new TestDocumentRenderer();
    const smuggled = {
      ...input,
      // A caller trying to hand the renderer a name: the canonical payload is
      // rebuilt from an explicit field list, so it never arrives.
      firstName: "Ava",
      email: "ava@example.com",
    } as RenderInput;
    const result = await renderer.render(smuggled);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = Buffer.from(result.value.bytes).toString("utf8");
    expect(text).toContain(MEMBER_A.id);
    expect(text).not.toContain("Ava");
    expect(text).not.toContain("ava@example.com");
  });

  it("selects the disabled provider whenever the capability is off, even under test", async () => {
    process.env.RESEARCH_DOCUMENT_RENDERING_ENABLED = "false";
    const renderer = selectDocumentRenderer();
    expect(renderer).toBeInstanceOf(DisabledDocumentRenderer);
    const result = await renderer.render(input);
    expect(result).toEqual({ ok: false, code: "DISABLED", message: "Document rendering is not enabled." });

    process.env.RESEARCH_DOCUMENT_RENDERING_ENABLED = "true";
    expect(selectDocumentRenderer()).toBeInstanceOf(TestDocumentRenderer);
  });
});

// ---------------------------------------------------------------------------
// GET /api/research/documents
// ---------------------------------------------------------------------------

describe("GET /api/research/documents", () => {
  it("lists the member's current and archived documents newest first, with privacy headers", async () => {
    seedDocument({ version: 1, status: "archived", published_at: new Date(T0 - 2 * DAY).toISOString() });
    seedDocument({ version: 2, status: "current", published_at: new Date(T0).toISOString() });
    seedDocument({
      type: "nutrition_plan_pdf",
      title: "Nutrition plan",
      published_at: new Date(T0 - DAY).toISOString(),
    });

    const res = await request(makeApp()).get("/api/research/documents");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.body.documents).toHaveLength(3);
    expect(res.body.documents.map((d: any) => d.version)).toEqual([2, 1, 1]);
    expect(res.body.documents[0].status).toBe("current");
    expect(res.body.documents[1].type).toBe("nutrition_plan_pdf");
    expect(res.body.documents[2].status).toBe("archived");
  });

  it("NEVER serializes the storage path", async () => {
    seedDocument();
    const res = await request(makeApp()).get("/api/research/documents");
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("research-documents/");
    expect(body).not.toContain("storagePath");
    expect(body).not.toContain("storage_path");
    expect(Object.keys(res.body.documents[0]).sort()).toEqual(
      [
        "acknowledgedAt",
        "checksumSha256",
        "documentId",
        "publishedAt",
        "reviewedBy",
        "status",
        "supersedesDocumentId",
        "templateVersion",
        "title",
        "type",
        "version",
      ].sort(),
    );
  });

  it("A/B isolation: member B never sees member A's documents", async () => {
    seedDocument();
    auth.current = MEMBER_B;
    const res = await request(makeApp()).get("/api/research/documents");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, documents: [] });
  });
});

// ---------------------------------------------------------------------------
// POST /api/research/documents/:documentId/access
// ---------------------------------------------------------------------------

describe("POST /api/research/documents/:documentId/access", () => {
  it("mints a short-lived signed grant for the member's own document", async () => {
    const row = seedDocument();
    const res = await request(makeApp()).post(`/api/research/documents/${row.id}/access`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.grant.documentId).toBe(row.id);
    expect(res.body.grant.expiresAt).toBe(new Date(T0 + DOCUMENT_GRANT_TTL_MS).toISOString());

    const url = new URL(res.body.grant.signedUrl, "https://example.test");
    expect(url.pathname).toBe(`/api/research/documents/${row.id}/download`);
    expect(url.searchParams.get("exp")).toBe(String(T0 + DOCUMENT_GRANT_TTL_MS));
    expect(url.searchParams.get("sig")).toBe(
      signDocumentGrant(row.id, MEMBER_A.id, T0 + DOCUMENT_GRANT_TTL_MS),
    );
    // The grant never carries the storage path.
    expect(JSON.stringify(res.body)).not.toContain("research-documents/");
  });

  it("A/B isolation: member B asking for A's document reads as not_found", async () => {
    const row = seedDocument();
    auth.current = MEMBER_B;
    const res = await request(makeApp()).post(`/api/research/documents/${row.id}/access`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });

  it("an unknown document id reads as not_found", async () => {
    const res = await request(makeApp()).post(`/api/research/documents/${crypto.randomUUID()}/access`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });

  it("capability off: capability_disabled, and never a placeholder URL", async () => {
    const row = seedDocument();
    process.env.RESEARCH_PRIVATE_MEDIA_ENABLED = "false";
    const res = await request(makeApp()).post(`/api/research/documents/${row.id}/access`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("capability_disabled");
    expect(res.body.grant).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("/download");
  });
});

// ---------------------------------------------------------------------------
// GET /api/research/documents/:documentId/download (the signed door)
// ---------------------------------------------------------------------------

describe("GET /api/research/documents/:documentId/download", () => {
  // Publishes a real document and returns the member's signed URL for it.
  async function publishAndGrant(app: express.Express) {
    state.members.push({ ...MEMBER_A });
    const created = await createDocument(app);
    expect(created.status).toBe(200);
    const documentId = created.body.document.documentId;
    const access = await request(app).post(`/api/research/documents/${documentId}/access`);
    expect(access.status).toBe(200);
    return { documentId, signedUrl: access.body.grant.signedUrl as string };
  }

  it("serves the rendered bytes for a valid grant held by the right session", async () => {
    const app = makeApp();
    const { documentId, signedUrl } = await publishAndGrant(app);
    const res = await request(app).get(signedUrl);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-disposition"]).toContain(`${documentId}.txt`);
    // The title is never in the filename.
    expect(res.headers["content-disposition"]).not.toContain("August");
    expect(res.text).toContain("XENIOS-TEST-DOCUMENT/1");
    expect(res.text).toContain("Three sessions a week.");
  });

  it("the renderer only ever saw the opaque member reference", async () => {
    const app = makeApp();
    const { signedUrl } = await publishAndGrant(app);
    const res = await request(app).get(signedUrl);
    expect(res.status).toBe(200);
    // What was rendered is exactly what the renderer received.
    expect(res.text).toContain(MEMBER_A.id);
    expect(res.text).not.toContain("Ava");
    expect(res.text).not.toContain("ava@example.com");
    // The stored path is keyed on the opaque id too.
    expect(state.documents[0].storage_path).toContain(MEMBER_A.id);
    expect(state.documents[0].storage_path).not.toContain("Ava");
    expect(state.documents[0].storage_path).not.toContain("August");
  });

  it("an expired signature is denied", async () => {
    const app = makeApp();
    const { signedUrl } = await publishAndGrant(app);
    nowMs = T0 + DOCUMENT_GRANT_TTL_MS + MINUTE;
    const res = await request(app).get(signedUrl);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not_found");
    expect(res.text).not.toContain("XENIOS-TEST-DOCUMENT");
  });

  it("a tampered signature is denied, at equal and unequal length", async () => {
    const app = makeApp();
    const { signedUrl } = await publishAndGrant(app);
    const url = new URL(signedUrl, "https://example.test");
    const signature = url.searchParams.get("sig")!;

    // Same length, one character flipped: this is the comparison that must run
    // through timingSafeEqual rather than a short-circuiting string compare.
    const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    expect(flipped).toHaveLength(signature.length);
    url.searchParams.set("sig", flipped);
    const tampered = await request(app).get(`${url.pathname}${url.search}`);
    expect(tampered.status).toBe(403);
    expect(tampered.body.code).toBe("not_found");

    // Different length: the length guard must deny, not throw.
    url.searchParams.set("sig", signature.slice(0, 8));
    const truncated = await request(app).get(`${url.pathname}${url.search}`);
    expect(truncated.status).toBe(403);
    expect(truncated.body.code).toBe("not_found");

    // No signature at all.
    const bare = await request(app).get(url.pathname);
    expect(bare.status).toBe(403);
    expect(bare.body.code).toBe("not_found");
  });

  it("a valid signature under the WRONG member session is denied: a signature is not an authorization", async () => {
    const app = makeApp();
    const { signedUrl } = await publishAndGrant(app);

    // Member B holds a genuine, unexpired, correctly signed URL for A's
    // document. The session check and the ownership re-read both refuse.
    auth.current = MEMBER_B;
    const res = await request(app).get(signedUrl);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not_found");
    expect(res.text).not.toContain("XENIOS-TEST-DOCUMENT");
  });

  it("a signature minted FOR member B does not open A's document under B's session", async () => {
    const app = makeApp();
    const { documentId } = await publishAndGrant(app);
    // Forging the grant the server would never mint: B's id, A's document.
    const expiresAtMs = T0 + DOCUMENT_GRANT_TTL_MS;
    const signature = signDocumentGrant(documentId, MEMBER_B.id, expiresAtMs);
    auth.current = MEMBER_B;
    const res = await request(app).get(
      `/api/research/documents/${documentId}/download?exp=${expiresAtMs}&sig=${signature}`,
    );
    // The MAC verifies (B signed it for B), so the ownership re-read is what
    // stops this. Both layers are load-bearing.
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not_found");
  });

  it("capability off: the door reports capability_disabled and serves nothing", async () => {
    const app = makeApp();
    const { signedUrl } = await publishAndGrant(app);
    process.env.RESEARCH_PRIVATE_MEDIA_ENABLED = "false";
    const res = await request(app).get(signedUrl);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("capability_disabled");
    expect(res.text).not.toContain("XENIOS-TEST-DOCUMENT");
  });
});

// ---------------------------------------------------------------------------
// POST /api/research/documents/:documentId/acknowledge
// ---------------------------------------------------------------------------

describe("POST /api/research/documents/:documentId/acknowledge", () => {
  it("stamps acknowledgedAt on the current version, idempotently", async () => {
    const row = seedDocument();
    const app = makeApp();
    const res = await request(app)
      .post(`/api/research/documents/${row.id}/acknowledge`)
      .send({ documentId: row.id, version: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, acknowledgedAt: new Date(T0).toISOString() });
    expect(state.documents[0].acknowledged_at).toBe(new Date(T0).toISOString());

    // Acknowledging again returns the ORIGINAL timestamp, not an error and not
    // a new one.
    nowMs = T0 + DAY;
    const again = await request(app)
      .post(`/api/research/documents/${row.id}/acknowledge`)
      .send({ documentId: row.id, version: 1 });
    expect(again.status).toBe(200);
    expect(again.body.acknowledgedAt).toBe(new Date(T0).toISOString());
    expect(state.documents[0].acknowledged_at).toBe(new Date(T0).toISOString());
  });

  it("a stale version is a state_conflict naming the current version", async () => {
    const row = seedDocument({ version: 3 });
    const res = await request(makeApp())
      .post(`/api/research/documents/${row.id}/acknowledge`)
      .send({ documentId: row.id, version: 2 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(res.body.message).toContain("3");
    expect(state.documents[0].acknowledged_at).toBeNull();
  });

  it("an archived document cannot be acknowledged", async () => {
    const row = seedDocument({ status: "archived" });
    const res = await request(makeApp())
      .post(`/api/research/documents/${row.id}/acknowledge`)
      .send({ documentId: row.id, version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(res.body.message).toContain("Reload");
    expect(state.documents[0].acknowledged_at).toBeNull();
  });

  it("A/B isolation: member B acknowledging A's document reads as not_found", async () => {
    const row = seedDocument();
    auth.current = MEMBER_B;
    const res = await request(makeApp())
      .post(`/api/research/documents/${row.id}/acknowledge`)
      .send({ documentId: row.id, version: 1 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
    expect(state.documents[0].acknowledged_at).toBeNull();
  });

  it("rejects a body that names a different document than the path", async () => {
    const row = seedDocument();
    const other = seedDocument({ type: "nutrition_plan_pdf", title: "Nutrition plan" });
    const res = await request(makeApp())
      .post(`/api/research/documents/${row.id}/acknowledge`)
      .send({ documentId: other.id, version: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.documentId).toBeTruthy();
    expect(state.documents[0].acknowledged_at).toBeNull();
    expect(state.documents[1].acknowledged_at).toBeNull();
  });

  it("rejects a malformed body", async () => {
    const row = seedDocument();
    const res = await request(makeApp())
      .post(`/api/research/documents/${row.id}/acknowledge`)
      .send({ documentId: row.id, version: "one" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.version).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/research/documents
// ---------------------------------------------------------------------------

describe("POST /api/admin/research/documents", () => {
  it("renders, stores a checksum and path, and notifies exactly once with a safe payload", async () => {
    state.members.push({ ...MEMBER_A });
    const res = await createDocument(makeApp());
    expect(res.status).toBe(200);
    expect(res.body.document.version).toBe(1);
    expect(res.body.document.status).toBe("current");
    expect(res.body.document.type).toBe("fitness_plan_pdf");
    expect(res.body.document.templateVersion).toBe("fitness-v1");
    expect(res.body.document.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.document.supersedesDocumentId).toBeNull();
    expect(res.body.document.publishedAt).toBe(new Date(T0).toISOString());
    // A display name, never the admin's email.
    expect(res.body.document.reviewedBy).toBe("Samuel");
    expect(JSON.stringify(res.body)).not.toContain("admin@example.com");
    expect(JSON.stringify(res.body)).not.toContain("research-documents/");

    expect(state.documents).toHaveLength(1);
    expect(state.documents[0].storage_path).toMatch(/^research-documents\//);
    expect(state.documents[0].checksum_sha256).toBe(res.body.document.checksumSha256);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].templateKey).toBe("member_document_ready");
    expect(notifications[0].recipient).toBe(MEMBER_A.email);
    expect(notifications[0].payload).toEqual({ firstName: "Ava", title: "August fitness plan" });
    expect(Object.keys(notifications[0].payload).sort()).toEqual(["firstName", "title"]);
    // Document CONTENT never travels in a notification.
    expect(JSON.stringify(notifications[0])).not.toContain(CONTENT_MARKER);
    expect(JSON.stringify(notifications[0])).not.toContain("research-documents/");
  });

  it("archives the prior current document of the same type and points the new one at it", async () => {
    state.members.push({ ...MEMBER_A });
    const app = makeApp();
    const first = await createDocument(app);
    expect(first.status).toBe(200);

    nowMs = T0 + 30 * DAY;
    const second = await createDocument(app, { title: "September fitness plan" });
    expect(second.status).toBe(200);
    expect(second.body.document.version).toBe(2);
    expect(second.body.document.status).toBe("current");
    expect(second.body.document.supersedesDocumentId).toBe(first.body.document.documentId);

    const v1 = state.documents.find((d: any) => d.version === 1)!;
    const v2 = state.documents.find((d: any) => d.version === 2)!;
    expect(v1.status).toBe("archived");
    expect(v2.status).toBe("current");
    // Exactly one current document of this type.
    expect(state.documents.filter((d: any) => d.type === "fitness_plan_pdf" && d.status === "current")).toHaveLength(1);
    // One notification per publication, never a duplicate for the same one.
    expect(notifications).toHaveLength(2);
    expect(notifications[1].payload).toEqual({ firstName: "Ava", title: "September fitness plan" });
    expect(notifications[0].eventKey).not.toBe(notifications[1].eventKey);
  });

  it("a different type keeps its own version line and does not archive the other type", async () => {
    state.members.push({ ...MEMBER_A });
    const app = makeApp();
    await createDocument(app);
    const nutrition = await createDocument(app, {
      type: "nutrition_plan_pdf",
      title: "August nutrition plan",
    });
    expect(nutrition.status).toBe(200);
    expect(nutrition.body.document.version).toBe(1);
    expect(nutrition.body.document.supersedesDocumentId).toBeNull();
    expect(state.documents.every((d: any) => d.status === "current")).toBe(true);
  });

  it("capability off: capability_disabled with ZERO rows written and nobody notified", async () => {
    state.members.push({ ...MEMBER_A });
    process.env.RESEARCH_DOCUMENT_RENDERING_ENABLED = "false";
    const res = await createDocument(makeApp());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("capability_disabled");
    expect(state.documents).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });

  it("an unknown member is not_found, and nothing is written", async () => {
    const res = await createDocument(makeApp(), { memberId: "00000000-0000-4000-8000-000000nobody" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
    expect(state.documents).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });

  it("validates the payload", async () => {
    state.members.push({ ...MEMBER_A });
    const app = makeApp();

    const badType = await createDocument(app, { type: "not_a_document_type" });
    expect(badType.status).toBe(400);
    expect(badType.body.code).toBe("validation_failed");
    expect(badType.body.fieldErrors.type).toBeTruthy();

    const noSections = await createDocument(app, { sections: [] });
    expect(noSections.status).toBe(400);
    expect(noSections.body.fieldErrors.sections).toBeTruthy();

    expect(state.documents).toHaveLength(0);
  });

  it("a non-admin session cannot create a document", async () => {
    state.members.push({ ...MEMBER_A });
    admin.allow = false;
    const res = await createDocument(makeApp());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("admin_required");
    expect(state.documents).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });
});
