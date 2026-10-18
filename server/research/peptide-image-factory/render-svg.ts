import {
  GENERATED_RENDER_PROVENANCE,
  GENERATED_RENDER_SOURCE_TYPE,
  type PeptideMediaPlanEntry,
  type PeptideVisualTemplate,
} from "./contracts";

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char] as string);
}

function splitLabel(value: string, max = 28): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > max && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export function baseAssetFor(entry: PeptideMediaPlanEntry): string {
  return entry.container === "capsule_bottle"
    ? "../templates/neutral-capsule-bottle-base.png"
    : "../templates/neutral-vial-base.png";
}

export function reviewFilename(entry: PeptideMediaPlanEntry, template = entry.template): string {
  const prefix = template === "renew_360" ? "renew360" : "rawpeptides";
  return `${prefix}-${entry.sku.toLowerCase().replace(/_/g, "-")}-v1.svg`;
}

export function renderPeptideReviewSvg(
  entry: PeptideMediaPlanEntry,
  template: PeptideVisualTemplate = entry.template,
): string {
  const brand = template === "renew_360" ? "XENIOS  /  RENEW 360" : "RAW PEPTIDES  /  INTERNAL EVIDENCE";
  const reviewLine = template === "renew_360"
    ? "REVIEW ASSET  •  NOT APPROVED FOR PUBLICATION"
    : "RIGHTS REVIEW PENDING  •  INTERNAL ONLY";
  const nameLines = splitLabel(entry.productName).map((line, index) =>
    `<text x="512" y="${485 + index * 31}" class="name">${xml(line)}</text>`,
  ).join("\n");
  const detailY = 485 + splitLabel(entry.productName).length * 31 + 12;
  const labelText = [brand, entry.productName, entry.strength, entry.presentation, entry.sku, reviewLine].join(" | ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"
  role="img" aria-label="${xml(labelText)}" data-source-type="${GENERATED_RENDER_SOURCE_TYPE}"
  data-provenance="${GENERATED_RENDER_PROVENANCE}" data-visual-state="review_pending">
  <metadata>${xml(JSON.stringify({
    variantId: entry.variantId,
    sku: entry.sku,
    strength: entry.strength,
    sourceWorkbookSha256: entry.sourceWorkbookSha256,
    sourceType: GENERATED_RENDER_SOURCE_TYPE,
    provenanceTag: GENERATED_RENDER_PROVENANCE,
    publicStatus: "HELD",
  }))}</metadata>
  <style>
    .brand{font:700 17px Arial,sans-serif;letter-spacing:1.2px;fill:#fff;text-anchor:middle}
    .name{font:700 24px Arial,sans-serif;fill:#0a0a0a;text-anchor:middle}
    .strength{font:700 36px Arial,sans-serif;fill:#0a0a0a;text-anchor:middle}
    .meta{font:600 15px Arial,sans-serif;fill:#26313a;text-anchor:middle;letter-spacing:.4px}
    .sku{font:600 12px Arial,sans-serif;fill:#26313a;text-anchor:middle;letter-spacing:.1px}
    .hold{font:700 12px Arial,sans-serif;fill:#8a2f21;text-anchor:middle;letter-spacing:.7px}
  </style>
  <image href="${baseAssetFor(entry)}" x="0" y="0" width="1024" height="1024"/>
  <rect x="315" y="405" width="394" height="285" rx="14" fill="#fff" stroke="#c8cfd6" stroke-width="3"/>
  <rect x="315" y="405" width="394" height="52" rx="14" fill="#0b1b2b"/>
  <rect x="315" y="443" width="394" height="14" fill="#0b1b2b"/>
  <text x="512" y="439" class="brand">${xml(brand)}</text>
  ${nameLines}
  <text x="512" y="${detailY + 34}" class="strength">${xml(entry.strength)}</text>
  <text x="512" y="${detailY + 62}" class="meta">${xml(entry.presentation)}</text>
  <text x="512" y="${detailY + 87}" class="sku">${xml(entry.sku)}</text>
  <line x1="342" y1="${detailY + 101}" x2="682" y2="${detailY + 101}" stroke="#c8cfd6"/>
  <text x="512" y="${detailY + 121}" class="hold">${xml(reviewLine)}</text>
</svg>`;
}
