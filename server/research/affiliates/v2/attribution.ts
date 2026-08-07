import type { AffiliateAttributionSnapshot } from "@shared/research/affiliate-system";

export type AttributionCandidate = Readonly<{
  affiliateId: string;
  codeId: string | null;
  campaignId: string | null;
  method: AffiliateAttributionSnapshot["method"];
  occurredAt: string;
  expiresAt: string | null;
  commissionScheduleId: string | null;
  commissionScheduleVersion: number | null;
  publicOfferId: string | null;
  sourcePage: string | null;
}>;

const PRIORITY: Readonly<Record<AffiliateAttributionSnapshot["method"], number>> = Object.freeze({
  explicit_code: 1,
  referral_link: 2,
  attribution_session: 2,
  assisted_sale: 3,
  house: 4,
});

export function choosePrimaryAttribution(
  candidates: readonly AttributionCandidate[],
  now: string,
): AffiliateAttributionSnapshot | null {
  const nowMs = Date.parse(now);
  const eligible = candidates.filter((candidate) => candidate.expiresAt === null || Date.parse(candidate.expiresAt) > nowMs);
  eligible.sort((left, right) => PRIORITY[left.method] - PRIORITY[right.method] || Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  const selected = eligible[0];
  if (!selected) return null;
  const touches = eligible.filter((candidate) => candidate.affiliateId === selected.affiliateId);
  return Object.freeze({
    affiliateId: selected.affiliateId,
    codeId: selected.codeId,
    campaignId: selected.campaignId,
    method: selected.method,
    attributedAt: selected.occurredAt,
    expiresAt: selected.expiresAt,
    commissionScheduleId: selected.commissionScheduleId,
    commissionScheduleVersion: selected.commissionScheduleVersion,
    publicOfferId: selected.publicOfferId,
    sourcePage: selected.sourcePage,
    firstTouchAt: touches.length ? touches.map((candidate) => candidate.occurredAt).sort()[0]! : null,
    lastTouchAt: touches.length ? touches.map((candidate) => candidate.occurredAt).sort().at(-1)! : null,
  });
}
