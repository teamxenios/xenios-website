# Customer accepted assembly `cad2c4d` / `f175f3c`: bounded composition review

**SOURCE ACCEPT WITH LIMITS.** The composed candidate is exactly the two accepted inputs and nothing else:
- the four Workstream C files are byte-identical to `736bb2a` (doc 57);
- the four catalog and detail files are byte-identical to `8f080a0` (doc 60);
- the accepted `product-subscribe.test.tsx` is unchanged.

The product page's runtime import graph equals the graph of the executed `756a906` tree, 39 modules in both, except
the three reviewed files. Every page-level test case hand-simulates consistently against the composed files. The
required doc 57 records correction is in place, and the four Workstream C paths transferred cleanly to the
integration owner. No P0, P1 or P2. Everything is NOT RUN: the composed tests have never executed on any tree.

Reviewer: this session, `claude-opus-5-5`. Board task `CUSTOMER-ACCEPTED-ASSEMBLY-DELTA-20261008` r1, acknowledged at
`1fb30a7`. The scope is composed identity, compatibility and the doc 57 records correction; accepted source was not
re-audited.

Method:
- my own byte-for-byte comparison of the composed files with both inputs;
- one read-only lens with an adversarial verifier, which upheld every lens finding and added three.

One process note. One verifier command briefly wrote four empty files into this reviewer session's own working
directory, not into any reviewed worktree. It removed them at once, and none remain. Lens output archived as
`hl12/62_customer_assembly_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Composed source | `cad2c4d1b1dd4ead798b032e6abf8b55e1c2f055`, tree `e90de4206f9698f00bc1ee8a9905978db8c960ce` ("feat: assemble accepted subscription presentation with catalog"); its ancestors are `9c2dd1c` (transfer receipt), `37f2d96` (doc 56 correction records) and `8f080a0` |
| Records | `f175f3c1bdfed6dc2d0f71733cc5dff63298b160`, tree `c21fa445…`, the branch head; records-only |
| Delta from `8f080a0` | exactly the four Workstream C paths (298 insertions, 51 deletions); every other non-records path since `756a906` is one of the eight accepted files |
| Blob equality | Workstream C files `b4046a7`, `d094bab`, `d50b467` and `ce94ff4` equal `736bb2a`; catalog files `c54db89`, `5a9e65b`, `f1db3fa` and `78f2353` equal `8f080a0`; `product-subscribe.test.tsx` is `f389110` everywhere |
| Records recompute | the 11 file bindings, the other-source inventory (3,278 rows) and the preservation inventory (5,984 rows) recompute, and foreign registry rows are preserved |

## 2. Compatibility (hand-simulated, NOT RUN)

- **Import graph.** Workstream C was written on a base without the product-media composition. Composition brings in
  modules the C base lacked or held at other versions:
  - the media modules: `ProductMedia.tsx`, `product-media.css` and `product-media.ts`;
  - the cart-selection adapters, plus `product-admin.ts` and `price-quantity-tiers.ts`;
  - a newer member-catalog adapter.

  Every one of them is byte-identical to the executed `756a906` tree. So compatibility rests on that equality except
  for the three reviewed files, plus hand-simulation.
- **`ProductPage.subscription.test.tsx`.** All nine cases hold against the catalog branch's detail component and
  adapter:
  - the hidden form renders nothing;
  - a scope change masks the previous product;
  - late responses are dropped;
  - every call is a GET.
- **`product-subscribe.test.tsx`.** The unavailable and slug-mismatch paths render "This product is not available.",
  and no substitution or purchase control appears.
- **Other tests.** No other test renders the product page. The subscription form's own test graph is identical at both
  commits.

## 3. Doc 57 records correction

- **WC-P2-1: corrected in records.** The records now name new-session sign-in, token refresh, forced verification,
  sign-out, route exit, reload and other tabs as events that unmount the guard. They bind these to backend ticket 1,
  with accurate anchors.
- **WC-P3-7: corrected.** The 17-file and 36-file sets are named in order, with their 4-file overlap and 49-file union.
- **WC-P3-10: partly corrected.** The handoff pointers are fixed. The second ownership registry still reserves
  `ProductPage.tsx` and `product-subscribe.test.tsx` to Website 2 (D62-3). The task row's local successor still points
  to `e6d7dd1` (D62-8).
- **Transfer `ce5e58f`.** It moves exactly the four Workstream C paths to the integration owner's lease, and the receipt
  at `9c2dd1c` matches.

## 4. Findings (all P3, verified)

- **D62-1. The composed tests have never run.** `ProductPage.subscription.test.tsx` at this version has never run on
  any tree. Here it runs against a detail component that differs from both its authoring base and the executed tree.
  Run the 17-file and 36-file sets, plus the media tests, at the exact composed tree under fresh authority.
- **D62-2. A source comment still overclaims.** It says the retry guard "survives token rotation and offer refresh",
  which doc 57 called an overstatement for the composed route. The correction was records-only. Reword it at the next
  source touch.
- **D62-3. The second registry is unreconciled.** It still holds a Website 2 write reservation over files this
  candidate writes. The coordinator should mark that reservation superseded.
- **D62-4. The catalog freeze lives only in prose.** The integrator's lease lists only the four Workstream C paths, and
  the four catalog paths are covered only by old foreign leases in handoff state. Record the freeze in the registry.
- **D62-5. One authority citation is wrong.** The transfer cites the additive directive `1b165b15` together with
  sections 6 and 7 of a different attachment.
- **D62-6. The inventory digest depends on a Git setting.** It reproduces only with Git's default path quoting, under
  which one `docs/` row slips past the exclusion filter. State the exact derivation wherever the digest is cited,
  including a snapshot-S packet.
- **D62-7. The dependency list is incomplete.** The records' list of differing transitive dependencies is short. Use
  section 2's list.
- **D62-8. A stale successor pointer.** The subscription task row still advertises `e6d7dd1` as its local successor.
  Mark it superseded on the owner's next records turn.

## 5. Disposition

- Subject: composed `cad2c4d1b1dd4ead798b032e6abf8b55e1c2f055` (tree `e90de420…`), records `f175f3c`.
- **SOURCE ACCEPT WITH LIMITS** as the integrated catalog and Workstream C candidate. No P0, P1 or P2.
- **For snapshot S:** `cad2c4d` (or `f175f3c` for its records) is now an accepted composed customer source. A snapshot
  built on it no longer needs the label "review pending" for this component. Doc 64, the supervisor, is a separate
  matter.
- **What stays held:**
  - execution of every affected test, the typecheck, the gates, the build and browser qualification;
  - your copy decisions;
  - subscription purchasing, which is disabled and needs backend ticket 1;
  - every hold from docs 35, 56, 57 and 60;
  - push and release.
