import { describe, expect, it } from "vitest";
import { accountPageQuerySchema, accountUuidSchema, adminAccountPageSchema, adminAccountDetailSchema } from "./admin-accounts";

const userId = "10000000-0000-4000-8000-000000000001";
const account = { userId, emailHint: "withheld" as const, displayLabel: null, displayLabelSource: "user_supplied_not_authority" as const,
  emailConfirmation: "pending" as const, pendingEmailChange: false, lastSignInAt: null, providerBan: "not_reported" as const };
describe("bounded canonical account read wire contract", () => {
  it("accepts exact bounded paging and canonical UUID, without a client authority field", () => {
    expect(accountPageQuerySchema.parse({})).toEqual({ page: 1, perPage: 20 });
    expect(accountPageQuerySchema.parse({ page: "10000", perPage: "50" })).toEqual({ page: 10000, perPage: 50 });
    expect(accountUuidSchema.parse(userId.toUpperCase())).toBe(userId);
  });
  it.each([
    { page: "0" }, { page: "1e2" }, { page: "01" }, { page: "10001" }, { perPage: "51" },
    { page: ["1", "2"] }, { token: "synthetic" }, { actorId: userId }, { role: "admin" }, { search: "private@example.invalid" },
  ])("refuses malformed, repeated or extra paging inputs %#", input => {
    expect(accountPageQuerySchema.safeParse(input).success).toBe(false);
  });
  it("requires exact page counts and next ordinal rather than treating incomplete data as empty", () => {
    const valid = { ok: true, kind: "CANONICAL_AUTH_ACCOUNT_PAGE_V1", accounts: [account], page: 1, perPage: 1, nextPage: 2, total: 2 };
    expect(adminAccountPageSchema.safeParse(valid).success).toBe(true);
    for (const change of [{ accounts: [] }, { nextPage: null }, { total: 0 }, { accounts: [account, account] }]) {
      expect(adminAccountPageSchema.safeParse({ ...valid, ...change }).success).toBe(false);
    }
    expect(adminAccountPageSchema.safeParse({ ...valid, accounts: [], total: 0, nextPage: null }).success).toBe(true);
  });
  it("excludes raw email, metadata, credentials and foreign fields from both responses", () => {
    const detail = { ok: true, kind: "CANONICAL_AUTH_ACCOUNT_DETAIL_V1", account };
    expect(adminAccountDetailSchema.safeParse(detail).success).toBe(true);
    for (const field of ["email", "user_metadata", "app_metadata", "access_token", "phone", "role", "clinicalRecords"]) {
      expect(adminAccountDetailSchema.safeParse({ ...detail, account: { ...account, [field]: "private" } }).success).toBe(false);
    }
    expect(adminAccountDetailSchema.safeParse({ ...detail, account: { ...account, displayLabel: "unsafe\nlabel" } }).success).toBe(false);
  });
});
