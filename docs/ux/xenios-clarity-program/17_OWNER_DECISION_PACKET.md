# 17 — Owner decision packet (for Samuel, one sitting)

This packet is the **only** place owner answers are recorded. `02_DECISIONS.md` now points here.

**How to answer:** under each item write `APPROVED DEFAULT`, `REVISED: …` or `DEFERRED`, with your initials and date. Or answer the whole packet at once: *"Accept all RECOMMENDED DEFAULTS — SB, <date>."* Codex implements only what is answered here. DEFERRED items get a truthful neutral state (listed per item).

Count: **13 decisions** (the original 12, plus the careers item the packet format requires). The July core-site protection question is folded into B-1 because it decides the same thing: whether the root can change.

---

## A. BRAND / ENTITY

### A-1 (was D-01) — Which name does the public see now?

- **Question:** Should the public site say "Xenios", "Eon Health", "Infinity Health", or a combination?
- **Why it matters:** A half-renamed site (new name in the header, old name on policies, receipts and domain) is more confusing than either name.
- **Source truth:** The repo uses only Xenios. Legal entity is Xenios Technologies, Inc. (Delaware) in Privacy, Terms and the footer; the Gateway footer wrongly says "Xenios Technology". FULL_VISION: "rebrand only when explicitly authorized." No Eon or Infinity text exists in code.
- **Stakeholder input:** You told Stephen (2026-09-25) you are renaming to "Infinity Health". The execution brief names Eon Health (clinical/customer health) under Infinity (technology umbrella).
- **RECOMMENDED DEFAULT:** Keep **"Xenios"** publicly for this release. Use one brand setting in code so a later rename is a single reviewed change. Drop the sub-brands "Xenios Research", "Xenios Health" and "Care + Research"; the paths are just "Care" and "Research products". Fix every legal line to "Xenios Technologies, Inc."
- **Tradeoffs:** Delays the name you discussed; nothing on the site contradicts policies, receipts or contracts.
- **Codex implements if approved:** brand setting, unified wordmark, legal-string fix.
- **Codex must not without approval:** show "Eon", "Eon Health", "Infinity", "Infinity Health"; change domain, sender names or policy entity.
- **If DEFERRED:** same as default.
- **Answer:** ______

---

## B. PUBLIC OFFER / HOMEPAGE

### B-1 (was D-02, now includes the July protection directive) — May the root homepage and shared header change?

- **Question:** Do you amend your 2026-07-29 directive ("the main xenios website outside /health, /research and /care must not be redesigned, rewritten, or behaviorally modified") so the root becomes the health front door and the whole site shares one header and footer?
- **Why it matters:** This is the fix for "three websites under one domain" and for Stephen not knowing where to start. The protection manifest blocks it today: `/`, the coach routes, `App.tsx`, `pages/**`, `components/**`, `lib/**`, `server/routes.ts` and `server/services/**` are protected.
- **Source truth:** `/` is the coach-AI waitlist ("The AI workspace for serious coaches"). Care and Research use separate shells. The protection gate enforces the July directive on every candidate.
- **Stakeholder input:** Stephen found the site overwhelming. Your meeting action item was "revamp the website… simplify calls to action". The execution brief specifies a new header and homepage.
- **RECOMMENDED DEFAULT:** **Amend the directive for this program.** Root becomes the health front door. Today's coach homepage moves to `/workspace`, all existing coach URLs keep working and leave the primary header, and one shared header and footer is used everywhere. Codex re-baselines the protection manifest through the canonical protected-change review, not by editing hashes.
- **Tradeoffs:** Coach-software discovery moves off the homepage. Protected-file review work increases.
- **Codex implements if approved:** the full `04_INFORMATION_ARCHITECTURE.md` plan.
- **Codex must not without approval:** touch any protected file or route.
- **If DEFERRED / declined:** build only the allowed-zone fallback (IA §Fallback). A unified `/health` front door, practice/partner/supplier pages under `/research/*`, and Care/Research claim cleanup can all happen, but the root and header stay as they are. The main confusion remains.
- **Answer:** ______

### B-2 (was D-03) — Hero line

- **Question:** What one line tells a visitor what this is?
- **Why it matters:** "Premium peptides, guided by licensed clinicians" fails a truth test today. "Premium" is unsupported, and Research orders are not clinician-reviewed.
- **Source truth:** Two pathways exist: Care (clinician decides) and Research (research use, no clinical review). Neither the clinician nor the pharmacy provider is marked ready in `PROVIDER_READINESS.md`.
- **Stakeholder input:** The System Labs reference uses a one-line category statement.
- **RECOMMENDED DEFAULT:** H1 **"Clinician-guided Care and research-grade products."** Sub: **"Start a Care request, or order research products for your work. Two separate paths — you choose."** "Licensed clinician" is added only after C-004 is verified.
- **Tradeoffs:** Less punchy; accurate.
- **Codex must not without approval:** use "premium" or any outcome words.
- **If DEFERRED:** H1 "Care and research products, clearly separated."
- **Answer:** ______

