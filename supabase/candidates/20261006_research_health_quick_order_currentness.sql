-- SOURCE-ONLY CANDIDATE. NOT REGISTERED, EXECUTED OR QUALIFIED.
-- Authority: REVIEW_CLEARED_WRAPPER_CONTRACT_20261006.md at b75325a.
-- Doc49 d9809c10: authority-table integrity within dc3329b / scope 1d4f2c3.
-- Doc51 retained normalized metadata; Doc71 adds the narrow bindings/configuration
-- raw-byte parser and sealed resolver. Other artifact references remain opaque.
-- Under research_health_quick_order_, currentness_ and authority_ are prefixes;
-- publish_revision, revoke_revision and read_current_authority are exact function
-- names. Doc71/Doc78 now author the disabled guard/strict-reader/activation family.
-- Refusal triggers protect ordinary owner DML, not a privileged administrator
-- changing or disabling the schema controls.
begin;
set local search_path = '';

do $currentness_candidate$
declare
  installed integer;
  actual_fingerprint pg_catalog.text;
  predecessor_fingerprint pg_catalog.text;
  expected_definition pg_catalog.text;
  expected_columns pg_catalog.text; actual_columns pg_catalog.text; source_trigger pg_catalog.record;
  seal pg_catalog.text;
  expected_triggers constant pg_catalog.jsonb := '[
    ["research_assisted_order_requests","research_assisted_order_paid_hold","O"],
    ["research_assisted_order_requests","hl12_observed_cancel","O"],
    ["research_assisted_order_requests","hl12_history_progression","O"],
    ["research_assisted_order_requests","aa_hl12_disposition_terminal","O"],
    ["research_assisted_order_requests","aaa_adp01_uncertainty","A"],
    ["research_assisted_order_requests","adp03_request_identity","A"],
    ["research_assisted_order_requests","adp03_evidence_truncate","A"],
    ["research_assisted_order_requests","adp03_evidence_immutable","A"],
    ["research_assisted_order_events","research_assisted_order_events_append_only","A"],
    ["research_assisted_order_events","research_assisted_order_paid_event_evidence","A"],
    ["research_assisted_order_events","hl12_disposition_cancel_event","O"],
    ["research_assisted_order_events","adp03_paid_event","A"],
    ["research_assisted_order_events","adp03_evidence_truncate","A"],
    ["research_assisted_order_events","adp03_evidence_immutable","A"],
    ["research_assisted_order_events","hl12_disposition_no_truncate","O"],
    ["research_notification_outbox","hl12_payment_effects_outbox_guard","A"],
    ["research_notification_outbox","hl12_payment_effects_outbox_truncate","A"],
    ["research_notification_outbox","hl12_disposition_effects_outbox","O"],
    ["research_notification_outbox","hl12_disposition_effects_truncate","O"]
  ]'::pg_catalog.jsonb;
  -- Exact catalog snapshot, including unknown overloads/relations in this slice's
  -- namespace. Does not seal the separately owned intake/replay/admin objects.
  fingerprint_sql pg_catalog.text := $currentness_fingerprint$
with owned_relations as (
  select c.* from pg_catalog.pg_class c
  where c.relnamespace = 'public'::pg_catalog.regnamespace
    and (c.relname like 'research\_health\_quick\_order\_authority\_%' escape '\'
      or c.relname like 'research\_health\_quick\_order\_currentness\_%' escape '\')
), owned_functions as (
  select p.* from pg_catalog.pg_proc p where p.pronamespace = 'public'::pg_catalog.regnamespace
    and (p.proname in ('research_health_quick_order_publish_revision',
      'research_health_quick_order_revoke_revision','research_health_quick_order_read_current_authority','research_health_quick_order_guard_source_write')
      or p.proname like 'research\_health\_quick\_order\_currentness\_%' escape '\')
)
select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
  'functions',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::pg_catalog.regprocedure::pg_catalog.text,pg_catalog.pg_get_functiondef(p.oid),
    p.proowner::pg_catalog.regrole::pg_catalog.text,p.proacl::pg_catalog.text) order by p.oid::pg_catalog.regprocedure::pg_catalog.text) from owned_functions p),
  'relations',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,c.relkind,c.relpersistence,c.relrowsecurity,
    c.relforcerowsecurity,c.relowner::pg_catalog.regrole::pg_catalog.text,c.relacl::pg_catalog.text,c.reloptions) order by c.relname) from owned_relations c),
  'columns',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),
    a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text,a.attacl::pg_catalog.text,
    pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
    from owned_relations c join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0
    left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum),
  'constraints',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,k.conname,pg_catalog.pg_get_constraintdef(k.oid,true),
    k.convalidated,k.condeferrable,k.condeferred) order by c.relname,k.conname)
    from owned_relations c join pg_catalog.pg_constraint k on k.conrelid=c.oid),
  'indexes',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,pg_catalog.pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready)
    order by c.relname,i.indexrelid::pg_catalog.regclass::pg_catalog.text) from owned_relations c join pg_catalog.pg_index i on i.indrelid=c.oid),
  'triggers',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true),t.tgenabled)
    order by c.relname,t.tgname) from owned_relations c join pg_catalog.pg_trigger t on t.tgrelid=c.oid
    where not t.tgisinternal),
  'sourceColumns',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text)
    order by c.relname,a.attnum) from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0
    where c.relnamespace='public'::pg_catalog.regnamespace and c.relname=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs'])),
  'sourceGuards',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.nspname,c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true),t.tgenabled,t.tgfoid::pg_catalog.regprocedure::pg_catalog.text,t.tgtype,t.tgnargs,t.tgargs,t.tgoldtable,t.tgnewtable,t.tgconstraint,t.tgdeferrable,t.tginitdeferred,pg_catalog.obj_description(t.oid,'pg_trigger'))
    order by n.nspname,c.relname,t.tgname) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and t.tgname like 'research\_health\_quick\_order\_guard\_%' escape '\'),
  'policies',(select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.tablename,p.policyname) from pg_catalog.pg_policies p
    where p.schemaname='public' and p.tablename in(select relname from owned_relations)),
  'rules',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,r.rulename,pg_catalog.pg_get_ruledef(r.oid),r.ev_enabled)
    order by c.relname,r.rulename) from owned_relations c join pg_catalog.pg_rewrite r on r.ev_class=c.oid),
  'types',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.typname,t.typtype,t.typowner::pg_catalog.regrole::pg_catalog.text,t.typacl::pg_catalog.text)
    order by t.typname) from pg_catalog.pg_type t where t.typnamespace='public'::pg_catalog.regnamespace
    and (t.typname like 'research\_health\_quick\_order\_authority\_%' escape '\'
      or t.typname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))
)::pg_catalog.text,'UTF8'),'sha256'),'hex');
$currentness_fingerprint$;
  install_sql pg_catalog.text := $currentness_install$
