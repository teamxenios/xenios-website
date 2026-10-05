import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const [name, command, ...args] = process.argv.slice(2);
if (!name || !command || !/^[a-z0-9-]+$/.test(name)) throw new Error("Use a fresh evidence name and Node entrypoint.");
if (process.version !== "v20.19.0") throw new Error("This proof requires the pinned Node v20.19.0 runtime.");
const directory = resolve("docs/health-launch/evidence/product-subscription-intent-20261005");
const logPath = resolve(directory, `${name}.log`);
const resultPath = resolve(directory, `${name}.json`);
if (existsSync(logPath) || existsSync(resultPath)) throw new Error("Evidence exists; choose a new run name.");
const git = (...input) => execFileSync("git", input, { encoding: "utf8" }).trim();
const record = { node: process.version, executable: process.execPath, command: [process.execPath, command, ...args],
  source: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"), startStatus: git("status", "--short"),
  startedAt: new Date().toISOString() };
const started = Date.now();
let output = "";
const child = spawn(process.execPath, [command, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
child.stdout.on("data", data => { output += data; process.stdout.write(data); });
child.stderr.on("data", data => { output += data; process.stderr.write(data); });
child.on("error", error => { output += error.message; });
child.on("close", (code, signal) => {
  writeFileSync(logPath, output);
  writeFileSync(resultPath, JSON.stringify({ ...record, finishedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
    exitCode: code, signal, endSource: git("rev-parse", "HEAD"), logSha256: createHash("sha256").update(readFileSync(logPath)).digest("hex") }, null, 2) + "\n");
  process.exitCode = code ?? 1;
});
