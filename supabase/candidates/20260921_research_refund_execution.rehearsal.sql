-- Synthetic, transactional rehearsal. Run only after candidate + postcheck on
-- an authorized disposable database. It always rolls back.
begin;
set local row_security = off;
set local statement_timeout = '60s';
create function pg_temp.expect(p_ok boolean, p_case text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'REFUND REHEARSAL FAIL: %', p_case; end if; end $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
do $rehearsal$
declare
  v_member uuid := '00000000-0000-4000-8000-0000000000f1';
  v_order uuid := '00000000-0000-4000-8000-00000000f101';
  v_claim uuid := '00000000-0000-4000-8000-00000000f201';
  v_exec uuid := '00000000-0000-4000-8000-00000000f301';
  v_row public.research_refund_executions%rowtype;
  v_count bigint; v_err text;
begin
  insert into public.research_orders
    (id,member_id,state,subtotal_cents,shipping_cents,store_credit_applied_cents,total_cents,
     authorized_amount_cents,captured_amount_cents,refunded_cents,payment_reference,created_at,updated_at)
  values (v_order,v_member,'delivered',5000,0,0,5000,5000,5000,0,'pi_refund_rehearsal',now(),now());
  insert into public.research_claims
    (id,order_id,member_id,sku,reason,state,evidence_refs,submitted_at,updated_at)
  values (v_claim,v_order,v_member,'REH-REFUND','damaged','approved','{}',now(),now());

  select * into v_row from public.research_refund_execution_prepare(
    v_exec,'xr-refund-rehearsal-scope',v_claim,v_order,'admin-rehearsal','pi_refund_rehearsal',5000,'usd',now());
  perform pg_temp.expect(v_row.state='prepared' and v_row.version=1,'prepared intent');
  select * into v_row from public.research_refund_execution_prepare(
    '00000000-0000-4000-8000-00000000f399','xr-refund-rehearsal-scope',v_claim,v_order,'admin-rehearsal','pi_refund_rehearsal',5000,'usd',now());
  perform pg_temp.expect(v_row.id=v_exec and v_row.version=1,'exact prepare replay returns original intent');
  v_err := pg_temp.error_of(format($q$select * from public.research_refund_execution_prepare(
    '00000000-0000-4000-8000-00000000f398','xr-refund-rehearsal-scope',%L,%L,'admin-rehearsal','pi_refund_rehearsal',4999,'usd',now())$q$,v_claim,v_order));
  perform pg_temp.expect(v_err like '%refund_execution_conflict%','conflicting prepare replay refused');
  select * into v_row from public.research_refund_execution_claim(v_exec,1,now());
  perform pg_temp.expect(v_row.state='calling_provider' and v_row.first_attempted_at is not null,'first attempt persisted');
  insert into public.research_payment_webhook_inbox
    (provider_name,event_id,event_type,payload_sha256,state,refund_execution_id)
  values ('stripe','evt_refund_rehearsal','payment.refunded',repeat('a',64),'processing',v_exec);
  perform pg_temp.expect((select refund_execution_id=v_exec from public.research_payment_webhook_inbox where provider_name='stripe' and event_id='evt_refund_rehearsal'),'refund webhook bound to execution');
  select count(*) into v_count from public.research_refund_execution_claim(v_exec,1,now());
  perform pg_temp.expect(v_count=0,'stale concurrent claim loses compare-and-swap');
  v_err := pg_temp.error_of(format('update public.research_claims set state=''declined'' where id=%L',v_claim));
  perform pg_temp.expect(v_err like '%claim_locked%','claim edit blocked while provider effect active');
  v_err := pg_temp.error_of(format('update public.research_orders set state=''exception'' where id=%L',v_order));
  perform pg_temp.expect(v_err like '%order_locked%','order edit blocked while provider effect active');
  select * into v_row from public.research_refund_execution_record_provider(
    v_exec,2,'re_refund_rehearsal','pi_refund_rehearsal',5000,'usd');
  perform pg_temp.expect(v_row.state='provider_succeeded' and v_row.version=3,'provider evidence recorded');
  select * into v_row from public.research_refund_execution_commit(v_exec,3);
  perform pg_temp.expect(v_row.state='committed' and v_row.version=4,'atomic commit');
  perform pg_temp.expect((select state='refunded' and refunded_cents=5000 and last_idempotency_key='xr-refund-rehearsal-scope' from public.research_orders where id=v_order),'order committed');
  perform pg_temp.expect((select state='resolved' and resolution='refund' and reviewed_by='admin-rehearsal' from public.research_claims where id=v_claim),'claim committed');
  select count(*) into v_count from public.research_refund_keys where scope='xr-refund-rehearsal-scope' and refund_reference='re_refund_rehearsal';
  perform pg_temp.expect(v_count=1,'refund ledger committed once');
  select count(*) into v_count from public.research_order_state_events where order_id=v_order and to_state='refunded' and provider_reference='re_refund_rehearsal';
  perform pg_temp.expect(v_count=1,'order event committed once');
  raise notice 'refund execution rehearsal PASS';
end $rehearsal$;

-- Direct service-role mutation is denied; the role can read and execute the
-- guarded RPCs only. Catching the expected privilege error keeps the rehearsal
-- transaction alive.
set local role service_role;
do $$
begin
  begin
    insert into public.research_refund_executions
      (id,scope,claim_id,order_id,admin_id,payment_reference,amount_cents,currency,state,created_at,updated_at)
    values
      ('00000000-0000-4000-8000-00000000ffff','forbidden-direct-write','00000000-0000-4000-8000-00000000f201',
       '00000000-0000-4000-8000-00000000f101','x','pi_forbidden',1,'usd','prepared',now(),now());
    raise exception 'REFUND REHEARSAL FAIL: service role direct insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
