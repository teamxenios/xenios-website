# Xenios client-account FINAL integration RC — release report

Date: 2026-08-27 · Integrator session: `claude-fable-final-integrator-20260827`
Production deploy: **not performed** · Migration: **not applied** · Invitations: **none**

## 1–7. Identity and lineage

1. Integration worktree: `C:\Users\sboad\projects\xenios-client-account-final-integration-20260826`
2. Branch: `integration/xenios-client-account-final-rc-20260826`
3. Original release SHA: `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` (release/early-access-code-session-checkout HEAD, includes Hino)
4. Hotfix SHA: `b8359eba179fb7a901df58be6b949b3956a43c39` (hotfix/xenios-research-live-ux-performance-20260825 HEAD)
5. Reconciled base SHA: `6a2df29837800436f351abacf63b8d3a07939566` (release + all six unique hotfix commits; both sides of the protection manifest preserved and hash-verified)
6. Claude backend SHA: `42a318303ff4dc522eceeadf1cb6f9fa8e634137` (substantive checkpoint `f4e916f`, shared contract checkpoint `cb5a14c`)
7. Codex UI commits: `f6aa32dee7400af5ac9cdacfcae8e4c6f8972657` (implementation) + `e376f80c75a7a97e53e3f28ec198eca1b7d81283` (handoff)

Merge-base facts verified before any edit: release and hotfix diverge at
`df16b36`; the Claude branch is based on the release HEAD; Codex forked from
the shared contract checkpoint inside the Claude branch. Nothing was silently
omitted from either line.

## 8–9. Files changed, conflicts and resolutions

- Whole RC vs the original release HEAD: **194 files, +12,805 / −469** (this
  includes both merged lanes). Integration-authored work after the merges: 62
  files (27 of them the browser-QA packet).
- Merge conflicts, all in fleet-coordination JSON, all resolved as the UNION
  of every lane's records (no handoff history lost):
  - Claude merge: `.xenios/SESSION_REGISTRY.json`
  - Codex merge: `.xenios/ACTIVE_TASKS.json`, `.xenios/CODE_OWNERSHIP.json`, `.xenios/SESSION_REGISTRY.json`
- `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` auto-merged cleanly in the
  reconciliation (Hino exemption + hotfix hash notes touch different regions);
  verified by content grep and by the 32-test protection suite.

## 10. Protected files changed (deliberately, with the seam protocol)

| File | Change | Manifest note |
|---|---|---|
| `server/index.ts` | nine additive imports + two register* calls (customer-account with id-bound member lookup and graduated sources; client-import with UUID batch factory), inside the existing registration block | chained note, old `bbf2a205…` → new `765fc162…` |
| `server/research/index.ts` | SEN-0023-pattern wall admissions: seven exact `/customer-account` read paths, one exact write path, one anchored canonical-UUID document shape; Bearer required on all | chained note, old `b1fdbf43…` → new `64238c14…` |
| `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` | the two seam hashes + two dated notes in the established chained format | — |

Honest caveat: the cross-commit zone script
(`verify-core-site-protection.mjs <base> HEAD`) flags files outside the write
zones that were inherited from the three source lanes (`.xenios/**` fleet
memory, the hotfix's own `tsconfig.json` + `e2e/harness` changes shipped in
its verified RC, `config/research/product-activation-overlay-20260826.json`
from the Claude lane) plus this branch's
`config/research/catalog-priority-projection-20260826.json`, which follows the
overlay precedent. The authoritative protection SUITE
(`server/core-site-protection.test.ts`, 32 tests including the seam-baseline
check) is green at HEAD. The manifest was not widened.

## 11. Routes registered

Member surface (guard: injected `requireMember` via `adaptGuard`; wall:
bearer-gated exact-path admissions):
`GET /api/research/customer-account/{overview,orders,subscription,care,documents,support,catalog-priority}`,
`GET /api/research/customer-account/documents/:documentId` (ownership-scoped
bytes, canonical-UUID wall anchor), `POST /api/research/customer-account/support`.
Admin surface (guard: `requireSupabaseAdmin` via `adaptGuard`, outside the wall):
`POST /api/admin/research/client-imports/dry-run`,
`GET /api/admin/research/client-imports/:batchId`,
`GET /api/admin/research/client-imports`.
Client: the six `/research/account/*` routes were already mounted by the Codex
lane behind `RequireMember`; this branch added the closed returnTo allowlist,
the exact-return rule, the review-gate exemption for exactly the six
registered routes, and the MEMBER_NAV entry.
Route census: **408 registrations / 399 call sites, zero duplicates**
(`verify-route-uniqueness` accepted; release-control-plane pin moved
387→399 / 396→408 with a dated rationale).

## 12–13. Capability matrix

