// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { MasterOfferingCard } from "./MasterOfferingCard";
import { MasterOfferingDetail } from "./MasterOfferingDetail";
import { card, click, detail, render, variant } from "./catalog-test-fixtures";

const vial = variant({ id: "mov_9262033fe69a14a50f1c", label: "Listed vial" });
const capsule = variant({ id: "mov_82974ab2f9c652c2cb12", label: "Listed capsule" });
const bpc157 = variant({ id: "mov_ca3e45ae9712aee91430", label: "BPC-157 10 mg" });

function mediaImage(host: HTMLElement) {
  const image = host.querySelector<HTMLImageElement>('[data-testid="product-media-image"]');
  if (!image) throw new Error("Product media was not mounted");
  return image;
}

function expectAsset(host: HTMLElement, format: string) {
  const image = mediaImage(host);
  const src = image.getAttribute("src");
  expect(src).toBe("/research/product-media/" + format + ".svg");
  expect(readFileSync(resolve(process.cwd(), "client/public", src!.slice(1)), "utf8"))
    .toContain('viewBox="0 0 128 128"');
  expect(image.getAttribute("width")).toBe("128");
  expect(image.getAttribute("height")).toBe("128");
  return image;
}

describe("product visuals on catalog routes", () => {
  it("mounts exact-id artwork in a catalog card with accessible text and reserved dimensions", () => {
    const { host, unmount } = render(
      <ul><MasterOfferingCard product={card({ displayName: "Fixture product", variants: [vial] })} /></ul>,
    );
    try {
      const image = expectAsset(host, "vial");
      expect(image.getAttribute("alt")).toBe("Fixture product illustration, vial");
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(host.querySelector('[data-testid="mo-card"]')?.firstElementChild).toBe(image.closest("figure"));
      expect(host.querySelector("figcaption")).toBeNull();
    } finally {
      unmount();
    }
  });

  it("uses the exact BPC-157 packshot and falls back through the vial illustration", () => {
    const { host, unmount } = render(
      <ul><MasterOfferingCard product={card({ displayName: "BPC-157", variants: [bpc157] })} /></ul>,
    );
    try {
      const image = mediaImage(host);
      expect(image.getAttribute("src")).toBe("/research/product-media/bpc-157-packshot.webp");
      expect(image.getAttribute("alt")).toBe("BPC-157 10 mg lyophilized vial packaging design");
      expect(image.getAttribute("width")).toBe("768");
      expect(image.getAttribute("height")).toBe("768");
      expect(image.classList.contains("object-contain")).toBe(true);
      expect(host.querySelector("figcaption")).toBeNull();
      act(() => { image.dispatchEvent(new Event("error")); });
      const fallback = expectAsset(host, "vial");
      expect(host.querySelector("figcaption")).toBeNull();
      act(() => { fallback.dispatchEvent(new Event("error")); });
      expectAsset(host, "unknown");
    } finally {
      unmount();
    }
  });

  it("keeps the format illustration on a multi-variant card containing the packshot variant", () => {
    const { host, unmount } = render(
      <ul><MasterOfferingCard product={card({ variants: [bpc157, vial] })} /></ul>,
    );
    try {
      expectAsset(host, "vial");
    } finally {
      unmount();
    }
  });

  it("uses neutral artwork for mixed or unverified formats", () => {
    const { host, unmount } = render(
      <ul><MasterOfferingCard product={card({ variants: [vial, capsule] })} /></ul>,
    );
    try {
      const image = expectAsset(host, "unknown");
      expect(image.getAttribute("alt")).toContain("format unconfirmed");
      expect(host.querySelector("figcaption")).toBeNull();
    } finally {
      unmount();
    }
  });

  it("places the packaging status on the exact variant detail only", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail product={detail({ displayName: "BPC-157", variants: [bpc157, vial] })} />,
    );
    try {
      expect(mediaImage(host).getAttribute("src")).toBe("/research/product-media/bpc-157-packshot.webp");
      expect(host.querySelector("figcaption")?.textContent).toContain("Current packaging may differ.");
      click(host.querySelectorAll('input[type="radio"]')[1]);
      expectAsset(host, "vial");
      expect(host.querySelector("figcaption")).toBeNull();
    } finally {
      unmount();
    }
  });

  it("switches the detail illustration with the exact variant and recovers from an asset error", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail product={detail({ variants: [vial, capsule] })} />,
    );
    try {
      expectAsset(host, "vial");
      click(host.querySelectorAll('input[type="radio"]')[1]);
      const image = expectAsset(host, "capsule");
      expect(image.getAttribute("loading")).toBe("eager");
      act(() => { image.dispatchEvent(new Event("error")); });
      expectAsset(host, "unknown");
      click(host.querySelectorAll('input[type="radio"]')[0]);
      expectAsset(host, "vial");
    } finally {
      unmount();
    }
  });
});
