# Page specifications

Copy lives in `05_COPY_DECK.md` (referenced as §n). Routes in `04_INFORMATION_ARCHITECTURE.md`. Notifications in `10_NOTIFICATION_MATRIX.csv` (N-xx). Tests in `11_UAT_MATRIX.csv` (U-xxx). CTAs in `07_CTA_MATRIX.csv`.

## G — Global defaults (apply to every page unless the page says otherwise)

- **Chrome:** shared header/footer (IA §Header, §Footer). One `<h1>`. Skip link. `noindex` only for token/auth pages.
- **Loading:** skeletons for data regions; buttons show "Sending…" and disable on submit; no blank screen >1s.
- **Failure:** only claim what the server confirmed. Three distinct outcomes for any submission: *accepted* (show reference), *rejected/not stored* ("Nothing was saved"), *uncertain* (timeout; tell the user not to resend and how to check). Form contents preserved on failure/uncertain.
- **Unavailable:** a feature closed by flag or decision renders its closed state with one alternative action — never a password wall, never a raw error, never a blank page.
- **Empty:** every list has a written empty state with one action.
- **Mobile (390):** single column; header shows Logo · Sign In · Start Care · Menu; primary CTA visible in first viewport; no horizontal scroll; tap targets ≥44px; forms one field per row.
- **Tablet (768):** two-column card grids; header as mobile.
- **Desktop (1440):** full header; max content width ~1200px; card grids 3–4 columns.
- **Analytics (first-party, no PII):** `page_view{route}` · `cta_click{cta_id,label,route,section}` · `audience_select{tile}` · `form_start{form_id}` · `form_submit_result{form_id,result:accepted|rejected|uncertain}` · `status_lookup{result:found|not_found}` · `sign_in_result{result}` (no emails, names or references in events).
- **Acceptance (every page):** passes U-G01..U-G08 (no overflow at 390/768/1440; keyboard reachable; visible focus; only §1 CTA labels; no retired labels; no unapproved claims from CLAIM_LEDGER; shared chrome; legal line exact).

---

## P-01 Home `/`

| Field | Spec |
| --- | --- |
| Audience | Everyone, first visit |
| User question | "What is this, is it for me, and what do I click?" |
| 5-second promise | Clinician-guided Care or research products — pick your path; practices and partners have their own door. |
| Hero | §3 H1/sub (D-03) |
| Primary CTA | Start Care → `/care/schedule` |
| Secondary CTA | Explore Products → `/products` |
| Content order | IA §Homepage content order (11 sections) |
| Product/pricing | Up to 6 cards from the approved public set (D-04) with price or "Price confirmed in your quote" (D-05); if none approved, pathway tiles only |
| Trust evidence | Process-only quality line; Care/Research separation; legal entity; no counts, names, reviews, seals |
| Authority boundary | No catalog authority change; product list from publication authority; Care CTA goes to existing request form |
| Form behaviour | None on page |
| Submission / success / failure | N/A |
| Loading | Product cards skeleton; if product API fails → pathway tiles only (no error text) |
| Unavailable | Care closed → Care tile says "Care requests are paused" + Contact Support |
| Empty | No approved products → §5 empty copy |
| Next step / notification / operator | N/A |
| Status/return path | Helper line: Sign In · Check Status |
| Mobile | Hero + both buttons in first viewport at 390×844; selector tiles stacked |
| Desktop | Selector 3×2 grid; products 3-up |
| Analytics | `audience_select`, `cta_click` for every button |
| Acceptance | A first-time tester can, within 30 s and without scrolling past section 2, point to: Start Care, Explore Products, For Practices, Become a Partner, Sign In (U-001..U-006). No coach-workspace content above the footer. |

## P-02 For Individuals `/individuals`

