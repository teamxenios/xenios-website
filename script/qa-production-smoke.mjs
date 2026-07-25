import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.PRODUCTION_SMOKE_BASE_URL || process.argv[2] || "").replace(/\/$/, "");
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  console.error("Set PRODUCTION_SMOKE_BASE_URL (or pass an http(s) URL) to run non-mutating production smoke checks.");
  process.exit(2);
}

const config = JSON.parse(fs.readFileSync(path.join(root, "qa", "synthetic-monitors.json"), "utf8"));
const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || config.timeoutMs);
const results = [];

for (const check of config.checks) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "xenios-website-6-synthetic-monitor/1.0" },
    });
    const body = await response.text();
    const expectedStatuses = Array.isArray(check.status) ? check.status : [check.status];
    const failures = [];
    if (!expectedStatuses.includes(response.status)) failures.push(`status ${response.status}, expected ${expectedStatuses.join("/")}`);
    if (check.contains && !body.includes(check.contains)) failures.push(`body missing ${JSON.stringify(check.contains)}`);
    if (check.header) {
      for (const [name, expected] of Object.entries(check.header)) {
        const actual = response.headers.get(name) || "";
        if (!actual.toLowerCase().includes(String(expected).toLowerCase())) {
          failures.push(`${name}=${JSON.stringify(actual)}, expected to contain ${JSON.stringify(expected)}`);
        }
      }
    }
    results.push({
      name: check.name,
      path: check.path,
      ok: failures.length === 0,
      status: response.status,
      latencyMs: Math.round(performance.now() - started),
      failures,
    });
  } catch (error) {
    results.push({
      name: check.name,
      path: check.path,
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      failures: [error instanceof Error ? error.message : String(error)],
    });
  }
}

console.log(JSON.stringify({ baseUrl, checkedAt: new Date().toISOString(), results }, null, 2));
if (results.some((result) => !result.ok)) process.exitCode = 1;

