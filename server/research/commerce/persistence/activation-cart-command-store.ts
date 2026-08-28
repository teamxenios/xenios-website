import { createHash } from "node:crypto";

import type { SubscriptionFrequencyDays } from "@shared/research/commerce";
import {
  isResolvedCurrentLiveProductVariantActivationAuthority,
  resolveProductVariantActivationAuthorityForTest,
  type ProductVariantActivationLedgerRecord,
} from "../../product-activation/authority-repository";
import type { StoredCart, StoredCartLine } from "../cart";
import { getSupabaseAdmin } from "../../../supabase";

export const ACTIVATION_CART_COMMAND_PROTOCOL =
  "xenios:research-activation-cart-command:v1";

/**
 * Exact SHA-256 of the reviewed, unapplied SQL candidate's canonical LF bytes.
 * Production wiring is disabled unless both the explicit feature switch and
 * this exact capability attestation are present. Updating the candidate
 * requires updating this hash and repeating its disposable rehearsal.
 */
export const ACTIVATION_CART_COMMAND_CAPABILITY_ATTESTATION =
  "research_activation_cart_authority_v1@sha256:b8d0addc19cbe38709d59222d45d5f7eef0c7641a6cd8f92ad3d66365c5e56fe";

/**
 * Exact Product Control and activation-ledger revisions that were current at
 * the cart command's serialization point. This is server-only evidence; it is
 * never added to the member cart DTO.
 */
export interface ActivationBoundCartLineAuthority {
  productId: string;
  variantId: string;
  sku: string;
  productRevision: number;
  variantRevision: number;
  bindingFingerprint: string;
  activationLedgerRevision: number;
  activationEvidenceFingerprint: string;
}

export type ActivationCartLineMutation =
  | Readonly<{
      kind: "add";
      memberId: string;
      sku: string;
      quantityDelta: number;
      purchaseMode: "one_time" | "subscription";
      subscriptionFrequencyDays?: SubscriptionFrequencyDays;
      evaluatedAt: string;
      maxLineQuantity: number;
    }>
  | Readonly<{
      kind: "set_quantity";
      memberId: string;
      sku: string;
      quantity: number;
      evaluatedAt: string;
      maxLineQuantity: number;
    }>;

export type ActivationCartCommandDenialCode =
  | "authority_unavailable"
  | "activation_not_live"
  | "product_not_found"
  | "quantity_invalid"
  | "cart_conflict";

export type ActivationCartCommandResult =
  | Readonly<{
      ok: true;
      cart: StoredCart;
      cartId: string;
      cartVersion: number;
      authority: ActivationBoundCartLineAuthority;
    }>
  | Readonly<{
      ok: false;
      code: ActivationCartCommandDenialCode;
    }>;

/**
 * A command, not a read repository. Implementations must resolve the exact SKU
 * binding, adjudicate the current non-revoked activation revision, compare and
 * mutate the cart, and persist the authority snapshot in one serialized durable
 * transaction. A split read-then-save implementation does not satisfy this
 * interface.
 */
export interface ActivationBoundCartCommandStore {
  mutateLine(
    input: ActivationCartLineMutation,
  ): Promise<ActivationCartCommandResult>;
}

export interface CheckoutActivationLineAuthorization
  extends ActivationBoundCartLineAuthority {
  quantity: number;
  purchaseMode: "one_time" | "subscription";
  subscriptionFrequencyDays?: SubscriptionFrequencyDays;
}

export interface CheckoutActivationPrechargeAuthorization {
  intentId: string;
  cartId: string;
  cartVersion: number;
  cartFingerprint: string;
  lines: readonly CheckoutActivationLineAuthorization[];
  authorizedAt: string;
  expiresAt: string;
}

export type CheckoutActivationPrechargeResult =
  | Readonly<{
      ok: true;
      authorization: CheckoutActivationPrechargeAuthorization;
    }>
  | Readonly<{
      ok: false;
      code:
        | "authority_unavailable"
        | "activation_not_live"
        | "cart_empty"
        | "cart_conflict";
    }>;

