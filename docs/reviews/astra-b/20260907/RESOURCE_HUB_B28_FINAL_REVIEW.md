# ASTRA-B independent review: Resource Hub b28

Review date: 2026-09-07. Disposition: **BLOCK — not accepted for integration or production release.**

This is a source/evidence review, not production verification. The reviewer performed read-only Git/source/evidence inspection and one pure, in-memory scanner probe. No runtime files were edited, heavy test suites run, database commands executed, production configuration changed, migrations applied, deployments initiated, or communications sent. The only authorized write is this ASTRA-B review document and its documentation-only commit/push.

## Immutable scope and current repository state

| Item | Observed value |
| --- | --- |
| Resource Hub code candidate | `b28a3e3cd809724fd70b2ec3006db6e36c76b253` |
| Candidate tree | `fff329dc28927e4a4e9707fe0a46e37acf8dbf47` |
| Candidate commit time | `2026-09-07T09:37:07-05:00` / `2026-09-07T14:37:07Z` |
| Branch | `fable/recruiter-resource-hub-20260906` |
| Latest records-only successor | `379f4b4f3eec34ab113f4fad57bca2ad83e86f31` |
| Successor tree | `da1451ac99113ef206776314afb3f822eb675e2b` |
| Origin | `https://github.com/teamxenios/xenios-website.git` |
| ASTRA-B documentation baseline | `d04da477f7b2828411810c927cbaa3aa709476dc` |
| ASTRA-B baseline tree | `d8621f249a752a627f7ab270f484795b78385113` |

At the final read, the Fable worktree was clean and its local branch and remote branch both resolved to `379f4b4f3eec34ab113f4fad57bca2ad83e86f31`. There is no difference between b28 and that successor under `client`, `server`, `shared`, `scripts`, or `supabase`. The successor changes five `.xenios` task/session/message/handoff records only. Earlier transient dirty coordination/scratch observations are superseded; they are not current code-candidate blockers.

The exact-SHA handoff now exists at `.xenios/handoffs/2026-09-07T14-42-01-604Z-RECRUITER-RESOURCE-HUB-V1-20260906-fable-recruiter-resource-hub-20260906.md`. The local task record is `qa`, owner `null`, with a handoff bound to b28. No Resource Hub allocation was present in the inspected `.xenios/CODE_OWNERSHIP.json`; the handoff asks A to record the canonical lease. That coordination reconciliation is distinct from the source defects below and is not evidence of a production mutation.

All source references below are one-based lines in b28, unchanged in the records-only successor. Paths are relative to `C:/Users/sboad/projects/xenios-resource-hub-20260906`.

## Blocking source findings

### RH-B28-1 — P1: unsupported encoded PDF object streams are accepted

`server/research/resource-hub/service.ts:150-151` skips an `/ObjStm` unless its dictionary includes `/FlateDecode`. An object stream using `/ASCIIHexDecode` is not inspected and does not increment `opaqueStreams`. `validatePdfUpload` therefore accepts the synthetic input below despite a forbidden action dictionary inside that encoded stream. This contradicts fail-closed treatment of unreadable object content.

The following exact pure probe was executed through the existing TSX loader with `TSX_DISABLE_CACHE=1`; it did not write a file, access a network, launch a PDF viewer, or execute PDF JavaScript:

```js
import { validatePdfUpload, inflatedPdfStreams } from "./server/research/resource-hub/service.ts";
const encoded = Buffer.from(
  "1 0 << /Type /Action /S /JavaScript /JS (void 0) >>", "latin1"
).toString("hex") + ">";
const bytes = Buffer.from(
  "%PDF-1.5\n2 0 obj << /Type /ObjStm /N 1 /First 4 /Filter /ASCIIHexDecode /Length " +
  encoded.length + " >>\nstream\n" + encoded + "\nendstream\nendobj\n%%EOF\n", "latin1"
);
const result = validatePdfUpload({
  bytes, declaredContentType: "application/pdf", originalFilename: "synthetic-scanner-check.pdf"
});
console.log(JSON.stringify({
  case: "ASCIIHexDecode object stream containing forbidden action dictionary",
  validation: result, scan: inflatedPdfStreams(bytes)
}));
```

Observed output:

```json
{"case":"ASCIIHexDecode object stream containing forbidden action dictionary","validation":{"ok":true,"reasons":[]},"scan":{"text":"","opaqueStreams":0,"truncated":false}}
```

Evidence strength: reproduced scanner-level acceptance regression, not a claim that a complete malicious PDF was opened or that a viewer exploit was demonstrated. Existing tests for escaped names, FlateDecode object streams, corrupt FlateDecode, encryption, and benign printed text do not cover this case. Related static gap: the loop at line 132 stops at `MAX_SCANNED_STREAMS` (4000) without marking limit exhaustion as truncated; no exhaustion probe was run.

