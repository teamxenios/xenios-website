// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import HomeNext from "./HomeNext";
import { HOME_COPY, HOME_COPY_VERSION, HOME_SEO, type HomeCopySlot } from "./content";
import { HOME_DESTINATIONS } from "./destinations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function renderHome() {
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<HomeNext />));
  return host;
}
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = null; host = null; });

describe("homepage current copy contract", () => {
  it("renders the complete versioned addendum, with consistent repeated actions", async () => {
    const view = await renderHome();
    expect(view.querySelector(".xenios-home-next")?.getAttribute("data-copy-version")).toBe(HOME_COPY_VERSION);
    expect(HOME_COPY_VERSION).toBe("3.0.0");
    const rendered = [...view.querySelectorAll<HTMLElement>("[data-copy]")];
    expect(new Set(rendered.map(node => node.dataset.copy))).toEqual(new Set(Object.keys(HOME_COPY)));
    for (const node of rendered) {
      expect(node.textContent?.replace(/\s+/gu, " ").trim(), node.dataset.copy).toBe(HOME_COPY[node.dataset.copy as HomeCopySlot]);
    }
    expect(HOME_COPY["health.step1"]).toBe("Review and accept the Early Access policy");
    expect(HOME_COPY["infinity.cta"]).toBe("Join the founding-group waitlist");
    expect(view.textContent).not.toContain("access password");
    expect(HOME_SEO.robots).toBe("index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1");
  });

  it("keeps category claims grounded in the existing taxonomy without publishing private listings", async () => {
    const data = JSON.parse(readFileSync("server/research/master-offerings/data/member-safe-master-offerings.generated.json", "utf8")) as { products: { family: string; id: string }[] };
    const families = new Set(data.products.map(product => product.family));
    for (const family of ["clinical_formulations_503a", "research_peptides_materials", "supplements", "topicals_regenerative"]) expect(families.has(family), family).toBe(true);
    const view = await renderHome();
    expect(view.querySelectorAll(".xh-pathway")).toHaveLength(4);
    expect(view.querySelector("img,[data-variant-id],[data-product-id]")).toBeNull();
    expect(view.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(view.querySelector("#xh-research-title")?.closest("section")?.textContent).toContain("For laboratory research");
    const clinical = view.querySelector("#xh-clinical-title")?.closest("section");
    expect(clinical?.textContent).toContain("Explore clinical formulations in a range of product types. Review each listing’s requirements before submitting your selections.");
    expect(clinical?.querySelector(".xh-explanation")?.textContent).toContain("prescribing decision");
    expect(clinical?.querySelector(".xh-explanation")?.textContent).toContain("qualified clinical pathway");
  });

  it("separates current inquiry steps, the full planned vision and software availability", async () => {
    const view = await renderHome();
    expect(view.querySelectorAll("#how-requests ol > li")).toHaveLength(4);
    const vision = view.querySelector(".xh-vision")?.textContent ?? "";
    for (const phrase of ["planned", "qualified clinical care", "diagnostics", "nutrition", "movement", "coaching", "ongoing support", "in development"]) expect(vision).toContain(phrase);
    const infinity = view.querySelector("#infinity")!;
    expect(infinity.textContent).toContain("In development");
    expect(view.querySelector("h1")?.textContent?.replace(/\s+/g," ").trim()).toBe("A more connected future for health.");
    expect(view.textContent).toContain("Proactive, personalized health.");
    expect(view.textContent).toContain("Early Access: peptides & supplements.");
    expect(infinity.textContent).toContain("Software for proactive health & wellness providers.");
    expect(infinity.textContent).toContain("general interest");
    expect(infinity.querySelector('a[href="/waitlist"]')).not.toBeNull();
    expect(infinity.querySelector('a[href="/earlyaccess"]')).toBeNull();
    expect(view.querySelector("#how-requests")?.textContent).not.toMatch(/email|tracking|minutes|within 24/u);
  });

  it("provides scoped company accountability and all twelve practical FAQ answers", async () => {
    const view = await renderHome();
    const privacy = readFileSync("client/src/pages/Privacy.tsx", "utf8");
    expect(privacy).toContain("a Delaware corporation headquartered in Austin, Texas");
    expect(HOME_COPY["trust.company.body"]).toContain("a Delaware corporation headquartered in Austin, Texas");
    expect(view.querySelector(".xh-review a[href='/about']")).not.toBeNull();
    expect(view.querySelectorAll(".xh-faq")).toHaveLength(12);
    for (const disclosure of view.querySelectorAll(".xh-faq,.xh-explanation")) {
      expect(disclosure.tagName).toBe("DETAILS");
      expect(disclosure.firstElementChild?.tagName).toBe("SUMMARY");
      expect(disclosure.querySelector("p")?.textContent?.length).toBeGreaterThan(20);
    }
    expect(view.querySelector("#health")?.textContent).not.toMatch(/all products (?:are )?clinician.reviewed|made in (?:the )?USA|99%|guaranteed/u);
    expect(view.querySelector("dialog,[role='dialog']")).toBeNull();
  });
});

describe("homepage destinations and structure", () => {
  it("uses the real access entry and the four closed category destinations", async () => {
    const view = await renderHome();
    const hrefs = new Set(Object.values(HOME_DESTINATIONS).map(destination => destination.href));
    for (const link of view.querySelectorAll("a")) {
      const href = link.getAttribute("href")!;
      expect(hrefs.has(href) || href === "#xh-main", href).toBe(true);
      expect(href).not.toMatch(/^javascript:/u);
      if (href.startsWith("#")) expect(view.querySelector(href), href).not.toBeNull();
    }
    for (const [destination, category] of [["clinicalRequest", "clinical"], ["researchRequest", "research_peptides"],
      ["supplementsRequest", "supplements"], ["topicalsRequest", "topicals"]]) {
      const link = view.querySelector("[data-destination='" + destination + "']")!;
      expect(link.getAttribute("href")).toBe("/earlyaccess?category=" + category);
      expect(link.getAttribute("aria-describedby")).toBe("xh-shared-entry");
    }
    expect(view.querySelector("#xh-shared-entry")?.textContent).toContain("Early Access policy and contact steps");
    expect(view.querySelector("[data-destination='healthRequest']")?.getAttribute("href")).toBe("/earlyaccess");
    expect(view.querySelector('a[href="/health"],a[href="/tensa"],a[href="/infinity"],a[href*="track"]')).toBeNull();
    expect(view.querySelector("form,input,button,select,textarea")).toBeNull();
  });

  it("keeps meaningful landmarks, anchor targets and the skip link", async () => {
    const view = await renderHome();
    expect(view.querySelector(".xenios-home-next")?.firstElementChild?.getAttribute("href")).toBe("#xh-main");
    expect(view.querySelectorAll("h1")).toHaveLength(1); expect(view.querySelectorAll("main")).toHaveLength(1);
    expect(view.querySelector("main")?.getAttribute("tabindex")).toBe("-1");
    for (const id of ["health", "infinity", "how-requests"]) expect(view.querySelector("#" + id)?.getAttribute("tabindex")).toBe("-1");
    expect(view.querySelector("main [data-copy='partners.body']")).not.toBeNull();
    expect(view.querySelector("footer")?.previousElementSibling?.tagName).toBe("MAIN");
    for (const nav of view.querySelectorAll("nav")) expect(nav.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("approved current offering and brand copy", () => {
  it("names the current offerings, request action, sourcing confirmation and separate Tensa vision", async () => {
    const view = await renderHome();
    expect(view.querySelector("h1")?.textContent?.replace(/\s+/gu, " ").trim())
      .toBe("A more connected future for health.");
    expect(HOME_COPY["hero.eyebrow"]).toBe("BUILT BY XENIOS TECHNOLOGIES");
    expect(view.querySelector(".xh-quality")?.textContent)
      .toBe("U.S.-manufactured. Independently tested by accredited U.S. laboratories.");
    expect(view.querySelector("#xh-health-title")?.textContent).toBe("Tensa Health");
    expect([...view.querySelectorAll(".xh-nav a,.xh-mobile-nav nav a")]
      .filter(link => link.textContent === "Early Access: Peptides & Supplements")
      .map(link => link.getAttribute("href"))).toEqual(["/earlyaccess", "/earlyaccess"]);
    expect(view.querySelector(".xh-hero [data-destination='healthRequest']")?.textContent)
      .toBe("Browse Peptides & Supplements");
    expect(view.querySelector(".xh-hero [data-destination='howRequests']")?.textContent)
      .toBe("How Early Access Works");
    expect([...view.querySelectorAll("#how-requests h4")].map(node => node.textContent))
      .toEqual(["Enter details", "Browse and select", "Submit request", "Team review and next steps"]);
    expect(view.querySelector(".xh-vision")?.textContent).toContain("does not mean every service is available today");
  });
});

describe("homepage native menu", () => {
  it("closes on Escape and restores the summary focus", async () => {
    const view = await renderHome(), menu = view.querySelector<HTMLDetailsElement>(".xh-mobile-nav")!, summary = menu.querySelector("summary")!;
    menu.open = true; menu.querySelector("a")!.focus();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(menu.open).toBe(false); expect(document.activeElement).toBe(summary);
  });
  it("closes after selecting a link and on an outside click", async () => {
    const view = await renderHome(), menu = view.querySelector<HTMLDetailsElement>(".xh-mobile-nav")!;
    menu.open = true; await act(async () => menu.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(menu.open).toBe(false); menu.open = true;
    await act(async () => view.querySelector("h1")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(menu.open).toBe(false);
  });
});
