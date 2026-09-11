# Hosted execution request: checkout candidate `ce0858a`

One exact request for the next environment step. It reuses the existing
staging authorization where that authorization genuinely applies, and names
every addition as one amendment. Nothing here has been executed.

## Candidate

| | |
|---|---|
| Branch | `codex/xenios-native-finish-20260910` |
| Application commit | `ce0858aba29113b87c061ea8deb20b67991c1357` |
| Application tree | `1aadecebd7e28d7fb15b73dfbe5f8c3e7b9cf27e` |
| Typecheck on that commit | clean |
| Full suite on that commit | 947 files, 17690 passed, 59 skipped, 0 failed; `--maxWorkers=2`, first attempt, Node 20.19.0 |
| Build on that commit | `node script/build.mjs` exit 0, client and server |

Later documentation-only commits do not change this application identity.

## How the run works

The qualification launcher runs on an operator machine, never inside a
deployed process: it refuses when `NODE_ENV` is production or any Render or
Vercel marker is set. Its supervisor forks the application locally on
`127.0.0.1` as an owned child, points it at the staging database and the
provider's test mode, and restarts that child for the restart scenario. **No
staging deployment is required.**

## SQL, in the only valid order

Order is derived from each candidate's own precheck, not from filenames.

| # | Candidate | SQL sha256 | Requires | Needed for |
|---|---|---|---|---|
| 1 | `20260909150000_research_checkout_executions.sql` | `f36fe1e778fce14e6646e5bb7bb922a84bb1b9701ddcdf991b43a4cf48e65cd5` | existing orders, lines, state events, lot reservations, credit ledger | the checkout journey |
| 2 | `20260910201400_research_checkout_credit_reservations.sql` | `1196169a2d29cb7bf62e29326ed689bdd9f668d43abe6977d97dd087de70033e` | #1's commit functions | the checkout journey |
| 3 | `20260910120000_research_checkout_execution_recovery.sql` | `0a10bb426bcc7ea14d4afd518e1220e87c2839cd1ad5aecec19afb3b1dd4d040` | #1 | recovery only |
| 4 | `20260910220129_research_checkout_recovery_operation.sql` | `a2fd98dfc80a921caa3eb1c6bb2b5e0d8a7c581b9ad3dcfaae65dd4fafa37fb0` | #3, existing `research_idempotency_keys` | recovery only |

**#1 alone does not support the checkout journey.** The application's
store-credit repository calls `research_store_credit_balance` and
`research_store_credit_spend`, which only #2 creates. #2 also replaces #1's
`research_checkout_execution_commit_captured` and
`research_checkout_execution_commit_cancelled`. Install and rehearse them as a
pair, #1 then #2.

Prechecks, postchecks and rollback notes, full sha256:

| # | Artifact | sha256 |
|---|---|---|
| 1 | precheck | `b4369e1832d8dcc4d0653d6b5b80d5aa21bd51a16d91cc18b2cee6c11eb1cadf` |
| 1 | postcheck | `43ecefa15bebce36a8c938b8c8515c3bda95accb6edbc64ab0d9d00afa55ec4f` |
| 1 | rehearsal `.sql` | `5e92168d42899355e4dbecd424435f7f5b8575a4728f60d383228ebfe1e3c9b5` |
| 1 | rehearsal `.md` | `88d62d1de86cf1eaeb8ef2c5f53ef56d3cf297f3520ae2e2e698bbe42cdd47d1` |
| 1 | rollback `.md` | `a0740d6ff451546d4ff0c0536839a5644ccacf55ebe38b3dfb825c66a60c24a9` |
| 2 | precheck | `fa6c4b7056927b9b19ae3516a0beb08e5a0933d86291037e8452bba72a641d8c` |
| 2 | postcheck | `b1116b7749ffdf5f21e30a954884679ee8788bbf95707c2b757a6530afe3b53c` |
| 2 | rollback | **none, by design**: forward-only. Disable the application path; never drop the schema over active credit holds. Stated in `docs/native-finish/CREDIT_RESERVATION_CONTRACT_20260910.md`, `1d1ef166d9ad0da14af35405607bc3452e65d65516c2d99cd0dafda2c4475f46` |
| 3 | precheck | `ebfded893ed87be5bce87aafcff0c9d624fe4585a6941c102053f43fe972ec50` |
| 3 | postcheck | `78cd64c0c75ebdd7bd1a941d470564c6b9cd02f44b83f51148467bb69637185b` |
| 3 | rollback `.md` | `68d412ab9c335fc37b88e7421a2d4a2ee2172fd7bbbd91bc55d2cea35c680b97` |
| 4 | precheck | `fe45dd8f7e4fdac1c055c5ecc42dc8a28a293adcf0afafc65672b93bc28ade3c` |
| 4 | postcheck | `5ee37791b6984c57d5bdc14f5e4e4823bd14c8f6cdafbf13c82d588b75849378` |
| 4 | rollback `.md` | `9dd04073744b0e5d12283e317d62671004dc7fc4cadfffbfc58993d73d154c56` |

