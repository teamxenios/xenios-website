# Claude independent findings: frozen runtime `c213707` (tree `09cbd1d2`)

Reviewed at `8e0271e9c03d7724df9437e8723aac2edc9afcb7` (application bytes identical to `c213707`).

Method: static composed-contract tracing, from mounted route to service to SQL, by Claude and by four read-only
Claude sub-reviewers. **Every finding below was re-verified by Claude at the cited lines before it was recorded.**
Sub-reviewer claims that did not survive re-verification are listed separately at the end.

Other evidence:
- Focused composed tests on Node 20.19.0: `server/research/assisted-order`, `server/research/early-access/routes`
  and `server/research/early-access/cart`, 62 files and 806 tests passed. These run on in-memory stores, not the
  managed database.
- Browser: the real client bundle served by the repository's own `scripts/preview-early-access.ts`, which is a
  synthetic fixture and not live fulfillment.

No hosted system was read or mutated. The `supabase-xenios-prod` connector failed to authenticate (401) in this
session, so every production env and applied-state question is **UNKNOWN** unless a repository record says otherwise.

Severity key:
- **P0**: money, authorization or privacy failure.
- **P1**: launch goal blocked or seriously misleading.
- **P2**: significant correctness or UX problem.
- **P3**: minor.

---

> **Lane status:** the Early Access cart lane is recorded disabled in production (`RESEARCH_EARLY_ACCESS_CART_ENABLED=false`, `docs/revenue-launch/20260905/production-refresh-20260906.json`). HL-02, HL-03, HL-05 and HL-06 are activation blockers for that lane, not failures users hit today. HL-05 and HL-06 were re-verified by Claude: `settlement.ts:246-247` sets the verified amount from the invoice; the only cart `payment_state` writers are `20260808100000...cart_completion.sql:377-382` (to `under_review`) and `:619` (to `payment_verified`).

## HL-01 · P1 · A newcomer cannot discover or reach the full catalog

- **Seam:**
  - `client/src/clarity/pages.tsx:98-123` (`ProductsPage`) and `:125-138` (`ProductUnavailablePage`)
  - `client/src/App.tsx:196-197` and `:242` (`/health` redirects to `/`)
  - `/sign-in` "New here?" links
  - `/research/early-access` password wall
- **Trigger:** a first-time visitor follows Health, then Explore Products.
- **Reproduced:** browser, real client bundle, 2026-09-30.
  1. `/health` lands on `/`, whose dominant actions are Start Care and Explore Products.
  2. `/products` has "Check Status" as its primary action. Its "Explore Research Products" tile links back to
     `/products`. The list section says "We're preparing our public product list. Existing customers can Sign In to
     see the full catalog."
  3. `/sign-in` offers "New here? Start Care · Explore Products", which leads back to `/products`.
  4. `/research` describes "Choose the exact research product and size in the supported ordering flow" but links
     only to `/products` and `/status`.
  5. The real ordering flow is `/research/early-access`. Its "All products" section is at
     `client/src/research/early-access/EarlyAccessRoute.tsx:574-599`, backed by
     `/api/research/early-access/assisted-orders/catalog`, with server-side search, family and action filters and
     pages of 24. No public page links to it:
     - Navbar, Home, `/individuals`, `/research` and `/products` all point to `/products`.
     - `/research/access-hub` redirects to `/` (`App.tsx:258`).
     - In the local harness it appears "INVITATION ONLY" behind a password. That is the harness's own config.
       Production open access was set to `RESEARCH_EARLY_ACCESS_OPEN_ACCESS=true` on 2026-08-20
       (`docs/research-launch/DEPLOY_RECORD_2026-08-20_OPEN_ACCESS.md:15`), and the bridge is recorded as enabled
       (`production-refresh-20260906.json` `booleanConfiguration`). Neither value has been re-observed since, so
       current production reachability is UNKNOWN.
  6. Every `/products/:slug` renders "We couldn't find that product." Product detail exists only for signed-in
     members at `/research/member/catalog/:family/:slug`.
  7. "Existing customers can Sign In to see the full catalog" does not help a newcomer. Sign-in is for existing
     accounts only, and activation needs an emailed approval link.
