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
      expect(host.textContent).toContain("Representative illustration");
    } finally {
      unmount();
    }
  });

  it("uses neutral artwork for mixed or unverified formats", () => {
    const { host, unmount } = render(
      <ul><MasterOfferingCard product={card({ variants: [vial, capsule] })} /></ul>,
    );
    try {
      expectAsset(host, "unknown");
      expect(host.textContent).toContain("format unconfirmed");
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
