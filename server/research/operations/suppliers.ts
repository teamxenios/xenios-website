import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignSupplierUserInput,
  ConfigureSupplierOfferInput,
  OnboardSupplierInput,
  RecordSupplierSettlementInput,
  SupplierCommandResult,
  SupplierOfferView,
  SupplierView,
} from "@shared/research/operations/suppliers";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const KEY = /^[A-Za-z0-9:_./-]{8,200}$/;

function normalizedInstant(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("Timestamp must be a normalized millisecond UTC instant.");
  }
  return value;
}

function nonempty(value: string | undefined, label: string, max = 300): string {
  const normalized = value?.trim() ?? "";
  if (normalized.length < 2 || normalized.length > max) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function uuid(value: string, label: string): string {
  if (!UUID.test(value)) throw new Error(`${label} must be a UUID.`);
  return value;
}

function key(value: string): string {
  if (!KEY.test(value)) throw new Error("Idempotency key is invalid.");
  return value;
}

function commandResult(data: unknown): SupplierCommandResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Supplier command returned an invalid response.");
  }
  const row = data as Record<string, unknown>;
  if (
    typeof row.recordId !== "string" ||
    typeof row.state !== "string" ||
    typeof row.version !== "number"
  ) {
    throw new Error("Supplier command returned incomplete evidence.");
  }
  return {
    recordId: row.recordId,
    state: row.state,
    version: row.version,
    idempotentReplay: row.idempotentReplay === true,
  };
}

export interface SupplierOperationsPort {
  listSuppliers(actorId: string): Promise<SupplierView[]>;
  listOffers(actorId: string, supplierId: string): Promise<SupplierOfferView[]>;
  onboard(input: OnboardSupplierInput): Promise<SupplierCommandResult>;
  assignUser(input: AssignSupplierUserInput): Promise<SupplierCommandResult>;
  configureOffer(input: ConfigureSupplierOfferInput): Promise<SupplierCommandResult>;
  recordSettlement(input: RecordSupplierSettlementInput): Promise<SupplierCommandResult>;
}

