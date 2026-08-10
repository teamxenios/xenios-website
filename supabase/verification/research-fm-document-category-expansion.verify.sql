-- M63 behavioural verification: the legal document category constraints.
-- Disposable databases only. ON_ERROR_STOP must be enabled by the caller.
--
-- Runs AFTER the founding-membership agreements schema and M63. Proves the
-- widened constraints accept exactly the twenty valid categories and reject a
-- twenty-first, that no legal row was created or transformed, and that every
-- structural guard around signing is still in force.
--
-- Every probe INSERT below runs inside a plpgsql subtransaction that is
-- deliberately aborted, so this file leaves the database exactly as it found
-- it. The row-count assertions at the end prove that.

create or replace function pg_temp.want(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

create or replace function pg_temp.categories() returns text[]
language sql immutable as $$
  select array[
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
  ]
$$;

-- ---------------------------------------------------------------------------
-- Structure: exactly one canonical single-column category check per table.
-- ---------------------------------------------------------------------------

select pg_temp.want(
  (select count(*) from pg_constraint con
     join pg_class rel on rel.oid = con.conrelid
     join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_fm_document_versions'
      and con.contype = 'c'
      and con.conkey = array[(select attnum from pg_attribute
                               where attrelid = rel.oid and attname = 'category'
                                 and not attisdropped)]) = 1,
  'versions: exactly one single-column category check constraint');

select pg_temp.want(
  (select count(*) from pg_constraint con
     join pg_class rel on rel.oid = con.conrelid
     join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_fm_document_signatures'
      and con.contype = 'c'
      and con.conkey = array[(select attnum from pg_attribute
                               where attrelid = rel.oid and attname = 'category'
                                 and not attisdropped)]) = 1,
  'signatures: exactly one single-column category check constraint');

select pg_temp.want(
  (select count(*) from pg_constraint
    where conname in ('research_fm_document_versions_category_check',
                      'research_fm_document_signatures_category_check')) = 2,
  'both category constraints carry the canonical M63 name');

-- ---------------------------------------------------------------------------
-- K. The constraints accept all twenty categories, on BOTH tables.
--
-- Proved by real INSERTs, not by reading the constraint text, because the
-- constraint text is not what runs at insert time. Every probe is rolled back.
-- ---------------------------------------------------------------------------

do $k$
declare
  v_category text;
  v_version uuid;
  v_consent uuid;
begin
  foreach v_category in array pg_temp.categories() loop
    begin
      insert into public.research_fm_document_versions(
        tenant, category, title, semver, status, published_at, jurisdiction,
        content, content_hash, counsel_review
      ) values (
        'm63_probe', v_category, 'probe', '9.9.9', 'published', now(), 'Texas',
        'probe content', repeat('a', 64), 'approved'
      ) returning id into v_version;

      insert into public.research_fm_document_versions(
        tenant, category, title, semver, status, published_at, jurisdiction,
        content, content_hash, counsel_review
      ) values (
        'm63_probe_consent', 'electronic_record_consent', 'probe consent', '9.9.9',
        'published', now(), 'Texas', 'probe consent content', repeat('b', 64), 'approved'
      ) returning id into v_consent;

      insert into public.research_fm_document_signatures(
        tenant, member_id, document_version_id, category, semver, content_hash,
        typed_legal_name, full_document_shown, affirmative_consent,
        electronic_consent_version_id
      ) values (
        'm63_probe', gen_random_uuid(), v_version, v_category, '9.9.9', repeat('a', 64),
        'Probe Signer', true, true, v_consent
      );

      -- Undo the probe. The subtransaction rolls back with it.
      raise exception 'M63_PROBE_ROLLBACK';
    exception
      when others then
        if sqlerrm <> 'M63_PROBE_ROLLBACK' then
          raise exception 'M63 K: category % was refused: %', v_category, sqlerrm;
        end if;
    end;
  end loop;
  raise notice 'PASS  K: all 20 categories accepted by both tables (probes rolled back)';
end;
$k$;

-- ---------------------------------------------------------------------------
-- L. An unknown twenty-first category is rejected by BOTH tables.
-- ---------------------------------------------------------------------------

do $l$
declare
  v_version uuid;
  v_consent uuid;
  v_accepted boolean := false;
begin
  begin
    insert into public.research_fm_document_versions(
      tenant, category, title, semver, status, published_at, jurisdiction,
      content, content_hash, counsel_review
    ) values (
      'm63_probe', 'xenios_not_a_category', 'probe', '9.9.9', 'published', now(), 'Texas',
      'probe content', repeat('a', 64), 'approved'
    );
    v_accepted := true;
    raise exception 'M63_PROBE_ROLLBACK';
  exception
    when check_violation then null;
    when others then
      if sqlerrm <> 'M63_PROBE_ROLLBACK' then raise; end if;
  end;
  if v_accepted then
    raise exception 'M63 L: research_fm_document_versions accepted an unknown category';
  end if;

  -- The signatures table refuses it on its own constraint, not merely because
  -- the version insert failed first: seed a VALID version, then sign it with an
  -- invalid category.
  begin
    insert into public.research_fm_document_versions(
      tenant, category, title, semver, status, published_at, jurisdiction,
      content, content_hash, counsel_review
    ) values (
      'm63_probe', 'privacy_notice', 'probe', '9.9.9', 'published', now(), 'Texas',
      'probe content', repeat('a', 64), 'approved'
    ) returning id into v_version;
    insert into public.research_fm_document_versions(
      tenant, category, title, semver, status, published_at, jurisdiction,
      content, content_hash, counsel_review
    ) values (
      'm63_probe_consent', 'electronic_record_consent', 'probe consent', '9.9.9',
      'published', now(), 'Texas', 'probe consent content', repeat('b', 64), 'approved'
    ) returning id into v_consent;
    insert into public.research_fm_document_signatures(
      tenant, member_id, document_version_id, category, semver, content_hash,
      typed_legal_name, full_document_shown, affirmative_consent,
      electronic_consent_version_id
    ) values (
      'm63_probe', gen_random_uuid(), v_version, 'xenios_not_a_category', '9.9.9',
      repeat('a', 64), 'Probe Signer', true, true, v_consent
    );
    v_accepted := true;
    raise exception 'M63_PROBE_ROLLBACK';
  exception
    when check_violation then null;
    when others then
      if sqlerrm <> 'M63_PROBE_ROLLBACK' then raise; end if;
  end;
  if v_accepted then
    raise exception 'M63 L: research_fm_document_signatures accepted an unknown category';
  end if;
  raise notice 'PASS  L: an unknown 21st category is refused by both tables';
end;
$l$;

-- ---------------------------------------------------------------------------
-- The structural signing guards M63 must not have weakened.
-- ---------------------------------------------------------------------------

do $guards$
declare
  v_draft uuid;
  v_consent uuid;
  v_accepted boolean := false;
begin
  begin
    insert into public.research_fm_document_versions(
      tenant, category, title, semver, status, jurisdiction, content, content_hash
    ) values (
      'm63_probe', 'website_terms_of_use', 'probe draft', '9.9.9', 'draft', 'Texas',
      'probe content', repeat('c', 64)
    ) returning id into v_draft;
    insert into public.research_fm_document_versions(
      tenant, category, title, semver, status, published_at, jurisdiction,
      content, content_hash, counsel_review
    ) values (
      'm63_probe_consent', 'electronic_record_consent', 'probe consent', '9.9.9',
      'published', now(), 'Texas', 'probe consent content', repeat('b', 64), 'approved'
    ) returning id into v_consent;
    insert into public.research_fm_document_signatures(
      tenant, member_id, document_version_id, category, semver, content_hash,
      typed_legal_name, full_document_shown, affirmative_consent,
      electronic_consent_version_id
    ) values (
      'm63_probe', gen_random_uuid(), v_draft, 'website_terms_of_use', '9.9.9',
      repeat('c', 64), 'Probe Signer', true, true, v_consent
    );
    v_accepted := true;
    raise exception 'M63_PROBE_ROLLBACK';
  exception
    when others then
      if sqlerrm = 'M63_PROBE_ROLLBACK' and v_accepted then
        raise exception 'M63 guard: a DRAFT of a new category was signable';
      end if;
  end;
  raise notice 'PASS  guard: a draft of a new category still cannot be signed';
end;
$guards$;

select pg_temp.want(
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
    where c.relname = 'research_fm_document_signatures'
      and t.tgname in ('research_fm_signatures_no_update',
                       'research_fm_signatures_no_delete',
                       'research_fm_signature_requires_published')) = 3,
  'the append-only and published-only signature triggers are intact');

