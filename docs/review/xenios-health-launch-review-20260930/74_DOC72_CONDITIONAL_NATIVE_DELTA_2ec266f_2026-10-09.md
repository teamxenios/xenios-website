# Conditional native source proposal delta (coordinator `2ec266f`): review against doc 72

**CONDITIONAL SOURCE DECISION: SUFFICIENT once the decision text adds the items in section 2. EXECUTION DECISION:
INSUFFICIENT; eligibility none.**

All four doc 72 conditions are now supplied as proposal text:
1. **One path set.** It names exactly three paths, `qualification-supervisor.mjs`, the manifest and a new
   `native/qualification-win32.cc`, superseding both earlier scopes.
2. **A gated grant.** The grant becomes effective only after a separately authorised read-only toolchain inventory.
   It is recorded as blocked if no compiler exists without installation, and no host check was done.
3. **An interface annex.** It covers the exports, async model, error mapping, stdio, and a native launch clock anchor
   that preserves doc 68's U-01 semantics: the wall starts once, earlier than the Node spawn event, and is never reset.
4. **A tracer for the first build.** It uses Reflection.Emit only, with no Add-Type, and its gaps are disclosed.

A compile limit above count minus one is now a separate decision for you. The U-15 stage-count change is included,
no measured fit is claimed, and the two-file supervisor lane, the old qualification chain and the database stay
separate. No P0 or P1. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC72-CONDITIONAL-NATIVE-PROPOSAL-DELTA-REVIEW-20261009` r1,
acknowledged at `e82a436`.

Method: two read-only lenses, each with an adversarial verifier: the conditions, interface and accounting; admission,
vehicles and separation. Every lens finding was upheld, and the verifiers added eight. One lens wrote a copy of
Git-object bytes into this reviewer's own scratch folder, not into any repository or worktree. Artifacts:
`DOC72_CONDITIONAL_NATIVE_SOURCE_PROPOSAL_20261009.md` (`bc766b92…`) and `.json` (`30b34b8e…`) at `2ec266f`, read
against the supervisor at `25858ad`. Lens output archived as `hl12/74_doc72_native_delta_lens_findings.json`.

## 1. What closed

| Doc 72 item | State |
| --- | --- |
| D-4, one path set | Closed |
| D-5, feasibility before the grant takes effect | Closed for the compiler, with a read-only inventory gate and a blocked outcome |
| D-7, the interface | Exports, async model, errors and stdio closed. The barrier acknowledgements and message schema are implicit (N-6) |
| D-8, the clock anchor | Closed for bridge launches, where the native creation is captured before assignment and resume. Its scope across groups and entry grammars is open (N-1) |
| D-2, compile limit above count minus one | Closed: listed as a separate decision for you |
| D-9, the compiler handle edge | Partly closed (N-7) |
| D-13, the first-build tracer | Closed, but it depends on a kernel trace provider whose access is ungated (N-3) |
| D-16, U-15 included | Closed |

## 2. Items to add to the decision text (P2, verified)

- **N-1. Two ways into G0.** G0 keeps two entry grammars: the existing qualification flags, and a new native action.
  Which launches use the native clock anchor is undefined. Name one G0 entry and the anchor per group and launch
  vehicle. I re-review U-01 under the native anchor before it is relied on.
- **N-2. A missing console host.** Console hosts are counted, but the consequence at a count of three is not drawn:
  the cold build's own containment rule would refuse the helper's console host. State it beside the U-15 and
  compile-limit decisions.
- **N-3. A second feasibility gap.** The first-build tracer relies on a host-wide kernel trace provider whose access
  without elevation sits outside the inventory gate. That repeats D-5's ordering problem. Its lifetime is also missing
  from the observer-death and cleanup accounting. Put provider access, the Add-Type compiler's identity, a read-only
  definition of "usable", and a named acceptor of the inventory result inside the pre-effective gate.
- **N-4. No acceptance step before G0.** The native chain has no point where I accept a native-action receipt. Native
  proofs could therefore feed G0 in one run with no review. Add an acceptance step before G0 may rely on native
  evidence.
- **N-5. The admission observer is undefined.** Its authority record, issuance and verification are not stated.
  Making the supervisor its own sampler reverses the manifest's separate-responder, no-probe design, which needs to
  be named as your decision.
- **N-6. A shared host blocks admission.** On a host shared with other agents, admission likely refuses every time,
  because exclusions cover only OS and Codex processes. State a quiescence precondition and the exclusion source and
  refresh rule.
- **N-7. Missing observation records.** Every native action, the first build included, needs admission,
  policy-observation and pre-window-observation records, and nothing is named to produce them before the bridge
  exists.

**P3, may travel as conditions:**
- **Compile budget.** No rule budgets compile time inside each 5- or 15-second command wall.
- **Lane order.** The native lane pins baseline bytes of the two files that the two-file supervisor amendment will
  change. Add a rebase clause, and do that amendment first.
- **The barrier protocol.** Acknowledgements, per-step timeouts and the message schema are implicit.
- **Inherited handles.** The protocol handles stay inheritable in the helper. The direction of handle duplication is
  unstated, and the helper-to-subject handle list is no longer normative.
- **Records and grammar.** Retired argument forms are listed incompletely, and ambient Job membership is not
  recorded for the cold build.
- **Admission details.** G7's no-open-handles field is missing from the admission predicate, and the worst-case retry
  slice is not derived.
- **Interruption and handle proofs.** No rule covers a barrier never reached after launch, the compile interruption
  does not assert a live compiler, and the handle census is undefined.
- **Build determinism.** Raw build equality across roots has no deterministic flags.
- **Threading.** The Reflection.Emit tracer's threading model is unspecified.
- **Prepared snapshot.** The compile-series and fit vehicles need a prepared snapshot that only the qualification
  window produces.
- **Held reservations.** No recovery vehicle exists for a held reservation.

## 3. Disposition

- **CONDITIONAL SOURCE DECISION: SUFFICIENT** once N-1 to N-7 are written into the decision text, with the P3 items
  carried as conditions. That is a judgement on the proposal's completeness, not an approval. The grant would still
  take effect only after a separately authorised inventory.
- **EXECUTION DECISION: INSUFFICIENT; eligibility none.** No action has an executable vehicle. Every argv, inventory,
  cap, provider binding, authority and sample count is null. The observation inputs have no producer. No toolchain
  inventory exists or is authorised.
- **Order:** the two-file supervisor amendment (your two G0 decisions) comes first, and the native lane rebases onto it.

## 4. Disclosure correction (2026-10-09, published with doc 73)

The method paragraph above undercounts this review's rule deviations. The archive recorded each one verbatim. The full
list is below.

**Copies in this reviewer's scratch folder.**
- Both lenses, not one, wrote a `git show` copy of `qualification-manifest-20261008.json` at `25858ad` there.
- The copies are `n1_manifest_25858ad.json` and `n2_manifest_25858ad.json`, each raw `15f4ad97…`, 1,501,610 bytes.

**JSON parses.**
- Lens N1 ran one python parse of the hl12 JSON, which failed on encoding.
- Lens N2 ran two `python -I` one-liners over JSON data.
- One verifier ran one `python -I` that printed the archive's top-level keys.

**A third copy outside the scratch folder.**
- One verifier's shell redirect wrote a third identical copy at `C:\Users\sboad\AppData\Local\nul_unused`.
- I confirmed it is byte-identical to the Git blob.
- It is in no repository or worktree. I have not deleted it; it is left for Samuel to remove.

No repository was written, and no repository code was executed, imported or compiled. The findings and the
disposition are unchanged.
