import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { ValidationIssue } from "./verify-release-manifest.ts";

export type RouteRegistration = {
  method: string;
  path: string;
  file: string;
  line: number;
};

export type RouteScanResult = {
  routes: RouteRegistration[];
  issues: ValidationIssue[];
  callSites: number;
};

type ImportBinding = {
  module: string;
  imported: string;
};

type SourceUnit = {
  file: string;
  source: string;
  sourceFile: ts.SourceFile;
  constants: Map<string, ts.Expression>;
  imports: Map<string, ImportBinding>;
};

type SourceIndex = Map<string, SourceUnit>;

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

function normalizedFile(file: string): string {
  return file.replaceAll("\\", "/");
}

function normalizeRoutePath(path: string): string {
  const trimmed = path.trim().replace(/\/{2,}/g, "/");
  return trimmed.length > 1 && trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function createUnit(source: string, file: string): SourceUnit {
  const normalized = normalizedFile(file);
  const sourceFile = ts.createSourceFile(normalized, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const constants = new Map<string, ts.Expression>();
  const imports = new Map<string, ImportBinding>();

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          constants.set(declaration.name.text, declaration.initializer);
        }
      }
    } else if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.importClause
    ) {
      const module = statement.moduleSpecifier.text;
      if (statement.importClause.name) {
        imports.set(statement.importClause.name.text, { module, imported: "default" });
      }
      const bindings = statement.importClause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, {
            module,
            imported: element.propertyName?.text ?? element.name.text,
          });
        }
      }
    }
  }

  return { file: normalized, source, sourceFile, constants, imports };
}

function sourceIndex(sources: Map<string, string>): SourceIndex {
  const index: SourceIndex = new Map();
  for (const [file, source] of sources) {
    const unit = createUnit(source, file);
    index.set(unit.file, unit);
  }
  return index;
}

function moduleCandidates(fromFile: string, module: string): string[] {
  let base: string;
  if (module.startsWith("@shared/")) {
    base = `shared/${module.slice("@shared/".length)}`;
  } else if (module.startsWith(".")) {
    base = posix.normalize(posix.join(posix.dirname(fromFile), module));
  } else {
    return [];
  }
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
}

function importedInitializer(
  binding: ImportBinding,
  from: SourceUnit,
  index: SourceIndex,
): { unit: SourceUnit; expression: ts.Expression } | null {
  for (const candidate of moduleCandidates(from.file, binding.module)) {
    const unit = index.get(candidate);
    const expression = unit?.constants.get(binding.imported);
    if (unit && expression) return { unit, expression };
  }
  return null;
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return unwrap(expression.expression);
  }
  return expression;
}

function expressionIdentity(unit: SourceUnit, expression: ts.Expression): string {
  return `${unit.file}:${expression.pos}:${expression.end}`;
}

function resolveBindingExpression(
  expression: ts.Expression,
  unit: SourceUnit,
  index: SourceIndex,
): { unit: SourceUnit; expression: ts.Expression } | null {
  const value = unwrap(expression);
  if (!ts.isIdentifier(value)) return { unit, expression: value };
  const local = unit.constants.get(value.text);
  if (local) return { unit, expression: local };
  const binding = unit.imports.get(value.text);
  return binding ? importedInitializer(binding, unit, index) : null;
}

function propertyInitializer(
  expression: ts.Expression,
  property: string,
  unit: SourceUnit,
  index: SourceIndex,
  seen: Set<string>,
): { unit: SourceUnit; expression: ts.Expression } | null {
  const binding = resolveBindingExpression(expression, unit, index);
  if (!binding) return null;
  const value = unwrap(binding.expression);
  const identity = expressionIdentity(binding.unit, value);
  if (seen.has(identity)) return null;
  seen.add(identity);
  try {
    if (ts.isObjectLiteralExpression(value)) {
      for (const member of value.properties) {
        const name = member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
          ? member.name.text
          : null;
        if (name !== property) continue;
        if (ts.isPropertyAssignment(member)) return { unit: binding.unit, expression: member.initializer };
        if (ts.isShorthandPropertyAssignment(member)) {
          const local = binding.unit.constants.get(member.name.text);
          return local ? { unit: binding.unit, expression: local } : null;
        }
      }
      return null;
    }
    if (ts.isPropertyAccessExpression(value)) {
      const nested = propertyInitializer(value.expression, value.name.text, binding.unit, index, seen);
      return nested ? propertyInitializer(nested.expression, property, nested.unit, index, seen) : null;
    }
    return null;
  } finally {
    seen.delete(identity);
  }
}

