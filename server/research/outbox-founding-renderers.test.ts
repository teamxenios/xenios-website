import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Founding-membership (fm_*) renderer registration in the outbox dispatch:
// the 24 emails.ts data templates become subject + body here, and NOTHING
// resembling a receiving instruction can travel into a rendered email. The
// heavyweight route modules the outbox imports are mocked exactly as
// outbox.test.ts mocks them; the renderer itself is pure.
// ---------------------------------------------------------------------------

const resend = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "resend-fm-id" }, error: null as { message?: string } | null })),
}));

vi.mock("../routes", () => ({ requireSupabaseAdmin: (_r: any, _s: any, next: any) => next() }));
vi.mock("./membership", () => ({ makeResearchToken: () => "token" }));
vi.mock("../services/email", () => ({
  getResendClient: async () => ({
    client: { emails: { send: resend.send } },
    fromEmail: "xenios <team@xeniostechnology.com>",
    replyToEmail: null,
  }),
}));
vi.mock("./membership-emails", () => ({
  sendAccountClaimSuccess: vi.fn(),
  sendAdminTestEmail: vi.fn(),
  sendApplicationApproved: vi.fn(),
  sendApplicationDeclined: vi.fn(),
  sendApplicationReceived: vi.fn(),
  sendEmailFailureAlert: vi.fn(),
  sendInternalApplicationAlert: vi.fn(),
  sendMoreInformationRequested: vi.fn(),
  sendResubmittedConfirmation: vi.fn(),
  sendStatusLink: vi.fn(),
}));

import {
  RESEARCH_REPLY_TO_DEFAULT,
  RESEARCH_SENDER_DEFAULT,
  renderFoundingEmail,
  sendFoundingEmail,
} from "./outbox";
import {
  EmailPayloadRefused,
  FOUNDING_EMAIL_TEMPLATE_KEYS,
} from "./membership-activation/emails";
import { NO_AUTOMATIC_BILLING_CONTRACT } from "./membership-activation/renewals";

