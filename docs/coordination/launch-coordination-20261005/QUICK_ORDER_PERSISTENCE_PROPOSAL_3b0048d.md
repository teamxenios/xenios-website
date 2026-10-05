# Narrow canonical persistence proposal (source permission pending)

The current `research_assisted_order_submit` atomically writes request, lines,
event and access token. It cannot satisfy this new intake: idempotency is based
on email/key, the input hash omits declarations, lookup follows current catalog
resolution, structured declarations are absent, and no database currentness
guard covers the catalog/legal/destination authorities. A second RPC called
after submit would leave partial requests. Calling the legacy RPC directly or
writing declarations into notes is not an acceptable workaround.

## Exact proposed candidate paths

- `supabase/candidates/20261005_research_assisted_order_quick_order_intake.sql`
- `supabase/candidates/20261005_research_assisted_order_quick_order_intake.precheck.sql`
- `supabase/candidates/20261005_research_assisted_order_quick_order_intake.postcheck.sql`
- `supabase/candidates/20261005_research_assisted_order_quick_order_intake.rollback.md`
- `supabase/verification/research_assisted_order_quick_order_local.mjs`
- New extension modules `server/research/assisted-order/quick-order-repository.ts`,
  `quick-order-service.ts`, `quick-order-authority.ts`, and their adjacent
  same-basename `.test.ts` files
- New operator projection `shared/research/assisted-order/quick-order.ts`
- Existing reader/mount additions, separately leased: `server/research/assisted-order/ports.ts`,
  `supabase-repository.ts`, `service.ts`, `http.ts`, shared `contract.ts`, and
  `client/src/research/assisted-order/AdminAssistedOrderDetail.tsx`.

No candidate or existing target above has been edited. Starting hashes for
existing paths are in `evidence/proposal-baselines.json`. New candidates have no
predecessor bytes. This is a source-only permission request; no migration DAG,
MIGRATIONS.md, managed history or hosted data change is proposed. D/E approval
does not cover it. SQL predecessors remain immutable.

## Transaction contract

Add an append-only companion to the existing canonical request, unique by its
foreign-key request ID and by server-derived actor scope/key hash. Persist full
normalized input hash, schema version, source category/detail/code, affiliation
category/detail, customer confirmation and server time. Retain optional declared
code 1..64 as evidence even when it is outside the legacy trusted-code 2..40
vocabulary; never truncate or promote it into trusted attribution. Trusted
attribution continues through the existing resolver and remains a separate fact.

The service-only replay reader checks actor/key, returns the original safe receipt
and normalized payload hash, and exposes no tokens or trusted attribution IDs.
It works after catalog/price/legal changes because it creates no new request.

The new commit locks actor/key first. Existing exact input replays; changed input
conflicts. For new input, guard canonical actor/standing, current approved legal
pairs and copy hashes, identity/binding, Health classification, quantity bands,
price identity/version/effectivity, destination policy and every non-image hold.
Then write canonical request/lines/event, declaration companion, idempotency
receipt and approved reference-only notification obligation in one transaction.
Reuse the existing ledger/outbox; no new order/payment/commission authority.

Some current catalog and legal authorities are file/config based. A caller's
hash is not evidence of currentness inside SQL. The implementation must define
a governed durable revision authority and coordinate its writers, or refuse
commit. That authority source/design must be independently reviewed before it
is mounted; no default-true callback or application re-read closes this race.

The authorized operator reader joins declarations by canonical request ID after
the current `read_all` guard. Receipt production requires successful canonical
readback, with complete lines/workflows/pending-price state and declaration
readback. No public metadata endpoint, partner access, commission or payment fact.

## Required proof and constraints

Proposed object names for source review (none authored or asserted present):
`public.research_assisted_order_quick_order_intakes` (request-ID primary/foreign
key plus actor/key unique evidence companion),
`public.research_assisted_order_quick_order_replay(text,text)`,
`public.research_assisted_order_quick_order_commit(jsonb)`, and
`public.research_assisted_order_quick_order_admin_detail(uuid)`. The last reader
is service-only and callable only behind the existing server `read_all` guard.
The three external RPCs receive EXECUTE only for `service_role`; all tables have
forced RLS and no direct PUBLIC/anon/authenticated/service_role grants. Internal
helpers have no external EXECUTE; security-definer functions use an explicit
safe search path and qualified objects. No new client policy grants.

Keep `research_assisted_order_submit(jsonb)` and the existing canonical tables
unchanged unless a later reviewed diff demonstrates a necessary compatibility
extension. Source predecessor anchors are
`20260815150000_research_assisted_order_bridge.sql` and
`20260820190000_research_assisted_order_declared_affiliate_code.sql`; these are
not a complete hosted schema census. Existing later assisted-order and outbox
guards must also remain intact. Precheck must measure function definitions,
constraints, triggers, RLS/ACLs, roles and extension state in the exact authorized
target, compare reviewed predecessor hashes, and refuse unknown drift. Candidate
names must be proven absent or exact approved bytes before creation; local
unregistered status does not establish hosted absence.

Use the existing `public.research_notification_outbox`, unique `event_key`,
existing retry dispatcher and an approved reference/internal-link-only template.
Do not use the legacy PII-rich assisted-order payload unchanged. Notification
rendering/dispatch changes are an additional exact existing-file diff to review
when the obligation contract is concrete; no new outbox table is proposed.

The durable authority-revision object's name, provenance, writer coordination
and revocation protocol are intentionally unresolved rather than invented. It
must be designed against the actual master catalog, bindings, legal and policy
writers before the commit candidate can pass review. This dependency prevents
presenting the proposed commit signature as a functioning transaction today.

Pre/postchecks verify exact predecessor schema/grants, forced RLS, service-only
RPCs, revoked PUBLIC/anon/authenticated execution, inaccessible internal helpers,
bounded closed shapes and no duplicate/orphan data. Disposable proof must use
actual adapters/RPC/operator reader across two concurrent workers, restart,
response loss, changed input, cross-actor denial, rollback and authority changes
while blocked on transaction locks. Notification transport failure must preserve
the durable request and one obligation. No real external transport.

Source drafting can proceed after its exact permission/lease. Local database
execution additionally needs a fresh host/slot check. Managed nonproduction
qualification, real intake and production deployment remain separately held.

Permission to draft these new modules/candidates is not approval of their final
SQL design or a blanket grant to mutate existing shared paths. The existing
reader/service paths listed above are dependency disclosures with measured
baselines; their concrete diffs must be presented before the protected/shared
slice is applied. The current production adapter cannot be enabled by a flag.
