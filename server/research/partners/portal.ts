// xenios research: the partner PORTAL read model.
//
// The partner UI (client/src/research/pages/partners/*) loads every data surface
// through client/src/research/adapters/partner.ts. Four of its paths were served
// (me, dashboard, apply, links); the rest reached no route at all, so the pages
// permanently rendered their "being prepared" state. This module is the read model
// behind the remaining paths.
//
// Three rules are structural here, not conventions:
//
//   1. NO IDENTITY IS EVER READ FROM A REQUEST. Every function in this file takes a
//      partnerId that the route layer resolved FROM THE AUTHENTICATED MEMBER. There is
//      no function here that accepts an organization id, an order id, or a partner id
//      from a caller who did not first prove ownership of it. `events` is the sharp
//      case: it resolves the partner's organizations FIRST and asks for events on
//      exactly those ids, so an organization the partner does not represent has no path
//      into the response.
//
//   2. PAYLOADS ARE BUILT BY EXPLICIT CONSTRUCTION. Every response object below is
//      written field by field from named row fields. A column added to a partner table
//      later cannot appear in a partner response by default, which is the same
//      discipline toPartnerSelfDto applies in the commerce route layer.
//
//   3. TWO LEDGERS NEVER MERGE. Commission (affiliate) and white-label wholesale are
//      separate ledgers. Everything this module reads is the AFFILIATE_COMMISSION
//      ledger and every commission entry says so in its own payload, so a future
//      wholesale ledger cannot be folded into the same list without changing a tag a
//      test asserts on.
//
// Nothing here invents a fact. A surface with no table behind it yet answers with an
// honest empty list (the page already carries the truthful empty copy) and the missing
// table is named in the module docs, never filled with a plausible-looking row.

import type { CommissionState, PartnerRole, PartnerState } from "@shared/research/distribution";
import { DEFAULT_PARTNER_REQUIREMENTS, type AgreementKey, type TrainingModuleKey } from "./partners";

// ---------------------------------------------------------------------------
// Ledger identity
// ---------------------------------------------------------------------------

/**
 * The two partner-facing ledgers. They are separate by construction: this module
 * reads the affiliate commission ledger only, and tags every entry it emits, so a
 * wholesale entry appearing in a commission response is a test failure rather than
 * a judgement call.
 */
export const PARTNER_LEDGERS = {
  affiliateCommission: "AFFILIATE_COMMISSION",
  whiteLabelWholesale: "WHITE_LABEL_WHOLESALE",
} as const;

export type PartnerLedger = (typeof PARTNER_LEDGERS)[keyof typeof PARTNER_LEDGERS];

// ---------------------------------------------------------------------------
// Rows the port returns. Each mirrors ONLY the columns this read model uses, so a
// sensitive column (legal_name, contact_email, internal_notes, a subject key, an
// admin note) has no shape to travel in.
// ---------------------------------------------------------------------------

export type PortalClearance = "not_started" | "submitted" | "verified" | "rejected";

export interface PortalPartnerIdentity {
  partnerId: string;
  memberId: string;
  role: PartnerRole;
  state: PartnerState;
  identityVerified: boolean;
  taxStatus: PortalClearance;
  payoutStatus: PortalClearance;
  certifiedAt: string | null;
  activatedAt: string | null;
}

export interface PortalAgreementRow {
  agreementKey: string;
  agreementVersion: string;
  decision: "accepted" | "declined";
  decidedAt: string;
}

export interface PortalTrainingRow {
  moduleKey: string;
  moduleVersion: string;
  completedAt: string;
}

