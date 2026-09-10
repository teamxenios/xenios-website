# Checkout execution recovery: what this is, and how to retire it

## What it is

One STABLE, service-role-only function and one partial index, over the table
`20260909150000_research_checkout_executions` creates. It reads. It creates no
table, writes no row, and grants nothing to a public role.

It exists because nothing could otherwise FIND a checkout execution that stopped
and was never returned to. Until it is installed, an order whose payment stalled
stays pending, its inventory holds stay held, and an authorization can stand at
the provider until the provider expires it.

## What it is NOT

It is not an amendment to `20260909150000`, and it must never be presented as
one. That candidate is frozen for its own rehearsal and the authorization
covering it excludes additional migrations, which includes this one. This needs
its own review and its own approval, after that candidate is installed and
postchecked.

It also grants no new power to the sweep. Every decision the sweep makes and
every write it causes go through the transition functions already reviewed in
`20260909150000`, so the money rules there apply unchanged and this cannot
introduce a new one.

## Order of operations

1. `20260909150000_research_checkout_executions` installed and postchecked.
2. This precheck (it STOPS if that prerequisite is absent, or if the function
   already exists under another definition).
3. Apply once, in one transaction, stop-on-error.
4. This postcheck: function present, STABLE, not SECURITY DEFINER, executable by
   `service_role` only, index present.

## Rehearsal that must pass before it is relied on

On the rehearsal database, with synthetic executions only:

- A row in each non-terminal phase, older than the window, is returned.
- A `committed` row is never returned.
- A `cancelled` row WITH `settled_at` is never returned; the same row with
  `settled_at` null IS returned, because that is the case where an order is
  still pending after the provider released.
- `p_limit` is honoured, clamped to at most 200 and at least 1, and a null limit
  falls back to the default rather than scanning.
- Results are ordered by (updated_at, id), a TOTAL order, so paging is
  deterministic even when several rows share a timestamp.
- The cursor pages forward: given the last row of one call, the next call
  returns only rows strictly after it, and a row whose head of queue is
  permanently escalated does not hide the rows behind it.
- Passing only one half of the cursor ignores it rather than returning nothing.
- `anon` and `authenticated` cannot execute it.
- The query uses the index rather than a sequential scan (check the plan on a
  table with enough rows for the planner to choose).

## Retiring it

Drop the function and the index. Nothing depends on them except the recovery
sweep, which is not mounted by default:

```sql
drop function if exists public.research_checkout_executions_list_recoverable(timestamptz, integer, timestamptz, uuid);
drop index if exists public.research_checkout_executions_recoverable_idx;
```

No data is lost by dropping either: this candidate stores nothing. Do not drop
the executions table itself, which is payment evidence.

## Failed or uncertain apply

Stop. Read migration history and `to_regprocedure` for the function before any
retry. A connector timeout is neither success nor failure.
