# 05 — Copy deck

Original Xenios copy. Nothing here is taken from System Labs or any other site. Brand token shown as **Xenios** (D-01). Text in ⟦brackets⟧ depends on a decision or claim and must be replaced by the approved wording in `02_DECISIONS.md` / `CLAIM_LEDGER.csv` before shipping; if not approved, the bracketed sentence is **omitted**, not guessed.

Style: short sentences; second person; no hype; no internal words (authority, fail closed, provisioned, lane, member-safe, Early Access, access hub, manifest, substrate); no agent names (Xen, Athena, Hercules) outside `/workspace`; "research products" lower-case in sentences; numbers only where the claim ledger allows.

## 1. Controlled CTA vocabulary

Every button and primary link on public pages uses exactly one of these labels. Each label means one thing everywhere.

| Label | Means exactly | Never used for |
| --- | --- | --- |
| **Start Care** | Open the Care request form. No account, not a medical intake. | Sign-in, orders, practices |
| **Explore Products** | Go to the public product index. | Starting an order |
| **Request Order** | Submit a request for a specific research product. No payment is taken on this step. | Care, inquiries |
| **Continue Order** | Resume a submitted order at its next step (e.g., payment details) using its reference or your account. | New orders |
| **Check Status** | Look up something you already submitted (order or request). | New submissions |
| **Sign In** | Sign in to an existing account. | Creating accounts, activation |
| **Activate Account** | First-time setup of an account Xenios already approved, using the link we emailed you. | Sign-in, applications |
| **For Practices** | Go to the For Practices page. | Submitting anything |
| **Become a Partner** | Go to the partner program page. | Submitting anything |
| **Apply** | Submit an application that someone reviews (partner program when open; a job). | Inquiries, Care, orders |
| **Submit Inquiry** | Send a business question to our team. Creates no account and approves nothing. | Applications, support |
| **Contact Support** | Get help with an order, account or question. | Business inquiries |
| **Join Waitlist** | Coach workspace only. | Anything on health pages |

Retired labels (must not appear on public pages): Get access · Request Early Access · Apply for Early Access · Enter Private Early Access · Prepare an inquiry · Send an inquiry · Continue → · Get started · See if you qualify · Buy now · Order (as a bare button) · Explore Research · Begin Care · Access Hub · Member sign in · Existing partner access · Review the partner application · send.

Secondary text links may use plain nouns ("How It Works", "Quality", "FAQ", "Pricing questions") — they navigate; they never submit.

## 2. Global

- Header nav: For Individuals · For Practices · Partners · How It Works · Quality · About · Careers · **Sign In** · [**Start Care**]
- Under-hero helper line (home): "Already a customer? **Sign In** · Have an order? **Check Status**"
- Footer legal: "© 2026 Xenios Technologies, Inc."
- Care-page emergency note: "If you're having a medical emergency, call 911."
- Research-use note (on every research product card and page): ⟦C-018 approved Research Use Policy sentence⟧ — default text until counsel supplies: "For research use only. Not for human consumption. Not medical advice."

## 3. Home (`/`)

- **H1:** ⟦D-03⟧ default "Clinician-guided Care and research-grade products."
- **Sub:** "Start Care with a ⟦C-004: licensed⟧ clinician, or order research products for your work. Two separate paths — you choose."
- **Buttons:** Start Care · Explore Products
- **Audience selector heading:** "Where do you fit?"
  - I want Care — "Tell us what you're looking for. A person reviews your request and, if Care fits, sets up a secure visit with a clinician. No account needed to start." → **Start Care**
  - I want research products — "Browse products for research use. Request an order with your email; we confirm availability and payment before anything ships." → **Explore Products**
  - I run a practice — "Clinics, providers, coaches, trainers, gyms, med spas and wellness teams. Refer clients, track what they order, and keep your client relationships." → **For Practices**
  - I want to refer people — "Share Xenios with your audience and earn commission on eligible orders once you're approved." → **Become a Partner**
  - I supply or fulfil — "Pharmacies, labs, manufacturers, distributors and fulfilment partners. Access is by invitation after review." → **Submit Inquiry**
  - I already have an account — "Orders, documents and your Care status." → **Sign In**
