import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommercialCommandResult,
  ConfigureLawrenceInput,
  ConfigureProfessionalAccountInput,
  LawrenceConfigurationView,
  OperationsCommandCenterView,
  ProfessionalAccountView,
} from "@shared/research/operations/commercial";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9:_./-]{8,200}$/;
const CURRENCY = /^[A-Z]{3}$/;

function command(data: unknown): CommercialCommandResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Commercial command returned invalid evidence.");
  const row = data as Record<string, unknown>;
  if (typeof row.recordId !== "string" || typeof row.state !== "string" || typeof row.version !== "number") {
    throw new Error("Commercial command returned incomplete evidence.");
  }
  return { recordId: row.recordId, state: row.state, version: row.version, idempotentReplay: row.idempotentReplay === true };
}

function validateCommon(actorId: string, idempotencyKey: string, at: string): void {
  if (!UUID.test(actorId)) throw new Error("actorId must be a UUID.");
  if (!KEY.test(idempotencyKey)) throw new Error("Idempotency key is invalid.");
  const parsed = new Date(at);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== at) throw new Error("Timestamp must be normalized UTC.");
}

export interface CommercialOperationsPort {
  listProfessionalAccounts(): Promise<ProfessionalAccountView[]>;
  readLawrence(partnerId: string): Promise<LawrenceConfigurationView | null>;
  readCommandCenter(): Promise<OperationsCommandCenterView>;
  configureProfessional(input: ConfigureProfessionalAccountInput): Promise<CommercialCommandResult>;
  configureLawrence(input: ConfigureLawrenceInput): Promise<CommercialCommandResult>;
}

export function createProductionCommercialOperations(client: SupabaseClient): CommercialOperationsPort {
  return {
    async listProfessionalAccounts() {
      const { data, error } = await client
        .from("research_professional_accounts")
        .select("id,legal_name,account_type,state,agreement_reference,version,updated_at")
        .order("legal_name");
      if (error) throw new Error(`Professional accounts unavailable: ${error.message}`);
      return (data ?? []).map((row) => ({
        accountId: row.id, legalName: row.legal_name, accountType: row.account_type,
        state: row.state, agreementReference: row.agreement_reference,
        version: row.version, updatedAt: row.updated_at,
      })) as ProfessionalAccountView[];
    },
    async readLawrence(partnerId) {
      if (!UUID.test(partnerId)) throw new Error("partnerId must be a UUID.");
      const { data, error } = await client
        .from("research_lawrence_configurations")
        .select("id,partner_id,partner_code,agreement_version,attribution_window_days,hold_days,payout_threshold_cents,currency,tiers,activation_bounty_cents,optional_retainer_cents,state,version,updated_at")
        .eq("partner_id", partnerId)
        .neq("state", "superseded")
        .maybeSingle();
      if (error) throw new Error(`Lawrence configuration unavailable: ${error.message}`);
      if (!data) return null;
      return {
        configurationId: data.id, partnerId: data.partner_id, partnerCode: data.partner_code,
        agreementVersion: data.agreement_version, attributionWindowDays: data.attribution_window_days,
        holdDays: data.hold_days, payoutThresholdCents: data.payout_threshold_cents,
        currency: data.currency, tiers: data.tiers,
        activationBountyCents: data.activation_bounty_cents,
        optionalRetainerCents: data.optional_retainer_cents,
        state: data.state, version: data.version, updatedAt: data.updated_at,
      } as LawrenceConfigurationView;
    },
    async readCommandCenter() {
      const { data, error } = await client.rpc("research_operations_command_center");
      if (error) throw new Error(`Operations command center unavailable: ${error.message}`);
      return data as OperationsCommandCenterView;
    },
    async configureProfessional(input) {
      validateCommon(input.actorId, input.idempotencyKey, input.at);
      if (input.accountId && !UUID.test(input.accountId)) throw new Error("accountId must be a UUID.");
      if (!input.legalName.trim()) throw new Error("Professional legal name is required.");
      if (input.state === "active" && !input.agreementReference?.trim()) {
        throw new Error("Active professional account requires agreement evidence.");
      }
      const { data, error } = await client.rpc("research_operations_configure_professional", {
        p_actor_auth_user_id: input.actorId, p_account_id: input.accountId ?? null,
        p_legal_name: input.legalName, p_account_type: input.accountType,
        p_state: input.state, p_agreement_reference: input.agreementReference ?? null,
        p_expected_version: input.expectedVersion, p_idempotency_key: input.idempotencyKey, p_at: input.at,
      });
      if (error) throw new Error(`Professional account command failed: ${error.message}`);
      return command(data);
    },
    async configureLawrence(input) {
      validateCommon(input.actorId, input.idempotencyKey, input.at);
      if (!UUID.test(input.partnerId)) throw new Error("partnerId must be a UUID.");
      if (!CURRENCY.test(input.currency)) throw new Error("Lawrence currency is invalid.");
      for (const value of [input.attributionWindowDays, input.holdDays, input.payoutThresholdCents]) {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error("Lawrence numeric terms must be non-negative integers.");
      }
      if (input.tiers.length === 0 || input.tiers.some((tier) =>
        !Number.isSafeInteger(tier.thresholdCents) || tier.thresholdCents < 0 ||
        !Number.isSafeInteger(tier.rateBasisPoints) || tier.rateBasisPoints < 0 || tier.rateBasisPoints > 10_000
      )) throw new Error("Lawrence tiers are invalid.");
      const { data, error } = await client.rpc("research_operations_configure_lawrence", {
        p_actor_auth_user_id: input.actorId, p_partner_id: input.partnerId,
        p_agreement_version: input.agreementVersion,
        p_attribution_window_days: input.attributionWindowDays, p_hold_days: input.holdDays,
        p_payout_threshold_cents: input.payoutThresholdCents, p_currency: input.currency,
        p_tiers: input.tiers, p_activation_bounty_cents: input.activationBountyCents ?? null,
        p_optional_retainer_cents: input.optionalRetainerCents ?? null, p_state: input.state,
        p_expected_version: input.expectedVersion, p_idempotency_key: input.idempotencyKey, p_at: input.at,
      });
      if (error) throw new Error(`Lawrence configuration command failed: ${error.message}`);
      return command(data);
    },
  };
}
