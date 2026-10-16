# KAN-31 PR #310 publication and E33 staging deployment: independent verification

**VERIFIED.**

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. The checks used GitHub API reads, Git objects and
read-only Render metadata. No dispatch, SQL, credential use or deployment by the reviewer.

## PR #310

- **The merge.** Merged 2026-10-16T16:15:51Z as `e219745f304fb2ecef1fa9811e0a03eed07807ff`, a normal merge whose
  parents are base `f7b498ad` and head `73a5da77`. `main` is still at that merge.
- **The change.** Exactly one file: `.github/workflows/kan31-hosted-browser.yml`, now 11,369 B, SHA-256
  `cc1d1f62…`. That is byte-identical to the Doc 220-accepted `workflow-inputs.UNAPPLIED.yml`.
- **CI.** PR run `38930243785` and main run `38930565362` both passed test, typecheck and build.
- **No dispatch or deployment.** The hosted workflow has zero runs, and there are no GitHub deployments for the merge
  SHA.

## Staging

- **What it serves.** `srv-d9h4f4m7r5hc73ctjng0` is live on `e33c12a999536cc87c7c0153e482220c533b9624`, deploy
  `dep-db936j2vcj2c73bnr98g`, a manual deploy finished 2026-10-16T14:24:34Z.
- **Settings unchanged.** Auto-deploy is still off and the branch setting is unchanged. Render deployed the exact
  commit, which resolves the Doc 464 branch concern.
- **Rollback target.** `dep-d9h559ernols73emd3rg` (`65c9cc54`), now deactivated.
- **Identity basis.** Served identity rests on the provider-only basis: Render's deployed commit.

## Remaining

- private A-preflight and A/B capture authorization;
- the exact populated manifest and provider proof, with Samuel's run approval and my final check against the same
  manifest SHA-256;
- the hosted dispatch;
- Doc455 SQL after receipts;
- staff read-back;
- production, which is separate.

The tools artifact `12033375179` expires around 2026-10-23.

NOT LIVE.
