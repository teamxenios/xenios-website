import { describe, expect, it } from "vitest";
import { FULL_CATALOG_VISIBILITY_ENV_VAR } from "../catalog-display/visibility";
import { noMasterOfferingCommerce } from "./customer-projection";
import {
  InMemoryMasterOfferingCatalogReader,
  MasterOfferingCatalogService,
} from "./service";
import { offering, variant } from "./test-fixtures";
import {
  MASTER_OFFERINGS_ENABLED_ENV_VAR,
  MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR,
  masterOfferingsLaunchScope,
  mayViewMasterOfferings,
} from "./visibility-policy";

/**
 * The named-member breadth grant, which is how a specific early member reaches
 * the full catalog before it opens to every active member.
 *
 * The member's canonical identity is owned by the Pack 02 account lane and is
 * deliberately not restated here. This lane only proves the mechanism: an
 * allowlisted address sees the whole member-safe breadth, a non-allowlisted one
 * does not, and neither of them gains one gram of commerce authority from it.
 */

const NAMED_MEMBER = "named.member@example.com";
const OTHER_MEMBER = "someone.else@example.com";

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "true",
    [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: "true",
    [FULL_CATALOG_VISIBILITY_ENV_VAR]: NAMED_MEMBER,
    ...overrides,
  };
}

describe("the named-member breadth grant", () => {
  it("admits the allowlisted member and refuses everyone else", () => {
    expect(
      mayViewMasterOfferings({
        audience: "member",
        email: NAMED_MEMBER,
        env: env(),
      }),
    ).toBe(true);
    expect(
      mayViewMasterOfferings({
        audience: "member",
        email: OTHER_MEMBER,
        env: env(),
      }),
    ).toBe(false);
  });

  it("compares the address the way the admin check does, and no other way", () => {
    for (const spelling of [
      NAMED_MEMBER.toUpperCase(),
      `  ${NAMED_MEMBER}  `,
      "Named.Member@Example.com",
    ]) {
      expect(
        mayViewMasterOfferings({
          audience: "member",
          email: spelling,
          env: env(),
        }),
      ).toBe(true);
    }
    // A near miss is a miss. No prefix, suffix, or domain match.
    for (const nearMiss of [
      `x${NAMED_MEMBER}`,
      `${NAMED_MEMBER}.evil.test`,
      "named.member@example.com.evil.test",
      "@example.com",
    ]) {
      expect(
        mayViewMasterOfferings({
          audience: "member",
          email: nearMiss,
          env: env(),
        }),
      ).toBe(false);
    }
  });

  it("grants nobody when the variable is unset, blank, or misspelled", () => {
    for (const broken of [
      {},
      { [FULL_CATALOG_VISIBILITY_ENV_VAR]: "" },
      { [FULL_CATALOG_VISIBILITY_ENV_VAR]: "   " },
      { RESEARCH_FULL_CATALOG_MEMBER: NAMED_MEMBER },
    ]) {
      expect(
        mayViewMasterOfferings({
          audience: "member",
          email: NAMED_MEMBER,
          env: env({ [FULL_CATALOG_VISIBILITY_ENV_VAR]: undefined, ...broken }),
        }),
      ).toBe(false);
    }
  });

  it("admits an admin without needing the allowlist at all", () => {
    expect(
      mayViewMasterOfferings({
        audience: "admin",
        email: OTHER_MEMBER,
        env: env({ [FULL_CATALOG_VISIBILITY_ENV_VAR]: undefined }),
      }),
    ).toBe(true);
  });

  it("opens to all active members only through the server flag", () => {
    const widened = env({
      [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: "false",
      [FULL_CATALOG_VISIBILITY_ENV_VAR]: undefined,
    });
    expect(masterOfferingsLaunchScope(widened)).toBe("all_members");
    expect(
      mayViewMasterOfferings({
        audience: "member",
        email: OTHER_MEMBER,
        env: widened,
      }),
    ).toBe(true);
    // Fail closed on anything that is not an exact "false".
    for (const value of [undefined, "", "FALSE", "0", "no", "true"]) {
      expect(
        masterOfferingsLaunchScope(
          env({ [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: value }),
        ),
      ).toBe("founder_admin");
    }
  });

  it("gives the named member breadth and not one gram of commerce", async () => {
    const service = new MasterOfferingCatalogService(
      new InMemoryMasterOfferingCatalogReader([
        offering({
          variants: [
            variant({ id: "mov_a", displayState: "available_now" }),
            variant({ id: "mov_b", displayState: "request_access" }),
          ],
        }),
      ]),
      noMasterOfferingCommerce,
    );
    const page = await service.list({});
    const detail = await service.detail("research-vials-bpc-157");

    // Being on the allowlist selects which records are listed. It cannot change
    // a price, an action, or a purchase verdict, and there is no code path from
    // the allowlist into any of them.
    expect(page.products[0].priceSummary.display).toBe("Price on request");
    expect(
      detail?.variants.every((entry) => entry.action.kind !== "add_to_cart"),
    ).toBe(true);
    expect(JSON.stringify(detail)).not.toContain("Add to Cart");
  });
});
