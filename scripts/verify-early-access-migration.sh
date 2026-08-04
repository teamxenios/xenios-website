#!/usr/bin/env bash
# Verify the Private Early Access migration against a REAL PostgreSQL.
#
# Everything else about this gate is unit-tested against fakes. This is the only
# check that runs the actual SQL, so it is the one that can prove the grant is
# genuinely single-use under concurrency and that no browser-reachable role can
# read a session. Run it for both supported majors before enabling the flag.
#
#   ./scripts/verify-early-access-migration.sh 16
#   ./scripts/verify-early-access-migration.sh 17
set -euo pipefail
MAJOR="${1:-16}"
NAME="xf5pgverify${MAJOR}"
OWNER='00000000-0000-4000-8000-000000000001'
ROLE='private_early_access_member'
SQL="supabase/research-private-early-access-sessions.sql"
[ -f "$SQL" ] || { echo "run from the repository root"; exit 1; }

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify "postgres:${MAJOR}" >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -q 2>/dev/null && break; sleep 2; done

q() { docker exec -i "$NAME" psql -U postgres -d verify -qtA "$@"; }
fail=0
# psql EXITS NON-ZERO on the very permission error we are looking for, so piping
# it straight into grep under `pipefail` reports the pipeline as failed even when
# grep matched. Capture first, then match, or a locked-down database reads as
# wide open.
denied() {
  local out
  out="$(q -c "$1" 2>&1 || true)"
  case "$out" in *"permission denied"*) echo denied;; *) echo REACHABLE;; esac
}
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; else echo "  FAIL  $1 (expected $3, got $2)"; fail=1; fi; }

# Supabase's roles exist in production, so create them here or the ACL
# assertions would pass by simply having nothing to deny.
q -c "create role anon nologin; create role authenticated nologin; create role service_role nologin;" >/dev/null
echo "PostgreSQL ${MAJOR}: applying migration"
docker exec -i "$NAME" psql -U postgres -d verify -q -v ON_ERROR_STOP=1 < "$SQL" >/dev/null
echo "  PASS  migration applies, and its own ACL assertions raise nothing"

check "a grant exchanges into exactly one session" \
  "$(q -c "select public.research_private_early_access_issue_nonce(repeat('a',64),'$OWNER','$ROLE') is not null and public.research_private_early_access_exchange_nonce(repeat('a',64),repeat('b',64),'$OWNER','$ROLE') is not null;")" t
check "a replayed grant is refused" \
  "$(q -c "select public.research_private_early_access_exchange_nonce(repeat('a',64),repeat('c',64),'$OWNER','$ROLE') is null;")" t
check "the replay created no second session" "$(q -c "select count(*) from public.research_private_early_access_sessions;")" 1
check "the session resolves by hash" \
  "$(q -c "select public.research_private_early_access_session_active(repeat('b',64),'$OWNER','$ROLE') is not null;")" t
check "a wrong access role is refused" \
  "$(q -c "select public.research_private_early_access_issue_nonce(repeat('d',64),'$OWNER','service_role') is null;")" t

for r in anon authenticated; do
  for t in sessions nonces; do
    check "$r cannot read the $t table" \
      "$(denied "set role $r; select count(*) from public.research_private_early_access_$t;")" denied
  done
  for f in issue_nonce exchange_nonce session_active revoke_session; do
    args="repeat('a',64),'$OWNER','$ROLE'"
    [ "$f" = exchange_nonce ] && args="repeat('a',64),repeat('b',64),'$OWNER','$ROLE'"
    check "$r cannot execute $f" \
      "$(denied "set role $r; select public.research_private_early_access_$f($args);")" denied
  done
done

# The real question a fake cannot answer: under genuine concurrency, can one
# grant ever yield two sessions? Four connections race the same 50 grants.
q -c "truncate public.research_private_early_access_sessions, public.research_private_early_access_nonces;" >/dev/null
q -c "do \$\$ begin for i in 1..50 loop perform public.research_private_early_access_issue_nonce(lpad(to_hex(i),64,'0'),'$OWNER','$ROLE'); end loop; end \$\$;" >/dev/null
for w in 1 2 3 4; do
  q -c "do \$\$ declare i int; begin for i in 1..50 loop perform public.research_private_early_access_exchange_nonce(lpad(to_hex(i),64,'0'), md5(md5('w${w}s'||i::text))||md5('x'||'w${w}s'||i::text), '$OWNER','$ROLE'); end loop; end \$\$;" >/dev/null &
done
wait
check "200 racing exchanges over 50 grants yield exactly 50 sessions" \
  "$(q -c "select count(*) from public.research_private_early_access_sessions;")" 50
check "every grant is consumed exactly once" \
  "$(q -c "select count(*) from public.research_private_early_access_nonces where consumed_at is not null;")" 50

echo
[ "$fail" -eq 0 ] && echo "PostgreSQL ${MAJOR}: ALL CHECKS PASSED" || { echo "PostgreSQL ${MAJOR}: FAILURES ABOVE"; exit 1; }
