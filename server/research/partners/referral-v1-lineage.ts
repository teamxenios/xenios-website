import { z } from "zod";
import { assistedOrderStatuses } from "../../../shared/research/assisted-order/contract";
import { ORDER_STATES } from "../../../shared/research/commerce";
import type { ReferralLifecycle, ReferralLifecycleBinding } from "../../../shared/research/referral-v1";

/** Read-only operator projection; never conversion, commission, or payment authority. */
export const REFERRAL_LINEAGE_MAX_BINDINGS = 100;
export const REFERRAL_LINEAGE_ROWS_PER_SOURCE = 100;
export const REFERRAL_LINEAGE_RPC = "research_partner_referral_v1_lineage";

/** No direct table access: canonical request tables deliberately have no grants. */
export interface ReferralV1LineageClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

type Lineage = ReferralLifecycle["lineage"];
const unavailable = (): Lineage => ({ state: "unavailable", records: [] });
const uuid = z.string().uuid();
const accountKey = z.string().regex(/^auth:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const timestamp = z.string().datetime({ offset: true }).refine((value) =>
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value),
);
const bindingSchema = z.object({
  accountKey, partnerId: uuid, linkId: uuid, touchId: uuid, boundAt: timestamp,
});
const recordSchema = z.object({
  accountKey, type: z.enum(["request", "order"]), reference: z.string(),
  state: z.string(), occurredAt: timestamp, boundAt: timestamp,
  attribution: z.literal("account_binding_only"),
});
const responseSchema = z.object({
  state: z.enum(["available", "unavailable"]),
  records: z.array(recordSchema).max(REFERRAL_LINEAGE_MAX_BINDINGS * REFERRAL_LINEAGE_ROWS_PER_SOURCE * 2),
});

// Preserve PostgreSQL microseconds: millisecond rounding could admit pre-bind rows.
function instant(value: string): bigint {
  const match = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value)!;
  return BigInt(Date.parse(match[1] + match[3])) * 1000n
    + BigInt((match[2] ?? "").padEnd(6, "0"));
}

/**
 * Caller must already be canonically admin-authorized. Only stored auth: UUID
 * account keys enter the RPC; the database derives binding time and exact member
 * ownership. Caller-supplied boundAt is never query authority. The reviewed
 * definer performs per-account source caps and emits unavailable on source drift.
 * No email, early-access session, financial, clinical, or request-attribution join.
 */
export async function readReferralV1Lineage(
  bindings: readonly ReferralLifecycleBinding[],
  client: ReferralV1LineageClient | null,
): Promise<Lineage> {
  if (!client) return unavailable();
  try {
    const parsed = z.array(bindingSchema).max(REFERRAL_LINEAGE_MAX_BINDINGS).parse(bindings);
    const keys = new Set(parsed.map(binding => binding.accountKey));
    if (keys.size !== parsed.length) return unavailable();
    const result = await client.rpc(REFERRAL_LINEAGE_RPC, {
      p_account_keys: [...keys], p_limit: REFERRAL_LINEAGE_ROWS_PER_SOURCE,
    });
    if (!result || result.error) return unavailable();
    const response = responseSchema.parse(result.data);
    if (response.state !== "available") return unavailable();
    const records: Lineage["records"] = [];
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    const boundTimes = new Map<string, bigint>();
    for (const row of response.records) {
      if (!keys.has(row.accountKey) || instant(row.occurredAt) < instant(row.boundAt)) return unavailable();
      const bound = instant(row.boundAt);
      if (boundTimes.has(row.accountKey) && boundTimes.get(row.accountKey) !== bound) return unavailable();
      boundTimes.set(row.accountKey, bound);
      const validReference = row.type === "request"
        ? /^XRR-\d{8}-[A-F0-9]{10}$/.test(row.reference)
        : uuid.safeParse(row.reference).success;
      const validState = (row.type === "request" ? assistedOrderStatuses : ORDER_STATES)
        .includes(row.state as never);
      if (!validReference || !validState) return unavailable();
      const identity = row.type + ":" + row.reference.toLowerCase();
      if (seen.has(identity)) return unavailable();
      seen.add(identity);
      const countKey = row.accountKey + ":" + row.type;
      const count = (counts.get(countKey) ?? 0) + 1;
      if (count > REFERRAL_LINEAGE_ROWS_PER_SOURCE) return unavailable();
      counts.set(countKey, count);
      // Explicit allowlist strips the internal DB timestamp and any unexpected data.
      records.push({
        accountKey: row.accountKey, type: row.type, reference: row.reference,
        state: row.state, occurredAt: row.occurredAt, attribution: "account_binding_only",
      });
    }
    records.sort((a, b) => {
      const left = instant(a.occurredAt), right = instant(b.occurredAt);
      return left === right ? (a.type + ":" + a.reference).localeCompare(b.type + ":" + b.reference)
        : left > right ? -1 : 1;
    });
    return { state: "available", records };
  } catch {
    // Provider/parse errors may contain private query data; never echo them.
    return unavailable();
  }
}
