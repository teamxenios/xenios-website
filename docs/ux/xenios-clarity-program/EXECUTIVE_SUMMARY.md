# Xenios clarity program — executive summary

For Samuel, Seth, Stephen, designers and engineers. Plain language.

## The problem

xeniostechnology.com is three websites sharing one address. The homepage sells an AI tool for coaches. Care lives on a separate set of pages. Products and ordering live on a third, reached through a "Health" link that changes the whole look of the site. The same words mean different things in different places ("Early Access" is both a coach waitlist and a way to order products). Practices don't have a page of their own.

Stephen Toth said it plainly on 2026-09-25: the site was overwhelming and he didn't know where to start. Seth sent a business inquiry thinking it was an account request. Another visitor got stuck on a closed application page. These are symptoms of the structure, not of one bad button.

What already works is solid. Care requests are recorded and reviewed by a person. Research orders have references, payment is verified by hand, and native checkout stays off. The admin door is locked properly. The partner workspace is well built — but hidden behind a front door nobody can get through.

## The target

**One site, one header, one promise.** Every visitor knows where they fit in under 30 seconds:

- **Individuals** — *Start Care* (a clinician decides) or *Explore Products* (research use, no clinical review). The two paths are clearly separate, and one never unlocks the other.
- **Practices** — a first-class *For Practices* section. Refer clients with your own link. Your clients create and own their accounts. Your client stays your client. You see what's credited to you. You never have to order on a client's behalf or put your license behind a research order.
- **Partners** — a clear path: apply, get approved, activate, get your link. It is never confused with a business inquiry.
- **Suppliers** — invitation after review. No promise of access.
- **Careers** — real roles and a real way to apply.
- **Returning users** — *Sign In* on every page, *Check Status* with a reference, and one support page.

The coach AI workspace moves to its own section (`/workspace`) until the Infinity brand is ready.

## What we will not say until it's true

- No pharmacy, clinician, testing, shipping-time, response-time, customer-count or catalog-size claims until operations or counsel verifies them.
- No commission numbers on the website. Commission applies to research-product orders only, never to Care.
- No outcome or medical claims.
- No "premium".
- No copied System Labs text, images or numbers. We adopt their clarity: visible prices where approved, one button per product, a three-step Care explainer, and login always visible.

## What Samuel needs to decide

There are 12 decisions, each with a recommended default (`02_DECISIONS.md`):

1. Brand now (recommended: keep "Xenios" until Eon/Infinity is legally ready).
2. Health front door at the root.
3. Hero line.
4. Which products are public.
5. Public prices.
6. Care availability, cost and speed wording.
7. Commission wording.
8. No practice ordering for clients at launch.
9. The client-ownership promise.
10. What practices can see.
11. No wholesale for now.
12. No named clinicians or pharmacies until verified.

Reply "accept defaults" to take all 12 recommendations at once.

## How it gets built

Codex implements in phases (`12_IMPLEMENTATION_PLAN.md`):

1. **The front door.** New homepage, one header and footer, audience selector, practice/partner/supplier pages, plain-language copy, claim cleanup, and fixed dead ends.
2. **Durable inquiries.** Every business inquiry and job application gets a reference and lands in the founder queue.
3. **Public products and prices,** once Samuel approves which ones.
4. **Practice program activation.** Referral links, commissions and the practice workspace. This needs counsel answers first and is separate from this release.

Nothing is deployed without Samuel's exact-SHA production approval.

## Where everything is

| Need | File |
| --- | --- |
| What's wrong today, page by page | `CURRENT_STATE_AUDIT.md` |
| Decisions | `02_DECISIONS.md` · questions for counsel/ops: `03_OPEN_QUESTIONS.md` |
| Site structure | `04_INFORMATION_ARCHITECTURE.md`, `SITEMAP.md` |
| Words on every page | `05_COPY_DECK.md` |
| Page-by-page build spec | `PAGE_SPECIFICATIONS.md` |
| Practices (Stephen's model) | `09_PRACTICE_MODEL.md`, `STEPHEN_COMPASS_CASE_STUDY.md` |
| Every product and its pathway | `08_PRODUCT_PATHWAY_MATRIX.csv` (513 catalog units + 11 offers) |
| Every claim and its status | `CLAIM_LEDGER.csv` |
| Buttons, notifications, tests | `07_CTA_MATRIX.csv`, `10_NOTIFICATION_MATRIX.csv`, `11_UAT_MATRIX.csv` |
| Sources and their reliability | `00_SOURCE_LEDGER.md`, `01_CURRENT_SOURCE_IDENTITY.md` |
