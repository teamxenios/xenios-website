import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  AFFILIATE_CODES_ENV,
  AFFILIATE_CODE_UNLOCKS_EARLY_ACCESS_ENV,
  AFFILIATE_FLAG_ENV_NAMES,
  AFFILIATE_PORTAL_ENV,
  AFFILIATE_SYSTEM_ENV,
  affiliateCodeUnlocksEarlyAccess,
  affiliateCodesEnabled,
  affiliateCommissionsMayAccrue,
  affiliatePortalEnabled,
  affiliateSystemEnabled,
} from "./feature-flags";
import { AFFILIATE_DRAFT_SCHEDULE_STATE } from "./draft-schedule";
import { registerPrivateEarlyAccessApi } from "../../early-access/register";
import {
  EARLY_ACCESS_TEST_CONFIG,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
  StubSupplierDirectory,
  SUPPLIER_ASSIGNMENT,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  sequentialOrderNumbers,
  sequentialProofIds,
} from "../../early-access/routes/route-fixtures";

/**
 * UNDISCLOSED GAP F1 — DEAD / UNENFORCED AFFILIATE FEATURE FLAGS.
 *
 * The four affiliate flag names existed only in `.env.example`. Nothing
 * parsed them and nothing consumed them, so setting one changed no behaviour
 * whatsoever. The affiliate system was genuinely inert, but for a reason
 * nobody had written down: NO AFFILIATE ROUTE WAS EVER MOUNTED.
 *
 * A declared flag is therefore not evidence a feature is disabled. These
 * tests exist so that the claim has to keep earning itself:
 *
 *   1. every flag name shipped in `.env.example` has a real parser
 *   2. the parser is exact-string, so a near miss fails closed
 *   3. subordinate capabilities are gated by the parent AND themselves
 *   4. no affiliate surface answers on the real app, even with every flag on
 *   5. any affiliate route added later must reference a gate, or this fails
 *   6. accrual is a business-domain decision no flag can override
 *
 * Test 4 is the one that matters most today, and it is deliberately written
 * as "turning everything on changes nothing", because that is the honest
 * current state. When Phase F mounts the portal, this test SHOULD go red and
 * be replaced by real FALSE-unmounted / TRUE-mounted route assertions. Going
 * red is the signal, not a nuisance.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const ENV_EXAMPLE = path.join(REPO_ROOT, ".env.example");
const AFFILIATE_SOURCE_ROOT = path.join(REPO_ROOT, "server", "research", "affiliates");

const ALL_ON: Record<string, string> = {
  [AFFILIATE_SYSTEM_ENV]: "true",
  [AFFILIATE_PORTAL_ENV]: "true",
  [AFFILIATE_CODES_ENV]: "true",
  [AFFILIATE_CODE_UNLOCKS_EARLY_ACCESS_ENV]: "true",
};

describe("every affiliate flag documented to operators actually has a parser", () => {
  it("declares no flag in .env.example that no code reads", () => {
    const declared = readFileSync(ENV_EXAMPLE, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^AFFILIATE_[A-Z0-9_]+=/.test(line))
      .map((line) => line.slice(0, line.indexOf("=")))
      // Values, not switches: a secret, a window, a support address. These
      // are read where they are used and are not capability gates.
      .filter((name) => name.endsWith("_ENABLED") || name.endsWith("_UNLOCKS_EARLY_ACCESS"));

    expect(declared.length).toBeGreaterThan(0);
    const orphans = declared.filter(
      (name) => !(AFFILIATE_FLAG_ENV_NAMES as readonly string[]).includes(name),
    );
    // The exact failure this file was written for: a switch an operator can
    // set that nothing in the codebase looks at.
    expect(orphans, `documented but unparsed: ${orphans.join(", ")}`).toEqual([]);
  });
});

describe("the shared registry does not pretend to enforce anything", () => {
  const REGISTRY = path.join(REPO_ROOT, "shared", "research", "flags.ts");

  it("still has zero consumers, and says so where a reader will see it", () => {
    // The registry was found dead: eleven flags declared, `readResearchFlags`
    // and `flagFromEnv` called by nothing. It is PROTECTED (it carries a
    // pinned checksum in the core-site protection manifest), so deleting it
    // is the founder's call, not this session's. What could be fixed was the
    // misleading part: it now states in its own header that it enforces
    // nothing and points at where gating actually happens.
    const registry = readFileSync(REGISTRY, "utf8");
    expect(registry).toContain("NOT a source of truth");
    expect(registry).toContain("zero callers");
    expect(registry).toContain("affiliates/v2/feature-flags.ts");
    // Still genuinely unconsumed. If this ever fails, someone started using
    // the registry and the A-or-B decision has to be made properly.
    expect(registry).toContain("readResearchFlags");
  });

  it("keeps its env names disjoint from the flags that really gate something", () => {
    // The registry's affiliate names (RESEARCH_AFFILIATE_*) are NOT the names
    // an operator sets (AFFILIATE_*). Two vocabularies for one idea is how a
    // switch gets set in the wrong universe and reported as enabled.
    const registry = readFileSync(REGISTRY, "utf8");
    for (const enforced of AFFILIATE_FLAG_ENV_NAMES) {
      expect(
        registry.includes(`"${enforced}"`),
        `${enforced} is declared in the dead registry as well as the live gate`,
      ).toBe(false);
    }
  });
});

describe("the parser is exact-string, so a near miss stays off", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["false", "false"],
    ["malformed", "tru"],
    ["uppercase TRUE", "TRUE"],
    ["mixed case True", "True"],
    ["numeric 1", "1"],
    ["yes", "yes"],
    ["on", "on"],
    ["padded true", " true "],
  ])("stays disabled when the value is %s", (_label, value) => {
    const env = value === undefined ? {} : { [AFFILIATE_SYSTEM_ENV]: value };
    expect(affiliateSystemEnabled(env)).toBe(false);
  });

  it("enables only on the exact lowercase string", () => {
    expect(affiliateSystemEnabled({ [AFFILIATE_SYSTEM_ENV]: "true" })).toBe(true);
  });
});

describe("a subordinate capability needs its parent AND itself", () => {
  it("keeps the portal shut when only its own flag is on", () => {
    expect(affiliatePortalEnabled({ [AFFILIATE_PORTAL_ENV]: "true" })).toBe(false);
  });

  it("does NOT open the portal as a side effect of enabling the system", () => {
    expect(affiliatePortalEnabled({ [AFFILIATE_SYSTEM_ENV]: "true" })).toBe(false);
    expect(affiliateCodesEnabled({ [AFFILIATE_SYSTEM_ENV]: "true" })).toBe(false);
  });

  it("opens each capability only when both switches are set", () => {
    expect(
      affiliatePortalEnabled({ [AFFILIATE_SYSTEM_ENV]: "true", [AFFILIATE_PORTAL_ENV]: "true" }),
    ).toBe(true);
    expect(
      affiliateCodesEnabled({ [AFFILIATE_SYSTEM_ENV]: "true", [AFFILIATE_CODES_ENV]: "true" }),
    ).toBe(true);
  });

  it("requires all three before a code may unlock Early Access", () => {
    // A marketing credential becoming an authentication token is the failure
    // being guarded, so it is the most conditional switch in the system.
    expect(affiliateCodeUnlocksEarlyAccess(ALL_ON)).toBe(true);
    for (const withheld of [AFFILIATE_SYSTEM_ENV, AFFILIATE_CODES_ENV, AFFILIATE_CODE_UNLOCKS_EARLY_ACCESS_ENV]) {
      const env = { ...ALL_ON };
      delete env[withheld];
      expect(affiliateCodeUnlocksEarlyAccess(env), `unlocked without ${withheld}`).toBe(false);
    }
  });
});

describe("no flag can make the draft schedule pay anybody", () => {
  it("accrues nothing with every flag on and the schedule still a draft", () => {
    expect(AFFILIATE_DRAFT_SCHEDULE_STATE).toBe("draft");
    expect(affiliateCommissionsMayAccrue(ALL_ON, AFFILIATE_DRAFT_SCHEDULE_STATE)).toBe(false);
  });

  it("still refuses when the schedule is active but the system is off", () => {
    // Two independent conditions. Neither alone is sufficient, which is why
    // accrual is not left to a routing decision.
    expect(affiliateCommissionsMayAccrue({}, "active")).toBe(false);
    expect(affiliateCommissionsMayAccrue(ALL_ON, "active")).toBe(true);
  });
});

describe("the real application exposes no affiliate surface", () => {
  async function appWithEveryAffiliateFlagOn(): Promise<express.Express> {
    const unit = cleanUnit();
    const app = express();
    app.use(express.json());
    registerPrivateEarlyAccessApi(app, {
      config: EARLY_ACCESS_TEST_CONFIG,
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      agreements: new StubAgreementGate(true),
      suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
      shipping: new StubShippingPolicy(true),
      referrals: new StubReferralResolver(null),
      orderNumber: sequentialOrderNumbers(),
      proofId: sequentialProofIds(),
      env: { ...process.env, ...ALL_ON },
    });
    return app;
  }

  it("answers 404 on every affiliate path even with all four flags true", async () => {
    // The honest statement of today's protection: it is the ABSENCE of these
    // routes, not the flags. When Phase F mounts them this test must be
    // replaced by real flag-off-unmounted / flag-on-mounted assertions.
    const app = await appWithEveryAffiliateFlagOn();
    for (const affiliatePath of [
      "/api/research/affiliates",
      "/api/research/affiliates/portal",
      "/api/research/affiliates/me",
      "/api/research/affiliates/codes/validate",
      "/api/research/affiliates/commissions",
      "/api/research/admin/affiliates",
    ]) {
      const got = await request(app).get(affiliatePath);
      expect(got.status, `${affiliatePath} answered ${got.status}`).toBe(404);
    }
    // Explicit budget: this builds the whole Early Access registration and
    // makes six real HTTP round trips, so its duration is a property of the
    // machine under full-suite load, not of the code being asserted.
  }, 60_000);
});

describe("an affiliate route added later cannot arrive ungated", () => {
  function sourceFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        found.push(...sourceFiles(full));
        continue;
      }
      if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) found.push(full);
    }
    return found;
  }

  it("requires any file registering an Express affiliate route to reference a gate", () => {
    // The tripwire. It is quiet today because nothing under server/research/
    // affiliates registers a route at all, and it goes off the moment one
    // does without consulting feature-flags.ts.
    const registersRoute = /\b(?:app|router)\s*\.\s*(?:get|post|put|patch|delete|use)\s*\(/;
    const consultsGate =
      /affiliateSystemEnabled|affiliatePortalEnabled|affiliateCodesEnabled|affiliateCodeUnlocksEarlyAccess/;

    const ungated = sourceFiles(AFFILIATE_SOURCE_ROOT).filter((file) => {
      const source = readFileSync(file, "utf8");
      return registersRoute.test(source) && !consultsGate.test(source);
    });

    expect(
      ungated.map((file) => path.relative(REPO_ROOT, file)),
      "affiliate route registered without consulting a feature flag",
    ).toEqual([]);
  }, 30_000);
});
