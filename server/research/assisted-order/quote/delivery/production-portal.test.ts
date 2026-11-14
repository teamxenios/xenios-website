import express from "express";
import type { Pool } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { RequestIntentDetail, RequestIntentLine } from "../../../../../shared/research/assisted-order/request-intent";
import type { AssistedOrderViewer } from "../../ports";
import type { AssistedOrderProductionWiring } from "../../production-deps";
import { InMemoryAssistedOrderQuoteRepository } from "../memory-repository";
import { AssistedOrderQuoteService } from "../service";
import {
  createProductionQuoteAuthority, memberOwnerHash, mountProductionPrivateQuotePortal, PRODUCTION_QUOTE_SELLER,
  productionQuoteLineId, researchMembersByEmail, type ProductionQuoteAuthorityDeps, type QuoteLineClearanceScope,
} from "./production-portal";

const XRI = "1520449e-7cfd-4ebb-b193-bd85b507aeef";
const ISSUER = "1520449e-7cfd-4ebb-b193-bd85b507aeee";
const MEMBER = "2520449e-7cfd-4ebb-b193-bd85b507aee1";
const AUTH = "3520449e-7cfd-4ebb-b193-bd85b507aee2";
const REF = "eac_" + "a".repeat(32);
const ADMIN = "staff@example.test";
const EMAIL = "member@example.test";
const NOW = Date.parse("2026-11-14T00:00:00Z");

function line(productId: string, extra: Partial<RequestIntentLine> = {}): RequestIntentLine {
  return {
    productId, variantId: productId + "-v", sourceVariantId: productId + "-sv", productName: "Product " + productId,
    specification: null, family: "f", workflowMode: "quote_request" as RequestIntentLine["workflowMode"], quantity: 1,
    researchUseOnly: true, clinicalReviewRequired: false, sourceDisplayState: "listed", sourceVariantDisplayState: "listed",
    sourceRefusal: null, catalogVersion: "cat-1", reviewState: "pending", ...extra,
  };
}
function intent(extra: Partial<RequestIntentDetail> = {}): RequestIntentDetail {
  return {
    kind: "unapproved_selection_request", requestId: XRI, publicReference: "XRI-" + XRI.replace(/-/g, "").toUpperCase(),
    status: "pending_review", createdAt: "2026-11-13T00:00:00Z",
    contact: { email: " Member@Example.test " } as RequestIntentDetail["contact"],
    agreements: [{ kind: "early_access_terms", version: "v2" }] as RequestIntentDetail["agreements"],
    lines: [line("p1"), line("p2"), line("p3", { clinicalReviewRequired: true })], ...extra,
  } as RequestIntentDetail;
}

type Overrides = {
  members?: unknown[]; account?: { email: string; confirmedAt: string } | null; issuer?: { email: string; confirmedAt: string } | null;
  owns?: boolean; refs?: { refs: string[]; complete: boolean }; bound?: Record<string, string | null>; standing?: boolean;
  detail?: RequestIntentDetail | null; clearance?: (s: QuoteLineClearanceScope) => unknown; ownedPages?: string[][];
};
const cleared = (s: QuoteLineClearanceScope, extra: Record<string, unknown> = {}) =>
  ({ ...s, approvalEvidenceId: "ev-" + s.productId, unitPriceCents: 1275, currency: "USD", ...extra });
