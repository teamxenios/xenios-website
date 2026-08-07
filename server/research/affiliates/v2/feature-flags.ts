/**
 * THE AFFILIATE FLAGS, WITH SOMETHING BEHIND THEM.
 *
 * Until this module existed the four affiliate flag names appeared in exactly
 * one place in the repository: `.env.example`. Nothing parsed them, nothing
 * consumed them, and no code path changed when one was set. The affiliate
 * system was inert for a completely different reason, which is that no
 * affiliate route was ever mounted.
 *
 * That distinction is the whole point. A flag that gates nothing is not a
 * safety control, it is a comment that looks like one, and the rollback note
 * that said "leave every flag false, this is the rollback" was describing a
 * protection that did not exist. The real protection was the absent routes.
 * Anyone who later mounted a route and trusted that sentence would have
 * shipped an ungated affiliate surface believing it was switched off.
 *
 * So this module follows the pattern that already works in this repository
 * (`early-access/cart/feature-flag.ts`): a named env constant, an exact-string
 * parser, and a consumer at the composition root. It is the parser half. The
 * mount half arrives with the routes, and `unenforced-flags.test.ts` fails the
 * build if a route arrives without it.
 */

export const AFFILIATE_SYSTEM_ENV = "AFFILIATE_SYSTEM_ENABLED";
export const AFFILIATE_PORTAL_ENV = "AFFILIATE_PORTAL_ENABLED";
export const AFFILIATE_CODES_ENV = "AFFILIATE_CODES_ENABLED";
export const AFFILIATE_CODE_UNLOCKS_EARLY_ACCESS_ENV = "AFFILIATE_CODE_UNLOCKS_EARLY_ACCESS";

/** Every affiliate flag name, for the enforcement audit. */
export const AFFILIATE_FLAG_ENV_NAMES = Object.freeze([
  AFFILIATE_SYSTEM_ENV,
  AFFILIATE_PORTAL_ENV,
  AFFILIATE_CODES_ENV,
  AFFILIATE_CODE_UNLOCKS_EARLY_ACCESS_ENV,
] as const);

export type EnvLike = Readonly<Partial<Record<string, string | undefined>>>;

/**
 * Exactly the lowercase string "true", and nothing else.
 *
 * Not "TRUE", not "1", not "yes", not " true ". A deployment that meant to
 * enable something and typed it differently gets the safe answer, and an
 * operator reading the variable back sees precisely what the code compares.
 */
export function affiliateFlagEnabled(name: string, env: EnvLike): boolean {
  return env[name] === "true";
}

/**
 * The parent switch. False means no operational affiliate system of any kind.
 *
 * True does NOT activate the subordinate surfaces. It only permits them to be
 * evaluated, which is why every accessor below requires it AND its own flag.
 */
export function affiliateSystemEnabled(env: EnvLike): boolean {
  return affiliateFlagEnabled(AFFILIATE_SYSTEM_ENV, env);
}

/**
 * The portal is gated TWICE on purpose, the same way `quantumCommerceAllowed`
 * was written: enabling the affiliate system must never enable the portal as
 * a side effect, because the portal exposes an affiliate's own commercial
 * record and needs its own decision.
 *
 * True here still authorizes nothing. It permits the portal to MOUNT, and the
 * portal must then authenticate and authorize the affiliate itself. A flag is
 * not an authorization.
 */
export function affiliatePortalEnabled(env: EnvLike): boolean {
  return affiliateSystemEnabled(env) && affiliateFlagEnabled(AFFILIATE_PORTAL_ENV, env);
}

/** Customer-facing code validation and attribution. Also double gated. */
export function affiliateCodesEnabled(env: EnvLike): boolean {
  return affiliateSystemEnabled(env) && affiliateFlagEnabled(AFFILIATE_CODES_ENV, env);
}

/**
 * Whether an affiliate code may UNLOCK Early Access, rather than only
 * attributing an order a separately authenticated customer places.
 *
 * Triple gated, and deliberately the most conditional thing in the file. An
 * affiliate code is a marketing credential. Letting one open the door to a
 * private catalogue turns a link that gets forwarded, screenshotted and
 * pasted into a group chat into an authentication token.
 *
 * Even when every flag is true this permits ONLY the purpose-built customer
 * access-code path. It never authenticates anyone into the affiliate portal
 * or the admin surface: those are separate credentials with separate doors,
 * and no combination of these flags may join them.
 */
export function affiliateCodeUnlocksEarlyAccess(env: EnvLike): boolean {
  return (
    affiliateCodesEnabled(env) &&
    affiliateFlagEnabled(AFFILIATE_CODE_UNLOCKS_EARLY_ACCESS_ENV, env)
  );
}

/**
 * The one thing a flag may never do: pay somebody.
 *
 * Commission accrual is a business-domain decision, not a routing decision.
 * `calculateAffiliateCommission` already returns null for any schedule that is
 * not `active`, and the shipped schedule is a `draft`. This states the rule as
 * a named function so a future route cannot accidentally become the only place
 * it is enforced: an enabled system with an unapproved schedule accrues zero,
 * and enabling every flag in this file does not change that.
 */
export function affiliateCommissionsMayAccrue(
  env: EnvLike,
  scheduleState: string,
): boolean {
  return affiliateSystemEnabled(env) && scheduleState === "active";
}
