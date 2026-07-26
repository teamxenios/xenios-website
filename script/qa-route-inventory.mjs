import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "docs", "qa", "generated");
const checkOnly = process.argv.includes("--check");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function normalizeRoute(route) {
  return route
    .split("?")[0]
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/:[A-Za-z][A-Za-z0-9_]*/g, ":param")
    .replace(/\{[^}]*\*[^}]*\}/g, "*")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
}

function titleFor(route) {
  if (route === "/") return "Xenios";
  return route
    .split("/")
    .filter(Boolean)
    .filter((part) => !part.startsWith(":") && part !== "*")
    .slice(-2)
    .map((part) => part.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(" — ");
}

function classify(route, method, kind) {
  const isApi = route.startsWith("/api/");
  const isAdmin = route.startsWith("/admin") || route.startsWith("/api/admin/");
  const isMember = route.startsWith("/research/member") || route.startsWith("/api/research/member");
  const isPartner = route.startsWith("/research/partners") || route.includes("/partners");
  const isCare = route.startsWith("/care") || route.includes("/care/");
  const isResearch = route.startsWith("/research") || route.startsWith("/api/research");
  const isApplication = route.includes("/applications") || route.includes("/apply");
  const openResearch =
    route === "/research" ||
    route.includes("/access") ||
    route.includes("/forgot-password") ||
    route.includes("/application") ||
    route.includes("/apply") ||
    route.includes("/policies") ||
    route.includes("/support") ||
    route.includes("/privacy") ||
    route.includes("/terms");

  let persona = "public";
  let auth = "none";
  let permission = "public";
  let owner = "Website 1";

  if (isCare) {
    persona = "Care preview patient / clinician / clinical admin / pharmacy operations";
    auth = "Care feature gate; role auth when enabled";
    permission = "care_role";
    owner = "Website 5";
  } else if (isAdmin) {
    persona = "Mitch / fulfillment staff / inventory manager / customer support / affiliate manager / Research admin / super admin";
    auth = "Supabase bearer session";
    permission = "admin or delegated operation role";
    owner = route.includes("product") || route.includes("commerce") ? "Website 3" : "Website 4";
  } else if (isPartner) {
    persona = route.endsWith("/apply") ? "affiliate applicant" : "affiliate / affiliate manager";
    auth = route.endsWith("/apply") ? "research gateway" : "partner session";
    permission = route.endsWith("/apply") ? "application access" : "partner";
    owner = "Website 4";
  } else if (isMember) {
    persona = "active member";
    auth = "member bearer session";
    permission = "active_member";
    owner = route.includes("product") || route.includes("cart") || route.includes("order") || route.includes("subscription")
      ? "Website 3"
      : "Website 2";
  } else if (isResearch) {
    persona = isApplication ? "applicant / approved unclaimed" : "public / applicant / pending member";
    auth = openResearch ? "gateway or explicitly open recovery" : "research gateway";
    permission = openResearch ? "research_access" : "authenticated_research";
    owner = "Website 2";
  }

  const capability = route
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .filter((part) => part !== "api" && part !== "research" && part !== "admin" && !part.startsWith(":"))
    .slice(0, 2)
    .join(":") || "homepage";

  return {
    persona,
    auth,
    permission,
    capability,
    expectedState: kind === "redirect" ? "redirects to canonical route" : method === "GET" ? "renders or returns authorized state" : "validates input and returns explicit success or recovery error",
    title: isApi ? "API response (no document title)" : titleFor(route),
    mobile: isApi ? "n/a" : "320 / 375 / 430 / tablet / desktop",
    testCoverage: isApi ? "route contract + domain integration" : isAdmin || isMember ? "auth redirect + route contract; authenticated journey requires fixture" : "browser smoke + accessibility + route contract",
    owner,
  };
}

function extractClientRoutes() {
  const files = [
    path.join(root, "client", "src", "App.tsx"),
    path.join(root, "client", "src", "research", "section.tsx"),
    path.join(root, "client", "src", "research", "adminx-section.tsx"),
  ];
  const routes = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const routePattern = /<Route\s+path=["']([^"']+)["']/g;
    for (const match of source.matchAll(routePattern)) {
      routes.push({
        path: match[1],
        method: "GET",
        kind: "client",
        source: `${relative(file)}:${lineOf(source, match.index)}`,
      });
    }
    const redirectPattern = /<Route\s+path=["']([^"']+)["'][\s\S]{0,240}?<Redirect\s+to=["']([^"']+)["']/g;
    for (const match of source.matchAll(redirectPattern)) {
      routes.push({
        path: match[1],
        method: "GET",
        kind: "redirect",
        target: match[2],
        source: `${relative(file)}:${lineOf(source, match.index)}`,
      });
    }
  }
  return routes;
}

