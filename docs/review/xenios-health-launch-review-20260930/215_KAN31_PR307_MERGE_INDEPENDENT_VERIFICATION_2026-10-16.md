# KAN-31 PR #307 merge: independent verification and the next gate

**VERIFIED. PR #307 merged exactly as approved, and the merge deployed nothing.**

- **Who merged.** Root merged it (Doc461, account `teamxenios`, 2026-10-16T03:30:28Z). This reviewer did **not**
  merge, dispatch, deploy, run SQL or use credentials.
- **Why this session did not duplicate work.** Samuel's overnight takeover brief also reached this session. Root and
  Core were already carrying it out: Doc461 assigns the one-run tool packet to Core and the SQL reconciliation to the
  DB owner. This session therefore limits itself to independent verification and to its acceptance criteria.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. The checks used GitHub API reads, Git
objects and read-only Render metadata.

## 1. Merge facts, checked independently

- **The merge commit.** `main` = `b40d8bacb4e397cb36cfa1a1cd55fc3728c98076`, tree `cbe9dee5fc21448ade25f1d7668267d2c15299f2`.
  It is a normal merge commit with parents `6077a6bb` (the approved base, with no drift) and `0f5730a5` (the approved
  head).
- **Tree identity.** The merge tree is **identical** to the PR head tree (`git diff 0f5730a5 b40d8bac` is empty).
- **The file set.** `6077a6bb..b40d8bac` changes exactly three files:
  - added `.github/workflows/kan31-prepare-hosted-tools.yml`: 1,878 B, `65de554e…`, byte-identical to the reviewed
    `prepare-tools-workflow.UNAPPLIED.yml` (Doc 213);
  - added `tool-bundle-production-r1/produce-tool-bundle.UNAPPLIED.py`: 9,768 B, `21892fea…`, byte-identical to the
    reviewed producer (Doc 213);
  - modified `server/research/commerce/persistence/persistent-cart.test.ts`: only a `Date.now` pin to
    2026-07-27T20:00:00Z, with `beforeEach` and `afterEach` (Doc459/460 fixture decision).
- **Workflows on `main`.** Only `checks.yml` and the new manual-only `kan31-prepare-hosted-tools.yml`. The hosted
  browser workflow is **not** published.
- **CI.**
  - PR run `38845391000` passed test, typecheck and build. Supabase Preview was skipped, because per-PR preview
    branches are disabled.
  - Post-merge `main` run `38845861249`: build, typecheck and test all SUCCESS.
- **No dispatch.** The tool workflow has **no** runs.

## 2. Nothing deployed

- **GitHub.** No GitHub deployments for `b40d8bac`. The last deployment record is `production`, 2026-07-27.
- **Render** (full workspace listing, read-only):
  - staging `srv-d9h4f4m7r5hc73ctjng0`: auto-deploy off, branch `integration/xenios-research-track-b-commerce-activation`,
    live `65c9cc54` (`dep-d9h559ernols73emd3rg`), no events in the last 7 days;
  - production `srv-d8s9vej7uimc7384dfcg` (`xenios-website`): auto-deploy off, branch
    `release/early-access-code-session-checkout`, live `7bba4b6e` (`dep-db83lo8n74is73dln9dg`, manual,
    2026-10-15);
  - the only `main`-tracking auto-deploy service, `xenipspurple`, belongs to a **different** repository.
- **Supabase.** The Supabase GitHub check targets the production project, but preview creation is disabled and the PR
  touched no `supabase/` files.
- **Conclusion.** E33 is **not** deployed anywhere. The new journey is not live.

## 3. Acceptance criteria for the one-run tool packet (Core-owned)

Before I accept it, the packet must bind:

- **Source and inputs.**
  - repository `teamxenios/xenios-website`;
  - `source_commit = b40d8bacb4e397cb36cfa1a1cd55fc3728c98076`, the only input;
  - the workflow path, size and hash, and the producer path, size and hash, as in section 1;
  - workflow name `KAN31 pinned Linux tool preparation`, job `prepare`, `ubuntu-24.04`, 15-minute timeout,
    concurrency group `kan31-staging-exclusive`.
- **Scope of the run.**
  - the three fixed URLs with no retry;
  - the 4,096 MiB floor and a 600 s cooperative deadline;
  - the caps and the fresh exact scratch path;
  - the artifact `kan31-linux-tools-1.61.1-1228`, retained 7 days, with exactly four files.
- **Expected results.**
  - Playwright and playwright-core 1.61.1;
  - `chromium-headless-shell` revision 1228 / 149.0.7827.55;
  - Node v20.19.0 and npm 10.8.2 as **consumer** requirements. The producer is Python stdlib; record the runner's
    Python version.
- **What the run never touches.** No hosted browser qualification, customer states, SQL or deployment. This follows
  from source: the producer launches no child process, reads no secrets, and the workflow has `contents: read` only.
- **Billing.** Standard GitHub-hosted runner compute; Root confirms eligibility (an earlier billing lock occurred).
- **Window and authority.** One authorized run, with Samuel's explicit approval tied to `b40d8bac` and a stated
  window.
- **Evidence returned for my acceptance.**
  - the run ID and attempt;
  - the job conclusion and native exit status;
  - the producer's stdout JSON;
  - the artifact ID and the artifact-wrapper ZIP SHA-256, kept distinct from the nested `tool-payload.zip` SHA-256;
  - `toolchain-pins.UNACCEPTED.json`, `preparation-receipt.json` with the three download hashes, and the inventory
    hash.
- **Stop conditions.** Any non-zero exit, redirect, SRI or pin mismatch, cap breach, deadline, or missing file is a
  FAIL, with no retry.

## 4. Remaining gates, each separate

1. **Tool run.** Samuel authorizes the one tool-preparation run, then I accept its actual outputs.
2. **Staging deploy.** The Doc457 E33 staging-deploy authority is conditional and **not yet satisfiable**: staging's
   nonproduction environment and Supabase target are unverified. The Render MCP has no read-only environment listing,
   so the dashboard or an approved read method is needed.
3. **Hosted workflow publication** (Doc 214 version `bde6c639`), under its own placement authority.
4. **Inputs at run time.** A and B session states and the run manifest, plus a provider proof no more than 5 minutes
   old, collected only in a real window.
5. **SQL.** The Doc 212 executable conditions apply: the executor role, the schema present, and a frozen query with
   approval.
6. **The hosted run.** Run authorization, then my final-result review.
7. **Release.** Separate.

**Main CI result, recorded at 2026-10-16T03:32Z.** Run `38845861249` on `b40d8bac` completed with build, typecheck and test all SUCCESS.

NOT LIVE.
