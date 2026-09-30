# Claude browser journeys: frozen runtime `c213707`

## What this evidence is

- Date: 2026-09-30, 08:00-08:25 CT.
- The real production client bundle is built from the frozen application source.
- It is served by the repository's own local harnesses, driven by Claude in the desktop browser pane, and run on
  Node 20.19.0.
- **This is not managed or production evidence.** Every store is in memory, and the catalog rows are synthetic
  fixtures. No mail, money or hosted system was touched.
- A shared fixture access password (a repository test fixture) was used only on `127.0.0.1`.

| Harness | Composition | Faithfulness |
| --- | --- | --- |
| `scripts/preview-early-access.ts` (port 5199) | Page gate, research API and early-access API over in-memory stores. It does **not** mount the assisted-order bridge, cart capability or an agreement. | Public pages: faithful bundle. Storefront: **drifted** (HL-10). |
| `scripts/preview-step1-hotfix.ts` (port 5219, `XENIOS_STEP1_PREVIEW_ENABLED=true`, `NODE_ENV=development`) | The real assisted-order production composition, the Express adapter and the SPA over in-memory ports, with **4 synthetic rows**. | Assisted-order request journey: faithful service and route behaviour; synthetic catalog. |

## Journeys

| # | Journey | Result | Evidence |
| --- | --- | --- | --- |
| J1 | Newcomer: `/health` → `/` → Explore Products | **FAIL (HL-01)** | `/health` redirects to `/`. `/products` shows a placeholder. The "Explore Research Products" tile links to `/products`. The primary action is "Check Status". "Existing customers can Sign In to see the full catalog". |
| J2 | Newcomer via `/sign-in` | **FAIL (HL-01)** | "New here? Start Care · Explore Products" returns to `/products`. |
| J3 | `/research` overview | **FAIL (HL-01)** | It describes "the supported ordering flow" but links only to `/products` and `/status`. |
| J4 | Research shell nav "Research" / "Get access" | **FAIL (HL-17)** | The links point to `/research/access-hub`, which redirects to `/` (`App.tsx:258`; `nav.ts:75`; `AccountSignIn.tsx:64`). |
| J5 | Full catalog UI at `/research/early-access` | **PASS (UI)** | "All products" renders with Search, Family and Action filters and a results count. It shows Direct, Request, Care and Held rows with correct actions. Care routes to "Continue through Care". Held rows have no add action. |
| J6 | Agreement gate | **PASS** | Continue stays disabled until the Research Use Policy is accepted. Acceptance names `early_access_terms` `v1`. |
| J7 | Contact step validation | **FAIL (HL-15, P2)** | An empty Continue shows only a generic "Complete all required contact and shipping fields." No field is marked `aria-invalid`, no field is named, and focus stays on `BODY`. Age confirmation is caught separately. |
| J8 | Review step truthfulness | **PASS** | The page says "this submission is an order request, not an accepted order or completed purchase". Totals are labelled "Estimated priced total". Required acknowledgments must be ticked. |
| J9 | Submit and receipt | **PASS (in memory)** | The request `XRR-20260930-C7129ECC61` shows as Received with an estimate of $33.50. It explains the next steps and gives a secure-upload instruction, "Do not email identity documents". Focus lands on `BODY` after each step change (HL-16, P3). The step changes are announced in a `role=status` region. |
| J10 | Returning customer, same browser | **PASS** | The status page shows the timeline and lines. The API returns 200 with the HttpOnly session cookie and 403 without it. |
| J11 | Interrupted session (sessionStorage cleared) | **PASS** | The status page still loads through the HttpOnly early-access session cookie. |
| J12 | Owner isolation | **PASS** | A second, independent session asking for the first reference gets 404 `not_found`, identical to an unknown reference. It cannot tell that the reference exists. |
| J13 | Returning customer, different browser | **Covered earlier** | Recovery through `/status` P-17 (secure link, POST exchange) was verified in `CLAUDE_FINAL_WEBSITE_VERIFICATION.md` (`91a3e67`). |
| J14 | Reflow at 320 px (viewport proxy, **not zoom**) | **PASS** | The storefront at 320x700: `scrollWidth` 320 equals `clientWidth` 320. No element or control extends past the viewport. |
| J15 | True 200%/400% zoom of the storefront | **NOT RUN** | The tools cannot set native page zoom. Codex's native zoom evidence covers `/status` only. |
| J16 | Paid purchase continuity (payment instructions → verified → supplier → shipped) | **BLOCKED locally; source FAIL (HL-12)** | The harness has no operator payment step bound to an amount. In source, `paid` accepts any non-empty string. |
| J17 | Signed-in member catalog and detail (`/research/member/catalog`) | **NOT RUN** | No local composition with Supabase Auth. This needs managed staging. |
