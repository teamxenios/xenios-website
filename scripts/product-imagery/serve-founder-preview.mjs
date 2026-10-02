import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DOCUMENT_ROOT = join(REPO_ROOT, "docs/product-imagery");
const MIME = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function resolveRequestPath(rawPath) {
  const decoded = decodeURIComponent(rawPath);
  const logical = decoded === "/" ? "/founder-preview/index.html" : decoded;
  const normalized = normalize(logical).replace(/^([/\\])+/, "");
  const absolute = resolve(DOCUMENT_ROOT, normalized);
  const boundary = `${DOCUMENT_ROOT}${sep}`;
  if (absolute !== DOCUMENT_ROOT && !absolute.startsWith(boundary)) return null;
  return absolute;
}

function responseHeaders(contentType) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": contentType,
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  };
}

export async function startFounderPreviewServer({ port = 0 } = {}) {
  const server = createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    let requestUrl;
    try {
      requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    } catch {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }
    const absolute = resolveRequestPath(requestUrl.pathname);
    if (!absolute || !existsSync(absolute) || !statSync(absolute).isFile()) {
      response.writeHead(404, responseHeaders("text/plain; charset=utf-8"));
      response.end("Not found");
      return;
    }
    const contentType = MIME.get(extname(absolute).toLowerCase());
    if (!contentType) {
      response.writeHead(415, responseHeaders("text/plain; charset=utf-8"));
      response.end("Unsupported media type");
      return;
    }
    const bytes = readFileSync(absolute);
    response.writeHead(200, {
      ...responseHeaders(contentType),
      "Content-Length": bytes.length,
    });
    if (request.method === "HEAD") response.end();
    else response.end(bytes);
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Preview server did not bind");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    server,
    origin,
    documentRoot: DOCUMENT_ROOT,
    async close() {
      await new Promise((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
    },
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const requestedPort = Number(process.env.PORT || process.argv[2] || 5178);
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new Error("Port must be an integer between 0 and 65535");
  }
  const preview = await startFounderPreviewServer({ port: requestedPort });
  console.log(`Xenios founder preview: ${preview.origin}/founder-preview/index.html`);
  console.log(`Serving only ${relative(REPO_ROOT, preview.documentRoot).replaceAll("\\", "/")}`);
  console.log("Press Ctrl+C to stop.");
  const close = async () => {
    await preview.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