create function public.research_health_quick_order_currentness_valid_publication(p pg_catalog.jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $publication_shape$
declare a pg_catalog.jsonb; r pg_catalog.jsonb; instant pg_catalog.timestamptz; finish pg_catalog.timestamptz; kinds pg_catalog.text[] := '{}'; previous_ref pg_catalog.bytea;
begin
  if p is null or pg_catalog.jsonb_typeof(p)<>'object' or not p ?& array[
    'schemaVersion','revisionId','sourceCommit','bundleSha256','artifacts',
    'sourceRefs','applicabilityRefs','effectiveFrom','effectiveUntil']
    or p-array['schemaVersion','revisionId','sourceCommit','bundleSha256','artifacts',
      'sourceRefs','applicabilityRefs','effectiveFrom','effectiveUntil']<>'{}'::pg_catalog.jsonb then return false; end if;
  if (p->>'schemaVersion') collate pg_catalog."C" is distinct from 'quick-order-authority-v1'
    or pg_catalog.jsonb_typeof(p->'revisionId')<>'string' or (p->>'revisionId') collate pg_catalog."C" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or pg_catalog.jsonb_typeof(p->'sourceCommit')<>'string' or (p->>'sourceCommit') collate pg_catalog."C" !~ '^[0-9a-f]{40}$'
    or pg_catalog.jsonb_typeof(p->'bundleSha256')<>'string' or (p->>'bundleSha256') collate pg_catalog."C" !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p->'effectiveFrom')<>'string'
    or (p->>'effectiveFrom') collate pg_catalog."C" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or pg_catalog.jsonb_typeof(p->'effectiveUntil') not in ('string','null') then return false; end if;
  instant := (p->>'effectiveFrom')::pg_catalog.timestamptz;
  if pg_catalog.to_char(instant at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p->>'effectiveFrom' then return false; end if;
  if p->'effectiveUntil'<>'null'::pg_catalog.jsonb then
    if (p->>'effectiveUntil') collate pg_catalog."C" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then return false; end if;
    finish := (p->>'effectiveUntil')::pg_catalog.timestamptz;
    if finish<=instant or pg_catalog.to_char(finish at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p->>'effectiveUntil' then return false; end if;
  end if;
  if pg_catalog.jsonb_typeof(p->'artifacts')<>'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p->'artifacts')<>6 then return false; end if;
  for a in select value from pg_catalog.jsonb_array_elements(p->'artifacts') with ordinality as elements(value,ordinality) order by ordinality loop
    if pg_catalog.jsonb_typeof(a)<>'object' or not a ?& array['kind','path','sha256']
      or a-array['kind','path','sha256']<>'{}'::pg_catalog.jsonb
      or pg_catalog.jsonb_typeof(a->'kind')<>'string' or (a->>'kind') collate pg_catalog."C" not in
        ('catalog','bindings','reconciliation','health_legal','configuration','normalized_decision_inputs')
      or pg_catalog.jsonb_typeof(a->'path')<>'string' or (a->>'path') collate pg_catalog."C" !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$'
      or (a->>'path') collate pg_catalog."C" ~ '(^|/)\.{1,2}(/|$)|//|/$'
      or pg_catalog.jsonb_typeof(a->'sha256')<>'string' or (a->>'sha256') collate pg_catalog."C" !~ '^[0-9a-f]{64}$' then return false; end if;
    kinds := pg_catalog.array_append(kinds,a->>'kind');
  end loop;
  if not kinds @> array['catalog','bindings','reconciliation','health_legal','configuration','normalized_decision_inputs']
    or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p->'artifacts')) <>
       (select pg_catalog.count(distinct pg_catalog.convert_to(value->>'path','UTF8')) from pg_catalog.jsonb_array_elements(p->'artifacts')) then return false; end if;
  -- Source/applicability references are opaque reviewed record IDs, never URLs,
  -- customer facts, authority decisions or executable paths. Actual bytes are
  -- bound by artifacts. Only the Doc71 bindings/configuration raw carrier is
  -- parsed in SQL; these references neither approve artifacts nor fetch paths.
  for r in select p->'sourceRefs' union all select p->'applicabilityRefs' loop
    if pg_catalog.jsonb_typeof(r)<>'array' then return false; end if;
    if pg_catalog.jsonb_array_length(r) not between 1 and 32 then return false; end if;
    previous_ref := null;
    for a in select value from pg_catalog.jsonb_array_elements(r) with ordinality as elements(value,ordinality) order by ordinality loop
      if pg_catalog.jsonb_typeof(a)<>'string' or (a#>>'{}') collate pg_catalog."C" !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$' then return false; end if;
      if previous_ref is not null and previous_ref>=pg_catalog.convert_to(a#>>'{}','UTF8') then return false; end if;
      previous_ref := pg_catalog.convert_to(a#>>'{}','UTF8');
    end loop;
  end loop;
  return true;
exception when others then return false;
end
$publication_shape$;

-- Pure row-local metadata validation, not an artifact reader or policy authority.
-- This disclosed ASCII-only v1 refinement still requires exact-successor review.
-- The raw canonical text is retained; jsonb::text is never its serialization.
create function public.research_health_quick_order_currentness_valid_decision_inputs(p_text pg_catalog.text,p_publication pg_catalog.jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $decision_inputs_shape$
declare
  d pg_catalog.jsonb; a pg_catalog.jsonb; item pg_catalog.jsonb; r pg_catalog.jsonb; scalar pg_catalog.jsonb; quantity pg_catalog.jsonb; price pg_catalog.jsonb; destination pg_catalog.jsonb;
  field_name pg_catalog.text; s pg_catalog.text; previous_value pg_catalog.bytea; current_tuple pg_catalog.bytea[]; previous_tuple pg_catalog.bytea[];
  previous_kind pg_catalog.bytea; previous_pair pg_catalog.bytea[]; i integer;
  artifact_keys constant pg_catalog.text[] := array['catalog','bindings','reconciliation','healthLegal','configuration'];
  artifact_kinds constant pg_catalog.text[] := array['catalog','bindings','reconciliation','health_legal','configuration'];
  artifact_parts pg_catalog.text[] := '{}'; health_parts pg_catalog.text[] := '{}'; offer_parts pg_catalog.text[] := '{}';
  reference_parts pg_catalog.text[]; set_parts pg_catalog.text[]; values_text pg_catalog.text[];
  canonical pg_catalog.text; decision_digest pg_catalog.text; raw_bytes pg_catalog.bytea;
begin
  -- Enforce the byte ceiling before parsing, including on malformed/duplicate-key
  -- input. Reconstruction below rejects alternate escapes, keys, numeric forms,
  -- whitespace, BOM and newline rather than normalizing them into acceptance.
  if p_text is null then return false; end if;
  raw_bytes := pg_catalog.convert_to(p_text,'UTF8');
  if pg_catalog.octet_length(raw_bytes)>8388608 or pg_catalog.octet_length(raw_bytes)=0 then return false; end if;
  if public.research_health_quick_order_currentness_valid_publication(p_publication) is not true then return false; end if;
  d := p_text::pg_catalog.jsonb;
  if pg_catalog.jsonb_typeof(d) is distinct from 'object' or not d ?& array[
      'schemaVersion','revisionId','sourceCommit','effectiveFrom','effectiveUntil','artifacts',
      'configurationVersion','healthAgreements','offerRules','canonicalReaderProfile',
      'relationProjectionVersion','readerCensusSha256']
    or d-array['schemaVersion','revisionId','sourceCommit','effectiveFrom','effectiveUntil','artifacts',
      'configurationVersion','healthAgreements','offerRules','canonicalReaderProfile',
      'relationProjectionVersion','readerCensusSha256']<>'{}'::pg_catalog.jsonb then return false; end if;
  if (d->>'schemaVersion') collate pg_catalog."C" is distinct from 'quick-order-decision-inputs-v1'
    or (d->>'canonicalReaderProfile') collate pg_catalog."C" is distinct from 'quick-order-canonical-readers-v1'
    or (d->>'relationProjectionVersion') collate pg_catalog."C" is distinct from 'quick-order-relations-v1'
    or pg_catalog.jsonb_typeof(d->'readerCensusSha256') is distinct from 'string'
    or (d->>'readerCensusSha256') collate pg_catalog."C" !~ '^[0-9a-f]{64}$' then return false; end if;
  foreach field_name in array array['revisionId','sourceCommit','effectiveFrom','effectiveUntil'] loop
    if pg_catalog.jsonb_typeof(d->field_name) is distinct from pg_catalog.jsonb_typeof(p_publication->field_name)
      or pg_catalog.convert_to(d->>field_name,'UTF8') is distinct from pg_catalog.convert_to(p_publication->>field_name,'UTF8') then return false; end if;
  end loop;
  if pg_catalog.jsonb_typeof(d->'artifacts') is distinct from 'object'
    or not (d->'artifacts') ?& artifact_keys
    or (d->'artifacts')-artifact_keys<>'{}'::pg_catalog.jsonb then return false; end if;
  for i in 1..5 loop
    a := d->'artifacts'->artifact_keys[i];
    if pg_catalog.jsonb_typeof(a) is distinct from 'object' or not a ?& array['path','sha256']
      or a-array['path','sha256']<>'{}'::pg_catalog.jsonb then return false; end if;
    -- Exactly one matching kind is established by the six-kind publication gate.
    select value into item from pg_catalog.jsonb_array_elements(p_publication->'artifacts')
      where (value->>'kind') collate pg_catalog."C"=artifact_kinds[i];
    foreach field_name in array array['path','sha256'] loop
      if pg_catalog.jsonb_typeof(a->field_name) is distinct from 'string'
        or pg_catalog.convert_to(a->>field_name,'UTF8') is distinct from pg_catalog.convert_to(item->>field_name,'UTF8') then return false; end if;
    end loop;
    artifact_parts := pg_catalog.array_append(artifact_parts,pg_catalog.to_json(artifact_keys[i])::pg_catalog.text||':{"path":'||
      pg_catalog.to_json(a->>'path')::pg_catalog.text||',"sha256":'||pg_catalog.to_json(a->>'sha256')::pg_catalog.text||'}');
  end loop;
  if pg_catalog.jsonb_typeof(d->'configurationVersion') is distinct from 'string'
    or pg_catalog.convert_to(d->>'configurationVersion','UTF8') is distinct from
      pg_catalog.convert_to(d->'artifacts'->'configuration'->>'sha256','UTF8') then return false; end if;
  select value->>'sha256' into decision_digest from pg_catalog.jsonb_array_elements(p_publication->'artifacts')
    where (value->>'kind') collate pg_catalog."C"='normalized_decision_inputs';
  if pg_catalog.encode(extensions.digest(raw_bytes,'sha256'),'hex') collate pg_catalog."C" is distinct from decision_digest then return false; end if;

  if pg_catalog.jsonb_typeof(d->'healthAgreements') is distinct from 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(d->'healthAgreements') not between 1 and 30 then return false; end if;
  previous_tuple := null; previous_kind := null;
  for item in select value from pg_catalog.jsonb_array_elements(d->'healthAgreements') with ordinality as elements(value,ordinality) order by ordinality loop
    if pg_catalog.jsonb_typeof(item) is distinct from 'object'
      or not item ?& array['kind','version','sourceApprovalRefs','applicabilityRefs']
      or item-array['kind','version','sourceApprovalRefs','applicabilityRefs']<>'{}'::pg_catalog.jsonb then return false; end if;
    foreach field_name in array array['kind','version'] loop
      s := item->>field_name;
      if pg_catalog.jsonb_typeof(item->field_name) is distinct from 'string'
        or s collate pg_catalog."C" !~ '^[ -~]{1,64}$' or pg_catalog.left(s,1)=' ' or pg_catalog.right(s,1)=' '
        or pg_catalog.octet_length(pg_catalog.convert_to(s,'UTF8'))<>pg_catalog.char_length(s) then return false; end if;
    end loop;
    current_tuple := array[pg_catalog.convert_to(item->>'kind','UTF8'),pg_catalog.convert_to(item->>'version','UTF8')];
    if (previous_tuple is not null and previous_tuple>=current_tuple)
      or previous_kind= current_tuple[1] then return false; end if;
    previous_tuple := current_tuple; previous_kind := current_tuple[1];
    reference_parts := '{}';
    for i in 1..2 loop
      r := item->(case i when 1 then 'sourceApprovalRefs' else 'applicabilityRefs' end);
      if pg_catalog.jsonb_typeof(r) is distinct from 'array' then return false; end if;
      if pg_catalog.jsonb_array_length(r) not between 1 and 32 then return false; end if;
      previous_value := null; values_text := '{}';
      for scalar in select value from pg_catalog.jsonb_array_elements(r) with ordinality as elements(value,ordinality) order by ordinality loop
        s := scalar#>>'{}';
        if pg_catalog.jsonb_typeof(scalar) is distinct from 'string' or s collate pg_catalog."C" !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
          or not (p_publication->(case i when 1 then 'sourceRefs' else 'applicabilityRefs' end)) ? s
          or (previous_value is not null and previous_value>=pg_catalog.convert_to(s,'UTF8')) then return false; end if;
        previous_value := pg_catalog.convert_to(s,'UTF8'); values_text := pg_catalog.array_append(values_text,pg_catalog.to_json(s)::pg_catalog.text);
      end loop;
      reference_parts := pg_catalog.array_append(reference_parts,'['||pg_catalog.array_to_string(values_text,',')||']');
    end loop;
    health_parts := pg_catalog.array_append(health_parts,'{"kind":'||pg_catalog.to_json(item->>'kind')::pg_catalog.text||
      ',"version":'||pg_catalog.to_json(item->>'version')::pg_catalog.text||',"sourceApprovalRefs":'||reference_parts[1]||
      ',"applicabilityRefs":'||reference_parts[2]||'}');
  end loop;

  if pg_catalog.jsonb_typeof(d->'offerRules') is distinct from 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(d->'offerRules') not between 1 and 50000 then return false; end if;
  previous_tuple := null; previous_pair := null;
  for item in select value from pg_catalog.jsonb_array_elements(d->'offerRules') with ordinality as elements(value,ordinality) order by ordinality loop
    if pg_catalog.jsonb_typeof(item) is distinct from 'object' or not item ?& array[
        'offeringVariantId','productId','variantId','workflowModes','quantity','price','destination',
        'sourceApprovalRefs','applicabilityRefs']
      or item-array['offeringVariantId','productId','variantId','workflowModes','quantity','price',
        'destination','sourceApprovalRefs','applicabilityRefs']<>'{}'::pg_catalog.jsonb then return false; end if;
    foreach field_name in array array['offeringVariantId','productId','variantId'] loop
      s := item->>field_name;
      if pg_catalog.jsonb_typeof(item->field_name) is distinct from 'string' or s collate pg_catalog."C" !~ '^[!-~]{1,200}$'
        or pg_catalog.octet_length(pg_catalog.convert_to(s,'UTF8'))<>pg_catalog.char_length(s)
        or pg_catalog.convert_to(pg_catalog.left(s,8),'UTF8')=pg_catalog.convert_to('unbound:','UTF8') then return false; end if;
    end loop;
    current_tuple := array[pg_catalog.convert_to(item->>'productId','UTF8'),pg_catalog.convert_to(item->>'variantId','UTF8'),
      pg_catalog.convert_to(item->>'offeringVariantId','UTF8')];
    if (previous_tuple is not null and previous_tuple>=current_tuple)
      or previous_pair=current_tuple[1:2] then return false; end if;
    previous_tuple := current_tuple; previous_pair := current_tuple[1:2];
    quantity := item->'quantity'; price := item->'price'; destination := item->'destination';
    if pg_catalog.jsonb_typeof(quantity) is distinct from 'object' or not quantity ?& array['minimum','maximum','increment']
      or quantity-array['minimum','maximum','increment']<>'{}'::pg_catalog.jsonb then return false; end if;
    foreach field_name in array array['minimum','maximum','increment'] loop
      s := quantity->>field_name;
      if pg_catalog.jsonb_typeof(quantity->field_name) is distinct from 'number' or s collate pg_catalog."C" !~ '^[1-9][0-9]{0,5}$' then return false; end if;
      if s::integer>100000 then return false; end if;
    end loop;
    if (quantity->>'minimum')::integer>(quantity->>'maximum')::integer then return false; end if;
    if pg_catalog.jsonb_typeof(price) is distinct from 'object' or not price ?& array['currency','audiences','unpriced']
      or price-array['currency','audiences','unpriced']<>'{}'::pg_catalog.jsonb
      or (price->>'currency') collate pg_catalog."C" is distinct from 'USD'
      or pg_catalog.jsonb_typeof(price->'unpriced') is distinct from 'string'
      or (price->>'unpriced') collate pg_catalog."C" not in ('request_pricing','refuse') then return false; end if;
    if pg_catalog.jsonb_typeof(destination) is distinct from 'object' or not destination ?&
        array['countryCode','regions','sourceApprovalRefs','applicabilityRefs']
      or destination-array['countryCode','regions','sourceApprovalRefs','applicabilityRefs']<>'{}'::pg_catalog.jsonb
      or (destination->>'countryCode') collate pg_catalog."C" is distinct from 'US' then return false; end if;
    set_parts := '{}';
    for i in 1..3 loop
      r := case i when 1 then item->'workflowModes' when 2 then price->'audiences' else destination->'regions' end;
      if pg_catalog.jsonb_typeof(r) is distinct from 'array' then return false; end if;
      if pg_catalog.jsonb_array_length(r)<1 or pg_catalog.jsonb_array_length(r)>(case i when 1 then 2 when 2 then 5 else 51 end) then return false; end if;
      previous_value := null; values_text := '{}';
      for scalar in select value from pg_catalog.jsonb_array_elements(r) with ordinality as elements(value,ordinality) order by ordinality loop
        s := scalar#>>'{}';
        if pg_catalog.jsonb_typeof(scalar) is distinct from 'string'
          or (i=1 and s collate pg_catalog."C" not in ('direct_order_request','request_pricing'))
          or (i=2 and s collate pg_catalog."C" not in ('retail','member','professional','wholesale','private_early_access'))
          or (i=3 and s collate pg_catalog."C" not in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
            'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
            'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'))
          or (previous_value is not null and previous_value>=pg_catalog.convert_to(s,'UTF8')) then return false; end if;
        previous_value := pg_catalog.convert_to(s,'UTF8'); values_text := pg_catalog.array_append(values_text,pg_catalog.to_json(s)::pg_catalog.text);
      end loop;
      set_parts := pg_catalog.array_append(set_parts,'['||pg_catalog.array_to_string(values_text,',')||']');
    end loop;
    if ((price->>'unpriced') collate pg_catalog."C"='request_pricing') is distinct from ((item->'workflowModes') ? 'request_pricing') then return false; end if;
    reference_parts := '{}';
    for i in 1..4 loop
      a := case when i<=2 then destination else item end;
      r := a->(case when i in (1,3) then 'sourceApprovalRefs' else 'applicabilityRefs' end);
      if pg_catalog.jsonb_typeof(r) is distinct from 'array' then return false; end if;
      if pg_catalog.jsonb_array_length(r) not between 1 and 32 then return false; end if;
      previous_value := null; values_text := '{}';
      for scalar in select value from pg_catalog.jsonb_array_elements(r) with ordinality as elements(value,ordinality) order by ordinality loop
        s := scalar#>>'{}';
        if pg_catalog.jsonb_typeof(scalar) is distinct from 'string' or s collate pg_catalog."C" !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
          or not (p_publication->(case when i in (1,3) then 'sourceRefs' else 'applicabilityRefs' end)) ? s
          or (previous_value is not null and previous_value>=pg_catalog.convert_to(s,'UTF8')) then return false; end if;
        previous_value := pg_catalog.convert_to(s,'UTF8'); values_text := pg_catalog.array_append(values_text,pg_catalog.to_json(s)::pg_catalog.text);
      end loop;
      reference_parts := pg_catalog.array_append(reference_parts,'['||pg_catalog.array_to_string(values_text,',')||']');
    end loop;
    offer_parts := pg_catalog.array_append(offer_parts,'{"offeringVariantId":'||pg_catalog.to_json(item->>'offeringVariantId')::pg_catalog.text||
      ',"productId":'||pg_catalog.to_json(item->>'productId')::pg_catalog.text||',"variantId":'||pg_catalog.to_json(item->>'variantId')::pg_catalog.text||
      ',"workflowModes":'||set_parts[1]||',"quantity":{"minimum":'||(quantity->>'minimum')||
      ',"maximum":'||(quantity->>'maximum')||',"increment":'||(quantity->>'increment')||'}'||
      ',"price":{"currency":"USD","audiences":'||set_parts[2]||',"unpriced":'||pg_catalog.to_json(price->>'unpriced')::pg_catalog.text||'}'||
      ',"destination":{"countryCode":"US","regions":'||set_parts[3]||',"sourceApprovalRefs":'||reference_parts[1]||
      ',"applicabilityRefs":'||reference_parts[2]||'},"sourceApprovalRefs":'||reference_parts[3]||
      ',"applicabilityRefs":'||reference_parts[4]||'}');
  end loop;
  -- The tuple order makes repeated product/variant pairs adjacent; offering IDs
  -- need a separate set check because they may recur under another product.
  if pg_catalog.jsonb_array_length(d->'offerRules')<>(select pg_catalog.count(distinct pg_catalog.convert_to(value->>'offeringVariantId','UTF8'))
      from pg_catalog.jsonb_array_elements(d->'offerRules')) then return false; end if;
  canonical := '{"schemaVersion":"quick-order-decision-inputs-v1","revisionId":'||pg_catalog.to_json(d->>'revisionId')::pg_catalog.text||
    ',"sourceCommit":'||pg_catalog.to_json(d->>'sourceCommit')::pg_catalog.text||',"effectiveFrom":'||pg_catalog.to_json(d->>'effectiveFrom')::pg_catalog.text||
    ',"effectiveUntil":'||coalesce(pg_catalog.to_json(d->>'effectiveUntil')::pg_catalog.text,'null')||
    ',"artifacts":{'||pg_catalog.array_to_string(artifact_parts,',')||'},"configurationVersion":'||pg_catalog.to_json(d->>'configurationVersion')::pg_catalog.text||
    ',"healthAgreements":['||pg_catalog.array_to_string(health_parts,',')||'],"offerRules":['||pg_catalog.array_to_string(offer_parts,',')||']'||
    ',"canonicalReaderProfile":"quick-order-canonical-readers-v1","relationProjectionVersion":"quick-order-relations-v1"'||
    ',"readerCensusSha256":'||pg_catalog.to_json(d->>'readerCensusSha256')::pg_catalog.text||'}';
  return raw_bytes=pg_catalog.convert_to(canonical,'UTF8');
exception when others then return false;
end
$decision_inputs_shape$;

create table public.research_health_quick_order_authority_revisions (
  revision_id pg_catalog.uuid primary key,
  publication pg_catalog.jsonb not null,
  decision_inputs_text pg_catalog.text not null,
  published_at pg_catalog.timestamptz not null default pg_catalog.clock_timestamp(),
  published_by pg_catalog.name not null default current_user,
  constraint research_health_quick_order_authority_revision_shape check
    (public.research_health_quick_order_currentness_valid_publication(publication)
      and revision_id=(publication->>'revisionId')::pg_catalog.uuid),
  constraint research_health_quick_order_decision_inputs_shape check
    (public.research_health_quick_order_currentness_valid_decision_inputs(decision_inputs_text,publication) is true)
);
create table public.research_health_quick_order_authority_head (
  singleton boolean primary key default true check(singleton),
  writer_epoch bigint not null default 0 check(writer_epoch>=0),
  state pg_catalog.text not null default 'held' check(state in ('held','active')),
  active_revision_id pg_catalog.uuid constraint research_health_quick_order_head_active_revision_fk
    references public.research_health_quick_order_authority_revisions(revision_id) on delete restrict,
  last_published_revision_id pg_catalog.uuid constraint research_health_quick_order_head_published_revision_fk
    references public.research_health_quick_order_authority_revisions(revision_id) on delete restrict,
  last_revoked_revision_id pg_catalog.uuid constraint research_health_quick_order_head_revoked_revision_fk
    references public.research_health_quick_order_authority_revisions(revision_id) on delete restrict,
  last_revoke_reason pg_catalog.text,
  updated_at pg_catalog.timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by pg_catalog.name not null default current_user,
  constraint research_health_quick_order_authority_head_state check
    ((state='held' and active_revision_id is null) or (state='active' and active_revision_id is not null)),
  constraint research_health_quick_order_authority_head_revoke check
    ((last_revoked_revision_id is null and last_revoke_reason is null)
      or (last_revoked_revision_id is not null and last_revoke_reason ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'))
);
alter table public.research_health_quick_order_authority_revisions enable row level security;
alter table public.research_health_quick_order_authority_head enable row level security;
alter table public.research_health_quick_order_authority_head force row level security;
alter table public.research_health_quick_order_authority_revisions force row level security;
revoke all on public.research_health_quick_order_authority_revisions,
  public.research_health_quick_order_authority_head from public,anon,authenticated,service_role;

-- The canonical nineteen predecessor triggers remain unchanged. Exactly twelve
-- admitted source relations receive the sealed guards defined below.

-- DOC71/DOC78 disabled-source extension. These are provenance records, not a
-- second catalog/legal authority. Only bindings/configuration raw bytes enter SQL.
create table public.research_health_quick_order_currentness_scope_inputs (
  revision_id pg_catalog.uuid primary key,
  source_commit pg_catalog.text not null check(source_commit ~ '^[0-9a-f]{40}$'),
  decision_text_sha256 pg_catalog.text not null check(decision_text_sha256 ~ '^[0-9a-f]{64}$'),
  reader_census_sha256 pg_catalog.text not null check(reader_census_sha256 ~ '^[0-9a-f]{64}$'),
  canonical_reader_profile pg_catalog.text not null check(canonical_reader_profile='quick-order-canonical-readers-v1'),
  artifacts pg_catalog.jsonb not null check((pg_catalog.jsonb_typeof(artifacts)='array' and pg_catalog.jsonb_array_length(artifacts)=5
    and pg_catalog.jsonb_typeof(artifacts->0)='object'
    and (artifacts->0) ?& array['kind','path','sha256'] and (artifacts->0)-array['kind','path','sha256']='{}'::pg_catalog.jsonb
    and artifacts#>'{0,kind}'=pg_catalog.to_jsonb('catalog'::pg_catalog.text)
    and pg_catalog.jsonb_typeof(artifacts#>'{0,path}')='string'
    and (artifacts#>>'{0,path}') ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$'
    and (artifacts#>>'{0,path}') !~ '(^|/)\.{1,2}(/|$)|//|/$'
    and pg_catalog.jsonb_typeof(artifacts#>'{0,sha256}')='string'
    and (artifacts#>>'{0,sha256}') ~ '^[0-9a-f]{64}$'
    and pg_catalog.jsonb_typeof(artifacts->1)='object'
    and (artifacts->1) ?& array['kind','path','sha256'] and (artifacts->1)-array['kind','path','sha256']='{}'::pg_catalog.jsonb
    and artifacts#>'{1,kind}'=pg_catalog.to_jsonb('bindings'::pg_catalog.text)
    and pg_catalog.jsonb_typeof(artifacts#>'{1,path}')='string'
    and (artifacts#>>'{1,path}') ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$'
    and (artifacts#>>'{1,path}') !~ '(^|/)\.{1,2}(/|$)|//|/$'
    and pg_catalog.jsonb_typeof(artifacts#>'{1,sha256}')='string'
    and (artifacts#>>'{1,sha256}') ~ '^[0-9a-f]{64}$'
    and pg_catalog.jsonb_typeof(artifacts->2)='object'
    and (artifacts->2) ?& array['kind','path','sha256'] and (artifacts->2)-array['kind','path','sha256']='{}'::pg_catalog.jsonb
    and artifacts#>'{2,kind}'=pg_catalog.to_jsonb('reconciliation'::pg_catalog.text)
    and pg_catalog.jsonb_typeof(artifacts#>'{2,path}')='string'
    and (artifacts#>>'{2,path}') ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$'
    and (artifacts#>>'{2,path}') !~ '(^|/)\.{1,2}(/|$)|//|/$'
    and pg_catalog.jsonb_typeof(artifacts#>'{2,sha256}')='string'
    and (artifacts#>>'{2,sha256}') ~ '^[0-9a-f]{64}$'
    and pg_catalog.jsonb_typeof(artifacts->3)='object'
    and (artifacts->3) ?& array['kind','path','sha256'] and (artifacts->3)-array['kind','path','sha256']='{}'::pg_catalog.jsonb
    and artifacts#>'{3,kind}'=pg_catalog.to_jsonb('health_legal'::pg_catalog.text)
    and pg_catalog.jsonb_typeof(artifacts#>'{3,path}')='string'
    and (artifacts#>>'{3,path}') ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$'
    and (artifacts#>>'{3,path}') !~ '(^|/)\.{1,2}(/|$)|//|/$'
    and pg_catalog.jsonb_typeof(artifacts#>'{3,sha256}')='string'
    and (artifacts#>>'{3,sha256}') ~ '^[0-9a-f]{64}$'
    and pg_catalog.jsonb_typeof(artifacts->4)='object'
    and (artifacts->4) ?& array['kind','path','sha256'] and (artifacts->4)-array['kind','path','sha256']='{}'::pg_catalog.jsonb
    and artifacts#>'{4,kind}'=pg_catalog.to_jsonb('configuration'::pg_catalog.text)
    and pg_catalog.jsonb_typeof(artifacts#>'{4,path}')='string'
    and (artifacts#>>'{4,path}') ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$'
    and (artifacts#>>'{4,path}') !~ '(^|/)\.{1,2}(/|$)|//|/$'
    and pg_catalog.jsonb_typeof(artifacts#>'{4,sha256}')='string'
    and (artifacts#>>'{4,sha256}') ~ '^[0-9a-f]{64}$') is true),
  construction_receipt pg_catalog.text not null check(construction_receipt ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$'),
  construction_receipt_sha256 pg_catalog.text not null check(construction_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  bindings_raw pg_catalog.bytea not null check(pg_catalog.octet_length(bindings_raw) between 1 and 4194304),
  configuration_raw pg_catalog.bytea not null check(pg_catalog.octet_length(configuration_raw) between 1 and 262144),
  check(pg_catalog.octet_length(bindings_raw)+pg_catalog.octet_length(configuration_raw)<=4456448)
);
-- The owner supplies RHQOC_APPROVED_LIMITS_V1:<SHA-256 of the exact approved_limits
-- setting value, unrelated to configuration_raw>
-- as this relation's comment under separate installation authority. No value is
-- supplied by this candidate. This deployment anchor is excluded from the source
-- fingerprint; its name, owner, parser and consumption are definition-bound.
create table public.research_health_quick_order_authority_activations (
  revision_id pg_catalog.uuid not null references public.research_health_quick_order_authority_revisions(revision_id) on delete restrict,
  writer_epoch bigint not null unique check(writer_epoch>0),
  source_commit pg_catalog.text not null check(source_commit ~ '^[0-9a-f]{40}$'),
  reader_census_sha256 pg_catalog.text not null check(reader_census_sha256 ~ '^[0-9a-f]{64}$'),
  activated_at pg_catalog.timestamptz not null,
  activated_by pg_catalog.name not null,
  primary key(revision_id,writer_epoch)
);
-- R2-5: a revision's revocation survives later revocations and head changes.
create table public.research_health_quick_order_authority_revocations (
  revision_id pg_catalog.uuid primary key references public.research_health_quick_order_authority_revisions(revision_id) on delete restrict,
  writer_epoch bigint not null unique check(writer_epoch>0),
  reason pg_catalog.text not null check(reason ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  revoked_at pg_catalog.timestamptz not null,
  revoked_by pg_catalog.name not null
);
create table public.research_health_quick_order_authority_scope_members (
  revision_id pg_catalog.uuid not null references public.research_health_quick_order_authority_revisions(revision_id) on delete restrict,
  row_kind pg_catalog.text not null check(row_kind in ('header','product','variant','lot','document','domain','country')),
  identity_key pg_catalog.text not null,
  product_id pg_catalog.uuid,
  variant_id pg_catalog.uuid,
  lot_uuid pg_catalog.uuid,
  document_uuid pg_catalog.uuid,
  offering_variant_id pg_catalog.text check(offering_variant_id is null or pg_catalog.octet_length(offering_variant_id) between 1 and 200),
  product_identifier pg_catalog.text,
  variant_identifier pg_catalog.text,
  domain pg_catalog.text check(domain is null or (pg_catalog.octet_length(domain) between 1 and 253 and domain ~ '^[a-z0-9][a-z0-9_-]*$')),
  country pg_catalog.text check(country is null or country ~ '^[A-Z]{2}$'),
  provenance pg_catalog.jsonb not null,
  primary key(revision_id,row_kind,identity_key),
  constraint research_health_quick_order_scope_shape check (
    (row_kind='header' and identity_key='header' and product_id is null and variant_id is null and lot_uuid is null
      and document_uuid is null and offering_variant_id is null and product_identifier is null and variant_identifier is null
      and domain is null and country is null)
    or (row_kind='product' and identity_key=product_id::pg_catalog.text and product_id is not null and variant_id is null and lot_uuid is null
      and document_uuid is null and offering_variant_id is null and product_identifier is not null and variant_identifier is null
      and domain is null and country is null)
    or (row_kind='variant' and identity_key=variant_id::pg_catalog.text and product_id is not null and variant_id is not null and lot_uuid is null
      and document_uuid is null and offering_variant_id is not null and product_identifier is not null and variant_identifier is not null
      and domain is null and country is null)
    or (row_kind='lot' and identity_key=lot_uuid::pg_catalog.text and lot_uuid is not null and document_uuid is null
      and (product_id is not null or variant_id is not null)
      and offering_variant_id is null and product_identifier is null and variant_identifier is null and domain is null and country is null)
    or (row_kind='document' and identity_key=document_uuid::pg_catalog.text and document_uuid is not null and lot_uuid is not null
      and (product_id is not null or variant_id is not null)
      and offering_variant_id is null and product_identifier is null and variant_identifier is null and domain is null and country is null)
    or (row_kind='domain' and identity_key=domain and domain is not null and product_id is null and variant_id is null
      and lot_uuid is null and document_uuid is null and offering_variant_id is null and product_identifier is null and variant_identifier is null and country is null)
    or (row_kind='country' and identity_key=country and country is not null and product_id is null and variant_id is null
      and lot_uuid is null and document_uuid is null and offering_variant_id is null and product_identifier is null and variant_identifier is null and domain is null)
  ),
  check(pg_catalog.jsonb_typeof(provenance)='object')
);
create unique index research_health_quick_order_scope_offer_unique on public.research_health_quick_order_authority_scope_members(revision_id,offering_variant_id) where row_kind='variant';
create unique index research_health_quick_order_scope_variant_unique on public.research_health_quick_order_authority_scope_members(revision_id,product_id,variant_id) where row_kind='variant';
create index research_health_quick_order_scope_product_id_idx on public.research_health_quick_order_authority_scope_members(revision_id,product_id);
create index research_health_quick_order_scope_variant_id_idx on public.research_health_quick_order_authority_scope_members(revision_id,variant_id);
create index research_health_quick_order_scope_lot_uuid_idx on public.research_health_quick_order_authority_scope_members(revision_id,lot_uuid);
create index research_health_quick_order_scope_document_uuid_idx on public.research_health_quick_order_authority_scope_members(revision_id,document_uuid);
create index research_health_quick_order_scope_domain_idx on public.research_health_quick_order_authority_scope_members(revision_id,domain);
create index research_health_quick_order_scope_country_idx on public.research_health_quick_order_authority_scope_members(revision_id,country);
create index research_health_quick_order_scope_document_lot_idx on public.research_health_quick_order_authority_scope_members(revision_id,lot_uuid) where row_kind='document';
alter table public.research_health_quick_order_currentness_scope_inputs enable row level security;
alter table public.research_health_quick_order_currentness_scope_inputs force row level security;
revoke all on public.research_health_quick_order_currentness_scope_inputs from public,anon,authenticated,service_role;
alter table public.research_health_quick_order_authority_activations enable row level security;
alter table public.research_health_quick_order_authority_activations force row level security;
revoke all on public.research_health_quick_order_authority_activations from public,anon,authenticated,service_role;
alter table public.research_health_quick_order_authority_revocations enable row level security;
alter table public.research_health_quick_order_authority_revocations force row level security;
revoke all on public.research_health_quick_order_authority_revocations from public,anon,authenticated,service_role;
alter table public.research_health_quick_order_authority_scope_members enable row level security;
alter table public.research_health_quick_order_authority_scope_members force row level security;
revoke all on public.research_health_quick_order_authority_scope_members from public,anon,authenticated,service_role;

create function public.research_health_quick_order_currentness_refuse_mutation()
returns pg_catalog.trigger language plpgsql security invoker set search_path='' as $refuse_history_mutation$
begin
  -- One named BEFORE INSERT seal guard; no new helper or mutable cache. Member
  -- rows precede their header, and any INSERT after it refuses, including header.
  if tg_op='INSERT' and tg_relid='public.research_health_quick_order_authority_scope_members'::pg_catalog.regclass
    and tg_when='BEFORE' and tg_level='ROW' and tg_nargs=0 then
    if exists(select 1 from public.research_health_quick_order_authority_scope_members
      where revision_id=new.revision_id and row_kind='header') then
      raise exception 'Quick Order sealed scope insertion refused' using errcode='55000'; end if;
    return new;
  end if;
  raise exception 'Quick Order authority history mutation refused' using errcode='55000';
end
$refuse_history_mutation$;
create function public.research_health_quick_order_currentness_monotonic_epoch()
returns pg_catalog.trigger language plpgsql security invoker set search_path='' as $monotonic_epoch$
begin
  if not exists(select 1 from pg_catalog.pg_locks l where l.locktype='advisory'
    and l.database=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())
    and l.pid=pg_catalog.pg_backend_pid() and l.classid=1380471107::pg_catalog.oid and l.objid=1::pg_catalog.oid
    and l.objsubid=2 and l.mode='ExclusiveLock' and l.granted) then
    raise exception 'Quick Order exclusive authority gate required' using errcode='55000'; end if;
  -- pg_catalog.pg_locks proves own-backend/key/mode, not session-versus-xact ownership.
  -- Only sealed xact APIs are admitted; owner session-lock DML is out of scope.
  if new.writer_epoch is null or new.writer_epoch<old.writer_epoch
    or (row(new.state,new.active_revision_id,new.last_published_revision_id,new.last_revoked_revision_id,new.last_revoke_reason)
      is distinct from row(old.state,old.active_revision_id,old.last_published_revision_id,old.last_revoked_revision_id,old.last_revoke_reason)
      and new.writer_epoch<=old.writer_epoch) then
    raise exception 'Quick Order authority epoch increase required' using errcode='55000'; end if;
  return new;
end
$monotonic_epoch$;
create trigger research_health_quick_order_revisions_immutable
  before update or delete or truncate on public.research_health_quick_order_authority_revisions
  for each statement execute function public.research_health_quick_order_currentness_refuse_mutation();
create trigger research_health_quick_order_head_removal_guard
  before delete or truncate on public.research_health_quick_order_authority_head
  for each statement execute function public.research_health_quick_order_currentness_refuse_mutation();
create trigger research_health_quick_order_head_epoch_monotonic
  before update on public.research_health_quick_order_authority_head
  for each row execute function public.research_health_quick_order_currentness_monotonic_epoch();
alter table public.research_health_quick_order_authority_revisions
  enable always trigger research_health_quick_order_revisions_immutable;
alter table public.research_health_quick_order_authority_head
  enable always trigger research_health_quick_order_head_removal_guard;
alter table public.research_health_quick_order_authority_head
  enable always trigger research_health_quick_order_head_epoch_monotonic;

create trigger research_health_quick_order_history_immutable_0
  before update or delete or truncate on public.research_health_quick_order_currentness_scope_inputs
  for each statement execute function public.research_health_quick_order_currentness_refuse_mutation();
alter table public.research_health_quick_order_currentness_scope_inputs enable always trigger research_health_quick_order_history_immutable_0;
create trigger research_health_quick_order_history_immutable_1
  before update or delete or truncate on public.research_health_quick_order_authority_activations
  for each statement execute function public.research_health_quick_order_currentness_refuse_mutation();
alter table public.research_health_quick_order_authority_activations enable always trigger research_health_quick_order_history_immutable_1;
create trigger research_health_quick_order_history_immutable_2
  before update or delete or truncate on public.research_health_quick_order_authority_revocations
  for each statement execute function public.research_health_quick_order_currentness_refuse_mutation();
alter table public.research_health_quick_order_authority_revocations enable always trigger research_health_quick_order_history_immutable_2;
create trigger research_health_quick_order_history_immutable_3
  before update or delete or truncate on public.research_health_quick_order_authority_scope_members
  for each statement execute function public.research_health_quick_order_currentness_refuse_mutation();
alter table public.research_health_quick_order_authority_scope_members enable always trigger research_health_quick_order_history_immutable_3;
create trigger research_health_quick_order_scope_insert_seal before insert on public.research_health_quick_order_authority_scope_members
  for each row execute function public.research_health_quick_order_currentness_refuse_mutation();
alter table public.research_health_quick_order_authority_scope_members enable always trigger research_health_quick_order_scope_insert_seal;

-- The install transaction creates the one pristine HELD head.
insert into public.research_health_quick_order_authority_head(singleton) values(true);

create function public.research_health_quick_order_currentness_integrity()
returns pg_catalog.void language plpgsql volatile security invoker set search_path='' as $currentness_integrity$
declare seal pg_catalog.text; obj pg_catalog.record; role_name pg_catalog.text; actual_columns pg_catalog.text; source_column_descriptor_seal constant pg_catalog.text := null;
begin
  if source_column_descriptor_seal is null then
    raise exception 'Quick Order accepted S/census source-column descriptor not yet bound' using errcode='55000'; end if;
  -- DOC80_SOURCE_STRUCTURE_BEGIN: identical in install/reapply, pre/post,
  -- runtime integrity and rollback. Columns are pinned by the independently
  -- accepted descriptor and trigger comments; common owner by integrity's owner
  -- predicate. Source defaults/constraints/indexes/RLS/ACL are NOT adopted (MD640).
  if (with guarded as (select c.* from pg_catalog.pg_class c
      where c.relnamespace='public'::pg_catalog.regnamespace and c.relname=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs']))
    select pg_catalog.count(*)<>12 or coalesce(pg_catalog.bool_or(relkind<>'r' or relispartition),false)
      or exists(select 1 from pg_catalog.pg_inherits i where i.inhrelid in(select oid from guarded) or i.inhparent in(select oid from guarded))
      or exists(select 1 from pg_catalog.pg_rewrite r where r.ev_class in(select oid from guarded))
      or exists(select 1 from pg_catalog.pg_subscription_rel r where r.srrelid in(select oid from guarded))
    from guarded) then
    raise exception 'Quick Order source relation structure drift' using errcode='55000'; end if;
  -- DOC80_SOURCE_STRUCTURE_END
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.string_agg(
    c.relname||':'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attnum,a.attname,
    pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text)
    order by a.attnum)::pg_catalog.text from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0),'[]'),'UTF8'),'sha256'),'hex'),E'\n' order by c.relname collate pg_catalog."C"),'UTF8'),'sha256'),'hex') into actual_columns
    from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and c.relname=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs']);
  if source_column_descriptor_seal !~ '^[0-9a-f]{64}$'
    or source_column_descriptor_seal is distinct from actual_columns then
    raise exception 'Quick Order source-column descriptor drift' using errcode='55000'; end if;
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
    or pg_catalog.current_setting('server_version_num')::integer < 170011 then
    raise exception 'Quick Order requires reviewed PostgreSQL 17.11 or later 17.x' using errcode='55000'; end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Quick Order requires READ COMMITTED' using errcode='55000'; end if;
  if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Quick Order privileged common owner required' using errcode='42501'; end if;
  if exists(select 1 from pg_catalog.pg_class c where c.oid=any(array[
    'public.research_domain_launch_controls'::pg_catalog.regclass,'public.research_early_access_legal_bindings'::pg_catalog.regclass,'public.research_early_access_session_bindings'::pg_catalog.regclass,'public.research_early_access_shipping_regions'::pg_catalog.regclass,'public.research_inventory_lots'::pg_catalog.regclass,'public.research_lot_quality_documents'::pg_catalog.regclass,'public.research_lot_quality_tests'::pg_catalog.regclass,'public.research_product_content'::pg_catalog.regclass,'public.research_product_prices'::pg_catalog.regclass,'public.research_product_variants'::pg_catalog.regclass,'public.research_products'::pg_catalog.regclass,'public.research_required_inputs'::pg_catalog.regclass,
    'public.research_private_early_access_sessions'::pg_catalog.regclass,'public.research_private_early_access_nonces'::pg_catalog.regclass,
    'public.research_assisted_order_provider_fence'::pg_catalog.regclass]) and c.relowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)) then
    raise exception 'Quick Order common source/session owner mismatch' using errcode='42501'; end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace
      and (p.proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision','research_health_quick_order_read_current_authority','research_health_quick_order_guard_source_write')
        or p.proname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))<>13
    or exists(select 1 from (values ('public.research_health_quick_order_currentness_valid_publication(pg_catalog.jsonb)'),('public.research_health_quick_order_currentness_valid_decision_inputs(pg_catalog.text,pg_catalog.jsonb)'),('public.research_health_quick_order_currentness_refuse_mutation()'),('public.research_health_quick_order_currentness_monotonic_epoch()'),('public.research_health_quick_order_currentness_integrity()'),('public.research_health_quick_order_currentness_schema_fingerprint()'),('public.research_health_quick_order_currentness_read_strict_authority(timestamp with time zone)'),('public.research_health_quick_order_currentness_resolve_scope(pg_catalog.uuid,pg_catalog.text,pg_catalog.jsonb)'),('public.research_health_quick_order_currentness_activate_revision(pg_catalog.uuid,bigint,pg_catalog.text,pg_catalog.text)'),('public.research_health_quick_order_guard_source_write()'),('public.research_health_quick_order_publish_revision(pg_catalog.jsonb,pg_catalog.text)'),('public.research_health_quick_order_revoke_revision(pg_catalog.uuid,pg_catalog.text)'),('public.research_health_quick_order_read_current_authority()')) expected(signature)
      left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)
      where p.oid is null or p.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
        or p.proconfig is distinct from array['search_path=""']::pg_catalog.text[]
        or p.prosecdef is distinct from (p.proname='research_health_quick_order_guard_source_write')) then
    raise exception 'Quick Order exact function inventory mismatch' using errcode='55000'; end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_trigger where not tgisinternal and tgname like 'research\_health\_quick\_order\_guard\_%' escape '\')<>47
    or exists(select 1 from (values
      ('research_domain_launch_controls','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_domain_launch_controls','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_domain_launch_controls','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_domain_launch_controls','research_health_quick_order_guard_t',34,null,null),
      ('research_early_access_legal_bindings','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_early_access_legal_bindings','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_early_access_legal_bindings','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_early_access_legal_bindings','research_health_quick_order_guard_t',34,null,null),
      ('research_early_access_session_bindings','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_early_access_session_bindings','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_early_access_session_bindings','research_health_quick_order_guard_t',34,null,null),
      ('research_early_access_shipping_regions','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_early_access_shipping_regions','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_early_access_shipping_regions','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_early_access_shipping_regions','research_health_quick_order_guard_t',34,null,null),
      ('research_inventory_lots','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_inventory_lots','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_inventory_lots','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_inventory_lots','research_health_quick_order_guard_t',34,null,null),
      ('research_lot_quality_documents','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_lot_quality_documents','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_lot_quality_documents','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_lot_quality_documents','research_health_quick_order_guard_t',34,null,null),
      ('research_lot_quality_tests','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_lot_quality_tests','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_lot_quality_tests','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_lot_quality_tests','research_health_quick_order_guard_t',34,null,null),
      ('research_product_content','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_product_content','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_product_content','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_product_content','research_health_quick_order_guard_t',34,null,null),
      ('research_product_prices','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_product_prices','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_product_prices','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_product_prices','research_health_quick_order_guard_t',34,null,null),
      ('research_product_variants','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_product_variants','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_product_variants','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_product_variants','research_health_quick_order_guard_t',34,null,null),
      ('research_products','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_products','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_products','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_products','research_health_quick_order_guard_t',34,null,null),
      ('research_required_inputs','research_health_quick_order_guard_i',4,null,'qo_new_rows'),
      ('research_required_inputs','research_health_quick_order_guard_u',16,'qo_old_rows','qo_new_rows'),
      ('research_required_inputs','research_health_quick_order_guard_d',8,'qo_old_rows',null),
      ('research_required_inputs','research_health_quick_order_guard_t',34,null,null)) expected(relation_name,trigger_name,event_type,old_alias,new_alias)
      left join pg_catalog.pg_class c on c.relnamespace='public'::pg_catalog.regnamespace and c.relname=expected.relation_name
      left join pg_catalog.pg_trigger t on t.tgrelid=c.oid and t.tgname=expected.trigger_name
      where t.oid is null or t.tgisinternal or t.tgenabled<>'A' or t.tgnargs<>0 or t.tgconstraint<>0 or t.tgdeferrable or t.tginitdeferred
        or t.tgattr<>''::pg_catalog.int2vector or t.tgqual is not null or t.tgargs<>''::pg_catalog.bytea
        or t.tgtype<>expected.event_type or t.tgoldtable is distinct from expected.old_alias::pg_catalog.name or t.tgnewtable is distinct from expected.new_alias::pg_catalog.name
        or t.tgfoid is distinct from pg_catalog.to_regprocedure('public.research_health_quick_order_guard_source_write()')
        or pg_catalog.obj_description(t.oid,'pg_trigger') is distinct from 'RHQOC_SOURCE_COLUMNS_V1:'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attnum,a.attname,
    pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text)
    order by a.attnum)::pg_catalog.text from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0),'[]'),'UTF8'),'sha256'),'hex')) then
    raise exception 'Quick Order exact platform guard inventory drift' using errcode='55000'; end if;

  if current_user<>pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class
    where oid='public.research_health_quick_order_authority_head'::pg_catalog.regclass)) then
    raise exception 'Quick Order publication owner required' using errcode='42501'; end if;
  seal := pg_catalog.obj_description('public.research_health_quick_order_authority_head'::pg_catalog.regclass,'pg_class');
  if seal is null or seal !~ '^RHQOC_HELD_V1:[0-9a-f]{64}:[0-9a-f]{64}$'
    or pg_catalog.split_part(seal,':',3) is distinct from public.research_health_quick_order_currentness_schema_fingerprint() then
    raise exception 'Quick Order currentness schema drift' using errcode='55000'; end if;
  if (select pg_catalog.count(*) from public.research_health_quick_order_authority_head)<>1
    or not exists(select 1 from public.research_health_quick_order_authority_head where singleton) then
    raise exception 'Quick Order authority head unavailable' using errcode='55000'; end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_constraint
      where conrelid='public.research_health_quick_order_authority_head'::pg_catalog.regclass and contype='f')<>3
    or exists(select 1 from (values
      ('research_health_quick_order_head_active_revision_fk','active_revision_id'),
      ('research_health_quick_order_head_published_revision_fk','last_published_revision_id'),
      ('research_health_quick_order_head_revoked_revision_fk','last_revoked_revision_id')) required(name,column_name)
    left join pg_catalog.pg_constraint k on k.conrelid='public.research_health_quick_order_authority_head'::pg_catalog.regclass
      and k.conname=required.name
    left join pg_catalog.pg_attribute a on a.attrelid='public.research_health_quick_order_authority_head'::pg_catalog.regclass
      and a.attname=required.column_name and not a.attisdropped
    left join pg_catalog.pg_attribute r on r.attrelid='public.research_health_quick_order_authority_revisions'::pg_catalog.regclass
      and r.attname='revision_id' and not r.attisdropped
    where k.oid is null or k.contype<>'f'
      or k.confrelid<>'public.research_health_quick_order_authority_revisions'::pg_catalog.regclass
      or k.conkey is distinct from array[a.attnum] or k.confkey is distinct from array[r.attnum]
      or k.confdeltype<>'r' or k.confupdtype<>'a' or not k.convalidated
      or k.condeferrable or k.condeferred) then
    raise exception 'Quick Order authority foreign-key integrity drift' using errcode='55000'; end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_trigger where not tgisinternal and tgrelid in(
      'public.research_health_quick_order_authority_head'::pg_catalog.regclass,
      'public.research_health_quick_order_authority_revisions'::pg_catalog.regclass))<>3
    or exists(select 1 from (values
      ('research_health_quick_order_authority_revisions','research_health_quick_order_revisions_immutable',58,
        'public.research_health_quick_order_currentness_refuse_mutation()'),
      ('research_health_quick_order_authority_head','research_health_quick_order_head_removal_guard',42,
        'public.research_health_quick_order_currentness_refuse_mutation()'),
      ('research_health_quick_order_authority_head','research_health_quick_order_head_epoch_monotonic',19,
        'public.research_health_quick_order_currentness_monotonic_epoch()')) required(relation_name,name,type,function_name)
    left join pg_catalog.pg_class c on c.relnamespace='public'::pg_catalog.regnamespace and c.relname=required.relation_name
    left join pg_catalog.pg_trigger t on t.tgrelid=c.oid and t.tgname=required.name
    where t.oid is null or t.tgisinternal or t.tgenabled<>'A' or t.tgtype<>required.type
      or t.tgfoid is distinct from pg_catalog.to_regprocedure(required.function_name) or t.tgnargs<>0
      or t.tgattr<>''::pg_catalog.int2vector or t.tgqual is not null or t.tgargs<>''::pg_catalog.bytea
      or t.tgoldtable is not null or t.tgnewtable is not null or t.tgconstraint<>0 or t.tgdeferrable or t.tginitdeferred) then
    raise exception 'Quick Order authority trigger integrity drift' using errcode='55000'; end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_trigger where not tgisinternal and tgrelid in(
      'public.research_health_quick_order_currentness_scope_inputs'::pg_catalog.regclass,
      'public.research_health_quick_order_authority_activations'::pg_catalog.regclass,
      'public.research_health_quick_order_authority_revocations'::pg_catalog.regclass,
      'public.research_health_quick_order_authority_scope_members'::pg_catalog.regclass))<>5
    or exists(select 1 from (values
      ('research_health_quick_order_currentness_scope_inputs','research_health_quick_order_history_immutable_0',58),
      ('research_health_quick_order_authority_activations','research_health_quick_order_history_immutable_1',58),
      ('research_health_quick_order_authority_revocations','research_health_quick_order_history_immutable_2',58),
      ('research_health_quick_order_authority_scope_members','research_health_quick_order_history_immutable_3',58),
      ('research_health_quick_order_authority_scope_members','research_health_quick_order_scope_insert_seal',7)) required(relation_name,trigger_name,event_type)
      left join pg_catalog.pg_class c on c.relnamespace='public'::pg_catalog.regnamespace and c.relname=required.relation_name
      left join pg_catalog.pg_trigger t on t.tgrelid=c.oid and t.tgname=required.trigger_name
      where t.oid is null or t.tgisinternal or t.tgenabled<>'A' or t.tgtype<>required.event_type
        or t.tgfoid is distinct from pg_catalog.to_regprocedure('public.research_health_quick_order_currentness_refuse_mutation()')
        or t.tgnargs<>0 or t.tgargs<>''::pg_catalog.bytea or t.tgattr<>''::pg_catalog.int2vector or t.tgqual is not null
        or t.tgoldtable is not null or t.tgnewtable is not null or t.tgconstraint<>0 or t.tgdeferrable or t.tginitdeferred) then
    raise exception 'Quick Order authority history trigger integrity drift' using errcode='55000'; end if;
  if exists(select 1 from (values ('research_health_quick_order_authority_activations'),
      ('research_health_quick_order_authority_revocations'),('research_health_quick_order_authority_scope_members')) required(relation_name)
    left join pg_catalog.pg_class c on c.relnamespace='public'::pg_catalog.regnamespace and c.relname=required.relation_name
    left join pg_catalog.pg_constraint k on k.conrelid=c.oid and k.contype='f'
    left join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='revision_id' and not a.attisdropped
    left join pg_catalog.pg_attribute r on r.attrelid='public.research_health_quick_order_authority_revisions'::pg_catalog.regclass
      and r.attname='revision_id' and not r.attisdropped
    where c.oid is null or k.oid is null or (select pg_catalog.count(*) from pg_catalog.pg_constraint x where x.conrelid=c.oid and x.contype='f')<>1
      or k.confrelid<>'public.research_health_quick_order_authority_revisions'::pg_catalog.regclass
      or k.conkey is distinct from array[a.attnum] or k.confkey is distinct from array[r.attnum]
      or k.confdeltype<>'r' or k.confupdtype<>'a' or not k.convalidated or k.condeferrable or k.condeferred) then
    raise exception 'Quick Order authority history foreign-key integrity drift' using errcode='55000'; end if;
  if exists(select 1 from public.research_health_quick_order_authority_head h
    left join public.research_health_quick_order_authority_revisions a on a.revision_id=h.active_revision_id
    left join public.research_health_quick_order_authority_revisions p on p.revision_id=h.last_published_revision_id
    left join public.research_health_quick_order_authority_revisions r on r.revision_id=h.last_revoked_revision_id
    where (h.active_revision_id is not null and a.revision_id is null)
      or (h.last_published_revision_id is not null and p.revision_id is null)
      or (h.last_revoked_revision_id is not null and r.revision_id is null)) then
    raise exception 'Quick Order authority revision reference unavailable' using errcode='55000'; end if;
  for obj in select oid,proowner,proacl from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace
    and (proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision',
      'research_health_quick_order_read_current_authority','research_health_quick_order_guard_source_write')
      or proname like 'research\_health\_quick\_order\_currentness\_%' escape '\') loop
    if exists(select 1 from pg_catalog.aclexplode(coalesce(obj.proacl,pg_catalog.acldefault('f',obj.proowner))) a
      where a.grantee<>obj.proowner) then
      raise exception 'Quick Order currentness function ACL drift' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_function_privilege(role_name,obj.oid,'EXECUTE') then
        raise exception 'Quick Order currentness function ACL drift' using errcode='55000'; end if;
    end loop;
  end loop;
  if exists(select 1 from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace
      and (c.relname like 'research\_health\_quick\_order\_authority\_%' escape '\' or c.relname='research_health_quick_order_currentness_scope_inputs')
      and c.relkind in ('r','p')
      and (c.relowner<>(select oid from pg_catalog.pg_roles where rolname=current_user) or not c.relrowsecurity or not c.relforcerowsecurity or c.relkind<>'r')) then
    raise exception 'Quick Order owned relation contract drift' using errcode='55000'; end if;
  for obj in select oid,relowner,relacl from pg_catalog.pg_class where relnamespace='public'::pg_catalog.regnamespace and relkind in('r','p')
    and (relname like 'research\_health\_quick\_order\_authority\_%' escape '\' or relname='research_health_quick_order_currentness_scope_inputs') loop
    if exists(select 1 from pg_catalog.aclexplode(coalesce(obj.relacl,pg_catalog.acldefault('r',obj.relowner))) a
      where a.grantee<>obj.relowner)
      or exists(select 1 from pg_catalog.pg_attribute c cross join lateral pg_catalog.aclexplode(c.attacl) a
        where c.attrelid=obj.oid and a.grantee<>obj.relowner) then
      raise exception 'Quick Order currentness table ACL drift' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_table_privilege(role_name,obj.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or pg_catalog.has_any_column_privilege(role_name,obj.oid,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Quick Order currentness table ACL drift' using errcode='55000'; end if;
    end loop;
  end loop;
end
$currentness_integrity$;


-- Closed set-based operations: derive(publication,decisionInputsText), verify({}),
-- offer(offeringVariantIds[]), membership(relation,rows[]). Every ID remains typed.
-- derive is the SINGLE L/D/test-closure derivation used by publish and activation.
create function public.research_health_quick_order_currentness_resolve_scope(p_revision pg_catalog.uuid,p_operation pg_catalog.text,p_args pg_catalog.jsonb)
returns pg_catalog.jsonb language plpgsql volatile security invoker set search_path='' as $resolve_scope$
declare
  input public.research_health_quick_order_currentness_scope_inputs%rowtype;
  rev public.research_health_quick_order_authority_revisions%rowtype;
  publication pg_catalog.jsonb; decision_text pg_catalog.text; decision pg_catalog.jsonb; bindings pg_catalog.jsonb; config pg_catalog.jsonb;
  raw_text pg_catalog.text; item pg_catalog.jsonb; offer pg_catalog.jsonb; binding pg_catalog.jsonb; cfg pg_catalog.jsonb; artifact pg_catalog.jsonb;
  field pg_catalog.text; kind pg_catalog.text; mapped_key pg_catalog.text; count_rows bigint; header pg_catalog.jsonb; members pg_catalog.jsonb;
  row_counts pg_catalog.jsonb; rows_digest pg_catalog.text; closure_digest pg_catalog.text; row_text pg_catalog.text;
  products pg_catalog.uuid[] := '{}'; variants pg_catalog.uuid[] := '{}'; domains pg_catalog.text[] := '{}'; countries pg_catalog.text[] := '{}';
  p pg_catalog.uuid; v pg_catalog.uuid; found_count integer; rows_out pg_catalog.jsonb := '[]'::pg_catalog.jsonb; relation_name pg_catalog.text;
  scoped boolean; found_member boolean := false; parent_visible boolean; identities pg_catalog.jsonb; current_row pg_catalog.jsonb;
begin
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
    or pg_catalog.current_setting('server_version_num')::integer < 170011 then
    raise exception 'Quick Order requires reviewed PostgreSQL 17.11 or later 17.x' using errcode='55000'; end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Quick Order requires READ COMMITTED' using errcode='55000'; end if;
  if current_user<>pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class
    where oid='public.research_health_quick_order_authority_head'::pg_catalog.regclass)) then
    raise exception 'Quick Order scope owner required' using errcode='42501'; end if;
  if p_revision is null or pg_catalog.jsonb_typeof(p_args)<>'object'
    or p_operation not in ('derive','verify','offer','membership') then
    raise exception 'Quick Order scope operation unavailable' using errcode='22023'; end if;
  select * into input from public.research_health_quick_order_currentness_scope_inputs where revision_id=p_revision;
  if not found then raise exception 'Quick Order exact scope input unavailable' using errcode='55000'; end if;
  if p_operation='derive' then
    if p_args-array['publication','decisionInputsText']<>'{}'::pg_catalog.jsonb or not p_args ?& array['publication','decisionInputsText'] then
      raise exception 'Quick Order derive arguments invalid' using errcode='22023'; end if;
    publication:=p_args->'publication'; decision_text:=p_args->>'decisionInputsText';
    if public.research_health_quick_order_currentness_valid_publication(publication) is not true
      or public.research_health_quick_order_currentness_valid_decision_inputs(decision_text,publication) is not true then
      raise exception 'Quick Order materialisation decision invalid' using errcode='55000'; end if;
    decision:=decision_text::pg_catalog.jsonb;
    if publication->>'revisionId' is distinct from p_revision::pg_catalog.text
      or input.source_commit is distinct from publication->>'sourceCommit'
      or input.source_commit is distinct from decision->>'sourceCommit'
      or input.reader_census_sha256 is distinct from decision->>'readerCensusSha256'
      or input.canonical_reader_profile is distinct from decision->>'canonicalReaderProfile'
      or input.decision_text_sha256 is distinct from pg_catalog.encode(extensions.digest(pg_catalog.convert_to(decision_text,'UTF8'),'sha256'),'hex') then
      raise exception 'Quick Order scope input identity mismatch' using errcode='55000'; end if;
    for artifact in select value from pg_catalog.jsonb_array_elements(input.artifacts) loop
      kind:=artifact->>'kind';
      mapped_key:=case kind when 'health_legal' then 'healthLegal' else kind end;
      if artifact-array['kind','path','sha256']<>'{}'::pg_catalog.jsonb or not artifact ?& array['kind','path','sha256']
        or kind not in ('catalog','bindings','reconciliation','health_legal','configuration')
        or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(input.artifacts) a where a->>'kind'=kind)<>1
        or not exists(select 1 from pg_catalog.jsonb_array_elements(publication->'artifacts') a where a=artifact)
        or artifact-'kind' is distinct from decision#>array['artifacts',mapped_key] then
        raise exception 'Quick Order five-artifact scope binding mismatch' using errcode='55000'; end if;
    end loop;
    if pg_catalog.octet_length(input.bindings_raw) not between 1 and 4194304
      or pg_catalog.octet_length(input.configuration_raw) not between 1 and 262144
      or pg_catalog.octet_length(input.bindings_raw)+pg_catalog.octet_length(input.configuration_raw)>4456448
      or pg_catalog.encode(extensions.digest(input.bindings_raw,'sha256'),'hex') is distinct from decision#>>'{artifacts,bindings,sha256}'
      or pg_catalog.encode(extensions.digest(input.configuration_raw,'sha256'),'hex') is distinct from decision#>>'{artifacts,configuration,sha256}' then
      raise exception 'Quick Order raw input byte binding mismatch' using errcode='55000'; end if;
    -- SQL/JSON uniqueness is recursive: duplicate keys at ANY object refuse.
    foreach field in array array['bindings','configuration'] loop
      raw_text:=pg_catalog.convert_from(case field when 'bindings' then input.bindings_raw else input.configuration_raw end,'UTF8');
      if raw_text is not json object with unique keys then
        raise exception 'Quick Order scope JSON encoding invalid' using errcode='55000'; end if;
      -- json preserves the numeric token spelling that jsonb normalizes.
      if (field='bindings' and (raw_text::pg_catalog.json)->>'schemaVersion' is distinct from '1')
        or (field='configuration' and (raw_text::pg_catalog.json)#>>'{quickOrderScope,schemaVersion}' is distinct from '1') then
        raise exception 'Quick Order scope field contract invalid' using errcode='55000'; end if;
      item:=raw_text::pg_catalog.jsonb;
      if exists(with recursive walk(value,depth) as (
        select item,0 union all select children.value,walk.depth+1 from walk
        cross join lateral (select value from pg_catalog.jsonb_each(case pg_catalog.jsonb_typeof(walk.value) when 'object' then walk.value else '{}'::pg_catalog.jsonb end)
          union all select value from pg_catalog.jsonb_array_elements(case pg_catalog.jsonb_typeof(walk.value) when 'array' then walk.value else '[]'::pg_catalog.jsonb end)) children
        where walk.depth<=32) select 1 from walk where depth>32) then
        raise exception 'Quick Order scope JSON depth exceeded' using errcode='55000'; end if;
      if field='bindings' then bindings:=item; else config:=item->'quickOrderScope'; end if;
    end loop;
    if bindings->'schemaVersion' is distinct from '1'::pg_catalog.jsonb or pg_catalog.jsonb_typeof(bindings->'bindings') is distinct from 'array'
      or pg_catalog.jsonb_array_length(bindings->'bindings')>4096
      or pg_catalog.jsonb_typeof(config) is distinct from 'object' or config-array['schemaVersion','offers']<>'{}'::pg_catalog.jsonb
      or config->'schemaVersion' is distinct from '1'::pg_catalog.jsonb or pg_catalog.jsonb_typeof(config->'offers') is distinct from 'array'
      or pg_catalog.jsonb_array_length(config->'offers')>4096
      or pg_catalog.jsonb_array_length(config->'offers')<>pg_catalog.jsonb_array_length(decision->'offerRules') then
      raise exception 'Quick Order scope field contract invalid' using errcode='55000'; end if;
    for binding in select value from pg_catalog.jsonb_array_elements(bindings->'bindings') loop
      if pg_catalog.jsonb_typeof(binding)<>'object' or not binding ?& array['offeringVariantId','productId','variantId']
        or pg_catalog.jsonb_typeof(binding->'offeringVariantId')<>'string'
        or pg_catalog.octet_length(binding->>'offeringVariantId') not between 1 and 200
        or pg_catalog.jsonb_typeof(binding->'productId')<>'string' or binding->>'productId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or pg_catalog.jsonb_typeof(binding->'variantId')<>'string' or binding->>'variantId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(bindings->'bindings') b where b->>'offeringVariantId'=binding->>'offeringVariantId')<>1 then
        raise exception 'Quick Order binding identity invalid or ambiguous' using errcode='55000'; end if;
    end loop;
    for offer in select value from pg_catalog.jsonb_array_elements(decision->'offerRules') loop
      select b into binding from pg_catalog.jsonb_array_elements(bindings->'bindings') b where b->>'offeringVariantId'=offer->>'offeringVariantId';
      if not found then raise exception 'Quick Order selected binding absent' using errcode='55000'; end if;
      p:=(binding->>'productId')::pg_catalog.uuid; v:=(binding->>'variantId')::pg_catalog.uuid;
      if offer->>'productId' is distinct from p::pg_catalog.text or offer->>'variantId' is distinct from v::pg_catalog.text
        or not exists(select 1 from public.research_product_variants pv join public.research_products pp on pp.id=pv.product_id where pv.id=v and pp.id=p)
        or v=any(variants) then raise exception 'Quick Order canonical Product Control mapping mismatch' using errcode='55000'; end if;
      select pg_catalog.count(*) into found_count from pg_catalog.jsonb_array_elements(config->'offers') c where c->>'offeringVariantId'=offer->>'offeringVariantId';
      if found_count<>1 then raise exception 'Quick Order selected configuration ambiguous' using errcode='55000'; end if;
      select c into cfg from pg_catalog.jsonb_array_elements(config->'offers') c where c->>'offeringVariantId'=offer->>'offeringVariantId';
      if cfg-array['offeringVariantId','domains','countries']<>'{}'::pg_catalog.jsonb or not cfg ?& array['offeringVariantId','domains','countries']
        or pg_catalog.jsonb_typeof(cfg->'offeringVariantId') is distinct from 'string'
        or pg_catalog.octet_length(cfg->>'offeringVariantId') not between 1 and 200
        or pg_catalog.jsonb_typeof(cfg->'domains') is distinct from 'array' or pg_catalog.jsonb_typeof(cfg->'countries') is distinct from 'array'
        or pg_catalog.jsonb_array_length(cfg->'domains') not between 1 and 64
        or cfg->'countries' is distinct from pg_catalog.jsonb_build_array(offer#>>'{destination,countryCode}') then
        raise exception 'Quick Order approved domains or country unavailable' using errcode='55000'; end if;
      if exists(select 1 from pg_catalog.jsonb_array_elements(cfg->'domains') d where pg_catalog.jsonb_typeof(d)<>'string'
        or pg_catalog.octet_length(d#>>'{}') not between 1 and 253
        or d#>>'{}' !~ '^[a-z0-9][a-z0-9_-]*$')
        or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(cfg->'domains'))<>(select pg_catalog.count(distinct d) from pg_catalog.jsonb_array_elements(cfg->'domains') d)
        or exists(select 1 from (select d#>>'{}' value,pg_catalog.lag(d#>>'{}') over(order by n) prior from pg_catalog.jsonb_array_elements(cfg->'domains') with ordinality a(d,n)) a where prior collate pg_catalog."C">=value collate pg_catalog."C") then
        raise exception 'Quick Order domain set noncanonical' using errcode='55000'; end if;
      if not p=any(products) then
        products:=pg_catalog.array_append(products,p);
        rows_out:=rows_out||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array('product',p::pg_catalog.text,p::pg_catalog.text,null,null,null,null,offer->>'productId',null,null,null,'{}'::pg_catalog.jsonb));
      end if;
      variants:=pg_catalog.array_append(variants,v);
      rows_out:=rows_out||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array('variant',v::pg_catalog.text,p::pg_catalog.text,v::pg_catalog.text,null,null,offer->>'offeringVariantId',offer->>'productId',offer->>'variantId',null,null,
        pg_catalog.jsonb_build_object('domains',cfg->'domains','countries',cfg->'countries')));
      for field in select d#>>'{}' from pg_catalog.jsonb_array_elements(cfg->'domains') d loop
        if not field=any(domains) then domains:=pg_catalog.array_append(domains,field); end if;
      end loop;
      field:=offer#>>'{destination,countryCode}'; if not field=any(countries) then countries:=pg_catalog.array_append(countries,field); end if;
    end loop;
    -- Exact closure: a lot is in L if product is in P OR variant is in V.
    -- Null canonical identities are OUT unless the other identity is selected.
    select rows_out||coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array('lot',l.id::pg_catalog.text,l.product_id::pg_catalog.text,l.variant_id::pg_catalog.text,l.id::pg_catalog.text,null,null,null,null,null,null,'{}'::pg_catalog.jsonb)
      order by l.id),'[]'::pg_catalog.jsonb) into rows_out from public.research_inventory_lots l where l.product_id=any(products) or l.variant_id=any(variants);
    select rows_out||coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array('document',d.id::pg_catalog.text,l.product_id::pg_catalog.text,l.variant_id::pg_catalog.text,l.id::pg_catalog.text,d.id::pg_catalog.text,null,null,null,null,null,
      pg_catalog.jsonb_build_object('tests',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.id::pg_catalog.text,t.test_key) order by t.id,t.test_key collate pg_catalog."C") from public.research_lot_quality_tests t where t.quality_document_id=d.id),'[]'::pg_catalog.jsonb)))
      order by d.id),'[]'::pg_catalog.jsonb) into rows_out from public.research_lot_quality_documents d join public.research_inventory_lots l on l.id=d.lot_id
      where l.product_id=any(products) or l.variant_id=any(variants);
    foreach field in array domains loop rows_out:=rows_out||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array('domain',field,null,null,null,null,null,null,null,field,null,'{}'::pg_catalog.jsonb)); end loop;
    foreach field in array countries loop rows_out:=rows_out||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array('country',field,null,null,null,null,null,null,null,null,field,'{}'::pg_catalog.jsonb)); end loop;
    select pg_catalog.jsonb_agg(r order by pg_catalog.convert_to(r->>0,'UTF8'),pg_catalog.convert_to(r->>1,'UTF8')) into rows_out from pg_catalog.jsonb_array_elements(rows_out) r;
    return pg_catalog.jsonb_build_object('revisionId',p_revision::pg_catalog.text,'rows',rows_out);
  end if;
  select * into rev from public.research_health_quick_order_authority_revisions where revision_id=p_revision;
  if not found then raise exception 'Quick Order sealed revision absent' using errcode='55000'; end if;
  select provenance into header from public.research_health_quick_order_authority_scope_members where revision_id=p_revision and row_kind='header';
  if not found or header->>'revisionId' is distinct from p_revision::pg_catalog.text
    or header->>'sourceCommit' is distinct from input.source_commit or header->>'decisionTextSha256' is distinct from input.decision_text_sha256
    or header->>'readerCensusSha256' is distinct from input.reader_census_sha256
    or header->>'canonicalReaderProfile' is distinct from input.canonical_reader_profile
    or header->>'constructionReceiptSha256' is distinct from input.construction_receipt_sha256 then
    raise exception 'Quick Order scope header binding invalid' using errcode='55000'; end if;
  if p_operation<>'membership' then
  -- Canonical scope preimage is UTF8 PostgreSQL json_build_array text of the fixed
  -- typed column order below, with LF between rows, no terminal LF, ASCII key sort.
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(
      pg_catalog.json_build_array(row_kind,identity_key,product_id::pg_catalog.text,variant_id::pg_catalog.text,lot_uuid::pg_catalog.text,document_uuid::pg_catalog.text,
        offering_variant_id,product_identifier,variant_identifier,domain,country,provenance)::pg_catalog.text,
      E'\n' order by pg_catalog.convert_to(row_kind,'UTF8'),pg_catalog.convert_to(identity_key,'UTF8')),''),'UTF8'),'sha256'),'hex')
    into rows_digest from public.research_health_quick_order_authority_scope_members where revision_id=p_revision and row_kind<>'header';
  select pg_catalog.jsonb_object_agg(row_kind,n) into row_counts from (select row_kind,pg_catalog.count(*) n from public.research_health_quick_order_authority_scope_members
    where revision_id=p_revision and row_kind<>'header' group by row_kind) counts;
  if header->>'rowsSha256' is distinct from rows_digest or header->'rowCounts' is distinct from row_counts then
    raise exception 'Quick Order sealed scope rows changed' using errcode='55000'; end if;
  end if;
  if p_operation='verify' then
    if p_args<>'{}'::pg_catalog.jsonb then raise exception 'Quick Order verify arguments invalid' using errcode='22023'; end if;
    return pg_catalog.jsonb_build_object('revisionId',p_revision::pg_catalog.text,'rowsSha256',rows_digest,'rowCounts',row_counts);
  elsif p_operation='offer' then
    if p_args-array['offeringVariantIds']<>'{}'::pg_catalog.jsonb or pg_catalog.jsonb_typeof(p_args->'offeringVariantIds') is distinct from 'array'
      or exists(select 1 from pg_catalog.jsonb_array_elements(p_args->'offeringVariantIds') k where pg_catalog.jsonb_typeof(k)<>'string')
      or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_args->'offeringVariantIds'))<>(select pg_catalog.count(distinct k) from pg_catalog.jsonb_array_elements(p_args->'offeringVariantIds') k) then
      raise exception 'Quick Order offer lookup invalid' using errcode='22023'; end if;
    for field in select k#>>'{}' from pg_catalog.jsonb_array_elements(p_args->'offeringVariantIds') k loop
      select pg_catalog.jsonb_build_object('offeringVariantId',m.offering_variant_id,'productId',m.product_id::pg_catalog.text,'variantId',m.variant_id::pg_catalog.text,
        'productIdentifier',m.product_identifier,'variantIdentifier',m.variant_identifier,'domains',m.provenance->'domains','countries',m.provenance->'countries',
        'lotIds',coalesce((select pg_catalog.jsonb_agg(s.lot_uuid::pg_catalog.text order by s.lot_uuid) from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision and s.row_kind='lot' and (s.product_id=m.product_id or s.variant_id=m.variant_id)),'[]'::pg_catalog.jsonb),
        'documentIds',coalesce((select pg_catalog.jsonb_agg(s.document_uuid::pg_catalog.text order by s.document_uuid) from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision and s.row_kind='document' and (s.product_id=m.product_id or s.variant_id=m.variant_id)),'[]'::pg_catalog.jsonb))
        into current_row from public.research_health_quick_order_authority_scope_members m where m.revision_id=p_revision and m.row_kind='variant' and m.offering_variant_id=field;
      if not found then raise exception 'Quick Order offering outside sealed scope' using errcode='55000'; end if;
      rows_out:=rows_out||pg_catalog.jsonb_build_array(current_row);
    end loop;
    return pg_catalog.jsonb_build_object('revisionId',p_revision::pg_catalog.text,'offers',rows_out);
  end if;
  -- membership evaluates a set of OLD or NEW identities in one static operation.
  if p_args-array['relation','rows']<>'{}'::pg_catalog.jsonb or pg_catalog.jsonb_typeof(p_args->'rows') is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_args->'relation') is distinct from 'string' then
    raise exception 'Quick Order membership arguments invalid' using errcode='22023'; end if;
  relation_name:=p_args->>'relation'; scoped:=false;
  for item in select value from pg_catalog.jsonb_array_elements(p_args->'rows') loop
    if pg_catalog.jsonb_typeof(item)<>'object' then raise exception 'Quick Order membership identity malformed' using errcode='55000'; end if;
    if relation_name='research_products' then
      scoped:=exists(select 1 from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision and s.row_kind='product' and s.product_id=(item->>'id')::pg_catalog.uuid);
    elsif relation_name in ('research_product_variants','research_product_prices','research_inventory_lots') then
      scoped:=exists(select 1 from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision and
        ((s.row_kind='product' and s.product_id=(item->>'product_id')::pg_catalog.uuid)
          or (s.row_kind='variant' and s.variant_id=(case relation_name when 'research_product_variants' then item->>'id' else item->>'variant_id' end)::pg_catalog.uuid)
          or (relation_name='research_inventory_lots' and s.row_kind='lot' and s.lot_uuid=(item->>'id')::pg_catalog.uuid)));
    elsif relation_name='research_product_content' then
      scoped:=exists(select 1 from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision and s.row_kind='product' and s.product_id=(item->>'product_id')::pg_catalog.uuid);
    elsif relation_name in ('research_domain_launch_controls','research_required_inputs') then
      -- The optional record-selector candidate is not installed by this profile.
      -- Domain membership remains complete for this admitted reader profile.
      scoped:=exists(select 1 from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision and s.row_kind='domain' and s.domain=item->>'domain');
    elsif relation_name='research_early_access_shipping_regions' then
      scoped:=exists(select 1 from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision and s.row_kind='country' and s.country=item->>'country');
    elsif relation_name in ('research_early_access_session_bindings','research_early_access_legal_bindings') then
      scoped:=true;
    elsif relation_name='research_lot_quality_documents' then
      scoped:=exists(select 1 from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision
        and ((s.row_kind='document' and s.document_uuid=(item->>'id')::pg_catalog.uuid) or (s.row_kind='lot' and s.lot_uuid=(item->>'lot_id')::pg_catalog.uuid)));
      if not scoped then
        select l.product_id,l.variant_id into p,v from public.research_inventory_lots l where l.id=(item->>'lot_id')::pg_catalog.uuid;
        if not found then raise exception 'Quick Order document parent provenance unresolved' using errcode='55000'; end if;
        scoped:=exists(select 1 from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision
          and ((s.row_kind='product' and s.product_id=p) or (s.row_kind='variant' and s.variant_id=v)));
      end if;
    elsif relation_name='research_lot_quality_tests' then
      scoped:=exists(select 1 from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision and s.row_kind='document' and s.document_uuid=(item->>'quality_document_id')::pg_catalog.uuid);
      if not scoped then
        select l.product_id,l.variant_id into p,v from public.research_lot_quality_documents d join public.research_inventory_lots l on l.id=d.lot_id where d.id=(item->>'quality_document_id')::pg_catalog.uuid;
        if not found then raise exception 'Quick Order test parent provenance unresolved' using errcode='55000'; end if;
        scoped:=exists(select 1 from public.research_health_quick_order_authority_scope_members s where s.revision_id=p_revision
          and ((s.row_kind='product' and s.product_id=p) or (s.row_kind='variant' and s.variant_id=v)));
      end if;
    else raise exception 'Quick Order membership relation unsupported' using errcode='55000'; end if;
    if scoped then found_member:=true; end if;
  end loop;
  return pg_catalog.jsonb_build_object('member',found_member);
