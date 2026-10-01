-- Source-only, unapplied media/commerce decoupling candidate.
--
-- Product imagery is presentation metadata. Its absence, approval state,
-- identity, required-input state, or payload bytes must never decide whether a
-- canonical product/variant/price/lot is eligible for a persistent cart.
--
-- This candidate intentionally preserves every non-image authority in the
-- 20260727200000 persistent-cart predecessor: owner and audience binding,
-- product/variant publication and approval, exact price/version/effective
-- window, inventory fingerprint, allocatable lot/COA/quality truth, the three
-- commerce required inputs, and both domain launch-control versions.
--
-- It is not registered or applied. Managed use requires exact-SHA review,
-- migration registration, a fresh preflight, and explicit production approval.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local row_security = off;
set local search_path = pg_catalog;

do $precheck$
declare
  v_expected record;
  v_proc pg_catalog.pg_proc%rowtype;
  v_body text;
  v_authority_owner oid;
  v_service_role oid;
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Media/commerce precheck requires a superuser or BYPASSRLS migration role'
      using errcode = '42501',
        detail = 'RESEARCH_MEDIA_COMMERCE_BYPASSRLS_REQUIRED';
  end if;
  if pg_catalog.to_regclass('public.research_persistent_carts') is null
     or pg_catalog.to_regclass('public.research_persistent_cart_items') is null
     or pg_catalog.to_regclass('public.research_persistent_cart_commands') is null
     or pg_catalog.to_regclass('public.research_persistent_cart_events') is null
     or pg_catalog.to_regclass('public.research_required_inputs') is null
     or pg_catalog.to_regclass('public.research_required_input_audit') is null
     or pg_catalog.to_regclass('public.research_domain_launch_controls') is null
     or pg_catalog.to_regclass('public.research_domain_launch_audit') is null then
    raise exception 'Media/commerce decoupling predecessor tables are absent'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_PREDECESSOR_REQUIRED';
  end if;

  v_service_role := pg_catalog.to_regrole('service_role');
  select c.relowner into v_authority_owner
  from pg_catalog.pg_class c
  where c.oid = 'public.research_persistent_carts'::regclass;
  if v_service_role is null
     or not exists (
       select 1 from pg_catalog.pg_roles
       where oid = v_authority_owner and (rolsuper or rolbypassrls)
     )
     or exists (
       select 1
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in (
           'research_persistent_carts',
           'research_persistent_cart_items',
           'research_persistent_cart_commands',
           'research_persistent_cart_events'
         )
         and c.relowner <> v_authority_owner
     ) then
    raise exception 'Persistent cart owner predecessor drift'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_OWNER_DRIFT';
  end if;

  -- Hold the zero-row precondition through the function replacement. This is
  -- deliberately preservation-first: existing cart history needs a separate,
  -- reviewed adoption plan rather than an in-place identity rewrite.
  lock table public.research_persistent_carts,
    public.research_persistent_cart_items,
    public.research_persistent_cart_commands,
    public.research_persistent_cart_events in access exclusive mode;
  if (select pg_catalog.count(*) from public.research_persistent_carts)
       + (select pg_catalog.count(*) from public.research_persistent_cart_items)
       + (select pg_catalog.count(*) from public.research_persistent_cart_commands)
       + (select pg_catalog.count(*) from public.research_persistent_cart_events) <> 0 then
    raise exception 'Persistent cart rows require explicit reconciliation before media decoupling'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_CART_RECONCILIATION_REQUIRED';
  end if;

  lock table public.research_required_inputs,
    public.research_required_input_audit,
    public.research_domain_launch_controls,
    public.research_domain_launch_audit in share row exclusive mode;

  -- MD5 is used only as an exact normalized-source fingerprint here, never as
  -- an authentication or business-data primitive. These are the complete
  -- normalized prosrc bodies from the reviewed predecessor source files.
  for v_expected in
    select * from (values
      ('public.research_persistent_cart_selection_current(text,text,jsonb)',
        '717d44a6e6378b3c5c8acfb28f0ddff3', 'v'),
      ('public.research_persistent_cart_put_item(text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz)',
        '2872890758dc0afa84b1815d8cbfa6db', 'v'),
      ('public.research_persistent_cart_claim(uuid,text,jsonb,bigint,uuid,bigint,text,timestamptz)',
        'c38501b49ac295be3852eccc482faed5', 'v'),
      ('public.research_required_input_manifest_hash(text)',
        '8aba188324fde758904adebf54bb9e22', 's'),
      ('public.research_domain_readiness(text)',
        '0a6bfabc6ca617ccab71f4882e4842cb', 'v'),
      ('public.research_set_readiness_manifest(text,integer,integer,integer,boolean,text,text[],text,timestamptz)',
        '70d9a438d582be5c9b8e9e106b9edf67', 'v')
    ) as expected(signature, body_md5, volatility)
  loop
    select p.* into v_proc
    from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure(v_expected.signature);
    if not found then
      raise exception 'Media/commerce predecessor function absent: %', v_expected.signature
        using errcode = '55000',
          detail = 'RESEARCH_MEDIA_COMMERCE_PREDECESSOR_REQUIRED';
    end if;
    v_body := pg_catalog.replace(v_proc.prosrc, E'\r\n', E'\n');
    if pg_catalog.md5(v_body) <> v_expected.body_md5
       or v_proc.prosecdef is not true
       or v_proc.provolatile::text <> v_expected.volatility
       or v_proc.proconfig is distinct from array['search_path=pg_catalog']::text[]
       or v_proc.proowner <> v_authority_owner then
      raise exception 'Media/commerce predecessor function drift: %', v_expected.signature
        using errcode = '55000',
          detail = 'RESEARCH_MEDIA_COMMERCE_PREDECESSOR_DRIFT';
    end if;
  end loop;

  if exists (
    with targets(signature, service_callable) as (values
      ('public.research_persistent_cart_selection_current(text,text,jsonb)', false),
      ('public.research_persistent_cart_put_item(text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz)', true),
      ('public.research_persistent_cart_claim(uuid,text,jsonb,bigint,uuid,bigint,text,timestamptz)', true),
      ('public.research_required_input_manifest_hash(text)', true),
      ('public.research_domain_readiness(text)', true),
      ('public.research_set_readiness_manifest(text,integer,integer,integer,boolean,text,text[],text,timestamptz)', true)
    ), functions as (
      select p.oid, p.proowner, p.proacl, t.service_callable
      from targets t
      join pg_catalog.pg_proc p
        on p.oid = pg_catalog.to_regprocedure(t.signature)
    ), actual as (
      select f.oid, acl.grantee, acl.privilege_type, acl.is_grantable
      from functions f
      cross join lateral pg_catalog.aclexplode(
        coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))
      ) acl
    ), required as (
      select f.oid, f.proowner as grantee, 'EXECUTE'::text as privilege_type,
        false as is_grantable
      from functions f
      union all
      select f.oid, v_service_role, 'EXECUTE'::text, false
      from functions f
      where f.service_callable
    ), drift as (
      (select * from actual except select * from required)
      union all
      (select * from required except select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'Media/commerce predecessor function ACL drift'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_FUNCTION_ACL_DRIFT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'research_persistent_carts',
        'research_persistent_cart_items',
        'research_persistent_cart_commands',
        'research_persistent_cart_events'
      )
      and (c.relrowsecurity is not true or c.relforcerowsecurity is not true)
  ) or exists (
    with targets(table_name) as (values
      ('research_persistent_carts'),
      ('research_persistent_cart_items'),
      ('research_persistent_cart_commands'),
      ('research_persistent_cart_events')
    ), relations as (
      select c.oid, c.relowner, c.relacl
      from targets t
      join pg_catalog.pg_class c on c.relname = t.table_name
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
    ), actual as (
      select r.oid, acl.grantee, acl.privilege_type, acl.is_grantable
      from relations r
      cross join lateral pg_catalog.aclexplode(
        coalesce(r.relacl, pg_catalog.acldefault('r', r.relowner))
      ) acl
    ), required as (
      -- acldefault derives the complete owner privilege set for this server
      -- version (including TRUNCATE/REFERENCES/TRIGGER and PG17 MAINTAIN).
      select r.oid, acl.grantee, acl.privilege_type, acl.is_grantable
      from relations r
      cross join lateral pg_catalog.aclexplode(
        pg_catalog.acldefault('r', r.relowner)
      ) acl
      where acl.grantee = r.relowner
      union all
      select r.oid, v_service_role, 'SELECT'::text, false
      from relations r
    ), drift as (
      (select * from actual except select * from required)
      union all
      (select * from required except select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'Persistent cart RLS, owner, or ACL predecessor drift'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_RLS_DRIFT';
  end if;

  if not exists (
    select 1 from public.research_domain_launch_controls
    where domain = 'product_content'
  ) then
    raise exception 'Product-content launch control is required before changing readiness semantics'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_PREDECESSOR_REQUIRED';
  elsif exists (
    select 1 from public.research_domain_launch_controls
    where domain = 'product_content' and launch_status = 'public_enabled'
  ) then
    raise exception 'Pause product_content before changing readiness semantics'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_PUBLIC_READINESS_PAUSE_REQUIRED';
  end if;
end
$precheck$;

-- Presentation-only input definitions remain visible to Product Control, but
-- no longer participate in a launch/readiness manifest or blocker count. The
-- exact tuple is narrow: a malformed or newly invented non-image fact remains
-- inside canonical readiness and therefore fails closed.
create or replace function public.research_required_input_manifest_hash(
  p_domain text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select encode(
    sha256(
      convert_to(
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', id,
              'key', key,
              'blockingLevel', blocking_level,
              'responsibleRole', responsible_role,
              'entryMode', entry_mode,
              'valueSensitivity', value_sensitivity,
              'recordType', record_type,
              'recordId', record_id,
              'fieldPath', field_path,
              'verificationMethod', verification_method,
              'evidenceRequired', evidence_required,
              'publicLaunchImpact', public_launch_impact,
              'version', version
            )
            order by key, id
          )::text,
          '[]'
        ),
        'UTF8'
      )
    ),
    'hex'
  )
  from public.research_required_inputs
  where domain = p_domain
    and current_state <> 'superseded'
    and not (
      key = 'product_content.primary_image'
      and domain = 'product_content'
      and record_type = 'product'
    )
$$;

create or replace function public.research_domain_readiness(p_domain text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_control public.research_domain_launch_controls;
  v_actual integer;
  v_blocking integer;
  v_keys jsonb;
  v_current_manifest_hash text;
begin
  select * into v_control
  from public.research_domain_launch_controls
  where domain = p_domain;
  if not found then
    raise exception 'launch_control_not_configured';
  end if;

  select
    count(*) filter (where current_state <> 'superseded'),
    count(*) filter (
      where current_state not in ('verified', 'not_applicable', 'superseded')
        and blocking_level <> 'informational'
    ),
    coalesce(
      jsonb_agg(key order by key) filter (
        where current_state not in ('verified', 'not_applicable', 'superseded')
          and blocking_level <> 'informational'
      ),
      '[]'::jsonb
    )
  into v_actual, v_blocking, v_keys
  from public.research_required_inputs
  where domain = p_domain
    and not (
      key = 'product_content.primary_image'
      and domain = 'product_content'
      and record_type = 'product'
    );
  v_current_manifest_hash :=
    public.research_required_input_manifest_hash(p_domain);

  return jsonb_build_object(
    'domain', v_control.domain,
    'launchStatus', v_control.launch_status,
    'softwareComplete', v_control.software_complete,
    'realInputsRequired', v_blocking > 0,
    'publicEnabled', v_control.launch_status = 'public_enabled',
    'manifestApproved',
      v_control.manifest_hash is not null
      and v_control.manifest_hash = v_current_manifest_hash
      and coalesce(v_control.expected_input_count, 0) = v_actual,
    'expectedInputCount', coalesce(v_control.expected_input_count, 0),
    'actualInputCount', v_actual,
    'blockingInputCount', v_blocking,
    'blockingKeys', v_keys,
    'version', v_control.version
  );
end;
$$;

create or replace function public.research_set_readiness_manifest(
  p_domain text,
  p_expected_version integer,
  p_manifest_version integer,
  p_expected_input_count integer,
  p_software_complete boolean,
  p_actor text,
  p_actor_roles text[],
  p_reason text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_before public.research_domain_launch_controls;
  v_manifest_hash text;
  v_actual_input_count integer;
begin
  if p_domain is null
     or p_expected_version is null
     or p_expected_version < 0
     or p_manifest_version is null
     or p_manifest_version < 1
     or p_expected_input_count is null
     or p_expected_input_count < 1
     or p_software_complete is null
     or coalesce(pg_catalog.length(pg_catalog.btrim(p_actor)), 0) < 1
     or coalesce(pg_catalog.length(pg_catalog.btrim(p_reason)), 0) not between 3 and 1000
     or p_now is null then
    raise exception 'invalid_manifest_request';
  end if;
  if p_actor_roles is null
     or not (p_actor_roles && array['super_admin', 'internal_team']) then
    raise exception 'release_role_required';
  end if;
  select count(*) into v_actual_input_count
  from public.research_required_inputs
  where domain = p_domain
    and current_state <> 'superseded'
    and not (
      key = 'product_content.primary_image'
      and domain = 'product_content'
      and record_type = 'product'
    );
  if v_actual_input_count < 1
     or v_actual_input_count <> p_expected_input_count then
    raise exception 'manifest_count_mismatch';
  end if;
  v_manifest_hash := public.research_required_input_manifest_hash(p_domain);

  select * into v_before
  from public.research_domain_launch_controls
  where domain = p_domain
  for update;

  if not found then
    if p_expected_version is distinct from 0 then raise exception 'state_conflict'; end if;
    insert into public.research_domain_launch_controls (
      domain, launch_status, software_complete, manifest_version,
      manifest_hash, expected_input_count, manifest_approved_by,
      manifest_approved_at, version, updated_by, updated_reason, updated_at
    ) values (
      p_domain, 'internal_build', p_software_complete, p_manifest_version,
      v_manifest_hash, p_expected_input_count, p_actor, p_now, 1,
      p_actor, p_reason, p_now
    );
    insert into public.research_domain_launch_audit (
      domain, from_status, to_status, actor, reason, manifest_hash, occurred_at
    ) values (
      p_domain, null, 'internal_build', p_actor, p_reason, v_manifest_hash, p_now
    );
  else
    if v_before.version is distinct from p_expected_version then raise exception 'state_conflict'; end if;
    if v_before.launch_status = 'public_enabled' then raise exception 'pause_before_manifest_change'; end if;
    update public.research_domain_launch_controls
    set software_complete = p_software_complete,
        manifest_version = p_manifest_version,
        manifest_hash = v_manifest_hash,
        expected_input_count = p_expected_input_count,
        manifest_approved_by = p_actor,
        manifest_approved_at = p_now,
        release_approved_by = null,
        release_approved_at = null,
        version = version + 1,
        updated_by = p_actor,
        updated_reason = p_reason,
        updated_at = p_now
    where domain = p_domain;
    insert into public.research_domain_launch_audit (
      domain, from_status, to_status, actor, reason, manifest_hash, occurred_at
    ) values (
      p_domain, v_before.launch_status, v_before.launch_status,
      p_actor, p_reason, v_manifest_hash, p_now
    );
  end if;
  return public.research_domain_readiness(p_domain);
end;
$$;

-- selection_current deliberately accepts and ignores a legacy top-level media
-- property. Only the three non-image bindings are accepted as inputVersions;
-- every active unknown non-image required-input row remains fail-closed. The
-- exact primary-image presentation tuple is the only active-row exemption.
create or replace function public.research_persistent_cart_selection_current(
  p_owner_kind text, p_owner_identity text, p_selection jsonb
)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare v_input jsonb; v_domain jsonb;
begin
  if p_owner_kind is null
     or p_owner_kind not in ('member','anonymous')
     or jsonb_typeof(p_selection) is distinct from 'object'
     or jsonb_typeof(p_selection->'canonicalReadiness') is distinct from 'object'
     or jsonb_typeof(p_selection->'canonicalReadiness'->'inputVersions') is distinct from 'array'
     or jsonb_typeof(p_selection->'canonicalReadiness'->'domainVersions') is distinct from 'array'
     or p_selection->'canonicalReadiness'->'ready' is distinct from 'true'::jsonb
     or p_selection->'canonicalReadiness'->'verifiedInputCount' is distinct from '3'::jsonb
     or jsonb_array_length(p_selection->'canonicalReadiness'->'inputVersions') is distinct from 3
     or jsonb_array_length(p_selection->'canonicalReadiness'->'domainVersions') is distinct from 2
     or exists (
       select 1
       from jsonb_array_elements(
         p_selection->'canonicalReadiness'->'inputVersions'
       ) entry
       where jsonb_typeof(entry) is distinct from 'object'
          or jsonb_typeof(entry->'id') is distinct from 'string'
          or coalesce(entry->>'id','')
             !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or jsonb_typeof(entry->'version') is distinct from 'number'
          or coalesce(entry->>'version','') !~ '^[1-9][0-9]*$'
     )
     or exists (
       select 1
       from jsonb_array_elements(
         p_selection->'canonicalReadiness'->'domainVersions'
       ) entry
       where jsonb_typeof(entry) is distinct from 'object'
          or jsonb_typeof(entry->'domain') is distinct from 'string'
          or coalesce(entry->>'domain','') = ''
          or jsonb_typeof(entry->'version') is distinct from 'number'
          or coalesce(entry->>'version','') !~ '^[1-9][0-9]*$'
     )
     or jsonb_typeof(p_selection->'inventoryEligibility') is distinct from 'object'
     or jsonb_typeof(p_selection->'audienceEligibility') is distinct from 'object'
     or jsonb_typeof(p_selection->'price') is distinct from 'object'
     or jsonb_typeof(p_selection->'productId') is distinct from 'string'
     or jsonb_typeof(p_selection->'variantId') is distinct from 'string'
     or jsonb_typeof(p_selection->'sku') is distinct from 'string'
     or jsonb_typeof(p_selection->'audience') is distinct from 'string'
     or jsonb_typeof(p_selection->'evaluatedAt') is distinct from 'string'
     or jsonb_typeof(p_selection->'price'->'id') is distinct from 'string'
     or jsonb_typeof(p_selection->'price'->'amountCents') is distinct from 'number'
     or jsonb_typeof(p_selection->'price'->'currency') is distinct from 'string'
     or jsonb_typeof(p_selection->'price'->'effectiveAt') is distinct from 'string'
     or not (p_selection->'price' ? 'expiresAt')
     or jsonb_typeof(p_selection->'price'->'expiresAt') not in ('string','null')
     or (
       jsonb_typeof(p_selection->'price'->'expiresAt') = 'string'
       and coalesce(p_selection->'price'->>'expiresAt','') = ''
     )
     or jsonb_typeof(p_selection->'price'->'version') is distinct from 'number'
     or jsonb_typeof(p_selection->'inventoryEligibility'->'state') is distinct from 'string'
     or jsonb_typeof(p_selection->'inventoryEligibility'->'productId') is distinct from 'string'
     or jsonb_typeof(p_selection->'inventoryEligibility'->'variantId') is distinct from 'string'
     or jsonb_typeof(p_selection->'inventoryEligibility'->'sourceVersion') is distinct from 'string'
     or jsonb_typeof(p_selection->'inventoryEligibility'->'evaluatedAt') is distinct from 'string'
     or jsonb_typeof(p_selection->'audienceEligibility'->'state') is distinct from 'string'
     or jsonb_typeof(p_selection->'audienceEligibility'->'audience') is distinct from 'string'
     or jsonb_typeof(p_selection->'audienceEligibility'->'sourceVersion') is distinct from 'string'
     or jsonb_typeof(p_selection->'audienceEligibility'->'evaluatedAt') is distinct from 'string'
     or not (p_selection->'audienceEligibility' ? 'principalId')
     or jsonb_typeof(p_selection->'audienceEligibility'->'principalId') not in ('string','null')
     or (p_owner_kind='anonymous' and (
       coalesce(p_owner_identity,'') !~ '^[a-f0-9]{64}$'
       or p_selection->>'audience' is distinct from 'retail'
       or p_selection->'audienceEligibility'->>'principalId' is not null
     ))
     or (p_owner_kind='member' and (
       coalesce(p_owner_identity,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_selection->>'audience' not in ('retail','member')
       or (
         p_selection->>'audience'='member'
         and p_selection->'audienceEligibility'->>'principalId'
           is distinct from p_owner_identity::uuid::text
       )
     ))
     or p_selection->'inventoryEligibility'->>'state' is distinct from 'eligible'
     or p_selection->'inventoryEligibility'->>'productId' is distinct from p_selection->>'productId'
     or p_selection->'inventoryEligibility'->>'variantId' is distinct from p_selection->>'variantId'
     or coalesce(p_selection->'inventoryEligibility'->>'sourceVersion','')
        !~ '^[a-f0-9]{64}$'
     or p_selection->'inventoryEligibility'->>'evaluatedAt'
        is distinct from p_selection->>'evaluatedAt'
     or p_selection->'audienceEligibility'->>'state' is distinct from 'authorized'
     or p_selection->'audienceEligibility'->>'audience' is distinct from p_selection->>'audience'
     or coalesce(p_selection->'audienceEligibility'->>'sourceVersion','') = ''
     or p_selection->'audienceEligibility'->>'evaluatedAt'
        is distinct from p_selection->>'evaluatedAt'
     or (p_selection->>'evaluatedAt')::timestamptz
        not between clock_timestamp()-interval '10 minutes'
            and clock_timestamp()+interval '30 seconds'
  then return false; end if;
  -- SHARE conflicts with every ordinary INSERT/UPDATE/DELETE writer while
  -- allowing cart commands to validate concurrently. The fixed table order is
  -- also used by every invocation, preventing mixed selection lock order.
  lock table public.research_products,
    public.research_product_variants,
    public.research_product_prices,
    public.research_required_inputs,
    public.research_domain_launch_controls,
    public.research_inventory_lots,
    public.research_lot_quality_documents,
    public.research_lot_quality_tests
    in share mode;
  if p_owner_kind='member' and p_selection->>'audience'='member' and not exists (
    select 1 from public.research_members m
    where m.id=p_owner_identity::uuid and m.status='active'
      and m.billing_state='active'
      and length(p_selection->'audienceEligibility'->>'sourceVersion')=64
      and p_selection->'audienceEligibility'->>'evaluatedAt'=p_selection->>'evaluatedAt'
    for update
  ) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:cart-selection:v1|product|' || (p_selection->>'productId')::uuid::text,0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:cart-selection:v1|variant|' || (p_selection->>'variantId')::uuid::text,0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:cart-selection:v1|price|' || (p_selection->'price'->>'id')::uuid::text,0));
  for v_input in
    select value from jsonb_array_elements(p_selection->'canonicalReadiness'->'inputVersions')
    order by value->>'id'
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'xenios:cart-selection:v1|required-input|' || (v_input->>'id')::uuid::text,0));
  end loop;
  for v_domain in
    select value from jsonb_array_elements(p_selection->'canonicalReadiness'->'domainVersions')
    order by value->>'domain'
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'xenios:cart-selection:v1|domain|' || (v_domain->>'domain'),0));
  end loop;
  if not exists (
    select 1
    from public.research_products p
    join public.research_product_variants v on v.product_id = p.id
    join public.research_product_prices r on r.product_id = p.id and r.variant_id = v.id
    where p.id = (p_selection->>'productId')::uuid
      and v.id = (p_selection->>'variantId')::uuid
      and v.sku = p_selection->>'sku'
      and p.admin_status = 'published' and p.active_state and p.visibility_state <> 'hidden'
      and p.commerce_approval='approved'
      and p.availability in ('in_stock','low_stock')
      and v.status = 'approved' and v.active
      and (p_selection->>'audience'<>'member' or v.member_eligible)
      and r.id = (p_selection->'price'->>'id')::uuid
      and r.audience = p_selection->>'audience'
      and r.amount_cents = (p_selection->'price'->>'amountCents')::bigint
      and r.currency = p_selection->'price'->>'currency'
      and r.version = (p_selection->'price'->>'version')::integer
      and r.status = 'active' and r.approved_by is not null
      and r.effective_at = (p_selection->'price'->>'effectiveAt')::timestamptz
      and r.expires_at is not distinct from nullif(p_selection->'price'->>'expiresAt','')::timestamptz
      and r.effective_at <= clock_timestamp()
      and (r.expires_at is null or r.expires_at > clock_timestamp())
    for update of p,v,r
  ) then return false; end if;
  if p_selection->'inventoryEligibility'->>'sourceVersion'
       is distinct from public.research_persistent_cart_inventory_source_version(
         (p_selection->>'productId')::uuid,
         (p_selection->>'variantId')::uuid,
         p_selection->>'sku',
         (p_selection->>'evaluatedAt')::timestamptz
       )
     or not exists (
       select 1
       from public.research_inventory_lots l
       where l.product_id = (p_selection->>'productId')::uuid
         and l.variant_id = (p_selection->>'variantId')::uuid
         and l.sku = p_selection->>'sku'
         and public.research_lot_is_allocatable(
           l.id,
           (p_selection->>'evaluatedAt')::timestamptz
         )
     )
     or not exists (
       select 1
       from public.research_inventory_lots l
       where l.product_id = (p_selection->>'productId')::uuid
         and l.variant_id = (p_selection->>'variantId')::uuid
         and l.sku = p_selection->>'sku'
         and public.research_lot_is_allocatable(l.id, clock_timestamp())
     )
  then return false; end if;
  if (
    select count(distinct value->>'id')
    from jsonb_array_elements(p_selection->'canonicalReadiness'->'inputVersions')
  ) <> jsonb_array_length(p_selection->'canonicalReadiness'->'inputVersions')
  then return false; end if;
  if (
    select count(distinct value->>'domain')
    from jsonb_array_elements(p_selection->'canonicalReadiness'->'domainVersions')
  ) <> jsonb_array_length(p_selection->'canonicalReadiness'->'domainVersions')
  then return false; end if;
  for v_input in select value from jsonb_array_elements(p_selection->'canonicalReadiness'->'inputVersions')
  loop
    if not exists (
      select 1 from public.research_required_inputs i
      where i.id = (v_input->>'id')::uuid
        and i.version = (v_input->>'version')::integer
        and i.record_id = p_selection->>'productId'
        and (i.key,i.domain,i.record_type) in (
          ('products.sku','products','product'),
          ('products.family','products','product'),
          ('product_content.storage_information','product_content','product')
        )
        and i.blocking_level = 'blocks_display'
        and i.current_state in ('verified','not_applicable')
      for update
    ) then return false; end if;
  end loop;
  if (
    select count(*) from public.research_required_inputs i
    where i.record_id=p_selection->>'productId'
      and i.current_state<>'superseded'
      and i.blocking_level='blocks_display'
      and (i.key,i.domain,i.record_type) in (
        ('products.sku','products','product'),
        ('products.family','products','product'),
        ('product_content.storage_information','product_content','product')
      )
  )<>3 then return false; end if;
  if exists (
    select 1 from public.research_required_inputs i
    where i.record_id=p_selection->>'productId' and i.current_state<>'superseded'
      and (i.key,i.domain,i.record_type) not in (
        ('products.sku','products','product'),
        ('products.family','products','product'),
        ('product_content.storage_information','product_content','product'),
        ('product_content.primary_image','product_content','product')
      )
  ) then return false; end if;
  if (
    select count(distinct (i.key,i.domain,i.record_type))
    from public.research_required_inputs i
    where i.id in (
      select (value->>'id')::uuid
      from jsonb_array_elements(p_selection->'canonicalReadiness'->'inputVersions')
    )
  )<>3 then return false; end if;
  for v_domain in select value from jsonb_array_elements(p_selection->'canonicalReadiness'->'domainVersions')
  loop
    if not exists (
      select 1 from public.research_domain_launch_controls d
      where d.domain = v_domain->>'domain'
        and d.domain in ('products','product_content')
        and d.version = (v_domain->>'version')::integer
        and d.launch_status = 'public_enabled' and d.software_complete
      for update
    ) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.research_persistent_cart_put_item(
  p_owner_kind text, p_owner_identity text, p_cart_id uuid,
  p_expected_cart_version bigint, p_expected_item_version bigint,
  p_quantity integer, p_selection jsonb, p_idempotency_key_hash text,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_scope text; v_hash text; v_replay public.research_persistent_cart_commands;
  v_cart public.research_persistent_carts; v_item public.research_persistent_cart_items;
  v_result jsonb; v_selection jsonb := p_selection - 'media';
begin
  if p_owner_kind is null or p_owner_kind not in ('member','anonymous')
     or p_quantity is null or p_quantity not between 1 and 1000
     or jsonb_typeof(p_selection) is distinct from 'object'
     or coalesce(p_idempotency_key_hash,'') !~ '^[a-f0-9]{64}$'
     or p_expires_at is null or p_expires_at <= clock_timestamp()
     or (p_owner_kind='anonymous' and coalesce(p_owner_identity,'') !~ '^[a-f0-9]{64}$')
     or (p_owner_kind='member' and coalesce(p_owner_identity,'')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'unauthorized';
  end if;
  v_scope := public.research_persistent_cart_owner_scope(p_owner_kind,p_owner_identity);
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'action','put','owner',v_scope,'cart',p_cart_id,'cartVersion',p_expected_cart_version,
    'itemVersion',p_expected_item_version,'quantity',p_quantity,'selection',v_selection,
    'expiresAt',p_expires_at)::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('xenios:cart:v1|' || v_scope,0));
  select * into v_replay from public.research_persistent_cart_commands
   where owner_scope_hash=v_scope and idempotency_key_hash=p_idempotency_key_hash for share;
  if not public.research_persistent_cart_selection_current(
    p_owner_kind,p_owner_identity,v_selection
  ) then
    raise exception 'selection_stale';
  end if;
  if v_replay.id is not null then
    if v_replay.command_hash <> v_hash then raise exception 'conflict'; end if;
    return v_replay.redacted_result;
  end if;
  select * into v_cart from public.research_persistent_carts
   where state='active' and ((p_owner_kind='member' and owner_kind='member' and member_id=p_owner_identity::uuid)
      or (p_owner_kind='anonymous' and owner_kind='anonymous' and anonymous_hash=p_owner_identity))
   for update;
  if not found then
    if p_cart_id is not null or p_expected_cart_version is not null then raise exception 'conflict'; end if;
    insert into public.research_persistent_carts(owner_kind,member_id,anonymous_hash,expires_at)
    values(p_owner_kind,case when p_owner_kind='member' then p_owner_identity::uuid end,
      case when p_owner_kind='anonymous' then p_owner_identity end,p_expires_at)
    returning * into v_cart;
    insert into public.research_persistent_cart_events(cart_id,event_type,actor_scope_hash,cart_version)
    values(v_cart.id,'cart_created',v_scope,v_cart.version);
  elsif v_cart.id is distinct from p_cart_id or v_cart.version is distinct from p_expected_cart_version
        or v_cart.expires_at <= clock_timestamp() then raise exception 'conflict';
  end if;
  select * into v_item from public.research_persistent_cart_items
    where cart_id=v_cart.id and variant_id=(v_selection->>'variantId')::uuid
      and audience=v_selection->>'audience' for update;
  if found and v_item.version is distinct from p_expected_item_version then raise exception 'conflict'; end if;
  if not found and p_expected_item_version is not null then raise exception 'conflict'; end if;
  if v_item.id is not null then
    update public.research_persistent_cart_items set
      quantity=p_quantity, sku=v_selection->>'sku',
      price_id=(v_selection->'price'->>'id')::uuid,
      price_amount_cents=(v_selection->'price'->>'amountCents')::bigint,
      price_currency=v_selection->'price'->>'currency',
      price_effective_at=(v_selection->'price'->>'effectiveAt')::timestamptz,
      price_expires_at=nullif(v_selection->'price'->>'expiresAt','')::timestamptz,
      price_version=(v_selection->'price'->>'version')::integer,
      selection_evaluated_at=(v_selection->>'evaluatedAt')::timestamptz,
      selection_snapshot=v_selection,
      selection_hash=encode(extensions.digest(convert_to(v_selection::text,'utf8'),'sha256'),'hex'),
      version=version+1, updated_at=clock_timestamp()
    where id=v_item.id returning * into v_item;
  else
    insert into public.research_persistent_cart_items(
      cart_id,product_id,variant_id,sku,audience,quantity,price_id,price_amount_cents,
      price_currency,price_effective_at,price_expires_at,price_version,
      selection_evaluated_at,selection_snapshot,selection_hash)
    values(v_cart.id,(v_selection->>'productId')::uuid,(v_selection->>'variantId')::uuid,
      v_selection->>'sku',v_selection->>'audience',p_quantity,
      (v_selection->'price'->>'id')::uuid,(v_selection->'price'->>'amountCents')::bigint,
      v_selection->'price'->>'currency',(v_selection->'price'->>'effectiveAt')::timestamptz,
      nullif(v_selection->'price'->>'expiresAt','')::timestamptz,
      (v_selection->'price'->>'version')::integer,(v_selection->>'evaluatedAt')::timestamptz,
      v_selection,encode(extensions.digest(convert_to(v_selection::text,'utf8'),'sha256'),'hex'))
    returning * into v_item;
  end if;
  update public.research_persistent_carts set version=version+1,
    expires_at=p_expires_at,updated_at=clock_timestamp() where id=v_cart.id returning * into v_cart;
  insert into public.research_persistent_cart_events(cart_id,item_id,event_type,actor_scope_hash,cart_version,item_version,
    metadata) values(v_cart.id,v_item.id,'item_put',v_scope,v_cart.version,v_item.version,
    jsonb_build_object('quantity',p_quantity,'selectionHash',v_item.selection_hash));
  v_result := public.research_persistent_cart_json(v_cart.id);
  insert into public.research_persistent_cart_commands(owner_scope_hash,idempotency_key_hash,command_hash,action,cart_id,redacted_result)
  values(v_scope,p_idempotency_key_hash,v_hash,'put',v_cart.id,v_result);
  return v_result;
