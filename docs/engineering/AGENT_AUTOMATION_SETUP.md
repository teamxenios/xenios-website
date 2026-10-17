# KAN-225 bounded engineering handoff pilot

Status: **source-only, OFF by default; not a demonstrated live agent team**.
Root remains the coordinator and publication owner. Original Claude remains
the independent reviewer of record. Nothing here opens Quick Order staging,
dispatches KAN-31, grants a cloud permission, or authorizes production.

## What this slice implements

One manually dispatched workflow, only from main, for an existing same-repo PR
and Jira KAN key. Root selects an exact head, exact path lease, stage and cycle.
The gate requires a trusted human writer, an existing protected environment
with required reviewers and self-review prevention, a current hash-bound scope/
cost decision, no fork/head drift and no extra PR paths. Review requires all
configured checks to report success on that exact head; skip/neutral/missing
is not success. A bot-authored reservation is written BEFORE provider execution.
Failures consume it; no job retries. At most two stage reservations per PR/task.

Codex proposes a bounded unified diff using the official immutable Action,
read-only permissions and drop-sudo on a disposable Ubuntu runner. It cannot
publish code. Its Action is deliberately the last step in that job. A separate
trusted job validates the output, records only head/verdict/codes/patch hash,
and retains the proposed patch for one day. It never applies model text or
executes proposed commands. Root inspects and publishes an accepted proposal
through the existing source custody/Git workflow, then waits for real CI.

Claude's separate official pinned Action reviews only the bounded candidate
diff in `agent-task-data.json`. The job never checks out the candidate tree;
the trusted controller fetches Git objects only, disables external/textconv
diff drivers, and refuses an unexpected `candidate/` directory. Author-owned
`CLAUDE.md` files therefore cannot auto-load as subdirectory memory. PR text
and diff content remain untrusted data, never trusted instructions.
The Action uses
Read/Glob/Grep only, no shell/edit/cloud/delegation tools and six turns maximum.
Raw output/report and the secondary inline-comment classifier are disabled.
Provider keys are passed only to their respective Actions, never to the
Node prompt controller. Missing configured authentication remains fail-closed
in the provider Action; it does not authorize an alternate login mechanism.
Only validated exact-head verdict/finding codes enter the PR receipt. This
does not claim the original interactive Claude session executed the Action.

There are no comment, bot, workflow_run or pull_request_target triggers, no
auto-merge, no automatic code push and no implicit workflow redispatch. GitHub
GITHUB_TOKEN-created events do not reliably launch another workflow; Root must
use the existing authorized publication/CI mechanism, not wait for a bot loop.
Neither provider job has write access. The receipt/gate jobs have PR-comment
write access but no contents-write, deployment, cloud or Jira credentials.

## Secure activation prerequisites (NOT performed by this source change)

The current founder mandate permits source/PR/CI work, not paid model calls.
The existing Root must obtain the actual authentication, spend and enablement
decision and an independent review before any provider dispatch.

