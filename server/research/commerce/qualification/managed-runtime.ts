/** Qualification-only primitives. No production activation, network defaults or side effects. */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { isCreditConsent, type CreditConsent } from "@shared/research/checkout-credit-policy";

export class QualificationBoundaryError extends Error {
  constructor(readonly code: string) { super(code); this.name = "QualificationBoundaryError"; }
}
export function fail(code: string): never { throw new QualificationBoundaryError(code); }
export const objectOf = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
export function requiredString(v: unknown, code: string): string {
  if (typeof v !== "string" || !v.trim()) return fail(code);
  return v;
}
export function cents(v: unknown, code = "amount_missing_or_invalid"): number {
  // PostgREST may serialize bigint as a decimal string. No exponent, sign or coercion of null.
  const n = typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) return fail(code);
  return n;
}
export function originOf(raw: string, loopbackOnly = false): string {
  let u: URL; try { u = new URL(raw); } catch { return fail("origin_invalid"); }
  const loopback = ["127.0.0.1", "[::1]"].includes(u.hostname);
  if ((u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) ||
      u.username || u.password || u.search || u.hash || u.pathname !== "/" ||
      (loopbackOnly && !loopback)) return fail("origin_not_allowed");
  return u.origin;
}
export function isEntrypoint(moduleUrl: string, argv1: string | undefined): boolean {
  return argv1 !== undefined && moduleUrl === pathToFileURL(argv1).href;
}

/** A synchronous fault hook can enqueue an async command; no following surface call overtakes it. */
export class FaultBarrier {
  private tail: Promise<void> = Promise.resolve();
  private failed = false;
  arm(effect: () => Promise<void>): void {
    // Attach the rejection handler immediately: no unhandled rejection and no hidden success.
    this.tail = this.tail.then(async () => {
      if (this.failed) return;
      try { await effect(); } catch { this.failed = true; }
    });
  }
  async ready(): Promise<void> {
    await this.tail;
    if (this.failed) fail("fault_control_failed");
  }
}

export interface WireHttpRequest {
  method: "GET" | "POST"; url: string; headers: Record<string, string>; body?: unknown; raw?: string;
}
export interface WireHttpResponse { status: number; headers: Record<string, string>; body: unknown }
export function createPinnedHttp(origin: string, options: {
  fetcher?: typeof fetch; timeoutMs?: number; maxBytes?: number;
} = {}) {
  const allowed = originOf(origin);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1) fail("transport_limits_invalid");
  return {
    async request(input: WireHttpRequest): Promise<WireHttpResponse> {
      let url: URL; try { url = new URL(input.url); } catch { return fail("request_url_invalid"); }
      if (url.origin !== allowed || url.username || url.password || url.hash) fail("request_origin_mismatch");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(url.href, {
          method: input.method, headers: input.headers, redirect: "manual", signal: controller.signal,
          body: input.raw !== undefined ? input.raw : input.body === undefined ? undefined : JSON.stringify(input.body),
        });
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel(); return fail("redirect_refused");
        }
        const reader = response.body?.getReader(); let count = 0; const chunks: Uint8Array[] = [];
        if (reader) {
          try {
            for (;;) {
              const r = await reader.read(); if (r.done) break;
              count += r.value.byteLength;
              if (count > maxBytes) { await reader.cancel(); return fail("response_too_large"); }
              chunks.push(r.value);
            }
          } finally { reader.releaseLock(); }
        }
        const text = Buffer.concat(chunks).toString("utf8");
        let body: unknown = null;
        if (text) { try { body = JSON.parse(text); } catch { return fail("response_not_json"); } }
        const headers: Record<string, string> = {};
        // Only nonsecret diagnostic headers cross the transport boundary.
        for (const key of ["content-type", "cache-control", "retry-after"]) {
          const value = response.headers.get(key); if (value) headers[key] = value;
        }
        return { status: response.status, headers, body };
      } catch (error) {
        if (error instanceof QualificationBoundaryError) throw error;
        return fail(controller.signal.aborted ? "request_timed_out" : "request_failed");
      } finally { clearTimeout(timer); }
    },
  };
}

