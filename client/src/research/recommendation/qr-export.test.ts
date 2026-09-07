// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jsQR from "jsqr";
import type { RecommendationLink } from "@shared/research/referral-v1";
import { createRecommendationQr, safeExportRecommendation, saveRecommendationQr } from "./qr-export";

const now = Date.parse("2026-09-07T12:00:00.000Z");
const origin = "https://research.example.invalid";
const token = `r1_${"Az09_-".repeat(7)}Q`;
const url = `${origin}/r/${token}`;

function link(overrides: Partial<RecommendationLink> = {}): RecommendationLink {
  return {
    id: "test-link",
    url,
    destinationPath: "/research",
    state: "ready",
    createdAt: "2026-09-06T12:00:00.000Z",
    expiresAt: "2026-09-08T12:00:00.000Z",
    revokedAt: null,
    opens: 0,
    accountsLinked: 0,
    ...overrides,
  };
}

/** Rasterize the delivered SVG, independently of the QR encoder's matrix. */
function rasterize(svg: string) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(document.querySelector("parsererror")).toBeNull();
  const root = document.documentElement;
  const viewBox = root.getAttribute("viewBox")!.split(" ").map(Number);
  const [left, top, size, height] = viewBox;
  expect([left, top, height]).toEqual([0, 0, size]);
  expect(Number.isInteger(size)).toBe(true);
  const background = root.querySelector("rect")!;
  expect(background.getAttribute("fill")).toBe("white");
  expect(background.getAttribute("width")).toBe(String(size));
  expect(background.getAttribute("height")).toBe(String(size));
  expect(root.querySelectorAll("path")).toHaveLength(1);
  expect(root.querySelector("image, use, script, foreignObject, [href]")).toBeNull();
  const path = root.querySelector("path")!;
  expect(path.getAttribute("fill")).toBe("black");
  const commands = path.getAttribute("d")!;
  const modules = [...commands.matchAll(/M(\d+) (\d+)h1v1h-1z/g)];
  expect(modules.length).toBeGreaterThan(0);
  expect(modules.map((module) => module[0]).join("")).toBe(commands);

  const scale = 8;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const [, colValue, rowValue] of modules) {
    const col = Number(colValue);
    const row = Number(rowValue);
    expect(col).toBeGreaterThanOrEqual(4);
    expect(row).toBeGreaterThanOrEqual(4);
    expect(col).toBeLessThan(size - 4);
    expect(row).toBeLessThan(size - 4);
    for (let y = row * scale; y < (row + 1) * scale; y++) {
      for (let x = col * scale; x < (col + 1) * scale; x++) {
        const offset = (y * width + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
    }
  }
  expect(Math.min(...modules.map((module) => Number(module[1])))).toBe(4);
  expect(Math.min(...modules.map((module) => Number(module[2])))).toBe(4);
  expect(Math.max(...modules.map((module) => Number(module[1])))).toBe(size - 5);
  expect(Math.max(...modules.map((module) => Number(module[2])))).toBe(size - 5);
  return { pixels, width, commands, size };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("recommendation QR eligibility", () => {
  it("preserves the exact canonical same-origin opaque URL", () => {
    expect(safeExportRecommendation(link(), origin, now)).toBe(url);
    expect(safeExportRecommendation(link({ expiresAt: new Date(now + 1).toISOString() }), origin, now)).toBe(url);
  });

  it("uses the browser origin and current clock by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const currentUrl = `${window.location.origin}/r/${token}`;
    expect(safeExportRecommendation(link({ url: currentUrl }))).toBe(currentUrl);
    expect(createRecommendationQr(link({ url: currentUrl }))?.url).toBe(currentUrl);
    vi.setSystemTime(Date.parse(link().expiresAt));
    expect(safeExportRecommendation(link({ url: currentUrl }))).toBeNull();
  });

  it.each(["revoked", "expired", "partner_inactive", "unavailable"] as const)("refuses the %s state even with a future expiry", (state) => {
    const unavailable = link({ state });
    expect(safeExportRecommendation(unavailable, origin, now)).toBeNull();
    expect(createRecommendationQr(unavailable, origin, now)).toBeNull();
  });

  it.each([
    { label: "revocation timestamp", patch: { revokedAt: "2026-09-07T11:00:00.000Z" } },
    { label: "missing revocation status", patch: { revokedAt: undefined } },
    { label: "past expiry", patch: { expiresAt: new Date(now - 1).toISOString() } },
    { label: "expiry at this instant", patch: { expiresAt: new Date(now).toISOString() } },
    { label: "invalid expiry", patch: { expiresAt: "not-a-date" } },
    { label: "empty expiry", patch: { expiresAt: "" } },
    { label: "infinite expiry", patch: { expiresAt: "Infinity" } },
  ])("refuses $label", ({ patch }) => {
    expect(safeExportRecommendation(link(patch), origin, now)).toBeNull();
    expect(createRecommendationQr(link(patch), origin, now)).toBeNull();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("refuses an invalid current clock (%s)", (clock) => {
    expect(safeExportRecommendation(link(), origin, clock)).toBeNull();
    expect(createRecommendationQr(link(), origin, clock)).toBeNull();
  });

  it.each([
    null,
    `/r/${token}`,
    `https://outside.example.invalid/r/${token}`,
    `http://research.example.invalid/r/${token}`,
    `${url}?source=private`,
    `${url}#private`,
    `${url}?`,
    `${url}#`,
    `${url}/`,
    `${origin}/r/r1_short`,
    `${origin}/r/r1_${"A".repeat(44)}`,
    `https://person:secret@research.example.invalid/r/${token}`,
    "javascript:alert(1)",
    `${origin}/before/../r/${token}`,
    `${origin}/before/%2e%2e/r/${token}`,
    `${origin}\\r\\${token}`,
    `https://RESEARCH.example.invalid/r/${token}`,
    `https://research.example.invalid:443/r/${token}`,
    ` ${url}`,
    `${url}\n`,
  ])("refuses unsafe or normalized URL %s", (unsafeUrl) => {
    expect(safeExportRecommendation(link({ url: unsafeUrl }), origin, now)).toBeNull();
    expect(createRecommendationQr(link({ url: unsafeUrl }), origin, now)).toBeNull();
  });
});

describe("recommendation QR image", () => {
  it.each([origin, window.location.origin])("independently decodes the SVG to the exact URL on %s", (currentOrigin) => {
    const expectedUrl = `${currentOrigin}/r/${token}`;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const network = vi.spyOn(XMLHttpRequest.prototype, "open");
    const qr = createRecommendationQr(link({ url: expectedUrl }), currentOrigin, now);
    expect(qr).not.toBeNull();
    const raster = rasterize(qr!.svg);
    expect(qr!.size).toBe(raster.size);
    expect(qr!.path).toBe(raster.commands);
    expect(qr!.url).toBe(expectedUrl);
    const decoded = jsQR(raster.pixels, raster.width, raster.width, { inversionAttempts: "dontInvert" });
    expect(decoded?.data).toBe(expectedUrl);
    expect(decoded?.binaryData).toEqual(Array.from(expectedUrl, (character) => character.charCodeAt(0)));
    expect(fetch).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
});

describe("recommendation QR local download", () => {
  const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;
  const qr = () => createRecommendationQr(link(), origin, now)!;

  beforeEach(() => {
    createObjectURL = vi.fn().mockReturnValue("blob:recommendation-qr-test");
    revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: revokeObjectURL });
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalCreateObjectURL) Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
    else delete (URL as Partial<typeof URL>).createObjectURL;
    if (originalRevokeObjectURL) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
    else delete (URL as Partial<typeof URL>).revokeObjectURL;
  });

  it("downloads the SVG Blob and cleans up the temporary URL and anchor", async () => {
    const image = qr();
    const current = vi.fn().mockReturnValue(true);
    let clickedAnchor: HTMLAnchorElement | undefined;
    click.mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchor = this;
      expect(this.isConnected).toBe(true);
      expect(this.hidden).toBe(true);
      expect(this.download).toBe("xenios-recommendation-qr.svg");
      expect(this.href).toBe("blob:recommendation-qr-test");
    });
    expect(saveRecommendationQr(image, current)).toBe(true);
    expect(current).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/svg+xml;charset=utf-8");
    const contents = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(contents).toBe(image.svg);
    expect(clickedAnchor?.isConnected).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:recommendation-qr-test");
    expect(document.querySelector("a[download]")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates no artifact when already stale", () => {
    expect(saveRecommendationQr(qr(), () => false)).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("rechecks before the click and discards an export that became stale", () => {
    const current = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(saveRecommendationQr(qr(), current)).toBe(false);
    expect(current).toHaveBeenCalledTimes(2);
    expect(click).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:recommendation-qr-test");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("cleans up when the browser rejects the download click", () => {
    click.mockImplementation(() => { throw new Error("Download unavailable"); });
    expect(saveRecommendationQr(qr(), () => true)).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:recommendation-qr-test");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("cleans up when the last eligibility check fails unexpectedly", () => {
    const current = vi.fn().mockReturnValueOnce(true).mockImplementationOnce(() => { throw new Error("Account changed"); });
    expect(saveRecommendationQr(qr(), current)).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:recommendation-qr-test");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("returns failure without clicking when Blob URL creation is unavailable", () => {
    createObjectURL.mockImplementation(() => { throw new Error("Blob URL unavailable"); });
    expect(saveRecommendationQr(qr(), () => true)).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
