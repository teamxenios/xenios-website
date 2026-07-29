// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  ResearchAdminShell,
  ResearchAppShell,
  ResearchMemberShell,
  ResearchPartnerShell,
  ResearchPublicShell,
} from "./shells";

// The member/partner/public shells compose inside layout.tsx's MemberChrome
// or MinimalChrome (out of this lease), which already render the page's one
// <main>. If a shell also rendered its own <main>, assistive tech would
// report two "main" regions on one page, so those three now wrap content in
// a plain <div>. ResearchAdminShell is the one exception: /admin/research
// mounts standalone (App.tsx -> adminx-section.tsx) with no such wrapper, so
// its <main> is the page's only landmark and stays a real <main>.

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    unmount: () => act(() => root.unmount()),
  };
}

describe("research shells never nest a second main landmark", () => {
  it("ResearchMemberShell renders content in a div, not a main", () => {
    const view = render(
      <ResearchMemberShell title="Home">
        <p data-testid="content">member content</p>
      </ResearchMemberShell>,
    );
    expect(view.host.querySelector("main")).toBeNull();
    expect(view.host.querySelector('[data-testid="content"]')).not.toBeNull();
    expect(view.host.querySelector("nav[aria-label='Member areas']")).not.toBeNull();
    view.unmount();
  });

  it("ResearchPartnerShell renders content in a div, not a main", () => {
    const view = render(
      <ResearchPartnerShell title="Dashboard">
        <p data-testid="content">partner content</p>
      </ResearchPartnerShell>,
    );
    expect(view.host.querySelector("main")).toBeNull();
    expect(view.host.querySelector('[data-testid="content"]')).not.toBeNull();
    view.unmount();
  });

  it("ResearchAdminShell keeps its own main: /admin/research mounts standalone with no outer layout main to nest inside", () => {
    const view = render(
      <ResearchAdminShell title="Products">
        <p data-testid="content">admin content</p>
      </ResearchAdminShell>,
    );
    expect(view.host.querySelectorAll("main")).toHaveLength(1);
    expect(view.host.querySelector('[data-testid="content"]')).not.toBeNull();
    view.unmount();
  });

  it("ResearchPublicShell (and its ResearchAppShell alias) render content in a div, not a main", () => {
    const view = render(
      <ResearchPublicShell eyebrow="Public" title="Sign in">
        <p data-testid="content">public content</p>
      </ResearchPublicShell>,
    );
    expect(view.host.querySelector("main")).toBeNull();
    expect(view.host.querySelector('[data-testid="content"]')).not.toBeNull();
    view.unmount();

    expect(ResearchAppShell).toBe(ResearchPublicShell);
  });
});
