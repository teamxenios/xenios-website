// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  FOCUS_BASELINE_RESET_SOURCE,
  FOCUS_BASELINE_SOURCE,
  FOCUS_PROBE_SOURCE,
  PAGE_AUDIT_SOURCE,
} from "./page-audit.js";

// jsdom has no layout engine, so geometry-dependent branches (overflow, 44x44)
// are covered by the live matrix; here we prove the DOM-structural checks and
// that the injected source is valid, self-contained JavaScript.
const audit = () => new Function(`return ${PAGE_AUDIT_SOURCE}`)();
const baseline = () => new Function(`return ${FOCUS_BASELINE_SOURCE}`)();
const resetBaseline = () => new Function(`return ${FOCUS_BASELINE_RESET_SOURCE}`)();
const probe = () => new Function(`return ${FOCUS_PROBE_SOURCE}`)();

beforeEach(() => resetBaseline());

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

  it("measures a labelled checkbox by the real clickable label union", () => {
    document.body.innerHTML = `
      <main>
        <h1>Fixture</h1>
        <label id="large-label" for="large-check">A full-height choice</label>
        <input id="large-check" type="checkbox">
        <label id="small-label" for="small-check">A short choice</label>
        <input id="small-check" type="checkbox">
      </main>`;
    const rect = ({ left, top, width, height }) => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON() {},
    });
    const largeLabel = document.getElementById("large-label");
    const largeCheck = document.getElementById("large-check");
    const smallLabel = document.getElementById("small-label");
    const smallCheck = document.getElementById("small-check");
    largeLabel.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 180, height: 44 });
    largeCheck.getBoundingClientRect = () => rect({ left: 8, top: 13, width: 18, height: 18 });
    smallLabel.getBoundingClientRect = () => rect({ left: 0, top: 60, width: 80, height: 20 });
    smallCheck.getBoundingClientRect = () => rect({ left: 4, top: 61, width: 18, height: 18 });

    const result = audit();
    expect(result.targets.undersized.some((target) => target.selector.includes("#large-check")))
      .toBe(false);
    expect(result.targets.undersized.find((target) => target.selector.includes("#small-check")))
      .toMatchObject({ width: 80, height: 20 });
  });

  it("excludes controls hidden inside closed details while retaining its summary", () => {
    document.body.innerHTML = `
      <details>
        <summary>Menu</summary>
        <nav><a href="/hidden">Hidden link</a></nav>
      </details>`;
    const visibleRect = {
      left: 0, top: 0, right: 100, bottom: 44,
      width: 100, height: 44, x: 0, y: 0,
      toJSON() {},
    };
    for (const element of document.querySelectorAll("summary,a")) {
      element.getBoundingClientRect = () => visibleRect;
    }

    expect(audit().targets.total).toBe(1);
    document.querySelector("details").setAttribute("open", "");
    expect(audit().targets.total).toBe(2);
  });
});