export type CheckoutActivationIntentLifecycleResult =
  | Readonly<{
      ok: true;
      state: "claimed" | "consumed" | "cancelled";
      idempotent: boolean;
    }>
  | Readonly<{
      ok: false;
      code:
        | "authority_unavailable"
        | "intent_not_found"
        | "intent_stale"
        | "intent_mismatch"
        | "intent_conflict";
    }>;

/**
 * Narrow checkout boundary for the payment saga.
 *
 * `authorize` must create a durable, short-lived intention while holding the
 * locked cart snapshot and every exact activation revision. Product/variant or
 * activation-head mutations must serialize against the intention until it is
 * consumed, cancelled, or expired. This lease does not pretend a database
 * transaction spans an external payment provider: the saga must later consume
 * or cancel the intention in its own durable settlement/compensation command.
 */
export interface CheckoutActivationPrechargeAuthorizer {
  authorize(input: Readonly<{
    memberId: string;
    checkoutIdempotencyKey: string;
    evaluatedAt: string;
    leaseTtlSeconds: number;
  }>): Promise<CheckoutActivationPrechargeResult>;
  /**
   * Claim must succeed before any provider I/O. It binds the immutable
   * authorization digest to one checkout command while the unclaimed lease is
   * still live. A claimed intent remains leased until that same command
   * consumes or cancels it, even when provider latency crosses `expiresAt`.
   */
  claim(input: Readonly<{
    memberId: string;
    checkoutIdempotencyKey: string;
    intentId: string;
    checkoutCommandId: string;
    expectedCartFingerprint: string;
    at: string;
  }>): Promise<CheckoutActivationIntentLifecycleResult>;
  /**
   * Consume the intent in the settlement transaction. The same command may
   * consume a valid pre-provider claim after the original short lease expires;
   * an unclaimed stale intent still refuses.
   */
  consume(input: Readonly<{
    memberId: string;
    checkoutIdempotencyKey: string;
    intentId: string;
    checkoutCommandId: string;
    expectedCartFingerprint: string;
    at: string;
  }>): Promise<CheckoutActivationIntentLifecycleResult>;
  /**
   * Cancel only the intention owned by the same member, checkout key, and
   * checkout command. An intention already consumed or bound to another
   * command cannot be cancelled.
   */
  cancel(input: Readonly<{
    memberId: string;
    checkoutIdempotencyKey: string;
    intentId: string;
    checkoutCommandId: string;
    at: string;
  }>): Promise<CheckoutActivationIntentLifecycleResult>;
}

export interface ActivationBindingRevision {
  productId: string;
  variantId: string;
  sku: string;
  productRevision: number;
  variantRevision: number;
}

