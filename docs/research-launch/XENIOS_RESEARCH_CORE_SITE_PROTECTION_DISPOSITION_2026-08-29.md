# Xenios Research core-site protection disposition — 2026-08-29

## Exact current review identity

| Field | Value |
| --- | --- |
| Trusted production base | `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` |
| Frozen runtime candidate | `2d662a0d31bb1de9332fb5c591f01cab76b991b1` |
| Frozen runtime tree | `c1b1c5d64c317b4a26bdbe89735be97fb1b22ca5` |
| Core classifier invocation | Exact refs `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212..2d662a0d31bb1de9332fb5c591f01cab76b991b1` |
| R11 artifact root | `C:\Users\sboad\AppData\Local\Temp\xenios-gates-2d662a0-r11-volume2-linux` |
| Sealed core log | `C:\Users\sboad\AppData\Local\Temp\xenios-gates-2d662a0-r11-volume2-linux\core-site-protection.log` |
| Core log SHA-256 | `5210b246885d0a3912f1ce72b94b81065034cb7f3d0c27547d0511c5991021bc` |
| Current evidence freeze | `c01569169cad5e6619187221d84019ae8bfc7c69` |
| Current evidence tree | `c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019` |
| Deployment status | **Not deployed; packet consistency passed, while final-RC assignment, severity verdict, and detached review remain pending** |

The current evidence freeze differs from the frozen runtime candidate in
exactly seven evidence-only controls:

- `scripts/evidence/capture-synthetic-journeys.mjs`
- `scripts/evidence/capture-synthetic-journeys.test.mjs`
- `scripts/evidence/lib/cdp.mjs`
- `scripts/evidence/network-boundary.test.mjs`
- `scripts/evidence/routes.public.json`
- `scripts/evidence/routes-public.test.mjs`
- `scripts/release/critical-endpoint-expectations.json`

These controls accumulated through historical evidence-only intermediates and
the current `c0156916…` freeze. None changes the frozen customer/server runtime
or the classifier result recorded here. The runtime identity therefore remains
`2d662a0d…`, not any evidence-only successor.

## Current gate truth

The raw classifier command returned its real exit `1` and is not represented
as an automated zero-exit pass:

```powershell
node scripts/acceptance/verify-core-site-protection.mjs 3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212 2d662a0d31bb1de9332fb5c591f01cab76b991b1
```

Against those exact refs, the sealed R11 artifact reports:

- 719 changed paths;
- 253 allowed Research/Care paths;
- 209 infrastructure paths;
- 216 test paths;
- 8 permitted seams;
- 33 out-of-zone paths; and
- 24 protected hashes verified.

The categories close exactly: `253 + 209 + 216 + 8 + 33 = 719`.
The separate core unit gate passed 1 file and `35/35` tests. The wrapper
required the raw exit `1`, exact counts, verified protected hashes, and an exact
sorted match against the reviewed 33-path disclosure. Its technical result is
`PASS_WITH_DISCLOSED_ZONE_LISTING`.

That wrapper result means the known out-of-zone set was disclosed and matched
exactly; it does not convert the classifier's raw exit to zero, waive an
undisclosed change, or establish an overall release verdict. Final browser,
HTTP, and synthetic-journey evidence is separately sealed at exact evidence SHA
`c0156916…`. Packet consistency passed separately; final-RC assignment,
severity, and detached review are outside this core disposition and remain
pending.

## Exact current 33-path disclosed set

```text
client/public/sw.js
client/src/components/AppErrorBoundary.tsx
client/src/components/Footer.tsx
client/src/components/Navbar.tsx
client/src/components/PageShell.tsx
client/src/components/TopRibbon.tsx
client/src/components/TouchCheckbox.tsx
client/src/components/WaitlistForm.tsx
client/src/components/Wordmark.tsx
client/src/index.css
client/src/lib/attribution.ts
client/src/lib/calendly-events.ts
client/src/lib/careers-schema.ts
client/src/lib/motion.ts
client/src/lib/tracking.ts
client/src/pages/About.tsx
client/src/pages/Book.tsx
client/src/pages/Careers.tsx
client/src/pages/Concepts.tsx
client/src/pages/EarlyInterest.tsx
client/src/pages/ForCoaches.tsx
client/src/pages/Home.tsx
client/src/pages/IcpPage.tsx
client/src/pages/Product.tsx
client/src/pwa/PwaLifecycle.tsx
server/care-document-csp.ts
server/request-logging.ts
server/routes.ts
server/static.ts
server/vite.ts
shared/marketing-attribution.ts
tsconfig.json
vite.config.ts
```

The R11 wrapper compared the classifier output to this exact sorted list and
reported no extra, missing, or substituted path.

## Exact `efb30f57…` to `2d662a0d…` delta

