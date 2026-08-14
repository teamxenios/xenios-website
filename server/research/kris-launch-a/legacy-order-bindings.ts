import type { KrisLegacyOrderIdentity } from "@shared/research/kris-launch-a/contract";
import type { KrisProductRecord } from "./dataset-reader";

export const KRIS_LEGACY_ORDER_BINDINGS_ENV =
  "KRIS_LAUNCH_A_LEGACY_ORDER_BINDINGS" as const;

export type ResolveKrisLegacyOrderIdentity = (
  product: KrisProductRecord,
) => KrisLegacyOrderIdentity | null;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KEYS = ["krisProductId", "productId", "variantId"] as const;

function exactObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === KEYS.length && KEYS.every((key) => keys.includes(key));
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

/**
 * Parse one reviewed catalog-row -> released-unit mapping packet.
 * Invalid configuration fails closed as a whole; no partial binding survives.
 */
export function createKrisLegacyOrderIdentityResolver(
  env: NodeJS.ProcessEnv,
): ResolveKrisLegacyOrderIdentity {
  const raw = env[KRIS_LEGACY_ORDER_BINDINGS_ENV]?.trim();
  if (!raw) return () => null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return () => null;
    const bindings = new Map<string, KrisLegacyOrderIdentity>();
    const units = new Set<string>();
    for (const row of parsed) {
      const unitKey = exactObject(row)
        ? `${String(row.productId)}\u0000${String(row.variantId)}`
        : "";
      if (
        !exactObject(row) ||
        !safeId(row.krisProductId) ||
        !safeId(row.productId) ||
        !safeId(row.variantId) ||
        bindings.has(row.krisProductId) ||
        units.has(unitKey)
      ) {
        return () => null;
      }
      bindings.set(row.krisProductId, {
        productId: row.productId,
        variantId: row.variantId,
      });
      units.add(unitKey);
    }
    return (product) => bindings.get(product.id) ?? null;
  } catch {
    return () => null;
  }
}
