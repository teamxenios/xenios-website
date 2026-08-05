-- The proof bucket is private, ENFORCED, not assumed (RM finding on
-- migration 51).
--
-- Migration 51 creates the payment-proof bucket with
-- `on conflict (id) do nothing`, which is correct on a fresh project and
-- silently WRONG in exactly the case the guard matters most: a bucket with
-- the same id that already exists PUBLIC (pre-created by hand, restored
-- from a snapshot, left over from an experiment). Payment proofs are
-- customers' bank screenshots; "the migration reported success" must mean
-- "the bucket is private", not "a row with that id existed".
--
-- This migration converges the bucket to private no matter how the row came
-- to exist, and then ASSERTS the end state, so a database where the bucket
-- is somehow still public fails the apply loudly rather than carrying the
-- wrong state silently. Migration 51 is left byte-identical to its pinned,
-- reviewed source; this is the additive correction in the same chain.
--
-- Safe to apply twice; the storage-schema guard keeps a disposable
-- verification database (no storage schema) applying clean.

do $bucket_privacy$
declare
  v_public boolean;
begin
  if pg_catalog.to_regclass('storage.buckets') is null then
    -- No storage schema (disposable verification database): nothing to
    -- converge, nothing to assert.
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('research-ea-payment-proofs-production', 'research-ea-payment-proofs-production', false)
  on conflict (id) do update set public = false;

  select public into v_public
  from storage.buckets
  where id = 'research-ea-payment-proofs-production';

  if v_public is distinct from false then
    raise exception
      'research-ea-payment-proofs-production must be PRIVATE after this migration; found public = %. Refusing to report success over a public payment-proof bucket.',
      v_public;
  end if;
end
$bucket_privacy$;
