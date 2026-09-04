import { safeResearchReturnTo } from "./auth-return-to";

/**
 * One public decision model over the existing Xenios ordering pathways.
 *
 * This module contains explanatory copy and navigation hints only. It grants
 * no identity, membership, price, inventory, payment, Care, supplier,
 * fulfillment, referral, commission, or payout authority. Every destination
 * re-checks its own authority on arrival.
 */
export const RESEARCH_ORDER_ENTRY_PATH = "/research/order" as const;

export const ORDER_ENTRY_MODE_IDS = [
  "quick_early_access",
  "member_account",
  "resume_or_track",
  "assisted_or_volume",
  "organization_or_clinic",
  "care",
  "manual_support",
] as const;

export type OrderEntryModeId = (typeof ORDER_ENTRY_MODE_IDS)[number];

export type OrderEntryMode = Readonly<{
  id: OrderEntryModeId;
  eyebrow: string;
  title: string;
  summary: string;
  /** Who this pathway is for. */
  audience: string;
  /** The minimum categories of information this pathway may ask for. */
  requiredInformation: readonly string[];
  accountRequirement: string;
  /** What happens after the visitor follows the action. */
  nextStep: string;
  paymentTiming: string;
  statusLocation: string;
  humanSupport: string;
  actionLabel: string;
  href: string;
  primary: boolean;
  lane: "research" | "care" | "support";
  accountDestination: boolean;
  secondaryAction?: Readonly<{
    label: string;
    href: string;
    explanation: string;
  }>;
  doesNotMean: readonly string[];
}>;

