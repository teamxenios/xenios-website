// THE PRICING GRANT BOUNDARY.
//
// `pricingGrant.audience` decides which Product Control price schedule a
// customer is shown. It is optional and defaults to "member", which keeps every
// pre-existing member caller unchanged — and which also means a NEW construction
// site could quietly hand a customer-facing viewer a wholesale or professional
// schedule with a one-word diff and no type error.
//
// So the set of places that can mint a grant is pinned here structurally, by
// reading the source. A behavioural test cannot catch this: the danger is not
// that today's code resolves the wrong audience, it is that tomorrow's code
// adds a third minting site nobody reviews as a pricing change.
//
// If this test fails you have added or moved a grant construction. That is
// allowed — but it is a PRICING decision and must be reviewed as one: prove the
// audience is customer-safe, prove the browser cannot influence it, then update
// the pinned set below deliberately.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CUSTOMER_PRICE_AUDIENCES } from "@shared/research/pricing";
import {
  earlyAccessRetailPricingViewer,
  pricingViewerForCustomerViewer,
  EARLY_ACCESS_RETAIL_PRICE_AUDIENCE,
} from "./early-access-retail-pricing";
import { pricingIdentityFromViewer } from "./member-pricing-viewer";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SCANNED_ROOTS = ["server", "client", "shared"];

/** The ONLY files permitted to construct a pricing grant. */
const PERMITTED_GRANT_SITES = [
  "server/research/master-offerings/early-access-retail-pricing.ts",
  "server/research/master-offerings/member-pricing-viewer.ts",
];

/**
 * Audiences a CUSTOMER-FACING viewer may ever be priced against. Everything
 * else in CUSTOMER_PRICE_AUDIENCES is a commercial schedule that must never
 * reach a storefront visitor.
 */
const CUSTOMER_SAFE_AUDIENCES = ["member"];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry)) continue;
      out.push(full);
    }
  };
  for (const root of SCANNED_ROOTS) walk(path.join(REPO_ROOT, root));
  return out;
}

