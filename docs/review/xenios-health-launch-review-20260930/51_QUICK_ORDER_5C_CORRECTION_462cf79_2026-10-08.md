# Quick Order corrected section 5C design (coordinator `462cf79`): design disposition against doc 49

**COMPATIBLE AS DESIGN, with a mandatory carry-forward list.** The corrected packet resolves the three doc 49 P2s:

- **Epoch scope (5C-1).** Lot quantity, version and timestamp churn leaves global invalidation and is protected instead
  by exact lot locks plus a fresh re-read. Members and partners are narrowed to the columns their readers consume.
  Grants are out. Binding and transfer inserts still advance the epoch. The missing reader census is supplied.
- **Owner precondition (5C-2).** One role must own the sessions, nonce and provider-fence relations and run the
  commit, with bypass rights, checked at precheck, reapply, postcheck and runtime, with no grants or prefix expansion.
- **Decision inputs (5C-3).** A closed decision-input contract now has a version literal, keys, types, bounds,
  canonical bytes and a digest rule.

No P0, P1 or P2 remains after verification. Twenty-six P3 items must be carried into the next records delta before
any guard, commit, validator or installer body is drafted; three of them change what owner scope is needed. A
compatible design grants no source, installation or execution authority, and no reserved decision is made here.
Lens output archived as `hl12/51_5c_correction_lens_findings.json`.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Method: full read of the packet, independent source checks,
two read-only lenses (epoch, liveness and census; definer and decision inputs) with adversarial verifiers. Nothing was
executed.

## 1. Identity

| Item | Value |
| --- | --- |
| Packet | `docs/coordination/launch-coordination-20261005/DOC49_5C_CORRECTION_20261008.md` at coordinator `462cf796f662770cf2bbb317bcd6d08d827bcf68` (local, unpushed; remote coordinator tip `9d13a6f`), 152 lines, sha256-lf `3e61866d…`; named in the handoff at `33415f6` |
| Corrects | `RECOVERY_5C_RESOLUTION_20261007.md` at `f1821b6`, dispositioned in doc 49 (`d9809c1`) section 3 |
| Source checked against | application `3e82154`; currentness candidate at `f581b6b` (doc 50) |

## 2. Disposition by correction

| Correction | Disposition | Basis |
| --- | --- | --- |
| 5C-1 epoch scope and liveness | **Resolved in structure; P3 carry-forwards** | Lot quantity, `version` and `updated_at` excluded (the release, expiry and movement updates change only those); allocatability, lot insert and scope changes still invalidate; members and partners narrowed to reader columns; grants OUT with no Quick Order reader; binding and transfer inserts keep advancing; shipping, media and launch-control readers named. Rates and the refusal budget are honestly UNKNOWN and reserved to Samuel, which is NOT PROVEN, not a design defect. |
| 5C-2 single-owner definer | **Resolved; P3 carry-forwards** | Same role for the sessions, nonce and provider-fence owners and the commit owner, with `rolsuper` or `rolbypassrls`; effective privileges including UPDATE for share locks; refusal at precheck, reapply, postcheck and runtime; no grants, no role or RLS repair, no `research_private_early_access_` prefix; hosted ownership NOT PROVEN. |
| 5C-3 decision-input contract | **Resolved; P3 carry-forwards** | `schemaVersion` literal, closed key list with types, bounds and nullability, exact canonical bytes (key order, no whitespace, BOM or trailing newline, NFC, escaping, integer form, byte-order sorting, re-encode equality, never `jsonb::text`), and exactly one `normalized_decision_inputs` artifact whose digest is SHA-256 of the stored text with no circular bundle digest; Samuel's values fill keys; the browser chooses nothing. |

## 3. Carry-forward list (all P3, verified; required before any body is drafted)

**Epoch, liveness and census.**

1. Legal bindings: the reader matches `customer_ref` or any `alias_refs` entry and refuses an ambiguous match
   (`20260809130000…:280-298`). Another binding that aliases the actor's handle is therefore an absence input, and an
   exact row lock cannot block its insert. The remaining window after the intake's final re-read is serializable with
   the intake first, which is why this is P3 rather than P2. The fix: keep legal-binding INSERT with
   `cardinality(alias_refs) > 0` advancing the epoch (verification-rate, append-only), consistent with doc 49's rule
   for absence inputs.
