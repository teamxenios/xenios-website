import type {
  PublicLotDocumentStatus,
  PublicLotDocumentType,
  PublicLotStatus,
  PublicQualityTestCategory,
} from "@shared/research/quality/public-lot";

export const QUALITY_PROCESS = [
  {
    title: "Receive",
    body: "Inbound material is matched to the expected shipment and receiving record before it enters usable inventory.",
  },
  {
    title: "Inspect",
    body: "Packaging, quantity, labeling, condition, and shipment exceptions are recorded against the received material.",
  },
  {
    title: "Identify the lot",
    body: "The exact SKU and supplier lot are bound to a controlled internal lot record so later evidence cannot drift to another batch.",
  },
  {
    title: "Quarantine",
    body: "Material remains outside released inventory while required documentation and applicable test evidence are reviewed.",
  },
  {
    title: "Review evidence",
    body: "Required documents and third-party testing, where applicable, are checked for lot identity, method, sample, dates, issuing party, specification, and exceptions—not a headline number alone.",
  },
  {
    title: "Decide",
    body: "An authorized review records release, hold, continued quarantine, or withdrawal. Missing evidence is never treated as a pass.",
  },
  {
    title: "Publish approved records",
    body: "Only explicitly approved public summaries, COAs, and supporting documents may appear in lot verification. Private source records remain private.",
  },
  {
    title: "Store and fulfill",
    body: "Released inventory remains lot-traceable through storage, reservation, fulfillment, and any documented deviation, exception, or withdrawal.",
  },
] as const;

export const TESTING_CATEGORIES = [
  {
    title: "Identity",
    body: "Addresses whether the tested sample matches the represented material. It does not establish amount, sterility, or suitability.",
  },
  {
    title: "Purity",
    body: "Describes the proportion of detected material attributed to a target under a stated method. It does not prove identity by itself.",
  },
  {
    title: "Assay or content",
    body: "Measures the amount present against a stated specification or label claim where that measurement is applicable.",
  },
  {
    title: "Microbial, sterility, or endotoxin",
    body: "Distinct tests with distinct methods and limits. None should be inferred from a purity result or a generic certificate.",
  },
  {
    title: "Contaminant panels",
    body: "Heavy metals, residual solvents, and other panels are product- and risk-specific. A panel only covers what it actually measures.",
  },
  {
    title: "Stability and handling",
    body: "Storage, retest, and shelf-life claims require evidence designed for those questions; a release test is not automatically stability data.",
  },
] as const;

export const TEST_CATEGORY_LABELS: Record<PublicQualityTestCategory, string> = {
  identity: "Identity",
  purity: "Purity",
  assay_or_content: "Assay or content",
  sterility: "Sterility",
  endotoxin: "Endotoxin",
  microbial: "Microbial",
  heavy_metals: "Heavy metals",
  residual_solvents: "Residual solvents",
  other: "Other documented review",
};

export const LOT_STATUS_LABELS: Record<PublicLotStatus, string> = {
  released: "Released",
  quarantined: "Quarantined",
  held: "Held",
  documentation_pending: "Documentation pending",
  withdrawn: "Withdrawn",
};

export const DOCUMENT_STATUS_LABELS: Record<PublicLotDocumentStatus, string> = {
  available: "Available",
  pending: "Pending review",
  replaced: "Replaced",
  withdrawn: "Withdrawn",
  expired: "Expired",
  missing: "Missing",
};

export const DOCUMENT_TYPE_LABELS: Record<PublicLotDocumentType, string> = {
  certificate_of_analysis: "Certificate of analysis",
  identity_report: "Identity report",
  quality_summary: "Quality summary",
  other: "Approved quality document",
};

export function formatQualityDate(value: string | null): string {
  if (value === null) return "Not published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not published";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
