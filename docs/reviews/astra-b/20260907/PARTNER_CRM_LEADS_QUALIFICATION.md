# Partner CRM Leads — bounded qualification

Recorded by ASTRA-B on 2026-09-07. Local implementation and focused-test evidence only; no production or combined-release qualification.

## Source and ownership

- Implementation SHA: `6ee7119d1c3182f4d3529e90b5e5359deb89868a`
- Implementation tree: `6c81a818ec671ad68627a342ab7672f46ff1cb60`
- Parent SHA: `52584b1320d46ca5599252f6ae179dfc84d498a9`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Repository: `https://github.com/teamxenios/xenios-website.git`
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`

The coordinator explicitly allocated these four implementation/test files plus this evidence document. The worktree was clean at slice start. No other paths were edited:

1. `client/src/research/pages/partners/Leads.tsx`
2. `client/src/research/pages/partners/Leads.test.tsx`
3. `client/src/research/partner-crm/lead-aggregate.ts`
4. `client/src/research/partner-crm/lead-aggregate.test.ts`
5. `docs/reviews/astra-b/20260907/PARTNER_CRM_LEADS_QUALIFICATION.md`

## Implemented behavior and preserved authority

The existing endpoint remains `GET /api/research/partner/leads`, reached only through the existing `getPartnerLeads` adapter and canonical verified member token. Source inspection of `server/research/partners/portal.ts:470` confirms that this endpoint groups attribution touches by month/channel; it does not count unique people or approved applications. Display copy now names those facts accurately rather than calling them applications started.

The client projection accepts only the existing `{ok:true, rows}` envelope and exact `{period, channel, leads}` rows. It requires a valid month bucket, a channel from the existing shared `AttributionChannel` contract, and a nonnegative safe integer without coercion/rounding. Duplicate buckets, extra identity/contact fields, arbitrary channels, and malformed rows make the entire read unavailable to render as a table, rather than silently producing partial or empty counts. Only validated aggregate fields are copied into the view; no local total or new role is computed.

The page distinguishes loading, normal sign-in, server denial, unavailable service, unreadable response, successful empty rows, and a genuine reported zero bucket. Unavailable/empty results do not claim complete history, zero people, a platform launch date, or changed approval. Raw upstream error/denial messages are not rendered. Existing principal-bound read behavior and a token-keyed child clear prior-account data. Signed-out or still-verifying sessions do not issue the private read. Retry remains GET-only.

This is a dependency-ready aggregate reporting journey, not a recruiter/network-lead feature. The inspected canonical `PartnerRole` contract does not define those roles; this slice adds neither role, new permission, contact-level CRM, recruitment compensation, account selector, nor server admission. Existing server partner/member authorization remains authoritative. It does not open the Leads route through any review gate or change whether production currently serves it.

## Source-bound focused test run

Executed from the worktree above with PowerShell:

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/partner-crm/lead-aggregate.test.ts client/src/research/pages/partners/Leads.test.tsx --maxWorkers=2
```

Final observed Vitest `v4.1.10` output:

```text
Test Files  2 passed (2)
     Tests  55 passed (55)
  Start at  13:13:24
  Duration  3.80s (transform 523ms, setup 0ms, import 1.59s, tests 557ms, environment 1.46s)
```

Exit code: **0**. Terminal completion chunk: `1768b2`. The per-suite breakdown is **36 aggregate-projection tests + 19 Leads journey tests = 55 passed**. The displayed start time is runner-local; this output does not itself identify a timezone. The earlier run also passed 55 tests; this record binds the final run after a test-only type-narrowing cleanup. No source edits occurred between the final passing run and implementation commit `6ee7119d1c3182f4d3529e90b5e5359deb89868a`. This document was added afterward. Git diff checks passed.

Coverage includes every existing attribution channel, valid/invalid month buckets, count corruption, malformed/identity-bearing envelopes, duplicate buckets, exact bearer GET, no read during sign-out/verification, 401/403/404/501/503/500, canonical partner denial, unavailable read-only retry, empty versus reported zero, A-to-B clearing, stale A completion, and sign-out. Tests use synthetic data and mocked HTTP responses with the real client adapter/read hook; they do not prove real Auth, production data ownership, or a rendered live browser journey.

Only the two allocated focused suites were run. Full typecheck/build/browser and combined-runtime qualification remain separate gates. No Resource Hub, A-owned backend, shared contract, adapter, coordination registry, migration, database, flag, deployment, real user, payment, or external communication changes were made. The code and this documentation-only successor are handed off for independent review; no production action is authorized by this record.
