import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_NOTICE_BEFORE_START,
  CUSTOMER_NOTICE_BIND_RPC,
  CUSTOMER_NOTICE_DELIVERY_RPC,
  CUSTOMER_NOTICE_HELP_URL,
  CUSTOMER_NOTICE_REFUSED,
  CUSTOMER_NOTICE_SEND_LIMIT_MS,
  CUSTOMER_NOTICE_TEMPLATES,
  CUSTOMER_NOTICE_UNCONFIRMED,
  type CustomerNoticeKind,
  type CustomerNoticeDeliveryReader,
  type CustomerNoticeBinder,
  customerNoticeDigest,
  renderCustomerNotice,
  requestCustomerNoticeConfig,
  sendRequestCustomerNotice,
} from "./customer-notice";

const send = vi.hoisted(() => vi.fn());
vi.mock("../../../services/email", () => ({
  getResendClient: async () => ({ client: { emails: { send } }, fromEmail: "Xenios <site@example.invalid>" }),
}));
const rpc = vi.hoisted(() => vi.fn());
// Only the default reader reaches the database client; other tests pass their own reader.
vi.mock("../../../supabase", () => ({ getSupabaseAdmin: () => ({ rpc }) }));

const env = { RESEND_API_KEY: "synthetic-test-only" };
const sender = { from: "Xenios Research <research@example.invalid>" };
const config = { since: "2026-11-18T02:00:00Z", environment: "ea-staging" };
const eventAt = "2026-11-18T02:30:00+00:00";
const recordedAt = "2026-11-18T02:30:01+00:00";
const soon = new Date("2026-11-18T02:31:00Z");

function ids(n: 1 | 2) {
  const eventId = `40000000-0000-4000-8000-00000000000${n}`;
  const requestId = `30000000-0000-4000-8000-00000000000${n}`;
  return { key: "ea-request-customer-" + eventId, reference: "XRI-" + requestId.replace(/-/g, "").toUpperCase() };
}
function job(n: 1 | 2, kind: CustomerNoticeKind = "request_received_queued", overrides: Record<string, unknown> = {}) {
  const { key, reference } = ids(n);
  const template = CUSTOMER_NOTICE_TEMPLATES[kind];
  return {
    event_key: key, event_type: template, template_key: template, recipient: "customer:" + reference,
    created_at: recordedAt, last_attempt_at: null,
    payload: { reference, eventAt, kind, revision: kind === "request_reviewing" ? 2 : 1, environment: "ea-staging" },
    ...overrides,
  };
}
const facts = (address: unknown = "avery@example.invalid", superseded = false) => vi.fn(async () => ({ address, superseded }));
// The database keeps the first digest bound. A first attempt gets its own digest back.
const firstAttempt = () => vi.fn(async (_key: string, digest: string): Promise<unknown> => digest);
const run = (queued: ReturnType<typeof job>, read: CustomerNoticeDeliveryReader = facts(), now = soon, settings = config, bind: CustomerNoticeBinder = firstAttempt()) =>
  sendRequestCustomerNotice(queued, sender, settings, env, read, now, bind);

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ data: { id: "provider-1" }, error: null });
  rpc.mockReset();
});

describe("customer notice settings", () => {
  const on = {
    EA_REQUEST_CUSTOMER_NOTICE_ENABLED: "true", EA_REQUEST_CUSTOMER_NOTICE_START_AT: "2026-11-18T02:00:00Z",
    RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT: "ea-staging",
  };
  it("is off unless the switch, the start time and the workflow environment are all set", () => {
    expect(requestCustomerNoticeConfig({})).toBeNull();
    for (const missing of Object.keys(on)) {
      expect(requestCustomerNoticeConfig({ ...on, [missing]: undefined })).toBeNull();
    }
    expect(requestCustomerNoticeConfig({ ...on, EA_REQUEST_CUSTOMER_NOTICE_ENABLED: "TRUE" })).toBeNull();
    expect(requestCustomerNoticeConfig({ ...on, EA_REQUEST_CUSTOMER_NOTICE_START_AT: "yesterday" })).toBeNull();
    expect(requestCustomerNoticeConfig({ ...on, RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT: "Production!" })).toBeNull();
    expect(requestCustomerNoticeConfig(on)).toEqual(config);
  });
});