- **Products section:** heading "Two ways to get what you need" · tiles: "Care — clinician-guided treatment" / "Research products — for research use" / "For practices — refer your clients". Card grid heading "Research products". Link button **Explore Products**.
- **How Care works:** "1. Send a Care request — a few contact details and what you're looking for. 2. A person reviews it and contacts you. 3. If Care fits, you complete a secure clinical visit, and a clinician decides what's right for you." Line: "This request isn't a medical intake. Please don't include health details." → **Start Care**
- **How research orders work:** "1. Request an order for the exact product and size. 2. We confirm availability and email your payment details. 3. We verify your payment by hand. 4. We ship and email your tracking." Line: "Research products are for research use only. Ordering them doesn't give you access to Care." → **Explore Products**
- **For Practices band:** "Your clients, supported. Refer clients with your own link. They create their own accounts; you see what's credited to your practice. ⟦D-09: Your client stays your client.⟧" → **For Practices**
- **Partners band:** "Recommend Xenios to people who'd value it. Approved partners get a link, resources and commission on eligible orders." → **Become a Partner**
- **Quality band:** "Every lot has a record. ⟦C-009: If a certificate of analysis exists for your lot, you can look it up.⟧" → text link "Quality"
- **FAQ (6):**
  - What's the difference between Care and research products? — "Care is medical: a clinician reviews your situation and decides on treatment. Research products are sold for research use only, with no clinical review. They're separate, and one never unlocks the other."
  - What does it cost to start? — "Submitting a Care request is free. ⟦C-021: Creating an account is free.⟧ Research products show a price or say the price is confirmed in your quote."
  - What happens after I submit something? — "You'll see a reference number on screen and get an email copy when email delivery succeeds. A person handles the next step."
  - Can my practice order for me? — "No. You create your own account and accept the research-use terms yourself. Your practice can refer you."
  - Where do I sign in? — "Use **Sign In** at the top of every page. If we approved an account for you, use the activation link in your email first."
  - Do you give dosing instructions? — "Not for research products. If you use Care, your clinician gives you instructions."
- **Final band:** "Not sure where to start? Choose the path that fits you." · Start Care · Explore Products · For Practices

## 4. For Individuals (`/individuals`)

- H1: "Care or research products — here's how to choose."
- Two columns: **Care** ("For you, as a patient. A clinician decides.") → Start Care; **Research products** ("For research use. No clinical review.") → Explore Products.
- "Already ordered?" → Check Status · "Have an account?" → Sign In

## 5. Products index (`/products`) and product page (`/products/:slug`)

- Index H1: "Research products"
- Sub: "Every product shows its exact size and whether you can request it now. Prices are shown where confirmed; otherwise we confirm the price in your quote."
- Filter labels: "All" · "Available to request" · (Care tile) "Needs Care"
- Card: `{Product name}` · `{Variant, e.g. 10 mg vial}` · `{one-line plain description (approved)}` · badge (**Research order** / **Assisted order** / **Care only** / **Unavailable**) · price line (`$XX` or "Price confirmed in your quote") · one button.
- Card button by state: Research order → **Request Order**; Assisted order → **Request Order**; Care only → **Start Care**; Unavailable → no button, text "Not available right now".
- Empty index (no approved products yet): "We're preparing our public product list. Existing customers can **Sign In** to see the full catalog." + Start Care / Sign In.
- Product page sections: Name + variant · state badge · price or price state · **one** primary button · "What this is" (approved description) · "What you'll receive" (format per C-017) · "Documentation" (lot record link if present, otherwise "Documentation for this product is provided with your order confirmation when available.") · Research-use note · "How ordering works" (4 steps) · "Questions?" → Contact Support.
- Care-only product page (if ever linked): "This product is only available through Care, after a clinician's review." → Start Care. No price.
- Unavailable page: "This product isn't available right now." → Explore Products.

