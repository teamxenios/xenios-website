# Website 1 Remaining Scope

| Requirement | Original assignment | Current implementation | Live production state | Classification | Remaining work | Owner | Release train |
|---|---|---|---|---|---|---|---|
| Server-authoritative initial-v2, six sections, 6–8 minutes | Assessment directive | Implemented and client-rendered from server definition | Not deployed | COMPLETE_NOT_INTEGRATED | Merge/deploy and live smoke | Website 2 | 0 |
| Historical initial-v1 completion | Assessment directive | Submitted v1 remains completion-equivalent/readable | Not deployed | COMPLETE_NOT_INTEGRATED | Production regression smoke | Website 2/6 | 0 |
| Active-member authorization | Assessment directive | `requireActiveMember` on read/save/submit | Not deployed | COMPLETE_NOT_INTEGRATED | Live persona test | Website 2/6 | 0 |
| Immutable health-data consent | Assessment/privacy directive | Collection requires explicit flag plus published/effective/hash-valid XR-MEM-012; acceptance binds displayed hash | Counsel content absent | BLOCKED_BY_EXTERNAL_INPUT | Approve and publish content; configure flag | Legal owner + Website 2 | 0 |
| Withdrawal at any time | Privacy directive | Historical version/hash withdrawal; paused/closed subject session limited to privacy route | Not deployed | COMPLETE_NOT_INTEGRATED | Browser test after merge | Website 2/6 | 0 |
| Server autosave and cross-device resume | Assessment directive | Server draft authoritative; optimistic revision and cycle protection | Not deployed | COMPLETE_NOT_INTEGRATED | Live two-session smoke | Website 2/6 | 0 |
| Local failure fallback | Assessment directive | In-memory current-page fallback; browser persistence intentionally removed to prevent cross-account health leakage | Not deployed | COMPLETE_NOT_INTEGRATED | Verify copy and no Storage writes | Website 6 | 0 |
| Hidden conditional answer deletion | Assessment directive | Client sends explicit null tombstones; server deletes stored key | Not deployed | COMPLETE_NOT_INTEGRATED | Browser regression | Website 6 | 0 |
| Idempotent submission and locked initial response | Assessment directive | Implemented with state/revision guards | Not deployed | COMPLETE_NOT_INTEGRATED | Production retry smoke | Website 2/6 | 0 |
| Monthly check-in | Assessment directive | Separate definition/cycle, stale-month rejection, member-home next action | Not deployed | COMPLETE_NOT_INTEGRATED | Live current-cycle smoke | Website 2/6 | 0 |
| Deterministic v2 recommendation compatibility | Assessment directive | v2 schedule/structure fields consumed; v1 fallback preserved | Not deployed | COMPLETE_NOT_INTEGRATED | Focused safety verification | Website 6 | 0 |
| Durable Plan Brief generation | Assessment directive | Submitted responses are retry jobs; one Blueprint per response structurally enforced | Not deployed | COMPLETE_NOT_INTEGRATED | Production queue retry smoke | Website 2/6 | 0 |
| Trainer review queue and minimum-necessary brief | Assessment directive | Server routes, audit, adapters, and `BlueprintReview` page implemented | Route not wired | COMPLETE_NOT_INTEGRATED | Shared route/nav registration | Website 2 | 0 |
| Atomic human publication | Assessment directive | Advisory-locked RPC; one published Blueprint; exactly one active monthly plan draft including A→B→A | Migration unapplied | COMPLETE_NOT_INTEGRATED | Apply migration and smoke | Website 2 | 0 |
| Member acknowledgment | Assessment directive | Version-bound existing Blueprint flow; overview uses sole published row | Not deployed | COMPLETE_NOT_INTEGRATED | Browser smoke | Website 2/6 | 0 |
| One dominant member-home action | Acceleration directive | Assessment, review, monthly check-in priority implemented | Not deployed | COMPLETE_NOT_INTEGRATED | Add domain-owned order/request signals when their canonical contracts land | Website 2/3 | 0/1 |
| Full trainer assignment scope | Assessment directive | Assignment field and reviewer scoping exist | No shared assignment UI | PARTIALLY_IMPLEMENTED | Integrate assignment control into canonical admin operator surface | Website 2 | 0 |
| Fitness/nutrition document publication | Assessment directive | Human-review plan drafts are created; existing plan/document publication remains canonical | Not live through this release | PARTIALLY_IMPLEMENTED | Website 2 wire canonical plan authoring/publication surfaces | Website 2 | 0 |
| Trust/evidence/quality layer | Report directive | Governing scope read and queued; no mega-diff added here | Not started | INTENTIONALLY_DEFERRED_WITH_APPROVAL | Start fresh five-wave branch only after Assessment + first product release live | Website 1 | 4 |

