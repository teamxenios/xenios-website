// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Training from "./Training";

const fixture = vi.hoisted(() => ({ token: "synthetic-member-one" as string | null, resource: { state: "ok", errorMessage: undefined, data: null as unknown, reload: vi.fn() } }));
vi.mock("../../core", () => ({ useResearch: () => ({ memberToken: fixture.token }) }));
vi.mock("../../ui/shells", () => ({ ResearchPartnerShell: ({ children, title, lead }: { children: React.ReactNode; title: string; lead: string }) => <main><h1>{title}</h1><p>{lead}</p>{children}</main> }));
vi.mock("../../ui/kit", () => ({
  ResearchEmptyState: ({ title, body }: { title: string; body: string }) => <div><strong>{title}</strong><p>{body}</p></div>,
  ResearchRouteBoundary: ({ children, state, unavailableTitle, unavailableBody }: { children: React.ReactNode; state: string; unavailableTitle: string; unavailableBody: string }) => state === "ok" ? <>{children}</> : <div role="status"><strong>{unavailableTitle}</strong><p>{unavailableBody}</p></div>,
  ResearchStatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock("../../adapters/partner", () => ({ getPartnerTraining: vi.fn() }));
vi.mock("./shared", () => ({ PARTNER_PENDING_TITLE: "Partner information is not available yet", usePartnerResource: () => fixture.resource }));

let root: Root;
let host: HTMLDivElement;
const render = () => act(async () => root.render(<Training />));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fixture.token = "synthetic-member-one";
  fixture.resource = { state: "ok", errorMessage: undefined, data: { certified: false, modules: [] }, reload: vi.fn() };
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("partner training copy and evidence boundaries", () => {
  it("describes customer access without a paid membership and does not promise certification", async () => {
    await render();
    expect(host.textContent).toContain("without a paid membership prerequisite");
    expect(host.textContent).toContain("reviewed with identity, tax, payout, and agreement evidence");
    expect(host.textContent).not.toContain("$50");
    expect(host.textContent).not.toContain("membership costs");
    expect(host.textContent).not.toContain("unlock the certification check");
  });

  it("renders only canonical module completion data and stays honest when unavailable", async () => {
    fixture.resource = { state: "ok", errorMessage: undefined, data: { certified: true, modules: [{ id: "m1", title: "Current rules", completed: true, completedAt: "2026-09-05" }] }, reload: vi.fn() };
    await render();
    expect(host.textContent).toContain("Current rules");
    expect(host.textContent).toContain("Completed 2026-09-05");
    fixture.resource = { state: "unavailable", errorMessage: undefined, data: null, reload: vi.fn() };
    await render();
    expect(host.textContent).toContain("Partner information is not available yet");
    expect(host.textContent).not.toContain("Current rules");
  });
});
