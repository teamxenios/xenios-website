# Current-state audit — public site at runtime `c4ea8a9`

Evidence level: **source inspection** of `c4ea8a9` (worktree `049dfd9`), plus the audit lane's browser/SQL evidence where cited. No page below was re-exercised in a browser by this lane; the independent review (`CLAUDE_02`) must do that against the implemented candidate. Production (`79414143`) lacks the candidate's Sign in / Get access chooser (AUD-003); otherwise structure is the same.

## The one-sentence diagnosis

**xeniostechnology.com is three websites sharing a domain** — a coach-AI software waitlist at `/`, a Care site at `/care`, and a "Care + Research" site at `/health` and `/research/*` — each with its own header, footer, vocabulary and, in one case, a different legal-entity string. A first-time visitor lands on the software site, whose hero says nothing about Care or products. That is the structural reason Stephen Toth "didn't know where to start" and Seth mistook an inquiry for an account request.

## Findings (current UX)

Severity: P0 = unsafe/false/illegal or data loss; P1 = a core audience cannot understand or complete its primary job, or a live unverified regulated claim; P2 = real confusion with a workaround; P3 = polish.

| ID | Sev | Persona(s) | Route(s) | Finding | Evidence (file:line @ c4ea8a9) | Authority impact |
| --- | --- | --- | --- | --- | --- | --- |
| CUX-01 | P1 | Consumer, practice, partner | `/` | Root homepage is the coach-AI workspace ("The AI workspace for serious coaches", CTAs Request Early Access / See How It Works). Care and products are not mentioned above the fold; a Research/Care access chooser sits in section 2 under a software hero. | `client/src/pages/Home.tsx:59-77` | None (copy/IA) |
| CUX-02 | P1 | All | `/`, `/health`, `/research/*`, `/care/*` | Three chromes: Navbar/Footer (coach site), Gateway header/footer (`/health`), MinimalChrome (`/research/*`), Care pill nav. Primary nav item "Health" leaves the site. Footer entity "Xenios Technologies, Inc." vs Gateway "Xenios Technology". | `lib/nav.ts:14-21`; `Gateway.tsx:50-121, 117`; `research/layout.tsx:146-172`; `Footer.tsx:53` | Legal-entity string inconsistency |
| CUX-03 | P1 | Consumer, coach | `/waitlist`, `/research/early-access`, `/research/access-hub` | "Early Access" means the coach-software waitlist in the main menu/ribbon/hero and a peptide ordering catalog in the Gateway footer and Access Hub. The Early Access ordering page is called "passwordless" yet its locked state asks for a password. | `lib/nav.ts:37`; `Gateway.tsx:106`; `AccessHub.tsx`; `EarlyAccessRoute.tsx:431-495` | None |
| CUX-04 | P1 | Consumer | all | No public product or price view exists. "Explore Research" leads to an access hub, then an order-mode chooser, then Early Access. A visitor cannot answer "what can I buy and how much?" without starting an order. | `research/section.tsx:302-454` (catalog unmounted); `storefront/routes.ts:34-56` | Product authority correctly dark; the *explanation* is missing |
| CUX-05 | P1 | Consumer, Care prospect | `/care`, `/health`, `/research/faq`, EA pages, emails | Live copy states facts not verified in repo: licensed U.S. compounding pharmacy dispenses/ships; U.S.-licensed clinician decides; 72-hour shipping after payment verification; Care reply "typically within one business day"; $30/month CSCS-created plan. | `CarePublicPages.tsx:142,147,155-160,209`; `Gateway.tsx:9-17`; `Faq.tsx:47,52`; `fulfillment-copy.ts:14-15`; `server/care/manual-access.ts:200-213`; `customer-status.ts:18` | Regulated/operational claims without provider readiness (`PROVIDER_READINESS.md`) |
| CUX-06 | P1 | Practice owner (Stephen) | `/research/partners`, `/research/organizations` | There is no "For Practices" page. Practices are one of eight cards on a partner page whose hero is "The right relationship starts with the right boundary." Nothing explains referral links, attribution, client ownership, commission reporting, Care integration, or who does what. | `research/b2b/pathways.ts:24-122`; `PartnerPathwaysPage.tsx` | None (missing explanation) |
| CUX-07 | P1 | Practice, affiliate | `/research/affiliates` → `/research/partners/apply` | The only "apply" path is unreachable: signed-out users hit the reviewer-password page (which also says ordering is not open, contradicting live ordering); the apply API requires sign-in and returns "disabled" while commerce is off. Program is branded "Research Rep". | `research/layout.tsx:82-134,356-404`; `server/research/commerce/routes.ts:648-672`; `production-deps.ts:1683-1708` | Program correctly dark; the page promises an action that cannot happen |
| CUX-08 | P1 | Practice, partner, supplier | `/research/partners`, `/organizations`, `/supplier-access`, `/contact` | Business inquiries are email-only: `/api/contact` now waits for provider acceptance (AUD-001 repair) but stores no record, issues no reference, creates no operator queue item, and offers no status. | `server/services/contact-delivery.ts:23-42`; `server/routes.ts:440-476` | Notification/obligation gap (UX doc P1-02/03/06) |
| CUX-09 | P1 | Consumer (Research) | member catalog, product detail | The research-use disclosure ("not treatment recommendations or instructions for human use") is attached only to families that do not exist in the dataset; real peptide products (`research_peptides_materials`) get only a generic disclosure. | `server/research/master-offerings/customer-projection.ts:30-34,114-121` | Research/Care boundary copy gap on product pages |
| CUX-10 | P2 | All | global | Too many pathway concepts at once: Early Access, member, assisted, organization, affiliate, partner, Care, supplier, support (UX doc P2-01). The homepage chooser has 7 cards; Access Hub adds 6 more; Order hub adds 7 modes. | `AccountAccessChooser.tsx:3-11`; `AccessHub.tsx`; `shared/research/order-entry.ts:55-278` | None |
| CUX-11 | P2 | Consumer, customer | `/research/early-access/order-request/:ref` | Assisted-order status shows raw status codes with underscores removed ("waiting on customer", "agreements pending"); 15 internal statuses exposed. | `AssistedOrderStatusPage.tsx:102-142` | None |
| CUX-12 | P2 | Returning user | `/research/sign-in`, `/care/portal`, `/research/documents`, `/research/policies` | Dead ends: sign-in's "View application information" → closed page; `/care/portal` has no portal link; Quality → "Open secure documents" → members-only; policy pages can render "not published yet"; "Start an assisted request" lands on generic Early Access. | `SignIn.tsx`; `CarePublicPages.tsx`; `order-entry.ts` | None |
| CUX-13 | P2 | All | `/contact`, `/research/contact`, `/research/support`, `/care/support` | Four contact destinations, three channels (team@, research@, Care form) with no rule for which to use. | route table | None |
| CUX-14 | P2 | Consumer | coach + Research pages | Jargon on consumer surfaces: Xen, Athena, Hercules, The Studio, "authority", "fail closed", "unprovisioned", "Research platform", "Catalogue"/"catalog". | `Home.tsx`; `AccessHub.tsx:117-131`; `About.tsx:72` | None |
| CUX-15 | P2 | Coach | `/waitlist` | One action, four verbs: "Apply for the founding group", "Submit Application", "Join the waitlist", "You are on the xenios waitlist". | `Waitlist.tsx`; `WaitlistForm.tsx:110` | None |
| CUX-16 | P2 | Candidate | `/careers/:slug` | Apply is a `mailto:` only — no receipt, no record, no status. | `lib/careers.ts:148-151` | Notification gap |
| CUX-17 | P2 | Practice (future) | — | Org workspace server API is mounted but its tables are unapplied draft SQL, and the draft `research_organizations` would silently collide with the partner-owned production table of the same name. Engineering risk for Model B. | `supabase/pack02-candidates/20260812_research_account_organizations.sql`; `supabase/production/research-full-production.sql:1517-1523` | Schema authority — integrator |
| CUX-18 | P2 | Partner | — | Two conflicting draft commission schedules (repeat 7.5% months 2–12 vs 15%). Not public today; becomes P1 the moment a practice page shows economics. | `affiliate-program/config.ts:7-9,69-79`; `affiliates/v2/draft-schedule.ts:31-36` | Economics authority — founder |
| CUX-19 | P2 | Member | `/research/member` | Membership price copy ($50 activation, $25/30 days) shown while membership billing is disabled/retired. | `MemberArea.tsx:88`; `MemberWelcome.tsx:23` | Pricing claim |
| CUX-20 | P2 | Mobile visitor | `/` | Coach-site primary nav is hidden below 1024px; the full-screen Menu mixes coach, Health, Research and company links in one list. | `Navbar.tsx:31-66,86` | None |
| CUX-21 | P3 | All | `/early-interest`, `/mvps`, `/admin` | Orphan pages (no inbound links). `/admin` being unlinked is correct; the others are clutter. | route table | None |
| CUX-22 | P3 | Consumer | Research pages | "Catalogue" vs "catalog", "Care + Research" sub-brand, "xenios research" lower-case wordmark vs "Xenios Research". | various | None |
| CUX-23 | P3 | Supplier | `/research/supplier-access` | Hero "Operational access begins after evidence, not interest." is accurate but cold; form is fine. | `SupplierPartnershipPage.tsx` | None |