end;
$$;

create or replace function public.research_persistent_cart_claim(
  p_member_id uuid, p_anonymous_hash text, p_selections jsonb,
  p_expected_anonymous_cart_version bigint,
  p_member_cart_id uuid, p_expected_member_cart_version bigint,
  p_idempotency_key_hash text, p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_anon public.research_persistent_carts; v_member public.research_persistent_carts;
 v_scope text; v_anon_scope text; v_hash text; v_replay public.research_persistent_cart_commands;
 v_row record; v_selection jsonb; v_selections jsonb; v_result jsonb;
begin
  if p_member_id is null
     or jsonb_typeof(p_selections) is distinct from 'array'
     or coalesce(p_anonymous_hash,'') !~ '^[a-f0-9]{64}$'
     or p_expected_anonymous_cart_version is null
     or p_expected_anonymous_cart_version < 1
     or (p_member_cart_id is null) is distinct from (p_expected_member_cart_version is null)
     or (p_expected_member_cart_version is not null and p_expected_member_cart_version < 1)
     or coalesce(p_idempotency_key_hash,'') !~ '^[a-f0-9]{64}$'
     or p_expires_at is null
     or p_expires_at<=clock_timestamp() then raise exception 'expired'; end if;
  if jsonb_array_length(p_selections) not between 1 and 100
     or exists (
       select 1 from jsonb_array_elements(p_selections) item
       where jsonb_typeof(item) is distinct from 'object'
     ) then raise exception 'expired'; end if;
  select coalesce(jsonb_agg(value - 'media' order by ordinal), '[]'::jsonb)
    into v_selections
  from jsonb_array_elements(p_selections) with ordinality as item(value, ordinal);
  v_scope:=public.research_persistent_cart_owner_scope('member',p_member_id::text);
  v_anon_scope:=public.research_persistent_cart_owner_scope('anonymous',p_anonymous_hash);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('action','claim','owner',v_scope,
    'anonymous',p_anonymous_hash,'selections',v_selections,
    'anonymousVersion',p_expected_anonymous_cart_version,
    'memberCart',p_member_cart_id,'memberVersion',p_expected_member_cart_version,'expiresAt',p_expires_at)::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('xenios:cart:v1|'||v_anon_scope,0));
  perform pg_advisory_xact_lock(hashtextextended('xenios:cart:v1|'||v_scope,0));
  select * into v_anon from public.research_persistent_carts
   where owner_kind='anonymous' and anonymous_hash=p_anonymous_hash for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_member from public.research_persistent_carts
   where owner_kind='member' and member_id=p_member_id and state='active' for update;
  for v_row in select * from public.research_persistent_cart_items
    where cart_id=v_anon.id order by variant_id,audience for update
  loop
    select value into v_selection from jsonb_array_elements(v_selections)
     where value->>'productId'=v_row.product_id::text
       and value->>'variantId'=v_row.variant_id::text
       and value->>'sku'=v_row.sku and value->>'audience'=v_row.audience;
    if not found or (
      select count(*) from jsonb_array_elements(v_selections)
       where value->>'productId'=v_row.product_id::text
         and value->>'variantId'=v_row.variant_id::text
         and value->>'sku'=v_row.sku and value->>'audience'=v_row.audience
    )<>1 or not public.research_persistent_cart_selection_current(
      'anonymous',p_anonymous_hash,v_selection
    ) then
      raise exception 'selection_stale';
    end if;
  end loop;
  if jsonb_array_length(v_selections)<>(select count(*) from public.research_persistent_cart_items where cart_id=v_anon.id)
  then raise exception 'conflict'; end if;
  select * into v_replay from public.research_persistent_cart_commands
   where owner_scope_hash=v_scope and idempotency_key_hash=p_idempotency_key_hash for share;
  if v_replay.id is not null then
    if v_replay.command_hash<>v_hash then raise exception 'conflict'; end if;
    return v_replay.redacted_result;
  end if;
  if v_anon.state is distinct from 'active'
     or v_anon.version is distinct from p_expected_anonymous_cart_version then
    raise exception 'already_claimed';
  end if;
  if v_anon.expires_at<=clock_timestamp() then raise exception 'expired'; end if;
  if v_member.id is null then
    if p_member_cart_id is not null or p_expected_member_cart_version is not null then raise exception 'conflict'; end if;
    insert into public.research_persistent_carts(owner_kind,member_id,expires_at)
      values('member',p_member_id,p_expires_at) returning * into v_member;
  elsif v_member.id is distinct from p_member_cart_id or v_member.version is distinct from p_expected_member_cart_version then
    raise exception 'conflict';
  end if;
  for v_row in select * from public.research_persistent_cart_items where cart_id=v_anon.id order by variant_id,audience
  loop
    select value into v_selection from jsonb_array_elements(v_selections)
     where value->>'productId'=v_row.product_id::text
       and value->>'variantId'=v_row.variant_id::text
       and value->>'sku'=v_row.sku and value->>'audience'=v_row.audience;
    if exists (
      select 1 from public.research_persistent_cart_items target
      where target.cart_id=v_member.id and target.variant_id=v_row.variant_id
        and target.audience=v_row.audience
        and target.quantity+v_row.quantity>1000
    ) then
      if exists (
        select 1 from public.research_persistent_cart_items target
        where target.cart_id=v_member.id and target.variant_id=v_row.variant_id
          and target.audience=v_row.audience and target.quantity+v_row.quantity>1000
      ) then raise exception 'quantity_limit'; end if;
    end if;
    insert into public.research_persistent_cart_items(
      cart_id,product_id,variant_id,sku,audience,quantity,price_id,price_amount_cents,price_currency,
      price_effective_at,price_expires_at,price_version,selection_evaluated_at,selection_snapshot,selection_hash)
    values(v_member.id,v_row.product_id,v_row.variant_id,v_row.sku,v_row.audience,v_row.quantity,
      (v_selection->'price'->>'id')::uuid,(v_selection->'price'->>'amountCents')::bigint,
      v_selection->'price'->>'currency',(v_selection->'price'->>'effectiveAt')::timestamptz,
      nullif(v_selection->'price'->>'expiresAt','')::timestamptz,
      (v_selection->'price'->>'version')::integer,(v_selection->>'evaluatedAt')::timestamptz,
      v_selection,encode(extensions.digest(convert_to(v_selection::text,'utf8'),'sha256'),'hex'))
    on conflict(cart_id,variant_id,audience) do update set
      quantity=public.research_persistent_cart_items.quantity+excluded.quantity,
      sku=excluded.sku,price_id=excluded.price_id,
      price_amount_cents=excluded.price_amount_cents,price_currency=excluded.price_currency,
      price_effective_at=excluded.price_effective_at,price_expires_at=excluded.price_expires_at,
      price_version=excluded.price_version,selection_evaluated_at=excluded.selection_evaluated_at,
      selection_snapshot=excluded.selection_snapshot,selection_hash=excluded.selection_hash,
      version=public.research_persistent_cart_items.version+1,updated_at=clock_timestamp();
  end loop;
  update public.research_persistent_carts set state='reconciled',reconciled_to_cart_id=v_member.id,
    version=version+1,updated_at=clock_timestamp() where id=v_anon.id;
  update public.research_persistent_carts set version=version+1,expires_at=p_expires_at,
    updated_at=clock_timestamp() where id=v_member.id returning * into v_member;
  insert into public.research_persistent_cart_events(cart_id,event_type,actor_scope_hash,cart_version,
    metadata) values(v_anon.id,'cart_claimed',v_scope,v_anon.version+1,jsonb_build_object('targetCartId',v_member.id));
  v_result:=public.research_persistent_cart_json(v_member.id);
  insert into public.research_persistent_cart_commands(owner_scope_hash,idempotency_key_hash,command_hash,action,cart_id,redacted_result)
   values(v_scope,p_idempotency_key_hash,v_hash,'claim',v_member.id,v_result);
  return v_result;
