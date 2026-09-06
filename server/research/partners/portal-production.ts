// xenios research: the production data port for the partner portal.
//
// Every read below is a query against a table that ALREADY EXISTS in the shipped
// schema (supabase/production/research-full-production.sql). This lane authors no
// migration, so where the shipped schema has no table the port answers with an
// honest empty list and the gap is named here rather than filled with a plausible
// row:
//
//   * APPROVED ASSET LIBRARY. research_content_assets holds content a PARTNER
//     submitted for review, which is the opposite direction. There is no published
//     library table in the shipped schema, so `approvedLibrary` returns []. The
//     partner Resources door no longer reads this port for its library: it is
//     served by the Resource Hub (server/research/resource-hub/*), whose tables
//     arrive with candidate migration 20260906120000_research_resource_library
//     and whose production composition stays dark until that migration is applied
//     and RESEARCH_RESOURCE_HUB_ENABLED=true is set.
//   * PARTNER SESSION HISTORY. There is no partner or member session table, so
//     `sessionsFor` returns []. MISSING TABLE: research_partner_sessions.
//   * CAMPAIGN, EVENT, AND ORGANIZATION REQUESTS. There is no request-intake table,
//     so those writes are refused at the route with capability_disabled rather than
//     recorded somewhere they do not belong. MISSING TABLE: research_partner_requests.
//
// Scoping is the point of this file. Every query filters on the partner id the route
// layer resolved from the authenticated member, and the organization reads resolve
// membership (owner or representative) BEFORE reading anything organization-shaped,
// so one partner's query can never return another organization's rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommissionState, PartnerRole, PartnerState } from "@shared/research/distribution";
import { PARTNER_ROLES } from "@shared/research/distribution";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import type {
  PartnerPortalPort,
  PortalAgreementRow,
  PortalClearance,
  PortalCommissionRow,
  PortalContentSubmissionInput,
  PortalContentSubmissionRow,
  PortalConversionRow,
  PortalLinkRow,
  PortalOrganizationEventRow,
  PortalOrganizationRow,
  PortalPartnerIdentity,
  PortalPayoutBatchRow,
  PortalTouchRow,
  PortalTrainingRow,
  PortalWriteResult,
} from "./portal";

const PARTNERS = "research_partners";
const AGREEMENTS = "research_partner_agreements";
const TRAINING = "research_partner_training";
const LINKS = "research_partner_links";
const TOUCHES = "research_attribution_touches";
const CONVERSIONS = "research_attribution_conversions";
const COMMISSION_LEDGER = "research_commission_ledger";
const PAYOUT_BATCHES = "research_payout_batches";
const ORGANIZATIONS = "research_organizations";
const ORGANIZATION_REPRESENTATIVES = "research_organization_representatives";
const ORGANIZATION_EVENTS = "research_organization_events";
const CONTENT_ASSETS = "research_content_assets";

const UNIQUE_VIOLATION = "23505";

const PARTNER_STATES: readonly PartnerState[] = [
  "application",
  "identity_verification_pending",
  "tax_status_pending",
  "payout_status_pending",
  "agreement_pending",
  "training_pending",
  "certification_pending",
  "active",
  "quality_review",
  "suspended",
  "terminated",
];

const CLEARANCES: readonly PortalClearance[] = ["not_started", "submitted", "verified", "rejected"];

const COMMISSION_STATES: readonly CommissionState[] = [
  "pending",
  "held",
  "approved",
  "payable",
  "paid",
  "reversed",
  "disputed",
  "forfeited",
];

/**
 * A persisted enum is validated on the way out, never cast. A row written by some
 * future path with an unexpected value is DROPPED rather than trusted, which is the
 * same discipline the partner persistence store applies to link channels.
 */
function asPartnerRole(value: unknown): PartnerRole | null {
  return typeof value === "string" && (PARTNER_ROLES as readonly string[]).includes(value)
    ? (value as PartnerRole)
    : null;
}

function asPartnerState(value: unknown): PartnerState | null {
  return typeof value === "string" && (PARTNER_STATES as readonly string[]).includes(value)
    ? (value as PartnerState)
    : null;
}