describe("renderFoundingEmail: representative keys", () => {
  it("renders the activation-created email with the reference substituted and the portal-only destination line", () => {
    const rendered = renderFoundingEmail("fm_activation_obligation_created", {
      xeniosRef: "XRM-TESTREF1",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.subject).toBe("Your founding membership activation is ready");
    expect(rendered!.text).toContain("Your $50 founding membership activation is ready to pay.");
    expect(rendered!.text).toContain("XRM-TESTREF1");
    expect(rendered!.text).toContain("The payment destination is shown inside your member portal only, never in email.");
    expect(rendered!.text).not.toContain("{{");
    expect(rendered!.text).toContain("Xenios Research\nresearch@xeniostechnology.com");
  });

  it("renders the verified receipt with subject substitution and the method LABEL only", () => {
    const rendered = renderFoundingEmail("fm_payment_verified_receipt", {
      xeniosRef: "XRM-TESTREF2",
      receiptNumber: "RCPT-XRM-TESTREF2",
      amount: "$50.00",
      methodLabel: "Manual bridge method",
    });
    expect(rendered!.subject).toBe("Your payment is verified. Receipt RCPT-XRM-TESTREF2");
    expect(rendered!.text).toContain("We verified your Manual bridge method payment of $50.00 for XRM-TESTREF2.");
  });

  it("renders a renewal notice with the no-automatic-billing contract and a human-readable date", () => {
    const rendered = renderFoundingEmail("fm_renewal_upcoming_7d", {
      xeniosRef: "XRM-TESTREF3",
      dueAt: "2026-08-18T00:00:00.000Z",
    });
    expect(rendered!.text).toContain(NO_AUTOMATIC_BILLING_CONTRACT);
    expect(rendered!.text).toContain(new Date("2026-08-18T00:00:00.000Z").toUTCString());
    expect(rendered!.text).not.toContain("2026-08-18T00:00:00.000Z");
  });
});

describe("renderFoundingEmail: no instruction material, ever", () => {
  const CANARY = "CANARY-PAY-DESTINATION-9Z";

  it("refuses a payload whose keys smell like receiving instructions, for every template", () => {
    for (const key of FOUNDING_EMAIL_TEMPLATE_KEYS) {
      expect(() => renderFoundingEmail(key, { receivingInstructions: CANARY })).toThrow(EmailPayloadRefused);
      expect(() => renderFoundingEmail(key, { accountNumber: CANARY })).toThrow(EmailPayloadRefused);
      expect(() => renderFoundingEmail(key, { cashTag: CANARY })).toThrow(EmailPayloadRefused);
      expect(() => renderFoundingEmail(key, { destinationHandle: CANARY })).toThrow(EmailPayloadRefused);
    }
  });

  it("string-scan across all 24 rendered outputs: no instruction material, no unresolved placeholders", () => {
    const benign = {
      xeniosRef: "XRM-TESTREF4",
      dueAt: "2026-08-18T00:00:00.000Z",
      renewalDueAt: "2026-08-18T00:00:00.000Z",
      effectiveAt: "2026-07-19T00:00:00.000Z",
      coveredThrough: "2026-09-17T00:00:00.000Z",
      receiptNumber: "RCPT-XRM-TESTREF4",
      amount: "$25.00",
      methodLabel: "Manual bridge method",
      rejectionCategory: "unreadable",
    };
    expect(FOUNDING_EMAIL_TEMPLATE_KEYS).toHaveLength(24);
    for (const key of FOUNDING_EMAIL_TEMPLATE_KEYS) {
      const rendered = renderFoundingEmail(key, benign);
      expect(rendered).not.toBeNull();
      const text = `${rendered!.subject}\n${rendered!.text}`;
      expect(text).not.toContain("{{");
      expect(text).not.toContain(CANARY);
      // Instruction-shaped material has no way in: no account/routing/IBAN
      // wording, no $handle-style cash tags (dollar amounts are fine).
      expect(text).not.toMatch(/account\s*number|routing|iban|cash\s*tag/i);
      expect(text).not.toMatch(/\$[A-Za-z]/);
    }
  });

  it("stays null for non-founding keys so unknown-template retry behavior is untouched", () => {
    expect(renderFoundingEmail("member_document_ready", {})).toBeNull();
    expect(renderFoundingEmail("applicant_approved", {})).toBeNull();
    expect(renderFoundingEmail("fm_totally_unknown", {})).toBeNull();
    expect(renderFoundingEmail("no_such_template", {})).toBeNull();
  });
});

describe("sendFoundingEmail sender identity", () => {
  it("sends as Xenios Research with the research reply-to, never the generic site sender", async () => {
    resend.send.mockClear();
    const previousFrom = process.env.RESEARCH_EMAIL_FROM;
    const previousReplyTo = process.env.RESEARCH_EMAIL_REPLY_TO;
    delete process.env.RESEARCH_EMAIL_FROM;
    delete process.env.RESEARCH_EMAIL_REPLY_TO;
    try {
      const outcome = await sendFoundingEmail({
        to: "member@example.test",
        subject: "Subject",
        text: "Body",
      });
      expect(outcome).toEqual({ ok: true, providerId: "resend-fm-id" });
      expect(resend.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: RESEARCH_SENDER_DEFAULT,
          replyTo: RESEARCH_REPLY_TO_DEFAULT,
          to: "member@example.test",
        }),
      );
      expect(RESEARCH_SENDER_DEFAULT).toBe("Xenios Research <research@xeniostechnology.com>");
      expect(RESEARCH_REPLY_TO_DEFAULT).toBe("research@xeniostechnology.com");
    } finally {
      if (previousFrom !== undefined) process.env.RESEARCH_EMAIL_FROM = previousFrom;
      if (previousReplyTo !== undefined) process.env.RESEARCH_EMAIL_REPLY_TO = previousReplyTo;
    }
  });

  it("honors the research config overrides when they are set", async () => {
    resend.send.mockClear();
    const previousFrom = process.env.RESEARCH_EMAIL_FROM;
    const previousReplyTo = process.env.RESEARCH_EMAIL_REPLY_TO;
    process.env.RESEARCH_EMAIL_FROM = "Xenios Research <research@config.example>";
    process.env.RESEARCH_EMAIL_REPLY_TO = "replies@config.example";
    try {
      await sendFoundingEmail({ to: "member@example.test", subject: "Subject", text: "Body" });
      expect(resend.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "Xenios Research <research@config.example>",
          replyTo: "replies@config.example",
        }),
      );
    } finally {
      if (previousFrom !== undefined) process.env.RESEARCH_EMAIL_FROM = previousFrom;
      else delete process.env.RESEARCH_EMAIL_FROM;
      if (previousReplyTo !== undefined) process.env.RESEARCH_EMAIL_REPLY_TO = previousReplyTo;
      else delete process.env.RESEARCH_EMAIL_REPLY_TO;
    }
  });
});
