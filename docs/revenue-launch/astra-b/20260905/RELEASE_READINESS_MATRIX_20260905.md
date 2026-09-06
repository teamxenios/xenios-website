# ASTRA-B release-readiness matrix — 2026-09-05

This matrix audits the founder-authorized paired Seth revenue-launch objective
against the current A worktree and committed evidence. It distinguishes local
engineering proof from production authority. No row below grants permission to
deploy, migrate, activate prices, change flags, or send communications.

| Requirement | Evidence | Current result |
| --- | --- | --- |
| Non-overlapping paired leases | `.xenios/ACTIVE_TASKS.json`; ASTRA-A owns integration/release and ASTRA-B owns the Product Control/reconciliation review paths | **Recorded; ASTRA-B lease remains QA pending A acceptance** |
| Preserved synchronized work | A branch and origin at `8f444fe8796f0b1275d5504f03b6a22c653d46ce`; clean worktree | **PASS** |
| Catalog/product mapping and formulation exceptions | Focused suite: 15 files / 191 tests passed; canonical reconciliation artifact has 39 rows and six formulation-confirmation holds | **PASS locally; all affected rows remain blocked** |
| Product Control V3, pricing review, and readiness UI | Product price review, admin projection, reconciliation adapter/panel, tier/readiness tests in the focused suite | **PASS locally; review-only authority** |
| Customer/admin UX and QA | Full serial suite: 876 files passed, 5 skipped; 13,507 tests passed, 59 skipped, zero failures; build/typecheck/route census/site record checks pass | **PASS locally** |
| Browser journey evidence | Fable packet: 20/20 captures, 16 automated passes + 4 expected denial notes, zero automated failures; scope is `UI_PRESENTATION_ONLY` and PII/PHI review is manual-pending | **Partial; not authenticated production proof** |
| Exact engineering candidate | Runtime candidate `13c971ceaeb20bf60c8061fc7d0739101499a668`, tree `e1e0abb247d3913a6c058a0fbd24b8cb6e5f26e8`; records tip `8f444fe8796f0b1275d5504f03b6a22c653d46ce` | **Documented; releaseCandidateSha intentionally unset** |
| Supplier/product evidence | Canonical reconciliation: 39/39 blocked; supplier confirmation, inventory/capacity, Seth price approval, and exact release approval each missing on all 39 rows | **BLOCKED truthfully** |
| Production migration and schema authority | Migration ledger version list is verified; remote SQL/object parity is unverified; migrations unapplied; production authorities absent | **BLOCKED pending authorized preflight** |
| Production mutation boundary | `.xenios/RELEASE_STATE.json`: `productionMutated=false`, `migrationsApplied=false`, `priceBatchActivated=false`, no production approval | **PASS — no mutation performed** |

## Exact current production facts

- Live SHA: `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`
- Render service: `srv-d8s9vej7uimc7384dfcg`
- Live deploy: `dep-dad08h740ujc73aprfcg`
- `releaseCandidateSha`: unset
- `productionApproval`: unset
- Approved-customer authenticated journey: unverified
- Runtime environment verification: unverified
- Production and Referral V1 authorities: absent

## Runtime-to-records boundary

The current A tip `8f444fe8796f0b1275d5504f03b6a22c653d46ce` differs from the
reviewed runtime candidate `13c971ceaeb20bf60c8061fc7d0739101499a668` only in
coordination/evidence/Site-System-of-Record paths. The runtime candidate tree
is `e1e0abb247d3913a6c058a0fbd24b8cb6e5f26e8`; the records tip tree is
`5568b4acbddbe5163f514e39c0647065c637d687`. No non-document source path is in
that delta.

The matrix is an engineering handoff, not a production GO. Samuel must later
approve one exact final SHA and the listed production mutations before any
release action.

## Read-only Render observation

The Render monitoring read confirmed service `srv-d8s9vej7uimc7384dfcg` is
healthy and not suspended, with auto-deploy **off**. Its latest live deploy is
`dep-dad08h740ujc73aprfcg`, commit
`db5a2d447114c1e8a14185a9865ded50ee3f1ac6`, status `live`. No deploy was
triggered by this observation.

The public health endpoint `https://xenios-website.onrender.com/api/health`
returned HTTP 200 with `status: "Xenios API is running"`; the response reports
`commerceEnabled: false`, consistent with the closed production price/commerce
gate. This was a GET-only observation with no mutation.
