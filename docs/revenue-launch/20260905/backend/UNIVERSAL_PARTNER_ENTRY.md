# Universal partner entry checkpoint

The existing member-authenticated partner self and dashboard GET/HEAD routes
now pass through the legacy Research review wall using their canonical bearer
guard. Only the two exact paths are admitted. The wall applies private headers
before either its own refusal or the downstream member refusal. The member
guard and member-to-partner lookup remain the identity authority.

The shared sign-in/recovery return policy now accepts the existing dashboard
page. It strips supplied partner IDs, roles, emails and other unapproved query
fields. Browser navigation is not a grant of permission.

Validation: 315 tests passed across the new partner wall suite, existing account
wall suite and shared return policy; full TypeScript check passed. Synthetic
partner A/B owner isolation, customer denial, invalid/absent token denial,
GET/HEAD privacy, forbidden sibling/method admission all passed. The tests use
injected guards; separate real-session and browser acceptance remains required.

This slice does not make an absent Auth/member/partner record exist. No live
account creation, approval, notification, migration, deployment or money change.
The configured partner lifecycle writer is still unavailable and the broader
admin diagnosis and durable lifecycle work are active follow-up work.
