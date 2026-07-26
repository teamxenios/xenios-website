import { Link } from "wouter";
import type {
  RequiredInput,
  RequiredInputDefinition,
  RequiredInputState,
} from "@shared/research/required-inputs";
import { ResearchStatusBadge, type BadgeTone } from "../ui/kit";

type RequiredInputPresentation = Pick<
  RequiredInputDefinition,
  | "key"
  | "domain"
  | "label"
  | "description"
  | "whyRequired"
  | "nextAction"
  | "adminEntryHref"
  | "blockingLevel"
>;

export const WEBSITE3_REQUIRED_INPUT_PRESENTATIONS = {
  productSku: {
    key: "products.sku",
    domain: "products",
    label: "PRODUCT SKU REQUIRED",
    description: "Enter the approved SKU for this exact product variant.",
    whyRequired: "A released variant needs a stable catalog and fulfillment identity.",
    nextAction: "Enter and submit the approved SKU for review.",
    adminEntryHref: "/admin/research/products",
    blockingLevel: "blocks_public_launch",
  },
  productFamily: {
    key: "products.family",
    domain: "products",
    label: "PRODUCT FAMILY REQUIRED",
    description: "Assign the product to its approved catalog family.",
    whyRequired: "Catalog navigation and product-class rules depend on the canonical family.",
    nextAction: "Select and submit the approved product family.",
    adminEntryHref: "/admin/research/products",
    blockingLevel: "blocks_display",
  },
  retailPrice: {
    key: "pricing.retail_price",
    domain: "pricing",
    label: "RETAIL PRICE REQUIRED",
    description: "Enter and approve the price before this variant can be released.",
    whyRequired: "Public commerce cannot display or charge an unapproved price.",
    nextAction: "Enter the approved price and effective date.",
    adminEntryHref: "/admin/research/products",
    blockingLevel: "blocks_transaction",
  },
  approvedProductImage: {
    key: "product_content.primary_image",
    domain: "product_content",
    label: "APPROVED PRODUCT IMAGE REQUIRED",
    description: "Upload and approve the primary image and accessible alternative text.",
    whyRequired: "The published product needs verified media that matches the exact record.",
    nextAction: "Add the approved image and alternative text.",
    adminEntryHref: "/admin/research/products",
    blockingLevel: "blocks_display",
  },
  storageInformation: {
    key: "product_content.storage_information",
    domain: "product_content",
    label: "STORAGE INFORMATION REQUIRED",
    description: "Enter the reviewed storage source and product-specific information.",
    whyRequired: "Unverified storage guidance must not be presented as product fact.",
    nextAction: "Add the reviewed storage information and source.",
    adminEntryHref: "/admin/research/product-configuration",
    blockingLevel: "blocks_display",
  },
  commerceRelease: {
    key: "products.commerce_release",
    domain: "products",
    label: "COMMERCE RELEASE APPROVAL REQUIRED",
    description: "Complete the reviewed release decision for this product.",
    whyRequired: "Software readiness alone cannot make a product purchasable.",
    nextAction: "Submit the product for commerce release review.",
    adminEntryHref: "/admin/research/required-inputs",
    blockingLevel: "blocks_transaction",
  },
  availableInventory: {
    key: "inventory.available_quantity",
    domain: "inventory",
    label: "AVAILABLE INVENTORY REQUIRED",
    description: "Record verified available quantity for an eligible location and lot.",
    whyRequired: "Purchasability and allocation require real available inventory.",
    nextAction: "Enter and reconcile the available inventory.",
    adminEntryHref: "/admin/research/inventory",
    blockingLevel: "blocks_transaction",
  },
  activeLot: {
    key: "lots.active_lot",
    domain: "lots",
    label: "ACTIVE LOT REQUIRED",
    description: "Associate an approved, released lot with the exact variant.",
    whyRequired: "Allocation and lot-specific documentation require an eligible lot.",
    nextAction: "Create or select the released lot record.",
    adminEntryHref: "/admin/research/inventory",
    blockingLevel: "blocks_fulfillment",
  },
  lotExpiration: {
    key: "lots.expiration_date",
    domain: "lots",
    label: "LOT EXPIRATION DATE REQUIRED",
    description: "Enter the verified expiration or review date for this lot.",
    whyRequired: "Expired or undated lots cannot be treated as release eligible.",
    nextAction: "Enter and verify the lot date.",
    adminEntryHref: "/admin/research/inventory",
    blockingLevel: "blocks_fulfillment",
  },
  coaFile: {
    key: "coas.report_file",
    domain: "coas",
    label: "LOT-SPECIFIC COA REQUIRED",
    description: "Upload the private report for the exact product, variant, and lot.",
    whyRequired: "A generic or mismatched report cannot support the exact lot.",
    nextAction: "Upload and submit the exact lot-specific report.",
    adminEntryHref: "/admin/research/required-inputs",
    blockingLevel: "blocks_display",
  },
  exactLotMatch: {
    key: "coas.exact_lot_match",
    domain: "coas",
    label: "EXACT LOT MATCH REQUIRED",
    description: "Verify that the report sample and record match the released lot.",
    whyRequired: "COA access and allocation must fail closed on a lot mismatch.",
    nextAction: "Verify the report-to-lot relationship.",
    adminEntryHref: "/admin/research/required-inputs",
    blockingLevel: "blocks_fulfillment",
  },
  qualityReview: {
    key: "coas.quality_review",
    domain: "coas",
    label: "QUALITY REVIEW APPROVAL REQUIRED",
    description: "Complete the independent review of the exact report and lot.",
    whyRequired: "A stored document is not automatically approved evidence.",
    nextAction: "Submit the report for quality review.",
    adminEntryHref: "/admin/research/required-inputs",
    blockingLevel: "blocks_public_launch",
  },
  supplementProductData: {
    key: "supplements.product_data",
    domain: "supplements",
    label: "VERIFIED SUPPLEMENT PRODUCT DATA REQUIRED",
    description: "Enter the approved product, label, partner, price, and inventory records.",
    whyRequired: "A Coming Soon category cannot become an offer without verified product facts.",
    nextAction: "Enter the approved supplement records.",
    adminEntryHref: "/admin/research/product-configuration",
    blockingLevel: "blocks_public_launch",
  },
  superpowerRelationship: {
    key: "superpower.relationship",
    domain: "superpower",
    label: "SUPERPOWER RELATIONSHIP CONFIRMATION REQUIRED",
    description: "Record the confirmed relationship and supporting approval.",
    whyRequired: "Partner access cannot be represented without an actual relationship.",
    nextAction: "Submit the relationship evidence for review.",
    adminEntryHref: "/admin/research/product-configuration",
    blockingLevel: "blocks_provider_activation",
  },
  superpowerAffiliateUrl: {
    key: "superpower.affiliate_url",
    domain: "superpower",
    label: "SUPERPOWER AFFILIATE URL REQUIRED",
    description: "Enter the approved HTTPS affiliate destination.",
    whyRequired: "The member action must not point to an unverified partner URL.",
    nextAction: "Enter and verify the approved affiliate URL.",
    adminEntryHref: "/admin/research/product-configuration",
    blockingLevel: "blocks_provider_activation",
  },
  superpowerOfferData: {
    key: "superpower.offer_data",
    domain: "superpower",
    label: "SUPERPOWER OFFER DATA REQUIRED",
    description: "Enter the current collection, availability, disclosure, and offer facts.",
    whyRequired: "Stale or incomplete partner facts cannot be published.",
    nextAction: "Enter and submit the verified offer data.",
    adminEntryHref: "/admin/research/product-configuration",
    blockingLevel: "blocks_display",
  },
  superpowerCurrentPrice: {
    key: "superpower.current_price",
    domain: "superpower",
    label: "SUPERPOWER CURRENT PRICE REQUIRED",
    description: "Enter the verified current price and effective date.",
    whyRequired: "The public offer cannot show an assumed or stale price.",
    nextAction: "Enter and verify the current price.",
    adminEntryHref: "/admin/research/product-configuration",
    blockingLevel: "blocks_display",
  },
  superpowerLaunchApproval: {
    key: "superpower.launch_approval",
    domain: "superpower",
    label: "SUPERPOWER LAUNCH APPROVAL REQUIRED",
    description: "Complete the server-reviewed launch approval.",
    whyRequired: "Configured partner data does not automatically enable the public link.",
    nextAction: "Submit Superpower for release review.",
    adminEntryHref: "/admin/research/required-inputs",
    blockingLevel: "blocks_provider_activation",
  },
  metabolicPathwayDefinition: {
    key: "metabolic_pathways.pathway_definition",
    domain: "metabolic_pathways",
    label: "CLINICIAN-GUIDED PATHWAY DEFINITION REQUIRED",
    description: "Enter the reviewed pathway definition and clinical ownership.",
    whyRequired: "A pathway cannot imply treatment availability without an approved definition.",
    nextAction: "Submit the clinician-guided pathway definition for review.",
    adminEntryHref: "/admin/research/product-configuration",
    blockingLevel: "blocks_public_launch",
  },
  diagnosticPartner: {
    key: "diagnostics.partner_configuration",
    domain: "diagnostics",
    label: "DIAGNOSTIC PARTNER CONFIGURATION REQUIRED",
    description: "Enter the verified partner relationship, collection, and support configuration.",
    whyRequired: "Diagnostics cannot be activated from presentation copy alone.",
    nextAction: "Complete and verify the partner configuration.",
    adminEntryHref: "/admin/research/product-configuration",
    blockingLevel: "blocks_provider_activation",
  },
  biomarkerReviewWorkflow: {
    key: "diagnostics.qualified_review",
    domain: "diagnostics",
    label: "QUALIFIED REVIEW WORKFLOW REQUIRED",
    description: "Configure the qualified report-review and follow-up process.",
    whyRequired: "Private uploads cannot imply interpretation without an approved reviewer workflow.",
    nextAction: "Complete the qualified-review workflow.",
    adminEntryHref: "/admin/research/required-inputs",
    blockingLevel: "blocks_provider_activation",
  },
} as const satisfies Record<string, RequiredInputPresentation>;

