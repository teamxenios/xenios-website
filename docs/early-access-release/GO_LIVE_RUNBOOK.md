# Private Early Access, go-live runbook

Everything in the repository is ready. What remains needs production credentials
and founder authority, which is why each step below is yours rather than mine.

Release candidate: `6ce298418b63878fe557bc9cc0b6fca14401aba7`
Branch: `claude/f5-flow-held-controls` (pushed)
Host: Render (`render-build` / `start` in `package.json`)

Gates at this exact SHA: full suite 7,045 passed / 27 skipped / 0 failed,
typecheck 0 errors, client build green, core-site-protection verifier PASS,
`server/index.ts` and `server/research/index.ts` untouched.

## The accepted opening set

19 products, 22 visible units, **18 purchasable**. Four units are visible, priced
at nothing, and carry no purchase control of any kind.

| Unit | Held because |
| --- | --- |
| Tesamorelin 10 mg (PEP-007) | `STRENGTH_DISPUTE_UNRESOLVED` |
| NAD+ **500 mg** (PEP-009) | `STRENGTH_DISPUTE_UNRESOLVED` |
| MOTS-C 10 mg (PEP-010) | `STRENGTH_DISPUTE_UNRESOLVED` |
| Cagrilintide 10 mg (PEX-028) | `NO_FOUNDER_RELEASE`, your commercial decision |

**NAD+ 1000 mg stays purchasable at $100.75.** The dispute is recorded against
the 500 mg strength, not the product, so holding the whole product would
withdraw a strength you approved and priced over a dispute that is not about it.
Say the word if you want NAD+ withdrawn entirely and it is a one-line change.

This set is enforced by
`server/research/early-access/release/opening-set.acceptance.test.ts`. A later
change that quietly opens a held unit, or hides one, fails that test.

## Step 1, generate the member password hash

Never send me the password, and never commit it.

```bash
npx tsx scripts/hash-early-access-password.ts
```

It reads from stdin (not an argument, which would sit in shell history and the
process list) and prints only the hash. Give the password to invited members
through the channel you already use.

## Step 2, set the production environment on Render

Set these on the service, with the flag still **false**. Names are from
`.env.example`; the ones marked secret must never appear in git, chat, or logs.

| Variable | Value |
| --- | --- |
| `RESEARCH_EARLY_ACCESS_ENABLED` | `false` for now |
| `RESEARCH_EARLY_ACCESS_PASSWORD_HASH` | the hash from step 1 (secret) |
| `RESEARCH_EARLY_ACCESS_SESSION_SECRET` | a fresh 32+ byte random value (secret) |
| `RESEARCH_EARLY_ACCESS_SESSION_TTL_MINUTES` | `240` |
| `RESEARCH_EARLY_ACCESS_MAX_ATTEMPTS` | `5` |
| `RESEARCH_EARLY_ACCESS_LOCKOUT_MINUTES` | `15` |
| `RESEARCH_EARLY_ACCESS_COOKIE_NAME` | `xenios_early_access` |
| `RESEARCH_EARLY_ACCESS_OWNER_ID` | the owner UUID |
| `RESEARCH_EARLY_ACCESS_PROOF_BUCKET` | `research-ea-payment-proofs-production` |
| `RESEARCH_SESSION_SECRET` | required in production for signed artifacts (secret) |

Report state back to me only as PRESENT / MISSING / MOUNTED / NOT_MOUNTED. Do
not paste values.

## Step 3, apply migration 57

Not yet applied, and still not authorized by me to apply. It is the last of the
chain, and it is the same clipboard-and-Notepad path as the previous eight. Ask
and I will load the file for you.

Verify afterwards the same way as before: confirm the expected Early Access
tables are present, and confirm migration 47
(`20260801120000_research_variant_strength_write_gate.sql`) is untouched. 47 ran
on 2026-08-02 and is immutable.

## Step 4, deploy with the flag false

Deploy this branch's head. Nothing customer-facing changes while
`RESEARCH_EARLY_ACCESS_ENABLED` is false, so this is the safe rehearsal: it
proves the build boots in production with real credentials before anyone can
reach it.

Then run the production-state check the repo already ships:

```bash
npm run verify:production-state
```

## Step 5, dark smoke

With the flag still false, confirm `/research/early-access` does **not** serve
the storefront, and that the rest of the site is unaffected.

## Step 6, activate

Set `RESEARCH_EARLY_ACCESS_ENABLED=true` and restart.

## Step 7, live browser proof

Tell me when it is live and I will verify against production directly: 22 cards,
18 available, the four held units carrying no price and no purchase control, on
desktop and mobile.

Until then the proof stands at pre-production, in
`docs/early-access-release/browser-artifacts/`.

## Step 8, order-critical smoke

One real end-to-end order through the mounted path, then confirm the money
snapshot and the payment record. Do not run this against a customer's order.

## What I have not done, and will not without you saying so

- Migration 57 is not applied.
- The production feature flag is unchanged.
- Nothing is deployed.
- No secret has been read, printed, committed, or requested.
- Migration 47 is untouched.
- Cagrilintide purchasing is not enabled.

## The one gap in the evidence

Screenshots. The browser pane in my environment was not compositing frames, so
pixel capture timed out. Every control-absence claim is a structural DOM and
accessibility-tree assertion, which is what the requirement asks for, but if you
want pixels before launch, open the harness yourself and look:

```bash
PORT=5214 npx tsx scripts/preview-early-access.ts
```

Then visit `http://localhost:5214/research/early-access`. The harness password is
in `server/research/early-access/routes/route-fixtures.ts`; it is a test
credential, guards nothing real, and the harness refuses to start under
`NODE_ENV=production`.
