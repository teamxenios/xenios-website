# Revision 23 B: scheme-enum canary test source, disposition

**SOURCE-COMPATIBLE. No required correction.** `scheme-enum-synthetic-source.test.cjs` (8,050 B `ad9b6548…`, Core
`2dc4ec4e`) pins the complete old and new driver files by sha256 at load, cuts the exact `onAttachedTarget` handler out
of each by two boundary strings it first proves unique and ordered, evaluates only that slice inside a fresh `vm`
context whose collaborators are synthetic, and never imports a driver, opens a socket or launches a browser. Its
nineteen tests exercise the real slice text: fifteen scheme cases (the twelve fixed literals, a parseable unknown
scheme spelled with hyphens, a relative URL and a malformed URL), three class-and-predicate matrices of eight
combinations each, and one 64-record cap test. Each test asserts the expected enum, a closed set of exactly fifteen
record keys with boolean flags, no canary byte in the serialized record, the old record reproduced exactly once the
new field is removed, and identical close, failure and session behaviour between the old and new slices. No test pass
is claimed; a separately frozen bounded supervisor, selected pins, limits, current scope, an actual receipt and
closure remain owed.

Reviewer: this session, `claude-fable-5-1`, revision 23 item B. Read-only; nothing parsed, imported or executed.
Archive: `hl12/127_scheme_enum_canary_source.json`.

## 1. What is actually exercised

- **Pinned inputs** (lines 14–20): `readPinned` hashes each whole file and asserts the accepted digests
  (`b2f0901d…` old, `5c90b077…` new) before any slice is cut; a mismatch fails at module load.
- **Exact slice** (lines 21–29): the handler from `const onAttachedTarget = … track(async () => {` up to the
  `conn.on('Target.attachedToTarget', …)` registration. I confirmed both boundary strings occur exactly once in each
  driver and in that order, the old slice is 26 lines and the new 32, neither uses `demand`, and every free identifier
  the slices reference (`track`, `evidence`, `sessions`, `origin`, `phase`, `caseName`, `acceptingPage`,
  `phaseOpen`, `targetId`, `contextId`, `sid`, `send`, `fail`, `URL`, `Boolean`, and `Object` for the new
  `Object.hasOwn`) is supplied by the sandbox. `vm.runInNewContext(slice + '\nonAttachedTarget;')` returns the handler
  itself with a one-second evaluation timeout; `URL` is passed in because it is a Node global, not a realm intrinsic.
- **Synthetic collaborators** (lines 32–49): `track` runs the operation on a resolved promise; `send` accepts only
  `Target.closeTarget` for the canary target with a null session and counts calls; `fail` keeps the first code;
  `sessions` is a fresh map; `evidence` starts empty.

## 2. Expected behaviour, traced against the slice

- **Scheme cases** (lines 69–98): with `acceptingPage` false and `allowExpectedPage` true, a `service_worker` target
  is never accepted, so both slices must close it once and record `UNEXPECTED_BROWSER_TARGET`; the new record's
  `urlSchemeClass` must be the expected literal. The URLs give `http:`, `https:`, `ws:`, `wss:`, `about:`, `chrome:`,
  `chrome-untrusted:`, `chrome-extension:`, `devtools:`, `data:`, `blob:` (outer scheme only) and `file:`; the unknown
  scheme `synthetic-private-canary-7db4:` is a valid scheme token (letters, digits and hyphens) and maps to
  `OTHER_PROTOCOL`; the relative path and the unbalanced IPv6 bracket make the constructor throw and map to
  `UNPARSEABLE`. The earlier underscore spelling would have been unparseable too, which is why the hyphen correction
  was needed for this case to test what it names.
- **Privacy** (lines 59–66): exactly the fifteen expected keys, every key from `browserLevelHandler` onward boolean
  (`hasQueryOrFragment` is allowed to be null for unparseable URLs), and the canary string, which occurs in host,
  path, query, fragment, target, context and session identifiers, must not appear anywhere in the serialized record.
- **Unchanged record and state** (lines 54–58, 95–96): deleting `urlSchemeClass` from a copy of the new record must
  reproduce the old record's JSON exactly, which also checks key order, and the old and new sandbox states (close
  count and fatal code) must be identical.
- **Matrices** (lines 99–120): for `about:blank`, the canonical origin with suffix and an other-origin HTTPS URL, all
  eight combinations of `acceptingPage`, `allowExpectedPage` and type; acceptance is expected only for an accepting
  page handler on a `page` at `about:blank`, matching the slice's own predicate, with the session map holding one entry
  and no close or failure in that case, and a close plus failure otherwise; `urlClass` must be `ABOUT_BLANK`,
  `CANONICAL_ORIGIN` or `OTHER_ORIGIN` and the scheme `ABOUT`, `HTTP` or `HTTPS`.
- **Cap** (lines 121–135): 65 attachments yield 64 records and one omission in both slices, 65 closes and the failure
  code, and every one of the 64 records passes the privacy and sameness checks.

## 3. Points for the proving supervisor (requirements, not fixture corrections)

- The test pins the two drivers but cannot pin itself; the supervisor must pin the test file (`ad9b6548…`) and the
  pinned Node 20.19.0, invoke `node --test` on that one file with a literal argv, capture both streams under a cap,
  require exit 0 with nineteen passing tests, and record outer timing and an independent closure. No network, browser
  or application code is reachable from the file, and the two source reads are the only I/O.
- The absolute records paths inside the test bind it to the records worktree; the supervisor's pins must cover both
  driver files at those paths.
- A passing run proves the enum mapping, privacy, unchanged row shape, unchanged acceptance and refusal, and the cap
  for the extracted handler text. It is not browser evidence, not target ownership or cause, and not a diagnostic
  result; the real-run predicates of doc 126 are untouched.
