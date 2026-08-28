import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAREERS_ROLES } from "../../../client/src/lib/careers";
import { ICP_BY_SLUG } from "../../../client/src/lib/content";
import { ALL_MANIFEST_ROUTES } from "../../../client/src/research/lib/routes";
import { PUBLIC_QUALITY_ROUTES } from "../../../client/src/research/quality/routes";
import {
  PUBLIC_RESEARCH_EXACT_PATHS,
  isPublicResearchIndexRoute,
} from "../../../client/src/research/seo/route-policy";
import {
  RAW_HTTP_CAREER_DETAILS,
  RAW_HTTP_GLOBAL_PUBLIC_PATHS,
  RAW_HTTP_ICP_PATHS,
  RAW_HTTP_INDEX_ROBOTS,
  RAW_HTTP_NOINDEX_ROBOTS,
  RAW_HTTP_PUBLIC_POLICY_PATHS,
  RAW_HTTP_SITE_ORIGIN,
  buildRawHttpDocumentResponse,
  createRawHttpDocumentPolicyResolver,
} from "./raw-http-document-policy";

const repositoryRoot = resolve(__dirname, "../../..");
const readRepositoryFile = (path: string) =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

const appSource = readRepositoryFile("client/src/App.tsx");
const researchSectionSource = readRepositoryFile("client/src/research/section.tsx");
const researchAdminSectionSource = readRepositoryFile(
  "client/src/research/adminx-section.tsx",
);
const researchRoutePolicySource = readRepositoryFile(
  "client/src/research/seo/route-policy.ts",
);
const serverResearchCompositionSource = readRepositoryFile(
  "server/research/index.ts",
);
const policyHelperSource = readRepositoryFile(
  "server/research/seo/raw-http-document-policy.ts",
);
const sitemapSource = readRepositoryFile("client/public/sitemap.xml");

const sitemapPaths = [...sitemapSource.matchAll(
  /<loc>https:\/\/xeniostechnology\.com(\/[^<]*)<\/loc>/gu,
)].map((match) => match[1]);

const exactResearchPublicPaths = [
  ...PUBLIC_RESEARCH_EXACT_PATHS,
  ...RAW_HTTP_PUBLIC_POLICY_PATHS,
] as const;

const allSitemapPolicyPaths = [
  ...RAW_HTTP_GLOBAL_PUBLIC_PATHS,
  ...RAW_HTTP_CAREER_DETAILS.map((detail) => detail.path),
  ...RAW_HTTP_ICP_PATHS,
];

const defaultResolver = createRawHttpDocumentPolicyResolver();

function count(value: string, search: string): number {
  return value.split(search).length - 1;
}

function schemaIdentities(html: string): string[] {
  return [...html.matchAll(/data-raw-http-schema="([^"]+)"/gu)]
    .map((match) => match[1]);
}

function organization(name = "xenios") {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: RAW_HTTP_SITE_ORIGIN,
  };
}

function website() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "xenios",
    url: RAW_HTTP_SITE_ORIGIN,
  };
}

function faq(answer = "A route-owned answer") {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{
      "@type": "Question",
      name: "What is this?",
      acceptedAnswer: { "@type": "Answer", text: answer },
    }],
  };
}

function jobPosting(
  title: string,
  location: Record<string, unknown> = {
    jobLocationType: "TELECOMMUTE",
  },
) {
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title,
    description: `${title} description`,
    ...location,
  };
}

const inheritedTemplate = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="index,follow" />
    <meta name="&#114;obots" content="index" />
    <meta NAME='googlebot' content='index' />
    <meta name=bingbot content=index />
    <meta http-equiv="x-robots-tag" content="index" />
    <meta property="og:url" content="https://xeniostechnology.com" />
    <meta property="og&#58;url" content="https://xeniostechnology.com/stale" />
    <link rel="canonical" href="https://xeniostechnology.com" />
    <link rel="c&#97;nonical" href="https://xeniostechnology.com/stale" />
    <link rel="alternate" hreflang="en" href="https://xeniostechnology.com" />
    <link rel="stylesheet" href="/assets/app.css" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
    <script TYPE='Application/LD+JSON'>{"@context":"https://schema.org","@type":"WebSite"}</script>
    <script type=application/ld+json>{"@context":"https://schema.org","@type":"LocalBusiness"}</script>
    <script type="application&#x2f;ld&#43;json">{"@context":"https://schema.org","@type":"FAQPage"}</script>
    <script type="module" src="/src/main.tsx"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

