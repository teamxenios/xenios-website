# Referral link 404 fix, and two findings on the shipped declared code

Branch `lane/affiliate-referral-share-path`, cut from the pushed integration
head `c371201`.

**Scope note.** This branch replaces `ccd7f5f` on
`lane/affiliate-attribution-core`. Half of that commit built a declared-affiliate-code
module that another writer shipped concurrently at the SAME path
(`server/research/partners/declared-affiliate-code.ts`), so cherry-picking it
produced an add/add conflict. That half is dropped. **Do not integrate
`ccd7f5f`** — integrate this branch instead. The duplicated branch is left
intact rather than deleted, per the preserve-work rule.

## The fix in this commit: partner links pointed at a 404

Still present on `c371201`:

- `attribution.ts:264` and `member-linkage.ts:271` each built share URLs as
  `{base}/r/{code}`.
- `server/index.ts:558` mounts the door at **`/api/r/:code`** — the route census
  forbids non-`/api` paths.

Nothing serves `/r/`, so every link a partner is issued, and every QR payload
(`qrPayloadFor` returns that same URL), answers 404 and captures nothing.

The other entry cannot substitute for signed links: the client filter is
`^[A-Za-z0-9_-]{2,64}$` and a signed code is ~72 characters containing dots, so
`/research?ref=<signed>` is dropped in the browser before any request is made.

Both URL builders now share one exported `referralShareUrl` over a single
`REFERRAL_SHARE_PATH = "/api/r"`. Already-issued links follow automatically,
because a URL is computed from its stored code on every read. Regression tests
pin the share URL to the mounted door and prove a signed code round-trips and
still verifies.

For the prettier `xeniostechnology.com/r/CODE`, grant the census exception and
flip the one constant to `"/r"`, then register:

```ts
app.get("/r/:code", referralDoor("/r/:code"));
```

I did not add that line — `server/index.ts` is the lead's, and `/api/r/` works
today with no exception.

---

## FINDING 1 (P1) — `?ref=` prefill writes a fake-but-valid affiliate code

`AssistedOrderPage.tsx:226-232` prefills the affiliate field from `?ref=`,
slicing to 40 characters. A signed referral code is ~72 characters, so what
lands in the field is a **truncated fragment of an HMAC signature**. The shipped
normalizer uppercases and accepts `^[A-Z0-9][A-Z0-9._-]*$`, which that fragment
satisfies:

```
real signed code : v1.cGFydG5lci0x.bm9uY2UtYWJj.m3LSDKLbkC491Ao-OReCOIf-6L9eFkaj7YeKbssULLA
prefilled (40)   : v1.cGFydG5lci0x.bm9uY2UtYWJj.m3LSDKLbkC4
normalized       : V1.CGFYDG5LCI0X.BM9UY2UTYWJJ.M3LSDKLBKC4
passes ALLOWED   : true      -> stored as captured_unmatched
matches real code: false     -> and never can: truncated, and case is destroyed
```

So a customer arriving on a legitimate signed referral link produces a declared
code that **looks real, validates, and is unmatchable**. The founder's manual-match
queue fills with signature fragments.

Worth noting the verified path is unaffected — the `xr_aff` cookie still carries
real attribution, so no commission is misrouted. The damage is operator noise
and a misleading audit trail, not money.

Suggested fix (wizard lane owns the file): skip the prefill when the value does
not look like a short human code — the same judgment
`client/src/research/referral-capture.ts` already applies:

```ts
const raw = new URLSearchParams(window.location.search).get("ref") ?? "";
// A signed referral code is not a typeable affiliate code; it belongs to the
// cookie path. Only prefill something a human could have been given.
return /^[A-Za-z0-9._-]{2,40}$/.test(raw) && !raw.includes(".") ? raw : "";
```

## FINDING 2 (P2) — the placeholder invites input the normalizer refuses

`AssistedOrderPage.tsx:677` sets `placeholder="If someone referred you"`, which
invites a person's name. The normalizer's `ALLOWED` refuses spaces, so
`"Jane Smith"` becomes `invalid_ignored`, is dropped, and the customer sees no
feedback. An affiliate who genuinely referred that customer loses the match.

Note the Early Access field
(`client/src/research/early-access/EarlyAccessReferralField.tsx`) takes the
opposite stance in its own copy — *"Referral code or who referred you"* — and
deliberately preserves internal spaces for exactly this case. The two surfaces
disagree about what the field is for.

Cheapest honest fix is the copy, not the logic: a strict code-shaped value is
defensible for an operator console, so make the placeholder say so, e.g.
`placeholder="Affiliate code, e.g. DANA10"`. If the founder does want names,
that is a normalizer change and should be decided deliberately rather than
inferred from a placeholder.

## Gates

```
npx vitest run server/research/partners   -> 16 files, 310 passed
npm run check                             -> clean
```

## Production mutated

NO.
