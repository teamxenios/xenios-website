-- D/E source candidate only. UNREGISTERED / UNAPPLIED.
-- Founder authorization: cd66f3c doc31. This does not approve or publish media.
-- Existing rows stay all-null and render the neutral fallback. No backfill.
-- A separately reviewed Product Control writer must verify the actual delivery
-- bytes, hash, dimensions and variant identity before setting these fields.
-- This candidate is not release-qualified until disposable PostgreSQL proof.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.research_product_media
  add column variant_id uuid,
  add column width integer,
  add column height integer,
  add column content_sha256 text,
  add column illustrative boolean;

alter table public.research_product_media
  add constraint research_product_media_exact_variant_fk
    foreign key (product_id, variant_id)
    references public.research_product_variants(product_id, id),
  add constraint research_product_media_descriptor_complete
    check (
      (variant_id is null and width is null and height is null
        and content_sha256 is null and illustrative is null)
      or
      (variant_id is not null and width is not null and height is not null
        and content_sha256 is not null and illustrative is not null
        and width = 1024 and height = 1024
        and content_sha256 ~ '^[a-f0-9]{64}$'
        and char_length(alt_text) between 1 and 500
        and alt_text = btrim(alt_text))
    );

create index research_product_media_exact_variant_idx
  on public.research_product_media(product_id, variant_id)
  where variant_id is not null;

-- Changing descriptor metadata on an approved row requires a fresh review.
-- The existing Product Control transition remains the sole approval authority.
create function public.research_product_media_descriptor_review_guard()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.state = 'approved' and
    row(new.variant_id, new.width, new.height, new.content_sha256, new.illustrative)
      is distinct from
    row(old.variant_id, old.width, old.height, old.content_sha256, old.illustrative)
  then
    raise exception 'media_descriptor_requires_review';
  end if;
  return new;
end;
$$;
revoke all on function public.research_product_media_descriptor_review_guard()
  from public, anon, authenticated, service_role;
create trigger research_product_media_descriptor_review_guard
before update on public.research_product_media
for each row execute function public.research_product_media_descriptor_review_guard();

-- No changes to grants, RLS, storage policies, primary-image uniqueness,
-- commerce/readiness functions, launch controls, ledgers or migration history.
-- Rollback before commit: ROLLBACK. After adoption, retain approved metadata
-- and use a separately reviewed roll-forward; do not delete evidence.
commit;
