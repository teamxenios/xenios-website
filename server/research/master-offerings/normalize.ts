import crypto from "crypto";
import {
  MASTER_OFFERING_DISPLAY_STATES,
  type MasterOfferingDisplayState,
  type MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import type {
  MasterOfferingAdminHold,
  MasterOfferingImportIssue,
  MasterOfferingSourceReference,
  MasterOfferingVisibility,
  NormalizedMasterOffering,
  NormalizedMasterOfferingCatalog,
  NormalizedMasterOfferingVariant,
  RawEarlyAccessRow,
  RawMasterOfferingRow,
} from "./model";

const SOURCE_PRIORITY: Readonly<Record<string, number>> = {
  "Existing Xenios master": 0,
  "Expanded Xenios master": 1,
  "Austin Texas Supplier 36-row sheet": 2,
  "Planning expansion benchmark": 3,
  "Fast Track expansion candidate": 4,
  "ScriptBridge expansion candidate": 5,
};

const REGULATORY_HOLD_RESEARCH_NAMES = new Set([
  "semaglutide",
  "tirzepatide",
  "retatrutide",
]);


const KNOWN_ACCESS_STATES = new Set<string>([
  "",
  "Approval required",
  "Research approval or request access",
  "Request access",
  "Request access / reseller authorization",
  "Custom scope / membership",
  "Custom engagement",
  "Custom contract",
  "Operational quote",
  "Clinical/testing workflow",
  "Care / clinical review",
  "Clinical/provider pathway",
  "Provider/state dependent",
  "Care only",
  "Care only / Research unavailable",
  "Needs clinical review",
  "Available as workflow",
  "Held",
  "Research hold / Care evaluation required",
  "Unavailable",
  "Planning / source verification required",
  "Research / product review",
  "Research review",
  "Planning scope; exact integrations, privacy and workflow requirements determine final quote.",
  "Script ready",
  "Planned / not active direct product",
  "Needs medical/legal review",
  "Needs compliance review",
  "Available this week",
  "Coming soon",
]);

const DISPLAY_STATE_RANK: Readonly<Record<MasterOfferingDisplayState, number>> = {
  available_now: 0,
  available_this_week: 1,
  approval_required: 2,
  request_access: 3,
  care_pathway: 4,
  temporarily_unavailable: 5,
  coming_soon: 6,
  planned: 7,
  unavailable: 8,
};

export const MASTER_OFFERING_STATE_EXPLANATIONS: Readonly<
  Record<MasterOfferingDisplayState, string>
> = {
  available_now:
    "Currently listed in Early Access. Purchase still requires a matching server-authorized Product Control selection.",
  available_this_week:
    "Expected soon. Availability is not a purchase promise.",
  request_access:
    "Submit a request so Xenios can verify sourcing, documentation, and availability.",
  approval_required:
    "This offering requires review and approval before any transaction.",
  temporarily_unavailable:
    "This offering is catalogued but not currently available.",
  coming_soon: "This offering is planned for a future release.",
  care_pathway:
    "This offering belongs to a provider or clinical workflow and is not research-store commerce.",
  planned:
    "This offering is part of the planned Xenios catalog and is not yet active.",
  unavailable: "This offering is not currently offered.",
};

function hashId(prefix: string, value: string): string {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

export function normalizeOfferingText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/α/g, "alpha")
    .replace(/β/g, "beta")
    .replace(/[®™]/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/\bthymosin[\s-]*alpha[\s-]*1\b/gi, "thymosin alpha 1")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeResearchName(value: unknown): string {
  return normalizeOfferingText(
    String(value ?? "")
      .replace(/\s+Research\s+(Material|Blend|Peptide|Product)\s*$/i, "")
      .replace(/\s+Research\s*$/i, ""),
  );
}

function stripResearchFraming(value: string): string {
  return value
    .trim()
    .replace(/\s+Research\s+(Material|Blend|Peptide|Product)\s*$/i, "")
    .trim();
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/\+/g, " plus ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "offering";
}

export function familyForMasterRow(row: RawMasterOfferingRow): MasterOfferingFamily {
  if (
    row.category === "Peptides & Research" ||
    row.category === "Competitor Expansion Candidate"
  ) {
    const access = (row.sourceAccessState ?? "").toLowerCase();
    if (access.includes("care") || access.includes("clinical")) {
      return "clinician_guided_care";
    }
    const name = row.productName.toLowerCase();
    const subcategory = row.brandOrSubcategory.toLowerCase();
    const variant = (row.variantOrFormat ?? "").toLowerCase();
    if (
      name.includes("bacteriostatic water") ||
      name.includes("laboratory supply")
    ) {
      return "laboratory_supplies";
    }
    if (
      name.includes("blend") ||
      subcategory.includes("blend") ||
      subcategory.includes("stack") ||
      variant.includes("blend") ||
      variant.includes("stack") ||
      name.includes("+") ||
      name.includes("wolverine")
    ) {
      return "blends";
    }
    return "research_vials";
  }

  switch (row.category) {
    case "Research Supplies":
      return "laboratory_supplies";
    case "Supplements":
      return "supplements";
    case "Bloodwork & Testing":
      return "diagnostics";
    case "Care & Telemedicine":
      return "clinician_guided_care";
    case "Quantum & Regenerative":
      return "quantum";
    case "Memberships & Programs":
      return "programs";
    case "AI, Tracking & Education":
      return "education_and_tracking";
    case "Provider & Performance Network":
      return "provider_network";
    case "White Label & Partners":
      return "white_label_and_partners";
    case "Shipping & Fulfillment":
      return "shipping_and_fulfillment";
    default:
      throw new Error(
        `Unsupported master offering category ${JSON.stringify(row.category)} on sheet row ${row.sheetRow}`,
      );
  }
}

export function canonicalKeyForMasterRow(row: RawMasterOfferingRow): string {
  const family = familyForMasterRow(row);
  const name =
    family === "research_vials" ||
    family === "blends" ||
    family === "laboratory_supplies"
      ? normalizeResearchName(row.productName)
      : normalizeOfferingText(row.productName);

  if (family === "supplements" || family === "diagnostics") {
    return `${family}|${normalizeOfferingText(row.brandOrSubcategory)}|${name}`;
  }
  return `${family}|${name}`;
}

function earlyAccessKey(productName: string, variant: string): string {
  return `${normalizeResearchName(productName)}|${normalizeOfferingText(variant)}`;
}

function earlyAccessIndex(
  rows: readonly RawEarlyAccessRow[],
): ReadonlyMap<string, RawEarlyAccessRow["status"]> {
  const index = new Map<string, RawEarlyAccessRow["status"]>();
  for (const row of rows) {
    index.set(earlyAccessKey(row.productName, row.variantOrFormat), row.status);
  }
  return index;
}

export function displayStateForMasterRow(
  row: RawMasterOfferingRow,
  earlyAccess: ReadonlyMap<string, RawEarlyAccessRow["status"]>,
): MasterOfferingDisplayState {
  const current = earlyAccess.get(
    earlyAccessKey(row.productName, row.variantOrFormat ?? ""),
  );
  if (current === "Available") return "available_now";
  if (current === "Held") return "temporarily_unavailable";

  switch (row.sourceAccessState) {
    case "Available this week":
      return "available_this_week";
    case "Coming soon":
      return "coming_soon";
    case "Approval required":
    case "Research approval or request access":
      return "approval_required";
    case "Request access":
    case "Request access / reseller authorization":
    case "Custom scope / membership":
    case "Custom engagement":
    case "Custom contract":
    case "Operational quote":
      return "request_access";
    case "Clinical/testing workflow":
    case "Care / clinical review":
    case "Clinical/provider pathway":
    case "Provider/state dependent":
    case "Care only":
    case "Care only / Research unavailable":
    case "Needs clinical review":
    case "Available as workflow":
      return "care_pathway";
    case "Held":
    case "Research hold / Care evaluation required":
      return "temporarily_unavailable";
    case "Unavailable":
      return "unavailable";
    case "Planning / source verification required":
    case "Research / product review":
    case "Research review":
    case "Planning scope; exact integrations, privacy and workflow requirements determine final quote.":
    case "Script ready":
    case "Planned / not active direct product":
    case "Needs medical/legal review":
    case "Needs compliance review":
    case null:
      return "planned";
    default:
      return "planned";
  }
}

function visibilityForMasterRow(row: RawMasterOfferingRow): MasterOfferingVisibility {
  const family = familyForMasterRow(row);
  if (family === "provider_network") return "admin_only";

  const normalizedName = normalizeResearchName(row.productName);
  if (
    (family === "research_vials" || family === "blends") &&
    REGULATORY_HOLD_RESEARCH_NAMES.has(normalizedName)
  ) {
    return "admin_only";
  }

  if (
    row.category === "Care & Telemedicine" &&
    row.sourceAccessState === "Held"
  ) {
    return "admin_only";
  }
  return "member";
}

function sourceReference(row: RawMasterOfferingRow): MasterOfferingSourceReference {
  return {
    sheetRow: row.sheetRow,
    sourceGroup: row.sourceGroup,
    sourceSku: row.sourceSku,
    planningPricePresent:
      typeof row.updatedSellPrice === "number" ||
      typeof row.recommendedLaunchSellPrice === "number",
    updatedWholesaleCostPresent: typeof row.updatedWholesaleCost === "number",
  };
}

function strongestDisplayState(
  states: readonly MasterOfferingDisplayState[],
): MasterOfferingDisplayState {
  if (states.length === 0) return "unavailable";
  return states.reduce((best, state) =>
    DISPLAY_STATE_RANK[state] < DISPLAY_STATE_RANK[best] ? state : best,
  );
}

function preferredRow(
  rows: readonly RawMasterOfferingRow[],
): RawMasterOfferingRow {
  return [...rows].sort((left, right) => {
    const visibilityDelta =
      (visibilityForMasterRow(left) === "member" ? 0 : 1) -
      (visibilityForMasterRow(right) === "member" ? 0 : 1);
    if (visibilityDelta !== 0) return visibilityDelta;
    const sourceDelta =
      (SOURCE_PRIORITY[left.sourceGroup] ?? 99) -
      (SOURCE_PRIORITY[right.sourceGroup] ?? 99);
    if (sourceDelta !== 0) return sourceDelta;
    return left.sheetRow - right.sheetRow;
  })[0];
}

function publicBrand(
  row: RawMasterOfferingRow,
  family: MasterOfferingFamily,
): string | null {
  if (family !== "supplements" && family !== "diagnostics") return null;
  return row.brandOrSubcategory === "Custom" ? null : row.brandOrSubcategory;
}

function variantLabel(row: RawMasterOfferingRow): string {
  return row.variantOrFormat?.trim() || "Standard offering";
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right),
  );
}

