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
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Route, Router, Switch } from "wouter";

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

/**
 * The section's behaviour: OBSERVE the tag and re-assert, rather than relying on
 * effect ordering. Ordering is what the previous attempt used and it is exactly
 * what breaks across a Suspense boundary.
 */
function SectionUnderTest() {
  useEffect(() => {
    const DESIRED = "noindex, nofollow";
    const find = () => document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const existing = find();
    const created = !existing;
    const previous = existing ? existing.getAttribute("content") : null;
    const assertNoindex = () => {
      let el = find();
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", "robots");
        document.head.appendChild(el);
      }
      if (el.getAttribute("content") !== DESIRED) el.setAttribute("content", DESIRED);
    };
    assertNoindex();
    const observer = new MutationObserver(assertNoindex);
    observer.observe(document.head, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["content", "name"],
    });
    return () => {
      observer.disconnect();
      const el = find();
      if (!el) return;
      if (created) el.remove();
      else if (previous) el.setAttribute("content", previous);
    };
  }, []);
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

  it("is STILL noindex after navigating within the research tree", async () => {
    render("/research");
    expect(robotsContent()).toBe("noindex, nofollow");

    // The regression this file exists for. With the old empty dependency array
    // the section's effect never re-ran, so the incoming page's SeoHead won and
    // this assertion saw the indexable value.
    await act(async () => {
      window.history.pushState(null, "", "/research/faq");
      window.dispatchEvent(new PopStateEvent("popstate"));
      // MutationObserver callbacks are delivered as a microtask, so the
      // correction lands just after the offending write rather than in the same
      // synchronous turn. Settle before asserting.
      await new Promise((r) => setTimeout(r, 40));
    });

    expect(robotsContent()).toBe("noindex, nofollow");
    expect(robotsContent()).not.toContain("index,follow");
  });

  it("survives several navigations rather than only the first", async () => {
    render("/research");
    for (const path of ["/research/faq", "/research", "/research/faq"]) {
      await act(async () => {
        window.history.pushState(null, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
        await new Promise((r) => setTimeout(r, 40));
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

  it("observes the tag rather than relying on effect ordering", () => {
    // The regression this replaces: an ordering-based fix (empty deps, or deps
    // on location) works for a synchronous child and FAILS across a Suspense
    // boundary, which is what most research routes are. Measured in production.
    expect(source).toContain("new MutationObserver(assert)");
    expect(source).toContain("observer.observe(document.head");
    expect(source).toContain("observer.disconnect();");
    // childList matters: a writer may append a replacement meta rather than
    // mutate the existing one.
    expect(source).toContain("childList: true");
  });

  it("still asserts the noindex value itself", () => {
    expect(source).toContain('const DESIRED = "noindex, nofollow";');
    expect(source).toContain('el.setAttribute("content", DESIRED)');
  });
});

describe("SEN-0027: the LAZY case, which the ordering fix silently failed", () => {
  // THE REGRESSION THIS FILE EXISTS FOR NOW.
  //
  // The previous fix keyed the effect on `location` and relied on React running
  // child effects before parent effects within a commit. True, but it does not
  // hold across a Suspense boundary, and most research routes are lazy(). On a
  // COLD chunk the page's SeoHead effect lands in a LATER commit than the
  // section's, so the section asserted first and SeoHead overwrote it.
  //
  // Measured on production at b911bab before this change:
  //   t=50ms   noindex, nofollow
  //   t=150ms  index,follow,...   and it stayed there permanently
  //
  // A warm chunk hid it, which is why the earlier model test (a synchronous
  // child) and a first manual pass both said it was fine. This models the async
  // writer explicitly.

  function LateWriter() {
    // Writes AFTER the parent's effect has already run, exactly as a lazy
    // page's SeoHead does on a cold chunk.
    const [, force] = useState(0);
    useEffect(() => {
      const t = setTimeout(() => {
        let el = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
        if (!el) {
          el = document.createElement("meta");
          el.setAttribute("name", "robots");
          document.head.appendChild(el);
        }
        el.setAttribute("content", INDEXABLE);
        force((n) => n + 1);
      }, 20);
      return () => clearTimeout(t);
    }, []);
    return <p>late</p>;
  }

  function LateSection() {
    return (
      <Router>
        <SectionUnderTest />
        <LateWriter />
      </Router>
    );
  }

  it("re-asserts noindex when a writer lands in a LATER commit", async () => {
    window.history.replaceState(null, "", "/research");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<LateSection />); });

    expect(robotsContent()).toBe("noindex, nofollow");

    // Let the late writer fire and the observer react.
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });

    expect(robotsContent()).toBe("noindex, nofollow");
    expect(robotsContent()).not.toContain("index,follow");
  });

  it("re-asserts when a writer APPENDS a replacement meta instead of mutating", async () => {
    window.history.replaceState(null, "", "/research");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<Router><SectionUnderTest /></Router>); });

    await act(async () => {
      document.head.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
      const el = document.createElement("meta");
      el.setAttribute("name", "robots");
      el.setAttribute("content", INDEXABLE);
      document.head.appendChild(el);
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(robotsContent()).toBe("noindex, nofollow");
  });
});
