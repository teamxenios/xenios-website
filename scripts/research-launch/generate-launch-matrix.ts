// Generate the Product Launch Matrix the 2026-08-19 full-launch directive
// requires: every catalog variant resolved to exactly ONE truthful customer
// action, from canonical data only —
//   - the committed member-safe master-offerings dataset (420 variants),
//   - the reviewed commerce bindings artifact (417 bound),
//   - a READ-ONLY production snapshot of active in-window approved member
//     prices (417) captured 2026-08-19,
//   - the REAL shared action policy (decideAssistedOrderAction), so the
//     matrix can never drift from what production would decide,
//   - the founder's 2026-08-16 retail price book (39 launch SKUs), joined by
//     normalized product name + strength for price reconciliation.
//
// Nothing here mutates anything. Output:
//   docs/research-launch/PRODUCT_LAUNCH_MATRIX.json
//   docs/research-launch/PRODUCT_LAUNCH_MATRIX.md
//
// Action vocabulary mapping (launch directive -> action policy):
//   BUY_NOW_CANDIDATE   direct_order_request workflow (priced, bound, general
//                       lane) — becomes a real Buy Now ONLY when direct
//                       commerce is enabled for a founder-approved set; until
//                       then these serve the assisted-order path.
//   REQUEST_QUOTE       request_pricing workflow (no approved price/binding)
//   CARE                provider_request workflow (care pathway / 503A)
//   NOT_AVAILABLE       request_activation workflow (classification pending)
//   TEMPORARILY_HELD    availability_review workflow (held / out of stock)
// No UNKNOWN is tolerated: an unmapped state fails the run.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  decideAssistedOrderAction,
  type AssistedOrderCatalogAuthority,
} from "../../shared/research/assisted-order/action-policy";

const ROOT = process.cwd();

type DatasetProduct = {
  id: string;
  slug: string;
  displayName: string;
  family: string;
  category: string;
  displayState: string;
  stateExplanation?: string | null;
  variants: { id: string; label: string; displayState: string }[];
};

type Binding = {
  offeringId: string;
  offeringVariantId: string;
  productControlSku: string;
  productId: string;
  variantId: string;
};

type PriceRow = {
  variant_id: string;
  product_id: string;
  price_id: string;
  amount_cents: number;
  price_version: number;
  sku: string;
  variant_status: string;
  variant_active: boolean;
  member_eligible: boolean;
};

type PriceBookRow = Record<string, unknown> & {
  SKU: string;
  Product: string;
  "Strength / Configuration": string;
  "Recommended Retail / Vial": number;
  "5+ Vial Price": number;
  "10+ Vial Price": number;
  "Catalog Status": string;
  "Affiliate Eligibility": string;
};

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.resolve(ROOT, rel), "utf8")) as T;
}

const dataset = loadJson<{ products: DatasetProduct[] }>(
  "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
);
const bindingsFile = loadJson<{ bindings: Binding[] }>(
  "server/research/master-offerings/data/master-offering-bindings.generated.json",
);
const priceSnapshot = loadJson<{ capturedAt: string; prices: PriceRow[] }>(
  "docs/research-launch/PRODUCTION_MEMBER_PRICES_SNAPSHOT_2026-08-19.json",
);
const founderBook = loadJson<{ retailPriceBook: PriceBookRow[] }>(
  "docs/research-launch/FOUNDER_PRICE_BOOK_2026-08-16.json",
);

const bindingByOfferingVariant = new Map(
  bindingsFile.bindings.map((binding) => [binding.offeringVariantId, binding]),
);
const priceByVariantId = new Map(
  priceSnapshot.prices.map((price) => [price.variant_id, price]),
);

/**
 * Join the founder book to catalog variants: normalized product-name equality
 * (parenthesized segments stripped, so "GLOW (BPC-157 + …)" matches book
 * "GLOW") plus the book's total milligram figure appearing as a dosage token
 * in the variant label. Restricted to the research families the book prices
 * (vials/capsules), never the 503A clinical rows. Ambiguity is reported, not
 * guessed.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bookTotalMg(strength: string): number | null {
  const match = /([0-9]+(?:\.[0-9]+)?)\s*mg/i.exec(strength);
  return match ? Number(match[1]) : null;
}

function labelMgTokens(label: string): number[] {
  const tokens: number[] = [];
  for (const match of label.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*mg(?![a-z/])/gi)) {
    tokens.push(Number(match[1]));
  }
  return tokens;
}

const RESEARCH_FAMILIES = new Set([
  "research_peptides_materials",
  "research_capsules",
  "research_supplies",
  "supplements",
]);

/** "no dac" / "with dac" polarity from any text; null when unstated. */
function dacPolarity(text: string): "no_dac" | "with_dac" | null {
  const lowered = text.toLowerCase();
  if (/no\s*dac/.test(lowered)) return "no_dac";
  if (/with\s*dac|\bdac\b(?!.*no\s*dac)/.test(lowered) && !/no\s*dac/.test(lowered)) {
    return "with_dac";
  }
  return null;
}