end;
$$;

-- Reclassify the exact legacy input for administrative truth. Changing what a
-- readiness manifest means invalidates the old approval: the canonical setter
-- must explicitly approve a new non-image manifest before a separate canonical
-- launch transition can re-enable product_content.
with changed as (
  update public.research_required_inputs
  set blocking_level = 'informational',
      version = version + 1,
      updated_at = clock_timestamp()
  where key = 'product_content.primary_image'
    and domain = 'product_content'
    and record_type = 'product'
    and blocking_level <> 'informational'
  returning *
)
insert into public.research_required_input_audit (
  required_input_id, from_state, to_state, actor, reason, snapshot, occurred_at
)
select id, current_state, current_state,
  'migration:20261001060000_research_media_commerce_decoupling',
  'Primary image reclassified as presentation-only; commerce authority is unchanged.',
  jsonb_build_object(
    'key', key,
    'domain', domain,
    'blockingLevel', blocking_level,
    'version', version,
    'commerceAuthority', false
  ),
  clock_timestamp()
from changed;

do $invalidate_manifest$
declare
  v_before public.research_domain_launch_controls;
  v_after public.research_domain_launch_controls;
begin
  select * into v_before
  from public.research_domain_launch_controls
  where domain = 'product_content'
  for update;
  if not found then
    raise exception 'Product-content launch control disappeared during readiness invalidation'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_PREDECESSOR_REQUIRED';
  end if;
  if v_before.launch_status = 'public_enabled' then
    raise exception 'Pause product_content before changing readiness semantics'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_PUBLIC_READINESS_PAUSE_REQUIRED';
  end if;
  update public.research_domain_launch_controls
  set manifest_version = null,
      manifest_hash = null,
      expected_input_count = null,
      manifest_approved_by = null,
      manifest_approved_at = null,
      release_approved_by = null,
      release_approved_at = null,
      version = version + 1,
      updated_by = 'migration:20261001060000_research_media_commerce_decoupling',
      updated_reason = 'Invalidated product_content manifest after making primary imagery presentation-only.',
      updated_at = clock_timestamp()
  where domain = 'product_content'
  returning * into v_after;
  if v_after.launch_status is distinct from v_before.launch_status
     or v_after.software_complete is distinct from v_before.software_complete
     or v_after.version is distinct from v_before.version + 1
     or v_after.manifest_version is not null
     or v_after.manifest_hash is not null
     or v_after.expected_input_count is not null
     or v_after.manifest_approved_by is not null
     or v_after.manifest_approved_at is not null
     or v_after.release_approved_by is not null
     or v_after.release_approved_at is not null then
    raise exception 'Product-content manifest invalidation postcondition failed'
      using errcode = '55000',
        detail = 'RESEARCH_MEDIA_COMMERCE_MANIFEST_INVALIDATION_FAILED';
  end if;
  insert into public.research_domain_launch_audit (
    domain, from_status, to_status, actor, reason, manifest_hash, occurred_at
  ) values (
    'product_content', v_before.launch_status, v_before.launch_status,
    'migration:20261001060000_research_media_commerce_decoupling',
    'Invalidated product_content manifest after making primary imagery presentation-only.',
    null, clock_timestamp()
  );
