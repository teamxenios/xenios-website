# Production deploy record — Early Access open access, 2026-08-20

Executed by the lead on the founder's explicit GO, in the ordered two-step
sequence the directive required.

## Identity

| | |
|---|---|
| **Deployed SHA** | `7896438477d00b94f292b2f3667fae2d532a8505` |
| **Code deploy (step 4)** | `dep-da3lj5rm8hqs73cb3ti0` — live 19:47:24Z |
| **Flag redeploy (step 8)** | `dep-da3ljvrrn74s73fjg66g` — same SHA, picked up the flag |
| **Previous SHA / rollback** | `0aba72675297f5d8fadeb91af4acbaff7026d30c` |
| Migration | **none** |
| Env changed | `RESEARCH_EARLY_ACCESS_OPEN_ACCESS=true` (one variable, added) |

## Why the order mattered, and that it held

A Render environment update auto-deploys the branch head. Setting the flag first
would have deployed `0aba726`, which has no open-access code, and the flag would
have been read by a build that does not know what it means. So the code went
first and was proved live and correct BEFORE the flag existed.

The intermediate state was verified rather than assumed: with the new code live
and the flag still off, `/api/research/early-access/session` reported
`{"authenticated":false,"openAccess":false}` — the field present (new code) and
false (password still required) — and unlock refused both an empty body and a
wrong password with `401 invalid_credentials`. The password-gated flow was
intact at that moment, which is what step 6 exists to establish.

## Verified live, after the flag

- **Open access reported**: `{"authenticated":false,"openAccess":true}`.
- **Anonymous session minted with no password**: `POST .../unlock` with `{}`
  returns 200 and sets `__Host-XeniosPrivateEarlyAccess` — `HttpOnly`, `Secure`,
  `SameSite=Strict`, `Max-Age=14400` — plus the customer continuity cookie.
  It reads back `{"authenticated":true,"openAccess":true}`.
- **Private surfaces still refuse, WHILE HOLDING that session** (401 on every
  one): admin outbox, admin assisted-orders, member/me, profile, applications,
  documents, partners portal.
- **Agreements still required**: the standing read returns
  `required:[{early_access_terms v1}], accepted:false`. An open gate is not
  consent.
- **Order ownership is still session-scoped**: a well-formed XRR this session
  does not own answers **404 not_found**, never 403, so it cannot become an
  existence oracle. The same reference with no session answers 403. A lookalike
  reference stays walled at 401, so the anchored admission did not become a
  prefix exemption.
- **Anonymous session minting is bounded**: 14 consecutive unlock attempts from
  one address produced 6 minted and 8 refused. The limiter engaged.

## Follow-up deploy — the release was NOT complete at the flag

**Step 9 of the founder's sequence failed on first check**, and only a real
browser could see it. With every API open and `openAccess:true` reported,
`/research/early-access` still rendered "Enter the access password to continue".

The gate was one layer above the server: `client/src/research/layout.tsx` gates
the whole research tree on a path allowlist, and the Early Access route had
never been added to it. Nothing on the server reported a problem because nothing
was wrong there. Two individually-correct layers disagreeing, failing as a
plausible-looking page rather than an error — the same shape as every other
defect found this day.

| | |
|---|---|
| **Follow-up SHA** | `ce1590fa08dcb5eae299bcaf55e799ad9ea092d1` |
| **Deploy ID** | `dep-da3lomjrn74s73fjvdpg` |
| Predecessor | `7896438` | 
| Migration / flag change | none |

Verified live in a real browser at 375x812 after this deploy:

- `/research/early-access` renders **PRIVATE EARLY ACCESS / Research Catalogue**
  with the 8-step journey and **no password input at all**. The anonymous
  session is minted automatically and the customer lands on step 2, Identity and
  Agreements — agreements still gate ordering, exactly as intended.
- **No horizontal overflow** at 375 (`scrollWidth` 375 = viewport).
- The allowlist did not leak: `/research/member` still renders the shared review
  password page, with a password input, in the same browser.
- Private APIs still refuse: admin outbox, member/me, applications, documents
  all 401.

Known P2 carried forward: the input on this step computes to 13.3px, below the
16px threshold at which iOS Safari zooms on focus. Cosmetic, already logged.

## Rollback

1. Unset `RESEARCH_EARLY_ACCESS_OPEN_ACCESS`. Password mode returns immediately
   — the mechanism was retained, not deleted, and the prompt renders again the
   moment the server reports `openAccess:false`.
   NOTE: the password hash env must be present for the gate to open in that
   mode. If it has since been retired, restore it in the same step, or the
   config reports `PASSWORD_HASH_MISSING` and Early Access closes.
2. Runtime rollback to `0aba726` only if step 1 is insufficient.
3. No migration to reverse.

## Operator note

The lead's own address is inside the unlock lockout window for a short period as
a direct result of the step-13 rate-limit proof. That is the control working,
not a fault.
