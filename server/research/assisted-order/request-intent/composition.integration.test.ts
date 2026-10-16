import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("proposed request-intent integration source bindings (not browser execution)", () => {
  it("routes only the entry through the canonical request-only session shell and preserves reference routes", () => {
    const section = read("client/src/research/section.tsx");
    expect(read("client/src/research/early-access/EarlyAccessRoute.tsx")).toContain('import("../assisted-order/OrderRequestEntry")');
    expect(section).toContain('<Route path="/research/early-access/order-request">');
    expect(section).toContain('<L component={EarlyAccessRoute} props={{ requestOnly: true }} />');
    expect(section).toContain('<Route path="/research/early-access">{() => <L component={EarlyAccessRoute} />}</Route>');
    expect(section).toContain('<Route path="/research/early-access/order-request/confirmation/:publicReference">');
    expect(section).toContain('<Route path="/research/early-access/order-request/:publicReference">');
    expect(section).toContain("component={AssistedOrderConfirmationPage}");
    expect(section).toContain("component={AssistedOrderStatusPage}");
  });
  it("keeps request-only rendering on canonical anonymous session and legal standing without legacy checkout", () => {
    const source = read("client/src/research/early-access/EarlyAccessRoute.tsx");
    const requestOnly = source.slice(source.indexOf("  if (requestOnly) {"), source.indexOf("  return (", source.indexOf("  if (requestOnly) {")));
    expect(requestOnly).toContain('state.kind !== "authenticated"');
    expect(requestOnly).toContain('requestMode.kind !== "mixed"');
    expect(requestOnly).toContain('prior === "legacy" || prior === "blocked"');
    expect(requestOnly).toContain("<EarlyAccessAgreementSection onAccepted={setAgreed} onBlocked={setBlocked}");
    expect(requestOnly).toContain("continuationEnabled={agreed && blocked === null}");
    expect(requestOnly).toContain("<FullCanonicalCatalog mode={requestMode} embedded");
    for (const component of ["EarlyAccessUnlockForm", "EarlyAccessCartMount", "EarlyAccessCheckoutJourney", "EarlyAccessCatalogSection"]) {
      expect(requestOnly).not.toContain("<" + component);
    }
    expect(source).toContain("body?.openAccess === true");
    expect(source).toContain("await readJson(opened)");
    expect(source).toContain("const recheckSession = useCallback");
    expect(source).toContain("clearEarlyAccessCustomerStorage()");
  });
  it("registers optional request intents only after all ten existing assisted doors", () => {
    const server = read("server/index.ts");
    const call = server.indexOf("registerRequestIntentApi(app, assistedOrderWiring, assistedOrderViewers, careAccess);");
    expect(call).toBeGreaterThan(0);
    const legacy = [...server.matchAll(/app\.(?:get|post|patch)\("\/api\/(?:admin\/research|research\/early-access)\/assisted-orders[^"]*"/g)];
    expect(legacy).toHaveLength(10);
    for (const match of legacy) expect(match.index).toBeLessThan(call);
  });
  it("keeps the mixed mode shared between storefront CTA and entry without rewriting accepted recovery modules", () => {
    const storefront = read("client/src/research/early-access/EarlyAccessRoute.tsx");
    expect(storefront).toContain("<OrderRequestCta mode={requestMode}");
    expect(storefront).toContain("mode={requestMode}");
    const door = read("client/src/research/assisted-order/OrderRequestEntry.tsx");
    expect(door).toContain('import("./AssistedOrderPage")');
    expect(door).toContain('import("./RequestIntentEntry")');
    expect(door).toContain("readOrderRequestContinuity(window.sessionStorage)");
    expect(door).not.toContain("removeItem");
    expect(door).not.toContain("clearAssistedOrderDraft");
  });
});
