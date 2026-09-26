# 17 — Owner decision packet (for Samuel, one sitting)

This packet is the **only** place owner answers are recorded. `02_DECISIONS.md` points here.

**Status: every answer is PENDING SAMUEL APPROVAL.**

The reviewed recommendation for each item, and the reasons behind it, are in `19_REVIEWED_DECISION_RECOMMENDATION.md`. That document incorporates the 2026-09-26 full document review and the founder context from the 2026-09-26 thread archive.

**How approval works:**
- Samuel approves the whole reviewed set with the exact statement **`APPROVE THE REVIEWED XENIOS CLARITY DECISION SET`**, optionally naming revisions.
- A separate step (CLAUDE_06) then records the approval in this file, with initials and date.
- Nothing here is approved until that happens. Codex implements only recorded answers.

Count: **13 decisions**. Labels used below:
- **RECOMMENDED (revised)** — changed by the 2026-09-26 review.
- **RECOMMENDED DEFAULT** — unchanged.

---

## A. BRAND / ENTITY

### A-1 — Which name does the public see now?

- **Question:** Should the public site say "Xenios", "Eon Health", "Infinity Health", or a combination?
- **Why it matters:** A half-renamed site (new name in the header, old name on policies, receipts, senders and the domain) is more confusing than either name.
- **Source truth:** The repo uses only Xenios. The legal entity is Xenios Technologies, Inc. (Delaware) in Privacy, Terms and the footer; the Gateway footer wrongly says "Xenios Technology". FULL_VISION says "rebrand only when explicitly authorized". No Eon or Infinity text exists in code.
- **Founder/stakeholder input:**
  - The working architecture is **Infinity** (technology umbrella), **Eon Health** (working favorite for the clinical/telehealth company) and **Xenios Technologies, Inc.** (current legal/contracting entity).
  - In the 2026-09-26 thread, as summarized in the full review, you called Eon Health "awesome", still as a working name.
  - You told Stephen on 2026-09-25 that you are renaming to "Infinity Health".
- **RECOMMENDED (revised):**
  - Keep **"Xenios"** public for this release.
  - Keep **Xenios Technologies, Inc.** in all legal and contracting copy.
  - Record internally that Eon Health is the working future clinical brand under Infinity.
  - Do not publish Eon or Infinity until the name, trademark, domain, policies, sender identity, contracting structure and clinical-entity relationship are approved.
  - Use one brand setting in code.
  - Drop the sub-brands "Xenios Research", "Xenios Health" and "Care + Research".
  - Fix every legal line to "Xenios Technologies, Inc."
- **Tradeoffs:** Delays the name you prefer. In exchange, nothing contradicts the policies, receipts, senders or contracts.
- **Codex implements if approved:** brand setting, unified wordmark, legal-string fix.
- **Codex must not without approval:** show "Eon", "Eon Health", "Infinity" or "Infinity Health" publicly; change the domain, sender names or policy entity.
- **If DEFERRED:** same as the recommendation.
- **Answer:** PENDING SAMUEL APPROVAL

---

## B. PUBLIC OFFER / HOMEPAGE

### B-1 — Amend the 2026-07-29 core-site protection directive for this program?

- **Question:** Do you amend your directive ("the main xenios website outside /health, /research and /care must not be redesigned, rewritten, or behaviorally modified") so the root becomes the health front door and the site shares one header and footer?
- **Why it matters:**
  - This is the fix for "three websites under one domain" and for Stephen not knowing where to start.
  - 54 of the 61 target CTAs depend on it.
  - The protection manifest blocks it today and hard-locks the bytes of `Home.tsx`, `Navbar.tsx` and `AccountAccessChooser.tsx`.
- **Source truth:** `/` is the coach-AI waitlist. Care and Research use separate shells. The protection gate enforces the July directive on every candidate.
- **Stakeholder input:** Stephen found the site overwhelming. Your meeting action item was to revamp the site and simplify the CTAs. The execution brief specifies a new header and homepage.
- **RECOMMENDED DEFAULT — approve with this exact amendment text:**
  > *I amend the July 29 core-site protection directive solely for the Xenios clarity program. Codex may modify the protected root homepage, shared header and footer, navigation, App routing, and related protected files only to implement the owner-approved clarity information architecture and copy. Every protected change must still pass the canonical protected-change review. This does not authorize unrelated redesign, deployment, commerce activation, or authority changes.*
