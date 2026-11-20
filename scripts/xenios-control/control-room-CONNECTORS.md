# Control Room MCP connector — review candidate

This folder is an additive review artifact outside the live repository. It has not been installed into any Codex, Claude, Muse, or Ollie session. The tests use a local mock coordinator, not the Windows factory or a native MCP client. No production connection, delivery, ownership change, acceptance, or deployment has been verified by these files.

## What the adapter does

`control-room-mcp.mjs` is a zero-dependency Node.js 20+ stdio MCP server. A configured agent client can call five tools against the existing coordinator:

| Tool | Coordinator operation | Meaning |
| --- | --- | --- |
| `factory_status` | `inbox` | Credential-bound coordinator read of session identity, revision, and inbox counts. No provider-authentication, heartbeat, or work-state inference. |
| `factory_inbox` | `inbox` | Read the bound session's messages and tasks. Reading does not mark delivery. |
| `factory_acknowledge` | `receipt` | Explicit `delivered`, `acknowledged`, or `working` receipt for an original handoff. |
| `factory_submit_result` | `receipt` | Explicit `result_submitted` receipt with evidence. It does not accept or close the task. |
| `factory_heartbeat` | `heartbeat` | Explicit observed state. It does not renew leases or mutate canonical ownership/task state. |

This is a tool connection that an agent uses. It does not attach to private provider state, launch or resume agents, send messages to unrelated provider sessions, poll, create timers, execute shell commands, auto-acknowledge work, or change deployment flags. The canonical coordinator remains the authority for identity, revisions, receipts, permissions, and task ownership.

## Prerequisites and identity

1. The reviewed coordinator must already serve `/api/control-room/bridge` on the Windows host. This file does not install that endpoint or bootstrap/adopt coordinator authority.
2. The intended session must already be registered canonically.
3. Provision its connector in the Control Room. The credential is bound to that session and expires after 24 hours under the API contract. Revocation takes effect at the coordinator.
4. Place the reviewed bridge file at a known absolute path on that same host. The paths below are placeholders to replace with that actual path.
5. Supply `XENIOS_FACTORY_TOKEN` to the intended native client's process through its local launch environment. Do not place the real token in a prompt, Jira, Git, shared docs, command arguments, or browser storage.

**Do not share one credential across different factory session identities.** Each participating session needs its own correctly bound connector. A globally configured MCP entry is safe only if each client's launch environment supplies that client's own credential; a single shared global token would misattribute receipts. Restart or reconnect the particular client through its supported workflow after configuration or credential rotation.

## Network and protocol boundaries

- Default: `http://127.0.0.1:4177/api/control-room/bridge`.
- `XENIOS_FACTORY_URL` may override the origin only with literal HTTP `127.0.0.1` or `[::1]`, optionally with a valid port. No DNS names, credentials, remote address, path, query, or fragment. An override does not make another origin compatible with the coordinator's Host/Origin checks.
- Every request is a direct POST with JSON and `Authorization: Bearer …`. The native bridge omits Origin; it never reads a browser CSRF token. HTTP redirects are rejected, and proxy environment variables are not used.
- The production limits are a 64 KiB JSON input line, 32 KiB outgoing HTTP body, 1 MiB response body, 2 MiB serialized result, and a **65-second total HTTP deadline**. A receipt may require a coordinator read and write, each with a 30-second CLI budget; this outer bound lets their owned-helper cleanup finish. Calls are processed in order with input backpressure. There is no automatic retry of a mutation, polling, wakeup, or schedule.
- The example native-client call timeout is 75 seconds, allowing the bridge's 65-second deadline to return its own result first. These are finite integration budgets, not measured performance or native Windows qualification. Local tests inject much shorter limits and do not wait 65 seconds.
- Receipt summaries are limited to 3,000 characters; heartbeat summaries are limited to 500 characters, matching the coordinator. A connector heartbeat reports the credential holder's stated observation; it does not independently authenticate a Codex/Claude runtime or prove model activity.
- Supported MCP protocol versions: `2025-11-25`, `2025-06-18`, `2025-03-26`, and `2024-11-05`. Initialization negotiates the requested supported version or returns the latest supported version. Clients must disconnect if they cannot use that returned version.
- Send `notifications/initialized` after `initialize`. Valid notifications receive no response and do not call factory tools. Only `ping`, `initialize`, `tools/list`, and `tools/call` requests are implemented; no resources, prompts, subscriptions, sampling, task extension, or command execution capability is advertised.
- Output is newline-delimited JSON-RPC only. Credentials are never logged. Responses are scrubbed if the coordinator echoes the connector credential or a sensitive field.