function issueRows(
  rows: readonly RawMasterOfferingRow[],
): MasterOfferingImportIssue[] {
  const issues: MasterOfferingImportIssue[] = [];
  const exactRows = new Map<string, number[]>();

  for (const row of rows) {
    if (row.sourceSku.trim() === "" || row.sourceSku.trim() === "-") {
      issues.push({
        code: "placeholder_source_id",
        severity: "warning",
        sheetRows: [row.sheetRow],
        message: "The source ID is blank or a placeholder and needs a stable source identity.",
      });
    }
    if (row.productName.trim() === "") {
      issues.push({
        code: "missing_product_name",
        severity: "hold",
        sheetRows: [row.sheetRow],
        message: "A source row without a product or service name cannot be represented.",
      });
    }
    if (row.category.trim() === "") {
      issues.push({
        code: "missing_category",
        severity: "hold",
        sheetRows: [row.sheetRow],
        message: "A source row without a category cannot be routed safely.",
      });
    }
    const accessState = row.sourceAccessState?.trim() ?? "";
    if (!KNOWN_ACCESS_STATES.has(accessState)) {
      issues.push({
        code: "unknown_access_state",
        severity: "warning",
        sheetRows: [row.sheetRow],
        message: `The source access state ${JSON.stringify(accessState)} is not in the closed mapping and was held at planned.`,
      });
    }
    if (
      row.originalSellPrice === 0 ||
      row.updatedSellPrice === 0 ||
      row.recommendedLaunchSellPrice === 0
    ) {
      issues.push({
        code: "zero_planning_price",
        severity: "info",
        sheetRows: [row.sheetRow],
        message:
          "Zero is a workflow or no-fee planning value. It must never be rendered as a $0.00 commerce price.",
      });
    }
    if (visibilityForMasterRow(row) === "admin_only") {
      const provider = familyForMasterRow(row) === "provider_network";
      issues.push({
        code: provider ? "sensitive_provider_identity" : "regulatory_hold",
        severity: "hold",
        sheetRows: [row.sheetRow],
        message: provider
          ? "Provider and team identity remains confidential until explicit founder approval."
          : "This row is held outside the member catalog by existing regulatory or care policy.",
      });
    }

    const exactKey = `${row.productName}|${row.variantOrFormat ?? ""}`;
    exactRows.set(exactKey, [...(exactRows.get(exactKey) ?? []), row.sheetRow]);
  }

  for (const sheetRows of Array.from(exactRows.values())) {
    if (sheetRows.length < 2) continue;
    issues.push({
      code: "duplicate_source_row",
      severity: "warning",
      sheetRows,
      message:
        "The exact product and variant appears in multiple source rows. Preserve provenance and reconcile before activation.",
    });
  }

  return issues;
}

