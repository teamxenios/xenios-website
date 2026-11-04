// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ProductMedia } from "./ProductMedia";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
      <ProductMedia productName="BPC-157" variantIds={["mov_ca3e45ae9712aee91430"]}
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