describe("FOCUS_PROBE_SOURCE", () => {
  const forceKeyboardFocusVisible = (element) => {
    const matches = element.matches.bind(element);
    element.matches = (selector) => selector === ":focus-visible" || matches(selector);
  };

  it("reports body when nothing is focused and describes a focused element otherwise", () => {
    document.body.innerHTML = `<a id="l" class="nav-link" href="/x">Link</a>`;
    expect(probe().body).toBe(true);
    baseline();
    document.getElementById("l").focus();
    const p = probe();
    expect(p.body).toBe(false);
    expect(p.selector).toBe("a#l.nav-link");
    expect(p.text).toBe("Link");
    expect(p.identity).toMatch(/^focusable-\d+@html:nth-of-type\(1\)>body:nth-of-type\(1\)>a:nth-of-type\(1\)$/u);
    expect(p.baselineCaptured).toBe(true);
    expect(typeof p.indicator).toBe("boolean");
  });

  it("distinguishes duplicate-looking controls without serialising their attributes or text", () => {
    document.body.innerHTML = `
      <nav><a class="same" href="/one">Same label</a></nav>
      <footer><a class="same" href="/two">Same label</a></footer>`;
    baseline();
    const controls = [...document.querySelectorAll("a")];
    controls[0].focus();
    const first = probe();
    controls[1].focus();
    const second = probe();
    expect(first.selector).toBe(second.selector);
    expect(first.text).toBe(second.text);
    expect(first.identity).not.toBe(second.identity);
    expect(first.identity).not.toMatch(/Same|same|\/one|\/two/u);
    expect(second.identity).not.toMatch(/Same|same|\/one|\/two/u);
  });

  it("returns the complete rendered tabbable identity set", () => {
    document.body.innerHTML = `
      <a href="/one">One</a>
      <button>Two</button>
      <button disabled>Disabled</button>
      <a href="/hidden" tabindex="-1">Skipped</a>`;
    for (const element of document.querySelectorAll("a,button")) {
      element.getClientRects = () => [{ width: 10, height: 10 }];
    }
    const captured = baseline();
    expect(captured.tabbableIdentities).toHaveLength(2);
    expect(captured.tabbableIdentities.every((identity) => /^focusable-\d+@/u.test(identity))).toBe(true);
  });

  it("does not expect Tab to reach descendants of closed details", () => {
    document.body.innerHTML = `
      <details>
        <summary>Menu</summary>
        <nav><a href="/hidden">Hidden link</a></nav>
      </details>`;
    for (const element of document.querySelectorAll("summary,a")) {
      element.getClientRects = () => [{ width: 100, height: 44 }];
    }

    expect(baseline().tabbableIdentities).toHaveLength(1);
    document.querySelector("details").setAttribute("open", "");
    resetBaseline();
    expect(baseline().tabbableIdentities).toHaveLength(2);
  });

  it("resets the unfocused visual baseline between responsive-width walks", () => {
    document.body.innerHTML = `<button>Responsive control</button>`;
    const button = document.querySelector("button");
    baseline();
    button.style.outlineOffset = "7px";
    button.focus();
    expect(probe().focusVisualDelta).toBe(true);

    button.blur();
    resetBaseline();
    baseline();
    button.focus();
    expect(probe().focusVisualDelta).toBe(false);
  });

  it("does not treat a permanent box shadow as a focus-induced indicator", () => {
    document.body.innerHTML = `<button style="box-shadow: 0 0 0 4px black">Always shadowed</button>`;
    baseline();
    const button = document.querySelector("button");
    forceKeyboardFocusVisible(button);
    button.focus();
    const p = probe();
    expect(p.baselineCaptured).toBe(true);
    expect(p.focusVisualDelta).toBe(false);
    expect(p.indicator).toBe(false);
  });

  it("recognises visual deltas on the focused control and its focus-within ancestor", () => {
    document.body.innerHTML = `
      <button id="direct">Direct</button>
      <label class="wrapper"><input id="nested"><span>Nested</span></label>`;
    baseline();
    // jsdom does not apply :focus/:focus-within CSS to computed styles. Mutate
    // after the baseline to exercise the exact browser-side delta mechanism;
    // the live Chromium matrix covers selector-driven focus styles.
    const directControl = document.getElementById("direct");
    const nestedControl = document.getElementById("nested");
    forceKeyboardFocusVisible(directControl);
    forceKeyboardFocusVisible(nestedControl);
    directControl.style.outline = "2px solid red";
    directControl.focus();
    const direct = probe();
    nestedControl.focus();
    document.querySelector(".wrapper").style.outline = "3px solid blue";
    const nested = probe();
    expect(direct).toMatchObject({ baselineCaptured: true, focusVisualDelta: true, indicator: true });
    expect(nested).toMatchObject({ baselineCaptured: true, focusVisualDelta: true, indicator: true });
    expect(nested.changedVisualProperties.some((property) => property.startsWith("ancestor-1."))).toBe(true);
  });
});
