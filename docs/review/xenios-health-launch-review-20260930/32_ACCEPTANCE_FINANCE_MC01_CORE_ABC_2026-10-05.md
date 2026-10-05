# Acceptance record: Finance `dfd8b9b`, MC-01 `ed9bb9b`, Core A/B/C `70cd421` (2026-10-05)

**Base:** all three lanes branch from Core coordination tip `3eaa017` (runtime `c0e25c73`).

**Binding criteria:**
- docs 28 (A–E), 29 (impact map), 30 (protected baselines) and 31 (S1–S7, IC-1/2/3, source-only D/E schema);
- report 26 (ADP-G1 R1–R4).

**Method:**
- Claude's independent executions on this host, listed per lane.
- Five read-only source lenses with adversarial verifiers (workflow `wf_6ad98102-4ea`). Full findings are in
  `hl12/32_lens_findings.json`.
- **Host constraint:** C: has about 1.3 GB free (Docker holds about 80 GB reclaimable), so full aggregates were not
  run by Claude.

## Acceptance summary

| Lane | Reviewed | Verdict |
| --- | --- | --- |
| Finance | source `dfd8b9b` (tree `d00442d2`); evidence `b13c29e` (tree `07773360`, evidence/records only); handoff `963122c` (tree `3dd4f6ee`, records only) | **ACCEPT as a partial, source-only slice** (not relied on). ADP-G1 stays **PARTIAL**. |
| MC-01 | source `ed9bb9b` (tree `f5953b8e`); handoff `0b86108` (records only) | **ACCEPT at source level, with release preconditions.** D/E may branch from it. |
| Core A/B/C | source `70cd421` (tree `37ea9849`); tests `1a409e2`; evidence `3186799`; handoff `7d66573` | **NOT ACCEPTED.** One P1: the IC-2 timeline. Everything else verified. |

## Finance (`dfd8b9b`)

**Claude's execution:**
- **Disposable-database proof re-run** at `dfd8b9b` on PostgreSQL 17.11, no network: **PASS**. 11 groups, 69
  expected refusals, 1 reproduction of the M94 same-source spread.
- **Candidate hash:** the LF blob sha256 is `507376b80280b6a0f84bea020dfe34d52ea684d24c2861ef743d277928a9b53d`,
  matching the handoff.
- **Placement:** source-only. The file sits in `supabase/candidates/`. There is no change to `supabase/migrations`,
  `MIGRATIONS.md`, the DAG or the release-control maps, and nothing was applied.

**Claims checked:**

| # | Claim | Result |
| --- | --- | --- |
| 1 | Derives only from immutable original quarantined facts and strictly-prior exact bindings | Verified (ms-resolution chronology, immutable journal) |
| 2 | No caller-chosen target | Verified: the target is derived in SQL |
| 3 | No settlement or payment authority manufactured | Verified: no money, history, journal, outbox or settlement writes |
| 4 | An attributable event stops freezing unrelated same-source orders | **Partial:** holds only for "metadata-free event, then attribute". See FIN-ATTR-01 and FIN-SESS-01. |
| 5 | The attributed request stays held | Verified, permanently and with no lifecycle (FIN-ATTR-02) |
| 6 | A changed-payload conflict stays unassigned | Verified |
| 7 | Locking and grant recheck suffice | **Not executed.** Races are DEFERRED; static analysis found no P0/P1 deadlock (P3 FIN-5). |
| 8 | Journal, history, audit, outbox and money preserved | Verified |
| 9 | Policies and grants default-off, fail-closed | Verified |
| 10 | Source-only, unregistered, unapplied | Verified |

**P2 findings (none block integration as an unregistered candidate):**

- **FIN-ATTR-01, ordering trap.** A same-payment event that carries lineage, arriving after the metadata-free event
  but before attribution, is classified `payment_identity_conflict` with a null target. That row can never be
  attributed, so it freezes the source permanently.
- **FIN-SESS-01, session absence.** Refund and dispute events usually omit or change the session ID.
  - Attribution is refused when the session doesn't match (candidate:211-215).
  - After attribution, a later session-less sibling becomes a conflict through the unchanged M92 wrapper, which
    re-freezes the source.
- **FIN-ATTR-02, R1 narrowed, not closed.** These unbound reasons remain permanent source-wide freezes:
  - `missing_event_identity`, `binding_mismatch`, `unsupported_financial_effect` with kind `unknown`;
  - event and payment identity conflicts;
  - `source_revoked`;
  - foreign or early events.

  The attributed target is held forever, with no lifecycle (relates to R2 and G2).
- **FIN-ATTR-03 / FIN-2, missing evidence.**
  - No lock-order or race qualification has run (`races.mjs` exits 2, DEFERRED).
  - The full aggregate FAILED: 2 failed tests, plus 15 suites that failed collection with `ENOSPC`. Missing coverage
    is not passing coverage.