function resolveStaticString(
  expression: ts.Expression,
  unit: SourceUnit,
  index: SourceIndex,
  seen = new Set<string>(),
): string | null {
  const value = unwrap(expression);
  const identity = expressionIdentity(unit, value);
  if (seen.has(identity)) return null;
  seen.add(identity);
  try {
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
    if (ts.isIdentifier(value)) {
      const binding = resolveBindingExpression(value, unit, index);
      return binding ? resolveStaticString(binding.expression, binding.unit, index, seen) : null;
    }
    if (ts.isPropertyAccessExpression(value)) {
      const property = propertyInitializer(value.expression, value.name.text, unit, index, seen);
      return property ? resolveStaticString(property.expression, property.unit, index, seen) : null;
    }
    if (ts.isElementAccessExpression(value) && value.argumentExpression) {
      const propertyName = resolveStaticString(value.argumentExpression, unit, index, seen);
      const property = propertyName === null
        ? null
        : propertyInitializer(value.expression, propertyName, unit, index, seen);
      return property ? resolveStaticString(property.expression, property.unit, index, seen) : null;
    }
    if (ts.isTemplateExpression(value)) {
      let output = value.head.text;
      for (const span of value.templateSpans) {
        const resolved = resolveStaticString(span.expression, unit, index, seen);
        if (resolved === null) return null;
        output += resolved + span.literal.text;
      }
      return output;
    }
    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = resolveStaticString(value.left, unit, index, seen);
      const right = resolveStaticString(value.right, unit, index, seen);
      return left === null || right === null ? null : left + right;
    }
    if (
      ts.isCallExpression(value) &&
      ts.isIdentifier(value.expression) &&
      value.expression.text === "route" &&
      value.arguments.length === 2
    ) {
      const base = resolveStaticString(value.arguments[0], unit, index, seen);
      const suffix = resolveStaticString(value.arguments[1], unit, index, seen);
      return base === null || suffix === null ? null : base + suffix;
    }
    return null;
  } finally {
    seen.delete(identity);
  }
}

function resolveStaticStringArray(
  expression: ts.Expression,
  unit: SourceUnit,
  index: SourceIndex,
  seen = new Set<string>(),
): string[] | null {
  const value = unwrap(expression);
  const identity = expressionIdentity(unit, value);
  if (seen.has(identity)) return null;
  seen.add(identity);
  try {
    if (ts.isIdentifier(value)) {
      const binding = resolveBindingExpression(value, unit, index);
      return binding ? resolveStaticStringArray(binding.expression, binding.unit, index, seen) : null;
    }
    if (!ts.isArrayLiteralExpression(value)) return null;
    const values: string[] = [];
    for (const element of value.elements) {
      if (ts.isSpreadElement(element)) return null;
      const resolved = resolveStaticString(element, unit, index);
      if (resolved === null) return null;
      values.push(resolved);
    }
    return values;
  } finally {
    seen.delete(identity);
  }
}

function enclosingFiniteBindings(
  node: ts.Node,
  unit: SourceUnit,
  index: SourceIndex,
): Map<string, string[]> {
  const bindings = new Map<string, string[]>();
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isForOfStatement(current) || !ts.isVariableDeclarationList(current.initializer)) continue;
    const declaration = current.initializer.declarations[0];
    if (!declaration || !ts.isIdentifier(declaration.name)) continue;
    const values = resolveStaticStringArray(current.expression, unit, index);
    if (values && values.length > 0) bindings.set(declaration.name.text, values);
  }
  return bindings;
}

function cartesianConcat(left: string[], right: string[]): string[] {
  const values: string[] = [];
  for (const leftValue of left) for (const rightValue of right) values.push(leftValue + rightValue);
  return values;
}

function resolveStaticStrings(
  expression: ts.Expression,
  unit: SourceUnit,
  index: SourceIndex,
  bindings: Map<string, string[]>,
): string[] | null {
  const value = unwrap(expression);
  if (ts.isIdentifier(value) && bindings.has(value.text)) return bindings.get(value.text) ?? null;
  if (ts.isTemplateExpression(value)) {
    let values = [value.head.text];
    for (const span of value.templateSpans) {
      const resolved = resolveStaticStrings(span.expression, unit, index, bindings);
      if (!resolved) return null;
      values = cartesianConcat(values, resolved).map((entry) => entry + span.literal.text);
    }
    return values;
  }
  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveStaticStrings(value.left, unit, index, bindings);
    const right = resolveStaticStrings(value.right, unit, index, bindings);
    return left && right ? cartesianConcat(left, right) : null;
  }
  if (
    ts.isCallExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === "route" &&
    value.arguments.length === 2
  ) {
    const base = resolveStaticStrings(value.arguments[0], unit, index, bindings);
    const suffix = resolveStaticStrings(value.arguments[1], unit, index, bindings);
    return base && suffix ? cartesianConcat(base, suffix) : null;
  }
  const resolved = resolveStaticString(value, unit, index);
  return resolved === null ? null : [resolved];
}