Protocol references: [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) and [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports). This implementation deliberately uses the common request/response subset; it does not claim every optional feature in these protocol versions.

## Configure a Codex MCP client

Codex supports stdio MCP entries with `command`, `args`, explicit `env`, and forwarded `env_vars`. Review an entry like this in the appropriate supported configuration scope, replacing the path:

```toml
[mcp_servers.xenios_factory]
command = "node"
args = ["C:/PATH/TO/control-room-mcp.mjs"]
env_vars = ["XENIOS_FACTORY_TOKEN"]
tool_timeout_sec = 75

[mcp_servers.xenios_factory.env]
XENIOS_FACTORY_URL = "http://127.0.0.1:4177"
```

Use the client's `/mcp` view to check the configured server, then call `factory_status`. Do not confuse configuration being present with a successful coordinator read. Preserve the client's existing tool-approval policy.

Official configuration: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp). The supported direction here is **Codex as MCP client → this bridge**. It does not use the removed `codex mcp-server` command described in the [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk).

## Configure a Claude Code MCP client

Claude Code supports local stdio servers, project `.mcp.json`, and environment-variable references in configuration. A configuration shape is:

```json
{
  "mcpServers": {
    "xenios_factory": {
      "command": "node",
      "args": ["C:/PATH/TO/control-room-mcp.mjs"],
      "timeout": 75000,
      "env": {
        "XENIOS_FACTORY_URL": "http://127.0.0.1:4177",
        "XENIOS_FACTORY_TOKEN": "${XENIOS_FACTORY_TOKEN}"
      }
    }
  }
}
```

Supply the variable before launching the correctly identified session. The placeholder is not a credential; the bridge rejects an unexpanded placeholder. Review any project-server approval Claude requests. Use `/mcp` and a `factory_status` call to verify the connection. A successful `claude mcp add` only proves configuration was written.

