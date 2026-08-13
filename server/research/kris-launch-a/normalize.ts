import crypto from "crypto";
import {
  isKrisChannel,
  isKrisFamily,
  type KrisChannel,
  type KrisFamily,
} from "@shared/research/kris-launch-a/contract";

/**
 * Turn the two private workbooks into one member-safe Launch A catalog.
 *
 * The master catalog is the authority for identity, family, channel,
 * specification, dosage form and MOQ. The Kris workbook is the ONLY price
 * authority, and the master's own "Suggested Sell Price" is deliberately never
 * read: it is not what Kris pays.
 *
 * Everything member-facing is built by explicit field picks. There is no spread
 * of a raw row anywhere in this file, so a new private column added to the
 * workbook next month cannot leak by default. It has to be picked up by hand.
 */

/** Every master column that must never reach a browser, by exact header. */
export const KRIS_PRIVATE_MASTER_COLUMNS: readonly string[] = [
  "Selected Supplier",
  "Buy Cost / Unit",
  "Original Quote",
  "Suggested Sell Price",
  "Gross Profit / Unit",
  "Gross Margin %",
  "Alternative Supplier",
  "Alternative Cost / Unit",
  "Savings vs Alternative",
  "Offers Compared",
  "Suppliers Compared",
  "Overlap Type",
  "Selection Rationale",
  "Recommended Action",
  "Source File",
  "Source Location",
  "Supplier Notes",
  "Supplier Variant / Format",
  "Exact Planned Matches",
  "Related Planned Matches",
  "Planned Catalog Status",
  // Reads like regulatory metadata and is not. In 52 of the 420 rows it names
  // the supplier outright ("Alpha BioMed price list provides tiered pricing
  // but does not state dosage form..."), so the whole column is private. The
  // member-facing text is the Kris workbook's Access / Notes.
  "Quality / Regulatory Notes",
];

const FAMILY_BY_LABEL: Readonly<Record<string, KrisFamily>> = {
  "503A Clinical Formulations": "clinical_formulations_503a",
  "Research Capsules": "research_capsules",
  "Research Peptides & Materials": "research_peptides_and_materials",
  "Research Supplies": "research_supplies",
  "Shipping & Fulfillment": "shipping_and_fulfillment",
  Supplements: "supplements",
  "Topicals & Regenerative": "topicals_and_regenerative",
};

const CHANNEL_BY_LABEL: Readonly<Record<string, KrisChannel>> = {
  "Clinical / Provider Only": "clinical_provider_only",
  "RUO Research": "ruo_research",
  "Supplier Catalog / Classification Pending": "classification_pending",
  Supplement: "supplement",
  "Nonclinical / Topical": "nonclinical_topical",
};

export interface RawKrisRow {
  sheetRow: number;
  [column: string]: string | number;
}

export interface NormalizedKrisItem {
  id: string;
  slug: string;
  groupId: string;
  displayName: string;
  specification: string;
  family: KrisFamily;
  channel: KrisChannel;
  format: string;
  packBasis: string;
  moq: number | null;
  dosageForm: string | null;
  suppliedNote: string;
  /** Cents, or null when the sheet has no price yet. Never zero for "unknown". */
  priceAmountCents: number | null;
  priceCurrency: string;
  priceDisplay: string | null;
}

export interface KrisNormalizationIssue {
  code:
    | "unknown_family"
    | "unknown_channel"
    | "unmatched_kris_row"
    | "unmatched_master_row"
    | "duplicate_join_key"
    | "unparsable_price"
    | "zero_price";
  sheetRow: number;
  message: string;
}

