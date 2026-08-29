// Pure raw-HTML metadata extraction and HTTP-head assertion evaluation.
// Regex-based on purpose: the assertions concern what a crawler sees in the
// RAW document, before any client script runs, so no DOM is involved.
import { assertExternalMicrositeRoute } from "./route-contract.mjs";

export const PRODUCTION_SITE_ORIGIN = "https://xeniostechnology.com";
export const EXACT_INDEX_ROBOTS =
  "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1";
export const EXACT_NOINDEX_ROBOTS = "noindex,nofollow,noarchive";
export const EXACT_HINO_ROBOTS = "noindex, nofollow, nocache";
export const EXACT_OPEN_GRAPH_IMAGE =
  "https://xeniostechnology.com/og/xenios-og-image-v2.png";
export const EXACT_ROBOTS_TXT_DIRECTIVES = Object.freeze([
  "User-agent: *",
  "Allow: /",
  "Disallow: /api/",
  "Disallow: /admin",
  "User-agent: GPTBot",
  "Allow: /",
  "Disallow: /api/",
  "Disallow: /admin",
  "User-agent: ClaudeBot",
  "Allow: /",
  "Disallow: /api/",
  "Disallow: /admin",
  "User-agent: Claude-Web",
  "Allow: /",
  "Disallow: /api/",
  "Disallow: /admin",
  "User-agent: PerplexityBot",
  "Allow: /",
  "Disallow: /api/",
  "Disallow: /admin",
  "User-agent: Google-Extended",
  "Allow: /",
  "Disallow: /api/",
  "Disallow: /admin",
  "User-agent: CCBot",
  "Allow: /",
  "Disallow: /api/",
  "Disallow: /admin",
  "Sitemap: https://xeniostechnology.com/sitemap.xml",
]);

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decode(m[1] ?? m[2] ?? m[3]) : null;
};
const decode = (s) =>
  String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

const stripMarkupComments = (value) => String(value)
  .replace(/<!--[\s\S]*?-->/gu, "")
  .replace(/<!--[\s\S]*$/gu, "");

export function extractHtmlMetadata(html) {
  const uncommentedHtml = stripMarkupComments(html);
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(uncommentedHtml)?.[1] ?? uncommentedHtml;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]?.trim() ?? null;
  const links = head.match(/<link\b[^>]*>/gi) ?? [];
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const canonicalLinks = links
    .filter((link) => (attr(link, "rel") ?? "").toLowerCase().split(/\s+/u).includes("canonical"))
    .map((link) => attr(link, "href"));
  const canonical = canonicalLinks[0] ?? null;
  const metaByName = {};
  const metaByProperty = {};
  const openGraphEntries = [];
  const robotsMetaEntries = [];
  for (const m of metas) {
    const name = attr(m, "name");
    const property = attr(m, "property");
    const content = attr(m, "content");
    if (name) {
      const normalizedName = name.toLowerCase();
      metaByName[normalizedName] = content;
      if (normalizedName === "robots") robotsMetaEntries.push(content);
    }
    if (property) {
      const normalizedProperty = property.toLowerCase();
      metaByProperty[normalizedProperty] = content;
      if (normalizedProperty.startsWith("og:")) {
        openGraphEntries.push({ property: normalizedProperty, content });
      }
    }
  }
  const jsonLd = [];
  const scriptRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] ?? [parsed];
      for (const item of items) jsonLd.push({ type: item?.["@type"] ?? null, hasContext: Boolean(parsed?.["@context"]) });
    } catch (e) {
      jsonLd.push({ type: null, parseError: String(e.message).slice(0, 80) });
    }
  }
  const lang = attr(/<html\b[^>]*>/i.exec(html)?.[0] ?? "", "lang");
  return {
    title: title ? decode(title) : null,
    canonical,
    canonicalLinks,
    canonicalLinkCount: canonicalLinks.length,
    lang,
    robotsMeta: metaByName["robots"] ?? null,
    robotsMetaEntries,
    robotsMetaCount: robotsMetaEntries.length,
    description: metaByName["description"] ?? null,
    viewport: metaByName["viewport"] ?? null,
    openGraph: {
      title: metaByProperty["og:title"] ?? null,
      description: metaByProperty["og:description"] ?? null,
      image: metaByProperty["og:image"] ?? null,
      url: metaByProperty["og:url"] ?? null,
      type: metaByProperty["og:type"] ?? null,
    },
    openGraphEntries,
    twitterCard: metaByName["twitter:card"] ?? null,
    jsonLd,
    hasRootElement: /<div\b[^>]*id\s*=\s*["']root["']/i.test(html),
  };
}

