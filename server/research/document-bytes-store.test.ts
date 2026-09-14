// The production document byte reader.
//
// Before this existed, production selected the refusing store: a member could
// see a document listed and never obtain it. The listing was honest; the
// deliverable did not exist.
//
// What these tests hold down is the boundary rather than the happy path. The
// store has no method that can mint a URL, it refuses a path that is not one of
// ours, it reports a missing object as absent rather than as bytes, and it
// refuses rather than guessing when the private bucket is not configured.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseDocumentBytesStore,
  missingDocumentStoreEnv,
  notConfiguredDocumentBytesStore,
  selectDocumentBytesStore,
  type DocumentBucketApi,
} from "./documents";

const ENV_KEYS = ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEARCH_MEDIA_BUCKET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function configured(): void {
  process.env.SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.RESEARCH_MEDIA_BUCKET = "research-private";
}

type Recorded = { uploads: Array<{ path: string; contentType: string }>; downloads: string[]; buckets: string[] };

function fakeBucket(objects: Record<string, { body: string; type?: string }>, failures: Set<string> = new Set()) {
  const recorded: Recorded = { uploads: [], downloads: [], buckets: [] };
  const factory = (bucket: string): DocumentBucketApi => {
    recorded.buckets.push(bucket);
    return {
      async upload(path, body, options) {
        if (failures.has(path)) return { error: { message: "storage refused the object" } };
        recorded.uploads.push({ path, contentType: options.contentType });
        objects[path] = { body: Buffer.from(body).toString("utf8"), type: options.contentType };
        return { error: null };
      },
      async download(path) {
        recorded.downloads.push(path);
        if (failures.has(path)) return { data: null, error: { message: "storage unavailable" } };
        const object = objects[path];
        if (!object) return { data: null, error: { message: "Object not found", statusCode: "404" } };
        return {
          data: {
            async arrayBuffer() {
              const buffer = Buffer.from(object.body, "utf8");
              return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            },
            type: object.type,
          },
          error: null,
        };
      },
    };
  };
  return { factory, recorded, objects };
}

describe("the private bucket adapter", () => {
  it("round-trips bytes through the bucket the media capability already declares", async () => {
    configured();
    const { factory, recorded } = fakeBucket({});
    const store = createSupabaseDocumentBytesStore(factory);

    await store.put("plan-documents/mem_1/doc_1.pdf", {
      bytes: new TextEncoder().encode("%PDF-1.7 plan"),
      contentType: "application/pdf",
    });
    const read = await store.get("plan-documents/mem_1/doc_1.pdf");

    expect(new TextDecoder().decode(read!.bytes)).toBe("%PDF-1.7 plan");
    expect(read!.contentType).toBe("application/pdf");
    expect(recorded.buckets.every((bucket) => bucket === "research-private")).toBe(true);
  });

  it("has no way to mint a URL at all", async () => {
    configured();
    const { factory } = fakeBucket({});
    const store = createSupabaseDocumentBytesStore(factory);
    // The seam is the guarantee: a store with no URL method cannot leak one,
    // whatever a later caller asks for.
    expect((store as unknown as Record<string, unknown>).getPublicUrl).toBeUndefined();
    expect((store as unknown as Record<string, unknown>).createSignedUrl).toBeUndefined();
    expect(Object.keys(store).sort()).toEqual(["get", "put"]);
  });

  it("refuses a path that is not one of ours, so a stored row cannot escape the bucket", async () => {
    configured();
    const { factory, recorded } = fakeBucket({});
    const store = createSupabaseDocumentBytesStore(factory);

    for (const path of [
      "../../../etc/passwd",
      "plan-documents/../../secrets/key.pem",
      "https://example.invalid/leak.pdf",
      "/absolute/path.pdf",
      "",
    ]) {
      await expect(store.get(path)).rejects.toThrow(/readable shape/);
    }
    expect(recorded.downloads).toEqual([]);
  });

  it("reports a missing object as absent rather than as empty bytes", async () => {
    configured();
    const { factory } = fakeBucket({});
    const store = createSupabaseDocumentBytesStore(factory);
    expect(await store.get("plan-documents/mem_1/gone.pdf")).toBeNull();
  });

  it("reports a storage failure as absent rather than inventing a document", async () => {
    configured();
    const { factory } = fakeBucket({}, new Set(["plan-documents/mem_1/doc_1.pdf"]));
    const store = createSupabaseDocumentBytesStore(factory);
    expect(await store.get("plan-documents/mem_1/doc_1.pdf")).toBeNull();
  });

  it("fails an upload loudly, because a document that silently did not store is worse", async () => {
    configured();
    const { factory } = fakeBucket({}, new Set(["plan-documents/mem_1/doc_1.pdf"]));
    const store = createSupabaseDocumentBytesStore(factory);
    await expect(
      store.put("plan-documents/mem_1/doc_1.pdf", {
        bytes: new TextEncoder().encode("bytes"),
        contentType: "application/pdf",
      }),
    ).rejects.toThrow(/upload failed/);
  });

  it("never carries document bytes into a failure message", async () => {
    configured();
    const { factory } = fakeBucket({}, new Set(["plan-documents/mem_1/doc_1.pdf"]));
    const store = createSupabaseDocumentBytesStore(factory);
    const failure = await store
      .put("plan-documents/mem_1/doc_1.pdf", {
        bytes: new TextEncoder().encode("CONFIDENTIAL-BYTES-MARKER"),
        contentType: "application/pdf",
      })
      .catch((error: Error) => error.message);
    expect(String(failure)).not.toContain("CONFIDENTIAL-BYTES-MARKER");
  });

  it("refuses rather than guessing when the private bucket is not configured", async () => {
    configured();
    delete process.env.RESEARCH_MEDIA_BUCKET;
    const { factory, recorded } = fakeBucket({});
    const store = createSupabaseDocumentBytesStore(factory);

    await expect(store.get("plan-documents/mem_1/doc_1.pdf")).rejects.toThrow(/not configured/);
    expect(recorded.downloads).toEqual([]);
    // The report names the variable and nothing else.
    expect(missingDocumentStoreEnv()).toEqual(["RESEARCH_MEDIA_BUCKET"]);
  });
});

describe("which store production selects", () => {
  it("uses the private bucket when production is configured for it", () => {
    process.env.NODE_ENV = "production";
    configured();
    expect(selectDocumentBytesStore()).not.toBe(notConfiguredDocumentBytesStore);
  });

  it("refuses, rather than falling back to a process-local store, when it is not", () => {
    process.env.NODE_ENV = "production";
    configured();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    // The in-memory store would make downloads "work" in production and lose
    // every document on restart. Refusing is the honest outcome.
    expect(selectDocumentBytesStore()).toBe(notConfiguredDocumentBytesStore);
  });

  it("keeps the deterministic store outside production", () => {
    process.env.NODE_ENV = "test";
    expect(selectDocumentBytesStore()).not.toBe(notConfiguredDocumentBytesStore);
  });
});