1. Privately provision approved `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in
   an **already-created** `xenios-engineering-agents` GitHub environment. Never
   paste keys into chat/Jira, export them, use local browser profiles, or assume
   chat subscriptions supply API billing. This pilot selects API-key auth;
   OAuth/WIF is not silently configured as an alternative.
2. The environment must have required human reviewers, prevent self-review,
   restrict deployment branches to the trusted main workflow, and retain any
   existing stronger protections. The gate must be able to read its nonsecret
   metadata. Missing access/protection fails closed; do not weaken it.
3. Root records an exact nonsecret task/custody/cost authorization in repository
   variable `XENIOS_AGENT_APPROVAL`. Required fields, in this example order:

   ```json
   {"issue":"KAN-225","pr":999,"paths":["docs/engineering/synthetic.md"],"stages":["implement","review"],"maxCycles":2,"expiresAt":"REPLACE_WITH_APPROVED_UTC_EXPIRY","costDecision":"REPLACE_WITH_64_HEX_SHA256_OF_ACTUAL_SPEND_DECISION"}
   ```

   This is a shape example, not an actual decision. Dispatch `approval` equals
   SHA-256 of UTF-8 `JSON.stringify(parsedRecord)` (no trailing newline).
   Exact path-array order is bound too. The environment reviewer must verify
   that the record reflects real authority, not an agent-created assertion.
4. Set `XENIOS_AGENT_REQUIRED_CHECKS` to the exact actual required check names,
   e.g. `["test","typecheck","build"]` only if these are genuinely the
   required checks. No empty list, filtering away failures or inferred pass.
5. Only after those decisions set `XENIOS_AGENT_AUTOMATION=approved-v1`.
   Absent/other value blocks all provider jobs. Dispatch the exact main workflow
   once with issue, PR, full head, exact paths, stage, cycle and approval hash.

Manual environment approval is the final check of task authority, provider
identity, model/default selection and spending limits. Time/turn/cycle bounds
are not a dollar-budget guarantee; configure actual provider spending controls
under the separately granted billing authority. No credentials or environment
protections were created by the implementation.

## Local source-only evidence

```sh
node --test scripts/agentic/engineering-handoff.test.mjs
node scripts/agentic/engineering-handoff.mjs demo
```

The demo is explicitly a **non-LLM synthetic controller**, not provider work.
It drives implement → green CI → changes required → correction → green CI →
independent acceptance. It emits an idempotent Jira update INTENT, not a Jira
write. Negative controls cover failed CI, stale source, self-review, exhausted
cycles, untrusted triggers, forks, missing auth prerequisites and unsafe output.
Root performs actual Jira updates via the existing connector; no new Jira
credential or duplicate issue is introduced.

Before calling the system operational, run one genuinely authorized low-risk
issue/PR through both providers, actual CI, independent review, bounded fix,
Root publication and real Jira receipt. Bind every result to its actual source
and run. The synthetic demo and source review cannot substitute for this.

## OpenRig is separate from Actions authentication

Root reported OpenRig 0.6.10 installed in isolated Ubuntu WSL at
`/home/sboadu/.local/share/xenios-openrig-20261017`, with Node 22.22.3,
tmux 3.6, Codex CLI 0.163.0 and Claude Code 2.1.302. Root's prerequisite and
setup dry-run checks passed; both provider logins were absent. No daemon,
three-seat team, real model handoff or restart recovery was demonstrated.
Treat those as Root's dated installation receipts, not a fresh check by this PR.

Private local `codex login --device-auth` / `claude auth login --claudeai`
remain operator actions through their own secure flows. Do not copy Windows
session material into WSL or treat those logins as Actions API authorization.
Root owns OpenRig team configuration, task persistence and recovery proof.

## Sources and pins

- [Official Codex Action documentation](https://learn.chatgpt.com/docs/github-action)
- [Official Codex Action source](https://github.com/openai/codex-action/tree/a8d8be6ee028bea4525bc722d16f36687b408c81)
- [Official Claude Code Actions documentation](https://code.claude.com/docs/en/github-actions)
- [Official Claude Action source](https://github.com/anthropics/claude-code-action/tree/f27be6b65a4652f08a2ba3cff79114829b588967)
- [Official OpenRig](https://github.com/mvschwarz/openrig)

Actions are pinned to full immutable commits; Codex CLI is pinned to 0.163.0.
The Claude Action manages its bundled CLI dependencies at that Action revision.
No model name is silently selected beyond each provider's documented default.
Check actual enabled account/model/cost policy before the first real run.

## Morning discovery agenda (no invented roadmap decisions)

After P0 qualification, ask Samuel about priority personas/pages; approved
product/pathway scope; distribution and customer acquisition; manual follow-up
and fulfillment coverage; fundraising needs; and the next release sequence.
Keep these in the existing roadmap, not a new project or launch prerequisite.
