// A minimal in-test model of Stripe's PaymentIntents API for the durable
// purchasing units: payment intents keyed by id, REQUEST IDEMPOTENCY by key
// (same key + same body => the original response; same key + other body =>
// idempotency_error), manual capture, cancel, and scripted faults. It exists so
// the REAL StripePaymentAdapter can be driven end to end without a network.
// Never imported by application code; the fake key strings match no Stripe
// format and never leave the transport.
import { StripePaymentAdapter, type StripeRequest } from "../providers/payment";

export const FAKE_SECRET_KEY = "sk_fake_unit_test_only";
export const FAKE_WEBHOOK_SECRET = "whsec_fake_unit_test_only";

export type ModelIntent = {
  id: string;
  status: string;
  amount: number;
  amount_capturable: number;
  amount_received: number;
  currency: string;
  metadata: { orderId: string; memberId: string };
  client_secret?: string;
};

export function stripeModel(options: { requiresAction?: boolean; now?: () => number } = {}) {
  const intents = new Map<string, ModelIntent>();
  const byKey = new Map<string, { body: string; response: { status: number; body: unknown } }>();
  const requests: StripeRequest[] = [];
  /** `lostResponses` drops the response of the next WRITE after its effect happened: the dangerous case. */
  const faults = { lostResponses: 0, serverErrors: 0, rateLimits: 0 };
  let counter = 0;
  const transport = async (request: StripeRequest) => {
    requests.push(request);
    if (faults.serverErrors > 0) {
      faults.serverErrors -= 1;
      return { status: 500, body: { error: { type: "api_error", message: "boom" } } };
    }
    if (faults.rateLimits > 0) {
      faults.rateLimits -= 1;
      return { status: 429, body: { error: { type: "rate_limit_error", message: "slow down" } } };
    }
    const response = handle(request);
    if (faults.lostResponses > 0 && request.method === "POST") {
      faults.lostResponses -= 1;
      throw new Error("socket hang up after the provider processed the request");
    }
    return response;
  };
  function handle(request: StripeRequest): { status: number; body: unknown } {
    const form = request.form ?? {};
    const body = JSON.stringify([request.method, request.path, form]);
    if (request.method === "POST" && request.path === "/v1/payment_intents") {
      const key = request.idempotencyKey;
      if (!key) return { status: 400, body: { error: { type: "invalid_request_error", message: "missing key" } } };
      const seen = byKey.get(key);
      if (seen) {
        if (seen.body !== body) {
          return { status: 400, body: { error: { type: "idempotency_error", message: "Keys for idempotent requests can only be used with the same parameters." } } };
        }
        return seen.response;
      }
      const id = `pi_${String(++counter).padStart(4, "0")}`;
      const amount = Number(form.amount);
      const confirmed = form.confirm === "true";
      const status = !confirmed ? "requires_confirmation" : options.requiresAction ? "requires_action" : "requires_capture";
      const intent: ModelIntent = {
        id,
        status,
        amount,
        amount_capturable: status === "requires_capture" ? amount : 0,
        amount_received: 0,
        currency: form.currency ?? "usd",
        metadata: { orderId: form["metadata[orderId]"] ?? "", memberId: form["metadata[memberId]"] ?? "" },
        client_secret: `${id}_secret_fixture`,
      };
      intents.set(id, intent);
      const response = { status: 200, body: { ...intent } };
      byKey.set(key, { body, response });
      return response;
    }
    const get = /^\/v1\/payment_intents\/([^/?]+)(\?.*)?$/.exec(request.path);
    if (request.method === "GET" && get) {
      const intent = intents.get(decodeURIComponent(get[1]!));
      if (!intent) return { status: 404, body: { error: { type: "invalid_request_error", message: "No such payment_intent" } } };
      return { status: 200, body: { ...intent } };
    }
    const capture = /^\/v1\/payment_intents\/([^/]+)\/capture$/.exec(request.path);
    if (request.method === "POST" && capture) {
      const intent = intents.get(decodeURIComponent(capture[1]!));
      if (!intent) return { status: 404, body: { error: { type: "invalid_request_error", message: "No such payment_intent" } } };
      if (intent.status !== "requires_capture") {
        return { status: 400, body: { error: { type: "invalid_request_error", message: `This PaymentIntent could not be captured because it has a status of ${intent.status}.` } } };
      }
      const amount = Number(form.amount_to_capture ?? intent.amount_capturable);
      intent.status = "succeeded";
      intent.amount_received = amount;
      intent.amount_capturable = 0;
      return { status: 200, body: { ...intent } };
    }
    const cancel = /^\/v1\/payment_intents\/([^/]+)\/cancel$/.exec(request.path);
    if (request.method === "POST" && cancel) {
      const intent = intents.get(decodeURIComponent(cancel[1]!));
      if (!intent) return { status: 404, body: { error: { type: "invalid_request_error", message: "No such payment_intent" } } };
      if (intent.status === "succeeded") {
        return { status: 400, body: { error: { type: "invalid_request_error", message: "You cannot cancel this PaymentIntent because it has a status of succeeded." } } };
      }
      intent.status = "canceled";
      intent.amount_capturable = 0;
      return { status: 200, body: { ...intent } };
    }
    return { status: 400, body: { error: { type: "invalid_request_error", message: `unexpected ${request.method} ${request.path}` } } };
  }
  /** The customer completed 3DS: Stripe moves the intent to requires_capture. */
  const completeAction = (id: string) => {
    const intent = intents.get(id)!;
    intent.status = "requires_capture";
    intent.amount_capturable = intent.amount;
  };
  const adapter = new StripePaymentAdapter({ secretKey: FAKE_SECRET_KEY, webhookSecret: FAKE_WEBHOOK_SECRET, transport, now: options.now });
  const creates = () => requests.filter((r) => r.method === "POST" && r.path === "/v1/payment_intents");
  const captures = () => requests.filter((r) => r.method === "POST" && r.path.endsWith("/capture"));
  return { adapter, intents, requests, faults, completeAction, creates, captures };
}
