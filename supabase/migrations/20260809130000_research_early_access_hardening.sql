-- Xenios Research Early Access durable hardening (M62).
--
-- ADDITIVE / FAIL-CLOSED:
--   * M58, M60 and M61 remain immutable historical artifacts;
--   * the existing M60 settlement implementation is retained as a private core;
--   * one hardened wrapper is the only service-role settlement RPC;
--   * legal bindings, package snapshots, attestations and audit facts are durable;
--   * proof bytes have no database or Storage representation;
--   * customer and admin submission projections are separate routines;
--   * payment verification time comes from the database clock and ship-by is
--     exactly 72 hours later;
--   * all new tables are forced-RLS and have no direct role grants.
--
-- Requires migrations 58, 60 and 61. Creates no customer, package, binding,
-- attestation, submission, settlement, shipment, email or supplier action.

begin;

do $m62_preflight$
begin
  if to_regclass('public.research_early_access_cart_checkouts') is null
     or to_regclass('public.research_early_access_cart_settlements') is null
     or to_regclass('public.research_early_access_cart_external_proofs') is null
     or to_regprocedure('public.research_early_access_cart_refuse_superseded()') is null
  then
    raise exception 'M62 requires M58, M60 and M61' using errcode = '55000';
  end if;
end;
$m62_preflight$;

create table if not exists public.research_early_access_legal_bindings (
  id uuid primary key default gen_random_uuid(),
  customer_ref text not null unique check (customer_ref ~ '^eac_[a-f0-9]{32}$'),
  member_id uuid not null,
  established_by text not null check (established_by in ('verified_link','admin_attested')),
  verified_at timestamptz not null,
  attested_by text,
  alias_refs text[] not null default '{}'::text[],
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_ea_legal_binding_attestor_check check (
    (established_by = 'verified_link' and attested_by is null)
    or
    (established_by = 'admin_attested' and length(btrim(attested_by)) between 2 and 200)
  ),
  constraint research_ea_legal_binding_alias_check check (
    customer_ref <> all(alias_refs)
    and cardinality(alias_refs) <= 32
  )
);

create unique index if not exists research_ea_legal_binding_member_customer_uidx
  on public.research_early_access_legal_bindings(member_id, customer_ref);

create table if not exists public.research_early_access_agreement_packages (
  id uuid primary key default gen_random_uuid(),
  package_id text not null check (length(btrim(package_id)) between 2 and 120),
  package_version text not null unique check (package_version ~ '^[a-f0-9]{24}$'),
  requirements jsonb not null check (jsonb_typeof(requirements) = 'array' and jsonb_array_length(requirements) > 0),
  supersedes_package_version text unique
    references public.research_early_access_agreement_packages(package_version) on delete restrict,
  registered_by text not null check (length(btrim(registered_by)) between 2 and 200),
  registered_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_ea_package_not_self_supersede check (
    supersedes_package_version is null or supersedes_package_version <> package_version
  )
);

create table if not exists public.research_early_access_agreement_attestations (
  id uuid primary key default gen_random_uuid(),
  attestation_id text not null unique check (attestation_id ~ '^eaa_[A-Za-z0-9_-]{16,120}$'),
  cart_checkout_id uuid not null references public.research_early_access_cart_checkouts(id) on delete restrict,
  member_id uuid not null,
  package_id text not null check (length(btrim(package_id)) between 2 and 120),
  package_version text not null references public.research_early_access_agreement_packages(package_version) on delete restrict,
  signed_at jsonb not null check (jsonb_typeof(signed_at) = 'object' and signed_at <> '{}'::jsonb),
  supersedes_attestation_id text unique
    references public.research_early_access_agreement_attestations(attestation_id) on delete restrict,
  attested_at timestamptz not null default pg_catalog.clock_timestamp(),
  recorded_by text not null check (length(btrim(recorded_by)) between 2 and 200),
  constraint research_ea_attestation_not_self_supersede check (
    supersedes_attestation_id is null or supersedes_attestation_id <> attestation_id
  )
);

create index if not exists research_ea_attestation_checkout_idx
  on public.research_early_access_agreement_attestations(cart_checkout_id, attested_at desc);

create table if not exists public.research_early_access_proof_submissions (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null unique check (submission_id ~ '^eas_[A-Za-z0-9_-]{16,120}$'),
  submission_key text not null unique check (submission_key ~ '^eask_[A-Za-z0-9_-]{16,120}$'),
  cart_checkout_id uuid not null unique references public.research_early_access_cart_checkouts(id) on delete restrict,
  member_id uuid not null,
  method_code text not null check (length(btrim(method_code)) between 2 and 80),
  method_name text not null check (length(btrim(method_name)) between 2 and 160),
  registry_version text not null check (length(btrim(registry_version)) between 1 and 120),
  presented_at timestamptz not null,
  filename text not null check (length(filename) between 1 and 240 and filename !~ '[\x00\r\n]'),
  content_type text not null check (length(content_type) between 2 and 127),
  byte_size bigint not null check (byte_size between 1 and 25000000),
  proof_sha256 text not null check (proof_sha256 ~ '^[a-f0-9]{64}$'),
  package_version text not null references public.research_early_access_agreement_packages(package_version) on delete restrict,
  internal_recipient text not null default 'research@xeniostechnology.com'
    check (internal_recipient = 'research@xeniostechnology.com'),
  internal_email_acceptance text not null default 'not_attempted'
    check (internal_email_acceptance in ('not_attempted','accepted','unknown','failed')),
  provider_message_id text,
  last_error text,
  accepted_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_ea_submission_email_state_check check (
    (internal_email_acceptance = 'not_attempted' and provider_message_id is null and accepted_at is null)
    or (internal_email_acceptance = 'accepted' and length(btrim(provider_message_id)) between 1 and 300 and accepted_at is not null and last_error is null)
    or (internal_email_acceptance = 'unknown' and accepted_at is null)
    or (internal_email_acceptance = 'failed' and accepted_at is null and length(btrim(last_error)) between 1 and 1000)
  )
);

