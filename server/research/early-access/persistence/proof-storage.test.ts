import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_PROOF_MAX_BYTES,
  SupabaseEarlyAccessProofStorage,
  earlyAccessProofStorageRef,
} from "./proof-storage";
import { SyntheticEarlyAccessProofStorage } from "../routes/ports";
import type { EarlyAccessPersistenceCall } from "./executor";

const goodInput = {
  objectKey: "XEA-1/eaproofid.abc",
  contentType: "image/png",
  byteSize: 1024,
  sha256: "c".repeat(64),
};

function storageWith(answer: (call: EarlyAccessPersistenceCall) => unknown) {
  const calls: EarlyAccessPersistenceCall[] = [];
  const storage = new SupabaseEarlyAccessProofStorage({
    query: async (call) => {
      calls.push(call);
      return answer(call);
    },
  });
  return { storage, calls };
}

describe("SupabaseEarlyAccessProofStorage: validation is local and fails closed", () => {
  it("refuses every content type outside the allowlist without touching the database", async () => {
    for (const contentType of [
      "image/gif",
      "image/svg+xml",
      "text/html",
      "application/octet-stream",
      "application/pdf ",
      "",
    ]) {
      const { storage, calls } = storageWith(() => null);
      expect(await storage.reserve({ ...goodInput, contentType })).toBeNull();
      expect(calls).toHaveLength(0);
    }
  });

  it("accepts exactly JPG, PNG, WEBP, and PDF", async () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      const { storage } = storageWith(
        () => earlyAccessProofStorageRef(goodInput.objectKey),
      );
      expect(await storage.reserve({ ...goodInput, contentType })).not.toBeNull();
    }
  });

  it("refuses a zero, negative, fractional, or oversized byte size", async () => {
    for (const byteSize of [0, -1, 10.5, EARLY_ACCESS_PROOF_MAX_BYTES + 1]) {
      const { storage, calls } = storageWith(() => null);
      expect(await storage.reserve({ ...goodInput, byteSize })).toBeNull();
      expect(calls).toHaveLength(0);
    }
  });

  it("refuses a malformed digest and an empty object key", async () => {
    const { storage, calls } = storageWith(() => null);
    expect(await storage.reserve({ ...goodInput, sha256: "C".repeat(64) })).toBeNull();
    expect(await storage.reserve({ ...goodInput, sha256: "abc" })).toBeNull();
    expect(await storage.reserve({ ...goodInput, objectKey: "" })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("SupabaseEarlyAccessProofStorage: reservation", () => {
  it("derives the SAME opaque handle as the synthetic default, so upgrading changes no record shape", async () => {
    const synthetic = new SyntheticEarlyAccessProofStorage();
    const syntheticHandle = await synthetic.reserve(goodInput);
    const { storage } = storageWith(() => earlyAccessProofStorageRef(goodInput.objectKey));
    const durableHandle = await storage.reserve(goodInput);
    expect(durableHandle).toBe(syntheticHandle);
    expect(durableHandle).toBe(
      `eaproof.${createHash("sha256").update(goodInput.objectKey, "utf8").digest("hex").slice(0, 40)}`,
    );
  });

  it("a duplicate reservation answers null, exactly like the port", async () => {
    const { storage } = storageWith(() => null);
    expect(await storage.reserve(goodInput)).toBeNull();
  });

  it("sends the bucket, key, type, size, and digest to the reservation RPC", async () => {
    const { storage, calls } = storageWith(() =>
      earlyAccessProofStorageRef(goodInput.objectKey),
    );
    await storage.reserve(goodInput);
    expect(calls[0]?.fn).toBe("research_early_access_reserve_proof_object");
    expect(calls[0]?.args).toMatchObject({
      p_bucket_id: "research-ea-payment-proofs-production",
      p_object_key: goodInput.objectKey,
      p_content_type: "image/png",
      p_byte_size: 1024,
      p_sha256: goodInput.sha256,
    });
  });
});

describe("SupabaseEarlyAccessProofStorage: admin preview", () => {
  it("answers null with no signer configured", async () => {
    const { storage } = storageWith(() => null);
    expect(await storage.previewUrl("XEA-1/eaproofid.abc")).toBeNull();
  });

  it("bounds every preview to ten minutes, whatever the caller asked for", async () => {
    let seenTtl = 0;
    const storage = new SupabaseEarlyAccessProofStorage({
      query: async () => null,
      signPreviewUrl: async ({ expiresInSeconds }) => {
        seenTtl = expiresInSeconds;
        return "https://signed.example/preview";
      },
    });
    await storage.previewUrl("key", 86_400);
    expect(seenTtl).toBe(600);
  });

  it("a signer failure is a null preview, never a thrown error", async () => {
    const storage = new SupabaseEarlyAccessProofStorage({
      query: async () => null,
      signPreviewUrl: async () => {
        throw new Error("storage offline");
      },
    });
    expect(await storage.previewUrl("key")).toBeNull();
  });
});
