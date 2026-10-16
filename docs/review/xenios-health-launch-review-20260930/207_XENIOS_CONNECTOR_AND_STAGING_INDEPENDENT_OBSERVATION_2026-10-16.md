# Xenios connectors and Render staging: independent observation from the reviewer session

**Observation, not a review disposition or authority.** Samuel asked every session to audit its connectors and staging.
This records what the original reviewer session can see and reach, and what is safe.

- **What I did.** Read-only metadata reads only: GitHub CLI auth status; the connector status list; Supabase
  `get_project` for the staging project; Render `list_workspaces`, `get_service` and `list_deploys` for the staging
  service.
- **What I did not do.** No configuration, SQL, environment-variable read, deploy or mutation. No token value was read
  into this record or printed.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session; no agents.
- **Timing.** Observed at 2026-10-16T01:13–01:14Z.

## 1. Connections in this Claude reviewer session

| Integration | State | Notes |
|---|---|---|
| GitHub (`gh`) | Works | Accounts `teamxenios` (active) and `Sboadu1212`, keyring tokens, scopes `repo`, `workflow`, `read:org`, `gist`. No setup needed. |
| Render MCP (user config) | Works, 23 tools | One workspace, `tea-d8nhh6a8qa3s73f4ocj0`. Its tools include mutating ones (deploy, environment-variable updates, create). |
| Supabase (claude.ai connector) | Works, 29 tools | **Account-wide, not scoped to staging, and write-capable**: `execute_sql`, `apply_migration`, `deploy_edge_function`, `pause_project`, branch tools, across every project including production. This does not meet Samuel's rule 3. |
| `supabase-xenios-prod` (project `.mcp.json` in `C:/xenios-wt/general-platform`, untracked) | **Fails** (HTTP 401) | Points at **production** `yvzeduaxbwgcwllhywff`, with `features=database` and no `read_only`. It carries a **hard-coded Authorization header in the file**, which also disables OAuth. |
| Atlassian / Jira | **Not present** | No Jira tools in this session. Root relays to Jira. |

## 2. Supabase staging and Render staging, as observed

- **Supabase staging.** `tetynodzrtmdbuzgboro` is `xenios-research-staging`, us-west-2, `ACTIVE_HEALTHY`, Postgres 17.6.
- **Render service `srv-d9h4f4m7r5hc73ctjng0`.** Service `xenios-research-staging`, at
  `https://xenios-research-staging.onrender.com`.
  - **Plan:** free, so it spins down when idle and has cold starts.
  - **Deploys:** `autoDeploy` is off, and there is no health-check path.
  - **Commands:** build `npm run render-build`, start `npm start`.
  - **Source:** repo `teamxenios/xenios-website`, branch `integration/xenios-research-track-b-commerce-activation`.
- **Deployed commit.** The live deploy (`dep-d9h559ernols73emd3rg`, 2026-07-23) runs commit **`65c9cc54`**.
  - It is **not** an ancestor of the KAN-31 candidate `e33c12a9`. Their merge base is `1ad388f` (2026-07-21), and `e33`
    carries 1,625 commits that `65c9cc54` lacks.
  - **So the existing staging service does not serve the candidate.** Any qualification against it today would test a
    different, three-month-old application.
- **Environment.** I did not verify environment-variable names or the target Supabase project. The Render MCP has no
  read-only environment-variable listing tool. Its only environment tool is `update_environment_variables`, which
  mutates. This item is **unverified**.

## 3. Assessment of the proposed CI and Render path

- **What exists.** The candidate already has a secret-free `checks.yml` (vitest, typecheck, build) and `e2e/` specs, but
  no Playwright dependency or config. Its browser qualification uses the KAN-31 harness and driver.
- **Why the path is reasonable.** A GitHub Actions job against Render staging removes the repeated PowerShell credential
  entry. Staging-scoped secrets would be entered once by Samuel in the GitHub and Render web UIs, never in chat.
- **What it needs first:**
  1. **Staging deploy (mutation).** Approved deployment of the exact `e33c12a9` (or successor) build to Render staging,
     with the deployed commit then read back through the Render API.
  2. **Environment check.** Render environment names and target project verified through the dashboard or an approved
     read method.
  3. **New method.** A new workflow, harness adapter or Playwright dependency is a new test method. It needs its own
     source review, permission and evidence, and does not inherit G0 credit, as Samuel's rule 6 says.
  4. **Timing budgets.** Allowance for free-plan cold starts, which interact with the frozen timing budgets.
  5. **Billing.** Earlier GitHub Actions runs hit a billing lock, so that should be confirmed first.
- **The local G0 path.** It remains available but blocked by the Doc 206 gate: the consumed G0 outputs and grant must be
  archived and removed from their fixed paths, and there must be a new decision, approval, window and command.

## 4. Safety recommendations (approval needed, not done)

1. **Remove the production entry.** Remove the `supabase-xenios-prod` entry from the untracked `.mcp.json`. Treat the
   embedded credential as exposed and revoke it in Supabase, even though it is currently rejected.
2. **Scope Supabase to staging.** For engineering use, add a project-scoped, read-only Supabase MCP using OAuth only,
   with no header: `https://mcp.supabase.com/mcp?project_ref=tetynodzrtmdbuzgboro&read_only=true`. Do not use the
   account-wide connector for engineering.
3. **Jira.** Add the official Atlassian connector through claude.ai connector settings, or `/mcp` in a terminal session.
   Samuel completes the OAuth once.
4. **Render mutations.** Treat every Render deploy or environment change as a staging mutation that needs Samuel's
   approval.

## 5. Shortest independently qualified path for the Quick Order journey

**Recommended order:**

1. Make the connector changes in section 4.
2. Samuel approves deploying `e33c12a9` to the existing Render staging service, with the deployed commit read back.
3. Run a one-time environment check on Render. Samuel enters staging secrets once in Render and GitHub, not in
   PowerShell.
4. Write a minimal Actions workflow that runs the existing e2e acceptance against the staging URL at the exact SHA. It
   gets its own reviewed source and admission.
5. Use that run's artifacts as the browser evidence, then do the Doc399 populated query under its separate authority.
6. My final-result review.

**Alternatively**, finish the local G0 path after the Doc 206 gate. Production stays a separate, explicit approval. NOT
LIVE.

## Correction (2026-10-16T02:05Z)

Two statements above are wrong:

- the claim that the `supabase-xenios-prod` entry "carries a hard-coded Authorization header in the file";
- the advice to "treat the embedded credential as exposed".

The header value is the environment-variable reference `Bearer ${SUPABASE_ACCESS_TOKEN}`, not a stored token.
`claude mcp list` reports the variable as missing, which is why the entry fails. No credential is stored in
`.mcp.json`, so no revocation follows from this file.

The remaining recommendation stands: remove or replace this entry. It still targets **production** with database
tools and no `read_only`.

**Update after Samuel's connector changes.** These were observed and read-only:

- **Atlassian:** the connector is connected, Jira site `xeniostechnology` is reachable, and KAN-31 is readable.
- **Render:** a claude.ai connector was added alongside the user-config one.
- **Supabase:** the staging-scoped, read-only Supabase server is not yet visible in this session. The account-wide
  Supabase connector and the production `.mcp.json` entry are still present.
