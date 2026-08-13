import type { CartProductSelection } from "./cart-product-selection";

/** Application-level F-013 ceiling; persistence may remain wider but cannot be reached here. */
export const PERSISTENT_CART_QUANTITY_MAX = 50;
export const PERSISTENT_CART_FAILURE_CODES = [
  "invalid_input",
  "unauthorized",
  "not_found",
  "conflict",
  "selection_stale",
  "quantity_limit",
  "expired",
  "already_claimed",
  "dependency_unavailable",
] as const;

export type PersistentCartFailureCode =
  (typeof PERSISTENT_CART_FAILURE_CODES)[number];

export type PersistentCartItem = {
  id: string;
  productId: string;
  variantId: string;
  sku: string;
  audience: CartProductSelection["audience"];
  quantity: number;
  priceReference: CartProductSelection["price"];
  selectionEvaluatedAt: string;
  version: number;
};

export type PersistentCart = {
  id: string;
  owner: "member" | "anonymous";
  state: "active" | "reconciled" | "expired";
  version: number;
  expiresAt: string;
  items: PersistentCartItem[];
};

export type PersistentCartResult =
  | { ok: true; cart: PersistentCart }
  | { ok: false; code: PersistentCartFailureCode };

/**
 * PR84 selection plus the server-authenticated principal binding required by
 * persistence. Browser audience requests are never accepted as this binding.
 */
export type PersistentCartSelection = CartProductSelection & {
  audienceEligibility: CartProductSelection["audienceEligibility"] & {
    principalId: string | null;
  };
};

export type PutPersistentCartItemInput = {
  cartId?: string;
  expectedCartVersion: number | null;
  expectedItemVersion: number | null;
  quantity: number;
  selection: PersistentCartSelection;
  idempotencyKey: string;
  expiresAt: string;
};

export type RemovePersistentCartItemInput = {
  cartId: string;
  itemId: string;
  expectedCartVersion: number;
  expectedItemVersion: number;
  idempotencyKey: string;
};

export type ClaimAnonymousCartInput = {
  anonymousSecret: string;
  selections: PersistentCartSelection[];
  expectedAnonymousCartVersion: number;
  memberCartId?: string;
  expectedMemberCartVersion: number | null;
  idempotencyKey: string;
  expiresAt: string;
};

export interface PersistentCartPort {
  getMemberCart(memberId: string): Promise<PersistentCartResult>;
  getAnonymousCart(secret: string): Promise<PersistentCartResult>;
  putMemberItem(
    memberId: string,
    input: PutPersistentCartItemInput,
  ): Promise<PersistentCartResult>;
  putAnonymousItem(
    anonymousSecret: string,
    input: PutPersistentCartItemInput,
  ): Promise<PersistentCartResult>;
  removeMemberItem(
    memberId: string,
    input: RemovePersistentCartItemInput,
  ): Promise<PersistentCartResult>;
  removeAnonymousItem(
    anonymousSecret: string,
    input: RemovePersistentCartItemInput,
  ): Promise<PersistentCartResult>;
  claimAnonymousCart(
    memberId: string,
    input: ClaimAnonymousCartInput,
  ): Promise<PersistentCartResult>;
  expireCart(
    cartId: string,
    expectedCartVersion: number,
    idempotencyKey: string,
  ): Promise<PersistentCartResult>;
}
