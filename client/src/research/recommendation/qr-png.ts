import type { RecommendationQr } from "./qr-export";
/** Parse only the exact matrix path produced by createRecommendationQr. Never arbitrary SVG. */
export function qrCells(qr: Pick<RecommendationQr, "size" | "path">): Array<[number, number]> {
  if (!Number.isInteger(qr.size) || qr.size < 29 || qr.size > 185) throw new Error("Invalid QR matrix");
  if (typeof qr.path !== "string" || qr.path.length > 600000) throw new Error("Invalid QR path");
  const pattern = /M(\d+) (\d+)h1v1h-1z/g;
  const cells: Array<[number, number]> = []; const seen = new Set<string>(); let at = 0;
  for (const m of qr.path.matchAll(pattern)) {
    if (m.index !== at) throw new Error("Invalid QR path");
    const x = Number(m[1]), y = Number(m[2]);
    if (x < 4 || y < 4 || x >= qr.size - 4 || y >= qr.size - 4 || seen.has(`${x},${y}`)) throw new Error("Invalid QR cell");
    seen.add(`${x},${y}`); cells.push([x, y]); at += m[0].length;
  }
  if (!cells.length || at !== qr.path.length) throw new Error("Invalid QR path");
  return cells;
}
export function paintQr(canvas: HTMLCanvasElement, qr: RecommendationQr, scale = 8): void {
  if (!Number.isInteger(scale) || scale < 4 || scale > 16) throw new Error("Invalid QR scale");
  const cells = qrCells(qr);
  canvas.width = canvas.height = qr.size * scale;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas is unavailable");
  context.imageSmoothingEnabled = false; context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#000000";
  for (const [x, y] of cells) context.fillRect(x * scale, y * scale, scale, scale);
}
export async function recommendationPng(qr: RecommendationQr, current: () => boolean, scale = 8): Promise<Blob | null> {
  if (!current()) return null;
  const canvas = document.createElement("canvas"); paintQr(canvas, qr, scale);
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    try { canvas.toBlob(resolve, "image/png"); } catch (e) { reject(e); }
  });
  canvas.width = canvas.height = 0;
  return current() && blob?.type === "image/png" ? blob : null;
}
/** No success is reported as OS delivery. This requests a browser-local save only. */
export function saveLocalFile(blob: Blob, name: string, current: () => boolean): boolean {
  if (!current() || !/^xenios-[a-z0-9-]+\.(png|svg)$/.test(name)) return false;
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  try {
    anchor.href = url; anchor.download = name; anchor.hidden = true; document.body.append(anchor);
    if (!current()) return false;
    anchor.click(); return true;
  } finally {
    anchor.remove(); // Defer revocation so the browser can consume the download URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