export function parseSitemapLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  const uncommentedXml = stripMarkupComments(xml);
  while ((m = re.exec(uncommentedXml))) locs.push(decode(m[1]));
  return locs;
}

export function evaluateRobotsTxt(text) {
  const directives = typeof text === "string"
    ? text.replace(/\r\n?/gu, "\n").split("\n").filter((line) => line.length > 0)
    : [];
  const exact = JSON.stringify(directives) === JSON.stringify(EXACT_ROBOTS_TXT_DIRECTIVES);
  return Object.freeze({
    result: exact ? "PASS" : "FAIL",
    directives,
    expectedDirectives: [...EXACT_ROBOTS_TXT_DIRECTIVES],
  });
}

const isNoindex = (value) => /\bnoindex\b/i.test(String(value ?? ""));

const nonEmptyMetadataValue = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function isExactProductionRouteUrl(value, routePath) {
  if (
    !nonEmptyMetadataValue(value) ||
    typeof routePath !== "string" ||
    !/^\/(?!\/)[^?#]*$/u.test(routePath)
  ) {
    return false;
  }
  try {
    const actual = new URL(value);
    const expected = new URL(routePath, `${PRODUCTION_SITE_ORIGIN}/`);
    return actual.origin === PRODUCTION_SITE_ORIGIN &&
      actual.pathname === expected.pathname &&
      actual.search === "" &&
      actual.hash === "" &&
      actual.username === "" &&
      actual.password === "";
  } catch {
    return false;
  }
}

export function hasCompleteDeclaredOpenGraph(openGraph, routePath, entries = null) {
  const requiredProperties = ["og:title", "og:description", "og:image", "og:url", "og:type"];
  const exactCardinality = entries === null || (
    Array.isArray(entries) &&
    entries.length === requiredProperties.length &&
    requiredProperties.every((property) =>
      entries.filter((entry) => entry?.property === property).length === 1,
    )
  );
  return Boolean(
    openGraph &&
    ["title", "description", "image", "url", "type"].every((field) =>
      nonEmptyMetadataValue(openGraph[field]),
    ) &&
    isExactProductionRouteUrl(openGraph.url, routePath) &&
    openGraph.image === EXACT_OPEN_GRAPH_IMAGE &&
    exactCardinality,
  );
}

export function evaluateSitemapLocs(locs) {
  const invalidLocs = [];
  const normalized = [];
  for (const loc of Array.isArray(locs) ? locs : []) {
    try {
      const url = new URL(loc);
      const exact = url.origin === PRODUCTION_SITE_ORIGIN &&
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.toString() === loc;
      if (!exact) invalidLocs.push(loc);
      else normalized.push(loc);
    } catch {
      invalidLocs.push(String(loc));
    }
  }
  const duplicates = normalized.filter((loc, index) => normalized.indexOf(loc) !== index);
  return Object.freeze({
    result: Array.isArray(locs) && locs.length > 0 && invalidLocs.length === 0 && duplicates.length === 0
      ? "PASS"
      : "FAIL",
    count: Array.isArray(locs) ? locs.length : 0,
    invalidLocs,
    duplicates: [...new Set(duplicates)],
  });
}

/**
 * Evaluate the packet's httpHeadEvidence.requiredAssertions for one route.
 * @param {object} p
 * @param {object} p.route  { path, indexable: boolean, expectStatus?: number, surface }
 * @param {number} p.status
 * @param {object} p.headers lowercase header map
 * @param {object} p.meta   extractHtmlMetadata() output
 * @param {string[]|null} p.sitemapLocs
 * @param {string} p.origin
 */
export function evaluateHttpHead({ route, status, headers, meta, sitemapLocs, origin }) {
  const a = [];
  const push = (id, result, detail) => a.push({ id, result, detail });
  const externalMicrosite = assertExternalMicrositeRoute(route);
  const expectStatus = route.expectStatus ?? 200;
  push("STATUS_CODE", status === expectStatus ? "PASS" : "FAIL", `status ${status} (expected ${expectStatus})`);
  const contentType = headers["content-type"] ?? null;
  push(
    "CONTENT_TYPE_HTML",
    typeof contentType === "string" && contentType.trim().toLowerCase() === "text/html; charset=utf-8"
      ? "PASS"
      : "FAIL",
    `content-type=${contentType ?? "(none)"} expected=text/html; charset=utf-8`,
  );

  const xRobots = headers["x-robots-tag"] ?? null;
  const robotsMeta = meta?.robotsMeta ?? null;
  const headerNoindex = isNoindex(xRobots);
  const metaNoindex = isNoindex(robotsMeta);
  const expectedRobots = route.indexable ? EXACT_INDEX_ROBOTS : EXACT_NOINDEX_ROBOTS;
  if (externalMicrosite) {
    push("X_ROBOTS_TAG", "NOT_APPLICABLE", "static external microsite is served byte-for-byte outside the raw HTTP document policy");
  } else {
    push("X_ROBOTS_TAG", xRobots === expectedRobots ? "PASS" : "FAIL", `x-robots-tag=${xRobots ?? "(none)"} expected=${expectedRobots}`);
  }
  const expectedMetaRobots = externalMicrosite ? EXACT_HINO_ROBOTS : expectedRobots;
  const robotsMetaCardinality = meta?.robotsMetaCount === 1 &&
    Array.isArray(meta?.robotsMetaEntries) &&
    meta.robotsMetaEntries.length === 1;
  push(
    "ROBOTS_META",
    robotsMetaCardinality && robotsMeta === expectedMetaRobots ? "PASS" : "FAIL",
    `meta.robots=${robotsMeta ?? "(none)"} count=${meta?.robotsMetaCount ?? 0} expected=${expectedMetaRobots}`,
  );

  push("RAW_HTML_TITLE", meta?.title && meta.title.trim().length > 0 ? "PASS" : "FAIL", `title=${JSON.stringify(meta?.title ?? null)}`);

  const metadataAuthority = !externalMicrosite && route.indexable === true && expectStatus === 200;
  if (externalMicrosite) {
    push("CANONICAL", "NOT_APPLICABLE", "external microsite owns its canonical metadata");
    push("OPEN_GRAPH", "NOT_APPLICABLE", "external microsite owns its Open Graph metadata");
  } else if (metadataAuthority) {
    const canonicalOk = meta?.canonicalLinkCount === 1 && isExactProductionRouteUrl(meta?.canonical, route.path);
    const canonicalDetail = `canonical=${meta?.canonical ?? "(none)"} expected=${new URL(route.path, `${PRODUCTION_SITE_ORIGIN}/`).toString()}`;
    push("CANONICAL", canonicalOk ? "PASS" : "FAIL", canonicalDetail);
    const og = meta?.openGraph ?? {};
    const ogOk = hasCompleteDeclaredOpenGraph(og, route.path, meta?.openGraphEntries);
    push("OPEN_GRAPH", ogOk ? "PASS" : "FAIL", `og:title=${nonEmptyMetadataValue(og.title) ? "yes" : "no"} og:description=${nonEmptyMetadataValue(og.description) ? "yes" : "no"} og:imageExact=${og.image === EXACT_OPEN_GRAPH_IMAGE} og:url=${nonEmptyMetadataValue(og.url) ? "yes" : "no"} og:type=${nonEmptyMetadataValue(og.type) ? "yes" : "no"} og:urlExact=${isExactProductionRouteUrl(og.url, route.path)}`);
  } else {
    const canonicalAbsent = meta?.canonicalLinkCount === 0 && meta?.canonical === null;
    const openGraphAbsent = Array.isArray(meta?.openGraphEntries) && meta.openGraphEntries.length === 0;
    push("CANONICAL", canonicalAbsent ? "PASS" : "FAIL", "unindexable/private/404 route; canonical must be absent");
    push("OPEN_GRAPH", openGraphAbsent ? "PASS" : "FAIL", "unindexable/private/404 route; all Open Graph tags must be absent");
  }

  if (externalMicrosite) {
    // A static microsite served as files outside the raw HTTP document policy
    // (the production Hino site): it is neither expected in nor forbidden from
    // /sitemap.xml (a global asset the candidate never touches).
    push("SITEMAP_PARITY", "NOT_APPLICABLE", "external microsite outside the document/sitemap policy (externalMicrosite: true)");
  } else if (sitemapLocs === null || sitemapLocs === undefined) {
    push("SITEMAP_PARITY", "NOT_RUN", "sitemap not fetched");
  } else {
    const paths = new Set(sitemapLocs.map((l) => safePath(l)).filter(Boolean));
    const present = paths.has(route.path.replace(/\/$/, "") || "/");
    if (route.indexable) push("SITEMAP_PARITY", present ? "PASS" : "FAIL", present ? "listed in sitemap" : "indexable route missing from sitemap");
    else push("SITEMAP_PARITY", present ? "FAIL" : "PASS", present ? "private/unindexable route listed in sitemap" : "not listed in sitemap");
  }

  const ld = meta?.jsonLd ?? [];
  const parseErrors = ld.filter((x) => x.parseError);
  if (route.indexable) {
    const allowedTypes = route.structuredDataTypes ?? null;
    const types = ld.map((x) => x.type).filter(Boolean);
    let ok = parseErrors.length === 0;
    let detail = `types=[${types.join(", ")}]`;
    if (Array.isArray(allowedTypes)) {
      const stray = types.filter((t) => !allowedTypes.includes(t));
      const missing = allowedTypes.filter((t) => !types.includes(t));
      ok = ok && stray.length === 0 && missing.length === 0;
      if (stray.length) detail += ` stray=[${stray.join(", ")}]`;
      if (missing.length) detail += ` missing=[${missing.join(", ")}]`;
    }
    push("STRUCTURED_DATA_SCOPE", ok ? "PASS" : "FAIL", detail);
  } else if (externalMicrosite) {
    // The microsite's own markup (JSON-LD included) is production content the
    // candidate does not govern; only status and robots are asserted for it.
    push("STRUCTURED_DATA_SCOPE", "NOT_APPLICABLE", `external microsite emits ${ld.length} JSON-LD block(s) of its own (not governed by the policy)`);
  } else {
    push("STRUCTURED_DATA_SCOPE", ld.length === 0 ? "PASS" : "FAIL", `private route emits ${ld.length} JSON-LD block(s)`);
  }

  if (route.surface === "not-found-error") {
    push("AUTHORITATIVE_404", status === 404 && headerNoindex && metaNoindex ? "PASS" : "FAIL", `status ${status}, headerNoindex=${headerNoindex}, metaNoindex=${metaNoindex}`);
  } else {
    push("AUTHORITATIVE_404", "NOT_APPLICABLE", "not the 404 probe");
  }
  push("PUBLIC_TO_PRIVATE_METADATA_RESTORATION", "NOT_APPLICABLE", "client-side navigation assertion; see browser matrix metadataRestoration");
  return a;
}

function safePath(loc) {
  try {
    const url = new URL(loc);
    if (
      url.origin !== PRODUCTION_SITE_ORIGIN ||
      url.protocol !== "https:" ||
      url.username || url.password || url.search || url.hash ||
      url.toString() !== loc
    ) return null;
    return url.pathname.replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
}
