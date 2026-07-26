# Website 4 rollback notes

Website 4 is additive over the canonical commerce schema. A rollback must preserve operational, inventory, fulfillment, attribution, commission, notification, and audit evidence.

## Preferred rollback

1. Preserve the failing deployment ID, deployed SHA, logs, and affected request identifiers.
2. Disable or remove only the Website 4 route/capability wiring.
3. Redeploy the prior known-good application SHA through Website 2.
4. Leave the Website 4 tables and append-only evidence in place.
5. Correct the issue in a focused PR and redeploy.

## Database posture

Do not drop Website 4 tables or functions during an incident. Do not update or delete append-only audit or movement evidence. If a function must be disabled temporarily, revoke its `service_role` execution grant in a reviewed corrective migration and restore it with a later reviewed migration. Preserve `research_operations_inventory_commands`, `research_operations_inventory_movements`, fulfillment exception history, and canonical outbox rows; corrections must append evidence rather than rewrite it.

Any schema rollback must be authored as a new migration after inspecting live dependencies and record counts. Never reverse canonical migrations 20–26 as part of a Website 4 rollback.

## Recovery verification

- confirm the prior application SHA is live;
- verify `/api/health`;
- confirm private Website 4 routes are unavailable or on the prior behavior;
- verify canonical order, fulfillment, lot, commission, and notification counts;
- confirm no new serious Render or Supabase errors;
- retain the incident and correction history in the Command Center.
