# 16 — Integration review: strategy package vs final Codex candidate

Reviewed 2026-09-26 by `claude-clarity-spec-20260926`. Docs-only; no runtime source edited, and production not touched.

| | |
| --- | --- |
| Strategy reviewed | content tip `7307d73296e568186db72e53cb87e60eccd01b82`, head `91e8473051a22dde0ab3ccdac7a44c01f965e64f` (base `049dfd9`) |
| Final Codex candidate | `3298f279ad760a861e26e3e08514bb49694fae38` (tree `ac69ecf8…`) |
| Codex evidence tip | `bad1c4124ef3a199eec01802438073cdf73b2b83` |
| Production | `79414143d4355d5d3d14cd5fe6e5a536dc68d99d` (unchanged) |

## 1. What was reviewed

- **Strategy files (23):** all artifacts under this directory.
- **Codex final (6):**
  - `RELEASE_PACKET.md`, `HANDOFF.md`, `CONTINUATION_RESULTS.md` and `PROTECTED_CHANGE_REVIEW.md` @ `bad1c41`
  - `CORE_SITE_PROTECTION_MANIFEST.json` @ `bad1c41`
  - the `c4ea8a9..bad1c41` history (18 commits) and path diff
- **External and live sources (5):**
  - live 18-tab Google UX doc (current-closeout notices on every tab)
  - System Labs audit PDF (2026-07-24)
  - founder commercial directive folders (2026-08-17)
  - Stephen/Compass notes + transcript (re-used)
  - shared brief + protocol (re-used)
- **Re-verification at `3298f279`:** claim-string occurrence counts; catalog/provider authority files unchanged since `049dfd9`; `supabase-store` LOI API; active leases.
- **Scenario ledgers** (`SCENARIO_RESULTS.csv`, `CONTINUATION_SCENARIOS.csv`) were used only through their summaries in the packet and continuation results; row-level contents were not re-audited. That is the CODEX_00 lane's job.

**Thread archive (updated 2026-09-26, CLAUDE_05):** `Xenios_Current_Thread_Archive_2026-09-26(1).md` is available to Samuel and was reviewed in `XENIOS_FULL_DOCUMENT_REVIEW_2026-09-26.md` (S28); its founder context is incorporated via that review. This lane cannot download the Gmail attachment and has not read it directly. The written System Labs findings **were** found (PDF) and are integrated.

## 2. Verification of the original major findings against `3298f279`

| Original finding | At `3298f279` | Evidence |
| --- | --- | --- |
| Three websites under one domain | **Holds** | Application bytes identical to `c4ea8a9`; three test files differ |
| Root is a coach-AI waitlist | **Holds** | "The AI workspace for serious coaches" ×1 |
| Care/products in a separate health shell | **Holds** | Gateway/MinimalChrome unchanged; "Xenios Technology<" ×1 |
| "Early Access" has multiple meanings | **Holds** | No nav/copy change |
| Partner application effectively unreachable | **Holds** | Commerce flag off; gate unchanged; "Research Rep" ×15 |
| Public catalog not mounted | **Holds** | No route changes (route uniqueness 448/439 unchanged) |
| All 420 products draft copy | **Holds** | Dataset unchanged |
| 513 units: 0 direct / 124 assisted / 242 Care / 147 unavailable | **Holds** | `docs/production-completion/catalog/**` unchanged since `049dfd9` |
| Five practice models | **Holds** (re-classified, §5) | — |
| 12 owner decisions | **Corrected to 13** (careers added; B-1 now carries the protection directive) | `17_OWNER_DECISION_PACKET.md` |
| Unverified public claims | **Hold** | 72 hours ×22, one business day ×8, state-licensed ×6, $30/month ×3, third-party testing ×1 |
| Active path leases | **Hold; re-classified as stale** | 4 leases, heartbeats 2026-08-21 to 2026-09-24 |
| Secure-documents dead end (part of CUX-12) | **Repaired** before this review | Link now targets `/research/account/documents` and preserves it through sign-in |
| "Prepare an inquiry" | **Repaired** to "Send an inquiry" | CTA matrix still retires it in favor of **Submit Inquiry** |

