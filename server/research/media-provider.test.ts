import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// The real Supabase storage adapter, driven entirely through an injected fake
// bucket client: upload validation refusals (oversize, unlisted MIME, path
// traversal in an identifier), generated object names that never carry a
// caller-supplied path, the signed-URL expiry parameter, idempotent deletion,
// existence/stat truthfulness, the disabled fallback, and the structural
// no-public-URL guarantee. No test here performs network I/O; the real
// service-role client is mocked to throw if anything ever reaches for it.
// ---------------------------------------------------------------------------

const caps = vi.hoisted(() => ({ enabled: true }));

vi.mock("./capabilities", () => ({
  capabilityEnabled: () => caps.enabled,
}));

// If the adapter ever falls through to the real service-role client in a
// test, that is a bug this mock turns into a loud failure.
vi.mock("../supabase", () => ({
  supabaseConfigured: () => true,
  getSupabaseAdmin: () => {
    throw new Error("the real supabase client must never be reached from a test");
  },
  getSupabaseAnon: () => {
    throw new Error("not used in tests");
  },
}));

// The drift guard below imports the media SERVICE, which needs member auth
// mocked away; it is route middleware, irrelevant here.
vi.mock("./member-auth", () => ({
  requireActiveMember: (_req: any, _res: any, next: any) => next(),
  requireMember: (_req: any, _res: any, next: any) => next(),
}));

import {
  MediaProviderNotConfigured,
  PROVIDER_CONTENT_TYPE_ALLOWLIST,
  SupabaseStorageProvider,
  disabledMediaProvider,
  isSafeStoragePath,
  missingMediaEnv,
  selectMediaProvider,
  testMediaProvider,
  type CreateUploadUrlInput,
  type StorageBucketApi,
} from "./media-provider";
import { CONTENT_TYPE_ALLOWLIST } from "./media";

const T0 = Date.parse("2026-07-22T00:00:00.000Z");
const NOW = new Date(T0);

// process.env is shared across test files in a worker; snapshot and restore
// so a leaked value cannot quietly break another suite.
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEARCH_MEDIA_BUCKET"] as const;
const envSnapshot: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (envSnapshot[key] === undefined) delete process.env[key];
    else process.env[key] = envSnapshot[key];
  }
});

beforeEach(() => {
  caps.enabled = true;
  process.env.SUPABASE_URL = "https://unit-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-service-role-placeholder";
  process.env.RESEARCH_MEDIA_BUCKET = "unit-test-private-bucket";
  testMediaProvider.reset();
});

// A fake bucket client that records every call. getPublicUrl exists ONLY so a
// test can prove it is never called: the adapter's seam type has no such
// method, and this is the runtime assertion of the same rule.
function makeFakeBucket(overrides: Partial<StorageBucketApi> = {}) {
  const calls = {
    buckets: [] as string[],
    createSignedUploadUrl: [] as string[],
    createSignedUrl: [] as { path: string; expiresIn: number }[],
    remove: [] as string[][],
    info: [] as string[],
  };
  const getPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://NEVER.invalid/public" } }));
  const bucket: StorageBucketApi & { getPublicUrl: typeof getPublicUrl } = {
    async createSignedUploadUrl(path: string) {
      calls.createSignedUploadUrl.push(path);
      return {
        data: {
          signedUrl: `https://unit-test.invalid/storage/upload/sign/${path}?token=fake-signed-token`,
          token: "fake-signed-token",
          path,
        },
        error: null,
      };
    },
    async createSignedUrl(path: string, expiresIn: number) {
      calls.createSignedUrl.push({ path, expiresIn });
      return {
        data: { signedUrl: `https://unit-test.invalid/storage/sign/${path}?token=fake-signed-token` },
        error: null,
      };
    },
    async remove(paths: string[]) {
      calls.remove.push(paths);
      return { data: paths.map((name) => ({ name })), error: null };
    },
    async info(path: string) {
      calls.info.push(path);
      return { data: { size: 1234, contentType: "image/jpeg" }, error: null };
    },
    getPublicUrl,
    ...overrides,
  };
  const factory = (bucketName: string) => {
    calls.buckets.push(bucketName);
    return bucket;
  };
  return { bucket, calls, factory, getPublicUrl };
}