describe("customer notice bodies", () => {
  const { reference } = ids(1);
  const received = renderCustomerNotice("request_received_queued", reference, eventAt);
  const reviewing = renderCustomerNotice("request_reviewing", reference, eventAt);
  const keep = "Keep this reference. The team will contact you at the address you supplied when there is an update or if more information is needed.";
  const faq = "https://xeniostechnology.com/research/faq";
  const help = "Questions about Early Access: " + faq;
  const anchor = `<a href="${faq}" style="color:#111">${faq}</a>`;

  it("renders the received-and-queued notice exactly", () => {
    expect(received.subject).toBe("Your request is in the review queue · " + reference);
    expect(received.text).toBe([
      "Received and added to the review queue",
      `Request ${reference} was received and added to our review queue at Nov 17, 2026, 8:30 PM Central.`,
      "Request received. Our team will reply within 24 hours.",
      "The 24-hour reply window ends at Nov 18, 2026, 8:30 PM Central, measured from the received time above. This automatic receipt is separate from the team's reply.",
      keep,
      "You do not need to submit again.",
      "This is a request receipt. It is not a purchase, prescription or shipment confirmation.",
      help,
    ].join("\n\n"));
  });

  it("renders the review-started notice exactly", () => {
    expect(reviewing.subject).toBe("Your request is being reviewed · " + reference);
    expect(reviewing.text).toBe([
      "Review has started",
      `The team started reviewing request ${reference} at Nov 17, 2026, 8:30 PM Central.`,
      keep,
      "You do not need to submit again.",
      help,
    ].join("\n\n"));
  });

  it("preserves the complete legacy received rendering for already-bound events", () => {
    const legacy = renderCustomerNotice("request_received_queued", reference, eventAt, "legacy_v1");
    expect(legacy.text).toBe([
      "Received and added to the review queue",
      `Request ${reference} was received and added to our review queue at Nov 17, 2026, 8:30 PM Central.`,
      keep, "You do not need to submit again.",
      "This is a request receipt. It is not a purchase, prescription or shipment confirmation.", help,
    ].join("\n\n"));
    expect(legacy.html).not.toContain("within 24 hours");
    expect(renderCustomerNotice("request_reviewing", reference, eventAt, "legacy_v1")).toEqual(reviewing);
    expect(reviewing.text + reviewing.html).not.toContain("within 24 hours");
  });

  it("says each milestone only in its own notice", () => {
    expect(received.text + received.html).not.toMatch(/started reviewing/);
    expect(reviewing.text + reviewing.html).not.toMatch(/review queue/);
  });

  it("gives the HTML part the same sentences as the text part, and one link, to the FAQ", () => {
    expect(CUSTOMER_NOTICE_HELP_URL).toBe(faq);
    for (const rendered of [received, reviewing]) {
      const paragraphs = rendered.text.split("\n\n");
      expect(paragraphs.at(-1)).toBe(help);
      for (const paragraph of paragraphs.slice(0, -1)) expect(rendered.html).toContain(paragraph);
      expect(rendered.html).toContain(`<p style="margin:0 0 14px;line-height:1.5">Questions about Early Access: ${anchor}</p>`);
      expect(rendered.html.match(/<a\b/gi)).toHaveLength(1);
      expect(rendered.html).not.toMatch(/<img\b|<script\b/i);
    }
  });

  it("carries no other link, no address, reply invitation, price, order or approval wording", () => {
    for (const body of [received.subject, received.text, received.html, reviewing.subject, reviewing.text, reviewing.html]) {
      // The FAQ is the only URL. Remove its exact anchor and text; nothing link-like may remain.
      expect(body.split(anchor).join("").split(faq).join("")).not.toMatch(/https?:|href=|www\.|mailto:|@|xeniostechnology|<a\b/i);
      expect(body).not.toMatch(/reply to this|\$|order confirmed|approved|shipped|tracking|status page|monitored|reply-to/i);
    }
    expect(received.subject + reviewing.subject).not.toContain(faq);
  });

  it("is identical on every render, so a retry sends the same message under the same key", () => {
    expect(renderCustomerNotice("request_received_queued", reference, eventAt)).toEqual(received);
    expect(renderCustomerNotice("request_reviewing", reference, eventAt)).toEqual(reviewing);
  });
});

