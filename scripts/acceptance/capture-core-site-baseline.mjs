// Capture the functional baseline of the protected routes against the LIVE origin.
//
// Read-only GETs only. No forms, no auth, no POST/PUT/DELETE, no cookies carried
// between requests. This tool observes production; it never changes it.
//
// No shebang, same reason as verify-core-site-protection.mjs: it is invoked as
// `node scripts/...` and imported by tests, where a shebang breaks the ESM runner.
//
// Usage:
//   node scripts/acceptance/capture-core-site-baseline.mjs [origin] [outFile]
// Defaults: https://xeniostechnology.com and docs/phase2/core-site-baseline/functional-baseline.json
//
// IMPORTANT, read before trusting the output: xeniostechnology.com is a
// client-rendered SPA. Every route is served the same index.html shell, so the raw
// title / meta description / canonical are identical on every path and are NOT
// per-route evidence. What this capture DOES pin, and what is genuinely checkable:
//   - the HTTP status of every protected route,
//   - the shell's byte length and sha256 (any change to client/index.html or the
//     built asset references moves it, on every route at once),
//   - the head tags the shell actually ships (title, description, canonical),
//   - the presence or absence of x-robots-tag, which IS per-route: the server page
//     gate marks /research and /care noindex,nofollow and must never mark a
//     protected route.
// Per-route rendered content is covered by the visual baseline, which needs a
// browser harness. See docs/phase2/core-site-baseline/VISUAL_BASELINE_PLAN.md.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

export const DEFAULT_ORIGIN = "https://xeniostechnology.com";
export const DEFAULT_OUT = resolve(
  REPO_ROOT,
  "docs",
  "phase2",
  "core-site-baseline",
  "functional-baseline.json",
);

/** Expand the manifest's protected routes into concrete, fetchable paths. */
export function concreteProtectedPaths(manifest) {
  const routes = manifest.protectedRoutes;
  const paths = [];
  for (const page of routes.pages) {
    if (page.path === "*") continue;
    if (page.path === "/for/:slug") {
      for (const slug of routes.icpSlugs) paths.push(`/for/${slug}`);
    } else if (page.path === "/careers/:slug") {
      for (const slug of routes.careersSlugs) paths.push(`/careers/${slug}`);
    } else {
      paths.push(page.path);
    }
  }
  for (const redirect of routes.redirects) paths.push(redirect.path);
  for (const external of routes.externalRedirects) paths.push(external.path);
  return [...new Set(paths)];
}

/** Bucket a content length so trivial byte drift does not create false alarms. */
export function lengthBucket(length) {
  if (length === null || length === undefined) return "unknown";
  if (length < 1024) return "<1KB";
  if (length < 4096) return "1-4KB";
  if (length < 8192) return "4-8KB";
  if (length < 16384) return "8-16KB";
  if (length < 65536) return "16-64KB";
  return ">64KB";
}

