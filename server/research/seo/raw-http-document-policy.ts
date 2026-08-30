import {
  ALL_MANIFEST_ROUTES,
} from "../../../client/src/research/lib/routes";
import {
  CAREERS_ROLES,
  OPEN_ROLES,
} from "../../../client/src/lib/careers";
import {
  buildJobPostingJsonLd,
} from "../../../client/src/lib/careers-schema";
import {
  ICP_BY_SLUG,
  PAGES,
} from "../../../client/src/lib/content";
import {
  PUBLIC_QUALITY_ROUTES,
  publicLotRoute,
} from "../../../client/src/research/quality/routes";
import {
  PUBLIC_RESEARCH_EXACT_PATHS,
} from "../../../client/src/research/seo/route-policy";

/**
 * Raw-document policy for the SPA fallback.
 *
 * This module deliberately has no Express, filesystem, DOM, or environment
 * dependency. The protected production and Vite fallbacks can both resolve a
 * request target, sanitize their already-read index template, and then apply
 * the returned status/headers/body atomically.
 *
 * Dynamic public lots are absent by default. A composition may inject exact
 * lot codes only after the publication authority has proved them public.
 * Unknown or malformed identities therefore stay honest 404s instead of
 * inheriting the SPA's indexable 200 response.
 */

export const RAW_HTTP_SITE_ORIGIN = "https://xeniostechnology.com";
export const RAW_HTTP_INDEX_ROBOTS =
  "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1";
export const RAW_HTTP_NOINDEX_ROBOTS = "noindex,nofollow,noarchive";

/** Exact non-detail paths in client/public/sitemap.xml. */
export const RAW_HTTP_GLOBAL_PUBLIC_PATHS = Object.freeze([
  "/",
  "/product",
  "/how-it-works",
  "/for-coaches",
  "/waitlist",
  "/about",
  "/careers",
  "/security",
  "/compliance",
  "/investors",
  "/contact",
  "/book",
  "/early-interest",
  "/for-clients",
  "/for-practitioners",
  "/storefront",
  "/network",
  "/ecosystem",
  "/manifesto",
  "/press",
  "/concepts",
  "/mvps",
  "/privacy",
  "/terms",
  "/disclosures",
] as const);

/**
 * The live /careers/:slug identities from client/src/lib/careers.ts.
 * The adjacent source test pins this compact server projection bidirectionally
 * to that authoritative content source, including open/cohort classification.
 */
export const RAW_HTTP_CAREER_DETAILS = Object.freeze(
  CAREERS_ROLES.map((role) => Object.freeze({
    path: `/careers/${role.slug}`,
    jobPostingTitle: role.group === "open" ? role.title : null,
  })),
);

/**
 * The live /for/:slug identities from client/src/lib/content.ts. Keeping the
 * compact identities here avoids pulling the complete page-copy corpus into
 * the server bundle; source parity makes drift a failing test.
 */
export const RAW_HTTP_ICP_PATHS = Object.freeze([
  "/for/strength-coaches",
  "/for/personal-trainers",
  "/for/sports-performance",
  "/for/functional-medicine",
  "/for/longevity-clinics",
  "/for/concierge-medicine",
  "/for/performance-labs",
  "/for/recovery-studios",
  "/for/virtual-coaching",
  "/for/preventive-care",
  "/for/nutrition-companies",
  "/for/supplement-brands",
  "/for/athlete-brands",
  "/for/corporate-wellness",
  "/for/healthcare-systems",
  "/for/military",
  "/for/biohacking-clinics",
  "/for/physical-therapists",
  "/for/chiropractors",
  "/for/hormone-clinics",
  "/for/wellness-clinics",
  "/for/self-insured-employers",
  "/for/elite-athletes",
  "/for/creators",
  "/for/sports-agencies",
] as const);

/** Exact document identities behind the registered /research/policies/:policy route. */
export const RAW_HTTP_PUBLIC_POLICY_PATHS = Object.freeze([
  "/research/policies/research-use",
  "/research/policies/shipping",
  "/research/policies/returns",
  "/research/policies/accessibility",
] as const);

const OPEN_JOB_TITLES = Object.freeze(
  RAW_HTTP_CAREER_DETAILS.flatMap((detail) =>
    detail.jobPostingTitle === null ? [] : [detail.jobPostingTitle],
  ),
);

export const RAW_HTTP_HOMEPAGE_STRUCTURED_DATA = Object.freeze([
  Object.freeze({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${RAW_HTTP_SITE_ORIGIN}/#org`,
    name: "xenios",
    alternateName: "Xenios Technologies",
    legalName: "Xenios Technologies, Inc.",
    url: RAW_HTTP_SITE_ORIGIN,
    logo: `${RAW_HTTP_SITE_ORIGIN}/brand/xenios-mark.png`,
    email: "team@xeniostechnology.com",
    description: "An AI workspace for health and performance professionals.",
    areaServed: "US",
    foundingLocation: Object.freeze({
      "@type": "Place",
      address: Object.freeze({
        "@type": "PostalAddress",
        addressLocality: "Austin",
        addressRegion: "TX",
        addressCountry: "US",
      }),
    }),
    sameAs: Object.freeze([
      "https://www.instagram.com/officialxenios",
      "https://www.linkedin.com/company/officialxenios",
    ]),
  }),
  Object.freeze({
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: RAW_HTTP_SITE_ORIGIN,
    name: "xenios",
    publisher: Object.freeze({ "@id": `${RAW_HTTP_SITE_ORIGIN}/#org` }),
  }),
] as const);

