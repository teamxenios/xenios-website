# Submission packet, disposition D: native qualification proposal (`SNAPSHOT-S-CENSUS-PACKET-REVIEW-20261009` r1)

**SOURCE DECISION: INSUFFICIENT AS PACKAGED; sufficient for a conditional bounded source decision once four
conditions are written in. EXECUTION DECISION: INSUFFICIENT.**

The specialist's proposal is careful where it matters most. It states today's enforced limits correctly:
- an outer Job of the stage count minus one;
- an inner Job of the count minus two;
- G0 rows asserted at exactly three.

It counts compilation as its own phase and keeps it held until measured. It refuses to let 3/4/8 absorb compiler
processes. It keeps doc 68's corrected timing sentence word for word, and it labels the native bridge as proposed.

But as packaged it cannot support a defensible grant. Four things are missing:
- **One path set.** The packet and the proposal disagree on what would be granted.
- **A toolchain check first.** Whether the bridge can be built at all is checked only after the grant.
- **The interface.** The bridge's interface, and the new clock anchor it would force, are undefined.
- **A tracer for the first build.** Nothing specifies how the first build is traced without the existing compiled
  tracer.

No step has an executable vehicle yet. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task acknowledged at `b39905f`.

Method: two read-only lenses, each with an adversarial verifier:
- process and compile accounting;
- proofs, admission and sequencing.

The verifiers upheld most findings, downgraded three and added eight. One lens ran a read-only command that printed
the packet JSON's top-level keys, and a no-op; nothing in the repository was executed. Artifacts: the proposal
(`.md` `c10fdf85…`, `.json` `c87f29df…`, coordinator `2bac0c8`), its result record, and the packet's qualification
material (`d007162`); the supervisor at `25858ad` was read for the current limits. Lens output archived as
`hl12/72_packet_D_native_lens_findings.json`.

## 1. Process and compile accounting (verified)

**Correct:** the seven phases, today's limits, compilation held, and no numeric limit raised.

**P2 gaps:**
- **D-1. Console hosts are uncounted.** The current creation flags can produce console host processes, and no phase
  counts them. The proposed suspended-launch design would put a helper console host inside the outer Job. At a count
  of three, that fills the outer limit.
- **D-2. A separate compile limit is a hidden raise.** Today compilation is bounded by the outer limit, count minus
  one. That is 2 for a three-process step: the helper plus one compiler process. The compiler commonly starts a second
  process, so the proposed separate compile limit would almost certainly need to exceed 2. That raises G0's total
  during compilation, and the proposal never says so. Any compile limit above count minus one is a separate,
  explicit stage-count decision for you.
- **D-3. The bridge does not remove per-command compilation.** Each of G0's seven helper-launching commands still
  compiles cold, inside a 5-second command wall (15 seconds for the Vitest step). The proposal measures one compile,
  and compile time is not budgeted within each command's wall.
- **D-4. The packet and the proposal ask for different scopes.** The packet asks for 2 existing paths plus 4 new ones,
  including a build script. The proposal asks for 2 plus 1.

**P3:**
- **Bridge binary pinning.** It is checked once, its dependent DLLs are not pinned, and reuse across runs is
  undefined.
- **Build process lists are incomplete.** They omit compiler servers that can outlive the build.
- **The active-count checks have no owner.** No one is named to run them once the helper holds no outer handle.
- **Ambient Job membership is unrecorded.** Whether the controller already runs inside a Job is not recorded.

## 2. Sufficiency and sequencing (verified)

**P1, for any decision based on this proposal:**
- **D-5. The feasibility check comes after the grant.** The three-path source grant is requested before the read-only
  toolchain inventory that decides whether the native source can be built at all. Installation is prohibited, so with
  no usable compiler the bridge, and every proof that depends on it, is unreachable.
- **D-6. The admission route is still a generic "proof needed".** The 428 and 367 ms responder question from doc 68
  has incomplete predicate coverage. Its observability may be infeasible by the proposal's own admission, for example
  for Docker or virtual machines and for Chromium, and it has no latency pass criterion. The heavy-job rule also
  refuses any non-owned Node process. On a host running other agent tooling, every in-process observation may refuse,
  and the source of the exclusion identities is unstated.

**P2:**
- **D-7. The bridge's interface is undefined.** That covers its exports, async model, barrier protocol with the helper,
  and error-to-refusal mapping.
- **D-8. Moving launch into the bridge removes the clock anchor.** The Node `spawn` event anchors doc 68's accepted
  clock boundary, its start-failure classification and the helper output capture. The proposal re-anchors none of
  them.
- **D-9. The handle allowlist cannot cover the compiler.** The compiler is launched by Add-Type, not by
  helper-authored process creation, yet the proposal promises no Job handles reach the compiler.
- **D-10. Follow-on edits each need their own review.** Toolchain pins, build and compiler ceilings, memory values,
  the campaign action table and the accepted binary hash all need later manifest edits, each a new source identity.
  The grant does not say whether it covers them.
- **D-11. The proof vehicles are incomplete.** The interruption, handle and memory-detection proofs lack their
  executable elements. Controller death is not inventoried, and the memory fixture and its evidence channel are
  undefined.
- **D-12. The compile measurement has no ceiling.** Measuring the cold compile needs a pre-approved compiler-phase
  ceiling, and no value or rule is proposed.
- **D-13. The first build has no tracer.** Without the bridge, the only launcher and tracer is the class Add-Type
  compiles. So the build either includes a cold compile or needs a new Reflection.Emit-only tracer that is not
  specified.

**P3:**
- **D-14. Too much under one grant.** One campaign grant covers several distinct actions, and database qualification
  is not addressed.
- **D-15. Doc 68's fixes are tied to the native route.** Folding the two-file doc 68 amendment into the native
  three-path grant ties those fixes to unresolved feasibility.
- **D-16. The stage-count change is missing.** The include list carries doc 68's D68-1, 2, 4 and 5, but not the U-15
  stage-count change. A successor could therefore still refuse the 4 and 8 rows.
- **D-17. Binary-to-source correspondence rests on one receipt.** It rests on a single build receipt, with no rebuild
  comparison.

## 3. What would make it decision-ready

**For a conditional, bounded source decision,** write these four conditions into the decision:
1. One superseding record names exactly one path set and argument grammar.
2. A read-only toolchain inventory exists. Alternatively, the grant is expressly conditional on it, and the route is
   recorded as blocked if no compiler is available without installation.
3. An interface annex covers the exports, async model, barrier protocol, error mapping and the new wall anchor.
4. The first build's tracer and its compiler-phase accounting are stated, with console hosts counted.

Also: any compiler-phase limit above count minus one is listed as a separate stage-count decision for you, and the
U-15 change is included.

**For an execution decision,** each action (build, campaign, compile measurement, admission measurement, G0) needs its
own concrete vehicle: arguments, frozen inputs, caps, receipt schema, success, refusal and not-reached criteria,
cleanup evidence, and its own authority. The admission route also needs a latency criterion and a defined observer
authority.

**Recommendation.** Keep doc 68's decision-ready two-file amendment (U-15 and D68-1, 2, 4 and 5) separate from the
native route. It can proceed on your G0 decisions without waiting for native feasibility.

## 4. Disposition

- **SOURCE DECISION: INSUFFICIENT AS PACKAGED.** It becomes sufficient for a conditional bounded source decision with
  the four conditions above.
- **EXECUTION DECISION: INSUFFICIENT.**
- **What it enables under existing authority:** the coordinator can reconcile the path set in its records. A toolchain inventory
  inspects the host, so whether it needs its own observation authority is your decision. No source or execution is
  authorised.