## 6. Care (`/care`, `/care/schedule` and confirmation)

- `/care` H1: "Care, guided by a clinician."
- Sub: "Start with a short request. A person on our team reviews it and contacts you about next steps."
- Availability live line (existing check): open → "Care requests are open." · closed → "Care requests are paused right now. You can still **Contact Support**." (with Retry)
- Steps: as Home "How Care works".
- "What Care is not": "Buying research products doesn't give you access to Care. A practice can't approve treatment for you. Only a clinician decides."
- ⟦D-06 availability⟧ "Care availability depends on your state. We confirm it after your request."
- Remove: pharmacy sentence (C-005) until verified; $30 plan (C-015); "one business day" (C-012).
- `/care/schedule` H1: "Start Care"
- Form intro: "This isn't a medical intake. Please don't include health details."
- Submit button: "Send Care request" (form submit, §12)
- **Confirmation:** "Your Care request was received." · "Reference: CARE-XXXXXXXX" · "What we received: your contact details, your state and the kind of help you're looking for." · "What happens next: someone on our Care team will contact you by ⟦chosen method⟧." · "This wasn't a medical intake — that happens later in a secure system, if Care fits." · email line per C-041 · "Questions? **Contact Support**"
- Failure (not stored): "We couldn't send your request. Nothing was saved. Please try again, or use **Contact Support**."
- Uncertain (timeout): "We're not sure your request went through. Please don't resend yet — check your email for a copy in a few minutes, or use **Contact Support** with the time you submitted."

## 7. How research orders work (`/research`) and ordering

- H1: "How research orders work"
- Sub: "Research products are sold for research use only. There's no clinical review, and nothing here is medical advice."
- Steps: 4 steps as Home.
- "Payment": "After we confirm your order, we email payment details. We verify every payment by hand before we release your order."
- "Tracking": "We email your tracking when your order ships." (no timing — C-010)
- Buttons: Explore Products · Check Status
- **Order request confirmation:** "Your order request was received." · "Reference: XRR-…" · "What you requested: {product, variant, quantity}" · "Status: Received — we're confirming availability." · "Next: we'll email your quote and payment details. No payment has been taken." · Check Status · Contact Support
- Status labels: see §13.

## 8. For Practices (`/practices` and sub-pages)

- `/practices` H1: "For practices: refer clients, keep your relationships."
- Sub: "For clinics, providers, coaches, trainers, gyms, med spas, behavioral-health practices, retreats and wellness teams."
- Section "How it works for your practice" (3 cards):
  - **Refer clients** — "Share your practice's link or code. Clients create their own accounts and place their own orders. Eligible orders are credited to your practice." → text link "How referrals work"
  - **Practice workspace** — "Approved practices sign in to see referrals, orders credited to them, and commission. Add staff with the right access." → "About the workspace"
  - **Care for your clients** — "When a client needs a clinician, they can start Care. Our clinician makes medical decisions; your coaching relationship continues." → "Care for your clients"
- Section "Your client stays your client" — ⟦D-09 approved text⟧
- Section "What we handle / what you handle":
  - We handle: product orders and fulfilment, payment verification, customer support for orders, Care (through our clinicians) when a client chooses it.
  - You handle: your coaching and client relationship; recommending whether a client might look into research products or Care; your own professional obligations.
