import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scanGitTreeRouteResult,
  validateRouteUniqueness,
  type RouteRegistration,
} from "../acceptance/verify-route-uniqueness.ts";

export const AUDIT_DOMAINS = [
  "catalog",
  "pricing",
  "commerce",
  "affiliate",
  "organization",
  "supplier",
  "admin",
] as const;

export type AuditDomain = (typeof AUDIT_DOMAINS)[number];

export type ClientRouteEvidence = {
  path: string;
  component: string | null;
  file: string;
  line: number;
  domains: AuditDomain[];
  wrapperSignals: string[];
};

export type DomainRouteEvidence = RouteRegistration & {
  domains: AuditDomain[];
  guardSignals: string[];
  featureFlags: string[];
  persistenceSignals: string[];
  guardTrace: "file_signal_present" | "parent_or_runtime_trace_required";
};

export type AuditIssue = {
  code: string;
  severity: "error" | "review";
  message: string;
  file?: string;
  line?: number;
};

export type SystemFamilyDefinition = {
  id: string;
  label: string;
  relationship: "canonical_candidate" | "projection" | "specialized_adapter" | "legacy" | "operations_surface";
  roots: string[];
  intendedBoundary: string;
};

export type SystemFamilyEvidence = SystemFamilyDefinition & {
  files: string[];
  productionModules: number;
  testModules: number;
  apiRegistrationsWithinFamilyFiles: number;
  clientRegistrationsWithinFamilyFiles: number;
};

export type DomainFileEvidence = {
  file: string;
  domains: AuditDomain[];
  kind: "production" | "test" | "migration" | "documentation" | "generated";
  featureFlags: string[];
  persistenceSignals: string[];
  privateFieldSignals: string[];
};

export type DomainAuditEvidence = {
  schemaVersion: 1;
  generator: string;
  codeBasis: {
    sha: string;
    committedAt: string;
    subject: string;
    liveProductionSha: string | null;
    liveProductionTag: string | null;
    trackedWorktreeMatchedCodeBasis: boolean;
    scopeNote: string;
  };
  scan: {
    totalStaticApiRoutes: number;
    totalStaticRegistrationCallSites: number;
    routeScannerIssues: Array<{ code: string; message: string }>;
    domainApiRoutes: DomainRouteEvidence[];
    clientRoutes: ClientRouteEvidence[];
    validationIssues: AuditIssue[];
  };
  files: {
    totalDomainFiles: number;
    byDomain: Record<AuditDomain, number>;
    evidence: DomainFileEvidence[];
  };
  systemFamilies: SystemFamilyEvidence[];
  summary: {
    apiRoutesByDomain: Record<AuditDomain, number>;
    clientRoutesByDomain: Record<AuditDomain, number>;
    testsByDomain: Record<AuditDomain, number>;
    routesRequiringParentOrRuntimeGuardTrace: number;
    filesWithPrivateFieldSignals: number;
  };
  limitations: string[];
};

const GENERATOR_PATH = "scripts/research/generate-catalog-commerce-ops-audit.ts";
const DEFAULT_OUTPUT_DIR = "docs/research-audit/2026-08-14-full-build";

const DOMAIN_PATTERNS: Record<AuditDomain, RegExp[]> = {
  catalog: [
    /(?:^|\/)catalog(?:-|\/|\.|$)/,
    /master-offerings/,
    /products-data/,
    /products-diagnostics/,
    /kris-launch-a/,
    /product-control/,
  ],
  pricing: [
    /(?:^|\/)pricing(?:\/|\.|-|$)/,
    /price-/,
    /-price/,
    /buyer-scoped-pricing/,
    /b2b-pricing-authority/,
  ],
  commerce: [
    /(?:^|\/)(?:commerce|cart|checkout|orders?|subscriptions?|refunds?|claims?)(?:\/|\.|-|$)/,
    /buyer-commerce/,
    /early-access-cart/,
    /order-payment-fulfillment/,
    /payment-/,
    /fulfilment/,
  ],
  affiliate: [
    /(?:^|\/)(?:affiliates?|partners?|referrals?)(?:\/|\.|-|$)/,
    /commissions?/,
    /payout/,
    /attribution/,
  ],
  organization: [
    /organizations?/,
    /account-identity/,
    /buyer-commerce/,
    /b2b-/,
  ],
  supplier: [
    /suppliers?/,
    /fulfillment/,
    /fulfilment/,
    /inventory/,
    /lots?/,
    /coas?/,
    /cold-chain/,
  ],
  admin: [
    /(?:^|\/)(?:admin|adminx)(?:\/|\.|-|$)/,
    /admin-/,
    /\/api\/admin\//,
    /\/admin\/research(?:\/|$)/,
  ],
};