function asClearance(value: unknown): PortalClearance {
  return typeof value === "string" && (CLEARANCES as readonly string[]).includes(value)
    ? (value as PortalClearance)
    : "not_started";
}

function asCommissionState(value: unknown): CommissionState | null {
  return typeof value === "string" && (COMMISSION_STATES as readonly string[]).includes(value)
    ? (value as CommissionState)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function cents(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

type Row = Record<string, unknown>;

/**
 * The Supabase-backed port.
 *
 * The client is injected so this is unit-testable with a double and never opens a
 * connection in a test. Every method that reads partner-owned rows filters on the
 * partnerId argument, which the route layer derived from the authenticated member.
 */
export function createSupabasePartnerPortalPort(
  client: SupabaseClient = getSupabaseAdmin(),
): PartnerPortalPort {
  async function organizationIdsFor(partnerId: string): Promise<string[]> {
    // Membership is resolved from two facts, both partner-scoped: the organizations
    // this partner owns, and the ones it represents. Nothing else grants visibility.
    const owned = await client.from(ORGANIZATIONS).select("id").eq("owner_partner_id", partnerId);
    if (owned.error) throw new Error(`partner organizations unavailable: ${owned.error.message}`);
    const represented = await client
      .from(ORGANIZATION_REPRESENTATIVES)
      .select("organization_id")
      .eq("partner_id", partnerId);
    if (represented.error) {
      throw new Error(`partner organization representation unavailable: ${represented.error.message}`);
    }
    const ids = new Set<string>();
    ((owned.data ?? []) as Row[]).forEach((row) => {
      const id = text(row.id);
      if (id !== null) ids.add(id);
    });
    ((represented.data ?? []) as Row[]).forEach((row) => {
      const id = text(row.organization_id);
      if (id !== null) ids.add(id);
    });
    return Array.from(ids);
  }

  return {
    async findPartnerForMember(memberId): Promise<PortalPartnerIdentity | null> {
      const found = await client
        .from(PARTNERS)
        .select(
          "id, member_id, role, state, identity_verified, tax_status, payout_status, certified_at, activated_at",
        )
        .eq("member_id", memberId)
        .maybeSingle();
      if (found.error) throw new Error(`partner lookup failed: ${found.error.message}`);
      if (!found.data) return null;
      const row = found.data as Row;
      const role = asPartnerRole(row.role);
      const state = asPartnerState(row.state);
      const partnerId = text(row.id);
      if (role === null || state === null || partnerId === null) return null;
      return {
        partnerId,
        memberId,
        role,
        state,
        identityVerified: row.identity_verified === true,
        taxStatus: asClearance(row.tax_status),
        payoutStatus: asClearance(row.payout_status),
        certifiedAt: text(row.certified_at),
        activatedAt: text(row.activated_at),
      };
    },

    async agreementsFor(partnerId): Promise<readonly PortalAgreementRow[]> {
      const found = await client
        .from(AGREEMENTS)
        .select("agreement_key, agreement_version, decision, decided_at")
        .eq("partner_id", partnerId);
      if (found.error) throw new Error(`partner agreements unavailable: ${found.error.message}`);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const key = text(row.agreement_key);
        const version = text(row.agreement_version);
        if (key === null || version === null) return [];
        return [
          {
            agreementKey: key,
            agreementVersion: version,
            decision: row.decision === "declined" ? ("declined" as const) : ("accepted" as const),
            decidedAt: text(row.decided_at) ?? "",
          },
        ];
      });
    },

    async trainingFor(partnerId): Promise<readonly PortalTrainingRow[]> {
      const found = await client
        .from(TRAINING)
        .select("module_key, module_version, completed_at")
        .eq("partner_id", partnerId);
      if (found.error) throw new Error(`partner training unavailable: ${found.error.message}`);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const key = text(row.module_key);
        const version = text(row.module_version);
        const completedAt = text(row.completed_at);
        if (key === null || version === null || completedAt === null) return [];
        return [{ moduleKey: key, moduleVersion: version, completedAt }];
      });
    },

    async linksFor(partnerId): Promise<readonly PortalLinkRow[]> {
      const found = await client
        .from(LINKS)
        .select("id, channel, campaign, created_at, revoked_at")
        .eq("partner_id", partnerId);
      if (found.error) throw new Error(`partner links unavailable: ${found.error.message}`);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const id = text(row.id);
        const channel = text(row.channel);
        const createdAt = text(row.created_at);
        if (id === null || channel === null || createdAt === null) return [];
        return [{ linkId: id, channel, campaign: text(row.campaign), createdAt, revokedAt: text(row.revoked_at) }];
      });
    },

    async touchesFor(partnerId): Promise<readonly PortalTouchRow[]> {
      // The subject key is NOT selected. A lead is a count; the column that could
      // identify a visitor never enters this process.
      const found = await client.from(TOUCHES).select("channel, occurred_at").eq("partner_id", partnerId);
      if (found.error) throw new Error(`partner leads unavailable: ${found.error.message}`);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const channel = text(row.channel);
        const occurredAt = text(row.occurred_at);
        if (channel === null || occurredAt === null) return [];
        return [{ channel, occurredAt }];
      });
    },

    async conversionsFor(partnerId): Promise<readonly PortalConversionRow[]> {
      // Neither order_id nor subject_key is selected: a partner learns that a
      // conversion happened, never which order it was or whose.
      const found = await client.from(CONVERSIONS).select("converted_at").eq("partner_id", partnerId);
      if (found.error) throw new Error(`partner conversions unavailable: ${found.error.message}`);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const convertedAt = text(row.converted_at);
        return convertedAt === null ? [] : [{ convertedAt }];
      });
    },

    async commissionsFor(partnerId): Promise<readonly PortalCommissionRow[]> {
      // The AFFILIATE_COMMISSION ledger, and only it. order_id is deliberately not
      // selected, so a member's order reference has no path into a partner payload.
      const found = await client
        .from(COMMISSION_LEDGER)
        .select("id, state, amount_cents, reverses_ledger_id, created_at")
        .eq("partner_id", partnerId);
      if (found.error) throw new Error(`partner commissions unavailable: ${found.error.message}`);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const id = text(row.id);
        const state = asCommissionState(row.state);
        const createdAt = text(row.created_at);
        if (id === null || state === null || createdAt === null) return [];
        return [
          {
            id,
            state,
            amountCents: cents(row.amount_cents),
            reversesLedgerId: text(row.reverses_ledger_id),
            createdAt,
          },
        ];
      });
    },

    async payoutBatchesFor(partnerId): Promise<readonly PortalPayoutBatchRow[]> {
      // Status only. Nothing here writes a batch, submits one, or retries one.
      const found = await client
        .from(PAYOUT_BATCHES)
        .select("id, total_cents, state, provider_name, built_at, settled_at")
        .eq("partner_id", partnerId);
      if (found.error) throw new Error(`partner payouts unavailable: ${found.error.message}`);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const id = text(row.id);
        const state = text(row.state);
        const builtAt = text(row.built_at);
        if (id === null || state === null || builtAt === null) return [];
        return [
          {
            batchId: id,
            totalCents: cents(row.total_cents),
            state,
            providerName: text(row.provider_name) ?? "disabled",
            builtAt,
            settledAt: text(row.settled_at),
          },
        ];
      });
    },

    async organizationsFor(partnerId): Promise<readonly PortalOrganizationRow[]> {
      const ids = await organizationIdsFor(partnerId);
      if (ids.length === 0) return [];
      const found = await client.from(ORGANIZATIONS).select("id, name, state, owner_partner_id").in("id", ids);
      if (found.error) throw new Error(`partner organizations unavailable: ${found.error.message}`);
      const allowed = new Set(ids);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const id = text(row.id);
        const name = text(row.name);
        const owner = text(row.owner_partner_id);
        // A row outside the resolved membership set is dropped, so even a wrong
        // filter upstream cannot widen what this partner sees.
        if (id === null || name === null || owner === null || !allowed.has(id)) return [];
        return [{ orgId: id, name, state: text(row.state) ?? "active", ownerPartnerId: owner }];
      });
    },

    async eventsForOrganizations(orgIds): Promise<readonly PortalOrganizationEventRow[]> {
      if (orgIds.length === 0) return [];
      const found = await client
        .from(ORGANIZATION_EVENTS)
        .select("id, organization_id, name, campaign, starts_at")
        .in("organization_id", orgIds as string[]);
      if (found.error) throw new Error(`partner events unavailable: ${found.error.message}`);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const id = text(row.id);
        const organizationId = text(row.organization_id);
        const name = text(row.name);
        if (id === null || organizationId === null || name === null) return [];
        return [{ eventId: id, organizationId, name, campaign: text(row.campaign), startsAt: text(row.starts_at) }];
      });
    },

    async contentSubmissionsFor(partnerId): Promise<readonly PortalContentSubmissionRow[]> {
      // The body is not selected. The partner already knows what they wrote, and a
      // review surface has no reason to move the text back across the wire.
      const found = await client
        .from(CONTENT_ASSETS)
        .select("id, title, state, created_at")
        .eq("partner_id", partnerId);
      if (found.error) throw new Error(`partner submissions unavailable: ${found.error.message}`);
      return ((found.data ?? []) as Row[]).flatMap((row) => {
        const id = text(row.id);
        const title = text(row.title);
        const createdAt = text(row.created_at);
        if (id === null || title === null || createdAt === null) return [];
        return [{ assetId: id, title, state: text(row.state) ?? "submitted", createdAt }];
      });
    },

    async submitContent(partnerId, input: PortalContentSubmissionInput): Promise<PortalWriteResult> {
      // Submitted content is exactly that: submitted. This write can only ever
      // create a row in the 'submitted' state, so nothing in this path can mark
      // content approved, and the schema's own constraint requires an admin, a
      // disclosure, and an expiry before 'preapproved' is even expressible.
      const body = input.link === null ? input.description : `${input.description}\n\nDraft link: ${input.link}`;
      const inserted = await client
        .from(CONTENT_ASSETS)
        .insert({ partner_id: partnerId, title: input.title, body, state: "submitted" })
        .select("id")
        .maybeSingle();
      if (inserted.error) {
        if (inserted.error.code === UNIQUE_VIOLATION) {
          return {
            ok: false,
            code: "duplicate_title",
            message: "You already submitted content with that title. Give this version a different title.",
          };
        }
        return {
          ok: false,
          code: "capability_disabled",
          message: "Content submissions are not reachable right now, so nothing was submitted.",
        };
      }
      const id = text((inserted.data as Row | null)?.id);
      return { ok: true, submissionId: id ?? "" };
    },

    async approvedLibrary() {
      // MISSING TABLE (documented at the top of this file): there is no published
      // asset library. An empty list is the truth; the page says so in its own words.
      return [];
    },

    async sessionsFor() {
      // MISSING TABLE: no partner session history exists to report.
      return [];
    },
  };
}

