-- CANDIDATE ONLY. Audited operations on the existing partner authority.
-- No money, terms, referral qualification, Care grant or notification writes.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
  if to_regclass('public.research_partners') is null or to_regclass('public.research_members') is null
    or to_regclass('public.research_partner_agreements') is null or to_regclass('public.research_partner_training') is null
    or to_regclass('public.research_partner_lifecycle_events') is null then
    raise exception 'canonical partner schema required';
  end if;
end $$;
alter table public.research_partner_lifecycle_events add column if not exists operation_key text;
alter table public.research_partner_lifecycle_events add column if not exists operation_hash text;
alter table public.research_partner_lifecycle_events add column if not exists operation_result jsonb;
create unique index if not exists research_partner_operation_once on public.research_partner_lifecycle_events(actor_id,operation_key) where operation_key is not null;
alter table public.research_partner_agreements add column if not exists evidence_source text;
alter table public.research_partner_agreements add column if not exists evidence_reference text;
alter table public.research_partner_agreements add column if not exists reviewed_by_auth_user_id uuid references auth.users(id);
alter table public.research_partner_training add column if not exists evidence_source text;
alter table public.research_partner_training add column if not exists evidence_reference text;
alter table public.research_partner_training add column if not exists reviewed_by_auth_user_id uuid references auth.users(id);

create or replace function public.research_partner_lifecycle_authority()
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('schemaVersion','partner_lifecycle_20260905','requirements',jsonb_build_object(
    'agreements',(select jsonb_agg(jsonb_build_object('key',key,'version','1.0.0') order by ord)
      from unnest(array['partner_agreement','code_of_conduct','advertising_and_claims','privacy_and_data_handling']) with ordinality r(key,ord)),
    'trainingModules',(select jsonb_agg(jsonb_build_object('key',key,'version','1.0.0') order by ord)
      from unnest(array['xenios_membership','privacy_and_sensitive_data','product_lanes','ftc_disclosures','claims_restrictions',
        'no_diagnosis_or_dosing','lead_handling','telegram_boundaries','product_concerns','fraud','brand_and_content','organizations','events','security']) with ordinality r(key,ord))));
$$;