create table if not exists public.research_early_access_cart_transaction_ids (
  id uuid primary key default gen_random_uuid(),
  cart_settlement_id uuid not null unique references public.research_early_access_cart_settlements(id) on delete restrict,
  cart_checkout_id uuid not null unique references public.research_early_access_cart_checkouts(id) on delete restrict,
  external_transaction_id text not null check (length(btrim(external_transaction_id)) between 3 and 200),
  canonical_transaction_id text not null unique check (length(btrim(canonical_transaction_id)) between 3 and 200),
  recorded_at timestamptz not null default pg_catalog.clock_timestamp()
);

-- Backfill transaction identity only. Do not fabricate confirmations, package
-- standing, submissions or timestamps for a settlement that predates M62.
insert into public.research_early_access_cart_transaction_ids(
  cart_settlement_id, cart_checkout_id, external_transaction_id,
  canonical_transaction_id, recorded_at
)
select s.id, s.cart_checkout_id, s.external_transaction_id,
       upper(regexp_replace(btrim(s.external_transaction_id), '\s+', ' ', 'g')),
       s.settled_at
  from public.research_early_access_cart_settlements s
on conflict (cart_settlement_id) do nothing;

create table if not exists public.research_early_access_cart_settlement_hardening (
  id uuid primary key default gen_random_uuid(),
  cart_settlement_id uuid not null unique references public.research_early_access_cart_settlements(id) on delete restrict,
  cart_checkout_id uuid not null unique references public.research_early_access_cart_checkouts(id) on delete restrict,
  transaction_identity_id uuid not null unique references public.research_early_access_cart_transaction_ids(id) on delete restrict,
  agreement_attestation_id uuid not null references public.research_early_access_agreement_attestations(id) on delete restrict,
  proof_submission_id uuid not null unique references public.research_early_access_proof_submissions(id) on delete restrict,
  agreement_package_version text not null references public.research_early_access_agreement_packages(package_version) on delete restrict,
  actor_id text not null check (length(btrim(actor_id)) between 2 and 200),
  confirmed_funds_received boolean not null check (confirmed_funds_received),
  confirmed_amount_and_reference boolean not null check (confirmed_amount_and_reference),
  payment_verified_at timestamptz not null,
  ship_by_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_ea_settlement_ship_by_exact check (
    ship_by_at = payment_verified_at + interval '72 hours'
  )
);