export const ORDER_ENTRY_MODES: readonly OrderEntryMode[] = [
  {
    id: "quick_early_access",
    eyebrow: "Lightest supported Research path",
    title: "Quick Research order",
    summary:
      "Browse through the existing passwordless Early Access session and continue into its canonical request or order flow.",
    audience:
      "First-time or returning Research customers who want the lightest supported way to begin.",
    requiredInformation: [
      "Research-use acknowledgement",
      "Exact product or variant and quantity",
      "Contact and U.S. delivery details when the flow asks for them",
    ],
    accountRequirement:
      "No full member account is required to browse or begin. The server creates a bounded Early Access browser session.",
    nextStep:
      "Open Early Access, complete its policy and session step, then choose the action the server currently authorizes.",
    paymentTiming:
      "Not on entry. Payment appears only when the authorized flow supplies a current method or instructions.",
    statusLocation:
      "A server-confirmed reference and its bounded status experience appear after a valid submission in the authorized browser.",
    humanSupport:
      "Research contact remains available if the automated path cannot complete the request.",
    actionLabel: "Open Quick Early Access",
    href: "/research/early-access",
    primary: true,
    lane: "research",
    accountDestination: false,
    doesNotMean: [
      "A visible product is available until its current server response confirms it.",
      "Creating a reference means payment was received or fulfillment began.",
    ],
  },
  {
    id: "member_account",
    eyebrow: "Returning customer",
    title: "Sign in and order",
    summary:
      "Use the canonical Research member identity for the member catalog, saved context, documents, support, and commerce history.",
    audience:
      "Returning customers who want the account experience and an exact continuation after sign-in.",
    requiredInformation: [
      "Canonical Research member sign-in",
      "The product, variant, and quantity you choose",
    ],
    accountRequirement:
      "An active Research member account is required for the member catalog. Activation, billing, and inactive states keep their existing account routes.",
    nextStep:
      "Sign in and return to the member catalog or the validated product selection that brought you here.",
    paymentTiming:
      "Not at sign-in. The member flow re-resolves current product, price, and purchase authority before offering payment.",
    statusLocation:
      "Order and shipment facts appear in the canonical Research account order history after an authorized order exists.",
    humanSupport:
      "Account support and Research contact remain available without changing account or order state from this page.",
    actionLabel: "Open the member catalog",
    href: "/research/member/catalog",
    primary: false,
    lane: "research",
    accountDestination: true,
    doesNotMean: [
      "Membership authorizes every product, price, or purchase action.",
      "A browser-provided product selection overrides the current server response.",
    ],
  },
  {
    id: "resume_or_track",
    eyebrow: "Existing request or order",
    title: "Resume or track an order",
    summary:
      "Return through an authorized account, or reopen the same bounded Early Access browser session that created the request.",
    audience:
      "Customers who already started a request or order and need its latest confirmed state.",
    requiredInformation: [
      "A signed-in Research account for account history",
      "Or the same authorized browser session for a Quick Early Access request",
    ],
    accountRequirement:
      "An account is required for account history. A Quick Early Access reference remains bound to the session that created it; a reference alone is not authorization.",
    nextStep:
      "Open account order history, or return to Quick Early Access in the same browser to resume its bounded flow.",
    paymentTiming:
      "No payment occurs merely by viewing status. Any later payment action is shown by the owning authorized workflow.",
    statusLocation:
      "Confirmed order facts appear in account order history; bounded Early Access status stays in its existing session-scoped experience.",
    humanSupport:
      "Research contact can help locate the correct workflow but cannot disclose an order from a reference alone.",
    actionLabel: "Open order history",
    href: "/research/account/orders",
    primary: false,
    lane: "research",
    accountDestination: true,
    secondaryAction: {
      label: "Resume in this browser",
      href: "/research/early-access",
      explanation:
        "Use this only in the browser where you started Quick Early Access.",
    },
    doesNotMean: [
      "Knowing a public reference grants access to private order facts.",
      "A displayed request state proves payment, shipment, or delivery.",
    ],
  },
  {
    id: "assisted_or_volume",
    eyebrow: "Large, custom, unavailable, or quote-dependent request",
    title: "Assisted or volume order",
    summary:
      "Begin through Early Access so its bounded session can route an exact multi-item, volume, quote, or human-assisted request.",
    audience:
      "Customers with larger quantities, multiple products, custom requirements, unavailable variants, quote requests, or a need for human review.",
    requiredInformation: [
      "Exact products, variants, and requested quantities",
      "Operational request context plus contact and delivery details",
      "No symptoms, diagnoses, medications, labs, or other clinical information",
    ],
    accountRequirement:
      "No full member account is required to begin. The assisted flow first relies on the existing bounded Early Access session.",
    nextStep:
      "Open Early Access, establish its session, and select the assisted or request action for the exact item and quantity.",
    paymentTiming:
      "Not immediately. A request or quote is not a paid order; payment follows only through an authorized later step.",
    statusLocation:
      "The assisted-order system supplies the server-confirmed reference and its bounded confirmation or status experience.",
    humanSupport:
      "A Xenios operator reviews the request, and Research contact remains the fallback for routing help.",
    actionLabel: "Start an assisted request",
    href: "/research/early-access",
    primary: false,
    lane: "research",
    accountDestination: false,
    doesNotMean: [
      "Submitting a request accepts a quote or creates a paid order.",
      "A requested item has been released to fulfillment.",
    ],
  },
  {
    id: "organization_or_clinic",
    eyebrow: "Clinic, organization, or wholesale",
    title: "Clinic, organization, or wholesale",
    summary:
      "Start the existing reviewed professional-buyer process without implying that an organization workspace already exists.",
    audience:
      "Clinics, practices, gyms, marketplaces, and other qualified business or wholesale buyers.",
    requiredInformation: [
      "Business contact and organization details",
      "Locations, intended Research use, volume, documentation, and operational needs",
    ],
    accountRequirement:
      "No organization workspace is required to inquire. Any later workspace requires separate review and provisioning.",
    nextStep:
      "Review the organization pathway and begin a human-reviewed buyer conversation.",
    paymentTiming:
      "No payment occurs from the public inquiry. Pricing, invoicing, and fulfillment require later authorized facts.",
    statusLocation:
      "Human follow-up explains the current review state; this page does not fabricate an organization dashboard.",
    humanSupport:
      "The organization pathway provides the correct human follow-up for documentation, volume, and access questions.",
    actionLabel: "Explore organization access",
    href: "/research/organizations",
    primary: false,
    lane: "research",
    accountDestination: false,
    doesNotMean: [
      "A public inquiry provisions an organization workspace.",
      "A business relationship grants Care, prescribing, or clinical referral authority.",
    ],
  },
  {
    id: "care",
    eyebrow: "Personal medical need",
    title: "Xenios Care",
    summary:
      "Use the separate Care pathway for personal health needs. Research ordering never substitutes for clinical intake or review.",
    audience:
      "People seeking personal health evaluation or another provider-guided Care service.",
    requiredInformation: [
      "Basic contact and scheduling details at the public entry step",
      "Any sensitive health information only inside the authorized secure Care intake",
    ],
    accountRequirement:
      "A Research account grants no Care access. The Care pathway applies its own identity, intake, eligibility, and provider authority.",
    nextStep:
      "Open Care scheduling and follow the separate Care intake instructions that are currently available.",
    paymentTiming:
      "No Research payment occurs. Any Care price or payment step is explained only inside the authorized Care workflow.",
    statusLocation:
      "Care status appears only in the authorized Care experience, never in a Research order card.",
    humanSupport:
      "Care support handles Care routing; Research support does not collect clinical details.",
    actionLabel: "Start with Xenios Care",
    href: "/care/schedule",
    primary: false,
    lane: "care",
    accountDestination: false,
    doesNotMean: [
      "A Care request is an appointment, diagnosis, prescription, or treatment decision.",
      "Research checkout is appropriate for a personal medical need.",
    ],
  },
  {
    id: "manual_support",
    eyebrow: "Human routing help",
    title: "Manual help",
    summary:
      "Ask Xenios to identify the right operational pathway when automation cannot yet get you there.",
    audience:
      "Anyone who is unsure which path applies, cannot access an existing flow, or needs a human operational response.",
    requiredInformation: [
      "Only the minimum operational details needed to route the question",
      "Never passwords, sign-in tokens, payment credentials, or clinical information in an ordinary message",
    ],
    accountRequirement:
      "No account is required to ask for routing help. Private account facts still require authorization in their owning workflow.",
    nextStep:
      "Open Research contact, choose the relevant topic, and send a bounded operational question.",
    paymentTiming:
      "No payment occurs from a support message.",
    statusLocation:
      "A support response arrives through the contact method the owning workflow confirms; a message alone creates no order status.",
    humanSupport:
      "This is the direct human-support fallback for Research routing and access questions.",
    actionLabel: "Contact Xenios Research",
    href: "/research/contact",
    primary: false,
    lane: "support",
    accountDestination: false,
    doesNotMean: [
      "Support can invent availability, price, payment, shipment, or provider decisions.",
      "Ordinary email is an authorized place for private health or account credentials.",
    ],
  },
] as const;

