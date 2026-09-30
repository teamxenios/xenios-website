# Claude independent disposition: Health launch, 2026-09-30 noon CT checkpoint

**Status of this file:** draft, prepared at 08:20 CT. It will be updated by exact SHA/tree if a Codex successor
is pushed before noon.

## Source candidates reviewed

| Candidate | SHA / tree | Reviewed | Disposition |
| --- | --- | --- | --- |
| Frozen UX runtime | `c213707a9d80ecc9f772b5790acb52f1fa503da7` / `09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0`, reviewed at tip `8e0271e9` | Full source trace, focused tests, local browser | **FAIL for the Health launch goal**: 3 × P1 (HL-01, HL-11, HL-12). No P0. It remains a safe, qualified UX closeout for `/status`, and nothing here reverses the earlier P0-P2 = 0 result for that narrower scope. |
| Codex primary successor | none pushed to `origin` as of 08:20 CT | — | **NOT RUN**: no successor exists. A watcher is armed. |

## Journey dispositions (candidate `c213707`)

| Journey | Disposition | Basis |
| --- | --- | --- |
| Understandable `/health` entry | **FAIL** | HL-01. `/health` redirects to `/`; the newcomer products loop has no path to the catalog. |
| Full canonical intended catalog | **FAIL** | HL-11. 420 rows are served, generated 2026-08-15, against the 424 the founder decided on 2026-08-21. Three variants are missing and two are misclassified. HL-01: undiscoverable. |
| Exact variants, prices, holds | **PASS (authority) / UNKNOWN (live values)** | The server price authority and holds were traced (`production-catalog.ts:143-220`, `action-policy.ts`), and the client cannot set a price. Live Product Control rows were not read, because the connector is unavailable. HL-13: Care rows display a retail price. |
| Legitimate paid purchase continuity | **FAIL** | HL-12. The only live lane (assisted order) has no server-bound quote or payment amount, and `paid` accepts any string. The request, receipt and status half works (J5-J12). |
| Returning customer status and support | **PASS (local)** | Same browser: the session cookie works and owner isolation holds (J10-J12). Different browser: P-17 `/status` recovery (`91a3e67`). Managed parity is not run. |
| Identity: signup, claim, login, recovery, role binding | **PASS (personal) / GAP (organization)** | Server-resolved member binding, safe returnTo, and recovery-purpose admin denial pass. HL-08: organization-only accounts are mounted over unapplied schema and have no browser journey. |
| Suspended or revoked access | **PARTIAL** | `closed` is denied immediately. `requireMember` admits `paused` and `cancelled` on some writes (agreement POST, partner apply, referral links). Whether the RPCs refuse downstream is UNKNOWN. |
| Money: server totals, snapshots, replay, concurrency, terminal refusal, SQL grants | **PASS for mounted lanes, with gaps** | Totals, replay and concurrency pass in the cart and assisted lanes. Money RPCs are service-role only. Cart lane (recorded disabled): HL-02, HL-05, HL-06. Native lane (dormant): no SQL transition guard. |
| Founder identity and notification recipient | **GAP** | HL-04. `adminRecipients()` falls back to samuel@, but the proof and overdue alerts are hard-coded to research@. HL-09: admin is an env email string with no confirmed-email or user-id pin. Production env values are UNKNOWN. |
| Guarded dashboard commands and audit | **PASS** | Separate guarded commands with audit rows. There is no Approve All. |
| Supplier queue (own, verified-paid, eligible) | **FAIL / GAP** | HL-07: no supplier surface is mounted. HL-03: the dormant cart supplier outbox carries contact details and prices, which becomes P0 at activation. |
| Notifications: event keys, retries, permanent failure, no loop | **PASS (source)** | Outbox with a unique `event_key`, 6 bounded attempts, `failed_permanent` plus an alert, and no `admin_*` loop. Delivery is proven only to provider acceptance. There is no bounce or delivery webhook, and the cart supplier outbox has no worker. |
| Responsive, keyboard, errors | **PARTIAL** | 320 px reflow passes (proxy). HL-15 (P2): the contact step does not identify invalid fields. HL-16 (P3): focus. |
| True zoom | **NOT RUN (Claude)** | The storefront has no native zoom evidence. Codex's native evidence covers `/status` only. |
| Package and automation additions (files 17/18) | **NOT RUN** | There are no successor additions, and the pack files are not mounted. The current source has one unapproved surface, HL-14 (Superpower offer is admin-configurable). |

## Evidence classes

| Class | Result |
| --- | --- |
| Local source trace | Every finding was re-verified at its cited lines. |
| Local tests (Node 20.19.0) | 62 files and 806 tests passed (assisted-order, early-access routes, cart). |
| Local browser | Real bundle over the repository harnesses, with synthetic rows. |
| Managed staging | **Not run.** Blocked on an authorized executor, the application origin, and the missing M71 bridge on the staging project (Codex handoff `8e0271e`). |
| Production | **Not read. Not mutated.** The Supabase production connector failed authentication (401). |

## Release risks

1. **Discovery (HL-01).** Selling to newcomers is impossible until `/products` leads to the real catalog.
2. **Payment identity (HL-12).** Paid orders are not reconciled to an amount. An operator error is undetectable.
3. **Catalog staleness (HL-11).** Founder-decided variants and prices are not served.
4. **Activation hazards.** Enabling the cart, a supplier worker, or Pack02 without HL-02, HL-03, HL-05, HL-06 and
   HL-08 creates P0/P1 conditions.
5. **Operator blindness (HL-04).** Proof and overdue alerts go to research@. Whether Samuel receives them is
   unverified.

## Required next checks

1. Codex fixes HL-01, HL-11 and HL-12 (source), then Claude re-reviews the exact SHA/tree.
2. Run a read-only production observation, with Samuel's approval for the read:
   - `RESEARCH_EARLY_ACCESS_OPEN_ACCESS`
   - `RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED`
   - `ADMIN_EMAIL`, `ADMIN_EMAILS`, `RESEARCH_NOTIFICATION_EMAILS`
   - research@ routing
   - Product Control `member` price rows for the 424 variants
3. Get a founder decision on the Retatrutide rows and on the Superpower surface.
4. Run managed-staging qualification only after predecessor M71 is authorized and installed.

**No production GO is given or implied.**
