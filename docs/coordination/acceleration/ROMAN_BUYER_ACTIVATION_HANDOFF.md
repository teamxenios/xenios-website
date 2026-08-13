# Roman Buyer Activation Handoff

## Decision

Fast Path C: a temporary, collision-free B2B bridge. It reuses Supabase Auth and Early Access customer/order scope, and creates no personal membership application. It does not execute the older Pack02 `research_organizations` candidate.

## Fixed Identity

- Operator login: `info@romanhealthcollective.com`
- Buyer: `Roman Health Marketplace`
- Buyer id: `8f942c0e-370b-4b7b-98ce-a0b931193f08`
- Roles: `buyer_owner`, `buyer_operator`
- Price profile: `KRIS_VOLUME_PARTNER`
- Orders: owned through Roman's unique Early Access `customer_ref`

## Claim Flow

1. A service-role operator checks Supabase Auth for the exact normalized email.
2. If absent, Supabase sends its secure invite to the canonical address. Xenios never creates or stores a password.
3. Kris follows the invite and chooses the credential.
4. After Supabase confirms the email, `research_finalize_business_buyer_claim` atomically binds the Auth UID, the existing Roman Early Access customer scope, and the price profile.
5. `research_current_business_buyer_context()` returns only the caller's active buyer context through `auth.uid()`.

The executable application boundary is `activateRomanBusinessBuyer` with
`createSupabaseBusinessBuyerActivationDeps`. It performs the bounded Auth
lookup, secure invite, and reviewed finalization RPC without accepting a
password or a personal application id.

## Production Preconditions

- Promote `supabase/pack02-candidates/20260813_research_business_buyer_bridge.sql` through the database-owner migration DAG after confirming its predecessor.
- Confirm exactly one active `research_early_access_customers` row for `info@romanhealthcollective.com`.
- Run the migration and verification in a disposable Supabase/Postgres environment before production.
- Wire the authenticated buyer-context RPC into the Kris catalog and Early Access account composition.
- Send the Supabase invite only after the migration is accepted and the canonical site redirect is configured.

## Migration Path

The bridge tables use `research_business_buyer_*` names to avoid the existing `research_organizations` collision. A later organization model can migrate buyer, operator, customer-scope, and price-profile rows one for one while preserving the existing `customer_ref` as order ownership provenance.

## Boundaries

- No production SQL was executed.
- No Auth user or password was created.
- No invitation was sent.
- No catalog, cart, checkout, payment, or order behavior changed.
