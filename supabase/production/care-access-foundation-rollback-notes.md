# Care access foundation rollback notes

## Scope

This release adds the disabled-by-default Care capability, Care-only role
assignments, metadata-only access audit, `/api/care/status`, a protected Care
access probe, and the truthful `/care` Pending shell. It creates no clinical
record and performs no external action.

## Preferred correction

Keep the schema in place and disable the capability:

- `care_capabilities.capability_key = 'care'`
- `state = 'disabled'`
- `approved_by = null`
- `approved_at = null`
- `CARE_ENABLED` unset or not `true`
- `CARE_ENABLE_APPROVED` unset or not `true`

If the client or server release fails, roll Render back to the immediately
preceding deployment SHA. The disabled database foundation is additive and can
remain without exposing Care.

## Data-preserving rollback boundary

Do not drop `care_access_audit`; it is append-only security evidence. Do not
delete role-assignment history merely to roll back application code. Revoke an
active role by setting `revoked_at` through an approved administrative
correction after preserving evidence.

Dropping the Care tables or function is destructive and requires separate
explicit authorization, a verified export, and confirmation that no role or
audit history exists. It is not part of the normal release rollback.

## Verification after correction

1. Confirm `/api/health` returns 200.
2. Confirm `/api/care/status` reports `state: disabled` and `enabled: false`.
3. Confirm `/care` remains truthful and contains no clinical action.
4. Confirm all three Care tables retain forced RLS.
5. Confirm no browser mutation grants exist.
6. Confirm Render and Supabase logs contain no new serious errors.
