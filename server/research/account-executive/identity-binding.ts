import { aeIdentifier } from "../../../shared/research/account-executive/workspace";
import { sha256AssistedOrderHasher } from "../assisted-order/defaults";

/** The existing requestIntentOwner member namespace, with canonical UUID case.
 * A guest-session hash never becomes this hash by contact/referral matching. */
export function memberOwnerHash(authUserId: string): string {
  return sha256AssistedOrderHasher.stableHash(["request-intent-owner", "member", aeIdentifier.parse(authUserId)]);
}
