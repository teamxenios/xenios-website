import { ACCESS_ROUTES, PARTNER_ROUTES } from "../lib/routes";

export const B2B_PUBLIC_ROUTES = {
  partners: PARTNER_ROUTES.home,
  organizations: ACCESS_ROUTES.organizations,
  affiliates: ACCESS_ROUTES.affiliates,
  supplierAccess: ACCESS_ROUTES.supplierAccess,
  partnerApplication: PARTNER_ROUTES.apply,
  partnerDashboard: PARTNER_ROUTES.dashboard,
  support: ACCESS_ROUTES.support,
} as const;

export type PartnershipPathwayId =
  | "research_organization"
  | "clinic_medical_spa"
  | "provider_practice"
  | "affiliate"
  | "collective"
  | "supplier_lab_fulfillment"
  | "white_label"
  | "strategic_partner";

export interface PartnershipPathway {
  id: PartnershipPathwayId;
  eyebrow: string;
  title: string;
  summary: string;
  reviewFocus: string;
  route: string;
  actionLabel: string;
}

export const PARTNERSHIP_PATHWAYS: readonly PartnershipPathway[] = [
  {
    id: "research_organization",
    eyebrow: "Laboratories · CROs · product teams",
    title: "Research organizations",
    summary:
      "Reviewed business access for legitimate nonclinical research, analytical work, and product development.",
    reviewFocus: "Entity, intended use, buyer roles, documentation needs, volume, and fulfillment expectations.",
    route: B2B_PUBLIC_ROUTES.organizations,
    actionLabel: "Explore organization access",
  },
  {
    id: "clinic_medical_spa",
    eyebrow: "Clinics · medical spas · wellness practices",
    title: "Clinical businesses",
    summary:
      "A commercial relationship with a hard boundary between Research purchasing and provider-governed Care.",
    reviewFocus: "Business purpose, licensed activities, jurisdictions, Research scope, and the separate Care handoff.",
    route: B2B_PUBLIC_ROUTES.organizations,
    actionLabel: "Review the clinic pathway",
  },
  {
    id: "provider_practice",
    eyebrow: "Physicians · licensed providers · practices",
    title: "Provider partnerships",
    summary:
      "Practice relationships that preserve independent clinical judgment and route patient care through Care.",
    reviewFocus: "Credentials, coverage, practice workflow, Care readiness, and prohibited commercial influence.",
    route: B2B_PUBLIC_ROUTES.organizations,
    actionLabel: "Review provider boundaries",
  },
  {
    id: "affiliate",
    eyebrow: "Educators · creators · referral partners",
    title: "Affiliate relationships",
    summary:
      "Application, compliance review, approved resources, durable attribution, and reporting without clinical influence.",
    reviewFocus: "Audience, channels, disclosure practices, allowed claims, and agreement readiness.",
    route: B2B_PUBLIC_ROUTES.affiliates,
    actionLabel: "Explore affiliate access",
  },
  {
    id: "collective",
    eyebrow: "Communities · gyms · advisor groups",
    title: "Collective partnerships",
    summary:
      "Reviewed group relationships with Xenios-owned customer accounts, internal source attribution, and no duplicate customer portal.",
    reviewFocus: "Entity, program owner, audience, time window, disclosures, consent authority, and data boundaries.",
    route: B2B_PUBLIC_ROUTES.affiliates,
    actionLabel: "Review the collective boundary",
  },
  {
    id: "supplier_lab_fulfillment",
    eyebrow: "Suppliers · labs · fulfillment partners",
    title: "Supply and quality partners",
    summary:
      "Prospective operational access is invitation-only and requires identity, documentation, quality, SLA, and recall-readiness review.",
    reviewFocus: "Entity, assigned capabilities, COA and lot evidence, shipping, escalation, and recall contacts.",
    route: B2B_PUBLIC_ROUTES.supplierAccess,
    actionLabel: "Review supplier access",
  },
  {
    id: "white_label",
    eyebrow: "Qualified brands · product teams",
    title: "White-label interest",
    summary:
      "An exploratory business-development conversation, not a promise of formulation, supply, timing, or exclusivity.",
    reviewFocus: "Market, product category, quality standard, volume, claims controls, and ownership expectations.",
    route: "#partnership-inquiry",
    actionLabel: "Prepare a white-label inquiry",
  },
  {
    id: "strategic_partner",
    eyebrow: "Platforms · collectives · aligned operators",
    title: "Strategic partnerships",
    summary:
      "A deliberate path for technology, distribution, education, research, and ecosystem collaborations.",
    reviewFocus: "Shared objective, responsibilities, data boundaries, commercial model, and measurable next step.",
    route: "#partnership-inquiry",
    actionLabel: "Prepare a strategic inquiry",
  },
] as const;

export const PARTNERSHIP_PATHWAY_OPTIONS = PARTNERSHIP_PATHWAYS.map(({ id, title }) => ({
  value: id,
  label: title,
}));

export interface PartnershipInquiryDraft {
  pathway: PartnershipPathwayId;
  name: string;
  businessEmail: string;
  organization: string;
  role: string;
  website: string;
  region: string;
  context: string;
}

export const PARTNERSHIP_INQUIRY_LIMITS = {
  name: 120,
  businessEmail: 254,
  organization: 160,
  role: 120,
  website: 500,
  region: 120,
  context: 2_000,
} as const;

export function pathwayTitle(id: PartnershipPathwayId): string {
  return PARTNERSHIP_PATHWAYS.find((pathway) => pathway.id === id)?.title ?? "Business partnership";
}

function safeLine(value: string, maxLength: number, fallback = "Not provided"): string {
  const normalized = value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return normalized.slice(0, maxLength) || fallback;
}

function safeWebsite(value: string): string {
  const normalized = safeLine(value, PARTNERSHIP_INQUIRY_LIMITS.website);
  if (normalized === "Not provided") return normalized;
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      return "Not provided";
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().slice(0, PARTNERSHIP_INQUIRY_LIMITS.website);
  } catch {
    return "Not provided";
  }
}

export function buildPartnershipInquirySummary(draft: PartnershipInquiryDraft): string {
  return [
    "Xenios Research business inquiry",
    `Pathway: ${pathwayTitle(draft.pathway)}`,
    `Name: ${safeLine(draft.name, PARTNERSHIP_INQUIRY_LIMITS.name)}`,
    `Business email: ${safeLine(draft.businessEmail, PARTNERSHIP_INQUIRY_LIMITS.businessEmail)}`,
    `Organization: ${safeLine(draft.organization, PARTNERSHIP_INQUIRY_LIMITS.organization)}`,
    `Role: ${safeLine(draft.role, PARTNERSHIP_INQUIRY_LIMITS.role)}`,
    `Website: ${safeWebsite(draft.website)}`,
    `Region / jurisdiction: ${safeLine(draft.region, PARTNERSHIP_INQUIRY_LIMITS.region)}`,
    "",
    "Business context:",
    safeLine(draft.context, PARTNERSHIP_INQUIRY_LIMITS.context),
    "",
    "This channel is not for clinical advice or patient, health, payment, credential, or secret information.",
  ].join("\n");
}

export const PARTNERSHIP_CONTACT_EMAIL = "research@xeniostechnology.com";

export const PARTNERSHIP_CONTACT_MAILTO =
  `mailto:${PARTNERSHIP_CONTACT_EMAIL}?subject=${encodeURIComponent("Xenios Research business partnership inquiry")}`;
