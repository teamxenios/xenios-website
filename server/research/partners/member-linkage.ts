// xenios research: the partner-member linkage (GAP 5a, domain layer).
//
// Every partner account is owned by exactly one member (research_partners.member_id
// is NOT NULL UNIQUE), and every member-facing read resolves the partner FROM the
// member id, never from a client-supplied partner id. This module is the composition
// layer that makes that ownership real:
//
//   - createPartnerForMember: member-scoped onboarding, one partner per member,
//     duplicate refused with a typed denial (the durable store backs the same rule
//     with the DB unique constraint).
//   - findByMemberId: resolves the member's own partner into a self view built by
//     EXPLICIT CONSTRUCTION, so legal name, contact email, internal notes, admin
//     ids, and the lifecycle history (which carries suspension reasons written for
//     Samuel) cannot reach a partner response.
//   - dashboardFor: aggregates ONLY. The stats source below derives lead and
//     conversion counts, commission totals, and the payable balance from the
//     APPEND-ONLY commission ledger; no other member's identity or health data has
//     any field to travel in.
//   - referral links: minted and listed through the existing link store, always
//     scoped by the partner resolved from the member.
//   - organization linkage: delegated to the organizations module, whose viewer
//     checks refuse a partner who does not represent the organization.
//
// The founder rules hold structurally here, not by promise: nothing in this file
// creates a monetary event (onboarding produces state, never money), and no shape
// in this file or beneath it carries a parent, sponsor, upline, downline, tier, or
// level field, so a recursive downline cannot be expressed.

import {
  toPartnerVisibleConversion,
  type CommissionState,
  type PartnerRole,
  type PartnerState,
  type PartnerVisibleConversion,
} from "@shared/research/distribution";
import type { PartnerLinkDto } from "@shared/research/commerce-api";
import type {
  PartnerDashboardResult,
  PartnerOnboardingInput,
  PartnerRecord,
  PartnerRepository,
  PartnerResult,
  PartnerService,
  PartnerStatsSource,
} from "./partners";
import type { CommissionLedgerEntry, CommissionLedgerRepository } from "./commissions";
import type { LinkChannel, StoredLink } from "./attribution";
import type {
  OrganizationAggregate,
  OrganizationRecord,
  OrganizationResult,
  OrganizationService,
} from "./organizations";
import type { AsyncPartnerLinkStore } from "../commerce/persistence/partners-store";

// ---------------------------------------------------------------------------
// The ledger-backed stats source (aggregates only)
// ---------------------------------------------------------------------------

/**
 * Commission states that represent value the partner actually holds. Reversed and
 * forfeited chains are excluded; the same set the organizations rollup counts, so
 * the two aggregate surfaces cannot drift apart in what they call a conversion.
 */
const COUNTED_COMMISSION_STATES: readonly CommissionState[] = [
  "pending",
  "held",
  "approved",
  "payable",
  "paid",
  "disputed",
];

export interface LedgerStatsDeps {
  ledger: CommissionLedgerRepository;
  /**
   * Lead counting seam. Leads live outside the ledger, so the count is injected
   * rather than invented; absent, the dashboard honestly reports zero leads.
   */
  countLeads?: (partnerId: string) => Promise<number>;
}

/**
 * A PartnerStatsSource derived entirely from the append-only commission ledger.
 *
 * Balances are derived by walking the chains every time, never accumulated, the
 * same discipline as CommissionService.balanceFor. `payableCents` counts ONLY
 * chains whose head state is "payable": a held, pending, or approved commission is
 * value the partner can see accrued but is NOT payable, so a hold placed by an
 * admin removes the amount from the payable balance the moment it lands.
 *
 * The snapshot is aggregate-shaped by type (PartnerStatsSnapshot has no member
 * field) and each conversion is rebuilt through toPartnerVisibleConversion, so
 * another member's identity or health data has no path into a partner dashboard.
 */
