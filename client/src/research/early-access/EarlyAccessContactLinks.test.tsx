// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EarlyAccessCatalogNavigation, EarlyAccessContactLinks } from "./EarlyAccessContactLinks";
import { EARLY_ACCESS_INTERESTS, earlyAccessInterestHref } from "./early-access-contacts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const destinations = [
  "https://xeniostechnology.com", "https://xeniostechnology.com/earlyaccess",
  "https://calendly.com/team-xeniostechnology/30min", "mailto:team@xeniostechnology.com",
  "https://www.instagram.com/officialxenios/", "https://x.com/xenioshealth",
  "https://www.linkedin.com/company/officialxenios", "https://www.facebook.com/people/Xenios/61590788618749/",
  "tel:+17374186381", "mailto:samuel@xeniostechnology.com", "tel:+19704153774", "mailto:seth@xeniostechnology.com",
];

describe("shared Early Access contacts", () => {
  it.each([false, true])("keeps all twelve exact destinations in the compact=%s surface", async compact => {
    await act(async () => root.render(<EarlyAccessContactLinks compact={compact} />));
    const links = [...host.querySelectorAll("a")];
    expect(links.map(link => link.getAttribute("href")).sort()).toEqual([...destinations].sort());
    expect(links.every(link => Boolean(link.textContent?.trim()))).toBe(true);
    for (const link of links) {
      if (link.href.startsWith("https:")) {
        expect(link.target).toBe("_blank");
        expect(link.rel.split(" ")).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
        expect(link.textContent).toContain("opens in a new tab");
      } else expect(link.target).toBe("");
    }
    expect(host.textContent).toContain("Booking is not a medical appointment");
    if (compact) expect(host.querySelector("details > summary")?.textContent).toContain("Talk to the Xenios team");
  });

  it("updates the live count and delegates viewing to the existing cart callback", async () => {
    const onViewCart = vi.fn();
    await act(async () => root.render(<EarlyAccessCatalogNavigation count={0} onViewCart={onViewCart} />));
    const button = host.querySelector("button")!;
    expect(button.textContent).toBe("Quote cart (0)");
    await act(async () => root.render(<EarlyAccessCatalogNavigation count={3} onViewCart={onViewCart} />));
    expect(host.querySelector("button")).toBe(button);
    expect(button.textContent).toBe("Quote cart (3)");
    expect(button.querySelector('[aria-live="polite"]')?.textContent).toBe("(3)");
    await act(async () => button.click());
    expect(onViewCart).toHaveBeenCalledExactlyOnceWith();
    await act(async () => root.render(<EarlyAccessCatalogNavigation count={3} />));
    expect(host.querySelector("button")).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Quote cart (3)");
  });

  it("routes all six interests to a team conversation without patient data or product selection", () => {
    expect(EARLY_ACCESS_INTERESTS).toEqual(["Weight management", "Sleep", "Recovery", "Muscle and strength", "Skin and hair", "Energy"]);
    for (const interest of EARLY_ACCESS_INTERESTS) {
      const href = earlyAccessInterestHref(interest);
      expect(href).toBe("mailto:team@xeniostechnology.com?subject=" + encodeURIComponent("Early Access conversation: " + interest));
      expect(href).not.toMatch(/body=|variant|patient|prescription|utm_/i);
    }
  });
});