function harness(o: Overrides = {}) {
  const calls = { owns: [] as string[][], list: [] as (string | null)[], staff: [] as string[][], cleared: [] as QuoteLineClearanceScope[] };
  const deps: ProductionQuoteAuthorityDeps = {
    tenant: "ea-production", issuerId: ISSUER, adminEmail: ADMIN, deliveryEnabled: true,
    requiredAgreements: [{ kind: "early_access_terms", version: "v2" }],
    agreementGate: { accepted: async (ref) => ref === REF && (o.standing ?? true) },
    async verifyAccount(id) {
      if (id === ISSUER) return o.issuer === undefined ? { email: ADMIN, confirmedAt: "2026-01-01T00:00:00Z" } : o.issuer;
      if (id === AUTH) return o.account === undefined ? { email: EMAIL, confirmedAt: "2026-01-02T00:00:00Z" } : o.account;
      return null;
    },
    owners: {
      async owns(hash, id) { calls.owns.push([hash, id]); return o.owns ?? true; },
      async list(_hash, after = null) { calls.list.push(after); return (o.ownedPages ?? [[XRI]])[calls.list.length - 1] ?? []; },
    },
    staffReader: { async get(id, actor) { calls.staff.push([id, actor]); return o.detail !== undefined ? o.detail
      : intent({ requestId: id, publicReference: "XRI-" + id.replace(/-/g, "").toUpperCase() }); } },
    directories: {
      async membersByEmail(email) {
        return (o.members ?? [{ id: MEMBER, authUserId: AUTH, email, status: "active" }]) as never;
      },
      bindings: {
        async customerRefsForHistory() { return o.refs ?? { refs: [REF], complete: true }; },
        async forCustomer(ref) {
          const owner = (o.bound ?? { [REF]: MEMBER })[ref];
          return owner ? { ok: true, binding: { memberId: owner } } : { ok: false };
        },
      },
      clearance: {
        async cleared(scope) {
          calls.cleared.push(scope);
          return o.clearance ? o.clearance(scope) as never : cleared(scope);
        },
      },
    },
    now: () => NOW,
  };
  return { built: createProductionQuoteAuthority(deps), calls };
}

