# KAN-31 consumer workflow mode correction: changed lines only

**PASS at source scope. The Doc 213 downstream mode gap is closed.**

- **Accepted.** Workflow `bde6c639` (8,786 B) at Core `ebfe527e` (tree `8d4c9883`, parent `9c3b5df7`) is accepted as
  the replacement for the accepted consumer workflow `7115ad88`.
- **Unchanged.** Every other accepted file.
- **Kept.** The current Doc455 SQL, as Samuel directed, with all Doc 212 executable conditions. No optional
  strengthening.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: `git diff 9c3b5df..ebfe527e`,
which touches exactly one file, with 68 lines added and 11 removed. No execution or publication; no agents.

## Checks

- **The wrapper is no longer trusted for modes.** The comment says outer-wrapper modes are untrusted.
  - Every extracted file starts at `0600`, and only regular files and directories are admitted (`S_IFMT` of 0, file
    or directory).
  - Names are validated **before** `extractall`: non-empty, no backslash, not absolute, no `..`, canonical, unique
    after stripping a directory's trailing slash.
  - At the top level, only `tools/**`, `run-manifest.json`, `provider-proof.json` and `tool-inventory.json` are
    allowed, and there are no other top-level directories.
  - The total is at most 2 GiB and at most 100,000 entries.
- **The pin chain is intact before any mode is restored.**
  - Repository variable `XENIOS_FROZEN_MANIFEST_SHA256` pins the manifest's bytes. The manifest is parsed with
    duplicate-key rejection.
  - Its `toolchain.inventorySha256` then pins the inventory's bytes, and the inventory is parsed the same way.
  - Each entry has exactly the keys `path`, `bytes`, `mode` and `sha256`. Paths are safe and unique, `mode` is
    exactly `0644` or `0755` (an integer, not a boolean), and `bytes` is a bounded integer.
  - Each target must be a regular file, not a symlink, of the exact size, with a streamed SHA-256 that matches.
  - The extracted `tools/` set must equal the inventory set exactly, with no symlinks or special files.
  - Only after **every** path and byte check passes are the pinned modes applied.
- **The strict verifier is still independent.** `verify-tools.UNAPPLIED.mjs` (`85ee0855`) is unchanged and still
  re-checks the inventory hash, exact set, bytes and `(st_mode & 0o777) === item.mode`. The mode check is not
  weakened.
- **No new attack surface.** It runs as `python3 -I`; asserts stay active, since `-I` is not `-O`. No new
  permissions, inputs or network calls; the one added environment value is the existing frozen-manifest variable.
- **Consumer fit.** The producer (`21892fea`) writes inventory modes of exactly `0644` or `0755`, and its payload
  layout matches the allowed top level. The browser and contracts (`050b0409`) are unchanged.

## Still reserved

- **Doc 213 production conditions.** Samuel's run authorization, a window and billing; placement scope; and reviewer
  acceptance of the actual hashes and IDs.
- **Qualification archive assembly.** With the actual manifest, a provider proof no more than 5 minutes old, and the
  reviewer's `acceptanceReference`.
- **Provider-only identity.** Explicit acceptance of the provider-only served-identity basis.
- **Staging deploy.** An approved E33 staging deploy.
- **Doc 212 SQL conditions.** The `postgres` role against the actual executor, the schema present, a frozen query
  and SQL approval, and negative controls separately authorized.
- **Admission.** Exact mutation admission.
- **Production.** Separate.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | consumer workflow mode correction (Core ebfe527e / tree 8d4c9883; workflow bde6c639, 8786 B; only file changed) | reviewer 6abf1edf | PASS at source scope, Doc 213 gap closed: wrapper modes untrusted, files extracted 0600, names/top-level set validated before extract, manifest pinned by repo var -> inventory pinned by manifest -> every file's bytes/hash and exact set checked, then only 0644/0755 pinned modes restored; unchanged verify-tools still independently enforces modes. Current Doc455 SQL kept with Doc 212 conditions | still reserved: tool-production run authorization/window/billing, hash acceptance, archive assembly with fresh proof, provider-only identity acceptance, E33 staging deploy, SQL executor/schema/approval, mutation admission | doc 214.`

Not execution, publication, deployment, approval or production consent; not human approval.
