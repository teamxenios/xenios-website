# Current production state

This is the human companion to
`docs/coordination/CURRENT_PRODUCTION_STATE.json`. The JSON record is the
machine-readable release-manager snapshot.

## Live identity

| Field | Value |
|---|---|
| Production Git SHA | `d494150668de2ede8a61fd0d28bc9ff9a75def26` |
| Render deployment | `dep-d9jcfkuk1jcs73fi5r1g` |
| Render state | `LIVE` |
| Public origin | `https://xeniostechnology.com` |
| Evidence captured | `2026-07-27T03:05:00Z` |

Health is 200. The signed-out Research account gate is 200/no-store, while
member, activation, capability, and activation-readiness endpoints reject
signed-out requests with 401. Care remains disabled and absent from ordinary
Research navigation.

## Account continuity

Read-only production evidence shows two Research members, both bound to an
existing Supabase Auth user, with zero orphaned auth bindings. One member is
active and one is pending activation. The deployed ancestry includes the
session-resume merge `07bd51c09cca71c1cd4dfe980f9d95e4ba6a7d44`
and atomic activation-verification merge
`7f74308ab705ec7850b7a65dc1e6f53ac7683ada`.

This is continuity evidence, not an invented end-to-end browser result. No
account, role, session, or record was fabricated.

## Activation bridge and payment verification

The founding-membership bridge has one settings row and is enabled for new and
existing activation obligations. Production contains one approved/enabled
manual payment method, one verified obligation, one upcoming obligation, one
ledger entry, one receipt, one membership period, and one bridge audit event.

`research_fm_activation_verify_commit` exists once, is executable by
`service_role`, and is not executable by `anon` or `authenticated`. Replacement
provider status is `not_started`. Therefore:

- the existing manual founding-membership bridge has real production evidence;
- no general product-checkout payment provider is claimed ready;
- payment credentials or secret values were not inspected or recorded.

## Capability route ownership

PR #86 is deployed and Website 6 post-deploy accepted it. Production now has
one canonical `GET`/`HEAD /api/research/capabilities` owner in
`server/research/capabilities.ts`, mounted through `registerMemberPlatformApi`.
Private no-store/no-cache/no-referrer/noindex headers are applied before the
downstream member and administrator authentication boundaries. `POST` remains
intercepted and fail-closed. The `/admin/research` document receives the same
private document posture.

## Migration ledger reconciliation

Production migration history contains both Product Control releases:

- `20260726214102 research_product_control_center`;
- `20260726215603 research_product_control_center_privilege_hardening`.

The repository ledger incorrectly marked the hardening migration pending. The
shared correction records it as RUN and pins the verified 33/5/0/11 privilege
posture. No migration is applied by this documentation correction.

## Safe production counts

| Fact | Count/state |
|---|---:|
| Research members | 2 |
| Research applications | 2 |
| Notification outbox | 42 |
| Required inputs | 0 |
| Domain launch controls | 0 |
| Product Control rows | 0 |
| Product Control Storage objects | 0 |
| Care capability | disabled |

Product Control remains 12/12 forced RLS, zero browser table grants, 33 service
table privileges, five command-table SELECT grants, zero command-table DML, and
11 service-only RPC grants.

## Release queue

- PR #80 exact head `f646708d45d4a6e4e7acf4e2653e44746baef184`
  remains prohibited.
- PR #85 predecessor
  `12759c2567246ee83ed71aad9ffa4b517d31e8aa` remains prohibited.
- PR #85 replacement
  `30b0f6b708c936e2ba1631e4a57f1c5b8c2c54c4` is prohibited after three
  Website 6 HIGH findings. Its predecessor `12759c2567246ee83ed71aad9ffa4b517d31e8aa`
  remains prohibited as well.
- PR #85 second replacement
  `0472905dff10c45239b7f95834e1086c3b3c5f59` is prohibited after two
  Website 6 HIGH findings covering exact active display-blocking input
  completeness and the shared five-minute signed-media TTL.
- PR #85 exact source `dc11623d27fa59cb51b6cfe653f143633c7ae9ed`
  is Website 6 accepted with zero blocker/high. Its 12 source blobs are frozen;
  a separate current-main integration candidate is required.
- PR #86 head `225455615eda0c420996929379a5a1f9d535b4e8`
  is prohibited because full production route order shadows the capability
  handler before its private member boundary. A bounded replacement is in
  progress in the separate shared-hotfix worktree.
- PR #86 replacement `4f71648aa5684ebec70f14b7e09268331c522969`
  is merged and deployed as `d494150668de2ede8a61fd0d28bc9ff9a75def26`
  on Render `dep-d9jcfkuk1jcs73fi5r1g`. Website 6 post-deploy QA accepted the
  live route/header/browser/log posture with no blocker/high.
- Website 1 is preparing the durable Samuel-authority replacement from the
  exact production base.

Website 2 alone owns shared integration, migration ordering, merge, Render
deployment, rollback, and production smoke. No candidate merges or deploys
before Website 6 exact-SHA acceptance.
