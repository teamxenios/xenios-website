#!/usr/bin/env bash
# M63 migration harness, in the MANAGED-SUPABASE SHAPE.
#
#   ./scripts/verify-m63-legal-signability.sh 16
#   ./scripts/verify-m63-legal-signability.sh 17
#
# WHY THIS SHAPE.
#
# Managed Supabase installs pgcrypto into a dedicated `extensions` schema, not
# `public`. A container that installs it into `public` is a different database
# from the one that runs, and that difference has already broken one release
# (see scripts/verify-early-access-cart-managed-supabase.sh). This harness
# provisions pgcrypto exactly where Supabase puts it and PROVES `public.digest`
# is absent before applying anything.
#
# WHAT IT PROVES.
#
#   pre    the founding-membership agreements schema applies, and BEFORE M63
#          the category constraint REFUSES the four new categories, so the
#          blocker is real and not assumed;
#   seed   historical legal rows exist (versions in original categories, plus a
#          real signature bound to a published version);
#   apply  M63 applies at psql exit 0, then applies a SECOND time at exit 0;
#   K/L    the widened constraints accept all 20 categories and refuse a 21st,
#          on BOTH tables, proved by real inserts that are rolled back;
#   M      every seeded historical row survives BYTE-IDENTICAL across both
#          applies, compared by a fingerprint taken before M63;
#   N      M63 fabricates no legal package, signature or binding.
set -uo pipefail
MAJOR="${1:-16}"
NAME="xeniosm63legal${MAJOR}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FM_SCHEMA="supabase/production/research-founding-membership.sql"
M63="supabase/migrations/20260810120000_research_fm_document_category_expansion.sql"
VERIFY="supabase/verification/research-fm-document-category-expansion.verify.sql"

for f in "$FM_SCHEMA" "$M63" "$VERIFY"; do
  [ -f "$REPO_ROOT/$f" ] || { echo "missing $f"; exit 1; }
done

FAILED=0
step() { echo; echo "== $* =="; }
fail() { echo "FAIL  $*"; FAILED=1; }
pass() { echo "PASS  $*"; }

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

step "starting postgres:${MAJOR}"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "postgres:${MAJOR}-alpine" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 || { echo "postgres never became ready"; exit 1; }
docker exec "$NAME" psql -U postgres -tAc 'select version()'

psql_file() { docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < "$REPO_ROOT/$1"; }
psql_cmd()  { docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -tAc "$1"; }

step "provisioning the managed-Supabase shape (pgcrypto in extensions)"
psql_cmd "create schema if not exists extensions;" >/dev/null
psql_cmd "create extension if not exists pgcrypto with schema extensions;" >/dev/null
if [ "$(psql_cmd "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='digest'")" = "0" ]; then
  pass "public.digest is absent, as on managed Supabase"
else
  fail "public.digest exists; this is not the managed shape"
fi

step "applying the founding-membership agreements schema"
psql_file "$FM_SCHEMA" >/dev/null || { echo "FM schema failed to apply"; exit 1; }
pass "founding-membership schema applied"

step "PRE-M63: the four categories are refused (the blocker is real)"
for category in website_terms_of_use product_purchase_terms shipping_claims_replacement_policy payment_evidence_upload_consent; do
  if psql_cmd "insert into public.research_fm_document_versions(tenant,category,title,semver,status,jurisdiction,content,content_hash) values ('pre_m63','${category}','x','9.9.9','draft','Texas','x',repeat('a',64));" >/dev/null 2>&1; then
    fail "pre-M63: ${category} was accepted; the base schema is not what was reviewed"
  else
    pass "pre-M63: ${category} refused by the 16-value constraint"
  fi
done

step "seeding historical legal rows"
docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL'
insert into public.research_fm_document_versions(
  id, tenant, category, title, semver, status, effective_date, published_at,
  jurisdiction, content, content_hash, requirement, activation_step,
  requires_separate_acknowledgment, publisher, counsel_review, created_at, updated_at
) values (
  '11111111-1111-4111-8111-111111111111', 'xenios_research', 'electronic_record_consent',
  'Electronic Records and Signatures Consent', '1.0.0', 'published', '2026-07-22',
  '2026-07-22T00:00:00Z', 'Texas', 'historical consent text',
  encode(extensions.digest(convert_to('historical consent text','utf8'),'sha256'),'hex'),
  'required', 'electronic_consent', false, 'counsel-ops', 'approved',
  '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z'
), (
  '22222222-2222-4222-8222-222222222222', 'xenios_research', 'arbitration_agreement',
  'Arbitration Agreement', '1.0.0', 'published', '2026-07-22',
  '2026-07-22T00:00:00Z', 'Texas', 'historical arbitration text',
  encode(extensions.digest(convert_to('historical arbitration text','utf8'),'sha256'),'hex'),
  'required', 'arbitration_acknowledgment', true, 'counsel-ops', 'approved',
  '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z'
), (
  '33333333-3333-4333-8333-333333333333', 'xenios_research', 'referral_store_credit_terms',
  'Referral and Store Credit Terms', '0.1.0', 'draft', null, null,
  'PLACEHOLDER, counsel to determine', 'historical draft text',
  encode(extensions.digest(convert_to('historical draft text','utf8'),'sha256'),'hex'),
  'optional', null, false, null, 'not_reviewed',
  '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z'
);

