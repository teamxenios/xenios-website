# Claude independent review: `9da13eb..ef79deb` (hold copy, paused instructions, currency check)

## Identity

- **Subject:** `ef79deb6c681ddee085a5986e820347f6a6dbe88`, tree `d43abe1243459a09b7019b7605b05f096390c13b`.
- **Runtime commits since `a07e537`:**
  - `9da13eb`: neutral customer copy while the hold is in force.
  - `dffceb2`: the TS payment engine rejects a wrong-currency provider fact.
  - `ef79deb`: payment instructions paused. The admin intake email says not to send instructions, and the paid-evidence type check is fixed.
- **Records commits:** `b006630` and `9897f50`.
- **No SQL change.**
- **Reviewed:** 2026-09-30 15:28-15:40 CT. Checks worktree detached at `ef79deb`, Node v20.19.0, single-worker.

## Checks run by Claude

| Check | Result |
| --- | --- |
| `server/research/assisted-order`, `client/src/research/assisted-order`, `shared/research/assisted-order`, `server/research/status-recovery` | 28 files, **435 passed** |
| `tsc` | exit 0 |
| No-em-dash source gate (the copy changed) | 1,332 files, 0 forbidden forms |

## Disposition against the `15_…` findings

| `15_…` finding | Status at `ef79deb` |
| --- | --- |
| H2: payment solicited but never confirmable | **Partly closed.** The assisted-order status page and the customer outbox copy are neutral ("Payment step paused. Do not send funds based on this status."). The admin email says "Do not send payment instructions until the quote and payment workflow is available." The `payment_review` → `cancelled` cancellation is still free text (see H3). |
| H4: `paid` copy claims verification | **Closed on the assisted-order status page and in the outbox copy**, but **open on the public `/status` recovery page** (new R-1 below). |
| F5 nit: `.trim()` on a non-string | **Closed** (type-checked). |
| Trap 10(a): currency not compared in the TS payment engine | **Closed in TS** (`CURRENCY_MISMATCH`). The engine is still unmounted and still has no SQL twin. |
| H1: historical `paid` preflight, runbook and rollback rule | **Open.** Nothing recorded in this successor. |
| H3: cancellation after money was solicited or paid needs refund or no-funds evidence | **Open.** `service.ts:225` still requires only a non-blank `cancellationReason` from `payment_pending`, `payment_review` and `supplier_processing`. |
| H5: tests for the historical-`paid` exit refusal and the SQL trigger branches | Not addressed in this range. |

## New finding

**R-1 · P2 · The public `/status` recovery page still claims verification and solicits payment.**

**Where:** `server/research/status-recovery/status-copy.ts:19-21` renders the order found via the P-17 secure link.

| State | Label and wording |
| --- | --- |
| `payment_pending` | "Payment pending … Use only payment instructions sent through the approved Xenios process." |
| `payment_review` | "Payment under review … Wait for Xenios to confirm the review result." |
| `paid` | "**Payment verified** … Xenios recorded payment as verified … Xenios will coordinate fulfillment." |

**Why it matters:** the same order now shows "Payment step paused / Do not send funds" on the assisted-order status
page, but "Payment verified" or "use the payment instructions" on `/status`. This is a truthfulness conflict across
two customer surfaces for the same reference.

**Correction:** align `status-copy.ts` with the hold copy for these three states. This file sits on the qualified
P-17 surface, so it needs a narrow re-review of `/status` rendering. Claude can re-run the P-17 `/status` browser
checks from `91a3e67`.

**Out of scope for this lane, noted only:** the other "Payment verified" / "payment is confirmed" strings belong to
the Early Access cart (`orderStage.ts`, recorded as disabled), member checkout and the dormant commerce UI
(`payment-presentation.ts`). They do not render bridge orders.

## HL-12

**Still OPEN (P1).** This range hardens the interim hold. It does not add the accepted-quote and verification
authority. The next successor is judged by `16_HL12_SUCCESSOR_ACCEPTANCE.md` (B1-B23 plus the section E traps).
