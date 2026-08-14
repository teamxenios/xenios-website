# KRIS_LAUNCH_A founder actions (the exact go-live sequence)

The code release is FROZEN, TAGGED, DEPLOYED, and SMOKED:

- Frozen SHA / tag `KRIS_LAUNCH_A`: `322a1636063a6a95f66ea11e15664651a94d5ac3`
- Deployed: Render `xenios-website` (`srv-d8s9vej7uimc7384dfcg`), deploy
  `dep-d9v89npt0dsc73cgvo8g`, status live, deployed commit verified equal to the
  frozen SHA via the Render deploy object.
- Rollback SHA: `541b1049e3bee188ee2719f369e6513ae7123786` (push it back to
  `release/early-access-code-session-checkout` and trigger a deploy; no env change).

Everything below is deliberately OUTSIDE the code deploy: production database
authority and account activation. Each step is prepared to be run exactly as
written, in order. Steps 1, 2, 3 and 5 are Supabase SQL editor work (no direct
DSN exists on this machine or in the service env, by design). Nothing in the
deployed application needs a restart for any of them; every consumer reads live.

## 0. Identity re-read (read-only, MUST run first)

Run `supabase/pack02-candidates/inspect_kris_identity_read_only.sql` in the
Supabase SQL editor. It must still report NO_AUTHORITATIVE_KRIS_IDENTITY for
`info@romanhealthcollective.com`; any evidence of an existing identity means
STOP AND RECONCILE, never duplicate. (Tonight's service-role re-read already
found zero Auth users, zero applications, zero members for the exact email; the
customers table is only SQL-readable, which is what this step confirms.)

## 1. M67, the member order read (required for order history AND Buy Now)

Run in the Supabase SQL editor, one transaction, as written:

- File: `supabase/migrations/20260813120000_research_early_access_member_order_history.sql`

Rehearsed apply-twice on disposable PostgreSQL 16 and 17 by the integrator
(PASS, 12/12 behavioural assertions each pass; see the release evidence file).

