import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AffiliateCommandResult,
  AffiliateLinkView,
  AffiliatePartnerView,
  AffiliateStatementView,
  ConfigureAffiliatePartnerInput,
  CreateAffiliateLinkInput,
  PublishAffiliateStatementInput,
  RecordAttributionInput,
  RecordCommissionInput,
} from "@shared/research/affiliates/contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9:_./-]{8,200}$/;
const CODE = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;
const CURRENCY = /^[A-Z]{3}$/;

function commandResult(data: unknown): AffiliateCommandResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Affiliate command returned invalid evidence.");
  const row = data as Record<string, unknown>;
  if (typeof row.recordId !== "string" || typeof row.state !== "string" || typeof row.version !== "number") {
    throw new Error("Affiliate command returned incomplete evidence.");
  }
  return { recordId: row.recordId, state: row.state, version: row.version, idempotentReplay: row.idempotentReplay === true };
}

function uuid(value: string, label: string): void {
  if (!UUID.test(value)) throw new Error(`${label} must be a UUID.`);
}

function at(value: string): void {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error("Timestamp must be normalized UTC.");
}

function key(value: string): void {
  if (!KEY.test(value)) throw new Error("Idempotency key is invalid.");
}

export interface AffiliateOperationsPort {
  listPartners(): Promise<AffiliatePartnerView[]>;
  listLinks(partnerId: string): Promise<AffiliateLinkView[]>;
  listStatements(partnerId: string): Promise<AffiliateStatementView[]>;
  configurePartner(input: ConfigureAffiliatePartnerInput): Promise<AffiliateCommandResult>;
  createLink(input: CreateAffiliateLinkInput): Promise<AffiliateCommandResult>;
  recordAttribution(input: RecordAttributionInput): Promise<AffiliateCommandResult>;
  recordCommission(input: RecordCommissionInput): Promise<AffiliateCommandResult>;
  publishStatement(input: PublishAffiliateStatementInput): Promise<AffiliateCommandResult>;
}

