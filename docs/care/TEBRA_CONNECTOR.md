# Care to Tebra connector

Tebra is the Care practice management, scheduling, and EHR system Xenios integrates
with. This connector extends the existing `server/care` architecture. It does not
create a second Care system, a second patient identity, or a second clinical record.

Nothing in this lane is mounted, activated, migrated, or deployed. The connector is
inert until an integration lane wires it deliberately.

## What already existed, and what this adds

The accepted base already carried the Care role and permission model, the Care
capability gate, appointments, intake, review, prescriptions, and a credential-late
Tebra scheduling seam at `server/care/tebra-scheduling.ts`. Those are reused, not
replaced. In particular:

- Authorization uses `requireCarePermission` from `server/care/access.ts`. No second
  authorization path exists.
- The stored Care capability gates every path, not only the routes. See below.
- The appointment status vocabulary is `CARE_APPOINTMENT_STATUSES` from
  `shared/care/appointments.ts`, not a parallel list. A hand-written enum here missed
  `checked_in`, which would have refused a real checked-in appointment as an invalid
  payload.
- The scheduling decision, including the concierge fallback, stays in
  `server/care/tebra-scheduling.ts`. That file is unchanged. The connector only
  supplies the transport it already asks for, through
  `server/care/tebra-scheduling-bridge.ts`.

New in this lane:

| File | Purpose |
| --- | --- |
| `shared/care/tebra.ts` | External id derivation, projection contracts, cursors, result and status types |
| `server/care/tebra-config.ts` | Fail-closed configuration and the secret-free status description |
| `server/care/tebra-capability.ts` | The stored Care capability check every path shares |
| `server/care/tebra-client.ts` | The practice client seam and its refusing default |
| `server/care/tebra-link-store.ts` | External id mappings, cursors, and the run lease |
| `server/care/tebra-redaction.ts` | The single chokepoint for codes, audit details, and error bodies |
| `server/care/tebra-retry.ts` | Bounded, deterministic retry for retryable failures only |
| `server/care/tebra-gateway.ts` | Idempotent patient and appointment synchronization |
| `server/care/tebra-sync.ts` | Incremental polling with cursors and leasing |
| `server/care/tebra-scheduler.ts` | The periodic driver, inert until started |
| `server/care/tebra-projection.ts` | Builds the outbound projection from a real Care appointment |
| `server/care/tebra-admin.ts` | Status and manual sync for a Care administrator |
| `server/care/tebra-routes.ts` | The two admin handlers, not registered |
| `server/care/tebra-scheduling-bridge.ts` | Fills the existing scheduling transport seam |
| `server/care/tebra-connector.ts` | Assembles all of the above in one call |
| `server/care/tebra-link-store-supabase.ts` | The durable gateway, once the migration is applied |

## Why exact SOAP operations are absent

Public Tebra guidance describes SOAP APIs for patient, appointment, charge, and
encounter data, and says that access requires account credentials plus an
account-specific customer key. It does not publish the operation set, the envelope
shapes, or the practice identifiers that a given account uses. Guessing them would put
an unverified assumption into Care domain code and into tests that would then look
like evidence.

So the connector states what it needs in Xenios terms and takes a
`TebraPracticeClient` by injection. The default `UnconfiguredTebraPracticeClient`
refuses every call. Writing the real client is the first task after the technical
guide and credentials arrive, and it is the only place a Tebra operation name appears.

## Why polling instead of webhooks

Public Tebra guidance does not describe patient-change webhooks. Changes are therefore
discovered by asking for records modified inside a window, on a cadence the
configuration holds between five and fifteen minutes. `parseTebraConfiguration`
refuses a value outside that range rather than clamping it, so a mistyped interval
fails loudly at boot instead of quietly polling at the wrong rate.

Each window reaches `CARE_TEBRA_CURSOR_OVERLAP_SECONDS` further back than the previous
one closed, because practice systems stamp last-modified at a coarse resolution and a
window that starts exactly where the last one ended can drop a boundary change.

## Two gates, not one

`CARE_ENABLED` and `CARE_ENABLE_APPROVED` are the two runtime approvals. They are not
the whole gate. Care also carries a stored capability row, and `production-deps.ts`
already downgrades that row to `pending_qa` unless it is enabled, approved by a named
person, and both switches are on.