export interface ApprovedCheckoutSeed {
  shippingAddress: { line1: string; line2?: string; city: string; state: string; postalCode: string; country: "US" };
  shippingService: "standard" | "expedited_2day" | "next_day" | "same_day" | "temperature_controlled";
  acceptedAgreementKeys: string[]; researchAttestation: boolean; applyStoreCreditCents: number;
  paymentMethodReference: string; expectedTotalCents: number; checkoutConsent: CreditConsent;
}
const SERVICES = ["standard", "expedited_2day", "next_day", "same_day", "temperature_controlled"] as const;
/** This is fixture consent, not invented order data. The operator supplies the exact approved fixture quote. */
export function readApprovedCheckoutSeed(raw: string | undefined): ApprovedCheckoutSeed {
  let value: unknown; try { value = JSON.parse(raw ?? ""); } catch { return fail("request_seed_missing_or_invalid"); }
  const r = objectOf(value); const a = objectOf(r?.shippingAddress);
  if (!r || !a || a.country !== "US" || typeof a.state !== "string" || !/^[A-Z]{2}$/.test(a.state) ||
      typeof a.postalCode !== "string" || !/^\d{5}(-\d{4})?$/.test(a.postalCode)) fail("request_seed_address_invalid");
  const address: ApprovedCheckoutSeed["shippingAddress"] = {
    line1: requiredString(a!.line1, "request_seed_address_invalid"), city: requiredString(a!.city, "request_seed_address_invalid"),
    state: a!.state as string, postalCode: a!.postalCode as string, country: "US",
  };
  if (a!.line2 !== undefined) address.line2 = requiredString(a!.line2, "request_seed_address_invalid");
  if (!SERVICES.includes(r!.shippingService as typeof SERVICES[number])) fail("request_seed_service_invalid");
  if (!Array.isArray(r!.acceptedAgreementKeys) || r!.acceptedAgreementKeys.length === 0 ||
      r!.acceptedAgreementKeys.some((k: unknown) => typeof k !== "string" || !k.trim()) ||
      new Set(r!.acceptedAgreementKeys).size !== r!.acceptedAgreementKeys.length) fail("request_seed_agreements_invalid");
  if (typeof r!.researchAttestation !== "boolean") fail("request_seed_attestation_missing");
  const method = requiredString(r!.paymentMethodReference, "request_seed_method_missing");
  if (!/^pm_[A-Za-z0-9_]+$/.test(method)) fail("request_seed_method_invalid");
  const total = cents(r!.expectedTotalCents, "request_seed_total_invalid");
  if (total === 0) fail("request_seed_total_invalid");
  const consent = r!.checkoutConsent;
  if (!isCreditConsent(consent)) fail("request_seed_consent_invalid");
  const credit = cents(r!.applyStoreCreditCents, "request_seed_credit_invalid");
  if (consent.totalCents !== total || consent.appliedCents !== credit) fail("request_seed_consent_mismatch");
  return {
    shippingAddress: address, shippingService: r!.shippingService as ApprovedCheckoutSeed["shippingService"],
    acceptedAgreementKeys: [...r!.acceptedAgreementKeys as string[]], researchAttestation: r!.researchAttestation as boolean,
    applyStoreCreditCents: credit,
    checkoutConsent: { ...consent },
    paymentMethodReference: method, expectedTotalCents: total,
  };
}
export function createApprovedRequestFactory(raw: string | undefined, runId: string = randomUUID()) {
  const seed = readApprovedCheckoutSeed(raw); let counter = 0;
  const run = createHash("sha256").update(runId).digest("hex").slice(0, 20);
  return (overrides: Partial<ApprovedCheckoutSeed & { idempotencyKey: string }> = {}) => ({
    ...seed, shippingAddress: { ...seed.shippingAddress }, acceptedAgreementKeys: [...seed.acceptedAgreementKeys],
    checkoutConsent: { ...seed.checkoutConsent },
    idempotencyKey: `qualify-${run}-${++counter}`, ...overrides,
  });
}

export interface ScenarioWebhook {
  eventId: string; eventType: string; providerReference: string; orderId: string; memberId: string; amountCents: number;
}
const EVENTS: Record<string, { type: string; status: string; captured: boolean; authorized: boolean }> = {
  "payment.authorized": { type: "payment_intent.amount_capturable_updated", status: "requires_capture", captured: false, authorized: true },
  "payment.captured": { type: "payment_intent.succeeded", status: "succeeded", captured: true, authorized: false },
  "payment.failed": { type: "payment_intent.payment_failed", status: "requires_payment_method", captured: false, authorized: false },
};
/** Same logical delivery keeps byte-identical payload; only the transport signature timestamp changes. */
export function createScenarioWebhookSigner(secret: string, runId: string, now = Date.now) {
  if (!/^whsec_[A-Za-z0-9]{4,}$/.test(secret)) fail("webhook_secret_invalid");
  const namespace = createHash("sha256").update(runId).digest("hex").slice(0, 16);
  const cache = new Map<string, { identity: string; raw: string }>();
  return (input: ScenarioWebhook) => {
    const mapping = EVENTS[input.eventType];
    if (!mapping || !/^pi_[A-Za-z0-9]+$/.test(input.providerReference) || !input.eventId || !input.memberId || !input.orderId) fail("webhook_fixture_invalid");
    const amount = cents(input.amountCents); if (!amount) fail("webhook_amount_invalid");
    const identity = JSON.stringify([input.eventType, input.providerReference, input.orderId, input.memberId, amount]);
    const existing = cache.get(input.eventId);
    if (existing && existing.identity !== identity) fail("webhook_event_id_reused");
    const time = Math.floor(now() / 1000);
    const raw = existing?.raw ?? JSON.stringify({
      id: `evt_qa_${namespace}_${createHash("sha256").update(input.eventId).digest("hex").slice(0, 16)}`,
      object: "event", type: mapping.type, livemode: false, created: time,
      data: { object: { id: input.providerReference, object: "payment_intent", livemode: false,
        currency: "usd", amount, capture_method: "manual", status: mapping.status,
        amount_received: mapping.captured ? amount : 0, amount_capturable: mapping.authorized ? amount : 0,
        metadata: { orderId: input.orderId, memberId: input.memberId },
      } },
    });
    if (!existing) cache.set(input.eventId, { identity, raw });
    const sig = createHmac("sha256", secret).update(`${time}.${raw}`).digest("hex");
    return { raw, signature: `t=${time},v1=${sig}`, evidenceClass: "harness_signed_through_mounted_route" as const };
  };
}
