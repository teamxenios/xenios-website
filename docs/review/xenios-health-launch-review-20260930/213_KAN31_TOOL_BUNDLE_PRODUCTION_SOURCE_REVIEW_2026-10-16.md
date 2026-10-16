# KAN-31 pinned Linux tool-bundle production: source review

**PASS at source scope for the one bounded tool-production operation.** It is suitable for Root to bind and for
Samuel to authorize.

**One material downstream compatibility gap must be resolved before the hosted browser run.** It does not block this
production run. File modes are lost through the GitHub Actions artifact transport the accepted consumer relies on.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Method.** Read-only: Git objects of Core `9c3b5df7` and the accepted consumer `050b0409`. No download, parse, run,
  push or deploy, and no agents.
- **Not reopened.** Docs 208, 210, 211 and 212 are unchanged.

## 1. Identity

- **Commit.** Core `9c3b5df7` (tree `29ea2dbc`, parent `050b0409`) adds exactly three files under
  `tool-bundle-production-r1/`:

| File | Size | Hash |
|---|---|---|
| `APPROVAL_SCOPE.md` | 8,051 B | `b7609568…` |
| `produce-tool-bundle.UNAPPLIED.py` | 9,768 B | `21892fea…` |
| `prepare-tools-workflow.UNAPPLIED.yml` | 1,878 B | `65de554e…` |

- **Unchanged.** Accepted browser source and E33 are unchanged.

## 2. The bounded operation conforms

- **Network.**
  - Exactly three fixed URLs (the playwright and playwright-core 1.61.1 npm tarballs, and the CfT 149.0.7827.55
    linux64 headless shell) with no retries.
  - Environment proxies are disabled, redirects are refused, and `response.url == url` is required.
  - Each response is capped at 256 MiB and the total at 512 MiB, with a 20 s socket timeout.
- **Supply-chain checks.**
  - Both npm tarballs must match frozen SHA-512 SRI, and `package.json` name and version are re-checked.
  - `browsers.json` must pin `chromium-headless-shell` revision 1228 / 149.0.7827.55.
  - The browser ZIP has no independent pre-known hash. Its post-download SHA-256 is only recorded, and the scope says
    so honestly.
- **Archives fail closed.** Absolute paths, `..`, backslashes, a wrong root, duplicates, symlinks, hard links and
  special members are all refused.
  - Package files are written `0644`. Browser files are `0755` only if the archive marks them executable, and the
    main binary is forced to `0755`.
  - Unpacking is capped at 1.5 GiB and 100,000 files.
- **Containment.**
  - Linux x64 only, with a `MemAvailable` floor of 4,096 MiB. The browser's 2,048 MiB floor is unchanged.
  - The output path must be exactly `$RUNNER_TEMP/kan31-tool-bundle-r1` and must not already exist. Nothing is
    deleted on failure.
  - The deadline is a cooperative 600 s, with a 15-minute job timeout.
  - No child process, `npm install`, lifecycle script, browser launch or test. Python stdlib only.
- **Outputs.**
  - The inventory records `{path, bytes, mode, sha256}`, in the accepted `verify-tools` format.
  - `tool-payload.zip` contains only `tool-inventory.json` and `tools/**`, with each file's mode written into
    `external_attr`.
  - Pins carry every field the consumer reads. `acceptanceReference` is null until a reviewer accepts.
  - The receipt records the actual URLs, bytes and hashes.
- **Workflow.** Manual dispatch on `ubuntu-24.04`, `contents: read`, no persisted credentials, an exact clean
  checkout, the shared exclusive concurrency group, a 15-minute job timeout, and a single 7-day artifact.
- **Consumer fit, by source.**
  - The entry `node_modules/playwright/index.mjs` resolves its sibling `playwright-core`. The consumer passes the
    executable path explicitly, so no registry lookup is needed.
  - `verify-tools` walks `tools/` against the inventory, exactly matching relative paths and modes.

## 3. Material downstream gap: file modes through the Actions artifact

- **What the accepted consumer does.** Workflow `7115ad88` (lines 52–73) downloads
  `actions/artifacts/<id>/zip` and extracts **that wrapper ZIP** directly. It takes each file's mode from
  `external_attr` and requires `mode & 0o400`. `verify-tools` (line 24) then requires `(st_mode & 0o777) === item.mode`.
  The browser binary is inventoried as `0755`.
- **Why it breaks.** `actions/upload-artifact` documents that file permissions are not maintained: files come back
  `644` and directories `755`.
- **The consequence.** If Root builds the qualification-input artifact (tools, inventory, manifest and proof) with
  `upload-artifact`, the browser executable arrives without its execute bit. `verify-tools` then refuses with
  `TOOL_MODE`. If extended attributes are absent, extraction may even fail the `0o400` check.
- **Why the plan has no remedy.** Nesting `tool-payload.zip` inside the artifact does not help, because the consumer
  extracts only the outer wrapper. The scope's assembly plan does not address this.
- **The failure is closed, not silent**, but the accepted pipeline cannot pass as planned. I did not catch this in
  Doc 209 or 211, and record that here.
- **Smallest correction, chosen before any qualification archive is built:**
  1. **Preferred:** Root demonstrates a transport whose Actions artifact ZIP preserves Unix modes in `external_attr`,
     verifiable from the downloaded wrapper's bytes before dispatch. That leaves the consumer unchanged.
  2. **Otherwise:** a reviewed, minimal change to the accepted consumer workflow. After extraction, it would restore
     each file's mode from the hash-pinned `tool-inventory.json` before `verify-tools` runs. That changes an accepted
     file and needs its own narrow review.

  Lowering or removing the mode check is **not** acceptable.

## 4. Conditions for this production run

- **Authority.** Samuel's actual authorization of this single run, with a fresh window, the exact source SHA and
  owner, and confirmation of billing eligibility.
- **Placement.** Workflow placement on the default branch under the path owner's publication scope, with no blind
  merge or skipped checks.
- **No auto-retry.** Any non-zero exit, redirect, SRI or pin mismatch, cap breach or deadline is a FAIL.
- **Reviewer acceptance of actual outputs.** The real download hashes, the browser ZIP SHA-256, the inventory and
  payload SHA-256, and the actual artifact ID and digest, kept distinct from the nested payload hash.
- **Separately admitted checks.** ELF and library prerequisites, and the Node import and parse checks, follow under
  separate admission.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | tool-bundle production (Core 9c3b5df7 / tree 29ea2dbc: scope b7609568, producer 21892fea, workflow 65de554e) | reviewer 6abf1edf | PASS at source scope for the one bounded run: 3 fixed URLs, no retry/redirect/proxy, npm SRI + metadata + browsers.json revision 1228 pins, fail-closed archives, 0644/0755 modes, caps, 4096 MiB floor, fresh exact scratch, no child/install/launch, consumer-format inventory and pins, contents:read. MATERIAL DOWNSTREAM GAP: accepted consumer extracts the Actions artifact wrapper and verify-tools requires mode 0755 on the browser, but upload-artifact does not preserve permissions, so the qualification archive would refuse TOOL_MODE; fix before assembly by a mode-preserving transport proven from wrapper bytes, or a reviewed minimal consumer change restoring modes from the pinned inventory (never weaken the check) | conditions: Samuel's run authorization + window + billing, default-branch placement scope, reviewer acceptance of actual hashes/IDs | doc 213.`

Not execution, download, push, deployment, approval or production consent; not human approval.
