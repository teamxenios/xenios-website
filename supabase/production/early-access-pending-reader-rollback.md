# Pending request operator rollback

The migration installs optional backend readers. Applying it creates no user assignments or enabled capabilities. Record any later assignment, capability and runtime flag changes separately. The named user's verified Auth subject is the assignment key.

To withdraw an individual reader, revoke the specific active `request_intent_reader` assignment through the approved admin process and verify that a new list and detail read are denied. Preserve the assignment and audit history. If this was the only activated queue, restore the recorded prior capability and flag values. Coordinate shared controls with existing clinical-admin readers. Revert the application to its reviewed predecessor if the release itself needs rollback.

Leave the additive database functions and expanded registry constraints in place. They cannot authorize an actor without the live assignment, and historical access audits are append-only. Removing a constraint that admits historical permission values can break audit retention. Existing clinical-admin and quote-issuer reads use the legacy RPCs throughout.