function relative(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

/**
 * These two audits read every source file in the repository, which takes well
 * over vitest's 5s default on a cold cache. Without an explicit budget they
 * fail intermittently — and a security boundary that fails at random is worse
 * than no gate, because the failures get waved through.
 */
const SOURCE_SCAN_TIMEOUT_MS = 120_000;

describe("the pricing grant boundary", () => {
  it("walks a source tree that actually contains the known grant sites", () => {
    // Guards the guard: a scanner that silently walks nothing would let every
    // assertion below pass while checking no code at all.
    const files = sourceFiles().map(relative);
    expect(files.length).toBeGreaterThan(500);
    for (const site of PERMITTED_GRANT_SITES) {
      expect(files).toContain(site);
    }
  });

  it("mints a pricing grant in exactly the reviewed places, and nowhere else", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      // A construction, not a type declaration or a read.
      if (!/pricingGrant\s*:\s*(\{|Object\.freeze)/.test(source)) continue;
      const rel = relative(file);
      if (!PERMITTED_GRANT_SITES.includes(rel)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  }, SOURCE_SCAN_TIMEOUT_MS);

  it("never names a non-customer audience at any grant site", () => {
    // The commercial schedules, by name, anywhere in the two permitted files.
    const forbidden = CUSTOMER_PRICE_AUDIENCES.filter(
      (audience) => !CUSTOMER_SAFE_AUDIENCES.includes(audience),
    );
    expect(forbidden.length).toBeGreaterThan(0);

    for (const site of PERMITTED_GRANT_SITES) {
      const source = readFileSync(path.join(REPO_ROOT, site), "utf8");
      // Strip comments: these files EXPLAIN why they do not use the other
      // audiences, and that prose must not read as a violation.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const audience of forbidden) {
        expect(
          code.includes(`"${audience}"`) || code.includes(`'${audience}'`),
          `${site} names the ${audience} price schedule in executable code`,
        ).toBe(false);
      }
    }
  });

  it("prices an anonymous Early Access viewer on a customer-safe audience", () => {
    const identity = pricingIdentityFromViewer(earlyAccessRetailPricingViewer());
    expect(identity).toBeTruthy();
    expect(CUSTOMER_SAFE_AUDIENCES).toContain(identity!.audience);
    expect(identity!.audience).toBe(EARLY_ACCESS_RETAIL_PRICE_AUDIENCE);
  });

  it("leaves the authenticated member path on its unchanged default", () => {
    // masterOfferingViewerForMember sets NO audience. That must keep resolving
    // to "member" — the whole point of the default — so this change cannot have
    // moved a single member's price.
    const identity = pricingIdentityFromViewer({
      audience: "member",
      email: "member@example.com",
      pricingGrant: { sourceVersion: "member-audience-v1" },
    });
    expect(identity?.audience).toBe("member");
    expect(identity?.sourceVersion).toBe("member-audience-v1");
  });

  it("hands no grant to any viewer that is not a member or a real EA session", () => {
    const cases: Array<[string, unknown]> = [
      ["anonymous, no session", { actorType: "anonymous", earlyAccessSessionHash: null }],
      ["EA actor with no session hash", { actorType: "early_access_session", earlyAccessSessionHash: null }],
      ["EA actor with undefined hash", { actorType: "early_access_session" }],
      ["admin", { actorType: "admin", earlyAccessSessionHash: null }],
      ["supplier", { actorType: "supplier", earlyAccessSessionHash: null }],
      ["unresolved member", { actorType: "member", earlyAccessSessionHash: null }],
      ["a forged actor type", { actorType: "early_access_session_", earlyAccessSessionHash: "x".repeat(64) }],
      ["nothing at all", {}],
    ];
    for (const [label, viewer] of cases) {
      expect(
        pricingViewerForCustomerViewer(viewer as never),
        `${label} was handed a pricing grant`,
      ).toBeUndefined();
    }
  });

  it("cannot be handed a grant through request-shaped data", () => {
    // A viewer whose fields came from a JSON body. `pricingViewer` is the only
    // field the derivation trusts, and it is set exclusively by the server-side
    // member resolver — so a body that supplies one must not be honoured as a
    // real EA session either.
    const forged = JSON.parse(
      JSON.stringify({
        actorType: "early_access_session",
        earlyAccessSessionHash: "f".repeat(64),
        pricingViewer: {
          audience: "member",
          email: "victim@example.com",
          pricingGrant: { sourceVersion: "forged", audience: "wholesale" },
        },
      }),
    );
    // The seam prefers viewer.pricingViewer, which in production is written ONLY
    // by resolveMember from an authenticated row. This asserts the shape of that
    // trust honestly: whatever sits in pricingViewer is what prices. That is why
    // no request-parsing code path may ever assign it — pinned by the
    // "pricingViewer" assignment audit in this suite and by express.ts, which
    // sets it solely from `member.pricingViewer`.
    const chosen = pricingViewerForCustomerViewer(forged);
    expect(chosen).toBe(forged.pricingViewer);

    // ...and with no such field present, an EA session gets the retail grant and
    // nothing else, regardless of anything else the body carried.
    const clean = pricingViewerForCustomerViewer({
      actorType: "early_access_session",
      earlyAccessSessionHash: "f".repeat(64),
    } as never);
    expect(clean?.pricingGrant?.audience).toBe(EARLY_ACCESS_RETAIL_PRICE_AUDIENCE);
    expect(clean?.email).toBe("");
  });

  it("sets pricingViewer in exactly the reviewed places", () => {
    // The companion to the grant audit: pricingGrant is only dangerous if
    // something can put a viewer carrying one onto a request. Assignments must
    // stay confined to the composition root and the member resolver.
    const PERMITTED_ASSIGNMENT_SITES = [
      "server/index.ts",
      "server/research/assisted-order/express.ts",
    ];
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      if (!/pricingViewer\s*:\s*[^;]/.test(source)) continue;
      const rel = relative(file);
      // Type declarations (`pricingViewer?: unknown`) are not assignments.
      const assigns = /pricingViewer\s*:\s*(?!unknown|undefined\b)[A-Za-z_{]/.test(
        source.replace(/pricingViewer\?\s*:\s*unknown/g, ""),
      );
      if (!assigns) continue;
      if (
        !PERMITTED_ASSIGNMENT_SITES.includes(rel) &&
        !PERMITTED_GRANT_SITES.includes(rel)
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  }, SOURCE_SCAN_TIMEOUT_MS);
});