Required remediation: bounded support for explicitly allowed object-stream filters/chains, or refusal of unsupported/opaque object streams; add unsupported-filter and scan-exhaustion regressions. Preserve the distinction between object content and ordinary image/font streams to avoid indiscriminate inflation or unrelated false refusals. Passing these cases alone would not establish general malware safety.

### RH-B28-2 — P1: private download completion survives logout/account change

`client/src/research/pages/partners/Resources.tsx:115-120` awaits a download authorized with the captured token, then unconditionally calls `saveBlob`. `client/src/research/pages/adminx/ResourceHubAdmin.tsx:607-613` does the same for administrative previews. Neither completion checks the current principal, request generation, or mounted state before initiating the save.

A request started by account A can complete after logout, after an A-to-B switch, or after unmount, and still trigger the private-file side effect. The principal-bound partner list hook does not protect these separate asynchronous handlers.

Evidence strength: source-confirmed candidate-introduced asynchronous privacy defect; a delayed-response browser/test race was not executed by this reviewer. Required remediation: bind each operation to the current principal and request generation, cancel or discard stale completions, and clean up object URLs. Prove delayed A-to-B, A-to-null, and unmount responses never save; prove current-principal completion still works. Review adjacent upload/review completion messages for the same boundary.

### RH-B28-3 — P1: new admin page retains prior-principal state

`client/src/research/pages/adminx/ResourceHubAdmin.tsx:942` mounts `ResourceHubAdminBody` without a principal key. The body at lines 947-948 uses the existing `useAdminResource`, and its outcome at line 953 is independent state with no token binding. The existing helper in `client/src/research/pages/adminx/auth.ts:175-185` switches to loading only in an effect and does not synchronously bind its returned data to the token. A null token returns without clearing there.

On a same-mount A-to-B token change, the previous successful resource data can render before the effect changes state. A's outcome text also persists independently of a subsequent forbidden result. `AdminScreen` in `client/src/research/pages/adminx/AdminResearchHome.tsx:86` passes a ready session's token to the same child; the new page does not add the principal-key isolation used by that file's overview body.

Evidence strength: source-confirmed composition defect in the new Resource Hub page using a pre-existing helper, not an assertion that Fable introduced the helper's original weakness. Required remediation: synchronously principal-bind the body, data, and outcomes; guard stale action completions as in RH-B28-2. Add A-to-B, A-to-null, token-refresh, overlapping request, and denied-B tests proving no A metadata or outcome is rendered.

## Acceptance-evidence and integration gaps

### RH-B28-4 — P2: rendered logout/account switching is not proved

The existing browser journal explicitly says at lines 34-36 that member/admin sign-out buttons did not issue logout requests and that persona switches were performed by clearing stored sessions. That is not evidence of functioning rendered logout, signed-out denial, or real account switching. Its harness path at line 3 also names the obsolete `server/research/resource-hub/preview.ts`; the current harness entry is `scripts/preview-resource-hub.ts`.

The new handoff reports API and width sweeps rerun against b28, but the browser journey journal remains dated 2026-09-06. The journal's reference to earlier A journeys does not prove these Resource Hub download/state boundaries. Run an uninterrupted synthetic browser journey using the actual sign-out controls: A login, private read, rendered logout, signed-out denial, B login, and B-only metadata/download decisions. Do not substitute manual storage clearing. Disclose mocked identity/data boundaries; do not label local fixture results production authentication proof.

### INT-1 — P1 integration risk: preserve the newer universal-account hardening

The merge-base of b28 and the approved-account candidate `ff3c496245739233b71e46f9e5d6e26af9d57017` is `096d70c17c823fa6ad3fefc7a7d72f91edd54a39`. Resource Hub is based on an older runtime; it is not a safe wholesale replacement for the newer account release.

In particular, `server/research/partners/portal-production.ts` differs from ff3 by 27 additions and 73 deletions. The older version still coerces absent/corrupt monetary data into zero/floored values; lacks the newer returned-row `member_id` recheck; uses loose text handling for certification/activation timestamps; and lacks newer strict agreement, training, and organization ownership/return handling. Fable's intended change to this old-base file is primarily resource-port documentation. These omissions are **old-base integration risks, not Resource Hub-introduced removals**.

Integrate only the intended Resource Hub delta onto the accepted current runtime. Preserve ff3's identity, principal, ownership, strict DTO, and unavailable-state safeguards in shared files; do not copy the old `portal-production.ts` wholesale. Re-run relevant account/partner/auth tests on the combined candidate and publish its new SHA/tree. This review does not authorize rebasing, merging, or deploying it.

### INT-2 — P2 conditional integration precondition: ordinary-auth route reachability

`client/src/research/layout.tsx:386` exempts the exact dashboard and links routes from the shared review gate, but not Resources; a locked gate reaches `PasswordPage` at line 412. The ordinary own-read exceptions in `server/research/index.ts` also omit the Resource Hub endpoints. The preview explicitly sets `RESEARCH_PUBLIC = "true"` in `scripts/preview-resource-hub.ts`.