export function createProductionSupplierOperations(
  client: SupabaseClient,
): SupplierOperationsPort {
  return {
    async listSuppliers(actorId) {
      uuid(actorId, "actorId");
      const { data, error } = await client.rpc(
        "research_fulfillment_list_suppliers",
        { p_actor_auth_user_id: actorId },
      );
      if (error) throw new Error(`Supplier list unavailable: ${error.message}`);
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        supplierId: row.supplierId,
        displayName: row.displayName,
        legalName: row.legalName,
        state: row.state,
        providerMode: row.providerMode,
        agreementReference: row.agreementReference,
        agreementVerifiedAt: row.agreementVerifiedAt,
        version: row.version,
        updatedAt: row.updatedAt,
      })) as SupplierView[];
    },

    async listOffers(actorId, supplierId) {
      uuid(actorId, "actorId");
      uuid(supplierId, "supplierId");
      const { data, error } = await client.rpc(
        "research_fulfillment_list_supplier_offers",
        {
          p_actor_auth_user_id: actorId,
          p_supplier_id: supplierId,
        },
      );
      if (error) throw new Error(`Supplier offers unavailable: ${error.message}`);
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        offerId: row.offerId,
        supplierId: row.supplierId,
        productId: row.productId,
        variantId: row.variantId,
        sku: row.sku,
        state: row.state,
        settlementCurrency: row.settlementCurrency,
        settlementAmountCents: row.settlementAmountCents,
        agreementReference: row.agreementReference,
        version: row.version,
        updatedAt: row.updatedAt,
      })) as SupplierOfferView[];
    },

    async onboard(input) {
      uuid(input.actorId, "actorId");
      if (input.expectedVersion !== 0) throw new Error("New supplier must expect version zero.");
      key(input.idempotencyKey);
      normalizedInstant(input.at);
      const displayName = nonempty(input.displayName, "Supplier display name", 120);
      const legalName = nonempty(input.legalName, "Supplier legal name", 200);
      const agreementReference = input.agreementReference?.trim() || null;
      if (input.providerMode === "live" && !agreementReference) {
        throw new Error("Live provider mode requires a verified agreement reference.");
      }
      const { data, error } = await client.rpc("research_fulfillment_onboard_supplier", {
        p_actor_auth_user_id: input.actorId,
        p_display_name: displayName,
        p_legal_name: legalName,
        p_provider_mode: input.providerMode,
        p_agreement_reference: agreementReference,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_at: input.at,
      });
      if (error) throw new Error(`Supplier onboarding failed: ${error.message}`);
      return commandResult(data);
    },

    async assignUser(input) {
      uuid(input.actorId, "actorId");
      uuid(input.supplierId, "supplierId");
      uuid(input.supplierAuthUserId, "supplierAuthUserId");
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
        throw new Error("Expected version must be a non-negative integer.");
      }
      key(input.idempotencyKey);
      normalizedInstant(input.at);
      const { data, error } = await client.rpc(
        "research_fulfillment_assign_supplier_user",
        {
          p_actor_auth_user_id: input.actorId,
          p_supplier_id: input.supplierId,
          p_supplier_auth_user_id: input.supplierAuthUserId,
          p_state: input.state,
          p_expected_version: input.expectedVersion,
          p_idempotency_key: input.idempotencyKey,
          p_at: input.at,
        },
      );
      if (error) throw new Error(`Supplier access command failed: ${error.message}`);
      return commandResult(data);
    },

    async configureOffer(input) {
      uuid(input.actorId, "actorId");
      uuid(input.supplierId, "supplierId");
      uuid(input.productId, "productId");
      uuid(input.variantId, "variantId");
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
        throw new Error("Expected version must be a non-negative integer.");
      }
      key(input.idempotencyKey);
      normalizedInstant(input.at);
      const sku = nonempty(input.sku, "SKU", 120);
      const currency = input.settlementCurrency?.trim().toUpperCase();
      const amount = input.settlementAmountCents;
      const agreement = input.agreementReference?.trim();
      if (input.state === "active") {
        if (!currency || !CURRENCY.test(currency)) {
          throw new Error("Active offer requires an ISO currency.");
        }
        if (!Number.isSafeInteger(amount) || (amount ?? -1) < 0) {
          throw new Error("Active offer requires an approved settlement amount.");
        }
        nonempty(agreement, "Agreement reference", 200);
      }
      const { data, error } = await client.rpc("research_fulfillment_configure_offer", {
        p_actor_auth_user_id: input.actorId,
        p_supplier_id: input.supplierId,
        p_product_id: input.productId,
        p_variant_id: input.variantId,
        p_sku: sku,
        p_state: input.state,
        p_settlement_currency: currency ?? null,
        p_settlement_amount_cents: amount ?? null,
        p_agreement_reference: agreement ?? null,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_at: input.at,
      });
      if (error) throw new Error(`Supplier offer command failed: ${error.message}`);
      return commandResult(data);
    },

    async recordSettlement(input) {
      uuid(input.actorId, "actorId");
      uuid(input.supplierId, "supplierId");
      uuid(input.assignmentId, "assignmentId");
      uuid(input.offerId, "offerId");
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
        throw new Error("Settlement amount must be non-negative integer cents.");
      }
      const currency = input.currency.trim().toUpperCase();
      if (!CURRENCY.test(currency)) throw new Error("Settlement currency must be ISO-4217.");
      const agreement = nonempty(input.agreementReference, "Agreement reference", 200);
      key(input.idempotencyKey);
      normalizedInstant(input.at);
      const { data, error } = await client.rpc("research_fulfillment_record_settlement", {
        p_actor_auth_user_id: input.actorId,
        p_supplier_id: input.supplierId,
        p_assignment_id: input.assignmentId,
        p_offer_id: input.offerId,
        p_amount_cents: input.amountCents,
        p_currency: currency,
        p_agreement_reference: agreement,
        p_external_reference: input.externalReference?.trim() || null,
        p_idempotency_key: input.idempotencyKey,
        p_at: input.at,
      });
      if (error) throw new Error(`Supplier settlement command failed: ${error.message}`);
      return commandResult(data);
    },
  };
}