/** Exact route-owned schemas supplied by production composition, never parsed from the SPA template. */
export function rawHttpStructuredDataForPath(path: string): readonly unknown[] {
  if (path === "/") return RAW_HTTP_HOMEPAGE_STRUCTURED_DATA;
  const roles = path === "/careers"
    ? OPEN_ROLES
    : OPEN_ROLES.filter((role) => `/careers/${role.slug}` === path);
  return Object.freeze(roles.map((role) => Object.freeze(buildJobPostingJsonLd(role))));
}

export interface RawHttpDocumentMetadata {
  readonly title: string;
  readonly description: string;
}

const metadata = (title: string, description: string): RawHttpDocumentMetadata =>
  Object.freeze({ title, description });

/**
 * Exact client-owned identities for literals that are not sourced from
 * PAGES/ICP/careers data. Evidence compares these raw values with the browser
 * values so a client literal cannot drift silently.
 */
const RAW_HTTP_LITERAL_PUBLIC_METADATA: Readonly<Record<string, RawHttpDocumentMetadata>> =
  Object.freeze({
    "/": metadata(
      "xenios | The operating system for proactive health",
      "The professional stays in front. Xen and Athena carry the work behind them.",
    ),
    "/product": metadata(
      "Product, xenios",
      "See how xenios works across one inbox, one client record, AI drafting, weekly check-ins, and the Client Attention Queue.",
    ),
    "/for-coaches": metadata(
      "For Coaches, xenios",
      "xenios helps high-touch coaches manage more clients without losing the human relationship. The AI drafts, the coach decides.",
    ),
    "/about": metadata(
      "About, xenios",
      "Learn why xenios exists, who is building it, and how the company approaches trust, client relationships, and proactive health infrastructure.",
    ),
    "/careers": metadata(
      "Careers, xenios",
      "Open founding roles and the founding coach cohort at xenios.",
    ),
    "/security": metadata(
      "Security, xenios",
      "xenios treats client context and AI boundaries as product responsibilities, with scoped access, approval gates, and a security-first posture.",
    ),
    "/compliance": metadata(
      "Compliance, xenios",
      "xenios keeps compliance language honest, with clear AI boundaries, scope of practice rules, and a roadmap for trust documentation.",
    ),
    "/investors": metadata(
      "Investors, xenios",
      "xenios is building the AI-native operating layer for proactive health professionals, starting with coaches and the client attention workflow.",
    ),
    "/book": metadata("Book a call with xenios", "Book a call with the xenios team."),
    "/early-interest": metadata(
      "Early interest in xenios",
      "Share your interest in the founding group of coaches.",
    ),
    "/concepts": metadata(
      "Early concepts from xenios",
      "A look at early concepts in development at xenios.",
    ),
    "/mvps": metadata(
      "xenios MVP Lab",
      "Functional synthetic demos for testing the xenios product system. Synthetic data only.",
    ),
    "/disclosures": metadata(
      "Disclosures - xenios",
      "Cookie and tracking, AI disclosure, medical disclaimer, and data deletion for xenios.",
    ),
    "/research": metadata(
      "Xenios Research | Clear, evidence-aware research access",
      "Explore Xenios Research, understand product and documentation status, and choose the correct Research, Care, organization, or partner pathway.",
    ),
    "/research/access-hub": metadata(
      "Access Xenios Research",
      "Choose the Xenios Research access path that matches your intended relationship or question.",
    ),
    "/research/how-it-works": metadata(
      "How Xenios Research works",
      "Understand the Xenios Research journey from access selection and exact product review to truthful request, order, document, and support status.",
    ),
    "/research/quality": metadata(
      "Quality system | Xenios Research",
      "See how Xenios Research handles receiving, lot identity, quarantine, evidence review, release decisions, documents, storage, and fulfillment traceability.",
    ),
    "/research/testing": metadata(
      "Testing explained | Xenios Research",
      "Understand identity, purity, assay, microbial, contaminant, and stability evidence—and the limits of every result.",
    ),
    "/research/documents": metadata(
      "Quality documents | Xenios Research",
      "Find approved public lot records or sign in for secure, ownership-scoped account documents.",
    ),
    "/research/organizations": metadata(
      "Organization access | Xenios Research",
      "Reviewed organization access for laboratories, research teams, clinics, medical spas, professional buyers, and qualified product-development partners.",
    ),
    "/research/partners": metadata(
      "Business partnerships | Xenios Research",
      "Reviewed pathways for research organizations, clinics, medical spas, providers, affiliates, collectives, suppliers, white-label teams, and strategic partners.",
    ),
    "/research/affiliates": metadata(
      "Affiliate access | Xenios Research",
      "A compliance-first affiliate pathway with reviewed applications, approved resources, durable attribution, and no influence over clinical decisions.",
    ),
    "/research/supplier-access": metadata(
      "Supplier and laboratory access | Xenios Research",
      "Prospective supplier, laboratory, and fulfillment pathways with minimum-data boundaries, evidence requirements, and human review.",
    ),
    "/research/about": metadata(
      "About Xenios Research",
      "Learn why Xenios Research combines clear product identity, documentation context, truthful access states, and human operations.",
    ),
    "/research/faq": metadata(
      "Frequently asked questions | Xenios Research",
      "Plain answers about Research use, product status, orders, payment, fulfillment, quality documents, Care, scheduling, accounts, organizations, and support.",
    ),
    "/research/support": metadata(
      "Support, xenios research",
      "Contact xenios research support, check an application, claim an approved account, or reset a password.",
    ),
    "/research/policies": metadata(
      "Research policies | Xenios Research",
      "Find the public Xenios Research-use, privacy, terms, shipping, and returns documents with their current publication status shown plainly.",
    ),
    "/research/contact": metadata(
      "Contact Xenios Research",
      "Contact Xenios Research for operational support, account help, documents, organization context, or help choosing the correct Research or Care pathway.",
    ),
    "/research/privacy": metadata(
      "Privacy Policy, xenios research",
      "The privacy policy for the xenios research section.",
    ),
    "/research/terms": metadata(
      "Terms of Service, xenios research",
      "The terms of service for the xenios research section.",
    ),
    "/research/policies/research-use": metadata(
      "Research Use Policy, xenios research",
      "Research Use Policy for the xenios research section.",
    ),
    "/research/policies/shipping": metadata(
      "Shipping Policy, xenios research",
      "Shipping Policy for the xenios research section.",
    ),
    "/research/policies/returns": metadata(
      "Returns and Replacements, xenios research",
      "Returns and Replacements for the xenios research section.",
    ),
    "/research/policies/accessibility": metadata(
      "Accessibility Statement, xenios research",
      "Accessibility Statement for the xenios research section.",
    ),
  });

