const state = {
  token: "",
  routes: [],
  sourceFiles: [],
  actionPoll: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
const short = (value, size = 12) => value && value !== "unavailable" ? value.slice(0, size) : "unavailable";

async function getJson(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(toast.timeout);
  toast.timeout = window.setTimeout(() => node.classList.remove("show"), 4200);
}

function pill(value, tone = "") {
  return `<span class="status-pill ${tone}">${escapeHtml(value)}</span>`;
}

function renderStatus(data) {
  const { status, actions } = data;
  $("#generated-at").textContent = `Updated ${new Date(status.generatedAt).toLocaleString()}`;
  const modeTone = status.app.online ? (status.app.mode === "FULL_SERVER" ? "good" : "warn") : "bad";
  const metrics = [
    ["Branch", status.branch, status.dirty ? `${status.dirtyCount} working-tree change(s)` : "Working tree clean"],
    ["Commit", short(status.sha), `Tree ${short(status.tree)}`],
    ["Toolchain", status.runtime.compatible ? "PINNED" : "MISMATCH", `Node ${status.runtime.nodeVersion} · npm ${status.runtime.npmVersion}`],
    ["Local website", status.app.online ? "ONLINE" : "OFFLINE", `${status.app.url} · ${status.app.mode}`],
    ["Local API", status.app.apiOnline ? "AVAILABLE" : "UNAVAILABLE", status.app.apiOnline ? "Health check passed" : "Client-only or stopped"],
    ["Checkout", status.checkout.nativeStatus, status.checkout.reason],
    ["Catalog units", String(status.checkout.catalogCounts.total), `As of ${status.checkout.catalogAsOf || "unknown"}`],
    ["Control", "ONLINE", status.controlUrl],
    ["Production", "LINK ONLY", status.productionUrl],
  ];
  $("#overview-grid").innerHTML = metrics.map(([label, value, detail], index) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${index === 2 ? pill(value, modeTone) : escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");

  const actualClientOnly = status.app.mode === "CLIENT_ONLY";
  $("#overview-alert").innerHTML = actualClientOnly
    ? `<div class="alert"><strong>Client-only local mode.</strong><span>${escapeHtml(status.app.limitations)}</span></div>`
    : !status.environment.serverReady
      ? `<div class="alert"><strong>Helper full-server prerequisites unavailable.</strong><span>A helper restart will select CLIENT_ONLY because ${escapeHtml(status.environment.missingNames.join(" and "))} are absent from the control process. The current app is ${escapeHtml(status.app.mode)} and its API probe is ${status.app.apiOnline ? "responding" : "unavailable"}. Values are never displayed.</span></div>`
      : `<div class="alert ok"><strong>Full local server prerequisites detected.</strong><span>Presence only was checked; no environment value is exposed.</span></div>`;
  $("#website-mode").innerHTML = status.app.online
    ? `<p class="callout">Local app is ${pill(status.app.mode, modeTone)} ${escapeHtml(status.app.limitations || "Open routes below in a separate browser tab.")}</p>`
    : `<p class="alert"><strong>Local website is offline.</strong><span>Use START_XENIOS.ps1 from the repository or the safe restart action if this helper started it.</span></p>`;
  $("#repo-path").textContent = status.repoRoot;

  const counts = status.checkout.catalogCounts;
  $("#checkout-summary").innerHTML = `${pill(status.checkout.nativeStatus, status.checkout.nativeStatus === "DARK" ? "good" : "warn")}<p>${escapeHtml(status.checkout.reason)}</p><div class="counts"><div class="count"><strong>${counts.directBuy}</strong><span>DIRECT BUY</span></div><div class="count"><strong>${counts.assistedOrder}</strong><span>ASSISTED</span></div><div class="count"><strong>${counts.careRequired}</strong><span>CARE</span></div><div class="count"><strong>${counts.unavailable}</strong><span>UNAVAILABLE</span></div></div>`;

  const latest = actions.lastAction;
  const active = actions.activeAction;
  $("#last-action").innerHTML = active
    ? `${pill("RUNNING", "warn")}<h3>${escapeHtml(active.label)}</h3><p>Started ${new Date(active.startedAt).toLocaleString()}</p>`
    : latest
      ? `${pill(latest.status, latest.status === "passed" ? "good" : "bad")}<h3>${escapeHtml(latest.label)}</h3><p>${escapeHtml(latest.finishedAt ? new Date(latest.finishedAt).toLocaleString() : "Not finished")}</p>`
      : `<p>No bounded action has run in this workspace.</p>`;
  renderAction(actions);
  setActionDisabled(Boolean(active));
  if (active) startActionPolling(); else stopActionPolling();
}

function renderAction(actions) {
  const action = actions.activeAction || actions.lastAction;
  const status = $("#action-state");
  const output = $("#action-output");
  if (!action) {
    status.textContent = "Idle";
    status.className = "status-pill";
    return;
  }
  status.textContent = action.status;
  status.className = `status-pill ${action.status === "passed" ? "good" : action.status === "running" ? "warn" : "bad"}`;
  output.textContent = action.outputTail || `${action.label} is running. Output will appear after the bounded command exits.`;
}

function renderRoutes() {
  const query = $("#route-filter").value.trim().toLowerCase();
  const rows = state.routes.filter((route) => Object.values(route).some((value) => String(value).toLowerCase().includes(query)));
  $("#routes-body").innerHTML = rows.map((route) => `<tr><td><a href="http://127.0.0.1:5000${encodeURI(route.path)}" target="_blank" rel="noreferrer">${escapeHtml(route.path)}</a></td><td>${escapeHtml(route.audience)}</td><td>${escapeHtml(route.auth)}</td><td>${escapeHtml(route.checkout)}</td><td>${pill(route.status, route.status === "Implemented" ? "good" : "warn")}</td><td>${escapeHtml(route.note)}</td></tr>`).join("");
}

async function refreshStatus(showToast = false) {
  const data = await getJson("/api/status");
  renderStatus(data);
  if (showToast) toast("Control snapshot refreshed.");
}

async function refreshLaunch() {
  const data = await getJson("/api/launch");
  $("#launch-checklist").innerHTML = data.checklist.map((item) => `<article class="check-item ${item.complete ? "complete" : ""}"><span class="check-icon">${item.complete ? "✓" : "·"}</span><div><strong>${escapeHtml(item.label)}</strong>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}</div>${pill(item.complete ? "READY" : item.source === "disabled" ? "DISABLED" : "PENDING", item.complete ? "good" : item.source === "disabled" ? "bad" : "warn")}</article>`).join("");
}

async function refreshFactory() {
  const unavailable = () => {
    $("#factory-status").textContent = "Current qualified export unavailable. Evidence and worker readiness remain unknown.";
    $("#factory-source").textContent = "No controller revision or authoritative timestamp was established.";
    $("#factory-claims").textContent = "Unknown; no claim counts established.";
    $("#factory-runtime").textContent = "Unknown; local access is not worker authentication.";
    $("#factory-native").textContent = "No current native observation source established.";
    $("#factory-findings").textContent = "Obtain a qualified coherent export through the existing controller. This read does not repair or initialize it.";
  };
  try {
    const response = await fetch("/api/factory/assurance", { cache: "no-store" });
    const body = await response.json();
    const report = body.assurance;
    if (!response.ok || !body.ok || report?.availability !== "published"
      || report.mode !== "advisory" || report.authority !== "none") { unavailable(); return; }
    const tone = value => value === "supported" ? "good" : value === "unsupported" ? "bad" : "warn";
    $("#factory-status").textContent = `Advisory assessment of supplied evidence. Source freshness: ${report.source.freshness}. No release or worker authority is granted.`;
    $("#factory-source").innerHTML = `<article class="workspace-strip"><div><span>Controller ${escapeHtml(report.source.controllerId)} · revision ${escapeHtml(report.source.revision)}</span><code>${escapeHtml(report.source.sourceSha)}</code><small>Captured ${escapeHtml(report.source.capturedAt)} · published ${escapeHtml(report.source.publishedAt)}</small><small>${report.source.registries.map(row => `${escapeHtml(row.name)} authority timestamp: ${escapeHtml(row.authoritativeAsOf ?? "unknown")}`).join(" · ")}</small></div></article>`;
    $("#factory-claims").innerHTML = `<p>${report.counts.supported} supported · ${report.counts.unsupported} unsupported · ${report.counts.unknown} unknown</p>`
      + (report.claims.length ? `<ul class="plain-list">${report.claims.map(row => `<li>${escapeHtml(row.id ?? "Invalid identifier")} ${pill(row.verdict, tone(row.verdict))}</li>`).join("")}</ul>` : "<p>No evidence claims supplied. This does not establish successful work.</p>")
      + (report.claimsTruncated ? `<p>Showing ${report.claims.length} of ${report.claimCount} claims.</p>` : "");
    $("#factory-runtime").innerHTML = report.runtime.length
      ? `<ul class="plain-list">${report.runtime.map(row => `<li>${escapeHtml(row.id ?? "Invalid identifier")} ${pill(row.readiness, row.readiness === "ready" ? "good" : "warn")}</li>`).join("")}</ul><p>Readiness reflects supplied observations, not an authentication performed by this page.</p>${report.runtimeTruncated ? `<p>Showing ${report.runtime.length} of ${report.runtimeCount} runtime records.</p>` : ""}`
      : "<p>No runtime evidence supplied; authentication and execution remain unknown.</p>";
    const native = report.native;
    $("#factory-native").innerHTML = native?.availability === "observation_only"
      ? `<p>Observed export ${escapeHtml(native.observedAt)}. File last changed ${escapeHtml(native.fileModifiedAt ?? "unknown")}. Coverage: ${escapeHtml(native.coverage)}.</p><ul class="plain-list">${native.observations.map(row => `<li>${escapeHtml(row.task)} · ${escapeHtml(row.seat)} · last reported ${escapeHtml(row.reportedState)} at ${escapeHtml(row.lastObservedAt)}</li>`).join("")}</ul>${native.truncated ? `<p>Showing ${native.observations.length} of ${native.observationCount} observations.</p>` : ""}<p>Current authentication and native execution remain unknown. Reported times are operator observations, not continuous process proof.</p>`
      : "<p>Native observation export unavailable. Current authentication and execution remain unknown.</p>";
    $("#factory-findings").innerHTML = report.findings.length
      ? `<ul class="plain-list">${report.findings.map(row => `<li>${escapeHtml(row.code)} · ${escapeHtml(row.subjectId ?? "unidentified record")}</li>`).join("")}</ul>${report.findingsTruncated ? `<p>Showing ${report.findings.length} of ${report.findingCount} findings.</p>` : ""}`
      : "<p>No findings in the supplied evidence. This is not a claim that the factory is live or complete.</p>";
  } catch { unavailable(); }
}

async function refreshLogs() {
  const data = await getJson("/api/logs");
  $("#logs-output").textContent = data.log || "No helper-managed logs exist yet.";
}

async function refreshGit() {
  const data = await getJson("/api/git");
  $("#git-status").textContent = data.git.status || "Working tree is clean.";
  $("#git-log").textContent = data.git.commits || "No commit history available.";
}

async function refreshSource() {
  const query = encodeURIComponent($("#source-filter").value.trim());
  const data = await getJson(`/api/source?q=${query}`);
  state.sourceFiles = data.files;
  $("#source-files").innerHTML = data.files.length
    ? data.files.map((file) => `<button class="file-button" data-file="${escapeHtml(file)}">${escapeHtml(file)}</button>`).join("")
    : `<p class="quiet" style="padding:12px">No safe tracked text files match.</p>`;
}

async function openSource(file, button) {
  $$(".file-button.active").forEach((node) => node.classList.remove("active"));
  button.classList.add("active");
  const data = await getJson(`/api/source/file?path=${encodeURIComponent(file)}`);
  $("#source-name").textContent = `${data.source.path} · ${data.source.size.toLocaleString()} bytes`;
  $("#source-content").textContent = data.source.content.split(/\r?\n/u).map((line, index) => `${String(index + 1).padStart(5, " ")}  ${line}`).join("\n");
}

async function runAction(id) {
  if (!state.token) throw new Error("Control token is unavailable; refresh the page.");
  setActionDisabled(true);
  try {
    const data = await getJson(`/api/actions/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "X-Xenios-Control-Token": state.token },
    });
    toast(id === "refresh" ? "Control snapshot refreshed." : `${data.action?.label || id} started.`);
    await refreshStatus();
  } catch (error) {
    setActionDisabled(false);
    throw error;
  }
}

function setActionDisabled(disabled) {
  $$('[data-action]:not([data-action="refresh"])').forEach((button) => { button.disabled = disabled; });
}

function startActionPolling() {
  if (state.actionPoll) return;
  state.actionPoll = window.setInterval(async () => {
    try { await refreshStatus(); await refreshLaunch(); } catch { /* transient local restart */ }
  }, 2000);
}

function stopActionPolling() {
  if (state.actionPoll) window.clearInterval(state.actionPoll);
  state.actionPoll = null;
}

function selectTab(tabName) {
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $$(".panel").forEach((panel) => {
    panel.hidden = panel.id !== tabName;
    panel.classList.toggle("active", panel.id === tabName);
  });
  if (tabName === "logs") void refreshLogs().catch(showError);
  if (tabName === "git") void refreshGit().catch(showError);
  if (tabName === "launch") void refreshLaunch().catch(showError);
  if (tabName === "factory") void refreshFactory();
  if (tabName === "source" && !state.sourceFiles.length) void refreshSource().catch(showError);
}

function showError(error) { toast(error.message || "The local control request failed."); }

async function initialize() {
  const bootstrap = await getJson("/api/bootstrap");
  state.token = bootstrap.csrfToken;
  const routes = await getJson("/api/routes");
  state.routes = routes.routes;
  renderRoutes();
  await Promise.all([refreshStatus(), refreshLaunch()]);
}

$("#clock").textContent = new Date().toLocaleTimeString();
window.setInterval(() => { $("#clock").textContent = new Date().toLocaleTimeString(); }, 1000);
$$(".tab").forEach((tab) => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));
$$('[data-action]').forEach((button) => button.addEventListener("click", () => runAction(button.dataset.action).catch(showError)));
$("#route-filter").addEventListener("input", renderRoutes);
$("#refresh-logs").addEventListener("click", () => refreshLogs().catch(showError));
$("#refresh-factory").addEventListener("click", () => { void refreshFactory(); });
$("#copy-repo-path").addEventListener("click", async () => {
  const value = $("#repo-path").textContent;
  try {
    await navigator.clipboard.writeText(value);
    toast("Resolved worktree path copied.");
  } catch {
    toast("Clipboard unavailable; the full worktree path remains visible.");
  }
});
$("#source-filter").addEventListener("input", () => {
  window.clearTimeout(state.sourceTimer);
  state.sourceTimer = window.setTimeout(() => refreshSource().catch(showError), 180);
});
$("#source-files").addEventListener("click", (event) => {
  const button = event.target.closest("[data-file]");
  if (button) void openSource(button.dataset.file, button).catch(showError);
});

void initialize().catch(showError);
