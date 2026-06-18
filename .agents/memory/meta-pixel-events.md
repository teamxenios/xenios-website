---
name: Meta Pixel event mapping
description: Which Meta Pixel standard event each conversion surface must fire on the xenios site
---

# Meta Pixel event mapping (brief 6.7)

Each conversion surface fires a specific Meta Pixel standard event. Do not swap these — they map to ad optimization goals in Events Manager.

- **Waitlist submit** (Home inline form + WaitlistForm) → `Lead` (`trackLead`)
- **Early-interest / LOI submit** (EarlyInterest) → `CompleteRegistration`
- **Concepts gallery view** → `ViewContent`
- **Booking / Calendly schedule** (Book) → `Schedule`
- Every route change → `PageView`

**Why:** A prior implementation fired `CompleteRegistration` on the waitlist instead of `Lead`; the brief reserves `Lead` for the lighter waitlist signup and `CompleteRegistration` for the heavier LOI form.
**How to apply:** Helpers live in `client/src/lib/tracking.ts`. Pixel only initializes when `metaPixelId` is set via `/api/config` (gated on the META_PIXEL_ID secret).
