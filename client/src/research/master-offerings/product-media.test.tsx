// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { MasterOfferingCard } from "./MasterOfferingCard";
import { MasterOfferingDetail } from "./MasterOfferingDetail";
import { card, click, detail, render, variant } from "./catalog-test-fixtures";

// Two synthetic vial variants, added to the real format map for this file only. The tests below are about what the
// page draws for a variant whose format is "vial" and whose form is not held. They used two real catalog rows for
// that, so they failed whenever one of those rows was put in the form-hold map, which is a statement about the row
// and not about the component. A synthetic id is in no hold map. The real hold map and the real format map are still
// what every other fixture here is read against.
const SYNTHETIC_VIAL = "mov_synthetic_vial_listing";
const SYNTHETIC_VIAL_WITH_PACKSHOT = "mov_synthetic_vial_packshot";
vi.mock("../product-media/product-media-format.generated.json", async (importOriginal) => {
  const real = (await importOriginal<{ default: { formatByVariantId: Record<string, string> } }>()).default;
  return {
    default: {
      ...real,
      formatByVariantId: {
        ...real.formatByVariantId,
        mov_synthetic_vial_listing: "vial",
        mov_synthetic_vial_packshot: "vial",
      },
    },
  };
});

const vial = variant({ id: SYNTHETIC_VIAL, label: "Listed vial" });
const capsule = variant({ id: "mov_82974ab2f9c652c2cb12", label: "Listed capsule" });
const heldPackshot = "/research/product-media/5-amino-1mq-10mg-website-render-v1-1024.webp";
const heldVial = variant({
  id: "mov_9262033fe69a14a50f1c",
  label: "5-Amino-1MQ 10 mg",
  reviewedMedia: {
    primary: {
      href: heldPackshot,
      altText: "Xenios 5-Amino-1MQ 10 mg packaging design",
      width: 1024,
      height: 1024,
    },
    packagingDesign: true,
  },
});
// The packshot and its alt text are the BPC-157 10 mg record's; the variant id is synthetic, for the reason above.
const bpc157 = variant({
  id: SYNTHETIC_VIAL_WITH_PACKSHOT,
  label: "BPC-157 10 mg",
  reviewedMedia: {
    primary: {
      href: "/research/product-media/bpc-157-xenios-10mg-render.webp",
      altText: "Xenios BPC-157 10 mg lyophilized vial packaging render",
      width: 1024,
      height: 1024,
    },
    packagingDesign: true,
  },
});

function mediaImage(host: HTMLElement) {
  const image = host.querySelector<HTMLImageElement>('[data-testid="product-media-image"]');
  if (!image) throw new Error("Product media was not mounted");
  return image;
}

function expectMediaFrame(image: HTMLImageElement) {
  expect(Array.from(image.parentElement?.classList ?? [])).toEqual(expect.arrayContaining([
    "relative", "grid", "aspect-[4/3]", "grid-cols-[minmax(0,1fr)]", "grid-rows-[minmax(0,1fr)]", "overflow-hidden",
  ]));
}

function expectAsset(host: HTMLElement, format: string) {
  const image = mediaImage(host);
  const src = image.getAttribute("src");
  expect(src).toBe("/research/product-media/" + format + ".svg");
  expect(readFileSync(resolve(process.cwd(), "client/public", src!.slice(1)), "utf8"))
    .toContain('viewBox="0 0 128 128"');
  expect(image.getAttribute("width")).toBe("128");
  expect(image.getAttribute("height")).toBe("128");
  expectMediaFrame(image);
  expect(Array.from(image.classList)).toEqual(expect.arrayContaining([
    "h-full", "min-h-0", "max-h-52", "w-full", "min-w-0", "max-w-52", "object-contain",
  ]));
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
      expect(image.getAttribute("src")).toBe("/research/product-media/bpc-157-xenios-10mg-render.webp");
      expect(image.getAttribute("alt")).toBe("Xenios BPC-157 10 mg lyophilized vial packaging render");
      expect(image.getAttribute("width")).toBe("1024");
      expect(image.getAttribute("height")).toBe("1024");
      expectMediaFrame(image);
      expect(Array.from(image.classList)).toEqual(expect.arrayContaining([
        "absolute", "inset-0", "h-full", "w-full", "object-contain",
      ]));
      expect(host.querySelector("figcaption")?.textContent).toContain("Current packaging may differ.");
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

  it("uses a neutral fallback when the packshot fails for an exact form hold", () => {
    const { host, unmount } = render(
      <ul>
        <MasterOfferingCard product={card({
          id: "mo_afb0add32da0de7426f5",
          displayName: "5-Amino-1MQ",
          subcategory: "Lyophilized Vial",
          variants: [heldVial],
        })} />
      </ul>,
    );
    try {
      const image = mediaImage(host);
      expect(image.getAttribute("src")).toBe(heldPackshot);
      expect(host.querySelector("figcaption")?.textContent).toContain("Current packaging may differ.");
      expect(host.textContent).not.toContain("Lyophilized Vial");
      act(() => { image.dispatchEvent(new Event("error")); });
      expect(expectAsset(host, "unknown").alt).toBe("5-Amino-1MQ illustration, format unconfirmed");
      expect(host.querySelector("figcaption")).toBeNull();
    } finally {
      unmount();
    }
  });

  it.each([
    { scenario: "mixed formats", variants: [vial, capsule] },
    { scenario: "a group with an unconfirmed variant", variants: [vial, heldVial] },
  ])("uses neutral artwork for $scenario", ({ variants }) => {
    const { host, unmount } = render(
      <ul><MasterOfferingCard product={card({ variants })} /></ul>,
    );
    try {
      const image = expectAsset(host, "unknown");
      expect(image.getAttribute("alt")).toContain("format unconfirmed");
      expect(host.querySelector("figcaption")).toBeNull();
    } finally {
      unmount();
    }
  });

  it("uses a generic illustration for the same variant id without reviewed media", () => {
    const unchangedId = variant({ id: bpc157.id, label: "Synthetic changed BPC listing" });
    const { host, unmount } = render(
      <MasterOfferingDetail product={detail({ displayName: "Synthetic changed listing", variants: [unchangedId] })} />,
    );
    try {
      expect(expectAsset(host, "vial").alt).toBe("Synthetic changed listing illustration, vial");
      expect(host.querySelector("figcaption")).toBeNull();
    } finally {
      unmount();
    }
  });

  it("keeps packaging status specific to the reviewed variant on detail", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail product={detail({ displayName: "BPC-157", variants: [bpc157, vial] })} />,
    );
    try {
      expect(mediaImage(host).getAttribute("src")).toBe("/research/product-media/bpc-157-xenios-10mg-render.webp");
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
