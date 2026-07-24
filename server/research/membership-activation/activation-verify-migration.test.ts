import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/research-fm-activation-verify-atomic.sql"),
  "utf8",
);

describe("atomic activation verification migration", () => {
  it("uses one security-definer RPC with row locks and every required effect", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("for update");
    expect(sql).toContain("research_idempotency_keys");
    expect(sql).toContain("research_fm_obligation_events");
    expect(sql).toContain("research_fm_ledger");
    expect(sql).toContain("research_fm_receipts");
    expect(sql).toContain("research_fm_membership_periods");
    expect(sql).toContain("update public.research_members");
    expect(sql).toContain("'renewal_25'");
    expect(sql).toContain("'portal_unlocked'");
  });

  it("is service-role only and does not weaken RLS or add browser policies", () => {
    expect(sql).toMatch(/revoke all on function[\s\S]+from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function[\s\S]+to service_role/i);
    expect(sql).not.toMatch(/disable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("contains no direct production record identifiers or payment evidence", () => {
    expect(sql).not.toContain("XRM-JWXX9C38");
    expect(sql).not.toContain("cashapp-thattallguysam");
  });
});