export function extractHead(html) {
  const pick = (pattern) => {
    const match = html.match(pattern);
    return match ? match[1].trim() : null;
  };
  return {
    title: pick(/<title[^>]*>([^<]*)<\/title>/i),
    metaDescription:
      pick(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ??
      pick(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i),
    canonical:
      pick(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) ??
      pick(/<link[^>]+href=["']([^"']*)["'][^>]*rel=["']canonical["']/i),
  };
}

export function sha256(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

/** Probe one path with a read-only GET. `fetchImpl` is injected so this is testable. */
export async function probe(origin, path, fetchImpl = fetch) {
  const url = `${origin}${path}`;
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "manual" });
    const body = await response.text();
    const head = extractHead(body);
    return {
      path,
      status: response.status,
      location: response.headers.get("location") ?? null,
      contentLength: body.length,
      contentLengthBucket: lengthBucket(body.length),
      bodySha256: sha256(body),
      title: head.title,
      metaDescription: head.metaDescription,
      canonical: head.canonical,
      xRobotsTag: response.headers.get("x-robots-tag") ?? null,
      contentType: response.headers.get("content-type") ?? null,
      error: null,
    };
  } catch (error) {
    return { path, status: null, error: String(error?.message ?? error) };
  }
}

/** The control set: the two gated sections, captured only to prove the contrast. */
export const CONTROL_PATHS = ["/research", "/care", "/admin"];

export async function capture(origin = DEFAULT_ORIGIN, manifestPath, fetchImpl = fetch) {
  const manifest = JSON.parse(
    readFileSync(
      manifestPath ??
        resolve(REPO_ROOT, "docs", "phase2", "CORE_SITE_PROTECTION_MANIFEST.json"),
      "utf8",
    ),
  );
  const paths = concreteProtectedPaths(manifest);
  const protectedRoutes = [];
  for (const path of paths) protectedRoutes.push(await probe(origin, path, fetchImpl));
  const controls = [];
  for (const path of CONTROL_PATHS) {
    if (paths.includes(path)) continue;
    controls.push(await probe(origin, path, fetchImpl));
  }
  return { manifest, protectedRoutes, controls, origin };
}

export function main(argv = process.argv.slice(2)) {
  const origin = argv[0] || DEFAULT_ORIGIN;
  const outFile = argv[1] ? resolve(argv[1]) : DEFAULT_OUT;
  return capture(origin).then(({ manifest, protectedRoutes, controls }) => {
    const shells = new Set(protectedRoutes.filter((r) => r.status === 200).map((r) => r.bodySha256));
    const document = {
      $comment: [
        "Functional baseline of the protected xenios routes, captured against the LIVE",
        "production origin with read-only GETs. Regenerate with:",
        "  node scripts/acceptance/capture-core-site-baseline.mjs",
        "Read 'interpretation' before treating title/meta/canonical as per-route evidence.",
      ],
      taskId: "XCA-W17-CORE-PROTECTION",
      origin,
      capturedAt: new Date().toISOString(),
      manifestBaselineSha: manifest.baselineSha,
      method: "GET only, redirect: manual, no auth, no cookies, no forms",
      interpretation: {
        renderingModel: "client-rendered SPA (wouter); the server returns one index.html shell for every path",
        perRouteSignals: ["status", "x-robots-tag", "location (for server-side redirects)"],
        shellWideSignals: ["title", "metaDescription", "canonical", "bodySha256", "contentLengthBucket"],
        note: "title/metaDescription/canonical are identical on every route because SeoHead sets them in the browser after hydration. A change to any of them moves every route's bodySha256 at once, which is exactly the tripwire we want on client/index.html.",
      },
      distinctShellHashes: [...shells],
      shellIsUniform: shells.size === 1,
      summary: {
        protectedRoutesCaptured: protectedRoutes.length,
        ok200: protectedRoutes.filter((r) => r.status === 200).length,
        nonOk: protectedRoutes.filter((r) => r.status !== 200).map((r) => ({ path: r.path, status: r.status, error: r.error })),
        protectedRoutesCarryingRobotsHeader: protectedRoutes
          .filter((r) => r.xRobotsTag)
          .map((r) => ({ path: r.path, xRobotsTag: r.xRobotsTag })),
      },
      invariants: [
        {
          id: "status-200",
          assertion: "every protected route returns 200 and the SPA shell",
          observed: `${protectedRoutes.filter((r) => r.status === 200).length}/${protectedRoutes.length}`,
          exceptions: protectedRoutes
            .filter((r) => r.status !== 200)
            .map((r) => ({ path: r.path, status: r.status, location: r.location })),
        },
        {
          id: "no-robots-header-on-protected",
          assertion: "no protected route carries an x-robots-tag response header",
          observed: protectedRoutes.filter((r) => r.xRobotsTag).length === 0 ? "holds" : "VIOLATED",
        },
        {
          id: "gated-sections-stay-noindex",
          assertion:
            "the /research and /care page gates keep sending x-robots-tag: noindex, nofollow. This is the only per-route server signal on this origin, so it is the sharpest cross-check that a Research or Care change did not leak its gate onto the main site, or drop it from its own.",
          observed: controls.map((c) => `${c.path} -> ${c.xRobotsTag ?? "none"}`).join("; "),
        },
        {
          id: "uniform-shell",
          assertion: "every 200 protected route returns one identical index.html shell hash",
          observed: shells.size === 1 ? "holds (1 distinct hash)" : `VIOLATED (${shells.size} distinct hashes)`,
        },
      ],
      observedDeploymentNotes: protectedRoutes
        .filter((r) => r.status !== 200 && r.status !== null)
        .map((r) => ({
          path: r.path,
          status: r.status,
          location: r.location,
          note: "the deployed edge answers this path before the SPA router sees it; the repo route is recorded in the manifest, this is what production actually does today",
        })),
      protectedRoutes,
      controls,
    };
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    process.stdout.write(
      `captured ${protectedRoutes.length} protected routes + ${controls.length} controls -> ${outFile}\n`,
    );
    return 0;
  });
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().then((code) => process.exit(code));
