// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PRODUCT_MEDIA_REPRESENTATION_CAPTIONS } from "@shared/research/master-offerings/approved-content";
import { ProductMedia } from "./ProductMedia";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// One synthetic vial variant, added to the real format map for this file only. The first test is about what the
// component falls back to for a variant whose format is "vial" and whose form is not held. It used a real catalog row
// for that and so failed whenever that row was put in the form-hold map. A synthetic id is in no hold map.
vi.mock("./product-media-format.generated.json", async (importOriginal) => {
  const real = (await importOriginal<{ default: { formatByVariantId: Record<string, string> } }>()).default;
  return { default: { ...real, formatByVariantId: { ...real.formatByVariantId, mov_synthetic_vial_packshot: "vial" } } };
});

it("shows reviewed artwork and its disclosure, then drops its label link on fallback", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const primary = {
    href: "/research/product-media/bpc-157-xenios-10mg-render.webp",
    altText: "Xenios BPC-157 10 mg packaging render",
    width: 1024,
    height: 1024,
  };
  const labelPreview = {
    href: "/research/product-media/bpc-157-xenios-10mg-front-label.webp",
    altText: "Xenios BPC-157 10 mg front label artwork",
    width: 1600,
    height: 1000,
  };
  try {
    await act(async () => root.render(
      <ProductMedia productName="BPC-157" variantIds={["mov_synthetic_vial_packshot"]}
        reviewedMedia={{ primary, labelPreview, packagingDesign: true }} detail />,
    ));
    const image = host.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(primary.href);
    expect(image.alt).toBe(primary.altText);
    expect(image.width).toBe(1024);
    expect(host.querySelector("figcaption")?.textContent).toContain("Packaging design shown.");
    expect(host.querySelector("a")?.getAttribute("href")).toBe(labelPreview.href);
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/research/product-media/vial.svg");
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelector("figcaption")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("says a flat label is a label design, and adds nothing to a supplier photograph", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const primary = { href: "/research/product-media/synthetic-label-card.webp", altText: "Synthetic label design", width: 1024, height: 1024 };
  const labelPreview = { href: "/research/product-media/synthetic-label.webp", altText: "Synthetic front label", width: 1600, height: 1000 };
  try {
    await act(async () => root.render(
      <ProductMedia productName="Synthetic" variantIds={["mov_synthetic"]}
        reviewedMedia={{ primary, labelPreview, packagingDesign: false }} />,
    ));
    expect(host.querySelector("figcaption")?.textContent).toBe("Label design shown. This is not a photograph of the product.");
    await act(async () => root.render(
      <ProductMedia productName="Synthetic" variantIds={["mov_synthetic"]}
        reviewedMedia={{ primary, packagingDesign: false }} />,
    ));
    expect(host.querySelector("figcaption")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("captions a studio image by what it is, once, directly under the image, and keeps the flat label as the alternative", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const primary = { href: "/research/product-media/synthetic-studio.webp", altText: "Synthetic studio design", width: 1024, height: 1024 };
  const labelPreview = { href: "/research/product-media/synthetic-label.webp", altText: "Synthetic front label", width: 1600, height: 1000 };
  // The wording is the shared constant's; this test pins placement and choice, not words.
  const expected = PRODUCT_MEDIA_REPRESENTATION_CAPTIONS;
  expect(Object.keys(expected).sort()).toEqual(["catalog_reference", "proposed_carton", "proposed_vial"]);
  try {
    for (const representation of Object.keys(expected) as (keyof typeof expected)[]) {
      // packagingDesign is set to true here on purpose: a studio record's caption comes from its representation alone.
      await act(async () => root.render(
        <ProductMedia productName="Synthetic" variantIds={["mov_synthetic"]}
          reviewedMedia={{ primary, labelPreview, packagingDesign: true, representation }} detail />,
      ));
      const captions = host.querySelectorAll("figcaption");
      expect(captions).toHaveLength(1);
      expect(captions[0].textContent).toBe(expected[representation]);
      expect(captions[0].getAttribute("data-representation")).toBe(representation);
      // The caption is the figure's next child after the image box, at every width; no breakpoint moves it.
      expect(captions[0].previousElementSibling?.querySelector("img")?.getAttribute("src")).toBe(primary.href);
      expect(captions[0].className).not.toMatch(/\b(sm|md|lg|xl):/);
      expect(host.querySelector("a")?.textContent).toBe("View front label artwork");
    }
    // A new studio carton has no flat label: its caption, and no label link.
    await act(async () => root.render(
      <ProductMedia productName="Synthetic" variantIds={["mov_synthetic"]}
        reviewedMedia={{ primary, packagingDesign: false, representation: "proposed_carton" }} detail />,
    ));
    expect([...host.querySelectorAll("figcaption")].map((node) => node.textContent)).toEqual([expected.proposed_carton]);
    expect(host.querySelector("a")).toBeNull();
    await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("figcaption")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