2. Founder checkouts: admin-attested bindings read `research_early_access_cart_checkouts` through the checkout lookup
   (`supabase-legal-binding-directory.ts:221-225`, `:320-347`); lock that row exactly, projected on
   `record->>'customerRef'`, or state that the commit refuses admin-attested bindings. State that visibility and
   destination derive only from the published offer rules, since the Quick Order visibility callback is required and
   has no censused source (`quick-order/catalog.ts:42-44`, `:134-139`).
3. Label every relation IN or OUT of the epoch, and reconcile the links and transfers text with their table rows.
4. **Changes owner scope.** State that a statement whose protected columns are unchanged neither advances the epoch
   nor takes the head. Under the narrowed lot projection, reserve, release, expiry and inventory movement then never take the head.
   The head-inversion rationale for the inventory writer replacements disappears. What remains is ordering against
   the intake's lot share locks (FEFO `for update of l` versus UUID order) plus the pre-existing writer-versus-writer
   inversion. Re-derive the replacements from that; the requested owner scope may shrink. Also decide whether
   the commit compares the exact-unit inventory source version, which would refuse on any movement of the same variant.
5. **Changes owner scope.** At `3e82154`, Quick Order attribution is self-declared only. The receipt and companion are
   fixed to `direct_no_referrer` or `captured_unmatched` with commission `not_authorized`, and no Referral V1 resolver
   is composed into Quick Order production. Name the field a held commit's referral reader would populate, with
   its owner scope and Samuel's reserved commission and attribution policy. Otherwise put the referral family OUT,
   which removes the largest remaining global refusal source (binding inserts on every account).
6. Define the inventory predicate (any allocatable stock, or the requested quantity, which is reserved quantity
   policy) and size the lot lock set to it; one locked allocatable witness lot suffices for an existence predicate,
   whereas locking the complete SKU set makes every same-SKU reserve, release, expiry or movement queue behind each
   intake.
7. List the refusal sources that remain after narrowing (product-control rows, lot disposition and quality, lot
   inserts, binding and transfer inserts, link issue and revoke, shipping and launch changes), each with rate UNKNOWN,
   and name the Samuel decision that owns the budget; restore the "writer-versus-writer while the head is held, with
   no intake" measurement to the future-evidence list.
8. Carry doc 49's P3 items: the writer table with a unique-index column; the classification of the child advisory lock
   in `research_apply_inventory_movement` (`:720`), moot if quantity-only statements take no head, and of `bind`'s touch
   read before its events insert (`:873-881`); reserve's "drop non-qualifying candidates, refuse only when insufficient"
   semantics.
9. Define the canonical bytes, comparator and owner of `readerCensusSha256`.
10. Correct anchor drift: the release update is `20260727160000…:924-930`; the latest-transfer ordering is `:591`;
    the cited `:865` refusal is `:867`; label the legacy binding decoders as generation-preservation scope, not Quick
    Order readers.

**Definer and installation.**

11. Add the authority head, authority revisions and intake companion owners to the same-OID precondition (the
    currentness integrity function requires `current_user` to own the head, and its ACL check refuses any other
    grantee), checked at precheck, postcheck and the commit's runtime integrity.
12. Add EXECUTE on the existing functions the commit calls to the precondition: `research_early_access_agreements_accepted`
    is executable only by `service_role`, the referral helpers only by their owner, `session_active` only by its owner
    and `service_role`; since grants are forbidden, the commit owner must own them or be a superuser, and the precheck
    must check `has_function_privilege` for an enumerated call list; enumerate the touched relations too.
13. Require, not prefer, the compensating controls: fully qualified names; one pinned `proconfig` (recommend
    `search_path=''`, matching the Quick Order family; `pg_temp` is otherwise searched first for relations); no
    dynamic SQL; EXECUTE revoked from PUBLIC, `anon` and `authenticated` and granted only as approved; all pinned in
    the commit's own fingerprint; state that the body is the only row-access barrier on every touched relation.
14. **Changes owner scope.** The accepted intake candidate refuses whenever `research_health_quick_order_commit` exists
    (`intake.sql:355-358`; intake precheck and postcheck `:131`), outside its hashed definition, so installing a
    commit requires amending the receipt-bound intake family. That is a new owner-scope item, not in doc 49's list.
    Give the commit its own candidate gate, reusing the intake gate predicate (`:341-345`, not `:340`), the sessions
    `:683` predicate and the full same-OID set.
