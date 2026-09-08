import type { RecommendationQr } from "../../recommendation/qr-export";

/** Rasterises a verified QR SVG locally; it never fetches or creates a link. */
export async function saveRecommendationPng(qr: RecommendationQr, isCurrent: () => boolean): Promise<boolean> {
  let svgUrl: string | null = null;
  let pngUrl: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    if (!isCurrent()) return false;
    svgUrl = URL.createObjectURL(new Blob([qr.svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("qr_svg_decode_failed")); });
    image.src = svgUrl;
    await loaded;
    if (!isCurrent()) return false;
    const canvas = document.createElement("canvas");
    const pixels = Math.max(1, qr.size * 8);
    canvas.width = pixels; canvas.height = pixels;
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, pixels, pixels);
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob || !isCurrent()) return false;
    pngUrl = URL.createObjectURL(pngBlob);
    anchor = document.createElement("a");
    anchor.href = pngUrl; anchor.download = "xenios-recommendation-qr.png"; anchor.hidden = true;
    document.body.append(anchor);
    if (!isCurrent()) return false;
    anchor.click();
    return true;
  } catch { return false; }
  finally { anchor?.remove(); if (svgUrl) URL.revokeObjectURL(svgUrl); if (pngUrl) URL.revokeObjectURL(pngUrl); }
}
