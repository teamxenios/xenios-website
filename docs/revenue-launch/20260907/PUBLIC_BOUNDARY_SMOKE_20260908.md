# Public boundary smoke — 2026-09-08

Unauthenticated GETs against `https://xeniostechnology.com` returned:

- `/api/research/account/context` → **401**
- `/api/research/partner/dashboard` → **401**
- `/api/admin/research/assisted-orders` → **401**
- `/api/admin/research/crm-supplier-operations` → **404** on the current production baseline

The 401 responses confirm protected account, partner, and admin boundaries. The CRM operations 404 is retained as evidence that this newer route is not serving from the current baseline; source tests remain green in the candidate tree. No authenticated identity or state-changing request was used.