It creates exactly two STABLE SECURITY DEFINER read routines
(`research_early_access_legal_bindings_for_member`,
`research_early_access_placements_for_customers`), EXECUTE for service_role
alone, no table grant anywhere, preflight fails closed if the M62 tables are
absent, and the in-transaction post-condition proves the boundary. It writes no
row. DAG node 28 / ledger row 67 record it as explicitly unapplied until you run
it. Until then: member order history reads fail honestly, and Buy Now stays
closed (the resolver cannot resolve the member's customer scope).

## 2. Activation schema, the sponsored B2B claim rail (mounted in the deployed app)

Run in the Supabase SQL editor, in this order:

- File: `supabase/pack02-candidates/20260813_research_b2b_buyer_bridge.sql`
- File: `supabase/pack02-candidates/20260813_research_b2b_sponsored_claim.sql`

Both are candidate-reviewed, collision-guarded (the buyer-bridge preflight
REFUSES to run if `research_organizations` has converged on an incompatible
shape), advisory-locked, immutability-triggered, and expiry-hardened (72h claim
expiry, exact-expiry refused, replay read-only). The old
`20260812_research_account_organizations.sql` is NOT part of this set; do not
run it. The founder-facts `20260813_research_business_buyer_bridge.sql` is also
NOT part of this set (its lane is inert in this release, and its finalize filter
carries a status-vocabulary bug: `status = 'active'` can never match the
customers table's INVITED/APPROVED/SUSPENDED/REVOKED constraint).

## 3. Prepare Kristopher's sponsored claim (you act as the admin)

In the Supabase SQL editor, one transaction. `auth.uid()` must resolve to YOUR
admin user (the RPC checks `research_prelaunch_role_assignments`), so set the
request claims first. Replace `<YOUR_ADMIN_AUTH_UID>` only.

The canonical narrative for this step is
`docs/pack02-roman-b2b-sponsored-claim-runbook.md` with the founder facts in
`supabase/pack02-candidates/roman_health_b2b_activation_input.json`; the SQL
below is that runbook made concrete.

```sql
begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<YOUR_ADMIN_AUTH_UID>', 'role', 'authenticated')::text,
  true
);
select * from public.research_prepare_sponsored_b2b_claim(
  'info@romanhealthcollective.com',
  'Kristopher',
  'Lopez',
  'USA',
  'Texas',
  'roman-health',
  'Roman Health',
  'Roman Health',
  array['organization_owner','business_buyer'],
  1,
  now(),
  'e7bc0b691ed813b5ce024f0026e8ab5ba64d74f4'
);
commit;
```

The pricing-evidence pin (`e7bc0b6…`, the 420/418/2 KRIS_VOLUME_PARTNER
artifact source) is checked by the claim chain; the founder facts file
`supabase/pack02-candidates/roman_health_b2b_activation_input.json` carries the
same identity. After this succeeds, the application enters
`approved_sponsored_b2b` and the app's outbox dispatches the claim email
(`b2b_buyer_claim` template) to the canonical address. Kristopher follows the
claim link and CHOOSES HIS OWN PASSWORD on the canonical ClaimAccount screen.
Nobody else ever handles a credential. If email delivery cannot be confirmed,
read the claim state from the admin outbox view and hand him the canonical link
out of band; do not create a parallel auth path.

## 4. Nothing to do here, by design

When Kristopher completes the claim, the activation RPC creates his
`research_members` row atomically with `access_basis = sponsored_b2b` (billing
gate bypassed for a sponsored buyer). Login, the 420-item KRIS_VOLUME_PARTNER
catalog, search/filter/detail, and every purchase-mode CTA are live for him at
that moment. Identity re-read evidence from tonight (service-role, read-only):
zero Auth users, zero applications, zero members for the exact email, matching
NO_AUTHORITATIVE_KRIS_IDENTITY; the customers table is not service-role
readable (by design), so step 5's script re-checks it inline and fails closed.

## 5. Roman's Early Access customer scope + the M62 ownership binding

After Kristopher's member exists (step 3 claim completed), run in the SQL
editor. It creates his APPROVED Early Access customer identity and the
admin-attested M62 legal binding that makes Roman's orders his own
(`customerRefsFor(memberId)` is exactly what Buy Now and order recovery read).
Replace nothing; it derives everything and REFUSES (with a clear error) if any
precondition fails.

```sql
begin;
do $$
declare
  v_member public.research_members%rowtype;
  v_customer_id text := 'eac-roman-health-kristopher-lopez';
  v_customer_ref text;
  v_email text := 'info@romanhealthcollective.com';
begin
  select * into v_member from public.research_members
   where lower(email) = v_email and status = 'active';
  if not found then
    raise exception 'no active member for %; complete the claim first', v_email;
  end if;
  if exists (select 1 from public.research_early_access_customers
              where normalized_email = v_email) then
    raise exception 'customer scope already exists for %; reconcile by hand', v_email;
  end if;
  v_customer_ref := 'eac_' || left(encode(extensions.digest(
    'early-access-customer-v1:' || v_customer_id, 'sha256'), 'hex'), 32);
  insert into public.research_early_access_customers(id, normalized_email, status, record)
  values (
    v_customer_id, v_email, 'APPROVED',
    jsonb_build_object(
      'id', v_customer_id,
      'normalizedEmail', v_email,
      'status', 'APPROVED',
      'audience', 'PRIVATE_EARLY_ACCESS',
      'firstName', 'Kristopher',
      'lastName', 'Lopez',
      'businessLegalName', 'Roman Health'
    )
  );
  insert into public.research_early_access_legal_bindings(
    customer_ref, member_id, established_by, verified_at, attested_by)
  values (v_customer_ref, v_member.id, 'admin_attested', clock_timestamp(),
          'Samuel Boadu, founder, Roman Health Launch A activation');
end $$;
commit;
```

(`extensions.digest`: on managed Supabase pgcrypto lives in the `extensions`
schema; `public.digest` does not exist. The ref shape matches the checked
constraint `^eac_[a-f0-9]{32}$` and the app's own derivation
`sha256('early-access-customer-v1:' + id)` truncated to 32 hex.)

## 6. THE PRICING DECISION (the one true business decision left)

Roman must buy at KRIS_VOLUME_PARTNER prices, but the legacy order door and the
Early Access storefront carry ONE global price per unit: the founder release
ledger's latest append. Tonight the ledger prices the 21 released units at
retail (about 2.27x the partner prices), so every Buy Now stays fail-closed
CLOSED even after activation, exactly as designed.

Prepared, not executed: `docs/research-launch/kris-price-appends.proposed.json`,
21 append-only ledger records (same units, same productVersion copied from the
current authority, quantity authority UNCHANGED at 20, no expiry, actor Samuel
Boadu) whose `approvedPriceCents` equal the KRIS_VOLUME_PARTNER artifact prices
exactly. The append RPC (`research_early_access_append_release`) is
service-role-execute; the appends can be run in one prepared Render job the
moment you say go, or pasted in the SQL editor.

KNOWN CONSEQUENCE, decide with eyes open: those 21 units reprice for ANY Early
Access session, including the password-gated public storefront. If the public
EA surface should not sell at partner prices, rotate
`RESEARCH_EARLY_ACCESS_PASSWORD_HASH` (or disable public EA sessions) in the
same breath. The catalog surfaces stay isolated either way (only the entitled
member sees the KRIS catalog); this consequence is about the shared door.

After the appends: Buy Now opens automatically for the 21 bound rows (no
deploy, no restart; the resolver reads the ledger live), and the order door
accepts exactly those prices.

## 7. Verify like an owner (one command)

With Kristopher's session cookie (or your own admin-created test session):

```bash
SMOKE_SESSION_COOKIE='<cookie>' SMOKE_EXPECT_BUY_NOW=21 RENDER_SERVICE_ID=srv-d8s9vej7uimc7384dfcg node scripts/acceptance/smoke-kris-launch-a.mjs --origin https://xenios-website.onrender.com --expect-sha 322a1636063a6a95f66ea11e15664651a94d5ac3
```

Fifteen checks: 420/418/2, the 143/243/32/2 purchase-mode matrix, the Buy Now
implication with the pinned open count of 21, private-field safety, the exact
agreement pair, anonymous refusals, and deployed-SHA equality. Anonymous-tier
result tonight: 6 PASS, 7 session-tier pending, 2 shape-strict checks that
recorded production's (safe) wall refusals as unrecognized; see the release
evidence file.

Then place Roman's first real order end to end: Buy Now, agreement acceptance,
durable order, invoice, payment instructions, proof upload, and YOUR admin
confirmation. Do not fabricate a payment to test; the proof door and admin
verification are already regression-covered in the suite.
