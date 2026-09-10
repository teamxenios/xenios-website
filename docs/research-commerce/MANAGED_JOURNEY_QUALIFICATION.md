# Running the managed connected-checkout qualification

This is how a real provider test-mode qualification run is executed, what it
proves, and what it deliberately refuses to prove.

The scenario runner (`connected-checkout-journey.ts`) is unchanged and shared
with the local binding. What is new is the managed **binding**: the thing that
drives the runner against a mounted application, a real database and the
provider's test mode.

## What a managed run is, and is not

| It is | It is not |
|---|---|
| The mounted HTTP routes, driven as authenticated synthetic members | Service objects called in-process |
| Canonical rows read through the real PostgREST client | An in-memory store labelled "test" |
| The provider's own truth, in test mode | A scripted model of the provider |
| A genuinely signed body through the mounted verified webhook route | Proof the provider delivered an event |

The last row matters. The harness signs a real event body with the endpoint's
own secret and posts it to the mounted route, so the route's signature
verification is genuinely exercised. That is **not** the same as the provider
having delivered it, and the receipt says
`webhookEvidence: harness_signed_through_mounted_route` so nobody can read it as
more than it is.

## Prerequisites, and who owns each

| Prerequisite | Owner |
|---|---|
| The durable surface mounted through `production-deps.ts` and `server/index.ts`, with `createWebhookHandler` given its `executions` processor | Codex A |
| `20260909150000_research_checkout_executions.sql` installed on the authorized test project | Codex A, under founder scope naming that exact candidate |
| Provider test-mode keys | Founder |
| Synthetic members provisioned on the test project, each an active `research_members` row with an auth user, plus an access token for each | Codex A |

The harness provisions nothing. It consumes pre-provisioned synthetic
identities and refuses anything that does not match the plan it was given.

## Configuration

Every value is read by name from the environment. None is ever logged, returned
or embedded in a receipt; `describeConfig` reduces each to a statement about its
shape.

| Variable | Required | Effect when absent |
|---|---|---|
| `XENIOS_QUALIFY_BASE_URL` | yes | NOT_RUN. Must be https, or loopback for an application the harness started. |
| `XENIOS_QUALIFY_PROJECT_REF` | yes | NOT_RUN. The production project is refused by the plan gate. |
| `XENIOS_QUALIFY_SERVICE_ROLE_KEY` | yes | NOT_RUN |
| `STRIPE_SECRET_KEY` | yes | NOT_RUN. A live key is refused, not merely warned about. |
| `STRIPE_WEBHOOK_SECRET` | yes | NOT_RUN |
| `STRIPE_PUBLISHABLE_KEY` | yes | NOT_RUN. The mounted payment-config route serves it to the browser. |
| `XENIOS_QUALIFY_SYNTHETIC_MEMBERS` | yes | NOT_RUN. JSON array of `{memberId, accessToken}`, one per scenario. |
| `XENIOS_QUALIFY_OWNER_APPROVAL_SHA256` | yes | NOT_RUN |
| `XENIOS_QUALIFY_CHROME_PATH` | no | `browserDrivenChallenge: false`; the challenge scenario SKIPS |
| `XENIOS_QUALIFY_RESTART_COMMAND` | no | `processRestart: false`; the restart scenario SKIPS |
| `XENIOS_QUALIFY_FAULT_CONTROL_URL` | no | the two fault scenarios SKIP. Must be loopback. |
| `XENIOS_QUALIFY_PM_ORDINARY` / `_DECLINE` / `_NON_CHALLENGE` / `_CHALLENGE` | no | the provider's documented test methods are used |

The ordinary card matters. The other three all decline or demand
authentication, so a run without one proves an authentication-required payment
everywhere it meant to prove an ordinary successful one.

Names and modes only. Never write a real value into a document, a commit, a
chat message or a ticket.

## Running it

```bash
node --import tsx server/research/commerce/qualification/managed-journey-run.ts
```

Exit codes are the result, so this can gate a release rather than decorate one:

| Code | Meaning |
|---|---|
| 0 | Every required scenario executed and passed. Qualified. |
| 1 | The run executed and did not qualify, or it could not complete. |
| 2 | NOT_RUN. Nothing was attempted; exactly one prerequisite is named. |

## Why a scenario skips

A capability is declared from what is actually configured, never assumed. A
scenario whose capability is false is SKIPPED with the exact missing capability,
and any required scenario that did not execute prevents qualification. That is
the point: a run that cannot drive a browser reports that it cannot, rather than
satisfying the challenge scenario with an easier path.

Two consequences worth knowing before planning a run:

- `authentication_challenge_and_return` can only be satisfied by a browser
  driving the provider's own hosted challenge. There is no server call that
  completes one.
- A binding that declares `browserDrivenChallenge: true` makes **two** required
  scenarios depend on the browser, because `process_restart_recovery` prefers
  the challenge method whenever one is declared.

## Before it starts

One unauthenticated request to the durable door, to tell an unmounted surface
from a refused request. A mounted door answers 401 through its guard; an
unmounted path answers the application's own 404, which carries neither `ok`
nor `code`. Only the second is a NOT_RUN, and it is named as
`durable_checkout_not_mounted` rather than surfacing as thirteen different
symptoms of one missing mount.

## The browser, and the network boundary

The repository's evidence harness deliberately seals its browser to loopback: a
closed proxy, a null host-resolver rule, and request blocking for off-origin
hosts. A hosted challenge lives at the provider, so driving one requires opening
that boundary for the provider's domains.

That is a decision to make explicitly, not a default. It is why the browser port
exists only when a path is configured.

The driver lifts exactly one thing and says so: the shared launcher passes an
unconditional `--proxy-server=http://127.0.0.1:9`, a discard port that kills
every request including the top-level navigation, and the driver appends a
later `--proxy-server=direct://` which overrides it. It does NOT call
`enforceNetworkBoundary`, because that pins one origin policy for the life of
the page and a challenge is inherently multi-origin: the provider's page hands
off to the issuing bank. A boundary that cannot express the journey would only
fail it for the wrong reason.

If the provider's hosted page offers no control the driver recognises, it
throws. A challenge nobody completed is a failed scenario, never a quiet pass.

The challenge URL is never logged: it carries the payment's client secret.

## The fault seam

`qualification-fault-seam.ts` is the application side. It wraps the provider
transport and the canonical order save, and it serves a loopback control
channel. The lost-response fault drops the response of the next write only
AFTER the provider processed it, which is the dangerous case: the effect exists
and the caller does not know. Every fault is one-shot, so an armed fault cannot
leak into the scenario after it.

It refuses to construct when `NODE_ENV` is production, its control server binds
to 127.0.0.1 and checks the socket rather than a header, and the harness refuses
a non-loopback control URL. Nothing in the application imports it.

`lost_response_recovery` and `local_commit_failure_then_reconciliation` need the
application to fail on purpose. The harness will not reach into a running
process to arrange that, and the application must never carry a switch that
could be flipped from outside.

So faults come from a loopback control channel that exists only in an
application the harness itself started from a qualification entry point. The
configuration refuses a non-loopback URL for exactly this reason. Until that
entry point exists, both capabilities are false and both scenarios skip, which
is honest rather than convenient.

## Counting

Every provider count is scoped to this run's start time and this run's synthetic
members. A shared test account with other activity in it can neither make a
duplicate appear nor hide one.

## What never leaves the binding

Secrets, client secrets, card details, customer rows and raw provider payloads.
The continuation route returns an authentication client secret so a browser can
present a challenge; the binding reports only that one was offered. Canonical
order reads are reduced to the fields the journey reconciles before they cross
the boundary.
