import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MEMBER_LEGACY_ALIASES,
  MEMBER_LEGACY_SLUG_ALIASES,
  memberEntryFor,
} from "./member-entry";

// The recognizer decides which signed-out pages get the member sign-in handoff
// instead of the shared reviewer password. It must describe the router exactly:
// every page section.tsx mounts behind RequireMember, plus every legacy alias
// that section.tsx redirects into one. Anything else keeps its current gate.
const section = readFileSync(resolve(__dirname, "..", "section.tsx"), "utf8");

const SAMPLE_PARAMS: Record<string, string> = {
  slug: "sample-slug",
  family: "research_vials",
  id: "order_123",
};

function sample(path: string): string {
  return path.replace(/:([a-zA-Z]+)/gu, (_, name: string) => {
    const value = SAMPLE_PARAMS[name];
    if (!value) throw new Error(`no sample value for :${name} in ${path}`);
    return value;
  });
}

const guardedRoutes = Array.from(
  section.matchAll(/<Route path="(\/research\/member[^"]*)">\{\(\) => <L member component=/gu),
  (match) => match[1],
);

const staticAliasRoutes = Object.fromEntries(
  Array.from(
    section.matchAll(/<Route path="(\/research\/[^"]+)"><Redirect to="(\/research\/member[^"]*)" \/><\/Route>/gu),
    (match) => [match[1], match[2]],
  ),
);

const slugAliasRoutes = Object.fromEntries(
  Array.from(
    section.matchAll(/<Route path="(\/research\/[^"]+\/):slug">\s*\{\(params\) => <Redirect to=\{`(\/research\/member\/[^`$]+\/)\$\{params\.slug\}`\} \/>\}/gu),
    (match) => [match[1], match[2]],
  ),
);

describe("member entry recognizer parity with section.tsx", () => {
  it("reads a realistic route table", () => {
    expect(guardedRoutes.length).toBeGreaterThan(30);
    expect(Object.keys(staticAliasRoutes).length).toBeGreaterThan(15);
    expect(Object.keys(slugAliasRoutes)).toHaveLength(2);
  });

  it("recognizes every page section.tsx mounts behind RequireMember, with its own path as returnTo", () => {
    const missing = guardedRoutes.filter((route) => {
      const path = sample(route);
      return memberEntryFor(path)?.returnTo !== path;
    });
    expect(missing).toEqual([]);
  });

  it("recognizes the self-guarded legacy welcome link without a returnTo", () => {
    expect(section).toContain('<Route path="/research/member/welcome" component={LegacyMemberWelcome} />');
    expect(memberEntryFor("/research/member/welcome")).toEqual({ returnTo: null });
  });

  it("maps exactly the static legacy aliases section.tsx redirects into the member area", () => {
    expect({ ...MEMBER_LEGACY_ALIASES }).toEqual(staticAliasRoutes);
    for (const [alias, target] of Object.entries(staticAliasRoutes)) {
      expect(memberEntryFor(alias), alias).toEqual({ returnTo: target });
    }
  });

  it("maps exactly the slug legacy aliases section.tsx redirects into the member area", () => {
    expect({ ...MEMBER_LEGACY_SLUG_ALIASES }).toEqual(slugAliasRoutes);
    expect(memberEntryFor("/research/products/bpc-157-10mg")).toEqual({ returnTo: "/research/member/products/bpc-157-10mg" });
    expect(memberEntryFor("/research/product/bpc-157-10mg")).toEqual({ returnTo: "/research/member/products/bpc-157-10mg" });
  });
});

describe("memberEntryFor", () => {
  it("keeps only the safe query hints the sign-in policy already allows", () => {
    expect(memberEntryFor("/research/member/checkout", "?variant=v.fixture-1&qty=2&intent=buy_now&utm_source=x")).toEqual({
      returnTo: "/research/member/checkout?variant=v.fixture-1&qty=2&intent=buy_now",
    });
    expect(memberEntryFor("/research/member/security", "?from=sign-in")).toEqual({
      returnTo: "/research/member/security?from=sign-in",
    });
  });

  it("drops a query on a legacy alias, as the router's Redirect does", () => {
    expect(memberEntryFor("/research/products", "?variant=v.1")).toEqual({ returnTo: "/research/member/products" });
  });

  it("treats a trailing slash like the router does", () => {
    expect(memberEntryFor("/research/member/orders/")).toEqual({ returnTo: "/research/member/orders" });
    expect(memberEntryFor("/research/products/")).toEqual({ returnTo: "/research/member/products" });
  });

  it("still recognizes a case or encoding variant but never invents a returnTo for it", () => {
    expect(memberEntryFor("/Research/Member/Products")).toEqual({ returnTo: null });
    expect(memberEntryFor("/research/member/%70roducts")).toEqual({ returnTo: null });
    expect(memberEntryFor("/Research/Products")).toEqual({ returnTo: "/research/member/products" });
    expect(memberEntryFor("/research/products/BPC-157")).toEqual({ returnTo: null });
  });

  it.each([
    "/research",
    "/research/faq",
    "/research/documents",
    "/research/catalog",
    "/research/early-access",
    "/research/early-access-admin",
    "/research/account",
    "/research/account/anything-else",
    "/research/member/not-a-real-route",
    "/research/member/products/a/extra",
    "/research/member/welcome/extra",
    "/research/products/a/extra",
    "/research/product/",
    "/research/partners/apply",
    "/research/partners/commissions",
    "/research/professionals",
    "/research/access",
    "/research/wholesale",
    "/research/access-gate",
    "/admin/research",
    "/research/member/../../admin",
  ])("does not recognize %s", (path) => {
    expect(memberEntryFor(path)).toBeNull();
  });
});
