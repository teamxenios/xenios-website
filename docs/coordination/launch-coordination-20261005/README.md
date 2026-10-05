# Xenios launch coordination checkpoint — 2026-10-05

This is a records-only coordinator branch. It does not compose a release, change application source, approve protected hashes, enable commerce, or mutate production. Newer Git, live observations, worker handoffs, and Samuel's decisions supersede this checkpoint.

The branch starts from the parked Finance handoff `963122ce355568d118c00ed6e774b474e2f50101` to preserve that checkout. Do not merge this whole branch as a release base or import its ancestors merely to collect these records. An integrator must select accepted source deliberately and transfer only the required records.

## Authorized workflow

Samuel requested automated collection of Codex and Claude results, delivery to the existing ChatGPT **Website State Summary** chat, retrieval of proposed next prompts, and dispatch of verified, dependency-ready work. He authorized needed Codex/Claude sessions and computer use. Suggestions returned by another model are planning input, never founder decisions or independent evidence.

The active heartbeat is `xenios-launch-coordination`, attached to coordinator chat `01a103a8-5684-7272-89e5-3c42eefcd593`, checking every five minutes. It stays quiet when unchanged and preserves exact-action production boundaries. Its destination planning chat is `6abd3937-e230-83ea-a1ef-eac3a08fa93c`.

## Verified acceptance

- Claude's pushed review `d9998563c9a709f2ef9ccd928d4e59fc259bb82d` accepts MC-01 `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` at source level and permits D/E. Its runtime promotion prerequisites remain open.
- The same review accepts Finance `dfd8b9b09815357d6c92f9c00eadf1782325269a` only as a partial, unregistered source candidate. This is not financial readiness. Finance remains parked.
- Independent Claude Fable 5.1, maximum CLI effort, fork `cc511440-aa23-4897-ac21-5d4f325ee396`, accepts Core source `c93bf5a2c1e2b50c5b40c65f0149033ad84658a0`, tree `fd729bca811b8e91ec13a31d9d3985472087579a`. The full verdict is preserved verbatim in `CLAUDE_CORE_IC2_ACCEPTANCE.txt`.
- That narrow review executed a Chrome computed-style comparison from the exact raw stylesheets. Customer timeline borders changed from purple to neutral; admin presentation, CTAs, focus/selection and the three protected files remained unchanged. The reviewer inspected Core's red/green 15-test receipts but did not rerun Vitest or a full production build. Preserve these limitations.
- Eleven independent raw proof files are preserved in `claude-ic2-proof/`; `evidence-index.json` records their byte sizes and SHA-256 hashes. Local `.gitattributes` prevents line-ending conversion.

## Active lanes and ownership

| Lane | Chat/session | Scope |
| --- | --- | --- |
| Core | `01a0e098-3b23-7233-9b07-877ace092650` | Partner sign-in return correction pushed and parked; IC-2 branch and protected files frozen |
| D/E | `01a10d08-cd8b-7431-80b7-a21677c11bb6` | GPT-6 Astra Ultra; existing isolated `2227` checkout; DE-R1 successor independently accepted, producer parked |
| Subscription readiness | `01a10d12-0764-7222-8b5a-5029508020ad` | GPT-6 Astra Ultra; isolated `5b21`; source and bounded proof pushed, clean and parked for Claude review |
| Claude IC-2 review | `cc511440` | Completed, source-level acceptance only |
| Claude partner review | `04b9c0f3-1e7d-47f6-aa02-7a410d86eb98` | Completed; source-level acceptance of the partner-return source |
| Claude D/E review | `d8d31048-294d-435d-9c5e-2613fa70ee05` | SOURCE ACCEPT for fallback-first foundation; IC3 and presentation-only PASS; DE-R1 P2 and release prerequisites remain |
| Claude subscription review | `f66b6b88` (full ID in state JSON) | SOURCE ACCEPT at the disabled purchase boundary, with integrated test receipt and server release holds |
| Claude DE-R1 recheck | `478774d3` (full ID in state JSON) | Complete: DE-R1 CLOSED and correction ACCEPT; no P0/P1/P2 in the delta |

The D/E task uses a local existing checkout because Cloud exposed no repository environment. It is not a Cloud execution. The new subscription task uses a separate managed worktree. D/E and subscriptions must coordinate shared member catalog/media contracts and ProductPage ownership; Core owns the separate public partner links and clarity/auth tests. Do not silently edit another lease.

