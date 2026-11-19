# Canonical referral journey — Workstream A

Owner: continuing backend specialist `codex-ea-ae-workspace-20261118`, task `EA-CANONICAL-REFERRAL-JOURNEY-20261119`. Root retains integration, activation and file allocation. Initial custody is this report only; no referral server, SQL, UI or financial source has been edited.

Inspected source: **859e1fcf89e41af49b912dd4de6498238b76f9fb**, isolated worktree `C:/xenios-wt/ea-canonical-referral-journey-20261119`. Root identifies run44438986492 as current qualification; this author has not observed its results and makes no combined PASS claim. No local heavy execution, CI, browser, provider or managed action occurred.

## Outcome and readiness

The required John/Sam story is not yet demonstrated end to end. Durable first-valid account attribution already exists and must be reused. The highest-value entry gap is **readable code -> Referral V1**, followed by a distinct **canonical paid/repeat order -> approved schedule ledger** production adapter. Reported intake text does not close either gap.

For the November19 Chicago morning target, do not distribute a reported text value as a promise of persistent tracking or earnings. An existing opaque V1 link is source-supported only when the current feature, schema, secret, canonical partner eligibility and verified-account paths are configured and qualified. No particular Sam account, approved schedule, public feature state, distributed code or live conversion was verified by this author. A readable-alias source increment alone would not establish commission readiness.

## Existing coordination, no duplicate tickets

Actual Jira records read:

