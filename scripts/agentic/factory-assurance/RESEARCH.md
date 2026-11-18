# Research rationale: improving the Xenios software factory

## Direction

Strengthen the existing Xenios factory by making its work easier to verify, its recurring mistakes harder to repeat, and its improvements measurable. Apply these principles across Claude, Codex, and OpenRig through shared task and completion requirements. The recommendation is to improve the engineering environment before expanding orchestration.

This document proposes a design direction. It does not establish that the proposed controls exist, that an integration works, or that a plugin has been installed. Those claims require repository evidence and observed execution.

## Source and attribution

Lauren Tan, known as `@poteto`, is the author identified in the first-person [pstack README](https://raw.githubusercontent.com/cursor/plugins/main/pstack/README.md). Her [GitHub profile](https://github.com/poteto) links that identity and the Cursor plugins repository. Her November 11, 2026 [AI Engineer CODE talk, “All Code Is Slop (Except Mine)”](https://ai.engineer/code/2026/talks/lauren-tan), directly discusses software factories and the foundations that make agent autonomy trustworthy.

The practices below come from that talk and pstack's published workflows. They should not be presented as a separate, formally named “Lauren Tan methodology.” Repository contents can change; any adoption should record the exact reviewed revision. Her reported throughput describes her team's experience and is not a forecast for Xenios.

## 1. Make recurring mistakes structurally difficult

**Published practice.** In the talk, Tan prioritizes architecture and deterministic checks, then verification, with prose reserved for matters requiring judgment. The [Correct skill](https://github.com/cursor/plugins/blob/main/pstack/skills/correct/SKILL.md) groups repeated failures using commits, reverts, review comments, and workarounds. It prefers architectural prevention, then types and lint or CI, then behavioral tests, and finally documentation. It requires proving that a new check catches a real past mistake and pairing each rule with its enforcement.

**Xenios recommendation.** Give repeated factory failures a durable resolution. A missing completion receipt could become an invalid task transition; an unsupported worker capability could fail dispatch validation; duplicate delivery could be addressed through an idempotent operation. These are candidate applications, not verified descriptions of current defects.

Keep a small record of the failure, evidence, chosen prevention, and verification command. Prefer the highest effective level of prevention. A longer instruction file alone is weak evidence that the same problem will not recur.

## 2. Verify the result users and operators experience

**Published practice.** Tan describes agents running the application, using debugging tools, and producing reviewable artifacts. A feature map names capabilities from the user's perspective, while reusable drivers make operation consistent. She presents formal verification and property-based testing as additional tools for suitable problems, rather than universal requirements. See the [runtime verification segment](https://www.youtube.com/watch?v=ZZ19zhYnDKY&t=4286s).

**Xenios recommendation.** Define acceptance around observable journeys and outputs. A completed task should identify the code revision, relevant environment, action exercised, expected result, observed result, and supporting evidence. File creation, successful compilation, and an agent's own completion statement can support verification, but cannot independently establish that an integration works.

Start with one representative journey through the existing factory. Confirm that task intake, execution, verification, and final reporting agree about its status. Extend coverage according to concrete failure risks rather than pursuing a large test count.

## 3. Curate durable operational memory

**Published practice.** The [Reflect skill](https://github.com/cursor/plugins/blob/main/pstack/skills/reflect/SKILL.md) extracts durable lessons from an actual conversation: corrections, discoveries, missed checks, and missed skills. It rejects transient details, duplicate guidance, and one-off observations. Lessons that can be enforced by a script or check belong in implementation work. Its workflow separates accepted proposals, rejected findings, and backlog before approved edits.

**Xenios recommendation.** Separate raw run evidence from curated guidance. A candidate lesson should name the observed problem, its supporting runs, the future behavior it would change, its destination, and how that change will be evaluated. Update an existing rule when possible, and retain a reason when rejecting a proposed lesson.

This is operational memory and workflow improvement. It does not retrain Claude, Codex, or another underlying model. Persistent files do not demonstrate learning by themselves; the relevant evidence is a repeatable improvement in later comparable tasks. Automatically collecting candidates can be useful, while promoting them into shared instructions remains a distinct, governed step.

## 4. Treat improvement as a measured experiment

**Published practice.** The [Hillclimb playbook](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/hillclimb.md) establishes a realistic workload, metric, baseline, measurement harness, and regression gates. It evaluates individual hypotheses, measures before and after, and keeps or reverts changes. Apparent gains must exceed noise without breaking required behavior. Attempts and decisions are recorded.

**Xenios recommendation.** Choose one bottleneck per experiment. Useful candidates include verified completion rate, time from accepted brief to verified result, repeated failure rate, and human rework per task. Define what counts as a comparable task and preserve correctness requirements while measuring improvement. Do not substitute generated code volume, agent count, or token consumption for successful outcomes.

A proposed prompt, routing rule, or memory change should first run against representative recorded cases or an isolated evaluation set. Report its baseline, sample size, result, limitations, and recommendation. A favorable result is a proposal for promotion, not authority to silently alter production routing, shared instructions, permissions, or merge behavior.

## 5. Scale a demonstrated workflow; evaluate tooling separately

**Published practice.** The [pstack README](https://raw.githubusercontent.com/cursor/plugins/main/pstack/README.md) connects confident parallelism with first making one agent's work trustworthy and verifiable. It describes configurable model roles and Claude Code support. The talk similarly places the automated outer loop after investment in the inner engineering loop.

**Xenios recommendation.** Demonstrate one complete path from accepted brief to verified result and retained lesson, then parallelize independent work with clear ownership. Claude, Codex, and OpenRig should satisfy the same completion contract, even if their adapters differ. The reviewed sources do not establish an OpenRig integration.

An optional next step is a **pinned, one-seat pstack pilot** in an isolated project, using a reviewed commit or version and a bounded task set. Compare it with the existing workflow under the same acceptance criteria. Check dependencies and harness-specific assumptions before adopting individual practices. This document neither installs pstack nor claims a working pilot; installation, compatibility, and results need separate receipts.

## Evidence required before expanding autonomy

A useful first milestone is an observed end-to-end task, a verified prevention for one recurring failure, and one measured improvement proposal. Record current baselines before setting numerical targets. Preserve the user's approval boundaries and existing project constraints throughout.

Expand autonomy only when the relevant workflow repeatedly produces inspectable evidence, failures remain visible, and recovery is understood. The resulting factory should become more dependable through executable constraints and tested changes, while humans retain a clear view of what was proposed, what was accepted, and what actually ran.