export function canonicalActivationBindingFingerprint(
  binding: ActivationBindingRevision,
): string {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify([
        binding.productId,
        binding.variantId,
        binding.sku,
        binding.productRevision,
        binding.variantRevision,
      ]),
      "utf8",
    )
    .digest("hex")}`;
}

function cloneCart(cart: StoredCart): StoredCart {
  return { lines: cart.lines.map((line) => ({ ...line })) };
}

function validPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function exactBinding(
  bindings: readonly ActivationBindingRevision[],
  sku: string,
): ActivationBindingRevision | null {
  if (bindings.length !== 1) return null;
  const binding = bindings[0];
  if (
    !binding.productId.trim() ||
    !binding.variantId.trim() ||
    binding.sku !== sku ||
    !validPositiveInteger(binding.productRevision) ||
    !validPositiveInteger(binding.variantRevision)
  ) {
    return null;
  }
  return binding;
}

type SerializedWork = <T>(work: () => Promise<T>) => Promise<T>;

function serialQueue(): SerializedWork {
  let tail: Promise<void> = Promise.resolve();
  return async <T>(work: () => Promise<T>): Promise<T> => {
    const prior = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await work();
    } finally {
      release();
    }
  };
}

export interface InMemoryActivationCartAuthorityControl {
  commandStore: ActivationBoundCartCommandStore;
  replaceBindings(
    sku: string,
    bindings: readonly ActivationBindingRevision[],
  ): Promise<void>;
  replaceActivationRows(
    sku: string,
    rows: readonly ProductVariantActivationLedgerRecord[],
  ): Promise<void>;
  inspectAuthority(
    memberId: string,
    sku: string,
  ): Promise<ActivationBoundCartLineAuthority | null>;
}

/**
 * Linearizable in-memory reference implementation for adversarial tests. The
 * authority mutation controls share the exact same queue as cart commands, so
 * a revocation or binding change cannot interleave between adjudication and
 * save. It is deliberately not a production adapter.
 */
export function createInMemoryActivationCartAuthorityControl(input: Readonly<{
  cartRepository: Readonly<{
    load(memberId: string): Promise<StoredCart | null>;
    save(memberId: string, cart: StoredCart): Promise<void>;
  }>;
  bindings?: ReadonlyMap<string, readonly ActivationBindingRevision[]>;
  activationRows?: ReadonlyMap<
    string,
    readonly ProductVariantActivationLedgerRecord[]
  >;
}>): InMemoryActivationCartAuthorityControl {
  const serialize = serialQueue();
  const bindings = new Map<string, readonly ActivationBindingRevision[]>(
    input.bindings ?? [],
  );
  const rows = new Map<
    string,
    readonly ProductVariantActivationLedgerRecord[]
  >(input.activationRows ?? []);
  const lineAuthorities = new Map<
    string,
    ActivationBoundCartLineAuthority
  >();
  const cartIds = new Map<string, string>();
  const cartVersions = new Map<string, number>();

  const authorityKey = (memberId: string, sku: string): string =>
    `${memberId.length}:${memberId}${sku.length}:${sku}`;

  const commandStore: ActivationBoundCartCommandStore = {
    mutateLine: (command) =>
      serialize(async () => {
        if (
          !command.memberId.trim() ||
          !command.sku.trim() ||
          !validPositiveInteger(command.maxLineQuantity)
        ) {
          return { ok: false as const, code: "cart_conflict" as const };
        }

        const binding = exactBinding(bindings.get(command.sku) ?? [], command.sku);
        if (binding === null) {
          return { ok: false as const, code: "activation_not_live" as const };
        }

        const activation = resolveProductVariantActivationAuthorityForTest(
          {
            readCurrentCandidates: () => rows.get(command.sku) ?? [],
          },
          {
            productId: binding.productId,
            variantId: binding.variantId,
            sku: binding.sku,
            evaluatedAt: command.evaluatedAt,
          },
        );
        if (
          !isResolvedCurrentLiveProductVariantActivationAuthority(activation, {
            productId: binding.productId,
            variantId: binding.variantId,
            sku: binding.sku,
            evaluatedAt: command.evaluatedAt,
          })
        ) {
          return { ok: false as const, code: "activation_not_live" as const };
        }

        const stored = cloneCart(
          (await input.cartRepository.load(command.memberId)) ?? { lines: [] },
        );
        const existing = stored.lines.find((line) => line.sku === command.sku);
        let quantity: number;
        let nextLine: StoredCartLine;
        if (command.kind === "add") {
          quantity = (existing?.quantity ?? 0) + command.quantityDelta;
          nextLine = {
            sku: command.sku,
            quantity,
            purchaseMode: command.purchaseMode,
            ...(command.purchaseMode === "subscription" &&
            command.subscriptionFrequencyDays !== undefined
              ? {
                  subscriptionFrequencyDays:
                    command.subscriptionFrequencyDays,
                }
              : {}),
          };
        } else {
          if (existing === undefined) {
            return { ok: false as const, code: "product_not_found" as const };
          }
          quantity = command.quantity;
          nextLine = { ...existing, quantity };
        }
        if (
          !validPositiveInteger(quantity) ||
          quantity > command.maxLineQuantity
        ) {
          return { ok: false as const, code: "quantity_invalid" as const };
        }

        const next: StoredCart = {
          lines:
            existing === undefined
              ? [...stored.lines, nextLine]
              : stored.lines.map((line) =>
                  line.sku === command.sku ? nextLine : line,
                ),
        };
        await input.cartRepository.save(command.memberId, next);

        const authority: ActivationBoundCartLineAuthority = Object.freeze({
          productId: binding.productId,
          variantId: binding.variantId,
          sku: binding.sku,
          productRevision: binding.productRevision,
          variantRevision: binding.variantRevision,
          bindingFingerprint: canonicalActivationBindingFingerprint(binding),
          activationLedgerRevision: activation.ledgerRevision,
          activationEvidenceFingerprint: activation.evidenceFingerprint,
        });
        lineAuthorities.set(authorityKey(command.memberId, command.sku), authority);
        const cartId =
          cartIds.get(command.memberId) ??
          `in-memory-cart:sha256:${createHash("sha256")
            .update(command.memberId, "utf8")
            .digest("hex")}`;
        cartIds.set(command.memberId, cartId);
        const cartVersion = (cartVersions.get(command.memberId) ?? 0) + 1;
        cartVersions.set(command.memberId, cartVersion);
        return {
          ok: true as const,
          cart: cloneCart(next),
          cartId,
          cartVersion,
          authority,
        };
      }),
  };

  return {
    commandStore,
    replaceBindings: (sku, replacement) =>
      serialize(async () => {
        bindings.set(sku, replacement.map((value) => ({ ...value })));
      }),
    replaceActivationRows: (sku, replacement) =>
      serialize(async () => {
        rows.set(sku, replacement.map((value) => ({ ...value })));
      }),
    inspectAuthority: (memberId, sku) =>
      serialize(async () => {
        const value = lineAuthorities.get(authorityKey(memberId, sku));
        return value === undefined ? null : { ...value };
      }),
  };
}

export const unavailableActivationBoundCartCommandStore: ActivationBoundCartCommandStore = {
  mutateLine: async () => ({ ok: false, code: "authority_unavailable" }),
};

export const unavailableCheckoutActivationPrechargeAuthorizer: CheckoutActivationPrechargeAuthorizer = {
  authorize: async () => ({ ok: false, code: "authority_unavailable" }),
  claim: async () => ({ ok: false, code: "authority_unavailable" }),
  consume: async () => ({ ok: false, code: "authority_unavailable" }),
  cancel: async () => ({ ok: false, code: "authority_unavailable" }),
};

type RpcResponse = Readonly<{
  data: unknown;
  error: Readonly<{ message?: string }> | null;
}>;

export type ActivationCartCommandDatabase = Readonly<{
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<RpcResponse>;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

function validIsoInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function parseStoredLine(value: unknown): StoredCartLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.sku !== "string" ||
    !row.sku.trim() ||
    !validPositiveInteger(row.quantity as number) ||
    !["one_time", "subscription"].includes(String(row.purchaseMode))
  ) {
    return null;
  }
  if (row.purchaseMode === "subscription") {
    if (![30, 60, 90].includes(row.subscriptionFrequencyDays as number)) {
      return null;
    }
    return {
      sku: row.sku,
      quantity: row.quantity as number,
      purchaseMode: "subscription",
      subscriptionFrequencyDays:
        row.subscriptionFrequencyDays as SubscriptionFrequencyDays,
    };
  }
  if (
    row.subscriptionFrequencyDays !== null &&
    row.subscriptionFrequencyDays !== undefined
  ) {
    return null;
  }
  return {
    sku: row.sku,
    quantity: row.quantity as number,
    purchaseMode: "one_time",
  };
}

function parseAuthority(
  value: unknown,
): ActivationBoundCartLineAuthority | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    !UUID.test(String(row.productId)) ||
    !UUID.test(String(row.variantId)) ||
    typeof row.sku !== "string" ||
    !row.sku.trim() ||
    !validPositiveInteger(row.productRevision as number) ||
    !validPositiveInteger(row.variantRevision as number) ||
    !SHA256.test(String(row.bindingFingerprint)) ||
    !validPositiveInteger(row.activationLedgerRevision as number) ||
    !SHA256.test(String(row.activationEvidenceFingerprint))
  ) {
    return null;
  }
  return row as unknown as ActivationBoundCartLineAuthority;
}

function rpcDenial(value: unknown): ActivationCartCommandResult {
  const code =
    value && typeof value === "object"
      ? String((value as Record<string, unknown>).code ?? "")
      : "";
  if (
    [
      "authority_unavailable",
      "activation_not_live",
      "product_not_found",
      "quantity_invalid",
      "cart_conflict",
    ].includes(code)
  ) {
    return { ok: false, code: code as ActivationCartCommandDenialCode };
  }
  return { ok: false, code: "authority_unavailable" };
}

function parseRpcResult(value: unknown): ActivationCartCommandResult {
  const result = Array.isArray(value) ? value[0] : value;
  if (!result || typeof result !== "object") return rpcDenial(result);
  const row = result as Record<string, unknown>;
  if (row.ok !== true) return rpcDenial(row);
  if (
    !UUID.test(String(row.cartId)) ||
    !validPositiveInteger(row.cartVersion as number) ||
    !Array.isArray(row.lines)
  ) {
    return { ok: false, code: "authority_unavailable" };
  }
  const lines = row.lines.map(parseStoredLine);
  const authority = parseAuthority(row.authority);
  if (lines.some((line) => line === null) || authority === null) {
    return { ok: false, code: "authority_unavailable" };
  }
  return {
    ok: true,
    cart: { lines: lines as StoredCartLine[] },
    cartId: String(row.cartId),
    cartVersion: row.cartVersion as number,
    authority,
  };
}

/** Thin adapter over the reviewed database-owned command. */
export function createSupabaseActivationBoundCartCommandStore(
  database: ActivationCartCommandDatabase = getSupabaseAdmin(),
): ActivationBoundCartCommandStore {
  return {
    async mutateLine(input) {
      if (
        !UUID.test(input.memberId) ||
        !input.sku.trim() ||
        !validIsoInstant(input.evaluatedAt) ||
        !validPositiveInteger(input.maxLineQuantity) ||
        input.maxLineQuantity > 100
      ) {
        return { ok: false, code: "cart_conflict" };
      }
      const quantity =
        input.kind === "add" ? input.quantityDelta : input.quantity;
      if (!validPositiveInteger(quantity) || quantity > input.maxLineQuantity) {
        return { ok: false, code: "quantity_invalid" };
      }
      try {
        const response = await database.rpc(
          "research_cart_mutate_with_activation_v1",
          {
            p_member_id: input.memberId,
            p_action: input.kind,
            p_sku: input.sku,
            p_quantity: quantity,
            p_purchase_mode:
              input.kind === "add" ? input.purchaseMode : null,
            p_subscription_frequency_days:
              input.kind === "add"
                ? input.subscriptionFrequencyDays ?? null
                : null,
            p_evaluated_at: input.evaluatedAt,
            p_max_line_quantity: input.maxLineQuantity,
          },
        );
        if (response.error) return rpcDenial(response.error);
        return parseRpcResult(response.data);
      } catch {
        return { ok: false, code: "authority_unavailable" };
      }
    },
  };
}

/**
 * Exact opt-in predicate shared by cart mutation and checkout composition.
 * Missing database configuration, a truthy-looking but non-exact switch, or a
 * digest mismatch all fail closed.
 */
export function activationCartCommandCapabilityIsAttested(
  env: NodeJS.ProcessEnv,
): boolean {
  return Boolean(
    env.RESEARCH_ACTIVATION_CART_COMMAND_ENABLED === "true" &&
      env.RESEARCH_ACTIVATION_CART_COMMAND_ATTESTATION ===
        ACTIVATION_CART_COMMAND_CAPABILITY_ATTESTATION &&
      env.SUPABASE_URL &&
      env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Production resolver; no partial or implicit enablement exists. */
export function resolveActivationBoundCartCommandStore(
  env: NodeJS.ProcessEnv = process.env,
  database?: ActivationCartCommandDatabase,
): ActivationBoundCartCommandStore {
  if (!activationCartCommandCapabilityIsAttested(env)) {
    return unavailableActivationBoundCartCommandStore;
  }
  try {
    return createSupabaseActivationBoundCartCommandStore(
      database ?? getSupabaseAdmin(),
    );
  } catch {
    return unavailableActivationBoundCartCommandStore;
  }
}
