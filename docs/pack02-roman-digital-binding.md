# Roman Digital initial organization binding

This is an integration runbook, not an executed change. The Pack 02 worker did not deploy SQL, create a Supabase user, set a password, or mount account routes.

## Fixed organization facts

- Organization: `Roman Digital`
- Organization id: `e26bc7de-86df-4e70-8e82-964e3671d71c`
- Login email: `k@romandigital.io` (normalized from `K@romandigital.io`)
- Roles: `organization_owner`, `business_buyer`
- Initial credential policy: `password_change_required = true`

## Human-gated binding

After Samuel manually creates the user in the existing Supabase Auth project and the email is verified, obtain the Auth UID. In a reviewed, non-production rehearsal first, invoke the candidate service-role function with that UID:

```sql
select public.research_bind_verified_organization_user(
  'e26bc7de-86df-4e70-8e82-964e3671d71c'::uuid,
  '<SAMUEL_PROVIDED_SUPABASE_AUTH_UID>'::uuid,
  'k@romandigital.io',
  array['organization_owner','business_buyer']::text[],
  'Samuel Boadu',
  true
);
```

The function refuses an absent Auth UID, an unverified email, an email mismatch, unknown roles, or an inactive organization. It writes an append-only `organization_user_bound` event. It never accepts, reads, returns, logs, or stores a password.

Before production consideration, recreate/rebase on the verified final base, promote the SQL through the migration DAG, review the explicit service-role grant and RLS posture, run the candidate twice in an isolated database, run `verify_research_account_organizations.sql`, and independently review the resulting binding event.