Pulling that row back in the database is the first thing an operator reaches for in an
incident, and it does not touch the environment. A connector that consulted only the
environment would keep synchronizing straight through it, which is why
`loadCareCapability` is a **required** dependency of the gateway, the sync cycle, the
scheduler, and the admin service. Optional would have been a fail-open default:
forgetting the argument would silently remove the gate.

The check is strict and fails closed. The capability must report rail `care`, state
exactly `enabled`, and `enabled: true`; a lookup that throws is treated as Care being
unavailable. The admin status reports `careEnabled` on its own, so an operator can see
which gate is holding rather than guessing.

## Two triggers, one lease

A lease admits the same owner twice, because that is how a long run renews its own
lease. That makes a shared owner string the wrong way to separate two triggers: a
manual pass and a scheduled pass would both be admitted, in one process or across two.

So each trigger takes a distinct owner through `tebraSyncOwner(instance, trigger)`.
The scheduled driver holds `<instance>:scheduled`, the admin route holds
`<instance>:manual`, and the durable lease refuses the second one. The scheduler also
keeps a cheap in-process flag so a redundant pass never reaches the store.

`tebra-scheduler.ts` deliberately does not use `setInterval`. That queues the next tick
regardless of whether the previous one finished, so a slow practice API produces runs
that pile up. It reschedules only once a pass has settled, and `start()` returns false
rather than scheduling a loop that configuration could never let run.

## Idempotency

Every record is addressed by an external id derived purely from its entity and its
Care record id:

```
xenios:care_patient:<care patient id>
xenios:care_appointment:<care appointment id>
```

Because the key is derived rather than stored, a create is attempted only after a
lookup by that key comes back empty. A run that dies between creating a record
upstream and saving the link locally adopts the existing record on its next pass
instead of creating a duplicate chart. This is also what makes retry safe: the retried
sequence starts with that lookup.

A link row is a routing decision, so every read is re-checked against the derived key.
A stored row that does not check out is treated as absent, not as authoritative.

The external id makes a repeat safe only once the first attempt has resolved. Two
concurrent syncs of the same record would both look it up, both see nothing, and both
create. The gateway therefore serializes by external id, so the second call performs
its lookup after the first finished and adopts instead of creating. That covers one
process; across processes the poller is held apart by the durable lease, and the
practice system's own uniqueness on the external id is the backstop once the technical
guide confirms it.

## Privacy

- `TebraPatientProjection` is the only structure carrying identifying detail, and it
  exists solely to create or update the matching record in Tebra. It is `.strict()`,
  so no clinical field can ride along.
- Appointment payloads are opaque. There is no reason for visit, chart note,
  diagnosis, medication, or free text field, so scheduling cannot become a clinical
  channel by accident.
- Audit details are built field by field from an allowlist, never spread from input.
  `assertTebraDetailIsSafe` rejects a hand built detail carrying an identifying or
  secret key.
- Every upstream error collapses to one of a fixed set of codes before it can reach a
  log, an audit row, an HTTP body, or a handoff. Practice systems routinely quote the
  failing record in a fault.
- The admin status shape reports state and cadence only. It never carries the
  endpoint host, username, password, customer key, or practice id, because a status
  page still ends up in screenshots and support tickets.

## Configuration

All values are read from injected environment. No credential appears in source, in a
committed file, or in any serialized shape.

| Variable | Required | Notes |
| --- | --- | --- |
| `CARE_ENABLED` | yes | Existing Care switch. Anything but `true` leaves the connector disabled |
| `CARE_ENABLE_APPROVED` | yes | Existing second runtime approval |
| `CARE_TEBRA_SYNC_ENABLED` | yes | Independent switch for this integration |
| `CARE_TEBRA_SOAP_ENDPOINT` | yes | HTTPS only. Inline credentials, query, or fragment are refused |
| `CARE_TEBRA_USERNAME` | yes | Dedicated least-privilege integration user |
| `CARE_TEBRA_PASSWORD` | yes | Secret store only |
| `CARE_TEBRA_CUSTOMER_KEY` | yes | Account-specific key, secret store only |
| `CARE_TEBRA_PRACTICE_ID` | no | From the technical guide |
| `CARE_TEBRA_POLL_INTERVAL_MINUTES` | no | Default 10, accepted range 5 to 15 |
| `CARE_TEBRA_MAX_PAGES` | no | Default 20, bounds one run |
| `CARE_TEBRA_CURSOR_OVERLAP_SECONDS` | no | Default 120 |

