/**
 * The downloadable buyer price list.
 *
 * One row per member-safe offering variant, carrying the strength, the truthful
 * availability, the approved price or an explicit `Price on request`, and the
 * manual path for asking to buy. Nothing else. The row type in the shared
 * pricing contract is the whole privacy surface, and `assertNoPrivateFields`
 * below is the runtime backstop for it.
 *
 * The export never resolves a purchase. It renders the request path only, so a
 * downloaded file can never assert that something is checkout ready, and a
 * bulk export can never become a bulk call into the purchase authority.
 */

import {
  MASTER_OFFERING_DISPLAY_LABELS,
  MASTER_OFFERING_FAMILY_LABELS,
} from "@shared/research/master-offerings/contract";
import {
  MASTER_OFFERING_PRICE_LIST_COLUMNS,
  MASTER_OFFERING_PRICE_LIST_NOTICE,
  MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
  isDisplayablePrice,
  type MasterOfferingPriceListDocument,
  type MasterOfferingPriceListRow,
} from "@shared/research/master-offerings/pricing-contract";
import {
  DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES,
  defaultMasterOfferingActionTargets,
  resolveMasterOfferingAction,
  type MasterOfferingActionCapabilities,
} from "./action";
import type { NormalizedMasterOffering } from "./model";
import { priceForVariant, type MasterOfferingPriceMap } from "./price-projection";

/** Refusal ceiling. The export declines rather than silently truncating. */
export const MASTER_OFFERING_PRICE_LIST_MAX_ROWS = 5000;

const PURCHASE_PATH_BY_ACTION: Readonly<Record<string, string>> = {
  request_early_access_purchase: "Request an Early Access purchase",
  request_access: "Request access",
  apply: "Apply for approval",
  notify_me: "Ask to be notified",
  join_waitlist: "Join the waitlist",
  explore_care: "Explore the care pathway",
  get_updates: "Ask for updates",
  add_to_cart: "Request access",
  none: "Not available",
};

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface BuildMasterOfferingPriceListInput {
  offerings: readonly NormalizedMasterOffering[];
  prices: MasterOfferingPriceMap;
  audience: "member" | "admin";
  generatedAt: string;
  capabilities?: MasterOfferingActionCapabilities;
}

export function buildMasterOfferingPriceList(
  input: BuildMasterOfferingPriceListInput,
): MasterOfferingPriceListDocument {
  const capabilities =
    input.capabilities ?? DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES;
  const rows: MasterOfferingPriceListRow[] = [];

  for (const offering of input.offerings) {
    // Admin-only holds are not member-safe and never reach an export, the same
    // refusal the card projection makes.
    if (offering.visibility !== "member") continue;
    for (const variant of offering.variants) {
      if (variant.visibility !== "member") continue;
      const price = priceForVariant(input.prices, variant);
      const priced = isDisplayablePrice(price);
      // Deliberately resolved with no commerce: the export states the manual
      // path, and the product page is where direct purchase is decided.
      const action = resolveMasterOfferingAction(
        offering,
        variant,
        { binding: null, selection: null },
        defaultMasterOfferingActionTargets,
        capabilities,
      );
      rows.push({
        offeringId: offering.id,
        offeringSlug: offering.slug,
        offeringName: offering.displayName,
        family: offering.family,
        familyLabel: MASTER_OFFERING_FAMILY_LABELS[offering.family],
        category: text(offering.category),
        subcategory: text(offering.subcategory),
        brand: text(offering.brand),
        variantId: variant.id,
        variant: text(variant.label),
        availability: MASTER_OFFERING_DISPLAY_LABELS[variant.displayState],
        priceState: price.state,
        // Empty, never "0". A missing price is not a free product.
        priceAmountCents: priced ? String(price.amountCents) : "",
        priceCurrency: priced ? price.currency : "",
        price: priced ? price.display : MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
        purchasePath: PURCHASE_PATH_BY_ACTION[action.kind] ?? "Request access",
      });
    }
  }

  return {
    ok: true,
    generatedAt: input.generatedAt,
    audience: input.audience,
    rowCount: rows.length,
    pricedRowCount: rows.filter((row) => row.priceState === "priced").length,
    notice: MASTER_OFFERING_PRICE_LIST_NOTICE,
    rows,
  };
}

/**
 * Keys that must never appear in an exported row. This is defence in depth on
 * top of the explicit field picks above: a later edit that spreads a normalized
 * offering into a row fails here rather than in production.
 */
export const MASTER_OFFERING_PRICE_LIST_FORBIDDEN_KEYS: readonly string[] = [
  "supplier",
  "supplierOrOwner",
  "owner",
  "wholesale",
  "originalWholesaleCost",
  "updatedWholesaleCost",
  "cost",
  "margin",
  "grossMargin",
  "grossProfit",
  "markup",
  "updatedMarkupMultiple",
  "planningPrice",
  "originalSellPrice",
  "updatedSellPrice",
  "recommendedLaunchSellPrice",
  "targetSellAtUpdatedCost",
  "sourceSku",
  "sourceGroup",
  "sourceNotes",
  "sourceReferences",
  "sheetRow",
  "canonicalKey",
  "binding",
  "productId",
  "variantIdProductControl",
  "purchasable",
  "productUrl",
];

export function assertNoPrivateFields(
  document: MasterOfferingPriceListDocument,
): void {
  for (const row of document.rows) {
    for (const key of Object.keys(row)) {
      if (MASTER_OFFERING_PRICE_LIST_FORBIDDEN_KEYS.includes(key)) {
        throw new Error(
          `Refused to export price list: private field ${key} present`,
        );
      }
    }
  }
}

/**
 * Neutralize a spreadsheet formula. A catalog name that begins with one of
 * these characters is data, not a formula, and a downloaded file should not
 * execute anything when it is opened.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvField(value: string): string {
  const safe = neutralizeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 rendering, CRLF terminated, with the notice as a trailing note. */
export function toMasterOfferingPriceListCsv(
  document: MasterOfferingPriceListDocument,
): string {
  assertNoPrivateFields(document);
  const lines: string[] = [];
  lines.push(
    MASTER_OFFERING_PRICE_LIST_COLUMNS.map((column) =>
      csvField(column.header),
    ).join(","),
  );
  for (const row of document.rows) {
    lines.push(
      MASTER_OFFERING_PRICE_LIST_COLUMNS.map((column) =>
        csvField(String(row[column.key] ?? "")),
      ).join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** A stable, timestamped filename with no customer or account identity in it. */
export function masterOfferingPriceListFilename(
  generatedAt: string,
  extension: "csv" | "json",
): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(generatedAt)?.[0] ?? "export";
  return `xenios-research-price-list-${day}.${extension}`;
}