const MEMBER_CATALOG_DESTINATION =
  /^\/research\/member\/catalog(?:\/[a-z0-9]+(?:_[a-z0-9]+)*\/[a-z0-9][a-z0-9-]{0,191})?$/;
const ACCOUNT_ORDER_DESTINATION =
  /^\/research\/account\/orders(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,191})?$/;

/**
 * The auth policy is broader than ordering. Narrow it to the two destination
 * families this hub can honestly resume, while retaining the auth policy's
 * query scrubbing for safe view and product-selection hints.
 */
export function safeOrderEntryReturnTo(value: unknown): string | null {
  const safe = safeResearchReturnTo(value);
  if (!safe) return null;
  const pathname = safe.split("?", 1)[0];
  return MEMBER_CATALOG_DESTINATION.test(pathname) ||
    ACCOUNT_ORDER_DESTINATION.test(pathname)
    ? safe
    : null;
}

export function orderEntryDestination(
  id: "member_account" | "resume_or_track",
  requestedReturnTo?: unknown,
): string {
  const mode = orderEntryMode(id);
  const safe = safeOrderEntryReturnTo(requestedReturnTo);
  if (!safe) return mode.href;
  const pathname = safe.split("?", 1)[0];
  if (id === "member_account" && MEMBER_CATALOG_DESTINATION.test(pathname)) {
    return safe;
  }
  if (id === "resume_or_track" && ACCOUNT_ORDER_DESTINATION.test(pathname)) {
    return safe;
  }
  return mode.href;
}

export function orderEntryMode(id: OrderEntryModeId): OrderEntryMode {
  const match = ORDER_ENTRY_MODES.find((mode) => mode.id === id);
  if (!match) throw new Error(`Unknown order entry mode: ${id}`);
  return match;
}

export function researchOrderModes(): readonly OrderEntryMode[] {
  return ORDER_ENTRY_MODES.filter((mode) => mode.lane === "research");
}