Both final successors are now independently accepted for source integration only. `INTEGRATION_REQUEST.txt` prepares one integration/qualification lane in the existing idle Core chat and clean `b22f` checkout, on a new branch from common source base `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`. It selects accepted runtime/test/candidate deltas rather than importing lane registries or Finance ancestry. The independent overlap audit found only the assisted-order page shared between Core and D/E; preserve both the Core customer class and D/E media insertion. Subscription paths are disjoint, but composed catalog/detail behavior still needs testing. Consult state JSON for actual dispatch status.

Core's separate partner-return slice is pushed at source `94e89be7c959087edfde4ebddf2f50fa5e02cc36`, tree `23b3284a5cfc667b5cdc0e35643f07e71c333268`. Tests are `806c58a83bb3c0f1f75b9e003de14aa525069950`, evidence `9b8adebd81d48dbf2a17372afc06bd671f3eb9a9`, and final handoff `3f044f41b93d41c4ca40954eabd919dfb6ef0be4` on `codex/xenios-partner-signin-return-20261005`. It reports 205 focused tests passing in seven files with no failures/skips, including composed synthetic Auth/HTTP cases. Claude independently accepted the exact source through static review and receipt/hash verification; it did not rerun tests or browser checks. The full bounded verdict is in `CLAUDE_PARTNER_RETURN_ACCEPTANCE.txt`. This is not a live-account or complete-browser purchase proof.

D/E completed 238 focused tests across 15 files plus nonincremental typecheck. Subscription subsequently completed its focused/typecheck and bounded local synthetic browser checks, stopped the preview and explicitly released compute. D/E's DE-R1 correction then passed 71 focused tests across five files and nonincremental typecheck; it released compute and parked. Both current Claude reviews are static/read-only. No full aggregate, controlled database race qualification or concurrent heavy jobs have been authorized.

D/E source is `5152adb4db6db3e197d4534146bcc2ae75fa8f96`, tree `0258be61bf4761ee9911cda1c0d042b6cd183aa3`, with pushed records/handoff `c3ea1357f6a4d2a366417753bd08def4c5920fec` on `codex/xenios-de-media-foundation-20261005`. The independent verdict is preserved in `CLAUDE_DE_ACCEPTANCE.txt`: source-level ACCEPT for the fallback-first foundation, IC3 PASS, presentation-only PASS, no P0/P1. P2 DE-R1 must be corrected before relying on images: a browser clock behind the server rejects fresh signed URLs because the component repeats a server-relative lifetime ceiling against the browser clock. The existing worker is correcting only that behavior with expiry regressions. Five catalog components remain fallback-only pending canonical reader connections; browser, delivered-byte/hash integrity, metadata ingestion/review writer and disposable database qualification are not complete. SQL remains candidate-only, unregistered and unapplied. These are remaining release prerequisites, not accepted release exceptions.

Subscription source `7806fb5939a69189e085739fad8cc832cfab201a`, tree `10d7d2534f155f5fccdeb7c3c15bfc450d379c5d`, evidence `03b72f8786905789066d5310039557bc2951b72a`, and handoff `1fe97f54b72e943c85c5dfbccbc355fe5f72c517` are pushed on `codex/product-subscription-intent-20261005`. Its report is `docs/health-launch/PRODUCT_SUBSCRIPTION_INTENT_20261005.md` on that branch. Qualification is 377 unchanged-suite passes plus 23 corrected-form passes; the initial 396-pass/3-failure run is retained. This is split coverage, not a single 400-pass aggregate. Clean nonincremental typecheck and bounded local browser checks passed. Three synthetic POSTs produced two pending memory records with null schedules and zero instrumented payment calls; commission/payout integrations were absent. The actual ProductPage remains unavailable with no create action. Full-page screenshot timeout, viewport captures and deliberate preview cleanup are documented; no full-App/live Auth/referral-payment journey or responsive fidelity is claimed. The effective quantity cap remains 50 against a policy target of 100. Claude is reviewing this exact source using `SUBSCRIPTION_REVIEW_REQUEST.txt`.

DE-R1 successor source `e6a8171b5b2d4ad78930c214997532e16601a48e`, tree `72023b56e21b0f8b5c9643d110def78c0a6b6e7b`, and handoff `db9516d70461c7c7c36fd5ef06a086b03f64d415` are pushed on the same D/E branch. Only four source/test files changed. The default-strict signing-lifetime option remains enforced at server/adapter boundaries; only the component skips the redundant browser-relative upper check. The mounted timer is capped at 300 seconds and same-descriptor rerenders do not renew it. The handoff does not claim exact server-time expiry under arbitrary skew or stale remounts. Claude independently returned DE-R1 CLOSED and source ACCEPT, with no P0/P1/P2 in the correction; the exact verdict is `CLAUDE_DE_R1_ACCEPTANCE.txt`. This source may replace the foundation in an integrator. The verdict verified source/receipts without re-executing tests; it does not establish actual delivered-byte/hash identity or close any other release prerequisite.

