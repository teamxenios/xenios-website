const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
const arr = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : '';
const human = value => text(value).replace(/[_-]/gu, ' ').replace(/^./u, c => c.toUpperCase());
const short = value => text(value) && value !== 'unavailable' ? String(value).slice(0, 12) : 'Unknown';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value) : null;
const byTime = (a, b) => (Date.parse(b.at ?? b.createdAt ?? '') || 0) - (Date.parse(a.at ?? a.createdAt ?? '') || 0);
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sessions: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M7 9l3 2-3 2m6 0h4"/>',
  work: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zm0 8h6m-6 5h6"/>',
  handoff: '<path d="M4 7h14m-4-4 4 4-4 4M20 17H6m4-4-4 4 4 4"/>',
  connections: '<path d="m9 15-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0M8 16l8-8" transform="translate(1 0) scale(.92)"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6m-5 4a8 8 0 0 0 14 5l3-3m0 6v-6h-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  send: '<path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  review: '<path d="M9 3h6v3H9zM7 4H5v17h14V4h-2M8 13l3 3 5-6"/>',
  resource: '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.1M8 17h.1m5-10h3m-3 10h3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10c0 5-12 4-12 8"/>',
  warning: '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.1"/>',
};
const icon = (name, className = '') => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.info}</svg>`;
const hydrateIcons = root => $$('[data-icon]', root).forEach(node => { node.innerHTML = icon(node.dataset.icon); });
const badge = (label, tone = '', dot = true) => `<span class="badge ${escapeHtml(tone)}">${dot ? '<span class="status-dot" aria-hidden="true"></span>' : ''}${escapeHtml(label)}</span>`;
const button = (label, command, iconName = 'arrow', variant = 'button-secondary', data = '') => `<button class="button ${variant}" data-command="${command}" ${data}>${icon(iconName)}${escapeHtml(label)}</button>`;
const entityButton = (label, kind, id) => `<button class="entity-title" data-detail="${kind}" data-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
const textButton = (label, command, data = '') => `<button class="text-button" data-command="${command}" ${data}>${escapeHtml(label)}${icon('arrow')}</button>`;

const viewInfo = {
  overview: ['Control room', 'OPERATIONS OVERVIEW', 'A clear view of the people, work and handoffs moving Xenios forward.'],
  sessions: ['Sessions', 'PEOPLE & AGENTS', 'Know who is connected, what was observed, and who owns the next step.'],
  work: ['Work queue', 'CANONICAL FACTORY BOARD', 'Follow work from ready to review, with one owner for every file set.'],
  handoffs: ['Handoffs', 'COMMUNICATION & RECEIPTS', 'Separate a recorded message from delivery, acknowledgment and a finished result.'],
  connections: ['Connections', 'CLIENTS & LOCAL BRIDGES', 'Bring Codex, Claude, Muse and Ollie into the same coordination workflow.'],
  activity: ['Activity', 'EVIDENCE TRAIL', 'A timestamped view of factory events, receiver receipts and local checks.'],
  workspace: ['Workspace & checks', 'LOCAL OPERATIONS', 'Inspect the current checkout, open routes and run existing bounded checks.'],
};

const state = {
  view: 'overview', query: '', sessionFilter: 'all', taskFilter: 'active', messageFilter: 'all',
  room: null, roomError: '', roomFetchedAt: null, status: null, statusError: '', statusFetchedAt: null,
  launch: null, launchFetchedAt: null, routes: [], factoryToken: '', cockpitToken: '', actionIds: [], appOrigin: '',
  refreshing: false, timer: null, requestStartedAt: 0, dialogReturn: null, dialogReturnKey: null, selected: null,
  handoffPending: null, handoffSent: false, handoffBusy: false, connectorBusy: false,
  connectorConfig: '', connectorInfo: null, actionBusy: false, logs: null, git: null,
};