- **FIN-ATTR-04, R4 untouched.** Report 26 required fixing cross-scope rehoming first. The candidate's cross-scope
  safety currently relies on the TypeScript ingress stripping `providerPaymentId`.

**P3:**
- FIN-ATTR-05: contested event identity is still attributable.
- FIN-ATTR-07: revoking the attribution configuration is one-way.
- FIN-3: untested accepted kinds and settled targets.
- FIN-4: depends on wall-clock monotonicity.
- FIN-5: an admin revoke-then-lock transaction can deadlock.
- FIN-6: the uncertainty reason label is misleading.
- FIN-7: an inconsistent session note at `b13c29e`.
- FIN-8: R2, R3 and R4 are missing from the blocker matrix.

**Statuses:**
- ADP-G1 is **PARTIAL**; R1 is narrowed to one class; R4 is OPEN.
- G2, G3 and G4 are **OPEN**.
- F1 is **OPEN**.
- Refund, void, partial refund, dispute and chargeback are **OPEN**.
- LENS-01: detection closed (report 26); adoption **OPEN**.

**Integrable without claiming finance readiness: YES**, as an unregistered candidate plus verifiers. It changes no
runtime.

**Still required before anyone relies on it:**
1. On an idle or isolated host with enough disk, run `races.mjs` with a fresh quiet-precheck receipt. Cover both lock
   orders, plus these added races:
   - a lineage sibling appended against attribution;
   - attribution against a new reservation on the same source;
   - a grant revoked mid-command.
2. Re-run the full aggregate from a clean checkout after freeing disk. Only the inherited protection and seam
   failures are acceptable.
3. Fix R4.
4. Decide the session-absence policy.
5. Fix the ordering trap.

**Release implication:** no finance or provider capability may be enabled. Sources stay null and fail-closed.

## MC-01 (`ed9bb9b`)

