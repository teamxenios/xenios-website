-- xenios research: NATIVE (embedded) e-signature modes migration.
-- ADDITIVE and backward-compatible. Run once in the Supabase SQL Editor AFTER
-- the founding-membership bundle (which created research_fm_esign_*). Safe to
-- re-run. RLS is unchanged (already enabled, server-only). No destructive DDL:
-- this only WIDENS the allowed set of `mode` values so the native modes
-- (esign_document, esign_packet) are storable alongside the existing
-- opensign_* modes, which remain fully readable and writable.
--
-- The `provider` column already accepts any text, so the native provider value
-- 'xenios_native' needs no schema change. Existing rows are untouched.
--
-- If the founding-membership bundle on this database already includes the
-- native modes (a fresh install from the current base file), this migration is
-- a no-op re-statement of the same constraint.

-- Signing requests: widen the mode check. The inline check Postgres created on
-- the mode column is auto-named <table>_mode_check; drop it if present, then add
-- the widened, explicitly-named constraint.
alter table public.research_fm_esign_requests
  drop constraint if exists research_fm_esign_requests_mode_check;
alter table public.research_fm_esign_requests
  add constraint research_fm_esign_requests_mode_check
  check (mode in (
    'view_only_public_policy','clickwrap_acceptance','typed_signature',
    'opensign_document','opensign_packet',
    'esign_document','esign_packet'));

-- Template mappings: same widening.
alter table public.research_fm_esign_templates
  drop constraint if exists research_fm_esign_templates_mode_check;
alter table public.research_fm_esign_templates
  add constraint research_fm_esign_templates_mode_check
  check (mode in (
    'view_only_public_policy','clickwrap_acceptance','typed_signature',
    'opensign_document','opensign_packet',
    'esign_document','esign_packet'));

-- NOTE: native signed PDFs + completion certificates live in the SAME private
-- bucket the OpenSign path uses (RESEARCH_ESIGN_BUCKET), created in the Storage
-- dashboard, not by SQL. No new table is required for the native path: it reuses
-- research_fm_esign_requests (mode esign_document, provider xenios_native) and
-- research_fm_esign_archive.
