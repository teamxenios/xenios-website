// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";

const fixture = vi.hoisted(() => ({ token: "synthetic-member-one" as string | null, resource: { state: "ok", errorMessage: undefined, data: null as unknown, reload: vi.fn() }, capabilities: new Map() }));
vi.mock("../../core", () => ({ useResearch: () => ({ memberToken: fixture.token }) }));
vi.mock("../../ui/shells", () => ({ ResearchPartnerShell: ({ children, title, lead }: { children: React.ReactNode; title: string; lead: string }) => <main><h1>{title}</h1><p>{lead}</p>{children}</main> }));
vi.mock("../../ui/kit", () => ({
  ResearchCapabilityBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ResearchRouteBoundary: ({ children, state, unavailableTitle, unavailableBody }: { children: React.ReactNode; state: string; unavailableTitle: string; unavailableBody: string }) => state === "ok" ? <>{children}</> : <div role="status"><strong>{unavailableTitle}</strong><p>{unavailableBody}</p></div>,
  ResearchStatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
  capabilityStatusOrPending: () => ({ state: "enabled", publicMessage: "available" }),
}));
vi.mock("../../adapters/partner", () => ({ getPartnerOnboarding: vi.fn() }));
vi.mock("./shared", () => ({ PARTNER_PENDING_BODY: "Partner information is not available yet", PARTNER_PENDING_TITLE: "Partner information is not available yet", usePartnerCapabilities: () => fixture.capabilities, usePartnerResource: () => fixture.resource }));

let root: Root;
let host: HTMLDivElement;
const render = () => act(async () => root.render(<Onboarding />));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fixture.token = "synthetic-member-one";
  fixture.capabilities = new Map();
  fixture.resource = { state: "ok", errorMessage: undefined, data: { verification: { state: "pending" }, agreements: [] }, reload: vi.fn() };
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("partner onboarding requirements", () => {
  it("makes certification and activation prerequisites explicit without a fee", async () => {
    await render();
    expect(host.textContent).toContain("reviewed evidence are required before activation");
    expect(host.textContent).toContain("before certification and activation");
    expect(host.textContent).toContain("No fee or payment is required");
    expect(host.textContent).not.toContain("before your first payout, never before");
    expect(host.textContent).not.toContain("membership costs");
  });

  it("does not invent a live status when the canonical onboarding read is unavailable", async () => {
    fixture.resource = { state: "unavailable", errorMessage: undefined, data: null, reload: vi.fn() };
    await render();
    expect(host.textContent).toContain("Partner information is not available yet");
    expect(host.textContent).not.toContain("Not started");
  });
});