-- Shipment corrections are new facts that point at the fact they correct.
-- The M58/M61 cart-event vocabulary is deliberately not rewritten.
create table if not exists public.research_early_access_cart_fulfilment_events (
  id uuid primary key default gen_random_uuid(),
  cart_checkout_id uuid not null references public.research_early_access_cart_checkouts(id) on delete restrict,
  cart_item_id uuid not null references public.research_early_access_cart_items(id) on delete restrict,
  event_type text not null check (event_type in (
    'shipment_shipped','tracking_added','tracking_corrected','shipment_voided'
  )),
  supersedes_event_id uuid unique
    references public.research_early_access_cart_fulfilment_events(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  actor_id text not null check (length(btrim(actor_id)) between 2 and 200),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_ea_fulfilment_correction_shape check (
    (event_type in ('shipment_shipped','tracking_added') and supersedes_event_id is null)
    or (event_type in ('tracking_corrected','shipment_voided') and supersedes_event_id is not null)
  )
);

create index if not exists research_ea_fulfilment_item_idx
  on public.research_early_access_cart_fulfilment_events(cart_item_id, occurred_at);

-- Immutable evidence. Submission state is the sole intentionally mutable M62
-- record because provider acceptance is learned after its pending identity is
-- durably reserved.
create or replace function public.research_early_access_m62_append_only()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  raise exception 'M62 evidence %.% is append-only', tg_table_schema, tg_table_name
    using errcode = '55000';
end;
$$;

do $append_only$
declare v_table text;
begin
  foreach v_table in array array[
    'research_early_access_legal_bindings',
    'research_early_access_agreement_packages',
    'research_early_access_agreement_attestations',
    'research_early_access_cart_transaction_ids',
    'research_early_access_cart_settlement_hardening',
    'research_early_access_cart_fulfilment_events'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_append_only', v_table);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.research_early_access_m62_append_only()',
      v_table || '_append_only', v_table
    );
  end loop;
end;
$append_only$;

create or replace function public.research_early_access_record_legal_binding(p_binding jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_existing public.research_early_access_legal_bindings%rowtype;
  v_aliases text[];
begin
  if p_binding is null or jsonb_typeof(p_binding) <> 'object'
     or (p_binding->>'customerRef') !~ '^eac_[a-f0-9]{32}$'
     or (p_binding->>'memberId') is null
     or (p_binding->>'establishedBy') not in ('verified_link','admin_attested')
  then
    raise exception 'invalid legal binding' using errcode = '22023';
  end if;
  begin
    perform (p_binding->>'memberId')::uuid;
    perform (p_binding->>'verifiedAt')::timestamptz;
  exception when others then
    raise exception 'invalid legal binding identity or timestamp' using errcode = '22023';
  end;
  if coalesce(jsonb_typeof(p_binding->'aliasRefs'), 'array') <> 'array' then
    raise exception 'invalid legal binding aliases' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct value order by value), '{}'::text[])
    into v_aliases
    from jsonb_array_elements_text(coalesce(p_binding->'aliasRefs','[]'::jsonb));

  -- The weaker provenance is not a general admin escape hatch. It exists only
  -- for the one founder checkout named by M61's fail-closed remediation.
  if p_binding->>'establishedBy' = 'admin_attested'
     and not exists (
       select 1 from public.research_early_access_cart_checkouts
        where checkout_number = 'XEC-E1703CC63BBE89E6839E24C1'
          and customer_ref = p_binding->>'customerRef'
          and disposition is null
     ) then
    return jsonb_build_object('recorded',false,'replayed',false,'reason','admin_attestation_not_allowed','binding',null);
  end if;

  select * into v_existing from public.research_early_access_legal_bindings
   where customer_ref = p_binding->>'customerRef';
  if found then
    if v_existing.member_id::text = (p_binding->>'memberId')
       and v_existing.established_by = (p_binding->>'establishedBy')
       and v_existing.alias_refs = v_aliases then
      return jsonb_build_object('recorded',false,'replayed',true,'binding',p_binding);
    end if;
    return jsonb_build_object('recorded',false,'replayed',false,'reason','binding_conflict','binding',null);
  end if;

  insert into public.research_early_access_legal_bindings(
    customer_ref,member_id,established_by,verified_at,attested_by,alias_refs
  ) values (
    p_binding->>'customerRef',(p_binding->>'memberId')::uuid,p_binding->>'establishedBy',
    (p_binding->>'verifiedAt')::timestamptz,p_binding->>'attestedBy',v_aliases
  );
  return jsonb_build_object('recorded',true,'replayed',false,'binding',p_binding);
end;
$$;

create or replace function public.research_early_access_legal_binding_for_customer(p_customer_ref text)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object(
    'customerRef',customer_ref,'memberId',member_id::text,'establishedBy',established_by,
    'verifiedAt',verified_at,'attestedBy',attested_by,'aliasRefs',to_jsonb(alias_refs)
  ) from public.research_early_access_legal_bindings where customer_ref = p_customer_ref
$$;

create or replace function public.research_early_access_register_agreement_package(p_package jsonb, p_actor_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_current public.research_early_access_agreement_packages%rowtype;
  v_existing public.research_early_access_agreement_packages%rowtype;
  v_requirement jsonb;
  v_seen text[] := '{}'::text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('xenios:ea:agreement-package',0));
  if p_package is null or jsonb_typeof(p_package) <> 'object'
     or length(btrim(p_package->>'packageId')) not between 2 and 120
     or (p_package->>'packageVersion') !~ '^[a-f0-9]{24}$'
     or jsonb_typeof(p_package->'requirements') <> 'array'
     or jsonb_array_length(p_package->'requirements') = 0
     or length(btrim(p_actor_id)) not between 2 and 200 then
    raise exception 'invalid agreement package' using errcode = '22023';
  end if;
  for v_requirement in select value from jsonb_array_elements(p_package->'requirements') loop
    if jsonb_typeof(v_requirement) <> 'object'
       or length(btrim(v_requirement->>'category')) < 2
       or (v_requirement->>'documentVersionId') is null
       or (v_requirement->>'semver') is null
       or jsonb_typeof(v_requirement->'requiresSeparateAcknowledgment') <> 'boolean'
       or (v_requirement->>'ordering') !~ '^[0-9]+$'
       or (v_requirement->>'category') = any(v_seen) then
      raise exception 'invalid or duplicate agreement requirement' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen,v_requirement->>'category');
  end loop;

  select * into v_existing from public.research_early_access_agreement_packages
   where package_version = p_package->>'packageVersion';
  if found then
    if v_existing.package_id = p_package->>'packageId'
       and v_existing.requirements = p_package->'requirements' then
      return jsonb_build_object('recorded',false,'replayed',true,'package',p_package);
    end if;
    raise exception 'agreement package version conflict' using errcode = '23505';
  end if;

  select p.* into v_current from public.research_early_access_agreement_packages p
   where not exists (
     select 1 from public.research_early_access_agreement_packages n
      where n.supersedes_package_version = p.package_version
   );
  if found and (p_package->>'supersedesPackageVersion') is distinct from v_current.package_version then
    raise exception 'agreement package must supersede current version %',v_current.package_version using errcode='55000';
  elsif not found and p_package->>'supersedesPackageVersion' is not null then
    raise exception 'first agreement package cannot supersede an absent package' using errcode='55000';
  end if;

  insert into public.research_early_access_agreement_packages(
    package_id,package_version,requirements,supersedes_package_version,registered_by
  ) values (
    p_package->>'packageId',p_package->>'packageVersion',p_package->'requirements',
    p_package->>'supersedesPackageVersion',p_actor_id
  );
  return jsonb_build_object('recorded',true,'replayed',false,'package',p_package);