**Totals: P0 0 · P1 9 · P2 11 · P3 3.** P0 = 0 means none was demonstrated by source inspection; it is not proof of absence. CUX-05 becomes P0 if operations cannot verify the pharmacy/clinician statements at all (a false regulated claim).

## Page inventory (67 public page templates)

Columns: audience · current promise · authority (what actually happens) · primary CTA → destination · server action · next step / notification · confusion or dead end · mobile · severity (worst CUX).

### Site 1 — coach-AI workspace (Navbar/Footer)

| Route | Audience | Promise | Authority | CTA → dest | Server action | Next step / notif. | Confusion / dead end | Mobile | Sev |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | coaches (de facto everyone) | AI workspace for coaches | waitlist marketing + access chooser | Request Early Access → /waitlist | none | — | CUX-01, CUX-03 | nav hidden <1024 | P1 |
| `/product` | coaches | coach OS | marketing | Book a Product Walkthrough → /book | none | Calendly | agent jargon | ok | P2 |
| `/how-it-works` | coaches | 5 steps | marketing | Join the waitlist | none | — | name collides with Research "How it works" | ok | P2 |
| `/for-coaches` | coaches | scale relationship | marketing | Apply for Early Access | none | — | "Apply" = waitlist | ok | P2 |
| `/for-clients` | end clients | pocket coach | marketing | Talk to us → /contact | none | — | — | ok | P3 |
| `/storefront` `/network` `/manifesto` | coaches | commerce rail / coordination | marketing | Join the waitlist | none | — | "Storefront" ≠ product store | ok | P2 |
| `/ecosystem` (also target of `/partners` redirect) | partners | integrations | marketing | Talk to us | none | — | `/partners` lands here, not on partner program | ok | P2 |
| `/for-practitioners` + `/for/:slug` (19) | practitioner segments | segment one-liners | marketing | Join the waitlist | none | — | "practitioner" pages don't mention practice referral model | ok | P2 |
| `/about` | general | operating layer | marketing | Contact / Careers / Request Early Access | none | — | — | ok | P3 |
| `/careers`, `/careers/:slug` | candidates | 3 founding roles | hard-coded list | Apply by email (mailto) | none | none | CUX-16 | ok | P2 |
| `/waitlist` | coaches | founding group | `POST /api/waitlist/quick` | Join the waitlist | stores waitlist row | "APPLICATION RECEIVED" | CUX-15 | ok | P2 |
| `/contact` | all | "A human reads every message" | `POST /api/contact` (email only) | send | provider acceptance awaited | courtesy email (best effort) | CUX-08, CUX-13 | ok | P1 |
| `/security` `/compliance` | buyers | posture | marketing | Talk to the Team | none | — | — | ok | P3 |
| `/investors` `/press` | investors, press | deck / press | mailto | Request the Deck | none | — | — | ok | P3 |
| `/privacy` `/terms` `/disclosures` | legal | policies | static (Xenios Technologies, Inc.) | — | — | — | Research has separate policy pages | ok | P2 |
| `/early-interest` `/concepts` `/mvps` `/book` | mixed | — | `/api/early-interest`, Calendly | various | early-interest row | — | CUX-21 | ok | P3 |

