import type { CartProductSelection } from "./cart-product-selection";

export const PERSISTENT_CART_QUANTITY_MAX = 1000;
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

export type PutPersistentCartItemInput = {
  cartId?: string;
  expectedCartVersion: number | null;
  expectedItemVersion: number | null;
  quantity: number;
  selection: CartProductSelection;
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
  selections: CartProductSelection[];
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