/**
 * The port used when Supabase is not configured.
 *
 * It answers every read as "this member owns no partner", which the route layer turns
 * into 404 partner_not_found and the pages render as their honest pending state. It
 * refuses the one write. Nothing is fabricated and nothing half-works.
 */
export function createUnconfiguredPartnerPortalPort(): PartnerPortalPort {
  const empty = async () => [];
  return {
    async findPartnerForMember() {
      return null;
    },
    agreementsFor: empty,
    trainingFor: empty,
    linksFor: empty,
    touchesFor: empty,
    conversionsFor: empty,
    commissionsFor: empty,
    payoutBatchesFor: empty,
    organizationsFor: empty,
    eventsForOrganizations: empty,
    contentSubmissionsFor: empty,
    async submitContent(): Promise<PortalWriteResult> {
      return {
        ok: false,
        code: "capability_disabled",
        message: "Content submissions are not being accepted yet, so nothing was submitted.",
      };
    },
    approvedLibrary: empty,
    sessionsFor: empty,
  };
}

export function resolvePartnerPortalPort(): PartnerPortalPort {
  return supabaseConfigured() ? createSupabasePartnerPortalPort() : createUnconfiguredPartnerPortalPort();
}

/** Compliance submissions are durable only when the database behind them is. */
export function partnerSubmissionsEnabled(): boolean {
  return supabaseConfigured();
}
