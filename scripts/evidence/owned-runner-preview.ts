/** Actions-only, provider-free static preview. No application/Auth composition. */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRawHttpDocumentResponse } from "../../server/research/seo/raw-http-document-policy";
import { policies, EARLY_ACCESS_PRODUCT_POLICY_SLUG, EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT } from "../../server/research/policies-data";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "../../shared/research/assisted-order/form";
import { HCG_STRENGTH_REVIEW } from "../../shared/research/master-offerings/hcg-strength-review";
import { classifyRequest, safeNetworkUrl, scenarioDefinition, PUBLIC_SCENARIO, WHOLESALE_ROUTE,
  PARTNER_COMPONENT_SCENARIO, partnerSafeNetworkTarget, DISPLAY_SCENARIO, DISPLAY_SOURCE_PINS, DISPLAY_MEDIA_PINS, DISPLAY_CATALOG_PATH,
  READ_ONLY_GET_FIXTURES, sourceDerivedDisplayRows, displayCatalogPage } from "./owned-runner-browser-qa.mjs";

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
type SyntheticDisplayRow = { productName: string; specification: string; unitPriceCents: null; priceVersion: null;
  selectableForReview: boolean; intentExclusion: string | null;
  reviewedContent?: { brand?: string; summary: string }; reviewedMedia?: { primary?: { href: string }; representation?: string } };

/** Only exact, public, immutable source data. Never a real application port. */
export function createSyntheticDisplayData(repo: string) {
  const root = realpathSync(repo);
  for (const pin of DISPLAY_SOURCE_PINS) {
    const file = resolve(root, pin.path);
    if (!file.startsWith(root + sep) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()
      || realpathSync(file) !== file || hash(readFileSync(file)) !== pin.sha256) throw new Error("DISPLAY_SOURCE_PIN_MISMATCH");
  }
  const data = (name: string) => JSON.parse(readFileSync(resolve(root, "server/research/master-offerings/data/" + name), "utf8"));
  const items = sourceDerivedDisplayRows({ catalog: data("member-safe-master-offerings.generated.json"),
    bindings: data("master-offering-bindings.generated.json"), media: data("reviewed-public-media.json"),
    content: data("reviewed-public-content.json"), hcg: HCG_STRENGTH_REVIEW }) as SyntheticDisplayRow[];
  const fixtures: Record<string, { status: number; body: unknown }> = {
    "/api/config": READ_ONLY_GET_FIXTURES["/api/config"],
    "/api/research/me": READ_ONLY_GET_FIXTURES["/api/research/me"],
    "/api/research/early-access/session": { status: 200, body: { authenticated: true, expiresAt: null } },
    "/api/research/early-access/assisted-orders/config": { status: 503, body: { enabled: false } },
    "/api/research/policies": { status: 200, body: { policies: {
      [EARLY_ACCESS_PRODUCT_POLICY_SLUG]: policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG],
    } } },
    "/api/research/early-access/agreements": { status: 200, body: { accepted: true, required: [EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT] } },
    "/api/research/early-access/request-intents/config": { status: 200, body: { enabled: true, contactAdmissionRequired: true,
      requiredAgreements: [EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT], formAcknowledgments: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((ack) => ({
        id: ack.id, scope: ack.scope, copy: ack.copy, ...assistedOrderFormPair(ack),
      })) } },
    "/api/research/early-access/request-intents/admission": { status: 200, body: { admitted: true,
      policyRevision: "e222864ba2bcd022bd3404ac6f2372a03bfb1d479a56b849fb4eb470080ff303", retentionSeconds: 7200 } },
  };
  const normalize = (text: string) => text.trim().replace(/\s+/gu, " ");
  return { fixtures, items, assetPins: DISPLAY_MEDIA_PINS,
    expectations: items.map((item) => ({ name: item.productName, specification: item.specification,
      summary: item.reviewedContent ? normalize((item.reviewedContent.brand ? item.reviewedContent.brand + " · " : "") + item.reviewedContent.summary) : null,
      media: item.reviewedMedia?.primary?.href ?? null, representation: item.reviewedMedia?.representation ?? null,
      selectableForReview: item.selectableForReview, intentExclusion: item.intentExclusion })),
    receipt: { kind: "SYNTHETIC_DISPLAY_ONLY_NOT_REAL_AUTH_ASSENT_CONTACT_OR_ELIGIBILITY",
      rows: items.length, rowsSha256: hash(JSON.stringify(items)), pricesNull: items.every((item) => item.unitPriceCents === null && item.priceVersion === null),
      persisted: false, actualActor: false, actualAssent: false, contactRecord: false } };
}