const everyPublicSchema = [
  organization(),
  website(),
  faq(),
  jobPosting("Founding Designer"),
  jobPosting("Founding Senior AI Software Engineer"),
];

describe("raw HTTP route authority", () => {
  it("keeps the helper pure and independent of protected composition", () => {
    expect(policyHelperSource).not.toMatch(
      /from\s+["'](?:express|node:fs|node:fs\/promises)["']/u,
    );
    expect(policyHelperSource).not.toContain("process.env");
    expect(policyHelperSource).not.toContain("import.meta");
    expect(policyHelperSource).not.toMatch(/\bfetch\s*\(/u);
    expect(policyHelperSource).not.toContain("server/static");
    expect(policyHelperSource).not.toContain("server/vite");
  });

  it("pins the compact sitemap route identities to their authoritative sources", () => {
    expect(new Set(sitemapPaths).size).toBe(sitemapPaths.length);
    expect(new Set(allSitemapPolicyPaths).size).toBe(allSitemapPolicyPaths.length);
    expect([...new Set(sitemapPaths)].sort()).toEqual(
      [...allSitemapPolicyPaths].sort(),
    );

    expect(
      RAW_HTTP_CAREER_DETAILS.map(({ path, jobPostingTitle }) => ({
        slug: path.slice("/careers/".length),
        group: jobPostingTitle === null ? "cohort" : "open",
        title: jobPostingTitle
          ?? CAREERS_ROLES.find((role) => `/careers/${role.slug}` === path)?.title,
      })),
    ).toEqual(
      CAREERS_ROLES.map((role) => ({
        slug: role.slug,
        group: role.group,
        title: role.title,
      })),
    );

    expect(
      RAW_HTTP_ICP_PATHS.map((path) => path.slice("/for/".length)).sort(),
    ).toEqual(Object.keys(ICP_BY_SLUG).sort());

    const policyIdentityBlock = researchRoutePolicySource.match(
      /const PUBLIC_POLICY_PATHS[\s\S]*?\]\s+as const\);/u,
    )?.[0] ?? "";
    expect(policyIdentityBlock).not.toBe("");
    expect(
      [...policyIdentityBlock.matchAll(/"(\/research\/policies\/[^"]+)"/gu)]
        .map((match) => match[1])
        .sort(),
    ).toEqual([...RAW_HTTP_PUBLIC_POLICY_PATHS].sort());
  });

  it("pins public identities to the actual production composition graph", () => {
    expect(appSource).toContain(
      'const ResearchSection = lazy(() => import("@/research/section"));',
    );
    expect(appSource).toContain(
      '<Route path="/research" component={ResearchRoutes} />',
    );
    expect(appSource).toContain(
      '<Route path="/research/*" component={ResearchRoutes} />',
    );

    for (const path of RAW_HTTP_GLOBAL_PUBLIC_PATHS) {
      expect(appSource, path).toContain(`<Route path="${path}"`);
    }
    expect(appSource).toContain('<Route path="/for/:slug" component={IcpPage} />');
    expect(appSource).toContain(
      '<Route path="/careers/:slug" component={CareersRole} />',
    );

    const researchComposition = `${researchSectionSource}\n${researchAdminSectionSource}`;
    for (const route of ALL_MANIFEST_ROUTES) {
      expect(researchComposition, route).toContain(`path="${route}"`);
    }
    expect(researchSectionSource).toContain(
      '<Route path="/research/policies/:policy" component={PolicyPage} />',
    );
  });

  it("keeps every exact sitemap identity a canonical indexable 200", () => {
    for (const path of sitemapPaths) {
      const policy = defaultResolver.resolve(path);
      const canonical = path === "/"
        ? RAW_HTTP_SITE_ORIGIN
        : `${RAW_HTTP_SITE_ORIGIN}${path}`;
      expect(policy, path).toMatchObject({
        status: 200,
        routeKind: "public",
        reason: "exact_public_document",
        indexable: true,
        robots: RAW_HTTP_INDEX_ROBOTS,
        canonicalPath: path,
        canonicalUrl: canonical,
      });
    }
  });

  it("makes Quality, Testing, and Documents explicit public roots", () => {
    const qualityMatrix = [
      PUBLIC_QUALITY_ROUTES.quality,
      PUBLIC_QUALITY_ROUTES.testing,
      PUBLIC_QUALITY_ROUTES.documents,
    ].map((path) => {
      const policy = defaultResolver.resolve(path);
      return {
        path,
        registeredInProductionSection: researchSectionSource.includes(
          `path="${path}"`,
        ),
        status: policy.status,
        robots: policy.robots,
        canonicalPath: policy.canonicalPath,
        inCurrentSitemap: sitemapPaths.includes(path),
      };
    });

    expect(qualityMatrix).toEqual([
      {
        path: "/research/quality",
        registeredInProductionSection: true,
        status: 200,
        robots: RAW_HTTP_INDEX_ROBOTS,
        canonicalPath: "/research/quality",
        inCurrentSitemap: false,
      },
      {
        path: "/research/testing",
        registeredInProductionSection: true,
        status: 200,
        robots: RAW_HTTP_INDEX_ROBOTS,
        canonicalPath: "/research/testing",
        inCurrentSitemap: false,
      },
      {
        path: "/research/documents",
        registeredInProductionSection: true,
        status: 200,
        robots: RAW_HTTP_INDEX_ROBOTS,
        canonicalPath: "/research/documents",
        inCurrentSitemap: false,
      },
    ]);
    expect(serverResearchCompositionSource).not.toContain(
      "registerPublicQualityApi(",
    );
  });

  it("keeps every exact authoritative Research document canonical and indexable", () => {
    for (const path of exactResearchPublicPaths) {
      expect(isPublicResearchIndexRoute(path), path).toBe(true);
      expect(defaultResolver.resolve(path), path).toMatchObject({
        status: 200,
        routeKind: "public",
        reason: "exact_public_document",
        indexable: true,
        canonicalPath: path,
        canonicalUrl: `${RAW_HTTP_SITE_ORIGIN}${path}`,
      });
    }
  });

  it("classifies the real manifest without a broad private prefix", () => {
    const publicResearch = new Set<string>(exactResearchPublicPaths);
    for (const route of ALL_MANIFEST_ROUTES) {
      if (route === PUBLIC_QUALITY_ROUTES.lot) {
        expect(defaultResolver.resolve("/research/lots/LOT-ALPHA-01"))
          .toMatchObject({ status: 404, routeKind: "not_found" });
        continue;
      }

      const sample = route.replace(/:[^/]+/gu, "synthetic-identity");
      const policy = defaultResolver.resolve(sample);
      if (publicResearch.has(route)) {
        expect(policy, route).toMatchObject({
          status: 200,
          routeKind: "public",
          indexable: true,
        });
      } else {
        expect(policy, route).toMatchObject({
          status: 200,
          routeKind: "private",
          reason: "registered_private_document",
          indexable: false,
          canonicalUrl: null,
        });
      }
    }

    for (const unknown of [
      "/admin/not-a-registered-screen",
      "/research/member/not-a-registered-screen",
      "/research/partners/not-a-registered-screen",
      "/care/not-a-registered-screen",
    ]) {
      expect(defaultResolver.resolve(unknown), unknown).toMatchObject({
        status: 404,
        routeKind: "not_found",
        robots: RAW_HTTP_NOINDEX_ROBOTS,
      });
    }
  });

  it("returns honest 404/noindex for unknown public detail identities", () => {
    for (const target of [
      "/careers/not-a-role",
      "/for/not-an-icp",
      "/research/documents/private",
      "/research/documents/private.pdf",
      "/research/lots/LOT-ALPHA-01",
      "/research/policies/not-a-policy",
      "/research/catalog/peptides/not-a-product",
      "/research/categories/not-a-category",
      "/review/seo",
      "/definitely-not-a-page",
    ]) {
      expect(defaultResolver.resolve(target), target).toMatchObject({
        status: 404,
        routeKind: "not_found",
        reason: "unknown_document",
        indexable: false,
        robots: RAW_HTTP_NOINDEX_ROBOTS,
        canonicalPath: null,
        canonicalUrl: null,
        schema: { singletonTypes: [], jobPostingTitles: [] },
      });
    }
  });

  it("allows only injected exact lot identities and keeps Lot Verification noindex", () => {
    const resolver = createRawHttpDocumentPolicyResolver({
      approvedPublicLotCodes: ["LOT-ALPHA-01", "bad/lot", "A"],
    });
    expect(resolver.rejectedApprovedPublicLotCodes).toEqual(["bad/lot", "A"]);

    for (const target of [
      "/research/lots/LOT-ALPHA-01",
      "/research/lots/lot-alpha-01",
      "/research/lots/LOT-ALPHA-01/",
      "/research/lots/LOT-ALPHA-01?source=email#result",
    ]) {
      expect(resolver.resolve(target), target).toMatchObject({
        status: 200,
        routeKind: "public",
        reason: "registered_public_noindex_document",
        indexable: false,
        robots: RAW_HTTP_NOINDEX_ROBOTS,
        canonicalPath: null,
        canonicalUrl: null,
      });
    }

    for (const target of [
      "/research/lots/LOT-BETA-02",
      "/research/lots/LOT-ALPHA-01/private-document",
    ]) {
      expect(resolver.resolve(target), target).toMatchObject({
        status: 404,
        routeKind: "not_found",
        indexable: false,
      });
    }
  });

  it("ignores query and fragment suffixes without changing route identity", () => {
    for (const target of [
      "/product?utm_source=test",
      "/research/quality?utm=x#section",
      "/careers/founding-designer#apply",
      "/?campaign=founders",
      "/product?bad=%ZZ path\\still-query#../../admin",
      `/research/quality?${"x".repeat(5000)}`,
    ]) {
      const pathname = target.split(/[?#]/u, 1)[0] || "/";
      expect(defaultResolver.resolve(target), target).toMatchObject({
        status: 200,
        routeKind: "public",
        reason: "exact_public_document",
        indexable: true,
        canonicalPath: pathname,
        canonicalUrl: pathname === "/"
          ? RAW_HTTP_SITE_ORIGIN
          : `${RAW_HTTP_SITE_ORIGIN}${pathname}`,
      });
    }

    expect(defaultResolver.resolve("/research/sign-in?returnTo=/product#auth"))
      .toMatchObject({
        status: 200,
        routeKind: "private",
        indexable: false,
        canonicalUrl: null,
      });
    expect(defaultResolver.resolve("/research/sign-in?bad=%ZZ path\\still-query"))
      .toMatchObject({
        status: 200,
        routeKind: "private",
        indexable: false,
      });
    expect(defaultResolver.resolve("/careers/missing?slug=founding-designer#apply"))
      .toMatchObject({
        status: 404,
        routeKind: "not_found",
        indexable: false,
      });
  });

  it("downgrades only noncanonical pathname spellings", () => {
    for (const target of [
      "/PRODUCT",
      "/product/",
      "/%70roduct",
      "/Research/Quality?utm=x",
      "/careers/%66ounding-designer",
    ]) {
      expect(defaultResolver.resolve(target), target).toMatchObject({
        status: 200,
        routeKind: "public",
        reason: "unsafe_public_variant",
        indexable: false,
        robots: RAW_HTTP_NOINDEX_ROBOTS,
        canonicalPath: null,
        canonicalUrl: null,
        schema: { singletonTypes: [], jobPostingTitles: [] },
      });
    }
  });

  it("fails closed on hostile or malformed request targets", () => {
    for (const target of [
      "",
      "product",
      "*",
      "https://evil.example/product",
      "//evil.example/product",
      "/product//child",
      "/product/../admin",
      "/product/%2e%2e/admin",
      "/product\\admin",
      "/product%00",
      "/product%0a",
      "/product%ZZ",
      "/product\t",
    ]) {
      expect(defaultResolver.resolve(target), JSON.stringify(target)).toMatchObject({
        status: 404,
        routeKind: "not_found",
        reason: "invalid_request_target",
        indexable: false,
        canonicalUrl: null,
      });
    }

    for (const target of [
      "/careers%2Ffounding-designer",
      "/product%3Fadmin=true",
      "/%252e%252e/admin",
    ]) {
      expect(defaultResolver.resolve(target), target).toMatchObject({
        status: 404,
        routeKind: "not_found",
        reason: "unknown_document",
        indexable: false,
      });
    }
  });
});

describe("raw HTTP HTML and schema policy", () => {
  it("replaces inherited homepage SEO authority on an ordinary public route", () => {
    const response = buildRawHttpDocumentResponse({
      requestTarget: "/product",
      templateHtml: inheritedTemplate,
      structuredData: everyPublicSchema,
    });

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": RAW_HTTP_INDEX_ROBOTS,
      Link: `<${RAW_HTTP_SITE_ORIGIN}/product>; rel="canonical"`,
    });
    expect(count(response.html, 'data-raw-http-policy="robots"')).toBe(1);
    expect(count(response.html, 'rel="canonical"')).toBe(1);
    expect(count(response.html, 'property="og:url"')).toBe(1);
    expect(response.html).toContain('rel="stylesheet"');
    expect(response.html).toContain('type="module"');
    expect(response.html).not.toContain("application/ld+json");
    expect(schemaIdentities(response.html)).toEqual([]);
  });

  it("serves private and unknown documents with raw noindex and zero public schema", () => {
    const cases = [
      ["/admin", 200],
      ["/admin/research/applications/synthetic", 200],
      ["/research/account", 200],
      ["/research/sign-in?token=secret", 200],
      ["/research/apply/review", 200],
      ["/care/provider-review", 200],
      ["/care/reviews", 200],
      ["/review/seo", 404],
      ["/careers/missing", 404],
      ["/research/documents/private.pdf", 404],
    ] as const;

    for (const [requestTarget, status] of cases) {
      const response = buildRawHttpDocumentResponse({
        requestTarget,
        templateHtml: inheritedTemplate,
        structuredData: everyPublicSchema,
      });
      expect(response.status, requestTarget).toBe(status);
      expect(response.headers, requestTarget).toEqual({
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": RAW_HTTP_NOINDEX_ROBOTS,
      });
      expect(count(response.html, 'data-raw-http-policy="robots"'), requestTarget)
        .toBe(1);
      expect(response.html, requestTarget).toContain(RAW_HTTP_NOINDEX_ROBOTS);
      expect(response.html, requestTarget).not.toContain("application/ld+json");
      expect(response.html, requestTarget).not.toContain('rel="canonical"');
      expect(response.html, requestTarget).not.toContain('property="og:url"');
      expect(response.html, requestTarget).not.toContain('rel="alternate"');
      expect(schemaIdentities(response.html), requestTarget).toEqual([]);
    }
  });

  it("allows only exact route-owned singleton schema and drops duplicate identities", () => {
    const homepage = buildRawHttpDocumentResponse({
      requestTarget: "/?utm=founders#top",
      templateHtml: inheritedTemplate,
      structuredData: [
        organization("first"),
        organization("duplicate"),
        website(),
        faq(),
        jobPosting("Founding Designer"),
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          url: RAW_HTTP_SITE_ORIGIN,
        },
      ],
    });
    expect(schemaIdentities(homepage.html)).toEqual(["WebSite"]);
    expect(homepage.policy.canonicalUrl).toBe(RAW_HTTP_SITE_ORIGIN);

    const faqPage = buildRawHttpDocumentResponse({
      requestTarget: "/research/faq",
      templateHtml: inheritedTemplate,
      structuredData: [faq(), organization(), website()],
    });
    expect(schemaIdentities(faqPage.html)).toEqual(["FAQPage"]);

    const duplicatedFaq = buildRawHttpDocumentResponse({
      requestTarget: "/research/faq",
      templateHtml: inheritedTemplate,
      structuredData: [faq("one"), faq("two")],
    });
    expect(schemaIdentities(duplicatedFaq.html)).toEqual([]);

    const nestedRouteLeak = buildRawHttpDocumentResponse({
      requestTarget: "/",
      templateHtml: inheritedTemplate,
      structuredData: [{ ...organization(), subjectOf: faq("nested leak") }],
    });
    expect(schemaIdentities(nestedRouteLeak.html)).toEqual([]);

    const nestedGlobalLeak = buildRawHttpDocumentResponse({
      requestTarget: "/research/faq",
      templateHtml: inheritedTemplate,
      structuredData: [{ ...faq(), publisher: organization() }],
    });
    expect(schemaIdentities(nestedGlobalLeak.html)).toEqual([]);
  });

  it("gates JobPosting schema by exact open role and rejects Remote as a country", () => {
    const designer = jobPosting("Founding Designer", {
      jobLocationType: "TELECOMMUTE",
      hiringOrganization: {
        "@type": "Organization",
        name: "Xenios Technologies, Inc.",
      },
      applicantLocationRequirements: {
        "@type": "Country",
        name: "United States",
      },
    });
    const senior = jobPosting("Founding Senior AI Software Engineer");
    const remoteCountry = jobPosting("Founding Senior AI Software Engineer", {
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: {
        "@type": "Country",
        name: "Remote",
      },
    });
    const remoteAddressCountry = jobPosting("Founding Senior AI Software Engineer", {
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressCountry: "Remote",
        },
      },
    });
    const cohort = jobPosting("Founding Coach Cohort");

    const landing = buildRawHttpDocumentResponse({
      requestTarget: "/careers",
      templateHtml: inheritedTemplate,
      structuredData: [
        designer,
        senior,
        cohort,
      ],
    });
    expect(schemaIdentities(landing.html)).toEqual([
      "JobPosting:Founding Designer",
      "JobPosting:Founding Senior AI Software Engineer",
    ]);
    expect(landing.html).not.toContain('"name":"Remote"');
    expect(landing.html).not.toContain('"addressCountry":"Remote"');

    for (const malformedLocation of [remoteCountry, remoteAddressCountry]) {
      const rejected = buildRawHttpDocumentResponse({
        requestTarget: "/careers/founding-senior-ai-software-engineer",
        templateHtml: inheritedTemplate,
        structuredData: [malformedLocation],
      });
      expect(schemaIdentities(rejected.html)).toEqual([]);
    }

    const detail = buildRawHttpDocumentResponse({
      requestTarget: "/careers/founding-designer?source=linkedin#apply",
      templateHtml: inheritedTemplate,
      structuredData: [designer, senior, cohort],
    });
    expect(schemaIdentities(detail.html)).toEqual([
      "JobPosting:Founding Designer",
    ]);

    const cohortDetail = buildRawHttpDocumentResponse({
      requestTarget: "/careers/founding-coach-cohort",
      templateHtml: inheritedTemplate,
      structuredData: [designer, senior, cohort],
    });
    expect(schemaIdentities(cohortDetail.html)).toEqual([]);

    const duplicatedRole = buildRawHttpDocumentResponse({
      requestTarget: "/careers/founding-designer",
      templateHtml: inheritedTemplate,
      structuredData: [designer, { ...designer, description: "duplicate" }],
    });
    expect(schemaIdentities(duplicatedRole.html)).toEqual([]);
  });

  it("escapes JSON-LD script breakers and skips unserializable values", () => {
    const circular = organization() as Record<string, unknown>;
    circular.self = circular;
    const response = buildRawHttpDocumentResponse({
      requestTarget: "/research/faq",
      templateHtml: inheritedTemplate,
      structuredData: [
        faq('</script><script>alert("schema")</script>&\u2028'),
        circular,
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: 1n,
        },
      ],
    });

    expect(schemaIdentities(response.html)).toEqual(["FAQPage"]);
    expect(response.html).not.toContain('</script><script>alert("schema")');
    expect(response.html).toContain("\\u003c/script\\u003e");
    expect(response.html).toContain("\\u0026");
    expect(response.html).toContain("\\u2028");
  });

  it("refuses templates it cannot sanitize deterministically", () => {
    expect(() => buildRawHttpDocumentResponse({
      requestTarget: "/product",
      templateHtml: "<html><head><title>x</title></headless><body></body></html>",
    })).toThrow("missing a closing head");

    expect(() => buildRawHttpDocumentResponse({
      requestTarget: "/admin",
      templateHtml: "<html><head><script type='application&#x2f;ld&#43;json'>{}</head></html>",
    })).toThrow("unrecognized JSON-LD");
  });
});
