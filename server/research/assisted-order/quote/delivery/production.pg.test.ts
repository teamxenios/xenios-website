import { randomUUID } from "node:crypto";
import type pg from "pg";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It } from "../../request-intent/durable-journey.pg.fixture";
import { pgTransactions } from "./pg.mjs";

// Real PostgreSQL 16, loopback only. The production login/runtime pair is
// provisioned the way the managed provider leaves it (the creating role keeps
// an admin-only membership), then each unsafe provisioning change must make
// every transaction refuse before any application SQL runs.
pg16It("accepts only the exact restricted production login and runtime role grant", async () => {
  const db = createDurableJourneyFixture();
  const password = randomUUID();
  let pool: pg.Pool | undefined;
  try {
    await db.start();
    await db.sql([
      "CREATE ROLE ea_quote_provisioner NOLOGIN;",
      "CREATE ROLE ea_quote_runtime NOLOGIN NOINHERIT;",
      `CREATE ROLE ea_quote_login LOGIN NOINHERIT PASSWORD '${password}';`,
      "GRANT ea_quote_runtime TO ea_quote_login WITH SET TRUE, INHERIT FALSE, ADMIN FALSE;",
      // The managed provider's automatic creator grant: admin only.
      "GRANT ea_quote_runtime TO ea_quote_provisioner WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;",
      "GRANT ea_quote_login TO ea_quote_provisioner WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;",
      "CREATE ROLE ea_quote_other LOGIN NOINHERIT;",
    ].join("\n"));
    const loginPool = db.poolForLogin("ea_quote_login", password);
    pool = loginPool;
    const transact = pgTransactions(loginPool, { runtimeRole: "production" });
    const identity = () => transact("ea-production", "x", async (q) =>
      (await q("SELECT session_user::text AS s, current_user::text AS c"))[0]);
    const refuses = async (change: string, undo: string) => {
      await db.sql(change);
      try {
        await expect(identity()).rejects.toThrow("Restricted quote connection required.");
      } finally {
        await db.sql(undo);
      }
      await expect(identity()).resolves.toEqual({ s: "ea_quote_login", c: "ea_quote_runtime" });
    };

    await expect(identity()).resolves.toEqual({ s: "ea_quote_login", c: "ea_quote_runtime" });

    // Login attributes.
    await refuses("ALTER ROLE ea_quote_login CREATEROLE", "ALTER ROLE ea_quote_login NOCREATEROLE");
    await refuses("ALTER ROLE ea_quote_login CREATEDB", "ALTER ROLE ea_quote_login NOCREATEDB");
    await refuses("ALTER ROLE ea_quote_login REPLICATION", "ALTER ROLE ea_quote_login NOREPLICATION");
    await refuses("ALTER ROLE ea_quote_login BYPASSRLS", "ALTER ROLE ea_quote_login NOBYPASSRLS");
    await refuses("ALTER ROLE ea_quote_login INHERIT", "ALTER ROLE ea_quote_login NOINHERIT");
    // The login's grant on the runtime role.
    await refuses("GRANT ea_quote_runtime TO ea_quote_login WITH ADMIN TRUE",
      "REVOKE ADMIN OPTION FOR ea_quote_runtime FROM ea_quote_login");
    await refuses("GRANT ea_quote_runtime TO ea_quote_login WITH INHERIT TRUE",
      "GRANT ea_quote_runtime TO ea_quote_login WITH INHERIT FALSE");
    // Any other membership of the login, even one it cannot use.
    await refuses("GRANT pg_read_all_data TO ea_quote_login WITH INHERIT FALSE, SET FALSE",
      "REVOKE pg_read_all_data FROM ea_quote_login");
    await refuses("GRANT ea_quote_other TO ea_quote_login WITH INHERIT FALSE, SET TRUE",
      "REVOKE ea_quote_other FROM ea_quote_login");
    // A second principal able to assume or inherit the runtime role or the login.
    await refuses("GRANT ea_quote_runtime TO ea_quote_other WITH SET TRUE, INHERIT FALSE",
      "REVOKE ea_quote_runtime FROM ea_quote_other");
    await refuses("GRANT ea_quote_runtime TO ea_quote_other WITH SET FALSE, INHERIT TRUE",
      "REVOKE ea_quote_runtime FROM ea_quote_other");
    await refuses("GRANT ea_quote_login TO ea_quote_other WITH SET TRUE, INHERIT FALSE",
      "REVOKE ea_quote_login FROM ea_quote_other");
    // Runtime role attributes and memberships.
    await refuses("ALTER ROLE ea_quote_runtime LOGIN", "ALTER ROLE ea_quote_runtime NOLOGIN");
    await refuses("ALTER ROLE ea_quote_runtime CREATEROLE", "ALTER ROLE ea_quote_runtime NOCREATEROLE");
    await refuses("ALTER ROLE ea_quote_runtime BYPASSRLS", "ALTER ROLE ea_quote_runtime NOBYPASSRLS");
    await refuses("GRANT pg_read_all_data TO ea_quote_runtime WITH INHERIT FALSE, SET FALSE",
      "REVOKE pg_read_all_data FROM ea_quote_runtime");

    // A different login holding SET on the runtime role is not the production login.
    await db.sql(`ALTER ROLE ea_quote_other PASSWORD '${password}'`);
    const otherPool = db.poolForLogin("ea_quote_other", password);
    try {
      await db.sql("GRANT ea_quote_runtime TO ea_quote_other WITH SET TRUE, INHERIT FALSE");
      await expect(pgTransactions(otherPool, { runtimeRole: "production" })("ea-production", "x", async () => "never"))
        .rejects.toThrow("Restricted quote connection required.");
    } finally {
      await otherPool.end();
      await db.sql("REVOKE ea_quote_runtime FROM ea_quote_other");
    }
    await expect(identity()).resolves.toEqual({ s: "ea_quote_login", c: "ea_quote_runtime" });
  } finally {
    try { await pool?.end(); } finally { await db.close(); }
  }
}, 180_000);