export function createLedgerPartnerStatsSource(deps: LedgerStatsDeps): PartnerStatsSource {
  return {
    async statsFor(partnerId) {
      const entries = await deps.ledger.listByPartner(partnerId);

      const chains = new Map<string, CommissionLedgerEntry[]>();
      entries.forEach((e) => {
        const bucket = chains.get(e.rootId);
        if (bucket) bucket.push(e);
        else chains.set(e.rootId, [e]);
      });

      let conversionCount = 0;
      let totalCommissionCents = 0;
      let payableCents = 0;
      const conversions: PartnerVisibleConversion[] = [];

      chains.forEach((chain) => {
        const accrual = chain.find((e) => e.kind === "accrual");
        // A chain with no accrual holds no conversion; skipped, never guessed at.
        if (!accrual) return;
        const head = chain[chain.length - 1];

        let accrued = 0;
        let reversed = 0;
        chain.forEach((e) => {
          if (e.kind === "accrual") accrued += e.amountCents;
          if (e.kind === "reversal") reversed += e.amountCents;
        });
        const outstanding = Math.max(0, accrued - reversed);
        if (outstanding <= 0) return;
        if (COUNTED_COMMISSION_STATES.indexOf(head.state) < 0) return;

        conversionCount += 1;
        totalCommissionCents += outstanding;
        if (head.state === "payable") payableCents += outstanding;

        conversions.push(
          toPartnerVisibleConversion({
            attributedAt: accrual.createdAt,
            eligibleNetCents: accrual.eligibleNetCents,
            commissionCents: outstanding,
            state: head.state,
          }),
        );
      });

      const leadCount = deps.countLeads ? await deps.countLeads(partnerId) : 0;
      return { leadCount, conversionCount, totalCommissionCents, payableCents, conversions };
    },
  };
}

// ---------------------------------------------------------------------------
// The partner self view
// ---------------------------------------------------------------------------

/**
 * What the member-facing layer may see about their own partner account.
 * Structurally identical to the route layer's PartnerSelfSource, so the next
 * phase wires this source in without an adapter.
 *
 * Deliberately absent: memberId (the route already knows its subject), legalName,
 * contactEmail, internalNotes, certifiedByAdminId, activatedByAdminId, and the
 * lifecycle history with its suspension and termination reasons.
 */
export interface PartnerSelfView {
  partnerId: string;
  role: PartnerRole;
  state: PartnerState;
  certifiedAt: string | null;
  activatedAt: string | null;
  training: Array<{ moduleKey: string; moduleVersion: string; completedAt: string }>;
  agreements: Array<{ agreementKey: string; agreementVersion: string; decidedAt: string }>;
}

/**
 * Built by EXPLICIT CONSTRUCTION from named fields. A field added to
 * PartnerRecord later cannot reach this view without being written here.
 */
