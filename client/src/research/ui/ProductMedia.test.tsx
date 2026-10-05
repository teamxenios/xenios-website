// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ProductMedia } from "./ProductMedia";
import { PRODUCT_MEDIA_FALLBACK, type ProductMediaDescriptor } from "@shared/research/product-media";

const media: ProductMediaDescriptor = {
  productId: "product-a", variantId: "variant-a", mediaId: "media-a",
  href: "https://media.xeniostechnology.com/product-a/media-a/image.webp", filename: "image.webp",
  altText: "Product package", width: 1024, height: 1024, contentSha256: "a".repeat(64),
  sourceVersion: "review-1", illustrative: true, policy: "xenios_public_media_v1", expiresAt: null,
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });
function render(value: unknown = media, variantId: string | null = "variant-a") {
  act(() => root.render(<ProductMedia media={value} productId="product-a" variantId={variantId} />));
}
function fallback() {
  expect(host.querySelector("img")).toBeNull();
  expect(host.querySelector(".xenios-product-media__square")?.textContent).toBe(PRODUCT_MEDIA_FALLBACK);
  expect(host.querySelector('[role="img"], [role="status"]')).toBeNull();
  expect(host.querySelector("figcaption")).toBeNull();
}
describe("square product media presentation", () => {
  it("reserves a neutral square for null, malformed and wrong-variant media", () => {
    for (const value of [null, {}, { ...media, height: 700 }, { ...media, variantId: "other" }]) {
      render(value); fallback();
    }
  });
  it("renders intrinsic dimensions, a separate illustrative caption and one lazy source", () => {
    render(); const img = host.querySelector("img")!;
    expect(img.width).toBe(1024); expect(img.height).toBe(1024);
    expect(img.getAttribute("loading")).toBe("lazy"); expect(img.getAttribute("decoding")).toBe("async");
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(host.querySelector("figcaption")?.textContent).toBe("Illustrative image");
    expect(host.querySelector("figcaption")?.previousElementSibling).toBe(img.parentElement);
    expect(host.querySelector("figure")?.dataset.contentSha256).toBe(media.contentSha256);
  });
  it("falls back on error and recovers only for a new descriptor", () => {
    render(); const old = host.querySelector("img")!;
    act(() => old.dispatchEvent(new Event("error"))); fallback();
    render(); fallback();
    render({ ...media, href: media.href.replace("image.webp", "new.webp"), sourceVersion: "review-2" });
    expect(host.querySelector("img")).not.toBeNull();
    act(() => old.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).not.toBeNull();
  });
  it("rejects actual bytes with dimensions differing from the approved descriptor", () => {
    render(); const img = host.querySelector("img")!;
    Object.defineProperties(img, { naturalWidth: { value: 1024 }, naturalHeight: { value: 768 } });
    act(() => img.dispatchEvent(new Event("load"))); fallback();
  });
  it("keeps decoded square bytes and changes variant without substituting an image", () => {
    render(); const img = host.querySelector("img")!;
    Object.defineProperties(img, { naturalWidth: { value: 1024 }, naturalHeight: { value: 1024 } });
    act(() => img.dispatchEvent(new Event("load"))); expect(host.querySelector("img")).toBe(img);
    render(media, "variant-b"); fallback(); render(); expect(host.querySelector("img")).not.toBeNull();
  });
  it("expires while mounted and rejects already expired URLs", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));
    const signed = { ...media, policy: "xenios_signed_storage_v1", expiresAt: "2026-10-05T12:00:01.000Z",
      href: "https://yvzeduaxbwgcwllhywff.supabase.co/storage/v1/object/sign/research-product-media-production/product-a/media-a/image.webp?token=a.b.c" };
    render(signed); expect(host.querySelector("img")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1000)); fallback(); render(signed); fallback();
  });
  it("contains square images without decoration, cropping or breakpoint shrinkage", () => {
    const css = readFileSync("client/src/research/ui/product-media.css", "utf8");
    expect(css).toMatch(/aspect-ratio:\s*1 \/ 1/);
    expect(css).toMatch(/object-fit:\s*contain/);
    expect(css).not.toMatch(/filter|gradient|blend|opacity|object-fit:\s*cover|@media|position:\s*absolute/);
    expect(css).toContain("grid-template-rows: minmax(0, 1fr)");
  });
});