export function createProductionAffiliateOperations(client: SupabaseClient): AffiliateOperationsPort {
  return {
    async listPartners() {
      const { data, error } = await client
        .from("research_affiliate_partners")
        .select("id,partner_code,display_name,state,disclosure,agreement_reference,version,updated_at")
        .order("display_name");
      if (error) throw new Error(`Affiliate partners unavailable: ${error.message}`);
      return (data ?? []).map((row) => ({
        partnerId: row.id,
        partnerCode: row.partner_code,
        displayName: row.display_name,
        state: row.state,
        disclosure: row.disclosure,
        agreementReference: row.agreement_reference,
        version: row.version,
        updatedAt: row.updated_at,
      })) as AffiliatePartnerView[];
    },
    async listLinks(partnerId) {
      uuid(partnerId, "partnerId");
      const { data, error } = await client
        .from("research_affiliate_links")
        .select("id,partner_id,code,destination_path,campaign,state,version")
        .eq("partner_id", partnerId)
        .order("code");
      if (error) throw new Error(`Affiliate links unavailable: ${error.message}`);
      return (data ?? []).map((row) => ({
        linkId: row.id,
        partnerId: row.partner_id,
        code: row.code,
        destinationPath: row.destination_path,
        campaign: row.campaign,
        state: row.state,
        version: row.version,
      })) as AffiliateLinkView[];
    },
    async listStatements(partnerId) {
      uuid(partnerId, "partnerId");
      const { data, error } = await client
        .from("research_affiliate_statements")
        .select("id,partner_id,period_start,period_end,currency,gross_commission_cents,reversal_cents,payable_cents,state,version,supersedes_statement_id,research_affiliate_statement_items(count),issued_at")
        .eq("partner_id", partnerId)
        .order("period_end", { ascending: false });
      if (error) throw new Error(`Affiliate statements unavailable: ${error.message}`);
      return (data ?? []).map((row) => ({
        statementId: row.id,
        partnerId: row.partner_id,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        currency: row.currency,
        grossCommissionCents: row.gross_commission_cents,
        reversalCents: row.reversal_cents,
        payableCents: row.payable_cents,
        state: row.state,
        version: row.version,
        supersedesStatementId: row.supersedes_statement_id,
        itemCount: row.research_affiliate_statement_items?.[0]?.count ?? 0,
        issuedAt: row.issued_at,
      })) as AffiliateStatementView[];
    },
    async configurePartner(input) {
      uuid(input.actorId, "actorId");
      if (input.partnerId) uuid(input.partnerId, "partnerId");
      if (!CODE.test(input.partnerCode)) throw new Error("Partner code is invalid.");
      if (!input.displayName.trim()) throw new Error("Partner display name is required.");
      if (input.state === "active" && (!input.disclosure?.trim() || !input.agreementReference?.trim())) {
        throw new Error("Active affiliate requires disclosure and agreement evidence.");
      }
      key(input.idempotencyKey); at(input.at);
      const { data, error } = await client.rpc("research_affiliate_configure_partner", {
        p_actor_auth_user_id: input.actorId, p_partner_id: input.partnerId ?? null,
        p_partner_code: input.partnerCode, p_display_name: input.displayName,
        p_state: input.state, p_disclosure: input.disclosure ?? null,
        p_agreement_reference: input.agreementReference ?? null,
        p_expected_version: input.expectedVersion, p_idempotency_key: input.idempotencyKey, p_at: input.at,
      });
      if (error) throw new Error(`Affiliate partner command failed: ${error.message}`);
      return commandResult(data);
    },
    async createLink(input) {
      uuid(input.actorId, "actorId"); uuid(input.partnerId, "partnerId");
      if (!CODE.test(input.code)) throw new Error("Affiliate link code is invalid.");
      if (!input.destinationPath.startsWith("/") || input.destinationPath.startsWith("//")) throw new Error("Affiliate destination must be an internal path.");
      key(input.idempotencyKey); at(input.at);
      const { data, error } = await client.rpc("research_affiliate_create_link", {
        p_actor_auth_user_id: input.actorId, p_partner_id: input.partnerId,
        p_code: input.code, p_destination_path: input.destinationPath,
        p_campaign: input.campaign ?? null, p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey, p_at: input.at,
      });
      if (error) throw new Error(`Affiliate link command failed: ${error.message}`);
      return commandResult(data);
    },
    async recordAttribution(input) {
      uuid(input.actorId, "actorId"); uuid(input.partnerId, "partnerId");
      uuid(input.linkId, "linkId"); uuid(input.orderId, "orderId");
      key(input.idempotencyKey); at(input.at);
      const { data, error } = await client.rpc("research_affiliate_record_attribution", {
        p_actor_auth_user_id: input.actorId, p_partner_id: input.partnerId,
        p_link_id: input.linkId, p_order_id: input.orderId,
        p_idempotency_key: input.idempotencyKey, p_at: input.at,
      });
      if (error) throw new Error(`Attribution command failed: ${error.message}`);
      return commandResult(data);
    },
    async recordCommission(input) {
      uuid(input.actorId, "actorId"); uuid(input.partnerId, "partnerId"); uuid(input.attributionEventId, "attributionEventId");
      if (input.action === "mark_paid" && (!input.payoutProvider?.trim() || !input.payoutReference?.trim())) {
        throw new Error("Paid commission evidence requires payout provider and reference.");
      }
      if (input.action !== "mark_paid" && (input.payoutProvider !== undefined || input.payoutReference !== undefined)) {
        throw new Error("Payout evidence is valid only when recording a paid commission.");
      }
      key(input.idempotencyKey); at(input.at);
      const { data, error } = await client.rpc("research_affiliate_record_commission", {
        p_actor_auth_user_id: input.actorId, p_partner_id: input.partnerId,
        p_attribution_event_id: input.attributionEventId, p_action: input.action,
        p_reason: input.reason ?? null,
        p_payout_provider: input.payoutProvider ?? null,
        p_payout_reference: input.payoutReference ?? null,
        p_idempotency_key: input.idempotencyKey, p_at: input.at,
      });
      if (error) throw new Error(`Commission command failed: ${error.message}`);
      return commandResult(data);
    },
    async publishStatement(input) {
      uuid(input.actorId, "actorId"); uuid(input.partnerId, "partnerId");
      if (input.supersedesStatementId) {
        uuid(input.supersedesStatementId, "supersedesStatementId");
      }
      if (!CURRENCY.test(input.currency) || input.periodEnd <= input.periodStart) throw new Error("Statement period or currency is invalid.");
      key(input.idempotencyKey); at(input.at);
      const { data, error } = await client.rpc("research_affiliate_publish_statement", {
        p_actor_auth_user_id: input.actorId, p_partner_id: input.partnerId,
        p_period_start: input.periodStart, p_period_end: input.periodEnd,
        p_currency: input.currency,
        p_supersedes_statement_id: input.supersedesStatementId ?? null,
        p_idempotency_key: input.idempotencyKey, p_at: input.at,
      });
      if (error) throw new Error(`Affiliate statement command failed: ${error.message}`);
      return commandResult(data);
    },
  };
}