function buildVariant(
  canonicalKey: string,
  rows: readonly RawMasterOfferingRow[],
  earlyAccess: ReadonlyMap<string, RawEarlyAccessRow["status"]>,
): NormalizedMasterOfferingVariant {
  const preferred = preferredRow(rows);
  const memberStates = rows
    .filter((row) => visibilityForMasterRow(row) === "member")
    .map((row) => displayStateForMasterRow(row, earlyAccess));
  const allStates = rows.map((row) => displayStateForMasterRow(row, earlyAccess));
  const visibility: MasterOfferingVisibility = memberStates.length > 0 ? "member" : "admin_only";
  const normalizedVariant = normalizeOfferingText(variantLabel(preferred));
  return {
    id: hashId("mov", `${canonicalKey}|${normalizedVariant}`),
    label: variantLabel(preferred),
    displayState: strongestDisplayState(memberStates.length > 0 ? memberStates : allStates),
    visibility,
    sourceReferences: rows.map(sourceReference),
  };
}

function buildProduct(
  canonicalKey: string,
  rows: readonly RawMasterOfferingRow[],
  earlyAccess: ReadonlyMap<string, RawEarlyAccessRow["status"]>,
): NormalizedMasterOffering {
  const preferred = preferredRow(rows);
  const family = familyForMasterRow(preferred);
  const displayName =
    family === "research_vials" ||
    family === "blends" ||
    family === "laboratory_supplies"
      ? stripResearchFraming(preferred.productName)
      : preferred.productName.trim();
  const brand = publicBrand(preferred, family);

  const byVariant = new Map<string, RawMasterOfferingRow[]>();
  for (const row of rows) {
    const key = normalizeOfferingText(variantLabel(row));
    byVariant.set(key, [...(byVariant.get(key) ?? []), row]);
  }
  const variants = Array.from(byVariant.entries())
    .sort((left, right) => {
      const leftRow = Math.min(...left[1].map((row) => row.sheetRow));
      const rightRow = Math.min(...right[1].map((row) => row.sheetRow));
      return leftRow - rightRow;
    })
    .map(([, variantRows]) => buildVariant(canonicalKey, variantRows, earlyAccess));

  const memberVariants = variants.filter((variant) => variant.visibility === "member");
  const visibility: MasterOfferingVisibility =
    memberVariants.length > 0 ? "member" : "admin_only";
  const displayState = strongestDisplayState(
    (memberVariants.length > 0 ? memberVariants : variants).map(
      (variant) => variant.displayState,
    ),
  );
  const slugPrefix = brand ? `${slugify(brand)}-` : "";

  return {
    id: hashId("mo", canonicalKey),
    slug: `${family.replace(/_/g, "-")}-${slugPrefix}${slugify(displayName)}`,
    canonicalKey,
    displayName,
    canonicalName: displayName,
    family,
    category: preferred.category,
    subcategory: preferred.brandOrSubcategory || null,
    brand,
    aliases: uniqueSorted([
      ...rows.map((row) => row.productName),
      ...rows.map((row) => row.familyOrTag),
      ...rows.map((row) => row.brandOrSubcategory),
    ]),
    displayState,
    stateExplanation: MASTER_OFFERING_STATE_EXPLANATIONS[displayState],
    copyState: "needs_review",
    visibility,
    variants,
    sourceReferences: rows.map(sourceReference),
  };
}

