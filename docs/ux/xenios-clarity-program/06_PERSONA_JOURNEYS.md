# 06 — Persona journeys

13 personas. Each journey: goal → entry → target steps → what they must understand → success → failure/edge states → where it breaks today (CUX ids) → UAT ids.

## J-01 First-time consumer seeking Care

- **Goal:** get clinician-guided help. **Entry:** `/` (search, referral, word of mouth).
- **Steps:** Home hero → **Start Care** → `/care/schedule` → fill routing fields, acknowledge "not a medical intake" → **Send Care request** → confirmation (CARE-ref, contact method echoed) → email copy → Care team contacts → secure clinical system → clinician decides.
- **Must understand:** this isn't a medical intake; a person contacts them next; a clinician decides; it's free to request; Research purchases don't unlock Care.
- **Success:** reference on screen; knows who contacts them and how.
- **Edge states:** Care paused (closed line + Contact Support); network timeout (uncertain copy, don't resend); duplicate click (disabled button); back button after submit (confirmation persists, no resubmit); closes tab (email copy + reference).
- **Breaks today:** CUX-01 (not on root), CUX-05 (unverified claims), CUX-02. **UAT:** U-001, U-030..U-036.

## J-02 First-time consumer wanting a research product

- **Goal:** find a product, know price, order. **Entry:** `/` or `/products`.
- **Steps:** **Explore Products** → card (name, variant, badge, price/price state) → product page → **Request Order** → order request (prefilled) → research-use acknowledgment → submit → confirmation (XRR-ref, "no payment taken") → quote + payment details email → pays → "Verifying payment" → "Preparing your order" → "Shipped" + tracking.
- **Must understand:** research use only, no clinical review, payment verified by hand, where status lives.
- **Edge states:** Care-only product (Start Care instead); unavailable (not listed / unavailable page); price pending ("confirmed in your quote"); product API down (pathway tiles only); wrong reference on status.
- **Breaks today:** CUX-03, CUX-04, CUX-10, CUX-11. **UAT:** U-020..U-024, U-040..U-047.

## J-03 Returning customer

- **Goal:** see order status / documents / support after closing the tab.
- **Steps:** header **Sign In** → account → orders → order detail; or **Check Status** with reference + email; or Support.
- **Must understand:** one Sign In for everything except Care's secure clinical account.
- **Edge states:** forgot password (neutral reset); never activated (Activate Account link); reference but no account (Check Status); Care patient (secure link note).
- **Breaks today:** CUX-12 (dead ends), production lacks chooser (AUD-003). **UAT:** U-080..U-094.

## J-04 Practice owner — Stephen Toth (Compass)

- **Goal:** decide whether and how Compass works with Xenios; protect his license and his clients.
- **Steps:** `/` → **For Practices** → reads 3 models, client ownership, what practice account doesn't do, commission (structural), Care for clients → (optionally) sub-pages → **Submit Inquiry** (type: Refer clients; practice type: coaching + medical provider) → confirmation ("inquiry, not an account") → qualification contact + Samuel's questionnaire → agreement → approval → **Activate Account** → workspace (referral link/code, resources) → shares link with a client → sees referral counts and commission.
- **Must understand:** the 15 questions in `STEPHEN_COMPASS_CASE_STUDY.md`.
- **Edge states:** inquiry send uncertain (don't resend; email copy); program not yet active (activation explains next step); he asks for parent-account ordering (page already says no and why).
- **Breaks today:** CUX-06, CUX-07, CUX-08, CUX-01. **UAT:** U-060..U-066.

## J-05 Practice staff member

- **Goal:** help the practice track referrals.
- **Steps:** receives invitation from owner → accepts → sets password → sees role-limited workspace.
- **Must understand:** role limits; no client ordering.
- **Status:** NEAR (org pages unmounted). Until then: not offered publicly beyond `/practices/workspace` description. **UAT:** U-067 (future).

## J-06 Behavioral-health / retreat practitioner — Tammy Brannen

- **Goal:** cross-refer clients; understand formats and support for clients.
- **Steps:** same as J-04; reads Care for your clients; product pages show format (C-017) and "no dosing instructions" line.
- **Must understand:** Care vs Research; no premixed-format promise; retreat/program collaboration is future (Model E).
- **UAT:** U-062, U-066.

## J-07 Practice-referred client

- **Goal:** follow their coach's recommendation.
- **Steps:** opens practice link (`/r/:code` when V1 enabled, else code typed at order) → neutral landing "An introduction from {practice}" → chooses **Explore Products** or **Start Care** → own account/order → accepts research-use terms personally → optional consent to share name/order status with practice (future, D-10).
- **Must understand:** they own the account; the practice doesn't see Care info; practice can't order for them.
- **Edge states:** V1 off → link falls back to Home with no error; invalid code → "We couldn't match that code — you can still continue" (never blocks ordering).
- **UAT:** U-068, U-069.

## J-08 Affiliate / referral partner

- **Goal:** join the program.
- **Steps:** `/` → **Become a Partner** → program closed: **Submit Inquiry** ("Partner program interest") → confirmation; program open: **Apply** → sign in/create account → application → confirmation → review → agreement/tax/payout/training → **Activate Account** → dashboard, links, resources, commissions, payouts.
- **Must understand:** inquiry vs application vs activation vs sign-in (four different buttons).
- **Breaks today:** CUX-07 (password wall, "Research Rep"), UX doc P1-01. **UAT:** U-070..U-074.

## J-09 Strategic partner (Seth-type)

- **Goal:** start a business relationship.
- **Steps:** **Partners** → Strategic partnerships → **Submit Inquiry** → confirmation "doesn't create an account" → founder queue → call.
- **Must understand:** this is not an account request; if an account is needed, Xenios sends an activation email later.
- **Breaks today:** Seth's episode (UX doc tab 09). **UAT:** U-075.

## J-10 Supplier / lab / pharmacy / fulfilment

- **Steps:** footer or selector → `/suppliers` → **Submit Inquiry** → confirmation "doesn't create supplier access" → review → invitation.
- **Breaks today:** CUX-08. **UAT:** U-076.

## J-11 Job candidate

- **Steps:** **Careers** → role → **Apply** → confirmation (Phase 2) / "Apply by email" (fallback).
- **Breaks today:** CUX-16. **UAT:** U-077.

## J-12 Founder / admin (Samuel)

- **Steps:** `/admin` or **Sign In** → server verifies `ADMIN_EMAIL` → command center → lanes: Care requests, assisted orders, payment review, business inquiries (new), partner applications, career applications (new), exceptions.
- **Must understand:** every inbound obligation appears as a lane item with owner and due date.
- **Edge states:** recovery session denied; non-admin denied; no client-side admin detection.
- **UAT:** U-100..U-104.

## J-13 Operator / COO (Seth)

- **Goal:** work queues without Samuel explaining the site to customers.
- **Steps:** admin (if authorized by the same server guard; current guard is single-email — adding operators is out of scope and requires a separate authority decision) → queues → status updates that customers see with the same vocabulary.
- **Must understand:** customer labels map 1:1 to operator states (§13).
- **UAT:** U-105 (status vocabulary parity).
