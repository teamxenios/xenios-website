import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE,
  REQUEST_SUBMITTED_STAFF_TEMPLATE,
  mapStaffNoticeDetail,
  renderFullStaffNotice,
  requestSubmittedStaffNoticeConfig,
  sendRequestSubmittedStaffNotice,
} from "./staff-notice";

const send = vi.hoisted(() => vi.fn());
vi.mock("../../../services/email", () => ({
  getResendClient: async () => ({ client: { emails: { send } }, fromEmail: "Xenios <staff@example.invalid>" }),
}));
vi.mock("../../../supabase", () => ({
  getSupabaseAdmin: () => { throw new Error("tests pass their own reader"); },
}));

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
  beforeEach(() => { send.mockReset(); send.mockResolvedValue({ data: { id: "provider-proof" }, error: null }); });

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

  it("refuses a job whose template and event type disagree", async () => {
    const mixed = { ...job(1), template_key: REQUEST_SUBMITTED_STAFF_TEMPLATE };
    expect(await sendRequestSubmittedStaffNotice(mixed, config, env, reader(detail(1))))
      .toMatchObject({ ok: false, nonRetryable: true });
    expect(send).not.toHaveBeenCalled();
  });
});