---

## C. PRODUCTS / PRICING

### C-1 (was D-04) — Which products appear publicly?

- **Question:** Show individual products to signed-out visitors, and which ones?
- **Why it matters:** Publishing a product publishes its copy.
- **Source truth (unchanged at 3298f279):** 420 canonical products, all with **draft** copy. The 513-unit reconciliation has **0 direct-buy, 124 assisted-order, 242 Care-required and 147 unavailable** units. Supplier and COA responses are zero. The public storefront is unmounted and needs `RESEARCH_PUBLIC_STOREFRONT_ENABLED` plus approved publication records.
- **Stakeholder input:** On 2026-08-17 you set "14 featured (Layer 1), full catalog by reference (Layer 2), request-pathway only (Layer 3)". You said "393 SKUs / 114 peptides" on the Compass call (unverified; not publishable).
- **RECOMMENDED DEFAULT:** The public index shows three pathway tiles plus **your featured products (up to the 14 in your 2026-08-17 featured layer) that are assisted-order research products and whose copy you approve**. Care-only compounds are not listed individually; unavailable products are never listed. The site shows no product counts.
- **Tradeoffs:** Smaller visible catalog; everything shown is defensible.
- **Codex implements if approved:** card and page template reading publication records; the approved list becomes the publication records.
- **Codex must not without approval:** publish any product, turn on the storefront flag in production, or show counts.
- **If DEFERRED:** pathway tiles plus "Sign in to see the full catalog". The template is built but empty.
- **Answer:** ______ (list product + variant, or "tiles only for now")

### C-2 (was D-05) — Public prices

- **Question:** Do signed-out visitors see prices?
- **Source truth:** The August price book was founder-approved as member prices (34 SKUs released 2026-08-19; member price equals retail). September retail prices are **pending_approval** candidates. Care prices depend on the clinician and pharmacy.
- **RECOMMENDED DEFAULT:** Yes, **only for listed research products whose price you approved**. Otherwise show "Price confirmed in your quote". No Care product prices and no introductory discounts. Volume tiers (5+/10+) are not shown publicly.
- **Tradeoffs:** Some cards show a quote state.
- **Codex must not without approval:** show any unapproved or candidate price, or a "$0".
- **If DEFERRED:** all cards show "Price confirmed in your quote".
- **Answer:** ______

---

## D. CARE / CLINICAL CLAIMS

### D-1 (was D-06) — Care availability, cost and speed wording

- **Question:** What may the site say about states served, consultation cost and response time?
- **Source truth:** Live copy says "typically within one business day" (8 occurrences) and offers a "$30 per month" plan (3); state coverage is deferred until after the request. Neither timing nor price has operational evidence.
- **Stakeholder input:** On the call: "right now it's no cost" for providers.
- **RECOMMENDED DEFAULT:**
  - "Care availability depends on your state; we confirm it after your request."
  - "Submitting a Care request is free." (verified)
  - No response-time promise.
  - No consultation price.
  - Remove the $30 plan.
- **Codex must not without approval:** publish any timing, state list, consultation cost or plan price.
- **If DEFERRED:** same as default.
- **Answer:** ______

### D-2 (was D-12) — Clinician, pharmacy, testing and shipping claims

- **Question:** May the site name clinicians, pharmacies, testing or shipping times?
- **Source truth:** "state-licensed" compounding-pharmacy copy (6 occurrences), "72 hours" shipping (22), "Third-party testing" (1). `PROVIDER_READINESS.md` has no ready pharmacy or clinician. The vendor RFQ has zero responses.
- **Stakeholder input:** You named three medical directors to Stephen and described seven new suppliers and multiple pharmacies. None of these facts are recorded in the repo.
- **RECOMMENDED DEFAULT:**
  - Remove all of these claims until operations or clinical leadership verifies each one in `CLAIM_LEDGER.csv`.
  - The Quality page describes the lot-record process only.
  - After verification, the allowed wording is: "A licensed clinician makes every medical decision in Care" and "Prescriptions, if any, are filled by a licensed pharmacy".
- **Codex must not without approval:** name any person, pharmacy or lab; state any shipping time or testing claim.
- **Answer:** ______

---

## E. PRACTICE MODEL

### E-1 (was D-08) — Can a practice account order for clients?

