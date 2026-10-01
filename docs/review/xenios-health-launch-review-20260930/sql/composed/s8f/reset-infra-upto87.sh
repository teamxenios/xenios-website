#!/usr/bin/env bash
# Recreate disposable PG 17.6 + PostgREST v14.13 and apply the canonical SQL bytes recorded in sql/BYTES.txt.
export MSYS_NO_PATHCONV=1
S=C:/Users/sboad/AppData/Local/Temp/claude/C--xenios-wt-general-platform/6abf1edf-2b16-476e-8305-23b9a0014e06/scratchpad/hl12app
docker rm -f claude-hl12-rest claude-hl12-pg >/dev/null 2>&1
docker network inspect claude-hl12-net >/dev/null 2>&1 || docker network create claude-hl12-net >/dev/null
docker run -d --name claude-hl12-pg --network claude-hl12-net -e POSTGRES_PASSWORD=review-local-only public.ecr.aws/supabase/postgres:17.6.1.171 >/dev/null
for i in $(seq 1 60); do docker exec claude-hl12-pg pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 3; done; sleep 6
for f in $(ls $S/sql-upto87/*.sql | sort); do b=$(basename $f); docker cp "$f" claude-hl12-pg:/tmp/$b && docker exec claude-hl12-pg psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f /tmp/$b >/dev/null 2>$S/apply.err || { echo "FAILED $b"; tail -3 $S/apply.err; exit 1; }; done
docker exec claude-hl12-pg psql -U supabase_admin -h 127.0.0.1 -d postgres -q -c "alter role authenticator with password 'review-local-authenticator';" >/dev/null
docker run -d --name claude-hl12-rest --network claude-hl12-net -p 127.0.0.1:38431:3000 -e PGRST_DB_URI="postgres://authenticator:review-local-authenticator@claude-hl12-pg:5432/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$(cat $S/jwt-secret.txt)" public.ecr.aws/supabase/postgrest:v14.13 >/dev/null
for i in $(seq 1 30); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:38431/)" = "200" ] && break; sleep 2; done
echo "infra ready: $(docker exec claude-hl12-pg psql -U postgres -h 127.0.0.1 -tAc 'show server_version')"
