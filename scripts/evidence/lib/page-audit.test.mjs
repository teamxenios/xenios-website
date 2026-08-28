// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { FOCUS_PROBE_SOURCE, PAGE_AUDIT_SOURCE } from "./page-audit.js";

// jsdom has no layout engine, so geometry-dependent branches (overflow, 44x44)
// are covered by the live matrix; here we prove the DOM-structural checks and
// that the injected source is valid, self-contained JavaScript.
const audit = () => new Function(`return ${PAGE_AUDIT_SOURCE}`)();
const probe = () => new Function(`return ${FOCUS_PROBE_SOURCE}`)();

describe("PAGE_AUDIT_SOURCE", () => {
  it("counts main landmarks, nested mains, duplicate ids, headings and unresolved aria references", () => {
    document.documentElement.setAttribute("lang", "en");
    document.body.innerHTML = `
      <main><h1>One</h1><main><h2>Nested</h2></main></main>
      <div id="dup"></div><span id="dup"></span>
      <button aria-describedby="missing-id">x</button>
      <div aria-live="polite"></div>
      <a href="#main-content">Skip to content</a>`;
    const r = audit();
    expect(r.lang).toBe("en");
    expect(r.landmarks.mainCount).toBe(2);
    expect(r.landmarks.nestedMainCount).toBe(1);
    expect(r.duplicateIds).toEqual([{ id: "dup", count: 2 }]);
    expect(r.invalidAriaRefs).toEqual([{ selector: expect.stringContaining("button"), attr: "aria-describedby", id: "missing-id" }]);
    expect(r.liveRegions).toBe(1);
    expect(r.landmarks.skipLink).toMatchObject({ href: "#main-content", targetExists: false });
    expect(r.headings.h1Count).toBe(0); // jsdom reports zero-size boxes; visibility gating is layout-bound
  });

  it("ignores aria-hidden and inert subtrees for landmarks and ids are still deduplicated", () => {
    document.body.innerHTML = `<main id="a"></main><div aria-hidden="true"><main id="b"></main></div>`;
    const r = audit();
    expect(r.landmarks.mainCount).toBe(1);
    expect(r.duplicateIds).toEqual([]);
  });

  it("returns a serialisable object with the fields the reporter expects", () => {
    document.body.innerHTML = `<main></main>`;
    const r = JSON.parse(JSON.stringify(audit()));
    for (const k of ["overflow", "targets", "landmarks", "headings", "duplicateIds", "forms", "images", "liveRegions", "dialogs", "invalidAriaRefs", "reducedMotionApplied", "forcedColorsActive"]) {
      expect(r).toHaveProperty(k);
    }
  });
});

describe("FOCUS_PROBE_SOURCE", () => {
  it("reports body when nothing is focused and describes a focused element otherwise", () => {
    document.body.innerHTML = `<a id="l" class="nav-link" href="/x">Link</a>`;
    expect(probe().body).toBe(true);
    document.getElementById("l").focus();
    const p = probe();
    expect(p.body).toBe(false);
    expect(p.selector).toBe("a#l.nav-link");
    expect(p.text).toBe("Link");
    expect(typeof p.indicator).toBe("boolean");
  });
});
