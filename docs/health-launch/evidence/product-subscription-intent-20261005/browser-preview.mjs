// Run only in the coordinator's serialized browser slot. Loopback only;
// imports no application boot, .env, production composition or managed SDK.
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const here = resolve("docs/health-launch/evidence/product-subscription-intent-20261005");
const out = await mkdtemp(join(tmpdir(), "xenios-subscription-proof-"));
const browserBuild = await build({ entryPoints: [join(here, "browser-fixture.tsx")], bundle: true, outfile: join(out, "client.js"),
  platform: "browser", format: "iife", jsx: "automatic", metafile: true, define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "synthetic-auth-only", setup(builder) {
    builder.onResolve({ filter: /supabaseBrowser$/ }, () => ({ path: "synthetic-auth", namespace: "isolated" }));
    builder.onLoad({ filter: /.*/, namespace: "isolated" }, () => ({ contents: `
      const unavailable=()=>{throw new Error("Real Auth is not connected in this fixture")};
      export const clearPersistedRecoverySession=unavailable, getSupabaseBrowser=unavailable,
        isRecoveryAccessToken=unavailable, revokeRecoverySession=unavailable;` }));
  } }] });
if (Object.keys(browserBuild.metafile.inputs).some(file => file.includes("@supabase"))) throw new Error("Managed SDK must not enter the preview.");
await build({ entryPoints: [join(here, "browser-service.ts")], bundle: true, outfile: join(out, "service.mjs"),
  platform: "node", format: "esm" });
const domain = await import(pathToFileURL(join(out, "service.mjs")).href);
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic subscription proof</title><style>
body{font:16px/1.5 system-ui,sans-serif;margin:32px auto;padding:0 20px;max-width:760px;color:#191919;background:#fafafa}h1{font-size:24px}h2{font-size:21px}.card{padding:24px;border:1px solid #bbb;background:white}p{overflow-wrap:anywhere}fieldset{border:0;padding:0;min-width:0}label,select,input[type=number]{display:block;margin-top:12px}input[type=number],select{font:inherit;max-width:100%;padding:8px;box-sizing:border-box}input[type=checkbox]{margin-right:8px}button,.btn{display:inline-block;font:inherit;padding:12px 16px;margin-top:16px;background:#151515;color:white;border:0;text-decoration:none}button:disabled{opacity:.45}.mt-4{margin-top:16px}[role=alert]{border-left:3px solid #555;padding-left:12px}
</style></head><body><div id="root"></div><script src="/client.js"></script></body></html>`;
const server = createServer(async (req, res) => {
  const send = (status, value) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(value)); };
  try {
    if (req.method === "GET" && req.url === "/client.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(await readFile(join(out, "client.js"))); return; }
    if (req.method === "GET" && req.url === "/proof") { send(200, await domain.proof()); return; }
    if (req.method === "GET" && req.url === "/api/research/member/products/synthetic-product") { send(200, domain.detail); return; }
    if (req.method === "GET" && req.url === "/research/member/subscriptions") {
      const snapshot = JSON.stringify((await domain.proof()).subscriptions, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
      res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      res.end(`<h1>Synthetic read-only record inspection</h1><p>This is fixture evidence, not the real subscription management page.</p><pre>${snapshot}</pre>`); return;
    }
    if (req.method === "GET" && (req.url === "/" || req.url?.startsWith("/?mode=") || req.url === "/research/member/products/synthetic-product?mode=mounted")) { res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }); res.end(html); return; }
    if (req.method !== "POST" || req.url !== "/api/research/subscriptions") { send(404, { ok: false }); return; }
    if (req.headers.authorization !== "Bearer synthetic-browser-customer") { send(401, { ok: false }); return; }
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (req.headers.origin !== origin) { send(403, { ok: false, code: "forbidden" }); return; }
    const referer = new URL(req.headers.referer ?? origin);
    if (referer.origin !== origin) { send(403, { ok: false, code: "forbidden" }); return; }
    const mode = referer.searchParams.get("mode") ?? "pending";
    if (!["pending", "blocked", "lost"].includes(mode)) { send(400, { ok: false, code: "subscription_action_invalid" }); return; }
    let body = "";
    for await (const part of req) { body += part; if (body.length > 2048) { send(413, { ok: false }); return; } }
    const input = JSON.parse(body);
    if (Object.keys(input).sort().join(",") !== "frequencyDays,priceVersion,quantity,sku") { send(400, { ok: false, code: "subscription_action_invalid" }); return; }
    const result = await domain.create(mode, input);
    await writeFile(join(here, "browser-domain-proof.json"), JSON.stringify(await domain.proof(), null, 2) + "\n");
    if (mode === "lost") { send(503, { ok: false, code: "synthetic_reply_unavailable" }); return; }
    send(result.ok ? 200 : 403, result);
  } catch { if (!res.headersSent) send(500, { ok: false }); else res.end(); }
});
server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, outputDirectory: out })));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
