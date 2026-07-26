-- Research assessment v2 and monthly check-in concurrency support.
-- Additive and idempotent: no response rows are rewritten or deleted.

begin;

alter table if exists public.research_assessment_responses
  add column if not exists revision integer not null default 0;

alter table if exists public.research_assessment_responses
  add column if not exists cycle_key text not null default 'initial';

-- A legacy monthly row, if one exists, must remain the row for the month in
-- which it was actually created. Without this deterministic backfill the
-- runtime would not find it and could create a duplicate logical check-in.
update public.research_assessment_responses
   set cycle_key = to_char(
     coalesce(submitted_at, last_saved_at, started_at, created_at) at time zone 'UTC',
     'YYYY-MM'
   )
 where mode = 'monthly_check_in'
   and cycle_key = 'initial';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.research_assessment_responses'::regclass
       and conname = 'research_assessment_responses_revision_nonnegative'
  ) then
    alter table public.research_assessment_responses
      add constraint research_assessment_responses_revision_nonnegative
      check (revision >= 0);
  end if;
end
$$;

create index if not exists research_assessment_responses_member_mode_status_idx
  on public.research_assessment_responses (member_id, mode, status, submitted_at desc);

-- The original uniqueness rule allowed only one monthly response forever.
-- Adding a server-owned UTC month key makes check-ins repeatable while
-- preserving one immutable response per member and cycle.
alter table if exists public.research_assessment_responses
  drop constraint if exists research_assessment_responses_member_id_definition_id_mode_key;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.research_assessment_responses'::regclass
       and conname = 'research_assessment_responses_member_definition_mode_cycle_key'
  ) then
    alter table public.research_assessment_responses
      add constraint research_assessment_responses_member_definition_mode_cycle_key
      unique (member_id, definition_id, mode, cycle_key);
  end if;
end
$$;

alter table public.research_assessment_responses enable row level security;
alter table public.research_assessment_responses force row level security;

revoke all on table public.research_assessment_responses from anon, authenticated;
grant all on table public.research_assessment_responses to service_role;

alter table if exists public.research_blueprints
  add column if not exists assigned_reviewer_email text;

alter table if exists public.research_xenios30_plans
  add column if not exists source_blueprint_id uuid;

do $$
begin
  if exists (
    select 1
      from public.research_blueprints
     where assessment_response_id is not null
     group by assessment_response_id
    having count(*) > 1
  ) then
    raise exception 'cannot enforce one blueprint per assessment response: duplicate rows exist';
  end if;
end
$$;

create unique index if not exists research_blueprints_assessment_response_idx
  on public.research_blueprints (assessment_response_id)
  where assessment_response_id is not null;

drop index if exists public.research_xenios30_plans_source_blueprint_idx;
drop index if exists public.research_xenios30_plans_source_blueprint_month_idx;

do $$
begin
  if exists (
    select 1
      from public.research_blueprints
     where state = 'published'
     group by member_id
    having count(*) > 1
  ) then
    raise exception 'cannot enforce one current published blueprint: duplicate published member rows exist';
  end if;
  if exists (
    select 1
      from public.research_xenios30_plans
     where state in ('draft', 'samuel_review')
     group by member_id, month_label
    having count(*) > 1
  ) then
    raise exception 'cannot enforce one active monthly plan draft: duplicate active rows exist';
  end if;
end
$$;

create unique index if not exists research_blueprints_one_published_per_member_idx
  on public.research_blueprints (member_id)
  where state = 'published';

create unique index if not exists research_xenios30_one_active_draft_per_month_idx
  on public.research_xenios30_plans (member_id, month_label)
  where state in ('draft', 'samuel_review');

