#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIRECTORY, "../..");

export const SOURCE_ROOTS = Object.freeze([
  "client/src",
  "client/public",
  "server",
  "shared",
]);

export const BUILD_ROOTS = Object.freeze([
  "dist/public",
  "dist/index.cjs",
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".css"]);
const BUILD_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".json", ".html", ".css"]);
const EXCLUDED_DIRECTORY_NAMES = new Set(["node_modules", ".git", "coverage"]);
const TEST_OR_ARCHIVE_PATH = /(?:^|\/)(?:__tests__|historical|history|archive|archives|audit-evidence)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i;

export const FORBIDDEN_FORMS = Object.freeze([
  { name: "literal U+2014", pattern: /—/gu },
  { name: "&mdash;", pattern: /&mdash;/giu },
  { name: "&#8212;", pattern: /&#8212;/gu },
  { name: "&#x2014;", pattern: /&#x2014;/giu },
  { name: "escaped \\u2014", pattern: /\\u2014/giu },
]);

function normalizePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isExcludedSourcePath(path) {
  const normalized = normalizePath(path);
  return normalized.split("/").some((part) => EXCLUDED_DIRECTORY_NAMES.has(part))
    || TEST_OR_ARCHIVE_PATH.test(normalized);
}

export function forbiddenMatchesInText(text) {
  const matches = [];
  for (const form of FORBIDDEN_FORMS) {
    form.pattern.lastIndex = 0;
    for (const match of String(text).matchAll(form.pattern)) {
      matches.push({ form: form.name, index: match.index ?? 0, value: match[0] });
    }
  }
  return matches.sort((left, right) => left.index - right.index || left.form.localeCompare(right.form));
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function finding(file, text, index, form) {
  return { file: normalizePath(file), line: lineNumber(text, index), form };
}

function scanStructuredSource(file, text) {
  const kind = file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX
    : file.endsWith(".ts") ? ts.ScriptKind.TS
      : file.endsWith(".json") ? ts.ScriptKind.JSON
        : ts.ScriptKind.JS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const findings = [];
  const visit = (node) => {
    const customerCopyNode = ts.isStringLiteralLike(node)
      || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node)
      || ts.isTemplateTail(node)
      || ts.isJsxText(node);
    if (customerCopyNode) {
      const raw = node.getText(source);
      const cooked = "text" in node ? String(node.text) : raw;
      const rawMatches = forbiddenMatchesInText(raw);
      const cookedMatches = forbiddenMatchesInText(cooked);
      const matches = rawMatches.length > 0 ? rawMatches : cookedMatches;
      for (const match of matches) {
        findings.push(finding(file, text, node.getStart(source) + match.index, match.form));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function stripBlockCommentsPreservingLines(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\r\n]/g, " "));
}

export function scanSourceText(file, text) {
  const normalized = normalizePath(file);
  if (isExcludedSourcePath(normalized)) return [];
  const extension = extname(normalized).toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"].includes(extension)) {
    return scanStructuredSource(normalized, text);
  }
  const scannable = extension === ".css" ? stripBlockCommentsPreservingLines(text)
    : extension === ".html" ? text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, " "))
      : text;
  return forbiddenMatchesInText(scannable).map((match) => finding(normalized, scannable, match.index, match.form));
}

export function scanBuildText(file, text) {
  return forbiddenMatchesInText(text).map((match) => finding(file, text, match.index, match.form));
}

async function filesUnder(path, extensions) {
  if (!existsSync(path)) return [];
  const entry = await import("node:fs/promises").then(({ stat }) => stat(path));
  if (entry.isFile()) return extensions.has(extname(path).toLowerCase()) ? [path] : [];
  const files = [];
  for (const child of await readdir(path, { withFileTypes: true })) {
    if (child.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(child.name)) continue;
    const absolute = resolve(path, child.name);
    if (child.isDirectory()) files.push(...await filesUnder(absolute, extensions));
    else if (child.isFile() && extensions.has(extname(child.name).toLowerCase())) files.push(absolute);
  }
  return files;
}

export async function scanSourceTree(root = DEFAULT_ROOT) {
  const findings = [];
  let scannedFiles = 0;
  for (const sourceRoot of SOURCE_ROOTS) {
    for (const absolute of await filesUnder(resolve(root, sourceRoot), SOURCE_EXTENSIONS)) {
      const file = normalizePath(relative(root, absolute));
      if (isExcludedSourcePath(file)) continue;
      scannedFiles += 1;
      findings.push(...scanSourceText(file, await readFile(absolute, "utf8")));
    }
  }
  return { scannedFiles, findings };
}

export async function scanBuildTree(root = DEFAULT_ROOT) {
  const findings = [];
  let scannedFiles = 0;
  for (const buildRoot of BUILD_ROOTS) {
    for (const absolute of await filesUnder(resolve(root, buildRoot), BUILD_EXTENSIONS)) {
      const file = normalizePath(relative(root, absolute));
      scannedFiles += 1;
      findings.push(...scanBuildText(file, await readFile(absolute, "utf8")));
    }
  }
  return { scannedFiles, findings };
}

function printResult(label, result) {
  console.log(`${label}: ${result.scannedFiles} files scanned; ${result.findings.length} forbidden customer-facing em-dash forms`);
  for (const item of result.findings) console.error(`${item.file}:${item.line}: ${item.form}`);
}

async function main() {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex >= 0 && process.argv[rootIndex + 1] ? resolve(process.argv[rootIndex + 1]) : DEFAULT_ROOT;
  const source = process.argv.includes("--source");
  const build = process.argv.includes("--build");
  if (source === build) throw new Error("Choose exactly one scan mode: --source or --build");
  const result = source ? await scanSourceTree(root) : await scanBuildTree(root);
  printResult(source ? "runtime source" : "production build", result);
  if (result.scannedFiles === 0) throw new Error("No files were scanned; a zero-input check is not a release gate");
  if (result.findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
