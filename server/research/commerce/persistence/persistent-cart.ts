import { createHash } from "node:crypto";
import type {
  ClaimAnonymousCartInput,
  PersistentCart,
  PersistentCartFailureCode,
  PersistentCartPort,
  PersistentCartResult,
  PutPersistentCartItemInput,
  RemovePersistentCartItemInput,
} from "@shared/research/persistent-cart";
import { PERSISTENT_CART_QUANTITY_MAX } from "@shared/research/persistent-cart";

type RpcResponse = { data: unknown; error: { message?: string } | null };
export type PersistentCartDatabase = {
  rpc(name: string, params: Record<string, unknown>): Promise<RpcResponse>;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET = /^[\x21-\x7e]{32,512}$/;
const IDEMPOTENCY = /^[A-Za-z0-9._:-]{16,200}$/;

function validSecret(value: string): boolean {
  return SECRET.test(value) && new Set(value).size >= 12;
}

export function hashCartSecret(secret: string): string {
  return createHash("sha256")
    .update("xenios:persistent-cart:anonymous:v1\0", "utf8")
    .update(secret, "utf8")
    .digest("hex");
}

export function hashCartIdempotencyKey(key: string): string {
  return createHash("sha256")
    .update("xenios:persistent-cart:idempotency:v1\0", "utf8")
    .update(key, "utf8")
    .digest("hex");
}

function validUuid(value: string | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

function failure(code: PersistentCartFailureCode): PersistentCartResult {
  return { ok: false, code };
}

function parseCart(value: unknown): PersistentCartResult {
  const cart = Array.isArray(value) ? value[0] : value;
  if (!cart || typeof cart !== "object") return failure("dependency_unavailable");
  const candidate = cart as Record<string, unknown>;
  if (
    !validUuid(candidate.id as string) ||
    !["member", "anonymous"].includes(String(candidate.owner)) ||
    !["active", "reconciled", "expired"].includes(String(candidate.state)) ||
    !Number.isSafeInteger(candidate.version) ||
    (candidate.version as number) < 1 ||
    typeof candidate.expiresAt !== "string" ||
    !Array.isArray(candidate.items) ||
    !(candidate.items as unknown[]).every((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      const price = row.priceReference as Record<string, unknown> | undefined;
      return (
        validUuid(row.id as string) &&
        validUuid(row.productId as string) &&
        validUuid(row.variantId as string) &&
        typeof row.sku === "string" &&
        row.sku.length > 0 &&
        Number.isSafeInteger(row.quantity) &&
        (row.quantity as number) >= 1 &&
        (row.quantity as number) <= PERSISTENT_CART_QUANTITY_MAX &&
        Number.isSafeInteger(row.version) &&
        (row.version as number) >= 1 &&
        typeof row.selectionEvaluatedAt === "string" &&
        Number.isFinite(Date.parse(row.selectionEvaluatedAt)) &&
        price !== undefined &&
        validUuid(price.id as string) &&
        Number.isSafeInteger(price.amountCents) &&
        (price.amountCents as number) >= 0 &&
        typeof price.currency === "string" &&
        Number.isSafeInteger(price.version) &&
        (price.version as number) >= 1
      );
    })
  ) {
    return failure("dependency_unavailable");
  }
  return { ok: true, cart: candidate as unknown as PersistentCart };
}

function rpcFailure(message?: string): PersistentCartResult {
  const stable = new Set<PersistentCartFailureCode>([
    "unauthorized",
    "not_found",
    "conflict",
    "selection_stale",
    "quantity_limit",
    "expired",
    "already_claimed",
  ]);
  return failure(stable.has(message as PersistentCartFailureCode)
    ? (message as PersistentCartFailureCode)
    : "dependency_unavailable");
}

function validMutation(
  input: PutPersistentCartItemInput,
  owner: "member" | "anonymous",
  identity: string,
): boolean {
  const expiresAt = Date.parse(input.expiresAt);
  return (
    (input.cartId === undefined || validUuid(input.cartId)) &&
    Number.isSafeInteger(input.quantity) &&
    input.quantity >= 1 &&
    input.quantity <= PERSISTENT_CART_QUANTITY_MAX &&
    (input.expectedCartVersion === null ||
      (Number.isSafeInteger(input.expectedCartVersion) &&
        input.expectedCartVersion >= 1)) &&
    (input.expectedItemVersion === null ||
      (Number.isSafeInteger(input.expectedItemVersion) &&
        input.expectedItemVersion >= 1)) &&
    IDEMPOTENCY.test(input.idempotencyKey) &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now() &&
    validUuid(input.selection.productId) &&
    validUuid(input.selection.variantId) &&
    validUuid(input.selection.price.id) &&
    validUuid(input.selection.media.id) &&
    Boolean(input.selection.sku.trim()) &&
    (owner === "anonymous"
      ? input.selection.audience === "retail" &&
        input.selection.audienceEligibility.principalId === null
      : validUuid(identity) &&
        ["retail", "member"].includes(input.selection.audience) &&
        (input.selection.audience === "retail" ||
          input.selection.audienceEligibility.principalId?.toLowerCase() ===
            identity.toLowerCase())) &&
    input.selection.canonicalReadiness.ready === true &&
    input.selection.inventoryEligibility.state === "eligible" &&
    input.selection.inventoryEligibility.productId === input.selection.productId &&
    input.selection.inventoryEligibility.variantId === input.selection.variantId &&
    /^[a-f0-9]{64}$/.test(input.selection.inventoryEligibility.sourceVersion) &&
    input.selection.inventoryEligibility.evaluatedAt === input.selection.evaluatedAt &&
    input.selection.audienceEligibility.state === "authorized" &&
    input.selection.audienceEligibility.audience === input.selection.audience &&
    Boolean(input.selection.audienceEligibility.sourceVersion.trim()) &&
    (input.selection.audience === "retail" ||
      /^[a-f0-9]{64}$/.test(input.selection.audienceEligibility.sourceVersion)) &&
    input.selection.audienceEligibility.evaluatedAt === input.selection.evaluatedAt &&
    Number.isSafeInteger(input.selection.price.amountCents) &&
    input.selection.price.amountCents >= 0 &&
    Number.isSafeInteger(input.selection.price.version) &&
    input.selection.price.version >= 1 &&
    input.selection.canonicalReadiness.inputVersions.length === 4 &&
    new Set(input.selection.canonicalReadiness.inputVersions.map((value) => value.id)).size === 4 &&
    input.selection.canonicalReadiness.domainVersions.length === 2 &&
    new Set(input.selection.canonicalReadiness.domainVersions.map((value) => value.domain)).size === 2 &&
    input.selection.canonicalReadiness.verifiedInputCount ===
      input.selection.canonicalReadiness.inputVersions.length &&
    Number.isFinite(Date.parse(input.selection.evaluatedAt))
  );
}

function validAnonymousSelection(selection: PutPersistentCartItemInput["selection"]): boolean {
  return validMutation({
    expectedCartVersion: null,
    expectedItemVersion: null,
    quantity: 1,
    selection,
    idempotencyKey: "selection-check-123456",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, "anonymous", "0".repeat(64));
}

export function createPersistentCartRepository(
  database: PersistentCartDatabase,
): PersistentCartPort {
  async function call(
    name: string,
    params: Record<string, unknown>,
  ): Promise<PersistentCartResult> {
    try {
      const { data, error } = await database.rpc(name, params);
      if (error) return rpcFailure(error.message);
      return parseCart(data);
    } catch {
      return failure("dependency_unavailable");
    }
  }

  async function get(owner: "member" | "anonymous", identity: string) {
    if (owner === "member" && !validUuid(identity)) return failure("invalid_input");
    if (owner === "anonymous" && !validSecret(identity)) return failure("invalid_input");
    return call("research_persistent_cart_get", {
      p_owner_kind: owner,
      p_owner_identity:
        owner === "member" ? identity.toLowerCase() : hashCartSecret(identity),
    });
  }

  async function put(
    owner: "member" | "anonymous",
    identity: string,
    input: PutPersistentCartItemInput,
  ) {
    if (
      !validMutation(
        input,
        owner,
        owner === "member" ? identity.toLowerCase() : hashCartSecret(identity),
      ) ||
      (owner === "member" ? !validUuid(identity) : !validSecret(identity))
    ) {
      return failure("invalid_input");
    }
    return call("research_persistent_cart_put_item", {
      p_owner_kind: owner,
      p_owner_identity:
        owner === "member" ? identity.toLowerCase() : hashCartSecret(identity),
      p_cart_id: input.cartId ?? null,
      p_expected_cart_version: input.expectedCartVersion,
      p_expected_item_version: input.expectedItemVersion,
      p_quantity: input.quantity,
      p_selection: input.selection,
      p_idempotency_key_hash: hashCartIdempotencyKey(input.idempotencyKey),
      p_expires_at: input.expiresAt,
    });
  }

  async function remove(
    owner: "member" | "anonymous",
    identity: string,
    input: RemovePersistentCartItemInput,
  ) {
    if (
      !validUuid(input.cartId) ||
      !validUuid(input.itemId) ||
      !Number.isSafeInteger(input.expectedCartVersion) ||
      input.expectedCartVersion < 1 ||
      !Number.isSafeInteger(input.expectedItemVersion) ||
      input.expectedItemVersion < 1 ||
      !IDEMPOTENCY.test(input.idempotencyKey) ||
      (owner === "member" ? !validUuid(identity) : !validSecret(identity))
    ) {
      return failure("invalid_input");
    }
    return call("research_persistent_cart_remove_item", {
      p_owner_kind: owner,
      p_owner_identity:
        owner === "member" ? identity.toLowerCase() : hashCartSecret(identity),
      p_cart_id: input.cartId,
      p_item_id: input.itemId,
      p_expected_cart_version: input.expectedCartVersion,
      p_expected_item_version: input.expectedItemVersion,
      p_idempotency_key_hash: hashCartIdempotencyKey(input.idempotencyKey),
    });
  }

  return {
    getMemberCart: (memberId) => get("member", memberId),
    getAnonymousCart: (secret) => get("anonymous", secret),
    putMemberItem: (memberId, input) => put("member", memberId, input),
    putAnonymousItem: (secret, input) => put("anonymous", secret, input),
    removeMemberItem: (memberId, input) => remove("member", memberId, input),
    removeAnonymousItem: (secret, input) => remove("anonymous", secret, input),
    async claimAnonymousCart(memberId: string, input: ClaimAnonymousCartInput) {
      const expiresAt = Date.parse(input.expiresAt);
      if (
        !validUuid(memberId) ||
        !validSecret(input.anonymousSecret) ||
        input.selections.length < 1 ||
        input.selections.length > 100 ||
        !input.selections.every(validAnonymousSelection) ||
        !Number.isSafeInteger(input.expectedAnonymousCartVersion) ||
        input.expectedAnonymousCartVersion < 1 ||
        (input.memberCartId !== undefined && !validUuid(input.memberCartId)) ||
        (input.expectedMemberCartVersion !== null &&
          (!Number.isSafeInteger(input.expectedMemberCartVersion) ||
            input.expectedMemberCartVersion < 1)) ||
        !IDEMPOTENCY.test(input.idempotencyKey) ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
      ) {
        return failure("invalid_input");
      }
      return call("research_persistent_cart_claim", {
        p_member_id: memberId.toLowerCase(),
        p_anonymous_hash: hashCartSecret(input.anonymousSecret),
        p_selections: input.selections,
        p_expected_anonymous_cart_version: input.expectedAnonymousCartVersion,
        p_member_cart_id: input.memberCartId ?? null,
        p_expected_member_cart_version: input.expectedMemberCartVersion,
        p_idempotency_key_hash: hashCartIdempotencyKey(input.idempotencyKey),
        p_expires_at: input.expiresAt,
      });
    },
    async expireCart(cartId, expectedCartVersion, idempotencyKey) {
      if (
        !validUuid(cartId) ||
        !Number.isSafeInteger(expectedCartVersion) ||
        expectedCartVersion < 1 ||
        !IDEMPOTENCY.test(idempotencyKey)
      ) {
        return failure("invalid_input");
      }
      return call("research_persistent_cart_expire", {
        p_cart_id: cartId,
        p_expected_cart_version: expectedCartVersion,
        p_idempotency_key_hash: hashCartIdempotencyKey(idempotencyKey),
      });
    },
  };
}
