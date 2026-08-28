// Locate and launch a host Chromium build over the Chrome DevTools Protocol.
//
// No Playwright / Puppeteer package exists in the private node_modules and the
// helper rules forbid installs, so the evidence tooling drives Chromium with the
// raw protocol using the `ws` package the repo already depends on. Browsers are
// the ones Playwright already installed under %LOCALAPPDATA%\ms-playwright.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATE_RELATIVE = [
  "chrome-win64/chrome.exe",
  "chrome-win/chrome.exe",
  "chrome-linux/chrome",
  "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
];

export function playwrightBrowsersRoot() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (process.platform === "darwin") return join(process.env.HOME ?? "", "Library", "Caches", "ms-playwright");
  return join(process.env.HOME ?? "", ".cache", "ms-playwright");
}

/** Deterministic: the highest-numbered `chromium-<rev>` directory that holds a binary. */
export function findChromium(root = playwrightBrowsersRoot()) {
  if (process.env.XR_EVIDENCE_CHROME && existsSync(process.env.XR_EVIDENCE_CHROME)) {
    return { path: process.env.XR_EVIDENCE_CHROME, revision: "env" };
  }
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root)
    .map((name) => ({ name, m: /^chromium-(\d+)$/.exec(name) }))
    .filter((d) => d.m)
    .sort((a, b) => Number(b.m[1]) - Number(a.m[1]));
  for (const d of dirs) {
    for (const rel of CANDIDATE_RELATIVE) {
      const p = join(root, d.name, rel);
      if (existsSync(p)) return { path: p, revision: d.m[1] };
    }
  }
  return null;
}

/**
 * Launch headless Chromium with an ephemeral profile and return
 * { process, port, wsUrl, browserName, browserVersion, close() }.
 */
export async function launchChromium({ chromePath, timeoutMs = 20000 } = {}) {
  const found = chromePath ? { path: chromePath, revision: "arg" } : findChromium();
  if (!found) {
    throw new Error(
      "No host Chromium found. Expected %LOCALAPPDATA%\\ms-playwright\\chromium-<rev>\\chrome-win64\\chrome.exe or XR_EVIDENCE_CHROME.",
    );
  }
  const userDataDir = mkdtempSync(join(tmpdir(), "xr-evidence-chrome-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-features=Translate,OptimizationHints,MediaRouter",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1440,900",
    "about:blank",
  ];
  const child = spawn(found.path, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += String(d)));

  const portFile = join(userDataDir, "DevToolsActivePort");
  const started = Date.now();
  let port = null;
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) break;
    if (existsSync(portFile)) {
      const text = readFileSync(portFile, "utf8").trim();
      const first = text.split(/\r?\n/)[0];
      if (/^\d+$/.test(first)) {
        port = Number(first);
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!port) {
    child.kill();
    throw new Error(`Chromium did not expose a DevTools port within ${timeoutMs} ms. stderr: ${stderr.slice(0, 800)}`);
  }
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
  return {
    process: child,
    port,
    userDataDir,
    chromePath: found.path,
    revision: found.revision,
    wsUrl: version.webSocketDebuggerUrl,
    browserName: "chromium",
    browserVersion: String(version.Browser ?? "")
      .replace(/^HeadlessChrome\//, "")
      .replace(/^Chrome\//, ""),
    protocolVersion: version["Protocol-Version"],
    async close() {
      try {
        child.kill();
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {}
    },
  };
}