end;
$$;

create or replace function public.research_early_access_current_agreement_package()
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object(
    'packageId',p.package_id,'packageVersion',p.package_version,
    'requirements',p.requirements,'registeredAt',p.registered_at
  ) from public.research_early_access_agreement_packages p
   where not exists (
     select 1 from public.research_early_access_agreement_packages n
      where n.supersedes_package_version = p.package_version
   )
$$;

create or replace function public.research_early_access_record_agreement_attestation(p_attestation jsonb, p_actor_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_checkout public.research_early_access_cart_checkouts%rowtype;
  v_binding public.research_early_access_legal_bindings%rowtype;
  v_package public.research_early_access_agreement_packages%rowtype;
  v_previous public.research_early_access_agreement_attestations%rowtype;
  v_existing public.research_early_access_agreement_attestations%rowtype;
  v_key text;
  v_value text;
begin
  if p_attestation is null or jsonb_typeof(p_attestation) <> 'object'
     or (p_attestation->>'attestationId') !~ '^eaa_[A-Za-z0-9_-]{16,120}$'
     or jsonb_typeof(p_attestation->'signedAt') <> 'object'
     or p_attestation->'signedAt' = '{}'::jsonb
     or length(btrim(p_actor_id)) not between 2 and 200 then
    raise exception 'invalid agreement attestation' using errcode='22023';
  end if;
  select * into v_existing from public.research_early_access_agreement_attestations
   where attestation_id=p_attestation->>'attestationId';
  if found then
    return jsonb_build_object('recorded',false,'replayed',true,'attestationId',v_existing.attestation_id);
  end if;
  select * into v_checkout from public.research_early_access_cart_checkouts
   where checkout_number=p_attestation->>'cartCheckoutNumber' for update;
  if not found or v_checkout.disposition is not null then
    return jsonb_build_object('recorded',false,'replayed',false,'reason','checkout_unavailable');
  end if;
  begin perform (p_attestation->>'memberId')::uuid;
  exception when others then raise exception 'invalid attestation member' using errcode='22023'; end;
  select * into v_binding from public.research_early_access_legal_bindings
   where member_id=(p_attestation->>'memberId')::uuid
     and (customer_ref=v_checkout.customer_ref or v_checkout.customer_ref=any(alias_refs));
  if not found then
    return jsonb_build_object('recorded',false,'replayed',false,'reason','binding_owner_mismatch');
  end if;
  select p.* into v_package from public.research_early_access_agreement_packages p
   where not exists(select 1 from public.research_early_access_agreement_packages n where n.supersedes_package_version=p.package_version);
  if not found or v_package.package_id is distinct from p_attestation->>'packageId'
     or v_package.package_version is distinct from p_attestation->>'packageVersion' then
    return jsonb_build_object('recorded',false,'replayed',false,'reason','agreements_not_current');
  end if;
  if (select count(*) from jsonb_object_keys(p_attestation->'signedAt')) <>
     jsonb_array_length(v_package.requirements)
     or exists (
       select 1 from jsonb_array_elements(v_package.requirements) r
        where not (p_attestation->'signedAt' ? (r->>'category'))
     ) then
    raise exception 'attestation signature timestamps do not match exact package' using errcode='22023';
  end if;
  for v_key,v_value in select key,value #>> '{}' from jsonb_each(p_attestation->'signedAt') loop
    begin perform v_value::timestamptz;
    exception when others then raise exception 'invalid signature timestamp for %',v_key using errcode='22023'; end;
    if v_value::timestamptz > pg_catalog.clock_timestamp() then
      raise exception 'future signature timestamp for %',v_key using errcode='22023';
    end if;
  end loop;
  select a.* into v_previous from public.research_early_access_agreement_attestations a
   where a.cart_checkout_id=v_checkout.id
     and not exists(select 1 from public.research_early_access_agreement_attestations n where n.supersedes_attestation_id=a.attestation_id)
   for update;
  insert into public.research_early_access_agreement_attestations(
    attestation_id,cart_checkout_id,member_id,package_id,package_version,signed_at,
    supersedes_attestation_id,recorded_by
  ) values (
    p_attestation->>'attestationId',v_checkout.id,(p_attestation->>'memberId')::uuid,
    v_package.package_id,v_package.package_version,p_attestation->'signedAt',
    case when v_previous.id is null then null else v_previous.attestation_id end,p_actor_id
  );
  return jsonb_build_object('recorded',true,'replayed',false,'attestationId',p_attestation->>'attestationId');
end;
$$;

create or replace function public.research_early_access_active_agreement_attestation(p_checkout_number text)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object(
    'attestationId',a.attestation_id,'cartCheckoutNumber',c.checkout_number,
    'memberId',a.member_id::text,'packageId',a.package_id,'packageVersion',a.package_version,
    'signedAt',a.signed_at,'attestedAt',a.attested_at,
    'supersededAt',null,'supersededBy',null
  )
  from public.research_early_access_agreement_attestations a
  join public.research_early_access_cart_checkouts c on c.id=a.cart_checkout_id
  where c.checkout_number=p_checkout_number
    and not exists(select 1 from public.research_early_access_agreement_attestations n where n.supersedes_attestation_id=a.attestation_id)
$$;

create or replace function public.research_early_access_begin_proof_submission(p_submission jsonb, p_submission_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_checkout public.research_early_access_cart_checkouts%rowtype;
  v_attestation public.research_early_access_agreement_attestations%rowtype;
  v_package public.research_early_access_agreement_packages%rowtype;
  v_existing public.research_early_access_proof_submissions%rowtype;
begin
  if p_submission is null or jsonb_typeof(p_submission)<>'object'
     or (p_submission->>'submissionId') !~ '^eas_[A-Za-z0-9_-]{16,120}$'
     or p_submission_key !~ '^eask_[A-Za-z0-9_-]{16,120}$'
     or (p_submission->>'proofSha256') !~ '^[a-f0-9]{64}$'
     or (p_submission->>'byteSize') !~ '^[0-9]+$'
     or (p_submission->'method'->>'code') is null
     or (p_submission->'method'->>'registryVersion') is null then
    raise exception 'invalid proof submission metadata' using errcode='22023';
  end if;
  select * into v_checkout from public.research_early_access_cart_checkouts
   where checkout_number=p_submission->>'cartCheckoutNumber' for update;
  if not found then return jsonb_build_object('recorded',false,'reason','checkout_unknown'); end if;
  if v_checkout.disposition is not null then return jsonb_build_object('recorded',false,'reason','checkout_superseded'); end if;
  select p.* into v_package from public.research_early_access_agreement_packages p
   where not exists(select 1 from public.research_early_access_agreement_packages n where n.supersedes_package_version=p.package_version);
  select a.* into v_attestation from public.research_early_access_agreement_attestations a
   where a.cart_checkout_id=v_checkout.id
     and not exists(select 1 from public.research_early_access_agreement_attestations n where n.supersedes_attestation_id=a.attestation_id);
  if v_package.id is null or v_attestation.id is null
     or v_attestation.package_version<>v_package.package_version
     or v_attestation.package_version<>(p_submission->>'packageVersion') then
    return jsonb_build_object('recorded',false,'reason','agreements_not_current');
  end if;
  if v_attestation.member_id::text<>(p_submission->>'memberId') then
    return jsonb_build_object('recorded',false,'reason','binding_owner_mismatch');
  end if;
  select * into v_existing from public.research_early_access_proof_submissions where cart_checkout_id=v_checkout.id;
  if found then
    if v_existing.submission_key<>p_submission_key then
      return jsonb_build_object('recorded',false,'reason','submission_exists','submissionId',v_existing.submission_id);
    end if;
    if v_existing.internal_email_acceptance='failed' then
      update public.research_early_access_proof_submissions set
        method_code=p_submission->'method'->>'code',method_name=p_submission->'method'->>'methodName',
        registry_version=p_submission->'method'->>'registryVersion',presented_at=(p_submission->'method'->>'presentedAt')::timestamptz,
        filename=p_submission->>'filename',content_type=p_submission->>'contentType',byte_size=(p_submission->>'byteSize')::bigint,
        proof_sha256=p_submission->>'proofSha256',package_version=p_submission->>'packageVersion',
        internal_email_acceptance='not_attempted',provider_message_id=null,last_error=null,accepted_at=null,
        updated_at=pg_catalog.clock_timestamp()
      where id=v_existing.id;
    end if;
    return jsonb_build_object('recorded',false,'replayed',true,'submissionId',v_existing.submission_id);
  end if;
  insert into public.research_early_access_proof_submissions(
    submission_id,submission_key,cart_checkout_id,member_id,method_code,method_name,
    registry_version,presented_at,filename,content_type,byte_size,proof_sha256,package_version
  ) values (
    p_submission->>'submissionId',p_submission_key,v_checkout.id,(p_submission->>'memberId')::uuid,
    p_submission->'method'->>'code',p_submission->'method'->>'methodName',p_submission->'method'->>'registryVersion',
    (p_submission->'method'->>'presentedAt')::timestamptz,p_submission->>'filename',p_submission->>'contentType',
    (p_submission->>'byteSize')::bigint,p_submission->>'proofSha256',p_submission->>'packageVersion'
  );
  return jsonb_build_object('recorded',true,'replayed',false,'submissionId',p_submission->>'submissionId');
end;
$$;

create or replace function public.research_early_access_confirm_submission_email(
  p_submission_id text,p_submission_key text,p_acceptance text,p_provider_message_id text,p_last_error text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_row public.research_early_access_proof_submissions%rowtype;
begin
  select * into v_row from public.research_early_access_proof_submissions
   where submission_id=p_submission_id and submission_key=p_submission_key for update;
  if not found then return jsonb_build_object('updated',false,'reason','submission_unknown'); end if;
  if p_acceptance not in ('accepted','unknown','failed') then
    raise exception 'invalid internal email acceptance' using errcode='22023';
  end if;
  if v_row.internal_email_acceptance='accepted' then
    if p_acceptance='accepted' and v_row.provider_message_id is not distinct from p_provider_message_id then
      return jsonb_build_object('updated',false,'replayed',true);
    end if;
    return jsonb_build_object('updated',false,'reason','submission_already_accepted');
  end if;
  if p_acceptance='accepted' and length(btrim(p_provider_message_id)) not between 1 and 300 then
    raise exception 'accepted email requires provider message id' using errcode='22023';
  end if;
  if p_acceptance='failed' and length(btrim(p_last_error)) not between 1 and 1000 then
    raise exception 'failed email requires error' using errcode='22023';
  end if;
  update public.research_early_access_proof_submissions set
    internal_email_acceptance=p_acceptance,
    provider_message_id=case when p_acceptance='accepted' then p_provider_message_id else null end,
    last_error=case when p_acceptance='accepted' then null else p_last_error end,
    accepted_at=case when p_acceptance='accepted' then pg_catalog.clock_timestamp() else null end,
    updated_at=pg_catalog.clock_timestamp()
   where id=v_row.id;
  return jsonb_build_object('updated',true,'replayed',false);
end;
$$;

create or replace function public.research_early_access_submission_customer_view(p_checkout_number text)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select case when s.id is null then jsonb_build_object(
    'state','not_started','method',null,'methodLabel',null,'filename',null,'acceptedAt',null,'retryAllowed',true
  ) else jsonb_build_object(
    'state',case s.internal_email_acceptance
      when 'accepted' then 'accepted_for_review'
      when 'not_attempted' then 'in_progress'
      else 'needs_retry' end,
    'method',s.method_code,'methodLabel',s.method_name,'filename',s.filename,
    'acceptedAt',s.accepted_at,
    'retryAllowed',(s.internal_email_acceptance<>'accepted')
  ) end
  from public.research_early_access_cart_checkouts c
  left join public.research_early_access_proof_submissions s on s.cart_checkout_id=c.id
  where c.checkout_number=p_checkout_number
$$;

create or replace function public.research_early_access_submission_admin_view(p_checkout_number text)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object(
    'submissionId',s.submission_id,'cartCheckoutNumber',c.checkout_number,'memberId',s.member_id::text,
    'method',jsonb_build_object('code',s.method_code,'methodName',s.method_name,'registryVersion',s.registry_version,'presentedAt',s.presented_at),
    'filename',s.filename,'contentType',s.content_type,'byteSize',s.byte_size,'proofSha256',s.proof_sha256,
    'submissionKey',s.submission_key,'internalRecipient',s.internal_recipient,
    'internalEmailAcceptance',s.internal_email_acceptance,'providerMessageId',s.provider_message_id,
    'lastError',s.last_error,'reconciliationRequired',(s.internal_email_acceptance='unknown'),'createdAt',s.created_at
  )
  from public.research_early_access_proof_submissions s
  join public.research_early_access_cart_checkouts c on c.id=s.cart_checkout_id
  where c.checkout_number=p_checkout_number
$$;

-- Keep the exact M60 implementation as a private core. This is not a second
-- settlement system: the hardened function below is the sole service RPC and
-- calls this core inside the same transaction.
do $preserve_m60$
begin
  if to_regprocedure('public.research_early_access_commit_cart_settlement_m60_core(text,text,text,bigint,text,text,timestamptz)') is null then
    if to_regprocedure('public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,timestamptz)') is null then
      raise exception 'M60 settlement core is absent' using errcode='55000';
    end if;
    alter function public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,timestamptz)
      rename to research_early_access_commit_cart_settlement_m60_core;
  end if;
end;
$preserve_m60$;

revoke all on function public.research_early_access_commit_cart_settlement_m60_core(text,text,text,bigint,text,text,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.research_early_access_commit_cart_settlement(
  p_checkout_number text,
  p_external_transaction_id text,
  p_evidence_ref text,
  p_verified_amount_cents bigint,
  p_verified_currency text,
  p_actor_id text,
  p_confirmed_funds_received boolean,
  p_confirmed_amount_and_reference boolean,
  p_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_checkout public.research_early_access_cart_checkouts%rowtype;
  v_existing public.research_early_access_cart_settlements%rowtype;
  v_package public.research_early_access_agreement_packages%rowtype;
  v_attestation public.research_early_access_agreement_attestations%rowtype;
  v_submission public.research_early_access_proof_submissions%rowtype;
  v_settlement public.research_early_access_cart_settlements%rowtype;
  v_tx public.research_early_access_cart_transaction_ids%rowtype;
  v_result jsonb;
  v_canonical text;
  v_verified_at timestamptz;
  v_ship_by_at timestamptz;
begin
  -- p_at remains in the wire signature for an additive application integration,
  -- but money time is database authority and never comes from this argument.
  perform p_at;
  select * into v_checkout from public.research_early_access_cart_checkouts
   where checkout_number=p_checkout_number for update;
  if not found then return jsonb_build_object('committed',false,'reason','checkout_unknown','settlement',null); end if;
  select * into v_existing from public.research_early_access_cart_settlements where cart_checkout_id=v_checkout.id;
  if found then
    return jsonb_build_object('committed',false,'reason','already_settled','settlement',v_existing.record);
  end if;
  if v_checkout.disposition is not null then
    return jsonb_build_object('committed',false,'reason','checkout_superseded','settlement',null);
  end if;
  if p_confirmed_funds_received is distinct from true
     or p_confirmed_amount_and_reference is distinct from true then
    return jsonb_build_object('committed',false,'reason','admin_confirmation_missing','settlement',null);
  end if;
  v_canonical:=upper(regexp_replace(btrim(p_external_transaction_id),'\s+',' ','g'));
  if v_canonical is null or length(v_canonical) not between 3 and 200 then
    return jsonb_build_object('committed',false,'reason','input_invalid','settlement',null);
  end if;
  if exists(select 1 from public.research_early_access_cart_transaction_ids where canonical_transaction_id=v_canonical) then
    return jsonb_build_object('committed',false,'reason','transaction_id_duplicate_canonical','settlement',null);
  end if;
  select p.* into v_package from public.research_early_access_agreement_packages p
   where not exists(select 1 from public.research_early_access_agreement_packages n where n.supersedes_package_version=p.package_version);
  select a.* into v_attestation from public.research_early_access_agreement_attestations a
   where a.cart_checkout_id=v_checkout.id
     and not exists(select 1 from public.research_early_access_agreement_attestations n where n.supersedes_attestation_id=a.attestation_id);
  if v_package.id is null or v_attestation.id is null or v_attestation.package_version<>v_package.package_version then
    return jsonb_build_object('committed',false,'reason','agreements_not_current','settlement',null);
  end if;
  select * into v_submission from public.research_early_access_proof_submissions where cart_checkout_id=v_checkout.id;
  if not found or v_submission.internal_email_acceptance in ('not_attempted','failed') then
    return jsonb_build_object('committed',false,'reason','submission_missing','settlement',null);
  end if;
  if v_submission.internal_email_acceptance='unknown' then
    return jsonb_build_object('committed',false,'reason','submission_unreconciled','settlement',null);
  end if;
  if v_submission.member_id<>v_attestation.member_id or v_submission.package_version<>v_package.package_version then
    return jsonb_build_object('committed',false,'reason','agreements_not_current','settlement',null);
  end if;
  v_verified_at:=pg_catalog.clock_timestamp();
  v_ship_by_at:=v_verified_at+interval '72 hours';
  v_result:=public.research_early_access_commit_cart_settlement_m60_core(
    p_checkout_number,p_external_transaction_id,p_evidence_ref,p_verified_amount_cents,
    p_verified_currency,p_actor_id,v_verified_at
  );
  if coalesce((v_result->>'committed')::boolean,false) is not true then return v_result; end if;
  select * into strict v_settlement from public.research_early_access_cart_settlements where cart_checkout_id=v_checkout.id;
  insert into public.research_early_access_cart_transaction_ids(
    cart_settlement_id,cart_checkout_id,external_transaction_id,canonical_transaction_id,recorded_at
  ) values (v_settlement.id,v_checkout.id,p_external_transaction_id,v_canonical,v_verified_at)
  returning * into v_tx;
  insert into public.research_early_access_cart_settlement_hardening(
    cart_settlement_id,cart_checkout_id,transaction_identity_id,agreement_attestation_id,
    proof_submission_id,agreement_package_version,actor_id,confirmed_funds_received,
    confirmed_amount_and_reference,payment_verified_at,ship_by_at,recorded_at
  ) values (
    v_settlement.id,v_checkout.id,v_tx.id,v_attestation.id,v_submission.id,v_package.package_version,
    p_actor_id,true,true,v_verified_at,v_ship_by_at,v_verified_at
  );
  return jsonb_set(jsonb_set(v_result,'{settlement,paymentVerifiedAt}',to_jsonb(v_verified_at),true),
                   '{settlement,shipByAt}',to_jsonb(v_ship_by_at),true);
exception when unique_violation then
  if exists(select 1 from public.research_early_access_cart_transaction_ids where canonical_transaction_id=v_canonical) then
    return jsonb_build_object('committed',false,'reason','transaction_id_duplicate_canonical','settlement',null);
  end if;
  raise;
end;
$$;

create or replace function public.research_early_access_cart_settlement_hardening(p_checkout_number text)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object(
    'cartCheckoutNumber',c.checkout_number,'canonicalTransactionId',t.canonical_transaction_id,
    'agreementPackageVersion',h.agreement_package_version,'actorId',h.actor_id,
    'confirmedFundsReceived',h.confirmed_funds_received,
    'confirmedAmountAndReference',h.confirmed_amount_and_reference,
    'paymentVerifiedAt',h.payment_verified_at,'shipByAt',h.ship_by_at
  ) from public.research_early_access_cart_settlement_hardening h
  join public.research_early_access_cart_checkouts c on c.id=h.cart_checkout_id
  join public.research_early_access_cart_transaction_ids t on t.id=h.transaction_identity_id
  where c.checkout_number=p_checkout_number
$$;

create or replace function public.research_early_access_record_cart_fulfilment_event(p_event jsonb,p_actor_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_checkout public.research_early_access_cart_checkouts%rowtype;
  v_item public.research_early_access_cart_items%rowtype;
  v_prior public.research_early_access_cart_fulfilment_events%rowtype;
  v_id uuid;
begin
  if p_event is null or jsonb_typeof(p_event)<>'object'
     or (p_event->>'eventType') not in ('shipment_shipped','tracking_added','tracking_corrected','shipment_voided')
     or length(btrim(p_actor_id)) not between 2 and 200 then
    raise exception 'invalid fulfilment event' using errcode='22023';
  end if;
  select * into v_checkout from public.research_early_access_cart_checkouts
   where checkout_number=p_event->>'cartCheckoutNumber' for update;
  if not found then return jsonb_build_object('recorded',false,'reason','checkout_unknown'); end if;
  if v_checkout.disposition is not null then return jsonb_build_object('recorded',false,'reason','checkout_superseded'); end if;
  if not exists(select 1 from public.research_early_access_cart_settlements where cart_checkout_id=v_checkout.id) then
    return jsonb_build_object('recorded',false,'reason','payment_not_verified');
  end if;
  select * into v_item from public.research_early_access_cart_items
   where cart_checkout_id=v_checkout.id and order_number=p_event->>'orderNumber';
  if not found then return jsonb_build_object('recorded',false,'reason','child_order_unknown'); end if;
  if p_event->>'eventType' in ('tracking_corrected','shipment_voided') then
    begin
      select * into v_prior from public.research_early_access_cart_fulfilment_events
       where id=(p_event->>'supersedesEventId')::uuid and cart_item_id=v_item.id for update;
    exception when others then
      return jsonb_build_object('recorded',false,'reason','superseded_event_unknown');
    end;
    if v_prior.id is null or exists(select 1 from public.research_early_access_cart_fulfilment_events where supersedes_event_id=v_prior.id) then
      return jsonb_build_object('recorded',false,'reason','superseded_event_unknown');
    end if;
  end if;
  insert into public.research_early_access_cart_fulfilment_events(
    cart_checkout_id,cart_item_id,event_type,supersedes_event_id,metadata,actor_id
  ) values (
    v_checkout.id,v_item.id,p_event->>'eventType',v_prior.id,coalesce(p_event->'metadata','{}'::jsonb),p_actor_id
  ) returning id into v_id;
  return jsonb_build_object('recorded',true,'eventId',v_id);
end;
$$;

-- Forced RLS and exact routine boundary.
do $security$
declare v_table text; v_signature text;
begin
  foreach v_table in array array[
    'research_early_access_legal_bindings','research_early_access_agreement_packages',
    'research_early_access_agreement_attestations','research_early_access_proof_submissions',
    'research_early_access_cart_transaction_ids','research_early_access_cart_settlement_hardening',
    'research_early_access_cart_fulfilment_events'
  ] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('alter table public.%I force row level security',v_table);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',v_table);
  end loop;
  foreach v_signature in array array[
    'public.research_early_access_m62_append_only()',
    'public.research_early_access_record_legal_binding(jsonb)',
    'public.research_early_access_legal_binding_for_customer(text)',
    'public.research_early_access_register_agreement_package(jsonb,text)',
    'public.research_early_access_current_agreement_package()',
    'public.research_early_access_record_agreement_attestation(jsonb,text)',
    'public.research_early_access_active_agreement_attestation(text)',
    'public.research_early_access_begin_proof_submission(jsonb,text)',
    'public.research_early_access_confirm_submission_email(text,text,text,text,text)',
    'public.research_early_access_submission_customer_view(text)',
    'public.research_early_access_submission_admin_view(text)',
    'public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,boolean,boolean,timestamptz)',
    'public.research_early_access_cart_settlement_hardening(text)',
    'public.research_early_access_record_cart_fulfilment_event(jsonb,text)'
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_signature);
  end loop;
end;
$security$;

grant execute on function public.research_early_access_record_legal_binding(jsonb) to service_role;
grant execute on function public.research_early_access_legal_binding_for_customer(text) to service_role;
grant execute on function public.research_early_access_register_agreement_package(jsonb,text) to service_role;
grant execute on function public.research_early_access_current_agreement_package() to service_role;
grant execute on function public.research_early_access_record_agreement_attestation(jsonb,text) to service_role;
grant execute on function public.research_early_access_active_agreement_attestation(text) to service_role;
grant execute on function public.research_early_access_begin_proof_submission(jsonb,text) to service_role;
grant execute on function public.research_early_access_confirm_submission_email(text,text,text,text,text) to service_role;
grant execute on function public.research_early_access_submission_customer_view(text) to service_role;
grant execute on function public.research_early_access_submission_admin_view(text) to service_role;
grant execute on function public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,boolean,boolean,timestamptz) to service_role;
grant execute on function public.research_early_access_cart_settlement_hardening(text) to service_role;
grant execute on function public.research_early_access_record_cart_fulfilment_event(jsonb,text) to service_role;

comment on function public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,boolean,boolean,timestamptz) is
  'The sole service-role cart settlement RPC: M60 atomic core plus current agreements, accepted submission, canonical transaction, durable named-admin confirmations and exact DB-clock 72-hour ship-by.';

commit;