## 3. Stale assumptions corrected (14)

1. **Runtime identity.** `c4ea8a9` → `3298f279`; the application is identical. `01_CURRENT_SOURCE_IDENTITY.md`.
2. **Release status.** "NOT ACCEPTED, 2 failures" → gates PASS, manifest ACCEPTED, 18,055/85/0, deployment unauthorized. `01`, `00_SOURCE_LEDGER` S22.
3. **Base.** "No qualified base exists" → expected base `3298f279`, pending CODEX_00 disposition. `18` §1.
4. **Editability.** The strategy treated Home, Navbar, Footer, `lib/nav.ts`, `App.tsx` and the root route as editable. They are protected by Samuel's **2026-07-29 core-site directive**, and the closeout hard-locks their bytes → decision B-1, full vs fallback mode. `04`, `07`, `17`, `18`.
5. **Durable-inquiry location.** It was planned for `server/routes.ts` / `server/services` (protected) → moved to a new `server/research/` endpoint. `10` N-09, `PAGE_SPECIFICATIONS` P-07, `18` step 12.
6. **Schema.** Durable inquiries were assumed to need new schema → a no-migration path reuses the existing `loi_submissions` store API (`insertLoi`/`updateLoiStatus`/`listLoi`), with a STOP if owner/due-date columns are needed. `18` §6.
7. **System Labs findings.** "They do not exist" → the 36-page audit PDF was found and integrated as a register of mistakes not to repeat. `SYSTEM_LABS_REFERENCE_ANALYSIS.md`.
8. **Commission terms.** Recorded as an unresolved conflict → the **founder directive of 2026-08-17** governs (20/7.5, 21-day hold, $50, biweekly Friday, clinical never commissionable). `draft-schedule.ts` 20/15 is the superseded pack. `09`, `17` F-1, CUX-18, CLAIM_LEDGER.
9. **Claim-ledger statuses.** Moved to the CLAUDE_03 vocabulary (VERIFIED FOR PUBLIC USE / VERIFY WITH OPERATIONS / CLINICAL REVIEW / COUNSEL REVIEW / FOUNDER APPROVAL / DO NOT PUBLISH), with a verified-at column. `CLAIM_LEDGER.csv`.
10. **Brand module path.** It was placed in `client/src/lib` (protected) → its location now depends on the mode. `02`.
11. **Careers.** Treated as a "helpful default" on an editable page → decision I-1; `/careers` is protected. `17`, `07`.
12. **Lease reading.** The Care and assisted-order leases were treated as live → they are stale (work shipped in `79414143`); `fulfillment-copy.ts` / `customer-status.ts` are not leased. `18` §4–5.
13. **Test totals.** 18,053 pass / 2 FAIL → 18,055 / 85 / 0. `01`.
14. **Desktop zoom.** It was absent from UAT, and the audit left it NOT RUN → added U-G09 (real desktop zoom and reflow at 200% and 400%). `11`.

## 4. Contradictions resolved (11)

1. **Commission 7.5% vs 15% repeat.** The founder directive governs; the 15% draft is marked for retirement (F-1).
2. **"Infinity Health" (call) vs "Eon Health" (brief).** Both deferred; "Xenios" stays until a legal choice is made (A-1). The owner confirms.
3. **UX doc tab 12 ("Primary Sign in / Secondary Get access") vs the controlled vocabulary.** "Get access" is ambiguous (account? order? Care?). Resolution: Sign In visible at every width plus Start Care; "Get access" retired.
4. **Brief "Start Care primary" vs the founder's mobile directive** (the Care-only sticky CTA was wrong; sign-in must be obvious). Resolution: the header shows Sign In and Start Care at every width, with no Care-only sticky bar.
5. **Brief's new homepage vs the July core-site directive.** Explicit decision B-1 with a defined fallback.
6. **Gemini "medical directors authorize all orders" vs the transcript and code** (Research orders are not clinician-reviewed). C-046/C-007 DO NOT PUBLISH.
7. **Samuel on the call ("practices should be approving everything") vs clinical authority.** Model C: the clinician decides and the practice never approves treatment; Q-04, C-043.
8. **Two decision records** (`02` full text vs a new packet). `02` is now an index; `17` is the sole answer record.
9. **Two implementation plans** (`12` vs `18`). `12` is marked superseded.
10. **Mixed decision IDs** (D-xx vs packet IDs). 441 references rewritten to packet IDs; the map is kept in `02`.
11. **"Up to 12 products" vs the founder's 14-featured layer.** C-1 first used the featured layer; superseded by CLAUDE_05 (tiles only in the first release; named products in a later pass).

