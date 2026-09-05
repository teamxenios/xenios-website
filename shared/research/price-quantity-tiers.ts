/** Quantity breaks on one canonical Product Control price version.
 * This module selects amounts only; approval, audience and time remain the
 * existing price resolver's responsibility. It never reads an import batch.
 */
export interface PriceQuantityTier {
  readonly minimumQuantity: number;
  readonly amountCents: number;
}

// Canonical amounts are PostgreSQL bigint; JavaScript's exact integer range
// is the narrower boundary. Preserve legacy scalar amounts within that range.
const MAX_EXACT_INTEGER = Number.MAX_SAFE_INTEGER;
const MAX_TIERS = 16;

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_EXACT_INTEGER;
}

/** Undefined/empty tiers preserve legacy scalar prices; malformed data refuses.
 * The first tier must be the scalar price at quantity one, so the two customer
 * price representations cannot disagree. Ordering is validated, never sorted.
 */
export function readCanonicalPriceTiers(
  baseAmountCents: unknown,
  value: unknown,
): readonly PriceQuantityTier[] | null {
  if (!positiveInteger(baseAmountCents)) return null;
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return Object.freeze([Object.freeze({ minimumQuantity: 1, amountCents: baseAmountCents })]);
  }
  if (!Array.isArray(value) || value.length > MAX_TIERS) return null;
  const result: PriceQuantityTier[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const keys = Object.keys(raw);
    if (keys.length !== 2 || !keys.includes("minimumQuantity") || !keys.includes("amountCents")) return null;
    if (!positiveInteger(raw.minimumQuantity) || !positiveInteger(raw.amountCents)) return null;
    const previous = result.at(-1);
    if (previous === undefined) {
      if (raw.minimumQuantity !== 1 || raw.amountCents !== baseAmountCents) return null;
    } else if (raw.minimumQuantity <= previous.minimumQuantity || raw.amountCents > previous.amountCents) {
      return null;
    }
    result.push(Object.freeze({ minimumQuantity: raw.minimumQuantity, amountCents: raw.amountCents }));
  }
  return Object.freeze(result);
}

/** Select the greatest approved threshold not exceeding the exact line quantity.
 * Quantities must already be aggregated per canonical variant by the caller.
 * Multiplication must remain an exactly representable integer-cent amount.
 */
export function resolveCanonicalQuantityPrice(
  baseAmountCents: unknown,
  tiers: unknown,
  quantity: unknown,
): PriceQuantityTier | null {
  if (!positiveInteger(quantity)) return null;
  const normalized = readCanonicalPriceTiers(baseAmountCents, tiers);
  if (normalized === null) return null;
  let selected = normalized[0];
  for (const tier of normalized) {
    if (tier.minimumQuantity > quantity) break;
    selected = tier;
  }
  return positiveInteger(selected.amountCents * quantity) ? selected : null;
}