- **Expected:** a newcomer can see the full canonical intended catalog, with exact variants, prices and holds, and
  a truthful next action for each eligible item.
- **Actual:** a closed loop with no catalog, no search, no product detail, and no route to request access or an
  order.
- **Consequence:** the Health launch goal cannot be met at `c213707` for anyone who is not already invited.
- **Smallest safe correction (Codex, slice 1-2):**
  - **Minimum:** make `/products` and the "Explore Research Products" tile lead to the existing server-projected
    full catalog at `/research/early-access`. Replace the false "Sign In to see the full catalog" sentence. Remove the
    self-link and the Check Status primary action.
  - **Complete:** render the same projection (the same price authority, holds and Care routing) on `/products`, and
    mount `/products/:slug` over it.
  - Newcomers get one dominant action: submit an assisted order request.
  - Verify production open access and bridge flags read-only before relying on either path.

## HL-02 · P2 · A paid cart order can get stuck if the customer uploads a *different* proof after a failed send

- **Seam:**
  - `supabase/migrations/20260809130000_research_early_access_hardening.sql:545-563`: the claim is
    `on conflict (cart_checkout_id)`, so there is one submission per checkout. A different `submission_key` returns
    `submission_exists` with no `row`.
  - `server/research/early-access/proof/supabase-submission-store.ts:135`: throws when `row` is missing, which
    surfaces as 503 "try again".
  - `submission-record.ts:130-139`: the submission id is derived from the checkout, the proof SHA-256 and the method.
  - `customer-view.ts:79`: `retryAllowed` is true for `failed`/`unknown`.
  - Settlement at `hardening.sql:720-726` refuses `failed` (`submission_missing`) and `unknown`
    (`submission_unreconciled`). This is still the latest base settlement; the `20260819170000` commission wrapper
    calls it.
  - Nothing writes `reconciled_at`.
- **Trigger:**
  1. The first proof's internal email is `failed`, or `unknown` after a timeout.
  2. The UI offers a retry.
  3. The customer uploads a clearer screenshot, or picks a different method.
- **Expected:** the retry replaces the failed submission, or an operator can reconcile it.
- **Actual:** every retry returns 503. Settlement stays refused. Re-uploading the *identical* file does replay and
  re-send (`submission-service.ts:290-304`), but nothing tells the customer that.
- **Test gap:** the in-memory store keys rows by submission id (`proof/memory-store.ts:40-41`), not by checkout, so
  the unit suite cannot reproduce the SQL behaviour.
- **Consequence:** a customer who has paid cannot be verified or shipped without manual database work.
- **Why P2, not P1:** this is a liveness failure (a stuck order), not wrong money, and the same-file retry does
  recover it.
- **Smallest safe correction:**
  - Allow replacement when the existing row is `failed`, or `unknown` with no provider message id.
  - Add an admin-only reconcile command.
  - Return a distinct non-503 code for `submission_exists`.
  - Make the memory store key by checkout to match SQL.

## HL-03 · P2 · The cart supplier outbox payload carries customer contact and retail economics (dormant)

- **Seam:** `supabase/migrations/20260808100000_research_early_access_cart_completion.sql:567-589`. The payload
  includes `'contact', v_checkout.record->'contact'` and `'items', jsonb_agg(record)`, where each record is
  `EarlyAccessCartChildOrder` (`shared/research/early-access-cart.ts:145-157`): `unitPriceCents`, `subtotalCents`,
  `discountCents` and `payableCents`.
- **Trigger:** every cart settlement writes a row.
- **Current state:** no server code reads `research_early_access_cart_supplier_outbox`. A grep of `server/` finds no
  reader. So nothing is sent today.
- **Consequence:** the first worker that forwards the payload would leak discount/referral evidence and the customer
  email to suppliers. That becomes **P0** at activation.
- **Smallest safe correction:**
  - Rebuild the payload from an explicit allowlist in a forward migration: order number, supplier SKU, quantity,
    ship-to. This mirrors `server/research/commerce/supplier-release.ts:49-81`.
  - Clean existing rows.
  - Block any worker until that migration is in place.

## HL-04 · P2 · Payment-proof and overdue-shipment operator mail goes to a hard-coded `research@`, not the founder resolver

