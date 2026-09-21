// Server-verified partner attribution for a visitor who is not signed in.
//
// This replaces the legacy `xa1` seam. Both formats lived under the same
// `xr_aff` cookie name, and the only writer of `xa1` was never mounted, so the
// consumer that read it resolved null on every request. Attribution was not
// wrong; it was silently absent, which is worse, because nothing said so.
//
// Referral V1 is now the one authority. The chain is deliberately short and
// every link is re-checked:
//
//   visitor cookie  ->  proves the claim belongs to THIS browser
//   capture claim   ->  names a touch, never a partner
//   durable read    ->  says whose touch it is and whether they may be paid
//
// A cookie can therefore locate an attribution but can never choose one. Every
// failure resolves to null: no secret, no cookie, a forged or expired claim, an
// unreadable authority, an ineligible partner. An order is never lost to an
// attribution problem, and never attributed on a guess.
import type { ReferralV1Store } from "./referral-v1-store";
import {
  readReferralCapture,
  readReferralVisitor,
  referralSecretReady,
} from "./referral-v1-tokens";

export type ReferralAttributionDeps = Readonly<{
  enabled: boolean;
  secret: string | null;
  store: ReferralV1Store;
  now?: () => number;
}>;

/**
 * Resolves the attributed partner id, or null.
 *
 * Note what is absent: no branch returns anything derived from the cookie
 * itself. The only value that can be returned is a partner id the durable
 * authority produced and marked eligible in the same answer.
 */
export function createReferralV1AttributionResolver(deps: ReferralAttributionDeps) {
  return {
    async resolve(input: Readonly<{
      cookieHeader: string | undefined;
      actorAuthUserId: string | null;
    }>): Promise<string | null> {
      if (!deps.enabled) return null;
      const now = (deps.now ?? Date.now)();
      const { cookieHeader, actorAuthUserId } = input;

      // Authenticated ownership is the durable first-valid account binding.
      // It works cross-device and deliberately ignores any conflicting cookie:
      // a later browser touch cannot replace the account's canonical winner.
      if (actorAuthUserId) {
        const binding = await deps.store.bindingAt({
          actorAuthUserId,
          occurredAt: new Date(now).toISOString(),
        });
        if (!binding.ok || binding.value.availability !== "ready" || !binding.value.binding) return null;
        return binding.value.binding.partnerId;
      }

      // A guest has no account binding. Their sealed touch remains provisional
      // and must be bound/revalidated if they later authenticate.
      if (!referralSecretReady(deps.secret)) return null;

      // The visitor cookie is what binds the capture claim to this browser. A
      // claim lifted from somewhere else has no matching visitor and fails the
      // subject check inside readReferralCapture.
      const visitor = readReferralVisitor(deps.secret, cookieHeader, now);
      if (!visitor) return null;

      const claim = readReferralCapture(deps.secret, cookieHeader, visitor, now);
      if (!claim) return null;

      const attribution = await deps.store.attributionForTouch({
        touchId: claim.touchId,
        subjectKeyHash: claim.subjectKeyHash,
      });
      // Unavailable is not "no partner" as a fact; it is "we could not ask".
      // Both resolve to null here because an order must still complete, and the
      // difference is recorded by the store rather than guessed at by this seam.
      if (!attribution.ok) return null;
      if (!attribution.value.eligible) return null;
      return attribution.value.partnerId;
    },
  };
}