Official source: [Claude Code MCP](https://code.claude.com/docs/en/mcp), including local stdio servers, configuration scopes, environment expansion, and connection-status checks. This artifact has not changed those settings or run a native Claude connection.

## Muse, Ollie, and generic agents

Any agent runtime that actually supports an approved local stdio MCP client can use the same bridge and five tools. Its provider label is metadata assigned when the coordinator provisions the connector; it does not create a connection.

Ollie's ChatGPT dot may use enabled plugins and a connected computer under the account's permissions. A cloud-only dot cannot reach the Windows host's `127.0.0.1`. A plugin, supported connected-computer execution, or an explicitly designed authenticated remote bridge is still required. This artifact supplies none of those remote transport layers and does not expose the cockpit to the internet. Muse's runtime and available API have not been verified. Keep both marked `not_configured` until an actual capability and receipt check succeeds.

Official context: [Dots and connected tools/computers](https://learn.chatgpt.com/docs/dots) and [MCP connections for ChatGPT and Codex](https://learn.chatgpt.com/docs/extend/mcp). Neither source establishes a Muse/Ollie-specific API or a connection to this factory.

## Agent operating sequence

1. Call `factory_status` to confirm the bound identity and reachability. If the identity is wrong, stop using that credential and correct its provisioning.
2. Call `factory_inbox`. Read the original handoff and its acceptance criteria. Preserve the returned revision and original message ID.
3. Record `delivered` only when the handoff has actually reached this session. Record `acknowledged` only after reading it. Record `working` only when work starts. Each receipt requires a caller-generated UUID, a factual summary, and a fresh revision. The bridge never chooses these stages for the agent.
4. Heartbeats require an explicit observed state and a positive sequence that increases for the connector credential, including across bridge restarts. The authority rejects repeats or regression. Keep sequence state in the client's approved operational state; this bridge does not infer it from prior transcripts or invent a heartbeat.
5. Submit results with evidence, exact versions, and limitations. Source reading, parsing, mock tests, hosted CI, a browser capture, independent acceptance, and production deployment are different facts. Do not label one as another.
6. A result receipt is not a reviewer verdict or a release action. Read the next handoff and follow the registered owner/coordinator workflow.

Example receipt arguments (replace all illustrative IDs and values with current ones):

```json
{
  "operationId": "02906566-901a-45a8-994f-fc3f65c0545a",
  "messageId": "ORIGINAL-HANDOFF-ID",
  "expectedRevision": 12,
  "stage": "acknowledged",
  "summary": "Read the handoff and acceptance criteria. The requested review has not started yet."
}
```

Use `factory_submit_result` with the same required field names but omit `stage`; the tool fixes it to `result_submitted`. Every distinct operation needs its own UUID. After a timeout, connection loss, or `mutation_outcome_unknown` response, the write outcome can be unknown. Read the inbox to check whether it committed. An identical retry must keep its operation ID and payload. The explicit unknown-outcome error preserves the caller's operation ID. A 409, including an `operation_identity_conflict`, requires inspecting the current revision/outcome; creating another ID to evade a conflict is not a recovery strategy.

## Local validation and remaining verification

Run from this folder:

```text
node --check control-room-mcp.mjs
node --test control-room-mcp.node-test.mjs
```

The test suite uses temporary HTTP servers bound to loopback and an actual stdio child process. It checks explicit-only mutations, credential-bound payloads, invalid argument rejection, token redaction, redirects, network deadlines, bounded payloads, false success rejection, version negotiation, framing recovery, notification silence, and absence of shell/provider-control tools.

Local test results are reported separately with the exact Node version. The source uses Node 20-compatible APIs; execution on Node 20 is not yet verified. No native client or production coordinator was exercised. Before adoption, run the suite with the factory's pinned Node, then verify a single provisioned test session through the real coordinator: status, inbox, an intentional ACK, and the corresponding canonical receipt. Do not describe the connector as live before those receipts exist.

## Protocol correction source successor (qualification pending)

The immutable original package and its37 Node24/Linux mock tests are historical. This source successor adds controls without claiming a pinned/native or rendered pass.

A browser send freezes one operation UUID, complete payload AND expectedRevision. Editing, reopening the dialog, refreshes, lost responses and409 errors never discard that attempt. The form stays read-only until it is resolved. Reconcile original send explicitly repeats that exact operation at /api/control-room/handoffs/reconcile; it can finish or replay only the original authorized send. A confirmed native replay resolves recorded. Only the strict coordinator's exact coordination_revision_conflict from this explicit reconciliation, with matching UUID/revision proof, resolves not_recorded before a new intentional send. operation_identity_conflict and related ID conflicts remain held for canonical operator investigation; refresh alone is not reconciliation. No parallel outbox/authority was added. This attempt is in-tab state with an unload warning, not crash-durable storage; if a tab/process is lost, preserve any available original UUID and have the existing owner inspect canonical receipts before a replacement.

Calendar validation uses the accepted assurance boundary's calendar/clock/offset contract while retaining valid original text. Invalid/timezone-less/impossible observations remain unknown; observations more than30seconds ahead or older than90seconds remain stale, without reported work-state claims. Connection claims also require a current authoritative source observation. Invalid creation/expiry chronology cannot authenticate a connector; the exact expiry instant is expired. This does not modify the original assurance source.

Both factory_status and factory_inbox now return messageCount (the authoritative total), messagesTotal, messagesReturned and messagesTruncated. Returned equals the actual bounded array length, total is a safe integer no smaller than returned, and truncated is exactly total>returned. Missing/inconsistent evidence is an invalid_response, not a complete inbox claim. Reading never generates an ACK/result/heartbeat, even when1001 addressed messages require a1000-item projection.