Local PGlite rehearsals exist for all three families:
`native-sql-rehearsal.mjs` (`bcce445debc1d1da5581489bdd69b86d4cc60dbf36c51a490ae5c6c881f5754b`),
`credit-reservation-sql-rehearsal.mjs` (`a96a7d4b912a532c2ec35b6560fc3d6b13c46b612d433a348c474f6e1a4a239b`),
`recovery-operation-sql-rehearsal.mjs` (`e037225b75d420875e8350d2372a405a255897df1d64d3e62a251bc83cc985d4`).

Staging migration history, as observed by the founder's check: the Resource Hub
migration is present and none of these four versions are. That is a history
observation, not a schema audit. Each precheck stops if its objects already
exist.

## What the existing authorization covers

The founder's staging authorization covers **#1 only**, as blob
`dbbaa4f772b62d7d85159b52065f5ad507ae0831`, on project `tetynodzrtmdbuzgboro`,
with **Codex A as executor**, synthetic data and test-only provider integration.
The file in this tree is still exactly that blob, so the approval stands for it
unchanged. It explicitly excludes follow-on migrations.

## The amendment requested, as one decision

1. **Install and qualify #2 immediately after #1**, on `tetynodzrtmdbuzgboro`.
   Required for the checkout journey to run at all.
2. **Separately, install #3 then #4** on the same project, for recovery
   qualification only. These can be declined without blocking checkout.
3. **Executor.** Either Codex A after its quota resets, which changes nothing,
   or a named replacement holding staging database credentials. Claude holds no
   staging or provider credential in this session.
4. **Effects, separately identified:**
   - Checkout journey: writes only to synthetic members' executions, orders,
     reservations and credit rows; provider test-mode payment objects,
     captures and cancellations in the test account; harness-signed webhooks
     posted to the locally mounted route, labelled as harness-signed, not as
     provider delivery.
   - Recovery, only if #3 and #4 are approved: durable recovery metadata,
     canonical local settlement, inspection of existing test payments, and
     cancellation of existing test authorizations, on synthetic executions.
   - Receipts: read-only preview. **Queue mode stays off.** Queueing needs its
     own communication approval naming audience, cutoff and an isolated sink.
5. **Retained records.** Synthetic rows remain as evidence unless the reviewed
   plan says otherwise; test-mode payment objects remain in the test account.
6. **Cost.** No new paid resource.

Unchanged prohibitions: no staging reset, no migration replay, no production,
no real customer data, no email, no real money, no deployment.

## What the executor must provision

Names only. Never put a value in a document, ticket or chat.

- Database: `SUPABASE_URL` (`https://tetynodzrtmdbuzgboro.supabase.co`),
  `XENIOS_QUALIFY_PROJECT_REF`, `XENIOS_QUALIFY_SERVICE_ROLE_KEY`.
- Provider, test mode only: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`. Live keys are refused.
- Run identity: `XENIOS_QUALIFY_SOURCE_SHA` = the application commit above,
  `XENIOS_QUALIFY_RUN_ID`.
- Approval: `XENIOS_QUALIFY_APPROVAL_FILE`, whose bytes must hash to
  `XENIOS_QUALIFY_OWNER_APPROVAL_SHA256`.
- Fixtures: `XENIOS_QUALIFY_SYNTHETIC_MEMBERS` (thirteen active synthetic
  `research_members` rows with auth users, one per scenario, plus their access
  tokens), `XENIOS_QUALIFY_REQUEST_TEMPLATE` (the approved checkout seed),
  `XENIOS_QUALIFY_FIXTURE_WIRING_MODULE` and `_SHA`.
- Browser: `XENIOS_QUALIFY_CHROME_PATH`, `XENIOS_QUALIFY_BROWSER_APPROVAL_SHA256`,
  `XENIOS_QUALIFY_BROWSER_ORIGINS`.

## Browser destinations

The launcher requires `https://js.stripe.com` in the approved origin list and
blocks every other origin, recording each one it blocked. The application
origin is loopback, set by the supervisor. Any further challenge origins are
added only from that recorded list, by amending the browser approval digest,
and are not guessed here.

## Execution order once covered

1. Prechecks #1 and #2, stop on any failure.
2. Install #1, postcheck #1. Install #2, postcheck #2.
3. Run the launcher; record the receipt, including every skipped scenario.
4. Only if approved: prechecks, installs and postchecks for #3 then #4, then
   recovery qualification.

## Not requested here

- Activating the recovery caller in any deployment. It needs its own approval
  document, pinned digest and `XENIOS_DEPLOYMENT_ENVIRONMENT`, and remains off.
- Receipt queue mode.
- Any production step.

## Whole-platform status

Only what this session can evidence. "Not examined" means exactly that, not
"not done".

| Workflow | Implemented | Integrated | Deployed | Enabled | Live-verified |
|---|---|---|---|---|---|
| Card checkout and credit consent | yes | yes, `ce0858a` | no | no | no |
| Checkout recovery | yes, pass and caller | composed, not activated | no | no | no |
| Payment receipts | preview and queue | renderer registered; queue off | no | no | no |
| Resource Hub | not examined | not examined | staging migration present | not examined | not examined |
| CRM and manual operations | not examined | | | | |
| Representatives | not examined | | | | |
| Business access | not examined | | | | |
| Customer accounts | not examined | | | | |
| Fulfillment and support | not examined | | | | |

Checkout completing locally is not full-platform completion.
