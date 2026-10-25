import {
  assertWhiteLabelPartnerPayloadSafe,
  isWhiteLabelBrandMode,
  isWhiteLabelFulfillmentMode,
  isWhiteLabelHexColor,
  type WhiteLabelApplicationInput,
  type WhiteLabelBrandInput,
  type WhiteLabelCommandResult,
  type WhiteLabelDenialCode,
  type WhiteLabelFulfillmentInput,
  type WhiteLabelPackagingReviewInput,
  type WhiteLabelQualityState,
  type WhiteLabelQuoteRequestInput,
  type WhiteLabelSelectionInput,
  type WhiteLabelSupportInput,
  type WhiteLabelVariantView,
  type WhiteLabelWorkspaceView,
} from "@shared/research/partners/white-label";

export interface WhiteLabelVariantAuthorityRecord {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  productApproved: boolean;
  productActive: boolean;
  variantApproved: boolean;
  variantActive: boolean;
  privateLabelApproved: boolean;
  qualityState: WhiteLabelQualityState;
}

export interface WhiteLabelVariantAuthority {
  listForMember(memberId: string): Promise<readonly WhiteLabelVariantAuthorityRecord[]>;
  findExact(memberId: string, sku: string): Promise<WhiteLabelVariantAuthorityRecord | null>;
}

export type WhiteLabelResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: WhiteLabelDenialCode; message: string };

export interface WhiteLabelWorkspaceCommandPort {
  getForMember(memberId: string): Promise<WhiteLabelWorkspaceView | null>;
  applyForMember(memberId: string, input: WhiteLabelApplicationInput, at: string): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  updateBrandForMember(memberId: string, input: WhiteLabelBrandInput, at: string): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  selectVariantForMember(
    memberId: string,
    input: WhiteLabelSelectionInput,
    exactVariant: WhiteLabelVariantAuthorityRecord,
    at: string,
  ): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  requestQuoteForMember(memberId: string, input: WhiteLabelQuoteRequestInput, at: string): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  submitPackagingForMember(memberId: string, input: WhiteLabelPackagingReviewInput, at: string): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  setFulfillmentForMember(memberId: string, input: WhiteLabelFulfillmentInput, at: string): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  openSupportForMember(memberId: string, input: WhiteLabelSupportInput, at: string): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
}

export interface WhiteLabelPartnerService {
  get(memberId: string): Promise<WhiteLabelResult<WhiteLabelWorkspaceView>>;
  apply(memberId: string, input: WhiteLabelApplicationInput): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  updateBrand(memberId: string, input: WhiteLabelBrandInput): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  selectVariant(memberId: string, input: WhiteLabelSelectionInput): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  requestQuote(memberId: string, input: WhiteLabelQuoteRequestInput): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  submitPackaging(memberId: string, input: WhiteLabelPackagingReviewInput): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  setFulfillment(memberId: string, input: WhiteLabelFulfillmentInput): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
  openSupport(memberId: string, input: WhiteLabelSupportInput): Promise<WhiteLabelResult<WhiteLabelCommandResult>>;
}

