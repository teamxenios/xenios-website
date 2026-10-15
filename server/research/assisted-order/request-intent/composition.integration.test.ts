import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("proposed request-intent integration source bindings (not browser execution)", () => {
  it("routes only the entry to the mode-selecting component and preserves existing reference routes", () => {
    const section = read("client/src/research/section.tsx");
    expect(section).toContain('import("./assisted-order/OrderRequestEntry")');
    expect(section).toContain('<Route path="/research/early-access/order-request">');
    expect(section).toContain('<Route path="/research/early-access/order-request/confirmation/:publicReference">');
    expect(section).toContain('<Route path="/research/early-access/order-request/:publicReference">');
    expect(section).toContain("component={AssistedOrderConfirmationPage}");
    expect(section).toContain("component={AssistedOrderStatusPage}");
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