export type Website3RequiredInputSlot =
  keyof typeof WEBSITE3_REQUIRED_INPUT_PRESENTATIONS;

const RESOLVED_STATES: readonly RequiredInputState[] = [
  "verified",
  "not_applicable",
  "superseded",
];

function tone(state: RequiredInputState): BadgeTone {
  if (state === "rejected" || state === "expired") return "warning";
  if (state === "under_review" || state === "entered") return "pending";
  return "neutral";
}

function stateLabel(state: RequiredInputState): string {
  return state.replaceAll("_", " ");
}

export function findWebsite3RequiredInput(
  items: readonly RequiredInput[],
  slot: Website3RequiredInputSlot,
  recordId?: string | null,
): RequiredInput | null {
  const presentation = WEBSITE3_REQUIRED_INPUT_PRESENTATIONS[slot];
  if (recordId != null) {
    const exact =
      items.find(
        (item) =>
          item.key === presentation.key && item.recordId === recordId,
      ) ?? null;
    if (exact) return exact;
  }
  return (
    items.find(
      (item) =>
        item.key === presentation.key &&
        item.recordId == null,
    ) ?? null
  );
}

export function Website3RequiredInputNotice({
  slot,
  items = [],
  recordId,
  compact = false,
  forceVisible = false,
}: {
  slot: Website3RequiredInputSlot;
  items?: readonly RequiredInput[];
  recordId?: string | null;
  compact?: boolean;
  forceVisible?: boolean;
}) {
  const canonical = findWebsite3RequiredInput(items, slot, recordId);
  if (
    !forceVisible &&
    canonical &&
    RESOLVED_STATES.includes(canonical.currentState)
  ) {
    return null;
  }
  const presentation = WEBSITE3_REQUIRED_INPUT_PRESENTATIONS[slot];
  const label = canonical?.label ?? presentation.label;
  const description = canonical?.description ?? presentation.description;
  const whyRequired = canonical?.whyRequired ?? presentation.whyRequired;
  const nextAction = canonical?.nextAction ?? presentation.nextAction;
  const href = canonical?.adminEntryHref ?? presentation.adminEntryHref;
  const state = canonical?.currentState ?? "missing";

  if (compact) {
    return (
      <span className="grid gap-1" data-required-input={slot}>
        <span className="font-700">{label}</span>
        <span className="text-ink-mute">{nextAction}</span>
      </span>
    );
  }

  return (
    <aside
      className="card"
      aria-label={label}
      data-required-input={slot}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="mono-label text-ink-mute">Required input</p>
          <h3 className="body-m font-700 mt-1">{label}</h3>
        </div>
        <ResearchStatusBadge label={stateLabel(state)} tone={tone(state)} />
      </div>
      <p className="body-s text-ink-2 mt-3">{description}</p>
      <p className="body-s text-ink-mute mt-2">{whyRequired}</p>
      <Link
        href={href}
        className="btn btn-secondary mt-4"
        style={{
          height: "auto",
          maxWidth: "100%",
          textAlign: "left",
          whiteSpace: "normal",
        }}
      >
        {nextAction}
      </Link>
    </aside>
  );
}

export function Website3RequiredInputValue({
  value,
  slot,
  items,
  recordId,
}: {
  value: string | number | null | undefined;
  slot: Website3RequiredInputSlot;
  items?: readonly RequiredInput[];
  recordId?: string | null;
}) {
  const hasValue = value !== null && value !== undefined && value !== "";
  if (items === undefined) {
    if (hasValue) return <>{value}</>;
    return (
      <Website3RequiredInputNotice
        slot={slot}
        recordId={recordId}
        compact
      />
    );
  }

  const canonical = findWebsite3RequiredInput(items, slot, recordId);
  if (canonical?.currentState === "verified" && hasValue) {
    return <>{value}</>;
  }

  return (
    <Website3RequiredInputNotice
      slot={slot}
      items={items}
      recordId={recordId}
      compact
      forceVisible
    />
  );
}
