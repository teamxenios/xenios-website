# Website 2 - Member catalog integration handoff

## Frozen inputs

- Production/trusted integration base: `863d9a0bf098a4a23fed39f8a488a0d9dd6885b2`
- Website 6-accepted PR #85 source: `dc11623d27fa59cb51b6cfe653f143633c7ae9ed`
- Exact source merge: `25d2435162420a2e9eddccf78e3ae6fca1a0ef60`
- Source-merge parents: production base plus accepted PR #85 source
- Accepted source files: 12/12 byte-preserved
- Migrations, tables, grants, providers, environment variables, and seeds: none

Rejected PR #85 predecessors remain prohibited:

- `12759c2567246ee83ed71aad9ffa4b517d31e8aa`
- `30b0f6b708c936e2ba1631e4a57f1c5b8c2c54c4`
- `0472905dff10c45239b7f95834e1086c3b3c5f59`

## Website 2 composition

The integration replaces the legacy multi-authority member product page with
the accepted Product Control projection. It registers:

- `GET|HEAD /api/research/member/products`
- `GET|HEAD /api/research/member/products/:slug`

Both endpoints set no-store/no-cache/no-referrer/noindex headers before the
canonical active-member guard. They derive the purchase audience from the
guard-attached durable member record, never from query/body/email input.

The production service reads only published/public/active Product Control
records, canonical required-input/readiness records, current lot
allocatability, and approved private product media. It exposes no quantity,
lot, location, provider, required-input value, private storage key, audit
history, or raw repository error.

Inventory eligibility and exact-lot COA state are derived from the live
`research_lot_is_allocatable` function at one server evaluation instant.
Approved media uses the exact private `research-product-media` bucket and the
accepted five-minute signed-media policy. Missing, ambiguous, stale, or
unavailable dependencies fail closed.

The member catalog remains read-only. It adds no cart, reservation, checkout,
order, payment, prescribing, dosing, clinician, or Care behavior. GLP and
other future-clinical entries remain nontransactional catalog-only states.

## Rollback

Restore the exact pre-release Render deployment. No schema or data rollback is
needed. Because this release is read-only, rollback verification is limited to
route identity, private headers, accepted source blob identity, health, and
unchanged production counts.

## Production smoke

1. Confirm exact accepted integration ancestry and all 12 PR #85 blobs.
2. Confirm Render reaches Live at the exact merged main SHA.
3. Verify `/api/health` is 200.
4. Verify both member catalog endpoints are registered JSON 401 when signed
   out, with private headers, rather than 404 or the shared-password response.
5. Verify the catalog and detail documents show the truthful sign-in gate at
   1440, 720, 375, and 320 CSS pixels with one main/H1, no overflow, visible
   focus, no Care navigation, and no console warning/error.
6. With an existing authorized member session only, verify truthful empty
   catalog behavior or safe Product Control projections. Do not create an
   account, role, product, inventory lot, COA, or required-input row.
7. Confirm Product Control, Wave 2, reservation, member/application/outbox,
   launch-control, and Care counts are unchanged by reads.