## 5. Practice models re-verified (Stephen/Compass principal case)

| Model | Current capability | Approved near-term (if packet approved) | Proposed future | Legal/clinical review | Not supported |
| --- | --- | --- | --- | --- | --- |
| A Referral | Public explanation missing; inquiry email-only; attribution dark | Practice pages + durable inquiry | Referral V1 + bindings + commission activation | Q-01, Q-03, Q-07 | Commission on Care |
| B Workspace | Partner portal dark; org API mounted, tables unapplied, name collision | Explanation page only | Portal + Pack 02 mount; opt-in client visibility | Q-06 | Client impersonation; editing client accounts |
| C Care integration | Client-submitted Care request works | "Care for your clients" page | Referred-by context field (no commission) | Q-03, Q-04 | Practice approving treatment |
| D Wholesale | None | "Under review" line | Separate program | Licensing, pharmacy, storage | Public wholesale pricing |
| E Programs | None | None | Marketplace | Per service | — |

Detail: `09_PRACTICE_MODEL.md` §Capability classification. Stephen's 15 questions remain answerable from the practice pages once E-1, E-2, F-1 and G-1 are answered (or with their DEFERRED texts).

## 6. Matrix status

| Artifact | Result | Change |
| --- | --- | --- |
| `08_PRODUCT_PATHWAY_MATRIX.csv` | **PASS** | Counts verified unchanged; decision IDs rewritten |
| `07_CTA_MATRIX.csv` | **UPDATED** | Added `gate` (54 of 61 CTAs need B-1) and `fallback_if_B1_declined` |
| `10_NOTIFICATION_MATRIX.csv` | **UPDATED** | N-08/N-09/N-13 moved to allowed-zone endpoints; N-06 external delivery still NOT RUN |
| `11_UAT_MATRIX.csv` | **UPDATED** | +U-G09 zoom, U-112 gate with amendment, U-113 fallback gate, U-114 leases (79 rows) |
| `CLAIM_LEDGER.csv` | **UPDATED — needs owner input** | 47 claims: 11 VERIFIED FOR PUBLIC USE, 8 VERIFY WITH OPERATIONS, 2 CLINICAL REVIEW, 2 COUNSEL REVIEW, 9 FOUNDER APPROVAL, 15 DO NOT PUBLISH |

## 7. Special-attention claims (final status)

| Claim | Status |
| --- | --- |
| Licensed clinicians decide (C-004) | CLINICAL REVIEW |
| Licensed pharmacy (C-005) | VERIFY WITH OPERATIONS; remove until verified |
| Third-party testing (C-008) | VERIFY WITH OPERATIONS; remove |
| 72-hour shipping (C-010) | VERIFY WITH OPERATIONS; remove |
| One-business-day response (C-012) | FOUNDER APPROVAL; remove by default |
| Catalog counts (C-011) | DO NOT PUBLISH |
| Product prices (C-016) | FOUNDER APPROVAL per SKU (C-2) |
| Provider review of orders (C-046) | DO NOT PUBLISH |
| State coverage (C-003) | VERIFY WITH OPERATIONS; neutral wording |
| Commissions: wording (C-025) / numbers (C-026, C-027) | FOUNDER APPROVAL / DO NOT PUBLISH |
| Client ownership / "your client stays your client" (C-028) | FOUNDER APPROVAL |
| Account cost (C-021) | VERIFY WITH OPERATIONS |
| Care request free (C-020) | VERIFIED FOR PUBLIC USE |
| Care vs Research separation (C-019) | VERIFIED FOR PUBLIC USE |
| Product formats (C-017, C-047) | VERIFY WITH OPERATIONS / DO NOT PUBLISH (premixed) |
| 24/7 support (C-033) | DO NOT PUBLISH |
| Clinical follow-up (C-043) | CLINICAL REVIEW |