export interface PortalLinkRow {
  linkId: string;
  channel: string;
  campaign: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/** An attribution touch. Deliberately no subject key: a lead is a count, never a person. */
export interface PortalTouchRow {
  channel: string;
  occurredAt: string;
}

/** A conversion. Deliberately no subject key and no member id. */
export interface PortalConversionRow {
  convertedAt: string;
}

export interface PortalCommissionRow {
  id: string;
  state: CommissionState;
  amountCents: number;
  reversesLedgerId: string | null;
  createdAt: string;
}

export interface PortalPayoutBatchRow {
  batchId: string;
  totalCents: number;
  state: string;
  providerName: string;
  builtAt: string;
  settledAt: string | null;
}

export interface PortalOrganizationRow {
  orgId: string;
  name: string;
  state: string;
  ownerPartnerId: string;
}

export interface PortalOrganizationEventRow {
  eventId: string;
  organizationId: string;
  name: string;
  campaign: string | null;
  startsAt: string | null;
}

export interface PortalContentSubmissionRow {
  assetId: string;
  title: string;
  state: string;
  createdAt: string;
}

/**
 * An asset in the approved library. There is NO library table in the shipped schema
 * (research_content_assets holds partner-SUBMITTED content, which is a different
 * thing), so the production port answers with an empty list until one exists.
 */
export interface PortalLibraryAssetRow {
  assetId: string;
  title: string;
  kind: string;
  version: string;
  updatedAt: string | null;
  signedUrl: string | null;
}

/**
 * A sign-in session. There is NO partner session table in the shipped schema, so the
 * production port answers with an empty list. The page's own empty copy ("No session
 * history recorded yet") is the truthful state.
 */
export interface PortalSessionRow {
  sessionId: string;
  startedAt: string;
  device: string | null;
  approximateLocation: string | null;
  current: boolean;
}

export interface PortalContentSubmissionInput {
  title: string;
  link: string | null;
  description: string;
}

export type PortalWriteResult =
  | { ok: true; submissionId: string }
  | { ok: false; code: "capability_disabled" | "duplicate_title" | "invalid"; message: string };

// ---------------------------------------------------------------------------
// The data port
// ---------------------------------------------------------------------------

/**
 * Everything the portal reads, injected so the read model is testable without a
 * database. Every method is partner-scoped except `approvedLibrary` (a published
 * library is the same for every partner) and `eventsForOrganizations`, which the
 * service only ever calls with ids it just proved the partner represents.
 */
export interface PartnerPortalPort {
  /** The ONE partner a member owns, or null. Never takes a partner id. */
  findPartnerForMember(memberId: string): Promise<PortalPartnerIdentity | null>;
  agreementsFor(partnerId: string): Promise<readonly PortalAgreementRow[]>;
  trainingFor(partnerId: string): Promise<readonly PortalTrainingRow[]>;
  linksFor(partnerId: string): Promise<readonly PortalLinkRow[]>;
  touchesFor(partnerId: string): Promise<readonly PortalTouchRow[]>;
  conversionsFor(partnerId: string): Promise<readonly PortalConversionRow[]>;
  commissionsFor(partnerId: string): Promise<readonly PortalCommissionRow[]>;
  payoutBatchesFor(partnerId: string): Promise<readonly PortalPayoutBatchRow[]>;
  organizationsFor(partnerId: string): Promise<readonly PortalOrganizationRow[]>;
  eventsForOrganizations(orgIds: readonly string[]): Promise<readonly PortalOrganizationEventRow[]>;
  contentSubmissionsFor(partnerId: string): Promise<readonly PortalContentSubmissionRow[]>;
  submitContent(partnerId: string, input: PortalContentSubmissionInput): Promise<PortalWriteResult>;
  approvedLibrary(): Promise<readonly PortalLibraryAssetRow[]>;
  sessionsFor(partnerId: string): Promise<readonly PortalSessionRow[]>;
}

// ---------------------------------------------------------------------------
// Response payloads. These are the exact shapes the partner pages read.
// ---------------------------------------------------------------------------

export interface OnboardingPayload {
  verification: { state: string; detail: string };
  agreements: Array<{ id: string; title: string; version: string; acknowledged: boolean }>;
}

export interface TrainingPayload {
  modules: Array<{
    id: string;
    title: string;
    summary: string;
    required: boolean;
    completed: boolean;
    completedAt: string | null;
  }>;
  certified: boolean;
}

export interface LeadsPayload {
  rows: Array<{ period: string; channel: string; leads: number }>;
}

export interface ConversionsPayload {
  rows: Array<{ period: string; activations: number; renewals: number | null }>;
}

export interface CommissionsPayload {
  entries: Array<{
    id: string;
    date: string;
    description: string;
    commissionCents: number;
    state: CommissionState;
    ledger: PartnerLedger;
  }>;
}

export interface PayoutsPayload {
  method: { label: string; configured: boolean };
  payouts: Array<{ id: string; date: string; amountCents: number; method: string; status: string }>;
}

export interface ResourcesPayload {
  assets: Array<{
    id: string;
    title: string;
    type: string;
    version: string;
    updatedAt: string | null;
    signedUrl: string | null;
  }>;
}

export interface CampaignsPayload {
  campaigns: Array<{ id: string; name: string; window: string | null; status: string }>;
}

export interface EventsPayload {
  events: Array<{ id: string; name: string; date: string | null; location: string | null; status: string }>;
}

export interface OrganizationsPayload {
  organizations: Array<{ id: string; name: string; role: string; status: string }>;
}

export interface CompliancePayload {
  submissions: Array<{ id: string; title: string; submittedAt: string | null; status: string }>;
}

export interface SessionsPayload {
  sessions: Array<{
    id: string;
    startedAt: string;
    device: string | null;
    approximateLocation: string | null;
    current: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Plain-English labels. The keys are the schema's vocabulary; a partner should not
// have to read a database enum, so each key is glossed once, here.
// ---------------------------------------------------------------------------

const AGREEMENT_TITLES: Record<AgreementKey, string> = {
  partner_agreement: "Research Rep agreement",
  code_of_conduct: "Code of conduct",
  advertising_and_claims: "Advertising and claims policy",
  privacy_and_data_handling: "Privacy and data handling policy",
};

const TRAINING_TITLES: Record<TrainingModuleKey, { title: string; summary: string }> = {
  xenios_membership: {
    title: "The membership, honestly",
    summary: "What the research membership is, what it costs, and what it does not include.",
  },
  privacy_and_sensitive_data: {
    title: "Privacy and sensitive data",
    summary: "What you will never see about a member, and why that is a design guarantee.",
  },
  product_lanes: {
    title: "Product lanes",
    summary: "Which lane a product sits in and what may be said about each one.",
  },
  ftc_disclosures: {
    title: "Disclosures",
    summary: "Disclosing the rep relationship visibly, in the share itself, every time.",
  },
  claims_restrictions: {
    title: "Claims restrictions",
    summary: "The wording limits that apply to everything you publish.",
  },
  no_diagnosis_or_dosing: {
    title: "No diagnosis and no dosing",
    summary: "Why a rep never advises on a condition, a protocol, or an amount.",
  },
  lead_handling: {
    title: "Lead handling",
    summary: "What to do with an interested person, and what never to collect from them.",
  },
  telegram_boundaries: {
    title: "Messaging boundaries",
    summary: "Where a conversation belongs and where it must be handed to the team.",
  },
  product_concerns: {
    title: "Product concerns",
    summary: "How to escalate a concern about a product without answering it yourself.",
  },
  fraud: {
    title: "Fraud",
    summary: "Attribution abuse, self-referral, and what happens when either is found.",
  },
  brand_and_content: {
    title: "Brand and content",
    summary: "Using the approved library as published, and clearing anything else first.",
  },
  organizations: {
    title: "Organizations",
    summary: "How an organization account works and why it is not a tier or a downline.",
  },
  events: {
    title: "Events",
    summary: "Registering a live event and clearing what you plan to present.",
  },
  security: {
    title: "Account security",
    summary: "Keeping your account yours, and what the team will never ask you for.",
  },
};

const VERIFICATION_DETAIL: Record<string, string> = {
  verified: "Your identity check has cleared.",
  not_started: "Identity verification has not started yet. Nothing is required from you until the team asks.",
  pending: "Your identity check is with the team.",
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** The YYYY-MM bucket for an ISO timestamp, or null when the value is not a date.
 * An unparseable timestamp is DROPPED from an aggregate rather than bucketed into a
 * guessed period, so a bad row can never inflate a count. */
export function periodOf(iso: string): string | null {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 7);
}

/** The YYYY-MM-DD date for an ISO timestamp, or null when the value is not a date. */
export function dayOf(iso: string): string | null {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function sortByKey<T>(rows: T[], key: (row: T) => string): T[] {
  return rows.slice().sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

export interface PartnerPortalService {
  onboarding(partner: PortalPartnerIdentity): Promise<OnboardingPayload>;
  training(partner: PortalPartnerIdentity): Promise<TrainingPayload>;
  leads(partnerId: string): Promise<LeadsPayload>;
  conversions(partnerId: string): Promise<ConversionsPayload>;
  commissions(partnerId: string): Promise<CommissionsPayload>;
  payouts(partner: PortalPartnerIdentity): Promise<PayoutsPayload>;
  resources(): Promise<ResourcesPayload>;
  campaigns(partnerId: string): Promise<CampaignsPayload>;
  events(partnerId: string): Promise<EventsPayload>;
  organizations(partnerId: string): Promise<OrganizationsPayload>;
  compliance(partnerId: string): Promise<CompliancePayload>;
  submitCompliance(partnerId: string, input: PortalContentSubmissionInput): Promise<PortalWriteResult>;
  sessions(partnerId: string): Promise<SessionsPayload>;
}

export function createPartnerPortalService(port: PartnerPortalPort): PartnerPortalService {
  return {
    async onboarding(partner) {
      const accepted = await port.agreementsFor(partner.partnerId);
      // Match on key AND version: an agreement accepted at an older version is not
      // an acknowledgement of the current one, so it reads as still outstanding.
      const acceptedKeys = new Set(
        accepted.filter((row) => row.decision === "accepted").map((row) => `${row.agreementKey}@${row.agreementVersion}`),
      );
      const state = partner.identityVerified ? "verified" : partner.state === "application" ? "not_started" : "pending";
      return {
        verification: {
          state,
          detail: VERIFICATION_DETAIL[state] ?? VERIFICATION_DETAIL.pending,
        },
        // The checklist IS the requirements list, read from the one place that
        // defines it. A version bump there moves this surface with it rather than
        // leaving a hardcoded version quietly acknowledging the wrong document.
        agreements: DEFAULT_PARTNER_REQUIREMENTS.agreements.map((required) => ({
          id: required.key,
          title: AGREEMENT_TITLES[required.key],
          version: required.version,
          acknowledged: acceptedKeys.has(`${required.key}@${required.version}`),
        })),
      };
    },

    async training(partner) {
      const completed = await port.trainingFor(partner.partnerId);
      const byKey = new Map<string, PortalTrainingRow>();
      completed.forEach((row) => {
        const existing = byKey.get(row.moduleKey);
        if (!existing || existing.completedAt < row.completedAt) byKey.set(row.moduleKey, row);
      });
      return {
        // Same discipline as the agreements checklist: the module list is the
        // requirements list, so a module added or retired there moves this surface.
        modules: DEFAULT_PARTNER_REQUIREMENTS.trainingModules.map((required) => {
          const row = byKey.get(required.key);
          const labels = TRAINING_TITLES[required.key];
          return {
            id: required.key,
            title: labels.title,
            summary: labels.summary,
            // Appearing in the requirements list IS the requirement, so this is a
            // fact about the program rather than a default someone chose.
            required: true,
            completed: row !== undefined,
            completedAt: row ? dayOf(row.completedAt) : null,
          };
        }),
        // Certification is a named admin decision recorded on the partner row. It is
        // never inferred from module completion.
        certified: partner.certifiedAt !== null,
      };
    },

    async leads(partnerId) {
      const touches = await port.touchesFor(partnerId);
      const counts = new Map<string, { period: string; channel: string; leads: number }>();
      touches.forEach((touch) => {
        const period = periodOf(touch.occurredAt);
        if (period === null) return;
        const key = `${period}|${touch.channel}`;
        const existing = counts.get(key);
        if (existing) existing.leads += 1;
        else counts.set(key, { period, channel: touch.channel, leads: 1 });
      });
      return { rows: sortByKey(Array.from(counts.values()), (row) => `${row.period}|${row.channel}`) };
    },

    async conversions(partnerId) {
      const rows = await port.conversionsFor(partnerId);
      const counts = new Map<string, number>();
      rows.forEach((row) => {
        const period = periodOf(row.convertedAt);
        if (period === null) return;
        counts.set(period, (counts.get(period) ?? 0) + 1);
      });
      const shaped = Array.from(counts.entries()).map(([period, activations]) => ({
        period,
        activations,
        // Renewals are a separate fact with no source in the attribution tables. Null
        // renders as "Reported later" on the page rather than a number we do not have.
        renewals: null,
      }));
      return { rows: sortByKey(shaped, (row) => row.period) };
    },

    async commissions(partnerId) {
      const rows = await port.commissionsFor(partnerId);
      const entries = rows.map((row) => ({
        id: row.id,
        date: dayOf(row.createdAt) ?? row.createdAt,
        // No order reference and no member reference. A partner learns that a
        // referred order produced a commission, never which order or whose.
        description:
          row.reversesLedgerId !== null
            ? "Reversal of a referred order commission"
            : "Referred order commission",
        commissionCents: row.amountCents,
        state: row.state,
        ledger: PARTNER_LEDGERS.affiliateCommission,
      }));
      return { entries: sortByKey(entries, (entry) => entry.date) };
    },

    async payouts(partner) {
      const batches = await port.payoutBatchesFor(partner.partnerId);
      return {
        method: {
          configured: partner.payoutStatus === "verified",
          label:
            partner.payoutStatus === "verified"
              ? "Payout method on file"
              : partner.payoutStatus === "submitted"
                ? "Payout method submitted, awaiting review"
                : partner.payoutStatus === "rejected"
                  ? "Payout method needs attention"
                  : "No payout method on file",
        },
        payouts: sortByKey(
          batches.map((batch) => ({
            id: batch.batchId,
            date: dayOf(batch.settledAt ?? batch.builtAt) ?? batch.builtAt,
            amountCents: batch.totalCents,
            // "disabled" is the schema default when no provider is configured. Saying
            // so is truthful; "On file" would not be.
            method: batch.providerName === "disabled" ? "No provider configured" : batch.providerName,
            // The batch state, translated once. "settled" is the only state that means
            // money actually left, and it is the only one that reads as completed.
            status: batch.state === "settled" ? "completed" : batch.state,
          })),
          (payout) => payout.date,
        ),
      };
    },

    async resources() {
      const assets = await port.approvedLibrary();
      return {
        assets: assets.map((asset) => ({
          id: asset.assetId,
          title: asset.title,
          type: asset.kind,
          version: asset.version,
          updatedAt: asset.updatedAt,
          // A missing signed link renders "Download pending". A URL is never invented.
          signedUrl: asset.signedUrl,
        })),
      };
    },

    async campaigns(partnerId) {
      const links = await port.linksFor(partnerId);
      // A campaign in this schema is the campaign code carried by an issued link;
      // there is no campaigns table and no approval workflow behind one, so the status
      // says exactly what is true: a link carrying this code exists (or was revoked).
      const byCampaign = new Map<string, { issuedAt: string; live: boolean }>();
      links.forEach((link) => {
        const campaign = link.campaign;
        if (campaign === null || campaign.length === 0) return;
        const existing = byCampaign.get(campaign);
        const live = link.revokedAt === null;
        if (!existing) byCampaign.set(campaign, { issuedAt: link.createdAt, live });
        else
          byCampaign.set(campaign, {
            issuedAt: existing.issuedAt < link.createdAt ? existing.issuedAt : link.createdAt,
            live: existing.live || live,
          });
      });
      const shaped = Array.from(byCampaign.entries()).map(([name, info]) => ({
        id: name,
        name,
        window: dayOf(info.issuedAt) === null ? null : `Link issued ${dayOf(info.issuedAt)}`,
        status: info.live ? "link issued" : "link revoked",
      }));
      return { campaigns: sortByKey(shaped, (campaign) => campaign.name) };
    },

    async events(partnerId) {
      // Organization scoping, structurally: resolve the partner's organizations
      // FIRST, then ask for events on exactly those ids. There is no path here for an
      // organization the partner does not represent.
      const orgs = await port.organizationsFor(partnerId);
      const orgIds = orgs.map((org) => org.orgId);
      if (orgIds.length === 0) return { events: [] };
      const rows = await port.eventsForOrganizations(orgIds);
      const allowed = new Set(orgIds);
      const shaped = rows
        // Belt and braces: a port that over-returns is filtered here as well, so a
        // future storage bug cannot become a cross-organization disclosure.
        .filter((row) => allowed.has(row.organizationId))
        .map((row) => ({
          id: row.eventId,
          name: row.name,
          date: row.startsAt === null ? null : dayOf(row.startsAt),
          // The shipped events table carries no location column. Null renders as
          // "To be confirmed" rather than a place we do not know.
          location: null,
          // No review column exists either, so the status states the schedule fact.
          status: row.startsAt === null ? "not scheduled" : "scheduled",
        }));
      return { events: sortByKey(shaped, (event) => event.date ?? "") };
    },

    async organizations(partnerId) {
      const orgs = await port.organizationsFor(partnerId);
      return {
        organizations: orgs.map((org) => ({
          id: org.orgId,
          name: org.name,
          role: org.ownerPartnerId === partnerId ? "Owner" : "Representative",
          status: org.state,
        })),
      };
    },

    async compliance(partnerId) {
      const rows = await port.contentSubmissionsFor(partnerId);
      const shaped = rows.map((row) => ({
        id: row.assetId,
        title: row.title,
        submittedAt: dayOf(row.createdAt),
        status: row.state === "preapproved" ? "approved" : row.state === "rejected" ? "declined" : row.state,
      }));
      return { submissions: sortByKey(shaped, (row) => row.submittedAt ?? "") };
    },

    async submitCompliance(partnerId, input) {
      const title = input.title.trim();
      const description = input.description.trim();
      if (title.length === 0 || description.length === 0) {
        return { ok: false, code: "invalid", message: "A submission needs a title and a description." };
      }
      const link = input.link === null ? null : input.link.trim() || null;
      return port.submitContent(partnerId, { title, link, description });
    },

    async sessions(partnerId) {
      const rows = await port.sessionsFor(partnerId);
      return {
        sessions: rows.map((row) => ({
          id: row.sessionId,
          startedAt: row.startedAt,
          device: row.device,
          approximateLocation: row.approximateLocation,
          current: row.current,
        })),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// An in-memory port, for tests and for a development server with no database.
// ---------------------------------------------------------------------------

export interface InMemoryPortalData {
  partners?: readonly PortalPartnerIdentity[];
  agreements?: Readonly<Record<string, readonly PortalAgreementRow[]>>;
  training?: Readonly<Record<string, readonly PortalTrainingRow[]>>;
  links?: Readonly<Record<string, readonly PortalLinkRow[]>>;
  touches?: Readonly<Record<string, readonly PortalTouchRow[]>>;
  conversions?: Readonly<Record<string, readonly PortalConversionRow[]>>;
  commissions?: Readonly<Record<string, readonly PortalCommissionRow[]>>;
  payoutBatches?: Readonly<Record<string, readonly PortalPayoutBatchRow[]>>;
  organizations?: Readonly<Record<string, readonly PortalOrganizationRow[]>>;
  organizationEvents?: readonly PortalOrganizationEventRow[];
  contentSubmissions?: Readonly<Record<string, readonly PortalContentSubmissionRow[]>>;
  library?: readonly PortalLibraryAssetRow[];
  sessions?: Readonly<Record<string, readonly PortalSessionRow[]>>;
  /** When false, a write answers with the honest capability_disabled refusal. */
  writesEnabled?: boolean;
}

export function createInMemoryPartnerPortalPort(data: InMemoryPortalData = {}): PartnerPortalPort {
  const scoped = <T>(table: Readonly<Record<string, readonly T[]>> | undefined, id: string): readonly T[] =>
    table?.[id] ?? [];
  const submissions = new Map<string, PortalContentSubmissionRow[]>();
  Object.entries(data.contentSubmissions ?? {}).forEach(([partnerId, rows]) => {
    submissions.set(partnerId, rows.slice());
  });
  let sequence = 0;

  return {
    async findPartnerForMember(memberId) {
      return (data.partners ?? []).find((partner) => partner.memberId === memberId) ?? null;
    },
    async agreementsFor(partnerId) {
      return scoped(data.agreements, partnerId);
    },
    async trainingFor(partnerId) {
      return scoped(data.training, partnerId);
    },
    async linksFor(partnerId) {
      return scoped(data.links, partnerId);
    },
    async touchesFor(partnerId) {
      return scoped(data.touches, partnerId);
    },
    async conversionsFor(partnerId) {
      return scoped(data.conversions, partnerId);
    },
    async commissionsFor(partnerId) {
      return scoped(data.commissions, partnerId);
    },
    async payoutBatchesFor(partnerId) {
      return scoped(data.payoutBatches, partnerId);
    },
    async organizationsFor(partnerId) {
      return scoped(data.organizations, partnerId);
    },
    async eventsForOrganizations(orgIds) {
      // Deliberately literal: it returns exactly what it was asked for. The scoping
      // guarantee is the service resolving the id list from the partner first, so this
      // double is the honest way to test that the service never asks for a foreign id.
      const wanted = new Set(orgIds);
      return (data.organizationEvents ?? []).filter((event) => wanted.has(event.organizationId));
    },
    async contentSubmissionsFor(partnerId) {
      return submissions.get(partnerId)?.slice() ?? [];
    },
    async submitContent(partnerId, input) {
      if (data.writesEnabled !== true) {
        return {
          ok: false,
          code: "capability_disabled",
          message: "Content submissions are not being accepted yet.",
        };
      }
      const rows = submissions.get(partnerId) ?? [];
      if (rows.some((row) => row.title === input.title)) {
        return { ok: false, code: "duplicate_title", message: "You already submitted content with that title." };
      }
      sequence += 1;
      const row: PortalContentSubmissionRow = {
        assetId: `asset_${sequence}`,
        title: input.title,
        state: "submitted",
        createdAt: new Date(0).toISOString(),
      };
      submissions.set(partnerId, rows.concat(row));
      return { ok: true, submissionId: row.assetId };
    },
    async approvedLibrary() {
      return data.library ?? [];
    },
    async sessionsFor(partnerId) {
      return scoped(data.sessions, partnerId);
    },
  };
}
