// Canonical order identity, derived rather than drawn.
//
// The Early Access lanes mint their numbers from randomness, which is right
// for a fresh placement: nothing else IS that placement yet. A canonical
// order is different — it is the conversion of exactly one existing
// transaction, so its identity should be a pure function of that
// transaction. Determinism is what makes duplicate conversion structurally
// idempotent: two racing converters of the same source compute the same
// order number before either reaches the store, and the store's uniqueness
// turns the second insert into a read of the first.

import { createHash } from "node:crypto";
import {
  CANONICAL_ORDER_NUMBER_PREFIX,
  type CanonicalOrderSourceKind,
} from "@shared/research/orders/canonical-order";

/** Crockford base32: no I, L, O or U, so a read-aloud number cannot smuggle ambiguity. */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * The identity a source transaction converts under. One source, one key, and
 * therefore one canonical order, forever.
 */
export function canonicalConversionKey(kind: CanonicalOrderSourceKind, sourceRef: string): string {
  return `${kind}:${sourceRef}`;
}

/**
 * XO- plus the first eighty bits of SHA-256 over the conversion key, encoded
 * as sixteen Crockford base32 characters. Eighty bits keeps accidental
 * collision far below anything this catalog will ever mint, and the hash
 * keeps the number opaque: a customer-visible order number reveals nothing
 * about the source id it was derived from.
 */
export function canonicalOrderNumberFor(conversionKey: string): string {
  const digest = createHash("sha256").update(conversionKey, "utf8").digest();
  // Ten bytes stream into sixteen five-bit groups. Accumulated a byte at a
  // time rather than as one wide integer, so the arithmetic stays inside the
  // safe-integer range on every runtime this ships to.
  let encoded = "";
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < 10; i += 1) {
    buffer = (buffer << 8) | digest[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += CROCKFORD_ALPHABET[(buffer >> bits) & 0x1f];
    }
  }
  return `${CANONICAL_ORDER_NUMBER_PREFIX}${encoded}`;
}
