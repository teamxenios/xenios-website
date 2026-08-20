-- Xenios Research: the customer-typed affiliate code (M71 successor candidate).
--
-- DESIGN ONLY. This checked-in candidate does not authorize application.
--
-- WHY A SEPARATE COLUMN RATHER THAN REUSING affiliate_attribution_ref.
-- That column holds a SERVER-VERIFIED attribution, derived from a signed
-- referral cookie, and the submit path refuses a browser-supplied value for it
-- on purpose: the browser must not be able to choose which partner an order
-- pays. A code the customer typed is a CLAIM. Writing a claim into the proven
-- field would hand away exactly the property that refusal exists to protect,
-- and no later reader could tell the two apart. So they are two facts, stored
-- separately, and only a human moves a claim to "matched".
--
-- STRICTLY ADDITIVE. Two nullable columns and one replaced function body that
-- reads two more JSON keys. No existing column changes type or nullability, no
-- existing row is rewritten, no grant moves, and every already-stored request
-- keeps reading exactly as it does today with both columns null.

begin;
set local lock_timeout = '5s';

do $declared_code_preflight$
begin
  if to_regclass('public.research_assisted_order_requests') is null then
    raise exception 'requires M71; public.research_assisted_order_requests is absent'
      using errcode = '55000';
  end if;
  if to_regprocedure('public.research_assisted_order_submit(jsonb)') is null then
    raise exception 'requires M71 submit function'
      using errcode = '55000';
  end if;
end
$declared_code_preflight$;

alter table public.research_assisted_order_requests
  add column if not exists declared_affiliate_code text,
  add column if not exists declared_affiliate_code_state text;

-- The shape a normalized code may take, mirroring the application's
-- normalization exactly: upper case, starting alphanumeric, then alphanumerics
-- and three joiners, 2..40. A row that does not satisfy this is a bug in the
-- writer, not a customer mistake, because malformed input is dropped before it
-- reaches here.
do $declared_code_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_assisted_order_requests_declared_code_shape'
  ) then
    alter table public.research_assisted_order_requests
      add constraint research_assisted_order_requests_declared_code_shape
      check (
        declared_affiliate_code is null
        or declared_affiliate_code ~ '^[A-Z0-9][A-Z0-9._-]{1,39}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_assisted_order_requests_declared_code_state'
  ) then
    alter table public.research_assisted_order_requests
      add constraint research_assisted_order_requests_declared_code_state
      check (
        declared_affiliate_code_state is null
        or declared_affiliate_code_state in (
          'not_provided',
          'captured_unmatched',
          'matched_manual',
          'invalid_ignored'
        )
      );
  end if;

  -- A state that claims a code must HAVE one, and a state that claims none must
  -- not. Without this, "matched_manual" with a null code would read to an
  -- operator as a matched affiliate with no way to see which.
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_assisted_order_requests_declared_code_agreement'
  ) then
    alter table public.research_assisted_order_requests
      add constraint research_assisted_order_requests_declared_code_agreement
      check (
        declared_affiliate_code_state is null
        or (
          declared_affiliate_code_state in ('captured_unmatched', 'matched_manual')
        ) = (declared_affiliate_code is not null)
      );
  end if;
end
$declared_code_constraints$;

comment on column public.research_assisted_order_requests.declared_affiliate_code is
  'An affiliate code the CUSTOMER TYPED. A claim, never attribution: it grants nothing, changes no price, pathway, payment or permission, and stays unmatched until a human matches it. The server-verified attribution is affiliate_attribution_ref and the two must never be merged.';

commit;

-- ---------------------------------------------------------------------------
-- The submit function, replaced to read the two new keys.
--
-- IMPORTANT: this must be regenerated from the CURRENT M71 body at promotion
-- time rather than pasted from an older copy. The only intended difference is
-- the two added column names in the insert and the two added `p_request ->>`
-- reads, both null-safe, so a caller that sends neither key behaves exactly as
-- it does today.
-- ---------------------------------------------------------------------------
