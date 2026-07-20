// Client-side capability contract (Supreme build). The server capability
// registry and member-safe endpoint belong to the PowerShell controller lane;
// this module consumes it WHEN it exists and degrades honestly when it does
// not: absent endpoint = every externally-backed capability reports
// "pending_credentials" (nothing pretends to be live). Types mirror the
// shared seed so the swap to the published contract is import-only.

export type CapabilityState =
  | "enabled"
  | "disabled"
  | "misconfigured"
  | "pending_approval"
  | "pending_credentials"
  | "pending_supplier_data";

export type ResearchCapability =
  | "transactional_email"
  | "membership_billing"
  | "product_commerce"
  | "identity_verification"
  | "telegram_support"
  | "private_media"
  | "live_shipping_rates"
  | "mitch_fulfillment"
  | "affiliate_payouts"
  | "quantum_commerce"
  | "referrals"
  | "tracker"
  | "assessment"
  | "blueprint"
  | "questions";

export interface CapabilityStatus {
  capability: ResearchCapability;
  state: CapabilityState;
  publicMessage: string;
  adminMessage?: string;
  missingEnvironmentVariables?: string[];
  missingApprovals?: string[];
  checkedAt: string;
}

// Truthful defaults while the registry endpoint is unpublished: every
// provider-backed capability is pending, nothing is enabled by assumption.
const PENDING: Record<ResearchCapability, string> = {
  transactional_email: "Email delivery is being configured.",
  membership_billing: "Membership billing opens soon. You will be emailed the moment it does.",
  product_commerce: "Ordering is not open yet. The catalog is available for review.",
  identity_verification: "Identity verification is being configured.",
  telegram_support: "Telegram support is being configured. Questions here still reach a person.",
  private_media: "Private photo, voice, and video storage is being configured.",
  live_shipping_rates: "Live shipping rates are being configured.",
  mitch_fulfillment: "Fulfillment integration is being configured.",
  affiliate_payouts: "Partner payouts are being configured.",
  quantum_commerce: "Quantum is coming soon.",
  referrals: "The referral program is not open yet.",
  tracker: "The tracker unlocks after your assessment.",
  assessment: "The assessment opens with your active membership.",
  blueprint: "Your Blueprint is prepared after the assessment.",
  questions: "Questions open with your active membership.",
};

const PRODUCT_GATES = new Set<ResearchCapability>([
  "referrals", "tracker", "assessment", "blueprint", "questions", "quantum_commerce",
]);

export function pendingStatus(capability: ResearchCapability): CapabilityStatus {
  return {
    capability,
    state: PRODUCT_GATES.has(capability) ? "disabled" : "pending_credentials",
    publicMessage: PENDING[capability],
    checkedAt: new Date().toISOString(),
  };
}

let cache: { at: number; statuses: Map<ResearchCapability, CapabilityStatus> } | null = null;

// Fetches member-visible capability statuses; safe fallback when the endpoint
// is absent (404/older server) or errors. Never throws.
export async function fetchCapabilities(token: string | null): Promise<Map<ResearchCapability, CapabilityStatus>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.statuses;
  const statuses = new Map<ResearchCapability, CapabilityStatus>();
  try {
    const res = await fetch("/api/research/capabilities", {
      headers: token ? { Authorization: "Bearer " + token } : {},
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      const list: CapabilityStatus[] = body?.data ?? body?.capabilities ?? [];
      for (const s of list) if (s?.capability) statuses.set(s.capability, s);
    }
  } catch {
    // endpoint unreachable: fall through to pending defaults below
  }
  cache = { at: Date.now(), statuses };
  return statuses;
}

export function statusFor(
  statuses: Map<ResearchCapability, CapabilityStatus> | null | undefined,
  capability: ResearchCapability,
): CapabilityStatus {
  return statuses?.get(capability) ?? pendingStatus(capability);
}
