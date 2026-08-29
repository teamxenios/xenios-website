import { describe, expect, it } from "vitest";
import {
  EXACT_INDEX_ROBOTS,
  EXACT_NOINDEX_ROBOTS,
  EXACT_ROBOTS_TXT_DIRECTIVES,
  evaluateHttpHead,
  evaluateRobotsTxt,
  evaluateSitemapLocs,
  extractHtmlMetadata,
  parseSitemapLocs,
} from "./html-metadata.mjs";

const html = `<!doctype html><html lang="en"><head>
<title>About &amp; research</title>
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="description" content="d">
<link rel="stylesheet" href="/x.css"><link rel="canonical" href="https://xeniostechnology.com/research/about">
<meta property="og:title" content="About"><meta property="og:description" content="Desc"><meta property='og:image' content='https://xeniostechnology.com/og/xenios-og-image-v2.png'>
<meta property="og:url" content="https://xeniostechnology.com/research/about"><meta property="og:type" content="website">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"x"}</script>
<script type="application/ld+json">[{"@type":"WebSite"},{"@type":"BreadcrumbList"}]</script>
<script type="application/ld+json">{not json</script>
</head><body><div id="root"></div></body></html>`;

describe("extractHtmlMetadata", () => {
  it("reads title, canonical, robots, open graph, lang and JSON-LD types from raw HTML", () => {
    const m = extractHtmlMetadata(html);
    expect(m.title).toBe("About & research");
    expect(m.canonical).toBe("https://xeniostechnology.com/research/about");
    expect(m.robotsMeta).toBe(EXACT_NOINDEX_ROBOTS);
    expect(m.lang).toBe("en");
    expect(m.openGraph).toMatchObject({
      title: "About",
      description: "Desc",
      image: "https://xeniostechnology.com/og/xenios-og-image-v2.png",
      url: "https://xeniostechnology.com/research/about",
      type: "website",
    });
    expect(m.jsonLd.map((j) => j.type)).toEqual(["Organization", "WebSite", "BreadcrumbList", null]);
    expect(m.jsonLd[3].parseError).toBeTruthy();
    expect(m.hasRootElement).toBe(true);
  });
  it("tolerates a document with no head metadata", () => {
    const m = extractHtmlMetadata("<html><body>x</body></html>");
    expect(m.title).toBeNull();
    expect(m.canonical).toBeNull();
    expect(m.jsonLd).toEqual([]);
  });
  it("ignores canonical and Open Graph markup inside HTML comments", () => {
    const commented = extractHtmlMetadata(`<!doctype html><html><head><!--
      <link rel="canonical" href="https://xeniostechnology.com/research/about">
      <meta property="og:title" content="About">
      <meta property="og:description" content="Desc">
      <meta property="og:image" content="https://xeniostechnology.com/og/xenios-og-image-v2.png">
      <meta property="og:url" content="https://xeniostechnology.com/research/about">
      <meta property="og:type" content="website">
    --></head><body></body></html>`);
    expect(commented.canonicalLinkCount).toBe(0);
    expect(commented.openGraphEntries).toEqual([]);
  });
});

describe("parseSitemapLocs", () => {
  it("lists every <loc>", () => {
    expect(parseSitemapLocs("<urlset><url><loc>https://a/b</loc></url><url><loc> https://a/c </loc></url></urlset>")).toEqual(["https://a/b", "https://a/c"]);
  });
  it("does not count commented-out sitemap locations", () => {
    expect(parseSitemapLocs(
      "<urlset><!-- <url><loc>https://xeniostechnology.com/private</loc></url> --></urlset>",
    )).toEqual([]);
  });
  it("requires unique, credential-free exact production HTTPS URLs", () => {
    expect(evaluateSitemapLocs([
      "https://xeniostechnology.com/",
      "https://xeniostechnology.com/about",
    ]).result).toBe("PASS");
    expect(evaluateSitemapLocs([
      "https://xeniostechnology.com/about",
      "https://xeniostechnology.com/about",
      "https://user:secret@xeniostechnology.com/private?leak=1",
    ])).toMatchObject({ result: "FAIL", duplicates: ["https://xeniostechnology.com/about"] });
  });
});

