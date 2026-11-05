// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOrderSummaryDto } from "@shared/research/commerce-api";
import type { ApiResult } from "../../lib/api";

const scope = vi.hoisted(() => ({ token: "synthetic-A", frames: [] as string[] }));
const adapter = vi.hoisted(() => ({ listOrders: vi.fn() }));
vi.mock("../../adapters/adminOps", () => ({ listOrders: adapter.listOrders }));
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: () => { throw new Error("Unexpected real Auth"); } }));
vi.mock("./AdminResearchHome", async importOriginal => {
  const original = await importOriginal<typeof import("./AdminResearchHome")>();
  const { useLayoutEffect } = await import("react");
  return { ...original, AdminScreen: function SyntheticScreen({ children }: { children: (token: string) => ReactNode }) {
    // Observe the committed UI before passive loading effects can hide a
    // previous token's data. A final settled-DOM assertion would miss this.
    useLayoutEffect(() => { scope.frames.push(document.body.textContent ?? ""); }, [scope.token]);
    return <>{children(scope.token)}</>;
  } };
});
import OrdersAdmin from "./OrdersAdmin";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
type Result = ApiResult<{ orders: AdminOrderSummaryDto[] }>;
function pending() { let resolve!: (value: Result) => void; const promise = new Promise<Result>(r => { resolve = r; }); return { promise, resolve }; }
function row(id: string): AdminOrderSummaryDto { return { orderId: id, memberId: "synthetic-member-" + id, state: "payment_captured", totalCents: 12345, capturedAmountCents: 12345, placedAt: "2026-11-02T10:00:00Z", updatedAt: "2026-11-02T10:00:00Z", reviewTriggers: [] }; }
function ok(id: string): Result { return { kind: "ok", data: { orders: [row(id)] } }; }
async function render(token: string) { scope.token = token; await act(async () => { root.render(<OrdersAdmin />); }); }
beforeEach(() => { scope.token = "synthetic-A"; scope.frames = []; adapter.listOrders.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external request"); })); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("admin order queue token ownership", () => {
  it("shows current order evidence and its detail link", async () => {
    adapter.listOrders.mockResolvedValue(ok("A-private-order")); await render("synthetic-A");
    expect(host.textContent).toContain("A-private-order");
    expect(host.textContent).toContain("Payment received");
    expect(host.querySelector('a[href="/admin/research/orders/A-private-order"]')).not.toBeNull();
    expect(adapter.listOrders).toHaveBeenCalledExactlyOnceWith("synthetic-A");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never commits the previous token's rows while the replacement token read is pending", async () => {
    const b = pending(); adapter.listOrders.mockResolvedValueOnce(ok("A-private-order")).mockReturnValueOnce(b.promise);
    await render("synthetic-A"); expect(host.textContent).toContain("A-private-order");
    await render("synthetic-B");
    expect(scope.frames.at(-1)).not.toContain("A-private-order");
    expect(host.textContent).not.toContain("No orders in this queue");
    await act(async () => { b.resolve(ok("B-private-order")); });
    expect(host.textContent).toContain("B-private-order"); expect(host.textContent).not.toContain("A-private-order");
    expect(adapter.listOrders.mock.calls.map(args => args[0])).toEqual(["synthetic-A", "synthetic-B"]);
  });
  it("does not carry an earlier token's failure into the replacement token's committed frame", async () => {
    const b = pending(); adapter.listOrders.mockResolvedValueOnce({ kind: "error", message: "Earlier-token diagnostic" }).mockReturnValueOnce(b.promise);
    await render("synthetic-A"); expect(host.textContent).toContain("Earlier-token diagnostic");
    await render("synthetic-B"); expect(scope.frames.at(-1)).not.toContain("Earlier-token diagnostic");
    await act(async () => { b.resolve({ kind: "forbidden", message: "Synthetic current refusal" }); });
    expect(host.textContent).toContain("Access denied"); expect(host.textContent).not.toContain("No orders in this queue");
  });
  it("discards an old token's late result after the current token has been refused", async () => {
    const a = pending(); adapter.listOrders.mockReturnValueOnce(a.promise).mockResolvedValueOnce({ kind: "unauthorized" });
    await render("synthetic-A"); await render("synthetic-B");
    await act(async () => { a.resolve(ok("A-late-private-order")); });
    expect(host.textContent).toContain("Your admin session has ended");
    expect(host.textContent).not.toContain("A-late-private-order");
  });
  it("starts the replacement token with its own queue and search state", async () => {
    adapter.listOrders.mockImplementation(async (token: string) => ok(token === "synthetic-A" ? "A-private-order" : "B-private-order"));
    await render("synthetic-A");
    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "A-private-order");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await render("synthetic-B");
    expect((host.querySelector('input[type="search"]') as HTMLInputElement).value).toBe("");
    expect(host.textContent).toContain("B-private-order");
  });
});
