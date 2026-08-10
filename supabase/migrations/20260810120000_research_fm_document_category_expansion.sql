-- Xenios Research founding-membership legal document categories (M63).
--
-- WHY THIS MIGRATION EXISTS.
--
-- The counsel-approved legal package ships four REQUIRED member-facing
-- documents that mapped to no document category:
--
--   XR-LEGAL-12  Website Terms of Use                     (activation)
--   XR-LEGAL-13  Product Purchase Terms                   (product_checkout)
--   XR-LEGAL-14  Shipping, Claims and Replacement Policy  (product_checkout)
--   XR-LEGAL-15  Payment Evidence Upload Consent          (payment_evidence_upload)
--
-- With no category they can hold no published version and bind no signature,
-- so a package naming them can never complete (document_not_signable) and a
-- package omitting them is refused (required_document_omitted). Every stage is
-- contaminated, so there is no stage-scoping escape. The application half of
-- the correction adds the four categories to the registry; this migration is
-- the other half, because both legal tables constrain `category` to the
-- original sixteen values and a code-only change would compile and then fail
-- at the first insert.
--
-- ADDITIVE / FAIL-CLOSED:
--   * widens the single-column CHECK on `category` on both legal tables from
--     16 to the same 20 values, in the same order, preserving all sixteen;
--   * touches no row: no legal document version, signature, package, binding,
--     attestation, customer, settlement or supplier fact is created, altered
--     or deleted;
--   * publishes nothing and enables nothing;
--   * refuses to run at all if the prerequisite legal schema is absent;
--   * refuses to run if a legal row is discovered that the widened constraint
--     would not accept, so the constraint can never be replaced by a weaker or
--     mismatched one;
--   * re-runnable: the constraint is dropped by structural discovery (any
--     single-column check on `category`, whatever its name) and recreated
--     under one canonical name, so a second apply is a no-op in effect.
--
-- Requires the founding-membership agreements schema
-- (supabase/production/research-founding-membership.sql, section 4) and the
-- accepted M62 chain. Creates no customer, package, binding, attestation,
-- submission, settlement, shipment, email or supplier action.

begin;

-- ---------------------------------------------------------------------------
-- Preflight. Fail closed rather than half-apply against unexpected schema.
-- ---------------------------------------------------------------------------

do $m63_preflight$
declare
  v_table text;
begin
  if to_regclass('public.research_fm_document_versions') is null
     or to_regclass('public.research_fm_document_signatures') is null
  then
    raise exception
      'M63 requires the founding-membership agreements schema (research_fm_document_versions and research_fm_document_signatures)'
      using errcode = '55000';
  end if;

  foreach v_table in array array[
    'research_fm_document_versions',
    'research_fm_document_signatures'
  ] loop
    if not exists (
      select 1
      from pg_attribute att
      join pg_class rel on rel.oid = att.attrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = v_table
        and att.attname = 'category'
        and att.attnum > 0
        and not att.attisdropped
    ) then
      raise exception 'M63 requires public.%.category to exist', v_table
        using errcode = '55000';
    end if;
  end loop;
end;
$m63_preflight$;

-- ---------------------------------------------------------------------------
-- The twenty categories. Identical list, identical order, on both tables.
-- The first sixteen are the original values, unchanged. Nothing is renamed,
-- nothing is removed, and no historical row is transformed.
-- ---------------------------------------------------------------------------

do $m63_widen$
declare
  v_table text;
  v_constraint text;
  v_categories constant text[] := array[
    'electronic_record_consent',
    'founding_membership_agreement',
    'activation_terms',
    'recurring_membership_authorization',
    'immediate_cancellation_acknowledgment',
    'membership_covenant',
    'confidentiality_covenant',
    'privacy_notice',
    'research_education_disclaimer',
    'assumption_of_risk_acknowledgment',
    'no_guarantee_acknowledgment',
    'arbitration_agreement',
    'manual_payment_bridge_terms',
    'identity_age_verification_consent',
    'sensitive_health_data_consent',
    'referral_store_credit_terms',
    'website_terms_of_use',
    'product_purchase_terms',
    'shipping_claims_replacement_policy',
    'payment_evidence_upload_consent'
  ];
  v_unaccepted bigint;