const SYSTEM_FAMILIES: SystemFamilyDefinition[] = [
  {
    id: "catalog-product-control",
    label: "Product Control and member catalog",
    relationship: "canonical_candidate",
    roots: ["server/research/catalog/", "shared/research/catalog.ts", "shared/research/member-catalog.ts"],
    intendedBoundary: "Canonical product facts and member-safe projection boundary.",
  },
  {
    id: "catalog-master-offerings",
    label: "Master offerings catalog",
    relationship: "projection",
    roots: ["server/research/master-offerings/", "client/src/research/master-offerings/", "shared/research/master-offerings/"],
    intendedBoundary: "Full-catalog projection, revision, reconciliation, search and member presentation.",
  },
  {
    id: "catalog-display",
    label: "Catalog display projection",
    relationship: "projection",
    roots: ["server/research/catalog-display/", "server/research/catalog-display-viewer.ts", "client/src/research/catalog-display/", "shared/research/catalog-display/"],
    intendedBoundary: "Viewer-authorized display DTO and offer-mode projection.",
  },
  {
    id: "catalog-kris-launch-a",
    label: "Kris/Roman release catalog",
    relationship: "specialized_adapter",
    roots: ["server/research/kris-launch-a/", "client/src/research/kris-launch-a/", "shared/research/kris-launch-a/"],
    intendedBoundary: "Buyer-profile-specific release artifact and pathway adapter, not a second master truth.",
  },
  {
    id: "catalog-early-access",
    label: "Private Early Access catalog adapter",
    relationship: "specialized_adapter",
    roots: ["server/research/early-access/catalog/", "client/src/research/early-access/"],
    intendedBoundary: "Early Access eligibility and purchase-door projection over canonical product authority.",
  },
  {
    id: "catalog-legacy-products",
    label: "Legacy product catalog",
    relationship: "legacy",
    roots: ["server/research/products-data.ts", "server/research/products.ts", "client/src/research/pages/member/Products"],
    intendedBoundary: "Compatibility-only legacy surface pending full canonical convergence.",
  },
  {
    id: "commerce-general",
    label: "General Research commerce",
    relationship: "canonical_candidate",
    roots: ["server/research/commerce/", "shared/research/commerce.ts", "shared/research/commerce-api.ts", "client/src/research/adapters/commerce.ts"],
    intendedBoundary: "General cart, checkout, order, subscription, refund and persistence contracts.",
  },
  {
    id: "commerce-buyer",
    label: "Business buyer commerce bridge",
    relationship: "specialized_adapter",
    roots: ["server/research/buyer-commerce/", "client/src/research/buyer-commerce/", "shared/research/buyer-commerce.ts"],
    intendedBoundary: "Organization/buyer draft and order adapter into canonical commerce.",
  },
  {
    id: "commerce-early-access-cart",
    label: "Private Early Access cart and checkout",
    relationship: "specialized_adapter",
    roots: ["server/research/early-access/cart/", "client/src/research/early-access/cart/", "shared/research/early-access-cart.ts"],
    intendedBoundary: "Release-gated cart, agreement, payment-proof and fulfillment journey.",
  },
  {
    id: "commerce-early-access-order",
    label: "Private Early Access order domain",
    relationship: "specialized_adapter",
    roots: ["server/research/early-access/commerce/", "server/research/early-access/persistence/", "server/research/early-access/routes/"],
    intendedBoundary: "Buyer-scoped order, invoice, proof, verification, reservation and release services.",
  },
  {
    id: "affiliate-partner-portal",
    label: "Research partner portal",
    relationship: "operations_surface",
    roots: ["server/research/partners/", "client/src/research/pages/partners/", "client/src/research/adapters/partner.ts"],
    intendedBoundary: "Partner application, onboarding, aggregate reporting, commission and payout presentation.",
  },
  {
    id: "affiliate-v2",
    label: "Affiliate v2 engine",
    relationship: "canonical_candidate",
    roots: ["server/research/affiliates/", "shared/research/affiliates/", "shared/research/affiliate-system.ts"],
    intendedBoundary: "Versioned attribution, commission schedules, access codes and activation readiness.",
  },
  {
    id: "organization-account",
    label: "Organization account and identity pack",
    relationship: "canonical_candidate",
    roots: ["server/research/account-identity/", "client/src/research/account/"],
    intendedBoundary: "One account identity, organization membership, invitation and buyer pricing authority.",
  },
  {
    id: "supplier-operations",
    label: "Supplier and CRM operations",
    relationship: "operations_surface",
    roots: ["server/research/admin-crm-supplier-operations/", "client/src/research/adapters/adminCrmSupplierOperations.ts", "client/src/research/pages/adminx/CrmSupplierOperations.tsx"],
    intendedBoundary: "Admin CRM/supplier work queues; not a supplier-facing tenant portal.",
  },
  {
    id: "supplier-fulfillment",
    label: "Supplier, inventory and fulfillment services",
    relationship: "canonical_candidate",
    roots: ["server/research/operations/", "server/research/fulfillment/", "server/research/inventory/", "server/research/providers/fulfillment.ts"],
    intendedBoundary: "Supplier facts, inventory lots, quality documentation and fulfillment provider boundary.",
  },
  {
    id: "admin-research-operations",
    label: "Research admin operations portal",
    relationship: "operations_surface",
    roots: ["client/src/research/adminx-section.tsx", "client/src/research/pages/adminx/", "server/research/admin-"],
    intendedBoundary: "Privileged Research operations shell and server-authorized admin modules.",
  },
];