**REAL AND CONNECTED**
- Identity — `research_members` via an id-bound lookup (the guard's member key
  is `research_members.id`; the builder's `auth_user_id` fallback is not used).
- Membership state — `research_members.status` + `billing_state` mirroring
  `requireActiveMember`'s rule (billing participates only when
  `RESEARCH_MEMBERSHIP_BILLING_ENABLED=true`; sponsored_b2b exempt; missing
  state reads verified-legacy). `manualBilling: true`, `manageUrl: null` —
  honestly manual.
- Research orders — the ONE decorated member orders service (commerce + Early
  Access XEA- history via the M67 RPCs). Labels/quantities from real detail
  lines; tracking links only for carriers with known public URL shapes;
  unreadable detail fails the read closed.
- Support — `research_member_questions` (ledger row 18): durable member-scoped
  reads AND writes, portal category preserved via a body marker inside the
  existing CHECK vocabulary, classic-row conservative mapping, shared
  10/hour throttle, failures THROW (never an empty lie), no deadline promises.
- Documents (listing) — `research_plan_documents` behind the SAME capability
  pair as the existing Document Center; `storage_path` never crosses the
  boundary.
- Catalog-priority projection — the audited activation overlay composed with
  the gap report's adversarially-verified per-category bases
  (`config/research/catalog-priority-projection-20260826.json`, evidence per
  entry); statuses only on the wire; the resolver is monotonically restrictive
  so no join can publish availability the catalog didn't already grant.

**HONEST EMPTY STATE**
- Orders while commerce is in state 1/2 (flag off / DB unprovisioned) — the
  same truth `GET /api/research/orders` gives today.
- Documents while the capability flags are off.
- Product interests — `[]` (candidate SQL unapplied).
- Partner attribution — `null` on the member surface always; no durable
  binding source applied.
- Care — `enrolled: false`, "Care not started"; the existing intake route
  remains the only door.

**DISABLED PENDING CAPABILITY**
- Document BYTE downloads in production — no production `DocumentBytesStore`
  adapter exists; every listed document ships `downloadPath: ""` and the
  client renders its honest "Download unavailable" state. No fake button.
- Care status content — until `care_capabilities.state='enabled'` +
  `approved_by/approved_at` + `CARE_ENABLED` + `CARE_ENABLE_APPROVED` (note:
  Care identity keys on `auth_user_id`, not `research_members.id`).
- Stripe billing portal link — the seam has no production caller and no
  portal-session function; nothing real to link.
- Support POST without the durable source composed — throws
  `support_capability_pending` (production composes the durable source, so
  this fallback is dormant but pinned).

**REQUIRES DATABASE MIGRATION (candidate rehearsed, NOT applied)**
- Product interests (`research_customer_product_interests`).
- Durable client-import staging store (the mounted admin surface uses the
  deliberate in-memory interim: batches evaporate on restart, staged
  identity rows never leave process memory).
- XEC- cart history (migration 73 PENDING + its flag; flag-before-apply fails
  all order history by design — do not set early).

**REQUIRES EXTERNAL INTEGRATION / NEW SQL**
- XRR- assisted-order request history in the portal — needs a new
  list-by-member SECURITY DEFINER RPC (only per-reference status exists; no
  admin-surface workaround was taken).
- COA retrievability (`lotCoaAvailable` stays false until a certificate
  provider is composed).
- Carriers beyond USPS/UPS/FedEx for tracking links.

## 14. Migration rehearsal evidence

`docs/research/CLIENT_ACCOUNT_MIGRATION_REHEARSAL_2026-08-26.md` — disposable
Docker PostgreSQL 15.19 with the Supabase role model mirrored. Clean apply; no
extensions; forced RLS on all five tables with zero policies;
anon/authenticated hold nothing; service_role exactly the minimum verbs;
founder-approval constraint unrepresentable on INSERT and UPDATE; append-only
audit via privilege denial; idempotency on `(batch_id, normalized_name_key)`;
preflight refuses reruns atomically with data intact; a mid-transaction
failure creates nothing; rollback + re-apply both succeed. Container and
databases destroyed. **The migration remains unapplied everywhere real.**

## 15. Client-import aggregate evidence (real file, safe boundary only)

The real partner file was converted locally (outside the repo) and run through
`scripts/research/client-import-dry-run.ts` only. No database write, no name
in any output. Aggregates reproduce the canonical numbers exactly:
**201 source rows · 109 unique people · 92 duplicate name rows · 45
multi-interest people · 210 mapped mentions · 46 distinct interest keys · 0
unmapped strings · 3 ambiguous "&"-blends (CJC/Ipa & AOD, CJC/Ipa & IGF-LR3,
AOD-blend & NAD+) · 109 missing contact · consent all pending · 0
invitation-eligible.** A programmatic scan confirmed none of the 109 names
appears in the report output.

## 16–24. Verification