function denied(code: WhiteLabelDenialCode, message: string): WhiteLabelResult<never> {
  return { ok: false, code, message };
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function validKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function validVersion(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function validInstant(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function exactVariantView(record: WhiteLabelVariantAuthorityRecord): WhiteLabelVariantView {
  const selectable =
    record.productApproved &&
    record.productActive &&
    record.variantApproved &&
    record.variantActive &&
    record.privateLabelApproved &&
    record.qualityState !== "blocked";
  const unavailableReason = !record.productApproved || !record.productActive
    ? "Product approval is required."
    : !record.variantApproved || !record.variantActive
      ? "Variant approval is required."
      : !record.privateLabelApproved
        ? "This variant is not approved for a white-label program."
        : record.qualityState === "blocked"
          ? "Quality review blocks this variant."
          : null;
  return {
    productId: record.productId,
    variantId: record.variantId,
    sku: record.sku,
    productName: record.productName,
    variantName: record.variantName,
    qualityState: record.qualityState,
    selectable,
    unavailableReason,
  };
}

function validateApplication(input: WhiteLabelApplicationInput): string | null {
  if (!cleanText(input.organizationName, 160)) return "Organization name is required.";
  if (!cleanText(input.contactName, 160)) return "Contact name is required.";
  if (!cleanText(input.contactEmail, 254) || !input.contactEmail.includes("@")) return "A valid contact email is required.";
  if (input.intendedBrandMode !== null && !isWhiteLabelBrandMode(input.intendedBrandMode)) return "Brand mode is invalid.";
  if (!validKey(input.idempotencyKey)) return "A valid idempotency key is required.";
  return null;
}

function validateVersioned(input: { expectedVersion: number; idempotencyKey: string }): string | null {
  if (!validVersion(input.expectedVersion)) return "A positive workspace version is required.";
  if (!validKey(input.idempotencyKey)) return "A valid idempotency key is required.";
  return null;
}

function assertSafeResult<T>(result: WhiteLabelResult<T>): WhiteLabelResult<T> {
  if (result.ok) assertWhiteLabelPartnerPayloadSafe(result.value);
  return result;
}

async function approvedWorkspace(
  port: WhiteLabelWorkspaceCommandPort,
  memberId: string,
): Promise<WhiteLabelResult<WhiteLabelWorkspaceView>> {
  const workspace = await port.getForMember(memberId);
  if (!workspace) return denied("white_label_not_found", "No organization workspace is available for this member.");
  if (workspace.applicationState !== "approved") {
    return denied("white_label_not_approved", "Organization approval is required before configuring white-label operations.");
  }
  assertWhiteLabelPartnerPayloadSafe(workspace);
  return { ok: true, value: workspace };
}

export function createWhiteLabelPartnerService(deps: {
  port: WhiteLabelWorkspaceCommandPort;
  variants: WhiteLabelVariantAuthority;
  now?: () => Date;
}): WhiteLabelPartnerService {
  const now = deps.now ?? (() => new Date());
  const timestamp = () => {
    const value = now().toISOString();
    if (!validInstant(value)) throw new Error("white-label clock returned an invalid instant");
    return value;
  };

  return {
    async get(memberId) {
      if (!cleanText(memberId, 200)) return denied("white_label_forbidden", "A verified member is required.");
      const workspace = await deps.port.getForMember(memberId);
      if (!workspace) return denied("white_label_not_found", "No organization workspace is available for this member.");
      const variants = await deps.variants.listForMember(memberId);
      const view: WhiteLabelWorkspaceView = { ...workspace, variants: variants.map(exactVariantView) };
      assertWhiteLabelPartnerPayloadSafe(view);
      return { ok: true, value: view };
    },

    async apply(memberId, input) {
      if (!cleanText(memberId, 200)) return denied("white_label_forbidden", "A verified member is required.");
      const invalid = validateApplication(input);
      if (invalid) return denied("white_label_invalid", invalid);
      return assertSafeResult(await deps.port.applyForMember(memberId, input, timestamp()));
    },

    async updateBrand(memberId, input) {
      const approval = await approvedWorkspace(deps.port, memberId);
      if (!approval.ok) return approval;
      const invalid = validateVersioned(input);
      if (invalid) return denied("white_label_invalid", invalid);
      if (!cleanText(input.brandName, 160) || !isWhiteLabelBrandMode(input.mode)) {
        return denied("white_label_invalid", "A brand name and valid presentation mode are required.");
      }
      if (!isWhiteLabelHexColor(input.primaryColor) || !isWhiteLabelHexColor(input.secondaryColor)) {
        return denied("white_label_invalid", "Brand colors must use six-digit hex values.");
      }
      return assertSafeResult(await deps.port.updateBrandForMember(memberId, input, timestamp()));
    },

    async selectVariant(memberId, input) {
      const approval = await approvedWorkspace(deps.port, memberId);
      if (!approval.ok) return approval;
      const invalid = validateVersioned(input);
      if (invalid || !cleanText(input.sku, 120) || !Number.isSafeInteger(input.requestedQuantity) || input.requestedQuantity <= 0) {
        return denied("white_label_invalid", invalid ?? "An exact SKU and positive whole-unit quantity are required.");
      }
      const exact = await deps.variants.findExact(memberId, input.sku);
      if (!exact || exact.sku !== input.sku) {
        return denied("white_label_variant_unavailable", "The exact variant is unavailable.");
      }
      const view = exactVariantView(exact);
      if (!view.selectable) return denied("white_label_variant_unavailable", view.unavailableReason ?? "The exact variant is unavailable.");
      return assertSafeResult(await deps.port.selectVariantForMember(memberId, input, exact, timestamp()));
    },

    async requestQuote(memberId, input) {
      const approval = await approvedWorkspace(deps.port, memberId);
      if (!approval.ok) return approval;
      const invalid = validateVersioned(input);
      const ids = Array.from(new Set(input.selectionIds.filter((id) => cleanText(id, 160) !== null)));
      if (invalid || ids.length === 0 || ids.length !== input.selectionIds.length) {
        return denied("white_label_quote_invalid", invalid ?? "A quote needs unique current selections.");
      }
      const selectionMap = new Map(approval.value.selections.map((selection) => [selection.selectionId, selection]));
      for (const id of ids) {
        const selection = selectionMap.get(id);
        if (!selection) return denied("white_label_quote_invalid", "A selected line is no longer part of this workspace.");
        const current = await deps.variants.findExact(memberId, selection.sku);
        if (!current || !exactVariantView(current).selectable) {
          return denied("white_label_variant_unavailable", "A selected variant is no longer eligible.");
        }
      }
      return assertSafeResult(await deps.port.requestQuoteForMember(memberId, { ...input, selectionIds: ids }, timestamp()));
    },

    async submitPackaging(memberId, input) {
      const approval = await approvedWorkspace(deps.port, memberId);
      if (!approval.ok) return approval;
      const invalid = validateVersioned(input);
      if (invalid || !cleanText(input.packagingPreviewReference, 300)) {
        return denied("white_label_invalid", invalid ?? "A reviewed packaging preview reference is required.");
      }
      return assertSafeResult(await deps.port.submitPackagingForMember(memberId, input, timestamp()));
    },

    async setFulfillment(memberId, input) {
      const approval = await approvedWorkspace(deps.port, memberId);
      if (!approval.ok) return approval;
      const invalid = validateVersioned(input);
      if (invalid || !isWhiteLabelFulfillmentMode(input.mode)) {
        return denied("white_label_invalid", invalid ?? "Fulfillment mode is invalid.");
      }
      return assertSafeResult(await deps.port.setFulfillmentForMember(memberId, input, timestamp()));
    },

    async openSupport(memberId, input) {
      const workspace = await deps.port.getForMember(memberId);
      if (!workspace) return denied("white_label_not_found", "No organization workspace is available for this member.");
      const invalid = validateVersioned(input);
      if (invalid || !cleanText(input.subject, 160) || !cleanText(input.detail, 4000)) {
        return denied("white_label_invalid", invalid ?? "A subject and support detail are required.");
      }
      return assertSafeResult(await deps.port.openSupportForMember(memberId, input, timestamp()));
    },
  };
}
