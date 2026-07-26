# Route, Migration, and QA Gates

| Gate | Result | Owner / next action |
|---|---|---|
| Assessment member routes registered | Pass via member-platform registrar tests | Website 2 preserve registrar |
| Assessment capability truthful | Pass; disabled until legal/flag prerequisites | Website 2 configure only after approval |
| Reviewer server routes | Pass and admin-authorized | Website 2 client route/nav |
| Privacy withdrawal route | Pass; authenticated subject-owned, including closed | Website 6 browser test |
| Response migration idempotency | Pass in PostgreSQL 16 | Website 2 apply |
| Forced RLS / grants | Pass | Website 2 production catalog verify |
| One Blueprint per response | Pass in code, tests, partial unique index | Website 2 production invariant query |
| One current published Blueprint | Pass in RPC/index/read paths | Website 6 lifecycle smoke |
| One active monthly plan draft | Pass including A→B→A | Website 6 lifecycle smoke |
| Full tests/typecheck/build | Pass: 3,159 tests, typecheck, production build | Website 1 |
| Desktop/375/320/a11y | Pending integrated route | Website 6 |