## Storage this lane does not create

The connector ships an in-memory store for tests and a `TebraLinkRowGateway` port for
durable storage. It deliberately adds no migration, because a leased migration is a
separate approval. An in-memory lease does not coordinate across processes, so
production must supply a persistent gateway before the poller runs on more than one
instance.

The required shape, for the integration lane to migrate under its own lease:

```sql
create table care_tebra_links (
  entity        text        not null check (entity in ('patient','appointment')),
  local_id      text        not null,
  external_id   text        not null,
  tebra_id      text        not null,
  linked_at     timestamptz not null,
  last_seen_at  timestamptz not null,
  primary key (entity, local_id),
  unique (entity, external_id)
);

create table care_tebra_sync_cursors (
  entity             text        primary key check (entity in ('patient','appointment')),
  from_modified_at   timestamptz not null,
  to_modified_at     timestamptz not null,
  continuation_token text,
  updated_at         timestamptz not null default now()
);

create table care_tebra_sync_leases (
  lease_key  text        primary key,
  owner      text        not null,
  expires_at timestamptz not null
);
```

`tryAcquireLease` must be one statement. Read then write in application code lets two
workers interleave and both believe they hold the lease:

```sql
insert into care_tebra_sync_leases (lease_key, owner, expires_at)
values ($lease_key, $owner, $expires_at)
on conflict (lease_key) do update
  set owner = excluded.owner, expires_at = excluded.expires_at
  where care_tebra_sync_leases.expires_at <= $now
     or care_tebra_sync_leases.owner = excluded.owner
returning owner;
```

The lease is held when a row comes back and its owner is the requesting owner. All
three tables are service-role only, with no anonymous or authenticated policy.

## Fast follow, and why that is enforced rather than asserted

Tebra is a fast follow. It must not become a dependency of the Early Access
commercial path, so the lane forbids the import edge instead of checking by eye. Two
probes in `server/care/tebra-adversarial.test.ts` assert that no lane file imports from
the commerce, cart, checkout, early-access or catalog domains, and that no lane file
carries quantity, pricing or order vocabulary at all.

The connector moves patients and appointments. The founder quantity band of one through
fifty lives in the commerce path and does not reach here: the lane holds zero quantity
references. Combined with the lane registering no route, adding no migration, and
leaving the repository route inventory unchanged, nothing here can block or affect the
Early Access launch.

## Recreating this lane on a new base

Every lane owes a rebase onto `FINAL_EA_FAST_FOLLOW_BASE`. This one is cheap to move,
by construction: it is entirely net-new files and modifies nothing that already existed,
so `git diff --name-only <base> <head>` lists only `shared/care/tebra*`,
`server/care/tebra-*` and this document. Recreation is cherry-picking the lane's commits
or copying those files onto the new base. There is no merge to resolve because there is
no shared file to conflict on.

The real recreation risk is not the files, it is the four upstream modules this lane
imports: `@shared/care/contracts`, `@shared/care/appointments`, `./access`, and
`./tebra-scheduling` (tests only). A change there that breaks a type is easy to see on
rebase. A change that does NOT break a type but alters meaning is the dangerous one, and
`server/care/tebra-base-contract.test.ts` pins exactly those:

- **Who may administer.** The admin surfaces are gated on `care:administer`. If a later
  base grants that permission to another role, this lane's admin surface widens with no
  edit to any file here and no type error anywhere.
- **The capability vocabulary.** The gate is enumerated from `CARE_CAPABILITY_STATES`
  rather than hard coded, so a state ADDED upstream is proven to fail closed the moment
  it appears. A new state treated as permission to run would be a silent fail-open on
  the one gate an operator reaches for in an incident.
- **The appointment status vocabulary**, in both directions, so a status added upstream
  cannot silently become an invalid payload on its way to the practice system.
