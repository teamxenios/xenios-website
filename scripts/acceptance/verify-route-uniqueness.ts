import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import type { ValidationIssue } from "./verify-release-manifest.ts";

export type RouteRegistration = {
  method: string;
  path: string;
  file: string;
  line: number;
};

const ROUTE_PATTERN =
  /\b(?:app|router)\s*\.\s*(get|post|put|patch|delete|options|head)\s*\(\s*(["'`])(\/api\/[^"'`]+)\2/gims;

function lineForOffset(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (source.charCodeAt(index) === 10) line += 1;
  return line;
}

function normalizeRoutePath(path: string): string {
  const trimmed = path.trim().replace(/\/{2,}/g, "/");
  return trimmed.length > 1 && trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function extractExpressRoutes(source: string, file: string): RouteRegistration[] {
  const routes: RouteRegistration[] = [];
  ROUTE_PATTERN.lastIndex = 0;
  for (let match = ROUTE_PATTERN.exec(source); match; match = ROUTE_PATTERN.exec(source)) {
    routes.push({
      method: match[1].toUpperCase(),
      path: normalizeRoutePath(match[3]),
      file: file.replaceAll("\\", "/"),
      line: lineForOffset(source, match.index),
    });
  }
  return routes;
}

export function findDuplicateRoutes(routes: RouteRegistration[]): Map<string, RouteRegistration[]> {
  const grouped = new Map<string, RouteRegistration[]>();
  for (const route of routes) {
    const identity = `${route.method} ${route.path}`;
    const values = grouped.get(identity) ?? [];
    values.push(route);
    grouped.set(identity, values);
  }
  return new Map([...grouped.entries()].filter(([, values]) => values.length > 1));
}

function collectTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const absolute = resolve(directory, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        if (!["node_modules", "dist", "coverage"].includes(entry)) walk(absolute);
      } else if (
        entry.endsWith(".ts") &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".spec.ts") &&
        !entry.endsWith(".d.ts")
      ) {
        files.push(absolute);
      }
    }
  };
  walk(root);
  return files.sort();
}

export function scanExpressRoutes(repoRoot: string, roots = ["server"]): RouteRegistration[] {
  const routes: RouteRegistration[] = [];
  for (const sourceRoot of roots) {
    const absoluteRoot = resolve(repoRoot, sourceRoot);
    for (const file of collectTypeScriptFiles(absoluteRoot)) {
      routes.push(...extractExpressRoutes(readFileSync(file, "utf8"), relative(repoRoot, file)));
    }
  }
  return routes;
}

export function scanGitTreeRoutes(
  repoRoot: string,
  sha: string,
  roots = ["server"],
): RouteRegistration[] {
  const names = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", sha, "--", ...roots],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(
      (file) =>
        file.endsWith(".ts") &&
        !file.endsWith(".test.ts") &&
        !file.endsWith(".spec.ts") &&
        !file.endsWith(".d.ts"),
    )
    .sort();
  const routes: RouteRegistration[] = [];
  for (const file of names) {
    const source = execFileSync("git", ["show", `${sha}:${file}`], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    routes.push(...extractExpressRoutes(source, file));
  }
  return routes;
}

export function validateRouteUniqueness(routes: RouteRegistration[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [identity, registrations] of findDuplicateRoutes(routes)) {
    issues.push({
      code: "DUPLICATE_ROUTE",
      message: `${identity} registered at ${registrations.map((route) => `${route.file}:${route.line}`).join(", ")}`,
    });
  }
  return issues;
}

function isCli(): boolean {
  return Boolean(
    process.argv[1] &&
      resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(),
  );
}

if (isCli()) {
  const root = process.cwd();
  const shaIndex = process.argv.indexOf("--sha");
  const sha = shaIndex >= 0 ? process.argv[shaIndex + 1] : undefined;
  const routes = sha ? scanGitTreeRoutes(root, sha) : scanExpressRoutes(root);
  const issues = validateRouteUniqueness(routes);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.code}: ${issue.message}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Route uniqueness accepted: ${routes.length} static Express API registrations${sha ? ` at ${sha}` : " in the worktree"}.`,
    );
  }
}