- **Tradeoffs:** Coach-software discovery moves off the homepage to `/workspace`; all old coach URLs keep working. Protected review work increases.
- **Codex implements if approved:** the full `04_INFORMATION_ARCHITECTURE.md` plan (full mode).
- **Codex must not without approval:** touch any protected file or route.
- **If DEFERRED or declined:** fallback mode only (IA §Fallback). The root confusion remains.
- **Answer:** PENDING SAMUEL APPROVAL

### B-2 — Hero line

- **Question:** What one line tells a visitor what this is?
- **Why it matters:** "Premium peptides, guided by licensed clinicians" fails a truth test. "Clinician-guided Care" also depends on the licensed-clinician claim C-004, which is still under clinical review.
- **Source truth:**
  - Care: a clinician decides, after a secure handoff.
  - Research: research use only, with no clinical review.
  - `PROVIDER_READINESS.md` marks no clinician or pharmacy provider as ready.
- **RECOMMENDED (revised):**
  - H1 **"Care and research products, clearly separated."**
  - Sub **"Start a Care request, or explore products for research use. Two different paths, with clear next steps."**
  - Upgrade to "Clinician-guided Care…" only after clinical leadership verifies C-004 and you approve the change.
- **Tradeoffs:** Less aspirational; nothing unverified.
- **Codex must not without approval:** use "premium", "clinician-guided", "licensed" or any outcome words in the hero.
- **If DEFERRED:** same as the recommendation.
- **Answer:** PENDING SAMUEL APPROVAL

---

## C. PRODUCTS / PRICING

### C-1 — Which products appear publicly?

- **Question:** Show individual products to signed-out visitors?
- **Why it matters:** Publishing a product publishes its copy, format and price state.
- **Source truth (at 3298f279):**
  - 420 canonical products, all with **draft** copy.
  - The 513-unit reconciliation has 0 direct-buy, 124 assisted-order, 242 Care-required and 147 unavailable units.
  - Supplier and COA responses: zero.
  - The public storefront is unmounted.
- **Stakeholder input:** Your 2026-08-17 offer layers (14 featured / full catalog by reference / request-only). The "393 SKUs" figure is unverified.
- **RECOMMENDED (revised):** **Pathway tiles only in the first implementation** (Care · Research products · For Practices).
  - No individual products, product counts, unavailable products or individual Care products.
  - Named assisted-order products (up to your 14 featured) come in a later content pass, after you approve the exact product, variant, copy and price state for each.
  - The first release does **not** depend on a founder-provided product list.
- **Codex implements if approved:** the tiles; the card and page template may be built but must render no product until publication records are approved.
- **Codex must not without approval:** publish any product, turn on the storefront flag in production, or show counts.
- **If DEFERRED:** same as the recommendation.
- **Answer:** PENDING SAMUEL APPROVAL

### C-2 — Public prices

- **Question:** Do signed-out visitors see prices?
- **Source truth:** August member prices were founder-approved (34 SKUs). September retail prices are pending-approval candidates. Care prices depend on the clinician and pharmacy.
- **RECOMMENDED DEFAULT:**
  - Show a price only for a product and variant with an explicitly founder-approved public price; otherwise "Price confirmed in your quote."
  - No Care prices, no candidate or pending prices, no volume tiers, no introductory discounts, no "$0".
  - Under C-1 tiles-only, no prices appear in the first release.
- **Answer:** PENDING SAMUEL APPROVAL

---

## D. CARE / CLINICAL CLAIMS

### D-1 — Care availability, cost and speed

- **Source truth:** "One business day" (×8) and "$30 per month" (×3) are live without evidence; state coverage is deferred until after the request.
- **RECOMMENDED DEFAULT:**
  - "Care availability depends on your state; we confirm it after your request."
  - "Submitting a Care request is free."
  - No response-time promise, no consultation price, and the $30 plan removed.
