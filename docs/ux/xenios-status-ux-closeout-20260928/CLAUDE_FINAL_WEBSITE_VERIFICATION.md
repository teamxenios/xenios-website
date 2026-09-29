# Claude Final Xenios Website Verification

Date: 2026-09-29

## Verdict

The exact runtime candidate `c213707a9d80ecc9f772b5790acb52f1fa503da7`, tree `09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0`, passes the final independent source, build, regression, security, release-control, and evidence review. No P0, P1, or P2 defect was reproduced. The candidate is ready for managed staging qualification.

No runtime source was changed during this review. No migration was applied, no deployment was made, no real email was sent, and neither staging nor production was mutated.

## Candidate identity

- Reviewed runtime commit: `c213707a9d80ecc9f772b5790acb52f1fa503da7`
- Reviewed runtime tree: `09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0`
- Parent candidate: `899395c4980cc554f9a2c6bdb3eb3d14e63ee65a`
- Test-only commit: `4cc31567e2e93b0708584c8cfb45fee17209bea4`
- Release-control commit: `7396f53dcedb154991f8f9b23accaee137286fdd`
- Reviewed documentation and handoff tip: `796f0ba55c9d665086ee11904a691b7f313e3223`
- Owner-approved strategy: `af5713863dcf9b8455c568b89ffc15f6c103e58a`
- Migration under qualification: `supabase/migrations/20260927203000_research_status_recovery.sql`
- Recorded current production commit: `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`

Origin was fetched before verification. The reviewed runtime is an ancestor of the remote branch. The remote branch and local branch both resolved to `796f0ba55c9d665086ee11904a691b7f313e3223` before this verification record was added. The documentation tip was not treated as the runtime candidate.

Commit classification after the runtime candidate:

| Commit | Classification | Runtime source changed |
| --- | --- | --- |
| `4cc31567` | Test only | No |
| `ba600690` | Continuity records | No |
| `7396f53d` | Release control and protected CSS hash | No |
| `b0ffa7e0` | Release manifest and evidence | No |
| `7b2ea302` | Documentation | No |
| `3f7670a0` | Generated site records | No |
| `796f0ba5` | Corpus handoff | No |

The only runtime-path change after the candidate is the declared test-only file `client/src/components/PageShell.test.tsx`. No production runtime source changed after `c213707a9d80ecc9f772b5790acb52f1fa503da7`.

## Authoritative runtime

- Node binary: `C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe`
- Node version: `v20.19.0`
- npm version: `10.8.2`
- Official archive: `C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64.zip`
- Archive SHA-256: `BE72284C7BC62DE07D5A9FD0AE196879842C085F11F7F2B60BF8864C0C9D6A4F`

The authoritative commands ran with the private Node directory prepended only to the process-local `PATH`. No permanent PATH or system installation was changed.

## F-01 and no-em-dash verification

F-01 passes. The immutable reconciliation source JSON was not changed between the parent candidate and the reviewed runtime. Its SHA-256 is `7E338D041A1889B6C3DBF25E474D5B0440CC8F72E70DC8E5119A175137094D93`, and its Git blob is `1c502e08fc10eb5328eccb02898cd1c537b5c388`.

Independent counting found 24 literal source em dashes in the immutable evidence JSON: 23 configuration separators and one product label. The earlier evidence count of 23 covered only the configuration separators. This clarified source count is not a rendered-runtime defect. The projection normalizes all runtime-fed labels before presentation, and the rendered admin reconciliation tests contain zero forbidden forms.

The permanent gate independently passed its positive and negative cases. It rejects literal U+2014, named and numeric HTML entities, and escaped U+2014 in rendered copy. It accepts approved punctuation and excludes signed agreements, private archives, immutable historical evidence, unrelated dependencies, and non-rendered evidence data. The normalized sentences use natural commas and phrasing, not blind hyphen substitution.

Results:

