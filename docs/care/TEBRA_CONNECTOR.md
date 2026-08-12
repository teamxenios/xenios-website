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
- The scheduling decision, including the concierge fallback, stays in
  `server/care/tebra-scheduling.ts`. That file is unchanged. The connector only
  supplies the transport it already asks for, through
  `server/care/tebra-scheduling-bridge.ts`.

New in this lane:

| File | Purpose |
| --- | --- |
| `shared/care/tebra.ts` | External id derivation, projection contracts, cursors, result and status types |
| `server/care/tebra-config.ts` | Fail-closed configuration and the secret-free status description |
| `server/care/tebra-client.ts` | The practice client seam and its refusing default |
| `server/care/tebra-link-store.ts` | External id mappings, cursors, and the run lease |
| `server/care/tebra-redaction.ts` | The single chokepoint for codes, audit details, and error bodies |
| `server/care/tebra-retry.ts` | Bounded, deterministic retry for retryable failures only |
| `server/care/tebra-gateway.ts` | Idempotent patient and appointment synchronization |
| `server/care/tebra-sync.ts` | Incremental polling with cursors and leasing |
| `server/care/tebra-admin.ts` | Status and manual sync for a Care administrator |
| `server/care/tebra-routes.ts` | The two admin handlers, not registered |
| `server/care/tebra-scheduling-bridge.ts` | Fills the existing scheduling transport seam |

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
5. Schedule `runTebraSyncCycle` on the configured interval, patients before
   appointments.
6. Point `audit` at the Care audit sink.

## Verification

```bash
npx vitest run shared/care/tebra.test.ts "server/care/tebra-*.test.ts"
```