function extractServerRoutes() {
  const files = walk(path.join(root, "server")).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  const routes = [];
  const pattern = /\b(?:app|router)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      if (!match[2].startsWith("/")) continue;
      routes.push({
        path: match[2],
        method: match[1].toUpperCase(),
        kind: "api",
        source: `${relative(file)}:${lineOf(source, match.index)}`,
        guardSnippet: source.slice(match.index, match.index + 360),
      });
    }
  }
  return routes;
}

function extractSitemapRoutes() {
  const file = path.join(root, "public", "sitemap.xml");
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(/<loc>https:\/\/xeniostechnology\.com([^<]*)<\/loc>/g)].map((match) => ({
    path: match[1] || "/",
    method: "GET",
    kind: "sitemap",
    source: `${relative(file)}:${lineOf(source, match.index)}`,
  }));
}

function extractManifestRoutes() {
  const file = path.join(root, "client", "src", "research", "lib", "routes.ts");
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(/:\s*["'](\/(?:admin\/research|research)[^"']*)["']/g)].map((match) => ({
    path: match[1],
    source: `${relative(file)}:${lineOf(source, match.index)}`,
  }));
}

function extractClientApiReferences() {
  const files = walk(path.join(root, "client", "src")).filter(
    (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file),
  );
  const references = [];
  const pattern = /["'`]((?:\/api\/)[^"'`\s]*)["'`]/g;
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      references.push({
        path: match[1],
        normalized: normalizeRoute(match[1]),
        source: `${relative(file)}:${lineOf(source, match.index)}`,
      });
    }
  }
  return references;
}

function dedupe(routes) {
  const map = new Map();
  for (const route of routes) {
    const key = `${route.method}:${route.path}:${route.kind}`;
    if (!map.has(key)) map.set(key, route);
  }
  return [...map.values()];
}

const clientRoutes = extractClientRoutes();
const serverRoutes = extractServerRoutes();
const sitemapRoutes = extractSitemapRoutes();
const manifestRoutes = extractManifestRoutes();
const clientApiReferences = extractClientApiReferences();
const wiredClient = new Set(clientRoutes.map((route) => normalizeRoute(route.path)));
const serverShapes = new Set(serverRoutes.map((route) => normalizeRoute(route.path)));

const missingManifestRoutes = manifestRoutes.filter((route) => !wiredClient.has(normalizeRoute(route.path)));
const privateSitemapRoutes = sitemapRoutes.filter(
  (route) =>
    route.path === "/admin" ||
    route.path.startsWith("/admin/") ||
    route.path === "/research" ||
    route.path.startsWith("/research/") ||
    route.path === "/care" ||
    route.path.startsWith("/care/"),
);

const adapterAllowlist = new Set([
  "/api/admin/me", // registered in server/routes.ts through the non-research admin surface
  // Shared adapter prefixes used only to construct concrete endpoint paths.
  "/api/admin/research",
  "/api/research",
  "/api/research/activation",
  "/api/research/activation/esign",
  "/api/admin/research/activation/esign",
  "/api/research/member",
  "/api/research/member/tracker",
  "/api/admin/research/operations",
  "/api/operations/mitch",
]);
const missingAdapterRoutes = clientApiReferences.filter((reference) => {
  if (adapterAllowlist.has(reference.normalized)) return false;
  return ![...serverShapes].some((serverShape) => {
    const a = serverShape.split("/");
    const b = reference.normalized.split("/");
    if (a.length !== b.length) return false;
    return a.every((segment, index) => segment === b[index] || segment === ":param" || b[index] === ":param" || segment === "*");
  });
});

const protectedApiWithoutVisibleGuard = serverRoutes.filter((route) => {
  const explicitlyOpen = new Set([
    "/api/research/member/claim",
    "/api/research/member/forgot-password",
  ]);
  if (explicitlyOpen.has(route.path)) return false;
  const protectedRoute =
    route.path.startsWith("/api/admin/") ||
    route.path.startsWith("/api/research/member/") ||
    route.path === "/api/research/catalog" ||
    route.path === "/api/research/orders";
  if (!protectedRoute) return false;
  return !/(requireSupabaseAdmin|requireProductRequestAdmin|requireActiveMember|requireMember|\badmin\b|\bactive\b)/.test(
    route.guardSnippet,
  );
});

const inventory = dedupe([...clientRoutes, ...serverRoutes, ...sitemapRoutes])
  .map(({ guardSnippet: _guardSnippet, ...route }) => ({
    ...route,
    ...classify(route.path, route.method, route.kind),
  }))
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method) || a.kind.localeCompare(b.kind));

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    total: inventory.length,
    client: inventory.filter((route) => route.kind === "client").length,
    api: inventory.filter((route) => route.kind === "api").length,
    redirects: inventory.filter((route) => route.kind === "redirect").length,
    sitemap: inventory.filter((route) => route.kind === "sitemap").length,
  },
  gates: {
    missingManifestRoutes,
    missingAdapterRoutes,
    protectedApiWithoutVisibleGuard: protectedApiWithoutVisibleGuard.map(({ guardSnippet: _guardSnippet, ...route }) => route),
    privateSitemapRoutes,
  },
  routes: inventory,
};

function markdownFor(value) {
  const rows = value.routes.map((route) =>
    [
      route.path,
      route.method,
      route.persona,
      route.auth,
      route.permission,
      route.capability,
      route.expectedState,
      route.title,
      route.mobile,
      route.testCoverage,
      route.owner,
      route.source,
    ].map((cell) => String(cell).replaceAll("|", "\\|").replaceAll("\n", " ")).join(" | "),
  );
  return `# Generated Website 6 route inventory

Generated by \`npm run qa:routes\`. Do not edit by hand.

- Total records: ${value.summary.total}
- Client routes: ${value.summary.client}
- API routes: ${value.summary.api}
- Redirects: ${value.summary.redirects}
- Sitemap entries: ${value.summary.sitemap}

| Path | Method | Persona | Auth | Permission | Capability | Expected state | Title | Mobile | Test coverage | Owner | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.map((row) => `| ${row} |`).join("\n")}
`;
}

const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = markdownFor(report);
const jsonFile = path.join(outputDir, "route-inventory.json");
const markdownFile = path.join(outputDir, "route-inventory.md");

if (checkOnly) {
  const failures = Object.entries(report.gates).filter(([, items]) => items.length > 0);
  if (failures.length) {
    for (const [name, items] of failures) {
      console.error(`${name}:`);
      for (const item of items) console.error(`  ${item.path} (${item.source})`);
    }
    process.exitCode = 1;
  }
  if (!fs.existsSync(jsonFile) || !fs.existsSync(markdownFile)) {
    console.error("Generated route inventory is missing. Run npm run qa:routes.");
    process.exitCode = 1;
  } else {
    const committed = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    const stable = (value) => JSON.stringify({ ...value, generatedAt: undefined });
    if (stable(committed) !== stable(report)) {
      console.error("Generated route inventory is stale. Run npm run qa:routes.");
      process.exitCode = 1;
    }
  }
} else {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonFile, json);
  fs.writeFileSync(markdownFile, markdown);
  console.log(`Wrote ${relative(jsonFile)} and ${relative(markdownFile)} (${report.summary.total} records).`);
}
