# Sources and limits | checked 2026-10-06

## Repository sources

GitHub connector reads of these private repository resources informed the plan:

- codex/xenios-health-quick-order-20261005: observed tip
  5ee44d53e55774fd8a29ea009dac16da2ed907ef.
- claude/xenios-health-launch-review-20260930: observed tip
  3f2d615221ab93ea409c133532a9e1942657bde8.
- codex/accepted-source-integration-20261005: observed tip
  38c723964358c18b8c5090f2f9a0aa92f74601b0.
- QO APPROVAL_MATRIX.md, PERSISTENCE_PROPOSAL.md and
  evidence/mount-proposal-hashes.json at exact5ee44d5.
- Prior in-conversation exact review/handoff sources: integrated acceptance35,
  Quick Order docs36-39, imagery sprint handoff and bridge tooling review.

No repository source or hosted data was edited. No test, build, precheck,
resource cleanup, worker dispatch or deployment was executed for this plan.
The current Render read returned no selected workspace. One workspace was
listed; it was not selected. Current deployment/commerce state is therefore
not established by this planning turn.

## Official platform documentation

1. OpenAI, Worktrees:
   https://developers.openai.com/codex/app/worktrees
   Redirects to https://learn.chatgpt.com/docs/environments/git-worktrees
   Worktrees support parallel independent chats but use the computer or remote
   environment where the project resides. They are not separate physical RAM.

2. OpenAI, Codex Cloud environments:
   https://developers.openai.com/codex/cloud/environments
   Redirects to https://learn.chatgpt.com/docs/environments/cloud-environment
   Describes container checkout, setup, network settings and pinned runtimes.
   It does not prove a particular user's environment or task is available.

3. OpenAI, Using Codex with your ChatGPT plan:
   https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
   Usage depends on plan/model/effort/tool workload; credits and limits apply.

4. Anthropic, Orchestrate teams of Claude Code sessions:
   https://code.claude.com/docs/en/agent-teams
   Independent tasks benefit; same-file work and dependent sequential tasks
   can be more effective in one session/subagents. Extra agents add overhead.

5. Anthropic, Use Claude Code with your Pro or Max plan:
   https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
   Interactive plan use is limited and shared; switching to billed usage is a
   separate decision. Do not assume Max means unlimited execution or local RAM.

6. Anthropic, Use the Claude Agent SDK with your Claude plan:
   https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
   IMPORTANT: the opened page's June15 update says the announced monthly SDK
   credit changes are paused; SDK/claude-p usage still draws from subscription
   limits for now. Older text and search snippets below that notice describe a
   superseded proposed change. Do not budget an unclaimed monthly credit.

## Planning versus facts

The twelve-role split, initial local concurrency limit, four-hour window,
first-hour pacing and staged-release recommendation are proposed engineering
choices, not facts from a completed deployment. Requested model labels are
user preferences and not verified installed-model identifiers. No performance
multiplier or one-hour purchasing guarantee is claimed.
