import { beforeEach, describe, expect, it, vi } from "vitest";
import { researchInquiryRequestSchema } from "@shared/research/inquiries";

const state = vi.hoisted(() => ({
  enqueue: vi.fn(async () => true),
}));

vi.mock("../outbox", () => ({ enqueueNotification: state.enqueue }));
vi.mock("../../services/email-config", () => ({
  adminRecipients: () => ["founder@example.test"],
}));

import { renderPublicInquiryOutboxEmail } from "./notification-templates";
import { enqueuePublicInquiryNotifications } from "./notifications";
import { buildDurableInquiryRecord } from "./service";

describe("public inquiry notification handoff", () => {
  beforeEach(() => {
    state.enqueue.mockReset();
    state.enqueue.mockResolvedValue(true);
  });

  it("queues one deterministic customer job and one founder job after persistence", async () => {
    const record = buildDurableInquiryRecord(researchInquiryRequestSchema.parse({
      inquiryType: "practice",
      fullName: "Stephen Rivera",
      email: "stephen@example.test",
      organizationName: "Compass",
      organizationKind: "Practice",
      role: "Owner",
      region: "Texas",
      interest: "refer_clients",
      message: "Please tell me about referrals.",
    }), { ip: "203.0.113.4", recordedAt: "2026-09-26T18:00:00.000Z" });

    await expect(enqueuePublicInquiryNotifications(record)).resolves.toEqual({
      customer: "queued",
      operator: "queued",
    });
    expect(state.enqueue).toHaveBeenCalledTimes(2);
    expect(state.enqueue.mock.calls.map(([job]) => job.eventKey)).toEqual([
      `public-inquiry:${record.id}:customer`,
      `public-inquiry:${record.id}:operator:founder@example.test`,
    ]);
    expect(state.enqueue.mock.calls[0]?.[0]).toMatchObject({
      recipient: "stephen@example.test",
      templateKey: "public_inquiry_received_customer",
    });
    expect(state.enqueue.mock.calls[1]?.[0]).toMatchObject({
      recipient: "founder@example.test",
      templateKey: "public_inquiry_received_operator",
    });
  });

  it("reports customer and operator enqueue outcomes independently", async () => {
    state.enqueue.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const record = buildDurableInquiryRecord(researchInquiryRequestSchema.parse({
      inquiryType: "partner_interest",
      fullName: "Partner Person",
      email: "partner@example.test",
      interest: "partner_program",
      message: "Please tell me about the partner program.",
    }), { ip: "203.0.113.5", recordedAt: "2026-09-26T18:00:00.000Z" });

    await expect(enqueuePublicInquiryNotifications(record)).resolves.toEqual({
      customer: "not_queued",
      operator: "queued",
    });
  });

  it("renders bounded customer and founder messages without claiming approval or timing", () => {
    const customer = renderPublicInquiryOutboxEmail(
      "public_inquiry_received_customer",
      { reference: "INQ-ABC12345", inquiryType: "practice", firstName: "Stephen" },
    );
    const operator = renderPublicInquiryOutboxEmail(
      "public_inquiry_received_operator",
      {
        reference: "INQ-ABC12345",
        inquiryType: "practice",
        fullName: "Stephen Rivera",
        email: "stephen@example.test",
        organizationName: "Compass",
        role: "Owner",
        region: "Texas",
        message: "Referral questions",
      },
    );

    expect(customer?.text).toContain("INQ-ABC12345");
    expect(customer?.text).toContain("does not create an account or approve anything");
    expect(customer?.text).not.toMatch(/business day|72 hours/iu);
    expect(operator?.text).toContain("founder review");
    expect(operator?.text).toContain("Stephen Rivera");
    expect(renderPublicInquiryOutboxEmail("unknown", {})).toBeNull();
  });
});
