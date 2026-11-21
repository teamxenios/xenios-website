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

/** Private diagnostic text only: six160-char ASCII lines, below2KB serialized. */
export function chromeStartupExcerpt(text) {
  const lines = [];
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
    // Omit the WHOLE suspicious line: replacing only a label can expose a
    // short whitespace-delimited value ("password p7", "cookie sid=x").
    if (/\b(?:[A-Za-z0-9_-]*(?:password|passwd|secret|token|cookie|session|credential|auth)[A-Za-z0-9_-]*|(?:api|access|refresh|private|public)[ _-]*key|key|sid|jwt)\b/i.test(line)) line = "[OMITTED_SENSITIVE_DIAGNOSTIC]";
    else if (/\b(?:argv|command.?line|environment|environ)\b|(?:^|\s)--[a-z0-9]/i.test(line)
      || /(?:^|\s)[A-Z_][A-Z0-9_]*\s*=/.test(line)) line = "[OMITTED_PROCESS_METADATA]";
    else line = line
      .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[PATH]")
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "[URL]")
      .replace(/\b(?:data|blob|file|unix|tcp|chrome):[^\s"'<>]+/gi, "[URL]")
      .replace(/\/devtools\/(?:browser|page)\/[^\s"'<>]+/gi, "[DEBUG]")
      .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED]")
      .replace(/\b[A-Za-z0-9_-]*(?:authorization|cookie|password|passwd|secret|token|session|credential|api[_-]?key|auth)[A-Za-z0-9_-]*\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "[REDACTED]")
      .replace(/\b(?:authorization|cookie|password|passwd|secret|token|access[_-]?token|refresh[_-]?token|session[_-]?(?:id|key)|api[_-]?key|credential|auth|key|code)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "[REDACTED]")
      .replace(/\b[A-Z_][A-Z0-9_]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/g, "[REDACTED]")
      .replace(/--[a-z0-9][a-z0-9-]*(?:=[^\s"'<>]+)?/gi, "[ARG]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]")
      .replace(/\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*){0,2}/g, "[REDACTED]")
      .replace(/\b[A-Za-z0-9_-]*(?:secret|password|credential|token)[A-Za-z0-9_-]*\b/gi, "[REDACTED]")
      .replace(/\/[A-Za-z0-9._~+%:-]+(?:\/[A-Za-z0-9._~+%:-]+)+/g, "[PATH]")
      .replace(/\b[A-Za-z0-9_=-]{24,}\b/g, "[REDACTED]");
    lines.push(line.replace(/[^\x20-\x7e]/g, "?").slice(0, 160));
    if (lines.length === 6) break;
  }
  return lines;
}

/** Only the captured child's numeric/proc state, never cmdline or environment. */
function ownedProcessObservation(child) {
  const base = { pid: child.pid ?? null, exitCode: child.exitCode, signalCode: child.signalCode };
  if (process.platform !== "linux" || !Number.isInteger(child.pid)) return { ...base, available: false, reason: "PROC_UNAVAILABLE" };
  if (child.exitCode !== null || child.signalCode !== null) return { ...base, available: false, reason: "CHILD_EXIT_OBSERVED" };
  try {
    const raw = readFileSync(`/proc/${child.pid}/stat`, "utf8");
    const fields = raw.slice(raw.lastIndexOf(")") + 2).trim().split(/\s+/);
    const row = { ...base, available: true, state: /^[A-Za-z]$/.test(fields[0]) ? fields[0] : null,
      parentPid: /^\d+$/.test(fields[1]) ? Number(fields[1]) : null,
      startTicks: /^\d+$/.test(fields[19]) ? fields[19] : null, threads: null, rssKiB: null, waitChannel: null };
    try {
      const status = readFileSync(`/proc/${child.pid}/status`, "utf8");
      row.threads = Number(/^Threads:\s*(\d+)/m.exec(status)?.[1]) || null;
      const rss = /^VmRSS:\s*(\d+)\s+kB/m.exec(status)?.[1];
      row.rssKiB = rss === undefined ? null : Number(rss);
    } catch {}
    try {
      const wchan = readFileSync(`/proc/${child.pid}/wchan`, "utf8").trim();
      row.waitChannel = /^[A-Za-z0-9_.-]{1,80}$/.test(wchan) ? wchan : null;
    } catch {}
    return row;
  } catch (error) {
    return { ...base, available: false, reason: ["ENOENT", "EACCES", "EPERM"].includes(error.code) ? error.code : "PROC_READ_FAILED" };
  }
}

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
  onPoll,
}) {
  const started = now();
  while (now() - started < timeoutMs) {
    onPoll?.();
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
  let launcherRequestedTermination = false, ownerCloseRequested = false, observationIndex = 0;
  const observationTimes = [0, 1000, 5000, 15000, 30000, 45000], startupObservations = [];
  const observeStartup = (label, force = false) => {
    const elapsedMs = Date.now() - started;
    if (!onSpawned || startupObservations.length >= 8 || !force && elapsedMs < (observationTimes[observationIndex] ?? Infinity)) return;
    if (!force) observationIndex++;
    startupObservations.push({ label, elapsedMs, ...ownedProcessObservation(child) });
  };
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
    sanitizedStderrExcerpt: chromeStartupExcerpt(stderr.toString("utf8")),
    startupObservations: startupObservations.map((row) => ({ ...row })), launcherRequestedTermination, ownerCloseRequested,
    portPublished, elapsedMs: Date.now() - started });
  const owner = Object.freeze({ process: child, userDataDir, chromePath: found.path, revision: found.revision, diagnostics,
    async close() {
      ownerCloseRequested = true;
      try { child.kill(); } catch {}
      await new Promise((r) => setTimeout(r, 200));
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    },
  });
  // This callback deliberately runs before the first await: a caller retains
  // real cleanup custody even when readiness or the version request rejects.
  if (onSpawned) {
    observeStartup("spawned");
    try { onSpawned(owner); } catch {
      outcome = "CALLBACK_FAILED";
      await owner.close();
      throw new Error("CHROME_LIFECYCLE_CALLBACK_FAILED");
    }
  }

  const portFile = join(userDataDir, "DevToolsActivePort");
  let port;
  try { port = await waitForDevToolsPort({ child, portFile, timeoutMs,
    ...(onSpawned ? { onPoll: () => observeStartup("readiness_wait") } : {}) }); } catch (error) {
    observeStartup("readiness_read_failed", true);
    outcome = "CHROME_DEVTOOLS_PORT_READ_FAILED";
    portReadCode = ["EACCES", "ENOENT", "EIO", "EINVAL"].includes(error.code) ? error.code : "OTHER";
    if (onSpawned) throw new Error(outcome);
    throw error;
  }
  observeStartup("readiness_result_before_cleanup", true);
  if (!port) {
    outcome = spawnCode ? "CHROME_SPAWN_FAILED" : child.exitCode !== null || child.signalCode !== null
      ? "CHROME_EXIT_BEFORE_DEVTOOLS" : "CHROME_DEVTOOLS_TIMEOUT";
    launcherRequestedTermination = true; child.kill();
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
