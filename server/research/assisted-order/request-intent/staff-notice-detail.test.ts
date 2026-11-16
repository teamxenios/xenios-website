import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE,
  REQUEST_SUBMITTED_STAFF_TEMPLATE,
  STAFF_NOTICE_DETAIL_RPC,
  STAFF_NOTICE_RESEND_LIMIT_MS,
  mapStaffNoticeDetail,
  renderFullStaffNotice,
  requestSubmittedStaffNoticeConfig,
  sendRequestSubmittedStaffNotice,
} from "./staff-notice";

const send = vi.hoisted(() => vi.fn());
vi.mock("../../../services/email", () => ({
  getResendClient: async () => ({ client: { emails: { send } }, fromEmail: "Xenios <staff@example.invalid>" }),
}));
const rpc = vi.hoisted(() => vi.fn());
// Only the default reader reaches the database client; other tests pass their own reader.
vi.mock("../../../supabase", () => ({ getSupabaseAdmin: () => ({ rpc }) }));

const env = {
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED: "true",
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS: "team@example.invalid,samuel@example.invalid",
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT: "2026-11-15T20:00:00Z",
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL: "full",
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL_START_AT: "2026-11-15T22:00:00Z",
  SITE_URL: "https://staff.example.invalid",
  RESEND_API_KEY: "synthetic-test-only",
};
const config = requestSubmittedStaffNoticeConfig(env)!;
const recipients = ["team@example.invalid", "samuel@example.invalid"];

function ids(n: 1 | 2) {
  const id = `20000000-0000-4000-8000-00000000000${n}`;
  return { key: "ea-request-submitted-" + id, reference: "XRI-" + id.replace(/-/g, "").toUpperCase() };
}
function job(n: 1 | 2, template = REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE, itemCount = 2) {
  const { key, reference } = ids(n);
  return {
    event_key: key, event_type: template, template_key: template, recipient: recipients[0],
    payload: { reference, submittedAt: "2026-11-15T23:10:00+00:00", itemCount, recipients },
  };
}
const shipping = {
  line1: "100 Fictional Way", line2: "Suite 4", city: "Austin", region: "TX", postalCode: "78701", countryCode: "US",
};
function detail(n: 1 | 2, overrides: Record<string, unknown> = {}) {
  return {
    reference: ids(n).reference,
    submittedAt: "2026-11-15T23:10:00+00:00",
    contact: {
      fullLegalName: n === 1 ? "Avery Fictional" : "Jordan Example",
      email: n === 1 ? "avery@example.invalid" : "jordan@example.invalid",
      mobilePhone: n === 1 ? "+1 555 0100" : "+1 555 0199",
      organizationName: "Fictional Research Lab",
      shippingAddress: shipping,
      billingSameAsShipping: true,
    },
    lines: [
      { productName: "Example Peptide", specification: "5 mg vial", variantId: "pc-example-5mg", quantity: 2 },
      { productName: "Example Peptide", specification: "10 mg vial", variantId: "pc-example-10mg", quantity: 1 },
    ],
    ...overrides,
  };
}
const reader = (value: unknown) => vi.fn(async (_key: string) => value);