const PRIVATE_FIELD_TOKENS = [
  "buycost",
  "suppliercost",
  "unitcost",
  "margin",
  "sourcepath",
  "privateproof",
  "internalfulfillment",
  "paymentencryptionkey",
] as const;

function normalized(value: string): string {
  return value.replaceAll("\\", "/");
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function matchesRoot(file: string, root: string): boolean {
  const normalizedFile = normalized(file);
  const normalizedRoot = normalized(root);
  if (normalizedRoot.endsWith("/")) return normalizedFile.startsWith(normalizedRoot);
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(normalizedRoot);
}

export function classifyDomains(file: string, routePath = ""): AuditDomain[] {
  const haystack = `${normalized(file).toLowerCase()} ${routePath.toLowerCase()}`;
  return AUDIT_DOMAINS.filter((domain) => DOMAIN_PATTERNS[domain].some((pattern) => pattern.test(haystack)));
}

export function extractGuardSignals(source: string): string[] {
  const signals = source.match(
    /\b(?:require|authorize|assert|verify|resolve|identify|admit)[A-Z][A-Za-z0-9_]*(?:Access|Admin|Audience|Auth|Identity|Member|Permission|Role|Session|Viewer)?\b/g,
  ) ?? [];
  const explicit = source.match(
    /\b(?:readResearchSession|researchPageGate|ensureResearchConfigured|isSupabaseAdmin|requireSupabaseAdmin)\b/g,
  ) ?? [];
  return unique([...signals, ...explicit]);
}

export function extractFeatureFlagSignals(source: string): string[] {
  const processEnv = [
    ...source.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]+)|\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\])/g),
  ].map((match) => match[1] ?? match[2]);
  const stringLiterals = [
    ...source.matchAll(/["'`]((?:RESEARCH|XENIOS|EARLY_ACCESS|ROMAN|KRIS)_[A-Z][A-Z0-9_]*)["'`]/g),
  ].map((match) => match[1]);
  return unique([...processEnv, ...stringLiterals]).filter(
    (name) =>
      /(?:_ENABLED|_ONLY|_REQUIRED|_ALLOWLIST|_MEMBERS)$/.test(name) ||
      name.startsWith("XENIOS_ALLOW_") ||
      name === "XENIOS_BUYER_SCOPED_PRICING",
  );
}

export function extractPersistenceSignals(source: string): string[] {
  const identifiers = source.match(/\bresearch_[a-z][a-z0-9_]*\b/g) ?? [];
  const fromCalls = [...source.matchAll(/\.from\(\s*["'`]([a-z][a-z0-9_]*)["'`]\s*\)/g)].map((match) => match[1]);
  return unique([...identifiers, ...fromCalls]);
}

export function extractPrivateFieldSignals(source: string): string[] {
  const properties = source.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [];
  return unique(
    properties.filter((property) => {
      const compact = property.toLowerCase().replaceAll("_", "");
      return PRIVATE_FIELD_TOKENS.some((token) => compact.includes(token));
    }),
  );
}

function routeComponent(snippet: string): string | null {
  const direct = snippet.match(/component=\{([A-Za-z_$][A-Za-z0-9_$]*)\}/);
  if (direct) return direct[1];
  const shell = snippet.match(/<(?:L|S)\b[^>]*>\s*<([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (shell) return shell[1];
  const redirect = snippet.match(/<Redirect\b[^>]*\bto=["']([^"']+)["']/);
  return redirect ? `Redirect:${redirect[1]}` : null;
}

export function extractClientRoutesFromSource(source: string, file: string): ClientRouteEvidence[] {
  const routes: ClientRouteEvidence[] = [];
  const pattern = /<Route\b[^>]*\bpath=["']([^"']+)["'][^>]*>/g;
  for (const match of source.matchAll(pattern)) {
    const offset = match.index ?? 0;
    const tagEnd = offset + match[0].length;
    const closeOffset = source.indexOf("</Route>", tagEnd);
    const nextRouteOffset = source.indexOf("<Route", tagEnd);
    const snippetEnd = closeOffset >= 0 && (nextRouteOffset < 0 || closeOffset < nextRouteOffset)
      ? closeOffset + "</Route>".length
      : tagEnd;
    const snippet = source.slice(offset, snippetEnd);
    const path = match[1];
    const wrapperSignals = unique([
      ...(snippet.includes("<L member") ? ["active-member-shell"] : []),
      ...(snippet.includes("<L ") || snippet.includes("<L>") ? ["research-lazy-shell"] : []),
      ...(snippet.includes("<S>") || snippet.includes("<S ") ? ["admin-auth-shell"] : []),
      ...(path.startsWith("/research/partners") ? ["partner-route-family"] : []),
    ]);
    routes.push({
      path,
      component: routeComponent(snippet),
      file: normalized(file),
      line: lineAt(source, offset),
      domains: classifyDomains(file, path),
      wrapperSignals,
    });
  }
  return routes;
}

export function buildDomainRouteEvidence(
  route: RouteRegistration,
  source: string,
): DomainRouteEvidence {
  const guardSignals = extractGuardSignals(source);
  return {
    ...route,
    file: normalized(route.file),
    domains: classifyDomains(route.file, route.path),
    guardSignals,
    featureFlags: extractFeatureFlagSignals(source),
    persistenceSignals: extractPersistenceSignals(source),
    guardTrace: guardSignals.length > 0 ? "file_signal_present" : "parent_or_runtime_trace_required",
  };
}

export function validateDomainRouteEvidence(routes: DomainRouteEvidence[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const identities = new Map<string, DomainRouteEvidence[]>();
  for (const route of routes) {
    const identity = `${route.method} ${route.path}`;
    identities.set(identity, [...(identities.get(identity) ?? []), route]);
    if (route.domains.length === 0) {
      issues.push({
        code: "UNCLASSIFIED_DOMAIN_ROUTE",
        severity: "error",
        message: `${identity} has no catalog/commerce/operations domain classification.`,
        file: route.file,
        line: route.line,
      });
    }
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(route.method);
    if (mutation && route.guardSignals.length === 0) {
      issues.push({
        code: "MUTATION_GUARD_TRACE_REQUIRED",
        severity: "review",
        message: `${identity} has no recognized guard signal in its registration file; trace parent middleware and runtime identity before calling it authorized.`,
        file: route.file,
        line: route.line,
      });
    }
  }
  for (const [identity, registrations] of identities) {
    if (registrations.length < 2) continue;
    issues.push({
      code: "DUPLICATE_DOMAIN_ROUTE",
      severity: "error",
      message: `${identity} is registered ${registrations.length} times: ${registrations.map((route) => `${route.file}:${route.line}`).join(", ")}`,
    });
  }
  return issues;
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function gitFileNames(repoRoot: string, sha: string): string[] {
  return git(repoRoot, [
    "ls-tree",
    "-r",
    "--name-only",
    sha,
    "--",
    "client/src/research",
    "server/research",
    "shared/research",
    "scripts/research",
    "supabase",
  ])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalized)
    .sort();
}

function gitFile(repoRoot: string, sha: string, file: string): string {
  return execFileSync("git", ["show", `${sha}:${file}`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function auditableSource(file: string): boolean {
  return /\.(?:ts|tsx|sql|json|md)$/.test(file);
}

function evidenceKind(file: string): DomainFileEvidence["kind"] {
  if (/\.test\.(?:ts|tsx)$/.test(file)) return "test";
  if (file.startsWith("supabase/") || /migration/i.test(file)) return "migration";
  if (file.endsWith(".md")) return "documentation";
  if (/generated\.(?:json|ts)$/.test(file)) return "generated";
  return "production";
}

function emptyDomainCounts(): Record<AuditDomain, number> {
  return Object.fromEntries(AUDIT_DOMAINS.map((domain) => [domain, 0])) as Record<AuditDomain, number>;
}

function countByDomain<T>(values: T[], domains: (value: T) => AuditDomain[]): Record<AuditDomain, number> {
  const counts = emptyDomainCounts();
  for (const value of values) for (const domain of domains(value)) counts[domain] += 1;
  return counts;
}

function buildSystemFamilyEvidence(
  files: string[],
  apiRoutes: DomainRouteEvidence[],
  clientRoutes: ClientRouteEvidence[],
): SystemFamilyEvidence[] {
  return SYSTEM_FAMILIES.map((definition) => {
    const familyFiles = files.filter((file) => definition.roots.some((root) => matchesRoot(file, root)));
    return {
      ...definition,
      files: familyFiles,
      productionModules: familyFiles.filter((file) => evidenceKind(file) === "production").length,
      testModules: familyFiles.filter((file) => evidenceKind(file) === "test").length,
      apiRegistrationsWithinFamilyFiles: apiRoutes.filter((route) => definition.roots.some((root) => matchesRoot(route.file, root))).length,
      clientRegistrationsWithinFamilyFiles: clientRoutes.filter((route) => definition.roots.some((root) => matchesRoot(route.file, root))).length,
    };
  });
}

export function generateDomainAuditEvidence(
  repoRoot: string,
  requestedSha: string,
  liveProductionSha: string | null = null,
  liveProductionTag: string | null = null,
): DomainAuditEvidence {
  const sha = git(repoRoot, ["rev-parse", "--verify", `${requestedSha}^{commit}`]);
  const headSha = git(repoRoot, ["rev-parse", "HEAD"]);
  const trackedWorktreeChanges = git(repoRoot, [
    "diff",
    "--name-only",
    sha,
    "--",
    "client/src/research",
    "server/research",
    "shared/research",
    "scripts/research",
    "supabase",
  ]);
  const trackedWorktreeMatchedCodeBasis = sha === headSha && trackedWorktreeChanges.length === 0;
  const useWorktreeSources = trackedWorktreeMatchedCodeBasis;
  const committedAt = git(repoRoot, ["show", "-s", "--format=%cI", sha]);
  const subject = git(repoRoot, ["show", "-s", "--format=%s", sha]);
  const treeFiles = gitFileNames(repoRoot, sha);
  const sourceCache = new Map<string, string>();
  const sourceFor = (file: string): string => {
    const cached = sourceCache.get(file);
    if (cached !== undefined) return cached;
    const source = useWorktreeSources
      ? readFileSync(resolve(repoRoot, file), "utf8")
      : gitFile(repoRoot, sha, file);
    sourceCache.set(file, source);
    return source;
  };

  // Route registrations always come from the Git object, never from untracked
  // or staged worktree files. When tracked content exactly matches that object,
  // ordinary file reads are a faster equivalent source for the deeper signals.
  const routeScan = scanGitTreeRouteResult(repoRoot, sha, ["server"]);
  const routeSources = new Set(routeScan.routes.map((route) => normalized(route.file)));
  const domainApiRoutes = routeScan.routes
    .map((route) => buildDomainRouteEvidence(route, sourceFor(normalized(route.file))))
    .filter((route) => route.domains.length > 0)
    .sort((left, right) => `${left.path}:${left.method}`.localeCompare(`${right.path}:${right.method}`, "en"));

  const clientRouteFiles = ["client/src/research/section.tsx", "client/src/research/adminx-section.tsx"];
  const clientRoutes = clientRouteFiles
    .filter((file) => treeFiles.includes(file))
    .flatMap((file) => extractClientRoutesFromSource(sourceFor(file), file))
    .filter((route) => route.domains.length > 0)
    .sort((left, right) => left.path.localeCompare(right.path, "en"));

  const domainFiles = treeFiles
    .filter(auditableSource)
    .map((file) => ({ file, domains: classifyDomains(file) }))
    .filter((entry) => entry.domains.length > 0)
    .map<DomainFileEvidence>(({ file, domains }) => {
      const kind = evidenceKind(file);
      const shouldRead = /\.(?:ts|tsx|sql)$/.test(file);
      const source = shouldRead ? sourceFor(file) : "";
      return {
        file,
        domains,
        kind,
        featureFlags: shouldRead ? extractFeatureFlagSignals(source) : [],
        persistenceSignals: shouldRead ? extractPersistenceSignals(source) : [],
        privateFieldSignals: shouldRead ? extractPrivateFieldSignals(source) : [],
      };
    });

  const validationIssues = [
    ...validateRouteUniqueness(routeScan.routes).map<AuditIssue>((issue) => ({
      code: issue.code,
      severity: "error",
      message: issue.message,
    })),
    ...validateDomainRouteEvidence(domainApiRoutes),
  ];

  const testsByDomain = countByDomain(
    domainFiles.filter((entry) => entry.kind === "test"),
    (entry) => entry.domains,
  );

  // Force source loading for route files before reporting cache-derived scope.
  for (const file of routeSources) sourceFor(file);

  return {
    schemaVersion: 1,
    generator: GENERATOR_PATH,
    codeBasis: {
      sha,
      committedAt,
      subject,
      liveProductionSha,
      liveProductionTag,
      trackedWorktreeMatchedCodeBasis,
      scopeNote: "Static evidence pinned to the named Git object. Runtime deployment, database rows, feature-flag values, and authenticated browser behavior require independent live verification.",
    },
    scan: {
      totalStaticApiRoutes: routeScan.routes.length,
      totalStaticRegistrationCallSites: routeScan.callSites,
      routeScannerIssues: routeScan.issues,
      domainApiRoutes,
      clientRoutes,
      validationIssues,
    },
    files: {
      totalDomainFiles: domainFiles.length,
      byDomain: countByDomain(domainFiles, (entry) => entry.domains),
      evidence: domainFiles,
    },
    systemFamilies: buildSystemFamilyEvidence(treeFiles, domainApiRoutes, clientRoutes),
    summary: {
      apiRoutesByDomain: countByDomain(domainApiRoutes, (route) => route.domains),
      clientRoutesByDomain: countByDomain(clientRoutes, (route) => route.domains),
      testsByDomain,
      routesRequiringParentOrRuntimeGuardTrace: domainApiRoutes.filter(
        (route) => route.guardTrace === "parent_or_runtime_trace_required",
      ).length,
      filesWithPrivateFieldSignals: domainFiles.filter((entry) => entry.privateFieldSignals.length > 0).length,
    },
    limitations: [
      "A route or module is evidence of code presence, not proof that it is mounted, enabled, migrated, or live.",
      "Guard signals are file-level static signals. Parent middleware and handler-specific checks must be traced before authorization is considered proven.",
      "Persistence signals are identifier evidence, not proof that a production migration exists or has been applied.",
      "Private-field signals include legitimate server/admin internals and require DTO-boundary review; they are not automatically leaks.",
      "Client routes are enumerated from the two current Research route registries; dynamically constructed or unmounted components are reported through system-family files instead.",
    ],
  };
}

function csvCell(value: string | number): string {
  const stringValue = String(value);
  return /[",\r\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

export function domainRouteCsv(evidence: DomainAuditEvidence): string {
  const header = [
    "route_type",
    "domains",
    "method",
    "path",
    "component",
    "file",
    "line",
    "authorization_trace",
    "authorization_signals",
    "feature_flags",
    "persistence_signals",
  ];
  const apiRows = evidence.scan.domainApiRoutes.map((route) => [
    "api",
    route.domains.join("|"),
    route.method,
    route.path,
    "",
    route.file,
    route.line,
    route.guardTrace,
    route.guardSignals.join("|"),
    route.featureFlags.join("|"),
    route.persistenceSignals.join("|"),
  ]);
  const clientRows = (evidence.scan.clientRoutes ?? []).map((route) => [
    "client",
    route.domains.join("|"),
    "",
    route.path,
    route.component ?? "",
    route.file,
    route.line,
    "client_wrapper_only",
    route.wrapperSignals.join("|"),
    "",
    "",
  ]);
  const rows = [...apiRows, ...clientRows];
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function cliArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isCli(): boolean {
  return Boolean(
    process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(),
  );
}

if (isCli()) {
  const repoRoot = resolve(cliArgument("--repo") ?? process.cwd());
  const sha = cliArgument("--sha") ?? "HEAD";
  const outputDir = resolve(repoRoot, cliArgument("--output-dir") ?? DEFAULT_OUTPUT_DIR);
  const liveSha = cliArgument("--live-sha") ?? null;
  const liveTag = cliArgument("--live-tag") ?? null;
  const evidence = generateDomainAuditEvidence(repoRoot, sha, liveSha, liveTag);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = resolve(outputDir, "CATALOG_COMMERCE_OPERATIONS_EVIDENCE.json");
  const csvPath = resolve(outputDir, "CATALOG_COMMERCE_OPERATIONS_ROUTE_MATRIX.csv");
  writeFileSync(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  writeFileSync(csvPath, domainRouteCsv(evidence), "utf8");
  const relativeJson = normalized(relative(repoRoot, jsonPath));
  const relativeCsv = normalized(relative(repoRoot, csvPath));
  const errors = evidence.scan.validationIssues.filter((issue) => issue.severity === "error");
  console.log(
    `Catalog/commerce/operations audit evidence generated from ${evidence.codeBasis.sha}: ${evidence.scan.domainApiRoutes.length} domain API routes, ${evidence.scan.clientRoutes.length} client routes, ${evidence.files.totalDomainFiles} files.`,
  );
  console.log(`JSON: ${relativeJson}`);
  console.log(`CSV: ${relativeCsv}`);
  if (errors.length > 0) {
    for (const issue of errors) console.error(`${issue.code}: ${issue.message}`);
    process.exitCode = 1;
  }
}
