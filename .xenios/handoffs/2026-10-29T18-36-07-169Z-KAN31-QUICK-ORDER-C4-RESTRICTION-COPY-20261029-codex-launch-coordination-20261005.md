# KAN-31 Quick Order C4 restriction-copy exact-source QA handoff

Session: `codex-launch-coordination-20261005`

Task: `KAN31-QUICK-ORDER-C4-RESTRICTION-COPY-20261029`

Lease: `af82fe69-bd0a-4b83-a6ee-a77f9fd945cf`

## Exact source

- branch: `codex/quick-order-restriction-copy-c4-20261029`
- pushed SHA: `288774089cae857c65325fc46d5c456978db2383`
- tree: `bdabaab0be4ec1665588bd2689f8d4019a02abb0`
- parent/base: `4634cb438908b583d50d6bcbdd5569a5ff9324cf`
- draft PR: https://github.com/teamxenios/xenios-website/pull/333
- provider checkout identity: `50a31e87b3e0336c2cc630f17f58ce3c805a38bf`; provider tree readback remains independently pending

The bounded presentation-only implementation maps the six existing
`DirectPurchaseRefusal` codes to truthful customer copy while preserving raw
internal codes, `selectableForReview`, `intentExclusion`, prices, restrictions,
eligibility, purchase authorization, and known-versus-unknown distinctions.
Exact paths:

- `client/src/research/assisted-order/RequestIntentForm.tsx`
- `client/src/research/assisted-order/RequestIntentForm.test.tsx`

## Hosted qualification

Trusted hosted run `40931188389` completed with all five required jobs
successful. Focused result: 107 passed. Full suite: 18,220 passed, zero failed,
83 skipped; 978 files passed and 6 skipped. Focused and full scopes overlap and
are not additive. Raw log SHA-256:
`23772cd3f326d1aea1d1b870fae67e10be9a010ce8c1671f7a229f24ea38d302`.

## Acceptance and release boundary

A new SAME applied-source review is requested in KAN-31/10342 but no verdict is
recorded. This handoff does not infer reviewer pickup or acceptance. PR 333
remains draft. No production GO exists for this unit. No source, runtime, CI,
security, configuration, service, protected-control, provider, customer,
deployment, or production mutation is authorized or performed by this handoff.
