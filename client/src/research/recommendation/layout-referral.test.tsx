// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ResearchLayout from "../layout";
import { RequireMember } from "../pages/MemberArea";

const state = vi.hoisted(() => ({ member: null as null | { firstName: string; status: string }, memberChecking: false, memberToken: null, gate: "locked", signOutMember: vi.fn() }));
let root: Root | null = null;
function render(content: React.ReactNode) { const container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); act(() => root!.render(content)); }
vi.mock("../core", () => ({ useResearch: () => state }));
vi.mock("../pages/PublicEditorialNav", () => ({ PublicEditorialNav: () => null, PublicEditorialFooter: () => null }));
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); state.member = null; });

describe("referral destinations reach their existing member guard, not the shared reviewer password", () => {
  it.each(["/research/member/catalog", "/research/member/products/synthetic-product"])("signed out %s restores canonical sign-in intent", async (path) => {
    window.history.replaceState(null, "", path);
    const location = memoryLocation({ path, record: true });
    render(<Router hook={location.hook}><ResearchLayout><RequireMember><div>Private destination</div></RequireMember></ResearchLayout></Router>);
    await vi.waitFor(() => expect(location.history.at(-1)).toBe(`/research/sign-in?returnTo=${encodeURIComponent(path)}`));
    expect(document.body.textContent).not.toContain("Private destination");
    expect(document.querySelector('[id="research-password"]')).toBeNull();
  });
  it("signed-in member reaches the private destination", () => {
    state.member = { firstName: "Synthetic", status: "active" };
    const location = memoryLocation({ path: "/research/member/catalog" });
    render(<Router hook={location.hook}><ResearchLayout><RequireMember><div>Private destination</div></RequireMember></ResearchLayout></Router>);
    expect(document.body.textContent).toContain("Private destination");
  });
  it.each(["/research/partners/links", "/research/partners/dashboard"])("%s reaches its own partner boundary without a reviewer password", (path) => {
    const location = memoryLocation({ path });
    render(<Router hook={location.hook}><ResearchLayout><div>Partner-owned boundary</div></ResearchLayout></Router>);
    expect(document.body.textContent).toContain("Partner-owned boundary");
    expect(document.querySelector('[id="research-password"]')).toBeNull();
    const main = document.querySelectorAll("main");
    expect(main).toHaveLength(1);
    expect(main[0]?.textContent).toContain("Partner-owned boundary");
  });
  it.each(["/research/member/cart", "/research/member/products", "/research/member/products/a/extra", "/research/partners/dashboard/extra", "/research/partners/commissions", "/research/partners/links/extra"])("unrelated %s retains the review gate", (path) => {
    const location = memoryLocation({ path });
    render(<Router hook={location.hook}><ResearchLayout><div>Unrelated private content</div></ResearchLayout></Router>);
    expect(document.body.textContent).not.toContain("Unrelated private content");
    expect(document.querySelector('[id="research-password"]')).not.toBeNull();
  });
});