- Section "What a practice account doesn't do": "It doesn't place orders for clients, edit their accounts, or approve treatment. Each client accepts the research-use terms themselves. If you're a licensed provider, talk to your own counsel about your obligations."
- Section "Commission": ⟦D-07 approved text⟧ default "Your practice earns commission on eligible research-product orders from clients you refer. Rates, holds and payout timing are in your partner agreement. Care services never earn commission."
- Section "In-clinic inventory": "Under review. If you're interested, mention it in your inquiry."
- Section "What happens after you submit an inquiry": "1. You get a reference number. 2. Someone from our team contacts you to learn about your practice. 3. If we're a fit, we send a partner agreement. 4. Once approved, you get an email to activate your account and your referral link."
- Primary: **Submit Inquiry** (practice inquiry form on page) · Secondary: **Sign In** ("Approved practice? Sign In")
- Inquiry form title: "Tell us about your practice" · fields: name, email, practice name, practice type (list above), your role, state/region, "How would you like to work with us?" (Refer clients / Care for clients / In-clinic inventory (under review) / Not sure), message.
- Submit label: **Submit Inquiry**
- **Confirmation:** "Your inquiry was received." · "Reference: {ref}" · "This is an inquiry — it doesn't create an account or approve anything." · "Next: someone from our team will contact you at {email}. We don't promise a response time." · email line per C-041
- `/practices/referrals` H1: "How referrals work" — flow text from `09_PRACTICE_MODEL.md` Model A in plain language; FAQ: "Do my clients pay to sign up?" ⟦C-021⟧ · "Can I see what my clients order?" ⟦D-10⟧ · "Do I earn commission on Care?" "No."
- `/practices/workspace` H1: "Your practice workspace" — what you see (D-10 table in plain words), staff roles (Owner, Admin, Billing contact), "What it doesn't do". Buttons: Sign In · (not yet approved) Submit Inquiry. If workspace pages are not yet mounted: "The practice workspace is opening to approved practices. Until then, your partner dashboard shows your referrals and commission."
- `/practices/care` H1: "Care for your clients" — Model C in plain words; "Who decides: our clinician." "Who follows up: our clinician, for anything they prescribe. You keep coaching." "What you see: only what your client chooses to share with you." ⟦Q-04⟧

## 9. Partners (`/partners`)

- H1: "Become a Xenios partner"
- Sub: "For creators, coaches and professionals who want to recommend Xenios and earn commission on eligible orders."
- Two paths:
  - **Referral partner** — steps: Apply → we review → agreement → activate your account → training and your link → track referrals and commission.
  - **Strategic partnership** — "Distribution, technology, education or other business relationships." → **Submit Inquiry**
- Program-closed state (current): "Partner applications open soon. Tell us you're interested and we'll contact you when they do." → **Submit Inquiry** (inquiry type "Partner program interest").
- Program-open state: **Apply** → `/partners/apply` (requires the application authority to be enabled).
- "Already approved?" → **Activate Account** (first time) / **Sign In**.
- Disclosure line: ⟦C-042⟧ "Partners must clearly disclose their relationship with Xenios."
- Remove the name "Research Rep" from public copy.

## 10. Suppliers (`/suppliers`)

- H1: "Supply or fulfil with Xenios"
- Sub: "For pharmacies, labs, manufacturers, distributors, diagnostic providers and fulfilment companies."
- "How it works: 1. Submit an inquiry. 2. We review your documentation, quality and capacity. 3. If there's a fit, we invite you to a restricted supplier workspace."
- "Supplier access is by invitation, after we review your documentation." (C-037)
- **Submit Inquiry** (supplier form) · "Questions?" → Contact Support
- Confirmation: as practice confirmation, with "This is an inquiry — it doesn't create supplier access."

## 11. Careers, Sign In, Activation, Status, Support, Quality, FAQ, About, Admin