| Field | Spec |
| --- | --- |
| Audience | Consumers deciding between Care and products |
| User question | "Which one do I need?" |
| 5-second promise | Care = a clinician decides; research products = research use, no clinical review. |
| Hero | §4 |
| Primary / secondary | Start Care / Explore Products |
| Content order | Hero → two-column comparison (who it's for, account needed, what happens next, cost to start, where status lives) → Check Status / Sign In band → FAQ subset |
| Product/pricing | None |
| Trust | C-019, C-020, C-023 |
| Authority boundary | Must state that Research never unlocks Care |
| States | Static page |
| Mobile/desktop | Columns stack <768 |
| Analytics | `cta_click` |
| Acceptance | Comparison rows identical in both columns; no clinical outcome words |

## P-03 Product index `/products`

| Field | Spec |
| --- | --- |
| Audience | Consumers, researchers, practices evaluating products |
| User question | "What can I get, in what size, for how much, and how?" |
| 5-second promise | Exact products, exact sizes, honest price and a single next step. |
| Hero | §5 index H1/sub |
| Primary CTA | Per card (Request Order / Start Care) |
| Secondary CTA | Check Status (header helper) |
| Content order | Hero → filter → pathway tiles (Care tile always present) → card grid → research-use note → "How ordering works" link |
| Product/pricing | Card contract §5: name, variant, one-line approved description, one badge, price or price state, one CTA. Source: publication authority (storefront projection) — only products with an approved publication record (D-04). Price only if D-05 approves for that SKU. Never show Unavailable products in the grid. |
| Trust | Research-use note on every card; lot-record link where present |
| Authority boundary | Server decides badge and action (existing `action.ts` semantics); client never infers "buyable"; no add-to-cart (commerce dark) |
| Form | None |
| Loading | Grid skeleton (6) |
| Failure | Product API error → "We couldn't load products. Try again." + Start Care / Sign In |
| Unavailable | Storefront flag off → empty state §5 |
| Empty | §5 empty copy |
| Next step | Card CTA |
| Status/return | Check Status in header menu |
| Mobile | 1 column; badge and price visible without expanding |
| Desktop | 3–4 columns |
| Analytics | `product_card_view{slug}` (batched), `cta_click{cta_id=product_card,slug}` |
| Acceptance | Every card has exactly one CTA consistent with its badge (U-020); no card with Request Order for a Care-only product; no "$0"; no card missing variant |

## P-04 Reusable product page `/products/:slug`

| Field | Spec |
| --- | --- |
| Audience | Visitor deciding on one product |
| User question | "Exactly what is this, can I get it, what does it cost, what happens when I click?" |
| 5-second promise | One product, one state, one button, what happens next. |
| Hero | Name + variant + badge + price line + one button |
| Primary CTA | Request Order (Research/Assisted) · Start Care (Care only) · none (Unavailable) |
| Secondary CTA | Contact Support ("Questions?") |
| Content order | §5 product page sections |
| Product/pricing | Variant selector only if the product has >1 approved variant; each variant row repeats state + price; server-decided action per variant |
| Trust | Documentation block; research-use note (C-018 — attached to every research product, fixing CUX-09) |
| Authority boundary | Request Order hands off to the existing assisted-order request with product+variant prefilled; no quantity-based pricing shown; no dosing/reconstitution content (C-034) |
| Form | None on page (form is the order request page) |
| Loading/failure | Skeleton; 404 slug → "We couldn't find that product." + Explore Products |
| Unavailable | §5 unavailable copy, no CTA |
| Empty | N/A |
| Next step | Order request page → confirmation (N-03) |
| Mobile | Button sticky at bottom of the product hero only (not site-wide) |
| Analytics | `product_view{slug}`, `cta_click` |
| Acceptance | U-021..U-024 |

## P-05 Care `/care`, `/care/schedule`, confirmation

| Field | Spec |
| --- | --- |
| Audience | Adults seeking clinician-guided care; practice-referred clients |
| User question | "How do I start, what happens, is this safe, what does it cost?" |
| 5-second promise | Send a short request; a person reviews it; a clinician decides. |
| Hero | §6 |
| Primary / secondary | Start Care → `/care/schedule` / How It Works (text link) |
| Content order | Hero + live availability → 3 steps → What Care is not → availability line (D-06) → FAQ (Care) → Start Care band |
| Product/pricing | No product prices. No consultation price (C-022) |
| Trust | C-004 only if verified; C-020, C-024; emergency note |
| Authority boundary | Existing `/api/care/access-request` and its readiness gate unchanged; no clinical fields added |
| Form | Existing fields; add nothing clinical. Optional future field "Referred by a practice?" only after Q-03/Q-04 |
| Submission | POST existing endpoint |
| Success | §6 confirmation with reference, chosen contact method echoed, not-intake line, email line conditioned on actual email result |
| Failure / uncertain | §6 failure/uncertain copy; form preserved |
| Loading | "Checking availability…" then form |
| Unavailable | Readiness closed → §6 closed line + Contact Support + Retry |
| Next step | Care team contacts via chosen method |
| Notification | N-01 (customer), N-02 (operator) |
| Operator obligation | Care request in `/admin/research/care-requests` with owner and status |
| Status/return | Confirmation says status arrives from Care team; Check Status page repeats (Q-13) |
| Mobile | Form single column; submit visible after last field |
| Analytics | `form_start{care_request}`, `form_submit_result` |
| Acceptance | U-030..U-036; no "one business day", no pharmacy sentence, no $30 plan unless approved |

## P-06 Research products & ordering `/research`, order request, status

| Field | Spec |
| --- | --- |
| Audience | Research buyers; practice-referred clients |
| User question | "How does ordering work, when do I pay, how do I track it?" |
| 5-second promise | Request → quote and payment details → we verify payment by hand → we ship and email tracking. |
| Hero | §7 |
| Primary / secondary | Explore Products / Check Status |
| Content order | Hero → 4 steps → payment → tracking → research-use → FAQ (orders) |
| Product/pricing | Links to index; no prices here |
| Trust | C-023 |
| Authority boundary | Existing assisted-order request, quote, payment-proof and human-verification authority unchanged; `commerceEnabled=false` unchanged; no Buy Now |
| Form (order request page) | Existing assisted-order form, relabelled: title "Request an order"; product+variant prefilled from P-04; referral code field kept ("Referral code, if a practice or partner gave you one") |
| Success | §7 confirmation |
| Failure/uncertain | G rules |
| Status page | Uses §13 labels instead of raw codes (fixes CUX-11); Continue Order shown only when server says customer action is required |
| Notification | N-03/N-04/N-05/N-06/N-07 |
| Operator | Assisted-order queue; payment review queue |
| Mobile | Status timeline vertical |
| Analytics | `form_submit_result{order_request}`, `status_lookup` |
| Acceptance | U-040..U-047; no "Early Access", "passwordless", "Catalogue" on customer-facing screens |

## P-07 For Practices `/practices`

| Field | Spec |
| --- | --- |
| Audience | Practice owners and staff (Stephen) |
| User question | "Does this fit my practice, do I keep my clients, how do I earn, what's the legal line, what happens next?" |
| 5-second promise | Refer clients with your link; they own their accounts; your client stays your client. |
| Hero | §8 |
| Primary / secondary | Submit Inquiry (on-page form) / Sign In (approved practices) |
| Content order | Hero → 3 model cards → Your client stays your client → We handle / you handle → What a practice account doesn't do → Commission → In-clinic inventory → What happens after you submit → Inquiry form → Practice FAQ |
| Product/pricing | No product prices; commission per D-07 wording only |
| Trust | C-028, C-029, C-030 (approved wording only) |
| Authority boundary | No ordering for clients; no commission on Care; no practice clinical authority |
| Form | §8 fields; inquiry type `practice` |
| Submission | Existing `/api/contact` acceptance semantics **plus** durable record + reference + founder queue item (N-09; `12_IMPLEMENTATION_PLAN.md` Phase 2). Until durable record exists, confirmation must not show a reference and must say "We've emailed our team." |
| Success | §8 confirmation |
| Failure/uncertain | G rules; draft preserved |
| Next step | Qualification contact → agreement → activation (practice lifecycle) |
| Notification | N-09 (customer + operator) |
| Operator | Founder queue: practice inquiry with owner, due date, state |
| Status/return | Reference + "Check Status" not applicable to inquiries until durable status exists; say "We'll contact you" |
| Mobile | Model cards stacked; form after cards; Submit Inquiry anchor button in hero |
| Analytics | `form_submit_result{practice_inquiry}`, `cta_click` |
| Acceptance | Stephen test (U-060): answers questions 1–13 of the case study from this page and its three sub-pages alone |

## P-08 Practice referral model `/practices/referrals`

| Field | Spec |
| --- | --- |
| Audience | Practices considering referrals |
| User question | "How exactly does referral, attribution and commission work?" |
| Promise | Your link → client's own account and order → credited to you → reported in your workspace. |
| Hero / CTAs | "How referrals work" / Submit Inquiry · Sign In |
| Content | 7-step flow (Model A) in plain words; attribution sentence (no window number); commission (D-07); what the client does (accepts research-use terms); FAQ |
| Authority | Referral links are issued after approval (C-031) |
| States | Static |
| Acceptance | No rate, no payout cadence number unless D-07 approves; "Care never earns commission" present |

## P-09 Practice workspace `/practices/workspace`

| Field | Spec |
| --- | --- |
| Audience | Approved practices and prospects |
| User question | "What will I see and who on my team can see it?" |
| Promise | Referrals, credited orders and commission; staff with the right access; nothing that touches client care. |
| Hero / CTAs | "Your practice workspace" / Sign In · Submit Inquiry |
| Content | What you see (D-10 table) · Roles (Owner/Admin/Billing contact) · What it doesn't do · How to add staff |
| Authority | Workspace pages are BUILT-DARK; this page explains; Sign In routes by server role |
| Unavailable | If org workspace not mounted: §8 interim line pointing to partner dashboard |
| Acceptance | No mention of ordering for clients; no client-name visibility without consent wording |

## P-10 Care for your clients `/practices/care`

| Field | Spec |
| --- | --- |
| Audience | Practices with clients who may need a clinician |
| User question | "If I send a client to your clinician, who decides and who follows up? Do I lose them?" |
| Promise | Our clinician decides; your coaching continues; you see only what your client shares. |
| Hero / CTAs | "Care for your clients" / Start Care (for the client to use) · Submit Inquiry |
| Content | Model C flow; who decides; who follows up; what's shared; no commission on Care |
| Authority | Clinical authority solely with Eon clinician; wording pending Q-04 |
| Acceptance | No sentence implying the practice approves treatment |

## P-11 Partners `/partners` (affiliates/referral partners) and `/partners/apply`

| Field | Spec |
| --- | --- |
| Audience | Creators, coaches, individual referrers |
| User question | "How do I join, what do I get, what happens after I apply?" |
| Promise | Apply → review → agreement → activate → link → track. |
| Hero | §9 |
| Primary CTA | **Apply** when the partner application authority is enabled; otherwise **Submit Inquiry** (type "Partner program interest") with the closed-state line |
| Secondary | Activate Account / Sign In |
| Content | Steps; what partners get (link, resources, dashboard, commission per agreement); disclosure rule; Strategic partnerships section (P-12) |
| Authority | Uses existing partner application API **only** when its flags allow (it requires sign-in today — if opened, the apply page must say "Sign in or create an account to apply"); never a reviewer-password wall on `/partners/apply` — closed state instead (fixes CUX-07) |
| Success (apply) | "Your application was received. Reference {ref}. We'll email you about next steps." (N-10) |
| Success (interest) | Inquiry confirmation (N-09 variant) |
| Acceptance | U-070..U-074; "Research Rep" absent; inquiry and application never share a button |

## P-12 Strategic partnerships (section of `/partners`)

| Field | Spec |
| --- | --- |
| Audience | Distribution, technology, education, white-label businesses |
| Promise | Tell us about the relationship; a person follows up; this isn't an account. |
| CTA | Submit Inquiry (type `strategic`) |
| Behaviour | As P-07 form semantics (N-09) |
| Acceptance | Confirmation says "doesn't create an account or approve anything" |

## P-13 Suppliers `/suppliers`

| Field | Spec |
| --- | --- |
| Audience | Pharmacies, labs, manufacturers, distributors, diagnostics, fulfilment |
| User question | "How do we become a supplier and what will you ask for?" |
| Promise | Inquiry → documentation review → invitation. |
| Hero | §10 |
| Primary / secondary | Submit Inquiry / Contact Support |
| Content | Who, how it works, what we review (documentation, quality, capacity), invitation-only line |
| Form | Supplier inquiry (entity, contact, category, region, capabilities, documentation available Y/N, message) — no uploads on public page |
| Behaviour | N-09 (supplier) |
| Acceptance | No promise of access; no workspace link |

## P-14 Careers `/careers`, `/careers/:slug`

| Field | Spec |
| --- | --- |
| Audience | Candidates (clinical, operations, technology, growth, partnerships, support, contractors, advisors) |
| User question | "What roles exist and how do I apply?" |
| Promise | Real roles, a real way to apply, a real acknowledgement. |
| Primary CTA | Apply |
| Content | Roles grouped by function; each role: summary, location, type, Apply; "Don't see a fit?" general application |
| Behaviour | H-01: Phase 2 durable application form (N-13); until then "Apply by email" with honest line |
| Acceptance | Apply never a bare mailto without the "by email" label |

## P-15 Sign In `/sign-in`

| Field | Spec |
| --- | --- |
| Audience | Customers, practices, partners, founder |
| User question | "Where do I get back into my account?" |
| Promise | One sign-in for customers, practices and partners; Care patients use their secure link. |
| Hero | §11 Sign In |
| Primary / secondary | Sign In (form) / Activate Account |
| Content | Form → Forgot password → Activate Account → Care patient note → New here? Start Care / Explore Products |
| Authority | Existing Supabase sign-in; server routes founder to command center (`/api/admin/me`); partner/practice to their workspace when provisioned; no client-side admin detection |
| Failure | Generic mismatch message; no enumeration |
| Remove | "View application information" link (CUX-12) |
| Acceptance | U-080..U-085 |

## P-16 Activation `/activate`

| Field | Spec |
| --- | --- |
| Audience | People Xenios approved (customer, B2B buyer, partner, practice) |
| User question | "I got an approval email — how do I set up?" |
| Promise | Use your link, set a password, you're in. |
| Behaviour | Existing claim token authority (`/api/research/member/claim`); valid → set password → active; invalid/expired/consumed → §11 message + Contact Support; never reveals account existence |
| Notification | N-11 |
| Acceptance | U-086..U-089 (no token, invalid, expired, consumed, valid) |

## P-17 Order / status `/status` and status pages

| Field | Spec |
| --- | --- |
| Audience | Anyone with a reference |
| User question | "Where is my order/request?" |
| Promise | Enter your reference and email; see the status in plain words. |
| Behaviour | Routes to existing status authority for assisted orders / EA orders; signed-in users get a link to account orders; Care note (Q-13) |
| Not found | §11 message |
| Acceptance | U-090..U-094 incl. wrong email, wrong reference, closed-tab return |

## P-18 Support `/support`

| Field | Spec |
| --- | --- |
| Audience | Existing customers and anyone stuck |
| Promise | Pick what you need help with; we route you. |
| Content | 4 routing cards + general form (existing `/api/contact`) |
| Behaviour | General form N-12; Care routed to Care support (existing) |
| Acceptance | One page replaces `/research/contact`, `/research/support`; `/care/support` kept for Care |

## P-19 Quality `/quality`

| Field | Spec |
| --- | --- |
| Audience | Skeptical buyers, practices |
| Promise | How lot records work and how to look one up. |
| Content | Lot records → Look up a lot → Documentation you'll receive → What we don't claim |
| Authority | Existing lot lookup API; secure documents stay in account |
| Acceptance | No third-party testing claim unless C-008 verified; secure documents link says "Sign in to see your documents" (not a dead end) |

## P-20 FAQ `/faq`

| Field | Spec |
| --- | --- |
| Promise | Straight answers, grouped by who's asking. |
| Content | §11 FAQ groups; every answer from CLAIM_LEDGER-approved text |
| Acceptance | Each answer ≤80 words; no answer contradicts D-items |

## P-21 Admin / founder entry `/admin`

| Field | Spec |
| --- | --- |
| Audience | Founder and authorized operators |
| Promise | Secure operations access. |
| Behaviour | **Unchanged.** `requireSupabaseAdmin` (`server/routes.ts:128-151`) remains the sole authority; recovery sessions denied; not linked from public chrome |
| Operator obligations surfaced | Command center lanes must include: Care requests, Assisted orders, Payment review, **Business inquiries (practice/partner/supplier/strategic)** (new, N-09), **Partner applications** (N-10), Career applications (N-13) |
| Acceptance | U-100..U-104 (non-admin denied, recovery session denied, admin lands on command center, new inquiry lane visible, no client-side bypass) |

## P-22 How It Works `/how-it-works`

Care steps and Research steps side by side (§3 steps), "What each path is not", Start Care / Explore Products. Acceptance: steps identical to Home and to the actual lifecycle.

## P-23 About `/about`

§11 About; company, legal entity, workspace link; no agent names; no counts. Brand architecture sentence only after D-01/D-02.
