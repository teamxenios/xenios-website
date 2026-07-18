export const REFERRAL_SAFE_STATUSES = ["Invited", "Pending", "Qualified", "Reward earned", "Expired"] as const;

export type ReferralSafeStatus = (typeof REFERRAL_SAFE_STATUSES)[number];

export function normalizeReferralCode(value: string | null | undefined): string {
  return (value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
}

export function referralApplyHref(value: string | null | undefined): string {
  const code = normalizeReferralCode(value);
  return code ? `/research/apply?ref=${encodeURIComponent(code)}` : "/research/apply";
}
