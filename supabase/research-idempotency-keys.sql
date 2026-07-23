-- ==========================================================================
-- MIGRATION (Track B commerce): research-idempotency-keys
-- ==========================================================================
-- Durable idempotency for commerce operations. The UNIQUE (scope, key)
-- constraint is what makes SupabaseIdempotencyStore concurrency-safe across
-- instances: exactly one reservation wins, everyone else replays the stored
-- result. Idempotency in application code alone is not idempotency under
-- concurrency.
--
-- Additive, idempotent, RLS-on. Server-only: reached exclusively through the
-- service_role admin client (which bypasses RLS); no policies, so no anon or
-- authenticated role can read or write it. DRAFT, NOT RUN. Do not apply during
-- Track A. Part of the Track B commerce migration set.
-- ==========================================================================

create table if not exists public.research_idempotency_keys (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,
  key         text not null,
  result      jsonb,
  created_at  timestamptz not null default now(),
  settled_at  timestamptz,
  constraint research_idempotency_keys_scope_key_unique unique (scope, key)
);

create index if not exists research_idempotency_keys_created_idx
  on public.research_idempotency_keys (created_at desc);

alter table public.research_idempotency_keys enable row level security;
