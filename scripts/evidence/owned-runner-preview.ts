/** Actions-only, provider-free static preview. No application/Auth composition. */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { buildRawHttpDocumentResponse } from "../../server/research/seo/raw-http-document-policy";
import { classifyRequest, safeNetworkUrl, scenarioDefinition, PUBLIC_SCENARIO, WHOLESALE_ROUTE } from "./owned-runner-browser-qa.mjs";

export const UNAVAILABLE_FIXTURE = Object.freeze({
  ok: false,
  message: "API not available in this isolated preview.",
});
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const MIME: Record<string, string> = {
  js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8", webmanifest: "application/manifest+json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  avif: "image/avif", txt: "text/plain; charset=utf-8", map: "application/json",
  html: "text/html; charset=utf-8",
};
type Asset = { path: string; bytes: number; sha256: string };
type RecordRow = {
  method: string; target: string; kind: string; status: number;
  responseSha256: string; responseBytes: number; headers: Record<string, string>;
};

/** Public mode has one synthetic404 POST; premium entry refuses every POST. */
export async function startOwnedPreview({ root, inventory, ledger, scenario = PUBLIC_SCENARIO }: {
  root: string; inventory: readonly Asset[]; ledger: RecordRow[]; scenario?: string;
}) {
  const definition = scenarioDefinition(scenario);
  const realRoot = realpathSync(root);
  const assets = new Map(inventory.map((item) => [item.path, item]));
  if (assets.size !== inventory.length || !assets.has("index.html")) throw new Error("PREVIEW_INVENTORY_INVALID");
  let origin = "";
  const counters = { resolve404: 0, refused: 0, unexpected: 0, credentialAttempts: 0,
    readOnlyGET: Object.fromEntries(Object.keys(definition.fixtures).map((path) => [path, 0])) as Record<string, number> };
  const bytesFor = (name: string): Buffer => {
    const expected = assets.get(name);
    if (!expected) throw new Error("PREVIEW_ASSET_MISSING");
    const filename = resolve(realRoot, name);
    if (!filename.startsWith(realRoot + sep) || lstatSync(filename).isSymbolicLink()
      || realpathSync(filename) !== filename || !lstatSync(filename).isFile()) throw new Error("PREVIEW_ASSET_UNSAFE");
    const bytes = readFileSync(filename);
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) throw new Error("PREVIEW_ASSET_CHANGED");
    return bytes;
  };
  const template = bytesFor("index.html").toString("utf8");
  function answer(req: IncomingMessage, res: ServerResponse, kind: string, status: number,
    body: Buffer | string, headers: Record<string, string> = {}) {
    if (Object.keys(headers).some((name) => name.toLowerCase() === "set-cookie")) throw new Error("PREVIEW_COOKIE_FORBIDDEN");
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const finalHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers };
    ledger.push({ method: req.method ?? "", target: safeNetworkUrl(req.url ?? ""), kind, status,
      responseSha256: hash(bytes), responseBytes: bytes.length, headers: finalHeaders });
    res.writeHead(status, { ...finalHeaders, "Content-Length": bytes.length });
    res.end(req.method === "HEAD" ? undefined : bytes);
  }
  const server = createServer((req, res) => {
    req.setTimeout(3000, () => req.destroy());
    try {
      const premiumCredentialHeader = scenario !== PUBLIC_SCENARIO
        && (Object.hasOwn(req.headers, "authorization") || Object.hasOwn(req.headers, "cookie"));
      if (req.headers.host !== new URL(origin).host || req.headers.authorization || req.headers.cookie || premiumCredentialHeader) {
        counters.credentialAttempts++;
        req.resume();
        return answer(req, res, "refused_credentials_or_host", 403, "", {});
      }
      const kind = classifyRequest(req.method, req.url, assets, scenario);
      if (kind.kind === "readonly_fixture") {
        req.resume();
        if (req.headers.origin && req.headers.origin !== origin
          || req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(String(req.headers["sec-fetch-site"]))) {
          counters.refused++;
          return answer(req, res, "refused_readonly_origin", 403, "");
        }
        const fixture = definition.fixtures[kind.path as keyof typeof definition.fixtures];
        counters.readOnlyGET[kind.path]++;
        return answer(req, res, "STATIC_READONLY_UNAVAILABLE_FIXTURE", fixture.status, JSON.stringify(fixture.body), {
          "Content-Type": "application/json; charset=utf-8", "X-Robots-Tag": "noindex, nofollow",
        });
      }
      if (kind.kind === "resolve_fixture") {
        if (req.headers.origin !== origin || !String(req.headers["content-type"] ?? "").startsWith("application/json")) {
          counters.refused++;
          req.resume();
          return answer(req, res, "refused_resolve_origin", 403, "");
        }
        let size = 0;
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1024) { counters.refused++; req.destroy(); } else chunks.push(chunk);
        });
        req.on("end", () => {
          try {
            const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!input || Object.keys(input).length !== 1 || input.code !== "SAMPLE-CODE") throw new Error("synthetic only");
            counters.resolve404++;
            answer(req, res, "STATIC_404_UNAVAILABLE_FIXTURE", 404, JSON.stringify(UNAVAILABLE_FIXTURE), {
              "Content-Type": "application/json; charset=utf-8", "X-Robots-Tag": "noindex, nofollow",
            });
          } catch {
            counters.refused++;
            answer(req, res, "refused_resolve_input", 400, "");
          }
        });
        return;
      }
      req.resume();
      if (kind.kind === "document") {
        const document = buildRawHttpDocumentResponse({ requestTarget: req.url!, templateHtml: template,
          ...(req.url === WHOLESALE_ROUTE ? { indexable: false } : {}) });
        return answer(req, res, "document_policy", document.status, document.html, { ...document.headers });
      }
      if (kind.kind === "asset") {
        const bytes = bytesFor(kind.path);
        const extension = kind.path.split(".").at(-1)!;
        return answer(req, res, "inventoried_asset", 200, bytes, { "Content-Type": MIME[extension] ?? "application/octet-stream" });
      }
      counters.unexpected++;
      return answer(req, res, "off_contract_refused", 404, JSON.stringify({ ok: false, message: "Not available in this preview." }), {
        "Content-Type": "application/json; charset=utf-8",
      });
    } catch {
      counters.unexpected++;
      if (!res.headersSent) answer(req, res, "preview_integrity_failure", 500, ""); else res.destroy();
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxConnections = 24;
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("PREVIEW_LISTEN_INVALID"));
      origin = `http://127.0.0.1:${address.port}`;
      done();
    });
  });
  let closed = false;
  return {
    origin, counters,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((done, reject) => {
        server.close((error) => error ? reject(error) : done());
        server.closeAllConnections();
      });
      if (server.listening) throw new Error("PREVIEW_CLEANUP_FAILED");
    },
  };
}