Therefore the preview does not prove ordinary approved-partner access when the shared review gate is locked/public access is disabled. Verify the intended exact-path normal-auth policy and server/private guards in the combined runtime. This is a conditional source/integration gap, not an independently observed live outage; do not resolve it with a broad public bypass.

## Source-level improvements confirmed

The candidate contains useful safeguards that must be retained during remediation:

- Unknown/non-UUID resource IDs return uniform 404s without forbidden-resource titles; denial-ledger logging is best effort so foreign-key failures do not turn that boundary into a 503 oracle.
- A successful delivery requires its required ledger write; the server checks current version, publication/policy, and audience. Suspended/terminated access and draft policy do not become published access.
- The partner DTO excludes storage paths, administrator identity, and review reasons. The private storage adapter does not generate public/signed download URLs and uses write-once `upsert: false` uploads.
- Publish/withdraw operations use single store operations backed by candidate SQL functions. This is source design only: no live migration application or database rehearsal was performed here.
- Administrative routes use the injected canonical `requireSupabaseAdmin` boundary and `req.adminEmail`; authorization precedes raw upload-body parsing.
- No external-share action is implemented; a policy label does not imply sharing authority. The canonical partner list hook is already render/principal-bound, separately from the unguarded download handlers.

## Evidence freshness and provenance

The following files were inspected and hashed read-only under `C:/Users/sboad/projects/xenios-qa-evidence-resource-hub-20260906`. They are external evidence, not copied into this documentation commit. No private PDF names, real source paths, credentials, or customer data are reproduced here.

| Artifact | Bytes | Last write (UTC) | SHA-256 |
| --- | ---: | --- | --- |
| `api-proof-journal.json` | 68582 | `2026-09-07T14:40:06.9427506Z` | `9a0eedacbedcac142d3874590b1800df72a5073eaecb4b45acca917df8e6250c` |
| `width-sweep-journal.json` | 49102 | `2026-09-07T14:41:45.1778427Z` | `9ffc9adda4f71f9c71ddbd4425db5936c0b837a76abf1280bcdf5f974c9df394` |
| `scanner-real-pdfs.json` | 112124 | `2026-09-07T14:33:53.5087599Z` | `1543f561519c0b2ed6c2d40efa2de60382c587e144b1933d746e6aa9226669b9` |
| `browser-journey-journal.md` | 4168 | `2026-09-06T11:01:22.8278046Z` | `b3e02f6e8e570f3b439239c1884f47242f9e6bd12bd0658a4b8b0440b9a5e932` |

The API journal reports 56 passes and zero failures. The width journal contains 45 ready records with zero recorded boundary violations. The scanner journal reports 494 real PDFs (483 accepted, 11 refused) and 12 passing controls; its timestamp precedes the b28 commit. These are inspected existing results, not tests independently rerun by this reviewer. One existing narrow representative screenshot was visually inspected; that is not a new full viewport sweep.

The exact-SHA handoff additionally reports clean typecheck/build and 518 passes with one skip across 16 focused test files. Its claimed reruns are useful author-reported evidence, but journal timestamps and narrative statements do not independently establish which compiled assets each run served. The journals themselves do not bind candidate SHA/tree, built-asset inventory, and harness hashes. The browser journal is older and explicitly leaves logout unverified.

For the remediation handoff, provide an immutable evidence inventory binding the combined application SHA/tree, harness SHA, served build/asset hashes, commands/results, and artifact hashes. Reproduce the newly reported failures as regressions and prove their fixes on that exact candidate. Existing positive counts do not override the reproduced scanner failure or missing principal-bound behavior.

## Fable handoff and non-overlap boundary

1. Fix the scanner's unsupported-object-stream handling and bounded exhaustion behavior with focused fail-closed tests.
2. Make partner/admin downloads and the new admin body/outcomes synchronously principal-safe; add delayed-response logout/switch/unmount regressions.
3. Produce fresh real-control logout/account-switch evidence, then hash and bind the complete evidence set to the exact integrated runtime and harness.
4. Preserve ff3 account/partner hardening and verify exact Resources route reachability under ordinary authentication without weakening server permissions.
5. Reconcile the canonical task/lease with A before further cross-owner edits. Request independent review of the final pushed candidate. Do not start another lane, apply the candidate SQL, enable flags, deploy, or contact real users under this review.

No role-specific materials were written. Any future ASTRA-B material allocation needs an explicitly non-overlapping destination (for example an agreed `docs/resource-hub/materials/astra-b/**` subtree) and separate approval for associated source/intake/asset paths. Permission to write this review is not permission to write those materials or edit Fable's worktree.

**Final decision: BLOCK. b28 is a pushed code candidate with a clean records-only handoff successor, but the source defects and acceptance gaps above remain open. No production action is authorized or represented as completed by this review.**
