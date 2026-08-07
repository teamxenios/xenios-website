/**
 * The Early Access multi-product cart kill switch.
 *
 * EXACTLY the string "true" mounts the cart. Missing, empty, malformed,
 * "false", "1", "TRUE", "yes" or anything else leaves it unmounted, which
 * means the routes do not exist and the single-product order path a customer
 * can already use is untouched. This follows the same fail-closed shape as
 * RESEARCH_EARLY_ACCESS_SESSION_IDENTITY_ENABLED and the rate-limit switch:
 * an operator who fat-fingers the variable gets the old, narrower surface,
 * never a wider one.
 *
 * It is false by default deliberately. A cart writes commerce facts, and a
 * new commerce writer arrives switched off until a named human turns it on.
 */
export const EARLY_ACCESS_CART_ENV = "RESEARCH_EARLY_ACCESS_CART_ENABLED";

export function earlyAccessCartEnabled(
  env: Readonly<Partial<Record<string, string>>>,
): boolean {
  return env[EARLY_ACCESS_CART_ENV] === "true";
}