## 8. Coordination with the parallel Codex lane

CODEX_00 (release disposition for `3298f279`) runs in parallel. This package does not depend on its outcome except for the base line in `18` §1. Deploying `3298f279` does not conflict with the redesign: the redesign branches from the same application bytes. If `3298f279` is deployed first, the "production" column in `01` changes, and the fallback/full-mode analysis does not.

## 9. CLAUDE_05 finalization pass (2026-09-26)

Inputs:
- `XENIOS_FULL_DOCUMENT_REVIEW_2026-09-26.md` (S28), including the thread-archive content it reviewed firsthand
- disposition addendum @ `0b351a1` (S29)

The ten corrections were applied as follows:

| # | Correction | Where |
| --- | --- | --- |
| 1 | Archive no longer marked missing; recorded as available and reviewed via S28; this lane has not read it directly (Gmail attachment not downloadable) | `00` S28 + missing table, `16` §1, `03` |
| 2 | Q-15 removed (with note) | `03` |
| 3 | "Eon clinician" / "Eon's clinician" → "Care clinician" (4 files) | `09`, `PAGE_SPECIFICATIONS`, `STEPHEN_COMPASS_CASE_STUDY`, `SYSTEM_LABS_REFERENCE_ANALYSIS` |
| 4 | N-09 storage reconciled with the no-migration `loi_submissions` path; owner = founder in the command-center layer; due date only if current fields support it; STOP otherwise | `10` N-09, `18` §6 |
| 5 | Neutral hero recommended; public "clinician-guided" strings neutralized; clinician-statement rule added | `17` B-2, `05` §2/§3/§11, `04`, `PAGE_SPECIFICATIONS` P-01, `SYSTEM_LABS…`, `CLAIM_LEDGER` C-002 |
| 6 | Tiles-only first-release product scope | `17` C-1, `04`, `05`, `PAGE_SPECIFICATIONS` P-01/P-03, `18` step 9, `11` (U-025; card tests marked later pass) |
| 7 | No dependency on a founder product list for the first release | `17` C-1, `18` step 9 |
| 8 | Careers = confirmed open roles + general interest | `17` I-1, `05` §11, `PAGE_SPECIFICATIONS` P-14, `18` step 11, `11` U-116 |
| 9 | Eon/Infinity internal or future only | `02` brand table, `17` A-1, `11` U-115; grep shows no public-spec use |
| 10 | Contradiction recheck | see below |

Recheck (grep across all `.md` and `.csv`): no old decision IDs, no "up to 12/6 product cards", no "keep the three roles", no public "clinician-guided" copy, no public "Eon clinician". The approval route is consistent in `17`, `18`, `19`, `20` and `EXECUTIVE_SUMMARY`. **0 contradictions remaining.** Owner answers remain PENDING SAMUEL APPROVAL.

## 10. CLAUDE_06 approval recording (2026-09-26)

Samuel's statement "APPROVE THE REVIEWED XENIOS CLARITY DECISION SET", with owner instructions and revisions, was confirmed in-session ("Yes, record it as written").

Recorded in:
- `19_FINAL_OWNER_APPROVAL_RECORD.md` (verbatim)
- `17` (13 Answer lines)

Propagated to:
- `05` (hero, D-1, G-1 conservative, F-1, E-2, H-1, careers, A-1)
- `PAGE_SPECIFICATIONS` (P-07, P-14)
- `04`
- `11` (U-116)
- `18` (full mode, careers)
- `CLAIM_LEDGER` (new C-048; C-003/025/029/030/032/044 approved wording; C-028 stronger promise to counsel)
- `EXECUTIVE_SUMMARY`
- `LANE_CLAIM`

`20_CODEX_READY_HANDOFF.md` supersedes the pre-approval handoff.

Contradiction recheck: no remaining "PENDING SAMUEL APPROVAL" in governing files; no public "your client stays your client"; no named careers roles; no public Eon/Infinity.
