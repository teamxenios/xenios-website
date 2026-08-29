import { describe, expect, it } from "vitest";
import { evaluateHttpHead, extractHtmlMetadata, parseSitemapLocs } from "./html-metadata.mjs";

const html = `<!doctype html><html lang="en"><head>
<title>About &amp; research</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="d">
<link rel="stylesheet" href="/x.css"><link rel="canonical" href="https://example.com/research/about">
<meta property="og:title" content="About"><meta property="og:description" content="Desc"><meta property='og:image' content='/og.png'>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"x"}</script>
<script type="application/ld+json">[{"@type":"WebSite"},{"@type":"BreadcrumbList"}]</script>
<script type="application/ld+json">{not json</script>
</head><body><div id="root"></div></body></html>`;

describe("extractHtmlMetadata", () => {
  it("reads title, canonical, robots, open graph, lang and JSON-LD types from raw HTML", () => {
    const m = extractHtmlMetadata(html);
    expect(m.title).toBe("About & research");
    expect(m.canonical).toBe("https://example.com/research/about");
    expect(m.robotsMeta).toBe("noindex, nofollow");
    expect(m.lang).toBe("en");
    expect(m.openGraph).toMatchObject({ title: "About", description: "Desc", image: "/og.png" });
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
});

describe("parseSitemapLocs", () => {
  it("lists every <loc>", () => {
    expect(parseSitemapLocs("<urlset><url><loc>https://a/b</loc></url><url><loc> https://a/c </loc></url></urlset>")).toEqual(["https://a/b", "https://a/c"]);
  });
});

describe("evaluateHttpHead", () => {
  const origin = "https://example.com";
  const meta = extractHtmlMetadata(html);

  it("treats sitemap parity and structured-data scope as not applicable for an external microsite", () => {
    const a = Object.fromEntries(
      evaluateHttpHead({ route: { path: "/hino", indexable: false, externalMicrosite: true, surface: "hino" }, status: 200, headers: {}, meta: { ...meta, robotsMeta: "noindex, nofollow, nocache", jsonLd: [{ "@type": "Organization" }] }, sitemapLocs: ["https://example.com/research/about"], origin }).map((x) => [x.id, x]),
    );
    expect(a.SITEMAP_PARITY.result).toBe("NOT_APPLICABLE");
    expect(a.STRUCTURED_DATA_SCOPE.result).toBe("NOT_APPLICABLE");
    expect(a.STATUS_CODE.result).toBe("PASS");
  });

  it("requires noindex for a private route and forbids sitemap listing and JSON-LD", () => {
    const a = Object.fromEntries(
      evaluateHttpHead({ route: { path: "/research/account", indexable: false, surface: "account-overview" }, status: 200, headers: { "x-robots-tag": "noindex" }, meta: { ...meta, jsonLd: [] }, sitemapLocs: ["https://example.com/research/about"], origin }).map((x) => [x.id, x]),
    );
    expect(a.STATUS_CODE.result).toBe("PASS");
    expect(a.X_ROBOTS_TAG.result).toBe("PASS");
    expect(a.CANONICAL.result).toBe("NOT_APPLICABLE");
    expect(a.SITEMAP_PARITY.result).toBe("PASS");
    expect(a.STRUCTURED_DATA_SCOPE.result).toBe("PASS");
    expect(a.AUTHORITATIVE_404.result).toBe("NOT_APPLICABLE");
  });

  it("fails a private route that leaks into the sitemap or emits structured data without noindex", () => {
    const a = Object.fromEntries(
      evaluateHttpHead({ route: { path: "/research/account", indexable: false, surface: "x" }, status: 200, headers: {}, meta: { ...meta, robotsMeta: null }, sitemapLocs: ["https://example.com/research/account"], origin }).map((x) => [x.id, x]),
    );
    expect(a.X_ROBOTS_TAG.result).toBe("FAIL");
    expect(a.SITEMAP_PARITY.result).toBe("FAIL");
    expect(a.STRUCTURED_DATA_SCOPE.result).toBe("FAIL");
  });

  it("checks canonical path, open graph, sitemap membership and structured-data scope for an indexable route", () => {
    const a = Object.fromEntries(
      evaluateHttpHead({ route: { path: "/research/about", indexable: true, surface: "x", structuredDataTypes: ["Organization", "WebSite"] }, status: 200, headers: {}, meta: { ...meta, robotsMeta: null, jsonLd: meta.jsonLd.slice(0, 3) }, sitemapLocs: ["https://example.com/research/about/"], origin }).map((x) => [x.id, x]),
    );
    expect(a.X_ROBOTS_TAG.result).toBe("PASS");
    expect(a.CANONICAL.result).toBe("PASS");
    expect(a.OPEN_GRAPH.result).toBe("PASS");
    expect(a.SITEMAP_PARITY.result).toBe("PASS");
    expect(a.STRUCTURED_DATA_SCOPE.result).toBe("FAIL");
    expect(a.STRUCTURED_DATA_SCOPE.detail).toContain("stray=[BreadcrumbList]");
  });

  it("marks the 404 probe authoritative only with a 404 status and a noindex signal", () => {
    const probe = { path: "/nope", indexable: false, surface: "not-found-error", expectStatus: 404 };
    const soft = Object.fromEntries(evaluateHttpHead({ route: probe, status: 200, headers: {}, meta: { ...meta, robotsMeta: null }, sitemapLocs: [], origin }).map((x) => [x.id, x]));
    expect(soft.STATUS_CODE.result).toBe("FAIL");
    expect(soft.AUTHORITATIVE_404.result).toBe("FAIL");
    const hard = Object.fromEntries(evaluateHttpHead({ route: probe, status: 404, headers: { "x-robots-tag": "noindex" }, meta: { ...meta, jsonLd: [] }, sitemapLocs: [], origin }).map((x) => [x.id, x]));
    expect(hard.STATUS_CODE.result).toBe("PASS");
    expect(hard.AUTHORITATIVE_404.result).toBe("PASS");
  });

  it("reports sitemap parity as NOT_RUN when the sitemap was not fetched", () => {
    const a = evaluateHttpHead({ route: { path: "/", indexable: true, surface: "x" }, status: 200, headers: {}, meta, sitemapLocs: null, origin });
    expect(a.find((x) => x.id === "SITEMAP_PARITY").result).toBe("NOT_RUN");
  });
});
