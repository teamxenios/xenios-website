/**
 * PGCRYPTO MUST BE SCHEMA-QUALIFIED THE WAY MANAGED SUPABASE ACTUALLY INSTALLS IT.
 *
 * WHY THIS EXISTS, IN ONE PARAGRAPH.
 *
 * Managed Supabase installs pgcrypto into a dedicated `extensions` schema.
 * A bare `create extension if not exists pgcrypto` in a disposable container
 * installs it into `public`. Two cart migrations were written and tested
 * against the container, so `public.digest` resolved in every test and does
 * not exist in production. Migration 60 failed outright on its first
 * production apply. Migration 58 SUCCEEDED and is recorded as applied, because
 * its calls sit inside a plpgsql body that Postgres does not resolve at CREATE
 * time; its `commit_cart_checkout` would have thrown SQLSTATE 42883 on the
 * first real customer checkout. A green suite asserted the opposite of the
 * truth for as long as the only environment tested was the wrong one.
 *
 * Ten other production functions already use `extensions.digest`. The
 * convention was established and then silently broken twice, which is exactly
 * the shape of defect a machine should be checking for.
 *
 * WHAT THIS FORBIDS. A public-qualified call to any pgcrypto routine in SQL
 * that will be applied to a Supabase database.
 *
 * WHY AN ALLOWLIST RATHER THAN A CLEAN SWEEP. Migration 58 is already applied
 * to production. Its file is the historical record of what actually ran, and
 * editing it would make Git disagree with the database while Supabase's
 * migration tooling, which compares timestamps rather than content, still
 * reported the two as aligned. So it stays byte-identical and is allowlisted
 * EXACTLY: path, occurrence count and checksum. Adding a third `public.digest`
 * to migration 58 fails this check just as loudly as adding one to a new file.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type PgcryptoFinding = Readonly<{
  code: string;
  file: string;
  line: number;
  message: string;
}>;

export type PgcryptoAuditResult = Readonly<{
  scannedFiles: readonly string[];
  findings: readonly PgcryptoFinding[];
}>;

/**
 * pgcrypto routines Xenios uses or could plausibly reach for. A
 * public-qualified call to any of them is wrong on managed Supabase.
 */
export const PGCRYPTO_ROUTINES: readonly string[] = Object.freeze([
  "digest", "hmac", "crypt", "gen_salt", "gen_random_bytes",
  "encrypt", "decrypt", "encrypt_iv", "decrypt_iv",
  "pgp_sym_encrypt", "pgp_sym_decrypt", "pgp_pub_encrypt", "pgp_pub_decrypt",
  "pgp_key_id", "armor", "dearmor",
]);

/**
 * Files permitted to contain a public-qualified pgcrypto call, pinned exactly.
 *
 * An entry is honored ONLY when the path, the occurrence count and the file
 * checksum all still match. Change any of them and the file stops being the
 * reviewed artifact and starts failing.
 */
export type PgcryptoAllowlistEntry = Readonly<{
  path: string;
  occurrences: number;
  sha256: string;
  reason: string;
}>;

export const PGCRYPTO_ALLOWLIST: readonly PgcryptoAllowlistEntry[] = Object.freeze([
  Object.freeze({
    path: "supabase/migrations/20260807193000_research_early_access_cart_checkout.sql",
    occurrences: 2,
    sha256: "8bf36cedb3cfe523f77c2853a5ea259859c7d067825b846dc8602ba9dbcdbe3b",
    reason:
      "IMMUTABLE HISTORICAL SQL. Applied to production on 2026-08-08 and recorded in " +
      "supabase_migrations.schema_migrations. It must remain the truthful record of what ran, so it is " +
      "not edited. Its one defective routine, research_early_access_commit_cart_checkout, is superseded " +
      "by migration 60, which CREATE OR REPLACEs it with the extensions-qualified body BEFORE the cart " +
      "flag is ever switched on. Verified by scripts/verify-early-access-cart-managed-supabase.sh.",
  }),
  Object.freeze({
    path: "supabase/migrations/20260727200000_research_persistent_cart.sql",
    occurrences: 9,
    sha256: "6d1379db45939bdb27f6ea1b32c50e3137a3d0c3cbdbe21cd9a145e2d771d880",
    reason:
      "KNOWN DEFECT, NOT YET APPLIED, DIFFERENT LANE. This commerce-lane migration is PENDING and carries " +
      "the same public.digest mistake. It is allowlisted only so it does not block the Early Access " +
      "release that does not apply it. IT MUST BE CORRECTED TO extensions.digest BEFORE IT IS EVER " +
      "APPLIED, or it will fail exactly as migration 60 did. Whoever picks up the persistent-cart lane " +
      "should treat this entry as the work item.",
  }),
]);

/** SQL that will be applied to a Supabase database. */
export const SQL_ROOTS: readonly string[] = Object.freeze(["supabase"]);

export type PgcryptoAuditFs = Readonly<{
  listFiles(root: string): readonly string[];
  readFile(file: string): string;
}>;

