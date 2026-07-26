# Care PR3 production rollback notes

Care PR3 is additive and must remain disabled through the canonical
`care_capabilities` row. A normal application rollback preserves every
appointment, assignment, reminder, telehealth-reference, clinician-review,
configuration, and audit/history row.

If the PR3 release fails:

1. Confirm `public.care_capabilities.state = 'disabled'` and both Care enable
   environment flags are unset or not `true`.
2. Roll Render back to the prior known-good deployment SHA.
3. Remove only the PR3 client/server route wiring through a reviewed correction.
4. Preserve all PR3 records and append-only history for investigation.
5. Do not delete or rewrite Care records to make a smoke test pass.

Dropping PR3 functions or tables is destructive and is not part of the normal
rollback. It requires separate explicit authorization, a verified export and
recovery plan, confirmed zero-row counts where applicable, and ordered removal
after later Care releases are unwound. Never use `CASCADE` into Auth, Research,
Care PR1/PR2, or later Care objects.
