import { X509Certificate } from "node:crypto";
import express from "express";
import type { Pool } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { pgTransactions, RESTRICTED_RUNTIME_ROLES } from "./pg.mjs";
import { isPrivateQuoteProduction, mountProductionQuoteConnection, productionQuotePoolOptions } from "./production";

const production = {
  RENDER: "true",
  RENDER_SERVICE_ID: "srv-d8s9vej7uimc7384dfcg",
  SUPABASE_URL: "https://yvzeduaxbwgcwllhywff.supabase.co",
  EA_PRIVATE_QUOTES_ENABLED: "true",
  EA_QUOTE_DATABASE_URL:
    "postgresql://ea_quote_login.yvzeduaxbwgcwllhywff:fixture%40secret@aws-0-us-east-2.pooler.supabase.com:5432/postgres",
};

type Seen = { sql: string; params?: unknown[] };
function recordingPool(seen: Seen[], answer: (sql: string) => Record<string, unknown>[] = () => []) {
  return {
    on: () => undefined,
    connect: async () => ({
      query: async (sql: string, params?: unknown[]) => { seen.push({ sql, params }); return { rows: answer(sql) }; },
      release: () => undefined,
    }),
  } as unknown as Pool;
}

describe("production quote connection", () => {
  it("stays closed without the explicit flag, the production service, the production project and a clean deploy", () => {
    expect(isPrivateQuoteProduction(production)).toBe(true);
    for (const env of [
      { ...production, EA_PRIVATE_QUOTES_ENABLED: undefined },
      { ...production, EA_PRIVATE_QUOTES_ENABLED: "1" },
      { ...production, RENDER: undefined },
      { ...production, RENDER_SERVICE_ID: "srv-d9h4f4m7r5hc73ctjng0" },
      { ...production, IS_PULL_REQUEST: "true" },
      { ...production, SUPABASE_URL: "https://srcphrgnxreqyirkitxd.supabase.co" },
    ]) {
      expect(isPrivateQuoteProduction(env)).toBe(false);
      expect(productionQuotePoolOptions(env)).toBeNull();
    }
  });

  it("requires the restricted production login on the regional pooler with checked TLS", () => {
    const options = productionQuotePoolOptions(production);
    expect(options).toMatchObject({ user: "ea_quote_login.yvzeduaxbwgcwllhywff", password: "fixture@secret",
      database: "postgres", port: 5432, ssl: { rejectUnauthorized: true } });
    const ssl = options?.ssl;
    expect(ssl && typeof ssl === "object" && typeof ssl.ca === "string" && new X509Certificate(ssl.ca).fingerprint256)
      .toBe("80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA");
    const url = production.EA_QUOTE_DATABASE_URL;
    expect(productionQuotePoolOptions({ ...production, EA_QUOTE_DATABASE_URL: url.replace("aws-0-", "aws-1-") })).not.toBeNull();
    for (const changed of [
      undefined,
      url + "?sslmode=disable",
      url.replace("ea_quote_login.", "postgres."),
      url.replace("ea_quote_login.", "ea_quote_stage_login."),
      url.replace("yvzeduaxbwgcwllhywff", "srcphrgnxreqyirkitxd"),
      url.replace(":5432", ":6543"),
      url.replace("aws-0-us-east-2", "aws-0-us-west-2"),
      url.replace("aws-0-us-east-2.pooler.supabase.com", "db.yvzeduaxbwgcwllhywff.supabase.co"),
      url.replace("/postgres", "/other"),
      url.replace(":fixture%40secret@", "@"),
      url.replace("postgresql:", "postgres:"),
    ]) expect(productionQuotePoolOptions({ ...production, EA_QUOTE_DATABASE_URL: changed })).toBeNull();
  });

  it("assumes only the fixed production runtime role and verifies the login pair inside each transaction", async () => {
    const seen: Seen[] = [];
    const transact = pgTransactions(recordingPool(seen, sql => sql.includes("AS restricted") ? [{ restricted: true }] : []),
      { runtimeRole: "production" });
    await transact("ea-production", "x", async () => "done");
    expect(seen[1].sql).toBe("SET LOCAL ROLE ea_quote_runtime");
    expect(seen[2].params).toEqual(["ea_quote_runtime", "ea_quote_login"]);
    expect(seen.at(-1)?.sql).toBe("COMMIT");

    const refused: Seen[] = [];
    const closed = pgTransactions(recordingPool(refused, sql => sql.includes("AS restricted") ? [{ restricted: false }] : []),
      { runtimeRole: "production" });
    await expect(closed("ea-production", "x", async () => "never")).rejects.toThrow("Restricted quote connection required.");
    expect(refused.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("keeps the staging role pair unchanged and refuses any other role name", async () => {
    const seen: Seen[] = [];
    await pgTransactions(recordingPool(seen, sql => sql.includes("AS restricted") ? [{ restricted: true }] : []),
      { assumeStagingRuntimeRole: true })("ea-staging", "x", async () => null);
    expect(seen[1].sql).toBe("SET LOCAL ROLE ea_quote_stage_runtime");
    expect(seen[2].params).toEqual(["ea_quote_stage_runtime", "ea_quote_stage_login"]);
    expect(Object.isFrozen(RESTRICTED_RUNTIME_ROLES) && Object.keys(RESTRICTED_RUNTIME_ROLES)).toEqual(["staging", "production"]);
    const pool = recordingPool([]);
    expect(() => pgTransactions(pool, { runtimeRole: "postgres" as never })).toThrow("Unknown restricted runtime role.");
    expect(() => pgTransactions(pool, { runtimeRole: "toString" as never })).toThrow("Unknown restricted runtime role.");
    expect(() => pgTransactions(pool, { assumeStagingRuntimeRole: true, runtimeRole: "production" }))
      .toThrow("Conflicting restricted runtime role.");
    const plain: Seen[] = [];
    await pgTransactions(recordingPool(plain))("t", "x", async () => null);
    expect(plain.some(s => s.sql.startsWith("SET LOCAL ROLE"))).toBe(false);
  });

  it("mounts nothing unless enabled, and proves the role only for authenticated staff", async () => {
    const off = express();
    let connects = 0;
    const counted = () => { connects++; return recordingPool([]); };
    expect(mountProductionQuoteConnection(off, { ...production, EA_PRIVATE_QUOTES_ENABLED: undefined },
      (_req, _res, next) => next(), counted)).toBeNull();
    await request(off).get("/api/staff/early-access/private-quotes/production-readiness").expect(404);
    expect(connects).toBe(0);

    const app = express();
    let mayAssume = false;
    mountProductionQuoteConnection(app, production, (req, res, next) => {
      if (req.get("authorization") !== "Bearer test-admin") { res.status(401).end(); return; }
      next();
    }, () => ({
      on: () => undefined,
      connect: async () => {
        connects++;
        return {
          query: async (sql: string) => {
            if (sql.startsWith("SET LOCAL ROLE") && !mayAssume) throw Error("fake private error");
            return { rows: sql.includes("AS restricted") ? [{ restricted: true }] : sql.includes("AS ok") ? [{ ok: true }] : [] };
          },
          release: () => undefined,
        };
      },
    }) as unknown as Pool);
    const path = "/api/staff/early-access/private-quotes/production-readiness";
    await request(app).get(path).expect(401);
    expect(connects).toBe(0);
    const closed = await request(app).get(path).set("Authorization", "Bearer test-admin")
      .expect(503, { restrictedConnection: false, resendConfigured: false });
    expect(closed.headers["cache-control"]).toContain("no-store");
    mayAssume = true;
    await request(app).get(path).set("Authorization", "Bearer test-admin")
      .expect(200, { restrictedConnection: true, resendConfigured: false });
    expect(connects).toBe(2);
  });
});