function findBookRow(
  product: DatasetProduct,
  variantLabel: string,
): PriceBookRow | null {
  if (!RESEARCH_FAMILIES.has(product.family)) return null;
  const productKey = normalizeName(product.displayName);
  const mgTokens = labelMgTokens(variantLabel);
  if (mgTokens.length === 0) return null;
  // A combo label lists component dosages; the book states the TOTAL. Using
  // component tokens individually would pair "10 mg total (5+5)" with the
  // 10 mg + 10 mg variant, so multi-component labels compare by SUM only.
  const comparableTotal =
    mgTokens.length === 1
      ? mgTokens[0]
      : Math.round(mgTokens.reduce((sum, value) => sum + value, 0) * 100) / 100;
  const variantPolarity = dacPolarity(`${product.displayName} ${variantLabel}`);
  for (const row of founderBook.retailPriceBook) {
    if (normalizeName(row.Product) !== productKey) continue;
    const strengthText = row["Strength / Configuration"];
    const total = bookTotalMg(strengthText);
    if (total === null || total !== comparableTotal) continue;
    const bookPolarity = dacPolarity(`${row.Product} ${strengthText}`);
    // A stated DAC polarity on either side must agree with the other side's
    // stated polarity; one stated + one unstated is not a contradiction.
    if (bookPolarity && variantPolarity && bookPolarity !== variantPolarity) continue;
    return row;
  }
  return null;
}

type MatrixRow = {
  offeringId: string;
  offeringVariantId: string;
  product: string;
  family: string;
  variantLabel: string;
  displayState: string;
  sku: string | null;
  productId: string | null;
  variantId: string | null;
  memberPriceCents: number | null;
  priceId: string | null;
  workflowMode: string;
  launchAction:
    | "BUY_NOW_CANDIDATE"
    | "REQUEST_QUOTE"
    | "CARE"
    | "NOT_AVAILABLE"
    | "TEMPORARILY_HELD";
  founderBookSku: string | null;
  founderBookRetailCents: number | null;
  priceDelta: "MATCH" | "MISMATCH" | "NOT_IN_BOOK" | "BOOK_ONLY_NO_PRICE";
};

const HELD_STATES = new Set(["temporarily_unavailable", "coming_soon"]);
const INVISIBLE_STATES = new Set(["planned", "unavailable"]);

const rows: MatrixRow[] = [];
for (const product of dataset.products) {
  for (const variant of product.variants) {
    const binding = bindingByOfferingVariant.get(variant.id) ?? null;
    const price = binding ? (priceByVariantId.get(binding.variantId) ?? null) : null;
    const priced =
      price !== null && price.variant_status === "approved" && price.variant_active;

    const providerWorkflowRequired =
      variant.displayState === "care_pathway" ||
      product.displayState === "care_pathway" ||
      product.family === "clinical_formulations_503a";
    const classificationPending =
      variant.displayState === "approval_required" ||
      product.displayState === "approval_required";

    const authority: AssistedOrderCatalogAuthority = Object.freeze({
      productId: binding?.productId ?? `unbound:${product.id}`,
      variantId: binding?.variantId ?? `unbound:${variant.id}`,
      productName: product.displayName,
      family: product.family,
      channel: product.category,
      specification: variant.label || null,
      format: null,
      packBasis: null,
      minimumQuantity: 1,
      maximumQuantity: null,
      quantityIncrement: 1,
      unitPriceCents: priced && binding !== null ? price!.amount_cents : null,
      currency: "USD",
      catalogVersion: "launch-matrix",
      priceVersion: priced && binding !== null ? price!.price_id : null,
      visible: !INVISIBLE_STATES.has(variant.displayState),
      directEligible:
        priced && binding !== null && !providerWorkflowRequired && !classificationPending,
      providerWorkflowRequired,
      classificationPending,
      pricePending:
        (!priced || binding === null) &&
        !providerWorkflowRequired &&
        !classificationPending,
      held: HELD_STATES.has(variant.displayState),
      outOfStock: false,
      researchUseOnly:
        product.family === "research_peptides_materials" ||
        product.family === "research_capsules" ||
        product.family === "research_supplies",
      accessNotice: product.stateExplanation ?? null,
    });

    const decision = decideAssistedOrderAction(authority);
    const mode = decision.workflowMode;
    let launchAction: MatrixRow["launchAction"];
    switch (mode) {
      case "direct_order_request":
        launchAction = "BUY_NOW_CANDIDATE";
        break;
      case "request_pricing":
        launchAction = "REQUEST_QUOTE";
        break;
      case "provider_request":
        launchAction = "CARE";
        break;
      case "request_activation":
        launchAction = "NOT_AVAILABLE";
        break;
      case "availability_review":
        launchAction = "TEMPORARILY_HELD";
        break;
      default:
        throw new Error(
          `UNKNOWN action for ${product.displayName} / ${variant.label}: ${String(mode)}`,
        );
    }

    const bookRow = findBookRow(product, variant.label);
    let priceDelta: MatrixRow["priceDelta"] = "NOT_IN_BOOK";
    let bookCents: number | null = null;
    if (bookRow) {
      const retail = Number(bookRow["Recommended Retail / Vial"]);
      bookCents = Number.isFinite(retail) ? Math.round(retail * 100) : null;
      if (authority.unitPriceCents === null) {
        priceDelta = "BOOK_ONLY_NO_PRICE";
      } else if (bookCents !== null && bookCents === authority.unitPriceCents) {
        priceDelta = "MATCH";
      } else {
        priceDelta = "MISMATCH";
      }
    }

    rows.push({
      offeringId: product.id,
      offeringVariantId: variant.id,
      product: product.displayName,
      family: product.family,
      variantLabel: variant.label,
      displayState: variant.displayState,
      sku: binding?.productControlSku ?? null,
      productId: binding?.productId ?? null,
      variantId: binding?.variantId ?? null,
      memberPriceCents: authority.unitPriceCents,
      priceId: authority.priceVersion,
      workflowMode: mode,
      launchAction,
      founderBookSku: bookRow?.SKU ?? null,
      founderBookRetailCents: bookCents,
      priceDelta,
    });
  }
}

