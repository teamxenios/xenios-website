import type {
  MasterOfferingCopyState,
  MasterOfferingDisplayState,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import type { CartProductSelection } from "@shared/research/cart-product-selection";

/**
 * One source row from the private master workbook. Server and tooling only.
 * Never return this shape from an HTTP route and never import it under client/.
 */
export interface RawMasterOfferingRow {
  sheetRow: number;
  sourceGroup: string;
  category: string;
  brandOrSubcategory: string;
  sourceSku: string;
  productName: string;
  variantOrFormat: string | null;
  familyOrTag: string;
  supplierOrOwner: string;
  originalWholesaleCost: number | null;
  updatedWholesaleCost: number | null;
  wholesaleStatus: string;
  originalSellPrice: number | null;
  updatedSellPrice: number | null;
  targetSellAtUpdatedCost: number | null;
  recommendedLaunchSellPrice: number | null;
  updatedMarkupMultiple: number | null;
  updatedGrossProfit: number | null;
  updatedGrossMargin: number | null;
  sourceAccessState: string | null;
  activationPriority: string;
  austinSupplierBenchmark: boolean;
  activationRequirement: string;
  sourceNotes: string;
  productUrl: string | null;
}

export interface RawEarlyAccessRow {
  sheetRow: number;
  catalogSection: string;
  productName: string;
  variantOrFormat: string;
  status: "Available" | "Held";
  researchCategory: string;
  notes: string;
}

export type MasterOfferingVisibility = "member" | "admin_only";

export interface MasterOfferingImportIssue {
  code:
    | "placeholder_source_id"
    | "missing_product_name"
    | "missing_category"
    | "unknown_access_state"
    | "zero_planning_price"
    | "duplicate_source_row"
    | "sensitive_provider_identity"
    | "regulatory_hold";
  severity: "info" | "warning" | "hold";
  sheetRows: readonly number[];
  message: string;
}

/**
 * A private source reference for reconciliation and audit. It contains no raw
 * supplier value or money. The workbook remains the private source for those.
 */
export interface MasterOfferingSourceReference {
  sheetRow: number;
  sourceGroup: string;
  sourceSku: string;
  planningPricePresent: boolean;
  updatedWholesaleCostPresent: boolean;
}

export interface NormalizedMasterOfferingVariant {
  id: string;
  label: string;
  displayState: MasterOfferingDisplayState;
  visibility: MasterOfferingVisibility;
  sourceReferences: readonly MasterOfferingSourceReference[];
}

export interface NormalizedMasterOffering {
  id: string;
  slug: string;
  canonicalKey: string;
  displayName: string;
  canonicalName: string;
  family: MasterOfferingFamily;
  category: string;
  subcategory: string | null;
  brand: string | null;
  aliases: readonly string[];
  displayState: MasterOfferingDisplayState;
  stateExplanation: string;
  copyState: MasterOfferingCopyState;
  visibility: MasterOfferingVisibility;
  variants: readonly NormalizedMasterOfferingVariant[];
  sourceReferences: readonly MasterOfferingSourceReference[];
}

export interface MasterOfferingAdminHold {
  id: string;
  family: MasterOfferingFamily;
  /** Null for confidential provider and team identities. */
  displayName: string | null;
  reason: string;
  sourceRows: readonly number[];
}

export interface NormalizedMasterOfferingCatalog {
  sourceRowCount: number;
  products: readonly NormalizedMasterOffering[];
  holds: readonly MasterOfferingAdminHold[];
  issues: readonly MasterOfferingImportIssue[];
}

/**
 * Identity only. This binding cannot authorize money, inventory, documentation,
 * audience, or fulfillment. It merely says which Product Control unit corresponds
 * to one normalized offering variant.
 */
export interface MasterOfferingCommerceIdentityBinding {
  offeringVariantId: string;
  productId: string;
  variantId: string;
}

/**
 * Purchase authority is the existing Product Control selection. The binding is a
 * join; the selection is the authority. Both must match exactly.
 */
export interface MasterOfferingCommerceResolution {
  binding: MasterOfferingCommerceIdentityBinding | null;
  selection: CartProductSelection | null;
}

export type MasterOfferingCommerceResolver = (
  offering: NormalizedMasterOffering,
  variant: NormalizedMasterOfferingVariant,
) => MasterOfferingCommerceResolution;
