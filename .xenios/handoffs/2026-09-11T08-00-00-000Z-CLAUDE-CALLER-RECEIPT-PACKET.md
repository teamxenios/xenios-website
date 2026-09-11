# Recovery caller, receipt queue, hosted packet

Writer: `fable-durable-payment-20260909` (Claude), still the sole local writer
in `C:/Users/sboad/projects/xenios-native-finish-20260910` until ownership is
handed back explicitly.

## Application candidate

`ce0858aba29113b87c061ea8deb20b67991c1357`, tree
`1aadecebd7e28d7fb15b73dfbe5f8c3e7b9cf27e`, on
`codex/xenios-native-finish-20260910`. Gate results are in the packet below.

## Done this checkpoint

- **Recovery caller**, `checkout-recovery-caller.ts`. Disabled unless an
  explicit flag is set. Authority is a digest-pinned approval document,
  re-verified on every authorization against the deployment environment, the
  running commit and the configured database. Not imported, not started.
- **Receipt queue**, in `receipt-repair-production.ts`. The preview's reader is
  shared rather than duplicated; the preview stays write-refusing. The queue is
  disabled by default and unavailable without an approval naming cutoff,
  expiry, audience and the reviewed identity policy.
- **Credit rule preserved**: `all-available-items-v1`, server-issued consent,
  and replay before consent, all untouched.

## Hosted execution

Not run. No staging or provider credential exists in this session, and the
existing approval names Codex A as executor. The single request is
`docs/native-finish/HOSTED_EXECUTION_PACKET_20260911.md`.

The decisive fact in it: the approved executions table alone cannot support
the checkout journey, because the application calls credit functions that only
the unapproved credit-reservations candidate creates.

## Next action

Founder: decide the one amendment in the packet. Executor: provision the named
variables and follow the packet's execution order. Status: not deployed, not
enabled, not live-verified.
