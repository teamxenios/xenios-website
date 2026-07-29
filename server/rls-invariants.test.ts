import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Static assertions over the SQL sources, following the pattern of
// server/care/access-migration.test.ts: no database, parse pragmatically,
// resilient to comments and whitespace.

const supabaseDir = resolve(__dirname, "../supabase");
const migrationsDir = join(supabaseDir, "migrations");
const retroMigrationName = "20260729100000_research_rls_retro_hardening.sql";
const retroMigrationPath = join(migrationsDir, retroMigrationName);

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

function sqlFilesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sqlFilesUnder(path));
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      found.push(path);
    }
  }
  return found;
}

const retroSql = stripSqlComments(readFileSync(retroMigrationPath, "utf8"));

describe("RLS invariants across supabase/", () => {
  it("keeps care-access-foundation.sql the only source of policies", () => {
    const offenders: string[] = [];
    for (const file of sqlFilesUnder(supabaseDir)) {
      if (file.endsWith("care-access-foundation.sql")) continue;
      const text = stripSqlComments(readFileSync(file, "utf8"));
      if (/create\s+policy/i.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("forces RLS on every research table a managed migration creates, in its own migration or in the retro hardening", () => {
    for (const file of sqlFilesUnder(migrationsDir)) {
      const text = stripSqlComments(readFileSync(file, "utf8"));
      const created = new Set(
        [
          ...text.matchAll(
            /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(research_\w+)/gi,
          ),
        ].map((match) => match[1].toLowerCase()),
      );
      for (const table of created) {
        const directlyForced = new RegExp(
          String.raw`alter\s+table\s+public\.` +
            table +
            String.raw`\s+force\s+row\s+level\s+security`,
          "i",
        ).test(text);
        // The Product Control migration forces its tables through a DO-block
        // loop: the table names appear as quoted array entries next to an
        // execute format that forces row level security.
        const loopForced =
          text.includes(`'${table}'`) &&
          /force\s+row\s+level\s+security/i.test(text);
        const retroListed = retroSql.includes(`'${table}'`);
        expect(
          directlyForced || loopForced || retroListed,
          `public.${table} is created by ${file} but is neither forced there nor listed in ${retroMigrationName}`,
        ).toBe(true);
      }
    }
  });
});

describe("retro hardening migration content", () => {
  it("is revoke-and-force only: no grants, no data movement, no objects", () => {
    expect(retroSql).not.toMatch(/\bgrant\b/i);
    expect(retroSql).not.toMatch(/service_role/i);
    expect(retroSql).not.toMatch(
      /\b(drop\s+table|drop\s+column|truncate|delete\s+from|insert\s+into|create\s+table|create\s+or\s+replace|create\s+function|create\s+trigger)\b/i,
    );
    expect(retroSql).not.toMatch(/\bupdate\s+[\w."]+\s+set\b/i);
  });

  it("forces, revokes, and guards exactly as specified", () => {
    expect(retroSql).toMatch(
      /alter table public\.%I enable row level security/i,
    );
    expect(retroSql).toMatch(/alter table public\.%I force row level security/i);
    expect(retroSql).toMatch(
      /revoke all on table public\.%I from public, anon, authenticated/i,
    );
    expect(retroSql).toMatch(/to_regclass\('public\.' \|\| t\)/i);
  });

  it("revokes the browser default privileges for tables, sequences, and functions", () => {
    for (const kind of ["tables", "sequences", "functions"]) {
      expect(retroSql).toMatch(
        new RegExp(
          String.raw`alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+all\s+on\s+` +
            kind +
            String.raw`\s+from\s+anon,\s*authenticated`,
          "i",
        ),
      );
    }
  });

  it("enumerates the known exposed production sets and never a Care table", () => {
    const sentinels = [
      // Group 1: schema.sql
      "waitlist_signups",
      "loi_submissions",
      "calendly_bookings",
      "admin_notes",
      "concept_gallery_items",
      // Group 2: membership, members, referrals
      "research_applications",
      "research_members",
      "referral_programs",
      "member_credit_ledger",
      // Group 3: Track A member platform
      "research_agreement_acceptances",
      "research_private_media",
      "research_telegram_links",
      "research_sla_events",
      // Group 4: founding membership
      "research_fm_payment_methods",
      "research_fm_receipts",
      "research_fm_esign_archive",
      "research_fm_agreement_email_candidates",
      // Group 5: pending commerce lane
      "research_orders",
      "research_refund_keys",
      "research_commission_ledger",
      "research_order_shipments",
      // Group 6: verified-locally additions
      "research_notification_outbox",
      "research_consent_events",
      "referral_fraud_flags",
      "research_idempotency_keys",
      "research_lot_excursion_events",
      "research_lot_shipments",
    ];
    for (const sentinel of sentinels) {
      expect(retroSql, `expected '${sentinel}' in the hardened list`).toContain(
        `'${sentinel}'`,
      );
    }
    expect(retroSql).not.toMatch(/'care_\w+'/i);
  });
});