The runtime moved by exactly five paths:

```text
client/index.html
client/src/pwa/pwa.test.ts
client/src/research/assisted-order/assisted-order-accessibility.test.ts
client/src/research/assisted-order/assisted-order.css
docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json
```

The browser shell change removes only the competing 16×16 and 32×32
`rel="icon"` declarations. It retains the already-shipped canonical
`/favicon.png` declaration, Apple touch icon, web-app manifest, icon assets,
service-worker policy, routes, scripts, structured data, and other metadata.
The normalized `client/index.html` SHA-256 is
`b2d696a8b3e6657977932aa86cb20483f103fca121748add91e1959e54fd76ba`.
`client/src/pwa/pwa.test.ts` pins one canonical browser favicon while retaining
the Apple and manifest declarations.

The assisted-order stylesheet adds `min-height: 44px` to text inputs, selects,
and textareas while explicitly excluding checkbox and radio inputs. The
existing compact checkbox styling remains intact, and
`client/src/research/assisted-order/assisted-order-accessibility.test.ts` pins
both contracts. No CDP or other browser-capture reconciliation was added:
`scripts/evidence/lib/cdp.mjs` is unchanged in the frozen runtime.

The protection manifest records the new exact shell hash and reviewed seam
scope. These five changes close the specific favicon-candidate and assisted
order target findings without broadening the core-site allowlist.

## Exact eight permitted seams

```text
client/index.html
client/src/fonts.ts
client/src/main.tsx
package-lock.json
package.json
server/care/index.ts
server/index.ts
server/research/index.ts
```

The typography and favicon shell seams are exact-hash locked.
`server/index.ts` contains the assisted-order incident recut and the explicit
unavailable/config registrations. The config probe plus nine operational
routes are ten registrations total: catalog GET, submit POST, public-reference
status GET, upload-URL POST, document-complete POST, admin-list GET,
admin-detail GET, admin-status PATCH, and admin-download-URL POST, plus the
config GET probe. The production boot tests prove that an enabled config cannot
fall through to generic `404` and that deliberately unavailable composition is
explicit.

## Historical predecessor evidence — not current

The predecessor runtime
`efb30f5751969f0c05032aa4d6084fcc5c587a95`, tree
`f90a24c0dc14c9eabd8845f386ac3244494dd5ab`, was never deployed and is not the
current freeze. Its R10 core log remains preserved at
`C:\Users\sboad\AppData\Local\Temp\xenios-gates-efb30f57-r10-volume1-linux\core-site-protection.log`
with SHA-256
`410499e0fc07834b645baa0310113a8d920eb6863586b11bc1929e1a56904b57`.

That historical run reported 718 changed paths: 253 allowed Research/Care,
209 infrastructure, 215 test, 8 permitted seam paths, and 33 out-of-zone
paths, with 24 protected hashes and `35/35` core unit tests. Its categories
closed as
`253 + 209 + 215 + 8 + 33 = 718`, and its wrapper result was also
`PASS_WITH_DISCLOSED_ZONE_LISTING`. Its canonical
`xenios.git-diff-path-inventory.v1` SHA-256 was
`2f71db82ba43305f19bcdb550057dac474e17be181ebcdd86c092bc4e64560e5`.
Those counts, inventory hash, log, and result remain exact historical evidence
for `efb30f57…`; none is substituted for the current R11 artifact.

## Risk disposition and limits

Privacy and Care isolation changes remain safety-strengthening: Care navigation
is network-only; the error boundary is generic and noindex; attribution,
tracking, and request logging use finite redacted vocabularies; and the Care
document policy is self-only and fail-closed.

Public UX and SEO changes use exact-origin scheduling validation, truthful
schema/noindex behavior, reduced-motion-safe scrolling, valid ARIA references,
reserved image dimensions, narrow-screen reflow, canonical favicon selection,
and 44 px assisted-order text controls. Static and tooling changes preserve
Hino routing, refuse asset-directory redirects, strip blocked Care font
dispatch, keep structured data route-owned, and retain strict type coverage for
preview/E2E code.

Within the core-site classifier boundary, R11 has no undisclosed path or
protected-hash mismatch. This statement is deliberately narrower than release
readiness. Final browser/HTTP/synthetic evidence is sealed; P0,
deployment-blocking P1, critical P2, final-RC assignment, and detached Codex
review verdicts remain pending and are not claimed here. Packet consistency
passed separately.

## Authorization boundary

This record authorizes no deployment, waiver, migration, configuration, or
other production mutation. If every remaining browser, packet, ownership,
severity, and detached-review gate passes, Samuel's later exact-SHA GO must name
the final RC successor whose executable source remains frozen at
`2d662a0d31bb1de9332fb5c591f01cab76b991b1`. Until that boundary is reached,
production remains `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212`.