export function rawHttpDocumentMetadataForPath(path: string): RawHttpDocumentMetadata | null {
  const literal = RAW_HTTP_LITERAL_PUBLIC_METADATA[path];
  if (literal) return literal;
  const contentPage = Object.values(PAGES).find((page) => page.path === path);
  if (contentPage && path !== "/404") {
    return metadata(contentPage.title, contentPage.description);
  }
  if (path.startsWith("/for/")) {
    const icp = ICP_BY_SLUG[path.slice("/for/".length)];
    if (icp) return metadata(`${icp.label}, xenios`, icp.oneLiner);
  }
  if (path.startsWith("/careers/")) {
    const role = CAREERS_ROLES.find((candidate) => `/careers/${candidate.slug}` === path);
    if (role) return metadata(`${role.title}, xenios`, role.summary);
  }
  if (/^\/research\/lots\/[^/]+$/u.test(path)) {
    return metadata(
      "Verify a lot | Xenios Research",
      "Check an exact lot code against the approved Xenios Research public quality record.",
    );
  }
  return null;
}

const KNOWN_NOINDEX_EXACT_PATHS = Object.freeze([
  // Top-level admin/auth and client redirects.
  "/admin",
  "/kairos",
  "/argos",
  "/telemedicine",
  "/agents",
  "/developers",
  "/enterprise",
  "/ontology",
  "/partners",
  "/faq",
  "/careers/innovative-product-builder",

  // Every exact Care document remains noindex in the client contract.
  "/care",
  "/care/schedule",
  "/care/portal",
  "/care/how-it-works",
  "/care/provider-review",
  "/care/support",
  "/care/reviews",
  "/care/eligibility",
  "/care/consent",
  "/care/appointments",
  "/care/prescriptions",
  "/care/pharmacy",

  // Registered Research routes not present in the canonical manifest.
  "/research/early-access/order-request",
  "/research/apply/review",
  "/research/apply/success",
  "/research/apply/status",
  "/research/application/status",
  "/research/member/welcome",
  "/admin/research/inventory/lots",
  "/admin/research/inventory/coas",
  "/admin/research/early-access/payments",

  // Registered compatibility redirects. They are known, but never canonical
  // public documents in their own right.
  "/research/products",
  "/research/products/peptides",
  "/research/products/supplements",
  "/research/products/quantum",
  "/research/guides",
  "/research/orders",
  "/research/subscriptions",
  "/research/referrals",
  "/research/profile",
  "/research/systems",
  "/research/peptides",
  "/research/supplements",
  "/research/quantum",
  "/research/shop",
  "/research/build-a-system",
  "/research/learn",
  "/research/cart",
  "/research/membership",
  "/research/framework",
  "/research/programs",
  "/research/professionals",
  "/research/access",
  "/research/wholesale",
  "/research/access-gate",
] as const);

const KNOWN_NOINDEX_PATTERNS = Object.freeze([
  "/research/early-access/order-request/confirmation/:publicReference",
  "/research/early-access/order-request/:publicReference",
  "/research/products/:slug",
  "/research/product/:slug",
  "/admin/research/assisted-orders/:requestId",
] as const);

type SingletonSchemaType = "Organization" | "WebSite" | "FAQPage";
type AllowedSchemaType = SingletonSchemaType | "JobPosting";

export interface RawHttpSchemaAllowance {
  readonly singletonTypes: readonly SingletonSchemaType[];
  readonly jobPostingTitles: readonly string[];
}

export type RawHttpRouteKind = "public" | "private" | "not_found";

export type RawHttpPolicyReason =
  | "exact_public_document"
  | "registered_public_noindex_document"
  | "unsafe_public_variant"
  | "registered_private_document"
  | "unknown_document"
  | "invalid_request_target"
  | "ambiguous_route_identity";

