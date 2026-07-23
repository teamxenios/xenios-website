# third-party notice: OpenSign

## Component

- Name: OpenSign
- Author: OpenSignLabs
- License: AGPL-3.0
- Source: https://github.com/OpenSignLabs/OpenSign

## How xenios uses it

xenios research integrates OpenSign only at the API and service boundary. The
xenios adapter (`server/research/membership-activation/esign/provider.ts`) is an
HTTP client that talks to a running OpenSign service. No OpenSign source is
vendored, copied, or forked into this repository, and no OpenSign code is
compiled into or linked with the xenios application.

## Licensing position

Because this repository only calls OpenSign over its network API, the AGPL-3.0
obligations attach to the operator of the OpenSign service, not to this API
client. The client stays a separate, independent work.

Any future decision to self-host a modified OpenSign, or to vendor or fork
OpenSign source into a xenios codebase, is a separate service and licensing
workstream. It would bring the AGPL network-use and source-availability
obligations into scope and must be reviewed with counsel before it happens. This
notice covers the current API-client integration only.