export interface NormalizedKrisCatalog {
  items: readonly NormalizedKrisItem[];
  issues: readonly KrisNormalizationIssue[];
  masterRowCount: number;
  krisRowCount: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function joinKey(
  family: string,
  channel: string,
  product: string,
  specification: string,
): string {
  const fold = (value: string) =>
    value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  return [fold(family), fold(channel), fold(product), fold(specification)].join("|");
}

export function krisSlug(family: KrisFamily, product: string, specification: string): string {
  const base = `${product} ${specification === product ? "" : specification}`.trim();
  const slug = base
    .normalize("NFKD")
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${family.replace(/_/g, "-")}-${slug || "item"}`;
}

/**
 * Parse a price cell into whole cents.
 *
 * Refuses anything that is not a plain positive amount. A blank is not an
 * error, it is the pending state. A zero IS an error: the brief is explicit
 * that no item may render as $0, and a sheet that says 0 is telling us
 * something we do not yet understand rather than that the item is free.
 */
export function parseKrisPrice(
  raw: string,
): { ok: true; amountCents: number | null } | { ok: false; reason: "unparsable" | "zero" } {
  const value = raw.replace(/[$,\s]/g, "");
  if (value === "") return { ok: true, amountCents: null };
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return { ok: false, reason: "unparsable" };
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) return { ok: false, reason: "zero" };
  return { ok: true, amountCents: cents };
}

function moqOf(raw: string): number | null {
  const value = raw.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeKrisLaunchA(
  masterRows: readonly RawKrisRow[],
  krisRows: readonly RawKrisRow[],
): NormalizedKrisCatalog {
  const issues: KrisNormalizationIssue[] = [];

  const masterByKey = new Map<string, RawKrisRow>();
  for (const row of masterRows) {
    const key = joinKey(
      text(row["Family"]),
      text(row["Channel"]),
      text(row["Product"]),
      text(row["Normalized Specification"]),
    );
    if (masterByKey.has(key)) {
      issues.push({
        code: "duplicate_join_key",
        sheetRow: row.sheetRow,
        message: `Two master rows share the identity ${key}. Reconcile before activation.`,
      });
      continue;
    }
    masterByKey.set(key, row);
  }

  const items: NormalizedKrisItem[] = [];
  const usedMasterKeys = new Set<string>();
  const seenSlugs = new Map<string, number>();

  // The Kris workbook drives the universe. An item Kris cannot see is not part
  // of Launch A even if the master carries it.
  for (const row of krisRows) {
    const familyLabel = text(row["Family"]);
    const channelLabel = text(row["Channel"]);
    const product = text(row["Product"]);
    const specification = text(row["Specification"]);

    const family = FAMILY_BY_LABEL[familyLabel];
    if (!isKrisFamily(family)) {
      issues.push({
        code: "unknown_family",
        sheetRow: row.sheetRow,
        message: `Family ${JSON.stringify(familyLabel)} is not in the closed vocabulary.`,
      });
      continue;
    }
    const channel = CHANNEL_BY_LABEL[channelLabel];
    if (!isKrisChannel(channel)) {
      issues.push({
        code: "unknown_channel",
        sheetRow: row.sheetRow,
        message: `Channel ${JSON.stringify(channelLabel)} is not in the closed vocabulary.`,
      });
      continue;
    }

    const key = joinKey(familyLabel, channelLabel, product, specification);
    const master = masterByKey.get(key);
    if (master === undefined) {
      issues.push({
        code: "unmatched_kris_row",
        sheetRow: row.sheetRow,
        message: `No master catalog row matches ${product} / ${specification}.`,
      });
    } else {
      usedMasterKeys.add(key);
    }

    const parsed = parseKrisPrice(text(row["Kris Volume Price"]));
    if (!parsed.ok) {
      issues.push({
        code: parsed.reason === "zero" ? "zero_price" : "unparsable_price",
        sheetRow: row.sheetRow,
        message: `Price ${JSON.stringify(text(row["Kris Volume Price"]))} is not a usable amount.`,
      });
      continue;
    }

    // Identity comes from the master's Group ID when the row is matched, which
    // is stable across a reprice. An unmatched row falls back to its own
    // identity so it is still addressable rather than dropped silently.
    const groupId = master ? text(master["Group ID"]) : "";
    const identity = groupId !== "" ? `group:${groupId}` : `kris:${key}`;
    const id = `kli_${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 20)}`;

    let slug = krisSlug(family, product, specification);
    const seen = seenSlugs.get(slug) ?? 0;
    seenSlugs.set(slug, seen + 1);
    if (seen > 0) slug = `${slug}-${id.slice(-6)}`;

    items.push({
      id,
      slug,
      groupId,
      displayName: product,
      specification,
      family,
      channel,
      format: text(row["Format"]),
      packBasis: text(row["Pack / Price Basis"]),
      moq: moqOf(text(row["MOQ"])),
      dosageForm: master ? text(master["Dosage Form"]) || null : null,
      suppliedNote: text(row["Access / Notes"]),
      priceAmountCents: parsed.amountCents,
      priceCurrency: "USD",
      priceDisplay:
        parsed.amountCents === null
          ? null
          : `$${(parsed.amountCents / 100).toFixed(2)}`,
    });
  }

  for (const [key, row] of Array.from(masterByKey.entries())) {
    if (usedMasterKeys.has(key)) continue;
    issues.push({
      code: "unmatched_master_row",
      sheetRow: row.sheetRow,
      message: `Master row ${text(row["Product"])} is not in the Kris catalog and is excluded from Launch A.`,
    });
  }

  items.sort((left, right) =>
    `${left.family}|${left.displayName}|${left.slug}`.localeCompare(
      `${right.family}|${right.displayName}|${right.slug}`,
    ),
  );

  return {
    items,
    issues,
    masterRowCount: masterRows.length,
    krisRowCount: krisRows.length,
  };
}