- **Careers** H1: "Work with Xenios" · roles list · role page button **Apply** · if mailto (H-01 fallback): button "Apply by email" with line "We'll reply by email if there's a fit." · confirmation (form version): "Your application was received. Reference {ref}. We'll email you if we'd like to talk."
- **Sign In** H1: "Sign in" · form (email, password) · "Forgot your password?" · "Approved but haven't set up your account? **Activate Account**" · "Care patients: your clinical account is separate — use the secure link your Care team sent you." · "New here? **Start Care** or **Explore Products**." · Error: "That email and password don't match. Try again or reset your password." · Locked/unknown: no account enumeration.
- **Activate Account** H1: "Activate your account" · valid link: set password → "Your account is active." → Sign In / Open my account · invalid/expired: "This activation link has expired or was already used. **Contact Support** and we'll send a new one." (existing claim authority decides; never reveals whether an email exists)
- **Check Status** H1: "Check status" · "Order or request reference" + "Email you used" → **Check Status** · not found: "We couldn't find that reference with that email. Check the reference in your confirmation email, or **Contact Support**." · Signed-in shortcut: "Signed in? See all your orders in your account." · Care note: "Care requests: our Care team updates you directly by the contact method you chose." ⟦Q-13⟧
- **Support** H1: "How can we help?" · cards: "An order" → Check Status / Contact Support · "Care" → Care support form · "My account" → Sign In / reset password · "A business question" → Submit Inquiry (practice/partner/supplier) · general form (existing contact route) submit label "Send message" (§12) · confirmation: "Your message was received. We don't promise a response time." + reference once durable (N-12).
- **Quality** H1: "Quality and documentation" · "Every lot has a record." ⟦C-009⟧ · lot lookup "Look up a lot" · "What we publish and what we don't" (no third-party testing claim until C-008) · Research-use note.
- **FAQ** H1: "Questions" — groups: Care · Research products · Orders and payment · Practices · Partners · Accounts. Uses §3 answers plus: "How do I pay?" "After we confirm your order, we email payment details. We verify every payment by hand." · "Do you ship everywhere?" ⟦ops⟧ omit until verified.
- **About** H1: "About Xenios" · "Xenios Technologies, Inc. builds technology for proactive health: clinician-guided Care, research products, and tools for the professionals who support people's health." · workspace mention → `/workspace` · ⟦D-01/D-02 brand architecture sentence only after decision⟧.
- **Admin** (unchanged page) H1: "Secure operations access" · Sign In · no public links.

## 12. Submit-button rule

Navigation CTAs use §1 labels. A form's own submit button may name its object when §1 has no exact match: "Send Care request", "Send message". Everything else: Request Order, Submit Inquiry, Apply, Sign In, Activate Account, Check Status.

## 13. Status vocabulary (customer-facing)

Assisted order statuses (15 internal → 7 customer labels):

| Internal | Customer label | Line |
| --- | --- | --- |
| submitted, reviewing | **Received** | "We're confirming availability." |
| waiting_on_customer, identity_requested, agreements_pending | **Action needed** | "{specific action from server}" + Continue Order |
| identity_received, agreements_complete | **In review** | "We're checking what you sent." |
| payment_pending | **Awaiting payment** | "Use the payment details we emailed." + Continue Order |
| payment_review | **Verifying payment** | "We verify every payment by hand." |
| paid, supplier_processing | **Preparing your order** | "Your payment is confirmed." |
| shipped | **Shipped** | "Tracking: {link}" |
| delivered | **Delivered** | — |
| closed | **Closed** | "This order is complete." |
| cancelled | **Cancelled** | "Contact Support if this is unexpected." |

Care request (operator-driven, communicated by the Care team): Received → Under review → We've contacted you → Secure visit available → Closed / Not available in your state.

Practice / partner: see `09_PRACTICE_MODEL.md` lifecycle table.

## 14. Generic states

- Loading: "Loading…" with skeleton; never a blank screen > 1s without a spinner.
- Network error: "Something went wrong on our side. Nothing was sent. Try again." (only when nothing was sent)
- Uncertain submission: "We're not sure this went through…" (as Care) — never claim success or failure without the server's answer.
- Duplicate submit: button disabled after first click; "Sending…"; retries reuse the same idempotency key (existing contact behaviour).
- Unavailable feature: "{Feature} isn't available right now." + one alternative action. Never a password wall on a public link.