select pg_temp.want(
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = 'research_fm_versions_one_published_per_category') = 1,
  'one-published-version-per-category index is intact');

-- ---------------------------------------------------------------------------
-- N. M63 fabricated no legal record of any kind.
--
-- The migration writes no row. Nothing carries a probe tenant, and no row
-- exists in any of the four categories M63 introduced.
-- ---------------------------------------------------------------------------

select pg_temp.want(
  (select count(*) from public.research_fm_document_versions
    where tenant like 'm63_probe%') = 0,
  'N: no probe version row survived');

select pg_temp.want(
  (select count(*) from public.research_fm_document_signatures
    where tenant like 'm63_probe%') = 0,
  'N: no probe signature row survived');

select pg_temp.want(
  (select count(*) from public.research_fm_document_versions
    where category in ('website_terms_of_use', 'product_purchase_terms',
                       'shipping_claims_replacement_policy',
                       'payment_evidence_upload_consent')) = 0,
  'N: M63 published no version in any newly added category');

select pg_temp.want(
  (select count(*) from public.research_fm_document_signatures
    where category in ('website_terms_of_use', 'product_purchase_terms',
                       'shipping_claims_replacement_policy',
                       'payment_evidence_upload_consent')) = 0,
  'N: M63 created no signature in any newly added category');

select pg_temp.want(
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public'
                 and c.relname in ('research_early_access_legal_bindings',
                                   'research_early_access_agreement_packages',
                                   'research_early_access_agreement_attestations')),
  'N: M63 created no Early Access binding, package or attestation table');

select 'M63 VERIFICATION COMPLETE' as result;
