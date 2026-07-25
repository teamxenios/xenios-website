# Care shell UI evidence

## Automated evidence

- `client/src/care/isolation.test.ts` proves `/care` and `/care/*` lazy-load a
  separate Care chunk and that the Research router imports no Care module.
- The same test verifies disabled/pending language, the Research boundary,
  absence of treatment/prescription calls to action, absence of forms/buttons,
  and a dedicated single-column mobile breakpoint.
- `server/care/integration.test.ts` proves the default status presented to the
  shell is `disabled` with “Care is being prepared.”
- `server/care/communications.test.ts` verifies the emergency boundary is
  present and directs users to local emergency services without simulating
  clinical triage.
- The production build emits Care as an independent lazy JavaScript chunk and
  stylesheet rather than adding it to the Research section chunk.

## Visual review status

The local `/care` server started successfully, but the in-app browser webview
did not attach in this run, so no screenshot is claimed or committed. A reviewer
should perform the remaining manual desktop/mobile visual pass before enabling
Care. This limitation does not affect the automated route, copy, responsive,
type, test, or production-build results.
