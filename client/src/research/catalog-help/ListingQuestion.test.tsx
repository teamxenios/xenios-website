// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ListingQuestion } from "./ListingQuestion";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Operational question for an exact listing", () => {
  it("builds an editable email draft, never submits or stores a question, and carries no variant across a selection change", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const storeSpy = vi.spyOn(Storage.prototype, "setItem");
    const submitSpy = vi.fn((event: Event) => { event.preventDefault(); });
    const first = "mov_aaaaaaaaaaaaaaaaaaaa", next = "mov_bbbbbbbbbbbbbbbbbbbb";
    const draw = (id: string) => act(async () => {
      root.render(<form onSubmit={(event) => submitSpy(event.nativeEvent)}><ListingQuestion key={id} variantReference={id} /></form>);
    });
    try {
      await draw(first);
      const summary = host.querySelector("summary")!;
      expect(summary.textContent?.trim()).toBe("Ask about this item");
      await act(async () => { summary.click(); });
      expect(host.querySelector("details")!.open).toBe(true);
      const menu = host.querySelector("select")!;
      await act(async () => { menu.value = "package"; menu.dispatchEvent(new Event("change", { bubbles: true })); });
      const draft = new URL(host.querySelector("a")!.href);
      expect(draft.protocol).toBe("mailto:");
      expect(draft.pathname).toBe("research@xeniostechnology.com");
      expect(draft.searchParams.get("body")).toContain(first);
      expect(draft.searchParams.get("body")).toContain("Package or availability");
      expect(host.querySelector("code")!.textContent).toBe(first);
      await draw(next);
      expect(host.querySelector("details")!.open).toBe(false);
      expect(host.querySelector("select")!.value).toBe("listing");
      expect(host.querySelector("a")!.href).toContain(next);
      expect(host.textContent + host.querySelector("a")!.href).not.toContain(first);
      await draw("unverified");
      expect(host.querySelector("code")).toBeNull();
      expect(host.querySelector("a")!.href).not.toContain("unverified");
      expect(host.textContent).toContain("research@xeniostechnology.com");
      // The topic menu stays inside its box at any text size and is set in 16px text,
      // so a phone does not zoom the page when it is tapped.
      const topicMenu = host.querySelector("select")!;
      for (const name of ["w-full", "min-w-0", "max-w-full", "text-base"]) expect(topicMenu.className.split(" ")).toContain(name);
      expect(topicMenu.closest("label")!.className).toContain("grid-cols-[minmax(0,1fr)]");
      expect(submitSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(storeSpy).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
      vi.restoreAllMocks();
    }
  });
});
