# Refund execution rehearsal receipt template

Run the entire checkout money-authority chain in order on an authorized fresh,
disposable PostgreSQL environment with `ON_ERROR_STOP=1`: checkout executions,
credit reservations, checkout recovery discovery, checkout recovery operation,
and then the refund precheck/candidate/postcheck/rehearsal. Record database
identity, application SHA, every LF-normalized SQL SHA-256, both checkout and
refund rehearsal PASS notices, and the exact value returned by
`public.research_checkout_money_capability()`.

The SQL rehearsals prove exact replay, conflicting replay refusal,
stale-version contention, active claim/order mutation guards,
provider-evidence binding, locked webhook receipt claim and terminalization,
payload-digest and execution-binding tamper refusal, refund-webhook-inbox
foreign-key binding, atomic local completion, ledger/event single-write, and
the exact table/function privilege posture including direct service-role
`INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` refusal where applicable.

The capability may return `durable_checkout_money_v1:20260922.1` only when its
complete chain is present: checkout executions and settlement, recovery
discovery and operation, credit reservations and guards, refund execution,
webhook receipt authority, and guarded order-effect transitions. In a disposable
database, change one covered function body and separately grant one forbidden
table privilege; each change must make the capability return null, and rolling
back the tamper must restore the exact token.

A true independent-connection lock race, managed Supabase/PostgREST execution,
and a provider-delivered Stripe refund webhook remain managed qualification
steps. They are not claimed by the single in-memory PGlite engine rehearsal.
