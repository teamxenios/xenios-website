# Read-only business enquiry staff queue

Owner: `codex-ea-analytics-20261118`, existing task `EA-BUSINESS-ENQUIRY-FORM-20261118`. Root grant: KAN-225/13554 and canonical `ACTIVE_TASKS.json` / `CODE_OWNERSHIP.json`. This increment owns exactly five new client files and this runbook. It consumes the existing business enquiry contracts; it does not introduce another identity backend, workflow store or permission decision.

## Composition contract

`BusinessInquiryQueue` is a renderer with required `api`, `contextGeneration` and `isContextCurrent(generation)` props. An absent API, empty generation or failed current-context check must not fetch or render cached private records. Root supplies the real lifecycle binding and route in its existing Care shell. No route, navigation entry or standalone sign-in is added here.

`createBusinessInquiryStaffApi` requires both an injected `fetcher(path, init)` and synchronous `isCurrent()` predicate. There is no default browser fetcher. Root composes the fetcher through the existing `careApiFetch` transport with its actual SDK-session fence. The fence must check the real current ordinary session immediately before network dispatch. An Auth recovery credential, email match, Early Access queue-reader grant, referral or selected organization is not business authority.

Root's existing verified ordinary principal resolver and the real business SQL remain authoritative. Every list/detail operation rechecks current narrow business roles/capabilities in SQL. Client lifetime checks only prevent stale dispatch/display; they cannot grant access. Use a new generation when the bound identity/session lifetime changes, revoke old callbacks synchronously, and do not reuse a signed-out generation. A refreshed credential must pass Root's actual SDK-session binding before it can fetch.

Only the existing endpoints are consumed:

| Operation | Endpoint | Contract |
| --- | --- | --- |
| Read page | `GET /api/admin/research/business-inquiries?before=<uuid>` | Strict `businessInquiryPageSchema`, at most 50 rows and an opaque `nextBefore` UUID cursor. |
| Read detail | `GET /api/admin/research/business-inquiries/<uuid>` | Strict `businessInquiryRecordSchema` with the exact requested ID. The real detail endpoint records the actual detail read. |

No list row is treated as a successful detail read. Paging follows server cursors rather than assuming ID order is chronological. The renderer holds only the current page of at most 50 rows, detects repeated cursors and caps one browsing session at 20 pages with an explicit limit message. Its finder searches only that page; it is not a server-wide search or a complete queue count. Quantities remain attached to each exact requested presentation and unit; unlike units are never summed. Referral text is unverified attribution. Saved enquiries represent demand awaiting human review, not approved prices, inventory, credit, shipment or supplier acceptance.

There are no assignment controls, exports, mutation requests, local identity selectors, token persistence or customer/provider communications in this slice. The existing backend assignment command remains separate from this read-only UI.

## Private state and error handling

The client performs no automatic retries. Loading, empty, missing, unavailable, unauthenticated and denied outcomes have distinct truthful displays. Explicit cancellation lets an operator escape a stalled page/detail read; an explicit retry performs the intended read through the same current-context checks. Errors use fixed safe labels; raw server/provider response text is not shown or logged. The transport bounds actual streamed UTF-8 bytes at 4 MiB and refuses malformed encoding rather than trusting a declared content length.

Current-context checks and abort/sequence fencing apply across pending requests and response-body awaits. An expired, denied or stale operation must hide all existing private rows and details, including when another list/detail read is in flight. Late responses must not restore data after revocation, context replacement or unmount. A new eligible context is required to establish a fresh workspace. Root's shell must invalidate its lifetime immediately on actual Auth/session changes; React state changes alone are not a revocation mechanism.

The component renders text using React, with scoped responsive styles and labelled buttons/focus handling. Long descriptions, references and email addresses must wrap. Browser keyboard, phone-width and 200% text observations remain separate from authored source tests.

## Evidence and remaining integration

Baseline `93705058279040e5ae3f54f83200843470120ffc` passed all six hosted checks in [run 44405128623](https://github.com/teamxenios/xenios-website/actions/runs/44405128623): focused 298 tests, including 26 real PostgreSQL cases; full suite 19,993 passed with 83 existing skips. That baseline predates this queue and cannot establish its execution.

The same-DB production-HTTP proof at `34350e5854e3c36ddaac92def88d1bbfaae5bcf5` joins config, durable limiter, submit/replay/conflict, staff list/detail and real audit/revocation. It is source-reviewed and not yet executed at this checkpoint. This queue increment adds 28 React behavior cases and 58 API cases, all authored and unrun here. Independent review caught and corrected a render-observed staleness latch and invalid reference values in the pagination fixture before execution. The exact combined hosted result must be attached before a pass is claimed. Root retains the single PR #525 qualification stream and must add both new test files to its focused business step/census; no local heavy job or separate CI stream is authorized by this increment.

Root still owns the real Auth lifecycle and route/nav mount, migration ledger/managed application, approved business-specific policy/retention readiness, narrow actual staff grants and any notice-intent bridge. The renderer and a durable notice intent establish no actual email delivery. Website 2 must receive an exact served SHA and usable legitimate operator context before browser acceptance is recorded. Preserve historical customer records and Samuel's working staff session.

Samuel's current instruction permits source commits, pushes, draft PRs and synthetic qualification. Before merge, deployment or production configuration/data/role/provider changes, Root presents the exact action and obtains explicit approval. This source increment performs none of those operations and sends no email.