function holdForProduct(product: NormalizedMasterOffering): MasterOfferingAdminHold {
  const provider = product.family === "provider_network";
  const regulatory = REGULATORY_HOLD_RESEARCH_NAMES.has(
    normalizeResearchName(product.displayName),
  );
  return {
    id: product.id,
    family: product.family,
    displayName: provider ? null : product.displayName,
    reason: provider
      ? "Provider and team identities remain confidential pending explicit founder approval."
      : regulatory
        ? "Regulatory hold: excluded from the customer research catalog pending founder and counsel decision."
        : "Held outside the member catalog pending review.",
    sourceRows: product.sourceReferences.map((source) => source.sheetRow),
  };
}

/**
 * Normalize the current workbook into a planning catalog. This function creates
 * no Product Control product, price, inventory record, lot, certificate, cart
 * selection, order, or database write.
 */
export function normalizeMasterOfferings(
  rows: readonly RawMasterOfferingRow[],
  earlyAccessRows: readonly RawEarlyAccessRow[],
): NormalizedMasterOfferingCatalog {
  const earlyAccess = earlyAccessIndex(earlyAccessRows);
  const groups = new Map<string, RawMasterOfferingRow[]>();
  for (const row of rows) {
    const key = canonicalKeyForMasterRow(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const allProducts = Array.from(groups.entries()).map(([key, group]) =>
    buildProduct(key, group, earlyAccess),
  );

  const seenSlugs = new Map<string, number>();
  const withUniqueSlugs = allProducts.map((product) => {
    const count = seenSlugs.get(product.slug) ?? 0;
    seenSlugs.set(product.slug, count + 1);
    if (count === 0) return product;
    return { ...product, slug: `${product.slug}-${product.id.slice(-6)}` };
  });

  const products = withUniqueSlugs
    .filter((product) => product.visibility === "member")
    .map((product) => ({
      ...product,
      variants: product.variants.filter(
        (variant) => variant.visibility === "member",
      ),
    }))
    .sort((left, right) =>
      `${left.family}|${left.displayName}|${left.slug}`.localeCompare(
        `${right.family}|${right.displayName}|${right.slug}`,
      ),
    );
  const holds = withUniqueSlugs
    .filter((product) => product.visibility === "admin_only")
    .map(holdForProduct)
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const product of products) {
    if (!MASTER_OFFERING_DISPLAY_STATES.includes(product.displayState)) {
      throw new Error(`Unknown display state for ${product.id}`);
    }
  }

  return {
    sourceRowCount: rows.length,
    products,
    holds,
    issues: issueRows(rows),
  };
}
