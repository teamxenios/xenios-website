# 02 — Decisions for Samuel

Status of every item: **PROPOSED — awaiting Samuel.** Codex must not implement anything that depends on a MUST item until this file records Samuel's answer (a dated line under "Samuel's decision"). If Samuel simply writes "accept defaults", every MUST item takes its recommended default.

How to use: read the one-line recommendation for each item; override only where you disagree.

---

## MUST DECIDE BEFORE IMPLEMENTATION (12)

### D-01 — Which public brand name appears on the site now?

- **Decision:** What name does a visitor see in the header, hero and emails: "Xenios", "Eon Health", "Infinity Health", or a combination?
- **Why it matters:** On 2026-09-25 you told Stephen the company is becoming "Infinity Health". The execution brief names **Eon Health** as the working favorite for the clinical/customer-health business and **Infinity** as the technology umbrella. The repo contains neither name; legal documents, domain and emails all say Xenios / Xenios Technologies, Inc. A half-renamed site (new name in the header, old name on policies, receipts and the domain) is more confusing than either name.
- **Recommended default:** **Launch the clarity redesign under the existing "Xenios" name**, with one brand token so a rename becomes a single, reviewable change. Do not show "Eon Health" or "Infinity Health" publicly until you choose one name and counsel confirms trademark, domain and entity/DBA wording. Consumer copy says "Xenios" (drop "Xenios Research"/"Xenios Health"/"Care + Research" sub-brands; pathways are named "Care" and "Research products").
- **Tradeoff:** You delay the name you and Stephen discussed; in exchange no policy, receipt or contract contradicts the site.
- **Codex cannot safely implement without it:** header wordmark, hero, `<title>`, email sender names, footer legal line.
- Samuel's decision: ______

### D-02 — What lives at the root domain?

- **Decision:** Today `/` is the coach-AI workspace waitlist. Should the root become the health front door (Care, products, practices), with the coach workspace moved to its own section?
- **Why it matters:** This single choice is the cause of CUX-01/02/03 and Stephen's "didn't know where to start".
- **Recommended default:** **Yes.** Root = health front door per the brief. Move today's homepage to **`/workspace`** ("Xenios Workspace for coaches" now; Infinity later), keep all existing coach URLs working, remove coach links from the primary header, and link the workspace from the footer and the "For Practices" page ("Coaches: see our client-management workspace"). Rename the coach "Early Access" to **"Join Waitlist"** so "Early Access" no longer means two things.
- **Tradeoff:** Coach-software discovery drops from the homepage; coach prospects arrive by direct link or footer.
- **Codex cannot safely implement without it:** Home.tsx, navigation, redirects.
- Samuel's decision: ______

### D-03 — Hero category line

- **Decision:** The one line that tells a visitor what this is.
- **Why it matters:** The proposed "Premium peptides, guided by licensed clinicians" fails a word-by-word truth test today (see `SYSTEM_LABS_REFERENCE_ANALYSIS.md`): "premium" is an unsupported superlative, and Research orders are *not* clinician-guided.
- **Recommended default:** H1 **"Clinician-guided Care and research-grade products."** Subhead: **"Start Care with a licensed clinician, or order research products for your work. Two separate paths — you choose."** ("licensed clinician" only after C-004 is verified; until then: "Start a Care request, or order research products for your work.")
- **Tradeoff:** Less punchy than a single-product promise; honest about two pathways.
- **Codex cannot safely implement without it:** hero.
- Samuel's decision: ______

### D-04 — Which products appear publicly?

- **Decision:** Show individual products to signed-out visitors, or only pathway categories?
- **Why it matters:** All 420 canonical products have **draft** copy; 0 are direct-buy; 124 are assisted-order; 242 are Care-only; supplier/COA are unverified. Publishing a product is publishing its copy.
- **Recommended default:** **Public product index shows a curated set of up to 12 assisted-order Research products whose copy you approve**, plus three pathway tiles (Care / Research products / Practices). Each card shows exact name + variant, a one-line plain description, pathway badge, price state (D-05) and one CTA. Care-only compounds are **not** listed individually (their existence is conveyed by the Care pathway tile). Unavailable products never listed. Until you approve the 12, the index renders pathway tiles only with "Sign in to see the full catalog".
- **Tradeoff:** Smaller visible catalog than the 393/420 figure; each listed product is defensible.
- **Codex cannot safely implement without it:** product index contents. (Template and states can be built first.)
- Samuel's decision: ______ (list the approved products, or "pathway tiles only for now")

### D-05 — Public prices

