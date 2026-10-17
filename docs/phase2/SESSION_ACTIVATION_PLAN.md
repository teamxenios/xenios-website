# Phase 2 session activation plan

## Resume now — PR 105 correction owner

Session ID: `019f9b2b-347a-7301-a777-1155a32f6022`

Copy and paste:

```text
PHASE 2 — RESUME WEBSITE 3 PR 105 CORRECTION OWNERSHIP

You are the sole writer for the existing PR 105 exact 16-path manifest.

Repository: teamxenios/xenios-website
Worktree: C:\Users\sboad\projects\wt-website-3-v3-products
Branch: feature/website-3-v3-products-catalog
Prohibited current head: 5188f774fade0ba8ac8217cf6cb9d92f20bea80d
PR: https://github.com/teamxenios/xenios-website/pull/105

Correct exactly the three independent HIGH findings already returned:

1. Remove the product_key-to-SKU compatibility projection. No supplier-independent
   preview may serialize an invented SKU. Add regressions proving all 49 previews
   remain available while commerce product-master, cart, and checkout remain
   denied until an approved Product Control variant/SKU exists.
2. Replace visible “Renew 360 catalog” branding with “Xenios Research catalog”.
   Add rendered and browser-bundle leak scans for Renew 360, Northline, internal
   source URLs, and internal-source fields.
3. Mark all 49 member-only SEO records noindex,nofollow and emit none into the
   sitemap until an accepted public route exists. Add route and indexability
   regressions.

Strict boundaries:

- Modify only the existing PR 105 16-path manifest.
- Do not import PR 104 ancestry or modify shared integration files.
- Do not invent supplier, SKU, price, inventory, lot, COA, media-right, clinical,
  legal, provider, or launch facts.
- Do not touch Care or clinical functionality.
- Do not merge, deploy, apply migrations, mutate production data, or perform
  payment, refund, payout, label, or customer-communication actions.

Run focused tests, full tests, npm run check, npm run build, git diff --check,
the source/bundle leak scan, and the route/indexability regressions. Commit the
bounded correction, push the existing branch, update PR 105, and post an exact
replacement-head manifest. Report the exact new SHA, changed-file list, tests,
clean/dirty state, and a handoff addressed to independent QA session
019f9b2c-ec9b-7cb3-a763-f8ac8eb7396f.

Do not stop at local changes. Finish at FROZEN_PUSHED_AWAITING_EXACT_SHA_QA.
```

## Resume now — serialized independent QA owner

Session ID: `019f9b2c-ec9b-7cb3-a763-f8ac8eb7396f`

Copy and paste:

```text
PHASE 2 — RESUME WEBSITE 6 SERIALIZED INDEPENDENT QA

You are the sole read-only independent QA owner for the following queue. Do not
write domain code, amend candidate branches, merge, deploy, apply migrations, or
mutate production.

Repository: teamxenios/xenios-website
Current trusted main at activation must be fetched and recorded exactly.
Care and clinical functionality remain disabled, prohibited, and outside scope.

QUEUE 1 — PR 103
PR: https://github.com/teamxenios/xenios-website/pull/103
Exact candidate SHA: 97ee1895763ea9c243de7365f224660d83773966

Perform exact-SHA domain, migration, authorization, concurrency, invalidation,
idempotency, RLS/grant, rollback/forward-repair, current-main collision, full
test/typecheck/build, and manifest review. Confirm the branch contains no route,
checkout, payment, inventory-reservation, order, provider, production-data, Care,
or clinical activation outside its declared persistent-cart kernel.

QUEUE 2 — PR 106
PR: https://github.com/teamxenios/xenios-website/pull/106
Exact candidate SHA: a5c2b21e779117e1f785850188b38bad2e1ba2d8

Perform exact-SHA review of all corrected fulfillment, supplier, affiliate,
statement, economics, authorization, isolation, idempotency, RLS/grant,
concurrency, rollback-zero, UI, accessibility, current-main collision, manifest,
full test/typecheck/build, and migration-order evidence. Explicitly confirm that
no payment, refund, payout, shipping label, customer communication, production
data, legal publication, Care, or clinical action occurs.

QUEUE 3 — REPLACEMENT PR 105
Wait until session 019f9b2b-347a-7301-a777-1155a32f6022 posts a new exact SHA.
Then verify:

- no invented SKU projection reaches product-master, cart, or checkout;
- all 49 truthful member previews remain intact;
- no Renew 360, Northline, internal source URL, or internal-source field leaks;
- all member-only records are noindex,nofollow and excluded from sitemap;
- the replacement changes only the exact 16-path manifest;
- current-main integration can preserve accepted blobs without PR 104 ancestry.

For each queue item, publish a separate exact-SHA verdict:

- ACCEPT — zero blocker/high findings; or
- CHANGES REQUIRED — enumerate every blocker/high with exact file/line/evidence.

Send each verdict to the Phase 2 release manager. Do not treat an earlier SHA,
passing CI alone, or a draft PR as acceptance.
```

## Remain frozen

- `019f94ed-d661-7942-9837-ad428a3374c0` — evidence package only.
- `019f9b2c-565a-7510-9aeb-0914815ebb42` — PR 103 source; resume only if QA
  returns actionable findings.
- `019f9b2a-d746-7b93-b4fc-1bcf32709046` — prior sequencing evidence; Phase 2
  release manager now owns integration.
- `019f9b2b-997c-7681-8a45-456ce7204967` — PR 106 source; resume only if QA
  returns actionable findings.
- `019f94e5-22a3-7760-a855-652f9eb3f1ca` — detached PR 104 preflight; preserve
  local-only evidence and perform no cleanup or production mutation.