### Site 2 — Care (Care pill nav; ribbon hidden)

| Route | Audience | Promise | Authority | CTA | Server action | Next step / notif. | Confusion / dead end | Mobile | Sev |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/care` | Care prospect | start with a Care access request | live availability check | Start Care request | GET status | — | CUX-05 ($30 plan, pharmacy) | pills wrap | P1 |
| `/care/schedule` | Care prospect | start request | `POST /api/care/access-request` → `loi_submissions`, ref `CARE-XXXXXXXX` | Submit Care request | durable row + internal alert + confirmation email | on-screen ref; "one business day" | CUX-05; no status lookup for Care ref | ok | P1 |
| `/care/portal` | Care user | secure access after review | informational | Start Care request | none | — | CUX-12 (no portal link, by design) | ok | P2 |
| `/care/how-it-works` `/care/provider-review` | Care prospect | process, clinician independence | informational | none | none | — | good boundary copy | ok | P3 |
| `/care/support` | Care user | right support channel | `POST /api/care/contact` | Send to Xenios Health | email | "Your message is with the Xenios Health team" | "Xenios Health" brand appears only here | ok | P2 |

### Site 3 — Care + Research gateway and Research public pages (Gateway / MinimalChrome)

| Route | Audience | Promise | Authority | CTA | Server action | Next step / notif. | Confusion / dead end | Mobile | Sev |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/health`, `/research` | consumer | "Provider-guided peptide care. Evidence-led Research access." | informational | Start Care request / Explore Research | none | — | CUX-02, CUX-05 | sticky Sign in / Get access ≤620px (good) | P1 |
| `/research/access-hub` | consumer | choose a path | informational | Choose how to order | none | — | CUX-10, jargon | collapsible menu | P2 |
| `/research/order` | Research buyer | how to begin | informational (7 modes) | Open Quick Early Access | none | — | CUX-10, CUX-12 | ok | P2 |
| `/research/early-access` (+ cart) | Research buyer | catalogue + checkout | EA unlock + cart (cart flag off in prod refresh) | Complete your order | `/api/research/early-access/*` | payment instructions → human verification | CUX-03 | ok | P1 |
| `/research/early-access/order-request` (+ confirm, status) | Research buyer | request an order | `POST …/assisted-orders`, ref `XRR-…` | Request an order | durable request + customer/operator emails | status page | CUX-11 | ok | P2 |
| `/research/apply`, `/research/apply/status` | would-be member | applications not open | closed; status by token | links to alternatives | none / token lookup | — | second-user dead end (repaired copy) | ok | P2 |
| `/research/sign-in`, `/reset-password`, `/activate` | returning user | sign in / recover / activate | Supabase; claim token | Sign in | auth | admin routed to command center | CUX-12 | RecoveryChrome | P2 |
| `/research/about` `/how-it-works` `/faq` | consumer | two pathways | informational | Start Care request / Explore Research | none | — | good Care/Research distinction; jargon | ok | P2 |
| `/research/quality` `/testing` `/documents` `/lots/:lotCode` | consumer | evidence travels with lot | lot lookup API | Open secure documents | lot read | — | CUX-05 testing claim; CUX-12 | ok | P2 |
| `/research/policies` `/privacy` `/terms` | legal | document status | policy status | — | — | — | "not published yet" states | ok | P2 |
| `/research/contact` `/research/support` | all | reach the right team | mailto research@ | email | none | — | CUX-13 | ok | P2 |
| `/research/partners` | partner/practice | right relationship, right boundary | inquiry via `/api/contact` | Send an inquiry / Existing partner access | email only | "not an account approval" (good) | CUX-06, CUX-08 | ok | P1 |
| `/research/organizations` | org buyer / clinic | structured access | inquiry via `/api/contact` | Send an organization inquiry | email only | same | CUX-06, CUX-08 | ok | P1 |
| `/research/affiliates` | affiliate | earn trust before attribution | links to gated apply | Review the partner application | — | — | CUX-07 | ok | P1 |
| `/research/partners/apply` | affiliate | apply as Research Rep | password gate + sign-in + commerce flag | Apply | disabled | — | CUX-07 dead end | ok | P1 |
| `/research/partners/dashboard` `/links` `/resources` | approved partner | workspace | portal flags off | — | unavailable | — | shows unavailable to everyone today | ok | P2 |
| `/research/supplier-access` | supplier | invitation-only ops access | inquiry via `/api/contact` | Send supplier interest | email only | — | CUX-08, CUX-23 | ok | P2 |
| `/r/:code` | referred recipient | an introduction | Referral V1 (off) | choose Care or Research | resolve (unavailable) | — | works only when V1 on | ok | P2 |
| `/admin` | founder | secure operations access | `requireSupabaseAdmin` (`server/routes.ts:128-151`) | Sign in | auth | → `/admin/research/command-center` | unlinked (correct) | ok | — |

## What already works and must be preserved

- Care request is durable (row + reference + operator alert + confirmation) and clinically bounded ("not medical intake", clinician independence, emergency notice).
- Assisted orders have references, status pages, operator emails and a human-only payment verification path; `commerceEnabled=false` is respected.
- Sign-in routes the founder to the command center; the admin guard is server-side, email-exact, and denies recovery sessions.
- The partnership form states plainly that an inquiry is not account approval, and contact delivery no longer claims receipt without provider acceptance.
- The partner workspace (onboarding → payouts) is far more complete than the public front door suggests (UX doc P1-04). **The redesign is a front-door and continuity problem, not a missing-product problem.**
