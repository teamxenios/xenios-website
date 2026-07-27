import source from "../../../content/research-products/v3-supplement-candidates.json";

type SupplementCandidate = {
  Brand: string;
  Product: string;
  Category: string;
  "Format State": string;
  "Size / Count State": string;
  "Flavor State": string;
  "Subscription State": string;
  "Supplier / Reseller State": string;
  "Public Catalog State": string;
};

type SupplementDocument = {
  schemaVersion: 1;
  source: string;
  candidates: SupplementCandidate[];
};

export type V3PublicSupplement = {
  id: string;
  brand: string;
  displayName: string;
  category: string;
  publicState: "coming_soon";
  formatState: "pending_confirmation";
  sizeState: "pending_confirmation";
  flavorState: "pending_if_applicable";
  subscriptionState: "disabled";
  supplierState: "relationship_pending";
  pairingState: "review_pending";
  price: null;
  sku: null;
  primaryCta: "Notify me";
  secondaryCta: "Request sourcing";
};

const document = source as SupplementDocument;

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadSupplements(): readonly V3PublicSupplement[] {
  if (document.schemaVersion !== 1 || document.candidates.length !== 62) {
    throw new Error("The V3 supplement candidate register must contain 62 rows.");
  }
  const ids = new Set<string>();
  const items = document.candidates.map((candidate) => {
    if (
      !candidate.Brand.trim() ||
      !candidate.Product.trim() ||
      !candidate.Category.trim() ||
      !/pending/i.test(candidate["Format State"]) ||
      !/pending/i.test(candidate["Size / Count State"]) ||
      !/pending/i.test(candidate["Flavor State"]) ||
      !/disabled/i.test(candidate["Subscription State"]) ||
      !/(pending|candidate)/i.test(candidate["Supplier / Reseller State"]) ||
      !/coming soon/i.test(candidate["Public Catalog State"])
    ) {
      throw new Error(`Unsafe V3 supplement candidate: ${candidate.Product}`);
    }
    const id = `${slug(candidate.Brand)}--${slug(candidate.Product)}`;
    if (!id || ids.has(id)) {
      throw new Error(`Duplicate V3 supplement identity: ${id}`);
    }
    ids.add(id);
    return Object.freeze({
      id,
      brand: candidate.Brand.trim(),
      displayName: candidate.Product.trim(),
      category: candidate.Category.trim(),
      publicState: "coming_soon" as const,
      formatState: "pending_confirmation" as const,
      sizeState: "pending_confirmation" as const,
      flavorState: "pending_if_applicable" as const,
      subscriptionState: "disabled" as const,
      supplierState: "relationship_pending" as const,
      pairingState: "review_pending" as const,
      price: null,
      sku: null,
      primaryCta: "Notify me" as const,
      secondaryCta: "Request sourcing" as const,
    });
  });
  return Object.freeze(items);
}

export const v3PublicSupplements = loadSupplements();

export function searchV3Supplements(query = ""): V3PublicSupplement[] {
  const normalized = query.trim().toLocaleLowerCase("en-US");
  if (!normalized) return [...v3PublicSupplements];
  return v3PublicSupplements.filter((item) =>
    [item.displayName, item.brand, item.category]
      .join(" ")
      .toLocaleLowerCase("en-US")
      .includes(normalized),
  );
}