| Gate | Result |
|---|---|
| Full repository suite (final, all commits) | see the Final verification table below |
| Early Access release-gate e2e | **53/53** |
| Assisted-order + hotfix-focused server suites | green (57 tests incl. core-site-protection 32) |
| Customer-account backend suites (routes/production/support/documents/orders/preview-guard) | green (55+) |
| Client-import suites | green |
| Product-activation suites (overlay + catalog projection) | green |
| Customer portal UI suites + routes-parity | green |
| Auth/redirect suites (member-routing, sign-in, persona, gate-exemption) | green (66) |
| Member-session wall (admissions + near-misses) | **217/217** |
| Document-authorization tests | green (unit + preview-guard + browser 200/404/401) |
| Production-port tests | green |
| Release control plane | **35 pass / 1 intentionally skipped** |
| Migration DAG | accepted (35 nodes, checksums verified) |
| Route uniqueness | accepted (408/399, zero duplicates) |
| TypeScript (`tsc --noEmit`) | **clean** |
| Production build (`node script/build.mjs`) | **pass** (client + 1.5MB server bundle) |
| Browser QA | all 16 flows + 8 widths + 200% green — `docs/review/client-account-final-integration-20260826/` |
| Secret scan (whole integration diff) | clean (single match is a test-fixture literal `"do-not-expose"`) |
| PII/name scan (whole integration diff vs all 109 imported names) | clean — the ONLY match is "Seth Grant" himself as the intended partner attribution in internal fleet documents; the client-side policy suite pins partner identity out of every customer-facing surface |

Final verification (re-run at HEAD with every commit included):

- Full suite: **10,655 passed / 43 intentionally skipped / 2 timeout-failures
  under full parallelism**, both in repository-SCANNER test files
  (`customer-price-authority` superseded-path scan, `supplement-catalog`
  client-import scan) — the exact contention class the 2026-08-25 hotfix RC
  documented and worked around; both files pass **37/37 in isolation in under
  5 seconds**. An earlier full run at the same HEAD showed the same pattern on
  a different pair of scanner/heavy-render files (also green in isolation:
  19/19), confirming this is machine contention, not code. **No newly skipped
  test**; the 43 skips are the repository's standing intentional set.
- Rebuild after the final commits: **pass** (client bundle + 1.5MB server
  bundle). TypeScript at HEAD: **clean**.
- Node caveat: local verification ran on Node 24.14.1; `engines` pins 20.19.0
  (the 2026-08-25 hotfix built on 20.19.0; Render builds with its own
  toolchain). No Node-version-specific failure was observed.

## 25. Remaining blockers

1. Candidate SQL is rehearsed but unapplied; applying it (with ledger + DAG
   registration) is a founder-gated step, after which the in-memory
   client-import staging store and the empty interests port graduate.
2. XRR- portal order history needs a new list-by-member RPC (SQL not written —
   out of scope for this RC by design).
3. Production document BYTE downloads need a real storage adapter.
4. Care remains disabled end-to-end; the portal shows the honest state.
5. Seth's file contains no contact/consent data: 0 of 109 people are
   invitation-eligible. Contact enrichment is a business task, not a code task.
6. Kris's confirmations remain VERBALLY_CONFIRMED_PENDING_DOCUMENTATION; the
   written 11-field activation matrix + founder approval are required per item
   before anything can project live.
7. Full-suite parallel runs on this machine keep timing out the two known
   contention-sensitive files (pass in isolation) — pre-existing, documented.

## 26. Founder decisions required

1. GO/NO-GO on deploying this RC (nothing here deploys itself).
2. Apply the candidate migration (then swap the staging store + interests port).
3. The review-gate exemption for the six registered `/research/account/*`
   routes (this RC ships it: signed-out customers reach sign-in with an exact
   returnTo instead of the reviewer password; the early-access family already
   has the same exemption; RequireMember + the Bearer wall remain in force).
   Reject it and the client change is one small revert in `layout.tsx`.
4. Portal support writes ride `requireMember` (not `requireActiveMember`), so
   a member with a billing problem can still ask for help; tighten if desired.
5. Catalog-data release packet (56% of mapped demand is one data release away)
   — separate GO, untouched by this RC.
6. Partner seed (Vitality Advisors / Seth Grant) and any invitation wave —
   blocked on contact/consent data AND founder approval by design.

## 27–29. Final identity

27. Exact final HEAD SHA: assigned by the commit that freezes this report —
    following the 2026-08-25 hotfix RC convention, this document deliberately
    does not self-reference its own commit. The exact SHA is recorded in the
    integrator's session report and verified against origin with
    `git ls-remote origin integration/xenios-client-account-final-rc-20260826`.
28. Origin verification: performed by the integrator immediately after the
    push of this branch; the ls-remote output must equal the local HEAD.
29. **READY FOR DEPLOY REVIEW: YES** — lineage reconciled (release + hotfix +
    both lanes, nothing omitted); every mounted route guarded and
    wall-admitted; no PII leaked; no fake persistence (every enabled customer
    action has a durable backend or an honest disabled state); the migration
    remains unapplied; no real account, invitation, message, or activation was
    created; suite/build/e2e/browser QA green as tabled above. Deploy itself
    remains a founder decision with the decisions in §26 attached.