function scanUnit(unit: SourceUnit, index: SourceIndex): RouteScanResult {
  const routes: RouteRegistration[] = [];
  const issues: ValidationIssue[] = [];
  let callSites = 0;

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      ["app", "router"].includes(node.expression.expression.text) &&
      ROUTE_METHODS.has(node.expression.name.text) &&
      node.arguments.length > 0
    ) {
      callSites += 1;
      const argument = node.arguments[0];
      const resolved = resolveStaticStrings(argument, unit, index, enclosingFiniteBindings(node, unit, index));
      const line = unit.sourceFile.getLineAndCharacterOfPosition(node.getStart(unit.sourceFile)).line + 1;
      if (resolved === null || resolved.length === 0) {
        issues.push({
          code: "UNRESOLVED_ROUTE_PATH",
          message: `${unit.file}:${line} has an app/router ${node.expression.name.text.toUpperCase()} registration whose path is not statically resolvable: ${argument.getText(unit.sourceFile)}`,
        });
      } else if (resolved.some((path) => !path.startsWith("/api/"))) {
        issues.push({
          code: "NON_API_ROUTE_PATH",
          message: `${unit.file}:${line} registers ${resolved.join(", ")}; the API route scanner only accepts explicit /api/ paths.`,
        });
      } else {
        for (const path of resolved) {
          routes.push({
            method: node.expression.name.text.toUpperCase(),
            path: normalizeRoutePath(path),
            file: unit.file,
            line,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(unit.sourceFile);
  return { routes, issues, callSites };
}

function scanIndex(index: SourceIndex, routeRoots: string[]): RouteScanResult {
  const result: RouteScanResult = { routes: [], issues: [], callSites: 0 };
  const normalizedRoots = routeRoots.map((root) => `${normalizedFile(root).replace(/\/$/, "")}/`);
  for (const unit of index.values()) {
    if (!normalizedRoots.some((root) => unit.file.startsWith(root))) continue;
    const scanned = scanUnit(unit, index);
    result.routes.push(...scanned.routes);
    result.issues.push(...scanned.issues);
    result.callSites += scanned.callSites;
  }
  return result;
}

export function extractExpressRouteScan(source: string, file: string): RouteScanResult {
  const sources = new Map([[normalizedFile(file), source]]);
  const index = sourceIndex(sources);
  return scanUnit([...index.values()][0], index);
}

export function extractExpressRoutes(source: string, file: string): RouteRegistration[] {
  return extractExpressRouteScan(source, file).routes;
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

function worktreeSources(repoRoot: string, roots: string[]): Map<string, string> {
  const sources = new Map<string, string>();
  for (const root of new Set([...roots, "shared"])) {
    const absolute = resolve(repoRoot, root);
    try {
      for (const file of collectTypeScriptFiles(absolute)) {
        sources.set(normalizedFile(relative(repoRoot, file)), readFileSync(file, "utf8"));
      }
    } catch {
      // Optional dependency roots may be absent in a focused fixture.
    }
  }
  return sources;
}

function gitTreeSources(repoRoot: string, sha: string, roots: string[]): Map<string, string> {
  const scanRoots = [...new Set([...roots, "shared"])];
  const names = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", sha, "--", ...scanRoots],
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
  const sources = new Map<string, string>();
  for (const file of names) {
    sources.set(
      normalizedFile(file),
      execFileSync("git", ["show", `${sha}:${file}`], { cwd: repoRoot, encoding: "utf8" }),
    );
  }
  return sources;
}

export function scanExpressRouteResult(repoRoot: string, roots = ["server"]): RouteScanResult {
  return scanIndex(sourceIndex(worktreeSources(repoRoot, roots)), roots);
}

export function scanExpressRoutes(repoRoot: string, roots = ["server"]): RouteRegistration[] {
  return scanExpressRouteResult(repoRoot, roots).routes;
}

export function scanGitTreeRouteResult(
  repoRoot: string,
  sha: string,
  roots = ["server"],
): RouteScanResult {
  return scanIndex(sourceIndex(gitTreeSources(repoRoot, sha, roots)), roots);
}

export function scanGitTreeRoutes(
  repoRoot: string,
  sha: string,
  roots = ["server"],
): RouteRegistration[] {
  return scanGitTreeRouteResult(repoRoot, sha, roots).routes;
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
  const result = sha ? scanGitTreeRouteResult(root, sha) : scanExpressRouteResult(root);
  const issues = [...result.issues, ...validateRouteUniqueness(result.routes)];
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.code}: ${issue.message}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Route uniqueness accepted: ${result.routes.length} static Express API registrations across ${result.callSites} call sites${sha ? ` at ${sha}` : " in the worktree"}.`,
    );
  }
}
