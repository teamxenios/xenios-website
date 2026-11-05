import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CatalogInterestRequest } from "@shared/catalog-interest";
import type { CatalogAuthority } from "./authority";
import {
  catalogInterestFingerprint,
  recordCatalogInterest,
  type CatalogInterestRecordInput,
  type CatalogInterestStore,
} from "./service";

const requestId = "11111111-1111-4111-8111-111111111111";
const approvedAuthority: CatalogAuthority = {
  revision: "catalog-2026-10-22",
  url: "https://xeniostechnology.com/catalog/current.pdf",
  approvedAt: "2026-10-20T00:00:00.000Z",
  expiresAt: "2026-11-20T00:00:00.000Z",
  revokedAt: null,
  reviewedOrigin: "https://xeniostechnology.com",
  state: "approved",
};

class TransactionalTestStore implements CatalogInterestStore {
  readonly leads: Array<CatalogInterestRecordInput & { receipt: string; status: "queued" | "manual_review" }> = [];
  readonly consents: Array<Pick<CatalogInterestRecordInput, "requestId" | "marketingConsent" | "deliveryNoticeVersion" | "marketingNoticeVersion">> = [];
  readonly jobs: Array<{ eventKey: string; eventType: string; status: string }> = [];
  failTeamInsert = false;

  async record(input: CatalogInterestRecordInput) {
    const existing = this.leads.find((lead) => lead.requestId === input.requestId);
    if (existing) {
      if (existing.fingerprint !== input.fingerprint) {
        return { ok: false as const, code: "request_conflict" as const };
      }
      return {
        ok: true as const,
        receipt: existing.receipt,
        status: existing.status,
        catalogRevision: existing.catalogRevision,
        replayed: true,
      };
    }

    const leadCount = this.leads.length;
    const consentCount = this.consents.length;
    const jobCount = this.jobs.length;
    try {
      const receipt = `XHC-${String(leadCount + 1).padStart(12, "0")}`;
      const status = input.authorityState === "approved" ? "queued" as const : "manual_review" as const;
      this.leads.push({ ...input, receipt, status });
      this.consents.push({
        requestId: input.requestId,
        marketingConsent: input.marketingConsent,
        deliveryNoticeVersion: input.deliveryNoticeVersion,
        marketingNoticeVersion: input.marketingNoticeVersion,
      });
      this.jobs.push({
        eventKey: input.customerEventKey,
        eventType: input.customerEventType,
        status: status === "queued" ? "pending" : "cancelled",
      });
      if (this.failTeamInsert) throw new Error("synthetic second job insertion failure");
      this.jobs.push({
        eventKey: input.teamEventKey,
        eventType: input.teamEventType,
        status: "pending",
      });
      return {
        ok: true as const,
        receipt,
        status,
        catalogRevision: input.catalogRevision,
        replayed: false,
      };
    } catch (error) {
      this.leads.splice(leadCount);
      this.consents.splice(consentCount);
      this.jobs.splice(jobCount);
      throw error;
    }
  }
}

function request(marketingConsent = false) {
  return CatalogInterestRequest.parse({
    requestId,
    email: " Person@Example.COM ",
    marketingConsent,
    confirmEmpty: "",
  });
}

function dependencies(store: TransactionalTestStore, authority: CatalogAuthority | null = approvedAuthority) {
  return {
    authority: () => authority,
    teamRecipient: () => "catalog-team@xeniostechnology.com",
    store,
  };
}

describe("catalog-interest service", () => {
  it("normalizes email, separates consent, and records exactly two canonical jobs", async () => {
    const store = new TransactionalTestStore();
    const result = await recordCatalogInterest(dependencies(store), request());

    expect(result).toMatchObject({ ok: true, status: "queued", replayed: false });
    expect(store.leads).toHaveLength(1);
    expect(store.leads[0]).toMatchObject({
      email: "person@example.com",
      authorityState: "approved",
      customerEventType: "catalog_interest_customer",
      teamEventType: "catalog_interest_team",
    });
    expect(store.consents).toEqual([{
      requestId,
      marketingConsent: false,
      deliveryNoticeVersion: "catalog_delivery_notice_v1",
      marketingNoticeVersion: null,
    }]);
    expect(store.jobs).toEqual([
      {
        eventKey: `catalog-interest:${requestId}:customer`,
        eventType: "catalog_interest_customer",
        status: "pending",
      },
      {
        eventKey: `catalog-interest:${requestId}:team`,
        eventType: "catalog_interest_team",
        status: "pending",
      },
    ]);
  });

  it("replays the stored receipt for the same request ID and fingerprint without new rows", async () => {
    const store = new TransactionalTestStore();
    const first = await recordCatalogInterest(dependencies(store), request());
    const replay = await recordCatalogInterest(dependencies(store), request());

    expect(replay).toEqual({ ...first, replayed: true });
    expect(store.leads).toHaveLength(1);
    expect(store.consents).toHaveLength(1);
    expect(store.jobs).toHaveLength(2);
  });

  it("conflicts when the same request ID has a changed semantic fingerprint", async () => {
    const store = new TransactionalTestStore();
    await recordCatalogInterest(dependencies(store), request(false));
    await expect(recordCatalogInterest(dependencies(store), request(true)))
      .resolves.toEqual({ ok: false, code: "request_conflict" });
    expect(store.leads).toHaveLength(1);
    expect(store.consents).toHaveLength(1);
    expect(store.jobs).toHaveLength(2);
  });

  it("rolls back lead, consent, and customer job when the second job insert fails", async () => {
    const store = new TransactionalTestStore();
    store.failTeamInsert = true;
    await expect(recordCatalogInterest(dependencies(store), request()))
      .rejects.toThrow("second job insertion failure");
    expect(store.leads).toHaveLength(0);
    expect(store.consents).toHaveLength(0);
    expect(store.jobs).toHaveLength(0);
  });

  it("records expired or revoked authority for manual review and cancels customer delivery", async () => {
    const store = new TransactionalTestStore();
    const authority = { ...approvedAuthority, state: "manual_review" as const };
    const result = await recordCatalogInterest(dependencies(store, authority), request());

    expect(result).toMatchObject({ ok: true, status: "manual_review" });
    expect(store.jobs).toEqual([
      expect.objectContaining({ eventType: "catalog_interest_customer", status: "cancelled" }),
      expect.objectContaining({ eventType: "catalog_interest_team", status: "pending" }),
    ]);
  });

  it("fails closed without a complete authority or explicit team inbox", async () => {
    const store = new TransactionalTestStore();
    await expect(recordCatalogInterest(dependencies(store, null), request()))
      .rejects.toThrow("catalog interest unavailable");
    await expect(recordCatalogInterest({
      authority: () => approvedAuthority,
      teamRecipient: () => null,
      store,
    }, request())).rejects.toThrow("catalog interest unavailable");
    expect(store.leads).toHaveLength(0);
  });

  it("uses the same explicit fingerprint contract as the candidate RPC", () => {
    const expected = createHash("sha256").update(
      "person@example.com\n0\ncatalog_delivery_notice_v1\ncatalog-2026-10-22",
      "utf8",
    ).digest("hex");
    expect(catalogInterestFingerprint({
      email: "person@example.com",
      marketingConsent: false,
      catalogRevision: "catalog-2026-10-22",
    })).toBe(expected);
  });
});
