# Linked production migration history — read-only reconciliation

The unavailable-history startup blocker is closed for local engineering under
Samuel's paired continuation directive. **Production migration readiness remains
open.** Version history is not SQL byte equality or schema parity. No production
migration, repair, deployment, configuration or business mutation was performed.

## Observation and integrity

The explicitly linked Supabase CLI 2.116.0 ran `supabase migration list --linked`
in this worktree at `2026-09-05T17:41:52.924387+00:00`, completing at
`2026-09-05T17:41:55.143908+00:00` with exit code 0. Project identity was checked
against local project-ref, the pooler project binding and absence of conflicting
environment/profile/workdir/database overrides: `yvzeduaxbwgcwllhywff`.
The authenticated local CLI context is distinct from the earlier failed
management API read. No credential or connection string is included here.

The CLI returned a complete JSON LOCAL/REMOTE ledger in agent mode. Exact raw
stdout and allowlisted stderr are preserved, along with an independently rendered
69-row table. Duplicate JSON keys, malformed row fields/dates, duplicate versions,
missing local files and unexpected stderr were rejected during reconciliation.

- Git basis: `1bd9431b0eac6d12a255832fe2f676f07e2a5027`.
- Raw stdout SHA-256: `c64eaec4ed4312521d231fa7b27f896efd58218a040bcbaa1254830389aad73b`.
- Full rendered export SHA-256: `51d48efd89c6f01767830c3afaa7bf256cb2069e7ec8ff752f5c5c48f2230441`.
- 35 local versions, 40 remote versions, 6 same timestamps, 29 local-only,
  34 remote-only; no duplicates or local filename/version conflicts.
- All 35 local files are represented. All 35 Git-blob SHA-256 checksums match
  the recorded migration DAG. CRLF working-copy differences are not SQL changes.
- Render read-only refresh still reports live SHA
  `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`, deploy
  `dep-dad08h740ujc73aprfcg`, automatic deployment off. The configured release
  branch remains `8cca3373047a2161f5360541a9b2fc5c71f8063f` and must not be
  mistaken for the live SHA.

## Disposition and exact remaining plan

`migration-reconciliation.json` individually accounts for every local and remote
row, with repository references, historical claims and next actions. Historical
records remain historical; the DAG has not been rewritten to imply live parity.

Five local-only timestamps have explicit repository-documented remote aliases:

| Local | Recorded remote | Migration |
| --- | --- | --- |
| 20260726143000 | 20260726214102 | Product Control |
| 20260726214500 | 20260726215603 | Product Control privilege hardening |
| 20260813120000 | 20260814040633 | M67 member history |
| 20260814061500 | 20260814060630 | M68 search path |
| 20260815150000 | 20260819203614 | M71 assisted bridge |

These aliases explain timestamp differences; they do not independently attest
remote SQL bytes. Do not reapply or rename the local files to erase the difference.
Twenty additional remote-only timestamps have names in the July 30 historical
managed ledger but no same-version local migration. Nine remote timestamps lack
an exact repository-backed name/binding:

`20260814041723`, `20260814042047`, `20260814043320`, `20260814051903`,
`20260814054754`, `20260814061243`, `20260814110250`, `20260814173019`,
`20260820224041`.

Three local files have historical SQL-editor application claims without exact
fresh version matches: `20260804120000`, `20260804121000`, `20260809130000`.
An absent version does not prove their database objects are absent.

M75 (`20260820190000`) has contradictory bookkeeping: the DAG/MIGRATIONS index
says pending, while `DEPLOY_RECORD_2026-08-20_M75_AFFILIATE_CODE.md` records
application and postchecks, and the current local checksum agrees with that
record. No exact record binds it to remote `20260820224041`; timestamp proximity
is not an alias. M76 (`20260821170000`) is absent by exact version and the
previous bulk RPC read returned 404, without establishing complete schema state.

Before production migration approval, obtain authorized read-only remote
names/statements and relevant schema/privilege definitions; bind each disputed
row to its exact SQL/object evidence. Separate already-applied aliases and
SQL-editor objects from genuinely unapplied candidates. Rehearse the resulting
candidate and rollback/pre/postchecks against a disposable database with verified
prerequisites. Present only the required exact migration steps with the final
release SHA. No blanket `db push`, `migration repair`, renaming or speculative
SQL application is allowed. Missing external provenance does not prevent
dependency-ready local backend/client engineering under the latest directive.

## Artifacts

- `cli-migration-list.stdout.json`: complete exact CLI output (version evidence).
- `cli-migration-list.stderr.txt`: two connection-progress lines only.
- `production-migration-history-export.txt`: complete readable LOCAL/REMOTE table.
- `production-migration-history-export.metadata.json`: executable, identity,
  timestamps, exit status, byte counts, hashes and screening method.
- `migration-reconciliation.json`: all rows and gate scope, including zero remote
  SQL-byte attestations. It is a discrepancy ledger, not approval to mutate.
