# KAN-31 B3 hosted run 39044855017: real staging bootstrap passed; stopped at the harness card match `EXACT_UI_VARIANT`

**CHANGES REQUIRED (harness).**

- **What it proves.** The first real-staging proof that the public login-free bootstrap works for two fresh anonymous
  browsers: unlock, durable agreement acceptance, authenticated anonymous sessions and the catalog.
- **Where it stopped.** At the driver's first product-card lookup, before any request POST.
- **No data was created.** There were no request-intent POSTs and no request rows.
- **The single B3 attempt is consumed.**

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only.

## Run

- **Opening (KAN-31 10138).** Deploy `dep-db9p2dmq1p3s7392ph60` on `8efa9a9e`, live at 15:17:22.116Z, with
  `openAccess:true`, under founder authorization 10137.
- **Run 39044855017.** `workflow_dispatch` at head `fa4292e48d747d28ebbf80f6bde44d58a0ecfd09` (= B3), created
  15:23:47Z. Bundle validation and the tool inventory (455 files) passed. The browser step ran 15:24:15Z–15:24:40Z and
  exited 1.
- **Preflight.** App `8efa9a9e`/`0c92fdc6`, manifest `900bea77…`, proof `bdecf18c…`, provider-only basis. It started at
  15:24:16.569Z.
- **Not verified yet.** I have not seen this run's comparator record. Root must post `PRE_DISPATCH_COMPARISON.json`
  (B3 `6e10eff3`, the changed-field list, proof `observedAt` and the hashes) for me to confirm the Doc 235 rule.
- **Evidence artifact `12105735783`.** ZIP `f5ebba07…`, holding `browser-evidence.json` (39,691 B),
  `preflight.json` and `normal_doubleclick.plan.json`. It was read with path checks; nothing was executed.

## What the evidence proves (real staging, first time)

- **Accounting.** 144 requests, all same-origin and all `DELIVERED` with 200. No `ABORTED_BY_BOUNDARY`. Forwarding
  peak was 8 active and 4 pending, so the FIFO fix works on the real site.
- **Browsers A and B each:**
  - loaded the page and its assets;
  - sent one `POST /unlock`, which returned 200;
  - got an authenticated anonymous session (cookie `HttpOnly`, `Secure`, `SameSite=Strict`);
  - loaded the request-intent config, policies and agreements;
  - sent one `POST /agreements/accept`, which returned 200;
  - re-checked the session and stayed authenticated.
- **Sessionless control C** loaded the config.
- **The driver froze the real catalog** (`catalogSha256` `0a8e7595…`, `configSha256` `1cfbddd0…`) and the case plan
  for `normal_doubleclick`:
  - Line 1: 5-Amino-1MQ, `5-AMINO-1MQ 50 mg`, Research Use Only, quantity 2.
  - Line 2: 5-Amino-1Mq, `5-AMINO-1MQ 5MG/ML (5ML)`, clinical review required, quantity 3.
  - The four form acknowledgments plus the terms.
- **Cleanup.** 0 active, 0 pending, 0 handlers; contexts and browser closed.
- **First failure:** `EXACT_UI_VARIANT`, phase `a-session-before-normal_doubleclick`, at 15:24:40.233Z. `cases: []`.
  **There were no request-intent POSTs, so no request rows exist.** `dbPersistenceVerified` is false.

## Cause (harness, `populate()` in `hosted-browser.UNAPPLIED.mjs`)

```js
const response=page.waitForResponse(r=>r.url().startsWith(m.origin+API+'/catalog?'));
await page.getByLabel('Search catalog',{exact:true}).fill(item.productName);
await response;
const card=page.locator('article.xenios-order-card')
  .filter({has:page.getByRole('heading',{name:item.productName,exact:true})})
  .filter({hasText:item.specification || 'Form not stated'});
need(await card.count()===1,'EXACT_UI_VARIANT');
```

The evidence does not record the observed count, so the exact sub-cause cannot be read from the artifact. The code
supports two concrete defects; either one alone produces this failure.

1. **Race (count 0).** `locator.count()` does not wait. It runs as soon as the first matching catalog response
   arrives, before React re-renders the filtered list. The app (`RequestIntentForm.tsx` at `8efa9a9e`) sets
   `search` on change and renders from state afterwards.
2. **Substring match (count 2 or more).** `filter({hasText})` is a case-insensitive substring match. Any other
   "5-Amino-1MQ" card whose specification contains `5-AMINO-1MQ 50 mg` (for example a longer pack description)
   matches too. The heading filter is exact, but the specification filter is not.

This is not an application defect. The page rendered and the session, agreement and catalog APIs all returned 200.

## Required correction (Core), offline before any new window

1. **Exact match.** Select the card whose `h2` text equals `productName` and whose specification `<p>` text equals
   `specification` exactly, after trimming. Use an exact-text locator, not `hasText`.
2. **Bounded wait.** Replace `count()` with an auto-waiting assertion,
   `expect(card).toHaveCount(1,{timeout:≤5000})`, bounded inside `requestTimeoutMs` and the run deadline. On timeout,
   fail `EXACT_UI_VARIANT`.
3. **Diagnostics on failure.** Record `uiVariantObservedCount` plus the sanitized heading and specification text of
   the cards whose heading matches. This is public catalog text with no personal data. The next failure then names
   its sub-cause.
4. **Search response.** Wait for the catalog response whose URL `search` parameter equals the filled term. Do not
   accept any catalog response.
5. **Offline rehearsal on the real bundle.** Extend the loopback diagnostic so its synthetic catalog includes these two
   real entries, a decoy with the same name whose specification extends `5-AMINO-1MQ 50 mg`, and a delayed search
   response. It must pass through to the frozen submit boundary with the synthetic API: products added, contact
   validation, acknowledgments and the submit button. Then re-rehearse.
6. **Then the run chain again.** A new PR, my review, a new baseline for the new `main` SHA under Doc 227, and
   Samuel's new single-run approval.

## Closure

The attempt has settled. **Samuel: close staging now.** Set `RESEARCH_EARLY_ACCESS_OPEN_ACCESS=false`, Save only, and do
a Manual Deploy of `8efa9a9e`. It was still `openAccess:true` at 15:25:55Z. The deadline is 19:17:22Z. I will verify
closure in KAN-31.

NOT LIVE. No SQL. No production.
