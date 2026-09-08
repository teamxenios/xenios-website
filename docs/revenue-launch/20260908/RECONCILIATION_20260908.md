# Reconciliation of open gates — 2026-09-08, from A's checkpoint `1704387b`

Claude, reading A's committed records and Git; **no test was rerun and no
heavy job was started** (A's `c350ab1c` suite was running on this host). The
candidate remains `c350ab1c1a12d8f9ed7e8e380d4f2ef9eda22662`.

## 1. Full-suite runs, by source and timestamp

| Run | Source | Started / duration | Pool | Result | Failing test | Saved result |
| --- | --- | --- | --- | --- | --- | --- |
| A | `33436c5` | 2026-09-07, 1,276 s | threads, 1 worker, serial files | **FAILED** 15,995 / 2 fail | `pgcrypto-qualification` repo audit > 5,000 ms; `rls-invariants` new hub tables lacked FORCE RLS (**real defect**, fixed in `6c77c56`) | `~/.codex/tmp/…33436c5-20260907.log` |
| A | `01ea702` | 2026-09-07 | — | INTERRUPTED (B's guard) | — | `…01ea702-20260907.log` |
| A | `46782cd` | 2026-09-07, 2,707.77 s | threads, 1 worker, serial files | **FAILED_COMPLETE_LOG** 15,996 / 1 fail / 59 skip; terminal exit code unavailable (usage limit), summary recovered from the saved log | `rls-invariants` "keeps care-access-foundation.sql the only source of policies" > 5,000 ms | `…46782cd-20260907.log` |
| Claude | `46782cd` | 2026-09-08T00:28:08Z, 314.21 s | forks, parallel workers, idle host | **PASS** 917 files / 15,997 / 0 fail / 59 skip, exit 0 | none | `docs/resource-hub/INDEPENDENT_QUALIFICATION_46782cd.md` (branch `fable/recruiter-resource-hub-20260906`) |
| A | `37cd7bf4` focused | 2026-09-08, 4.44 s | — | 23/23, unchanged timeouts | — | `full-suite-initial-disposition.json` |
| A | **`c350ab1c`** | 2026-09-08T03:12:11Z, in progress | threads, 1 worker, serial files | **RUNNING** at 03:40Z | — | `~/.codex/tmp/xenios-resource-hub-fullsuite-c350ab1-20260908.exit.json` (+ `.log`) |

Honest reading. The two runs at the same source disagree on one test, and
the only differences between them are host load and pool configuration.
The test that times out walks the real `supabase/` tree and is bounded at
the unchanged 5,000 ms; it passes in isolation (A: 23/23 twice) and in the
parallel idle run. That makes it a **capacity-sensitive repository-walk
test**, not a product failure — and it is still a failing gate on the run
where it failed. Nobody relabeled anything; A's records say FAILED where they
failed. **The gate for this candidate is the `c350ab1c` result when it
lands**, read from its exit receipt and log. If it times out again on the
same test under the serial configuration, the disposition belongs to A and
the reviewer: either accept the parallel idle run as the qualifying run with
this table attached, or raise the timeout as a **scoped, reviewed test
change with a stated reason** — never silently.

Also worth knowing: the `33436c5` FORCE RLS failure was a genuine defect
that the suite caught and A fixed; that is the suite doing its job.

## 2. Endpoint comparison: 27 SAME / 3 REGRESSION

The three are `GET /api/care/status`, `GET /api/care/access-request/status`
and `GET /api/care/tebra/configuration`: live 200, local timeout at ~10 s or
`acceptingRequests` false. A's static review: 18 inspected sources
byte-identical; the local child had no Care, Tebra, database or email
configuration; both timing-out handlers await `loadCapabilityStatus`, whose
local fixture answered 503, which PostgREST retries with sleeps.

Claude's added evidence, from Git at `c350ab1c` versus `ff3c496`:

- `server/care/**`, `shared/care/**`, `server/index.ts` and
  `server/supabase.ts`: **no diff at all** (`git diff --stat` empty).
- The eleven changed non-test server/shared modules are all Resource Hub,
  partner-portal, research-wall or `auth-return-to` files. A transitive
  import walk from every `server/care/**` and `shared/care/**` module (see
  the appended result below) shows whether any changed module can be loaded
  by the Care handlers; the research wall is mounted at `/api/research`,
  which the three Care paths never enter.
- The same local child answered the other 27 endpoints SAME, so a
  load-time break in a changed module is excluded empirically.

**Correction (Samuel, 2026-09-08): the import walk narrows the
investigation; it does not prove the release cannot affect these routes.**
Shared application initialization, middleware, configuration and process
behaviour are outside a module-import graph, and A's own comparison records
an altered environment: refusal responses from the local provider,
suppressed retry timers leaving two requests pending, and absent email
configuration flipping `acceptingRequests`. Environment mismatch is
therefore a *supported* explanation, not an established one, and A's
document says exactly that it does not establish production parity.

Smallest useful closure: a **bounded comparison of the three routes with the
same controlled provider responses and configuration for baseline
(`ff3c496`) and candidate (`c350ab1c`)** — preserve the original
27 SAME / 3 REGRESSION result, attach the new paired result and its
disposition, and then include the three GETs in the authorized production
smoke. Not a broad re-audit, and not a pass declared from the walk alone.

## 3. Privacy input V2: coverage, and the smallest action left

A's receipt (`docs/revenue-launch/20260907/privacy-input-v2-preparation-receipt.json`,
metadata only): 67 bytes, 6 entries after 13 exact duplicates removed, from
3 applications (first + last), 3 members (first only; the same three people
via the FK), 12 outbox `payload.firstName` and 2 `payload.customerName`
occurrences; partners table empty; **3 scanner-eligible** full names, 3
first-name-only entries the scanner ignores. SHA-256 `de85b8ff…`, restricted
directory. **Not approved.**

What it does not cover, in A's own words: deleted historical records,
backups, prior recipient documents; and the external team, advisor and
business-contact material the proposal named as a source. Those are the
people most likely to appear in *documents* in this repository (the internal
guides, the revenue-share proposal, the advisor agreement), which is exactly
where a release diff would leak a name.

Smallest authorized action: Samuel (or A under Samuel's explicit
authorization for those documents) adds the full names of the team,
advisors and named counterparties from the internal documents already in
the founder's possession, records each source document by hash, and writes
**version 3** with a new byte count and SHA-256 — no invention, no removal,
no scanner change. Approving V2 as-is would be approving a list that
knowingly omits the names most likely to matter; Claude recommends against
it, and it is Samuel's call.

## 4. Affiliate requirement: exclusion stated, next task defined

Confirmed from source at `c350ab1c`: `client/src/research/pages/partners/Dashboard.tsx`
offers only a "Referral links" button; `client/src/research/recommendation/qr-export.ts`
produces SVG only. The requested **dashboard share/code/link/QR card with
PNG download is not in this candidate.** Claude's 21/21 walkthrough covers
the Links page as built and must not be read as covering the dashboard card.

Because the source is frozen, this is an **exclusion** for this release
unless Samuel orders a scoped correction with requalification. The next
implementation task, concretely: a card on the partner dashboard that shows
the partner's current ready recommendation link, copy/share controls,
the QR (reusing `createRecommendationQr`), and a PNG export (rasterise the
existing SVG through a canvas `toBlob("image/png")` in `qr-export.ts`),
principal-bound and refusing revoked/expired links exactly as the Links
page does, with focused tests and a rendered proof at 320/390/1440. Training
and Support 320 px overflows are a second scoped correction of the same
kind.

## 5. Effects the eventual approval must name

Beyond the deploy: the migration creates three FORCE-RLS tables, three
functions and one private bucket; the flag stays absent for Milestone 1; and
**a production resource download inserts a delivery/audit row**, so the
Milestone 2 checks are not read-only and the request must say so.

## Appendix — transitive import walk from the Care handlers

Method: from every non-test module under `server/care/**` and `shared/care/**`
at `c350ab1c` (47 roots), follow every static `import … from` and dynamic
`import()` through relative and `@shared/*` specifiers, transitively.

```
careRoots: 47
transitiveModulesFromCare: 59
changedServerShared (non-test, ff3c496..c350ab1c): 11
changedReachableFromCare: []          <- none
```

For contrast, the same walk rooted at `server/index.ts` reaches all eleven —
as it must, since `server/index.ts` registers the research API — which is why
the empirical fact matters too: that same local child served the other 27
endpoints SAME, so nothing changed broke at load time. `server/index.ts`
mounts `registerResearchApi` at line 377 and the Care registrars at 489–493;
the research wall is scoped to `/api/research` and the three Care paths never
enter it.

What this establishes, and no more: **no changed module is loaded through
the Care handlers' own import graph.** It does not cover shared startup,
middleware order, configuration or process-level behaviour, and it does not
replace the paired same-fixture comparison described in section 2. The
local differences are consistent with the absent providers A documented;
live provider parity is proven only by the post-deploy smoke.