- **Decision:** Do signed-out visitors see prices?
- **Why it matters:** The brief wants visible prices. Today: August founder price book (34 SKUs) approved as member prices; member price = Early Access retail; September retail candidates are **pending approval**; Care prices are clinician/pharmacy-dependent.
- **Recommended default:** **Yes for listed Research products whose price you approved (August price book or a new explicit approval); otherwise the honest state "Price confirmed in your quote."** Care: never a product price; show "Care pricing is explained before you commit" only after D-06 defines it. No "first month" or discount mechanics.
- **Tradeoff:** Some cards show a quote state instead of a number.
- **Codex cannot safely implement without it:** price rendering on public cards.
- Samuel's decision: ______

### D-06 — What can the site say about Care availability, cost and speed?

- **Decision:** State coverage, consultation cost, response time, and whether pharmacy/clinician partners may be described.
- **Why it matters:** Live copy says a licensed U.S. compounding pharmacy dispenses, a U.S.-licensed clinician decides, replies come "typically within one business day", and a CSCS plan costs $30/month. `PROVIDER_READINESS.md` marks no pharmacy or clinician provider ready. On the call you said consults are "right now … no cost".
- **Recommended default:** Until operations verifies each item (CLAIM_LEDGER C-003..C-016): "Care availability depends on your state; we confirm it after your request." · No response-time promise · No named pharmacy/clinician claims beyond "A licensed clinician makes every medical decision" (and only once C-004 verified) · Remove the $30 plan · Say nothing about consultation cost.
- **Tradeoff:** Care pages become less specific; nothing on them can be false.
- **Codex cannot safely implement without it:** Care copy, confirmation copy, Care emails.
- Samuel's decision: ______

### D-07 — Practice referral economics (public wording)

- **Decision:** What the public site says about commission.
- **Why it matters:** Code holds two conflicting drafts (20% first order + 7.5% repeat months 2–12 **vs** 20% + 15%); both inactive. On the call: commission on all sales from referred clients (Stephen: "all peptide sales"), paid monthly (Seth), weekly statements (you).
- **Recommended default:** Public: **"Your practice earns commission on eligible orders from clients you refer. Rates, holds and payout timing are set out in your partner agreement."** No numbers on the site. **Commission applies to Research product orders only — never to Care services, consultations or prescriptions** until counsel clears it (paying a licensed referrer such as a PA for patients referred into clinical care raises anti-kickback / fee-splitting questions; Q-03). Separately, pick one schedule for the agreement (default: the 20% / 7.5% config, 21-day hold, $50 minimum) and retire the other draft.
- **Tradeoff:** Less persuasive than a number; avoids publishing terms before an agreement exists.
- **Codex cannot safely implement without it:** `/practices/referrals` economics block.
- Samuel's decision: ______ (public wording) / ______ (agreement schedule)

### D-08 — Can a practice account place orders for clients?

