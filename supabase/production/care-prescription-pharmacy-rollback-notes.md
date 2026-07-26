# Care PR4 production rollback notes

Care PR4 is additive and must remain disabled through the canonical
`care_capabilities` row. A normal application rollback preserves every
pharmacy, license, coverage, operator, source, prescription, order,
configuration-audit, and append-only event/history row.

If the PR4 release fails:

1. Confirm `public.care_capabilities.state = 'disabled'` and both Care enable
   environment flags are unset or not `true`.
2. Roll Render back to the prior known-good deployment SHA.
3. Remove only the PR4 client/server route wiring through a reviewed correction.
4. Preserve all PR4 records and append-only history for investigation.
5. Do not delete, rewrite, or fabricate Care records to make a smoke test pass.

Dropping PR4 functions or tables is destructive and is not part of the normal
rollback. It requires separate explicit authorization, a verified export and
recovery plan, confirmed zero-row counts where applicable, and ordered removal
after later Care releases are unwound. Remove dependent routines and triggers
before tables, unwind PR4 objects in reverse dependency order, and never use
`CASCADE` into Auth, Research, Care PR1/PR2/PR3, or later Care objects.
