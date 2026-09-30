# Claude independent review: product imagery v3 source lane at `5c96f9e`

## Identity

| Item | Value |
| --- | --- |
| Branch | `codex/xenios-product-imagery-20260930` |
| Commit | `5c96f9e86dc8dd7b6944bfd6c991e283cd49ccec` |
| Tree | `38fa0b71d3682975c62d3cbe53897a97e8703e1d` |
| Base | `7600943`, the merge base with the core branch |
| Commits | `640513a` (source lane), `5c96f9e` (handoff) |
| Change | 35 paths, all under `.xenios/**`, `client/public/research/products/**`, `docs/product-imagery/**` and `scripts/product-imagery/**`. **No runtime file changed.** |

**Bar:** `13_IMAGE_LAYER_ACCEPTANCE.md`.

**Method:**
- A read-only source and bytes review, in three lenses: identity, assets and infrastructure, truthfulness.
- The lane's build, verify and test scripts were **not** run.
- Claude re-verified these items directly against git bytes: the P1, IMG-ID-01, IMG-ID-03 and IMG-ID-04. The other
  items are source-cited at `5c96f9e`.

## Disposition by required property

| Property | Disposition | Basis |
| --- | --- | --- |
| Provisional assets not deployable as final | **FAIL (P1)** | IMG-01 |
| One canonical identity | PARTIAL | All keys are `mov_`, with 0 duplicates or orphans, and the 22 Featured aliases are structured (PASS). IMG-ID-01, IMG-ID-02 and IMG-ID-05 are open. |
| Approval never decides commerce | PASS (plan) | The handoff makes removing the A6 media gate and adding the isolation test a hard prerequisite. The EA "no product photography" test is unchanged. |
| Durable provenance | PARTIAL | The generator, prompt and hashes are recorded honestly. The source PNG is not durable (the lane itself says so), and the recorded source hashes are CRLF hashes (IMG-ID-04). |
| Neutral unknown forms | PASS, with one exception | All 29 "Form not stated" rows are held and use the form-neutral pedestal. The exception is the Hexarelin/Oxytocin override (IMG-ID-01). |
| No fake third-party packaging | PARTIAL | Today's assignments PASS: Care and marked rows get non-product scenes. The render queue does not: IMG-TRUTH-03 and IMG-TRUTH-06. |
| Safe resolver and wiring plan | FAIL (P2) | IMG-ID-03/TRUTH-05, TRUTH-04, INFRA-03 |
| Featured, All products and detail converge | PARTIAL | The 22 aliases map by structured id (PASS). There are two image authorities (IMG-ID-05) and split id namespaces (IMG-ID-06). |
| Superpower / Mito Health (C7) | NOT HANDED OFF (P2) | IMG-TRUTH-07 |

## Findings

### P1

**IMG-01 · P1 · Ten permanently non-approvable AI candidates sit in the deployable public tree** (re-verified)

**Evidence:**
- `git ls-tree 5c96f9e -- client/public/research/products/fallbacks/` lists 10 WebP files.
- `vite.config.ts` sets `root: client` and `outDir: dist/public`, with **no** `publicDir` override. Vite therefore
  copies `client/public/**` into the build, and `server/static.ts` serves it.
- `fallback-assets.json:16-20` says the files are `blocked_nonapprovable_public_bytes`: "These exact bytes are
  permanently ineligible for approval". Its enforcement is recorded as
  `source_lane_contract_and_release_handoff_block_not_a_runtime_access_control`.
- `package.json` is unchanged, so no build or CI step runs `verify.mjs`.
- Every coverage and crosswalk row carries an `href` to these files.

**Impact.** Merging `5c96f9e` into a release candidate ships unapproved AI bytes at public URLs, or else silently
makes that candidate non-deployable.

**Correction:**
1. Move the ten WebPs out of `client/public` (for example to `docs/product-imagery/review-candidates/`), or out of
   the repository into a private reviewed store.
