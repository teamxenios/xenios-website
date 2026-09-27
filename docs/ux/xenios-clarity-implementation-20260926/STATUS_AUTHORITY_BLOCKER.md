# P-17 status recovery authority blocker

## Required behavior

The approved P-17 specification says an anonymous visitor can enter a reference and email, recover an order after closing the original tab, and see the existing plain-language order status. Its UAT rows require valid reference+email success, neutral mismatch behavior, signed-in recovery, Care-reference handling, and closed-tab return.

## Existing authority

The existing assisted-order authority deliberately permits private detail access only through one of:

1. the authenticated account owner,
2. the high-entropy raw status token issued with the order, or
3. the matching existing Early Access session credential for the original bounded session.

Only the token hash is persisted. The browser keeps the raw status token in session storage, and the server verifies the presented token against the stored hash. A public reference is an identifier, not a credential. The submitted email is contact data and is not designated as an authentication secret.

The implementation therefore keeps `/status` fail closed:

- a matching token already held by the submitting browser may continue to the existing status route;
- an owner can sign in and use the existing account-orders authority;
- a reference alone reveals no private order detail;
- inquiry and Care references receive bounded, non-private guidance.

This boundary is asserted in `client/src/clarity/StatusPage.test.tsx` and the existing assisted-order owner/token-isolation tests.

The public page does not claim P-17 acceptance. It has no email field, anonymous lookup, loading state, closed-tab emailed-return flow, or session-aware signed-in shortcut; its sign-in guidance remains a link into the canonical account authority.

## Why the requested recovery is not implemented

Treating reference+email as an anonymous credential would add a second authentication/recovery authority. It would weaken owner isolation by turning two values that are not currently designated as credentials into sufficient proof for private order information, and it would diverge from the current token-hash contract. Reconstructing the raw token from its hash is intentionally impossible, and placing the raw token in recoverable server-side storage or ordinary email text would materially change the security design.

The final owner approval explicitly withholds credential/database changes from this implementation lane. The authorized work is no-migration and must preserve current account, owner-isolation and recovery authority.

## Authority needed to resolve

P-17 needs a separately approved secure recovery design. A safe design could mint a short-lived, single-purpose status link after a neutral reference+email challenge, with rate limiting, non-enumerating responses, hashed one-time token storage, expiry/consumption rules, audit behavior, and owner-isolation tests. That is a new credential flow and may require schema and notification changes; it is outside the approved no-migration/no-new-auth-authority lane.

No workaround was introduced. The blocker is the P-17 recovery authority as a whole: reference+email lookup, neutral mismatch handling, closed-tab recovery, and the related loading/signed-in page states must be designed and reviewed together. This is the single concrete P1 product blocker to declaring the clarity candidate ready for independent release review.