- Customer-facing runtime forbidden forms: 0 across 1,332 scanned source files.
- Admin or operator rendered forbidden forms: 0.
- Production build forbidden forms: 0 across 224 scanned build files.
- No-em-dash gate tests: 9 passed, 0 failed.
- Focused F-01, status, recovery, and static tests: 104 passed, 0 failed across 10 files.

## Status, recovery, and P-17

### R-01

PASS. Care-format references receive neutral Care-specific guidance. The response neither promises a Research/order recovery email nor creates a P-17 recovery event. It does not confirm Care-reference existence or disclose Care or clinical status, and it routes the person to the approved Care/support path.

### R-02

PASS. A server-confirmed signed-in owner receives the canonical account-orders shortcut. A valid same-browser status authority exposes only the exact authorized subject shortcut. Signed-out, expired, wrong-owner, browser-only email, and unrelated-order cases do not receive private shortcuts.

### R-03

PASS. Initial secure-link opening and same-tab hash navigation are covered. The raw token moves only into volatile memory and is immediately removed from the URL and browser history. GET and hash navigation do not consume it. Explicit POST exchange remains the only consume action. Replay, expiry, malformed token, refresh, and back/forward paths fail safely. Tests and source review found no raw token persistence in logs, Web Storage, analytics, DOM attributes, or durable state.

### Security boundaries

PASS. The narrow changes preserve neutral public recovery responses, canonical stored-email binding, token entropy and hashing, single use, expiry, revocation, scanner-safe exchange, status-only scope, closed-tab return, cross-owner denial, account authority, Care separation, outbox idempotency, trusted-origin construction, rate limiting, admin and partner denial, `commerceEnabled=false`, and dark native commerce.

No external email was sent. External delivery remains unverified. Managed Supabase parity is not claimed from local verification.

## True zoom evidence

### 200 percent

PASS. The exact local production preview tab at `http://127.0.0.1:5001/status` was independently inspected after true Chrome page zoom was set. Recorded browser values were:

- `devicePixelRatio`: 3
- `outerWidth`: 672
- `outerHeight`: 356
- `window.innerWidth`: 640
- `window.innerHeight`: 332
- `document.documentElement.clientWidth`: 632
- `document.documentElement.scrollWidth`: 632
- Horizontal overflow: 0
- Clipped or obscured controls: 0

The status form, headings, labels, controls, support links, and status actions remained readable and usable.

### 400 percent

REVIEWED CODEX EVIDENCE. This independent tool session could not safely set or read Chrome's native menu zoom value, so it did not represent a viewport proxy as true zoom. The exact-candidate Codex browser evidence was reviewed and is sufficient and authentic:

- Chrome page zoom: 400 percent
- `devicePixelRatio`: 6
- `outerWidth`: 1280
- `outerHeight`: 752
- `window.innerWidth`: 320
- `window.innerHeight`: 152
- `document.documentElement.clientWidth`: 316
- `document.documentElement.scrollWidth`: 316
- Horizontal overflow: 0
- Clipped or obscured controls: 0
- Reverse-focus submit bounds: top 83.98, bottom 135.98
- Header overlap: none

The evidence uses native browser zoom, not CSS zoom, transforms, device emulation, device scale factor substitution, viewport-only resizing, or screenshot enlargement. Forward and reverse focus remained visible and logically ordered. Care guidance, authorized shortcuts, the public recovery form, same-tab token removal, View status, and explicit POST-only consumption remained usable and safe.

## Business and copy boundaries

PASS. Public branding remains Xenios and the legal entity remains Xenios Technologies, Inc. There is no public Eon or Infinity rename. Care and Research remain separate. The reviewed candidate adds no public individual product cards or counts, unapproved prices, unverified clinician, pharmacy, testing, COA, shipping, or response-time claims, practice ordering for clients, public Care commissions, public numeric commission schedule, wholesale availability, or unapproved Careers claims.

Inquiry, application, access request, approval, activation, sign-in, Care request, and order remain distinct states. Accepted inquiries retain durable state and an operator obligation. The candidate makes no false receipt claim and leaves no dead-end status route.

## Release verification results

