# Independent acceptance of the Resource Hub database checks

ASTRA-B closed its checker-visibility review finding at
`46782cd4f0f73975c021c3a605492aa022c7d4dc`, tree
`6e7965d91ba4a01e416bcc1a7485b0cde80acf27`, on 2026-09-07. B had separately
accepted the narrow FORCE RLS migration at 6c77c56. This is static source and
receipt acceptance, not production authorization or a B rehearsal rerun.

Both checks run in READ ONLY transactions, set LOCAL row_security=off,
and require the executor to have SUPERUSER or BYPASSRLS before visibility or
row-count checks. Successful output records the executor and those properties.
The setting refuses queries that would filter rows; it does not grant a bypass
or disable table RLS. See the [PostgreSQL 17 row-security documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

B verified that the original statement/lock limits, role separation, exact
ACL/schema/private-bucket checks, zero-row assertions and rollback boundaries
remain. Each receipt contains all 150 prior case names plus four new refusal
cases across two default-privilege profiles. Failed guard transactions are
rolled back and roles reset before the preserved service checks.

| Binding | LF SHA-256 |
| --- | --- |
| Unchanged candidate and identical managed SQL | `e55f965fbc942b4de6ec7b74b2bc28b8d7eff8dd6530f50c9876d3137e8dd722` |
| Precheck | `742bce5729a0b4c2db848fbf32658efe0b286c5b910730fd6bfc9182c1ea6fab` |
| Postcheck | `7c7ef33b7091cc1946077070ca6587491b299c5101ca05b4b70dcf95ff379550` |
| Rehearsal | `feb4cfec17643f3cc11213fca54fee95c17ceee1bb656d7cc6ab29c08cca166e` |
| PG17 receipt | `7283c21b05214f5a23f0b61ce3315fb486febafd13f4bad002c4d9276b895f43` |
| PG18 receipt | `67ec3ff6f2d3e21990df6eb53f78acc62a31b74d24652b5b2ddbd94290a8162c` |

The actual local runs passed 154 checks each on PostgreSQL 17.5 and 18.3.
A separately executed the strengthened precheck through its authenticated
production connector: [actual A receipt](resource-hub-checker-visibility-production-precheck.json).
That query returned PostgreSQL 17.6, executor postgres, SUPERUSER=false,
BYPASSRLS=true and row_security=off, with the complete first-install assertions
passing. The migration remains unapplied.

No production data hiding was demonstrated or alleged. The review corrected
a conditional check-procedure gap. Exact production post-install behavior,
enabled Storage/API integration and concurrent-session behavior still need
their explicitly scoped qualification; these local receipts do not prove them.