export interface RawHttpDocumentPolicy {
  readonly status: 200 | 404;
  readonly routeKind: RawHttpRouteKind;
  readonly reason: RawHttpPolicyReason;
  readonly normalizedPath: string | null;
  readonly indexable: boolean;
  readonly robots: typeof RAW_HTTP_INDEX_ROBOTS | typeof RAW_HTTP_NOINDEX_ROBOTS;
  readonly canonicalPath: string | null;
  readonly canonicalUrl: string | null;
  readonly schema: RawHttpSchemaAllowance;
}

export interface RawHttpPolicyResolverOptions {
  /**
   * Exact lot codes proven public by the authoritative publication source.
   * Invalid values are rejected and reported; omission means no public lot
   * detail can receive a 200 document response.
   */
  readonly approvedPublicLotCodes?: readonly string[];
}

export interface RawHttpDocumentPolicyResolver {
  readonly rejectedApprovedPublicLotCodes: readonly string[];
  /** Raw origin-form target (for example req.originalUrl), never a normalized path. */
  resolve(requestTarget: string): RawHttpDocumentPolicy;
}

interface RouteEntry {
  readonly kind: "public_index" | "public_noindex" | "private";
  readonly canonicalPath: string;
  readonly schema: RawHttpSchemaAllowance;
}

interface ParsedRequestTarget {
  readonly key: string;
  readonly rawPath: string;
  readonly hasQueryOrFragment: boolean;
}

interface PrivatePattern {
  readonly source: string;
  readonly expression: RegExp;
}

const EMPTY_SCHEMA: RawHttpSchemaAllowance = Object.freeze({
  singletonTypes: Object.freeze([]) as readonly SingletonSchemaType[],
  jobPostingTitles: Object.freeze([]) as readonly string[],
});

const INVALID_TARGET_CHARACTER = /[\\\s\u0000-\u001f\u007f]/u;
const DOT_SEGMENT = /\/(?:\.{1,2})(?:\/|$)/u;
const MAX_REQUEST_PATH_LENGTH = 4096;

function schemaAllowance(
  singletonTypes: readonly SingletonSchemaType[] = [],
  jobPostingTitles: readonly string[] = [],
): RawHttpSchemaAllowance {
  return Object.freeze({
    singletonTypes: Object.freeze([...singletonTypes]),
    jobPostingTitles: Object.freeze([...jobPostingTitles]),
  });
}

function parseRequestTarget(value: string): ParsedRequestTarget | null {
  if (
    typeof value !== "string"
    || value.length === 0
  ) {
    return null;
  }

  const queryIndex = value.indexOf("?");
  const fragmentIndex = value.indexOf("#");
  const suffixIndexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);
  const suffixIndex = suffixIndexes.length > 0
    ? Math.min(...suffixIndexes)
    : value.length;
  const rawPath = value.slice(0, suffixIndex);

  // Suffix content has no route authority. Validate only the pathname so a
  // query or fragment can neither promote nor downgrade the same document.
  if (
    rawPath.length === 0
    || rawPath.length > MAX_REQUEST_PATH_LENGTH
    || INVALID_TARGET_CHARACTER.test(rawPath)
    || !rawPath.startsWith("/")
  ) return null;

  let decodedPath: string;
  try {
    // decodeURI mirrors the client router while preserving encoded reserved
    // separators such as %2F, so they never become routing boundaries here.
    decodedPath = decodeURI(rawPath);
  } catch {
    return null;
  }

  if (
    INVALID_TARGET_CHARACTER.test(decodedPath)
    || decodedPath.includes("//")
    || DOT_SEGMENT.test(decodedPath)
  ) {
    return null;
  }

  const lowerPath = decodedPath.toLowerCase();
  const key = lowerPath.length > 1 && lowerPath.endsWith("/")
    ? lowerPath.slice(0, -1)
    : lowerPath;

  return {
    key,
    rawPath,
    hasQueryOrFragment: suffixIndex < value.length,
  };
}

function canonicalRouteKey(path: string): string | null {
  if (path.includes("?") || path.includes("#") || path.includes(":")) return null;
  const parsed = parseRequestTarget(path);
  if (!parsed || parsed.hasQueryOrFragment || parsed.rawPath !== path) return null;
  return parsed.key;
}

function sameSchema(a: RawHttpSchemaAllowance, b: RawHttpSchemaAllowance): boolean {
  return (
    a.singletonTypes.join("\u0000") === b.singletonTypes.join("\u0000")
    && a.jobPostingTitles.join("\u0000") === b.jobPostingTitles.join("\u0000")
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function compilePrivatePattern(source: string): PrivatePattern {
  if (!source.startsWith("/") || source.includes("?") || source.includes("#")) {
    throw new Error(`invalid raw HTTP route pattern: ${source}`);
  }
  const segments = source.slice(1).split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`invalid raw HTTP route pattern: ${source}`);
  }
  const expression = segments.map((segment) => {
    if (segment.startsWith(":")) {
      if (!/^:[A-Za-z][A-Za-z0-9]*$/u.test(segment)) {
        throw new Error(`invalid raw HTTP route parameter: ${source}`);
      }
      return "[^/]+";
    }
    if (segment.includes(":")) {
      throw new Error(`ambiguous raw HTTP route segment: ${source}`);
    }
    return escapeRegExp(segment.toLowerCase());
  });
  return {
    source,
    expression: new RegExp(`^/${expression.join("/")}$`, "u"),
  };
}

