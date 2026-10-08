# Workstream C product subscription behaviour `736bb2a` / `e5ca41d`: bounded delta review against doc 54

**SOURCE ACCEPT WITH LIMITS.** The successor keeps the product subscription card truthful while no offer exists, and
the production mount stays disabled. It fixes four real weaknesses of the accepted wording base:
- a stale refusal can no longer release the duplicate-attempt guard;
- a capability change is now part of the form's identity;
- a rejected request becomes "could not confirm" instead of hanging;
- the previous product or account is masked in the same render.

It is confined to its four files, every hash recomputes, and no accepted test breaks at this commit. There is no P0 or
P1. One P2 overstates in the records how far the in-memory guard reaches. Everything is NOT RUN, and subscription
purchasing is not operational.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Delivered through the coordinator-led queue (board task
`WORKSTREAM_C_BEHAVIOR_REVIEW_20261008` r1, acknowledged at `63eef58`).

Method:
- three read-only lenses, each with an adversarial verifier: the subscription form; the product page and integration;
  tests, scope and records;
- a completeness check;
- my own check of every test that renders the changed components.

Every verifier upheld every lens finding. The subject was never executed. Lens output archived as
`hl12/57_workstream_c_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `736bb2a84fa5b704eabdd8b069bc3ef89b084979`, tree `920691093dc817a7dcf631b26f50fd41a3f20aa3` ("fix: keep subscription review states truthful and scope-safe"), parent `95283ce` (records of the doc 54 wording `e6d7dd1`) |
| Delta | exactly `ProductSubscriptionCreate.tsx`, its test, `pages/member/ProductPage.tsx` and `ProductPage.subscription.test.tsx`; no server, shared, adapter, auth, pricing, offer, payment, activation, SQL or protected path |
| Records | `e5ca41d5e6a6f41ee2b3a24703830d9e9037da90`, records-only: the handoff and `workstream-c-20261008-source.json` |
| Hashes | the before and after SHA-256 of all four files recompute equal to the handoff and the coordinator reconciliation |
| Authority | directive `94485a6`, section 5; the four paths were released by the integration owner at `20a2305` and reclaimed by this owner's lease |

## 2. What holds (inspected source, NOT RUN)

- **No offer, nothing offered.** With the production props (no product, commerce disabled), the card reads "A
  subscription offer is not available for this product." There is no recurring-delivery invitation, form, price,
  schedule or create action. A supplied offer needs both a member token and the enabled capability before review
  controls appear. A missing offer takes precedence over sign-in wording.
- **One request per attempt.** A synchronous guard is set before the request is awaited, so two submits in the same
  turn produce one call. A saved result locks the form, and nothing retries automatically.
- **Unknown outcome stays locked.** An error, an unavailable response or a rejected promise keeps the lock and says the
  save could not be confirmed. It never says nothing was created, and it never shows adapter text.
- **Refusal versus uncertainty.** A definitive refusal keeps quantity and frequency, shows a fixed message and allows
  a deliberate new attempt. A stale refusal, after a product, token or capability change or a hidden view, is ignored
  and cannot release the guard; the base released it.
- **Stale results.** Liveness now ends in layout-effect cleanup, so a promise that settles after a product change,
  token change or unmount is dropped.
- **Inputs.** Price, version, quantity and frequency come only from supported input and the shared constants:
  quantity 1 to 50, frequency 30, 60 or 90.
- **Receipts and state.** The saved receipt says the request is pending with no payment or shipment scheduled. State
  lives only in component memory.
- **Accepted tests.** Of the tests that render the changed components, `product-subscribe.test.tsx` asserts only the
  detail page's unavailable title (unchanged on this branch), masking and absent purchase controls, and the stronger
  masking keeps those true. The other two are this successor's own updated tests.

Doc 54's PSR4-1 is folded in: the expectations now include the closing period.

## 3. Findings (verified)

**P2, records only, before release qualification:**
- **WC-P2-1. The guard does not survive what the records say it survives.** The handoff, a source comment and the
  intent document say the guard persists through route and token updates. That holds in the composed app only for slug
  changes, loading and retry. A Supabase token refresh, sign-in, user update, sign-out or navigation off the product
  route unmounts the whole page through the member route guard, and the in-memory guard goes with it. The directive's
  "token changes cannot bypass an uncertain-attempt lock" is met only at component level. This is pre-existing and
  latent while the production mount passes no product.

  Correct the records to name these unmount events, and bind them to backend ticket 1: durable server idempotency is
  required before any offer is enabled.

**P3, may be carried as limits:**
- **WC-P3-1. Refusal classification is broader than the service's denials.** A thrown 401 or 403 forwarded by the
  global error handler, and the relay's unknown-shape fallback, are classified as definitive refusals and release the
  guard, although the write outcome is unknown. This is latent. It needs a ticket to the existing route owner.
- **WC-P3-2. `commerce_disabled` shows as uncertain.** It is relayed as 503, which the client maps to "unavailable",
  so the user sees the uncertain lock instead of the refusal message. It fails closed. Record it as a PS-R5 note.
- **WC-P3-3. A preserved hide reads as busy.** A Suspense or Activity hide that preserves state would leave the form
  showing "Submitting request..." after reveal. The lock holds, and nothing in the current tree triggers it.
- **WC-P3-4. The guard is not tied to an account or product.** Another account, or product B after product A, sees
  "A request was already submitted from this page" while the owner stays mounted. It fails closed and is unreachable
  today. It needs an owner decision before enablement.
- **WC-P3-5. Test gaps.** No test fails if liveness reverts to a passive effect. Page-level owner retention is
  unpinned. Masking is captured only for an account switch. There is no unauthorized-refusal retry test. The negative
  wording check misses "charged" and "paid".
- **WC-P3-6. Currency scaling.** Prices assume two decimal places for any currency. This is latent until an offer
  projection exists.
- **WC-P3-7. Affected tests not named.** The records do not name `product-subscribe.test.tsx`, nor doc 35's 17-file
  and 36-file sets, two of whose members now have new blobs.
- **WC-P3-8. Integration with the catalog branch.** There is no textual conflict, but doc 56 D-1 sits on the catalog
  branch: its new title breaks `product-subscribe.test.tsx`, and its own test pins the new title. This branch cannot
  fix that, because the detail component takes no title prop. The coordinator must assign D-1 to one owner before the
  branches are composed.
- **WC-P3-9. Ticket anchors.** Backend ticket 1 is accurate but should cite its anchors and the unmount events, and
  note that production currently refuses before save.
- **WC-P3-10. Registry hygiene.** The task's handoff pointer still names October 5, and the second ownership registry
  still reserves `ProductPage.tsx` and `product-subscribe.test.tsx` to Website 2.
- **WC-P3-11. Stale browser snapshots.** The retained browser-fixture snapshots still show the removed intro and "yet".
  Mark them as describing the older source.

## 4. Disposition

- Subject: `736bb2a84fa5b704eabdd8b069bc3ef89b084979` (tree `92069109…`), records `e5ca41d`.
- **SOURCE ACCEPT WITH LIMITS.** No P0 or P1.
- **What it unlocks:** these four blobs may be composed onto the integration line together, after the coordinator
  resolves doc 56 D-1. It does not enable subscriptions, offers, prices, payment or activation, and it does not close
  PS-R4's placeholder-card decision, PS-R1 to PS-R3 or PS-R5 to PS-R7.
- **Before release qualification:**
  - a records-only correction for WC-P2-1, WC-P3-7 and WC-P3-10;
  - one owner for doc 56 D-1;
  - under fresh authority, at the exact integrated tree: the four lane tests, the 17-file and 36-file sets, the
    detail-component tests, the typecheck, the no-em-dash gate, the build, and browser evidence replacing the October 5
    snapshots.
- **Before any offer is enabled:** backend ticket 1 (durable create idempotency), and the refusal-classification
  ticket from WC-P3-1.
