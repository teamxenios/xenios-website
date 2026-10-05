import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import type { AssistedOrderViewer } from "../../research/assisted-order/ports";
import { createQuickOrderProductionPorts, type QuickOrderProductionWiring } from "./production";
import { quickOrderAgreements } from "./legal";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../shared/research/assisted-order/form";
import { publishedResearchUsePolicyAgreement } from "../../research/policies-data";

vi.mock("../../research/rate-limit", () => ({ rateLimitHit: vi.fn(async () => true), requestIp: () => "127.0.0.1" }));
const viewer: AssistedOrderViewer = {
  actorType: "member", memberId: "member-synthetic", authUserId: "00000000-0000-4000-8000-000000000001",
  earlyAccessSessionHash: null, normalizedEmail: "synthetic@example.test",
  capabilities: new Set(["assisted_orders:submit"]),
};
const pair = publishedResearchUsePolicyAgreement()!;
const config = { enabled: true, code: null, formId: "assisted_order_form_v1", requiredAgreements: [pair], formAcknowledgments: [] } as const;
function fixture(overrides: Partial<QuickOrderProductionWiring> = {}) {
  const wiring: QuickOrderProductionWiring = {
    viewers: { customer: vi.fn(async () => viewer) },
    service: { config: vi.fn(async () => config) },
    catalog: { listCatalog: vi.fn(), resolveItem: vi.fn() },
    csrfSecret: "synthetic-only-test-secret-with-32-bytes",
    approvedHealthAgreementPairs: [], assistedOrderExtension: null,
    ...overrides,
  };
  return { wiring, ports: createQuickOrderProductionPorts(wiring) };
}
const request = (bearer = "synthetic-session-a") => ({ headers: { authorization: `Bearer ${bearer}` }, method: "GET" }) as Request;

describe("Quick Order concrete canonical bindings", () => {
  it("cannot activate through a readiness flag or existing bridge legal set", async () => {
    const { ports } = fixture({ approvedHealthAgreementPairs: [pair] });
    const session = (await ports.session(request()))!;
    expect(ports.productionReady).toBe(false);
    expect((await ports.config(session)).enabled).toBe(false);
    await expect(ports.commit(session, {} as never)).rejects.toThrow("not qualified");
    await expect(ports.getExisting(session, "synthetic-key-0001")).rejects.toThrow("replay unavailable");
  });
  it("uses canonical actor identity and scopes CSRF to the verified session", async () => {
    const { ports } = fixture();
    const a = (await ports.session(request()))!;
    const b = (await ports.session(request("synthetic-session-b")))!;
    expect(a.actorId).toBe(`member:${viewer.authUserId}`);
    expect(a.actorId).toBe(b.actorId);
    expect(a.csrfToken).not.toBe(b.csrfToken);
    expect(a.csrfToken).toBe((await ports.session(request()))!.csrfToken);
    await expect(ports.config({ ...a })).rejects.toThrow("session unavailable");
  });
  it("refuses missing credentials, guest identity, capability or signing secret", async () => {
    expect(await fixture().ports.session({ headers: {}, method: "GET" } as Request)).toBeNull();
    expect(await fixture({ csrfSecret: null }).ports.session(request())).toBeNull();
    const anonymous = { ...viewer, actorType: "early_access_session" as const, memberId: null, authUserId: null, capabilities: new Set<never>() };
    expect(await fixture({ viewers: { customer: async () => anonymous } }).ports.session(request())).toBeNull();
  });
  it("passes the canonical viewer to catalog and actor-scoped receipt recovery", async () => {
    const getExisting = vi.fn(async () => null);
    const { ports, wiring } = fixture({ assistedOrderExtension: { getExisting, commit: vi.fn() } });
    const session = (await ports.session(request()))!;
    const query = { page: 2, pageSize: 24, search: "synthetic" };
    await ports.listCatalog(session, query);
    expect(wiring.catalog.listCatalog).toHaveBeenCalledWith(viewer, query);
    await ports.getExisting(session, "synthetic-key-0001");
    expect(getExisting).toHaveBeenCalledWith(viewer, session.actorId, "synthetic-key-0001");
  });
  it("requires separate Health legal applicability and reuses canonical acknowledgment bytes", () => {
    expect(quickOrderAgreements(config, [])).toBeNull();
    expect(quickOrderAgreements({ ...config, requiredAgreements: [{ kind: "demo_terms", version: "v1" }] }, [{ kind: "demo_terms", version: "v1" }])).toBeNull();
    const agreements = quickOrderAgreements(config, [pair])!;
    expect(agreements[0]).toMatchObject({ ...pair, type: "legal", url: "/research/policies/research-use" });
    for (const ack of requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: false })) {
      expect(agreements).toContainEqual({ ...assistedOrderFormPair(ack), label: ack.copy, url: null, type: "form_acknowledgment" });
    }
  });
});
