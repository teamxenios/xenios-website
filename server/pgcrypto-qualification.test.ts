import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  auditPgcryptoQualification,
  PGCRYPTO_ALLOWLIST,
  type PgcryptoAuditFs,
} from "../scripts/acceptance/verify-pgcrypto-qualification.ts";

/**
 * The guard's own tests.
 *
 * A check that only ever passes is indistinguishable from a check that cannot
 * see. This one exists because a whole test suite went green while production
 * SQL was unrunnable, so the first thing to prove is that it BITES: on a new
 * public-qualified pgcrypto call, on a third occurrence sneaking into the
 * allowlisted historical file, on that file being edited at all, and on every
 * way the auditor itself can fail to look.
 */

function memoryFs(files: Readonly<Record<string, string>>): PgcryptoAuditFs {
  return {
    listFiles: () => Object.keys(files).sort(),
    readFile: (file) => {
      const source = files[file];
      if (source === undefined) throw new Error(`no such file: ${file}`);
      return source;
    },
  };
}

function codes(result: { findings: readonly { code: string }[] }): string[] {
  return result.findings.map((finding) => finding.code);
}

/** The allowlist keys off repo-relative paths, so the fake root must be "". */
function audit(files: Readonly<Record<string, string>>) {
  return auditPgcryptoQualification({ repoRoot: "", fs: memoryFs(files), roots: ["supabase"] });
}

const M58 = PGCRYPTO_ALLOWLIST[0]!;
const M42 = PGCRYPTO_ALLOWLIST[1]!;

describe("the pgcrypto guard bites", () => {
  it("fails on a NEW public-qualified pgcrypto call in an unlisted file", () => {
    const result = audit({
      "supabase/migrations/20260901000000_something_new.sql":
        "create or replace function public.f() returns text language sql as $$\n" +
        "  select encode(public.digest(convert_to('x','utf8'),'sha256'),'hex');\n$$;\n",
    });
    expect(codes(result)).toContain("PUBLIC_QUALIFIED_PGCRYPTO");
    expect(result.findings[0]!.message).toContain("extensions.digest");
  });

  it.each([
    ["hmac", "public.hmac('a','b','sha256')"],
    ["crypt", "public.crypt('pw', public.gen_salt('bf'))"],
    ["pgp_sym_encrypt", "public.pgp_sym_encrypt('a','b')"],
    ["gen_random_bytes", "public.gen_random_bytes(16)"],
  ])("catches public.%s too, not just digest", (_name, call) => {
    const result = audit({ "supabase/migrations/20260901000000_x.sql": `select ${call};\n` });
    expect(codes(result)).toContain("PUBLIC_QUALIFIED_PGCRYPTO");
  });

  it("accepts the correct extensions-qualified form", () => {
    const result = audit({
      "supabase/migrations/20260901000000_ok.sql":
        "select encode(extensions.digest(convert_to('x','utf8'),'sha256'),'hex');\n",
    });
    expect(result.findings.filter((f) => f.code === "PUBLIC_QUALIFIED_PGCRYPTO")).toEqual([]);
  });

  it("does not fire on an unrelated function that merely contains the word digest", () => {
    const result = audit({
      "supabase/migrations/20260901000000_ok.sql":
        "-- we digest the payload here\nselect public.research_digest_summary('x');\n",
    });
    expect(result.findings.filter((f) => f.code === "PUBLIC_QUALIFIED_PGCRYPTO")).toEqual([]);
  });
});

describe("the allowlist is a pin, not a blanket exemption", () => {
  it("refuses an EXTRA public.digest added to the immutable historical migration", () => {
    const tooMany = "select public.digest('a','sha256');\n".repeat(M58.occurrences + 1);
    const result = audit({ [M58.path]: tooMany });
    expect(codes(result)).toContain("ALLOWLIST_COUNT_CHANGED");
  });

  it("refuses the historical migration once its bytes change", () => {
    const rightCount = "select public.digest('a','sha256');\n".repeat(M58.occurrences);
    const result = audit({ [M58.path]: rightCount });
    // The count is right but this is not the reviewed file, so the checksum pin fails.
    expect(codes(result)).toContain("ALLOWLIST_CHECKSUM_CHANGED");
  });

  it("reports an allowlist entry that no longer matches anything", () => {
    const result = audit({ "supabase/migrations/20260901000000_clean.sql": "select 1;\n" });
    const unused = result.findings.filter((f) => f.code === "ALLOWLIST_ENTRY_UNUSED");
    expect(unused).toHaveLength(PGCRYPTO_ALLOWLIST.length);
    expect(unused.map((f) => f.file)).toContain(M58.path);
    expect(unused.map((f) => f.file)).toContain(M42.path);
  });

  it("names WHY each exemption exists, so the next reader is not guessing", () => {
    expect(M58.reason).toMatch(/IMMUTABLE HISTORICAL SQL/);
    expect(M58.reason).toMatch(/superseded by migration 60/);
    expect(M42.reason).toMatch(/KNOWN DEFECT/);
    expect(M42.reason).toMatch(/MUST BE CORRECTED/);
  });
});

describe("the guard fails closed", () => {
  it("reports a missing root rather than a clean scan", () => {
    const result = auditPgcryptoQualification({
      repoRoot: "",
      roots: ["supabase"],
      fs: {
        listFiles: () => {
          throw new Error("ENOENT");
        },
        readFile: () => "",
      },
    });
    expect(codes(result)).toContain("MISSING_ROOT");
  });

  it("reports an empty scan rather than a clean one", () => {
    expect(codes(audit({}))).toContain("EMPTY_SCAN");
  });

  it("reports an unreadable file rather than skipping it", () => {
    const result = auditPgcryptoQualification({
      repoRoot: "",
      roots: ["supabase"],
      fs: {
        listFiles: () => ["supabase/x.sql"],
        readFile: () => {
          throw new Error("EACCES");
        },
      },
    });
    expect(codes(result)).toContain("UNREADABLE_FILE");
  });
});

describe("the real repository", () => {
  it("has no public-qualified pgcrypto call outside the two pinned historical files", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const result = auditPgcryptoQualification({ repoRoot });
    expect(result.findings).toEqual([]);
    // A vacuous pass over nothing would be worthless.
    expect(result.scannedFiles.length).toBeGreaterThan(50);
  });

  it("pins migration 58 at exactly the bytes production actually ran", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const source = require("node:fs").readFileSync(resolve(repoRoot, M58.path), "utf8") as string;
    const canonical = createHash("sha256").update(source.replaceAll("\r\n", "\n"), "utf8").digest("hex");
    expect(canonical).toBe("8bf36cedb3cfe523f77c2853a5ea259859c7d067825b846dc8602ba9dbcdbe3b");
  });

  it("migration 60 carries NO public-qualified pgcrypto call, because it must apply to Supabase", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const m60 = require("node:fs").readFileSync(
      resolve(repoRoot, "supabase/migrations/20260808100000_research_early_access_cart_completion.sql"),
      "utf8",
    ) as string;
    expect(m60).not.toMatch(/\bpublic\.digest\s*\(/);
    expect((m60.match(/extensions\.digest\s*\(/g) ?? []).length).toBe(5);
  });
});
