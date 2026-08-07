import { describe, expect, it, vi } from "vitest";
import type { SupplementMediaRecord } from "../official-sources/contracts";
import {
  assertPublicImageUrl,
  downloadApprovedOfficialOriginal,
} from "./official-download";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const baseRecord = {
  assetId: "asset-1",
  sourceImageUrl: "https://cdn.shopify.com/image.png",
  rights: { status: "BRAND_MEDIA_PORTAL_APPROVED" },
} as SupplementMediaRecord;

describe("official media download", () => {
  it("rejects local/private image targets", () => {
    expect(() => assertPublicImageUrl("https://127.0.0.1/image.png")).toThrow(/private/);
    expect(() => assertPublicImageUrl("http://cdn.example/image.png")).toThrow(/HTTPS/);
  });

  it("preserves approved original bytes and returns a SHA-256 hash", async () => {
    const write = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => new Response(png, {
      status: 200,
      headers: { "content-type": "image/png", "content-length": String(png.length) },
    }));
    const result = await downloadApprovedOfficialOriginal({
      record: baseRecord,
      outputDirectory: "controlled",
      fetcher,
      write,
    });
    expect(result).toMatchObject({ contentType: "image/png", sizeBytes: png.length, duplicateOf: null });
    expect(result.sourceHash).toHaveLength(64);
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][1]).toEqual(png);
  });

  it("never fetches a rights-pending source", async () => {
    const fetcher = vi.fn();
    await expect(downloadApprovedOfficialOriginal({
      record: { ...baseRecord, rights: { status: "OFFICIAL_SOURCE_RIGHTS_PENDING" } } as SupplementMediaRecord,
      outputDirectory: "controlled",
      fetcher,
    })).rejects.toThrow(/rights/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