| Record | Reuse |
| --- | --- |
| [KAN-71](https://xeniostechnology.atlassian.net/browse/KAN-71) | Canonical affiliate attribution parent. `XRM-2051` is its stable dedup anchor, not a Jira issue key. |
| [KAN-136](https://xeniostechnology.atlassian.net/browse/KAN-136) | Revocation, expiry and replay resistance. |
| [KAN-137](https://xeniostechnology.atlassian.net/browse/KAN-137) | Sign-in/request/canonical-order conversion join. |
| [KAN-139](https://xeniostechnology.atlassian.net/browse/KAN-139) | Member referral rewards versus partner attribution and economics. |

Full actual KAN-225/13639 Prompt2 was read. Actual author pickup was posted as [KAN-225/13644](https://xeniostechnology.atlassian.net/browse/KAN-225?focusedCommentId=13644). No new issue was created. Jira ToDo/Proposed status is not evidence that existing source is missing.

## Current source contract

| Seam | Exact source | Observed state and boundary |
| --- | --- | --- |
| Canonical V1 link/capture | [tokens:6](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/referral-v1-tokens.ts#L6), [routes](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/referral-v1-routes.ts) | Opaque `r1_` plus43 case-sensitive base64url characters. Public resolve/capture bodies accept this token contract only. Existing bootstrap, signed visitor, CSRF, same-origin, durable limiter, link state and capture checks are reused. |
| Readable code | [V1 SQL](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/supabase/candidates/20260904_research_partner_referral_v1.sql#L95) | V1 `research_partner_links.code=id::text`; token hash is distinct. No readable-alias resolver into V1 was found. The older `research_affiliate_links` readable registry belongs to a separate v2 partner table; it cannot be joined by name/code to invent a V1 partner. |
| Reported intake | [referral-input](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/shared/research/assisted-order/request-intent/referral-input.ts) | Reported code is2–24 ASCII letters/digits/hyphen and reported name is bounded text. This is explicitly not verified attribution, account identity, AE assignment, entitlement or commission. Current form custody remains with its writer. |
| Verified identity -> binding | [member probe:336–345](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/members.ts#L336), [production hook:44](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/referral-v1-production.ts#L44) | Canonical member/me hydration already calls the optional capture binder after authentication; explicit bind also exists. SQL resolves the canonical Auth/member and exact signed touch, checks first-valid ownership and eligibility and rejects self-referral. No additional sign-in bind hook is proposed. |
| Returning/cross-device | [attribution resolver](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/referral-v1-attribution.ts#L42) | Authenticated `bindingAt(actorAuthUserId, occurredAt)` is read before any cookie. A later cookie cannot silently steal an existing account binding. Visitor/capture cookies are provisional, browser-bound locators. |
| Corrections and history | [V1 store](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/referral-v1-store.ts), [routes transfer](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/referral-v1-routes.ts) | Existing future-only admin transfer has expected revision, actor, reason and controlled-reference hash. Historical attribution and old paid activity must remain intact. Revoked/expired links can block new captures without erasing the established account relationship. |
| Assisted request attribution | [legacy submit HTTP:253](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/assisted-order/http.ts#L253), [Root composition:995](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/index.ts#L995) | The older assisted-order submit uses the V1 resolver. Current request-intent reported snapshot is not this verified attribution. No inference from contact text or declared code is permitted. |
| Paid evidence | [payment settlement:805](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/assisted-order/payment/service.ts#L805), [settlement port:90](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/assisted-order/payment/ports.ts#L90) | Actual authorized settlement and idempotent settlement keys exist. A payment claim/upload/request/quote alone is not a committed economic event. The required adapter to the ledger's canonical order UUID and money-fact contract was not found in the assisted-order source. |
| Approved versioned schedules | [authority](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/commission-schedules/authority.ts), [catalog](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/shared/research/commission-schedules/catalog.ts) | Existing per-partner effective binding, version/hash, signed evidence, temporal eligibility, exclusions and repeat-term rules. A catalog definition is not proof that any particular Sam has that approved binding. No numerical rate is selected here. |
| Accrual/reversals | [schedule ledger:371](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/commission-schedules/ledger.ts#L371), [persistence](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/commission-schedules/supabase-repository.ts) | Canonical money facts, integer cents, authentic schedule snapshot, settlement-key idempotency, atomic period entries and refund/chargeback reversals exist. Search found no production implementation of `loadAccrualFact` and no production constructor caller of `createCommissionLedgerService`; the fact source is presently a port. |
| Dormant older economic path | [accrual-bridge](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/accrual-bridge.ts), [commissions](https://github.com/teamxenios/xenios-website/blob/859e1fcf89e41af49b912dd4de6498238b76f9fb/server/research/partners/commissions.ts) | Older Gen2 bridge/formula and append-only ledger exist. Search found no production `onSettledPayment` caller. Do not mount an old formula to bypass approved schedule authority or count two engines for one event. |
| Partner/operator views | Existing V1 own-links/lifecycle/admin transfer routes and sanitized ledger partner stats in commerce production-deps | Source surfaces exist; new alias controls and verified first/repeat outcomes still need the actual UI owner and assembled qualification. No unavailable metric is a factual zero and no customer/clinical disclosure is added. |

V1 runtime gates in source are `RESEARCH_REFERRAL_V1_ENABLED==='true'` plus existing affiliate portal/codes gates and secret/schema readiness. Actual live values and approved partner/program rows were not queried. Member referral credits and legacy rewards remain separate capability-gated source; none is an affiliate cash payout or AE assignment.

## John/Sam stories and exact missing joins

| Story | Existing behavior | Missing evidence/connection |
| --- | --- | --- |
| New John follows valid opaque V1 link | Bootstrap/capture can record a signed provisional touch; canonical member binding can save first-valid attribution after legitimate account authentication. | Actual deployed/configured path, completed account journey and end-to-end owned-PG/browser receipt. Workstream B owns account UI/recovery connections. |
| New John types Sam's readable code | Current intake can retain reported text. | Server-readable alias -> exact V1 link/capture; truthful provisional/saved UI. No fuzzy registry or name match. |
| Returning John on another device | Authenticated resolver reads the existing server account binding without the old cookie. | A real returning-account assembled execution; current account login path qualification. Do not add a second bind hook. |
| Second account/shared device | Existing first-valid signed-touch claim and account conflicts are authoritative. | Integration tests must prove no inherited binding or disclosure through stale cookies/account changes. |
| Request -> first paid/repeat order | Existing payment settlement and schedule services can be reused. | Concrete canonical order/payment/price/customer-binding/relationship fact adapter and idempotent event caller. Repeat eligibility follows the recorded approved schedule, not an unlimited attribution promise. |
| Refund/statement/payout | Reversal/ledger/provider/projection source exists. | Correct actual settled adjustment lineage and operator reconciliation. No payout execution, paid-status claim or distribution is authorized. |

Original guest proof work is not duplicated. Continuing custodian7858 and optional expirya464 are Root-reported SOURCE ACCEPTED, newly authored tests UNRUN. The original ref/H1/H2 and current proof unavailable defaults remain intact. Those source increments do not themselves establish a verified request/account claim in production.

## First implementation proposal and exact path request

Propose one bounded readable-alias increment before touching payment/commission execution. Use an alias strictly over a canonical V1 link; it contains no partner/customer/economic authority of its own. Prefer a bounded FK alias relation if altering the existing V1 row shape would disturb its guarded installer. Existing older v2 partner codes are not an alternative identity source.

Proposed syntax is3–24 ASCII letters/digits/hyphens, normalized with outer trim and ASCII uppercase for aliases only. Opaque tokens remain exact and case-sensitive with no normalization. Any pasted-link support must accept only the configured canonical origin and intended `/r/<selector>` route, with no credentials/query/fragment or redirect inference. Link lifecycle, partner state, first-valid policy, visitor/CSRF, durable limiter and same-origin protections remain the existing authority.

Alias creation/assignment must use current verified actor -> existing eligible canonical partner -> owned V1 link, unique normalized code and idempotent audited operation. Never accept a submitted partner ID, account ID or rate. Resolve alias server-side to the existing link/token-hash path; public output stays the permitted generic/public partner projection. Missing alias capability is unavailable, not an absent relationship. Existing opaque links must continue working when optional alias SQL is absent. No source-only SQL or code alias is an activation/distribution approval.

Requested finite coding custody, **not yet granted**:

1. `shared/research/referral-v1.ts`
2. `shared/research/referral-v1.test.ts`
3. `server/research/partners/referral-v1-routes.ts`
4. `server/research/partners/referral-v1-routes.test.ts`
5. `server/research/partners/referral-v1-store.ts`
6. `server/research/partners/referral-v1-store.test.ts`
7. `supabase/candidates/referral_v1_readable_aliases.sql` (new candidate)
8. `server/research/partners/referral-v1-readable-aliases.pg.test.ts` (new actual PG qualification)

Root should grant one coherent subset and settle its shared DTO with the current UI owner. No writes to these paths occurred in this assessment. Existing form/C2, Root global wiring, account Workstream B and original-guest leases remain separate. This report is the sole currently granted repository write.

Meaningful authored qualification after grant: opaque link and alias converge on one canonical link/partner/touch decision; alias uniqueness and competing assignment; wrong owner/self-referral/revoked/expired/inactive rejection; member first claim and concurrent winner; different-device account resolution; shared-browser second account isolation; missing alias capability leaves opaque behavior unchanged; retry/feature-off/deletion do not resurrect attribution; no request produces earned commission. Use actual V1 SQL/store/routes, then UI owner tests the combined form/navigation. No helper or mock-only screen is end-to-end evidence.

## Next economic increment, kept separate

After the entry contract is qualified, implement a trusted fact source over actual canonical order UUID, committed payment settlement/adjustment, price authority, verified effective customer binding, accepted relationship and partner/program state. Feed the existing schedule ledger and its atomic commit/reversal mechanism. Do not add a balance, default rate, discount, clinical cash path or lifetime entitlement. Missing data/schedule stays unavailable/noncommissionable by its canonical outcome.

Before requesting those paths, confirm the actual request/quote-to-order UUID and settlement lineage with their existing owner. A source port named `CanonicalCommissionFactSource` is not evidence of that join. Root owns final event wiring and exact activation. Finish source/fixtures/review while any missing commercial record is routed once to its existing owner; Samuel need not restate confirmed company direction.

## Evidence limits and next owner

Actual evidence here is targeted source/Jira inspection only, against exact859. Relevant unchanged V1 attribution/routes/database/touch-attribution and schedule ledger/authority tests were located; they were not executed or relabeled PASS. Reuse their valid identified prior receipts when Root supplies them; qualify the changed joins on the actual assembled source.

Root received initial findings and retains the implementation grant decision. Workstream B received the existing member/me bind hook and explicit no-competing-history-claim-UI scope. The next executable author output is the granted alias server/SQL increment; until that grant arrives, this report and the private exact proposal are reviewable preparation, not implementation or morning distribution readiness.
