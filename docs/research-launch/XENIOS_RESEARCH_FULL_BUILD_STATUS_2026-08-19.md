# XENIOS RESEARCH — FULL BUILD STATUS (HARD PAUSE RECONCILIATION)

**Date:** 2026-08-19 (~22:30 UTC) · **Author:** claude-fable-desktop (lead/integrator) · **Audit baseline:** `3a072b8` on `xenios/launch-integration-20260819` (code-identical to the live runtime; delta is `.xenios/` state only) · **HARD PAUSE in effect** — no merges, deploys, migrations, flags, pricing, or email until the founder resumes.

---

## 1. EXECUTIVE STATUS

**Release A is LIVE in production.** The assisted-order intake door is open, durable (M71 applied with an RPC-only boundary the migration proved before committing), priced at the founder's retail schedule (34-variant controlled release executed and verified), with affiliate referral capture live and fail-safe. Zero customer requests have arrived yet (door opened ~2 hours before this pause). The founder's authenticated end-to-end smoke (submit one request, mobile pass) is the one remaining Release A verification.

**Release B (Buy Now) is code-complete but dark** behind three founder gates: migrations 72–74 (promoted, adversarially reviewed, rehearsed twice on disposable PostgreSQL 16+17 — NOT applied), the `RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE` flag, and the EA cart env chain — plus one architectural decision (§11.2).

**The nine-session fleet is paused.** Its in-flight work (~1,100 inserted lines, 24 new files) exists ONLY as uncommitted changes in 7 local worktrees — nowhere in git. Preserving those worktrees is the single most fragile asset on this machine.

## 2. PRODUCTION STATE (independently verified, read-only)

| Fact | Value |
|---|---|
| Live SHA | `a66434d980c909303d3595382e5df77342fbc127` (tag `RESEARCH_PLATFORM_0_5_RELEASE_A_RC2`) |
| Deploy | `dep-da31altg1s2s73f6tep0`, live 2026-08-19T20:43:55Z, branch `release/early-access-code-session-checkout`, trigger api |
| Rollback | flags off first; runtime `458e7284` (next older `b0fe396`) |
| Health | 200; supabaseConfigured + adminConfigured true |
| Migrations applied | 39 managed, newest `20260819203614 research_assisted_order_bridge` (M71, corrected artifact `3e59df26…`) |
| M70 | NOT applied (no `research_account_organizations`); parked on `fable/f7-pack02-rename` (8 unmerged commits, load-bearing ledger row 70) |
| M72/73/74 | NOT applied (object-level verified absent); promoted + rehearsed in code, founder-gated |
| Flags ON | `RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED`, `AFFILIATE_SYSTEM/CODES/PORTAL/PROGRAM_ENABLED`, `RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL`; `RESEARCH_PARTNER_LINK_SECRET` SET (fresh, uncommitted anywhere) |
| Flags OFF/dark | `RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE` (Buy Now), `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED` (member commerce), `RESEARCH_EARLY_ACCESS_CART_ENABLED` + payment-instructions/method-registry env (EA cart), `RESEARCH_EARLY_ACCESS_CART_HISTORY_ENABLED`, `CARE_ENABLED`/`CARE_ENABLE_APPROVED`, `RESEARCH_REFERRALS_ENABLED` |
| Believed ON, verify at resume | `RESEARCH_MASTER_OFFERINGS_ENABLED` (anonymous probe answers 401 not 503-disabled → enabled; member scope not distinguishable anonymously; ledger says all-members) |
| Data plane | 0 assisted requests/events; 2 EA placements + 3 cart checkouts (pre-existing); ALL affiliate durable tables at 0 (capture live, no affiliates yet); 417 active member prices (34 by the 2026-08-19 directive actor, 34 superseded, 68 audit rows); 0 non-member active price rows |
| M71 first apply | REFUSED by its own post-condition (managed Supabase default privileges grant new functions to client roles — internal helpers were reachable). Nothing committed. Corrected artifact applied clean. The fail-closed design proved itself live. |