create or replace function public.research_admin_partner_operation(p_actor_auth_user_id uuid,p_operation jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  p public.research_partners%rowtype; m public.research_members%rowtype;
  prior public.research_partner_lifecycle_events%rowtype;
  old_agreement public.research_partner_agreements%rowtype; old_training public.research_partner_training%rowtype;
  v_action text:=p_operation->>'action'; v_key text:=p_operation->>'idempotencyKey'; v_reason text:=btrim(p_operation->>'reason');
  v_id uuid; v_member_id uuid; v_found boolean; v_before text; v_now timestamptz:=clock_timestamp();
  v_expected timestamptz; v_hash text; v_result jsonb; v_allowed text[]; v_required jsonb;
  v_missing jsonb:='[]'::jsonb; v_next text; v_when timestamptz; v_ref text:=p_operation->>'evidenceReference';
begin
  -- Only the trusted service role can execute. HTTP authorization is the
  -- existing admin guard; actor must also be a confirmed canonical Auth UUID.
  if jsonb_typeof(p_operation) is distinct from 'object' or p_actor_auth_user_id is null
    or not exists(select 1 from auth.users where id=p_actor_auth_user_id and email_confirmed_at is not null)
    or coalesce(v_key,'') !~ '^[A-Za-z0-9_-]{16,128}$' or coalesce(length(v_reason),0) not between 8 and 1000 then
    return jsonb_build_object('ok',false,'code','invalid_input');
  end if;
  v_allowed:=array['action','idempotencyKey','reason'];
  if v_action='prepare' then
    v_allowed:=v_allowed||array['memberId','role','legalName'];
  elsif v_action in ('record_clearance','record_agreement','record_training','certify','activate','suspend','terminate','reinstate') then
    v_allowed:=v_allowed||array['partnerId','expectedUpdatedAt'];
    if v_action in ('record_clearance','record_agreement','record_training') then
      v_allowed:=v_allowed||array['evidenceReference','reviewedEvidence'];
      if p_operation->'reviewedEvidence' is distinct from 'true'::jsonb or coalesce(v_ref,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$' then
        return jsonb_build_object('ok',false,'code','invalid_input');
      end if;
    end if;
    if v_action='record_clearance' then v_allowed:=v_allowed||array['kind','decision']; end if;
    if v_action='record_agreement' then v_allowed:=v_allowed||array['agreementKey','version','contentHash','acceptedAt']; end if;
    if v_action='record_training' then v_allowed:=v_allowed||array['moduleKey','version','completedAt']; end if;
  else return jsonb_build_object('ok',false,'code','invalid_input'); end if;
  if exists(select 1 from jsonb_object_keys(p_operation) k where not k=any(v_allowed))
    or exists(select 1 from unnest(v_allowed) k where not p_operation?k or p_operation->k='null'::jsonb)
    or exists(select 1 from jsonb_each(p_operation) e where e.key<>'reviewedEvidence' and jsonb_typeof(e.value)<>'string') then
    return jsonb_build_object('ok',false,'code','invalid_input');
  end if;
  v_hash:=encode(sha256(convert_to(p_operation::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('partner-operation:'||p_actor_auth_user_id::text||':'||v_key,0));
  select * into prior from public.research_partner_lifecycle_events where actor_id=p_actor_auth_user_id::text and operation_key=v_key;
  if found then
    if prior.operation_hash is distinct from v_hash then return jsonb_build_object('ok',false,'code','idempotency_conflict'); end if;
    return prior.operation_result||jsonb_build_object('replayed',true);
  end if;
  if v_action='prepare' then
    v_member_id:=(p_operation->>'memberId')::uuid;
    if coalesce(length(btrim(p_operation->>'legalName')),0) not between 2 and 160
      or p_operation->>'role' not in ('member_referral','affiliate','research_rep','senior_research_rep','organization_partner',
        'private_community_partner','professional_partner','future_wholesale','future_institutional') then
      return jsonb_build_object('ok',false,'code','invalid_input');
    end if;
  else
    v_id:=(p_operation->>'partnerId')::uuid; v_expected:=(p_operation->>'expectedUpdatedAt')::timestamptz;
    if v_id is null or v_expected is null then return jsonb_build_object('ok',false,'code','invalid_input'); end if;
    select member_id into v_member_id from public.research_partners where id=v_id;
    if not found then return jsonb_build_object('ok',false,'code','partner_not_found'); end if;
  end if;
  if v_member_id is null then return jsonb_build_object('ok',false,'code','invalid_input'); end if;
  perform pg_advisory_xact_lock(hashtextextended('partner-member:'||v_member_id::text,0));
  select * into m from public.research_members where id=v_member_id for update;
  if not found then return jsonb_build_object('ok',false,'code','identity_review_required'); end if;
  if v_action not in ('suspend','terminate') and (m.status<>'active' or m.auth_user_id is null
    or not exists(select 1 from auth.users u where u.id=m.auth_user_id and u.email_confirmed_at is not null and lower(btrim(u.email))=lower(btrim(m.email)))
    or (select count(*) from auth.users u where lower(btrim(u.email))=lower(btrim(m.email)))<>1) then
    return jsonb_build_object('ok',false,'code','identity_review_required');
  end if;
  select * into p from public.research_partners where member_id=v_member_id for update;
  v_found:=found;
  if v_action='prepare' then
    if v_found then return jsonb_build_object('ok',false,'code','partner_already_exists'); end if;
    insert into public.research_partners(member_id,role,state,legal_name,contact_email,applied_at,updated_at)
      values(m.id,p_operation->>'role','application',btrim(p_operation->>'legalName'),lower(btrim(m.email)),v_now,v_now) returning * into p;
    v_before:='not_created';
  else
    if not v_found or p.id is distinct from v_id then return jsonb_build_object('ok',false,'code','partner_not_found'); end if;
    if p.updated_at is distinct from v_expected then return jsonb_build_object('ok',false,'code','stale_inspection'); end if;
    if p.state='terminated' then return jsonb_build_object('ok',false,'code','invalid_state'); end if;
    v_before:=p.state;
    if v_action='record_clearance' then
      if p_operation->>'kind' not in ('identity','tax','payout') or p_operation->>'decision' not in ('verified','rejected') then
        return jsonb_build_object('ok',false,'code','invalid_input');
      end if;
      if p_operation->>'kind'='identity' then p.identity_verified:=(p_operation->>'decision'='verified');
      elsif p_operation->>'kind'='tax' then p.tax_status:=p_operation->>'decision';
      else p.payout_status:=p_operation->>'decision'; end if;
      if p_operation->>'decision'='rejected' then
        p.certified_at:=null; p.certified_by_admin_id:=null;
        if p.state='active' then p.state:='quality_review'; end if;
      end if;
    elsif v_action='record_agreement' then
      v_when:=(p_operation->>'acceptedAt')::timestamptz;
      if v_when is null or v_when>v_now or coalesce(p_operation->>'contentHash','') !~ '^[a-f0-9]{64}$'
        or not exists(select 1 from jsonb_array_elements(public.research_partner_lifecycle_authority()->'requirements'->'agreements') r
          where r->>'key'=p_operation->>'agreementKey' and r->>'version'=p_operation->>'version') then
        return jsonb_build_object('ok',false,'code','invalid_input');
      end if;
      select * into old_agreement from public.research_partner_agreements where partner_id=p.id
        and agreement_key=p_operation->>'agreementKey' and agreement_version=p_operation->>'version';
      if found then return jsonb_build_object('ok',false,'code','evidence_conflict'); end if;
      insert into public.research_partner_agreements(partner_id,agreement_key,agreement_version,content_hash,decision,decided_at,evidence_source,evidence_reference,reviewed_by_auth_user_id)
        values(p.id,p_operation->>'agreementKey',p_operation->>'version',p_operation->>'contentHash','accepted',v_when,'admin_reviewed_external',v_ref,p_actor_auth_user_id);
    elsif v_action='record_training' then
      v_when:=(p_operation->>'completedAt')::timestamptz;
      if v_when is null or v_when>v_now or not exists(select 1 from jsonb_array_elements(public.research_partner_lifecycle_authority()->'requirements'->'trainingModules') r
        where r->>'key'=p_operation->>'moduleKey' and r->>'version'=p_operation->>'version') then
        return jsonb_build_object('ok',false,'code','invalid_input');
      end if;
      select * into old_training from public.research_partner_training where partner_id=p.id
        and module_key=p_operation->>'moduleKey' and module_version=p_operation->>'version';
      if found then return jsonb_build_object('ok',false,'code','evidence_conflict'); end if;
      insert into public.research_partner_training(partner_id,module_key,module_version,completed_at,evidence_source,evidence_reference,reviewed_by_auth_user_id)
        values(p.id,p_operation->>'moduleKey',p_operation->>'version',v_when,'admin_reviewed_external',v_ref,p_actor_auth_user_id);
    end if;

    -- These are the same versioned requirements the canonical partner service
    -- owns. The HTTP service refuses a DB marker whose requirements differ.
    if not p.identity_verified then v_missing:=v_missing||jsonb_build_array('identity_verification'); end if;
    if p.tax_status<>'verified' then v_missing:=v_missing||jsonb_build_array('tax_clearance'); end if;
    if p.payout_status<>'verified' then v_missing:=v_missing||jsonb_build_array('payout_readiness'); end if;
    for v_required in select value from jsonb_array_elements(public.research_partner_lifecycle_authority()->'requirements'->'agreements') loop
      if not exists(select 1 from public.research_partner_agreements a where a.partner_id=p.id and a.agreement_key=v_required->>'key'
        and a.agreement_version=v_required->>'version' and a.decision='accepted' and length(btrim(a.content_hash))>0 and a.decided_at<=v_now) then
        v_missing:=v_missing||jsonb_build_array('agreement:'||(v_required->>'key')||':'||(v_required->>'version'));
      end if;
    end loop;
    for v_required in select value from jsonb_array_elements(public.research_partner_lifecycle_authority()->'requirements'->'trainingModules') loop
      if not exists(select 1 from public.research_partner_training t where t.partner_id=p.id and t.module_key=v_required->>'key'
        and t.module_version=v_required->>'version' and t.completed_at<=v_now) then
        v_missing:=v_missing||jsonb_build_array('training:'||(v_required->>'key')||':'||(v_required->>'version'));
      end if;
    end loop;
    if v_action in ('certify','activate','reinstate') then
      if v_action in ('activate','reinstate') and (p.certified_at is null or p.certified_at>v_now or p.certified_by_admin_id is null) then
        v_missing:=v_missing||jsonb_build_array('admin_certification');
      end if;
      if jsonb_array_length(v_missing)>0 then return jsonb_build_object('ok',false,'code','requirements_missing','missingRequirements',v_missing); end if;
    end if;
    if v_action='certify' then
      if p.state='active' then return jsonb_build_object('ok',false,'code','invalid_state'); end if;
      p.certified_at:=v_now; p.certified_by_admin_id:=p_actor_auth_user_id::text;
    elsif v_action='activate' then
      if p.state in ('active','suspended','quality_review') then return jsonb_build_object('ok',false,'code','invalid_state'); end if;
      p.state:='active'; p.activated_at:=v_now; p.activated_by_admin_id:=p_actor_auth_user_id::text;
    elsif v_action='reinstate' then
      if p.state not in ('suspended','quality_review') then return jsonb_build_object('ok',false,'code','invalid_state'); end if;
      p.state:='active'; p.activated_at:=v_now; p.activated_by_admin_id:=p_actor_auth_user_id::text;
    elsif v_action='suspend' then
      if p.state='suspended' then return jsonb_build_object('ok',false,'code','invalid_state'); end if;
      p.state:='suspended';
    elsif v_action='terminate' then
      p.state:='terminated'; p.certified_at:=null; p.certified_by_admin_id:=null;
    end if;
    if p.state not in ('active','suspended','quality_review','terminated') then
      v_next:=v_missing->>0;
      p.state:=case when v_next='identity_verification' then 'identity_verification_pending'
        when v_next='tax_clearance' then 'tax_status_pending' when v_next='payout_readiness' then 'payout_status_pending'
        when v_next like 'agreement:%' then 'agreement_pending' when v_next like 'training:%' then 'training_pending' else 'certification_pending' end;
    end if;
    update public.research_partners set state=p.state,identity_verified=p.identity_verified,tax_status=p.tax_status,payout_status=p.payout_status,
      certified_at=p.certified_at,certified_by_admin_id=p.certified_by_admin_id,activated_at=p.activated_at,
      activated_by_admin_id=p.activated_by_admin_id,updated_at=v_now where id=p.id returning * into p;
  end if;
  v_result:=jsonb_build_object('ok',true,'partnerId',p.id,'memberId',p.member_id,'action',v_action,'state',p.state,'updatedAt',p.updated_at,'replayed',false);
  insert into public.research_partner_lifecycle_events(partner_id,from_state,to_state,detail,actor_id,occurred_at,operation_key,operation_hash,operation_result)
    values(p.id,v_before,p.state,jsonb_build_object('action',v_action,'reason',v_reason,'evidenceReference',v_ref,
      'evidenceKey',coalesce(p_operation->>'agreementKey',p_operation->>'moduleKey',p_operation->>'kind'),
      'evidenceVersion',p_operation->>'version','decision',p_operation->>'decision')::text,
      p_actor_auth_user_id::text,v_now,v_key,v_hash,v_result);
  return v_result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('ok',false,'code','invalid_input');
end;
$$;
revoke all on function public.research_partner_lifecycle_authority() from public,anon,authenticated;
revoke all on function public.research_admin_partner_operation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.research_partner_lifecycle_authority() to service_role;
grant execute on function public.research_admin_partner_operation(uuid,jsonb) to service_role;
commit;