describe("evaluateRobotsTxt", () => {
  const exact = `${EXACT_ROBOTS_TXT_DIRECTIVES.join("\r\n")}\r\n`;
  it("requires the complete reviewed directive sequence", () => {
    expect(evaluateRobotsTxt(exact).result).toBe("PASS");
    expect(evaluateRobotsTxt(exact.replace("Allow: /", "Disallow: /"))).toMatchObject({ result: "FAIL" });
    expect(evaluateRobotsTxt(`${exact}Disallow: /private\r\n`)).toMatchObject({ result: "FAIL" });
    expect(evaluateRobotsTxt(exact.replace(/Sitemap:.*\r\n/u, ""))).toMatchObject({ result: "FAIL" });
  });
});

describe("evaluateHttpHead", () => {
  const origin = "http://127.0.0.1:5184";
  const meta = extractHtmlMetadata(html);
  const privateMeta = {
    ...meta,
    canonical: null,
    canonicalLinks: [],
    canonicalLinkCount: 0,
    openGraph: { title: null, description: null, image: null, url: null, type: null },
    openGraphEntries: [],
    jsonLd: [],
  };

  it("requires the exact HTML content type", () => {
    const evaluate = (contentType) => Object.fromEntries(evaluateHttpHead({
      route: { path: "/research/account", public: false, indexable: false, surface: "x" },
      status: 200,
      headers: {
        "content-type": contentType,
        "x-robots-tag": EXACT_NOINDEX_ROBOTS,
      },
      meta: privateMeta,
      sitemapLocs: [],
      origin,
    }).map((assertion) => [assertion.id, assertion]));
    expect(evaluate("text/html; charset=utf-8").CONTENT_TYPE_HTML.result).toBe("PASS");
    expect(evaluate("text/plain; charset=utf-8").CONTENT_TYPE_HTML.result).toBe("FAIL");
    expect(evaluate("text/html").CONTENT_TYPE_HTML.result).toBe("FAIL");
  });

  it("treats sitemap parity and structured-data scope as not applicable for an external microsite", () => {
    const a = Object.fromEntries(
      evaluateHttpHead({ route: { path: "/hino", indexable: false, externalMicrosite: true, surface: "hino" }, status: 200, headers: {}, meta: { ...meta, robotsMeta: "noindex, nofollow, nocache", robotsMetaEntries: ["noindex, nofollow, nocache"], robotsMetaCount: 1, jsonLd: [{ "@type": "Organization" }] }, sitemapLocs: ["https://example.com/research/about"], origin }).map((x) => [x.id, x]),
    );
    expect(a.SITEMAP_PARITY.result).toBe("NOT_APPLICABLE");
    expect(a.STRUCTURED_DATA_SCOPE.result).toBe("NOT_APPLICABLE");
    expect(a.STATUS_CODE.result).toBe("PASS");
    expect(a.X_ROBOTS_TAG.result).toBe("NOT_APPLICABLE");
    expect(a.ROBOTS_META.result).toBe("PASS");
  });

  it("requires noindex for a private route and forbids sitemap listing and JSON-LD", () => {
    const a = Object.fromEntries(
      evaluateHttpHead({ route: { path: "/research/account", public: false, indexable: false, surface: "account-overview" }, status: 200, headers: { "x-robots-tag": EXACT_NOINDEX_ROBOTS }, meta: privateMeta, sitemapLocs: ["https://xeniostechnology.com/research/about"], origin }).map((x) => [x.id, x]),
    );
    expect(a.STATUS_CODE.result).toBe("PASS");
    expect(a.X_ROBOTS_TAG.result).toBe("PASS");
    expect(a.CANONICAL.result).toBe("PASS");
    expect(a.OPEN_GRAPH.result).toBe("PASS");
    expect(a.SITEMAP_PARITY.result).toBe("PASS");
    expect(a.STRUCTURED_DATA_SCOPE.result).toBe("PASS");
    expect(a.AUTHORITATIVE_404.result).toBe("NOT_APPLICABLE");
  });

  it("fails a private route that leaks into the sitemap or emits structured data without noindex", () => {
    const a = Object.fromEntries(
      evaluateHttpHead({ route: { path: "/research/account", public: false, indexable: false, surface: "x" }, status: 200, headers: {}, meta: { ...privateMeta, robotsMeta: null, jsonLd: meta.jsonLd }, sitemapLocs: ["https://xeniostechnology.com/research/account"], origin }).map((x) => [x.id, x]),
    );
    expect(a.X_ROBOTS_TAG.result).toBe("FAIL");
    expect(a.SITEMAP_PARITY.result).toBe("FAIL");
    expect(a.STRUCTURED_DATA_SCOPE.result).toBe("FAIL");
  });

  it("refuses to grant external-microsite exemptions to any path except /hino", () => {
    expect(() => evaluateHttpHead({
      route: { path: "/research/about", indexable: false, externalMicrosite: true, surface: "x" },
      status: 200,
      headers: {},
      meta,
      sitemapLocs: [],
      origin,
    })).toThrow(/reserved for the exact \/hino/u);
  });

  it("does not let a noindex meta tag impersonate the required server X-Robots-Tag", () => {
    const a = Object.fromEntries(
      evaluateHttpHead({ route: { path: "/research/account", public: false, indexable: false, surface: "x" }, status: 200, headers: {}, meta: privateMeta, sitemapLocs: [], origin }).map((x) => [x.id, x]),
    );
    expect(a.X_ROBOTS_TAG.result).toBe("FAIL");
    expect(a.ROBOTS_META.result).toBe("PASS");
  });

  it("requires the exact canonical robots directive strings", () => {
    const assertions = Object.fromEntries(evaluateHttpHead({
      route: { path: "/research/account", public: false, indexable: false, surface: "x" },
      status: 200,
      headers: { "x-robots-tag": "noindex, nofollow, noarchive" },
      meta: { ...privateMeta, robotsMeta: "noindex,nofollow" },
      sitemapLocs: [],
      origin,
    }).map((assertion) => [assertion.id, assertion]));
    expect(assertions.X_ROBOTS_TAG.result).toBe("FAIL");
    expect(assertions.ROBOTS_META.result).toBe("FAIL");
  });

  it("rejects duplicate or conflicting robots meta tags", () => {
    const duplicate = extractHtmlMetadata(
      `<html><head><meta name="robots" content="index,follow">` +
      `<meta name="robots" content="${EXACT_NOINDEX_ROBOTS}"></head></html>`,
    );
    const assertions = Object.fromEntries(evaluateHttpHead({
      route: { path: "/research/account", public: false, indexable: false, surface: "x" },
      status: 200,
      headers: { "x-robots-tag": EXACT_NOINDEX_ROBOTS },
      meta: { ...privateMeta, ...duplicate },
      sitemapLocs: [],
      origin,
    }).map((assertion) => [assertion.id, assertion]));
    expect(duplicate.robotsMetaCount).toBe(2);
    expect(assertions.ROBOTS_META.result).toBe("FAIL");
  });

  it("fails positive absence assertions when private canonical or Open Graph authority leaks", () => {
    const assertions = Object.fromEntries(evaluateHttpHead({
      route: { path: "/research/account", public: false, indexable: false, surface: "x" },
      status: 200,
      headers: { "x-robots-tag": EXACT_NOINDEX_ROBOTS },
      meta,
      sitemapLocs: [],
      origin,
    }).map((assertion) => [assertion.id, assertion]));
    expect(assertions.CANONICAL.result).toBe("FAIL");
    expect(assertions.OPEN_GRAPH.result).toBe("FAIL");
  });

  it("checks canonical path, open graph, sitemap membership and structured-data scope for an indexable route", () => {
    const a = Object.fromEntries(
      evaluateHttpHead({ route: { path: "/research/about", public: true, indexable: true, surface: "x", structuredDataTypes: ["Organization", "WebSite"] }, status: 200, headers: { "x-robots-tag": EXACT_INDEX_ROBOTS }, meta: { ...meta, robotsMeta: EXACT_INDEX_ROBOTS, robotsMetaEntries: [EXACT_INDEX_ROBOTS], robotsMetaCount: 1, jsonLd: meta.jsonLd.slice(0, 3) }, sitemapLocs: ["https://xeniostechnology.com/research/about"], origin }).map((x) => [x.id, x]),
    );
    expect(a.X_ROBOTS_TAG.result).toBe("PASS");
    expect(a.CANONICAL.result).toBe("PASS");
    expect(a.OPEN_GRAPH.result).toBe("PASS");
    expect(a.SITEMAP_PARITY.result).toBe("PASS");
    expect(a.STRUCTURED_DATA_SCOPE.result).toBe("FAIL");
    expect(a.STRUCTURED_DATA_SCOPE.detail).toContain("stray=[BreadcrumbList]");
  });

  it("rejects hostile canonical and og:url origins even when their paths match", () => {
    const route = { path: "/research/about", public: true, indexable: true, surface: "x" };
    const evaluate = (candidateMeta) => Object.fromEntries(
      evaluateHttpHead({
        route,
        status: 200,
        headers: { "x-robots-tag": EXACT_INDEX_ROBOTS },
        meta: candidateMeta,
        sitemapLocs: ["https://xeniostechnology.com/research/about"],
        origin,
      }).map((assertion) => [assertion.id, assertion]),
    );

    expect(evaluate({ ...meta, canonical: "https://evil.example/research/about" }).CANONICAL.result)
      .toBe("FAIL");
    expect(evaluate({
      ...meta,
      openGraph: { ...meta.openGraph, url: "https://evil.example/research/about" },
    }).OPEN_GRAPH.result).toBe("FAIL");
  });

  it.each(["title", "description", "image", "url", "type"])(
    "requires declared Open Graph field %s",
    (field) => {
      const candidate = {
        ...meta,
        openGraph: { ...meta.openGraph, [field]: null },
      };
      const assertions = evaluateHttpHead({
        route: { path: "/research/about", public: true, indexable: true, surface: "x" },
        status: 200,
        headers: { "x-robots-tag": EXACT_INDEX_ROBOTS },
        meta: candidate,
        sitemapLocs: ["https://xeniostechnology.com/research/about"],
        origin,
      });
      expect(assertions.find((assertion) => assertion.id === "OPEN_GRAPH").result)
        .toBe("FAIL");
    },
  );

  it("marks the 404 probe authoritative only with a 404 status and a noindex signal", () => {
    const probe = { path: "/nope", public: true, indexable: false, surface: "not-found-error", expectStatus: 404 };
    const soft = Object.fromEntries(evaluateHttpHead({ route: probe, status: 200, headers: {}, meta: { ...privateMeta, robotsMeta: null }, sitemapLocs: [], origin }).map((x) => [x.id, x]));
    expect(soft.STATUS_CODE.result).toBe("FAIL");
    expect(soft.AUTHORITATIVE_404.result).toBe("FAIL");
    const hard = Object.fromEntries(evaluateHttpHead({ route: probe, status: 404, headers: { "x-robots-tag": EXACT_NOINDEX_ROBOTS }, meta: privateMeta, sitemapLocs: [], origin }).map((x) => [x.id, x]));
    expect(hard.STATUS_CODE.result).toBe("PASS");
    expect(hard.AUTHORITATIVE_404.result).toBe("PASS");
    expect(hard.CANONICAL.result).toBe("PASS");
    expect(hard.OPEN_GRAPH.result).toBe("PASS");
  });

  it("reports sitemap parity as NOT_RUN when the sitemap was not fetched", () => {
    const a = evaluateHttpHead({ route: { path: "/", public: true, indexable: true, surface: "x" }, status: 200, headers: {}, meta, sitemapLocs: null, origin });
    expect(a.find((x) => x.id === "SITEMAP_PARITY").result).toBe("NOT_RUN");
  });
});
