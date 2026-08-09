import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { EarlyAccessPersistenceCall } from "../persistence/executor";
import { pendingSubmission } from "./submission-record";
import { SupabaseProofSubmissionStore } from "./supabase-submission-store";
import { ProofBytesRefused } from "./transient-proof";

const AT = "2026-08-09T16:00:00.000Z";

function draft() {
  return pendingSubmission({
    cartCheckoutNumber: "XEC-0123456789ABCDEF",
    customerRef: `eac_${"a".repeat(32)}`,
    memberId: "11111111-1111-1111-1111-111111111111",
    proofSha256: "b".repeat(64),
    filename: "proof.pdf",
    contentType: "application/pdf",
    byteSize: 2048,
    method: {
      code: "ach_wire",
      methodName: "ACH / bank transfer / bank wire",
      registryVersion: "registry-v1",
      presentedAt: AT,
    },
    packageVersion: "c".repeat(24),
    at: AT,
  });
}

function durableRow(overrides: Record<string, unknown> = {}) {
  return {
    ...draft(),
    internalEmailAcceptance: "not_attempted",
    providerMessageId: null,
    lastError: null,
    updatedAt: AT,
    attempts: 0,
    reconciledAt: null,
    ...overrides,
  };
}

describe("SupabaseProofSubmissionStore", () => {
  it("claims with one atomic begin RPC and the exact metadata-only arguments", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const row = draft();
    const store = new SupabaseProofSubmissionStore(async (call) => {
      calls.push(call);
      return { recorded: true, replayed: false, claimed: true, row: durableRow() };
    });

    await expect(store.claimPending(row)).resolves.toEqual({ claimed: true, row: durableRow() });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe("research_early_access_begin_proof_submission");
    expect(calls[0]?.args).toEqual({
      p_submission: {
        submissionId: row.submissionId,
        cartCheckoutNumber: row.cartCheckoutNumber,
        customerRef: row.customerRef,
        memberId: row.memberId,
        method: row.method,
        filename: row.filename,
        contentType: row.contentType,
        byteSize: row.byteSize,
        proofSha256: row.proofSha256,
        packageVersion: row.packageVersion,
        createdAt: row.createdAt,
      },
      p_submission_key: expect.stringMatching(/^eask_[a-f0-9]{48}$/),
    });
  });

  it.each([
    ["accepted", "provider-1", null],
    ["unknown", null, "provider_response_ambiguous"],
    ["failed", null, "provider_refused"],
  ] as const)("preserves the %s acceptance state and exact confirm RPC shape", async (acceptance, providerMessageId, lastError) => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const row = draft();
    const stored = durableRow({
      internalEmailAcceptance: acceptance,
      providerMessageId,
      lastError,
      attempts: 1,
      updatedAt: "2026-08-09T16:01:00.000Z",
    });
    const store = new SupabaseProofSubmissionStore(async (call) => {
      calls.push(call);
      return { updated: true, replayed: false, row: stored };
    });

    await expect(store.recordAcceptance({
      submissionId: row.submissionId,
      acceptance,
      providerMessageId,
      lastError,
      at: "2026-08-09T16:01:00.000Z",
    })).resolves.toEqual(stored);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      fn: "research_early_access_confirm_submission_email",
      args: {
        p_submission_id: row.submissionId,
        p_submission_key: expect.stringMatching(/^eask_[a-f0-9]{48}$/),
        p_acceptance: acceptance,
        p_provider_message_id: providerMessageId,
        p_last_error: lastError,
      },
    });
  });

  it("reads by submission id through the separate admin projection", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const row = draft();
    const store = new SupabaseProofSubmissionStore(async (call) => {
      calls.push(call);
      return durableRow({ internalEmailAcceptance: "unknown", lastError: "ambiguous" });
    });

    await expect(store.byId(row.submissionId)).resolves.toMatchObject({
      submissionId: row.submissionId,
      customerRef: row.customerRef,
      internalEmailAcceptance: "unknown",
      reconciledAt: null,
    });
    expect(calls).toEqual([{
      fn: "research_early_access_submission_admin_view",
      args: { p_checkout_number: row.submissionId },
    }]);
  });

  it("refuses byte-bearing input before any database call", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const store = new SupabaseProofSubmissionStore(async (call) => {
      calls.push(call);
      return null;
    });
    const unsafe = { ...draft(), payload: Buffer.from("not durable") };
    await expect(store.claimPending(unsafe as never)).rejects.toBeInstanceOf(ProofBytesRefused);
    expect(calls).toEqual([]);
  });

  it("proves the M62 claim is insert/on-conflict and the durable fields exist", () => {
    const migration = readFileSync(
      resolve(import.meta.dirname, "../../../../supabase/migrations/20260809130000_research_early_access_hardening.sql"),
      "utf8",
    );
    const begin = migration.slice(
      migration.indexOf("create or replace function public.research_early_access_begin_proof_submission"),
      migration.indexOf("create or replace function public.research_early_access_confirm_submission_email"),
    );
    expect(begin).toContain("insert into public.research_early_access_proof_submissions as durable");
    expect(begin).toContain("on conflict (cart_checkout_id) do update");
    expect(begin).not.toMatch(/select \* into v_existing from public\.research_early_access_proof_submissions/);
    for (const field of ["customer_ref", "attempts", "reconciled_at", "updated_at"]) {
      expect(migration).toContain(field);
    }
  });
});