describe("production quote authority", () => {
  it("resolves the recipient from the stored contact and binds only lines with exact current clearance", async () => {
    const { built, calls } = harness({ clearance: s => s.productId === "p2" ? cleared(s, { seller: "other" }) : cleared(s) });
    const ctx = await built.loadScope(XRI, PRODUCTION_QUOTE_SELLER);
    expect(ctx).not.toBeNull();
    expect(ctx!.contact).toMatchObject({ email: EMAIL, requestId: XRI, verified: true, deliveryAllowed: true });
    expect(ctx!.binding).toMatchObject({ actorMemberId: null, earlyAccessSessionHash: memberOwnerHash(AUTH) });
    expect(ctx!.target.requestId).toBe(`q-${PRODUCTION_QUOTE_SELLER}-${XRI}`);
    // p2's evidence names another seller; p3 needs clinical review and is never offered to the reader.
    expect(ctx!.bindings.map(b => b.issueLineId)).toEqual([productionQuoteLineId(XRI, "p1", "p1-v")]);
    expect(calls.cleared.map(s => s.productId)).toEqual(["p1", "p2"]);
    expect(calls.owns).toEqual([[memberOwnerHash(AUTH), XRI]]);
    expect(calls.staff).toEqual([[XRI, ISSUER]]);
  });

  it("refuses an unverified, inactive, ambiguous or non-owning recipient, including a guest with the same email", async () => {
    const cases: Overrides[] = [
      { members: [] },
      { members: [{ id: MEMBER, authUserId: AUTH, email: EMAIL, status: "active" }, { id: AUTH, authUserId: MEMBER, email: EMAIL, status: "active" }] },
      { members: [{ id: MEMBER, authUserId: AUTH, email: EMAIL, status: "paused" }] },
      { members: [{ id: MEMBER, authUserId: null, email: EMAIL, status: "active" }] },
      { members: [{ id: MEMBER, authUserId: AUTH, email: "other@example.test", status: "active" }] },
      { account: null },
      { account: { email: "other@example.test", confirmedAt: "2026-01-02T00:00:00Z" } },
      { account: { email: EMAIL, confirmedAt: "" } },
      // The request is owned by a session hash, not this member's hash.
      { owns: false },
      { detail: intent({ contact: { email: "" } as RequestIntentDetail["contact"] }) },
    ];
    for (const c of cases) expect(await harness(c).built.loadScope(XRI, PRODUCTION_QUOTE_SELLER)).toBeNull();
  });

  it("requires recorded current terms and live standing through exactly one verified binding to the same member", async () => {
    const other = "eac_" + "b".repeat(32);
    const cases: Overrides[] = [
      { detail: intent({ agreements: [{ kind: "early_access_terms", version: "v1" }] as RequestIntentDetail["agreements"] }) },
      { refs: { refs: [REF], complete: false } },
      { refs: { refs: [], complete: true } },
      { bound: { [REF]: null } },
      { bound: { [REF]: AUTH } },
      { refs: { refs: [REF, other], complete: true }, bound: { [REF]: MEMBER, [other]: MEMBER } },
      { standing: false },
    ];
    for (const c of cases) expect(await harness(c).built.loadScope(XRI, PRODUCTION_QUOTE_SELLER)).toBeNull();
    // An alias handle that does not resolve as its own binding is ignored, not ambiguous.
    expect(await harness({ refs: { refs: [REF, other], complete: true } }).built.loadScope(XRI, PRODUCTION_QUOTE_SELLER)).not.toBeNull();
  });

  it("refuses another seller, a malformed request id, a missing request and a stale issuer before reading contact", async () => {
    for (const [xri, seller, o] of [
      [XRI, "team-xenios-stage", {}], [XRI.toUpperCase(), PRODUCTION_QUOTE_SELLER, {}],
      [XRI, PRODUCTION_QUOTE_SELLER, { detail: null }],
      [XRI, PRODUCTION_QUOTE_SELLER, { issuer: { email: "someone@example.test", confirmedAt: "2026-01-01T00:00:00Z" } }],
      [XRI, PRODUCTION_QUOTE_SELLER, { issuer: null }],
    ] as [string, string, Overrides][]) {
      const { built, calls } = harness(o);
      expect(await built.loadScope(xri, seller)).toBeNull();
      expect(calls.owns).toEqual([]);
    }
  });

  it("separates issue, customer and dispatch authority", async () => {
    const { built } = harness();
    const staff = { tenant: "ea-production", subject: ISSUER };
    expect(await built.authority.forIssue(null, staff, XRI, PRODUCTION_QUOTE_SELLER)).toMatchObject({ issueAuthorized: true, notifyAuthorized: true });
    expect(await built.authority.forIssue(null, { ...staff, subject: MEMBER }, XRI, PRODUCTION_QUOTE_SELLER)).toBeNull();
    expect(await built.authority.forIssue(null, { ...staff, tenant: "ea-staging" }, XRI, PRODUCTION_QUOTE_SELLER)).toBeNull();
    const owner = { tenant: "ea-production", earlyAccessSessionHash: memberOwnerHash(AUTH) };
    expect(await built.authority.forCustomer(null, owner, XRI, PRODUCTION_QUOTE_SELLER)).toMatchObject({ customerAuthorized: true });
    expect(await built.authority.forCustomer(null, { ...owner, earlyAccessSessionHash: "f".repeat(64) }, XRI, PRODUCTION_QUOTE_SELLER)).toBeNull();
    const job = { tenant: "ea-production", issuer: ISSUER, xriId: XRI, seller: PRODUCTION_QUOTE_SELLER };
    expect(await built.authority.forDispatch(null, job)).toMatchObject({ dispatchAuthorized: true });
    expect(await built.authority.forDispatch(null, { ...job, issuer: MEMBER })).toBeNull();
    expect(await built.authority.verifiedDispatchEvidence()).toBeNull();
  });

  it("re-resolves the recipient at read and send, so a changed account closes both", async () => {
    const changed = harness({ account: { email: EMAIL, confirmedAt: "2026-02-01T00:00:00Z" } });
    const original = await harness().built.loadScope(XRI, PRODUCTION_QUOTE_SELLER);
    const later = await changed.built.loadScope(XRI, PRODUCTION_QUOTE_SELLER);
    // The workflow compares this revision with the tag stored at issue time.
    expect(later!.contact.revision).not.toBe(original!.contact.revision);
    expect(await harness({ owns: false }).built.authority.forDispatch(null,
      { tenant: "ea-production", issuer: ISSUER, xriId: XRI, seller: PRODUCTION_QUOTE_SELLER })).toBeNull();
  });

  it("admits only a signed-in member whose bound handle has live standing", async () => {
    const member = {
      actorType: "member", memberId: MEMBER, authUserId: AUTH, earlyAccessSessionHash: "e".repeat(64),
      earlyAccessCustomerRef: REF, normalizedEmail: EMAIL, capabilities: new Set(["assisted_orders:read_own"]),
    } as AssistedOrderViewer;
    expect(await harness().built.customerPrincipal(member)).toMatchObject({
      tenant: "ea-production", memberId: null, earlyAccessSessionHash: memberOwnerHash(AUTH) });
    for (const [viewer, o] of [
      [{ ...member, actorType: "early_access_session", memberId: null, authUserId: null }, {}],
      [{ ...member, earlyAccessCustomerRef: null }, {}],
      [{ ...member, capabilities: new Set() }, {}],
      [member, { standing: false }],
      [member, { bound: { [REF]: AUTH } }],
      [{ ...member, earlyAccessCustomerRef: "eac_" + "c".repeat(32) }, {}],
    ] as [AssistedOrderViewer, Overrides][]) expect(await harness(o).built.customerPrincipal(viewer)).toBeNull();
  });

  it("lists owned quote targets by advancing the cursor from the last UUID the port returned", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const page2 = [XRI];
    const { built, calls } = harness({ ownedPages: [page1, page2] });
    const seen: string[][] = [];
    const scope = await built.ownedRequests({ tenant: "ea-production", earlyAccessSessionHash: memberOwnerHash(AUTH) },
      async ids => { seen.push([...ids]); return ids.filter(id => id === page1[7] || id === XRI); });
    expect(calls.list).toEqual([null, page1[99]]);
    expect(seen).toEqual([page1, page2]);
    expect(scope.map(s => s.xriId)).toEqual([page1[7], XRI]);
    expect(scope[1]).toMatchObject({ seller: PRODUCTION_QUOTE_SELLER, sellerLabel: "Team Xenios", requestLineCount: 3 });
    expect(await built.ownedRequests({ tenant: "ea-staging", earlyAccessSessionHash: memberOwnerHash(AUTH) }, async () => [XRI])).toEqual([]);
  });

  it("takes no recipient, seller or evidence from the issue body and bounds validity", () => {
    const { built } = harness();
    const body = { xriId: XRI, attempt: "a1", expectedVersion: 0, validUntil: "2026-11-20T00:00:00Z",
      lines: [{ requestLineId: productionQuoteLineId(XRI, "p1", "p1-v") }] };
    expect(built.issueInput(body)).toMatchObject({ seller: PRODUCTION_QUOTE_SELLER, xriId: XRI,
      lines: [{ requestLineId: productionQuoteLineId(XRI, "p1", "p1-v") }] });
    for (const bad of [
      { ...body, seller: "team-xenios-stage" }, { ...body, recipientAuthId: AUTH }, { ...body, approvalEvidenceId: "x" },
      { ...body, validUntil: "2026-11-13T00:00:00Z" }, { ...body, validUntil: "2027-01-01T00:00:00Z" },
      { ...body, xriId: XRI.toUpperCase() }, null, [],
      // Any amount or basis from staff is refused, even one equal to the cleared price.
      { ...body, lines: [{ requestLineId: body.lines[0].requestLineId, unitPriceCents: 1275 }] },
      { ...body, lines: [{ requestLineId: body.lines[0].requestLineId, pricingBasis: "staff" }] },
      { ...body, lines: [] }, { ...body, lines: "x" },
    ]) expect(() => built.issueInput(bad)).toThrow();
  });

  it("binds only the cleared price and currency, and refuses wrong price or evidence from the port", async () => {
    const p1 = productionQuoteLineId(XRI, "p1", "p1-v");
    for (const extra of [
      { unitPriceCents: 0 }, { unitPriceCents: -5 }, { unitPriceCents: 12.5 }, { unitPriceCents: undefined },
      { unitPriceCents: "1275" }, { unitPriceCents: 10_000_001 }, { currency: "EUR" }, { currency: undefined },
      { approvalEvidenceId: "" }, { approvalEvidenceId: "bad id" }, { approvalEvidenceId: 7 },
      { lineId: productionQuoteLineId(XRI, "p2", "p2-v") }, { catalogVersion: "cat-0" }, { quantity: 2 },
    ]) {
      const ctx = await harness({ clearance: s => cleared(s, extra) }).built.loadScope(XRI, PRODUCTION_QUOTE_SELLER);
      expect(ctx!.bindings.map(b => b.issueLineId)).not.toContain(p1);
    }
    const priced = await harness().built.loadScope(XRI, PRODUCTION_QUOTE_SELLER);
    expect(priced!.target.lines.find(l => l.lineId === p1)).toMatchObject({ unitPriceCents: 1275, currency: "USD" });
    // A changed price under a reused evidence ID still changes the bound evidence, so the
    // workflow's clearance tag no longer matches a quote issued at the old price.
    const repriced = await harness({ clearance: s => cleared(s, { unitPriceCents: 1300 }) }).built.loadScope(XRI, PRODUCTION_QUOTE_SELLER);
    const evidence = (c: typeof priced) => c!.bindings.find(b => b.issueLineId === p1)!.approvalEvidenceId;
    expect(evidence(repriced)).not.toBe(evidence(priced));
  });

  it("issues at the cleared price and refuses a staff amount that differs, through the real quote engine", async () => {
    const ctx = (await harness().built.loadScope(XRI, PRODUCTION_QUOTE_SELLER))!;
    const p1 = productionQuoteLineId(XRI, "p1", "p1-v");
    let n = 0;
    const engine = new AssistedOrderQuoteService({
      repository: new InMemoryAssistedOrderQuoteRepository(),
      requests: { bindingFor: async k => k === ctx.target.requestId ? ctx.binding : null,
        byPublicReference: async r => r === ctx.binding.publicReference ? ctx.binding : null },
      requestLines: { linesFor: async k => k === ctx.target.requestId ? ctx.target.lines : [] },
      audit: { record: async () => undefined }, clock: { now: () => new Date(NOW) },
      ids: { uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` },
    });
    const staff = { actorType: "admin", memberId: null, earlyAccessSessionHash: null, normalizedEmail: null,
      actorLabel: ISSUER, capabilities: new Set(["assisted_orders:manage"]) } as AssistedOrderViewer;
    const validUntil = "2026-11-20T00:00:00.000Z";
    await expect(engine.issue(staff, { requestId: ctx.target.requestId, validUntil,
      lines: [{ requestLineId: p1, unitPriceCents: 1, pricingBasis: "staff" }] })).rejects.toThrow("cannot restate");
    const quote = await engine.issue(staff, { requestId: ctx.target.requestId, validUntil, lines: [{ requestLineId: p1 }] });
    expect(quote.lines[0]).toMatchObject({ unitPriceCents: 1275, priceSource: "catalog" });
    expect(quote.totalCents).toBe(1275);
  });

  it("propagates directory failures instead of treating them as answers", async () => {
    const failing = createProductionQuoteAuthority({
      tenant: "ea-production", issuerId: ISSUER, adminEmail: ADMIN, deliveryEnabled: true,
      requiredAgreements: [{ kind: "early_access_terms", version: "v2" }],
      agreementGate: { accepted: async () => true },
      verifyAccount: async () => ({ email: ADMIN, confirmedAt: "x" }),
      owners: { owns: async () => { throw Error("uncertain"); }, list: async () => [] },
      staffReader: { get: async () => intent() },
      directories: { membersByEmail: async () => { throw Error("unavailable"); },
        bindings: { customerRefsForHistory: async () => ({ refs: [], complete: false }), forCustomer: async () => ({ ok: false }) },
        clearance: { cleared: async () => null } },
    });
    await expect(failing.loadScope(XRI, PRODUCTION_QUOTE_SELLER)).rejects.toThrow("unavailable");
  });

  it("reads the member directory by exact email and refuses a malformed row", async () => {
    const asked: unknown[] = [];
    const db = (data: unknown, error: unknown = null) => ({
      from: (t: string) => ({ select: (c: string) => ({ eq: (k: string, v: string) => ({ limit: async (n: number) => {
        asked.push([t, c, k, v, n]); return { data, error }; } }) }) }),
    });
    expect(await researchMembersByEmail(db([{ id: MEMBER, email: EMAIL, auth_user_id: AUTH, status: "active" }]) as never)(EMAIL))
      .toEqual([{ id: MEMBER, email: EMAIL, authUserId: AUTH, status: "active" }]);
    expect(asked).toEqual([["research_members", "id,email,auth_user_id,status", "email", EMAIL, 2]]);
    await expect(researchMembersByEmail(db(null, { message: "x" }) as never)(EMAIL)).rejects.toThrow();
    await expect(researchMembersByEmail(db([{ id: 1, email: EMAIL, auth_user_id: AUTH, status: "active" }]) as never)(EMAIL)).rejects.toThrow();
  });
});

const production = {
  RENDER: "true", RENDER_SERVICE_ID: "srv-d8s9vej7uimc7384dfcg",
  SUPABASE_URL: "https://yvzeduaxbwgcwllhywff.supabase.co", EA_PRIVATE_QUOTES_ENABLED: "true",
  EA_QUOTE_DATABASE_URL:
    "postgresql://ea_quote_login.yvzeduaxbwgcwllhywff:fixture%40secret@aws-0-us-east-2.pooler.supabase.com:5432/postgres",
  EA_PRIVATE_QUOTE_DESK_ENABLED: "true", EA_PRIVATE_QUOTE_DELIVERY_APPROVED: "true", RESEND_API_KEY: "synthetic-key",
  EA_QUOTE_ISSUER_ID: ISSUER, ADMIN_EMAIL: ADMIN, EA_QUOTE_TAG_KEY: "1".repeat(64),
};
const unexpected = () => { throw Error("unexpected"); };
function mount(env: Record<string, string | undefined>, clearance: unknown = { cleared: unexpected }) {
  const app = express();
  let connects = 0;
  const wiring = {
    env, requiredAgreements: [{ kind: "early_access_terms", version: "v2" }],
    agreementGate: { accepted: unexpected }, supabaseRpc: { rpc: unexpected },
  } as unknown as AssistedOrderProductionWiring;
  const mounted = mountProductionPrivateQuotePortal(app, wiring, { customer: async () => ({
    actorType: "early_access_session", memberId: null, earlyAccessSessionHash: null, normalizedEmail: null, capabilities: new Set(),
  }) as AssistedOrderViewer }, (_req, res) => { res.status(401).end(); }, unexpected, {
    membersByEmail: unexpected, bindings: { customerRefsForHistory: unexpected, forCustomer: unexpected }, clearance: clearance as never,
  }, () => ({ on() {}, connect() { connects++; throw Error("unexpected database access"); } }) as unknown as Pool);
  return { app, mounted, connects: () => connects };
}

describe("production private quote mount", () => {
  it("mounts no portal or issuer while any flag, prerequisite or evidence source is missing", async () => {
    for (const env of [
      { ...production, EA_PRIVATE_QUOTES_ENABLED: undefined },
      { ...production, EA_PRIVATE_QUOTE_DESK_ENABLED: undefined },
      { ...production, EA_PRIVATE_QUOTE_DESK_ENABLED: "1" },
      { ...production, EA_PRIVATE_QUOTE_DELIVERY_APPROVED: undefined },
      { ...production, RESEND_API_KEY: " " },
      { ...production, EA_QUOTE_ISSUER_ID: "not-a-uuid" },
      { ...production, ADMIN_EMAIL: undefined },
      { ...production, EA_QUOTE_TAG_KEY: "short" },
      { ...production, RENDER_SERVICE_ID: "srv-d9h4f4m7r5hc73ctjng0" },
    ]) {
      const { app, mounted, connects } = mount(env);
      expect(mounted).toBe(false);
      await request(app).get("/earlyaccess/quotes").expect(404);
      await request(app).post("/api/staff/early-access/private-quotes/issue").send({}).expect(404);
      expect(connects()).toBe(0);
    }
    const { app, mounted } = mount(production, null);
    expect(mounted).toBe(false);
    await request(app).get("/earlyaccess/quotes").expect(404);
  });

  it("mounts when complete, and refuses a guest session and unauthenticated staff before any data access", async () => {
    const { app, mounted, connects } = mount(production);
    expect(mounted).toBe(true);
    const page = await request(app).get("/earlyaccess/quotes").expect(401);
    expect(page.headers["cache-control"]).toContain("no-store");
    expect(page.text).toContain("Verified access required");
    await request(app).post("/api/staff/early-access/private-quotes/issue").send({}).expect(401);
    expect(connects()).toBe(0);
  });
});