/** Public mode has one synthetic404 POST; premium entry refuses every POST. */
export async function startOwnedPreview({ root, inventory, ledger, scenario = PUBLIC_SCENARIO }: {
  root: string; inventory: readonly Asset[]; ledger: RecordRow[]; scenario?: string;
}) {
  const definition = scenarioDefinition(scenario);
  const display = scenario === DISPLAY_SCENARIO
    ? createSyntheticDisplayData(resolve(dirname(fileURLToPath(import.meta.url)), "../..")) : null;
  const fixtures = display?.fixtures ?? definition.fixtures;
  const realRoot = realpathSync(root);
  const assets = new Map(inventory.map((item) => [item.path, item]));
  if (assets.size !== inventory.length || !assets.has("index.html")) throw new Error("PREVIEW_INVENTORY_INVALID");
  for (const pin of display?.assetPins ?? []) {
    if (assets.get(pin.path.slice(1))?.sha256 !== pin.sha256) throw new Error("DISPLAY_ASSET_PIN_MISMATCH");
  }
  let origin = "";
  const counters = { resolve404: 0, refused: 0, unexpected: 0, credentialAttempts: 0,
    readOnlyGET: Object.fromEntries([...Object.keys(fixtures), ...(display ? [DISPLAY_CATALOG_PATH] : [])].map((path) => [path, 0])) as Record<string, number> };
  const catalogQueries: Array<{ query: unknown; responseSha256: string; total: number }> = [];
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
    ledger.push({ method: req.method ?? "", target: scenario === PARTNER_COMPONENT_SCENARIO
      ? partnerSafeNetworkTarget(req.url ?? '',origin,new Set(assets.keys())) : safeNetworkUrl(req.url ?? ""), kind, status,
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
      if (kind.kind === "readonly_fixture" || kind.kind === "catalog_fixture") {
        req.resume();
        if (req.headers.origin && req.headers.origin !== origin
          || req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(String(req.headers["sec-fetch-site"]))) {
          counters.refused++;
          return answer(req, res, "refused_readonly_origin", 403, "");
        }
        if (kind.kind === "catalog_fixture" && (!display || catalogQueries.length >= 40)) throw new Error("DISPLAY_QUERY_LIMIT");
        const fixture = kind.kind === "catalog_fixture"
          ? { status: 200, body: displayCatalogPage(kind.query, display!.items) }
          : fixtures[kind.path as keyof typeof fixtures];
        if (kind.kind === "catalog_fixture") catalogQueries.push({ query: kind.query,
          responseSha256: hash(JSON.stringify(fixture.body)), total: (fixture.body as { total: number }).total });
        counters.readOnlyGET[kind.path]++;
        return answer(req, res, display ? "SYNTHETIC_DISPLAY_FIXTURE_NOT_REAL_AUTH_ASSENT_CONTACT" : scenario === PARTNER_COMPONENT_SCENARIO
          ? 'DEV_ONLY_INERT_BOOTSTRAP_NOT_REAL_AUTH' : "STATIC_READONLY_UNAVAILABLE_FIXTURE", fixture.status, JSON.stringify(fixture.body), {
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
      if (kind.kind === "partner_document") {
        // DEV component HTML fixture only, never production gallery admission.
        const document = buildRawHttpDocumentResponse({ requestTarget: req.url!, templateHtml: template });
        return answer(req, res, "DEV_ONLY_COMPONENT_DOCUMENT_NOT_PRODUCTION_ROUTE_PROOF", 200, document.html, { ...document.headers,
          "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" });
      }
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
    origin, counters, displayReceipt: display?.receipt ?? null, displayExpectations: display?.expectations ?? null,
    fixtureReceipts() { return Object.entries(fixtures).map(([path, fixture]) => ({ path, status: fixture.status,
      responseSha256: hash(JSON.stringify(fixture.body)), count: counters.readOnlyGET[path] })); },
    catalogQueryReceipts() { return catalogQueries.map((entry) => ({ ...entry })); },
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