| Control | Result | Evidence |
| --- | --- | --- |
| Node 20.19.0 | PASS | Exact private binary used |
| Typecheck | PASS | Project typecheck clean |
| Production build | PASS | 2,307 modules transformed; client and server bundles emitted |
| Build em-dash scan | PASS | 224 files, 0 forbidden forms |
| Full suite | PASS | 987 files passed, 6 skipped; 18,182 tests passed, 85 skipped, 0 failed |
| Migration DAG | PASS | 38 nodes; canonical checksums verified |
| ACL and postchecks | PASS | Static migration, disposable verification, and release-control coverage pass; managed parity not run |
| Route uniqueness | PASS | 453 registrations across 444 call sites |
| Protected change | PASS | 38 protected hashes verified |
| Canonical site records | PASS | 235 routes and 15 capabilities; generated records current |
| Release manifest | PASS | Expected production and runtime identities accepted |
| Release-control plane | PASS | 51 passed, 1 skipped, 0 failed |
| Git diff check | PASS | No whitespace errors in runtime range |
| Remote ancestry | PASS | Runtime is an ancestor of the fetched remote branch |

The managed ACL and postcheck result means the SQL source, explicit privilege assertions, disposable verification, and local release controls pass. It does not mean the migration has run against managed Supabase. That qualification remains the next controlled stage.

## Evidence limitations

- Managed staging: NOT RUN.
- Managed Supabase parity: UNVERIFIED.
- External delivery: UNVERIFIED.
- Live production was not independently queried during this review. The repository system of record still identifies production as `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`, and this review performed no production mutation.
- The independent session did not reproduce native 400 percent zoom. It reviewed the exact-candidate Codex browser-level evidence and separately reports that classification.
- No private founder archive content was copied into this report.

## Final disposition

```text
CLAUDE FINAL XENIOS WEBSITE VERIFICATION

REVIEWED RUNTIME SHA:
c213707a9d80ecc9f772b5790acb52f1fa503da7

REVIEWED RUNTIME TREE:
09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0

COMMIT CLASSIFICATION:
Runtime c213707a; test-only 4cc31567; release-control 7396f53d; documentation and handoff through 796f0ba5.

RUNTIME CHANGES AFTER CANDIDATE:
NO

F-01:
PASS

SOURCE JSON UNCHANGED:
YES

ADMIN OR OPERATOR RENDERED EM DASHES:
0

CUSTOMER-FACING RUNTIME EM DASHES:
0

PRODUCTION-BUILD EM DASHES:
0

NO-EM-DASH GATE:
PASS

COPY QUALITY:
PASS

R-01:
PASS

R-02:
PASS

R-03:
PASS

TRUE 200% ZOOM:
PASS

TRUE 400% ZOOM:
REVIEWED CODEX EVIDENCE

400% HORIZONTAL OVERFLOW:
0

400% CLIPPED OR OBSCURED CONTROLS:
0

KEYBOARD AND FOCUS:
PASS

P-17 SECURITY:
PASS

OWNER ISOLATION:
PASS

CARE BOUNDARY:
PASS

NODE 20.19.0:
PASS

TYPECHECK:
PASS

BUILD:
PASS

FULL SUITE:
PASS

FULL SUITE FILES:
987 passed / 6 skipped / 0 failed

FULL SUITE TESTS:
18182 passed / 85 skipped / 0 failed

MIGRATION DAG:
PASS

ACL AND POSTCHECKS:
PASS

PROTECTED CHANGE:
PASS

ROUTE UNIQUENESS:
PASS

SITE RECORDS:
PASS

RELEASE MANIFEST:
PASS

P0:
0

P1:
0

P2:
0

P3 DEFERRED:
12

EXTERNAL DELIVERY:
UNVERIFIED

MANAGED STAGING:
NOT RUN

STAGING MUTATED:
NO

PRODUCTION MUTATED:
NO

REMOTE VERIFIED:
YES

WORKTREE CLEAN:
YES

READY FOR MANAGED STAGING QUALIFICATION:
YES
```