## 3. CUSTOMER EXPERIENCE (per-flow classification)

- **/research gateway, access hub, member catalog (v2), product detail, search/filters, member pricing display, card CTA (six-action, server-resolved), mobile nav:** LIVE (catalog conditional on the §2 env note).
- **Sign-in:** LIVE. **Create account:** PARTIAL (claim-of-approved-application only; org accounts parked on M70; account client pages unrouted). **Membership application:** BLOCKED EXTERNAL — deliberate: client shows a pending panel, server write stays walled until the founder approves exact legal policy versions.
- **Release A assisted order:** LIVE end to end (config/catalog/submit/XRR/status/admin queue; legal + pricing repairs verified in the deployed runtime; idempotent; cross-customer collapse to 404; attribution from the verified cookie only). Needs an authenticated session for the final live exercise.
- **Payment:** LIVE via the single-order EA concierge lane (invoice carries a reference, destination given out of band by a named human, proof → named-admin verification). The EA CART payment lane is CODE COMPLETE BUT DARK (flag + env docs unset).
- **Order conversion (request→quote→accept→pay→canonical order):** MANUAL by design at the status machine; quote engine CODE COMPLETE UNMOUNTED; canonical-order promotion of a paid assisted request MISSING (Session 7's lane + a lead decision).
- **Member order history:** PARTIAL/EMPTY — returns `[]` while member commerce is dark; EA purchasers see orders only on the EA status page (§11.3).
- **Fulfillment:** EA dispatch lane LIVE (payments queue → supplier packet → ack → packing → tracking → shipped) + new admin UI; the settled-awaiting queue answers a named 503 until its candidate SQL is applied. The purpose-built fulfillment ENGINE is CODE ONLY (migrations 42/43 not deployed; its admin page 404s — §11.4).
- **Buy Now:** CODE COMPLETE BUT DARK; exact remainder in §7.

## 4. AFFILIATES

- **Attribution:** LIVE to storage — `/research?ref=CODE` client hook + `/api/referral/capture` + `/api/r/:code` (302), signed `xr_aff` cookie (HMAC over the production secret), durable touch rows, `affiliateAttributionRef` written server-side on assisted requests. Pretty `/r/CODE` SPA page is a recorded follow-up.
- **Program:** configured ON with the founder economics (20% first / 7.5% repeat months 2–12 / 21-day hold / $50 minimum / biweekly Friday); today it drives cookie TTL + window only — **no money moves**.
- **Commissions:** NONE reachable — `pending_program` candidates only. The accrual bridge is deliberately unmounted; `research_commission_ledger` is a PENDING migration (row 26); M72 pending; the EA grant WRITER has no production caller (read resolver wired; grants table empty).
- **Portal:** PARTIAL — 16 read paths mounted and live for an existing partner row; **no partner can self-create today** (apply/dashboard sit in the dark commerce lane; admin review endpoint is a stub). Onboarding is the affiliate P0 at resume.
- **Payout:** NOT BUILT (by design; provider Disabled).

## 5. ADMIN / OPERATIONS

**LIVE:** assisted-orders queue/detail/status/documents; product-requests (+analytics); EA payment review (single-order), supplier dispatch chain, exceptions, refund-records, customer/verification ops; Product Control Center (catalog/variants/prices — the tool that executed the price release); required-inputs/readiness; inventory lots/COAs; applications review; Samuel queues; outbox admin; fraud admin; esign; system status; NEW EA fulfillment page (payment-review panel + dispatch card live; settled queue awaiting SQL).
**DARK (fail-closed):** OrdersAdmin, CommerceQueues, claims/refunds (member-commerce flag); EA cart admin doors (cart flag).
**BROKEN (routed page → nonexistent endpoint):** Members, Audit, Guides, Privacy, Partners list, Fulfillment-engine page (§11.4).
**DUPLICATE/ORPHAN pages:** EarlyAccessPaymentApproval (unrouted twin of the routed PaymentReview); Fulfillment.tsx (dead engine page) vs EarlyAccessFulfillment.tsx (live); CrmSupplierOperations, OperationsCommandCenter, admin-data-exchange, legacy Inventory — all unrouted/unmounted.

## 6. FULL CATALOG & RETAIL PRICING

- Canonical dataset: 420 offerings/variants (generated 2026-08-15 from the 8/13 workbook); bindings 417; production 217 published products / 417 approved+active variants / 417 active member prices / 0 price-pending in-window gaps.
- Launch matrix (drift-proof, resolves through the exported production derivation): **244 CARE · 143 BUY_NOW_CANDIDATE · 32 NOT_AVAILABLE (classification pending) · 1 REQUEST_QUOTE · zero UNKNOWN**; 3 unbound rows (shipping fee + 2 price-pending) truthfully "Price on request".
- Retail authority: production Product Control rows ARE the authority; the 34 matched book SKUs now carry the founder schedule; the 383 non-book prices untouched; never $0 (pinned by tests + live behavior); no frontend price constants; buyer-scoped pricing untouched (0 non-member active rows; Kris rides its own env-composed sheet).
- **The 426-row 2026-08-16 workbook is an ARTIFACT ONLY** — not reconciled into the canonical dataset (which still derives from the 8/13 workbook). Reconciling it (6 new rows, supplier/cost updates) is a founder-gated catalog regeneration.
- Bulk tiers (5+/10+): approved values recorded; **no quantity-tier price rows exist and no code enforces tiers yet** — they land at quote/checkout conversion (Release B scope).
- Unmapped book SKUs (5): Retatrutide 60mg, MOTS-C 40mg, Kisspeptin-10, Glutathione 600mg, with-DAC CJC combo — awaiting identity confirmation.

## 7. RELEASE B — EXACT REMAINDER BEFORE SAFE ACTIVATION

1. Founder applies M72→M73→M74 (order per INTEGRATION-LANE-C.md §5; M74 precheck refuses pre-existing canonical duplicates; all three rehearsed twice on pg16+17).
2. `RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE=true` (selection authority currently hard-refuses → no add_to_cart can exist).
3. EA cart env chain: `RESEARCH_EARLY_ACCESS_CART_ENABLED` + `EARLY_ACCESS_PAYMENT_INSTRUCTIONS` + `EARLY_ACCESS_PAYMENT_METHOD_REGISTRY` (founder-supplied destinations).
4. `RESEARCH_EARLY_ACCESS_CART_HISTORY_ENABLED` strictly AFTER M73.
5. Ready-subset gating of the 143 candidates (supplier/docs readiness — all 39 book SKUs say ACTIVATION DOCUMENTS PENDING).
6. **DECISION §11.2:** the live catalog→cart handoff posts to the MEMBER cart while the launch scope names the EA cart as the canonical Buy Now order path — retarget the handoff or open member commerce. Also: Buy Now→auth→return preservation exists as returnTo plumbing, not a located full flow; checkout re-resolution rides whichever cart is chosen.

## 8. CARE

CODE COMPLETE BUT DARK, exactly as designed: all five API families mounted, schema applied since 2026-07-26, every door quadruple-gated (stored capability enabled+approved AND `CARE_ENABLED` AND `CARE_ENABLE_APPROVED`; Tebra additionally on its own env) → everything answers `care_disabled`. Care/RUO separation is enforced in four independent layers (catalog explore_care mapping, assisted-order provider_request precedence, the closed purchase-mode matrix, structural zero-import boundary tests) plus the fact that no direct RUO checkout is live at all. `/api/care/discovery` bridge: NOT BUILT (task ready, unowned).

## 9. FABLE SESSION INVENTORY (all paused per founder)

| Session | Branch | State | Disposition |
|---|---|---|---|
| LEAD claude-fable-desktop | xenios/launch-integration-20260819 @ 3a072b8 | this audit | KEEP (canonical) |
| s3 assisted-order flow | fable/assisted-order-customer-flow-20260819 (0 own commits) | **DIRTY worktree: 717 ins across wizard/draft-store/selection-refresh + tests** | NEEDS REVIEW → commit-on-branch first; MERGE-NEXT candidate |
| s8 fulfillment | lane/fulfillment-tracking-min (0) | DIRTY: 243 ins (engine extension + tests + sql/) | NEEDS REVIEW → MERGE-NEXT candidate |
| lane4 affiliate core | lane/affiliate-attribution-core (0) | DIRTY: 8 new files incl. **3 new SQL candidates** (customer bindings) | NEEDS REVIEW (migration freeze applies) |
| lane5 partner portal | lane/affiliate-partner-portal (0) | DIRTY: 168 ins (onboarding/dashboard UI) | NEEDS REVIEW |
| storefront | lane/launch-public-storefront (0) | DIRTY: 9 new files (storefront contract/projection/routes) | NEEDS REVIEW |
| s7 canonical order | fable/canonical-order-history-20260819 (0) | DIRTY: 3 new scaffold files | KEEP PARKED |
| s9 conversion QA | lane/e2e-conversion-qa-20260819 (0) | DIRTY: local dev shim in server/index.ts + supabase config; **its "handoff filed" claim is FALSE** | DISCARD LATER after extracting QA findings |
| s10 release security | lane/s10-release-security-20260819 (0) | CLEAN, zero work product | DISCARD LATER / reassign |
| opus5-main, fable-main | merged/superseded branches | heartbeats 8/16–8/17 | STALE — close at resume |

**Critical:** the 8 fleet lane branches are LOCAL-ONLY (not on origin) and carry zero commits — every byte of fleet work is uncommitted in the worktrees above. Post-pause handoff compliance: **0 of 9**. Do not prune, clean, or checkout those worktrees.

**Merged/superseded branches** (retire at resume): the four launch lanes, claude/assisted-order-bridge, fix/phase-zero-…-20260818, claude/quote-conversion-engine, lane/cashflow-conversion, lane/full-vision-demo, claude/multi-max-continuity.
**Load-bearing unmerged:** `fable/f7-pack02-rename` (M70, ledger row 70) and `fable/q100-dark` (M69, row 69, **LOCAL-ONLY — push at resume**) — KEEP; the ledger requires reconciling rows 69/70 at merge. Stale competitors (do NOT merge as-is): claude/f5/partner-portal-activation (would double-mount the portal), codex/pep-orders, codex/pep-cart-price-authority, agent/website-4 white-label, codex/access-identity-onboarding, claude/f5-catalog, claude/f5/b7-catalog-price-gate, fable/pack02-account-mount.

## 10. DUPLICATE AUTHORITIES (found; nothing deleted under pause)

1. **affiliates/v2/commission-engine.ts** — dormant COMPETING money formula (different eligible-revenue definition), zero importers; hazard: the LIVE affiliate flags are defined in its directory. Disposition: superseded; relocate feature-flags.ts into partners/ at resume.
2. **claude/f5/partner-portal-activation branch** — mounts the portal in server/research/index.ts; merging would double-register 16 live routes. Disposition: drop or rebase; never merge as-is.
3. **Two payment-state vocabularies** (EA manual lane LIVE vs commerce order-states DARK) and **three order shapes** (EA placements/cart LIVE, commerce/orders.ts dark successor, codex/pep-orders branch) — deliberate parallels today; must reconcile before general commerce opens.
4. **Two "quote" concepts** (EA cart price-quote LIVE vs negotiated quote engine UNMOUNTED) — naming/route separation required when the engine mounts.
5. Everything else audited (action resolution, pricing chain, cart selection, tracking notifiers, identity, route registrations) is layered or deliberately parallel, not drift; the lead's own duplicate selection authority was already deleted in-window.

## 11. REAL DEFECTS / DISCREPANCIES FOUND BY THIS AUDIT

1. `supabase/MIGRATIONS.md` row 71 said PENDING/NOT-MOUNTED while M71 is live — **corrected in this commit** (docs-only).
2. **Buy Now cart-target mismatch** (§7.6) — founder/lead decision required before Release B.
3. **Member order history empty for EA purchasers** while member commerce is dark — UX gap, not data loss.
4. **Six routed admin pages call nonexistent endpoints** (Members, Audit, Guides, Privacy, Partners, Fulfillment-engine) — render error boundaries; build or unroute at resume.
5. **s9's uncommitted shim falsely claims a handoff was filed**; the shim also locally edits server/index.ts (lead-owned seam) — discard, extract findings.
6. Cross-worktree noise: `.claude/launch.json` in the lead worktree carries an s9 dev entry + an unrelated project entry; `.mcp.json` untracked (never committed). Clean at resume.

## 12. SECURITY / RELIABILITY POSTURE

M71 RPC-only boundary independently verified live (forced RLS ×5, zero direct grants, service_role-only RPCs, internal helpers unreachable, append-only ledger). The managed-platform default-privilege class of bug is now a known, tested-for hazard (caught live by M71's post-condition; B's postcheck corrected for it; **the M58 cart tables still carry service_role direct privileges — hardening candidate authored, founder-gated**). Payment truth is human-verified only; no processor secrets exist; the affiliate secret is production-env-only. Gates at the audit baseline: typecheck/build/control-plane (35)/DAG (33)/routes (389) all green; full suite 9,755 passed with the two prior failures fixed (census pins, NUL delimiters) — no unclassified failures.

## 13. FOUNDER DECISIONS REQUIRED (queued, nothing blocking the pause)

1. Resume order + which dirty-worktree lanes to commit/review first (recommended: s3, s8).
2. Buy Now canonical cart (retarget handoff to EA cart vs open member commerce).
3. Apply M72–74 + EA cart env + direct-commerce flag + ready-subset list (Release B activation packet).
4. M58 service_role revoke hardening candidate.
5. Membership application legal versions (opens the public application).
6. 426-row workbook reconciliation into the canonical dataset; 5 unmapped SKUs; quantity-tier enforcement design.
7. Affiliate onboarding path (partner self-create is dark; first affiliates need provisioning).
8. E settled-awaiting-fulfillment SQL candidate (ops queue).
9. M69/M70 branch reconciliation; retire superseded branches; registry hygiene.
10. Your authenticated Release A smoke (first real request + mobile pass).

## 14. RECOMMENDED NEXT 10 ACTIONS (at resume, in order)

1. Founder Release A smoke from a phone (request → XRR → status; admin sees it).
2. Commit the 7 dirty worktrees onto their own branches and push (converts machine-local work into durable git). Push `fable/q100-dark`.
3. Review + integrate s3 (assisted-order UX) and s8 (fulfillment) lanes.
4. Decide the Buy Now cart target; then execute the Release B packet (M72–74 → env → flag → ready subset).
5. Affiliate onboarding vertical slice (partner provisioning + grant writer caller) so capture starts converting to candidates.
6. Fix or unroute the six broken admin pages; delete orphan duplicates.
7. Canonical-order promotion of paid assisted requests (with Session 7's scaffold).
8. Quote engine mount (Session 6 scope) with distinct terminology from cart quotes.
9. M70/M69 reconciliation + M58 hardening + membership application legal versions.
10. Registry/branch hygiene; independent security pass (reassigned s10).

**CANONICAL BASE RECOMMENDATION:** `xenios/launch-integration-20260819` @ `3a072b8` (production-aligned: code-identical to live `a66434d9`; all P0 work integrated; gates green; every other candidate is an ancestor or a stale competitor). Production `a66434d9`; rollback `458e7284`.
