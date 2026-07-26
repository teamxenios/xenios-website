# Xenios UI Acceptance Reference

Source of truth: current production Research pages, `ResearchMemberShell`, admin shells, the shared Research UI kit, and existing global tokens.

| Element | Required treatment |
|---|---|
| Background | White; no gradient or decorative layer |
| Typography | Existing font stack; compact mono/uppercase eyebrow; restrained page title; readable body |
| Color | Black/graphite/neutral borders; purple only for primary action, focus, active state, or limited status emphasis |
| Containers | Thin border, minimal radius/shadow, generous whitespace; avoid nested card stacks |
| Actions | One dominant primary action; shared secondary/destructive treatments |
| Forms | Real labels, helper text, inline error, visible focus, large mobile targets, preserved input |
| Status | Understated text-backed badge; never color-only |
| Navigation | Existing shell; do not create a duplicate header or promote unavailable routes |
| Mobile | Deliberate one-column layout at 320/375/430; no horizontal overflow; no covered fields |
| States | Quiet loading, explanatory empty, actionable error/retry, truthful pending/unavailable, success confirmation |

Assessment-specific checks:

- Six-step progress and one section at a time.
- Consent content is server-published and rendered before the acceptance control.
- Conflict messaging preserves the member’s current in-memory answers.
- Reviewer UI uses the minimum-necessary Plan Brief, never a raw-answer dump.
- Member home presents one dominant next action.
- Privacy withdrawal remains reachable for verified former/paused subjects without exposing other member pages.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS, pending final Website 2 route integration and Website 6 screenshots.

