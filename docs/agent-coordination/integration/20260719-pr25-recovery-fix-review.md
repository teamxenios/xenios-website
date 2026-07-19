# PR #25 Recovery Fix Review (disposition 2, 2026-07-19)

Reviewer: CLAUDE_PRIMARY. Scope: the recovery-fix delta ef0c7c1 -> e9e8ca4
against the founder decision (a signed-out member on a fresh browser must be
able to request AND complete recovery without the shared password; only the
narrow recovery surface may bypass the gate). Method: clean checkout of the
new head (a true rebase, origin/main 468466f is an ancestor), my own build
gates, three focused review agents, adversarial verification of every
high/medium finding.

Reviewed head: e9e8ca488b8eff343232dc7fc3fa6553637a1676 (mergeable, clean)

## The original defect is FIXED, and well

- The recovery marker is captured in a SYNCHRONOUS useState initializer at
  provider first render (core.tsx:165-170) via a new shared state machine
  (shared/research/recovery.ts), persisted to sessionStorage, BEFORE any
  Supabase client can exist (the client is created lazily and every call
  site runs post-render). The set-password mode derives from context, never
  from window.location. The fresh-browser persona now deterministically gets
  the set-new-password form; hash-cleared, event-first, and storage-blocked
  paths are unit-tested (10/10).
- The wall exemption is exactly ONE path (/member/forgot-password, exact
  match, variants fail closed). Boot-proven: forgot-password passes with
  zero credentials while policies/catalog/member/orders still 401.
- Enumeration-safe in every branch (byte-identical generic responses,
  fire-and-forget send), per-IP 3/10min + hashed per-email 1/10min durable
  limits, redirectTo fixed server-side, no PII in logs, no-store/no-referrer/
  noindex stamped on the reset path.
- Success signs the recovery session out globally and lands on
  /research/sign-in.
- Both prior email lows are FIXED with pinning tests: crashed dispatches now
  count attempts on reclaim and reach failed_permanent with an admin alert;
  unknown sender shapes are failures, never sent.
- Regression: requireActiveMember diff EMPTY; gateway/section diff empty; no
  root redirect; promotion tick exactly once, flag-gated; outbox worker
  exactly once, re-entry guarded.

## Mandatory checklist: 16 of 18 pass

Items 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18 PASS with
file:line evidence. Two FAIL, both adversarially confirmed:

1. CONFIRMED HIGH (item 12, pre-existing but in-scope): **the Meta Pixel can
   exfiltrate live recovery tokens.** main.tsx boots initTracking() on every
   route; with META_PIXEL_ID set (a documented production knob), the pixel
   script loads on the recovery landing and its PageView beacon carries
   window.location.href INCLUDING the #access_token/refresh_token fragment,
   racing the lazy Supabase client's hash strip (the new marker capture
   deliberately does not strip the hash; Supabase needs it). CSP is disabled,
   so nothing blocks connect.facebook.net. Referrer-Policy does not help
   (the pixel sends the URL explicitly). Leakage is probabilistic, not
   guaranteed, and inert while META_PIXEL_ID is unset, but mandatory item 12
   cannot pass while tracking loads unconditionally. Fix: skip or defer
   initTracking on /research/* (at minimum when a recovery hash is present)
   until the hash is consumed.
2. CONFIRMED MEDIUM (item 3): **a recovery link is a full member session.**
   The provider's route-agnostic member-bypass effect validates the recovery
   JWT, sets the gate open, and fetches the full catalog while the visitor
   is still on the reset page; abandoning the reset leaves the browser
   signed into the member area with a persisted session, no password ever
   entered. Moderated (link possession implies email control, session is
   time-bounded, partly inherent to Supabase implicit recovery), but it
   contradicts "only the narrow recovery surface may bypass the gate."
   Fix: suppress the member-bypass/catalog effect while recovery is pending,
   and sign out when leaving the reset page without completing.

Informational notes (no action required to merge): reclaimed crashed jobs
retry without backoff (terminates correctly; cosmetic); the error-hash
detector is broader than recovery links (messaging-only); the exact-path
header/chrome matches fail closed on variants; the sessionStorage marker
lets any live session reach set-password mode (matches Supabase's own
model); per-IP limit trusts the first X-Forwarded-For hop (pre-existing
pattern, now on a credential-free endpoint — for the architecture-security
session's trust-proxy work); the wall exemption is method-agnostic
(harmless; a POST-only condition would be exact).

## Independent validation (my runs, not the author's)

- Tests: 136/136 passing (9 files; 18 new recovery tests).
- Typecheck: clean (zero errors).
- Build: green. Production boot smoke: clean log; homepage 200, no
  redirect; narrow exemption proven live.

## Recommendation

**CHANGES REQUIRED** - two contained client-side fixes: (1) keep tracking
off the recovery surface (closes the token-leak race and mandatory item 12),
and (2) keep the recovery session out of the member area until the reset
completes (closes item 3 and honors the founder's narrow-bypass rule).
Everything else, including the original high, is verified fixed. No merge
performed.