- **Answer:** PENDING SAMUEL APPROVAL

### D-2 — Clinician, pharmacy, testing and shipping claims

- **Source truth:** "state-licensed" pharmacy copy (×6), "72 hours" (×22) and "Third-party testing" (×1) are live. No provider is ready. Vendor RFQ responses: zero.
- **Stakeholder input:** Directors, suppliers and pharmacies named verbally are not recorded in the repo.
- **RECOMMENDED DEFAULT:**
  - Remove all of these claims until each is verified in `CLAIM_LEDGER.csv`.
  - The Quality page describes the lot-record process only.
  - No named people, pharmacies or labs.
- **Answer:** PENDING SAMUEL APPROVAL

---

## E. PRACTICE MODEL

### E-1 — Can a practice account order for clients?

- **RECOMMENDED DEFAULT:** **No, not at launch.**
  - Each client creates their own account and accepts the research-use terms personally. This matches Stephen's own liability concern.
  - Revisit after counsel review (Q-02).
- **Answer:** PENDING SAMUEL APPROVAL

### E-2 — What can a practice see?

- **RECOMMENDED DEFAULT:**
  - Referrals, credited orders and commission only.
  - Client names and status only with a future client opt-in.
  - No Care information without written patient authorization.
  - No published statement cadence.
- **Answer:** PENDING SAMUEL APPROVAL

---

## F. PARTNER / COMMISSION ECONOMICS

### F-1 — Commission terms and public wording

- **Source truth:** Your founder directive of 2026-08-17 matches `affiliate-program/config.ts`:
  - 20% on the first eligible Research payment;
  - 7.5% on eligible repeat payments in months 2–12;
  - 21-day hold, $50 minimum, payouts every other Friday;
  - no parent override;
  - clinical revenue never commissionable.

  The 20/15 draft schedule is superseded.
- **RECOMMENDED DEFAULT:**
  - Practices use the general 20% / 7.5% terms, **in agreements only**. Never publish numeric rates.
  - Public wording: **"Your practice earns commission on eligible research-product orders from clients you refer. Rates, holds and payout timing are in your partner agreement. Care services never earn commission."**
  - Counsel confirms commissions to licensed referrers (Q-03) before agreements are signed.
- **Answer:** PENDING SAMUEL APPROVAL

---

## G. CLIENT OWNERSHIP

### G-1 — The client-relationship promise

- **RECOMMENDED — subject to counsel review:**
  - Public wording: **"Your client stays your client. They own their Xenios account; your practice stays attached to it as the referring practice. We don't market competing coaching or practice services to clients you refer. If your client uses Care, the Care clinician makes the medical decisions and your client decides what to share with you."**
  - The partner agreement must contain the same language before practices rely on it.
- **If DEFERRED or counsel declines:** "Clients create and own their own accounts; your practice is recorded as the referring practice."
- **Answer:** PENDING SAMUEL APPROVAL

---

## H. WHOLESALE / INVENTORY

### H-1 — In-clinic inventory

- **RECOMMENDED DEFAULT:** **Not offered.** `/practices` may say only: "In-clinic inventory: under review — mention it in your inquiry." No pricing, ordering or timeline.
- **Answer:** PENDING SAMUEL APPROVAL

---

## I. CAREERS / TEAM

### I-1 — Careers page

- **Source truth:** Three hard-coded roles, with applications by email only. Recent operating discussions mention other hiring needs. `/careers` is protected.
- **RECOMMENDED (revised):**
  - Show **only roles you separately confirm are currently open**, plus a **general-interest application**.
  - If no role is confirmed, show general interest only.
  - Do not keep stale roles just because they are in source.
  - Every apply control says truthfully whether it creates a record (Phase 2) or opens email.
- **Answer:** PENDING SAMUEL APPROVAL (plus the list of confirmed open roles, if any)

---

## Not decisions (Claude may specify; no answer needed)

Information architecture, page order, CTA vocabulary, copy tone, product-card structure, states, status wording, responsive and accessibility rules, analytics names, dead-end fixes, jargon removal, and the legal-string fix.
