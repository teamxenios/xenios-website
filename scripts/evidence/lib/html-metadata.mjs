// Pure raw-HTML metadata extraction and HTTP-head assertion evaluation.
// Regex-based on purpose: the assertions concern what a crawler sees in the
// RAW document, before any client script runs, so no DOM is involved.

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

export function extractHtmlMetadata(html) {
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? html;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]?.trim() ?? null;
  const links = head.match(/<link\b[^>]*>/gi) ?? [];
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const canonical = links.map((l) => (attr(l, "rel")?.toLowerCase() === "canonical" ? attr(l, "href") : null)).find(Boolean) ?? null;
  const metaByName = {};
  const metaByProperty = {};
  for (const m of metas) {
    const name = attr(m, "name");
    const property = attr(m, "property");
    const content = attr(m, "content");
    if (name) metaByName[name.toLowerCase()] = content;
    if (property) metaByProperty[property.toLowerCase()] = content;
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
    lang,
    robotsMeta: metaByName["robots"] ?? null,
    description: metaByName["description"] ?? null,
    viewport: metaByName["viewport"] ?? null,
    openGraph: {
      title: metaByProperty["og:title"] ?? null,
      description: metaByProperty["og:description"] ?? null,
      image: metaByProperty["og:image"] ?? null,
      url: metaByProperty["og:url"] ?? null,
      type: metaByProperty["og:type"] ?? null,
    },
    twitterCard: metaByName["twitter:card"] ?? null,
    jsonLd,
    hasRootElement: /<div\b[^>]*id\s*=\s*["']root["']/i.test(html),
  };
}

export function parseSitemapLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) locs.push(decode(m[1]));
  return locs;
}

const isNoindex = (value) => /\bnoindex\b/i.test(String(value ?? ""));

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
  const expectStatus = route.expectStatus ?? 200;
  push("STATUS_CODE", status === expectStatus ? "PASS" : "FAIL", `status ${status} (expected ${expectStatus})`);

  const xRobots = headers["x-robots-tag"] ?? null;
  const robotsMeta = meta?.robotsMeta ?? null;
  const noindexSignalled = isNoindex(xRobots) || isNoindex(robotsMeta);
  if (route.indexable) {
    push("X_ROBOTS_TAG", noindexSignalled ? "FAIL" : "PASS", `x-robots-tag=${xRobots ?? "(none)"} meta.robots=${robotsMeta ?? "(none)"} (indexable route must not be noindex)`);
  } else {
    push("X_ROBOTS_TAG", noindexSignalled ? "PASS" : "FAIL", `x-robots-tag=${xRobots ?? "(none)"} meta.robots=${robotsMeta ?? "(none)"} (private/unindexable route must signal noindex)`);
  }

  push("RAW_HTML_TITLE", meta?.title && meta.title.trim().length > 0 ? "PASS" : "FAIL", `title=${JSON.stringify(meta?.title ?? null)}`);

  if (route.indexable) {
    let canonicalOk = false;
    let canonicalDetail = `canonical=${meta?.canonical ?? "(none)"}`;
    if (meta?.canonical) {
      try {
        const c = new URL(meta.canonical, origin);
        canonicalOk = c.pathname.replace(/\/$/, "") === route.path.replace(/\/$/, "");
        canonicalDetail += canonicalOk ? " (matches route)" : ` (path ${c.pathname} != ${route.path})`;
      } catch {
        canonicalDetail += " (unparseable)";
      }
    }
    push("CANONICAL", canonicalOk ? "PASS" : "FAIL", canonicalDetail);
    const og = meta?.openGraph ?? {};
    const ogOk = Boolean(og.title && og.description);
    push("OPEN_GRAPH", ogOk ? "PASS" : "FAIL", `og:title=${og.title ? "yes" : "no"} og:description=${og.description ? "yes" : "no"} og:image=${og.image ? "yes" : "no"}`);
  } else {
    push("CANONICAL", "NOT_APPLICABLE", "private/unindexable route");
    push("OPEN_GRAPH", "NOT_APPLICABLE", "private/unindexable route");
  }

  if (route.externalMicrosite === true) {
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
    if (allowedTypes) {
      const stray = types.filter((t) => !allowedTypes.includes(t));
      ok = ok && stray.length === 0;
      if (stray.length) detail += ` stray=[${stray.join(", ")}]`;
    }
    push("STRUCTURED_DATA_SCOPE", ok ? "PASS" : "FAIL", detail);
  } else if (route.externalMicrosite === true) {
    // The microsite's own markup (JSON-LD included) is production content the
    // candidate does not govern; only status and robots are asserted for it.
    push("STRUCTURED_DATA_SCOPE", "NOT_APPLICABLE", `external microsite emits ${ld.length} JSON-LD block(s) of its own (not governed by the policy)`);
  } else {
    push("STRUCTURED_DATA_SCOPE", ld.length === 0 ? "PASS" : "FAIL", `private route emits ${ld.length} JSON-LD block(s)`);
  }

  if (route.surface === "not-found-error") {
    push("AUTHORITATIVE_404", status === 404 && noindexSignalled ? "PASS" : "FAIL", `status ${status}, noindex=${noindexSignalled}`);
  } else {
    push("AUTHORITATIVE_404", "NOT_APPLICABLE", "not the 404 probe");
  }
  push("PUBLIC_TO_PRIVATE_METADATA_RESTORATION", "NOT_APPLICABLE", "client-side navigation assertion; see browser matrix metadataRestoration");
  return a;
}

function safePath(loc) {
  try {
    return new URL(loc).pathname.replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
}