- **Seam:**
  - `server/research/early-access/hardening-contract.ts:373-374` sets
    `EARLY_ACCESS_INTERNAL_RECIPIENT = "research@xeniostechnology.com"`, marked "Not configurable". It is used by
    the proof email, the settlement gate record and the shipping SLA alerts.
  - `server/services/email-config.ts:34-41`: `adminRecipients()` falls back to `samuel@xeniostechnology.com` and is
    used by other alerts.
- **Expected (prompt 10 §5 and 11):** `samuel@xeniostechnology.com` is the verified founder and operational
  recipient, resolved through the actual configuration contract.
- **Actual:** the two most launch-critical operator obligations, "a customer submitted payment proof" and "an order
  is overdue", bypass the resolver.
- **Production values:** `ADMIN_EMAIL`, `ADMIN_EMAILS` and `RESEARCH_NOTIFICATION_EMAILS` in production are UNKNOWN.
- **Grading:** P1 if research@ is not monitored by Samuel. Its routing is unknown.
- **Smallest safe correction:** either (a) a mail-admin alias research@ → samuel@ (no code change), with a delivery
  receipt, or (b) a founder-approved code change to resolve through the configuration contract.
- **Settlement coupling:** the settlement gate checks that exact recipient, so option (b) needs a matching SQL review.

## HL-05 · P2 · Cart settlement "verified amount" is the invoice total, not an observed amount

- **Seam:**
  - `server/research/early-access/cart/settlement.ts:246-250` sets
    `verifiedAmountCents = checkout.invoice.payableTotalCents`. The operator only ticks two booleans.
  - The SQL `amount_mismatch` check (`...cart_completion.sql:500-504`) therefore can never fire.
  - The per-order lane does compare an observed amount (`early-access/routes/admin-routes.ts:428-438`).
- **Consequence:** an underpayment settles on a checkbox, and the customer's "amount verified" receipt restates the
  invoice total.
- **Smallest safe correction:** require the observed `verifiedAmountCents` and `verifiedCurrency` in the
  confirm-payment body and pass them through.

## HL-06 · P2 · Cart lane has no reject or cancel transition

- **Seam:** `payment_rejected` is allowed by the CHECK constraint (`20260807193000...:25`), but no RPC or route
  writes it. The only disposition writer is the one-off `duplicate_superseded` migration.
- **Trigger:** a bad proof, underpayment or an abandoned order.
- **Actual:** the checkout stays `awaiting_payment`/`under_review` indefinitely, with no customer notice and no way
  to leave the queues.
- **Smallest safe correction:** an admin-only disposition RPC with compare-and-set on `payment_state`, refusing once
  settled, plus a guarded admin door and a customer notice.

## HL-07 · P2 · No supplier-facing queue is mounted

- **Seam:**
  - `registerFulfillmentRoutes` (`server/research/fulfillment/register.ts:205`) has no caller in `server/`.
  - Supplier operations are admin-operated only.
  - The per-order packet door (`early-access/routes/admin-routes.ts:838`) takes per-order numbers only, so cart
    orders have no packet door.