The full subscription verdict is `CLAUDE_SUBSCRIPTION_ACCEPTANCE.txt`: SOURCE ACCEPT only while purchasing remains disabled; affiliate/referral/subscription readiness PARTIAL; live customer purchase NOT READY. PS-R1 requires a complete focused 17-file run on the exact integrated commit to close receipt provenance. The integrator must retain the test-only persistence seam and all six real-buying blockers; pre-existing server typed references (PS-R2) and absent capability projection (PS-R3) remain release blockers. The actual HTTP400 refusal case (PS-R5) should be exercised. Placeholder copy, the effective50/policy100 gap and price-version representation remain visible findings. Source-only statements about partner activation are not fresh live-account observations.

## Host recovery

The authorized builder/container/image prunes preserved Docker volumes but did not return sufficient Windows disk space. A bounded maintenance operation then checked that Docker had no active containers, stopped Docker Desktop, detached its distro, compacted the exact Docker data VHDX, and restarted Docker.

`docker-compaction-result.json` records the actual operation: free space rose from 908,677,120 to 29,562,880,000 bytes; VHDX size fell from 80,546,365,440 to 51,888,783,360 bytes. A separate postcheck confirmed all **827 volumes**, zero running containers, and about **27.52 GiB free**. No volume was deleted. This restores the 20 GB reserve; it does not make previously failed tests pass. RAM/paging pressure still requires serialized qualification.

Desktop automation remains unavailable because the REPL server cannot write kernel assets. Read-only diagnosis found intact runtime binaries and packages; stale server-owned temporary state is a hypothesis, not a proven root cause. Do not kill all REPL processes or restart active Codex work indiscriminately. Purpose-built chat tools and the Claude CLI provide the current handoff loop.

## Current production observation

Fresh read-only Render service/deployment reads confirm production `xenios-website`, service `srv-d8s9vej7uimc7384dfcg`, serves `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`, deployment `dep-daqft3vf3r2c73b7e88g`, with auto-deploy off. At `2026-10-05T17:08:30Z`, public `/api/health` returned successfully with `commerceEnabled: false`.

This is service/health evidence only. It is not proof of an authenticated gym-owner journey, subscription purchase, payment, schema qualification, or customer delivery. No production mutation occurred in this coordinator work. A repeat observation around 17:31Z is preserved in `production-render-observation.json` and `production-health-observation.json`; `docker-postcheck.json` preserves the corresponding volume/container/free-space observation. All three are included in the evidence index.

## Pending decisions and release requirements

Samuel has been asked for three distinct inputs; no answer is recorded at this checkpoint:

1. Which existing subscription/product plan he intends customers to buy. Paid membership access fees were removed September 5; do not silently restore them.
2. Exact approval of the three Navbar/Footer/index.css old-to-new protected hash pairs in the independent Core verdict. Do not send a model-authored “I approve” as founder authority.
3. GATE-01: restore the prior B-1 redirect or retain the restored Access Hub.

Product subscription production enrollment/activation and renewal payment wiring remain incomplete. The readiness lane additionally reports no durable creation retry key, no subscription referral lineage, no current-price comparison at creation, and no canonical eligible-offer projection to mount. These are reported backend gaps, not implemented gates. Generic source work proceeds around the owner choice, but must preserve genuine variant, eligibility, price version, ownership, agreement, currentness, persistence and payment authorities. No invented offer, auto-activation, false paid/active state, or live charge is allowed.

Only an accepted, composed, exact-SHA release packet with the required current owner approvals, prechecks, rollback and smoke can authorize promotion. The MC-01 SQL chain, Finance blockers and real account/provider/payment facts retain their separate requirements.

## Resume

Read this record and `COORDINATION_STATE.json`, then obtain fresh compact worker snapshots and Git truth. Check pending owner responses before repeating questions. Collect exact pushed handoffs, route only new changes to Claude, send meaningful results to Website State Summary, and dispatch the next non-overlapping work. Keep the heartbeat quiet while unchanged. Preserve these proofs and all failed/deferred qualification evidence.