describe("full request staff notice", () => {
  beforeEach(() => {
    send.mockReset(); send.mockResolvedValue({ data: { id: "provider-proof" }, error: null });
    rpc.mockReset();
  });

  it("turns on only with its own switch and a valid cutoff", () => {
    expect(config.detailSince).toBe("2026-11-15T22:00:00Z");
    for (const changes of [
      { EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL: undefined },
      { EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL: "true" },
      { EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL_START_AT: undefined },
      { EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL_START_AT: "yesterday" },
    ]) expect(requestSubmittedStaffNoticeConfig({ ...env, ...changes })?.detailSince).toBeNull();
  });

  it("sends one idempotent email with every requested line in text and HTML", async () => {
    const read = reader(detail(1));
    expect(await sendRequestSubmittedStaffNotice(job(1), config, env, read))
      .toEqual({ ok: true, providerId: "provider-proof" });
    expect(read).toHaveBeenCalledExactlyOnceWith(ids(1).key);
    expect(send).toHaveBeenCalledOnce();
    const [message, options] = send.mock.calls[0];
    expect(options).toEqual({ idempotencyKey: ids(1).key });
    expect(message.to).toEqual(recipients);
    expect(message.subject).toBe("New Early Access request " + ids(1).reference);
    expect(message.text).toBe([
      "Request " + ids(1).reference,
      "Submitted Nov 15, 2026, 5:10 PM Central",
      "",
      "Customer",
      "Name: Avery Fictional",
      "Email: avery@example.invalid",
      "Mobile: +1 555 0100",
      "Organization: Fictional Research Lab",
      "",
      "Shipping address",
      "100 Fictional Way",
      "Suite 4",
      "Austin, TX 78701",
      "US",
      "",
      "Billing address",
      "Same as shipping",
      "",
      "Requested items (2)",
      "1. Example Peptide",
      "   Specification: 5 mg vial",
      "   Variant: pc-example-5mg",
      "   Quantity: 2",
      "2. Example Peptide",
      "   Specification: 10 mg vial",
      "   Variant: pc-example-10mg",
      "   Quantity: 1",
      "",
      "Open this request in the private staff queue (sign-in required):",
      "https://staff.example.invalid/care/request-intents?reference=" + ids(1).reference,
    ].join("\n"));
    for (const value of ["Avery Fictional", "5 mg vial", "pc-example-5mg", "10 mg vial", "pc-example-10mg",
      "Same as shipping", "Qty <strong>2</strong>", "Qty <strong>1</strong>",
      `href="https://staff.example.invalid/care/request-intents?reference=${ids(1).reference}"`]) {
      expect(message.html).toContain(value);
    }
    expect(message.html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
  });

  it("shows a distinct billing address exactly as submitted", () => {
    const billing = { line1: "9 Ledger Road", city: "Dallas", region: "TX", postalCode: "75201", countryCode: "US" };
    const mapped = mapStaffNoticeDetail(detail(1, {
      contact: { ...detail(1).contact, billingSameAsShipping: false, billingAddress: billing },
    }))!;
    const { text, html } = renderFullStaffNotice(mapped, config.queueUrl);
    expect(text).toContain("Billing address\n9 Ledger Road\nDallas, TX 75201\nUS\n");
    expect(text).not.toContain("Same as shipping");
    expect(html).toContain("9 Ledger Road<br>Dallas, TX 75201<br>US");
  });

  it("ignores a billing address when billing is the same as shipping", () => {
    const mapped = mapStaffNoticeDetail(detail(1, {
      contact: { ...detail(1).contact, billingAddress: { ...shipping, line1: "Stale Other Street" } },
    }))!;
    expect(renderFullStaffNotice(mapped, config.queueUrl).text).not.toContain("Stale Other Street");
  });

  it("leaves out absent optional fields cleanly, including records that lack newer fields", () => {
    const { organizationName: _organization, ...contact } = detail(1).contact;
    const { line2: _line2, ...plainShipping } = shipping;
    const mapped = mapStaffNoticeDetail(detail(1, {
      contact: { ...contact, shippingAddress: plainShipping, billingSameAsShipping: false },
      lines: [{ productName: "Example Peptide", variantId: "pc-example-5mg", quantity: 3 }],
    }))!;
    const { text, html } = renderFullStaffNotice(mapped, config.queueUrl);
    expect(text).not.toContain("Organization");
    expect(text).toContain("Shipping address\n100 Fictional Way\nAustin, TX 78701\nUS\n");
    expect(text).toContain("Billing address\nNot provided\n");
    expect(text).toContain("   Specification: Not stated\n");
    for (const body of [text, html]) expect(body).not.toMatch(/undefined|null|\[object/);
  });

  it("escapes customer text in HTML and keeps it on one line in text", () => {
    const mapped = mapStaffNoticeDetail(detail(1, {
      contact: {
        ...detail(1).contact,
        fullLegalName: `Zoë <script>alert("x")</script> & 'Co'`,
        organizationName: "Line one\r\nBcc: someone@example.invalid",
      },
      lines: [{ productName: `<img src=x onerror=alert(1)>`, specification: `5 mg "vial"`, variantId: "pc-<b>", quantity: 1 }],
    }))!;
    const { text, html } = renderFullStaffNotice(mapped, config.queueUrl);
    expect(html).not.toMatch(/<script|<img|<b>|onerror=alert\(1\)>/);
    expect(html).toContain("Zoë &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Co&#39;");
    expect(html).toContain("5 mg &quot;vial&quot;");
    expect(text).toContain("Organization: Line one Bcc: someone@example.invalid\n");
    expect(text).toContain(`Name: Zoë <script>alert("x")</script> & 'Co'\n`);
  });

  it("never carries fields outside the explicit mapping", async () => {
    const raw = {
      ...detail(1),
      ownerHash: "a".repeat(64), agreements: [{ kind: "terms" }], optionalIntake: { goal: "compare_options" },
      contact: { ...detail(1).contact, ageConfirmed: true, clinicalNotes: "PRIVATE-CLINICAL-NOTE" },
      lines: detail(1).lines.map(line => ({ ...line, productId: "INTERNAL-PRODUCT-ID", sourceVariantId: "INTERNAL-SOURCE",
        catalogVersion: "INTERNAL-CATALOG", healthGoal: "PRIVATE-GOAL" })),
    };
    await sendRequestSubmittedStaffNotice(job(1), config, env, reader(raw));
    const body = JSON.stringify(send.mock.calls[0][0]);
    for (const secret of ["aaaaaaaa", "terms", "compare_options", "ageConfirmed", "PRIVATE-CLINICAL-NOTE",
      "INTERNAL-PRODUCT-ID", "INTERNAL-SOURCE", "INTERNAL-CATALOG", "PRIVATE-GOAL"]) {
      expect(body).not.toContain(secret);
    }
  });

  it("never mixes two requests: each job carries only its own customer", async () => {
    await sendRequestSubmittedStaffNotice(job(1), config, env, reader(detail(1)));
    await sendRequestSubmittedStaffNotice(job(2), config, env, reader(detail(2)));
    const [first, second] = send.mock.calls.map(([message]) => JSON.stringify(message));
    expect(first).toContain("Avery Fictional");
    expect(first).not.toContain("Jordan Example");
    expect(second).toContain("Jordan Example");
    expect(second).not.toContain("Avery Fictional");
    // A reader answering with another request's record is refused and nothing of it is sent.
    send.mockClear();
    await sendRequestSubmittedStaffNotice(job(2), config, env, reader(detail(1)));
    const refused = send.mock.calls[0][0];
    expect(JSON.stringify(refused)).not.toMatch(/Avery|avery@|0100/);
    expect(refused.subject).toBe("New Early Access request " + ids(2).reference);
    expect(refused.text).toContain("Full details could not be included. Open the request in the private queue.");
    expect(refused.html).toBeUndefined();
  });

  it("refuses a record whose line count differs from the queued job", async () => {
    await sendRequestSubmittedStaffNotice(job(1, REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE, 3), config, env, reader(detail(1)));
    expect(send.mock.calls[0][0].text).not.toContain("Avery");
  });

  it("keeps the short alert for jobs queued before the cutoff, without reading the request", async () => {
    const read = reader(detail(1));
    await sendRequestSubmittedStaffNotice(job(1, REQUEST_SUBMITTED_STAFF_TEMPLATE), config, env, read);
    expect(read).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledExactlyOnceWith({
      from: "Xenios <staff@example.invalid>", to: recipients, subject: "New Early Access request",
      text: [
        "Request " + ids(1).reference, "Submitted Nov 15, 2026, 5:10 PM Central", "Items: 2",
        "Private staff queue: https://staff.example.invalid/care/request-intents",
      ].join("\n"),
    }, { idempotencyKey: ids(1).key });
  });

  it("holds a queued full job unsent while the full email is switched off", async () => {
    const paused = requestSubmittedStaffNoticeConfig({ ...env, EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL: "false" })!;
    const read = reader(detail(1));
    expect(await sendRequestSubmittedStaffNotice(job(1), paused, env, read))
      .toEqual({ ok: false, providerId: null, error: "Full staff notices paused." });
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("retries a failed read instead of sending less", async () => {
    const read = vi.fn(async () => { throw new Error("private database detail"); });
    expect(await sendRequestSubmittedStaffNotice(job(1), config, env, read))
      .toEqual({ ok: false, providerId: null, error: "Staff notice detail was unavailable." });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a missing record as the short alert with a pointer to the queue", async () => {
    await sendRequestSubmittedStaffNotice(job(1), config, env, reader(null));
    expect(send.mock.calls[0][0].text).toContain("Items: 2\nPrivate staff queue: https://staff.example.invalid/care/request-intents\n"
      + "Full details could not be included.");
  });

  it("retries a provider failure with the same key and the same body, and reports no provider detail", async () => {
    send.mockRejectedValueOnce(new Error("avery@example.invalid rejected by provider"));
    const first = await sendRequestSubmittedStaffNotice(job(1), config, env, reader(detail(1)));
    expect(first).toEqual({ ok: false, providerId: null, error: "Staff notice email was not accepted." });
    send.mockResolvedValueOnce({ data: null, error: { message: "Avery Fictional quota" } });
    expect(await sendRequestSubmittedStaffNotice(job(1), config, env, reader(detail(1))))
      .toEqual({ ok: false, providerId: null, error: "Staff notice email was not accepted." });
    expect(await sendRequestSubmittedStaffNotice(job(1), config, env, reader(detail(1))))
      .toEqual({ ok: true, providerId: "provider-proof" });
    expect(send).toHaveBeenCalledTimes(3);
    const [a, b, c] = send.mock.calls;
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("keeps long international names and addresses whole, and sends a record past the limits as the short alert", async () => {
    const name = "Zoë Ångström-Núñez 李小龍 محمد ".padEnd(320, "ł");
    const abroad = {
      line1: "Maximilianstraße 12, Hinterhaus ".padEnd(200, "ß"), city: "München", region: "Bayern",
      postalCode: "80331", countryCode: "DE",
    };
    const product = "ペプチド研究用サンプル ".padEnd(300, "語");
    const record = detail(1, {
      contact: { ...detail(1).contact, fullLegalName: name, organizationName: "Labor \u202egnp.exe",
        shippingAddress: abroad, billingSameAsShipping: false, billingAddress: { ...abroad, line2: "Postfach 7" } },
      lines: [{ productName: product, specification: null, variantId: "pc-intl-1", quantity: 100 },
        { productName: "Example Peptide", specification: "5 mg vial", variantId: "pc-example-5mg", quantity: 1 }],
    });
    await sendRequestSubmittedStaffNotice(job(1), config, env, reader(record));
    const { text, html } = send.mock.calls[0][0];
    expect(text).toContain(`Name: ${name}\n`);
    expect(text).toContain(`Shipping address\n${abroad.line1.trim()}\nMünchen, Bayern 80331\nDE\n`);
    expect(text).toContain(`Billing address\n${abroad.line1.trim()}\nPostfach 7\nMünchen, Bayern 80331\nDE\n`);
    expect(text).toContain(`1. ${product}\n   Specification: Not stated\n   Variant: pc-intl-1\n   Quantity: 100\n`);
    // A direction override cannot make the organization display in a different order.
    expect(text).toContain("Organization: Labor gnp.exe\n");
    expect(html).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/);
    for (const value of [name, "München, Bayern 80331", product]) expect(html).toContain(value);

    send.mockClear();
    const tooLong = detail(1, { contact: { ...detail(1).contact, fullLegalName: name + "ł" } });
    await sendRequestSubmittedStaffNotice(job(1), config, env, reader(tooLong));
    expect(send.mock.calls[0][0].text).toContain("Full details could not be included.");
    expect(JSON.stringify(send.mock.calls[0][0])).not.toContain("Zoë");
  });

  it("sends two concurrent requests apart, each with its own customer under its own key", async () => {
    const read = vi.fn(async (key: string) => {
      await new Promise(resolve => setTimeout(resolve, key === ids(1).key ? 10 : 0));
      return key === ids(1).key ? detail(1) : detail(2);
    });
    const results = await Promise.all(([1, 2, 1, 2] as const).map(n => sendRequestSubmittedStaffNotice(job(n), config, env, read)));
    expect(results).toEqual(Array(4).fill({ ok: true, providerId: "provider-proof" }));
    const byKey = new Map<string, unknown[]>();
    for (const [message, options] of send.mock.calls) {
      const first = options.idempotencyKey === ids(1).key;
      expect(message.subject).toBe("New Early Access request " + (first ? ids(1) : ids(2)).reference);
      expect(message.text).toContain(first ? "Avery Fictional" : "Jordan Example");
      expect(JSON.stringify(message)).not.toContain(first ? "Jordan" : "Avery");
      byKey.set(options.idempotencyKey, [...(byKey.get(options.idempotencyKey) ?? []), message]);
    }
    // A repeated job sends the identical request under the same key, which the provider recognises.
    expect([...byKey.keys()].sort()).toEqual([ids(1).key, ids(2).key]);
    for (const [a, b] of byKey.values()) expect(b).toEqual(a);
  });

  it("retries, sending nothing, when the detail function is missing from the database", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await sendRequestSubmittedStaffNotice(job(1), config, env))
      .toEqual({ ok: false, providerId: null, error: "Staff notice detail was unavailable." });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(STAFF_NOTICE_DETAIL_RPC, { p_event_key: ids(1).key });
    expect(send).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: detail(1), error: null });
    expect(await sendRequestSubmittedStaffNotice(job(1), config, env)).toEqual({ ok: true, providerId: "provider-proof" });
  });

  it("resends after an earlier attempt only inside the provider's 24-hour duplicate check", async () => {
    expect(STAFF_NOTICE_RESEND_LIMIT_MS).toBeLessThan(24 * 60 * 60 * 1000);
    const now = new Date("2026-11-16T22:00:00Z");
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const read = reader(detail(1));
    // Never attempted: even an old job is sent, once.
    expect(await sendRequestSubmittedStaffNotice({ ...job(1), created_at: ago(3 * 86_400_000), last_attempt_at: null },
      config, env, read, now)).toEqual({ ok: true, providerId: "provider-proof" });
    // Attempted, response lost, still inside the window: the same request under the same key.
    const lost = { ...job(1), created_at: ago(STAFF_NOTICE_RESEND_LIMIT_MS - 60_000), last_attempt_at: ago(60_000) };
    expect(await sendRequestSubmittedStaffNotice(lost, config, env, read, now)).toEqual({ ok: true, providerId: "provider-proof" });
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    // Past the window, or with no creation time to measure from: refused for good, nothing read or sent.
    for (const late of [{ ...lost, created_at: ago(STAFF_NOTICE_RESEND_LIMIT_MS + 1) }, { ...lost, created_at: undefined }]) {
      expect(await sendRequestSubmittedStaffNotice(late, config, env, read, now)).toMatchObject({
        ok: false, nonRetryable: true, error: expect.stringContaining("24-hour duplicate check"),
      });
    }
    expect(send).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("refuses a job whose template and event type disagree", async () => {
    const mixed = { ...job(1), template_key: REQUEST_SUBMITTED_STAFF_TEMPLATE };
    expect(await sendRequestSubmittedStaffNotice(mixed, config, env, reader(detail(1))))
      .toMatchObject({ ok: false, nonRetryable: true });
    expect(send).not.toHaveBeenCalled();
  });
});
