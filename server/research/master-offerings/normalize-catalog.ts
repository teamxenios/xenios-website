import crypto from "node:crypto";
import type {
  MasterOfferingDisplayState,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import type { NormalizedMasterOffering } from "./model";
import { slugify } from "./normalize";

/**
 * Normalize the MASTER CATALOG workbook (the 420-row canonical selection) into
 * member-safe master offerings.
 *
 * This is the second source shape this surface has had. The first was the
 * planning workbook ("01 Full Master Offerings"), a 1,236-row exploration of
 * everything Xenios might ever offer. This one is the founder's selected
 * catalog: every row is a real offering with a family, a channel, and an
 * exact specification, and the accounting is closed (420 rows, no unknowns).
 *
 * The mapping rules live in docs/research/CATALOG_INGESTION_CONTRACT.md and
 * are restated where they are enforced:
 *
 *   - Family uses the exact slugs the Kris Launch A artifact already carries,
 *     so one taxonomy names one thing on every surface.
 *   - Channel decides the DISPLAY state only. Visibility is never
 *     purchasability: provider rows show the care pathway, classification
 *     pending rows show approval required, and the orderable channels show
 *     request access until Product Control data opens a real action. No
 *     display state here can emit a purchase.
 *   - No price of any kind enters this artifact. The workbook's Suggested
 *     Sell Price becomes member-audience Product Control price rows through
 *     the mounted admin path, and the one authoritative resolver serves them.
 *   - An unknown family or channel REFUSES the build rather than defaulting,
 *     so a future workbook cannot arrive half-mapped.
 */

/** One row of the MASTER CATALOG sheet as the private intake carries it. */
export interface RawMasterCatalogRow {
  readonly sheetRow: number;
  readonly [column: string]: unknown;
}

const FAMILY_BY_WORKBOOK: Readonly<Record<string, MasterOfferingFamily>> = {
  "503A Clinical Formulations": "clinical_formulations_503a",
  "Research Capsules": "research_capsules",
  "Research Peptides & Materials": "research_peptides_materials",
  "Research Supplies": "research_supplies",
  "Shipping & Fulfillment": "shipping_and_fulfillment",
  Supplements: "supplements",
  "Topicals & Regenerative": "topicals_regenerative",
};

interface ChannelPresentation {
  readonly displayState: MasterOfferingDisplayState;
  readonly stateExplanation: string;
}

const PRESENTATION_BY_CHANNEL: Readonly<Record<string, ChannelPresentation>> = {
  "Clinical / Provider Only": {
    displayState: "care_pathway",
    stateExplanation:
      "Fulfilled through the provider pathway, subject to applicable state availability and pharmacy requirements. Not available for direct purchase.",
  },
  "Supplier Catalog / Classification Pending": {
    displayState: "approval_required",
    stateExplanation:
      "Visible while classification and documentation are completed. Register interest and the team follows up when it activates.",
  },
  "RUO Research": {
    displayState: "request_access",
    stateExplanation:
      "Research use only. Request access and the team confirms availability for this exact item.",
  },
  Supplement: {
    displayState: "request_access",
    stateExplanation:
      "Request access and the team confirms availability for this exact item.",
  },
  "Nonclinical / Topical": {
    displayState: "request_access",
    stateExplanation:
      "Nonclinical topical item. Request access and the team confirms availability for this exact item.",
  },
};

export class MasterCatalogNormalizeError extends Error {}

function hashId(prefix: string, value: string): string {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function requiredText(row: RawMasterCatalogRow, column: string): string {
  const value = row[column];
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new MasterCatalogNormalizeError(
      `sheet row ${row.sheetRow}: required column "${column}" is blank`,
    );
  }
  return text;
}

function optionalText(row: RawMasterCatalogRow, column: string): string | null {
  const value = row[column];
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

export interface NormalizedMasterCatalog {
  readonly sourceRowCount: number;
  readonly products: readonly NormalizedMasterOffering[];
  readonly familyCounts: Readonly<Record<string, number>>;
  readonly displayStateCounts: Readonly<Record<string, number>>;
}

export function normalizeMasterCatalog(
  rows: readonly RawMasterCatalogRow[],
  presentationSpecifications: ReadonlyMap<string, string> = new Map(),
): NormalizedMasterCatalog {
  const products: NormalizedMasterOffering[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const familyCounts: Record<string, number> = {};
  const displayStateCounts: Record<string, number> = {};

  for (const row of rows) {
    const workbookFamily = requiredText(row, "Family");
    const family = FAMILY_BY_WORKBOOK[workbookFamily];
    if (!family) {
      throw new MasterCatalogNormalizeError(
        `sheet row ${row.sheetRow}: unknown family "${workbookFamily}"; a new family is a reviewed mapping, never a default`,
      );
    }
    const channel = requiredText(row, "Channel");
    const presentation = PRESENTATION_BY_CHANNEL[channel];
    if (!presentation) {
      throw new MasterCatalogNormalizeError(
        `sheet row ${row.sheetRow}: unknown channel "${channel}"; a new channel is a reviewed mapping, never a default`,
      );
    }
    const product = requiredText(row, "Product");
    const specification = requiredText(row, "Normalized Specification");
    const groupId = requiredText(row, "Group ID");
    const dosageForm = optionalText(row, "Dosage Form");

    // Identity: the Group ID is source lineage; the specification keeps two
    // strengths of one product distinct. Both feed the hash so a workbook
    // reorder cannot move an id.
    const id = hashId("mo", `${groupId}\u0000${family}\u0000${product}\u0000${specification}`);
    const variantId = hashId("mov", `${id}\u0000${specification}`);
    // Identity always hashes untouched source text. These are presentation-only
    // decisions, never category, price, hold or purchase authority.
    const displaySpecification = presentationSpecifications.get(groupId) ??
      (id === "mo_3d043e2a35ceaa045986" && variantId === "mov_06beec21c59fe7842f18"
        ? "LIBIDO CREAM (SCREAM CREAM): Testosterone Cypionate 0.1% / Sildenafil Citrate 0.1% / Glycerin / Versabase Cream"
        : specification);
    if (!displaySpecification.trim()) {
      throw new MasterCatalogNormalizeError("A reviewed display specification cannot be blank.");
    }
    const slug = slugify(`${family} ${product} ${displaySpecification}`);
    if (seenIds.has(id) || seenSlugs.has(slug)) {
      throw new MasterCatalogNormalizeError(
        `sheet row ${row.sheetRow}: duplicate offering identity (${product} | ${specification}); the source must disambiguate, the build never guesses`,
      );
    }
    seenIds.add(id);
    seenSlugs.add(slug);

    familyCounts[family] = (familyCounts[family] ?? 0) + 1;
    displayStateCounts[presentation.displayState] =
      (displayStateCounts[presentation.displayState] ?? 0) + 1;

    products.push({
      id,
      slug,
      canonicalKey: `${family}\u0000${product.toLowerCase()}\u0000${specification.toLowerCase()}`,
      displayName: product,
      canonicalName: product,
      family,
      category: workbookFamily,
      subcategory: dosageForm,
      brand: null,
      aliases: [product, displaySpecification],
      displayState: presentation.displayState,
      stateExplanation: presentation.stateExplanation,
      copyState: "draft",
      visibility: "member",
      variants: [
        {
          id: variantId,
          label: displaySpecification,
          displayState: presentation.displayState,
          visibility: "member",
          sourceReferences: [],
        },
      ],
      sourceReferences: [],
    });
  }

  return {
    sourceRowCount: rows.length,
    products,
    familyCounts,
    displayStateCounts,
  };
}
