import {
  EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS,
  EARLY_ACCESS_CART_MAX_QUANTITY,
  EARLY_ACCESS_CART_MIN_QUANTITY,
} from "@shared/research/early-access-cart";

export type BrowserCartItem = Readonly<{
  productId: string;
  variantId: string;
  quantity: number;
}>;

export type BrowserCart = Readonly<{ version: 1; items: readonly BrowserCartItem[] }>;

const STORAGE_KEY = "xenios.research.earlyAccess.cart.v1";
const SAFE_ID = /^[A-Za-z0-9:_./-]{2,200}$/;

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

function validItem(value: unknown): value is BrowserCartItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.productId === "string" && SAFE_ID.test(row.productId) &&
    typeof row.variantId === "string" && SAFE_ID.test(row.variantId) &&
    Number.isInteger(row.quantity) && (row.quantity as number) >= EARLY_ACCESS_CART_MIN_QUANTITY && (row.quantity as number) <= EARLY_ACCESS_CART_MAX_QUANTITY &&
    Object.keys(row).every((key) => ["productId", "variantId", "quantity"].includes(key));
}

export function readBrowserCart(): BrowserCart {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return Object.freeze({ version: 1 as const, items: Object.freeze([]) });
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("invalid");
    const row = parsed as Record<string, unknown>;
    if (row.version !== 1 || !Array.isArray(row.items) || row.items.length > EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS || !row.items.every(validItem)) throw new Error("invalid");
    const unique = new Set(row.items.map((item) => `${item.productId}\u0000${item.variantId}`));
    if (unique.size !== row.items.length) throw new Error("duplicate");
    return Object.freeze({ version: 1 as const, items: Object.freeze(row.items.map((item) => Object.freeze({ ...item }))) });
  } catch {
    storage()?.removeItem(STORAGE_KEY);
    return Object.freeze({ version: 1 as const, items: Object.freeze([]) });
  }
}

function write(items: readonly BrowserCartItem[]): BrowserCart {
  const cart = Object.freeze({ version: 1 as const, items: Object.freeze(items.map((item) => Object.freeze({ ...item }))) });
  storage()?.setItem(STORAGE_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent("xenios:early-access-cart", { detail: cart }));
  return cart;
}

export function putBrowserCartItem(input: BrowserCartItem): BrowserCart {
  if (!validItem(input)) return readBrowserCart();
  const current = readBrowserCart().items;
  const key = `${input.productId}\u0000${input.variantId}`;
  const without = current.filter((item) => `${item.productId}\u0000${item.variantId}` !== key);
  if (without.length >= EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS) return readBrowserCart();
  return write([...without, input]);
}

export function removeBrowserCartItem(productId: string, variantId: string): BrowserCart {
  return write(readBrowserCart().items.filter((item) => item.productId !== productId || item.variantId !== variantId));
}

export function clearBrowserCart(): BrowserCart {
  storage()?.removeItem(STORAGE_KEY);
  const cart = Object.freeze({ version: 1 as const, items: Object.freeze([]) });
  window.dispatchEvent(new CustomEvent("xenios:early-access-cart", { detail: cart }));
  return cart;
}

export function browserCartUnitCount(cart: BrowserCart): number {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Proves the storage shape contains no contact, identity, money, or credentials. */
export const EARLY_ACCESS_BROWSER_CART_ALLOWED_KEYS = Object.freeze([
  "version", "items", "productId", "variantId", "quantity",
]);
