import type { CartItem } from "@shared/research/types";

export const RESEARCH_CART_SESSION_KEY = "xenios.research.memberCart.v2";
export const LEGACY_RESEARCH_CART_STORAGE_KEY = "xenios-research-cart-v1";

const CART_SCOPE = /^[a-f0-9]{64}$/;
const PRODUCT_SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const MAX_CART_LINES = 200;
const MAX_QUANTITY = 25;

type StoredMemberCart = Readonly<{
  version: 2;
  scope: string;
  items: readonly CartItem[];
}>;

export function isResearchCartScope(value: unknown): value is string {
  return typeof value === "string" && CART_SCOPE.test(value);
}

function decodeItems(value: unknown): CartItem[] | null {
  if (!Array.isArray(value) || value.length > MAX_CART_LINES) return null;
  const seen = new Set<string>();
  const items: CartItem[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    if (
      Object.keys(entry).some((key) => key !== "slug" && key !== "quantity") ||
      typeof entry.slug !== "string" ||
      !PRODUCT_SLUG.test(entry.slug) ||
      !Number.isSafeInteger(entry.quantity) ||
      (entry.quantity as number) < 1 ||
      (entry.quantity as number) > MAX_QUANTITY ||
      seen.has(entry.slug)
    ) {
      return null;
    }
    seen.add(entry.slug);
    items.push({ slug: entry.slug, quantity: entry.quantity as number });
  }
  return items;
}

function remove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // A blocked browser store is equivalent to unavailable persistence.
  }
}

export function purgeLegacyResearchCartStorage(
  session: Storage,
  legacyLocal?: Storage | null,
): void {
  remove(session, LEGACY_RESEARCH_CART_STORAGE_KEY);
  if (legacyLocal) remove(legacyLocal, LEGACY_RESEARCH_CART_STORAGE_KEY);
}

/** Purges the old global/local cart and the current member-scoped envelope. */
export function clearResearchCartStorage(
  session: Storage,
  legacyLocal?: Storage | null,
): void {
  remove(session, RESEARCH_CART_SESSION_KEY);
  purgeLegacyResearchCartStorage(session, legacyLocal);
}

/**
 * Restores only the exact verified member scope. A different scope, malformed
 * payload, or legacy global cart is deleted rather than reclassified.
 */
export function readResearchCartForScope(
  session: Storage,
  scope: string,
  legacyLocal?: Storage | null,
): CartItem[] {
  purgeLegacyResearchCartStorage(session, legacyLocal);
  if (!isResearchCartScope(scope)) {
    remove(session, RESEARCH_CART_SESSION_KEY);
    return [];
  }
  try {
    const raw = session.getItem(RESEARCH_CART_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredMemberCart>;
    const items = decodeItems(parsed?.items);
    if (
      parsed?.version !== 2 ||
      parsed?.scope !== scope ||
      !isResearchCartScope(parsed?.scope) ||
      items === null
    ) {
      remove(session, RESEARCH_CART_SESSION_KEY);
      return [];
    }
    return items;
  } catch {
    remove(session, RESEARCH_CART_SESSION_KEY);
    return [];
  }
}

/** Writes no cart unless the server supplied an exact verified member scope. */
export function writeResearchCartForScope(
  session: Storage,
  scope: string,
  items: readonly CartItem[],
  legacyLocal?: Storage | null,
): boolean {
  purgeLegacyResearchCartStorage(session, legacyLocal);
  const safeItems = decodeItems(items);
  if (!isResearchCartScope(scope) || safeItems === null) {
    remove(session, RESEARCH_CART_SESSION_KEY);
    return false;
  }
  try {
    session.setItem(
      RESEARCH_CART_SESSION_KEY,
      JSON.stringify({ version: 2, scope, items: safeItems } satisfies StoredMemberCart),
    );
    return true;
  } catch {
    remove(session, RESEARCH_CART_SESSION_KEY);
    return false;
  }
}