describe("sending a customer notice", () => {
  it("sends once to the address read for that event, under the event's own key, with no Reply-To", async () => {
    const read = facts();
    expect(await run(job(1), read)).toEqual({ ok: true, providerId: "provider-1" });
    expect(read).toHaveBeenCalledWith(ids(1).key);
    expect(send).toHaveBeenCalledTimes(1);
    const [message, options] = send.mock.calls[0];
    expect(message).toEqual({
      from: sender.from, to: "avery@example.invalid",
      ...renderCustomerNotice("request_received_queued", ids(1).reference, eventAt),
    });
    expect(options).toEqual({ idempotencyKey: ids(1).key });
  });

  it("sends the review-started notice from its own template", async () => {
    expect((await run(job(1, "request_reviewing"))).ok).toBe(true);
    expect(send.mock.calls[0][0].subject).toBe("Your request is being reviewed · " + ids(1).reference);
    expect(send.mock.calls[0][0].text).toContain("The team started reviewing request");
  });

  it("keeps two events apart: each address under its own key and reference", async () => {
    const read = vi.fn(async (key: string) =>
      ({ address: key === ids(1).key ? "avery@example.invalid" : "jordan@example.invalid", superseded: false }));
    await Promise.all([run(job(1), read), run(job(2), read)]);
    const sent = send.mock.calls.map(([message, options]) => [message.to, options.idempotencyKey,
      message.text.includes(ids(1).reference), message.text.includes(ids(2).reference)]);
    expect(sent).toHaveLength(2);
    expect(sent).toContainEqual(["avery@example.invalid", ids(1).key, true, false]);
    expect(sent).toContainEqual(["jordan@example.invalid", ids(2).key, false, true]);
  });

  it("the default reader and binder ask the backend-only functions for this event alone", async () => {
    rpc.mockImplementation(async (name: string, args: { p_digest?: string }) => name === CUSTOMER_NOTICE_BIND_RPC
      ? { data: args.p_digest, error: null }
      : { data: { address: "avery@example.invalid", superseded: false }, error: null });
    expect((await sendRequestCustomerNotice(job(1), sender, config, env, undefined, soon)).ok).toBe(true);
    const message = { from: sender.from, to: "avery@example.invalid", ...renderCustomerNotice("request_received_queued", ids(1).reference, eventAt) };
    expect(rpc.mock.calls).toEqual([
      [CUSTOMER_NOTICE_DELIVERY_RPC, { p_event_key: ids(1).key }],
      [CUSTOMER_NOTICE_BIND_RPC, { p_event_key: ids(1).key, p_digest: customerNoticeDigest(message, ids(1).key) }],
    ]);
    expect(send.mock.calls[0][0].to).toBe("avery@example.invalid");
  });

  it("binds a digest of the exact message before anything reaches the provider", async () => {
    const order: string[] = [];
    const bind = vi.fn(async (_key: string, digest: string): Promise<unknown> => { order.push("bind"); return digest; });
    send.mockImplementation(async () => { order.push("send"); return { data: { id: "provider-1" }, error: null }; });
    expect((await run(job(1), facts(), soon, config, bind)).ok).toBe(true);
    expect(order).toEqual(["bind", "send"]);
    const [message, options] = send.mock.calls[0];
    expect(bind).toHaveBeenCalledWith(ids(1).key, customerNoticeDigest(message, options.idempotencyKey));
    expect(bind.mock.calls[0][1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the digest changes with the sender, the recipient, the subject, either body or the key", () => {
    const message = { from: sender.from, to: "avery@example.invalid", ...renderCustomerNotice("request_received_queued", ids(1).reference, eventAt) };
    const base = customerNoticeDigest(message, ids(1).key);
    expect(customerNoticeDigest({ ...message }, ids(1).key)).toBe(base);
    const variants = [
      customerNoticeDigest({ ...message, from: "Other <other@example.invalid>" }, ids(1).key),
      customerNoticeDigest({ ...message, to: "jordan@example.invalid" }, ids(1).key),
      customerNoticeDigest({ ...message, subject: message.subject + "." }, ids(1).key),
      customerNoticeDigest({ ...message, text: message.text + "." }, ids(1).key),
      customerNoticeDigest({ ...message, html: message.html + " " }, ids(1).key),
      customerNoticeDigest(message, ids(2).key),
    ];
    expect(new Set([base, ...variants]).size).toBe(7);
  });

  it("holds a retry whose message differs from the one first attempted, and sends nothing", async () => {
    // An earlier deployment bound another digest: other wording, another sender, or another address.
    const earlier = vi.fn(async (): Promise<unknown> => "f".repeat(64));
    expect(await run(job(1, "request_received_queued", { last_attempt_at: recordedAt }), facts(), soon, config, earlier)).toEqual({
      ok: false, providerId: null, nonRetryable: true,
      error: "Not resent: this message differs from the one first attempted. Reconcile with the provider before any resend.",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([false, true])("uses the original legacy bytes whenever the persisted digest selects them (tried=%s)", async (tried) => {
    const queued = job(1, "request_received_queued", { last_attempt_at: tried ? recordedAt : null });
    const legacy = { from: sender.from, to: "avery@example.invalid", ...renderCustomerNotice("request_received_queued", ids(1).reference, eventAt, "legacy_v1") };
    const bound = customerNoticeDigest(legacy, ids(1).key);
    const bind = vi.fn(async (): Promise<unknown> => bound);
    expect(await run(queued, facts(), soon, config, bind)).toEqual({ ok: true, providerId: "provider-1" });
    expect(bind).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledExactlyOnceWith(legacy, { idempotencyKey: ids(1).key });
  });

  it("retains the new promise and its original due time on a late retry with a bound v2 digest", async () => {
    const message = { from: sender.from, to: "avery@example.invalid", ...renderCustomerNotice("request_received_queued", ids(1).reference, eventAt) };
    const bind = vi.fn(async (): Promise<unknown> => customerNoticeDigest(message, ids(1).key));
    const hour23 = new Date(Date.parse(recordedAt) + 23 * 60 * 60 * 1000);
    expect((await run(job(1, "request_received_queued", { last_attempt_at: recordedAt }), facts(), hour23, config, bind)).ok).toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith(message, { idempotencyKey: ids(1).key });
    expect(message.text).toContain("Nov 18, 2026, 8:30 PM Central");
    expect(CUSTOMER_NOTICE_SEND_LIMIT_MS).toBe(23 * 60 * 60 * 1000);
  });

  it("retries without sending when the binding cannot be written, and holds when there is nothing to bind to", async () => {
    const failing = vi.fn(async (): Promise<unknown> => { throw new Error("connection reset"); });
    expect(await run(job(1), facts(), soon, config, failing)).toEqual({
      ok: false, providerId: null, error: "Customer notice binding was unavailable.",
    });
    rpc.mockImplementation(async (name: string) => name === CUSTOMER_NOTICE_BIND_RPC
      ? { data: null, error: { code: "57014" } }
      : { data: { address: "avery@example.invalid", superseded: false }, error: null });
    expect(await sendRequestCustomerNotice(job(1), sender, config, env, undefined, soon)).toEqual({
      ok: false, providerId: null, error: "Customer notice binding was unavailable.",
    });
    expect(await run(job(1), facts(), soon, config, vi.fn(async (): Promise<unknown> => null))).toEqual({
      ok: false, providerId: null, nonRetryable: true, error: "Not sent: no saved request for this notice.",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a job whose key, template, marker, time or payload do not belong together, without reading an address", async () => {
    const read = facts();
    const good = job(1);
    const wrong = [
      job(1, "request_received_queued", { recipient: "avery@example.invalid" }),
      job(1, "request_received_queued", { recipient: "customer:" + ids(2).reference }),
      job(1, "request_received_queued", { payload: { ...good.payload, email: "avery@example.invalid" } }),
      job(1, "request_received_queued", { payload: { ...good.payload, kind: "request_closed" } }),
      // The template must be the one for the payload's kind.
      job(1, "request_received_queued", { payload: { ...good.payload, kind: "request_reviewing" } }),
      job(1, "request_received_queued", { template_key: CUSTOMER_NOTICE_TEMPLATES.request_reviewing }),
      job(1, "request_received_queued", { event_type: "ea_request_submitted_staff_v1", template_key: "ea_request_submitted_staff_v1" }),
      job(1, "request_received_queued", { event_key: "ea-request-submitted-40000000-0000-4000-8000-000000000001" }),
      job(1, "request_received_queued", { created_at: undefined }),
      job(1, "request_received_queued", { created_at: "not a time" }),
    ];
    for (const bad of wrong) {
      expect(await run(bad as ReturnType<typeof job>, read)).toEqual({
        ok: false, providerId: null, nonRetryable: true, error: "Invalid customer notice binding.",
      });
    }
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("holds a notice recorded for another environment", async () => {
    const read = facts();
    const result = await run(job(1), read, soon, { ...config, environment: "ea-production" });
    expect(result).toEqual({ ok: false, providerId: null, nonRetryable: true, error: "Not sent: recorded for another environment." });
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("cancels, without an alert, a notice recorded before the sender's start time", async () => {
    const read = facts();
    const later = { ...config, since: "2026-11-18T03:00:00Z" };
    expect(await run(job(1), read, new Date("2026-11-18T03:05:00Z"), later)).toEqual({
      ok: false, providerId: null, cancel: true, error: CUSTOMER_NOTICE_BEFORE_START,
    });
    // One that was tried earlier is held for staff instead, because it may have been delivered.
    const tried = job(1, "request_received_queued", { last_attempt_at: "2026-11-18T02:31:00+00:00" });
    expect(await run(tried, read, new Date("2026-11-18T03:05:00Z"), later)).toMatchObject({ ok: false, nonRetryable: true });
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends nothing more than 23 hours after the notice was recorded, tried before or not", async () => {
    const read = facts();
    const late = new Date(Date.parse(recordedAt) + CUSTOMER_NOTICE_SEND_LIMIT_MS + 1);
    const untried = await run(job(1), read, late);
    expect(untried).toMatchObject({ ok: false, nonRetryable: true });
    expect(untried.error).toMatch(/^Not sent: recorded more than 23 hours ago/);
    const retried = await run(job(1, "request_received_queued", { last_attempt_at: recordedAt }), read, late);
    expect(retried).toMatchObject({ ok: false, nonRetryable: true });
    expect(retried.error).toMatch(/^Not resent: .*24-hour duplicate check/);
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    const inTime = new Date(Date.parse(recordedAt) + CUSTOMER_NOTICE_SEND_LIMIT_MS);
    expect((await run(job(1), read, inTime)).ok).toBe(true);
  });

  it("does not send a notice that a later event has replaced", async () => {
    // Never tried: cancelled quietly, because the later notice tells the customer the current state.
    expect(await run(job(1), facts("avery@example.invalid", true))).toEqual({
      ok: false, providerId: null, cancel: true, error: "Not sent: a later update replaced this one.",
    });
    // Tried before: not retried, and held so staff can check the provider.
    const tried = job(1, "request_received_queued", { last_attempt_at: recordedAt });
    expect(await run(tried, facts("avery@example.invalid", true))).toEqual({
      ok: false, providerId: null, nonRetryable: true,
      error: "Not resent: a later update replaced this one after an earlier attempt.",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("holds the job for staff when there is no saved request or its address cannot be used", async () => {
    for (const value of [null, undefined]) {
      expect(await run(job(1), vi.fn(async () => value))).toEqual({
        ok: false, providerId: null, nonRetryable: true, error: "Not sent: no saved request for this notice.",
      });
    }
    for (const value of [null, "Avery <avery@example.invalid>", "avery@example.invalid\nbcc: other@example.invalid",
      "avery@example.invalid,other@example.invalid", "AVERY@example.invalid", "avery"]) {
      const result = await run(job(1), facts(value));
      expect(result).toEqual({
        ok: false, providerId: null, nonRetryable: true, error: "Not sent: the saved contact address cannot be used for email.",
      });
      // The refusal names no address.
      expect(JSON.stringify(result)).not.toContain("example.invalid");
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("retries, sending nothing, when the delivery read fails, answers in another shape, or mail is not set up", async () => {
    const unavailable = { ok: false, providerId: null, error: "Customer notice delivery facts were unavailable." };
    expect(await run(job(1), vi.fn(async () => { throw new Error("connection reset: avery@example.invalid"); }))).toEqual(unavailable);
    expect(await run(job(1), vi.fn(async () => "avery@example.invalid"))).toEqual(unavailable);
    expect(await run(job(1), vi.fn(async () => ({ address: "avery@example.invalid", superseded: false, name: "Avery" })))).toEqual(unavailable);
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await sendRequestCustomerNotice(job(1), sender, config, env, undefined, soon)).toEqual(unavailable);
    const read = facts();
    expect(await sendRequestCustomerNotice(job(1), sender, config, {}, read, soon)).toEqual({
      ok: false, providerId: null, error: "Customer notice email is unconfigured.",
    });
    expect(await sendRequestCustomerNotice(job(1), { from: " " }, config, env, read, soon)).toEqual({
      ok: false, providerId: null, error: "Customer notice sender is unconfigured.",
    });
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("tells a provider refusal from a send with no confirmed result, and repeats neither with new content", async () => {
    const read = facts();
    send.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "avery@example.invalid is suppressed" } });
    expect(await run(job(1), read)).toEqual({ ok: false, providerId: null, error: CUSTOMER_NOTICE_REFUSED });
    send.mockResolvedValueOnce({ data: null, error: { name: "internal_server_error", message: "upstream" } });
    send.mockRejectedValueOnce(new Error("socket hang up"));
    send.mockResolvedValueOnce({ data: {}, error: null });
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await run(job(1), read)).toEqual({ ok: false, providerId: null, error: CUSTOMER_NOTICE_UNCONFIRMED });
    }
    // Every attempt used the same key and the same message, and no result carries the provider's text.
    expect(new Set(send.mock.calls.map(([message, options]) => JSON.stringify([message, options]))).size).toBe(1);
  });
});
