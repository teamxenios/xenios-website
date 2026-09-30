# HL-12 SQL probe (Claude, review-only)

- Engine: disposable `public.ecr.aws/supabase/postgres:17.6.1.171` container, `PostgreSQL 17.6`, run locally
  2026-09-30 about 10:53 CT. It is not managed and not production.
- Applied, in order: `supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql`,
  `supabase/migrations/20260815150000_research_assisted_order_bridge.sql`,
  `supabase/migrations/20260820190000_research_assisted_order_declared_affiliate_code.sql`, and
  `supabase/candidates/20260921_research_assisted_order_member_history.sql`. These are the bytes at `8e0271e9`,
  where the application source equals `c213707`.
- Run `hl12_probe.sql` as the superuser. It calls the real `research_assisted_order_submit` and
  `research_assisted_order_set_status`. Output: `hl12_probe_c213707.out`.

| Case | `c213707` result | Required for the successor |
| --- | --- | --- |
| C1 arbitrary non-empty text as `paymentVerificationId` → `paid` | ACCEPTED | REFUSED |
| C2 whitespace-only id | REFUSED | REFUSED |
| C3 verified amount 1¢ against a 10,000¢ estimate | ACCEPTED (the amount is not even read) | REFUSED |
| C4 verified currency EUR against a USD request | ACCEPTED | REFUSED |
| C5 free-text actor | ACCEPTED (actor authority exists only in the app guard) | Actor bound to an authorized verifier record |
| C6 one verification id reused on two orders | ACCEPTED, ACCEPTED | Second REFUSED |
| C7 replay of `paid` on the same order | REFUSED (40001 compare-and-set) | REFUSED |
| C8 `paid` → `cancelled` with no refund evidence | ACCEPTED | Requires refund/reversal evidence |
| Grants on `set_status` | `service_role` EXECUTE only | Unchanged |
| Any column recording a verified amount, currency or quote | none | Present and constrained against the accepted quote |

Re-run against the successor by replacing the applied migration list with the successor's exact bytes.
The case table becomes the acceptance result.