end
$resolve_scope$;

create function public.research_health_quick_order_currentness_read_strict_authority(p_decision_at pg_catalog.timestamptz)
returns pg_catalog.jsonb language plpgsql volatile security invoker set search_path='' as $strict_authority$
declare h public.research_health_quick_order_authority_head%rowtype;
  r public.research_health_quick_order_authority_revisions%rowtype;
  i public.research_health_quick_order_currentness_scope_inputs%rowtype;
begin
  perform public.research_health_quick_order_currentness_integrity();
  if p_decision_at is null then raise exception 'Quick Order decision instant missing' using errcode='55000'; end if;
  select * into h from public.research_health_quick_order_authority_head where singleton;
  if not found or h.state<>'active' or h.active_revision_id is null or h.active_revision_id is distinct from h.last_published_revision_id then
    return pg_catalog.jsonb_build_object('state','unavailable','code','quick_order_authority_unavailable'); end if;
  select * into r from public.research_health_quick_order_authority_revisions where revision_id=h.active_revision_id;
  if not found then raise exception 'Quick Order active revision absent' using errcode='55000'; end if;
  select * into i from public.research_health_quick_order_currentness_scope_inputs where revision_id=h.active_revision_id;
  if not found or public.research_health_quick_order_currentness_valid_publication(r.publication) is not true
    or public.research_health_quick_order_currentness_valid_decision_inputs(r.decision_inputs_text,r.publication) is not true
    or i.source_commit is distinct from r.publication->>'sourceCommit'
    or i.reader_census_sha256 is distinct from r.decision_inputs_text::pg_catalog.jsonb->>'readerCensusSha256'
    or i.decision_text_sha256 is distinct from pg_catalog.encode(extensions.digest(pg_catalog.convert_to(r.decision_inputs_text,'UTF8'),'sha256'),'hex') then
    raise exception 'Quick Order authority input binding invalid' using errcode='55000'; end if;
  -- The intake commit's preflight/final strict-reader calls verify this scope
  -- header through resolve_scope 'verify'; its separate 'offer' lookup also
  -- recomputes the sealed row digest. Dependent intake comments await its reseal.
  perform public.research_health_quick_order_currentness_resolve_scope(h.active_revision_id,'verify','{}'::pg_catalog.jsonb);
  if exists(select 1 from public.research_health_quick_order_authority_revocations where revision_id=h.active_revision_id)
    or not exists(select 1 from public.research_health_quick_order_authority_activations a where a.revision_id=h.active_revision_id
      and a.writer_epoch=h.writer_epoch and a.source_commit=i.source_commit and a.reader_census_sha256=i.reader_census_sha256)
    or p_decision_at<(r.publication->>'effectiveFrom')::pg_catalog.timestamptz
    or (r.publication->>'effectiveUntil' is not null and p_decision_at>=(r.publication->>'effectiveUntil')::pg_catalog.timestamptz) then
    return pg_catalog.jsonb_build_object('state','unavailable','code','quick_order_authority_unavailable'); end if;
  return pg_catalog.jsonb_build_object('state','active','revisionId',h.active_revision_id::pg_catalog.text,'writerEpoch',h.writer_epoch::pg_catalog.text);
