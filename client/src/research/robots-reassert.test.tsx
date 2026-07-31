// @vitest-environment jsdom
// SEN-0027. The research section set meta robots to "noindex, nofollow" in an
// effect with an EMPTY dependency array, so it ran once on mount and never
// again. 27 research pages render <SeoHead> without a robots prop, and SeoHead
// then writes DEFAULT_ROBOTS, which begins "index,follow". A client-side
// navigation inside the research tree therefore left the tree advertising
// itself as indexable until a full page load.
//
// NOT a live indexing exposure: production sends a real
// "x-robots-tag: noindex, nofollow" HEADER on /research and the sitemap
// excludes the tree, both verified against production. Search engines obey the
// header. This guard exists so the MARKUP stops contradicting the header.
//
// The ordering this relies on is a real React guarantee, not a hope: child
// effects run before parent effects within a commit, so the section (the
// parent of every research page) re-asserts after the page's own SeoHead.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Route, Router, Switch, useLocation } from "wouter";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const INDEXABLE = "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function robotsContent(): string | null {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
}

/** Stands in for the 27 research pages that render <SeoHead> with no robots prop. */
function PageThatSetsIndexable() {
  useEffect(() => {
    let el = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    el.setAttribute("content", INDEXABLE);
  });
  return <p>page</p>;
}

/** The section's own behaviour: re-assert noindex on every location change. */
function SectionUnderTest() {
  const [location] = useLocation();
  useEffect(() => {
    let el = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const created = !el;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    const prev = el.getAttribute("content");
    el.setAttribute("content", "noindex, nofollow");
    return () => {
      if (created) el!.remove();
      else if (prev) el!.setAttribute("content", prev);
    };
  }, [location]);
  return (
    <Switch>
      <Route path="/research" component={PageThatSetsIndexable} />
      <Route path="/research/faq" component={PageThatSetsIndexable} />
    </Switch>
  );
}

function render(path: string) {
  window.history.replaceState(null, "", path);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Router>
        <SectionUnderTest />
      </Router>,
    );
  });
}

beforeEach(() => {
  document.head.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  document.head.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
});

describe("SEN-0027: research keeps asserting noindex across client-side navigation", () => {
  it("is noindex on first mount even though the page writes an indexable value", () => {
    render("/research");
    expect(robotsContent()).toBe("noindex, nofollow");
  });

  it("is STILL noindex after navigating within the research tree", () => {
    render("/research");
    expect(robotsContent()).toBe("noindex, nofollow");

    // The regression this file exists for. With the old empty dependency array
    // the section's effect never re-ran, so the incoming page's SeoHead won and
    // this assertion saw the indexable value.
    act(() => {
      window.history.pushState(null, "", "/research/faq");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(robotsContent()).toBe("noindex, nofollow");
    expect(robotsContent()).not.toContain("index,follow");
  });

  it("survives several navigations rather than only the first", () => {
    render("/research");
    for (const path of ["/research/faq", "/research", "/research/faq"]) {
      act(() => {
        window.history.pushState(null, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(robotsContent()).toBe("noindex, nofollow");
    }
  });
});

describe("SEN-0027: the real section file, not just this file's model of it", () => {
  // HONEST LIMITATION, stated rather than glossed. The behavioural tests above
  // exercise a MODEL of the section's effect, because importing the real
  // ResearchSection pulls in the whole lazy route tree and its provider. A
  // model test proves the pattern is sound; it does NOT fail if someone reverts
  // the real file. This source assertion is what closes that gap, and it is why
  // the two are kept together: behaviour above, binding to the real file here.
  const source = readFileSync(
    resolve(__dirname, "section.tsx"),
    "utf8",
  );

  it("depends on location so the effect re-runs on navigation", () => {
    // The exact regression: an empty dependency array runs once on mount.
    expect(source).toContain("const [location] = useLocation();");
    expect(source).toMatch(/el!\.setAttribute\("content", prev\);[\s\S]{0,80}\}, \[location\]\);/);
  });

  it("still asserts the noindex value itself", () => {
    expect(source).toContain('el.setAttribute("content", "noindex, nofollow");');
  });
});
