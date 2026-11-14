import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type pg from "pg";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It } from "../../request-intent/durable-journey.pg.fixture";
import { pgTransactions } from "./pg.mjs";
import { PRODUCTION_QUOTE_SELLER, quoteDirectoryHits } from "./production-portal";
import { PRODUCTION_QUOTE_TENANT } from "./production";

// Real PostgreSQL 16, loopback only: the customer listing's directory query
// runs as the restricted production runtime role under forced row security.
pg16It("lists only this tenant's and seller's quote targets through the restricted production role", async () => {
  const db = createDurableJourneyFixture();
  const password = randomUUID();
  let pool: pg.Pool | undefined;
  try {
    await db.start();
    const privateSql = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
    await db.sql([
      "BEGIN; CREATE SCHEMA quote_delivery_private; SET LOCAL search_path = quote_delivery_private, pg_catalog;",
      privateSql("tables.sql"), privateSql("private-pg.sql"),
      "CREATE ROLE ea_quote_runtime NOLOGIN NOINHERIT;",
      `CREATE ROLE ea_quote_login LOGIN NOINHERIT PASSWORD '${password}';`,
      "GRANT ea_quote_runtime TO ea_quote_login WITH SET TRUE, INHERIT FALSE, ADMIN FALSE;",
      "GRANT USAGE ON SCHEMA quote_delivery_private TO ea_quote_runtime;",
      "GRANT SELECT ON quote_delivery_private.qd_directory TO ea_quote_runtime;",
      "COMMIT;",
    ].join("\n"));
    const [mine, other, unissued] = [randomUUID(), randomUUID(), randomUUID()];
    await db.sql(`INSERT INTO quote_delivery_private.qd_directory(tenant,target_id,xri_id,seller) VALUES
      ($1,'t1',$3,$4), ($1,'t2',$5,'team-xenios-stage'), ($2,'t3',$5,$4)`,
    [PRODUCTION_QUOTE_TENANT, "ea-staging", mine, PRODUCTION_QUOTE_SELLER, other]);
    pool = db.poolForLogin("ea_quote_login", password);
    const hits = quoteDirectoryHits(pgTransactions(pool, { runtimeRole: "production" }), PRODUCTION_QUOTE_TENANT);
    expect(await hits([mine, other, unissued])).toEqual([mine]);
    expect(await hits([])).toEqual([]);
    // Even without the tenant predicate, forced row security hides the other tenant's row.
    const visible = await pgTransactions(pool, { runtimeRole: "production" })(PRODUCTION_QUOTE_TENANT, "rls-probe",
      async (q) => (await q("SELECT tenant, target_id FROM qd_directory ORDER BY target_id")));
    expect(visible).toEqual([{ tenant: PRODUCTION_QUOTE_TENANT, target_id: "t1" }, { tenant: PRODUCTION_QUOTE_TENANT, target_id: "t2" }]);
  } finally {
    try { await pool?.end(); } finally { await db.close(); }
  }
}, 180_000);
