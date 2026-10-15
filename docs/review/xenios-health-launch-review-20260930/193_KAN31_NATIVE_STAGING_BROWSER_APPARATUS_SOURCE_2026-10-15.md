# KAN-31 native-staging browser apparatus: source review

**CHANGES REQUIRED: one material finding, in the finalizer's postcheck binding.** Everything else in the apparatus
conforms, with the non-blocking notes in section 4.

- **Not reviewed.** `e33`, cloud-66, I3, Q1 and Doc 192 are not reopened.
- **What this is not.** Not an application, execution, materialization or credential authority.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. No parser, import, type check, test, build, browser, provider, SQL or env action; no agents.
- **Packet.** Delivered in chat.
- **Timing.** Reviewed at 2026-10-15T21:15–21:27Z.
- **Jira.** Root relays this.

Archive: `hl12/193_kan31_native_staging_browser_apparatus_source.json`.

## 1. Identity

- **Commit.** Core `674f4ade` (tree `33f4061c`, parent `883012f9`, local only). Against the parent, 16 paths changed.
- **Primary files.**
  - `COMPLETE_UNAPPLIED_SOURCE_REVIEW_PACKET.md`, 13,728 B, `4e8724d7…`;
  - `IDENTITY_MANIFEST.json`, `5d4d6dba…`;
  - `FULL_BEFORE_AFTER_REVERSIBLE_RULES.json`, `168cfa8c…`.
- **Manifest.** All 20 artifacts match their hashes. Three historical fragments are superseded, as declared.
- **Copied programs.** The before-image of each of the seven copied programs equals the previously accepted committed
  bytes:

| Program | Before | After |
|---|---|---|
| `harness.UNAPPLIED.ts` | `e53e1e19` | `bb2019e3` |
| `run-durable-browser.UNAPPLIED.cjs` | `6b554df8` | `c1a909d6` |
| `bind-and-run-durable-browser.UNAPPLIED.cjs` | `e6fba6cd` | `94a02e3f` |
| `prepare-input-pins.UNAPPLIED.cjs` | `02988485` | `e0c2d7b9` |
| `invoke-browser-capacity.UNAPPLIED.ps1` | `947bba10` | `5ae7e36a` |
| `invoke-browser-g0-and-run.UNAPPLIED.ps1` | `fe30b36c` | `3ede090e` |
| `ql-browser-driver.UNAPPLIED.mjs` | `54b313fb` | `d98dab35` |

- **How the rules work.** They are whole-file replacements, so I read the full after-images and diffs rather than
  relying on the rules.
- **Doc399 template.** Unchanged: 5,782 B, `d5814a37…`.

## 2. Material finding: the finalizer does not bind the postcheck query or approval

- **Where.** `finalize-managed-evidence.UNAPPLIED.mjs`, lines 19–25 and 43–44.
- **What the packet claims.** The finalizer "consumes … the actual approved postcheck record".
- **What the code does.**
  - It takes `a.actualPostcheck.{attempts, completeExpectedTimelyResult, approvedScopeMatched, ticketConsumed}`,
    `a.originalTemplateSha256` and `a.projectId` as inline, self-declared admission fields.
  - It pins no approval, admission or ticket record.
  - It never checks the executed postcheck's tool arguments (project and query text).
  - It calls `verifyManagedReadback(…, () => true)`, which turns the driver's independent-readback gate into a no-op.
- **What is still sound.** The native row is bound to the exact `BOUND_FIXTURES` bytes, because Doc399 hashes the raw
  document inside SQL and the verifier checks `bindings_sha256`. Per-case content and cardinality come from the
  database.
- **The gap.** Nothing proves that row came from the approved Doc399 template, rendered with exactly those bindings,
  against `tetynodzrtmdbuzgboro`. A differently produced result with the right fields would still be finalized as
  `PASS_BOUNDED_MANAGED_CUSTOMER_JOURNEY`.

### Minimal correction, source only

In the finalizer, read by pin:
1. the exact executed tool arguments (`project_id` and `query` bytes), as retained by the executor;
2. Root's postcheck admission and approval record.

Then demand all of the following:
- `project_id === 'tetynodzrtmdbuzgboro'`;
- `query` is byte-equal to the pinned template `d5814a37…` with its two placeholders rendered from `bindingRaw`: the
  hex value once and `sha256(bindingRaw)` twice;
- the admission record names that same query hash, ticket and single consumption.

Replace `() => true` with this validator, or remove the hook.

**Proving check, offline only.** The finalizer must refuse when the native result pin is paired with a query differing
by one byte from the rendered template, with a different `project_id`, or with an admission record whose query hash
differs. This needs no SQL or provider call. Only the finalizer, plus its pins in the launcher and supervisor
`FIXED`, change.

## 3. Verified conformity (source only)

- **Entry and capacity.**
  - The G0 entry binds the grant, the launcher and capacity pins, and the receipt for the new guard's own offline
    companion: 28 passed, 0 provider calls, guard `4a8fd720`, companion `88cabcac`.
  - The capacity call site now requires all three readings ≥ 2,048 MiB. The R7 bodies are unchanged; only the floor and
    labels move.
  - The input-pins producer rebinds constants only.
- **Launcher.**
  - PGlite pins are removed, and the adapter, egress and fixture-bindings modules are pinned.
  - The grant must name a verified secure-mechanism reference.
  - Listed input names are read and then deleted from `process.env`, and passed only to the spawned supervisor. That
    step stays blocked until a real binding is granted (Doc 403).
  - The client inventory keeps its `84178ce1` attribution.