- **Care record identifiers staying opaque**, since external ids are derived from them.
- **The failure vocabulary** the scheduling bridge degrades into, so the concierge
  fallback keeps its meaning.

After a rebase, run `npx vitest run tebra` first. If those seven pass, the base still
provides what this lane assumed.

## Tebra account setup, in order

1. A Tebra system administrator submits the integration or API request.
2. Obtain the account-specific customer key.
3. Confirm the exact SOAP endpoint, WSDL, operation set, practice identifiers, and
   required permissions from the current Tebra technical guide.
4. Create a dedicated least-privilege integration user.
5. Store the username, password, customer key, and endpoint in the production secret
   store. Never in Git, Markdown, a Telegram message, a prompt, a log, or a Drive
   mirror.
6. Confirm the business associate agreement, the security review, and the permitted
   data flows before any real patient data moves.
7. Start read-only against a non-production Tebra environment if the account offers
   one.
8. Validate patient and appointment idempotency before enabling any write.
9. Enable Care and the Tebra integration through their independent switches, in that
   order.
10. Run privacy, audit, reconciliation, and rollback drills before public activation.

## Assembling it

`createTebraConnector` builds the whole thing in one call, so the integration lane does
not wire nine pieces by hand. The inputs that matter most are REQUIRED rather than
defaulted, because the dangerous ones are the easiest to omit:

- `loadCareCapability`, since an omitted capability check is a fail-open gate, and it is
  the gate an operator reaches for in an incident.
- `links`, since the in-memory store is correct but process-local, and a lease that does
  not coordinate across processes silently permits two pollers. That should be a
  deliberate choice, not a default someone inherits.
- `audit`, since Care does not accept an unlogged action.

The practice client is the one input that does default, to the client that refuses every
call, so an incomplete deployment degrades to the concierge fallback rather than making
an unreviewed provider call.

Assembly starts nothing and registers nothing. The scheduler and the route handlers are
returned for the composition root to use deliberately.

## Integration steps this lane did not take

These belong to the lane that owns the composition root, and each is deliberate:

1. Write the real `TebraPracticeClient` from the technical guide.
2. Migrate the three tables above and implement `TebraLinkRowGateway` against them.
3. Register the two admin routes inside `registerCareApi` in `server/care/index.ts`:

   ```ts
   const tebra = createTebraAdminHandlers({ access: deps, service });
   app.get(TEBRA_ROUTE_CONTRACTS.status, tebra.requireAdmin, tebra.status);
   app.post(TEBRA_ROUTE_CONTRACTS.sync, tebra.requireAdmin, tebra.sync);
   ```

   This connector exports handlers and registers nothing. Two rules point the same
   way: `registerCareApi` is the composition seam and belongs to the integration
   lane, and the route inventory in `server/release-control-plane.test.ts` is leased
   to the release manager. Adding these two registrations moves that inventory from
   343 call sites and 352 routes to 345 and 354, and the owning lane updates those
   counts in the same change. This lane leaves both numbers untouched.
4. Inject `createTebraSchedulingTransport` into `createTebraSchedulingAdapter` in the
   composition root, so scheduling and sync share one link and one audit trail. The
   adapter keeps returning the concierge fallback until that happens.
5. Start the driver with `createTebraSyncScheduler({ ... }).start()`, passing the same
   `loadCareCapability` the Care routes use and a stable instance id as `owner`. Do not
   schedule `runTebraSyncCycle` by hand, and do not reach for `setInterval`.
6. Point `audit` at the Care audit sink.
7. Build outbound appointment projections with `buildTebraAppointmentProjection`. The
   patient projection belongs to the lane that owns the patient record: Care carries no
   shared demographic type, so a builder here would have to invent one, which is the
   same mistake as inventing a SOAP operation. Build it against
   `TebraPatientProjectionSchema` in `shared/care/tebra.ts`.

## Verification

```bash
npx vitest run tebra
```

That runs the connector suites plus the three pre-existing Tebra suites. The
adversarial probes in `server/care/tebra-adversarial.test.ts` cover gates G10-2 through
G10-5 and G11-1, G11-2, G11-5 from the defensive QA pack, including a source scan
proving no lane file names a URL, a WSDL, a SOAP envelope, a vendor host, or a guessed
operation, and that no lane file imports a transport library.