end
$invalidate_manifest$;

-- Restate the exact function boundary after CREATE OR REPLACE. The selection
-- helper is internal even to service_role; only the bounded command RPCs and
-- canonical readiness authorities remain service-role callable.
revoke all on function public.research_persistent_cart_selection_current(text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.research_persistent_cart_put_item(text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.research_persistent_cart_put_item(text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz)
  to service_role;
revoke all on function public.research_persistent_cart_claim(uuid,text,jsonb,bigint,uuid,bigint,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.research_persistent_cart_claim(uuid,text,jsonb,bigint,uuid,bigint,text,timestamptz)
  to service_role;
revoke all on function public.research_required_input_manifest_hash(text)
  from public, anon, authenticated, service_role;
grant execute on function public.research_required_input_manifest_hash(text)
  to service_role;
revoke all on function public.research_domain_readiness(text)
  from public, anon, authenticated, service_role;
grant execute on function public.research_domain_readiness(text)
  to service_role;
revoke all on function public.research_set_readiness_manifest(text,integer,integer,integer,boolean,text,text[],text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.research_set_readiness_manifest(text,integer,integer,integer,boolean,text,text[],text,timestamptz)
  to service_role;

do $postcheck$
declare
  v_body text;
  v_readiness jsonb;
  v_expected_count integer;
  v_expected_blocking integer;
  v_authority_owner oid;
  v_service_role oid;
begin
  v_service_role := pg_catalog.to_regrole('service_role');
  select c.relowner into v_authority_owner
  from pg_catalog.pg_class c
  where c.oid = 'public.research_persistent_carts'::regclass;
  select pg_catalog.replace(p.prosrc, E'\r\n', E'\n') into v_body
  from pg_catalog.pg_proc p
  where p.oid = 'public.research_persistent_cart_selection_current(text,text,jsonb)'::regprocedure;
  if pg_catalog.strpos(v_body, 'research_product_media') <> 0
     or pg_catalog.strpos(v_body, '->''media''') <> 0
     or pg_catalog.strpos(v_body,
       'jsonb_array_length(p_selection->''canonicalReadiness''->''inputVersions'') is distinct from 3') = 0
     or pg_catalog.strpos(v_body,
       'jsonb_array_length(p_selection->''canonicalReadiness''->''domainVersions'') is distinct from 2') = 0
     or pg_catalog.strpos(v_body, '(''product_content.storage_information'',''product_content'',''product'')') = 0 then
    raise exception 'Media-free selection authority postcondition failed'
      using errcode = '55000';
  end if;
  select pg_catalog.replace(p.prosrc, E'\r\n', E'\n') into v_body
  from pg_catalog.pg_proc p
  where p.oid = 'public.research_persistent_cart_put_item(text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz)'::regprocedure;
  if pg_catalog.strpos(v_body, 'p_selection - ''media''') = 0
     or pg_catalog.strpos(v_body, 'selection_snapshot=v_selection') = 0
     or pg_catalog.strpos(v_body, 'jsonb_typeof(p_selection) is distinct from ''object''') = 0 then
    raise exception 'Media-free put canonicalization postcondition failed'
      using errcode = '55000';
  end if;
  select pg_catalog.replace(p.prosrc, E'\r\n', E'\n') into v_body
  from pg_catalog.pg_proc p
  where p.oid = 'public.research_persistent_cart_claim(uuid,text,jsonb,bigint,uuid,bigint,text,timestamptz)'::regprocedure;
  if pg_catalog.strpos(v_body, 'value - ''media''') = 0
     or pg_catalog.strpos(v_body, '''selections'',v_selections') = 0
     or pg_catalog.strpos(v_body, 'jsonb_typeof(p_selections) is distinct from ''array''') = 0
     or pg_catalog.strpos(v_body,
       'v_anon.version is distinct from p_expected_anonymous_cart_version') = 0 then
    raise exception 'Media-free claim canonicalization postcondition failed'
      using errcode = '55000';
  end if;
  select pg_catalog.replace(p.prosrc, E'\r\n', E'\n') into v_body
  from pg_catalog.pg_proc p
  where p.oid = 'public.research_set_readiness_manifest(text,integer,integer,integer,boolean,text,text[],text,timestamptz)'::regprocedure;
  if pg_catalog.strpos(v_body, 'p_expected_version is null') = 0
     or pg_catalog.strpos(v_body,
       'v_before.version is distinct from p_expected_version') = 0 then
    raise exception 'Manifest optimistic-concurrency postcondition failed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid in (
      'public.research_persistent_cart_selection_current(text,text,jsonb)'::regprocedure,
      'public.research_persistent_cart_put_item(text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz)'::regprocedure,
      'public.research_persistent_cart_claim(uuid,text,jsonb,bigint,uuid,bigint,text,timestamptz)'::regprocedure,
      'public.research_required_input_manifest_hash(text)'::regprocedure,
      'public.research_domain_readiness(text)'::regprocedure,
      'public.research_set_readiness_manifest(text,integer,integer,integer,boolean,text,text[],text,timestamptz)'::regprocedure
    )
      and (p.prosecdef is not true
        or p.proconfig is distinct from array['search_path=pg_catalog']::text[]
        or p.proowner <> v_authority_owner)
  ) then
    raise exception 'Media/commerce function owner, definer, or search_path postcondition failed'
      using errcode = '55000';
  end if;

  if v_service_role is null or exists (
    with targets(signature, service_callable) as (values
      ('public.research_persistent_cart_selection_current(text,text,jsonb)', false),
      ('public.research_persistent_cart_put_item(text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz)', true),
      ('public.research_persistent_cart_claim(uuid,text,jsonb,bigint,uuid,bigint,text,timestamptz)', true),
      ('public.research_required_input_manifest_hash(text)', true),
      ('public.research_domain_readiness(text)', true),
      ('public.research_set_readiness_manifest(text,integer,integer,integer,boolean,text,text[],text,timestamptz)', true)
    ), functions as (
      select p.oid, p.proowner, p.proacl, t.service_callable
      from targets t
      join pg_catalog.pg_proc p
        on p.oid = pg_catalog.to_regprocedure(t.signature)
    ), actual as (
      select f.oid, acl.grantee, acl.privilege_type, acl.is_grantable
      from functions f
      cross join lateral pg_catalog.aclexplode(
        coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))
      ) acl
    ), required as (
      select f.oid, f.proowner as grantee, 'EXECUTE'::text as privilege_type,
        false as is_grantable
      from functions f
      union all
      select f.oid, v_service_role, 'EXECUTE'::text, false
      from functions f
      where f.service_callable
    ), drift as (
      (select * from actual except select * from required)
      union all
      (select * from required except select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'Media/commerce exact function ACL postcondition failed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'research_persistent_carts',
        'research_persistent_cart_items',
        'research_persistent_cart_commands',
        'research_persistent_cart_events'
      )
      and (c.relowner <> v_authority_owner
        or c.relrowsecurity is not true
        or c.relforcerowsecurity is not true)
  ) or exists (
    with targets(table_name) as (values
      ('research_persistent_carts'),
      ('research_persistent_cart_items'),
      ('research_persistent_cart_commands'),
      ('research_persistent_cart_events')
    ), relations as (
      select c.oid, c.relowner, c.relacl
      from targets t
      join pg_catalog.pg_class c on c.relname = t.table_name
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
    ), actual as (
      select r.oid, acl.grantee, acl.privilege_type, acl.is_grantable
      from relations r
      cross join lateral pg_catalog.aclexplode(
        coalesce(r.relacl, pg_catalog.acldefault('r', r.relowner))
      ) acl
    ), required as (
      -- acldefault keeps the exact owner privilege set portable across PG16/17.
      select r.oid, acl.grantee, acl.privilege_type, acl.is_grantable
      from relations r
      cross join lateral pg_catalog.aclexplode(
        pg_catalog.acldefault('r', r.relowner)
      ) acl
      where acl.grantee = r.relowner
      union all
      select r.oid, v_service_role, 'SELECT'::text, false
      from relations r
    ), drift as (
      (select * from actual except select * from required)
      union all
      (select * from required except select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'Persistent cart owner, RLS, or exact table ACL postcondition failed'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from public.research_required_inputs
    where key = 'product_content.primary_image'
      and domain = 'product_content'
      and record_type = 'product'
      and blocking_level <> 'informational'
  ) then
    raise exception 'Primary image remained a canonical blocker'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.research_domain_launch_controls
    where domain = 'product_content'
      and launch_status <> 'public_enabled'
      and manifest_version is null
      and manifest_hash is null
      and expected_input_count is null
      and manifest_approved_by is null
      and manifest_approved_at is null
      and release_approved_by is null
      and release_approved_at is null
      and updated_by = 'migration:20261001060000_research_media_commerce_decoupling'
  ) or not exists (
    select 1 from public.research_domain_launch_audit
    where domain = 'product_content'
      and from_status is not distinct from to_status
      and actor = 'migration:20261001060000_research_media_commerce_decoupling'
      and reason = 'Invalidated product_content manifest after making primary imagery presentation-only.'
      and manifest_hash is null
  ) then
    raise exception 'Product-content governance invalidation postcondition failed'
      using errcode = '55000';
  end if;
  select
    count(*) filter (where current_state <> 'superseded'),
    count(*) filter (
      where current_state not in ('verified','not_applicable','superseded')
        and blocking_level <> 'informational'
    )
  into v_expected_count, v_expected_blocking
  from public.research_required_inputs
  where domain = 'product_content'
    and not (
      key = 'product_content.primary_image'
      and domain = 'product_content'
      and record_type = 'product'
    );
  v_readiness := public.research_domain_readiness('product_content');
  if v_readiness->'manifestApproved' is distinct from 'false'::jsonb
     or v_readiness->'publicEnabled' is distinct from 'false'::jsonb
     or v_readiness->'expectedInputCount' is distinct from '0'::jsonb
     or v_readiness->'actualInputCount' is distinct from to_jsonb(v_expected_count)
     or v_readiness->'blockingInputCount' is distinct from to_jsonb(v_expected_blocking) then
    raise exception 'Invalidated non-image readiness postcondition failed'
      using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from public.research_persistent_carts)
       + (select pg_catalog.count(*) from public.research_persistent_cart_items)
       + (select pg_catalog.count(*) from public.research_persistent_cart_commands)
       + (select pg_catalog.count(*) from public.research_persistent_cart_events) <> 0 then
    raise exception 'Media/commerce candidate created persistent cart rows'
      using errcode = '55000';
  end if;
end
$postcheck$;

commit;