insert into public.research_fm_document_signatures(
  id, tenant, member_id, document_version_id, category, semver, content_hash,
  typed_legal_name, full_document_shown, affirmative_consent, separate_acknowledgment,
  electronic_consent_version_id, signed_at
) values (
  '44444444-4444-4444-8444-444444444444', 'xenios_research',
  '55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222',
  'arbitration_agreement', '1.0.0',
  encode(extensions.digest(convert_to('historical arbitration text','utf8'),'sha256'),'hex'),
  'Historical Signer', true, true, true,
  '11111111-1111-4111-8111-111111111111', '2026-07-22T01:00:00Z'
);
SQL
pass "seeded 3 document versions and 1 signature"

FINGERPRINT_SQL="select md5(string_agg(t::text, '|' order by t::text)) from (select * from public.research_fm_document_versions) t"
SIG_FINGERPRINT_SQL="select md5(string_agg(t::text, '|' order by t::text)) from (select * from public.research_fm_document_signatures) t"
BEFORE_VERSIONS="$(psql_cmd "$FINGERPRINT_SQL")"
BEFORE_SIGS="$(psql_cmd "$SIG_FINGERPRINT_SQL")"
BEFORE_VCOUNT="$(psql_cmd "select count(*) from public.research_fm_document_versions")"
BEFORE_SCOUNT="$(psql_cmd "select count(*) from public.research_fm_document_signatures")"
echo "fingerprint versions=$BEFORE_VERSIONS ($BEFORE_VCOUNT rows) signatures=$BEFORE_SIGS ($BEFORE_SCOUNT rows)"

step "applying M63 (pass 1)"
if psql_file "$M63" >/dev/null; then pass "M63 applied once, psql exit 0"; else fail "M63 first apply failed"; exit 1; fi

step "verification suite after the first apply"
if psql_file "$VERIFY"; then pass "verification suite passed after apply 1"; else fail "verification suite failed after apply 1"; fi

step "M: historical rows survived apply 1 unchanged"
AFTER1_VERSIONS="$(psql_cmd "$FINGERPRINT_SQL")"
AFTER1_SIGS="$(psql_cmd "$SIG_FINGERPRINT_SQL")"
[ "$AFTER1_VERSIONS" = "$BEFORE_VERSIONS" ] && pass "version rows byte-identical" || fail "version rows changed"
[ "$AFTER1_SIGS" = "$BEFORE_SIGS" ] && pass "signature rows byte-identical" || fail "signature rows changed"

step "applying M63 (pass 2, apply-twice)"
if psql_file "$M63" >/dev/null; then pass "M63 applied twice, psql exit 0"; else fail "M63 second apply failed"; fi

step "verification suite after the second apply"
if psql_file "$VERIFY"; then pass "verification suite passed after apply 2"; else fail "verification suite failed after apply 2"; fi

step "M: historical rows survived apply 2 unchanged"
AFTER2_VERSIONS="$(psql_cmd "$FINGERPRINT_SQL")"
AFTER2_SIGS="$(psql_cmd "$SIG_FINGERPRINT_SQL")"
[ "$AFTER2_VERSIONS" = "$BEFORE_VERSIONS" ] && pass "version rows byte-identical after two applies" || fail "version rows changed after two applies"
[ "$AFTER2_SIGS" = "$BEFORE_SIGS" ] && pass "signature rows byte-identical after two applies" || fail "signature rows changed after two applies"

step "N: no row was created by either apply"
[ "$(psql_cmd "select count(*) from public.research_fm_document_versions")" = "$BEFORE_VCOUNT" ] \
  && pass "version row count unchanged ($BEFORE_VCOUNT)" || fail "version row count changed"
[ "$(psql_cmd "select count(*) from public.research_fm_document_signatures")" = "$BEFORE_SCOUNT" ] \
  && pass "signature row count unchanged ($BEFORE_SCOUNT)" || fail "signature row count changed"

step "the four categories are now usable end to end"
if psql_cmd "insert into public.research_fm_document_versions(tenant,category,title,semver,status,jurisdiction,content,content_hash) values ('post_m63_probe','product_purchase_terms','x','9.9.9','draft','Texas','x',repeat('a',64));" >/dev/null 2>&1; then
  pass "post-M63: product_purchase_terms accepted"
  psql_cmd "delete from public.research_fm_document_versions where tenant='post_m63_probe';" >/dev/null
else
  fail "post-M63: product_purchase_terms still refused"
fi

step "fail-closed preflight: M63 refuses a database without the legal schema"
docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -tAc \
  "create database m63_bare;" >/dev/null 2>&1
if docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -U postgres -d m63_bare -f - < "$REPO_ROOT/$M63" >/dev/null 2>&1; then
  fail "M63 applied to a database with no legal schema; it must fail closed"
else
  pass "M63 refuses a database with no legal schema (fail closed)"
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "M63 PG${MAJOR} HARNESS: PASS"
else
  echo "M63 PG${MAJOR} HARNESS: FAIL"
fi
exit "$FAILED"