2. Stop emitting `href` values for non-approvable assets. Use an explicit "no deployable candidate" state instead.
3. Only approved v3 rerenders, with durable source evidence and a named approver, may enter
   `/research/products/fallbacks/`.
4. Add a build-time check that fails if `dist/public` contains any asset whose manifest says
   `deploymentEligibility = blocked`.

### P2

| Id | Finding | Correction |
| --- | --- | --- |
| IMG-ID-01 (re-verified) | The Hexarelin 5 mg / Oxytocin 10 mg form override is registered under the **superseded** keys. `lib.mjs:385` sets `GEN-${supersededSourceRow}`, which is `GEN-GRP-0402`/`0407`. Those keys resolve to `mov_7c55…`/`mov_256cb…`, which carry the superseded labels and `approval_required`/held. C11 says to map by the kept identity (GRP-0426/0425) only. The docs claim "provenance only". | Record the superseded rows as provenance keys. Add a forward crosswalk to the kept identity once the catalog regenerates, and take the journey class from the kept row. Do not queue exact renders for `mov_7c55…`/`mov_256cb…`. Correct the trace and the contract wording. |
| IMG-ID-02 | Coverage is pinned to the 420-row runtime. The founder's 2026-09-30 reversal includes GRP-0421/0423/0424 and GRP-0422, and GRP-0425/0426 get new identities: 424 canonical rows. The lane never mentions 0421/0423/0424, and the 420/419 counts are hard-coded (`verify.mjs:249-253`, `product-imagery.test.mjs:15-18`). | Add a pending-identity section for GRP-0421 to 0426 with their intended treatment: request path, and 0422 held with no component split. Derive counts from the dataset and reconcile them against `expected.canonicalVariants`. |
| IMG-ID-03 / TRUTH-05 (re-verified) | `journeyClassFor` (`lib.mjs:226-250`) is a hand-written replica of runtime authority. It checks "unbound" before hold state, never reads `commerceHolds` or the reviewed formulation holds, and maps `available_this_week`/`coming_soon`/`planned` differently from the server. `production-catalog.ts:137-141` tells generators to use `authorityFor` "rather than a replica that could drift". GRP-0422 is "held" only because it is absent. | The resolver takes the runtime pathway (`authorityFor`/`earlyAccessCustomerPathway`) as input, and the ledger journey class becomes advisory. Add tests: a held row stays held when unbound; GRP-0422 is held by structured id; a runtime-held row never shows a product-form image. |
| IMG-ID-04 (re-verified) | The source hashes in the manifests are of a CRLF working tree, not the committed blob. The member-safe dataset is recorded as `108e81b2…`. `git show 5c96f9e:<path> \| sha256sum` gives `b8634a5d…`, and the CRLF-converted blob gives `108e81b2…`. The same pattern holds for the other sources. On an LF checkout, build and verify are not reproducible. | Hash the git blob (`git cat-file`), or normalize to LF, and record the blob OID. Alternatively, add an eol rule in `.gitattributes`. |
| IMG-ID-05 | `imageState` shares the Early Access vocabulary but not its derivation. EA derives it from Product Control media bound to the PC variant UUID, while the ledger hard-codes `none` per `mov_` row. `INTEGRATION_HANDOFF.md:49/73/89` contradict each other about which system is the exact-media authority. | Name one exact-media authority and add a parity test across the Featured legacy rows and All products. |
| TRUTH-03 | The exact-render prompt template injects raw identity text into all 419 prompts: marks in 7, fill volume in 110, concentration in 106, counts in 9. It omits the style guide's rejection list, and its "unless exact packaging evidence is later approved" clause opens a path to AI replicas of third-party packaging. No prompt validator exists, yet `V3_ACCEPTANCE_TRACE.md:41` claims prompt gates. | Build prompts from structured, stripped facts. Include the full rejection list. Remove the packaging clause for marked rows. Add a prompt validator, and correct the trace. |
| TRUTH-04 | The exact queue plans product-form renders for all 242 Care rows and 33 held rows, including Syringes as an "Included Supply". The planned resolver lets an approved exact asset beat the journey-safe fallback, so the Care and held treatments last only until an exact asset exists (C8/C9). | Exclude Care, held, quote and service rows from exact rendering, or let the journey class win. Add a resolver test for a Care or held row that has an exact asset. |
| TRUTH-06 | Mark detection uses name lists: 8 packaging needles and 3 claim needles. 18 of the 20 retail supplement units are unflagged (Inflam-Eze, GI Defend, Mito Recharge and others), and "Firming" is unflagged. `visualRestrictionFor` returns a single value, so LIBIDO CREAM (Versabase) loses its claim restriction. | Flag retail supplement units by data (category or family). Make restrictions a set. Keep retail third-party units out of AI exact rendering. |
| TRUTH-07 | C7 (Superpower / Mito Health) is marked "implemented in contract", but `DiagnosticsExperience.tsx:69` still reads "Diagnostics partner", and the integration handoff never names that file. | Mark it blocked and handed off. Add a DiagnosticsExperience item: replace the eyebrow, no partner logos, and a name-only Coming soon card distinct from held copy. Name an owner. |
| INFRA-02/03/04 | No gate runs the lane validators. Provisional and approved assets share one path and filename pattern, which the lane's own allowlist accepts. The runtime-reference scan skips `client/public`, `client/index.html`, `config/` and `content/`, and matches exact tokens only. It was clean at `5c96f9e` by an independent grep. | Use a separate non-public candidates namespace. Add a resolver test that rejects the ten current hashes. Widen the scan roots and also match the prefix. |