function stamp(value, seconds = false) {
  const d = date(value);
  if (!d) return 'Not reported';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), timeZoneName: 'short' }).format(d);
}
function age(value) {
  const d = date(value);
  if (!d) return 'Not reported';
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < -30) return 'Time mismatch';
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
function gib(value, digits = 1) { return finite(value) && value >= 0 ? (value / (1024 ** 3)).toFixed(digits) : null; }
function matches(...values) { return !state.query || values.some(value => String(value ?? '').toLocaleLowerCase().includes(state.query)); }
function sessions() { return arr(state.room?.sessions); }
function tasks() { return arr(state.room?.tasks); }
function messages() { return arr(state.room?.messages); }
function leases() { return arr(state.room?.ownership); }
function sourceKnown() { return Boolean(state.room && ['authority', 'snapshot'].includes(state.room.source?.availability)); }
function sourceStale() { return Boolean(state.roomError || state.room?.source?.freshness === 'stale'); }
function canSend() { return Boolean(!state.roomError && state.factoryToken && state.room?.capabilities?.sendHandoff && state.room?.operator?.available && state.room.source?.availability === 'authority'); }
function canConfigure() { return Boolean(!state.roomError && state.factoryToken && state.room?.capabilities?.configureConnector && state.room.source?.availability === 'authority'); }
function canRevoke() { return Boolean(state.factoryToken && state.room?.capabilities?.revokeConnector); }
function safeUrl(value, { local = false } = {}) {
  try {
    const url = new URL(value, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (local && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}
function providerOf(value) {
  const name = text(value).toLowerCase();
  if (name.includes('claude')) return 'claude';
  if (name.includes('codex') || name.includes('openai')) return 'codex';
  if (name.includes('muse')) return 'muse';
  if (name.includes('ollie')) return 'ollie';
  return 'generic';
}
function providerLabel(provider) { return ({ codex: 'Codex', claude: 'Claude Code', muse: 'Muse', ollie: 'Ollie', generic: 'Other clients' })[provider] ?? human(provider); }
function avatar(tool, label = '') { const provider = providerOf(tool); return `<span class="entity-avatar ${provider}" aria-hidden="true">${escapeHtml(({ codex: '›_', claude: '✳', muse: 'm', ollie: 'o', generic: (label || 'S').slice(0, 1).toUpperCase() })[provider])}</span>`; }
function connectionInfo(value) {
  if (state.roomError) return ['Snapshot only', 'warn'];
  return ({ connected: ['Bridge connected', 'good'], current: ['Bridge connected', 'good'], stale: ['Bridge stale', 'warn'], offline: ['Offline', ''], not_configured: ['Not connected', ''], configured: ['Awaiting heartbeat', 'info'], expired: ['Credential expired', 'warn'], revoked: ['Revoked', ''], unknown: ['Not observed', ''] })[value] ?? ['Not observed', ''];
}
function workInfo(value, connection) {
  if (state.roomError || !['connected', 'current'].includes(connection)) return ['Work unverified', ''];
  return ({ running: ['Working', 'good'], waiting_review: ['Awaiting review', 'info'], blocked: ['Blocked', 'warn'], idle: ['Idle', ''], unknown: ['Work unverified', ''] })[value] ?? ['Work unverified', ''];
}
function taskInfo(value) { return ({ ready: ['Ready', ''], claimed: ['Owned', 'info'], qa: ['In review', 'warn'], done: ['Accepted', 'good'], blocked: ['Blocked', 'bad'], backlog: ['Backlog', ''] })[value] ?? [human(value) || 'Unknown', '']; }
function receiptInfo(value) { return ({ recorded: ['Recorded', ''], delivered: ['Delivered', 'info'], acknowledged: ['Acknowledged', 'good'], working: ['Working', 'good'], result_submitted: ['Result submitted', 'info'] })[value] ?? ['Receipt unknown', '']; }
function connectionRows() {
  const actual = arr(state.room?.connections);
  return ['codex', 'claude', 'muse', 'ollie'].map(provider => actual.find(row => providerOf(row.provider) === provider) ?? {
    id: provider, provider, label: providerLabel(provider), state: 'not_configured', capabilities: [], sessionIds: [], lastObservedAt: null,
    description: 'No verified local bridge has reported for this client.',
  }).concat(actual.filter(row => !['codex', 'claude', 'muse', 'ollie'].includes(providerOf(row.provider))));
}
async function getJson(url, options = {}) {
  const controller = new AbortController();
  // The canonical Windows coordinator may need its two bounded 30-second steps.
  // A timed-out mutation is an unknown outcome, never an implicit safe retry.
  const timer = window.setTimeout(() => controller.abort(), options.method === 'POST' ? 70_000 : 35_000);
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal, ...options });
    let body;
    try { body = await response.json(); } catch { throw new Error(`The local service returned an unreadable response (${response.status}).`); }
    if (!response.ok || body?.ok !== true) {
      const error = new Error(text(body?.error) || text(body?.message) || `The local request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The local service did not respond in time.');
    throw error;
  } finally { window.clearTimeout(timer); }
}
async function postJson(path, body) {
  if (!state.factoryToken) throw new Error('Control-room authorization is unavailable. Refresh the workspace.');
  try { return await getJson(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Xenios-Control-Token': state.factoryToken }, body: JSON.stringify(body) }); }
  catch (error) { if (error.status === 403) state.factoryToken = ''; throw error; }
}
function toast(message) {
  const node = $('#toast');
  node.textContent = message; node.classList.add('show');
  window.clearTimeout(toast.timer); toast.timer = window.setTimeout(() => node.classList.remove('show'), 5000);
}
function empty(title, description, iconName = 'sessions', action = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon(iconName)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${action}</div>`;
}
function panelHeader(title, count, action = '', subtitle = '') {
  return `<header class="panel-header"><div><div class="panel-heading"><h2>${escapeHtml(title)}</h2>${count !== null && count !== undefined ? `<span class="section-count">${escapeHtml(count)}</span>` : ''}</div>${subtitle ? `<p class="panel-subheading">${escapeHtml(subtitle)}</p>` : ''}</div>${action || ''}</header>`;
}
function detailList(entries) { return `<dl class="detail-list">${entries.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value ?? 'Not reported')}</dd></div>`).join('')}</dl>`; }
function detailPaths(paths) { return arr(paths).length ? `<ul class="detail-paths">${paths.map(path => `<li>${escapeHtml(path)}</li>`).join('')}</ul>` : '<p class="detail-note">No paths supplied.</p>'; }

function renderHeader() {
  const info = viewInfo[state.view];
  $('#breadcrumb-current').textContent = info[0];
  $('#page-title').innerHTML = `${escapeHtml(info[0])}<span class="title-dot">.</span>`;
  $('#page-eyebrow').textContent = info[1];
  $('#page-description').textContent = info[2];
  $$('[data-view]').forEach(node => { const selected = node.dataset.view === state.view; node.classList.toggle('active', selected); if (selected) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); });
  $('#nav-session-count').textContent = sourceKnown() ? String(sessions().length) : '—';
  $('#nav-work-count').textContent = sourceKnown() ? String(tasks().filter(task => task.state !== 'done').length) : '—';
  $('#sidebar-project').textContent = state.status?.status?.project || state.room?.host?.name || 'Local cockpit';
  const connected = Boolean(state.status && !state.statusError || state.room && !state.roomError);
  $('#control-connection').innerHTML = `<span class="status-dot ${connected ? 'good' : 'warn'}"></span>${connected ? 'Local API connected' : 'Local API unavailable'}`;
  const observed = state.room?.observedAt || state.status?.status?.generatedAt;
  $('#snapshot-time').textContent = observed ? `Observed ${stamp(observed)}` : 'No verified snapshot yet';
  const source = state.room?.source;
  let notice, tone = '';
  if (state.roomError && state.room) { notice = `<strong>Connection interrupted.</strong> Showing the last received snapshot from ${escapeHtml(stamp(state.roomFetchedAt))}. Session activity may have changed.`; tone = 'warn'; }
  else if (source?.availability === 'authority') {
    notice = `<strong>Canonical factory connected.</strong> ${source.freshness === 'current' ? 'Current coordination export' : `${escapeHtml(human(source.freshness || 'unknown'))} source freshness`} · revision ${escapeHtml(source.revision ?? 'unknown')}. Work state is reported by configured connectors; native provider authentication is not established here.`;
    if (source.freshness !== 'current') tone = 'warn';
  } else if (source?.availability === 'snapshot') { notice = `<strong>Repository snapshot.</strong> Source ${escapeHtml(short(source.sourceSha))} · captured ${escapeHtml(stamp(source.capturedAt))}. This is recorded coordination; live agent status and sending are unavailable.`; tone = 'warn'; }
  else { notice = '<strong>Factory source not connected.</strong> Local tools are available below. Connect the existing coordinator to see sessions, ownership and message receipts.'; tone = 'warn'; }
  $('#source-notice').className = `source-notice ${tone}`;
  $('#source-notice').innerHTML = `${icon(tone === 'warn' ? 'info' : 'shield')}<p>${notice}</p>${textButton('Connections', 'navigate', 'data-target="connections"')}`;
  $('#footer-source').textContent = sourceKnown() ? `${source.availability === 'snapshot' ? 'Snapshot' : 'Coordinator'} · ${short(source.sourceSha)} · ${human(source.freshness || 'unknown')}` : 'Factory source unconfigured';
  $('#refresh-all').classList.toggle('refreshing', state.refreshing);
  $('#refresh-all').disabled = state.refreshing;
  $('#send-handoff').hidden = !canSend();
  $('#send-handoff').disabled = state.handoffBusy || state.handoffSent;
}

function metric(label, value, foot, iconName, meta = '', unit = '') {
  return `<article class="metric"><p class="metric-label">${icon(iconName)}${escapeHtml(label)}</p>${meta ? `<span class="metric-tone">${escapeHtml(meta)}</span>` : ''}<div class="metric-value">${escapeHtml(value)}${unit ? `<span class="metric-unit">${escapeHtml(unit)}</span>` : ''}</div><p class="metric-foot">${escapeHtml(foot)}</p></article>`;
}
function renderMetrics() {
  const verified = sessions().filter(row => ['connected', 'current'].includes(row.connection) && row.workState === 'running');
  const liveKnown = state.room?.source?.availability === 'authority' && !state.roomError;
  const waiting = tasks().filter(task => task.state === 'qa');
  const unacked = messages().filter(message => message.kind === 'handoff' && !['acknowledged', 'working', 'result_submitted'].includes(message.stage));
  const disk = state.room?.resources?.disk;
  const free = gib(disk?.freeBytes);
  return `<div class="metric-strip">${metric('Reported working', liveKnown ? verified.length : '—', liveKnown ? `${sessions().length} registered · bridge reports only` : 'No current agent observation', 'sessions', 'BRIDGE REPORTS')}${metric('Waiting for review', sourceKnown() ? waiting.length : '—', sourceKnown() ? 'From canonical task state' : 'Work queue not reporting', 'review', sourceStale() ? 'STALE' : 'QUEUE')}${metric('Awaiting acknowledgment', sourceKnown() ? unacked.length : '—', sourceKnown() ? 'Structured handoffs with no ACK' : 'Receipt source not reporting', 'handoff', 'HANDOFFS')}${metric('Disk headroom', free ?? '—', free !== null ? `${disk.label || 'Local disk'} · ${human(disk.state || 'unknown')}` : 'Disk telemetry not reporting', 'resource', state.room?.host?.platform ? human(state.room.host.platform) : 'LOCAL', free !== null ? 'GiB free' : '')}</div>`;
}
function filteredSessions() {
  return sessions().filter(row => matches(row.id, row.tool, row.lane, row.note, row.branch, ...(row.taskIds ?? [])))
    .filter(row => state.sessionFilter === 'all' || state.sessionFilter === 'connected' && ['connected', 'current'].includes(row.connection) || state.sessionFilter === 'attention' && (['stale', 'offline', 'expired'].includes(row.connection) || row.workState === 'blocked'));
}
function renderSessionTable(rows, compact = false) {
  if (!rows.length) return empty(sourceKnown() ? (state.query || state.sessionFilter !== 'all' ? 'No sessions match' : 'No sessions in this export') : 'Bring your sessions into view', sourceKnown() ? 'Try another search or filter. A session must be registered with the existing factory to appear here.' : 'Connect the canonical factory source, then bind each coding session through a supported local bridge. Existing identities and ownership stay in one place.', 'sessions', textButton('View connection setup', 'navigate', 'data-target="connections"'));
  const selected = compact ? rows.slice(0, 6) : rows;
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th class="session-column">Session</th><th class="status-column">Observed state</th><th class="task-column">Current ownership</th><th class="updated-column">Last report</th></tr></thead><tbody>${selected.map(row => {
    const [work, tone] = workInfo(row.workState, row.connection);
    const [connection] = connectionInfo(row.connection);
    const taskIds = arr(row.taskIds);
    const owned = tasks().filter(task => task.owner === row.id && task.state !== 'done');
    return `<tr><td><div class="entity-cell">${avatar(row.tool, row.id)}<div class="entity-copy">${entityButton(row.id, 'session', row.id)}<span class="entity-meta">${escapeHtml(row.lane || providerLabel(providerOf(row.tool)))}</span></div></div></td><td><div class="stacked-meta">${badge(work, tone)}<span class="entity-meta">${escapeHtml(connection)}</span></div></td><td><div class="table-text">${escapeHtml(owned[0]?.title || owned[0]?.id || taskIds[0] || 'No recorded task')}</div>${owned.length > 1 || taskIds.length > 1 ? `<span class="entity-meta">+${Math.max(owned.length, taskIds.length) - 1} more</span>` : ''}</td><td><span class="table-time" title="${escapeHtml(stamp(row.observedAt || row.heartbeatAt, true))}">${escapeHtml(age(row.observedAt || row.heartbeatAt))}</span><span class="entity-meta">${row.observedAt ? 'Bridge observation' : 'Registry heartbeat'}</span></td></tr>`;
  }).join('')}</tbody></table></div><div class="table-footer"><span>${selected.length} of ${rows.length} registered sessions · execution is shown only when observed</span>${compact ? textButton('All sessions', 'navigate', 'data-target="sessions"') : ''}</div>`;
}

function attentionItems() {
  const result = [];
  if (!sourceKnown()) result.push({ title: 'Connect the factory source', detail: 'The cockpit has no usable coordinator export. Sessions and ownership remain unknown.', tone: 'info', command: 'navigate', target: 'connections', action: 'Open connections' });
  if (sourceStale()) result.push({ title: 'Refresh the coordination evidence', detail: state.roomError ? 'The last read failed. Existing rows are retained as a snapshot.' : 'The source is stale. Verify current ownership before starting work.', tone: 'warn', command: 'refresh', action: 'Refresh source' });
  const disk = state.room?.resources?.disk;
  if (['critical', 'low', 'warning'].includes(disk?.state)) result.push({ title: `${disk.label || 'Local disk'} needs headroom`, detail: `${gib(disk.freeBytes) ?? 'Unknown'} GiB free. Coordinate with the storage owner before starting a heavy job.`, tone: disk.state === 'critical' ? 'bad' : 'warn', command: 'draft-handoff', recipient: '', action: 'Draft storage handoff' });
  tasks().filter(task => task.state === 'qa').slice(0, 2).forEach(task => result.push({ title: task.title || task.id, detail: `${task.id} is waiting for independent review. ${task.owner ? `Owner: ${task.owner}.` : 'No owner recorded.'}`, tone: 'info', kind: 'task', id: task.id, action: 'View handoff' }));
  sessions().filter(row => row.workState === 'blocked' && ['connected', 'current'].includes(row.connection)).slice(0, 2).forEach(row => result.push({ title: `${row.id} reported a blocker`, detail: row.note || 'Open the session for the latest observed context.', tone: 'warn', kind: 'session', id: row.id, action: 'View session' }));
  messages().filter(message => message.kind === 'handoff' && ['recorded', 'delivered'].includes(message.stage)).slice(0, 2).forEach(message => result.push({ title: 'A handoff is waiting for acknowledgment', detail: `${message.subject || 'Handoff'} → ${message.to} · ${age(message.createdAt)}.`, tone: 'warn', kind: 'message', id: message.id, action: 'Open receipt trail' }));
  return result.slice(0, 5);
}
function renderAttention() {
  const items = attentionItems();
  return `<section class="panel">${panelHeader('Needs attention', items.length, `<span class="attention-count">${items.length ? icon('warning') : icon('check')}</span>`)}${items.length ? `<div class="attention-list">${items.map(row => `<article class="attention-item"><span class="attention-mark ${row.tone}">${icon(row.tone === 'info' ? 'info' : 'warning')}</span><div class="attention-content"><h3>${escapeHtml(row.title)}</h3><p>${escapeHtml(row.detail)}</p>${row.kind ? `<button class="text-button" data-detail="${row.kind}" data-id="${escapeHtml(row.id)}">${escapeHtml(row.action)}${icon('arrow')}</button>` : textButton(row.action, row.command, row.target ? `data-target="${row.target}"` : '')}</div></article>`).join('')}</div>` : '<p class="empty-inline">No attention items in the current export. This does not establish that every session or release is healthy.</p>'}</section>`;
}
function renderResources() {
  const resources = state.room?.resources, disk = resources?.disk, memory = resources?.memory;
  const diskFree = gib(disk?.freeBytes), memoryFree = gib(memory?.freeBytes);
  const allocation = arr(resources?.allocations);
  return `<section class="panel">${panelHeader('Local headroom', null, icon('resource'))}<div class="resource-body"><div class="resource-row"><span>${escapeHtml(disk?.label || 'Disk space')}</span><strong>${diskFree === null ? 'Not reporting' : `${diskFree} GiB free`}</strong></div>${resourceMeter(disk)}<div class="resource-row"><span>Available memory</span><strong>${memoryFree === null ? 'Not reporting' : `${memoryFree} GiB`}</strong></div>${resourceMeter(memory)}<p class="resource-note">${allocation.length ? `${allocation.length} heavy-job allocation(s) reported.` : 'Heavy-job allocation is not reported by this source.'}</p><p class="resource-state"><span class="status-dot ${resources?.observedAt && !state.roomError ? 'good' : 'unknown'}"></span>${resources?.observedAt ? `Measured ${escapeHtml(age(resources.observedAt))}` : 'Waiting for host telemetry'}</p></div><div class="panel-caption">Host measurements do not reserve capacity or approve a heavy job.</div></section>`;
}
function resourceMeter(value) {
  if (!finite(value?.freeBytes) || !finite(value?.totalBytes) || value.totalBytes <= 0) return '<div class="resource-meter" aria-hidden="true"></div>';
  const used = Math.max(0, Math.min(100, 100 * (1 - value.freeBytes / value.totalBytes)));
  const tone = value.state === 'critical' ? 'bad' : ['warning', 'low'].includes(value.state) ? 'warn' : '';
  // Native progress avoids inline style, keeping the existing strict CSP intact.
  return `<progress class="resource-progress ${tone}" max="100" value="${used.toFixed(1)}" aria-label="${escapeHtml(value.label || 'Resource')} used">${used.toFixed(1)}%</progress>`;
}
function activityRows() {
  const rows = arr(state.room?.activity).map(row => ({ ...row, source: 'Factory event' }));
  const existing = new Set(rows.map(row => row.id));
  messages().forEach(message => { if (!existing.has(message.id)) rows.push({ id: message.id, type: 'message', title: message.subject || `${message.from} → ${message.to}`, detail: `${receiptInfo(message.stage)[0]} · ${message.from} → ${message.to}`, at: message.receiptAt || message.createdAt, messageId: message.id, source: 'Canonical message' }); });
  arr(state.status?.actions?.history).forEach(action => rows.push({ id: `action-${action.id}-${action.startedAt}`, type: 'check', title: `${action.label}: ${human(action.status)}`, detail: `Local bounded action · ${short(action.sha)}`, at: action.finishedAt || action.startedAt, source: 'Local cockpit' }));
  return rows.sort(byTime).filter(row => matches(row.title, row.detail, row.sessionId, row.taskId));
}
function renderTimeline(rows, compact = false) {
  if (!rows.length) return empty('No events to show yet', state.query ? 'Try a different search.' : 'Factory events and message receipts appear here when a source is connected. Local check results are included when available.', 'activity');
  return `<div class="timeline">${(compact ? rows.slice(0, 5) : rows).map(row => `<article class="timeline-item"><span class="timeline-icon">${icon(row.type === 'message' ? 'handoff' : row.type === 'check' ? 'check' : 'activity')}</span><div class="timeline-content"><p>${row.messageId ? `<button class="entity-title" data-detail="message" data-id="${escapeHtml(row.messageId)}">${escapeHtml(row.title)}</button>` : escapeHtml(row.title || human(row.type))}</p><small>${escapeHtml(row.detail || row.source)}${row.taskId ? ` · ${escapeHtml(row.taskId)}` : ''}</small></div><time class="timeline-time" datetime="${escapeHtml(date(row.at) ? row.at : '')}" title="${escapeHtml(stamp(row.at, true))}">${escapeHtml(age(row.at))}</time></article>`).join('')}</div>`;
}
function renderConnectionPreview() {
  return `<section class="connection-preview" aria-label="Client connections"><div class="connection-preview-intro"><h2>Your connected workspace</h2><p>Same factory. Any supported client.</p></div>${connectionRows().slice(0, 4).map(row => `<button class="connection-tile" data-detail="connection" data-id="${escapeHtml(row.id)}">${avatar(row.provider)}<span><strong>${escapeHtml(row.label || providerLabel(row.provider))}</strong><small><span class="status-dot ${connectionInfo(row.state)[1] || 'unknown'}"></span>${escapeHtml(connectionInfo(row.state)[0])}</small></span></button>`).join('')}</section>`;
}
function renderSearchResults() {
  const results = [
    ...sessions().filter(row => matches(row.id, row.lane, row.tool, row.note)).map(row => ({kind: 'session', id: row.id, label: row.id, detail: `Session · ${row.lane || row.tool || 'Registered identity'}`, iconName: 'sessions'})),
    ...tasks().filter(row => matches(row.id, row.title, row.owner, ...arr(row.paths))).map(row => ({kind: 'task', id: row.id, label: row.title || row.id, detail: `Task · ${row.id} · ${taskInfo(row.state)[0]}`, iconName: 'work'})),
    ...messages().filter(row => matches(row.subject, row.from, row.to, row.text, row.taskId)).map(row => ({kind: 'message', id: row.id, label: row.subject || `${row.from} → ${row.to}`, detail: `Message · ${receiptInfo(row.stage)[0]}`, iconName: 'handoff'})),
    ...connectionRows().filter(row => matches(row.label, row.provider, ...arr(row.sessionIds))).map(row => ({kind: 'connection', id: row.id, label: row.label, detail: `Connection · ${connectionInfo(row.state)[0]}`, iconName: 'connections'})),
  ];
  return `<section class="panel workspace-search-results">${panelHeader(`Results for “${$('#global-search').value.trim()}”`, results.length, textButton('Clear search', 'clear-search'))}${results.length ? `<div class="search-result-list">${results.slice(0, 50).map(row => `<button class="search-result" data-detail="${row.kind}" data-id="${escapeHtml(row.id)}"><span class="search-result-icon">${icon(row.iconName)}</span><span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail)}</small></span>${icon('arrow')}</button>`).join('')}</div>${results.length > 50 ? '<p class="panel-caption">Showing the first 50 matches. Refine your search for a smaller result.</p>' : ''}` : empty('No matching records', 'Search a session name, task ID, file path or message. Only records supplied by the current source are searchable.', 'search')}</section>`;
}
function renderOverview() {
  if (state.query) return renderSearchResults();
  return `${renderMetrics()}<div class="dashboard-grid"><div class="main-column"><section class="panel">${panelHeader('Session overview', sourceKnown() ? sessions().length : null, textButton('View all', 'navigate', 'data-target="sessions"'))}${renderSessionTable(filteredSessions(), true)}</section><section class="panel">${panelHeader('Recent activity', null, textButton('Activity log', 'navigate', 'data-target="activity"'))}${renderTimeline(activityRows(), true)}</section></div><aside class="side-column" aria-label="Attention and resource status">${renderAttention()}${renderResources()}</aside></div>${renderConnectionPreview()}`;
}
function renderSessions() {
  return `<div class="view-toolbar"><p class="toolbar-description">Registry identity and bridge execution are shown separately.</p><label class="visually-hidden" for="session-filter">Filter sessions</label><select id="session-filter" class="filter-select"><option value="all" ${state.sessionFilter === 'all' ? 'selected' : ''}>All sessions</option><option value="connected" ${state.sessionFilter === 'connected' ? 'selected' : ''}>Bridge connected</option><option value="attention" ${state.sessionFilter === 'attention' ? 'selected' : ''}>Needs attention</option></select></div><section class="panel list-panel">${panelHeader('Registered sessions', sourceKnown() ? sessions().length : null, textButton('Connection setup', 'navigate', 'data-target="connections"'))}${renderSessionTable(filteredSessions())}</section><section class="panel explanation-panel"><h2>A heartbeat is one piece of evidence.</h2><p>A registry heartbeat records coordination activity. A configured connector can report its work state. This does not prove provider authentication, renew file ownership, or independently accept a result. Open a session to see its source, task claims and exact observation times.</p></section>`;
}
function taskCard(task) {
  const [label, tone] = taskInfo(task.state);
  return `<article class="task-card"><div class="task-card-top"><span class="task-id">${escapeHtml(task.id)}</span>${badge(task.priority || 'Unprioritized', task.priority === 'P0' ? 'bad' : '', false)}</div>${entityButton(task.title || task.id, 'task', task.id)}${task.dependsOn?.length ? `<p>Depends on ${escapeHtml(task.dependsOn.join(', '))}</p>` : ''}<div class="task-card-footer"><span>${escapeHtml(task.owner || 'Unassigned')}</span>${badge(label, tone)}</div></article>`;
}
function renderWork() {
  const rows = tasks().filter(task => matches(task.id, task.title, task.owner, task.priority, ...arr(task.paths))).filter(task => state.taskFilter === 'all' || state.taskFilter === 'active' && task.state !== 'done' || state.taskFilter === task.state);
  const options = [['active', 'Open work'], ['all', 'All states'], ['ready', 'Ready'], ['claimed', 'Owned'], ['qa', 'In review'], ['done', 'Accepted'], ['blocked', 'Blocked']];
  const toolbar = `<div class="view-toolbar"><p class="toolbar-description">Recorded state from the existing coordinator. Ownership changes stay with its CLI.</p><label class="visually-hidden" for="task-filter">Filter work queue</label><select id="task-filter" class="filter-select">${options.map(([value, label]) => `<option value="${value}" ${state.taskFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
  if (!rows.length) return `${toolbar}<section class="panel">${empty(sourceKnown() ? 'No work matches this view' : 'Work ownership is not available', sourceKnown() ? 'Try another filter or search. Tasks are created and claimed in the canonical factory.' : 'Once the factory export is connected, this view shows current tasks, dependencies, file ownership and review handoffs.', 'work', textButton('View connections', 'navigate', 'data-target="connections"'))}</section>`;
  const groups = state.taskFilter === 'active' ? [['Ready & waiting', rows.filter(row => !['claimed', 'qa'].includes(row.state))], ['Owned', rows.filter(row => row.state === 'claimed')], ['Review', rows.filter(row => row.state === 'qa')]] : [['Matching work', rows]];
  return `${toolbar}<div class="queue-grid ${groups.length === 1 ? 'queue-single' : ''}">${groups.map(([title, items]) => `<section class="queue-column"><header class="queue-column-header"><h2>${title}</h2><span class="section-count">${items.length}</span></header>${items.length ? items.map(taskCard).join('') : '<p class="queue-empty">No tasks in this state.</p>'}</section>`).join('')}</div><section class="panel explanation-panel ownership-summary"><h2>File ownership</h2><p>${leases().filter(row => row.state === 'active').length} active lease(s) in this export. Task details show the owning session and exact paths. Viewing a task never claims it, releases another writer, or changes its review state.</p></section>`;
}
function renderHandoffs() {
  const rows = messages().filter(message => matches(message.id, message.from, message.to, message.subject, message.text, message.taskId)).filter(message => state.messageFilter === 'all' || state.messageFilter === 'waiting' && message.kind === 'handoff' && ['recorded', 'delivered'].includes(message.stage) || state.messageFilter === 'acknowledged' && ['acknowledged', 'working', 'result_submitted'].includes(message.stage)).sort(byTime);
  return `<div class="view-toolbar"><p class="toolbar-description">${canSend() ? `Sending as registered operator ${escapeHtml(state.room.operator.sessionId)}.` : 'Direct send is unavailable. Drafts can be copied or downloaded for manual delivery.'}</p><label class="visually-hidden" for="message-filter">Filter handoffs</label><select class="filter-select" id="message-filter"><option value="all" ${state.messageFilter === 'all' ? 'selected' : ''}>All messages</option><option value="waiting" ${state.messageFilter === 'waiting' ? 'selected' : ''}>Awaiting ACK</option><option value="acknowledged" ${state.messageFilter === 'acknowledged' ? 'selected' : ''}>Acknowledged</option></select></div>${state.room?.messagesTruncated ? '<p class="notice-inline">This is a bounded message feed. Older messages may be omitted; counts describe only the supplied records.</p>' : ''}<section class="panel list-panel">${panelHeader('Message & handoff trail', sourceKnown() ? messages().length : null)}${rows.length ? `<div class="table-scroll"><table class="data-table handoff-table"><thead><tr><th class="session-column">Handoff</th><th class="status-column">Receipt stage</th><th class="task-column">From → To</th><th class="updated-column">Recorded</th></tr></thead><tbody>${rows.map(message => `<tr><td>${entityButton(message.subject || `${message.from} → ${message.to}`, 'message', message.id)}<span class="entity-meta">${escapeHtml(message.taskId || message.kind || 'Canonical note')}</span></td><td>${badge(...receiptInfo(message.stage))}<span class="entity-meta">${message.stage === 'recorded' ? 'No delivery proof' : escapeHtml(age(message.receiptAt))}</span></td><td><span class="table-text">${escapeHtml(message.from)} → ${escapeHtml(message.to)}</span></td><td><span class="table-time" title="${escapeHtml(stamp(message.createdAt, true))}">${escapeHtml(age(message.createdAt))}</span></td></tr>`).join('')}</tbody></table></div>` : empty(sourceKnown() ? 'No matching messages yet' : 'A place for clearer handoffs', 'Draft a specific result, name the receiver and attach the exact source. A message becomes acknowledged only when the receiver records a receipt.', 'handoff', button('Draft a handoff', 'draft-handoff', 'plus', 'button-primary'))}<div class="receipt-legend"><span><strong>Recorded</strong> · saved by the coordinator</span><span><strong>Acknowledged</strong> · confirmed by the receiver</span><span><strong>Result submitted</strong> · still needs review</span></div></section>`;
}
function renderConnections() {
  const rows = connectionRows().filter(row => matches(row.label, row.provider, row.description, ...arr(row.sessionIds)));
  return `<div class="connection-grid">${rows.map(row => {
    const [label, tone] = connectionInfo(row.state);
    const caps = arr(row.capabilities);
    return `<article class="panel connector-card"><header class="connector-heading">${avatar(row.provider)}<div><h2>${escapeHtml(row.label || providerLabel(row.provider))}</h2><span class="entity-meta">${arr(row.sessionIds).length} bound session(s)</span></div>${badge(label, tone)}</header><p>${escapeHtml(row.description || 'Bind a local MCP client to a registered identity. Its reports will appear alongside canonical task ownership.')}</p><ul class="capability-list">${caps.length ? caps.map(capability => `<li>${escapeHtml(human(capability))}</li>`).join('') : '<li class="unavailable">No bridge capabilities reported</li>'}</ul><footer class="connector-footer"><small>${row.lastObservedAt ? `Last observed ${escapeHtml(stamp(row.lastObservedAt))}` : 'No bridge observation yet'}</small>${canConfigure() ? button('Connect session', 'configure-connector', 'plus', 'button-secondary button-small', `data-provider="${escapeHtml(providerOf(row.provider))}"`) : textButton('Setup details', 'connection-detail', `data-id="${escapeHtml(row.id)}"`)}</footer></article>`;
  }).join('')}</div>${!rows.length ? `<section class="panel">${empty('No connections match', 'Try another search term.', 'connections')}</section>` : ''}<section class="panel explanation-panel"><h2>One coordination layer. Your choice of client.</h2><p>This portal reads the existing factory and uses its canonical message path. A local MCP bridge can read an inbox, report activity and acknowledge a handoff. It cannot start another agent, change file ownership or deploy a release.</p><ol class="step-list"><li><span class="step-number">1</span><div><strong>Use an existing identity</strong>Register the session through your factory workflow and retain its current task and path ownership.</div></li><li><span class="step-number">2</span><div><strong>Configure its local bridge</strong>Create a scoped credential, then add the returned MCP configuration to the client's supported settings.</div></li><li><span class="step-number">3</span><div><strong>Verify a real receipt</strong>Receive a heartbeat and a test handoff acknowledgment before treating the client as connected.</div></li></ol></section><div class="notice-inline"><strong>Muse & Ollie:</strong> local clients can use the same bridge if they support MCP stdio. A cloud-only client cannot reach this computer's loopback address. Until a supported transport exists, use a copied handoff; it will remain manual and unverified here.</div>`;
}
function renderActivity() { return `<section class="panel">${panelHeader('Observed events', activityRows().length, textButton('Refresh', 'refresh'))}${renderTimeline(activityRows())}</section><p class="toolbar-description activity-caption">Times are shown in America/Chicago. Open a message or session for precise evidence times. This page refreshes visible snapshots; it does not wake coding sessions.</p>`; }

const actionDescriptions = {
  'customer-smoke': ['Customer route smoke', 'Run the existing fixed customer-facing route suite.'],
  typecheck: ['TypeScript check', 'Run the repository’s bounded type check.'],
  build: ['Production build', 'Build the local checkout; this does not publish it.'],
  'restart-app': ['Restart helper app', 'Restart only the app owned by the existing helper.'],
  package: ['Source package', 'Generate the existing sanitized committed-source package.'],
};
function renderWorkspace() {
  const status = state.status?.status;
  const actions = state.status?.actions;
  const active = actions?.activeAction, last = active || actions?.lastAction;
  const appUrl = safeUrl(state.appOrigin || status?.app?.url, { local: true });
  const currentRoutes = state.routes.filter(row => matches(row.path, row.audience, row.auth, row.note));
  return `<div class="workspace-grid"><section class="panel">${panelHeader('Current checkout', null, icon('branch'))}<div class="workspace-summary">${status ? detailList([['Project', status.project], ['Branch', status.branch], ['Commit', short(status.sha)], ['Working tree', status.dirty ? `${status.dirtyCount} changes` : 'Clean'], ['Local website', `${status.app?.online ? 'Responding' : 'Offline'} · ${status.app?.mode || 'Unknown'}`], ['Local API', status.app?.apiOnline ? 'Health check passed' : 'Unavailable'], ['Toolchain', `Node ${status.runtime?.nodeVersion || '?'} · npm ${status.runtime?.npmVersion || '?'}`], ['Observed', stamp(status.generatedAt)]]) : '<p class="detail-note">Local status is unavailable. Start or reconnect the existing cockpit.</p>'}${status?.repoRoot ? `<div class="details-section"><h3>Resolved worktree</h3><code>${escapeHtml(status.repoRoot)}</code><p>${textButton('Copy path', 'copy-path')}</p></div>` : ''}${appUrl ? `<a class="button button-secondary workspace-open" href="${escapeHtml(appUrl)}" target="_blank" rel="noreferrer">${icon('external')}Open local website</a>` : ''}</div></section><section class="panel">${panelHeader('Existing bounded checks', null, active ? badge('Action running', 'warn') : null)}<div class="action-list">${Object.entries(actionDescriptions).map(([id, [label, description]]) => `<article class="action-item"><div><h3>${label}</h3><p>${description}</p></div><button class="button button-secondary button-small" data-action="${id}" ${state.actionBusy || active || !state.actionIds.includes(id) || !state.cockpitToken ? 'disabled' : ''}>${state.actionIds.includes(id) ? 'Run check' : 'Unavailable'}</button></article>`).join('')}</div><div class="panel-caption">One local action at a time. Observe resource allocations before a heavy build. No release, database or arbitrary-command controls.</div></section><section class="panel">${panelHeader('Latest local result', null, last ? badge(human(last.status), last.status === 'passed' ? 'good' : last.status === 'running' ? 'warn' : 'bad') : null)}<div class="workspace-summary">${last ? `<h3 class="result-title">${escapeHtml(last.label)}</h3><p class="panel-subheading">${escapeHtml(stamp(last.finishedAt || last.startedAt))} · ${escapeHtml(short(last.sha))}</p><pre class="console">${escapeHtml(last.outputTail || 'The action is running. Bounded output appears when it exits.')}</pre>` : '<p class="detail-note">No bounded action result has been reported in this workspace.</p>'}<div class="tool-actions">${button('Read logs', 'read-logs', 'terminal')}${button('Read Git status', 'read-git', 'branch')}</div></div></section><section class="panel">${panelHeader('Local route directory', currentRoutes.length)}${currentRoutes.length ? `<div class="route-list">${currentRoutes.map(row => { const url = safeUrl(`${state.appOrigin || status?.app?.url || ''}${row.path}`, { local: true }); return `<article class="route-item"><div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(row.path)} ↗</a>` : `<span>${escapeHtml(row.path)}</span>`}<br><small>${escapeHtml(row.audience)} · ${escapeHtml(row.auth)}</small></div>${badge(row.status || 'Unknown', row.status === 'Implemented' ? 'good' : '')}</article>`; }).join('')}</div>` : '<p class="empty-inline">No routes are available for this search.</p>'}<div class="panel-caption">A listed route is source information; opening it checks its current local behavior.</div></section><section class="panel workspace-wide">${panelHeader('Launch evidence', null)}${state.launch ? `<ul class="check-list">${state.launch.map(row => `<li class="check-item"><span class="check-mark ${row.complete ? 'complete' : ''}">${row.complete ? '✓' : '·'}</span><div><strong>${escapeHtml(row.label)}</strong>${row.note ? `<p>${escapeHtml(row.note)}</p>` : ''}</div>${badge(row.complete ? 'Ready' : row.source === 'disabled' ? 'Disabled' : 'Pending', row.complete ? 'good' : '')}</li>`).join('')}</ul>` : '<p class="empty-inline">Launch evidence is not available.</p>'}</section></div>`;
}

function renderView() {
  renderHeader();
  const renderers = { overview: renderOverview, sessions: renderSessions, work: renderWork, handoffs: renderHandoffs, connections: renderConnections, activity: renderActivity, workspace: renderWorkspace };
  $('#view-content').innerHTML = renderers[state.view]();
  $('#view-content').setAttribute('aria-busy', 'false');
}
function navigate(view, { focus = false } = {}) {
  if (!viewInfo[view]) view = 'overview';
  state.view = view;
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  renderView();
  if (focus) $('#main').focus({ preventScroll: true });
}
function showDialog(dialog) {
  if (!dialog.open) { state.dialogReturn = document.activeElement; state.dialogReturnKey = rememberFocus(document.activeElement); dialog.showModal(); }
}
function closeDialog(dialog) {
  if (!dialog) return;
  dialog.close();
  if (dialog.id === 'connector-dialog') clearConnectorSecret();
  if (dialog.id === 'detail-dialog') state.selected = null;
  const returnTarget = state.dialogReturn?.isConnected ? state.dialogReturn : findFocus(state.dialogReturnKey);
  (returnTarget || $('#main')).focus({ preventScroll: true });
}
function rememberFocus(node) {
  if (!node || node === document.body) return null;
  return {id: node.id || null, detail: node.dataset?.detail, action: node.dataset?.action, command: node.dataset?.command, dataset: {...node.dataset}, href: node.tagName === 'A' ? node.getAttribute('href') : null};
}
function findFocus(key) {
  if (!key) return null;
  if (key.id) return document.getElementById(key.id);
  const candidates = key.detail ? $$('[data-detail]') : key.command ? $$('[data-command]') : key.action ? $$('[data-action]') : key.href ? $$('a[href]') : [];
  return candidates.find(node => key.href ? node.getAttribute('href') === key.href : Object.entries(key.dataset).every(([name, value]) => node.dataset[name] === value));
}
function openDetails(kind, id) {
  const dialog = $('#detail-dialog');
  let content = '', actions = '';
  state.selected = { kind, id };
  $('#detail-kind').textContent = ({ session: 'SESSION EVIDENCE', task: 'TASK & OWNERSHIP', message: 'MESSAGE RECEIPTS', connection: 'CLIENT CONNECTION', workspace: 'LOCAL WORKSPACE', logs: 'REDACTED LOCAL LOGS', git: 'READ-ONLY GIT' })[kind] || 'DETAILS';
  if (kind === 'session') {
    const row = sessions().find(item => item.id === id);
    if (!row) { toast('This session is not in the current export.'); return; }
    const ownedTasks = tasks().filter(task => task.owner === id || task.handoff?.session === id);
    const ownedPaths = leases().filter(lease => lease.session === id && lease.state === 'active');
    content = `${avatar(row.tool, row.id)}<h2 class="drawer-title" id="detail-title">${escapeHtml(row.id)}</h2><p class="drawer-subtitle">${escapeHtml(providerLabel(providerOf(row.tool)))} · ${escapeHtml(row.lane || 'Lane not reported')}</p><div class="drawer-tags">${badge(...connectionInfo(row.connection))}${badge(...workInfo(row.workState, row.connection))}</div><section class="details-section">${detailList([['Registry state', human(row.state) || 'Unknown'], ['Branch', row.branch || 'Not reported'], ['Registry heartbeat', stamp(row.heartbeatAt, true)], ['Bridge observation', stamp(row.observedAt, true)], ['Source', state.room.source.availability], ['Work state', workInfo(row.workState, row.connection)[0]]])}</section>${row.note ? `<section class="details-section"><h3>Latest recorded context</h3><p class="detail-message">${escapeHtml(row.note)}</p></section>` : ''}<section class="details-section"><h3>Recorded tasks</h3>${ownedTasks.length ? ownedTasks.map(taskCard).join('') : '<p class="detail-note">No task ownership is recorded for this identity.</p>'}</section><section class="details-section"><h3>Active path leases</h3>${detailPaths(ownedPaths.flatMap(lease => lease.paths))}</section><section class="details-section"><p class="detail-note">Registry activity is historical coordination. Work state is connector-reported, not proof of native provider authentication. It does not establish code acceptance or renew a lease.</p></section>`;
    actions = button('Draft handoff', 'draft-handoff', 'handoff', 'button-primary', `data-recipient="${escapeHtml(row.id)}"`) + (canConfigure() ? button('Connect bridge', 'configure-connector', 'connections', 'button-secondary', `data-session="${escapeHtml(row.id)}" data-provider="${providerOf(row.tool)}"`) : '');
  } else if (kind === 'task') {
    const task = tasks().find(row => row.id === id);
    if (!task) { toast('This task is not in the current export.'); return; }
    content = `<span class="task-id">${escapeHtml(task.id)}</span><h2 class="drawer-title" id="detail-title">${escapeHtml(task.title || task.id)}</h2><div class="drawer-tags">${badge(...taskInfo(task.state))}${badge(task.priority || 'Priority not set', '', false)}</div><section class="details-section">${detailList([['Owner', task.owner || 'Unassigned'], ['Dependencies', arr(task.dependsOn).join(', ') || 'None recorded'], ['Handoff source', task.handoff?.sha || 'Not submitted'], ['Handoff owner', task.handoff?.session || 'Not submitted'], ['Accepted by', task.acceptedBy || 'Not independently accepted'], ['Accepted source', task.acceptedSha || 'Not independently accepted']])}</section><section class="details-section"><h3>Task paths</h3>${detailPaths(task.paths)}</section><section class="details-section"><h3>Current leases</h3>${leases().filter(row => row.task === task.id).map(row => `<p class="detail-note">${escapeHtml(row.session)} · ${escapeHtml(human(row.state))}${row.legacy ? ' · Legacy entry; no lease ID' : ''}<br>Heartbeat ${escapeHtml(stamp(row.heartbeatAt, true))}</p>`).join('') || '<p class="detail-note">No ownership lease supplied.</p>'}</section><section class="details-section"><p class="detail-note">A recorded acceptance is a factory review state. It is not a deployment or live verification. Claim and release paths through the existing coordinator.</p></section>`;
    actions = button('Draft next step', 'draft-handoff', 'handoff', 'button-primary', `data-recipient="${escapeHtml(task.owner || '')}" data-task="${escapeHtml(task.id)}"`);
  } else if (kind === 'message') {
    const message = messages().find(row => row.id === id);
    if (!message) { toast('This message is not in the current export.'); return; }
    const stage = ['recorded', 'delivered', 'acknowledged', 'working', 'result_submitted'];
    content = `<span class="task-id">${escapeHtml(message.kind || 'Canonical message')}</span><h2 class="drawer-title" id="detail-title">${escapeHtml(message.subject || `${message.from} → ${message.to}`)}</h2><div class="drawer-tags">${badge(...receiptInfo(message.stage))}</div><section class="details-section">${detailList([['From', message.from], ['To', message.to], ['Task', message.taskId || 'Not attached'], ['Recorded', stamp(message.createdAt, true)], ['Latest receipt', stamp(message.receiptAt, true)], ['Message ID', message.id]])}</section><section class="details-section"><h3>Receipt progression</h3><ol class="receipt-steps">${stage.map(value => `<li class="${value === message.stage ? 'current' : ''}">${value === message.stage ? icon('check') : icon('clock')}<span>${receiptInfo(value)[0]}</span>${value === message.stage ? '<small>Current reported stage</small>' : ''}</li>`).join('')}</ol><p class="detail-note">Only the reported stage is confirmed here. A recorded message is not proof of delivery. A submitted result still requires independent review.</p></section><section class="details-section"><h3>Message</h3><p class="detail-message">${escapeHtml(message.text)}</p></section>`;
    actions = button('Draft a reply', 'draft-handoff', 'handoff', 'button-primary', `data-recipient="${escapeHtml(message.from)}" data-task="${escapeHtml(message.taskId || '')}"`);
  } else if (kind === 'connection') {
    const row = connectionRows().find(item => item.id === id);
    if (!row) { toast('This connection is not in the current export.'); return; }
    content = `${avatar(row.provider)}<h2 class="drawer-title" id="detail-title">${escapeHtml(row.label || providerLabel(row.provider))}</h2><div class="drawer-tags">${badge(...connectionInfo(row.state))}</div><section class="details-section"><p class="detail-message">${escapeHtml(row.description || 'No bridge observation has been received for this client.')}</p></section><section class="details-section">${detailList([['Transport', 'Local MCP stdio → loopback'], ['Observed', stamp(row.lastObservedAt, true)], ['Session identities', arr(row.sessionIds).join(', ') || 'None connected'], ['Bridge functions', arr(row.capabilities).map(human).join(', ') || 'None reported']])}</section><section class="details-section"><h3>How this connects</h3><p class="detail-note">Use a registered factory session. Configure the returned local bridge in that client's supported MCP settings, then report a heartbeat and acknowledge a test handoff. Provisioning a token alone does not establish a connection.</p></section>${['muse', 'ollie'].includes(providerOf(row.provider)) ? '<section class="details-section"><h3>Transport requirement</h3><p class="detail-note">Muse or Ollie must run a supported MCP client on this host to use loopback. Cloud-only access needs a separately approved transport. Manual handoffs remain available.</p></section>' : ''}${!canConfigure() ? '<section class="details-section"><h3>Setup unavailable</h3><p class="detail-note">Connector creation requires the canonical coordinator and a configured operator. Connect those through the existing factory owner; this page will enable setup when the server advertises it.</p></section>' : ''}`;
    const credentials = arr(row.connectors);
    content += `<section class="details-section"><h3>Scoped credentials</h3>${credentials.length ? `<div class="connector-credentials">${credentials.map(credential => `<article class="credential-row"><h4>${escapeHtml(credential.label || credential.sessionId)}</h4><p>Session ${escapeHtml(credential.sessionId)}<br>Expires ${escapeHtml(stamp(credential.expiresAt, true))}<br>${credential.lastObservedAt ? `Last report ${escapeHtml(stamp(credential.lastObservedAt, true))}` : 'No connector heartbeat yet'}<br>Reported work: ${escapeHtml(human(credential.workState || 'unknown'))}</p>${canRevoke() ? button('Revoke this credential', 'revoke-connector', 'close', 'button-secondary button-small', `data-id="${escapeHtml(credential.id)}"`) : ''}</article>`).join('')}</div>` : '<p class="detail-note">No active scoped credentials are recorded for this client.</p>'}</section>`;
    actions = (canConfigure() ? button('Connect a session', 'configure-connector', 'connections', 'button-primary', `data-provider="${escapeHtml(providerOf(row.provider))}"`) : '') + button('Copy setup brief', 'copy-setup', 'copy', 'button-secondary', `data-provider="${escapeHtml(providerOf(row.provider))}"`);
  } else if (kind === 'workspace') {
    content = `<h2 class="drawer-title" id="detail-title">Your local control room</h2><p class="drawer-subtitle">A view of the existing Xenios factory.</p><section class="details-section">${detailList([['Host', state.room?.host?.name || 'Not reported'], ['Platform', state.room?.host?.platform || 'Not reported'], ['Control URL', location.origin], ['Source mode', state.room?.source?.availability || 'Unavailable'], ['Source freshness', state.room?.source?.freshness || 'Unknown'], ['Revision', state.room?.source?.revision ?? 'Unknown'], ['Source SHA', state.room?.source?.sourceSha || 'Unknown'], ['Captured', stamp(state.room?.source?.capturedAt, true)], ['Observed', stamp(state.room?.observedAt, true)], ['Operator', state.room?.operator?.available ? state.room.operator.sessionId : 'Not configured']])}</section><section class="details-section"><p class="detail-note">Reads refresh every 15 seconds while this tab is visible. They do not wake agents or run scheduled work. The original cockpit keeps its existing bounded controls.</p></section>`;
    actions = '<a class="button button-secondary" href="/">Open original cockpit</a>';
  } else if (kind === 'logs' || kind === 'git') {
    content = `<h2 class="drawer-title" id="detail-title">${kind === 'logs' ? 'Local log tail' : 'Working tree & recent commits'}</h2><p class="drawer-subtitle">Read through the existing cockpit's bounded, redacted endpoint.</p><pre class="console">${escapeHtml(kind === 'logs' ? state.logs || 'No helper-managed logs.' : `${state.git?.status || 'No working-tree status available.'}\n\n${state.git?.commits || 'No recent commits available.'}`)}</pre>`;
  }
  $('#detail-content').innerHTML = content;
  $('#detail-actions').innerHTML = actions;
  showDialog(dialog);
}

function openHandoff({ recipient = '', task = '' } = {}) {
  if ($('#detail-dialog').open) closeDialog($('#detail-dialog'));
  $('#handoff-recipient').value = recipient || $('#handoff-recipient').value;
  $('#handoff-task').value = task || $('#handoff-task').value;
  $('#session-options').innerHTML = sessions().map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.lane || row.tool || '')}</option>`).join('');
  $('#handoff-mode').textContent = canSend() ? 'CANONICAL FACTORY HANDOFF' : 'MANUAL DELIVERY';
  $('#handoff-intro').textContent = canSend() ? `Send a specific next step as ${state.room.operator.sessionId}, or copy a draft. The factory records the message first; delivery and acknowledgment appear only after receiver receipts.` : 'Prepare a precise handoff for any Codex, Claude, Muse or Ollie session. Copy or download it, then deliver it through your existing channel.';
  $('#send-handoff').hidden = !canSend();
  $('#handoff-feedback').textContent = '';
  showDialog($('#handoff-dialog'));
}
function handoffFields() { const data = new FormData($('#handoff-form')); return Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value).trim()])); }
function draftMarkdown(fields) {
  return `# ${fields.subject || 'Xenios factory handoff'}\n\nStatus: DRAFT — not delivered or acknowledged\nTo: ${fields.recipient}\nTask: ${fields.task || 'Not attached'}\nPrepared: ${new Date().toISOString()}\n\n## Goal\n\n${fields.goal}\n\n## Source and artifacts\n\n${fields.source || 'To be supplied'}\n\n## Scope and ownership\n\n${fields.scope || 'Confirm current task and path ownership in the canonical factory before editing.'}\n\n## Acceptance and reply\n\n${fields.acceptance || 'Acknowledge the task, state the exact source, and return evidence with the result.'}\n\nUse the existing coordinator. This draft does not grant file ownership, deployment authority or permission to contact third parties.\n`;
}
async function copyText(value) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Use Download or select the visible text.');
  await navigator.clipboard.writeText(value);
}
function downloadText(value, filename) {
  const blob = new Blob([value], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function submitHandoff(event) {
  event.preventDefault();
  if (state.handoffBusy) return;
  const mode = event.submitter?.value || 'copy';
  const fields = handoffFields(), feedback = $('#handoff-feedback');
  if (mode === 'copy') { await copyText(draftMarkdown(fields)); feedback.textContent = 'Draft copied. It has not been sent or acknowledged.'; return; }
  if (mode === 'download') { downloadText(draftMarkdown(fields), `xenios-handoff-${new Date().toISOString().slice(0, 10)}.md`); feedback.textContent = 'Draft downloaded. It has not been sent or acknowledged.'; return; }
  if (!canSend()) throw new Error('Factory send is unavailable. Copy or download this draft.');
  if (state.handoffBusy || state.handoffSent) return;
  if (!sessions().some(row => row.id === fields.recipient && row.state === 'active')) throw new Error('Choose an active registered recipient identity before sending.');
  if (fields.task && !tasks().some(row => row.id === fields.task)) throw new Error('For factory send, choose an existing task ID or leave it empty. An issue reference can go in the source field.');
  if (!Number.isSafeInteger(state.room.source.revision)) throw new Error('The current coordinator revision is unavailable. Refresh before sending.');
  const payload = { to: fields.recipient, taskId: fields.task, subject: fields.subject || fields.goal.split('\n')[0].slice(0, 160), goal: `${fields.goal}${fields.source ? `\n\nSource and artifacts:\n${fields.source}` : ''}${fields.scope ? `\n\nScope and ownership:\n${fields.scope}` : ''}`, acceptance: fields.acceptance };
  if (payload.goal.length > 8000) throw new Error('For factory send, shorten the combined goal, source and scope to 8,000 characters. Copy/download can retain the complete draft.');
  const fingerprint = JSON.stringify(payload);
  if (!state.handoffPending || state.handoffPending.fingerprint !== fingerprint) state.handoffPending = { fingerprint, body: { operationId: crypto.randomUUID(), expectedRevision: state.room.source.revision, ...payload } };
  state.handoffBusy = true; $('#send-handoff').disabled = true;
  $$('input, textarea, button[type="submit"]', $('#handoff-form')).forEach(node => { node.disabled = true; });
  feedback.textContent = 'Recording the handoff in the canonical factory…';
  try {
    const result = await postJson('/api/control-room/handoffs', state.handoffPending.body);
    state.handoffSent = true;
    feedback.textContent = `Recorded as ${result.messageId}. Delivery and acknowledgment are not yet confirmed.`;
    toast('Handoff recorded. Waiting for a receiver receipt.');
    await refreshAll(false);
  } catch (error) {
    if (error.status === 409) { state.handoffPending = null; await refreshAll(false); feedback.textContent = 'The factory changed before this handoff was recorded. Review the refreshed task and recipient, then send again.'; }
    else { feedback.textContent = `${error.message} The outcome may be unconfirmed; retrying this unchanged draft uses the same operation ID.`; }
  } finally { state.handoffBusy = false; $$('input, textarea, button[type="submit"]', $('#handoff-form')).forEach(node => { node.disabled = false; }); $('#send-handoff').disabled = state.handoffSent; }
}
function clearConnectorSecret() { state.connectorConfig = ''; state.connectorInfo = null; $('#connector-config').textContent = ''; $('#connector-result').hidden = true; $('#connector-fields').hidden = false; $('#connector-create-actions').hidden = false; }
function openConnector(provider = 'generic', session = '') {
  if (!canConfigure()) { toast('Connector setup needs a configured canonical coordinator and operator.'); return; }
  if ($('#detail-dialog').open) closeDialog($('#detail-dialog'));
  clearConnectorSecret();
  $('#connector-session').innerHTML = '<option value="">Choose a registered session</option>' + sessions().filter(row => row.state === 'active').map(row => `<option value="${escapeHtml(row.id)}" ${row.id === session ? 'selected' : ''}>${escapeHtml(row.id)} · ${escapeHtml(row.lane || row.tool || '')}</option>`).join('');
  $('#connector-provider').value = ['codex', 'claude', 'muse', 'ollie', 'generic'].includes(provider) ? provider : 'generic';
  $('#connector-label').value = `${providerLabel(provider)}${session ? ` · ${session}` : ''}`;
  $('#connector-feedback').textContent = '';
  $('#create-connector').disabled = false;
  showDialog($('#connector-dialog'));
}
async function submitConnector(event) {
  event.preventDefault();
  if (!canConfigure() || state.connectorBusy) return;
  const fields = Object.fromEntries(new FormData($('#connector-form')).entries());
  state.connectorBusy = true; $('#create-connector').disabled = true; $('#connector-feedback').textContent = 'Creating a scoped local credential…';
  try {
    const result = await postJson('/api/control-room/connectors', { sessionId: fields.sessionId, provider: fields.provider, label: fields.label });
    if (!$('#connector-dialog').open) {
      clearConnectorSecret();
      toast('Credential created after setup closed. Revoke it in connection details, then create a fresh credential to receive its configuration.');
      await refreshAll(false);
      return;
    }
    state.connectorInfo = result.connector;
    state.connectorConfig = JSON.stringify({ mcpServers: { 'xenios-factory': result.configuration } }, null, 2);
    $('#connector-config').textContent = state.connectorConfig;
    $('#connector-result').hidden = false;
    $('#connector-fields').hidden = true; $('#connector-create-actions').hidden = true;
    $('#connector-expires').textContent = `Credential expires ${stamp(result.connector?.expiresAt, true)}. Connection remains unverified until the configured client reports.`;
    $('#connector-feedback').textContent = 'Credential created. No agent has been started and no heartbeat has been received by this action.';
    await refreshAll(false);
  } catch (error) { $('#connector-feedback').textContent = error.message; }
  finally { state.connectorBusy = false; $('#create-connector').disabled = false; }
}
function setupBrief(provider) {
  return `# ${providerLabel(provider)} → Xenios factory\n\n1. Use the existing registered factory session identity and current task/path ownership.\n2. Open the local control room at http://127.0.0.1:4177/control-room.html.\n3. When the canonical coordinator and operator are configured, choose Connections → Connect session.\n4. Create a scoped credential for that exact session. Keep its one-time configuration private.\n5. Add the returned local MCP stdio configuration using the client's supported MCP settings.\n6. Call factory_heartbeat and factory_inbox, then acknowledge a test handoff.\n7. Confirm the actual observation and receipt in the control room.\n\nThis bridge does not launch or resume agents, claim paths, bypass permissions, or deploy. A cloud-only client cannot directly reach Windows loopback. Use manual copy/download handoffs until a supported transport is available.\n`;
}
async function runAction(id) {
  if (!state.actionIds.includes(id) || !state.cockpitToken) throw new Error('This action is not available on the current host.');
  if (state.actionBusy || state.status?.actions?.activeAction) return;
  state.actionBusy = true; renderView();
  try { const result = await getJson(`/api/actions/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'X-Xenios-Control-Token': state.cockpitToken } }); toast(`${result.action?.label || actionDescriptions[id]?.[0] || 'Local action'} started.`); await refreshAll(false); }
  finally { state.actionBusy = false; renderView(); }
}
async function performCommand(node) {
  const command = node.dataset.command;
  if (command === 'clear-search') { state.query = ''; $('#global-search').value = ''; renderView(); $('#global-search').focus(); return; }
  if (command === 'navigate') { navigate(node.dataset.target, { focus: true }); return; }
  if (command === 'refresh') { await refreshAll(true); return; }
  if (command === 'draft-handoff') { openHandoff({ recipient: node.dataset.recipient, task: node.dataset.task }); return; }
  if (command === 'close-dialog') { closeDialog(node.closest('dialog')); return; }
  if (command === 'connection-detail') { openDetails('connection', node.dataset.id); return; }
  if (command === 'configure-connector') { openConnector(node.dataset.provider, node.dataset.session); return; }
  if (command === 'copy-setup') { await copyText(setupBrief(node.dataset.provider)); toast('Setup brief copied. No credential or agent connection was created.'); return; }
  if (command === 'copy-path') { await copyText(state.status?.status?.repoRoot || ''); toast('Resolved worktree path copied.'); return; }
  if (command === 'read-logs') { const result = await getJson('/api/logs'); state.logs = result.log; openDetails('logs', 'logs'); return; }
  if (command === 'read-git') { const result = await getJson('/api/git'); state.git = result.git; openDetails('git', 'git'); return; }
  if (command === 'revoke-connector') {
    node.disabled = true;
    try { await postJson('/api/control-room/connectors/revoke', { id: node.dataset.id }); toast('Credential revoked. This does not stop the client process.'); closeDialog($('#detail-dialog')); await refreshAll(false); }
    finally { node.disabled = false; }
  }
}

async function refreshAll(notify = false) {
  if (state.refreshing) return;
  state.refreshing = true; state.requestStartedAt = Date.now();
  renderHeader();
  const legacyDue = !state.status || notify || state.view === 'workspace' || Date.now() - Date.parse(state.statusFetchedAt || '') >= 60_000;
  const launchDue = !state.launch || notify || Date.now() - Date.parse(state.launchFetchedAt || '') >= 60_000;
  const jobs = [
    ['room', '/api/control-room'],
    ...(legacyDue ? [['status', '/api/status']] : []),
    ...(launchDue ? [['launch', '/api/launch']] : []),
    ...(!state.factoryToken ? [['factoryBootstrap', '/api/control-room/bootstrap']] : []),
    ...(!state.cockpitToken ? [['cockpitBootstrap', '/api/bootstrap']] : []),
    ...(!state.routes.length ? [['routes', '/api/routes']] : []),
  ];
  const results = await Promise.allSettled(jobs.map(([, path]) => getJson(path)));
  results.forEach((result, index) => {
    const key = jobs[index][0];
    if (result.status === 'fulfilled') {
      const body = result.value;
      if (key === 'room') {
        if (body.room?.schemaVersion === 1 && body.room.source && Array.isArray(body.room.sessions) && Array.isArray(body.room.tasks)) { state.room = body.room; state.roomError = ''; state.roomFetchedAt = new Date().toISOString(); }
        else state.roomError = 'The factory returned an unsupported snapshot.';
      } else if (key === 'status') { if (body.actions?.lastAction?.finishedAt !== state.status?.actions?.lastAction?.finishedAt) state.launchFetchedAt = new Date(0).toISOString(); state.status = body; state.statusError = ''; state.statusFetchedAt = new Date().toISOString(); }
      else if (key === 'launch') { state.launch = arr(body.checklist); state.launchFetchedAt = new Date().toISOString(); }
      else if (key === 'routes') state.routes = arr(body.routes);
      else if (key === 'factoryBootstrap') state.factoryToken = text(body.csrfToken);
      else if (key === 'cockpitBootstrap') { state.cockpitToken = text(body.csrfToken); state.actionIds = arr(body.actionIds); state.appOrigin = safeUrl(body.appOrigin, { local: true }); }
    } else {
      if (key === 'room') state.roomError = result.reason?.message || 'The factory source is unavailable.';
      if (key === 'status') state.statusError = result.reason?.message || 'The local cockpit is unavailable.';
    }
  });
  state.refreshing = false;
  // Preserve focused controls across background refreshes. Dialog contents and the search are not replaced.
  const focused = document.activeElement;
  const restoreFocus = $('#view-content').contains(focused) ? rememberFocus(focused) : null;
  renderView();
  if (restoreFocus && !document.querySelector('dialog[open]')) (findFocus(restoreFocus) || $('#main')).focus({ preventScroll: true });
  if (notify) toast(state.roomError ? 'Local view refreshed. Factory source remains unavailable.' : 'Workspace snapshot refreshed.');
  scheduleRefresh();
}
function scheduleRefresh() {
  window.clearTimeout(state.timer); state.timer = null;
  if (document.visibilityState !== 'visible') return;
  state.timer = window.setTimeout(() => { if (document.visibilityState === 'visible') void refreshAll(false).catch(error => toast(error.message)); }, 15_000);
}

hydrateIcons(document);
$('#global-search').addEventListener('input', event => { state.query = event.target.value.trim().toLocaleLowerCase(); renderView(); });
$('#refresh-all').addEventListener('click', () => { void refreshAll(true).catch(error => toast(error.message)); });
$('#workspace-info').addEventListener('click', () => openDetails('workspace', 'workspace'));
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view]');
  if (nav) { event.preventDefault(); navigate(nav.dataset.view, { focus: true }); return; }
  const detail = event.target.closest('[data-detail]');
  if (detail) { openDetails(detail.dataset.detail, detail.dataset.id); return; }
  const command = event.target.closest('[data-command]');
  if (command) { void performCommand(command).catch(error => toast(error.message)); return; }
  const action = event.target.closest('[data-action]');
  if (action) void runAction(action.dataset.action).catch(error => toast(error.message));
});
document.addEventListener('change', event => {
  if (event.target.id === 'session-filter') state.sessionFilter = event.target.value;
  else if (event.target.id === 'task-filter') state.taskFilter = event.target.value;
  else if (event.target.id === 'message-filter') state.messageFilter = event.target.value;
  else return;
  const id = event.target.id; renderView(); $(`#${id}`)?.focus({ preventScroll: true });
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { event.preventDefault(); $('#global-search').focus(); }
});
$$('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog(dialog); });
});
$('#handoff-form').addEventListener('submit', event => { void submitHandoff(event).catch(error => { $('#handoff-feedback').textContent = error.message; }); });
$('#handoff-form').addEventListener('input', () => { if (state.handoffBusy) return; state.handoffSent = false; state.handoffPending = null; $('#send-handoff').disabled = false; $('#handoff-feedback').textContent = ''; });
$('#connector-form').addEventListener('submit', event => { void submitConnector(event).catch(error => { $('#connector-feedback').textContent = error.message; }); });
$('#copy-connector-config').addEventListener('click', () => { if (state.connectorConfig) void copyText(state.connectorConfig).then(() => { $('#connector-feedback').textContent = 'Configuration copied. Add it only to the intended local client’s private settings.'; }).catch(error => { $('#connector-feedback').textContent = error.message; }); });
document.addEventListener('visibilitychange', () => {
  window.clearTimeout(state.timer); state.timer = null;
  if (document.visibilityState === 'visible') { if (Date.now() - state.requestStartedAt >= 10_000) void refreshAll(false).catch(error => toast(error.message)); else scheduleRefresh(); }
});
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
window.addEventListener('pagehide', () => { window.clearTimeout(state.timer); clearConnectorSecret(); });
navigate(location.hash.slice(1));
void refreshAll(false).catch(error => { state.refreshing = false; toast(error.message); renderView(); scheduleRefresh(); });
