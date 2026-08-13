import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const M66 = "supabase/migrations/20260812120000_research_early_access_cart_quantity_band_50.sql";
const VERIFY = "supabase/verification/research-early-access-cart-quantity-band-50.verify.sql";
const HARNESS = "scripts/verify-m66-quantity-band-50.sh";
const AUTH_PRE = "supabase/production/EA_QUANTITY_50_RELEASE_CANDIDATE_PRECHECK.sql";
const AUTH_WRITE = "supabase/production/EA_QUANTITY_50_RELEASE_CANDIDATE_WRITE.sql";
const AUTH_POST = "supabase/production/EA_QUANTITY_50_RELEASE_CANDIDATE_POSTCHECK.sql";
const AUTH_REHEARSAL = "scripts/rehearse-ea-quantity-50-release-candidate.sh";

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function blob(path: string): string {
  return execFileSync("git", ["hash-object", `--path=${path}`, path], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
}

describe("M66 quantity 1-50 candidate source", () => {
  it("preserves every accepted M65 and quantity-20 authority artifact byte-for-byte", () => {
    const frozen = {
      "supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql":
        "2aa21fdb89a7fe72350948e7ad41676c2d9eaa4f",
      "supabase/verification/research-early-access-cart-quantity-band.verify.sql":
        "23467d038cc58efe7846d87c8fe716b70e668fe0",
      "supabase/production/research-early-access-cart-quantity-band-rollback-notes.md":
        "def0a75ae53115e3abf03f5c502a739b99f94095",
      "scripts/verify-m65-quantity-band.sh": "d9f1e11c3a3cbc1dec76b224dd63b839537d5341",
      "supabase/production/EA_QUANTITY_20_RELEASE_AUTHORITY_PRECHECK.sql":
        "5d0778526a14000014a9936bfe040286d4d6aaea",
      "supabase/production/EA_QUANTITY_20_RELEASE_AUTHORITY_WRITE.sql":
        "6ffe7f77702ad58b8b755ceb9119748395e2dd5a",
      "supabase/production/EA_QUANTITY_20_RELEASE_AUTHORITY_POSTCHECK.sql":
        "b01e5ddda6a13c05a6fcbbebbf3f22a9641ee3d9",
      "scripts/rehearse-ea-quantity-20-release-authority.sh":
        "f867bcef34b814d5b00338abbd58bf2b6e184c63",
    } as const;
    for (const [path, expected] of Object.entries(frozen)) {
      expect(blob(path), path).toBe(expected);
    }
  }, 30_000);

  it("is DDL-only, targets exactly two tables, and requires exact canonical M65", () => {
    const sql = source(M66);
    const executableSql = sql.replace(/--.*$/gm, "");
    expect(sql).toContain("DESIGN ONLY");
    expect(sql).toContain("M66 requires canonical M65");
    expect(sql).toContain("((quantity>=1)AND(quantity<=20))");
    expect(sql).toContain("((quantity>=1)AND(quantity<=50))");
    expect(sql).toContain("research_early_access_cart_items");
    expect(sql).toContain("research_early_access_cart_child_releases");
    expect(sql).toContain("v_band_count <> 1");
    expect(sql).toContain("set local lock_timeout = '5s'");
    expect(executableSql).not.toMatch(/\b(insert|update|delete|merge|truncate|grant|revoke|create\s+(table|function|index|type))\b/i);

    const namedResearchTables = [...sql.matchAll(/'((?:research_)[a-z0-9_]+)'/g)].map(
      (match) => match[1],
    );
    expect(new Set(namedResearchTables)).toEqual(
      new Set([
        "research_early_access_cart_items",
        "research_early_access_cart_child_releases",
      ]),
    );
  });

  it("pins PG16 and PG17, applies twice only behind an explicit disposable gate", () => {
    const verify = source(VERIFY);
    const harness = source(HARNESS);
    expect(verify).toContain("server_version_num");
    expect(verify).toContain("quantity 50 is accepted");
    expect(verify).toContain("quantity 51 is refused");
    expect(verify).toContain("wrong subtotal");
    expect(verify.trimEnd()).toMatch(/rollback;$/);

    expect(harness).toContain('case "$MAJOR" in 16|17)');
    expect(harness).toContain("XENIOS_ALLOW_M66_DISPOSABLE_APPLY");
    expect(harness.match(/\$REPO_ROOT\/\$M66/g)).toHaveLength(4);
    expect(harness).toContain("M66 first apply");
    expect(harness).toContain("M66 second apply");
    expect(harness).toContain("quantity-20 row changed");
  });

  it("keeps release authority append-only, precheck-bound, and unexecutable by default", () => {
    const pre = source(AUTH_PRE);
    const write = source(AUTH_WRITE);
    const post = source(AUTH_POST);
    const rehearsal = source(AUTH_REHEARSAL);
    const executablePre = pre.replace(/--.*$/gm, "");
    const executableWrite = write.replace(/--.*$/gm, "");
    const executablePost = post.replace(/--.*$/gm, "");

    expect(pre).toContain("begin transaction read only");
    expect(pre).toContain("target_set_md5");
    expect(pre).toContain("historical_release_md5");
    expect(pre).toContain("founder_checkout_md5");
    expect(pre).toContain("research_ea_cart_checkout_active_quote_uidx");
    expect(executablePre).not.toMatch(/\b(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke)\b/i);

    for (const required of [
      "decision_actor",
      "decision_reason",
      "expected_target_count",
      "expected_target_set_md5",
      "expected_historical_release_md5",
      "expected_founder_checkout_md5",
    ]) {
      expect(write).toContain(`:{?${required}}`);
    }
    expect(write).toContain("lock table public.research_early_access_releases");
    expect(pre).toContain("neither exact 20 nor exact 50");
    expect(pre).toContain("mixed predecessor state");
    expect(write).toContain("expected exact all-20 predecessor or exact all-50 replay");
    expect(write).toContain("approvedQuantityLimit')::integer = 20");
    expect(write).toContain("starts_with(release_id, 'rel_ea_qty50_')");
    expect(write).toContain("jsonb_build_array(product_id, variant_id)");
    expect(executableWrite).toMatch(/insert into public\.research_early_access_releases/i);
    expect(executableWrite).not.toMatch(/\b(update|delete|merge|truncate)\b/i);

    expect(post).toContain("begin transaction read only");
    expect(post).toContain("byte-identical to precheck");
    expect(post).toContain("founder checkout subtree");
    expect(post).toContain("current approved units are exact 50");
    expect(executablePost).not.toMatch(/\b(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke)\b/i);

    expect(rehearsal).toContain("XENIOS_ALLOW_M66_DISPOSABLE_APPLY");
    expect(rehearsal).toContain("XENIOS_ALLOW_QTY50_AUTHORITY_REHEARSAL");
    expect(rehearsal).toContain("FAIL first write");
    expect(rehearsal).toContain("FAIL second write");
    expect(rehearsal).toContain("stray 1..49 band");
    expect(rehearsal).toContain("unexpected approved limit 19");
  });
});
