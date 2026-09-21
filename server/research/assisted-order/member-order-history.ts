import { z } from "zod";
import { assistedOrderStatuses, ASSISTED_ORDER_MAX_LINES } from "@shared/research/assisted-order/contract";
import type { AssistedOrderHistoryRequest } from "@shared/research/assisted-order/member-history";
import type { OrderHistorySourceKey, OrderSourceStateDto } from "@shared/research/customer-account/contract";
import type { CommerceOrdersSource } from "../customer-account/orders-projection";

export const ASSISTED_MEMBER_HISTORY_RPC = "research_assisted_order_member_history";
export const ASSISTED_MEMBER_HISTORY_LIMIT = 100;
const unavailable = Object.freeze({ connected: false, complete: false });
const unavailableRead = () => ({ requests: [] as AssistedOrderHistoryRequest[], source: unavailable });
const uuid = z.string().uuid();
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const text = z.string().min(1).max(500).refine((value) => value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value));
const timestamp = z.string().max(64).refine((value) => /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value)));
const requestSchema = z.object({
  actorMemberId: uuid,
  kind: z.literal("assisted_request"),
  requestId: uuid,
  publicReference: z.string().regex(/^XRR-\d{8}-[0-9A-F]{10}$/u),
  status: z.enum(assistedOrderStatuses),
  createdAt: timestamp,
  updatedAt: timestamp,
  estimatedTotalCents: cents,
  currency: z.literal("USD"),
  lines: z.array(z.object({
    productName: text,
    specification: text.nullable(),
    quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    lineEstimateCents: cents,
  }).strict()).min(1).max(ASSISTED_ORDER_MAX_LINES),
  trackingReference: text.nullable(),
}).strict();
const envelopeSchema = z.object({
  schemaVersion: z.literal("assisted_member_history_v1"),
  memberId: uuid,
  complete: z.boolean(),
  requests: z.array(requestSchema).max(ASSISTED_MEMBER_HISTORY_LIMIT),
}).strict();

export type AssistedMemberHistoryReader = Readonly<{
  readForMember(memberId: string): Promise<Readonly<{
    requests: AssistedOrderHistoryRequest[];
    source: OrderSourceStateDto;
  }>>;
}>;
export type AssistedMemberHistoryRpc = Readonly<{
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}>;

/** Service-role RPC only; identity comes exclusively from the existing member guard. */
export function createAssistedMemberHistoryReader(rpc: AssistedMemberHistoryRpc | null): AssistedMemberHistoryReader {
  return {
    async readForMember(memberId) {
      if (rpc === null || !uuid.safeParse(memberId).success) return unavailableRead();
      try {
        const result = await rpc.rpc(ASSISTED_MEMBER_HISTORY_RPC, { p_member_id: memberId });
        if (result.error) return unavailableRead();
        const parsed = envelopeSchema.safeParse(result.data);
        if (!parsed.success || parsed.data.memberId !== memberId) return unavailableRead();
        const { requests, complete } = parsed.data;
        // Every row carries ownership proof in the server-only envelope. A mixed,
        // duplicate, truncated or malformed projection cannot become a complete read.
        if (requests.some((row) => row.actorMemberId !== memberId)
          || new Set(requests.map((row) => row.requestId)).size !== requests.length
          || new Set(requests.map((row) => row.publicReference)).size !== requests.length
          || (!complete && requests.length !== ASSISTED_MEMBER_HISTORY_LIMIT)) return unavailableRead();
        return {
          requests: requests.map(({ actorMemberId: _owner, ...request }) => request),
          source: { connected: true, complete },
        };
      } catch {
        // Missing candidate RPC, denied privileges and malformed reads are all
        // absence of a verified source, not proof that no request exists.
        return unavailableRead();
      }
    },
  };
}

/** Decorates the SAME member history. Request records never enter the paid-order DTO. */
export function withAssistedOrderRequestHistory<T extends CommerceOrdersSource>(base: T, reader: AssistedMemberHistoryReader) {
  const baseSources = base.historySources ?? Object.freeze({
    commerce: unavailable, xea: unavailable, xec: unavailable, xrr: unavailable,
  });
  return {
    ...base,
    // Static metadata never claims a successful RPC installation or full read.
    historySources: { ...baseSources, xrr: unavailable },
    listForMember: (memberId: string) => base.listForMember(memberId),
    getForMember: (memberId: string, orderId: string) => base.getForMember(memberId, orderId),
    async listForMemberWithHistory(memberId: string) {
      const [orders, assisted] = await Promise.all([
        base.listForMemberWithHistory
          ? base.listForMemberWithHistory(memberId)
          : base.listForMember(memberId).then((rows) => ({ rows, historySources: baseSources })),
        reader.readForMember(memberId),
      ]);
      return {
        rows: orders.rows,
        requests: assisted.requests,
        historySources: { ...orders.historySources, xrr: assisted.source } as Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>,
      };
    },
  };
}
