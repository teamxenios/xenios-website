import { randomBytes } from "node:crypto";

/**
 * The customer-facing handle for one Early Access order.
 *
 * It is the ONLY identifier that leaves the server, and it is 80 bits of
 * randomness rather than a counter. Two properties follow, and both are the
 * point:
 *
 *   1. NOTHING SEQUENTIAL IS EXPOSED. A customer cannot learn how many orders
 *      exist, cannot infer who ordered before them, and cannot walk to the next
 *      one. An incrementing id in a URL is the classic way an order lookup
 *      becomes an enumeration of the whole book.
 *   2. IT IS UNGUESSABLE. Order lookup is authorized against the resolved
 *      customer as well, so the number is not the credential, but an unguessable
 *      number means a failure of that check cannot be exploited by brute force
 *      either.
 *
 * The alphabet is Crockford base32: the digits and the letters, minus I, L, O
 * and U. A number read down a phone line or copied off a screen therefore cannot
 * turn into a different order because someone confused a one for an I.
 *
 * The number doubles as the domain's `orderId`. That is deliberate: a separate
 * internal id would need a mapping table, and a mapping table between two names
 * for one order is a thing that can disagree with itself. The shape satisfies
 * `isSafeIdentifier`, so it flows through the commerce modules unchanged, and the
 * invoice number and payment reference derive from it deterministically.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const EARLY_ACCESS_ORDER_NUMBER_PREFIX = "XEA-";
export const EARLY_ACCESS_ORDER_NUMBER_LENGTH = 16;

/** Anchored, so a lookalike path cannot be mistaken for an order number. */
export const EARLY_ACCESS_ORDER_NUMBER = /^XEA-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/;

export function isEarlyAccessOrderNumber(value: unknown): value is string {
  return typeof value === "string" && EARLY_ACCESS_ORDER_NUMBER.test(value);
}

/**
 * Randomness is injected so the generator is deterministic under test while the
 * production default is the platform CSPRNG.
 *
 * Each byte contributes its low five bits. The alphabet has exactly 32 entries,
 * so 32 divides 256 evenly and no character is more likely than another; a
 * modulo against a non-power-of-two alphabet would bias the leading characters.
 */
export function generateEarlyAccessOrderNumber(
  randomness: (byteCount: number) => Uint8Array = (byteCount) => randomBytes(byteCount),
): string {
  const bytes = randomness(EARLY_ACCESS_ORDER_NUMBER_LENGTH);
  if (bytes.length < EARLY_ACCESS_ORDER_NUMBER_LENGTH) {
    throw new Error("The order number generator was given too little randomness.");
  }
  let body = "";
  for (let index = 0; index < EARLY_ACCESS_ORDER_NUMBER_LENGTH; index += 1) {
    body += ALPHABET.charAt((bytes[index] as number) & 31);
  }
  return `${EARLY_ACCESS_ORDER_NUMBER_PREFIX}${body}`;
}