end
$strict_authority$;

create function public.research_health_quick_order_guard_source_write()
returns pg_catalog.trigger language plpgsql volatile security definer set search_path='' as $source_guard$
declare changed pg_catalog.jsonb; identities pg_catalog.jsonb; revision pg_catalog.uuid; current_revision pg_catalog.uuid; marker pg_catalog.text; descriptor_digest pg_catalog.text; trigger_row pg_catalog.record;
  epoch bigint;

  limits_raw pg_catalog.text; limits pg_catalog.jsonb; profile pg_catalog.jsonb; anchor pg_catalog.text; catalog_settings pg_catalog.text[];
  login_oid pg_catalog.oid; database_oid pg_catalog.oid; owner_oid pg_catalog.oid; request_role pg_catalog.text;
  timer pg_catalog.text; timer_field pg_catalog.text; timer_raw pg_catalog.text; catalog_raw pg_catalog.text; timer_parts pg_catalog.text[];
  effective_ms numeric; catalog_ms numeric; field pg_catalog.text; section pg_catalog.text; setting_row pg_catalog.text;
  elapsed_ms numeric; class_name pg_catalog.text; timer_values pg_catalog.jsonb := '{}'::pg_catalog.jsonb;
begin
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
    or pg_catalog.current_setting('server_version_num')::integer < 170011 then
    raise exception 'Quick Order requires reviewed PostgreSQL 17.11 or later 17.x' using errcode='55000'; end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Quick Order requires READ COMMITTED' using errcode='55000'; end if;
  -- All statements, including OUT/equal/zero and TRUNCATE, pass these checks.
  if tg_table_schema<>'public' or tg_nargs<>0 or tg_level<>'STATEMENT'
    or tg_name is distinct from 'research_health_quick_order_guard_'||case tg_op when 'INSERT' then 'i' when 'UPDATE' then 'u' when 'DELETE' then 'd' when 'TRUNCATE' then 't' else '?' end
    or tg_when is distinct from case tg_op when 'TRUNCATE' then 'BEFORE' else 'AFTER' end
    or not tg_table_name=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs'])
    or (tg_table_name='research_early_access_session_bindings' and tg_op='INSERT') then
    raise exception 'Quick Order guard invocation invalid' using errcode='55000'; end if;
  select t.*,p.proowner,p.prosecdef,p.proconfig,c.relowner,c.relkind into trigger_row from pg_catalog.pg_trigger t
    join pg_catalog.pg_proc p on p.oid=t.tgfoid join pg_catalog.pg_class c on c.oid=t.tgrelid
    where t.tgrelid=tg_relid and t.tgname=tg_name and not t.tgisinternal;
  if not found or trigger_row.tgfoid<>'public.research_health_quick_order_guard_source_write()'::pg_catalog.regprocedure
    or trigger_row.tgenabled<>'A' or trigger_row.tgnargs<>0 or trigger_row.tgconstraint<>0 or trigger_row.tgdeferrable or trigger_row.tginitdeferred
    or trigger_row.tgtype is distinct from case tg_op when 'INSERT' then 4 when 'UPDATE' then 16 when 'DELETE' then 8 when 'TRUNCATE' then 34 end
    or trigger_row.tgoldtable is distinct from case when tg_op in ('UPDATE','DELETE') then 'qo_old_rows'::pg_catalog.name else null::pg_catalog.name end
    or trigger_row.tgnewtable is distinct from case when tg_op in ('UPDATE','INSERT') then 'qo_new_rows'::pg_catalog.name else null::pg_catalog.name end
    or trigger_row.relkind<>'r' or trigger_row.relowner<>trigger_row.proowner
    or current_user<>pg_catalog.pg_get_userbyid(trigger_row.proowner) or not trigger_row.prosecdef
    or trigger_row.proconfig is distinct from array['search_path=""']::pg_catalog.text[] then
    raise exception 'Quick Order guard identity drift' using errcode='55000'; end if;
  marker:=pg_catalog.obj_description('public.research_health_quick_order_authority_head'::pg_catalog.regclass,'pg_class');
  if marker is null or marker !~ '^RHQOC_HELD_V1:[0-9a-f]{64}:[0-9a-f]{64}$' then
    raise exception 'Quick Order installed seal unavailable' using errcode='55000'; end if;
  descriptor_digest:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attnum,a.attname,
    pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text)
    order by a.attnum)::pg_catalog.text from pg_catalog.pg_attribute a where a.attrelid=tg_relid and a.attnum>0),'[]'),'UTF8'),'sha256'),'hex');
  if pg_catalog.obj_description(trigger_row.oid,'pg_trigger') is distinct from 'RHQOC_SOURCE_COLUMNS_V1:'||descriptor_digest then
    raise exception 'Quick Order protected source columns drift' using errcode='55000'; end if;
  select last_published_revision_id into revision from public.research_health_quick_order_authority_head where singleton;
  if not found then raise exception 'Quick Order authority head unavailable' using errcode='55000'; end if;
  if tg_op='TRUNCATE' then raise exception 'Quick Order guarded source truncate refused' using errcode='55000'; end if;
  if tg_relid='public.research_domain_launch_controls'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('domain',n.domain,'launch_status',n.launch_status,'software_complete',n.software_complete,'manifest_hash',n.manifest_hash,'expected_input_count',n.expected_input_count,'version',n.version) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('domain',o.domain,'launch_status',o.launch_status,'software_complete',o.software_complete,'manifest_hash',o.manifest_hash,'expected_input_count',o.expected_input_count,'version',o.version) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.jsonb_build_object('domain',o.domain,'launch_status',o.launch_status,'software_complete',o.software_complete,'manifest_hash',o.manifest_hash,'expected_input_count',o.expected_input_count,'version',o.version) as projection from qo_old_rows o except all select pg_catalog.jsonb_build_object('domain',n.domain,'launch_status',n.launch_status,'software_complete',n.software_complete,'manifest_hash',n.manifest_hash,'expected_input_count',n.expected_input_count,'version',n.version) as projection from qo_new_rows n) union all (select pg_catalog.jsonb_build_object('domain',n.domain,'launch_status',n.launch_status,'software_complete',n.software_complete,'manifest_hash',n.manifest_hash,'expected_input_count',n.expected_input_count,'version',n.version) as projection from qo_new_rows n except all select pg_catalog.jsonb_build_object('domain',o.domain,'launch_status',o.launch_status,'software_complete',o.software_complete,'manifest_hash',o.manifest_hash,'expected_input_count',o.expected_input_count,'version',o.version) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('domain',r->'domain')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_early_access_legal_bindings'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('customer_ref',n.customer_ref,'member_id',n.member_id,'established_by',n.established_by,'verified_at',n.verified_at,'attested_by',n.attested_by,'alias_refs',n.alias_refs) as projection from qo_new_rows n where tg_op<>'INSERT' or pg_catalog.cardinality(n.alias_refs)>0
      or exists(select 1 from public.research_early_access_legal_bindings peer
        where peer.customer_ref<>n.customer_ref and n.customer_ref=any(peer.alias_refs))) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('customer_ref',o.customer_ref,'member_id',o.member_id,'established_by',o.established_by,'verified_at',o.verified_at,'attested_by',o.attested_by,'alias_refs',o.alias_refs) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.jsonb_build_object('customer_ref',o.customer_ref,'member_id',o.member_id,'established_by',o.established_by,'verified_at',o.verified_at,'attested_by',o.attested_by,'alias_refs',o.alias_refs) as projection from qo_old_rows o except all select pg_catalog.jsonb_build_object('customer_ref',n.customer_ref,'member_id',n.member_id,'established_by',n.established_by,'verified_at',n.verified_at,'attested_by',n.attested_by,'alias_refs',n.alias_refs) as projection from qo_new_rows n where tg_op<>'INSERT' or pg_catalog.cardinality(n.alias_refs)>0
      or exists(select 1 from public.research_early_access_legal_bindings peer
        where peer.customer_ref<>n.customer_ref and n.customer_ref=any(peer.alias_refs))) union all (select pg_catalog.jsonb_build_object('customer_ref',n.customer_ref,'member_id',n.member_id,'established_by',n.established_by,'verified_at',n.verified_at,'attested_by',n.attested_by,'alias_refs',n.alias_refs) as projection from qo_new_rows n where tg_op<>'INSERT' or pg_catalog.cardinality(n.alias_refs)>0
      or exists(select 1 from public.research_early_access_legal_bindings peer
        where peer.customer_ref<>n.customer_ref and n.customer_ref=any(peer.alias_refs)) except all select pg_catalog.jsonb_build_object('customer_ref',o.customer_ref,'member_id',o.member_id,'established_by',o.established_by,'verified_at',o.verified_at,'attested_by',o.attested_by,'alias_refs',o.alias_refs) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('customer_ref',r->'customer_ref')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_early_access_session_bindings'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('session_id',n.session_id,'customer_id',n.customer_id,'bound_at',n.bound_at) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('session_id',o.session_id,'customer_id',o.customer_id,'bound_at',o.bound_at) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.jsonb_build_object('session_id',o.session_id,'customer_id',o.customer_id,'bound_at',o.bound_at) as projection from qo_old_rows o except all select pg_catalog.jsonb_build_object('session_id',n.session_id,'customer_id',n.customer_id,'bound_at',n.bound_at) as projection from qo_new_rows n) union all (select pg_catalog.jsonb_build_object('session_id',n.session_id,'customer_id',n.customer_id,'bound_at',n.bound_at) as projection from qo_new_rows n except all select pg_catalog.jsonb_build_object('session_id',o.session_id,'customer_id',o.customer_id,'bound_at',o.bound_at) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('session_id',r->'session_id')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_early_access_shipping_regions'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',n.id,'country',n.country,'region',n.region,'active',n.active) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',o.id,'country',o.country,'region',o.region,'active',o.active) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.jsonb_build_object('id',o.id,'country',o.country,'region',o.region,'active',o.active) as projection from qo_old_rows o except all select pg_catalog.jsonb_build_object('id',n.id,'country',n.country,'region',n.region,'active',n.active) as projection from qo_new_rows n) union all (select pg_catalog.jsonb_build_object('id',n.id,'country',n.country,'region',n.region,'active',n.active) as projection from qo_new_rows n except all select pg_catalog.jsonb_build_object('id',o.id,'country',o.country,'region',o.region,'active',o.active) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('country',r->'country')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_inventory_lots'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',n.id,'lot_id',n.lot_id,'product_id',n.product_id,'variant_id',n.variant_id,'sku',n.sku,'disposition',n.disposition,'recalled',n.recalled,'excursion',n.excursion,'expiry_date',n.expiry_date,'retest_date',n.retest_date,'shelf_life_source',n.shelf_life_source) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',o.id,'lot_id',o.lot_id,'product_id',o.product_id,'variant_id',o.variant_id,'sku',o.sku,'disposition',o.disposition,'recalled',o.recalled,'excursion',o.excursion,'expiry_date',o.expiry_date,'retest_date',o.retest_date,'shelf_life_source',o.shelf_life_source) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.jsonb_build_object('id',o.id,'lot_id',o.lot_id,'product_id',o.product_id,'variant_id',o.variant_id,'sku',o.sku,'disposition',o.disposition,'recalled',o.recalled,'excursion',o.excursion,'expiry_date',o.expiry_date,'retest_date',o.retest_date,'shelf_life_source',o.shelf_life_source) as projection from qo_old_rows o except all select pg_catalog.jsonb_build_object('id',n.id,'lot_id',n.lot_id,'product_id',n.product_id,'variant_id',n.variant_id,'sku',n.sku,'disposition',n.disposition,'recalled',n.recalled,'excursion',n.excursion,'expiry_date',n.expiry_date,'retest_date',n.retest_date,'shelf_life_source',n.shelf_life_source) as projection from qo_new_rows n) union all (select pg_catalog.jsonb_build_object('id',n.id,'lot_id',n.lot_id,'product_id',n.product_id,'variant_id',n.variant_id,'sku',n.sku,'disposition',n.disposition,'recalled',n.recalled,'excursion',n.excursion,'expiry_date',n.expiry_date,'retest_date',n.retest_date,'shelf_life_source',n.shelf_life_source) as projection from qo_new_rows n except all select pg_catalog.jsonb_build_object('id',o.id,'lot_id',o.lot_id,'product_id',o.product_id,'variant_id',o.variant_id,'sku',o.sku,'disposition',o.disposition,'recalled',o.recalled,'excursion',o.excursion,'expiry_date',o.expiry_date,'retest_date',o.retest_date,'shelf_life_source',o.shelf_life_source) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r->'id','product_id',r->'product_id','variant_id',r->'variant_id')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_lot_quality_documents'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',n.id,'lot_id',n.lot_id,'document_state',n.document_state,'verification_state',n.verification_state,'coa_on_file',n.coa_on_file,'private_storage_key',n.private_storage_key,'report_issuer',n.report_issuer,'report_number',n.report_number,'report_date',n.report_date,'reviewed_at',n.reviewed_at,'published_at',n.published_at) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',o.id,'lot_id',o.lot_id,'document_state',o.document_state,'verification_state',o.verification_state,'coa_on_file',o.coa_on_file,'private_storage_key',o.private_storage_key,'report_issuer',o.report_issuer,'report_number',o.report_number,'report_date',o.report_date,'reviewed_at',o.reviewed_at,'published_at',o.published_at) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.jsonb_build_object('id',o.id,'lot_id',o.lot_id,'document_state',o.document_state,'verification_state',o.verification_state,'coa_on_file',o.coa_on_file,'private_storage_key',o.private_storage_key,'report_issuer',o.report_issuer,'report_number',o.report_number,'report_date',o.report_date,'reviewed_at',o.reviewed_at,'published_at',o.published_at) as projection from qo_old_rows o except all select pg_catalog.jsonb_build_object('id',n.id,'lot_id',n.lot_id,'document_state',n.document_state,'verification_state',n.verification_state,'coa_on_file',n.coa_on_file,'private_storage_key',n.private_storage_key,'report_issuer',n.report_issuer,'report_number',n.report_number,'report_date',n.report_date,'reviewed_at',n.reviewed_at,'published_at',n.published_at) as projection from qo_new_rows n) union all (select pg_catalog.jsonb_build_object('id',n.id,'lot_id',n.lot_id,'document_state',n.document_state,'verification_state',n.verification_state,'coa_on_file',n.coa_on_file,'private_storage_key',n.private_storage_key,'report_issuer',n.report_issuer,'report_number',n.report_number,'report_date',n.report_date,'reviewed_at',n.reviewed_at,'published_at',n.published_at) as projection from qo_new_rows n except all select pg_catalog.jsonb_build_object('id',o.id,'lot_id',o.lot_id,'document_state',o.document_state,'verification_state',o.verification_state,'coa_on_file',o.coa_on_file,'private_storage_key',o.private_storage_key,'report_issuer',o.report_issuer,'report_number',o.report_number,'report_date',o.report_date,'reviewed_at',o.reviewed_at,'published_at',o.published_at) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r->'id','lot_id',r->'lot_id')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_lot_quality_tests'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',n.id,'quality_document_id',n.quality_document_id,'test_key',n.test_key,'state',n.state) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',o.id,'quality_document_id',o.quality_document_id,'test_key',o.test_key,'state',o.state) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.jsonb_build_object('id',o.id,'quality_document_id',o.quality_document_id,'test_key',o.test_key,'state',o.state) as projection from qo_old_rows o except all select pg_catalog.jsonb_build_object('id',n.id,'quality_document_id',n.quality_document_id,'test_key',n.test_key,'state',n.state) as projection from qo_new_rows n) union all (select pg_catalog.jsonb_build_object('id',n.id,'quality_document_id',n.quality_document_id,'test_key',n.test_key,'state',n.state) as projection from qo_new_rows n except all select pg_catalog.jsonb_build_object('id',o.id,'quality_document_id',o.quality_document_id,'test_key',o.test_key,'state',o.state) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('quality_document_id',r->'quality_document_id')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_product_content'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',n.id,'product_id',n.product_id,'section',n.section,'state',n.state,'metadata',n.metadata) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.jsonb_build_object('id',o.id,'product_id',o.product_id,'section',o.section,'state',o.state,'metadata',o.metadata) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.jsonb_build_object('id',o.id,'product_id',o.product_id,'section',o.section,'state',o.state,'metadata',o.metadata) as projection from qo_old_rows o except all select pg_catalog.jsonb_build_object('id',n.id,'product_id',n.product_id,'section',n.section,'state',n.state,'metadata',n.metadata) as projection from qo_new_rows n) union all (select pg_catalog.jsonb_build_object('id',n.id,'product_id',n.product_id,'section',n.section,'state',n.state,'metadata',n.metadata) as projection from qo_new_rows n except all select pg_catalog.jsonb_build_object('id',o.id,'product_id',o.product_id,'section',o.section,'state',o.state,'metadata',o.metadata) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('product_id',r->'product_id')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_product_prices'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.to_jsonb(n) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.to_jsonb(o) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.to_jsonb(o) as projection from qo_old_rows o except all select pg_catalog.to_jsonb(n) as projection from qo_new_rows n) union all (select pg_catalog.to_jsonb(n) as projection from qo_new_rows n except all select pg_catalog.to_jsonb(o) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('product_id',r->'product_id','variant_id',r->'variant_id')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_product_variants'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.to_jsonb(n) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.to_jsonb(o) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.to_jsonb(o) as projection from qo_old_rows o except all select pg_catalog.to_jsonb(n) as projection from qo_new_rows n) union all (select pg_catalog.to_jsonb(n) as projection from qo_new_rows n except all select pg_catalog.to_jsonb(o) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r->'id','product_id',r->'product_id')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_products'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.to_jsonb(n) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.to_jsonb(o) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.to_jsonb(o) as projection from qo_old_rows o except all select pg_catalog.to_jsonb(n) as projection from qo_new_rows n) union all (select pg_catalog.to_jsonb(n) as projection from qo_new_rows n except all select pg_catalog.to_jsonb(o) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r->'id')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  elsif tg_relid='public.research_required_inputs'::pg_catalog.regclass then
    if tg_op='INSERT' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.to_jsonb(n) as projection from qo_new_rows n) delta;
    elsif tg_op='DELETE' then select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from (select pg_catalog.to_jsonb(o) as projection from qo_old_rows o) delta;
    else select coalesce(pg_catalog.jsonb_agg(projection),'[]'::pg_catalog.jsonb) into changed from
      ((select pg_catalog.to_jsonb(o) as projection from qo_old_rows o except all select pg_catalog.to_jsonb(n) as projection from qo_new_rows n) union all (select pg_catalog.to_jsonb(n) as projection from qo_new_rows n except all select pg_catalog.to_jsonb(o) as projection from qo_old_rows o)) delta; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('domain',r->'domain','record_id',r->'record_id')),'[]'::pg_catalog.jsonb)
      into identities from pg_catalog.jsonb_array_elements(changed) r;
  else raise exception 'Quick Order guard relation unexpected' using errcode='55000'; end if;
  if changed='[]'::pg_catalog.jsonb then return null; end if;
  if revision is not null and public.research_health_quick_order_currentness_resolve_scope(revision,'membership',
      pg_catalog.jsonb_build_object('relation',tg_table_name,'rows',identities))->>'member'='false' then return null; end if;
  -- Material path: full admission + scope seal, then gate -> head, one epoch.
  perform public.research_health_quick_order_currentness_integrity();
  if revision is not null then perform public.research_health_quick_order_currentness_resolve_scope(revision,'verify','{}'::pg_catalog.jsonb); end if;

  -- Admission is a catalog/effective-setting consistency check, never proof that
  -- the gateway armed a timer before BEGIN. No value or route is installed here.
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
    or pg_catalog.current_setting('server_version_num')::integer < 170011 then
    raise exception 'Quick Order requires reviewed PostgreSQL 17.11 or later 17.x' using errcode='55000'; end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Quick Order requires READ COMMITTED' using errcode='55000'; end if;
  select oid into login_oid from pg_catalog.pg_roles where rolname=session_user;
  select oid into database_oid from pg_catalog.pg_database where datname=pg_catalog.current_database();
  select relowner into owner_oid from pg_catalog.pg_class
    where oid='public.research_assisted_order_provider_fence'::pg_catalog.regclass;
  request_role := pg_catalog.current_setting('role',true);
  if request_role='none' then request_role:=session_user; end if;
  if login_oid is null or database_oid is null or owner_oid is null or request_role is null
    or current_user<>pg_catalog.pg_get_userbyid(owner_oid) then
    raise exception 'Quick Order connection identities unavailable' using errcode='42501'; end if;
  select setconfig into catalog_settings from pg_catalog.pg_db_role_setting
    where setrole=login_oid and setdatabase=database_oid;
  select pg_catalog.substring(s,pg_catalog.length('research_health_quick_order.approved_limits=')+1)
    into limits_raw from pg_catalog.unnest(catalog_settings) s
    where pg_catalog.starts_with(s,'research_health_quick_order.approved_limits=');
  anchor := case when pg_catalog.obj_description('public.research_health_quick_order_currentness_scope_inputs'::pg_catalog.regclass,'pg_class') ~ '^RHQOC_APPROVED_LIMITS_V1:[0-9a-f]{64}$'
    then pg_catalog.split_part(pg_catalog.obj_description('public.research_health_quick_order_currentness_scope_inputs'::pg_catalog.regclass,'pg_class'),':',2) else null end;
  if anchor is null or anchor !~ '^[0-9a-f]{64}$' or limits_raw is null
    or pg_catalog.encode(extensions.digest(pg_catalog.convert_to(limits_raw,'UTF8'),'sha256'),'hex')<>anchor
    or limits_raw is not json object with unique keys then
    raise exception 'Quick Order approved limits binding unavailable' using errcode='55000'; end if;
  -- Writer/admin canonical encoding is externally bound only by the digest;
  -- this parser checks closed typed content, not canonical re-encoding. jsonb::text
  -- is deliberately not used as the raw artifact's serialization or hash preimage.
  limits:=limits_raw::pg_catalog.jsonb;
  if limits-array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']<>'{}'::pg_catalog.jsonb
    or not limits ?& array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']
    or limits->>'schemaVersion' is distinct from 'quick-order-approved-limits-v1'
    or limits->>'routeClass' is distinct from 'writer' or limits_raw ~ '[^ -~]'
    or limits#>>'{database,name}' is distinct from pg_catalog.current_database()
    or limits#>>'{database,oid}' is distinct from database_oid::pg_catalog.text
    or limits#>>'{loginRole,name}' is distinct from session_user::pg_catalog.text
    or limits#>>'{loginRole,oid}' is distinct from login_oid::pg_catalog.text
    or limits#>>'{requestRole,name}' is distinct from request_role
    or limits#>>'{requestRole,oid}' is distinct from (select oid::pg_catalog.text from pg_catalog.pg_roles where rolname=request_role)
    or limits#>>'{ownerRole,name}' is distinct from current_user::pg_catalog.text
    or limits#>>'{ownerRole,oid}' is distinct from owner_oid::pg_catalog.text then
    raise exception 'Quick Order approved limits identity mismatch' using errcode='55000'; end if;
  foreach field in array array['profileId','profileVersion','routeId','timeZone','dateStyle'] loop
    if pg_catalog.jsonb_typeof(limits->field)<>'string' or pg_catalog.length(limits->>field)=0 then
      raise exception 'Quick Order approved limits identity missing' using errcode='55000'; end if;
  end loop;
  foreach section in array array['database','loginRole','requestRole','ownerRole'] loop
    if pg_catalog.jsonb_typeof(limits->section)<>'object'
      or (limits->section)-array['name','oid']<>'{}'::pg_catalog.jsonb
      or not (limits->section) ?& array['name','oid']
      or pg_catalog.jsonb_typeof(limits#>array[section,'name'])<>'string'
      or pg_catalog.jsonb_typeof(limits#>array[section,'oid'])<>'string'
      or limits#>>array[section,'oid'] !~ '^[1-9][0-9]*$' then
      raise exception 'Quick Order role binding malformed' using errcode='55000'; end if;
  end loop;
  if pg_catalog.jsonb_typeof(limits->'enforcement')<>'object'
    or (limits->'enforcement')-array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']<>'{}'::pg_catalog.jsonb
    or not (limits->'enforcement') ?& array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,preBeginAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,preBeginAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,writerOrderAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,writerOrderAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or limits#>'{enforcement,singleRpcAutocommit}'<>'true'::pg_catalog.jsonb then
    raise exception 'Quick Order route attestation binding missing' using errcode='55000'; end if;
  foreach section in array array['intake','writer'] loop
    profile:=limits->section;
    if pg_catalog.jsonb_typeof(profile)<>'object'
      or not profile ?& array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']
      or (section='intake' and profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']<>'{}'::pg_catalog.jsonb)
      or (section='writer' and (not profile ?& array['gateWaitMs','postGateReserveMs']
        or profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
          'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs','gateWaitMs','postGateReserveMs']<>'{}'::pg_catalog.jsonb)) then
      raise exception 'Quick Order approved limits fields invalid' using errcode='55000'; end if;
    for field in select key from pg_catalog.jsonb_each(profile) loop
      if pg_catalog.jsonb_typeof(profile->field)<>'number' or profile->>field !~ '^[1-9][0-9]*$'
        or (profile->>field)::numeric>9223372036854775807 then
        raise exception 'Quick Order approved limit is not representable positive milliseconds' using errcode='55000'; end if;
    end loop;
    if (profile->>'idleTimeoutMs')::numeric >= (profile->>'statementTimeoutMs')::numeric
      or (profile->>'statementTimeoutMs')::numeric >= (profile->>'transactionTimeoutMs')::numeric
      or (profile->>'attemptDeadlineMs')::numeric <> (profile->>'acquisitionMs')::numeric+
        (profile->>'transactionTimeoutMs')::numeric+(profile->>'cleanupMs')::numeric+(profile->>'responseMs')::numeric then
      raise exception 'Quick Order approved limit relationships invalid' using errcode='55000'; end if;
  end loop;
  if (limits#>>'{intake,lockTimeoutMs}')::numeric >= (limits#>>'{intake,deadlockTimeoutMs}')::numeric
    or (limits#>>'{writer,gateWaitMs}')::numeric < (limits#>>'{intake,transactionTimeoutMs}')::numeric+(limits#>>'{intake,cleanupMs}')::numeric
    or (limits#>>'{writer,lockTimeoutMs}')::numeric <> (limits#>>'{writer,gateWaitMs}')::numeric
    or (limits#>>'{writer,gateWaitMs}')::numeric+(limits#>>'{writer,postGateReserveMs}')::numeric >= (limits#>>'{writer,statementTimeoutMs}')::numeric then
    raise exception 'Quick Order approved gate relationships invalid' using errcode='55000'; end if;
  profile:=limits->'writer';
  for timer,timer_field in select * from (values ('lock_timeout','lockTimeoutMs'),('statement_timeout','statementTimeoutMs'),
    ('transaction_timeout','transactionTimeoutMs'),('idle_in_transaction_session_timeout','idleTimeoutMs'),('deadlock_timeout','deadlockTimeoutMs')) timers(name,field) loop
    timer_raw:=pg_catalog.current_setting(timer,true);
    timer_parts:=pg_catalog.regexp_match(timer_raw,'^([1-9][0-9]*)(ms|s)$');
    if timer_parts is null then
      raise exception 'Quick Order effective timer unavailable or unsupported' using errcode='55000'; end if;
    effective_ms:=timer_parts[1]::numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
    if effective_ms>9223372036854775807 or effective_ms>(profile->>timer_field)::numeric then
      raise exception 'Quick Order effective timer exceeds approved field' using errcode='55000'; end if;
    timer_values:=timer_values||pg_catalog.jsonb_build_object(timer_field,effective_ms);
    if timer in ('statement_timeout','transaction_timeout','idle_in_transaction_session_timeout') then
      select pg_catalog.substring(s,pg_catalog.length(timer)+2) into catalog_raw
        from pg_catalog.unnest(catalog_settings) s where pg_catalog.starts_with(s,timer||'=');
      timer_parts:=pg_catalog.regexp_match(catalog_raw,'^([1-9][0-9]*)(ms|s)$');
      if timer_parts is null then
        raise exception 'Quick Order startup timer binding missing' using errcode='55000'; end if;
      catalog_ms:=timer_parts[1]::numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
      if catalog_ms>9223372036854775807 or catalog_ms<>effective_ms then
        raise exception 'Quick Order effective startup timer mismatch' using errcode='55000'; end if;
    end if;
  end loop;
  if (timer_values->>'idleTimeoutMs')::numeric >= (timer_values->>'statementTimeoutMs')::numeric
    or (timer_values->>'statementTimeoutMs')::numeric >= (timer_values->>'transactionTimeoutMs')::numeric
    or ('writer'='intake' and (timer_values->>'lockTimeoutMs')::numeric >= (timer_values->>'deadlockTimeoutMs')::numeric)
    or ('writer'='writer' and (timer_values->>'lockTimeoutMs')::numeric < (limits#>>'{writer,gateWaitMs}')::numeric)
    or pg_catalog.current_setting('TimeZone') is distinct from limits->>'timeZone'
    or pg_catalog.current_setting('DateStyle') is distinct from limits->>'dateStyle' then
    raise exception 'Quick Order effective profile relationship mismatch' using errcode='55000'; end if;
  elapsed_ms:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp())*1000;
  if elapsed_ms<0 or elapsed_ms >= (timer_values->>'transactionTimeoutMs')::numeric then
    raise exception 'Quick Order transaction budget exhausted' using errcode='55000'; end if;

  elapsed_ms:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp())*1000;
  if (timer_values->>'transactionTimeoutMs')::numeric-elapsed_ms <
      (limits#>>'{writer,gateWaitMs}')::numeric+(limits#>>'{writer,postGateReserveMs}')::numeric then
    raise exception 'Quick Order remaining transaction budget insufficient for gate' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_locks l where l.locktype='advisory'
    and l.database=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())
    and l.pid=pg_catalog.pg_backend_pid() and l.classid=1380471107::pg_catalog.oid and l.objid=1::pg_catalog.oid
    and l.objsubid=2 and l.mode='ShareLock' and l.granted) then
    raise exception 'Quick Order shared authority gate upgrade refused' using errcode='55000'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1380471107,1);
  select last_published_revision_id into current_revision from public.research_health_quick_order_authority_head where singleton for update;
  if not found or current_revision is distinct from revision then
    raise exception 'Quick Order source scope changed before invalidation' using errcode='55000'; end if;
  update public.research_health_quick_order_authority_head set writer_epoch=writer_epoch+1,state='held',active_revision_id=null,
    updated_at=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()),updated_by=current_user where singleton returning writer_epoch into epoch;
  return null;
end
$source_guard$;
create trigger research_health_quick_order_guard_i after insert on public.research_domain_launch_controls referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_domain_launch_controls enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_domain_launch_controls referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_domain_launch_controls enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_domain_launch_controls referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_domain_launch_controls enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_domain_launch_controls
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_domain_launch_controls enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_early_access_legal_bindings referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_legal_bindings enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_early_access_legal_bindings referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_legal_bindings enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_early_access_legal_bindings referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_legal_bindings enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_early_access_legal_bindings
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_legal_bindings enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_u after update on public.research_early_access_session_bindings referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_session_bindings enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_early_access_session_bindings referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_session_bindings enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_early_access_session_bindings
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_session_bindings enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_early_access_shipping_regions referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_shipping_regions enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_early_access_shipping_regions referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_shipping_regions enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_early_access_shipping_regions referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_shipping_regions enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_early_access_shipping_regions
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_early_access_shipping_regions enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_inventory_lots referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_inventory_lots enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_inventory_lots referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_inventory_lots enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_inventory_lots referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_inventory_lots enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_inventory_lots
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_inventory_lots enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_lot_quality_documents referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_lot_quality_documents enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_lot_quality_documents referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_lot_quality_documents enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_lot_quality_documents referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_lot_quality_documents enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_lot_quality_documents
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_lot_quality_documents enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_lot_quality_tests referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_lot_quality_tests enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_lot_quality_tests referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_lot_quality_tests enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_lot_quality_tests referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_lot_quality_tests enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_lot_quality_tests
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_lot_quality_tests enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_product_content referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_content enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_product_content referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_content enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_product_content referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_content enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_product_content
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_content enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_product_prices referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_prices enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_product_prices referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_prices enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_product_prices referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_prices enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_product_prices
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_prices enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_product_variants referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_variants enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_product_variants referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_variants enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_product_variants referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_variants enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_product_variants
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_product_variants enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_products referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_products enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_products referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_products enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_products referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_products enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_products
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_products enable always trigger research_health_quick_order_guard_t;
create trigger research_health_quick_order_guard_i after insert on public.research_required_inputs referencing new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_required_inputs enable always trigger research_health_quick_order_guard_i;
create trigger research_health_quick_order_guard_u after update on public.research_required_inputs referencing old table as qo_old_rows new table as qo_new_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_required_inputs enable always trigger research_health_quick_order_guard_u;
create trigger research_health_quick_order_guard_d after delete on public.research_required_inputs referencing old table as qo_old_rows
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_required_inputs enable always trigger research_health_quick_order_guard_d;
create trigger research_health_quick_order_guard_t before truncate on public.research_required_inputs
  for each statement execute function public.research_health_quick_order_guard_source_write();
alter table public.research_required_inputs enable always trigger research_health_quick_order_guard_t;
create function public.research_health_quick_order_publish_revision(p_publication pg_catalog.jsonb,p_decision_inputs_text pg_catalog.text)
returns pg_catalog.jsonb language plpgsql volatile security invoker set search_path='' as $publish_revision$
declare revision pg_catalog.uuid; existing pg_catalog.jsonb; existing_decision_inputs_text pg_catalog.text; epoch bigint;
  derived pg_catalog.jsonb; item pg_catalog.jsonb; input public.research_health_quick_order_currentness_scope_inputs%rowtype;
  rows_digest pg_catalog.text; row_counts pg_catalog.jsonb; decision_at pg_catalog.timestamptz;

  limits_raw pg_catalog.text; limits pg_catalog.jsonb; profile pg_catalog.jsonb; anchor pg_catalog.text; catalog_settings pg_catalog.text[];
  login_oid pg_catalog.oid; database_oid pg_catalog.oid; owner_oid pg_catalog.oid; request_role pg_catalog.text;
  timer pg_catalog.text; timer_field pg_catalog.text; timer_raw pg_catalog.text; catalog_raw pg_catalog.text; timer_parts pg_catalog.text[];
  effective_ms numeric; catalog_ms numeric; field pg_catalog.text; section pg_catalog.text; setting_row pg_catalog.text;
  elapsed_ms numeric; class_name pg_catalog.text; timer_values pg_catalog.jsonb := '{}'::pg_catalog.jsonb;
begin
  perform public.research_health_quick_order_currentness_integrity();

  if public.research_health_quick_order_currentness_valid_publication(p_publication) is not true
    or public.research_health_quick_order_currentness_valid_decision_inputs(p_decision_inputs_text,p_publication) is not true then
    raise exception 'Invalid Quick Order publication' using errcode='22023'; end if;
  -- Admission is a catalog/effective-setting consistency check, never proof that
  -- the gateway armed a timer before BEGIN. No value or route is installed here.
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
    or pg_catalog.current_setting('server_version_num')::integer < 170011 then
    raise exception 'Quick Order requires reviewed PostgreSQL 17.11 or later 17.x' using errcode='55000'; end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Quick Order requires READ COMMITTED' using errcode='55000'; end if;
  select oid into login_oid from pg_catalog.pg_roles where rolname=session_user;
  select oid into database_oid from pg_catalog.pg_database where datname=pg_catalog.current_database();
  select relowner into owner_oid from pg_catalog.pg_class
    where oid='public.research_assisted_order_provider_fence'::pg_catalog.regclass;
  request_role := pg_catalog.current_setting('role',true);
  if request_role='none' then request_role:=session_user; end if;
  if login_oid is null or database_oid is null or owner_oid is null or request_role is null
    or current_user<>pg_catalog.pg_get_userbyid(owner_oid) then
    raise exception 'Quick Order connection identities unavailable' using errcode='42501'; end if;
  select setconfig into catalog_settings from pg_catalog.pg_db_role_setting
    where setrole=login_oid and setdatabase=database_oid;
  select pg_catalog.substring(s,pg_catalog.length('research_health_quick_order.approved_limits=')+1)
    into limits_raw from pg_catalog.unnest(catalog_settings) s
    where pg_catalog.starts_with(s,'research_health_quick_order.approved_limits=');
  anchor := case when pg_catalog.obj_description('public.research_health_quick_order_currentness_scope_inputs'::pg_catalog.regclass,'pg_class') ~ '^RHQOC_APPROVED_LIMITS_V1:[0-9a-f]{64}$'
    then pg_catalog.split_part(pg_catalog.obj_description('public.research_health_quick_order_currentness_scope_inputs'::pg_catalog.regclass,'pg_class'),':',2) else null end;
  if anchor is null or anchor !~ '^[0-9a-f]{64}$' or limits_raw is null
    or pg_catalog.encode(extensions.digest(pg_catalog.convert_to(limits_raw,'UTF8'),'sha256'),'hex')<>anchor
    or limits_raw is not json object with unique keys then
    raise exception 'Quick Order approved limits binding unavailable' using errcode='55000'; end if;
  -- Writer/admin canonical encoding is externally bound only by the digest;
  -- this parser checks closed typed content, not canonical re-encoding. jsonb::text
  -- is deliberately not used as the raw artifact's serialization or hash preimage.
  limits:=limits_raw::pg_catalog.jsonb;
  if limits-array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']<>'{}'::pg_catalog.jsonb
    or not limits ?& array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']
    or limits->>'schemaVersion' is distinct from 'quick-order-approved-limits-v1'
    or limits->>'routeClass' is distinct from 'writer' or limits_raw ~ '[^ -~]'
    or limits#>>'{database,name}' is distinct from pg_catalog.current_database()
    or limits#>>'{database,oid}' is distinct from database_oid::pg_catalog.text
    or limits#>>'{loginRole,name}' is distinct from session_user::pg_catalog.text
    or limits#>>'{loginRole,oid}' is distinct from login_oid::pg_catalog.text
    or limits#>>'{requestRole,name}' is distinct from request_role
    or limits#>>'{requestRole,oid}' is distinct from (select oid::pg_catalog.text from pg_catalog.pg_roles where rolname=request_role)
    or limits#>>'{ownerRole,name}' is distinct from current_user::pg_catalog.text
    or limits#>>'{ownerRole,oid}' is distinct from owner_oid::pg_catalog.text then
    raise exception 'Quick Order approved limits identity mismatch' using errcode='55000'; end if;
  foreach field in array array['profileId','profileVersion','routeId','timeZone','dateStyle'] loop
    if pg_catalog.jsonb_typeof(limits->field)<>'string' or pg_catalog.length(limits->>field)=0 then
      raise exception 'Quick Order approved limits identity missing' using errcode='55000'; end if;
  end loop;
  foreach section in array array['database','loginRole','requestRole','ownerRole'] loop
    if pg_catalog.jsonb_typeof(limits->section)<>'object'
      or (limits->section)-array['name','oid']<>'{}'::pg_catalog.jsonb
      or not (limits->section) ?& array['name','oid']
      or pg_catalog.jsonb_typeof(limits#>array[section,'name'])<>'string'
      or pg_catalog.jsonb_typeof(limits#>array[section,'oid'])<>'string'
      or limits#>>array[section,'oid'] !~ '^[1-9][0-9]*$' then
      raise exception 'Quick Order role binding malformed' using errcode='55000'; end if;
  end loop;
  if pg_catalog.jsonb_typeof(limits->'enforcement')<>'object'
    or (limits->'enforcement')-array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']<>'{}'::pg_catalog.jsonb
    or not (limits->'enforcement') ?& array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,preBeginAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,preBeginAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,writerOrderAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,writerOrderAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or limits#>'{enforcement,singleRpcAutocommit}'<>'true'::pg_catalog.jsonb then
    raise exception 'Quick Order route attestation binding missing' using errcode='55000'; end if;
  foreach section in array array['intake','writer'] loop
    profile:=limits->section;
    if pg_catalog.jsonb_typeof(profile)<>'object'
      or not profile ?& array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']
      or (section='intake' and profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']<>'{}'::pg_catalog.jsonb)
      or (section='writer' and (not profile ?& array['gateWaitMs','postGateReserveMs']
        or profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
          'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs','gateWaitMs','postGateReserveMs']<>'{}'::pg_catalog.jsonb)) then
      raise exception 'Quick Order approved limits fields invalid' using errcode='55000'; end if;
    for field in select key from pg_catalog.jsonb_each(profile) loop
      if pg_catalog.jsonb_typeof(profile->field)<>'number' or profile->>field !~ '^[1-9][0-9]*$'
        or (profile->>field)::numeric>9223372036854775807 then
        raise exception 'Quick Order approved limit is not representable positive milliseconds' using errcode='55000'; end if;
    end loop;
    if (profile->>'idleTimeoutMs')::numeric >= (profile->>'statementTimeoutMs')::numeric
      or (profile->>'statementTimeoutMs')::numeric >= (profile->>'transactionTimeoutMs')::numeric
      or (profile->>'attemptDeadlineMs')::numeric <> (profile->>'acquisitionMs')::numeric+
        (profile->>'transactionTimeoutMs')::numeric+(profile->>'cleanupMs')::numeric+(profile->>'responseMs')::numeric then
      raise exception 'Quick Order approved limit relationships invalid' using errcode='55000'; end if;
  end loop;
  if (limits#>>'{intake,lockTimeoutMs}')::numeric >= (limits#>>'{intake,deadlockTimeoutMs}')::numeric
    or (limits#>>'{writer,gateWaitMs}')::numeric < (limits#>>'{intake,transactionTimeoutMs}')::numeric+(limits#>>'{intake,cleanupMs}')::numeric
    or (limits#>>'{writer,lockTimeoutMs}')::numeric <> (limits#>>'{writer,gateWaitMs}')::numeric
    or (limits#>>'{writer,gateWaitMs}')::numeric+(limits#>>'{writer,postGateReserveMs}')::numeric >= (limits#>>'{writer,statementTimeoutMs}')::numeric then
    raise exception 'Quick Order approved gate relationships invalid' using errcode='55000'; end if;
  profile:=limits->'writer';
  for timer,timer_field in select * from (values ('lock_timeout','lockTimeoutMs'),('statement_timeout','statementTimeoutMs'),
    ('transaction_timeout','transactionTimeoutMs'),('idle_in_transaction_session_timeout','idleTimeoutMs'),('deadlock_timeout','deadlockTimeoutMs')) timers(name,field) loop
    timer_raw:=pg_catalog.current_setting(timer,true);
    timer_parts:=pg_catalog.regexp_match(timer_raw,'^([1-9][0-9]*)(ms|s)$');
    if timer_parts is null then
      raise exception 'Quick Order effective timer unavailable or unsupported' using errcode='55000'; end if;
    effective_ms:=timer_parts[1]::numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
    if effective_ms>9223372036854775807 or effective_ms>(profile->>timer_field)::numeric then
      raise exception 'Quick Order effective timer exceeds approved field' using errcode='55000'; end if;
    timer_values:=timer_values||pg_catalog.jsonb_build_object(timer_field,effective_ms);
    if timer in ('statement_timeout','transaction_timeout','idle_in_transaction_session_timeout') then
      select pg_catalog.substring(s,pg_catalog.length(timer)+2) into catalog_raw
        from pg_catalog.unnest(catalog_settings) s where pg_catalog.starts_with(s,timer||'=');
      timer_parts:=pg_catalog.regexp_match(catalog_raw,'^([1-9][0-9]*)(ms|s)$');
      if timer_parts is null then
        raise exception 'Quick Order startup timer binding missing' using errcode='55000'; end if;
      catalog_ms:=timer_parts[1]::numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
      if catalog_ms>9223372036854775807 or catalog_ms<>effective_ms then
        raise exception 'Quick Order effective startup timer mismatch' using errcode='55000'; end if;
    end if;
  end loop;
  if (timer_values->>'idleTimeoutMs')::numeric >= (timer_values->>'statementTimeoutMs')::numeric
    or (timer_values->>'statementTimeoutMs')::numeric >= (timer_values->>'transactionTimeoutMs')::numeric
    or ('writer'='intake' and (timer_values->>'lockTimeoutMs')::numeric >= (timer_values->>'deadlockTimeoutMs')::numeric)
    or ('writer'='writer' and (timer_values->>'lockTimeoutMs')::numeric < (limits#>>'{writer,gateWaitMs}')::numeric)
    or pg_catalog.current_setting('TimeZone') is distinct from limits->>'timeZone'
    or pg_catalog.current_setting('DateStyle') is distinct from limits->>'dateStyle' then
    raise exception 'Quick Order effective profile relationship mismatch' using errcode='55000'; end if;
  elapsed_ms:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp())*1000;
  if elapsed_ms<0 or elapsed_ms >= (timer_values->>'transactionTimeoutMs')::numeric then
    raise exception 'Quick Order transaction budget exhausted' using errcode='55000'; end if;

  revision:=(p_publication->>'revisionId')::pg_catalog.uuid;
  lock table public.research_domain_launch_controls in share mode nowait;
  lock table public.research_early_access_legal_bindings in share mode nowait;
  lock table public.research_early_access_session_bindings in share mode nowait;
  lock table public.research_early_access_shipping_regions in share mode nowait;
  lock table public.research_inventory_lots in share mode nowait;
  lock table public.research_lot_quality_documents in share mode nowait;
  lock table public.research_lot_quality_tests in share mode nowait;
  lock table public.research_product_content in share mode nowait;
  lock table public.research_product_prices in share mode nowait;
  lock table public.research_product_variants in share mode nowait;
  lock table public.research_products in share mode nowait;
  lock table public.research_required_inputs in share mode nowait;
  elapsed_ms:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp())*1000;
  if (timer_values->>'transactionTimeoutMs')::numeric-elapsed_ms <
      (limits#>>'{writer,gateWaitMs}')::numeric+(limits#>>'{writer,postGateReserveMs}')::numeric then
    raise exception 'Quick Order remaining transaction budget insufficient for gate' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_locks l where l.locktype='advisory'
    and l.database=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())
    and l.pid=pg_catalog.pg_backend_pid() and l.classid=1380471107::pg_catalog.oid and l.objid=1::pg_catalog.oid
    and l.objsubid=2 and l.mode='ShareLock' and l.granted) then
    raise exception 'Quick Order shared authority gate upgrade refused' using errcode='55000'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1380471107,1);
  perform 1 from public.research_health_quick_order_authority_head where singleton for update;
  if not found then raise exception 'Quick Order authority head unavailable' using errcode='55000'; end if;
  decision_at:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());
  if exists(select 1 from public.research_health_quick_order_authority_revocations where revision_id=revision) then
    raise exception 'Quick Order revoked revision cannot be republished' using errcode='55000'; end if;
  derived:=public.research_health_quick_order_currentness_resolve_scope(revision,'derive',pg_catalog.jsonb_build_object('publication',p_publication,'decisionInputsText',p_decision_inputs_text));
  select * into input from public.research_health_quick_order_currentness_scope_inputs where revision_id=revision;
  select publication,decision_inputs_text into existing,existing_decision_inputs_text
    from public.research_health_quick_order_authority_revisions where revision_id=revision;
  if found then
    if existing is distinct from p_publication or pg_catalog.convert_to(existing_decision_inputs_text,'UTF8') is distinct from pg_catalog.convert_to(p_decision_inputs_text,'UTF8') then
      raise exception 'Quick Order publication conflict' using errcode='23505'; end if;
    perform public.research_health_quick_order_currentness_resolve_scope(revision,'verify','{}'::pg_catalog.jsonb);
    if derived->'rows' is distinct from (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(row_kind,identity_key,product_id::pg_catalog.text,variant_id::pg_catalog.text,lot_uuid::pg_catalog.text,document_uuid::pg_catalog.text,
        offering_variant_id,product_identifier,variant_identifier,domain,country,provenance)
      order by pg_catalog.convert_to(row_kind,'UTF8'),pg_catalog.convert_to(identity_key,'UTF8')) from public.research_health_quick_order_authority_scope_members where revision_id=revision and row_kind<>'header') then
      raise exception 'Quick Order immutable scope closure changed; new revision required' using errcode='55000'; end if;
  else
    insert into public.research_health_quick_order_authority_revisions(revision_id,publication,decision_inputs_text)
      values(revision,p_publication,p_decision_inputs_text);
    for item in select value from pg_catalog.jsonb_array_elements(derived->'rows') loop
      insert into public.research_health_quick_order_authority_scope_members(revision_id,row_kind,identity_key,product_id,variant_id,lot_uuid,document_uuid,
        offering_variant_id,product_identifier,variant_identifier,domain,country,provenance)
      values(revision,item->>0,item->>1,(item->>2)::pg_catalog.uuid,(item->>3)::pg_catalog.uuid,(item->>4)::pg_catalog.uuid,(item->>5)::pg_catalog.uuid,
        item->>6,item->>7,item->>8,item->>9,item->>10,item->11);
    end loop;
    select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.string_agg(
      pg_catalog.json_build_array(row_kind,identity_key,product_id::pg_catalog.text,variant_id::pg_catalog.text,lot_uuid::pg_catalog.text,document_uuid::pg_catalog.text,
        offering_variant_id,product_identifier,variant_identifier,domain,country,provenance)::pg_catalog.text,
      E'\n' order by pg_catalog.convert_to(row_kind,'UTF8'),pg_catalog.convert_to(identity_key,'UTF8')),''),'UTF8'),'sha256'),'hex')
      into rows_digest from public.research_health_quick_order_authority_scope_members where revision_id=revision and row_kind<>'header';
    select pg_catalog.jsonb_object_agg(row_kind,n) into row_counts from (select row_kind,pg_catalog.count(*) n from public.research_health_quick_order_authority_scope_members
      where revision_id=revision and row_kind<>'header' group by row_kind) counts;
    insert into public.research_health_quick_order_authority_scope_members(revision_id,row_kind,identity_key,provenance)
      values(revision,'header','header',pg_catalog.jsonb_build_object('revisionId',revision::pg_catalog.text,'sourceCommit',input.source_commit,
        'decisionTextSha256',input.decision_text_sha256,'readerCensusSha256',input.reader_census_sha256,'canonicalReaderProfile',input.canonical_reader_profile,
        'constructionReceiptSha256',input.construction_receipt_sha256,'rowsSha256',rows_digest,'rowCounts',row_counts));
  end if;
  update public.research_health_quick_order_authority_head set state='held',active_revision_id=null,last_published_revision_id=revision,
    writer_epoch=writer_epoch+1,updated_at=decision_at,updated_by=current_user where singleton returning writer_epoch into epoch;
  return pg_catalog.jsonb_build_object('state','held','revisionId',revision::pg_catalog.text,'writerEpoch',epoch::pg_catalog.text);
end
$publish_revision$;

create function public.research_health_quick_order_revoke_revision(p_revision_id pg_catalog.uuid,p_reason pg_catalog.text)
returns pg_catalog.jsonb language plpgsql volatile security invoker set search_path='' as $revoke_revision$
declare epoch bigint; decision_at pg_catalog.timestamptz;

  limits_raw pg_catalog.text; limits pg_catalog.jsonb; profile pg_catalog.jsonb; anchor pg_catalog.text; catalog_settings pg_catalog.text[];
  login_oid pg_catalog.oid; database_oid pg_catalog.oid; owner_oid pg_catalog.oid; request_role pg_catalog.text;
  timer pg_catalog.text; timer_field pg_catalog.text; timer_raw pg_catalog.text; catalog_raw pg_catalog.text; timer_parts pg_catalog.text[];
  effective_ms numeric; catalog_ms numeric; field pg_catalog.text; section pg_catalog.text; setting_row pg_catalog.text;
  elapsed_ms numeric; class_name pg_catalog.text; timer_values pg_catalog.jsonb := '{}'::pg_catalog.jsonb;
begin
  perform public.research_health_quick_order_currentness_integrity();

  -- Admission is a catalog/effective-setting consistency check, never proof that
  -- the gateway armed a timer before BEGIN. No value or route is installed here.
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
    or pg_catalog.current_setting('server_version_num')::integer < 170011 then
    raise exception 'Quick Order requires reviewed PostgreSQL 17.11 or later 17.x' using errcode='55000'; end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Quick Order requires READ COMMITTED' using errcode='55000'; end if;
  select oid into login_oid from pg_catalog.pg_roles where rolname=session_user;
  select oid into database_oid from pg_catalog.pg_database where datname=pg_catalog.current_database();
  select relowner into owner_oid from pg_catalog.pg_class
    where oid='public.research_assisted_order_provider_fence'::pg_catalog.regclass;
  request_role := pg_catalog.current_setting('role',true);
  if request_role='none' then request_role:=session_user; end if;
  if login_oid is null or database_oid is null or owner_oid is null or request_role is null
    or current_user<>pg_catalog.pg_get_userbyid(owner_oid) then
    raise exception 'Quick Order connection identities unavailable' using errcode='42501'; end if;
  select setconfig into catalog_settings from pg_catalog.pg_db_role_setting
    where setrole=login_oid and setdatabase=database_oid;
  select pg_catalog.substring(s,pg_catalog.length('research_health_quick_order.approved_limits=')+1)
    into limits_raw from pg_catalog.unnest(catalog_settings) s
    where pg_catalog.starts_with(s,'research_health_quick_order.approved_limits=');
  anchor := case when pg_catalog.obj_description('public.research_health_quick_order_currentness_scope_inputs'::pg_catalog.regclass,'pg_class') ~ '^RHQOC_APPROVED_LIMITS_V1:[0-9a-f]{64}$'
    then pg_catalog.split_part(pg_catalog.obj_description('public.research_health_quick_order_currentness_scope_inputs'::pg_catalog.regclass,'pg_class'),':',2) else null end;
  if anchor is null or anchor !~ '^[0-9a-f]{64}$' or limits_raw is null
    or pg_catalog.encode(extensions.digest(pg_catalog.convert_to(limits_raw,'UTF8'),'sha256'),'hex')<>anchor
    or limits_raw is not json object with unique keys then
    raise exception 'Quick Order approved limits binding unavailable' using errcode='55000'; end if;
  -- Writer/admin canonical encoding is externally bound only by the digest;
  -- this parser checks closed typed content, not canonical re-encoding. jsonb::text
  -- is deliberately not used as the raw artifact's serialization or hash preimage.
  limits:=limits_raw::pg_catalog.jsonb;
  if limits-array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']<>'{}'::pg_catalog.jsonb
    or not limits ?& array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']
    or limits->>'schemaVersion' is distinct from 'quick-order-approved-limits-v1'
    or limits->>'routeClass' is distinct from 'writer' or limits_raw ~ '[^ -~]'
    or limits#>>'{database,name}' is distinct from pg_catalog.current_database()
    or limits#>>'{database,oid}' is distinct from database_oid::pg_catalog.text
    or limits#>>'{loginRole,name}' is distinct from session_user::pg_catalog.text
    or limits#>>'{loginRole,oid}' is distinct from login_oid::pg_catalog.text
    or limits#>>'{requestRole,name}' is distinct from request_role
    or limits#>>'{requestRole,oid}' is distinct from (select oid::pg_catalog.text from pg_catalog.pg_roles where rolname=request_role)
    or limits#>>'{ownerRole,name}' is distinct from current_user::pg_catalog.text
    or limits#>>'{ownerRole,oid}' is distinct from owner_oid::pg_catalog.text then
    raise exception 'Quick Order approved limits identity mismatch' using errcode='55000'; end if;
  foreach field in array array['profileId','profileVersion','routeId','timeZone','dateStyle'] loop
    if pg_catalog.jsonb_typeof(limits->field)<>'string' or pg_catalog.length(limits->>field)=0 then
      raise exception 'Quick Order approved limits identity missing' using errcode='55000'; end if;
  end loop;
  foreach section in array array['database','loginRole','requestRole','ownerRole'] loop
    if pg_catalog.jsonb_typeof(limits->section)<>'object'
      or (limits->section)-array['name','oid']<>'{}'::pg_catalog.jsonb
      or not (limits->section) ?& array['name','oid']
      or pg_catalog.jsonb_typeof(limits#>array[section,'name'])<>'string'
      or pg_catalog.jsonb_typeof(limits#>array[section,'oid'])<>'string'
      or limits#>>array[section,'oid'] !~ '^[1-9][0-9]*$' then
      raise exception 'Quick Order role binding malformed' using errcode='55000'; end if;
  end loop;
  if pg_catalog.jsonb_typeof(limits->'enforcement')<>'object'
    or (limits->'enforcement')-array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']<>'{}'::pg_catalog.jsonb
    or not (limits->'enforcement') ?& array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,preBeginAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,preBeginAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,writerOrderAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,writerOrderAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or limits#>'{enforcement,singleRpcAutocommit}'<>'true'::pg_catalog.jsonb then
    raise exception 'Quick Order route attestation binding missing' using errcode='55000'; end if;
  foreach section in array array['intake','writer'] loop
    profile:=limits->section;
    if pg_catalog.jsonb_typeof(profile)<>'object'
      or not profile ?& array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']
      or (section='intake' and profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']<>'{}'::pg_catalog.jsonb)
      or (section='writer' and (not profile ?& array['gateWaitMs','postGateReserveMs']
        or profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
          'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs','gateWaitMs','postGateReserveMs']<>'{}'::pg_catalog.jsonb)) then
      raise exception 'Quick Order approved limits fields invalid' using errcode='55000'; end if;
    for field in select key from pg_catalog.jsonb_each(profile) loop
      if pg_catalog.jsonb_typeof(profile->field)<>'number' or profile->>field !~ '^[1-9][0-9]*$'
        or (profile->>field)::numeric>9223372036854775807 then
        raise exception 'Quick Order approved limit is not representable positive milliseconds' using errcode='55000'; end if;
    end loop;
    if (profile->>'idleTimeoutMs')::numeric >= (profile->>'statementTimeoutMs')::numeric
      or (profile->>'statementTimeoutMs')::numeric >= (profile->>'transactionTimeoutMs')::numeric
      or (profile->>'attemptDeadlineMs')::numeric <> (profile->>'acquisitionMs')::numeric+
        (profile->>'transactionTimeoutMs')::numeric+(profile->>'cleanupMs')::numeric+(profile->>'responseMs')::numeric then
      raise exception 'Quick Order approved limit relationships invalid' using errcode='55000'; end if;
  end loop;
  if (limits#>>'{intake,lockTimeoutMs}')::numeric >= (limits#>>'{intake,deadlockTimeoutMs}')::numeric
    or (limits#>>'{writer,gateWaitMs}')::numeric < (limits#>>'{intake,transactionTimeoutMs}')::numeric+(limits#>>'{intake,cleanupMs}')::numeric
    or (limits#>>'{writer,lockTimeoutMs}')::numeric <> (limits#>>'{writer,gateWaitMs}')::numeric
    or (limits#>>'{writer,gateWaitMs}')::numeric+(limits#>>'{writer,postGateReserveMs}')::numeric >= (limits#>>'{writer,statementTimeoutMs}')::numeric then
    raise exception 'Quick Order approved gate relationships invalid' using errcode='55000'; end if;
  profile:=limits->'writer';
  for timer,timer_field in select * from (values ('lock_timeout','lockTimeoutMs'),('statement_timeout','statementTimeoutMs'),
    ('transaction_timeout','transactionTimeoutMs'),('idle_in_transaction_session_timeout','idleTimeoutMs'),('deadlock_timeout','deadlockTimeoutMs')) timers(name,field) loop
    timer_raw:=pg_catalog.current_setting(timer,true);
    timer_parts:=pg_catalog.regexp_match(timer_raw,'^([1-9][0-9]*)(ms|s)$');
    if timer_parts is null then
      raise exception 'Quick Order effective timer unavailable or unsupported' using errcode='55000'; end if;
    effective_ms:=timer_parts[1]::numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
    if effective_ms>9223372036854775807 or effective_ms>(profile->>timer_field)::numeric then
      raise exception 'Quick Order effective timer exceeds approved field' using errcode='55000'; end if;
    timer_values:=timer_values||pg_catalog.jsonb_build_object(timer_field,effective_ms);
    if timer in ('statement_timeout','transaction_timeout','idle_in_transaction_session_timeout') then
      select pg_catalog.substring(s,pg_catalog.length(timer)+2) into catalog_raw
        from pg_catalog.unnest(catalog_settings) s where pg_catalog.starts_with(s,timer||'=');
      timer_parts:=pg_catalog.regexp_match(catalog_raw,'^([1-9][0-9]*)(ms|s)$');
      if timer_parts is null then
        raise exception 'Quick Order startup timer binding missing' using errcode='55000'; end if;
      catalog_ms:=timer_parts[1]::numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
      if catalog_ms>9223372036854775807 or catalog_ms<>effective_ms then
        raise exception 'Quick Order effective startup timer mismatch' using errcode='55000'; end if;
    end if;
  end loop;
  if (timer_values->>'idleTimeoutMs')::numeric >= (timer_values->>'statementTimeoutMs')::numeric
    or (timer_values->>'statementTimeoutMs')::numeric >= (timer_values->>'transactionTimeoutMs')::numeric
    or ('writer'='intake' and (timer_values->>'lockTimeoutMs')::numeric >= (timer_values->>'deadlockTimeoutMs')::numeric)
    or ('writer'='writer' and (timer_values->>'lockTimeoutMs')::numeric < (limits#>>'{writer,gateWaitMs}')::numeric)
    or pg_catalog.current_setting('TimeZone') is distinct from limits->>'timeZone'
    or pg_catalog.current_setting('DateStyle') is distinct from limits->>'dateStyle' then
    raise exception 'Quick Order effective profile relationship mismatch' using errcode='55000'; end if;
  elapsed_ms:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp())*1000;
  if elapsed_ms<0 or elapsed_ms >= (timer_values->>'transactionTimeoutMs')::numeric then
    raise exception 'Quick Order transaction budget exhausted' using errcode='55000'; end if;

  if p_revision_id is null or p_reason is null or p_reason !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    raise exception 'Invalid Quick Order revocation' using errcode='22023'; end if;
  -- NO source-table lock: revocation must be able to queue at the gate while
  -- ordinary source DML is open. Its timeout never implies successful revocation.
  elapsed_ms:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp())*1000;
  if (timer_values->>'transactionTimeoutMs')::numeric-elapsed_ms <
      (limits#>>'{writer,gateWaitMs}')::numeric+(limits#>>'{writer,postGateReserveMs}')::numeric then
    raise exception 'Quick Order remaining transaction budget insufficient for gate' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_locks l where l.locktype='advisory'
    and l.database=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())
    and l.pid=pg_catalog.pg_backend_pid() and l.classid=1380471107::pg_catalog.oid and l.objid=1::pg_catalog.oid
    and l.objsubid=2 and l.mode='ShareLock' and l.granted) then
    raise exception 'Quick Order shared authority gate upgrade refused' using errcode='55000'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1380471107,1);
  perform 1 from public.research_health_quick_order_authority_head where singleton for update;
  if not found then raise exception 'Quick Order authority head unavailable' using errcode='55000'; end if;
  -- Successor disclosure: unknown AND already-revoked revisions return 55000
  -- (the historical S0 unknown-revision contract was 22023). No mutation occurs.
  if not exists(select 1 from public.research_health_quick_order_authority_revisions where revision_id=p_revision_id)
    or exists(select 1 from public.research_health_quick_order_authority_revocations where revision_id=p_revision_id) then
    raise exception 'Quick Order revision unavailable or already revoked' using errcode='55000'; end if;
  decision_at:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());
  update public.research_health_quick_order_authority_head set state='held',active_revision_id=null,last_revoked_revision_id=p_revision_id,
    last_revoke_reason=p_reason,writer_epoch=writer_epoch+1,updated_at=decision_at,updated_by=current_user where singleton returning writer_epoch into epoch;
  insert into public.research_health_quick_order_authority_revocations(revision_id,writer_epoch,reason,revoked_at,revoked_by)
    values(p_revision_id,epoch,p_reason,decision_at,current_user);
  return pg_catalog.jsonb_build_object('state','held','revisionId',p_revision_id::pg_catalog.text,'writerEpoch',epoch::pg_catalog.text);
end
$revoke_revision$;

create function public.research_health_quick_order_currentness_activate_revision(p_revision_id pg_catalog.uuid,p_expected_epoch bigint,p_source_commit pg_catalog.text,p_census_sha256 pg_catalog.text)
returns pg_catalog.jsonb language plpgsql volatile security invoker set search_path='' as $activate_revision$
declare h public.research_health_quick_order_authority_head%rowtype; r public.research_health_quick_order_authority_revisions%rowtype;
  i public.research_health_quick_order_currentness_scope_inputs%rowtype; derived pg_catalog.jsonb; decision_at pg_catalog.timestamptz; epoch bigint;

  limits_raw pg_catalog.text; limits pg_catalog.jsonb; profile pg_catalog.jsonb; anchor pg_catalog.text; catalog_settings pg_catalog.text[];
  login_oid pg_catalog.oid; database_oid pg_catalog.oid; owner_oid pg_catalog.oid; request_role pg_catalog.text;
  timer pg_catalog.text; timer_field pg_catalog.text; timer_raw pg_catalog.text; catalog_raw pg_catalog.text; timer_parts pg_catalog.text[];
  effective_ms numeric; catalog_ms numeric; field pg_catalog.text; section pg_catalog.text; setting_row pg_catalog.text;
  elapsed_ms numeric; class_name pg_catalog.text; timer_values pg_catalog.jsonb := '{}'::pg_catalog.jsonb;
begin
  perform public.research_health_quick_order_currentness_integrity();

  -- Admission is a catalog/effective-setting consistency check, never proof that
  -- the gateway armed a timer before BEGIN. No value or route is installed here.
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
    or pg_catalog.current_setting('server_version_num')::integer < 170011 then
    raise exception 'Quick Order requires reviewed PostgreSQL 17.11 or later 17.x' using errcode='55000'; end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Quick Order requires READ COMMITTED' using errcode='55000'; end if;
  select oid into login_oid from pg_catalog.pg_roles where rolname=session_user;
  select oid into database_oid from pg_catalog.pg_database where datname=pg_catalog.current_database();
  select relowner into owner_oid from pg_catalog.pg_class
    where oid='public.research_assisted_order_provider_fence'::pg_catalog.regclass;
  request_role := pg_catalog.current_setting('role',true);
  if request_role='none' then request_role:=session_user; end if;
  if login_oid is null or database_oid is null or owner_oid is null or request_role is null
    or current_user<>pg_catalog.pg_get_userbyid(owner_oid) then
    raise exception 'Quick Order connection identities unavailable' using errcode='42501'; end if;
  select setconfig into catalog_settings from pg_catalog.pg_db_role_setting
    where setrole=login_oid and setdatabase=database_oid;
  select pg_catalog.substring(s,pg_catalog.length('research_health_quick_order.approved_limits=')+1)
    into limits_raw from pg_catalog.unnest(catalog_settings) s
    where pg_catalog.starts_with(s,'research_health_quick_order.approved_limits=');
  anchor := case when pg_catalog.obj_description('public.research_health_quick_order_currentness_scope_inputs'::pg_catalog.regclass,'pg_class') ~ '^RHQOC_APPROVED_LIMITS_V1:[0-9a-f]{64}$'
    then pg_catalog.split_part(pg_catalog.obj_description('public.research_health_quick_order_currentness_scope_inputs'::pg_catalog.regclass,'pg_class'),':',2) else null end;
  if anchor is null or anchor !~ '^[0-9a-f]{64}$' or limits_raw is null
    or pg_catalog.encode(extensions.digest(pg_catalog.convert_to(limits_raw,'UTF8'),'sha256'),'hex')<>anchor
    or limits_raw is not json object with unique keys then
    raise exception 'Quick Order approved limits binding unavailable' using errcode='55000'; end if;
  -- Writer/admin canonical encoding is externally bound only by the digest;
  -- this parser checks closed typed content, not canonical re-encoding. jsonb::text
  -- is deliberately not used as the raw artifact's serialization or hash preimage.
  limits:=limits_raw::pg_catalog.jsonb;
  if limits-array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']<>'{}'::pg_catalog.jsonb
    or not limits ?& array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']
    or limits->>'schemaVersion' is distinct from 'quick-order-approved-limits-v1'
    or limits->>'routeClass' is distinct from 'writer' or limits_raw ~ '[^ -~]'
    or limits#>>'{database,name}' is distinct from pg_catalog.current_database()
    or limits#>>'{database,oid}' is distinct from database_oid::pg_catalog.text
    or limits#>>'{loginRole,name}' is distinct from session_user::pg_catalog.text
    or limits#>>'{loginRole,oid}' is distinct from login_oid::pg_catalog.text
    or limits#>>'{requestRole,name}' is distinct from request_role
    or limits#>>'{requestRole,oid}' is distinct from (select oid::pg_catalog.text from pg_catalog.pg_roles where rolname=request_role)
    or limits#>>'{ownerRole,name}' is distinct from current_user::pg_catalog.text
    or limits#>>'{ownerRole,oid}' is distinct from owner_oid::pg_catalog.text then
    raise exception 'Quick Order approved limits identity mismatch' using errcode='55000'; end if;
  foreach field in array array['profileId','profileVersion','routeId','timeZone','dateStyle'] loop
    if pg_catalog.jsonb_typeof(limits->field)<>'string' or pg_catalog.length(limits->>field)=0 then
      raise exception 'Quick Order approved limits identity missing' using errcode='55000'; end if;
  end loop;
  foreach section in array array['database','loginRole','requestRole','ownerRole'] loop
    if pg_catalog.jsonb_typeof(limits->section)<>'object'
      or (limits->section)-array['name','oid']<>'{}'::pg_catalog.jsonb
      or not (limits->section) ?& array['name','oid']
      or pg_catalog.jsonb_typeof(limits#>array[section,'name'])<>'string'
      or pg_catalog.jsonb_typeof(limits#>array[section,'oid'])<>'string'
      or limits#>>array[section,'oid'] !~ '^[1-9][0-9]*$' then
      raise exception 'Quick Order role binding malformed' using errcode='55000'; end if;
  end loop;
  if pg_catalog.jsonb_typeof(limits->'enforcement')<>'object'
    or (limits->'enforcement')-array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']<>'{}'::pg_catalog.jsonb
    or not (limits->'enforcement') ?& array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,preBeginAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,preBeginAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,writerOrderAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,writerOrderAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or limits#>'{enforcement,singleRpcAutocommit}'<>'true'::pg_catalog.jsonb then
    raise exception 'Quick Order route attestation binding missing' using errcode='55000'; end if;
  foreach section in array array['intake','writer'] loop
    profile:=limits->section;
    if pg_catalog.jsonb_typeof(profile)<>'object'
      or not profile ?& array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']
      or (section='intake' and profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']<>'{}'::pg_catalog.jsonb)
      or (section='writer' and (not profile ?& array['gateWaitMs','postGateReserveMs']
        or profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
          'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs','gateWaitMs','postGateReserveMs']<>'{}'::pg_catalog.jsonb)) then
      raise exception 'Quick Order approved limits fields invalid' using errcode='55000'; end if;
    for field in select key from pg_catalog.jsonb_each(profile) loop
      if pg_catalog.jsonb_typeof(profile->field)<>'number' or profile->>field !~ '^[1-9][0-9]*$'
        or (profile->>field)::numeric>9223372036854775807 then
        raise exception 'Quick Order approved limit is not representable positive milliseconds' using errcode='55000'; end if;
    end loop;
    if (profile->>'idleTimeoutMs')::numeric >= (profile->>'statementTimeoutMs')::numeric
      or (profile->>'statementTimeoutMs')::numeric >= (profile->>'transactionTimeoutMs')::numeric
      or (profile->>'attemptDeadlineMs')::numeric <> (profile->>'acquisitionMs')::numeric+
        (profile->>'transactionTimeoutMs')::numeric+(profile->>'cleanupMs')::numeric+(profile->>'responseMs')::numeric then
      raise exception 'Quick Order approved limit relationships invalid' using errcode='55000'; end if;
  end loop;
  if (limits#>>'{intake,lockTimeoutMs}')::numeric >= (limits#>>'{intake,deadlockTimeoutMs}')::numeric
    or (limits#>>'{writer,gateWaitMs}')::numeric < (limits#>>'{intake,transactionTimeoutMs}')::numeric+(limits#>>'{intake,cleanupMs}')::numeric
    or (limits#>>'{writer,lockTimeoutMs}')::numeric <> (limits#>>'{writer,gateWaitMs}')::numeric
    or (limits#>>'{writer,gateWaitMs}')::numeric+(limits#>>'{writer,postGateReserveMs}')::numeric >= (limits#>>'{writer,statementTimeoutMs}')::numeric then
    raise exception 'Quick Order approved gate relationships invalid' using errcode='55000'; end if;
  profile:=limits->'writer';
  for timer,timer_field in select * from (values ('lock_timeout','lockTimeoutMs'),('statement_timeout','statementTimeoutMs'),
    ('transaction_timeout','transactionTimeoutMs'),('idle_in_transaction_session_timeout','idleTimeoutMs'),('deadlock_timeout','deadlockTimeoutMs')) timers(name,field) loop
    timer_raw:=pg_catalog.current_setting(timer,true);
    timer_parts:=pg_catalog.regexp_match(timer_raw,'^([1-9][0-9]*)(ms|s)$');
    if timer_parts is null then
      raise exception 'Quick Order effective timer unavailable or unsupported' using errcode='55000'; end if;
    effective_ms:=timer_parts[1]::numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
    if effective_ms>9223372036854775807 or effective_ms>(profile->>timer_field)::numeric then
      raise exception 'Quick Order effective timer exceeds approved field' using errcode='55000'; end if;
    timer_values:=timer_values||pg_catalog.jsonb_build_object(timer_field,effective_ms);
    if timer in ('statement_timeout','transaction_timeout','idle_in_transaction_session_timeout') then
      select pg_catalog.substring(s,pg_catalog.length(timer)+2) into catalog_raw
        from pg_catalog.unnest(catalog_settings) s where pg_catalog.starts_with(s,timer||'=');
      timer_parts:=pg_catalog.regexp_match(catalog_raw,'^([1-9][0-9]*)(ms|s)$');
      if timer_parts is null then
        raise exception 'Quick Order startup timer binding missing' using errcode='55000'; end if;
      catalog_ms:=timer_parts[1]::numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
      if catalog_ms>9223372036854775807 or catalog_ms<>effective_ms then
        raise exception 'Quick Order effective startup timer mismatch' using errcode='55000'; end if;
    end if;
  end loop;
  if (timer_values->>'idleTimeoutMs')::numeric >= (timer_values->>'statementTimeoutMs')::numeric
    or (timer_values->>'statementTimeoutMs')::numeric >= (timer_values->>'transactionTimeoutMs')::numeric
    or ('writer'='intake' and (timer_values->>'lockTimeoutMs')::numeric >= (timer_values->>'deadlockTimeoutMs')::numeric)
    or ('writer'='writer' and (timer_values->>'lockTimeoutMs')::numeric < (limits#>>'{writer,gateWaitMs}')::numeric)
    or pg_catalog.current_setting('TimeZone') is distinct from limits->>'timeZone'
    or pg_catalog.current_setting('DateStyle') is distinct from limits->>'dateStyle' then
    raise exception 'Quick Order effective profile relationship mismatch' using errcode='55000'; end if;
  elapsed_ms:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp())*1000;
  if elapsed_ms<0 or elapsed_ms >= (timer_values->>'transactionTimeoutMs')::numeric then
    raise exception 'Quick Order transaction budget exhausted' using errcode='55000'; end if;

  if p_revision_id is null or p_expected_epoch is null or p_expected_epoch<0 or p_source_commit is null or p_source_commit !~ '^[0-9a-f]{40}$'
    or p_census_sha256 is null or p_census_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Quick Order activation arguments invalid' using errcode='22023'; end if;
  lock table public.research_domain_launch_controls in share mode nowait;
  lock table public.research_early_access_legal_bindings in share mode nowait;
  lock table public.research_early_access_session_bindings in share mode nowait;
  lock table public.research_early_access_shipping_regions in share mode nowait;
  lock table public.research_inventory_lots in share mode nowait;
  lock table public.research_lot_quality_documents in share mode nowait;
  lock table public.research_lot_quality_tests in share mode nowait;
  lock table public.research_product_content in share mode nowait;
  lock table public.research_product_prices in share mode nowait;
  lock table public.research_product_variants in share mode nowait;
  lock table public.research_products in share mode nowait;
  lock table public.research_required_inputs in share mode nowait;
  elapsed_ms:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp())*1000;
  if (timer_values->>'transactionTimeoutMs')::numeric-elapsed_ms <
      (limits#>>'{writer,gateWaitMs}')::numeric+(limits#>>'{writer,postGateReserveMs}')::numeric then
    raise exception 'Quick Order remaining transaction budget insufficient for gate' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_locks l where l.locktype='advisory'
    and l.database=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())
    and l.pid=pg_catalog.pg_backend_pid() and l.classid=1380471107::pg_catalog.oid and l.objid=1::pg_catalog.oid
    and l.objsubid=2 and l.mode='ShareLock' and l.granted) then
    raise exception 'Quick Order shared authority gate upgrade refused' using errcode='55000'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1380471107,1);
  select * into h from public.research_health_quick_order_authority_head where singleton for update;
  if not found then raise exception 'Quick Order authority head unavailable' using errcode='55000'; end if;
  decision_at:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());
  if h.state<>'held' or h.active_revision_id is not null or h.writer_epoch<>p_expected_epoch or h.last_published_revision_id is distinct from p_revision_id
    or exists(select 1 from public.research_health_quick_order_authority_revocations where revision_id=p_revision_id) then
    raise exception 'Quick Order activation stale or revoked' using errcode='55000'; end if;
  select * into r from public.research_health_quick_order_authority_revisions where revision_id=p_revision_id;
  if not found then raise exception 'Quick Order activation revision missing' using errcode='55000'; end if;
  select * into i from public.research_health_quick_order_currentness_scope_inputs where revision_id=p_revision_id;
  if not found or i.source_commit is distinct from p_source_commit or i.reader_census_sha256 is distinct from p_census_sha256
    or p_source_commit is distinct from r.publication->>'sourceCommit'
    or decision_at<(r.publication->>'effectiveFrom')::pg_catalog.timestamptz
    or (r.publication->>'effectiveUntil' is not null and decision_at>=(r.publication->>'effectiveUntil')::pg_catalog.timestamptz) then
    raise exception 'Quick Order activation external binding or effectivity invalid' using errcode='55000'; end if;
  perform public.research_health_quick_order_currentness_resolve_scope(p_revision_id,'verify','{}'::pg_catalog.jsonb);
  derived:=public.research_health_quick_order_currentness_resolve_scope(p_revision_id,'derive',pg_catalog.jsonb_build_object('publication',r.publication,'decisionInputsText',r.decision_inputs_text));
  if derived->'rows' is distinct from (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(row_kind,identity_key,product_id::pg_catalog.text,variant_id::pg_catalog.text,lot_uuid::pg_catalog.text,document_uuid::pg_catalog.text,
      offering_variant_id,product_identifier,variant_identifier,domain,country,provenance)
    order by pg_catalog.convert_to(row_kind,'UTF8'),pg_catalog.convert_to(identity_key,'UTF8')) from public.research_health_quick_order_authority_scope_members where revision_id=p_revision_id and row_kind<>'header') then
    raise exception 'Quick Order closure changed; new revision required' using errcode='55000'; end if;
  epoch:=h.writer_epoch+1;
  insert into public.research_health_quick_order_authority_activations(revision_id,writer_epoch,source_commit,reader_census_sha256,activated_at,activated_by)
    values(p_revision_id,epoch,p_source_commit,p_census_sha256,decision_at,current_user);
  update public.research_health_quick_order_authority_head set state='active',active_revision_id=p_revision_id,writer_epoch=epoch,
    updated_at=decision_at,updated_by=current_user where singleton;
  return pg_catalog.jsonb_build_object('state','active','revisionId',p_revision_id::pg_catalog.text,'writerEpoch',epoch::pg_catalog.text);
end
$activate_revision$;


create function public.research_health_quick_order_read_current_authority()
returns pg_catalog.jsonb language sql stable security invoker set search_path='' as $read_current_authority$
  -- Intentionally independent of row state: a missing OR manually active head
  -- cannot bypass the private strict reader and its transaction protocol.
  select pg_catalog.jsonb_build_object('state','unavailable','code','quick_order_currentness_not_implemented');
$read_current_authority$;
revoke all on function public.research_health_quick_order_currentness_read_strict_authority(pg_catalog.timestamptz),
  public.research_health_quick_order_currentness_resolve_scope(pg_catalog.uuid,pg_catalog.text,pg_catalog.jsonb),
  public.research_health_quick_order_currentness_activate_revision(pg_catalog.uuid,bigint,pg_catalog.text,pg_catalog.text),
  public.research_health_quick_order_guard_source_write(),
  public.research_health_quick_order_currentness_refuse_mutation(),
  public.research_health_quick_order_currentness_monotonic_epoch(),
  public.research_health_quick_order_currentness_valid_publication(pg_catalog.jsonb),
  public.research_health_quick_order_currentness_valid_decision_inputs(pg_catalog.text,pg_catalog.jsonb),
  public.research_health_quick_order_currentness_integrity(),
  public.research_health_quick_order_publish_revision(pg_catalog.jsonb,pg_catalog.text),
  public.research_health_quick_order_revoke_revision(pg_catalog.uuid,pg_catalog.text),
  public.research_health_quick_order_read_current_authority() from public,anon,authenticated,service_role;
$currentness_install$;
begin
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
    or pg_catalog.current_setting('server_version_num')::integer < 170011 then
    raise exception 'Quick Order requires reviewed PostgreSQL 17.11 or later 17.x' using errcode='55000'; end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Quick Order requires READ COMMITTED' using errcode='55000'; end if;
  -- This source-column digest is independently derived from the accepted source
  -- census/fixture, not learned from the target. No missing-value adoption.
  expected_columns:=null;
  -- DOC80_SOURCE_STRUCTURE_BEGIN: identical in install/reapply, pre/post,
  -- runtime integrity and rollback. Columns are pinned by the independently
  -- accepted descriptor and trigger comments; common owner by integrity's owner
  -- predicate. Source defaults/constraints/indexes/RLS/ACL are NOT adopted (MD640).
  if (with guarded as (select c.* from pg_catalog.pg_class c
      where c.relnamespace='public'::pg_catalog.regnamespace and c.relname=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs']))
    select pg_catalog.count(*)<>12 or coalesce(pg_catalog.bool_or(relkind<>'r' or relispartition),false)
      or exists(select 1 from pg_catalog.pg_inherits i where i.inhrelid in(select oid from guarded) or i.inhparent in(select oid from guarded))
      or exists(select 1 from pg_catalog.pg_rewrite r where r.ev_class in(select oid from guarded))
      or exists(select 1 from pg_catalog.pg_subscription_rel r where r.srrelid in(select oid from guarded))
    from guarded) then
    raise exception 'Quick Order source relation structure drift' using errcode='55000'; end if;
  -- DOC80_SOURCE_STRUCTURE_END

  -- DOC71_SOURCE_COLUMN_DESCRIPTOR_SEAL: deliberately absent. The exact complete
  -- schema descriptor is supplied only by a later accepted S/census source
  -- successor; no caller GUC, live-schema learning or test source rewriting can
  -- make this exact target installable. This is an existing input dependency,
  -- not a new policy choice. Runtime bodies remain authored, never installed.
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.string_agg(
    c.relname||':'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attnum,a.attname,
    pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text)
    order by a.attnum)::pg_catalog.text from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0),'[]'),'UTF8'),'sha256'),'hex'),E'\n' order by c.relname collate pg_catalog."C"),'UTF8'),'sha256'),'hex') into actual_columns
    from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and c.relname=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs']);
  if expected_columns is null or expected_columns !~ '^[0-9a-f]{64}$' or expected_columns is distinct from actual_columns
    or (select pg_catalog.count(*) from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and c.relname=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs']) and c.relkind='r')<>12 then
    raise exception 'Quick Order reviewed source-column descriptor binding unavailable' using errcode='55000'; end if;
  perform public.research_assisted_order_provider_settlement_integrity();
  predecessor_fingerprint := public.research_assisted_order_provider_schema_fingerprint();
  if current_user<>pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class
    where oid='public.research_assisted_order_provider_fence'::pg_catalog.regclass)) then
    raise exception 'Canonical schema owner required' using errcode='42501'; end if;
  if (select pg_catalog.jsonb_agg(v order by v::pg_catalog.text) from pg_catalog.jsonb_array_elements(expected_triggers) v)
    is distinct from (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,t.tgname,t.tgenabled::pg_catalog.text)
      order by pg_catalog.jsonb_build_array(c.relname,t.tgname,t.tgenabled::pg_catalog.text)::pg_catalog.text)
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid where not t.tgisinternal
      and c.relnamespace='public'::pg_catalog.regnamespace and c.relname in
        ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')) then
    raise exception 'Canonical trigger inventory drift' using errcode='55000'; end if;
  expected_definition := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex');
  select pg_catalog.count(*) into installed from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace
    and (c.relname like 'research\_health\_quick\_order\_authority\_%' escape '\'
      or c.relname like 'research\_health\_quick\_order\_currentness\_%' escape '\');
  if installed>0 or exists(select 1 from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace
    and (proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision',
      'research_health_quick_order_read_current_authority','research_health_quick_order_guard_source_write')
      or proname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))
    or exists(select 1 from pg_catalog.pg_type where typnamespace='public'::pg_catalog.regnamespace
      and (typname like 'research\_health\_quick\_order\_authority\_%' escape '\'
        or typname like 'research\_health\_quick\_order\_currentness\_%' escape '\')) then
    if pg_catalog.to_regclass('public.research_health_quick_order_authority_head') is null
      or pg_catalog.to_regclass('public.research_health_quick_order_authority_revisions') is null
      or pg_catalog.to_regprocedure('public.research_health_quick_order_currentness_integrity()') is null then
      raise exception 'Partial Quick Order currentness schema' using errcode='55000'; end if;
    execute fingerprint_sql into actual_fingerprint;
    seal := pg_catalog.obj_description('public.research_health_quick_order_authority_head'::pg_catalog.regclass,'pg_class');
    if seal is distinct from 'RHQOC_HELD_V1:'||expected_definition||':'||actual_fingerprint then
      raise exception 'Quick Order currentness definition or schema drift' using errcode='55000'; end if;
  else
    if exists(select 1 from pg_catalog.pg_trigger where not tgisinternal
      and pg_catalog.starts_with(tgname,'research_health_quick_order_guard_')) then
      raise exception 'Quick Order platform guards without currentness family' using errcode='55000'; end if;
    execute install_sql;
    for source_trigger in select t.oid,t.tgname,c.oid relation_oid,c.relname from (values
      ('research_domain_launch_controls','research_health_quick_order_guard_i'),
      ('research_domain_launch_controls','research_health_quick_order_guard_u'),
      ('research_domain_launch_controls','research_health_quick_order_guard_d'),
      ('research_domain_launch_controls','research_health_quick_order_guard_t'),
      ('research_early_access_legal_bindings','research_health_quick_order_guard_i'),
      ('research_early_access_legal_bindings','research_health_quick_order_guard_u'),
      ('research_early_access_legal_bindings','research_health_quick_order_guard_d'),
      ('research_early_access_legal_bindings','research_health_quick_order_guard_t'),
      ('research_early_access_session_bindings','research_health_quick_order_guard_u'),
      ('research_early_access_session_bindings','research_health_quick_order_guard_d'),
      ('research_early_access_session_bindings','research_health_quick_order_guard_t'),
      ('research_early_access_shipping_regions','research_health_quick_order_guard_i'),
      ('research_early_access_shipping_regions','research_health_quick_order_guard_u'),
      ('research_early_access_shipping_regions','research_health_quick_order_guard_d'),
      ('research_early_access_shipping_regions','research_health_quick_order_guard_t'),
      ('research_inventory_lots','research_health_quick_order_guard_i'),
      ('research_inventory_lots','research_health_quick_order_guard_u'),
      ('research_inventory_lots','research_health_quick_order_guard_d'),
      ('research_inventory_lots','research_health_quick_order_guard_t'),
      ('research_lot_quality_documents','research_health_quick_order_guard_i'),
      ('research_lot_quality_documents','research_health_quick_order_guard_u'),
      ('research_lot_quality_documents','research_health_quick_order_guard_d'),
      ('research_lot_quality_documents','research_health_quick_order_guard_t'),
      ('research_lot_quality_tests','research_health_quick_order_guard_i'),
      ('research_lot_quality_tests','research_health_quick_order_guard_u'),
      ('research_lot_quality_tests','research_health_quick_order_guard_d'),
      ('research_lot_quality_tests','research_health_quick_order_guard_t'),
      ('research_product_content','research_health_quick_order_guard_i'),
      ('research_product_content','research_health_quick_order_guard_u'),
      ('research_product_content','research_health_quick_order_guard_d'),
      ('research_product_content','research_health_quick_order_guard_t'),
      ('research_product_prices','research_health_quick_order_guard_i'),
      ('research_product_prices','research_health_quick_order_guard_u'),
      ('research_product_prices','research_health_quick_order_guard_d'),
      ('research_product_prices','research_health_quick_order_guard_t'),
      ('research_product_variants','research_health_quick_order_guard_i'),
      ('research_product_variants','research_health_quick_order_guard_u'),
      ('research_product_variants','research_health_quick_order_guard_d'),
      ('research_product_variants','research_health_quick_order_guard_t'),
      ('research_products','research_health_quick_order_guard_i'),
      ('research_products','research_health_quick_order_guard_u'),
      ('research_products','research_health_quick_order_guard_d'),
      ('research_products','research_health_quick_order_guard_t'),
      ('research_required_inputs','research_health_quick_order_guard_i'),
      ('research_required_inputs','research_health_quick_order_guard_u'),
      ('research_required_inputs','research_health_quick_order_guard_d'),
      ('research_required_inputs','research_health_quick_order_guard_t')) expected(relation_name,trigger_name)
      join pg_catalog.pg_class c on c.relnamespace='public'::pg_catalog.regnamespace and c.relname=expected.relation_name
      join pg_catalog.pg_trigger t on t.tgrelid=c.oid and t.tgname=expected.trigger_name
      where not t.tgisinternal loop
      execute pg_catalog.format('comment on trigger %I on public.%I is %L',source_trigger.tgname,source_trigger.relname,
        'RHQOC_SOURCE_COLUMNS_V1:'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attnum,a.attname,
    pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text)
    order by a.attnum)::pg_catalog.text from pg_catalog.pg_attribute a where a.attrelid=source_trigger.relation_oid and a.attnum>0),'[]'),'UTF8'),'sha256'),'hex'));
    end loop;
    execute pg_catalog.format('create function public.research_health_quick_order_currentness_schema_fingerprint() returns pg_catalog.text language sql stable security invoker set search_path=%L as %L','',fingerprint_sql);
    revoke all on function public.research_health_quick_order_currentness_schema_fingerprint() from public,anon,authenticated,service_role;
    execute fingerprint_sql into actual_fingerprint;
    execute pg_catalog.format('comment on table public.research_health_quick_order_authority_head is %L',
      'RHQOC_HELD_V1:'||expected_definition||':'||actual_fingerprint);
  end if;
  perform public.research_health_quick_order_currentness_integrity();
  if not exists(select 1 from public.research_health_quick_order_authority_head
      where singleton and state='held' and active_revision_id is null) then
    raise exception 'Quick Order must remain held' using errcode='55000'; end if;
  perform public.research_assisted_order_provider_settlement_integrity();
  if predecessor_fingerprint is distinct from public.research_assisted_order_provider_schema_fingerprint() then
    raise exception 'Canonical fence changed' using errcode='55000'; end if;
end
$currentness_candidate$;
commit;
