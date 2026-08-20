# Early Access "Xenios Genesis" Release Packet — 2026-08-20 (DRAFT until SHAs frozen)

Lead-owned. Executes only after the P0 lanes land and gates pass. Founder
approval for the build and this release path was given 2026-08-20; each
production mutation below still executes only as this exact reviewed packet.

## Verified pre-state (probed read-only 2026-08-20)

- `/research/early-access` serves HTTP 200 in production with NO outer research
  password: the narrow route exemption is ALREADY LIVE structurally (SPA route
  bypasses Gateway; every EA customer API door individually wall-admitted;
  67-test wall suite green at c5f866c).
- `/api/research/early-access/session` answers (gate configured+enabled).
- `/api/research/early-access/assisted-orders/config` → `enabled:true`
  (XRR bridge LIVE; required agreement early_access_terms v1).
- Admin order email recipient env already set by the executed Release A packet:
  `RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL=research@xeniostechnology.com`.
- Production SHA a66434d9; rollback 458e7284 (flags off first).

## The one-code swap (the only gate change production needs)

Env var: `RESEARCH_EARLY_ACCESS_PASSWORD_HASH`
Format (private-access-password.ts, exact): `scrypt$32768$8$1$<salt b64url>$<digest b64url>`
(N=32768, r=8, p=1, 16-byte salt, 64-byte digest, explicit maxmem).

Procedure at release time (NOT before):
1. Freeze the release SHA; confirm the Render service's canonical branch HEAD
   IS that SHA. HAZARD: a Render env update auto-triggers a deploy of the
   branch HEAD — the swap must never run while the head is ahead of the
   reviewed SHA.
2. Mint the hash LOCALLY from the founder-supplied code (never committed,
   never logged, never echoed into shell history — read via prompt/env):
   scryptSync(code, salt, 64, {N:32768, r:8, p:1, maxmem: 64*1024*1024}).
3. Set `RESEARCH_EARLY_ACCESS_PASSWORD_HASH` via Render env (merge update);
   the triggered deploy IS the activation deploy.
4. Smoke: old code refused; new code unlocks; session cookie minted; lockout
   intact (RESEARCH_EARLY_ACCESS_MAX_ATTEMPTS / LOCKOUT_MINUTES unchanged).
5. Display copy "Xenios Genesis" ships in the release SHA itself (S2 lane).

## Remaining release actions (filled as lanes land)

- [ ] S2 gate copy + hash tooling + wall-admission tests → integrate.
- [ ] S3 426-row artifacts → adjudicated per founder row decisions → controlled
      Product Control retail release (424 numeric, 2 price-on-request, no $0).
- [ ] S5 quantity 100: shared constant, authority default 100, M66-successor
      candidate → promote → DAG → apply-twice rehearsal → founder-gated apply.
- [ ] S6 affiliate manual code; S7 email template v2s; S8 payment/canonical;
      S9 fulfillment queue; S4 storefront/mobile; S10 composed E2E.
- [ ] Freeze SHA, run full gate suite, dark deploy, progressive activation,
      founder phone smoke.

Nothing in this packet may run out of order, and no step invents a missing
secret.