- **Supervisor.**
  - One customer phase, with an inner free-memory floor of 2,048 MiB.
  - Exact runtime binding of the policy hash, source, tree, expiry and nonce.
  - Control actions are limited to `bind_expected`, `arm_mixed_response_loss`, `observations` and `close`.
  - `BOUND_FIXTURES.json` is written once from the terminal observation and hash-bound into the receipt.
  - The best status is `HTTP_UI_CLEANUP_COMPLETE_PENDING_INDEPENDENT_DB`, never PASS.
- **Harness.**
  - Admission, Node and harness pins are checked, and all source, dependency and extension pins are hashed at start
    and at finish.
  - The 14 native entry imports are pinned. Client assets are served from immutable snapshots.
  - The environment is reduced to OS variables plus whitelisted inputs, and the egress guard is installed before the
    adapter.
  - The listener is loopback-only, owned sockets are drained, and the receipt is write-once.
- **Egress guard.**
  - Only the staging origin, through listed RPC POSTs and the three product-table GETs.
  - Socket, TLS and DNS are allowed only for that host, under the approved fetch's async context.
  - `http`, `https`, `child_process` and `dns.resolve` are refused. The first refusal poisons the guard.
- **Adapter.**
  - An exact admission and policy hash; only listed inputs and required values.
  - Ceilings per RPC and table, the outbound and in-flight budget, a 4 MiB response cap, a 10 s per-call timeout and
    fixed table query shapes.
  - Durable persistence is enforced, with no memory fallback, and the native configuration and policy agreement are
    checked.
  - Loopback, origin and JSON are required for mutations; Authorization is refused.
  - Staff and Care throw, and direct commerce is prohibited.
  - The retail pricing projection is preserved and Care prices withheld natively.
  - Any RPC error is fatal.
  - All 18 native exports exist in `e33`. `registerRequestIntentApi` reads exactly the 8 wiring fields supplied, and the
    persistence and composition signatures match.
- **Pre-POST binding.** This holds against `e33`:
  - the attempt hash is plain `sha256(idempotencyKey)` (`defaults.ts`);
  - the client posts contact already normalized: the shared `validateAddress`, billing set to shipping, normalized
    typed values, and no `organizationName`;
  - agreements survive normalization unchanged;
  - the 13-field line projection, which maps `sourceSelection.variantId`, equals the service's line construction.
- **The three cases.**
  - One double-click POST.
  - A lost response, then an exact same-body, same-key, same-`acceptedAt` retry.
  - A lost response, then reload, PII-free storage and a marker-only `/recover`.
  - Three distinct IDs are required, and staff gets 503.
  - Legacy CUSTOMER, PATCH and admin paths are blocked before dispatch by `allowed()`.
- **Bindings to the postcheck.** `fixture-bindings` requires terminal, error-free RPCs with exactly 3 creates and 5
  finds, one native create per attempt, the receipt tied to the browser ID and reference, and the hash-bound pre-POST
  expectation. Doc399 compares jsonb exactly per case, along with the hashes and microsecond `created_at`.

## 4. Non-blocking notes

1. **Ceiling scope.** Ceilings and budgets apply only to traffic through the adapter's client. A client created inside
   a native module would still be path-restricted by the guard, but uncounted. A guard-side marker set by
   `guardedFetch`, with other fetches refused, would make the adapter the only network path.
2. **Possible spurious failure.** The control endpoint requires `inFlight === 0` at `bind_expected`. Background RPCs in
   flight at the intercepted POST would fail the run (closed). Consider waiting briefly for quiescence.
3. **Comment accuracy.** The adapter comment "never become process.env" is inaccurate in the composed run, because the
   harness places the whitelisted inputs into the child's `process.env`. Document this, or keep them out unless a
   pinned module needs them.
4. **Import closure.** Transitive imports are enforced by whole-inventory hashing at start and finish, not per import.
   There is a small time-of-check gap.
5. **Untested compatibility.** As the packet itself states: TLS, Undici and async-context compatibility, the
   `/api/research/me` and `assisted-orders/config` 404s against the `84178ce1` client, and syntax and type validity.
   The required offline checks and runtime remain the judges.

## 5. Still owed (unchanged)

- The finalizer correction above, and its re-review limited to the changed bytes.
- Syntax, type and offline guard checks, with the 28 expected assertions actually executed.
- Source7 custody, inventory and pins.
- A verified secure input mechanism and local launch custodian. Doc 403: not verified, not identified.
- Protected-copy, egress and config exceptions.
- A resource, exclusivity and window grant, with a fresh 2,048 MiB G0.
- Separate Doc399 query authority.
- An independent final-result review.

Q1 and I3 tickets are consumed. Staff, security, payment, phase A, the manifest and live verification stay OPEN. NOT
LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Core 674f4ade / tree 33f4061c (unapplied browser apparatus) on e33c12a9 | reviewer 6abf1edf (original Claude) | CHANGES REQUIRED: finalize-managed-evidence trusts inline actualPostcheck booleans, pins no postcheck admission/approval record, never checks executed query/project, and passes () => true as readback validator. Fix: pin executed tool args + Root postcheck admission; demand project tetynodzrtmdbuzgboro and query == Doc399 template d5814a37 rendered with BOUND_FIXTURES (hex once, SHA twice); replace () => true. Rest conforms (guards, pins, native composition, prePOST binding, 3 cases, Doc399 hash binding) with non-blocking notes | no execution authority | next owner: Core/Root | doc 193.`

Not application, execution, materialization, push, deployment or production consent; not human approval; not test
credit.
