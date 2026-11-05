import { describe, expect, it, vi } from "vitest";
import {
  CATALOG_INTEREST_CUSTOMER_EVENT,
  CATALOG_INTEREST_TEAM_EVENT,
} from "@shared/catalog-interest";
import { createResendCatalogMailProvider, sendCatalogInterestMail } from "./mail";

const catalog = {
  revision: "catalog-2026-10-22",
  url: "https://xeniostechnology.com/catalog/current.pdf",
  approvedAt: "2026-10-20T00:00:00.000Z",
  expiresAt: "2026-11-20T00:00:00.000Z",
  revokedAt: null,
  state: "approved" as const,
};
const currentAuthority = {
  ...catalog,
  reviewedOrigin: "https://xeniostechnology.com" as const,
};

function customerJob(overrides: Record<string, unknown> = {}) {
  return {
    eventKey: "catalog-interest:11111111-1111-4111-8111-111111111111:customer",
    eventType: CATALOG_INTEREST_CUSTOMER_EVENT,
    recipient: "person@example.com",
    payload: {
      schemaVersion: 1,
      receipt: "XHC-ABCDEF123456",
      email: "person@example.com",
      catalog,
    },
    ...overrides,
  };
}

describe("catalog mail adapter", () => {
  it("passes the canonical event key as provider idempotency and accepts a nonblank provider ID", async () => {
    const send = vi.fn(async () => ({ providerMessageId: " resend-123 " }));
    const result = await sendCatalogInterestMail(
      customerJob(), { send }, "catalog@xeniostechnology.com", currentAuthority,
    );

    expect(result).toEqual({ outcome: "sent", providerMessageId: "resend-123" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "catalog-interest:11111111-1111-4111-8111-111111111111:customer",
      to: "person@example.com",
      text: expect.stringContaining(catalog.url),
    }));
  });

  it("accepts a validated display-name sender without rewriting it", async () => {
    const send = vi.fn(async () => ({ providerMessageId: "resend-123" }));
    await expect(sendCatalogInterestMail(
      customerJob(), { send }, "xenios Health <catalog@xeniostechnology.com>", currentAuthority,
    )).resolves.toEqual({ outcome: "sent", providerMessageId: "resend-123" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: "xenios Health <catalog@xeniostechnology.com>",
    }));
  });

  it("refuses a customer recipient that differs from the durable lead email", async () => {
    const send = vi.fn();
    await expect(sendCatalogInterestMail(
      customerJob({ recipient: "other@example.com" }),
      { send }, "catalog@xeniostechnology.com", currentAuthority,
    )).resolves.toEqual({ outcome: "failed", retryable: false, code: "invalid_job" });
    expect(send).not.toHaveBeenCalled();
  });

  it("never reports sent when the provider fails, throws, or omits an ID", async () => {
    await expect(sendCatalogInterestMail(
      customerJob(),
      { send: async () => ({ errorCode: "rate_limited" }) },
      "catalog@xeniostechnology.com", currentAuthority,
    )).resolves.toEqual({ outcome: "failed", retryable: true, code: "provider_failure" });
    await expect(sendCatalogInterestMail(
      customerJob(),
      { send: async () => ({ providerMessageId: "ambiguous-id", errorCode: "provider_error" }) },
      "catalog@xeniostechnology.com", currentAuthority,
    )).resolves.toEqual({ outcome: "failed", retryable: true, code: "provider_failure" });
    await expect(sendCatalogInterestMail(
      customerJob(),
      { send: async () => ({}) },
      "catalog@xeniostechnology.com", currentAuthority,
    )).resolves.toEqual({ outcome: "failed", retryable: true, code: "provider_id_missing" });
    await expect(sendCatalogInterestMail(
      customerJob(),
      { send: async () => { throw new Error("timeout"); } },
      "catalog@xeniostechnology.com", currentAuthority,
    )).resolves.toEqual({ outcome: "failed", retryable: true, code: "provider_failure" });
  });

  it("refuses customer delivery when the authority requires manual review", async () => {
    const send = vi.fn();
    const job = customerJob({
      payload: { ...customerJob().payload, catalog: { ...catalog, state: "manual_review" } },
    });
    await expect(sendCatalogInterestMail(job, { send }, "catalog@xeniostechnology.com", {
      ...currentAuthority,
      state: "manual_review",
      revokedAt: "2026-10-21T00:00:00.000Z",
    }))
      .resolves.toEqual({ outcome: "failed", retryable: false, code: "manual_review_required" });
    expect(send).not.toHaveBeenCalled();
  });

  it("compares authority timestamps as instants rather than provider-specific strings", async () => {
    const send = vi.fn(async () => ({ providerMessageId: "resend-123" }));
    const postgresCatalog = {
      ...catalog,
      approvedAt: "2026-10-20T00:00:00+00:00",
      expiresAt: "2026-11-20T00:00:00+00:00",
    };
    const result = await sendCatalogInterestMail(
      customerJob({ payload: { ...customerJob().payload, catalog: postgresCatalog } }),
      { send },
      "catalog@xeniostechnology.com",
      currentAuthority,
    );
    expect(result).toEqual({ outcome: "sent", providerMessageId: "resend-123" });
  });

  it("renders the separate optional marketing snapshot only for the team job", async () => {
    const send = vi.fn(async () => ({ providerMessageId: "team-123" }));
    const result = await sendCatalogInterestMail({
      eventKey: "catalog-interest:11111111-1111-4111-8111-111111111111:team",
      eventType: CATALOG_INTEREST_TEAM_EVENT,
      recipient: "team@example.com",
      payload: {
        schemaVersion: 1,
        receipt: "XHC-ABCDEF123456",
        email: "person@example.com",
        marketingConsent: false,
        catalog,
      },
    }, { send }, "catalog@xeniostechnology.com", null);
    expect(result.outcome).toBe("sent");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Optional marketing opt-in: no"),
    }));
  });

  it("adapts Resend's resolved error and missing data ID without inventing success", async () => {
    const send = vi.fn(async () => ({ data: null, error: { name: "validation_error" } }));
    const provider = createResendCatalogMailProvider({ emails: { send } });
    await expect(sendCatalogInterestMail(
      customerJob(), provider, "catalog@xeniostechnology.com", currentAuthority,
    ))
      .resolves.toEqual({ outcome: "failed", retryable: true, code: "provider_failure" });
  });

  it("treats an unnamed provider error as failure even when an ID is present", async () => {
    const send = vi.fn(async () => ({ data: { id: "ambiguous-id" }, error: {} }));
    const provider = createResendCatalogMailProvider({ emails: { send } });
    await expect(sendCatalogInterestMail(
      customerJob(), provider, "catalog@xeniostechnology.com", currentAuthority,
    ))
      .resolves.toEqual({ outcome: "failed", retryable: true, code: "provider_failure" });
  });

  it("checks current authority before sender or provider configuration", async () => {
    const send = vi.fn();
    const sender = vi.fn(async () => "catalog@xeniostechnology.com");
    await expect(sendCatalogInterestMail(
      customerJob(), { send }, sender, { ...currentAuthority, state: "manual_review" },
    ))
      .resolves.toEqual({ outcome: "failed", retryable: false, code: "manual_review_required" });
    expect(sender).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps missing sender configuration retryable without calling the provider", async () => {
    const send = vi.fn();
    await expect(sendCatalogInterestMail(customerJob(), { send }, "", currentAuthority))
      .resolves.toEqual({ outcome: "failed", retryable: true, code: "provider_failure" });
    expect(send).not.toHaveBeenCalled();
  });
});
