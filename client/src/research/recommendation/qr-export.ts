import qrcode from "qrcode-generator";
import type { RecommendationLink } from "@shared/research/referral-v1";
import { safeRecommendationUrl } from "./share";

export interface RecommendationQr { url: string; size: number; path: string; svg: string }

/** An export is a representation of the existing public URL, never a new link. */
export function safeExportRecommendation(link: RecommendationLink, origin = window.location.origin, now = Date.now()): string | null {
  if (link.state !== "ready" || link.revokedAt !== null || !Number.isFinite(now)
    || !Number.isFinite(Date.parse(link.expiresAt)) || Date.parse(link.expiresAt) <= now) return null;
  const url = safeRecommendationUrl(link.url, origin);
  // Do not silently normalize/rewrite the server's opaque URL for export.
  return url !== null && url === link.url && !url.includes("?") && !url.includes("#") ? url : null;
}

export function createRecommendationQr(link: RecommendationLink, origin = window.location.origin, now = Date.now()): RecommendationQr | null {
  const url = safeExportRecommendation(link, origin, now);
  if (!url) return null;
  try {
    const code = qrcode(0, "M");
    code.addData(url, "Byte");
    code.make();
    const modules = code.getModuleCount();
    const size = modules + 8; // Four-module white quiet zone on every side.
    let path = "";
    for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) {
      if (code.isDark(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" role="img" aria-label="Xenios recommendation QR code"><rect width="${size}" height="${size}" fill="white"/><path d="${path}" fill="black" shape-rendering="crispEdges"/></svg>`;
    return { url, size, path, svg };
  } catch { return null; }
}

/** User-initiated local download. No remote QR service, storage or telemetry. */
export function saveRecommendationQr(qr: RecommendationQr, isCurrent: () => boolean): boolean {
  let objectUrl: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    if (!isCurrent()) return false;
    objectUrl = URL.createObjectURL(new Blob([qr.svg], { type: "image/svg+xml;charset=utf-8" }));
    anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "xenios-recommendation-qr.svg";
    anchor.hidden = true;
    document.body.append(anchor);
    if (!isCurrent()) return false;
    anchor.click();
    return true;
  } catch { return false; }
  finally {
    anchor?.remove();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