export const nodePgcryptoFs: PgcryptoAuditFs = Object.freeze({
  listFiles(root: string): readonly string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (entry.endsWith(".sql")) out.push(full);
      }
    };
    walk(root);
    return out.sort();
  },
  readFile(file: string): string {
    return readFileSync(file, "utf8");
  },
});

function normalize(file: string): string {
  return file.replaceAll("\\", "/");
}

/** Checksum of the LF-canonical bytes, so a CRLF checkout does not change it. */
function canonicalSha256(source: string): string {
  return createHash("sha256").update(source.replaceAll("\r\n", "\n"), "utf8").digest("hex");
}

const CALL = (routine: string) => new RegExp(`\\bpublic\\.${routine}\\s*\\(`, "g");

export function auditPgcryptoQualification(input: {
  readonly repoRoot: string;
  readonly fs?: PgcryptoAuditFs;
  readonly roots?: readonly string[];
}): PgcryptoAuditResult {
  const fs = input.fs ?? nodePgcryptoFs;
  const findings: PgcryptoFinding[] = [];
  const scanned: string[] = [];
  const allowByPath = new Map(PGCRYPTO_ALLOWLIST.map((entry) => [entry.path, entry]));
  const seenAllowed = new Set<string>();

  for (const root of input.roots ?? SQL_ROOTS) {
    let files: readonly string[];
    try {
      files = fs.listFiles(resolve(input.repoRoot, root));
    } catch (error) {
      findings.push({
        code: "MISSING_ROOT",
        file: root,
        line: 0,
        message: `the SQL root '${root}' could not be listed, so nothing was checked: ${(error as Error).message}`,
      });
      continue;
    }
    if (files.length === 0) {
      findings.push({
        code: "EMPTY_SCAN",
        file: root,
        line: 0,
        message: `'${root}' matched zero .sql files. A scan that reads nothing proves nothing.`,
      });
      continue;
    }

    for (const file of files) {
      const display = normalize(relative(input.repoRoot, file));
      let source: string;
      try {
        source = fs.readFile(file);
      } catch (error) {
        findings.push({
          code: "UNREADABLE_FILE",
          file: display,
          line: 0,
          message: `in the audited path but unreadable, so nothing about it is proven: ${(error as Error).message}`,
        });
        continue;
      }
      scanned.push(display);

      const hits: Array<{ line: number; routine: string }> = [];
      const lines = source.split("\n");
      lines.forEach((text, index) => {
        for (const routine of PGCRYPTO_ROUTINES) {
          if (CALL(routine).test(text)) hits.push({ line: index + 1, routine });
        }
      });
      if (hits.length === 0) continue;

      const allowed = allowByPath.get(display);
      if (allowed === undefined) {
        for (const hit of hits) {
          findings.push({
            code: "PUBLIC_QUALIFIED_PGCRYPTO",
            file: display,
            line: hit.line,
            message:
              `public.${hit.routine}(...) does not exist on managed Supabase, which installs pgcrypto into ` +
              `the 'extensions' schema. Use extensions.${hit.routine}(...). A container that installs ` +
              `pgcrypto into public will hide this, and a plpgsql body will not even fail until runtime.`,
          });
        }
        continue;
      }

      seenAllowed.add(display);
      if (hits.length !== allowed.occurrences) {
        findings.push({
          code: "ALLOWLIST_COUNT_CHANGED",
          file: display,
          line: hits[0]!.line,
          message:
            `allowlisted for exactly ${allowed.occurrences} public-qualified pgcrypto call(s) but found ` +
            `${hits.length}. The allowlist pins a known historical defect; it is not permission to add more.`,
        });
      }
      const actual = canonicalSha256(source);
      if (actual !== allowed.sha256) {
        findings.push({
          code: "ALLOWLIST_CHECKSUM_CHANGED",
          file: display,
          line: 0,
          message:
            `allowlisted at sha256 ${allowed.sha256} but this file is ${actual}. ` +
            `It is no longer the reviewed artifact, so the allowlist no longer applies. ${allowed.reason}`,
        });
      }
    }
  }

  // A stale allowlist is its own defect: it quietly widens what may pass.
  for (const entry of PGCRYPTO_ALLOWLIST) {
    if (!seenAllowed.has(entry.path)) {
      findings.push({
        code: "ALLOWLIST_ENTRY_UNUSED",
        file: entry.path,
        line: 0,
        message:
          "this allowlist entry matched nothing. Either the file moved, or the defect was fixed and the " +
          "entry should be deleted. Leaving it in place grants an exemption nobody is checking.",
      });
    }
  }

  return Object.freeze({
    scannedFiles: Object.freeze(scanned),
    findings: Object.freeze(findings),
  });
}

function isCli(): boolean {
  return Boolean(
    process.argv[1] &&
      resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(),
  );
}

if (isCli()) {
  const result = auditPgcryptoQualification({ repoRoot: process.cwd() });
  if (result.findings.length > 0) {
    for (const finding of result.findings) {
      console.error(`${finding.code}: ${finding.file}:${finding.line} ${finding.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `pgcrypto qualification accepted: ${result.scannedFiles.length} SQL files scanned, ` +
        `${PGCRYPTO_ALLOWLIST.length} pinned historical exemptions, no new public-qualified pgcrypto calls.`,
    );
  }
}
