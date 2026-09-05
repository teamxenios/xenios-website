// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPortalShell } from "./AccountPortalShell";
import { ResearchContext, type ResearchContextValue } from "../core";
import { getPartnerSelf, type OwnedPartnerWorkspace } from "../adapters/partner";
import type { ApiResult } from "../lib/api";

vi.mock("../core", async () => {
  const { createContext } = await import("react");
  return { ResearchContext: createContext(null) };
});
vi.mock("../adapters/partner", () => ({ getPartnerSelf: vi.fn() }));

type Result = ApiResult<{ partner: OwnedPartnerWorkspace }>;
const relation: Result = { kind: "ok", data: { partner: {
  partnerId: "synthetic-partner-a", role: "affiliate", state: "active", certified: true, active: true,
} } };
let root: Root;
let container: HTMLDivElement;
const signOutMember = vi.fn(async () => {});

function render(token: string | null) {
  const memory = memoryLocation({ path: "/research/account", static: true });
  return act(async () => root.render(
    <ResearchContext.Provider value={{ memberToken: token, signOutMember } as unknown as ResearchContextValue}>
      <Router hook={memory.hook}>
        <AccountPortalShell title="Your account" lead="Synthetic account view"><p>Own commerce history</p></AccountPortalShell>
      </Router>
    </ResearchContext.Provider>,
  ));
}
const partnerLink = () => container.querySelector('a[href="/research/partners/dashboard"]');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.mocked(getPartnerSelf).mockReset();
  signOutMember.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("canonical account partner navigation", () => {
  it("keeps the customer journey useful without inferring a partner relationship", async () => {
    vi.mocked(getPartnerSelf).mockResolvedValue({ kind: "denied", code: "partner_not_found" });
    await render("synthetic-customer-a");
    expect(partnerLink()).toBeNull();
    expect(container.textContent).not.toContain("Partner access not confirmed");
    expect(container.querySelector('a[href="/research/member/catalog"]')?.textContent).toBe("Browse products");
    expect(container.querySelector('a[href="/research/account/orders"]')).not.toBeNull();
    expect(container.querySelector('a[href="/research/account/support"]')).not.toBeNull();
    expect(container.querySelector('a[href="/research/account/subscription"]')?.textContent).toBe("Billing history");
    expect(container.textContent).not.toMatch(/Membership|activate.*\$|pay.*access/);
    expect(container.textContent).toContain("Own commerce history");
  });

  it("shows the workspace only after the server returns an owned relationship", async () => {
    const pending = deferred<Result>();
    vi.mocked(getPartnerSelf).mockReturnValue(pending.promise);
    await render("synthetic-partner-a");
    expect(partnerLink()).toBeNull();
    expect(container.textContent).toContain("Checking partner access");
    await act(async () => pending.resolve(relation));
    expect(partnerLink()?.textContent).toBe("Partner workspace");
    expect(getPartnerSelf).toHaveBeenCalledWith("synthetic-partner-a");
    expect(container.textContent).not.toContain("synthetic-partner-a");
    expect(container.textContent).not.toMatch(/earning|approved|commission/i);
    expect(container.querySelector('a[href="/research/partners/links"]')).toBeNull();
  });

  it("does not turn certification or activation into earning authority", async () => {
    vi.mocked(getPartnerSelf).mockResolvedValue({ kind: "ok", data: { partner: {
      partnerId: "synthetic-partner-b", role: "organization_partner", state: "suspended", certified: true, active: false,
    } } });
    await render("synthetic-partner-b");
    expect(partnerLink()?.textContent).toBe("Partner workspace");
    expect(container.textContent).not.toMatch(/earning|approved|commission/i);
    expect(container.querySelector('a[href*="organizations/"]')).toBeNull();
  });

  it.each<Result>([{ kind: "unavailable" }, { kind: "unauthorized" }, { kind: "forbidden" },
    { kind: "error", message: "temporary failure" }])("preserves uncertainty for %j without breaking commerce", async result => {
    vi.mocked(getPartnerSelf).mockResolvedValue(result);
    await render("synthetic-a");
    expect(partnerLink()).toBeNull();
    expect(container.textContent).toContain("Partner access not confirmed");
    expect(container.textContent).toContain("Own commerce history");
  });

  it("does not request partner data while signed out", async () => {
    await render(null);
    expect(getPartnerSelf).not.toHaveBeenCalled();
    expect(partnerLink()).toBeNull();
  });

  it("removes A's workspace on an A-to-B switch and ignores A's delayed response", async () => {
    const pendingA = deferred<Result>();
    const pendingB = deferred<Result>();
    vi.mocked(getPartnerSelf).mockImplementation(token => token === "synthetic-a" ? pendingA.promise : pendingB.promise);
    await render("synthetic-a");
    await render("synthetic-b");
    await act(async () => pendingA.resolve(relation));
    expect(partnerLink()).toBeNull();
    await act(async () => pendingB.resolve({ kind: "denied", code: "partner_not_found" }));
    expect(partnerLink()).toBeNull();
  });

  it("removes a loaded relationship on sign-out", async () => {
    vi.mocked(getPartnerSelf).mockResolvedValue(relation);
    await render("synthetic-a");
    expect(partnerLink()).not.toBeNull();
    await render(null);
    expect(partnerLink()).toBeNull();
  });
});