begin
  if cardinality(v_categories) <> 20 then
    raise exception 'M63 must widen the category constraint to exactly 20 values, found %',
      cardinality(v_categories) using errcode = '55000';
  end if;

  foreach v_table in array array[
    'research_fm_document_versions',
    'research_fm_document_signatures'
  ] loop
    -- Refuse before dropping anything if any existing row carries a category
    -- the widened constraint would not accept. A widened constraint must never
    -- be a differently shaped one.
    execute format(
      'select count(*) from public.%I where category is not null and category <> all($1)',
      v_table
    ) into v_unaccepted using v_categories;
    if v_unaccepted > 0 then
      raise exception
        'M63 refuses to replace the category constraint on public.%: % existing row(s) carry a category outside the 20 accepted values',
        v_table, v_unaccepted using errcode = '55000';
    end if;

    -- Drop by structure, not by name: the original constraints are inline
    -- column checks whose names Postgres generated, and an earlier M63 apply
    -- leaves the canonical name. Both are single-column checks on `category`.
    for v_constraint in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = v_table
        and con.contype = 'c'
        and con.conkey = array[(
          select att.attnum
          from pg_attribute att
          where att.attrelid = rel.oid
            and att.attname = 'category'
            and not att.attisdropped
        )]
    loop
      execute format('alter table public.%I drop constraint %I', v_table, v_constraint);
    end loop;

    execute format(
      'alter table public.%I add constraint %I check (category in (%s))',
      v_table,
      v_table || '_category_check',
      (select string_agg(quote_literal(c), ', ') from unnest(v_categories) as c)
    );
  end loop;
end;
$m63_widen$;

-- ---------------------------------------------------------------------------
-- Post-condition. The migration proves its own effect before committing:
-- exactly one single-column category check per table, each accepting all
-- twenty values and rejecting an unknown one.
-- ---------------------------------------------------------------------------

do $m63_postcondition$
declare
  v_table text;
  v_count integer;
  v_definition text;
  v_category text;
begin
  foreach v_table in array array[
    'research_fm_document_versions',
    'research_fm_document_signatures'
  ] loop
    select count(*), max(pg_get_constraintdef(con.oid))
    into v_count, v_definition
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and con.conname = v_table || '_category_check';

    if v_count <> 1 then
      raise exception 'M63 post-condition: public.% has % canonical category constraints, expected 1',
        v_table, v_count using errcode = '55000';
    end if;

    foreach v_category in array array[
      'electronic_record_consent',
      'founding_membership_agreement',
      'activation_terms',
      'recurring_membership_authorization',
      'immediate_cancellation_acknowledgment',
      'membership_covenant',
      'confidentiality_covenant',
      'privacy_notice',
      'research_education_disclaimer',
      'assumption_of_risk_acknowledgment',
      'no_guarantee_acknowledgment',
      'arbitration_agreement',
      'manual_payment_bridge_terms',
      'identity_age_verification_consent',
      'sensitive_health_data_consent',
      'referral_store_credit_terms',
      'website_terms_of_use',
      'product_purchase_terms',
      'shipping_claims_replacement_policy',
      'payment_evidence_upload_consent'
    ] loop
      if position(quote_literal(v_category) in v_definition) = 0 then
        raise exception 'M63 post-condition: public.% does not accept category %',
          v_table, v_category using errcode = '55000';
      end if;
    end loop;

    if position(quote_literal('xenios_not_a_category') in v_definition) <> 0 then
      raise exception 'M63 post-condition: public.% accepts an unknown category', v_table
        using errcode = '55000';
    end if;
  end loop;
end;
$m63_postcondition$;

comment on constraint research_fm_document_versions_category_check
  on public.research_fm_document_versions is
  'The 20 legal document categories: the original 16 plus the four final-package documents M63 made signable (website terms of use, product purchase terms, shipping and claims, payment evidence upload consent).';

comment on constraint research_fm_document_signatures_category_check
  on public.research_fm_document_signatures is
  'Mirrors research_fm_document_versions_category_check. A signature can only ever carry a category the versions table accepts.';

commit;
