import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "dist", "public");
const indexFile = path.join(publicDir, "index.html");
const budgets = JSON.parse(fs.readFileSync(path.join(root, "qa", "performance-budgets.json"), "utf8"));

if (!fs.existsSync(indexFile)) {
  console.error("Performance budget requires a production build. Run npm run build first.");
  process.exit(1);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function gzipBytes(file) {
  return zlib.gzipSync(fs.readFileSync(file), { level: 9 }).byteLength;
}

const index = fs.readFileSync(indexFile, "utf8");
const entrySources = [...index.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)]
  .map((match) => path.join(publicDir, match[1].replace(/^\//, "")));
const initialJsGzipBytes = entrySources.reduce((sum, file) => sum + gzipBytes(file), 0);
const jsFiles = walk(publicDir).filter((file) => file.endsWith(".js"));
const routeChunks = jsFiles.filter((file) => !entrySources.includes(file));
const largestRouteChunk = routeChunks
  .map((file) => ({ file: path.relative(root, file).replaceAll("\\", "/"), bytes: gzipBytes(file) }))
  .sort((a, b) => b.bytes - a.bytes)[0] ?? { file: "none", bytes: 0 };
const dependencyText = walk(publicDir)
  .filter((file) => /\.(css|html|js)$/i.test(file))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
const referencedImageFiles = walk(publicDir)
  .filter((file) => /\.(avif|gif|jpe?g|png|webp)$/i.test(file))
  // Vite copies public assets even when nothing references them. Only assets
  // reachable from the built dependency graph affect a page-load budget.
  .filter((file) => {
    const relative = path.relative(publicDir, file).replaceAll("\\", "/");
    return dependencyText.includes(relative) || dependencyText.includes(path.basename(file));
  });
const largestImage = referencedImageFiles
  .map((file) => ({ file: path.relative(root, file).replaceAll("\\", "/"), bytes: fs.statSync(file).size }))
  .sort((a, b) => b.bytes - a.bytes)[0] ?? { file: "none", bytes: 0 };

const results = [
  {
    metric: "initial JS (gzip)",
    actual: initialJsGzipBytes,
    budget: budgets.assets.initialJsGzipBytes,
    artifact: entrySources.map((file) => path.basename(file)).join(", "),
  },
  {
    metric: "largest route JS (gzip)",
    actual: largestRouteChunk.bytes,
    budget: budgets.assets.routeJsGzipBytes,
    artifact: largestRouteChunk.file,
  },
  {
    metric: "largest image",
    actual: largestImage.bytes,
    budget: budgets.assets.imageBytes,
    artifact: largestImage.file,
  },
];

for (const result of results) {
  const status = result.actual <= result.budget ? "PASS" : "FAIL";
  console.log(`${status} ${result.metric}: ${result.actual} / ${result.budget} bytes (${result.artifact})`);
}

if (results.some((result) => result.actual > result.budget)) process.exitCode = 1;
