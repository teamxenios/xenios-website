import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Private media tests: A/B isolation on every member-scoped route, the payload
// wall (storage paths and transcript text never reach the browser), the
// content-type and size allowlists, the first-upload retention election, the
// 60-second cap, capability-off truthfulness, the access audit, idempotent
// deletion, and above all the ONLY SAFE COPY rule: a failed processing job
// never deletes the member's raw file, and neither does a later election
// change. Supabase is an in-memory fake; member auth and the capability
// registry are mocked so identity and capability state are chosen per test.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  media: [] as any[],
  accessLog: [] as any[],
  elections: [] as any[],
}));

const auth = vi.hoisted(() => ({
  current: null as any,
  deny: null as { status: number; code: string } | null,
}));

const caps = vi.hoisted(() => ({ enabled: true }));

vi.mock("../supabase", () => {
  function tableFor(name: string) {
    if (name === "research_private_media") return state.media;
    if (name === "research_media_access_log") return state.accessLog;
    if (name === "research_media_retention_elections") return state.elections;
    throw new Error(`unexpected table in test: ${name}`);
  }
  function query(table: string) {
    const list = tableFor(table);
    let mode: "select" | "insert" | "update" | "delete" = "select";
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
        const row = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...insertPayload,
        };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = list.filter(matches);
        if (!targets.length) return { data: null, error: null };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      if (mode === "delete") {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          if (matches(list[i])) list.splice(i, 1);
        }
        return { data: null, error: null };
      }
      let rows = list.filter(matches);
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      delete: () => { mode = "delete"; return api; },
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

// The capability registry: per-test on/off so the disabled paths can be proven
// to be truthful denials rather than fake URLs.
vi.mock("./capabilities", () => ({
  capabilityEnabled: () => caps.enabled,
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import {
  applyRetentionElection,
  completeProcessing,
  registerMediaApi,
  toPrivateMediaRecord,
  MAX_BYTES,
  MAX_DURATION_SECONDS,
} from "./media";
import { selectMediaProvider, testMediaProvider, disabledMediaProvider } from "./media-provider";
import type { MemberPlatformDeps } from "./member-platform-deps";

const T0 = Date.parse("2026-07-10T00:00:00.000Z");

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
  registerMediaApi(app, deps);
  return app;
}

const MEMBER_A = {
  id: "00000000-0000-4000-8000-00000000med0",
  application_id: "app-a",
  auth_user_id: "auth-a",
  email: "ava@example.com",
  first_name: "Ava",
  status: "active",
  created_at: new Date(T0).toISOString(),
};

const MEMBER_B = {
  id: "00000000-0000-4000-8000-00000000medb",
  application_id: "app-b",
  auth_user_id: "auth-b",
  email: "bo@example.com",
  first_name: "Bo",
  status: "active",
  created_at: new Date(T0).toISOString(),
};

const TRANSCRIPT_MARKER = "XENIOS_TRANSCRIPT_TEXT_NEVER_IN_A_LIST_PAYLOAD";
const PATH_MARKER = "XENIOS_STORAGE_PATH_NEVER_IN_A_PAYLOAD";

function seedMedia(overrides: Record<string, any> = {}) {
  const row = {
    id: crypto.randomUUID(),
    member_id: MEMBER_A.id,
    kind: "progress_photo",
    processing_state: "uploaded",
    retention_election: "retain_raw",
    raw_storage_path: `${PATH_MARKER}/raw`,
    derivative_storage_path: null,
    transcript_text: null,
    face_blur_requested: false,
    has_face_blurred_derivative: false,
    duration_seconds: null,
    captured_at: null,
    uploaded_at: new Date(nowMs).toISOString(),
    raw_deleted_at: null,
    created_at: new Date(nowMs).toISOString(),
    ...overrides,
  };
  state.media.push(row);
  return row;
}

function rowById(id: string) {
  return state.media.find((r) => r.id === id);
}

beforeEach(() => {
  state.media.length = 0;
  state.accessLog.length = 0;
  state.elections.length = 0;
  auth.current = MEMBER_A;
  auth.deny = null;
  caps.enabled = true;
  nowMs = T0;
  notifications = [];
  testMediaProvider.reset();
  deps = makeDeps();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

describe("media provider selection", () => {
  it("returns the disabled provider while the capability is off, and it refuses every call", async () => {
    caps.enabled = false;
    expect(selectMediaProvider()).toBe(disabledMediaProvider);
    const upload = await disabledMediaProvider.createUploadUrl({} as any);
    const access = await disabledMediaProvider.createAccessUrl({} as any);
    const removed = await disabledMediaProvider.deleteObject("any");
    const scan = await disabledMediaProvider.scanForMalware("any");
    for (const result of [upload, access, removed, scan]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("DISABLED");
    }
  });

  it("returns the deterministic test provider while the capability is on", () => {
    caps.enabled = true;
    expect(selectMediaProvider()).toBe(testMediaProvider);
  });
});

// ---------------------------------------------------------------------------
// Upload intent
// ---------------------------------------------------------------------------

describe("POST /api/research/media/intent", () => {
  it("refuses a content type outside the per-kind allowlist", async () => {
    const res = await request(makeApp()).post("/api/research/media/intent").send({
      kind: "progress_photo",
      contentType: "image/gif",
      contentLengthBytes: 1024,
      retentionElection: "retain_raw",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.contentType).toBeTruthy();
    expect(state.media).toHaveLength(0);
  });

  it("refuses an audio content type on a photo upload (the allowlist is per kind)", async () => {
    const res = await request(makeApp()).post("/api/research/media/intent").send({
      kind: "progress_photo",
      contentType: "audio/webm",
      contentLengthBytes: 1024,
      retentionElection: "retain_raw",
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.contentType).toBeTruthy();
  });

  it("refuses a file over the per-kind size cap", async () => {
    const res = await request(makeApp()).post("/api/research/media/intent").send({
      kind: "voice_note",
      contentType: "audio/webm",
      contentLengthBytes: MAX_BYTES.voice_note + 1,
      retentionElection: "retain_raw",
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.contentLengthBytes).toBeTruthy();
    expect(state.media).toHaveLength(0);
  });

  it("accepts a file exactly at the cap", async () => {
    const res = await request(makeApp()).post("/api/research/media/intent").send({
      kind: "exercise_video",
      contentType: "video/mp4",
      contentLengthBytes: MAX_BYTES.exercise_video,
      retentionElection: "retain_raw",
    });
    expect(res.status).toBe(200);
    expect(res.body.grant.maxBytes).toBe(MAX_BYTES.exercise_video);
  });

  it("requires a retention election on the FIRST upload", async () => {
    const res = await request(makeApp()).post("/api/research/media/intent").send({
      kind: "progress_photo",
      contentType: "image/jpeg",
      contentLengthBytes: 2048,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.retentionElection).toBeTruthy();
    expect(state.media).toHaveLength(0);
  });

  it("inherits the standing election on later uploads and stores it on the row", async () => {
    const app = makeApp();
    const first = await request(app).post("/api/research/media/intent").send({
      kind: "progress_photo",
      contentType: "image/jpeg",
      contentLengthBytes: 2048,
      retentionElection: "delete_raw_after_processing",
    });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/research/media/intent").send({
      kind: "progress_photo",
      contentType: "image/png",
      contentLengthBytes: 4096,
    });
    expect(second.status).toBe(200);
    expect(state.media).toHaveLength(2);
    for (const row of state.media) {
      expect(row.retention_election).toBe("delete_raw_after_processing");
    }
  });

  it("returns a signed upload grant and keeps the storage path server-side", async () => {
    const res = await request(makeApp()).post("/api/research/media/intent").send({
      kind: "progress_photo",
      contentType: "image/webp",
      contentLengthBytes: 2048,
      retentionElection: "retain_raw",
      requestFaceBlur: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.grant.uploadUrl).toContain("https://");
    expect(res.body.grant.expiresAt).toBe(new Date(T0 + 10 * 60 * 1000).toISOString());
    expect(JSON.stringify(res.body)).not.toContain("test-media/");
    const row = rowById(res.body.grant.mediaId);
    expect(row.raw_storage_path).toContain("test-media/");
    expect(row.face_blur_requested).toBe(true);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("refuses face blur on a video (blur is image processing, and never recognition)", async () => {
    const res = await request(makeApp()).post("/api/research/media/intent").send({
      kind: "exercise_video",
      contentType: "video/mp4",
      contentLengthBytes: 2048,
      retentionElection: "retain_raw",
      requestFaceBlur: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.requestFaceBlur).toBeTruthy();
  });

  it("returns capability_disabled, never a fake URL, while private media is off", async () => {
    caps.enabled = false;
    const res = await request(makeApp()).post("/api/research/media/intent").send({
      kind: "progress_photo",
      contentType: "image/jpeg",
      contentLengthBytes: 2048,
      retentionElection: "retain_raw",
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      ok: false,
      code: "capability_disabled",
      message: "Private media storage is not available yet.",
    });
    expect(res.body.grant).toBeUndefined();
    expect(state.media).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

describe("GET /api/research/media", () => {
  it("returns only the member's own media", async () => {
    seedMedia({ kind: "progress_photo" });
    seedMedia({ member_id: MEMBER_B.id, kind: "voice_note" });

    const mine = await request(makeApp()).get("/api/research/media");
    expect(mine.status).toBe(200);
    expect(mine.body.media).toHaveLength(1);
    expect(mine.body.media[0].kind).toBe("progress_photo");

    auth.current = MEMBER_B;
    const theirs = await request(makeApp()).get("/api/research/media");
    expect(theirs.body.media).toHaveLength(1);
    expect(theirs.body.media[0].kind).toBe("voice_note");
  });

  it("NEVER serializes a storage path or transcript text", async () => {
    seedMedia({
      processing_state: "processed",
      raw_storage_path: `${PATH_MARKER}/raw`,
      derivative_storage_path: `${PATH_MARKER}/blurred`,
      transcript_text: TRANSCRIPT_MARKER,
      has_face_blurred_derivative: true,
    });
    const res = await request(makeApp()).get("/api/research/media");
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(PATH_MARKER);
    expect(body).not.toContain(TRANSCRIPT_MARKER);
    // Only the existence of a transcript is disclosed, never its content.
    expect(res.body.media[0].hasTranscript).toBe(true);
    expect(res.body.media[0].hasFaceBlurredDerivative).toBe(true);
  });

  it("serializes exactly the contract record shape", async () => {
    const row = seedMedia({ transcript_text: TRANSCRIPT_MARKER, duration_seconds: 42 });
    expect(Object.keys(toPrivateMediaRecord(row as any)).sort()).toEqual(
      [
        "capturedAt",
        "durationSeconds",
        "hasFaceBlurredDerivative",
        "hasTranscript",
        "kind",
        "mediaId",
        "processingState",
        "rawDeletedAt",
        "retentionElection",
        "uploadedAt",
      ].sort(),
    );
  });

  it("stays available with the capability off so a member can always see what we hold", async () => {
    caps.enabled = false;
    seedMedia();
    const res = await request(makeApp()).get("/api/research/media");
    expect(res.status).toBe(200);
    expect(res.body.media).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Access grants
// ---------------------------------------------------------------------------

describe("POST /api/research/media/:mediaId/access", () => {
  it("grants a signed URL for the member's own media and audits the grant", async () => {
    const row = seedMedia({ processing_state: "processed" });
    const res = await request(makeApp()).post(`/api/research/media/${row.id}/access`).send({ variant: "raw" });
    expect(res.status).toBe(200);
    expect(res.body.grant.variant).toBe("raw");
    expect(res.body.grant.signedUrl).toContain("https://");
    expect(JSON.stringify(res.body)).not.toContain(PATH_MARKER);

    expect(state.accessLog).toHaveLength(1);
    expect(state.accessLog[0]).toMatchObject({
      media_id: row.id,
      member_id: MEMBER_A.id,
      variant: "raw",
      accessed_at: new Date(T0).toISOString(),
    });
  });

  it("writes one audit row per grant", async () => {
    const row = seedMedia({ processing_state: "processed" });
    const app = makeApp();
    await request(app).post(`/api/research/media/${row.id}/access`).send({ variant: "raw" });
    await request(app).post(`/api/research/media/${row.id}/access`).send({ variant: "raw" });
    await request(app).post(`/api/research/media/${row.id}/access`).send({ variant: "raw" });
    expect(state.accessLog).toHaveLength(3);
  });

  it("treats another member's media as not found (A/B isolation)", async () => {
    const row = seedMedia({ member_id: MEMBER_B.id, processing_state: "processed" });
    const res = await request(makeApp()).post(`/api/research/media/${row.id}/access`).send({ variant: "raw" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
    // A denied grant is not an access event.
    expect(state.accessLog).toHaveLength(0);
  });

  it("returns state_conflict for the raw variant once the raw file was deleted", async () => {
    const row = seedMedia({
      processing_state: "processed",
      raw_storage_path: null,
      raw_deleted_at: new Date(T0).toISOString(),
      derivative_storage_path: `${PATH_MARKER}/blurred`,
      has_face_blurred_derivative: true,
      retention_election: "delete_raw_after_processing",
    });
    const res = await request(makeApp()).post(`/api/research/media/${row.id}/access`).send({ variant: "raw" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
  });

  it("returns not_found for the face_blurred variant when no derivative exists", async () => {
    const row = seedMedia({ processing_state: "processed", derivative_storage_path: null });
    const res = await request(makeApp())
      .post(`/api/research/media/${row.id}/access`)
      .send({ variant: "face_blurred" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });

  it("grants the transcript variant even when both objects are gone", async () => {
    const row = seedMedia({
      kind: "voice_note",
      processing_state: "processed",
      raw_storage_path: null,
      raw_deleted_at: new Date(T0).toISOString(),
      derivative_storage_path: null,
      transcript_text: TRANSCRIPT_MARKER,
      retention_election: "delete_raw_after_processing",
    });
    const res = await request(makeApp())
      .post(`/api/research/media/${row.id}/access`)
      .send({ variant: "transcript" });
    expect(res.status).toBe(200);
    // The transcript is reached through the audited endpoint, and its text is
    // still not echoed in the grant.
    expect(JSON.stringify(res.body)).not.toContain(TRANSCRIPT_MARKER);
    expect(state.accessLog[0].variant).toBe("transcript");
  });

  it("returns not_found for a transcript that does not exist", async () => {
    const row = seedMedia({ kind: "voice_note", processing_state: "processed", transcript_text: null });
    const res = await request(makeApp())
      .post(`/api/research/media/${row.id}/access`)
      .send({ variant: "transcript" });
    expect(res.status).toBe(404);
  });

  it("refuses an unknown variant", async () => {
    const row = seedMedia({ processing_state: "processed" });
    const res = await request(makeApp())
      .post(`/api/research/media/${row.id}/access`)
      .send({ variant: "original_with_faces" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
  });

  it("returns capability_disabled while private media is off", async () => {
    caps.enabled = false;
    const row = seedMedia({ processing_state: "processed" });
    const res = await request(makeApp()).post(`/api/research/media/${row.id}/access`).send({ variant: "raw" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("capability_disabled");
    expect(res.body.grant).toBeUndefined();
    expect(state.accessLog).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

describe("DELETE /api/research/media/:mediaId", () => {
  it("drives the provider, clears the derived artifacts, and marks the row deleted", async () => {
    const row = seedMedia({
      processing_state: "processed",
      derivative_storage_path: `${PATH_MARKER}/blurred`,
      transcript_text: TRANSCRIPT_MARKER,
      has_face_blurred_derivative: true,
    });
    const res = await request(makeApp()).delete(`/api/research/media/${row.id}`);
    expect(res.status).toBe(200);
    expect(res.body.deletedAt).toBe(new Date(T0).toISOString());

    expect(testMediaProvider.deleted).toEqual([`${PATH_MARKER}/raw`, `${PATH_MARKER}/blurred`]);
    const stored = rowById(row.id);
    expect(stored.processing_state).toBe("deleted");
    expect(stored.raw_storage_path).toBeNull();
    expect(stored.derivative_storage_path).toBeNull();
    expect(stored.transcript_text).toBeNull();
    expect(stored.raw_deleted_at).toBe(new Date(T0).toISOString());
  });

  it("is idempotent and does not drive the provider a second time", async () => {
    const row = seedMedia({ processing_state: "processed" });
    const app = makeApp();
    const first = await request(app).delete(`/api/research/media/${row.id}`);
    const deletesAfterFirst = testMediaProvider.callsTo("deleteObject").length;

    nowMs = T0 + 60_000;
    const second = await request(app).delete(`/api/research/media/${row.id}`);
    expect(second.status).toBe(200);
    // Same timestamp as the original deletion, and no new provider calls.
    expect(second.body.deletedAt).toBe(first.body.deletedAt);
    expect(testMediaProvider.callsTo("deleteObject")).toHaveLength(deletesAfterFirst);
  });

  it("cannot delete another member's media (A/B isolation)", async () => {
    const row = seedMedia({ member_id: MEMBER_B.id, processing_state: "processed" });
    const res = await request(makeApp()).delete(`/api/research/media/${row.id}`);
    expect(res.status).toBe(404);
    expect(rowById(row.id).processing_state).toBe("processed");
    expect(testMediaProvider.callsTo("deleteObject")).toHaveLength(0);
  });

  it("still deletes with the capability off, because a member can always delete", async () => {
    caps.enabled = false;
    const row = seedMedia({ processing_state: "processed" });
    const res = await request(makeApp()).delete(`/api/research/media/${row.id}`);
    expect(res.status).toBe(200);
    expect(rowById(row.id).processing_state).toBe("deleted");
  });
});

// ---------------------------------------------------------------------------
// Processing completion (the only safe copy rule)
// ---------------------------------------------------------------------------

describe("completeProcessing", () => {
  it("processes, then deletes the raw only under the delete election", async () => {
    const row = seedMedia({
      kind: "voice_note",
      retention_election: "delete_raw_after_processing",
      raw_storage_path: "clean/voice-1",
    });
    const result = await completeProcessing(
      row.id,
      deps,
      { ok: true, transcriptText: TRANSCRIPT_MARKER, durationSeconds: 45 },
      testMediaProvider,
    );
    expect(result.ok).toBe(true);

    const stored = rowById(row.id);
    expect(stored.processing_state).toBe("processed");
    expect(stored.transcript_text).toBe(TRANSCRIPT_MARKER);
    expect(stored.duration_seconds).toBe(45);
    expect(stored.raw_storage_path).toBeNull();
    expect(stored.raw_deleted_at).toBe(new Date(T0).toISOString());
    expect(testMediaProvider.deleted).toEqual(["clean/voice-1"]);

    // Scan ran BEFORE processing.
    expect(testMediaProvider.calls[0].method).toBe("scanForMalware");
  });

  it("keeps the raw under the retain election", async () => {
    const row = seedMedia({ retention_election: "retain_raw", raw_storage_path: "clean/photo-1" });
    await completeProcessing(
      row.id,
      deps,
      { ok: true, derivativeStoragePath: "clean/photo-1-blurred", hasFaceBlurredDerivative: true },
      testMediaProvider,
    );
    const stored = rowById(row.id);
    expect(stored.processing_state).toBe("processed");
    expect(stored.raw_storage_path).toBe("clean/photo-1");
    expect(stored.raw_deleted_at).toBeNull();
    expect(stored.has_face_blurred_derivative).toBe(true);
    expect(testMediaProvider.deleted).toEqual([]);
  });

  it("PROCESSING FAILURE NEVER DELETES THE RAW, even under the delete election", async () => {
    const row = seedMedia({
      kind: "voice_note",
      retention_election: "delete_raw_after_processing",
      raw_storage_path: "clean/voice-2",
    });
    const result = await completeProcessing(
      row.id,
      deps,
      { ok: false, reason: "the transcoder crashed" },
      testMediaProvider,
    );
    expect(result.ok).toBe(true);

    const stored = rowById(row.id);
    expect(stored.processing_state).toBe("processing_failed");
    // The only safe copy survives, in full.
    expect(stored.raw_storage_path).toBe("clean/voice-2");
    expect(stored.raw_deleted_at).toBeNull();
    expect(testMediaProvider.deleted).toEqual([]);
    expect(stored.derivative_storage_path).toBeNull();
    expect(stored.transcript_text).toBeNull();
  });

  it("deletes the object and fails processing with no derivative when the scan is unclean", async () => {
    const row = seedMedia({
      retention_election: "retain_raw",
      raw_storage_path: "quarantine/infected-photo",
    });
    await completeProcessing(
      row.id,
      deps,
      { ok: true, derivativeStoragePath: "should/never/be/written" },
      testMediaProvider,
    );
    const stored = rowById(row.id);
    expect(stored.processing_state).toBe("processing_failed");
    expect(stored.raw_storage_path).toBeNull();
    expect(stored.raw_deleted_at).toBe(new Date(T0).toISOString());
    expect(stored.derivative_storage_path).toBeNull();
    expect(stored.has_face_blurred_derivative).toBe(false);
    expect(stored.transcript_text).toBeNull();
    expect(testMediaProvider.deleted).toEqual(["quarantine/infected-photo"]);
  });

  it("fails a voice note over the 60 second cap and keeps the raw", async () => {
    const row = seedMedia({
      kind: "voice_note",
      retention_election: "delete_raw_after_processing",
      raw_storage_path: "clean/voice-long",
    });
    await completeProcessing(
      row.id,
      deps,
      { ok: true, transcriptText: "too long", durationSeconds: MAX_DURATION_SECONDS + 1 },
      testMediaProvider,
    );
    const stored = rowById(row.id);
    expect(stored.processing_state).toBe("processing_failed");
    expect(stored.raw_storage_path).toBe("clean/voice-long");
    expect(stored.transcript_text).toBeNull();
    expect(testMediaProvider.deleted).toEqual([]);
  });

  it("accepts a voice note exactly at the cap", async () => {
    const row = seedMedia({ kind: "voice_note", raw_storage_path: "clean/voice-exact" });
    await completeProcessing(
      row.id,
      deps,
      { ok: true, transcriptText: "just fits", durationSeconds: MAX_DURATION_SECONDS },
      testMediaProvider,
    );
    expect(rowById(row.id).processing_state).toBe("processed");
  });

  it("does not cap a photo (duration does not apply)", async () => {
    const row = seedMedia({ kind: "progress_photo", raw_storage_path: "clean/photo-2" });
    await completeProcessing(row.id, deps, { ok: true, durationSeconds: 5000 }, testMediaProvider);
    expect(rowById(row.id).processing_state).toBe("processed");
  });

  it("fails closed and keeps the raw when the scanner cannot answer", async () => {
    const row = seedMedia({
      retention_election: "delete_raw_after_processing",
      raw_storage_path: "clean/photo-3",
    });
    await completeProcessing(row.id, deps, { ok: true }, disabledMediaProvider);
    const stored = rowById(row.id);
    expect(stored.processing_state).toBe("processing_failed");
    expect(stored.raw_storage_path).toBe("clean/photo-3");
    expect(stored.raw_deleted_at).toBeNull();
  });

  it("is idempotent once processed, and refuses a deleted row", async () => {
    const processed = seedMedia({ processing_state: "processed", raw_storage_path: "clean/photo-4" });
    const again = await completeProcessing(processed.id, deps, { ok: false, reason: "late" }, testMediaProvider);
    expect(again.ok).toBe(true);
    expect(rowById(processed.id).processing_state).toBe("processed");
    expect(testMediaProvider.calls).toHaveLength(0);

    const removed = seedMedia({ processing_state: "deleted", raw_storage_path: null });
    const conflict = await completeProcessing(removed.id, deps, { ok: true }, testMediaProvider);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe("state_conflict");
  });

  it("reports not_found for an unknown media id", async () => {
    const missing = await completeProcessing(crypto.randomUUID(), deps, { ok: true }, testMediaProvider);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------
// Retention election
// ---------------------------------------------------------------------------

describe("PUT /api/research/media/retention-election", () => {
  it("stores the standing election and applies it to future uploads", async () => {
    const app = makeApp();
    const put = await request(app)
      .put("/api/research/media/retention-election")
      .send({ retentionElection: "delete_raw_after_processing" });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true });

    // The election exists before any upload, so the next upload inherits it.
    const intent = await request(app).post("/api/research/media/intent").send({
      kind: "progress_photo",
      contentType: "image/jpeg",
      contentLengthBytes: 1024,
    });
    expect(intent.status).toBe(200);
    expect(rowById(intent.body.grant.mediaId).retention_election).toBe("delete_raw_after_processing");
  });

  it("sweeps already-processed rows when switching to delete", async () => {
    const processed = seedMedia({
      processing_state: "processed",
      retention_election: "retain_raw",
      raw_storage_path: "clean/processed-1",
      derivative_storage_path: "clean/processed-1-blurred",
    });
    await request(makeApp())
      .put("/api/research/media/retention-election")
      .send({ retentionElection: "delete_raw_after_processing" });

    const stored = rowById(processed.id);
    expect(stored.retention_election).toBe("delete_raw_after_processing");
    expect(stored.raw_storage_path).toBeNull();
    expect(stored.raw_deleted_at).toBe(new Date(T0).toISOString());
    // The derivative is untouched: only the redundant raw goes.
    expect(stored.derivative_storage_path).toBe("clean/processed-1-blurred");
    expect(testMediaProvider.deleted).toEqual(["clean/processed-1"]);
  });

  it("NEVER retroactively deletes the raw of a row whose processing FAILED", async () => {
    const failed = seedMedia({
      processing_state: "processing_failed",
      retention_election: "retain_raw",
      raw_storage_path: "clean/failed-1",
    });
    await request(makeApp())
      .put("/api/research/media/retention-election")
      .send({ retentionElection: "delete_raw_after_processing" });

    const stored = rowById(failed.id);
    // The only safe copy stays, whatever the election now says.
    expect(stored.raw_storage_path).toBe("clean/failed-1");
    expect(stored.raw_deleted_at).toBeNull();
    expect(testMediaProvider.deleted).toEqual([]);
  });

  it("leaves unfinished uploads alone (nothing is deleted before processing succeeds)", async () => {
    const pending = seedMedia({ processing_state: "uploaded", raw_storage_path: "clean/pending-1" });
    const scanning = seedMedia({ processing_state: "scanning", raw_storage_path: "clean/pending-2" });
    await applyRetentionElection(MEMBER_A.id, "delete_raw_after_processing", deps, testMediaProvider);
    expect(rowById(pending.id).raw_storage_path).toBe("clean/pending-1");
    expect(rowById(scanning.id).raw_storage_path).toBe("clean/pending-2");
    expect(testMediaProvider.deleted).toEqual([]);
  });

  it("does not touch another member's rows", async () => {
    const theirs = seedMedia({
      member_id: MEMBER_B.id,
      processing_state: "processed",
      retention_election: "retain_raw",
      raw_storage_path: "clean/theirs-1",
    });
    await request(makeApp())
      .put("/api/research/media/retention-election")
      .send({ retentionElection: "delete_raw_after_processing" });
    const stored = rowById(theirs.id);
    expect(stored.retention_election).toBe("retain_raw");
    expect(stored.raw_storage_path).toBe("clean/theirs-1");
  });

  it("refuses an unknown election value", async () => {
    const res = await request(makeApp())
      .put("/api/research/media/retention-election")
      .send({ retentionElection: "delete_everything_now" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
  });
});

// ---------------------------------------------------------------------------
// Waves 3+4 adversarial-review regressions. Each pins a defect the reviewer
// found: two of them were data-loss paths, so these tests are the guard rails
// that keep a member's only copy of a file from disappearing.
// ---------------------------------------------------------------------------
describe("wave 3+4 review regressions", () => {
  it("clears the pointer only when storage confirms the object is gone", async () => {
    // Success case: the object is really gone, so the pointer goes too.
    const removable = seedMedia({
      processing_state: "processed",
      raw_storage_path: `${PATH_MARKER}/removable`,
    });
    const ok = await request(makeApp()).delete(`/api/research/media/${removable.id}`);
    expect(ok.status).toBe(200);
    expect(removable.processing_state).toBe("deleted");
    expect(removable.raw_storage_path).toBeNull();

    // Refusal case: access is closed immediately, but the pointer SURVIVES.
    // Erasing it would orphan a real object with nothing left to find it by.
    const stubborn = seedMedia({
      processing_state: "processed",
      raw_storage_path: `${PATH_MARKER}/undeletable-raw`,
    });
    const refused = await request(makeApp()).delete(`/api/research/media/${stubborn.id}`);
    expect(refused.status).toBe(200);
    expect(stubborn.processing_state).toBe("deleted");
    expect(stubborn.raw_storage_path).toBe(`${PATH_MARKER}/undeletable-raw`);
  });

  it("quarantines an unclean upload without losing the object when storage refuses", async () => {
    const { completeProcessing } = await import("./media");
    const row = seedMedia({
      processing_state: "uploaded",
      // Both fixtures at once: the scanner flags it, storage refuses to remove it.
      raw_storage_path: `${PATH_MARKER}/infected-undeletable`,
    });

    const result = await completeProcessing(row.id, deps, { ok: true }, testMediaProvider);
    expect(result.ok).toBe(true);
    expect(row.processing_state).toBe("processing_failed");
    expect(row.quarantined).toBe(true);
    // The pointer survives for a retry sweep, and no derivative was produced.
    expect(row.raw_storage_path).toBe(`${PATH_MARKER}/infected-undeletable`);
    expect(row.derivative_storage_path).toBeNull();

    // Quarantined means closed: the surviving pointer is not downloadable.
    const denied = await request(makeApp())
      .post(`/api/research/media/${row.id}/access`)
      .send({ variant: "raw" });
    expect(denied.status).toBe(409);
  });

  it("aborts instead of acting on state it did not write when a guard loses the race", async () => {
    const { completeProcessing } = await import("./media");
    const row = seedMedia({
      processing_state: "uploaded",
      retention_election: "delete_raw_after_processing",
      raw_storage_path: `${PATH_MARKER}/racy`,
    });

    // Simulate the losing side of the race: another worker already advanced
    // the row past the state this call guards on.
    row.processing_state = "processed";
    const result = await completeProcessing(row.id, deps, { ok: true }, testMediaProvider);

    // Idempotent no-op, never a second pass that could delete the raw file.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row.processing_state).toBe("processed");
  });

  it("refuses every variant for a quarantined row even when the pointer survives", async () => {
    const row = seedMedia({
      processing_state: "processing_failed",
      quarantined: true,
      raw_storage_path: `${PATH_MARKER}/flagged`,
      derivative_storage_path: null,
    });

    const res = await request(makeApp())
      .post(`/api/research/media/${row.id}/access`)
      .send({ variant: "raw" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(JSON.stringify(res.body)).not.toContain(PATH_MARKER);
  });

  it("never signs the raw object for a transcript request", async () => {
    const row = seedMedia({
      kind: "voice_note",
      processing_state: "processed",
      transcript_text: TRANSCRIPT_MARKER,
      raw_storage_path: `${PATH_MARKER}/voice-raw`,
      derivative_storage_path: null,
    });

    const res = await request(makeApp())
      .post(`/api/research/media/${row.id}/access`)
      .send({ variant: "transcript" });

    // Whatever the provider returns, the RAW path must not be what was signed.
    expect(JSON.stringify(res.body)).not.toContain("voice-raw");
  });

  it("rejects an unparseable or future capturedAt as a field error, not a conflict", async () => {
    const bad = await request(makeApp())
      .post("/api/research/media/intent")
      .send({
        kind: "progress_photo",
        contentType: "image/jpeg",
        contentLengthBytes: 1024,
        retentionElection: "retain_raw",
        capturedAt: "not-a-timestamp",
      });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("validation_failed");

    const future = await request(makeApp())
      .post("/api/research/media/intent")
      .send({
        kind: "progress_photo",
        contentType: "image/jpeg",
        contentLengthBytes: 1024,
        retentionElection: "retain_raw",
        capturedAt: new Date(nowMs + 86_400_000).toISOString(),
      });
    expect(future.status).toBe(400);
    expect(future.body.code).toBe("validation_failed");
    expect(future.body.fieldErrors.capturedAt).toBeDefined();
  });
});