function publicSchemaForPath(path: string): RawHttpSchemaAllowance {
  if (path === "/") {
    return schemaAllowance(["Organization", "WebSite"]);
  }
  if (path === "/careers") {
    return schemaAllowance([], OPEN_JOB_TITLES);
  }
  const career = RAW_HTTP_CAREER_DETAILS.find((detail) => detail.path === path);
  return career?.jobPostingTitle
    ? schemaAllowance([], [career.jobPostingTitle])
    : EMPTY_SCHEMA;
}

export function createRawHttpDocumentPolicyResolver(
  options: RawHttpPolicyResolverOptions = {},
): RawHttpDocumentPolicyResolver {
  const exactRoutes = new Map<string, RouteEntry>();
  const ambiguousKeys = new Set<string>();
  const privatePatterns: PrivatePattern[] = [];
  const privatePatternSources = new Set<string>();
  const rejectedApprovedPublicLotCodes: string[] = [];

  const addExact = (entry: RouteEntry) => {
    const key = canonicalRouteKey(entry.canonicalPath);
    if (key === null) {
      throw new Error(`invalid exact raw HTTP route: ${entry.canonicalPath}`);
    }
    if (ambiguousKeys.has(key)) return;
    const existing = exactRoutes.get(key);
    if (!existing) {
      exactRoutes.set(key, entry);
      return;
    }
    if (
      existing.kind !== entry.kind
      || existing.canonicalPath !== entry.canonicalPath
      || !sameSchema(existing.schema, entry.schema)
    ) {
      exactRoutes.delete(key);
      ambiguousKeys.add(key);
    }
  };

  const addPublic = (path: string, indexable = true) => {
    addExact({
      kind: indexable ? "public_index" : "public_noindex",
      canonicalPath: path,
      schema: indexable ? publicSchemaForPath(path) : EMPTY_SCHEMA,
    });
  };

  const addPrivate = (path: string) => {
    addExact({ kind: "private", canonicalPath: path, schema: EMPTY_SCHEMA });
  };

  const addPrivatePattern = (source: string) => {
    if (privatePatternSources.has(source)) return;
    privatePatternSources.add(source);
    privatePatterns.push(compilePrivatePattern(source));
  };

  for (const path of RAW_HTTP_GLOBAL_PUBLIC_PATHS) addPublic(path);
  for (const path of RAW_HTTP_ICP_PATHS) addPublic(path);
  for (const detail of RAW_HTTP_CAREER_DETAILS) addPublic(detail.path);
  for (const path of PUBLIC_RESEARCH_EXACT_PATHS) addPublic(path);
  for (const path of RAW_HTTP_PUBLIC_POLICY_PATHS) addPublic(path);

  for (const rawLotCode of options.approvedPublicLotCodes ?? []) {
    const route = publicLotRoute(rawLotCode);
    if (route === null) {
      rejectedApprovedPublicLotCodes.push(rawLotCode);
      continue;
    }
    // Lot Verification is a public document only after an authoritative
    // publication identity is injected. It remains noindex even then: the
    // editorial Quality, Testing, and Documents roots are the search-facing
    // pages, not operational lot-detail records.
    addPublic(route, false);
  }

  // Consume the canonical Research manifest instead of treating /research,
  // /account, /member, /partners, or /admin as broad 200 prefixes. The one
  // public dynamic pattern is deliberately excluded: public lots require an
  // exact approved identity above.
  for (const route of ALL_MANIFEST_ROUTES) {
    if (route === PUBLIC_QUALITY_ROUTES.lot) continue;
    if (route.includes(":")) {
      addPrivatePattern(route);
      continue;
    }
    const key = canonicalRouteKey(route);
    if (
      key !== null
      && (exactRoutes.get(key)?.kind === "public_index"
        || exactRoutes.get(key)?.kind === "public_noindex")
    ) continue;
    addPrivate(route);
  }

  for (const path of KNOWN_NOINDEX_EXACT_PATHS) addPrivate(path);
  for (const pattern of KNOWN_NOINDEX_PATTERNS) addPrivatePattern(pattern);

  const notFound = (
    reason: Extract<
      RawHttpPolicyReason,
      "unknown_document" | "invalid_request_target" | "ambiguous_route_identity"
    >,
    normalizedPath: string | null,
  ): RawHttpDocumentPolicy => ({
    status: 404,
    routeKind: "not_found",
    reason,
    normalizedPath,
    indexable: false,
    robots: RAW_HTTP_NOINDEX_ROBOTS,
    canonicalPath: null,
    canonicalUrl: null,
    schema: EMPTY_SCHEMA,
  });

  return Object.freeze({
    rejectedApprovedPublicLotCodes: Object.freeze([
      ...rejectedApprovedPublicLotCodes,
    ]),
    resolve(requestTarget: string): RawHttpDocumentPolicy {
      const parsed = parseRequestTarget(requestTarget);
      if (parsed === null) return notFound("invalid_request_target", null);
      if (ambiguousKeys.has(parsed.key)) {
        return notFound("ambiguous_route_identity", parsed.key);
      }

      const exact = exactRoutes.get(parsed.key);
      const matchingPrivatePatterns = privatePatterns.filter((pattern) =>
        pattern.expression.test(parsed.key),
      );

      if (
        (exact?.kind === "public_index" || exact?.kind === "public_noindex")
        && matchingPrivatePatterns.length > 0
      ) {
        return notFound("ambiguous_route_identity", parsed.key);
      }

      if (exact?.kind === "public_noindex") {
        return {
          status: 200,
          routeKind: "public",
          reason: "registered_public_noindex_document",
          normalizedPath: parsed.key,
          indexable: false,
          robots: RAW_HTTP_NOINDEX_ROBOTS,
          canonicalPath: null,
          canonicalUrl: null,
          schema: EMPTY_SCHEMA,
        };
      }

      if (exact?.kind === "public_index") {
        // Query and fragment suffixes are never route authority. An exact
        // pathname keeps the same index/canonical/schema policy; only a path
        // syntax variant (case, encoding, trailing slash) is downgraded.
        const canonicalRequest = parsed.rawPath === exact.canonicalPath;
        if (!canonicalRequest) {
          return {
            status: 200,
            routeKind: "public",
            reason: "unsafe_public_variant",
            normalizedPath: parsed.key,
            indexable: false,
            robots: RAW_HTTP_NOINDEX_ROBOTS,
            canonicalPath: null,
            canonicalUrl: null,
            schema: EMPTY_SCHEMA,
          };
        }
        const canonicalUrl = exact.canonicalPath === "/"
          ? RAW_HTTP_SITE_ORIGIN
          : `${RAW_HTTP_SITE_ORIGIN}${exact.canonicalPath}`;
        return {
          status: 200,
          routeKind: "public",
          reason: "exact_public_document",
          normalizedPath: parsed.key,
          indexable: true,
          robots: RAW_HTTP_INDEX_ROBOTS,
          canonicalPath: exact.canonicalPath,
          canonicalUrl,
          schema: exact.schema,
        };
      }

      if (exact?.kind === "private" || matchingPrivatePatterns.length > 0) {
        return {
          status: 200,
          routeKind: "private",
          reason: "registered_private_document",
          normalizedPath: parsed.key,
          indexable: false,
          robots: RAW_HTTP_NOINDEX_ROBOTS,
          canonicalPath: null,
          canonicalUrl: null,
          schema: EMPTY_SCHEMA,
        };
      }

      return notFound("unknown_document", parsed.key);
    },
  });
}