- **Decision:** Parent-account ordering (Tammy's proposal) — yes, no, or later.
- **Why it matters:** Stephen raised the liability himself: ordering for a client may make the practitioner responsible and bypasses the client's research-use acknowledgment. Code supports none of it (orgs can only re-request their own past orders).
- **Recommended default:** **Not at launch.** Clients create and own their accounts and accept research-use terms themselves. The practice workspace is visibility and reporting only. Revisit after counsel review (Q-02).
- **Tradeoff:** More steps for the client; no liability transfer to the practice or Xenios.
- **Codex cannot safely implement without it:** practice workspace page copy and any "order for client" control (must not exist).
- Samuel's decision: ______

### D-09 — Client ownership promise

- **Decision:** The exact promise to a referring practice.
- **Why it matters:** Stephen's biggest worry ("if I send you a client and then let go … you're benefiting and I'm losing"). You answered "you guys always are keeping client". That is a durable commercial promise and belongs in the agreement.
- **Recommended default (public wording):** **"Your client stays your client. They own their Xenios account; your practice stays attached to it as the referring practice. We don't market competing coaching or practice services to clients you refer. If your client uses Care, our clinician makes the medical decisions and your client decides what to share with you."**
- **Tradeoff:** Constrains future cross-selling to referred clients.
- **Codex cannot safely implement without it:** `/practices` ownership block, partner FAQ.
- Samuel's decision: ______

### D-10 — What a practice can see about referred clients

- **Decision:** Reporting granularity.
- **Why it matters:** The portal today shows **counts only** (no names, no orders — "a lead is a count, never a person"). Stephen asked how he'd know who bought; you promised transparent weekly statements.
- **Recommended default:** Public page promises only: **"Your practice dashboard shows referrals, orders placed and commission earned. Client names and order status appear only when your client agrees at sign-up. Care information is never shared with your practice without your client's written authorization."** Statement cadence: "Regular statements" until D-07 fixes it.
- **Tradeoff:** Less visibility than a spreadsheet of client purchases; privacy-safe.
- **Codex cannot safely implement without it:** `/practices/workspace` visibility copy. (Consent capture itself is future engineering — see `12_IMPLEMENTATION_PLAN.md` Phase 3.)
- Samuel's decision: ______

### D-11 — Wholesale / in-clinic inventory

- **Decision:** Offer it publicly now?
- **Why it matters:** Offered verbally as option 2 on the call. Requires licensing, storage, pharmacy and product review; no authority in code.
- **Recommended default:** **Not offered.** `/practices` mentions it only as "Under review — ask us" routing to a practice inquiry.
- **Tradeoff:** Clinics wanting stock-on-hand must wait.
- **Codex cannot safely implement without it:** Model D block.
- Samuel's decision: ______

### D-12 — Public clinician, pharmacy, testing and fulfillment claims

- **Decision:** Which, if any, may be named now.
- **Why it matters:** You named three medical directors on the call; the site already claims a licensed pharmacy, third-party testing "where applicable" and 72-hour shipping. None is verified in repo (zero vendor COA responses, no provider readiness, supplier replaced this week).
- **Recommended default:** **None named until verified and signed off** (CLAIM_LEDGER). Quality page describes the *process* ("Each lot has a record; if a certificate of analysis exists for your lot, you'll find it here") and removes "third-party testing" and "72 hours" until operations provides evidence.
- **Tradeoff:** Weaker trust section at launch.
- **Codex cannot safely implement without it:** Quality page, product pages, EA fulfillment copy, customer status emails.
- Samuel's decision: ______

---

## BRAND AND LEGAL TRANSITION (companion to D-01/D-02)

| Layer | Today (repo) | Working architecture (brief) | Safe now | Requires counsel/founder action first |
| --- | --- | --- | --- | --- |
| Legal/contracting entity | Xenios Technologies, Inc. (Delaware) in Privacy, Terms, footer, SEO; "Xenios Technology" in Gateway footer (error) | Xenios Technologies, Inc. remains | Fix Gateway string to "Xenios Technologies, Inc." everywhere | Any entity change, DBA filing |
| Umbrella / technology | "xenios" coach workspace | **Infinity** (AI, software, hardware, data, professional OS) | Coach workspace moves to `/workspace`; no "Infinity" text yet | Public use of "Infinity"; domain |
| Clinical / customer-health | "Xenios Care", "Xenios Health", "Care + Research" | **Eon Health** (working favorite); Samuel said "Infinity Health" on 2026-09-25 | Pathway names "Care" and "Research products" under "Xenios" | Choosing Eon vs Infinity Health; trademark; whether Eon is a DBA of Xenios Technologies, Inc. or a separate entity; clinical provider contracting entity (Care is provided by clinicians via a secure clinical system — who is the provider of record is a legal question, not a brand one) |
| Domain / email | xeniostechnology.com, team@, research@ | — | Keep | Any domain or sender change |
| Policies | Xenios Technologies, Inc. | — | Keep | Re-papering under a new brand |

Rule for Codex: brand strings come from one module (e.g., `client/src/lib/brand.ts`) with `publicBrandName = "Xenios"` and `legalEntityName = "Xenios Technologies, Inc."`. No component hard-codes a brand. The rename becomes a reviewed one-line change plus counsel-approved policy updates.

---

## HELPFUL TO DEFINE (Codex can proceed with the stated default)

| ID | Question | Default Codex will use |
| --- | --- | --- |
| H-01 | Careers openings | Keep the 3 current roles; add a general "Apply" form that creates a durable record (Phase 2); if not built, keep mailto labelled "Apply by email" with "we'll reply by email if there's a fit" and no timing promise. |
| H-02 | Programs / coaching marketplace (Model E) | Not in launch navigation; one FAQ line "Programs and services from partner coaches are planned." |
| H-03 | Analytics destination | Use the existing first-party analytics path (classic admin "analytics"); no new third-party trackers without consent. |
| H-04 | Support channel | One public support page; Care questions → Care support form; everything else → one inbox (research@ recommended) with the contact form. |
| H-05 | Stephen's retreat cross-promotion | Out of launch scope. |
| H-06 | "Research products" vs "Research" as the public label | "Research products" in nav/cards; "Research order" as the pathway name. |

## SAFE FOR CLAUDE TO RECOMMEND (no decision needed; implemented as specified)

Information architecture; page hierarchy; section order; CTA vocabulary; persona journeys; product-card and product-page template; state/empty/error/loading behaviour; status vocabulary mapping; mobile/tablet/desktop layout rules; accessibility; analytics event names; acceptance criteria; removal of internal jargon; consolidation of contact routes; fixing dead ends; the Gateway legal-string fix.
