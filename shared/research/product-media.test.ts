import { describe, expect, it } from "vitest";
import { parseProductMedia, type ProductMediaDescriptor } from "./product-media";

const media: ProductMediaDescriptor = {
  productId: "product-a", variantId: "variant-a", mediaId: "media-a",
  href: "https://media.xeniostechnology.com/product-a/media-a/image.webp",
  filename: "image.webp", altText: "Approved product package", width: 1024, height: 1024,
  contentSha256: "a".repeat(64), sourceVersion: "review-1", illustrative: false,
  policy: "xenios_public_media_v1", expiresAt: null,
};
const expected = { productId: "product-a", variantId: "variant-a", now: Date.parse("2026-10-05T12:00:00.000Z") };

describe("presentation-only product media descriptor", () => {
  it("preserves one exact delivery identity and strips undeclared data", () => {
    expect(parseProductMedia({ ...media, price: 1, storageKey: "private" }, expected)).toEqual(media);
  });
  it.each([
    null, {}, { ...media, variantId: "variant-b" }, { ...media, productId: "product-b" },
    { ...media, width: 1254, height: 1254 }, { ...media, height: 768 },
    { ...media, width: 1024.1 }, { ...media, width: "1024" }, { ...media, height: 0 },
    { ...media, contentSha256: "a".repeat(63) }, { ...media, contentSha256: "A".repeat(64) },
    { ...media, illustrative: undefined }, { ...media, illustrative: "false" },
    { ...media, altText: "" }, { ...media, altText: " " }, { ...media, altText: "x".repeat(501) },
    { ...media, altText: "\u200b" }, { ...media, altText: "hidden\u202e" },
    { ...media, href: "https://unapproved.example/image.webp" },
    { ...media, href: "https://xeniostechnology.com.evil.example/image.webp" },
    { ...media, href: media.href + "?width=500" },
  ])("returns fallback for malformed media without a product decision: %j", (input) => {
    expect(parseProductMedia(input, expected)).toBeNull();
  });
  it("accepts the documented alt-text bound without truncation", () => {
    expect(parseProductMedia({ ...media, altText: "x".repeat(500) }, expected)?.altText).toHaveLength(500);
  });
  it("binds signed storage URLs and enforces expiry independently of commerce", () => {
    const signed = { ...media, policy: "xenios_signed_storage_v1", expiresAt: "2026-10-05T12:05:00.000Z",
      href: "https://yvzeduaxbwgcwllhywff.supabase.co/storage/v1/object/sign/research-product-media-production/product-a/media-a/image.webp?token=a.b.c" };
    expect(parseProductMedia(signed, expected)).not.toBeNull();
    expect(parseProductMedia(signed, { ...expected, now: expected.now + 300_000 })).toBeNull();
    expect(parseProductMedia({ ...signed, expiresAt: "2026-10-05T12:05:01.000Z" }, expected)).toBeNull();
    expect(parseProductMedia({ ...signed, href: signed.href.replace("media-a/image", "other/image") }, expected)).toBeNull();
    expect(parseProductMedia({ ...signed, href: signed.href + "&token=d.e.f" }, expected)).toBeNull();
  });
  it("relaxes only the renderer clock's upper bound, retaining every other refusal", () => {
    const signed = { ...media, policy: "xenios_signed_storage_v1", expiresAt: "2026-10-05T12:05:00.000Z",
      href: "https://yvzeduaxbwgcwllhywff.supabase.co/storage/v1/object/sign/research-product-media-production/product-a/media-a/image.webp?token=a.b.c" };
    const browser = { ...expected, now: expected.now - 15_000, enforceSigningLifetime: false };
    expect(parseProductMedia(signed, { ...browser, enforceSigningLifetime: true })).toBeNull();
    expect(parseProductMedia(signed, browser)).not.toBeNull();
    for (const change of [
      { expiresAt: "2026-10-05T11:59:45.000Z" }, { expiresAt: "2026-10-05T12:05:00Z" },
      { expiresAt: "invalid" }, { variantId: "other" }, { contentSha256: "bad" },
      { height: 768 }, { href: signed.href.replace("media-a/image", "other/image") },
    ]) expect(parseProductMedia({ ...signed, ...change }, browser)).toBeNull();
  });
});
