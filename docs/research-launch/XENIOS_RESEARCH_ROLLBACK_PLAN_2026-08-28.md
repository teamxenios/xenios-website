# Xenios Research Rollback Plan — 2026-08-28

## Current state and boundary

| Item | Value |
| --- | --- |
| Attested production SHA | 3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212 |
| Attested production branch | release/early-access-code-session-checkout (auto-deploy off) |
| Attested live deployment | dep-da6vorqfngtc73brb0gg (Render service srv-d8s9vej7uimc7384dfcg) |
| Deployed by this program | NO |
| Migrations applied by this program | NO (production and shared staging untouched) |
| Real accounts, invitations, product activations, pricing or payment effects, external messages | 0 / 0 / 0 / none / 0 |

This program produced a release candidate and evidence only. There is nothing
to roll back today: production is exactly the attested SHA above, verified
read-only at the start of the program and never mutated.

## Preconditions for any future rollback

A future rollback is outside the authority of this packet. It requires:

1. Samuel or the designated release owner to approve the exact action.
2. Identification of the exact deployed SHA and deployment ID then active.
3. Confirmation of whether any migration or external configuration was applied.
4. A captured pre-action health and audit snapshot.
5. A named incident/release owner and communication channel.

Re-attest the anchors above immediately before any future action; do not rely
on this packet's snapshot.

## Future code-only rollback sequence

If a later authorized deployment of the frozen candidate causes a
release-blocking regression and no migration was applied:

1. Disable newly introduced mutable capabilities through their reviewed
   fail-closed flags first: `TEBRA_SCHEDULING_ENABLED=false`,
   `RESEARCH_PUBLIC_STOREFRONT_ENABLED` unset/false, `RESEARCH_INDEXABLE`
   unset/false, and any assisted-order/audit authority variables left at their
   dark defaults. Every one of these returns its surface to the truthful
   pending or unavailable state without a code change.
2. Preserve logs and capture the exact failing deployment, SHA, route, time,
   request correlation ids (server-generated, never caller-supplied), and a
   synthetic reproduction. Application logs carry no customer identifiers,
   exception text, or request bodies after `40bae71`.
3. Confirm the prior approved artifact is the exact attested target
   (3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212 today); do not rebuild from a
   branch name.
4. The authorized release owner performs the platform rollback to that exact
   artifact on Render (auto-deploy stays off).
5. Verify public site, `/hino`, the Research gateway and editorial pages, the
   auth wall and account protection, Early Access, `/api` health, 404 and error
   handling, and critical admin reads.
6. Re-run the secret and PII leakage scan against the rollback diff and inspect
   logs for customer-data exposure.
7. Record the final platform deployment id and health verdict in
   `docs/coordination/CURRENT_PRODUCTION_STATE.json`.

## Migration boundary

No migration is part of this candidate's deployable surface. Candidates under
`supabase/candidates/` (client-account/invitation lifecycle, assisted-order
audit store, activation/cart authority, refund command, checkout
compatibility) are outside `docs/coordination/MIGRATION_DAG.json`, unapplied
everywhere, and classified FUTURE MIGRATION REQUIRED. A future migration
rollback requires the candidate-specific rollback SQL, a disposable rehearsal
with verified removal, and founder/data-owner approval — none of which this
program authorizes.

## Configuration rollback

| Surface | Rollback action | Result |
| --- | --- | --- |
| Tebra scheduling / portal | `TEBRA_SCHEDULING_ENABLED=false`, `TEBRA_SCHEDULING_MODE=disabled` | Truthful pending state; no scheduler or portal link is actionable. |
| Public storefront | leave `RESEARCH_PUBLIC_STOREFRONT_ENABLED` unset | Storefront descriptors are not registered; catalog routes remain unmounted and noindex. |
| Research indexing | leave `RESEARCH_INDEXABLE` unset | Client section forces noindex; raw HTTP policy still answers exact status/robots per document. |
| Assisted-order audit authority | leave audit configuration unset | Bridge stays unmounted; no audit table is required. |
| Refund / activation / webhook execution | no flag exists to enable them in this candidate | Always disabled; capability denial precedes every effect. |

## Rollback validation matrix

After any future rollback, verify at minimum: `/`, `/hino/`, `/research`,
`/research/about`, `/research/quality`, `/research/account` (denied without a
session), `/research/early-access`, `/care`, `/api/health`, an unknown path
(authoritative 404 with `X-Robots-Tag: noindex,nofollow,noarchive`), and an
admin read as an authorized operator. Compare against the evidence packet
captured for the candidate (`docs/review/xenios-research-full-site-20260828/`).

## Stop conditions

Stop and escalate to Samuel if any of the following is observed: a migration
was applied without a matching DAG entry; production returns a candidate SHA
that was never frozen and reviewed; any customer identifier, token, or PHI
appears in logs or evidence; or a rollback target cannot be attested by exact
SHA and deployment id.
