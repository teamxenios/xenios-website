import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import type { AssistedOrderViewer } from "../../assisted-order/ports";
import { createQuickOrderProductionPorts, type QuickOrderProductionWiring } from "./production";
import { quickOrderAgreements } from "./legal";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../../shared/research/assisted-order/form";
import { publishedResearchUsePolicyAgreement } from "../../policies-data";
import type { QuickOrderDisabledTransactionExtension } from "./ports";

vi.mock("../../rate-limit", () => ({ rateLimitHit: vi.fn(async () => true), requestIp: () => "127.0.0.1" }));
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
  it("captures the candidate clock before authentication while keeping both production gates disabled", async () => {
    let clock = 0;
    const beginAttempt = vi.fn((_viewer, _actorId, enteredAtMonotonicMs) => Object.freeze({ enteredAtMonotonicMs }));
    const commitAttempt = vi.fn(async () => { throw new Error("synthetic admission refused"); });
    const candidate: QuickOrderDisabledTransactionExtension = {
      monotonicNow: () => clock, beginAttempt, commitAttempt,
      getExisting: vi.fn(async () => null), commit: vi.fn(async () => { throw new Error("attempt required"); }),
    };
    const { ports } = fixture({
      assistedOrderExtension: candidate,
      viewers: { customer: async () => { clock = 3500; return viewer; } },
      approvedHealthAgreementPairs: [pair],
    });
    const session = (await ports.session(request()))!;
    expect(beginAttempt).toHaveBeenCalledWith(viewer, `member:${viewer.authUserId}`, 0);
    expect(Object.keys(session).sort()).toEqual(["actorId", "csrfToken"]);
    expect(ports.productionReady).toBe(false);
    expect((await ports.config(session)).enabled).toBe(false);
    await expect(ports.commit(session, {} as never)).rejects.toThrow("synthetic admission refused");
    expect(commitAttempt).toHaveBeenCalledWith(viewer, session.actorId, {}, { enteredAtMonotonicMs: 0 });
    expect(candidate.commit).not.toHaveBeenCalled();
  });
  it("refuses missing candidate private proof but still permits actor-scoped recovery", async () => {
    const getExisting = vi.fn(async () => null), commitAttempt = vi.fn();
    const candidate: QuickOrderDisabledTransactionExtension = {
      monotonicNow: () => 0, beginAttempt: () => null, commitAttempt,
      getExisting, commit: vi.fn(),
    };
    const { ports } = fixture({ assistedOrderExtension: candidate });
    const session = (await ports.session(request()))!;
    await expect(ports.commit(session, {} as never)).rejects.toThrow("not qualified");
    expect(commitAttempt).not.toHaveBeenCalled();
    await expect(ports.getExisting(session, "synthetic-key-0001")).resolves.toBeNull();
    expect(getExisting).toHaveBeenCalledWith(viewer, session.actorId, "synthetic-key-0001");
    expect(ports.productionReady).toBe(false);
    expect((await ports.config(session)).enabled).toBe(false);
  });
});
