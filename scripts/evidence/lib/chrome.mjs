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

const RETRYABLE_DEVTOOLS_PORT_READ_ERRORS = new Set(["EBUSY", "EPERM"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait for Chromium to publish a complete DevToolsActivePort file. */
export async function waitForDevToolsPort({
  child,
  portFile,
  timeoutMs,
  pollIntervalMs = 50,
  fileExists = existsSync,
  readText = (path) => readFileSync(path, "utf8"),
  now = Date.now,
  wait = sleep,
}) {
  const started = now();
  while (now() - started < timeoutMs) {
    if (child.exitCode !== null) break;
    if (fileExists(portFile)) {
      try {
        const text = readText(portFile).trim();
        const first = text.split(/\r?\n/)[0];
        if (/^\d+$/.test(first)) return Number(first);
      } catch (error) {
        if (!RETRYABLE_DEVTOOLS_PORT_READ_ERRORS.has(error?.code)) throw error;
      }
    }
    await wait(pollIntervalMs);
  }
  return null;
}

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
export async function launchChromium({ chromePath, timeoutMs = 20000, extraArgs = [] } = {}) {
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
    // Defense in depth for protocols outside the HTTP proxy/CDP Fetch
    // boundary. The injected RTCPeerConnection constructor guard is the
    // primary pre-dispatch control; this flag additionally prevents Chromium
    // from exposing non-proxied UDP candidates if that API surface changes.
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    // Defense in depth beneath CDP interception: any external preconnect or
    // browser-internal request is sent only to a closed loopback proxy.
    "--proxy-server=http://127.0.0.1:9",
    "--disable-sync",
    "--disable-features=Translate,OptimizationHints,MediaRouter",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1440,900",
    ...extraArgs,
    "about:blank",
  ];
  const child = spawn(found.path, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += String(d)));

  const portFile = join(userDataDir, "DevToolsActivePort");
  const port = await waitForDevToolsPort({ child, portFile, timeoutMs });
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