export const DEFAULT_RAW_HTTP_DOCUMENT_POLICY_RESOLVER =
  createRawHttpDocumentPolicyResolver();

export interface BuildRawHttpDocumentResponseInput {
  /** Raw origin-form target (for example req.originalUrl), including any suffix. */
  readonly requestTarget: string;
  readonly templateHtml: string;
  readonly resolver?: RawHttpDocumentPolicyResolver;
  /**
   * Environment indexing gate (RESEARCH_INDEXABLE === "true"). While false,
   * every public_index document is answered noindex at the header AND the
   * meta tag — the same gate production applied through the research
   * middleware's X-Robots-Tag — and loses canonical/Open Graph/schema
   * authority until indexing is explicitly enabled.
   * Defaults to true so the policy tables keep describing each document's
   * intended indexability; the environment decides whether it is in force.
   */
  readonly indexable?: boolean;
  /**
   * Route-owned JSON-LD only. JSON-LD already present in templateHtml is
   * always removed and is never treated as route authority.
   */
  readonly structuredData?: readonly unknown[];
}

export interface RawHttpDocumentResponse {
  readonly status: 200 | 404;
  readonly headers: Readonly<Record<string, string>>;
  readonly html: string;
  readonly policy: RawHttpDocumentPolicy;
}

function readHtmlAttribute(tag: string, name: string): string | null {
  const expression = new RegExp(
    `(?:^|[\\t\\n\\f\\r ])${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
    "iu",
  );
  const match = expression.exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function decodeHtmlAttributeEntities(value: string): string {
  return value
    .replace(/&#(x[0-9a-f]+|[0-9]+);?/giu, (entity, code: string) => {
      const base = code[0]?.toLowerCase() === "x" ? 16 : 10;
      const digits = base === 16 ? code.slice(1) : code;
      const point = Number.parseInt(digits, base);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    })
    .replace(/&(amp|quot|apos|lt|gt|plus|sol);/giu, (entity, name: string) => {
      const decoded: Readonly<Record<string, string>> = {
        amp: "&",
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
        plus: "+",
        sol: "/",
      };
      return decoded[name.toLowerCase()] ?? entity;
    });
}

function normalizedHtmlAttribute(tag: string, name: string): string | null {
  const value = readHtmlAttribute(tag, name);
  return value === null
    ? null
    : decodeHtmlAttributeEntities(value).trim().toLowerCase();
}

function stripTemplateSeoAuthority(
  templateHtml: string,
): string {
  // Canonicalize template line endings before policy transformation. Vite can
  // preserve CRLF and can leave a CR run (for example `\r\r\n`) when it removes
  // the source module-script line, which otherwise makes the response body hash
  // depend on the checkout platform even though the document is semantically
  // identical.
  let html = templateHtml.replace(/\r+\n|\r/gu, "\n");
  html = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>/giu,
    (element) => {
      const openTag = element.slice(0, element.indexOf(">") + 1);
      return normalizedHtmlAttribute(openTag, "type")
        === "application/ld+json"
        ? ""
        : element;
    },
  );

  // A route must never inherit the SPA template's title. The policy injects
  // one exact route-owned title below.
  html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/giu, "");

  html = html.replace(/<meta\b[^>]*>/giu, (tag) => {
    const name = normalizedHtmlAttribute(tag, "name");
    const property = normalizedHtmlAttribute(tag, "property");
    const httpEquiv = normalizedHtmlAttribute(tag, "http-equiv");
    return name === "robots"
      || name === "googlebot"
      || name === "bingbot"
      || name === "description"
      || name?.startsWith("twitter:")
      || property?.startsWith("og:")
      || httpEquiv === "x-robots-tag"
      ? ""
      : tag;
  });

  html = html.replace(/<link\b[^>]*>/giu, (tag) => {
    const rel = normalizedHtmlAttribute(tag, "rel")
      ?.split(/\s+/u)
      .filter(Boolean) ?? [];
    return rel.includes("canonical") || rel.includes("alternate") ? "" : tag;
  });

  // Refuse to serve a template whose JSON-LD syntax was too malformed for the
  // controlled sanitizer to recognize. A server error is safer than leaking
  // unreviewed global schema onto a private or 404 document.
  const hasUnrecognizedJsonLd = [...html.matchAll(/<script\b[^>]*>/giu)]
    .some((match) => normalizedHtmlAttribute(match[0], "type") === "application/ld+json");
  if (hasUnrecognizedJsonLd || /application\/ld\+json/iu.test(html)) {
    throw new Error("raw HTTP template contains unrecognized JSON-LD markup");
  }
  return html;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonForHtml(value: unknown): string | null {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string") return null;
    return json
      .replace(/&/gu, "\\u0026")
      .replace(/</gu, "\\u003c")
      .replace(/>/gu, "\\u003e")
      .replace(/\u2028/gu, "\\u2028")
      .replace(/\u2029/gu, "\\u2029");
  } catch {
    return null;
  }
}

function hasRemoteCountryMisclassification(value: unknown): boolean {
  const pending: unknown[] = [value];
  const visited = new Set<object>();
  let inspected = 0;

  while (pending.length > 0) {
    const candidate = pending.pop();
    if (typeof candidate !== "object" || candidate === null) continue;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    inspected += 1;
    // Fail closed on an unexpectedly large schema graph.
    if (inspected > 512) return true;

    if (Array.isArray(candidate)) {
      pending.push(...candidate);
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const remoteLabel = (field: unknown) =>
      typeof field === "string" && /\bremote\b/iu.test(field.trim());
    if (
      (record["@type"] === "Country" && remoteLabel(record.name))
      || remoteLabel(record.addressCountry)
    ) {
      return true;
    }
    pending.push(...Object.values(record));
  }

  return false;
}

const ROUTE_BOUNDARY_SCHEMA_TYPES = new Set([
  "Organization",
  "WebSite",
  "FAQPage",
  "JobPosting",
  "LocalBusiness",
]);

function hasRouteInaccurateNestedSchema(
  value: unknown,
  topLevelType: AllowedSchemaType,
): boolean {
  const pending: Array<{
    candidate: unknown;
    relation: string | null;
    root: boolean;
  }> = [{ candidate: value, relation: null, root: true }];
  const visited = new Map<object, Set<string>>();
  let inspected = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (typeof current.candidate !== "object" || current.candidate === null) {
      continue;
    }
    const visitKey = current.root ? "<root>" : (current.relation ?? "<array>");
    const priorRelations = visited.get(current.candidate);
    if (priorRelations?.has(visitKey)) continue;
    if (priorRelations) priorRelations.add(visitKey);
    else visited.set(current.candidate, new Set([visitKey]));
    inspected += 1;
    if (inspected > 512) return true;

    if (Array.isArray(current.candidate)) {
      for (const child of current.candidate) {
        pending.push({
          candidate: child,
          relation: current.relation,
          root: false,
        });
      }
      continue;
    }

    const record = current.candidate as Record<string, unknown>;
    if (!current.root) {
      const rawTypes = Array.isArray(record["@type"])
        ? record["@type"]
        : [record["@type"]];
      for (const nestedType of rawTypes) {
        if (
          typeof nestedType === "string"
          && ROUTE_BOUNDARY_SCHEMA_TYPES.has(nestedType)
          && !(
            topLevelType === "JobPosting"
            && nestedType === "Organization"
            && current.relation === "hiringOrganization"
          )
        ) {
          return true;
        }
      }
    }

    for (const [relation, child] of Object.entries(record)) {
      pending.push({ candidate: child, relation, root: false });
    }
  }

  return false;
}

interface AcceptedSchema {
  readonly type: AllowedSchemaType;
  readonly identity: string;
  readonly json: string;
}

function acceptedStructuredData(
  policy: RawHttpDocumentPolicy,
  values: readonly unknown[],
): readonly AcceptedSchema[] {
  if (!policy.indexable) return [];

  const allowedSingletons = new Set<SingletonSchemaType>(
    policy.schema.singletonTypes,
  );
  const allowedJobTitles = new Set(policy.schema.jobPostingTitles);
  const candidates: AcceptedSchema[] = [];
  const identityCounts = new Map<string, number>();

  for (const value of values) {
    if (!isRecord(value) || value["@context"] !== "https://schema.org") continue;
    const type = value["@type"];
    if (typeof type !== "string") continue;

    // Identity ambiguity is judged only among values that can actually be
    // published: an unserializable copy (cycle, BigInt) is skipped below and
    // must not make a valid singleton look duplicated, so identities are
    // counted after acceptance, from the candidate list.

    if (
      (type === "Organization" || type === "WebSite")
      && allowedSingletons.has(type)
      && value.url === RAW_HTTP_SITE_ORIGIN
      && !hasRouteInaccurateNestedSchema(value, type)
    ) {
      const json = jsonForHtml(value);
      if (json) candidates.push({ type, identity: type, json });
      continue;
    }

    if (
      type === "FAQPage"
      && allowedSingletons.has(type)
      && !hasRouteInaccurateNestedSchema(value, type)
    ) {
      const json = jsonForHtml(value);
      if (json) candidates.push({ type, identity: type, json });
      continue;
    }

    if (
      type === "JobPosting"
      && typeof value.title === "string"
      && allowedJobTitles.has(value.title)
      && !hasRemoteCountryMisclassification(value)
      && !hasRouteInaccurateNestedSchema(value, type)
    ) {
      const json = jsonForHtml(value);
      if (json) {
        candidates.push({
          type,
          identity: `JobPosting:${value.title}`,
          json,
        });
      }
    }
  }

  // A duplicated identity is ambiguous. Drop every copy instead of choosing
  // whichever global/template/caller value happened to arrive first.
  for (const candidate of candidates) {
    identityCounts.set(
      candidate.identity,
      (identityCounts.get(candidate.identity) ?? 0) + 1,
    );
  }
  return candidates.filter(
    (candidate) => identityCounts.get(candidate.identity) === 1,
  );
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function renderPolicyHead(
  policy: RawHttpDocumentPolicy,
  structuredData: readonly unknown[],
): string {
  const path = policy.canonicalPath ?? policy.normalizedPath;
  const routeMetadata = path === null ? null : rawHttpDocumentMetadataForPath(path);
  const neutralMetadata = policy.status === 404
    ? metadata("Not found, xenios", "That page is not here.")
    : metadata(
        "Private document, xenios",
        "This document is private and carries no public search or social authority.",
      );
  if (policy.routeKind === "public" && routeMetadata === null) {
    throw new Error(`raw HTTP public route is missing exact client metadata: ${path ?? "(missing path)"}`);
  }
  const { title, description } = policy.routeKind === "public"
    ? routeMetadata!
    : neutralMetadata;
  const lines = [
    `<title>${escapeHtmlAttribute(title)}</title>`,
    `<meta name="description" content="${escapeHtmlAttribute(description)}" data-raw-http-policy="description" />`,
    `<meta name="robots" content="${escapeHtmlAttribute(policy.robots)}" data-raw-http-policy="robots" />`,
  ];

  if (policy.canonicalUrl !== null) {
    const canonicalUrl = escapeHtmlAttribute(policy.canonicalUrl);
    const escapedTitle = escapeHtmlAttribute(title);
    const escapedDescription = escapeHtmlAttribute(description);
    const image = `${RAW_HTTP_SITE_ORIGIN}/og/xenios-og-image-v2.png`;
    lines.push(
      `<link rel="canonical" href="${canonicalUrl}" data-raw-http-policy="canonical" />`,
      `<meta property="og:title" content="${escapedTitle}" data-raw-http-policy="og-title" />`,
      `<meta property="og:description" content="${escapedDescription}" data-raw-http-policy="og-description" />`,
      `<meta property="og:image" content="${image}" data-raw-http-policy="og-image" />`,
      `<meta property="og:url" content="${canonicalUrl}" data-raw-http-policy="og-url" />`,
      `<meta property="og:type" content="website" data-raw-http-policy="og-type" />`,
      `<meta name="twitter:card" content="summary_large_image" data-raw-http-policy="twitter-card" />`,
      `<meta name="twitter:site" content="@officialxenios" data-raw-http-policy="twitter-site" />`,
      `<meta name="twitter:title" content="${escapedTitle}" data-raw-http-policy="twitter-title" />`,
      `<meta name="twitter:description" content="${escapedDescription}" data-raw-http-policy="twitter-description" />`,
      `<meta name="twitter:image" content="${image}" data-raw-http-policy="twitter-image" />`,
    );
  }

  for (const schema of acceptedStructuredData(policy, structuredData)) {
    lines.push(
      `<script type="application/ld+json" data-raw-http-schema="${escapeHtmlAttribute(schema.identity)}">${schema.json}</script>`,
    );
  }

  return lines.map((line) => `    ${line}`).join("\n");
}

export function buildRawHttpDocumentResponse(
  input: BuildRawHttpDocumentResponseInput,
): RawHttpDocumentResponse {
  const resolver = input.resolver ?? DEFAULT_RAW_HTTP_DOCUMENT_POLICY_RESOLVER;
  const resolved = resolver.resolve(input.requestTarget);
  const policy: RawHttpDocumentPolicy =
    input.indexable === false && resolved.indexable
      ? Object.freeze({
          ...resolved,
          indexable: false,
          robots: RAW_HTTP_NOINDEX_ROBOTS,
          canonicalPath: null,
          canonicalUrl: null,
          schema: EMPTY_SCHEMA,
        })
      : resolved;
  const sanitized = stripTemplateSeoAuthority(input.templateHtml);
  const closingHead = /<\/head\s*>/iu.exec(sanitized);
  if (!closingHead || closingHead.index === undefined) {
    throw new Error("raw HTTP template is missing a closing head element");
  }

  const head = renderPolicyHead(policy, input.structuredData ?? []);
  const html = `${sanitized.slice(0, closingHead.index)}${head}\n${sanitized.slice(closingHead.index)}`;
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "X-Robots-Tag": policy.robots,
  };
  if (policy.canonicalUrl !== null) {
    headers.Link = `<${policy.canonicalUrl}>; rel="canonical"`;
  }

  return Object.freeze({
    status: policy.status,
    headers: Object.freeze(headers),
    html,
    policy,
  });
}