### P3 (summarized)

- **Orphans.** Two public assets are orphaned, `accessory` and `liquid` (54 KB).
- **Alt text:**
  - it identifies the product, not the variant: 281 of 420 rows share an alt string;
  - 7 display names are malformed (unbalanced parentheses);
  - the alt text lives in `docs/`, which the no-em-dash gate does not scan (B6 is claimed but not met).
- **Rendition size.** One 1024² rendition only, with no srcset. `journey-care` is at 93.6% of the per-asset budget.
- **Coverage accounting.** It overstates readiness: 420 rows are "fallback" and none "pending", while every
  assigned asset is non-approvable.
- **Undefined wiring cases:**
  - the unbound BAM15/Syringes ids;
  - the lease on `client/src/research/assisted-order/**`.
- **Name-text rules.** Some rules still use name text, including P0 queue priority by title (2 of 9 demand titles
  match zero rows).
- **Scope.** The lease scope drifted to include a `.xenios/messages/` file.

## Pass notes

- **Binary hygiene:**
  - all 10 files are RIFF/WEBP VP8 at 1024², with no EXIF, XMP or VP8X;
  - the filename suffix equals the content hash;
  - total 292,336 B, within budget.
- **Visual content.** A visual inspection of all ten found no text, numbers, logos, lot or expiry marks, people or
  hands.
- **Placement.** The files are in the permitted `client/public/research/` zone. No protected or seam file is touched.
- **Identity counts:**
  - 420 coverage rows and 420 crosswalk entries;
  - 419 exposed rows, with FedEx excluded;
  - 417 rows bound to Product Control;
  - 22 legacy aliases with 0 drift;
  - every one of the 19 source forms is mapped explicitly.
- **Early Access.** The no-product-photography policy is not reversed silently, and the service worker and CSP
  implications are safe with content-hashed names.

## Imagery disposition

**NOT MERGEABLE into a release candidate as-is.** The blocker is IMG-01 (P1). The lane is sound as a source-only
ledger once the candidates leave `client/public` and IMG-ID-01, IMG-ID-03 and IMG-ID-04 are corrected. Wiring
remains blocked on the resolver taking runtime authority (TRUTH-04/05). Imagery does not block the payment path.
