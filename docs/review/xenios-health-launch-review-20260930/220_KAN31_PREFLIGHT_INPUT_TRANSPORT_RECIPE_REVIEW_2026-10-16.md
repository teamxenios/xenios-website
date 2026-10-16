# KAN-31 private preflight, workflow input transport and continuous recipe: narrow review

**ACCEPTED at source scope,** with conditions.

- **Scope.** The new four-file delta at Core `8e70a025` (tree `60228f96`, parent `96c9137c`) is accepted. It closes
  the two gaps Root identified: the missing authenticated catalog and config snapshots, and the incompatible
  input-archive format.
- **Unchanged.** E33 and the accepted browser modules.
- **What this is not.** Not publication, capture or dispatch authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only against E33 `e33c12a9`, accepted
browser `050b0409`, accepted workflow `bde6c639` and the Doc462 tool-run evidence; nothing run; no agents. Doc470
(installation pass) is noted, not re-checked.

## Identity

The files match Root's Doc472 bindings:

| File | Size | Hash |
|---|---|---|
| `private-session.UNAPPLIED.mjs` | 7,370 B | `7606dcfe…` |
| `private-preflight.UNAPPLIED.mjs` | 6,305 B | `39453258…` |
| `workflow-inputs.UNAPPLIED.yml` | 11,369 B | `cc1d1f62…` |
| `CONTINUOUS_EXECUTION_CANDIDATE.md` | 9,482 B | `fb557d71…` |

## Checks

- **Helper delta, against Doc 219's `96c9137c`.**
  - It retains the bearer only from a successful same-origin `member/me` response, in memory, and never records it.
    It is cleared after the preflight.
  - The preflight runs only for A, after READY, inside the existing 5-minute bound and the route lock. Its output is
    exclusive-create, and all Doc 219 guards remain.
- **Preflight.**
  - Only fixed same-origin GETs: up to 50 catalog pages of 100, then config. Each request has a 10 s limit, with
    60 s in total, 4 MiB per response and 32 MiB in aggregate, and redirects are errors. No POST is added.
  - It requires a stable total, complete pages and unique items, and refuses unknown item or config keys. Care
    pricing must be null.
  - Snapshot hashes use the **same** canonical serializer as the accepted `contracts.mjs` and the same pagination as
    the hosted `catalog()`. Any catalog or config drift between preflight and run therefore fails closed.
- **The fixtures match E33's actual form payload.**
  - Contact keys are exactly those `captureContact` builds. `line2` is omitted when empty, since the form sends
    `undefined`, and `billingAddress` equals `shippingAddress` when billing is the same.
  - Lines follow plan order.
  - Agreements are `requiredAgreements` followed by the `always` and `research_use_only` form acknowledgments, in the
    same order as `requiredAcknowledgmentEntries`. A mixed cart includes research-use-only items.
  - So the hosted `FIRST_BODY_FACTS` and `AGREEMENTS_PREBOUND` exact comparisons can pass with real data.
  - The selection rule is deterministic, from the prior driver, with no substitution.
  - `acceptedAt` and the fingerprint are correctly **not** precomputed; they keep the accepted pre-forwarding freeze.
- **Workflow input transport, against `bde6c639`.** The diff is limited to:
  - pinning the existing tools artifact `12033375179`, its wrapper digest `73e53b02…`, and the inner
    `tool-payload.zip` (112,171,775 B, `20658921…`). All three match the Doc462 run evidence (`artifact-api.json` and
    `job.log`);
  - streaming the inner payload with an exact-size bound before the unchanged safe extraction, verification and
    mode-restore logic;
  - taking the manifest (at most 32,768 B), the provider proof (at most 8,192 B) and the manifest SHA-256 as dispatch
    inputs, passed through `env` rather than interpolated into the script;
  - rejecting duplicate keys, binding the manifest to its SHA-256 and the proof to `providerProofSha256`, and writing
    both files `0600`.

  The total inputs stay under GitHub's 65,535-character dispatch limit. The unchanged modules run afterwards.

## Conditions

1. **Where the manifest pin comes from.** The pin now comes from a dispatch input, not a repository variable, so the
   dispatcher supplies both the bytes and their hash.
   - Samuel's final approval and my final-manifest disposition must bind the **exact manifest SHA-256**.
   - After the run, the recorded dispatch inputs must be checked against it.
2. **Everything in the inputs is public.** The repository's Actions runs are public, so the manifest, provider proof
   and run outputs are publicly visible.
   - They must contain no secrets and no personal or underlying customer identifiers, including in the custodian or
     eligibility reference. Only the accepted state-digest bindings may appear.
   - The 1-day output artifacts (synthetic JSON and PNG) are likewise public.
3. **Artifact expiry.** Tools artifact `12033375179` expires about 7 days after 2026-10-16T07:xxZ, so roughly
   2026-10-23. The run must happen before then, or a new reviewed tool run is needed.
4. **Recipe timing.** The recipe matches Doc 219: one continuous sequence, a provider proof no more than 5 minutes old
   at admission, the earliest-expiry rule, and no external Supabase traffic or token refresh during the run, which
   fail closed.
5. **Still separate.**
   - Publication of the workflow successor, through an isolated PR and CI.
   - Samuel's exact finite execution approval, before capture.
   - My final-manifest disposition.
   - Doc455 SQL after receipts, then staff read-back.
   - Production.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | private preflight + input transport + continuous recipe (Core 8e70a025: session 7606dcfe, preflight 39453258, workflow-inputs cc1d1f62, recipe fb557d71) | reviewer 6abf1edf | ACCEPTED at source scope: bearer only from same-origin member/me, memory-only; A-only bounded GET preflight inside 5-min lock; snapshot hashes use the accepted canonical serializer and pagination (drift fails closed); fixtures match E33 form payload exactly (contact keys, line2 omitted, billing=shipping, legal then always/RUO acknowledgments in UI order); acceptedAt/fingerprint not precomputed; workflow pins artifact 12033375179 / 73e53b02 / inner 20658921 (match Doc462), env-passed bounded manifest/proof inputs with hash binding. Conditions: approval + final-manifest disposition bind exact manifest SHA (pin is now a dispatch input); public repo, so inputs/outputs must hold no secrets or personal identifiers; tools artifact expires ~2026-10-23; one continuous sequence per Doc 219; publication, execution approval, SQL separate | doc 220.`

Not publication, capture, credential, dispatch, deployment, approval or production consent; not human approval.