15. Name the excluded helper prefixes (`intake_`, `currentness_`, `authority_`, replay, admin detail, publish, revoke,
    read-current, `guard_source_write`) so a commit helper cannot collide with an existing fingerprint namespace.

**Decision-input contract.**

16. Require exactly one envelope artifact per kind for all six kinds (the envelope still allows 6 to 32 artifacts and
    repeated kinds), or state that any unreferenced artifact of a referenced kind refuses.
17. Name the validator, column and signature: for example
    `research_health_quick_order_currentness_valid_decision_inputs(text, jsonb)` inside the currentness fingerprint
    namespace, a text column on revisions with a CHECK calling it (owner INSERT is otherwise constrained only by the
    publication CHECK), and `publish_revision(jsonb, text)` conflicting on any byte difference. Reconcile with the
    prior proposal's "no standalone helper" sentence: a CHECK-called validator like `currentness_valid_publication` is
    the validator doc 49 anticipated.
18. Decide the undecidable validator rules: "controls" (recommend Unicode Cc plus Cf) and "whitespace" (Unicode
    White_Space), assigned code points only; whether an `unbound:` prefix refuses; minimum count, distinctness and
    sort for `workflowModes`, `price.audiences` and every set array (list them); what `configurationVersion` must
    equal; the pairing of `request_pricing` with unpriced lines; and that admitted quantity satisfies both the offer
    rule and the catalog minimum, maximum and increment.
19. Say which audience the commit compares: viewers are `member` or `admin`, Early Access viewers are priced as
    `member`, and `price.audiences` uses the five customer price audiences, so `private_early_access` never arises
    from this path and `admin` cannot be expressed.
20. Fix the shape so it does not decide reserved policy. `healthAgreement` is a single object, which fixes the
    cardinality of Samuel's legal decision; the current reader takes arrays (`legal.ts:14`, `:20-26`; `core.mjs`
    accepts 1 to 30 distinct agreements). Make it a 1..N distinct sorted array, or state that more than one needs a
    new `schemaVersion`. Likewise, label the per-offer US shipping-state destination key as shipping-destination
    eligibility only (`catalog.ts:45-49` says shipping region is not serviceability or encounter location).
21. Define the commit against which artifact paths resolve. The decision text embeds `sourceCommit`, so the
    decision-input file cannot live at that commit. State that the configuration artifact excludes the revision,
    bundle and decision-input digests, so the publication can be constructed without a cycle.
22. Spell out the recipient admission predicate as one shared regex: RFC 5322 dot-atom local part of at most 64,
    LDH labels of 1 to 63, at least two labels, no case folding. It must be a strict subset of the companion CHECK, so
    that no admitted value fails at insert.
23. Carry doc 49's two budget consequences: an intake refuses whenever a guarded writer holds the head mid-transaction,
    and writers queue behind an intake's share lock for its full hold unless they get their own `lock_timeout`; add
    a writer-side `lock_timeout` policy item reserved for Samuel.
24. Correct the anchors: the intake gate is `:341-345`; the envelope kind-presence check is `:118-120` at `f581b6b`.

## 4. What this disposition does and does not unlock

- **Does not unlock** the writer-guard function and trigger set, the commit body, any writer replacement, the session
  seam, the protected `server/index.ts` wiring, or any installation or execution.
- **Becomes eligible for the same builder once items 16 to 21 are recorded:** the decision-input column, its validator
  and the publish signature change, on the five currentness files under the existing lease and the approved scope
  (`1d4f2c3:139-140` names "normalized decision inputs" as revision content). Item 20 needs only the shape choice;
  Samuel's values fill it later. I recommend the 1..N array.
- **Owner scope still required:** the inventory writer replacements, possibly smaller after item 4. The referral
  `privacy_begin` replacement, or its removal from scope if item 5 puts the referral family OUT. The Health
  configuration paths. The `express.ts` session seam and its new test. The `server/index.ts` wiring, which is a
  protected-change review under GATE-01. The amendment of the accepted intake family (item 14, new). The commit
  candidate.
- **Reserved to Samuel:** the Health legal agreements and their cardinality, offer, quantity, audience and destination
  policy, commission and attribution policy for Quick Order, the revocation ordering, the refusal budget and the
  writer-side lock policy.
- **Next in the review queue:** the qualification supervisor and manifest at the builder's `90f4ebd`, once handed over
  with its exact identity.
