// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { saveRecommendationPng } from "./recommendation-png";

const qr = {
  url: "https://xeniostechnology.com/r/ref-123",
  size: 21,
  path: "M4 4h1v1h-1z",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><rect width="21" height="21" fill="white"/></svg>',
};

describe("saveRecommendationPng", () => {
  it("does not create an export after the current guard expires", async () => {
    const create = vi.spyOn(URL, "createObjectURL");
    expect(await saveRecommendationPng(qr, () => false)).toBe(false);
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });

  it("rasterises the verified SVG and downloads a PNG", async () => {
    const urls = ["blob:svg", "blob:png"];
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => urls.shift()!);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const originalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", FakeImage);
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue({ imageSmoothingEnabled: false, drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    const originalCreate = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation((name: string) => name === "canvas" ? canvas : originalCreate(name));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    expect(await saveRecommendationPng(qr, () => true)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:svg");
    expect(revoke).toHaveBeenCalledWith("blob:png");

    createElement.mockRestore();
    click.mockRestore();
    revoke.mockRestore();
    create.mockRestore();
    if (originalImage) vi.stubGlobal("Image", originalImage);
  });
});