function uploadInput(overrides: Partial<CreateUploadUrlInput> = {}): CreateUploadUrlInput {
  return {
    mediaId: "11111111-2222-4333-8444-555555555555",
    memberId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    kind: "progress_photo",
    contentType: "image/jpeg",
    contentLengthBytes: 1024,
    maxBytes: 15 * 1024 * 1024,
    expiresInSeconds: 600,
    now: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Selection and the disabled fallback
// ---------------------------------------------------------------------------

describe("provider selection", () => {
  it("falls back to the disabled provider while the capability is off, and stat refuses too", async () => {
    caps.enabled = false;
    expect(selectMediaProvider()).toBe(disabledMediaProvider);
    const stat = await disabledMediaProvider.statObject("members/a/progress_photo/b");
    expect(stat.ok).toBe(false);
    if (!stat.ok) expect(stat.code).toBe("DISABLED");
  });

  it("selects the deterministic test provider under NODE_ENV=test", () => {
    caps.enabled = true;
    expect(selectMediaProvider()).toBe(testMediaProvider);
  });

  it("throws MediaProviderNotConfigured naming missing variable NAMES only", async () => {
    delete process.env.RESEARCH_MEDIA_BUCKET;
    expect(missingMediaEnv()).toEqual(["RESEARCH_MEDIA_BUCKET"]);
    const { factory } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    await expect(provider.createUploadUrl(uploadInput())).rejects.toMatchObject({
      name: "MediaProviderNotConfigured",
      missing: ["RESEARCH_MEDIA_BUCKET"],
    });
    await expect(provider.deleteObject("members/a/progress_photo/b")).rejects.toBeInstanceOf(
      MediaProviderNotConfigured,
    );
  });
});

// ---------------------------------------------------------------------------
// Upload URL: validation before storage, generated names, no caller paths
// ---------------------------------------------------------------------------

describe("createUploadUrl", () => {
  it("mints a signed upload URL against the private bucket with a generated object name", async () => {
    const { calls, factory, getPublicUrl } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    const input = uploadInput();
    const result = await provider.createUploadUrl(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The bucket is the configured private one, by NAME from the environment.
    expect(calls.buckets).toEqual(["unit-test-private-bucket"]);

    // The object name is generated here: validated identifiers plus a random
    // hex suffix. No caller-supplied filename or path exists in the input at
    // all, and the generated name is what went to storage.
    const path = result.value.storagePath;
    expect(path).toMatch(
      new RegExp(`^members/${input.memberId}/progress_photo/${input.mediaId}-[0-9a-f]{16}$`),
    );
    expect(calls.createSignedUploadUrl).toEqual([path]);
    expect(isSafeStoragePath(path)).toBe(true);

    // The grant carries the fake's SIGNED url, the requested TTL, and the cap.
    expect(result.value.uploadUrl).toContain("/upload/sign/");
    expect(result.value.expiresAt).toBe(new Date(T0 + 600 * 1000).toISOString());
    expect(result.value.maxBytes).toBe(input.maxBytes);

    // The structural rule, asserted at runtime: no public URL was ever minted.
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("refuses an oversize declaration before any storage call", async () => {
    const { calls, factory } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.createUploadUrl(
      uploadInput({ contentLengthBytes: 15 * 1024 * 1024 + 1 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REFUSED");
    expect(calls.createSignedUploadUrl).toEqual([]);
    expect(calls.buckets).toEqual([]);
  });

  it("refuses an unlisted content type for the kind before any storage call", async () => {
    const { calls, factory } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    for (const contentType of ["image/gif", "application/pdf", "text/html"]) {
      const result = await provider.createUploadUrl(uploadInput({ contentType }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("REFUSED");
    }
    expect(calls.createSignedUploadUrl).toEqual([]);
  });

  it("refuses a path traversal attempt inside an identifier, and never echoes it", async () => {
    const { calls, factory } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    const hostile = ["../../etc/passwd", "a/../../b", "a/b", "..", ".", "", "a\\b", "a b"];
    for (const value of hostile) {
      for (const field of ["mediaId", "memberId"] as const) {
        const result = await provider.createUploadUrl(uploadInput({ [field]: value }));
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("REFUSED");
          // The hostile value must not travel onward, not even in the error.
          expect(result.message ?? "").not.toContain("passwd");
        }
      }
    }
    expect(calls.createSignedUploadUrl).toEqual([]);
  });

  it("surfaces a storage refusal as a truthful PROVIDER_ERROR, never a fabricated URL", async () => {
    const { factory } = makeFakeBucket({
      async createSignedUploadUrl() {
        return { data: null, error: { message: "bucket does not exist" } };
      },
    });
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.createUploadUrl(uploadInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Access URL: signed, short expiry, no object means no URL
// ---------------------------------------------------------------------------

describe("createAccessUrl", () => {
  it("passes the short expiry parameter straight to the signed URL call", async () => {
    const { calls, factory, getPublicUrl } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.createAccessUrl({
      mediaId: "m1",
      memberId: "member-a",
      storagePath: "members/member-a/progress_photo/m1-abc123",
      variant: "raw",
      expiresInSeconds: 300,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls.createSignedUrl).toEqual([
      { path: "members/member-a/progress_photo/m1-abc123", expiresIn: 300 },
    ]);
    expect(result.value.expiresAt).toBe(new Date(T0 + 300 * 1000).toISOString());
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("refuses a null storage path (text-only variant) without touching storage", async () => {
    const { calls, factory } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.createAccessUrl({
      mediaId: "m1",
      memberId: "member-a",
      storagePath: null,
      variant: "transcript",
      expiresInSeconds: 300,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REFUSED");
    expect(calls.createSignedUrl).toEqual([]);
  });

  it("refuses a storage path this system would never generate", async () => {
    const { calls, factory } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    for (const storagePath of ["../secrets", "/absolute", "a//b", "a/../b", "a\\b"]) {
      const result = await provider.createAccessUrl({
        mediaId: "m1",
        memberId: "member-a",
        storagePath,
        variant: "raw",
        expiresInSeconds: 300,
        now: NOW,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("REFUSED");
    }
    expect(calls.createSignedUrl).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Deletion: real, idempotent, truthful on refusal
// ---------------------------------------------------------------------------

describe("deleteObject", () => {
  it("removes the object through storage", async () => {
    const { calls, factory } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.deleteObject("members/member-a/progress_photo/m1-abc123");
    expect(result.ok).toBe(true);
    expect(calls.remove).toEqual([["members/member-a/progress_photo/m1-abc123"]]);
  });

  it("treats an already-gone object as a success, so deletes stay idempotent", async () => {
    const { factory } = makeFakeBucket({
      async remove() {
        return { data: [], error: null };
      },
    });
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.deleteObject("members/member-a/progress_photo/gone");
    expect(result.ok).toBe(true);
  });

  it("surfaces a storage refusal truthfully, so the caller keeps the pointer", async () => {
    const { factory } = makeFakeBucket({
      async remove() {
        return { data: null, error: { message: "storage said no" } };
      },
    });
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.deleteObject("members/member-a/progress_photo/m1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Existence / stat
// ---------------------------------------------------------------------------

describe("statObject", () => {
  it("reports an existing object with its size and content type", async () => {
    const { factory } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.statObject("members/member-a/progress_photo/m1");
    expect(result).toEqual({
      ok: true,
      value: { exists: true, sizeBytes: 1234, contentType: "image/jpeg" },
    });
  });

  it("reports a definitive not-found as absent, not as an error", async () => {
    const { factory } = makeFakeBucket({
      async info() {
        return { data: null, error: { message: "Object not found", status: 404 } };
      },
    });
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.statObject("members/member-a/progress_photo/missing");
    expect(result).toEqual({
      ok: true,
      value: { exists: false, sizeBytes: null, contentType: null },
    });
  });

  it("never lets an outage masquerade as absence", async () => {
    const { factory } = makeFakeBucket({
      async info() {
        return { data: null, error: { message: "internal error", status: 500 } };
      },
    });
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.statObject("members/member-a/progress_photo/m1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });
});

// ---------------------------------------------------------------------------
// The malware scan stays fail-closed (external input: a scanner vendor)
// ---------------------------------------------------------------------------

describe("scanForMalware", () => {
  it("fails closed while no scanner is wired, so nothing unscanned is processed", async () => {
    const { factory } = makeFakeBucket();
    const provider = new SupabaseStorageProvider(factory);
    const result = await provider.scanForMalware("members/member-a/progress_photo/m1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Drift guard: the provider's allowlist is the service's allowlist
// ---------------------------------------------------------------------------

describe("content-type allowlist drift guard", () => {
  it("keeps the provider allowlist identical to the media service allowlist", () => {
    expect(PROVIDER_CONTENT_TYPE_ALLOWLIST).toEqual(CONTENT_TYPE_ALLOWLIST);
  });
});
