\set ON_ERROR_STOP on

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if p_condition is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end
$function$;

select ledger_revision as live_revision
from public.research_product_variant_activation_revisions
where sku = 'XR-ATOMIC-1' and product_state = 'live'
order by ledger_revision desc limit 1 \gset
select ledger_revision as held_revision
from public.research_product_variant_activation_revisions
where sku = 'XR-ATOMIC-1' and product_state = 'held'
order by ledger_revision desc limit 1 \gset

update public.research_product_variant_activation_heads
set ledger_revision = :live_revision where sku = 'XR-ATOMIC-1';

-- Independent connections use the disposable password only. Network remains
-- disabled at the container boundary; dblink reaches the same local server.
select extensions.dblink_connect(
  'cart_a',
  'host=127.0.0.1 dbname=postgres user=postgres password=disposable-only-activation-authority'
);
select extensions.dblink_connect(
  'cart_b',
  'host=127.0.0.1 dbname=postgres user=postgres password=disposable-only-activation-authority'
);

-- Two adds against the same member race. The member advisory lock and line CAS
-- must produce quantity 2 with no lost update.
select extensions.dblink_send_query('cart_a', $remote$
  select public.research_cart_mutate_with_activation_v1(
    '50000000-0000-4000-8000-000000000004', 'add', 'XR-ATOMIC-1', 1,
    'one_time', null, clock_timestamp(), 10
  )
$remote$);
select extensions.dblink_send_query('cart_b', $remote$
  select public.research_cart_mutate_with_activation_v1(
    '50000000-0000-4000-8000-000000000004', 'add', 'XR-ATOMIC-1', 1,
    'one_time', null, clock_timestamp(), 10
  )
$remote$);
select result as race_add_a from extensions.dblink_get_result('cart_a') as t(result jsonb);
select result as race_add_b from extensions.dblink_get_result('cart_b') as t(result jsonb);
select pg_temp.assert_true(
  (select l.quantity = 2
   from public.research_cart_lines l
   join public.research_carts c on c.id = l.cart_id
   where c.member_id = '50000000-0000-4000-8000-000000000004'
     and l.sku = 'XR-ATOMIC-1'),
  'concurrent adds lost an update'
);

-- Force the cart command to hold its authority SHARE lock while waiting on its
-- SKU advisory lock. A concurrent head change then waits until the cart command
-- commits; it cannot interleave after validation and before mutation.
select extensions.dblink_connect(
  'blocker',
  'host=127.0.0.1 dbname=postgres user=postgres password=disposable-only-activation-authority'
);
select extensions.dblink_connect(
  'cart_command',
  'host=127.0.0.1 dbname=postgres user=postgres password=disposable-only-activation-authority'
);
select extensions.dblink_connect(
  'head_writer',
  'host=127.0.0.1 dbname=postgres user=postgres password=disposable-only-activation-authority'
);
select extensions.dblink_exec('blocker', 'begin');
select extensions.dblink_exec('blocker', $remote$
  do $do$ begin
    perform pg_advisory_xact_lock(hashtextextended(
      'xenios:research-activation-cart:v1|sku|XR-ATOMIC-1', 0));
  end $do$
$remote$);
select extensions.dblink_send_query('cart_command', $remote$
  select public.research_cart_mutate_with_activation_v1(
    '50000000-0000-4000-8000-000000000005', 'add', 'XR-ATOMIC-1', 1,
    'one_time', null, clock_timestamp(), 10
  )
$remote$);
select pg_sleep(0.25);
select extensions.dblink_send_query('head_writer', format(
  'update public.research_product_variant_activation_heads set ledger_revision=%s where sku=%L',
  :'held_revision', 'XR-ATOMIC-1'
));
select pg_sleep(0.25);
select pg_temp.assert_true(
  extensions.dblink_is_busy('cart_command') = 1,
  'cart command was not waiting on the controlled SKU lock'
);
select pg_temp.assert_true(
  extensions.dblink_is_busy('head_writer') = 1,
  'authority writer did not wait behind the command authority snapshot'
);
select extensions.dblink_exec('blocker', 'commit');
select result as serialized_cart_result
from extensions.dblink_get_result('cart_command') as t(result jsonb);
select status as serialized_writer_result
from extensions.dblink_get_result('head_writer') as t(status text);
select count(*) as serialized_cart_drain
from extensions.dblink_get_result('cart_command') as t(result jsonb);
select count(*) as serialized_writer_drain
from extensions.dblink_get_result('head_writer') as t(status text);
select pg_temp.assert_true(
  (select l.quantity = 1
   from public.research_cart_lines l
   join public.research_carts c on c.id = l.cart_id
   where c.member_id = '50000000-0000-4000-8000-000000000005'),
  'authority writer interleaved before cart commit'
);
select pg_temp.assert_true(
  (select ledger_revision = :'held_revision'::bigint
   from public.research_product_variant_activation_heads
   where sku = 'XR-ATOMIC-1'),
  'serialized authority writer did not commit after cart command'
);

-- If the authority writer wins first, the blocked cart command observes held
-- evidence and refuses without creating a cart or line.
select extensions.dblink_exec('head_writer', 'begin');
select extensions.dblink_exec('head_writer', format(
  'update public.research_product_variant_activation_heads set ledger_revision=%s where sku=%L',
  :'live_revision', 'XR-ATOMIC-1'
));
select extensions.dblink_send_query('cart_command', $remote$
  select public.research_cart_mutate_with_activation_v1(
    '50000000-0000-4000-8000-000000000006', 'add', 'XR-ATOMIC-1', 1,
    'one_time', null, clock_timestamp(), 10
  )
$remote$);
select pg_sleep(0.25);
select pg_temp.assert_true(
  extensions.dblink_is_busy('cart_command') = 1,
  'cart command did not wait for the winning authority writer'
);
select extensions.dblink_exec('head_writer', format(
  'update public.research_product_variant_activation_heads set ledger_revision=%s where sku=%L',
  :'held_revision', 'XR-ATOMIC-1'
));
select extensions.dblink_exec('head_writer', 'commit');
select result as writer_wins_result
from extensions.dblink_get_result('cart_command') as t(result jsonb) \gset
select count(*) as writer_wins_drain
from extensions.dblink_get_result('cart_command') as t(result jsonb);
select pg_temp.assert_true(
  :'writer_wins_result'::jsonb = '{"ok":false,"code":"activation_not_live"}'::jsonb,
  'cart command did not observe the authority writer that committed first'
);
select pg_temp.assert_true(
  not exists (select 1 from public.research_carts
    where member_id = '50000000-0000-4000-8000-000000000006'),
  'writer-wins denial created a cart'
);

select extensions.dblink_disconnect('cart_a');
select extensions.dblink_disconnect('cart_b');
select extensions.dblink_disconnect('blocker');
select extensions.dblink_disconnect('cart_command');
select extensions.dblink_disconnect('head_writer');

\echo 'PASS activation authority concurrency battery'
