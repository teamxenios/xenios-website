import type {
  OfficialSourceAdapter,
  OfficialSourceProduct,
  SourceLookupResult,
  SupplementManifestRow,
} from "./contracts";
import {
  assertOfficialUrl,
  fetchOfficialText,
  mediaFormatFromUrl,
  sha256Text,
  type FetchLike,
} from "./http";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function flattenJsonLd(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  const item = record(value);
  if (!item) return [];
  const graph = Array.isArray(item["@graph"])
    ? item["@graph"].flatMap(flattenJsonLd)
    : [];
  return [item, ...graph];
}

function productNodes(html: string): JsonRecord[] {
  const nodes: JsonRecord[] = [];
  const expression = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(html)) !== null) {
    try {
      nodes.push(...flattenJsonLd(JSON.parse(decodeHtml(match[1].trim()))));
    } catch {
      // A malformed JSON-LD block is recorded as a warning by the caller when
      // no usable Product node remains. We never evaluate embedded script.
    }
  }
  return nodes.filter((node) => {
    const type = node["@type"];
    return type === "Product" || (Array.isArray(type) && type.includes("Product"));
  });
}

function brandName(value: unknown, fallback: string): string {
  return text(value) ?? text(record(value)?.name) ?? fallback;
}

function imageDetails(value: unknown): {
  url: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
} {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "string") {
    return { url: first, width: null, height: null, alt: null };
  }
  const image = record(first);
  if (!image) return { url: null, width: null, height: null, alt: null };
  return {
    url: text(image.url) ?? text(image.contentUrl),
    width: number(image.width),
    height: number(image.height),
    alt: text(image.caption) ?? text(image.name),
  };
}

function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]).trim();
  }
  return null;
}

function identifier(node: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = text(node[key]);
    if (value) return value;
  }
  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  const offer = record(offers);
  if (!offer) return null;
  for (const key of keys) {
    const value = text(offer[key]);
    if (value) return value;
  }
  return null;
}

export class OfficialPageAdapter implements OfficialSourceAdapter {
  readonly id = "official-page-jsonld-v1";

  constructor(
    private readonly fetcher: FetchLike = globalThis.fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  supports(row: SupplementManifestRow): boolean {
    if (!row.officialProductUrl) return false;
    try {
      assertOfficialUrl(row.brand, row.officialProductUrl);
      return true;
    } catch {
      return false;
    }
  }

  async lookup(row: SupplementManifestRow): Promise<SourceLookupResult> {
    if (!row.officialProductUrl) {
      return { sourceUrl: "", candidates: [], warnings: ["No official product URL"] };
    }
    const fetched = await fetchOfficialText({
      brand: row.brand,
      url: row.officialProductUrl,
      fetcher: this.fetcher,
      accept: "text/html,application/xhtml+xml",
    });
    const retrievedAt = this.now().toISOString();
    const sourceHash = sha256Text(fetched.body);
    const nodes = productNodes(fetched.body);
    const fallbackImage = metaContent(fetched.body, "og:image");
    const fallbackTitle = metaContent(fetched.body, "og:title") ?? row.productName;
    const warnings: string[] = [];
    if (nodes.length === 0) warnings.push("No usable Product JSON-LD found; metadata fallback used");

    const sourceNodes = nodes.length > 0 ? nodes : [{ name: fallbackTitle, image: fallbackImage }];
    const candidates = sourceNodes.map((node): OfficialSourceProduct => {
      const image = imageDetails(node.image ?? fallbackImage);
      const imageUrl = image.url ? new URL(image.url, fetched.finalUrl).toString() : null;
      return {
        officialProductUrl: fetched.finalUrl.toString(),
        officialImageUrl: imageUrl,
        brand: brandName(node.brand, row.brand),
        officialProductId: identifier(node, "productID", "mpn"),
        officialVariantId: null,
        officialSku: identifier(node, "sku"),
        upc: identifier(node, "gtin", "gtin12", "gtin13", "gtin14"),
        productName: text(node.name) ?? fallbackTitle,
        variantName: null,
        packageCount: null,
        form: null,
        flavor: null,
        sizeOrWeight: null,
        width: image.width,
        height: image.height,
        format: mediaFormatFromUrl(imageUrl),
        altText: image.alt ?? text(node.name),
        retrievedAt,
        sourceAdapter: this.id,
        sourceHash,
      };
    });
    return { sourceUrl: fetched.finalUrl.toString(), candidates, warnings };
  }
}
