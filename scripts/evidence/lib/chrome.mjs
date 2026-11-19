// Locate and launch a host Chromium build over the Chrome DevTools Protocol.
//
// No Playwright / Puppeteer package exists in the private node_modules and the
// helper rules forbid installs, so the evidence tooling drives Chromium with the
// raw protocol using the `ws` package the repo already depends on. Browsers are
// the ones Playwright already installed under %LOCALAPPDATA%\ms-playwright.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
const CAPTURED_STDERR_LIMIT = 8192;

/** Only fixed diagnostic codes survive; raw child text/URLs never enter receipts. */
export function chromeLaunchDiagnosticCodes(text) {
  const codes = [];
  for (const [code, pattern] of [
    ["SANDBOX_REJECTION_REPORTED", /No usable sandbox|Running as root without --no-sandbox|SUID sandbox helper binary.*not configured correctly/i],
    ["NAMESPACE_REJECTION_REPORTED", /Failed to move to new namespace|Failed to unshare.*(?:namespace|Operation not permitted)|namespace_sandbox.*Operation not permitted/i],
    ["SHARED_LIBRARY_MISSING_REPORTED", /error while loading shared libraries/i],
    ["PERMISSION_DENIED_REPORTED", /Permission denied/i],
    ["DISK_FULL_REPORTED", /No space left on device/i],
    ["THREAD_LIMIT_REPORTED", /pthread_create.*Resource temporarily unavailable|Failed to create.*thread/i],
    ["ADDRESS_IN_USE_REPORTED", /Address already in use/i],
    ["DBUS_DIAGNOSTIC_PRESENT", /Failed to connect to the bus|dbus.*(?:error|failed)/i],
    ["DEVTOOLS_LISTENING_REPORTED", /DevTools listening on ws:\/\/(?:127\.0\.0\.1|\[::1\])/i],
  ]) if (pattern.test(text)) codes.push(code);
  return codes;
}

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
    // Optional signalCode is absent on older test doubles; undefined is not an
    // observed exit. A real signal exit must not wait the whole port budget.
    if (child.exitCode !== null || typeof child.signalCode === "string") break;
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
export async function launchChromium({ chromePath, timeoutMs = 20000, extraArgs = [], onSpawned } = {}) {
  if (onSpawned !== undefined && typeof onSpawned !== "function") throw new Error("CHROME_LIFECYCLE_CALLBACK_INVALID");
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
  const started = Date.now(), stderrHash = createHash("sha256");
  let stderr = Buffer.alloc(0), stderrBytes = 0, spawnCode = null;
  let phase = "waiting_devtools_port", outcome = "PENDING", portPublished = false, portReadCode = null;
  child.stderr.on("data", (d) => {
    const bytes = Buffer.from(d);
    stderrBytes += bytes.length; stderrHash.update(bytes);
    if (stderr.length < CAPTURED_STDERR_LIMIT) stderr = Buffer.concat([stderr, bytes.subarray(0, CAPTURED_STDERR_LIMIT - stderr.length)]);
  });
  child.on("error", (error) => {
    spawnCode = ["ENOENT", "EACCES", "ENOMEM", "EMFILE", "ENFILE", "EAGAIN", "ENOTDIR"].includes(error.code) ? error.code : "OTHER";
  });
  const diagnostics = () => Object.freeze({ phase, outcome, childPid: child.pid ?? null,
    exitCode: child.exitCode, signalCode: child.signalCode, spawnCode, portReadCode,
    stderrBytes, capturedStderrBytes: stderr.length, stderrTruncated: stderrBytes > stderr.length,
    stderrEnded: child.stderr.readableEnded,
    stderrSha256: stderrHash.copy().digest("hex"), observedDiagnosticCodes: chromeLaunchDiagnosticCodes(stderr.toString("utf8")),
    portPublished, elapsedMs: Date.now() - started });
  const owner = Object.freeze({ process: child, userDataDir, chromePath: found.path, revision: found.revision, diagnostics,
    async close() {
      try { child.kill(); } catch {}
      await new Promise((r) => setTimeout(r, 200));
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    },
  });
  // This callback deliberately runs before the first await: a caller retains
  // real cleanup custody even when readiness or the version request rejects.
  if (onSpawned) {
    try { onSpawned(owner); } catch {
      outcome = "CALLBACK_FAILED";
      await owner.close();
      throw new Error("CHROME_LIFECYCLE_CALLBACK_FAILED");
    }
  }

  const portFile = join(userDataDir, "DevToolsActivePort");
  let port;
  try { port = await waitForDevToolsPort({ child, portFile, timeoutMs }); } catch (error) {
    outcome = "CHROME_DEVTOOLS_PORT_READ_FAILED";
    portReadCode = ["EACCES", "ENOENT", "EIO", "EINVAL"].includes(error.code) ? error.code : "OTHER";
    if (onSpawned) throw new Error(outcome);
    throw error;
  }
  if (!port) {
    outcome = spawnCode ? "CHROME_SPAWN_FAILED" : child.exitCode !== null || child.signalCode !== null
      ? "CHROME_EXIT_BEFORE_DEVTOOLS" : "CHROME_DEVTOOLS_TIMEOUT";
    child.kill();
    if (onSpawned) throw new Error(outcome);
    throw new Error(`Chromium did not expose a DevTools port within ${timeoutMs} ms. stderr: ${stderr.toString("utf8").slice(0, 800)}`);
  }
  portPublished = true; phase = "reading_browser_version";
  let version;
  try {
    const options = onSpawned ? { signal: AbortSignal.timeout(Math.max(1, timeoutMs - (Date.now() - started))) } : undefined;
    version = await fetch(`http://127.0.0.1:${port}/json/version`, options).then((r) => r.json());
  } catch (error) {
    outcome = "CHROME_VERSION_ENDPOINT_FAILED";
    if (onSpawned) throw new Error(outcome);
    throw error;
  }
  phase = "ready"; outcome = "READY";
  return {
    ...owner,
    port,
    wsUrl: version.webSocketDebuggerUrl,
    browserName: "chromium",
    browserVersion: String(version.Browser ?? "")
      .replace(/^HeadlessChrome\//, "")
      .replace(/^Chrome\//, ""),
    protocolVersion: version["Protocol-Version"],
  };
}
