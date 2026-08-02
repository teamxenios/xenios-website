#!/usr/bin/env node
// Grade the credentials that two production safety properties depend on, without
// ever revealing them.
//
// WHY THIS EXISTS
//
// 1. SUPABASE_ANON_KEY is echoed verbatim to any anonymous caller by
//    server/routes.ts (the client bootstrap), with a public cache header. Nothing
//    validates that the value in that slot is publishable-grade. A service-role
//    value there bypasses RLS on every table and would be publicly cacheable,
//    and it would not error anywhere, because that key is only used for
//    auth.getUser(jwt), which succeeds with either grade. The sibling slot
//    already self-tests (server/supabase.ts verifyServiceRole); this one does not.
//
// 2. DATABASE_URL backs a raw pg Pool (server/db.ts). The variant-strength write
//    gate installed by migration 20260801120000 is implemented as triggers. A
//    connection role that owns those tables can set session_replication_role to
//    'replica' and write straight past the triggers. So the grade of this role
//    decides whether that gate holds against the application process itself.
//
// CONTRACT
//
// - Prints GRADES ONLY. Never prints, logs, or returns a key, a password, a
//   connection string, or any substring of one. Errors are reduced to a short
//   classification before they are printed, because driver errors routinely
//   embed the connection string.
// - Read-only. Opens a connection, runs SELECTs, and disconnects. Touches no row.
// - Log-only by nature: this is a standalone script, not part of the boot path,
//   so it cannot take the site down. That is deliberate. Hardening the boot path
//   is a separate change with real outage risk and belongs to whoever owns
//   server/db.ts.
//
// USAGE
//   node scripts/diagnostics/grade-credentials.mjs
// Exit code 0 = every checked credential is correctly graded.
// Exit code 1 = at least one is wrong or indeterminate. Read the report.

const results = [];

function record(name, grade, detail, ok) {
  results.push({ name, grade, detail, ok });
}

// Never let a driver error carry a connection string into the output.
function safeError(err) {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  const raw = err && err.message ? String(err.message) : "unknown error";
  // Strip anything that looks like a URL, a key, or a credential pair.
  const scrubbed = raw
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi, "<uri redacted>")
    .replace(/\b(sb_secret|sb_publishable|eyJ)[A-Za-z0-9._-]*/g, "<token redacted>")
    .replace(/password=\S+/gi, "password=<redacted>");
  return code ? `${code}: ${scrubbed}` : scrubbed;
}

async function gradeSupabaseAnonKey() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!key) return record("SUPABASE_ANON_KEY", "missing", "not set in this environment", false);
  if (!url) return record("SUPABASE_ANON_KEY", "indeterminate", "SUPABASE_URL not set, cannot test functionally", false);

  // Shape check first. Supabase's current keys are self-describing, and the old
  // JWT-style keys are not, so shape alone is never sufficient.
  let shape = "unrecognized";
  if (key.startsWith("sb_publishable_")) shape = "publishable-by-prefix";
  else if (key.startsWith("sb_secret_")) shape = "SERVICE-ROLE-BY-PREFIX";
  else if (key.startsWith("eyJ")) shape = "legacy-jwt (prefix proves nothing)";

  if (shape === "SERVICE-ROLE-BY-PREFIX") {
    return record(
      "SUPABASE_ANON_KEY",
      "service-role",
      "prefix is sb_secret_. This value is served to anonymous callers and cached publicly. STOP AND ROTATE.",
      false,
    );
  }

  // Functional check: listUsers is admin-only, so it cleanly separates the two
  // grades regardless of key format. Mirrors server/supabase.ts verifyServiceRole.
  let mod;
  try {
    mod = await import("@supabase/supabase-js");
  } catch (err) {
    return record("SUPABASE_ANON_KEY", "indeterminate", `shape=${shape}; supabase-js unavailable: ${safeError(err)}`, false);
  }

  try {
    const client = mod.createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!error) {
      return record(
        "SUPABASE_ANON_KEY",
        "service-role",
        "admin listUsers SUCCEEDED, so this key has service-role privileges. It is served to " +
          "anonymous callers and cached publicly. STOP AND ROTATE.",
        false,
      );
    }
    return record("SUPABASE_ANON_KEY", "publishable", `shape=${shape}; admin listUsers correctly refused`, true);
  } catch (err) {
    return record("SUPABASE_ANON_KEY", "indeterminate", `shape=${shape}; probe errored: ${safeError(err)}`, false);
  }
}

async function gradeDatabaseRole() {
  const conn = process.env.DATABASE_URL;
  if (!conn) return record("DATABASE_URL", "missing", "not set in this environment", false);

  let pg;
  try {
    pg = await import("pg");
  } catch (err) {
    return record("DATABASE_URL", "indeterminate", `pg driver unavailable: ${safeError(err)}`, false);
  }

  const Client = pg.default?.Client ?? pg.Client;
  const client = new Client({ connectionString: conn });

  try {
    await client.connect();

    const who = await client.query("select current_user as role, session_user as session_role");
    const role = who.rows[0]?.role ?? "unknown";

    const su = await client.query("select usesuper from pg_user where usename = current_user");
    const isSuper = su.rows[0]?.usesuper === true;

    // The specific privilege that defeats the strength gate: a role that owns the
    // gated tables can set session_replication_role and bypass their triggers.
    const owns = await client.query(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('research_product_prices','research_product_variants')
          and pg_get_userbyid(c.relowner) = current_user`,
    );
    const ownedGated = owns.rows.map((r) => r.relname);

    await client.end();

    if (isSuper || ownedGated.length > 0) {
      return record(
        "DATABASE_URL",
        "owner/superuser",
        `role="${role}" superuser=${isSuper} owns=[${ownedGated.join(",")}]. This role can set ` +
          `session_replication_role='replica' and write past the variant-strength triggers. The gate ` +
          `does not constrain the application process. Consider ALTER TABLE ... ENABLE ALWAYS TRIGGER, ` +
          `or move the app to a non-owner role.`,
        false,
      );
    }

    return record(
      "DATABASE_URL",
      "non-owner",
      `role="${role}" superuser=false, owns neither gated table. The strength triggers constrain this connection.`,
      true,
    );
  } catch (err) {
    try {
      await client.end();
    } catch {
      /* already closed */
    }
    return record("DATABASE_URL", "indeterminate", `probe errored: ${safeError(err)}`, false);
  }
}

async function main() {
  await gradeSupabaseAnonKey();
  await gradeDatabaseRole();

  console.log("");
  console.log("CREDENTIAL GRADE REPORT (grades only, no values)");
  console.log("================================================");
  for (const r of results) {
    console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.name}: ${r.grade}`);
    console.log(`      ${r.detail}`);
  }
  console.log("");

  const bad = results.filter((r) => !r.ok);
  if (bad.length > 0) {
    console.log(`${bad.length} credential(s) wrong or indeterminate: ${bad.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }
  console.log("All checked credentials are correctly graded.");
}

main().catch((err) => {
  console.error("grade-credentials failed:", safeError(err));
  process.exit(1);
});
