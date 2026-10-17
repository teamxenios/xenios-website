# Early Access money model: founder decision

Decided by Samuel Boadu, 2026-08-04. This is the authority for every financial
call site in Private Early Access. Code that disagrees with this document is
wrong, not the document.

## The defect this settles

`orderTotalCents` is `unitPriceCents * quantity`, enforced on every read in
`server/research/early-access/commerce/early-access-order.ts`. It is the
merchandise subtotal BEFORE discount. Seven financial call sites were reading it
as the amount owed. On a three-unit bundle the customer owes 47,760 while those
sites saw 59,700, which both refused a correct payment and would have produced a
receipt for money nobody paid.

## 1. The subtotal constraint stays

`orderTotalCents === unitPriceCents * quantity` remains enforced. Its meaning is
the pre-discount merchandise subtotal. Prefer renaming it to `subtotalCents`;
where migration risk prevents that, the ambiguous name is deprecated and no new
financial consumer may read it as the amount due.

The discount must NOT be stored inside that field. The read path rejects any
snapshot where it disagrees with `unitPrice * quantity`, so a discount hidden
there is indistinguishable from corruption.

## 2. The money snapshot

Immutable, persisted on both the order and the invoice.

```ts
interface OrderMoneySnapshot {
  currency: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  payableTotalCents: number;
  promotionId: string | null;
  promotionVersion: string | null;
}
```

Invariant, validated on construction and on read:

```
payableTotalCents = subtotalCents - discountCents + shippingCents + taxCents
```

`payableTotalCents` is REQUIRED at every final-money call site: invoice, payment
verification, receipt, ledger, reconciliation, customer order projection, admin
review, refund validation. There is no fallback to `orderTotalCents`. Omitting it
must fail to compile, not fail at runtime.

## 3. Which amount each subsystem uses

| Subsystem | Amount |
|---|---|
| product line validation | `subtotalCents` |
| invoice amount due | `payableTotalCents` |
| payment verification | `payableTotalCents` |
| receipt total | the verified amount, expected to equal `payableTotalCents` |
| reconciliation | `payableTotalCents` against the verified amount |
| refund ceiling | verified amount minus completed refunds |
| affiliate commission | `subtotalCents - discountCents` |
| supplier fulfilment | usually no amount at all |
| customer status | `payableTotalCents` plus payment state |
| admin payment review | subtotal, discount, payable total, claimed amount, and the difference |

## 4. Overpayment

A customer who owes 47,760 and sends 59,700 is `OVERPAYMENT`. It is NOT approved
automatically, it creates NO account credit, and commission is NOT computed on
the excess.

Auto-accepting would break several things at once: the verified payment would
stop matching the invoice, the receipt would imply the customer owed the larger
amount, refund and reconciliation would become ambiguous, and a credit system
would come into existence with no rules for expiry, transfer, use, or refund.

Required path: record the expected amount, the received amount, and the excess;
require a founder or operations decision; then refund the excess or apply a
separately approved credit; and audit the action. The MVP default is
`refund_required`. Do not build a general customer-credit wallet for this case.

Admin exception actions:

```
Record Overpayment and Hold Order
Record Overpayment and Refund Difference
Record Overpayment and Apply Approved Credit
Reject Verification Pending Resolution
```

## 5. Commission basis

Normally `subtotalCents - discountCents`. Excludes shipping, tax, overpayment,
unverified money, and refunded money. Persist all five, never re-derive later
from whatever total is in scope:

```
commissionPolicyId
commissionPolicyVersion
commissionBasisCents
commissionRate
commissionAmountCents
```

## 6. Refund ceiling

```
verifiedAmountCents - completedRefundsCents
```

Never `subtotalCents`, and never the payable total. This binds in both
directions: a discounted order must not permit a refund above what was actually
paid, and an overpayment may require refunding MORE than the payable total, but
only through the explicit overpayment path above.

## 7. Required tests

- the discounted amount verifies successfully
- the undiscounted subtotal classifies `OVERPAYMENT`, is not approved, creates no
  credit, and generates no commission on the excess
- underpayment refused
- wrong currency refused
- receipt uses `payableTotalCents`
- invoice uses `payableTotalCents`
- commission excludes discount, shipping, tax, and overpayment
- refund cannot exceed verified money
- refund may exceed the payable total ONLY through the overpayment path
- no live financial call site reads `orderTotalCents` except as an explicitly
  named subtotal
- omitting `payableTotalCents` from verification, receipt, or commission
  construction fails to COMPILE