- **Consequence:** prompt 10 §6 (a supplier's own verified-paid, eligible, assigned queue) does not exist at
  `c213707`. Supplier isolation is proven only in unmounted source.
  - The unmounted engine's design scopes correctly by server-resolved supplier and requires paid status
    (`fulfillment/service.ts:155-158,305-313`; `20260728010000...sql:443-448,499`).
  - It still lists the address and phone on cancelled assignments (P3).
- **Disposition:** GAP, not a leak.

## HL-08 · P2 · Organization-only accounts: server mounted over unapplied schema; no browser journey

- **Seam:**
  - `server/index.ts:415` mounts `registerProductionAccountIdentityApi`.
  - The organization tables exist only in `supabase/pack02-candidates/20260812_research_account_organizations.sql`,
    not in `migrations/`, and the production state record does not list them.
  - The client org routes are not mounted (`client/src/research/section.tsx:61-64`).
  - `SignIn` routes only by member row.
  - The initial-password flag can never clear: `account-identity/production-mount.ts:17-24` always returns `null`
    evidence, so `completePasswordChange` returns 428 forever (`service.ts:437-464`).
- **Consequence:** an org-only user who signs in gets "customer access could not be verified". If Pack02 is applied
  later with the default flag, bound org users are permanently locked out.
- **Latent risks (review before Pack02 is applied):**
  - An org admin can invite `organization_owner`, because there is no role ceiling (`service.ts:365-393`).
  - The password evidence source is still missing.

## HL-09 · P3 · Admin authority is an env email-string match on the server, with no confirmed-email or user-id pin

- **Seam:** `server/routes.ts:128-150`. The server compares `getUser().email` to `ADMIN_EMAIL`. The browser only asks
  `/api/admin/me`, and no client email check was found.
- **Passes:**
  - Recovery-purpose sessions are denied before the comparison (`routes.ts:139-141`; `member-auth.ts:71-80`).
  - There is no "Approve All". Approvals, payment verification and clinical commands are separate guarded routes.
- **Missing:** `email_confirmed_at` is not required, and there is no pinned auth user id.
- **Exposure:** depends on project signup and OAuth-linking settings, which are UNKNOWN.
- **Correction:** require a confirmed email plus a pinned `ADMIN_AUTH_USER_ID` or a role table.

## HL-10 · P3 · `scripts/preview-early-access.ts` harness has drifted from production composition

- **Actual:**
  - `/api/research/early-access/cart/capability` returns 404.
  - `/api/research/early-access/assisted-orders/config` returns the SPA HTML fallback, because the bridge is not
    mounted.
  - No agreement is configured, so the client correctly fails closed with "unreadable agreement identity".
  - It shows only the 22 featured items, all held.
- **Consequence:** reviewers using the repository's own browser harness cannot observe the production storefront,
  the assisted-order path or the full catalog.
- **Correction:** compose the harness from the same composition functions as `server/index.ts`.

## HL-11 · P1 · The served catalog predates the founder's 2026-08-21 decisions (420 served versus 424 decided)

- **Seam:**
  - `server/research/master-offerings/data/member-safe-master-offerings.generated.json`: `generatedAt`
    `2026-08-15T04:10:09Z`, `sourceRowCount`, `canonicalProductCount` and `variantCount` all 420. States:
    244 `care_pathway`, 144 `request_access`, 32 `approval_required`.
  - `config/research/master-catalog-reconciliation-20260821.json` `expected`: `sourceRows` 426,
    `canonicalVariants` 424, with a founder `priceDecision` dated 2026-08-21.
- **Verified by name against the served dataset:**
  - Absent: Retatrutide 60 mg, MOTS-C 40 mg and Glutathione 600 mg.
  - Still `approval_required` rather than the decided research-use rows: Hexarelin 5 mg and Oxytocin 10 mg.
- **Counts are not interchangeable:**

  | Count | Source |
  | --- | --- |
  | 426 | historical workbook rows |
  | 424 | founder-decided canonical variants |
  | 420 | served |
  | 22 | featured seed (`founder-first-release-seed.ts`) |
  | 513 | `docs/production-completion/catalog/catalog-reconciliation.json`, a dry-run superset, not runtime |

- **Consequence:** the "full canonical intended catalog" is not what is served. Two decided research-use prices may
  not be the ones shown.
- **Price authority:** live Product Control `member` rows. Their current production values are UNKNOWN.
- **Smallest safe correction:**
  - Regenerate the dataset and bindings with `scripts/research/build-master-offerings-from-catalog.ts` from the
    reconciled source.
  - Commit the generated artifact with its source hash.
  - Publish only founder-approved price rows through the existing Product Control authority.
  - Read back.
  - Retatrutide rows need an explicit founder eligibility decision; the pack notes a human-use procurement exclusion.

## HL-12 · P1 · The only live purchase path has no server-bound quote total or payment identity

- **Seam:**
  - Assisted-order bridge (`server/index.ts:1000-1011`). The cart is recorded disabled
    (`RESEARCH_EARLY_ACCESS_CART_ENABLED=false`) and direct commerce is off.
  - `server/research/assisted-order/service.ts:187-221`: `paid` requires only a non-empty `paymentVerificationId`
    string, and `agreements_complete` only a non-empty `agreementAttestationId`.
  - The SQL twin is `20260815150000_research_assisted_order_bridge.sql:916-938`, which does the same `btrim`
    non-empty check.
  - The quote and payment services (`assisted-order/quote/service.ts`, `payment/service.ts`, `conversion/gate.ts`)
    are referenced by no production composition.
  - Admins move requests to `payment_pending` with free-text instructions (`service.ts:78-101`).
- **What the prompt requires:** server totals, immutable sold-price and payment identities, and pending versus
  reported versus verified payment.
- **Actual:** the request carries a server-computed estimate (`service.ts:377,476`). No quote amount is recorded
  before payment instructions are sent. No verified amount or currency is recorded at `paid`. The verification id
  and attestation id reference nothing.
- **Consequence:**
  - An operator typo or a wrong amount is undetectable.
  - A "price on request" line gets an arbitrary price.
  - Nothing reconciles what was paid with what was sold.
- **SQL evidence (Claude, 2026-09-30, disposable Supabase PG 17.6, `sql/hl12_probe.sql`):**
  - `paid` ACCEPTED for arbitrary text, a 1¢ amount, EUR, a free-text actor, and one verification id reused on two orders.
  - `paid` → `cancelled` ACCEPTED without refund evidence.
  - Exact replay was REFUSED (compare-and-set).
  - `set_status` is `service_role`-only.
  - No amount column exists.
  - This confirms HL-12 on the mounted SQL, not only the in-memory service.
- **Smallest safe correction:**
  - Before `payment_pending`, persist a quote whose total equals the server-priced lines, with explicit operator
    pricing only for request-pricing lines, audited.
  - At `paid`, require the observed amount and currency, and a reference to a verification record, checked against
    the quote in SQL.
  - Reuse the existing quote and payment services rather than new code.

## HL-13 · P2 · Care (503A) rows display a retail price in the research catalog

- **Seam:**
  - `shared/research/assisted-order/action-policy.ts:155` passes `unitPriceCents` through for every path.
  - `client/src/research/assisted-order/AssistedOrderPage.tsx:198` renders `Price` on every card, including
    `provider_request` (Care) cards.
  - `shared/research/early-access/customer-pathway.ts:101` documents 242 priced Care rows.
- **What still works:** submit correctly refuses Care rows server-side (`service.ts:445-452`), and the card routes to
  `/care`.
- **Consequence:** clinical formulations appear with a retail price inside a research-use storefront, which implies a
  purchasable clinical price the provider has not set.
- **Correction:** null the price for `provider_request` in the projection, and show "Priced by your Care provider".

## HL-14 · P2 · The Superpower diagnostics offer is admin-configurable to available, priced and affiliate-linked

- **Seam:**
  - `server/research/products-diagnostics/diagnostics.ts:13-80` (`SuperpowerOfferConfig`: `priceCents`, `status`,
    `affiliate`).
  - Routes at `products-diagnostics/routes.ts:88-90` and the admin write door.
  - Member page `/research/member/diagnostics`.
  - The default is `coming_soon` with no price.
- **Why it matters:** per prompts 10 and 11 (latest direction), Superpower resale, API and brand rights are
  unapproved. Today an admin form change, not reviewed source, would publish it.
- **Correction:** refuse `available`, a price and an affiliate URL server-side until an approval record exists, or
  remove the member route. It must not become a launch dependency.

## HL-15 · P2 · Order-request contact step does not identify invalid fields

- **Seam:** the Early Access assisted-order contact step (`client/src/research/assisted-order/AssistedOrderPage.tsx`).
- **Reproduced:** browser, J7 in `02_BROWSER_JOURNEYS_c213707.md`.
- **Actual:** pressing Continue with empty required fields shows one generic alert: "Complete all required contact
  and shipping fields." No field gets `aria-invalid`, no field is named, and focus stays on `BODY`.
- **Expected:** WCAG 3.3.1 and 3.3.3. Each invalid field is marked and described, and focus moves to the first
  invalid field or to an error summary that links to the fields.
- **Consequence:** keyboard and screen-reader users cannot find what is missing. This is the only live purchase path.
- **Correction:** add per-field error text with `aria-describedby` and `aria-invalid`, and focus the first
  invalid field.

## HL-16 · P3 · Focus falls to `BODY` on each step change and after submit

- **Actual:** the step changes (1 to 2, 2 to 3, and submit to confirmation) leave focus on `BODY`. They are
  announced through `role=status`, which partly mitigates this.
- **Correction:** focus each step heading, or the confirmation `h1`.

## HL-17 · P2 · Research shell "Research" and "Get access" links go to a route that redirects home

- **Seam:**
  - `client/src/App.tsx:258` redirects `/research/access-hub` to `/`.
  - Linked from `client/src/lib/nav.ts:75` ("Get access"), `research/lib/routes.ts:11`,
    `research/account/AccountSignIn.tsx:64` ("View all access options") and the research shell navigation seen
    on the confirmation and status pages.
- **Consequence:** a customer inside the ordering journey who presses "Research" or "Get access" leaves the
  journey for home. This adds to the HL-01 loop.
- **Correction:** point these links to the real ordering entry, or remove them.

## HL-18 / HL-19 / HL-20 · pricing

See `04_PRICING_ACCEPTANCE.md`:

- **HL-18 (P2):** the rounding contract is inconsistent. Stored cents are half-up via float `Math.round`, the book display rounds half-even, and GRP-0348 is a float artifact. 17 rows need founder confirmation.
- **HL-19 (P3):** the FedEx shipping line is served as a `care_pathway` catalog variant.
- **HL-20 (P2):** the 3-unit bundle discount is applied on the Featured legacy path but not on the All products assisted estimate, and the copy promises it for assisted requests.

## Additional P3 notes (verified)

- `/individuals` says "No public price is shown" (`client/src/clarity/pages.tsx:83`), but the catalog projection
  shows prices to anyone who reaches it.
- Enabling the cart (`RESEARCH_EARLY_ACCESS_CART_ENABLED=true`) hides the full catalog and shows only the 22
  featured items (`EarlyAccessCartMount.tsx:52,77`; `EarlyAccessRoute.tsx:470`). This is not live, but it is one
  switch away.

- The assisted-order member-history RPC `research_assisted_order_customer_status`:
  - It is called fail-closed by `assisted-order/supabase-repository.ts:319`.
  - It exists only in `supabase/candidates/20260921_research_assisted_order_member_history.sql`.
  - The DAG records that managed production history holds `20260921172323 research_assisted_order_member_history`
    (`docs/coordination/MIGRATION_DAG.json:805`).
  - It is therefore likely applied. This is repository hygiene: promote it, or record its applied bytes.
- The approved-customer claim `supabase/candidates/20260905_research_approved_customer_access.sql` is recorded as
  applied in production (`docs/coordination/CURRENT_PRODUCTION_STATE.json:480`).

## Sub-reviewer claims not accepted after re-verification

- **"Approved customers can purchase without accepting a legal version" (proposed P1).** Rejected for purchase.
  - Native checkout enforces `agreement_required` (`server/research/commerce/checkout.ts:359`).
  - The Early Access cart settlement requires a current attestation that matches the current package version
    (`hardening.sql:713-719`).
  - What remains: member-platform agreement definitions are `0.1.0-draft`, and the claim RPC activates without an
    agreement. That is recorded as a P3 policy gap, not a purchase bypass.
- **"Assisted-order customer status is 5xx in production" (proposed P1).** Downgraded to the hygiene note above,
  because managed history records the migration.
- **"Organization password lockout P1".** Recorded inside HL-08 as latent, because the schema is not applied.

- **"Production open access = true" as a current fact.** Recorded only as the 2026-08-20 deploy change. The
  2026-09-06 refresh lists the key without a value. Treated as UNKNOWN now.

## Items not dispositioned

- **Source audit against the latest direction (packages and automation):** no package prices, guaranteed
  prescriptions, coaching packages, or Research-to-human-use shortcuts were found at `c213707`. The only unapproved
  surface is HL-14. Prescription language is disclaimers only. Proposed package and automation *additions* from files
  17 and 18 are **NOT RUN**: no successor source exists yet, and the pack files are not mounted.
- **Real responsive browser journeys** for signed-in, paid and returning customers are **BLOCKED locally**: there is no
  faithful composition without Supabase, see HL-10. Managed staging is not authorized.
