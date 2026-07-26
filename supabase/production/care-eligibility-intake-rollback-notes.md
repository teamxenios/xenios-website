# Care PR2 production rollback notes

Care PR2 is additive and must remain disabled through the canonical
`care_capabilities` row. A normal application rollback must preserve every
Care table and audit/history row.

If the PR2 release fails:

1. Confirm `public.care_capabilities.state = 'disabled'` and both Care enable
   environment flags are unset or not `true`.
2. Roll Render back to the prior known-good deployment SHA.
3. Remove only the PR2 client/server route wiring through a reviewed correction.
4. Preserve all Care consent, eligibility, waitlist, audit, intake, and
   revision rows for investigation.
5. Do not delete or rewrite Care records to make a smoke test pass.

Dropping PR2 functions or tables is destructive and is not part of the normal
rollback. It requires separate explicit authorization, verified zero-row
counts, a recovery plan, and ordered removal after dependent Care releases are
unwound. Never use `CASCADE` into `auth`, Research, or later Care objects.