// Price-book rows that matched no catalog variant (need founder mapping).
const matchedBookSkus = new Set(rows.map((row) => row.founderBookSku).filter(Boolean));
const unmatchedBook = founderBook.retailPriceBook
  .filter((row) => !matchedBookSkus.has(row.SKU))
  .map((row) => ({
    sku: row.SKU,
    product: row.Product,
    strength: row["Strength / Configuration"],
    status: row["Catalog Status"],
  }));

const counts: Record<string, number> = {};
for (const row of rows) counts[row.launchAction] = (counts[row.launchAction] ?? 0) + 1;
const mismatches = rows.filter((row) => row.priceDelta === "MISMATCH");
const bookMatches = rows.filter((row) => row.founderBookSku !== null);

const output = {
  generatedAt: new Date().toISOString(),
  inputs: {
    dataset: "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
    bindings: "server/research/master-offerings/data/master-offering-bindings.generated.json",
    productionPrices: priceSnapshot.capturedAt,
    founderPriceBook: "docs/research-launch/FOUNDER_PRICE_BOOK_2026-08-16.json",
  },
  totals: {
    variants: rows.length,
    byAction: counts,
    priceBookMatched: bookMatches.length,
    priceBookUnmatched: unmatchedBook.length,
    priceMismatches: mismatches.length,
  },
  rows,
  unmatchedFounderBookRows: unmatchedBook,
};

mkdirSync(path.resolve(ROOT, "docs/research-launch"), { recursive: true });
writeFileSync(
  path.resolve(ROOT, "docs/research-launch/PRODUCT_LAUNCH_MATRIX.json"),
  JSON.stringify(output, null, 1) + "\n",
);

const md: string[] = [];
md.push("# Product Launch Matrix (generated " + output.generatedAt + ")");
md.push("");
md.push("Every variant resolved through the REAL shared action policy against the committed dataset, reviewed bindings, and a read-only production price snapshot. No UNKNOWN actions.");
md.push("");
md.push("## Totals");
md.push("");
md.push("| Action | Count |");
md.push("|---|---|");
for (const [action, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  md.push(`| ${action} | ${count} |`);
}
md.push("");
md.push(`Founder price book: ${bookMatches.length} of 39 SKUs matched to catalog variants; ${unmatchedBook.length} unmatched; ${mismatches.length} price mismatches (production member price vs founder recommended retail).`);
md.push("");
if (mismatches.length > 0) {
  md.push("## PRICE MISMATCHES — founder decision queue (no auto-reprice)");
  md.push("");
  md.push("| SKU | Product | Variant | Production member price | Founder book retail |");
  md.push("|---|---|---|---|---|");
  for (const row of mismatches) {
    md.push(
      `| ${row.founderBookSku} | ${row.product} | ${row.variantLabel} | $${(row.memberPriceCents! / 100).toFixed(2)} | $${(row.founderBookRetailCents! / 100).toFixed(2)} |`,
    );
  }
  md.push("");
}
if (unmatchedBook.length > 0) {
  md.push("## Founder book rows with no catalog variant match (need mapping)");
  md.push("");
  for (const row of unmatchedBook) {
    md.push(`- ${row.sku}: ${row.product} ${row.strength} (${row.status})`);
  }
  md.push("");
}
md.push("## Buy Now candidates (direct-eligible, priced, bound; activation still founder-gated)");
md.push("");
md.push("| SKU | Product | Variant | Member price | In founder book |");
md.push("|---|---|---|---|---|");
for (const row of rows.filter((r) => r.launchAction === "BUY_NOW_CANDIDATE")) {
  md.push(
    `| ${row.sku} | ${row.product} | ${row.variantLabel} | $${(row.memberPriceCents! / 100).toFixed(2)} | ${row.founderBookSku ?? "-"} |`,
  );
}
md.push("");
writeFileSync(
  path.resolve(ROOT, "docs/research-launch/PRODUCT_LAUNCH_MATRIX.md"),
  md.join("\n") + "\n",
);

console.log(JSON.stringify(output.totals, null, 1));
console.log("matrix written: docs/research-launch/PRODUCT_LAUNCH_MATRIX.{json,md}");
