import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const outputRoot = path.resolve(repoRoot, "client", "public", "hino");
const expectedOutputRoot = `${path.resolve(repoRoot, "client", "public")}${path.sep}`;

if (!outputRoot.startsWith(expectedOutputRoot)) {
  throw new Error(`Refusing to replace an output path outside client/public: ${outputRoot}`);
}

const sourceBase = (process.env.HINO_SOURCE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const sourceRoot = path.resolve(
  process.env.HINO_SOURCE_ROOT ?? path.join(repoRoot, "..", "hollywood-hino-platform"),
);
const productionBase = "https://xeniostechnology.com/hino";

const routes = [
  ["/", "index.html"],
  ["/story", "story/index.html"],
  ["/legacy", "legacy/index.html"],
  ["/media", "media/index.html"],
  ["/collective", "collective/index.html"],
  ["/retreat", "retreat/index.html"],
  ["/merch", "merch/index.html"],
  ["/research", "research/index.html"],
  ["/contact", "contact/index.html"],
  ["/press", "press/index.html"],
  ["/training", "training/index.html"],
  ["/privacy", "privacy/index.html"],
  ["/terms", "terms/index.html"],
  ["/research-use", "research-use/index.html"],
];

const internalPaths = new Set(routes.map(([route]) => route));
internalPaths.add("/hino-collective");
internalPaths.add("/xenios-kollective");

const assets = [
  "hino-hero-profile.webp",
  "hino-archive-02.webp",
  "hino-archive-03.webp",
  "hino-archive-04.webp",
  "hino-archive-05.webp",
];

function splitUrl(value) {
  const marker = value.search(/[?#]/);
  return marker === -1
    ? { pathname: value, suffix: "" }
    : { pathname: value.slice(0, marker), suffix: value.slice(marker) };
}

function rewriteInternalHref(value) {
  if (!value.startsWith("/")) return value;
  if (value === "/research/catalog" || value.startsWith("/research/catalog?")) return value;

  const { pathname, suffix } = splitUrl(value);
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (!internalPaths.has(normalized)) return value;

  if (normalized === "/") return `/hino/${suffix}`;
  return `/hino${normalized}/${suffix}`;
}

function publicCopy(html) {
  return html
    .replaceAll("The non-production approval preview", "The approval-stage website")
    .replaceAll("the non-production approval preview", "the approval-stage website")
    .replaceAll("Non-production approval preview", "Approval-stage website")
    .replaceAll("non-production approval preview", "approval-stage website")
    .replaceAll("non-production Hollywood Hino preview", "approval-stage Hollywood Hino website")
    .replaceAll("non-production preview", "approval-stage website")
    .replaceAll("local approval preview", "approval-stage website")
    .replaceAll("internal approval preview", "editorial evidence preview")
    .replaceAll("Preview only · Hino and Samuel pending", "Approval-stage · Terms and economics pending")
    .replaceAll(
      "Benefits, terms, pricing, partner attribution, and launch status remain gated until Samuel and Hino approve them in writing.",
      "Benefits, terms, pricing, partner attribution, and launch status remain gated until final program terms are approved in writing.",
    )
    .replaceAll(
      "Every public name, caption, and asset still needs Samuel and Hino approval.",
      "Every public name, caption, and asset remains subject to final rights and copy clearance.",
    )
    .replaceAll(
      "Hino and Samuel approve every public name and line of copy.",
      "final rights and copy clearance is recorded.",
    )
    .replaceAll(
      "until Samuel approves the operational destination and privacy language.",
      "until an operational destination and privacy language are approved.",
    );
}

function transformHtml(input) {
  let html = input;

  html = html.replace(
    /<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  html = html.replace(/<link\b[^>]*rel=["'](?:modulepreload|preload|manifest)["'][^>]*>/gi, "");
  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, "");

  html = html.replace(
    /(src|srcset)=["']\/_next\/image\?url=%2F([^&"']+)(?:&amp;|&)[^"']*["']/gi,
    (_match, attribute, file) => `${attribute}="/hino/assets/${decodeURIComponent(file)}"`,
  );

  html = html.replace(/(href|action)="(\/[^"]*)"/gi, (_match, attribute, value) => {
    return `${attribute}="${rewriteInternalHref(value)}"`;
  });
  html = html.replaceAll(sourceBase, productionBase);
  html = publicCopy(html);

  html = html.replace(
    "</head>",
    '<link rel="stylesheet" href="/hino/site.css"><script defer src="/hino/site.js"></script></head>',
  );

  if (html.includes("/_next/") || html.includes("/@id/") || html.includes("/@vite/")) {
    throw new Error("Exported HTML still references the source application runtime");
  }

  return `${html.trim()}\n`;
}

function aliasDocument(target) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow, noarchive">
    <meta http-equiv="refresh" content="0; url=${target}">
    <link rel="canonical" href="${productionBase}/collective/">
    <title>Hollywood Hino Collective</title>
  </head>
  <body>
    <p><a href="${target}">Continue to the Hino Collective</a></p>
  </body>
</html>
`;
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function main() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, "assets"), { recursive: true });

  const css = await fetchText(`${sourceBase}/app/globals.css`, {
    Accept: "text/css,*/*;q=0.1",
  });
  if (!css.includes(".home-hero") || css.includes("createHotContext")) {
    throw new Error("The source stylesheet was not returned as compiled CSS");
  }
  await writeFile(path.join(outputRoot, "site.css"), `${css.trim()}\n`, "utf8");
  await cp(path.join(scriptDir, "site.js"), path.join(outputRoot, "site.js"));

  for (const asset of assets) {
    await cp(path.join(sourceRoot, "public", asset), path.join(outputRoot, "assets", asset));
  }

  for (const [route, relativeOutput] of routes) {
    const html = await fetchText(`${sourceBase}${route}`);
    const output = path.join(outputRoot, relativeOutput);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, transformHtml(html), "utf8");
  }

  for (const alias of ["hino-collective", "xenios-kollective"]) {
    const output = path.join(outputRoot, alias, "index.html");
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, aliasDocument("/hino/collective/"), "utf8");
  }

  const provenance = {
    sourceHandoffDate: "2026-08-25",
    sourceCommit: "5b1327bc9a0d63a820aefd2ef3c3db27ad868eff",
    sourceProject: "hollywood-hino-platform",
    productionBase,
    routes: routes.map(([route]) => route),
    assets,
    rightsBoundary: "Getty-watermarked attachment excluded; only the five supplied WebP assets listed above are published.",
  };
  await writeFile(
    path.join(outputRoot, "export-provenance.json"),
    `${JSON.stringify(provenance, null, 2)}\n`,
    "utf8",
  );

  console.log(`Exported ${routes.length} Hino pages and ${assets.length} images to ${outputRoot}`);
}

await main();