export function toPartnerSelfView(record: PartnerRecord): PartnerSelfView {
  return {
    partnerId: record.partnerId,
    role: record.role,
    state: record.state,
    certifiedAt: record.certifiedAt,
    activatedAt: record.activatedAt,
    training: record.training.map((t) => ({
      moduleKey: t.moduleKey,
      moduleVersion: t.moduleVersion,
      completedAt: t.completedAt,
    })),
    agreements: record.agreements.map((a) => ({
      agreementKey: a.key,
      agreementVersion: a.version,
      decidedAt: a.acceptedAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// The member-scoped partner source
// ---------------------------------------------------------------------------

export type MemberLinkageDenialCode = "member_has_no_partner";

export type MemberLinkageResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: MemberLinkageDenialCode; message: string };

function noPartner<T>(): MemberLinkageResult<T> {
  return {
    ok: false,
    code: "member_has_no_partner",
    message: "This member does not own a partner account.",
  };
}

export interface MemberPartnerSourceDeps {
  repository: PartnerRepository;
  service: PartnerService;
  /** The existing durable link store. Every read here is partner-scoped. */
  links: AsyncPartnerLinkStore;
  /**
   * Mints a signed referral code for a partner. In production this is the
   * attribution service's signing path (signCode plus a fresh nonce), so an
   * unsigned code can never be issued from here either.
   */
  mintCode: (partnerId: string) => string;
  /** Base of the public referral URL, no trailing slash required. */
  linkBaseUrl: string;
  organizations: OrganizationService;
}

export interface MemberPartnerSource {
  /** Member-scoped onboarding. One partner per member; a duplicate is a typed denial. */
  createPartnerForMember(
    memberId: string,
    input: PartnerOnboardingInput,
    asOf: Date,
  ): Promise<PartnerResult>;

  // The shape the commerce route layer consumes (CommerceDependencies["partners"]).
  // dashboardFor and listLinks take a partner id because the routes resolve the
  // member's own partner through findByMemberId first; no handler accepts a
  // partner id from a request.
  findByMemberId(memberId: string): Promise<PartnerSelfView | null>;
  dashboardFor(partnerId: string): Promise<PartnerDashboardResult>;
  listLinks(partnerId: string): Promise<PartnerLinkDto[]>;

  // Member-scoped referral codes over the existing link store.
  issueLinkForMember(
    memberId: string,
    channel: LinkChannel,
    campaign: string | null,
    asOf: Date,
  ): Promise<MemberLinkageResult<PartnerLinkDto>>;
  listLinksForMember(memberId: string): Promise<MemberLinkageResult<PartnerLinkDto[]>>;

  // Organization linkage, delegated to the organizations module. The resolved
  // partner is the viewer, so its representative checks enforce isolation.
  joinOrganizationForMember(
    memberId: string,
    orgId: string,
    asOf: Date,
  ): Promise<OrganizationResult<OrganizationRecord>>;
  organizationAggregateForMember(
    memberId: string,
    orgId: string,
  ): Promise<OrganizationResult<OrganizationAggregate>>;
}

export function createMemberPartnerSource(deps: MemberPartnerSourceDeps): MemberPartnerSource {
  function urlFor(code: string): string {
    const base = deps.linkBaseUrl.replace(/\/+$/, "");
    return `${base}/r/${code}`;
  }

  /** Explicit construction, mirroring the attribution service's DTO builder. */
  function toDto(link: StoredLink): PartnerLinkDto {
    return {
      code: link.code,
      url: urlFor(link.code),
      channel: link.channel,
      campaign: link.campaign,
      qrSvgPath: null,
    };
  }

  async function resolve(memberId: string): Promise<PartnerRecord | null> {
    return deps.repository.findByMemberId(memberId);
  }

  return {
    async createPartnerForMember(memberId, input, asOf) {
      return deps.service.createPartnerForMember(memberId, input, asOf);
    },

    async findByMemberId(memberId) {
      const record = await resolve(memberId);
      return record ? toPartnerSelfView(record) : null;
    },

    async dashboardFor(partnerId) {
      return deps.service.dashboardFor(partnerId);
    },

    async listLinks(partnerId) {
      const links = await deps.links.listLinks(partnerId);
      return links.map(toDto);
    },

    async issueLinkForMember(memberId, channel, campaign, asOf) {
      const record = await resolve(memberId);
      if (!record) return noPartner();
      const link: StoredLink = {
        code: deps.mintCode(record.partnerId),
        partnerId: record.partnerId,
        channel,
        campaign,
        issuedAt: asOf.toISOString(),
      };
      // A duplicate code throws DuplicatePartnerLinkCode from the store; a link is
      // never overwritten, so a code cannot be re-pointed at another partner.
      await deps.links.saveLink(link);
      return { ok: true, value: toDto(link) };
    },

    async listLinksForMember(memberId) {
      const record = await resolve(memberId);
      if (!record) return noPartner();
      const links = await deps.links.listLinks(record.partnerId);
      return { ok: true, value: links.map(toDto) };
    },

    async joinOrganizationForMember(memberId, orgId, asOf) {
      const record = await resolve(memberId);
      if (!record) {
        return {
          ok: false,
          denials: ["partner_not_found"],
          message: "This member does not own a partner account.",
        };
      }
      return deps.organizations.addRepresentative(orgId, record.partnerId, asOf);
    },

    async organizationAggregateForMember(memberId, orgId) {
      const record = await resolve(memberId);
      if (!record) {
        return {
          ok: false,
          denials: ["partner_not_found"],
          message: "This member does not own a partner account.",
        };
      }
      // The member's own partner is the viewer; the organizations module refuses a
      // viewer who does not represent the organization.
      return deps.organizations.aggregateFor(orgId, {
        kind: "partner",
        partnerId: record.partnerId,
      });
    },
  };
}
