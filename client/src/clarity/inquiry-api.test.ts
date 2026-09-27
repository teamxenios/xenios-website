import { afterEach, describe, expect, it, vi } from "vitest";
import { InquirySubmissionError, submitInquiry } from "./inquiry-api";

afterEach(() => vi.unstubAllGlobals());

const request = {
  inquiryType: "partner_interest" as const,
  fullName: "Sam Example",
  email: "sam@example.test",
  interest: "partner_program" as const,
  message: "I would like to learn about the partner program.",
};

describe("durable inquiry adapter", () => {
  it("posts the strict contract and accepts a durable reference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      accepted: true,
      replayed: false,
      reference: "INQ-ABC12345",
      status: "New",
      inquiryType: "partner_interest",
      confirmation: "Stored",
      confirmationDelivery: "queued",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitInquiry(request)).resolves.toMatchObject({ reference: "INQ-ABC12345", accepted: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/research/inquiries", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(request);
  });

  it("accepts a replay acknowledgement only when the full durable receipt is valid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      accepted: true,
      replayed: true,
      reference: "INQ-ABC12345",
      status: "New",
      inquiryType: "partner_interest",
      confirmation: "Already stored",
      confirmationDelivery: "not_queued",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(submitInquiry(request)).resolves.toMatchObject({
      replayed: true,
      reference: "INQ-ABC12345",
      confirmationDelivery: "not_queued",
    });
  });

  it("preserves validation errors as rejected, without inventing a reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: "invalid_inquiry",
      message: "Check the form.",
      fieldErrors: { email: "Enter a valid email." },
    }), { status: 400, headers: { "Content-Type": "application/json" } })));
    await expect(submitInquiry(request)).rejects.toMatchObject<Partial<InquirySubmissionError>>({
      kind: "rejected",
      fieldErrors: { email: "Enter a valid email." },
    });
  });

  it("treats storage unavailability as uncertain and shows no success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, message: "Storage unavailable." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(submitInquiry(request)).rejects.toMatchObject<Partial<InquirySubmissionError>>({ kind: "uncertain" });
  });

  it.each([
    ["malformed success", new Response(JSON.stringify({ ok: true, accepted: true }), { status: 201, headers: { "Content-Type": "application/json" } })],
    ["wrong inquiry type", new Response(JSON.stringify({
      ok: true,
      accepted: true,
      replayed: false,
      reference: "INQ-ABC12345",
      status: "New",
      inquiryType: "supplier",
      confirmation: "Stored",
      confirmationDelivery: "queued",
    }), { status: 201, headers: { "Content-Type": "application/json" } })],
    ["invented email delivery", new Response(JSON.stringify({
      ok: true,
      accepted: true,
      replayed: false,
      reference: "INQ-ABC12345",
      status: "New",
      inquiryType: "partner_interest",
      confirmation: "Stored",
      confirmationDelivery: "sent",
    }), { status: 201, headers: { "Content-Type": "application/json" } })],
  ] as const)("treats a %s response as uncertain rather than a receipt", async (_name, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(submitInquiry(request)).rejects.toMatchObject<Partial<InquirySubmissionError>>({
      kind: "uncertain",
      message: expect.stringContaining("Please don't resend yet"),
    });
  });

  it("treats a lost network acknowledgement as uncertain and advises against resend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network lost")));
    await expect(submitInquiry(request)).rejects.toMatchObject<Partial<InquirySubmissionError>>({
      kind: "uncertain",
      message: expect.stringContaining("Please don't resend yet"),
    });
  });
});
