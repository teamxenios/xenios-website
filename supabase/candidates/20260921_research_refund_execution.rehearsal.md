# Refund execution rehearsal receipt template

Run the precheck, candidate, postcheck, and transactional rehearsal on an authorized disposable PostgreSQL environment with `ON_ERROR_STOP=1`. Record database identity, application SHA, LF-normalized candidate SHA-256, and the final `refund execution rehearsal PASS` notice.

The SQL rehearsal proves exact replay, conflicting replay refusal, stale-version contention, active claim/order mutation guards, provider-evidence binding, refund-webhook-inbox foreign-key binding, atomic local completion, ledger/event single-write, and direct service-role mutation refusal. A true two-session lock race and a provider-delivered Stripe refund webhook remain managed qualification steps; they are not claimed by the single-session rehearsal.