- **Question:** Offer parent-account ordering (Tammy's proposal)?
- **Source truth:** Not supported. Organizations can only re-request their own past orders, and the organization tables are unapplied.
- **Stakeholder input:** Stephen raised the liability himself and prefers client-owned accounts. Seth suggested a client-signed sheet as a workaround.
- **RECOMMENDED DEFAULT:** **No, not at launch.** Each client creates their own account and personally accepts the research-use terms. Revisit after counsel review (Q-02).
- **Codex must not without approval:** build or describe any order-for-client capability.
- **Answer:** ______

### E-2 (was D-10) — What can a practice see about referred clients?

- **Question:** How much reporting detail does a practice get?
- **Source truth:** The partner portal shows **counts only** ("a lead is a count, never a person"); commission entries and payouts are listed. There is no consent capture.
- **Stakeholder input:** Stephen asked how he'd know who bought. You promised transparent weekly statements.
- **RECOMMENDED DEFAULT:**
  - The public page promises: referrals, credited orders and commission.
  - Client names and order status appear only with the client's opt-in (a future build).
  - Care information is never shared without the patient's written authorization.
  - No statement cadence is published.
- **Codex must not without approval:** show client identity, order contents or Care data to practices, or promise a cadence.
- **Answer:** ______

---

## F. PARTNER / COMMISSION ECONOMICS

### F-1 (was D-07, corrected) — Commission terms and public wording

- **Question:** Which schedule governs practice referrals, and what does the website say?
- **Source truth (corrected in reconciliation):**
  - Your **founder directive of 2026-08-17** (source folder `Downloads/XENIOS_AUTHORITATIVE_RECONCILIATION_SOURCES_2026-08-17`): 20% on the first eligible payment and 7.5% on eligible repeat payments in months 2–12; a separate qualified research-B2B tier of 8/10/12% (assignment criteria undefined); a 21-day hold; a $50 minimum; payouts every other Friday; no parent override; **clinical revenue is never commissionable**.
  - `shared/research/affiliate-program/config.ts` matches the general terms.
  - `server/research/affiliates/v2/draft-schedule.ts` (20/15, 30-day hold, $100 minimum) matches the **superseded** founding-cohort pack.
  - Both are inactive.
- **Stakeholder input:** Commission on all sales from referred clients, paid monthly (Seth), with weekly statements (you).
- **RECOMMENDED DEFAULT:**
  - Practice referrals use the **general 20% / 7.5% schedule**, not the B2B tier.
  - Retire the 20/15 draft in a separate engineering task.
  - Public wording: **"Your practice earns commission on eligible research-product orders from clients you refer. Rates, holds and payout timing are in your partner agreement. Care services never earn commission."** No numbers on the site.
  - Counsel confirms commissions to licensed referrers (Q-03) before agreements are signed.
- **Codex must not without approval:** publish any rate, hold, minimum or cadence, or imply commission on Care.
- **If DEFERRED:** same public wording, and the agreement terms stay open.
- **Answer:** ______

---

## G. CLIENT OWNERSHIP

### G-1 (was D-09) — The client-ownership promise

- **Question:** What exact promise do we make to a referring practice?
- **Source truth:** No code enforces "ownership". Attribution is a signed cookie or typed code (dark). The client owns their Supabase account.
- **Stakeholder input:** Stephen's main worry was losing clients. You answered "you guys always are keeping client".
- **RECOMMENDED DEFAULT (public wording):** **"Your client stays your client. They own their Xenios account; your practice stays attached to it as the referring practice. We don't market competing coaching or practice services to clients you refer. If your client uses Care, our clinician makes the medical decisions and your client decides what to share with you."** The same promise goes into the partner agreement.
- **Tradeoffs:** Limits future cross-selling to referred clients.
- **Codex must not without approval:** publish any ownership promise.
- **If DEFERRED:** "Clients create and own their own accounts; your practice is recorded as the referring practice."
- **Answer:** ______

---

## H. WHOLESALE / INVENTORY

### H-1 (was D-11) — In-clinic inventory

- **Question:** Offer wholesale or stock-on-hand to practices now?
- **Source truth:** No authority exists. The price book has internal 5+/10+ tiers, and you approved volume discounts (up to 7% and 15%) on 2026-08-17.
- **RECOMMENDED DEFAULT:** **Not offered.** `/practices` says only: "In-clinic inventory: under review — mention it in your inquiry."
- **Codex must not without approval:** show wholesale pricing, ordering or any timeline.
- **Answer:** ______

---

## I. CAREERS / TEAM

### I-1 (new; was helpful item H-01) — Careers page and applications

- **Question:** Which roles are public, and should applying create a record?
- **Source truth:** Three hard-coded roles (Founding Designer, Founding Senior AI Software Engineer, Founding Coach Cohort) with mailto-only applications. An admin recruiting-mail endpoint exists with a receipt kind. `/careers` is a protected route.
- **Stakeholder input:** The brief asks for clinical, operations, technology, growth, partnerships, support, contractor and advisor paths. Seth was brought on as COO.
- **RECOMMENDED DEFAULT:**
  - Keep the three roles.
  - Add "Don't see a fit? Apply" (general application).
  - Applying creates a record, a receipt and a founder-queue item (Phase 2).
  - Until then, show "Apply by email", clearly labelled.
- **Codex must not without approval:** list roles you have not confirmed.
- **Answer:** ______ (confirm roles; add/remove)

---

## Not decisions (Claude may specify; no answer needed)

Information architecture, page order, the CTA vocabulary, copy tone, product-card structure, error/loading/empty states, status wording, mobile/desktop rules, accessibility, analytics names, dead-end fixes, jargon removal, and the legal-string fix.