-- Publish and supersede are one database transaction. The per-member
-- advisory lock serializes concurrent reviewers; the partial unique index is
-- the final invariant. No notification is sent until this RPC commits.
create or replace function public.publish_research_blueprint(
  p_blueprint_id uuid,
  p_published_at timestamptz,
  p_reviewed_by text,
  p_review_comment text default null
)
returns setof public.research_blueprints
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.research_blueprints%rowtype;
begin
  select *
    into v_target
    from public.research_blueprints
   where id = p_blueprint_id
   for update;

  if not found or v_target.state <> 'samuel_review' then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_target.member_id::text, 0));
  perform 1
    from public.research_blueprints
   where member_id = v_target.member_id
   order by id
   for update;

  update public.research_blueprints
     set state = 'updated',
         superseded_by_version = v_target.version,
         updated_at = p_published_at
   where member_id = v_target.member_id
     and id <> v_target.id
     and state = 'published';

  update public.research_blueprints
     set superseded_by_version = v_target.version,
         updated_at = p_published_at
   where member_id = v_target.member_id
     and id <> v_target.id
     and state = 'updated'
     and superseded_by_version is null;

  update public.research_blueprints
     set state = 'published',
         published_at = p_published_at,
         reviewed_by = p_reviewed_by,
         review_comment = coalesce(p_review_comment, review_comment),
         superseded_by_version = null,
         updated_at = p_published_at
   where id = v_target.id
     and state = 'samuel_review'
  returning * into v_target;

  if not found then
    return;
  end if;

  update public.research_xenios30_plans
     set state = 'archived',
         updated_at = p_published_at
   where member_id = v_target.member_id
     and month_label = to_char(p_published_at at time zone 'UTC', 'YYYY-MM')
     and state in ('draft', 'samuel_review')
     and source_blueprint_id is distinct from v_target.id;

  update public.research_xenios30_plans
     set state = 'samuel_review',
         content = jsonb_build_object(
           'sourceBlueprintId', v_target.id,
           'fitnessDraft', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "fitness_program")'),
           'nutritionDraft', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "nutrition_program")'),
           'blueprintActions', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "lifestyle")'),
           'supplementFoundation', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "supplement_foundation")'),
           'productGuidance', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "product_option")'),
           'adherenceTargets', '[]'::jsonb,
           'trackerMetricKeys', '[]'::jsonb,
           'fitnessDocumentId', null,
           'nutritionDocumentId', null,
           'checkInDueAt', null
         ),
         reviewed_by = null,
         published_at = null,
         member_acknowledged_at = null,
         updated_at = p_published_at
   where source_blueprint_id = v_target.id
     and month_label = to_char(p_published_at at time zone 'UTC', 'YYYY-MM')
     and state in ('draft', 'samuel_review', 'archived');

  insert into public.research_xenios30_plans (
    member_id,
    month_label,
    version,
    state,
    content,
    reviewed_by,
    published_at,
    member_acknowledged_at,
    source_blueprint_id,
    created_at,
    updated_at
  )
  select
    v_target.member_id,
    to_char(p_published_at at time zone 'UTC', 'YYYY-MM'),
    coalesce((
      select max(plan.version) + 1
        from public.research_xenios30_plans plan
       where plan.member_id = v_target.member_id
         and plan.month_label = to_char(p_published_at at time zone 'UTC', 'YYYY-MM')
    ), 1),
    'samuel_review',
    jsonb_build_object(
      'sourceBlueprintId', v_target.id,
      'fitnessDraft', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "fitness_program")'),
      'nutritionDraft', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "nutrition_program")'),
      'blueprintActions', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "lifestyle")'),
      'supplementFoundation', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "supplement_foundation")'),
      'productGuidance', jsonb_path_query_array(v_target.content, '$.recommendations[*] ? (@.kind == "product_option")'),
      'adherenceTargets', '[]'::jsonb,
      'trackerMetricKeys', '[]'::jsonb,
      'fitnessDocumentId', null,
      'nutritionDocumentId', null,
      'checkInDueAt', null
    ),
    null,
    null,
    null,
    v_target.id,
    p_published_at,
    p_published_at
  where not exists (
    select 1
     from public.research_xenios30_plans
     where source_blueprint_id = v_target.id
       and month_label = to_char(p_published_at at time zone 'UTC', 'YYYY-MM')
       and state in ('draft', 'samuel_review', 'archived')
  );

  return next v_target;
  return;
end;
$$;

create table if not exists public.research_plan_review_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  blueprint_id uuid not null,
  member_id uuid not null,
  actor_email text not null,
  action text not null check (action in (
    'plan_brief_viewed',
    'approve_and_publish_attempted',
    'request_information_attempted',
    'revise_attempted'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists research_plan_review_audit_member_created_idx
  on public.research_plan_review_audit_events (member_id, created_at desc);

create or replace function public.research_plan_review_audit_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'research plan review audit events are append-only';
end;
$$;

drop trigger if exists research_plan_review_audit_no_mutation
  on public.research_plan_review_audit_events;
create trigger research_plan_review_audit_no_mutation
  before update or delete on public.research_plan_review_audit_events
  for each row execute function public.research_plan_review_audit_immutable();

alter table public.research_blueprints enable row level security;
alter table public.research_plan_review_audit_events enable row level security;
alter table public.research_blueprints force row level security;
alter table public.research_plan_review_audit_events force row level security;
revoke all on table public.research_blueprints from anon, authenticated;
revoke all on table public.research_plan_review_audit_events from anon, authenticated;
grant all on table public.research_blueprints to service_role;
revoke all on function public.publish_research_blueprint(uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.publish_research_blueprint(uuid, timestamptz, text, text) to service_role;
revoke all on table public.research_plan_review_audit_events from service_role;
grant select, insert on table public.research_plan_review_audit_events to service_role;
revoke update, delete, truncate on table public.research_plan_review_audit_events from service_role;

commit;