**Claude's execution:**
- **Disposable-database proof** `research_media_commerce_decoupling_local.mjs` at `ed9bb9b`: **PASS** ("media is
  presentation-only; all named non-image commerce gates remain authoritative").
- **The 10 changed test files:** **127/127 PASS.**

**What is verified:** imagery is removed from every TypeScript commerce authority:
- cart selection, projection gating, the release-gate binding set and snapshot identity;
- blocker counts, the persistent-cart RPC payloads and the client adapters.

Malformed or absent media degrades to null without delisting the product. Non-image gates stay fail-closed: product,
variant, price, launch-control, inventory, COA and quality. The SQL is source-only and reconciled against the current
function bodies.

**P2 release preconditions:**

- **MC01-R1, decoupling is not self-sufficient at runtime.** Until the SQL chain is applied, SQL domain readiness
  still makes the primary image a commerce and release input. Yet the new admin copy already claims it doesn't.

  The `ed9bb9b` runtime may be promoted only together with this approved chain:
  1. the predecessor `research_persistent_cart` closure (unapplied; it depends on inventory-reservation and
     strength-write-gate);
  2. the reviewed MC-01 candidate;
  3. a canonical non-image `product_content` manifest re-approval;
  4. a separate launch transition.

  Alternatively, split the readiness decoupling into its own candidate that doesn't depend on the persistent cart.
  Until then, the admin copy at `ProductAdminDetail.tsx:1060` and `RequiredInputState.tsx:57` overstates current
  behaviour.
- **Pre-existing, routed to the Core/Product Control owner (not MC-01 blockers):**
  - Required-input keys are globally unique, while commerce binding requires per-product exact keys. So at most one
    product can satisfy cart eligibility, and a multi-product fixture is needed.
  - A claim merge can create a quantity above 50 that the TypeScript reader rejects, permanently bricking the member
    cart.

**P3:**
- Silent admin media read errors.
- A narrowed client privacy tripwire.
- Receipts hash mixed-CRLF working bytes.
- Dead compatibility vocabulary.
- An undisclosed governance-row rewrite.
- A TS/SQL `principalId` gap.
- An error code for scalar `p_selection`.
- The verifier lacks a positive member assertion.

**D/E may start from `ed9bb9b`.** The fallback-first presentation is safe regardless of the SQL chain. D/E must not
assume the image is commerce-irrelevant at runtime until the chain above is applied.

## Core A/B/C (`70cd421`)

**Claude's execution:**
- **Production build** of `70cd421` served on loopback. 50 page loads covered `/`, `/care`, `/products`, `/status`
  and the order-request cards with a synthetic catalog, each at 10 widths:
  - 0 horizontal overflow; the header stays 69 px;
  - header and footer read "Xenios Health", with accessible name "Xenios Health home" (hidden below 520 px, as
    before);
  - page titles unchanged (`| Xenios`);
  - the footer divider is 4 px by at most 240 px;
  - customer CTAs are `rgb(14,14,14)`, 4 px radius, 44 px tall.
- **IC-1, computed-style comparison** of identical markup against the baseline (`c0e25c73`) and candidate CSS:
  - **admin root unchanged for all 12 element types, including focus;**
  - customer root: black primary, outlined secondary, underlined tertiary, 44 px, a 3 px `#7C3AED` focus ring, and a
    purple selected step only.
- **IC-2 FAIL.** The customer `.xenios-order-timeline li` computes `border-left: 3px rgb(124, 58, 237)`.
  - `.xenios-order-page--customer { --accent: var(--pulse) }` (`assisted-order.css:160`) feeds the shared timeline
    rule (`:134`).
  - This affects the customer confirmation page (`AssistedOrderConfirmationPage.tsx:82`) and the status page
    (`AssistedOrderStatusPage.tsx:154`).
- **Tests at `1a409e2`:**
  - the 4 contract and accessibility files: 33/33 PASS;
  - 5 more files that read the edited CSS or render the embedded order page: 54 PASS;
  - `core-site-protection.test.ts` fails exactly as expected: Navbar, Footer and index.css (authorized, pending
    approval) plus the inherited `static.ts` and three inherited seams.
- **Protected successor hashes** (`sha256-lf`), recomputed by Claude, equal to the handoff. The manifest is untouched
  through `7d66573`.

| File | Old (authorized baseline) | New (`70cd421`) |
| --- | --- | --- |
| `client/src/components/Navbar.tsx` | `e37a5b94cb07674e8f4471ddc37b9a5e8a6f848d300408ba67ff3b706941eb1f` | `6cdfbb0f05cc8d1fb28bfdc6b7a012ddb85e34d0c985bc88e71c09d8456a218a` |
| `client/src/components/Footer.tsx` | `25da700fcea32178d19fc21a3d6db4192d11b403418b7fa83100b4c88d9e2a3a` | `420b45dc09aefa572a65ae68b5add6a2ce3d435e54e1fea7d9db9f29390df7cb` |
| `client/src/index.css` | `70d3302a8b4f5d22aa324c3728ae51963d12222ab880c29fcd3f8ea3e477d0e6` | `b475a8ee637984965df7497e6bcc9d92113c52c0dd2e21019d5d2806e47fa049` |

**Findings:**
- **ABC-R1 (P1), IC-2 violated.**
  - Fix in `assisted-order.css`, which is **not protected**: for example
    `.xenios-order-page--customer .xenios-order-timeline li { border-left-color: var(--rule); }` (neutral), or
    `var(--teal)`.
  - Add a test that asserts it.
  - Keep `Navbar.tsx`, `Footer.tsx` and `index.css` byte-identical, so the three hash pairs above stay valid.
- **ABC-R2 (P1), browser qualification missing.** **Closed by Claude's independent evidence above.**
  - 200% zoom, keyboard traversal and forced-colors rendering were not captured. The premium-QA lane may add them;
    they are not blocking.
- **ABC-R3 (P2), test provenance.** Partly closed by Claude's runs at `1a409e2`. The corrected successor should run
  the aggregate from a clean checkout once disk allows (`RELEASE_STATE` shows `NOT_RUN_FOR_ABC`).
- **P3:**
  - ABC-R4: a focused ghost button gets a 4 px radius (grouped rule in `index.css`). **Defer it,** so the protected
    hash doesn't churn.
  - ABC-R6: slightly lower border contrast.
  - ABC-R7: no forced-colors counterpart for the purple selected states (account-portal, catalog-priority).
  - ABC-R5: the tests don't render the timeline, quote or upload.

## Next allowed / blocked actions

| | |
| --- | --- |
| **Allowed now** | Core: fix IC-2 in `assisted-order.css` only, add a test and push a successor; Claude re-checks only that delta plus the hash invariance. D/E: start from `ed9bb9b` (fallback-first presentation and source-only schema per doc 31). Finance: integrate the candidate as unregistered source; schedule races and the aggregate. |
| **Blocked** | Manifest re-cut (needs the accepted Core successor plus Samuel's exact old→new approval); any managed or registered SQL (MC-01 chain, finance candidate); enabling any provider or finance capability; production promotion. |
| **Founder approvals needed** | (1) The three exact hash pairs above. Recommended: approve conditionally on byte-identical bytes in the IC-2 successor, which Claude will verify. (2) GATE-01 / Access Hub disposition, Samuel's decision. (3) The MC-01 release chain, when it comes to apply. (4) Disk cleanup, to allow full suites and races. |
| **Release disposition** | **NOT READY.** A public UI release may only proceed with finance and provider authorities disabled and fail-closed, after an accepted Core successor, the manifest re-cut, a GATE-01 disposition and a qualified exact release candidate. |
