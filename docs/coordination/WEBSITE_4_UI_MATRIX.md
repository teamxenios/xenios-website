# Website 4 responsive and zoom evidence

Validated against the real Website 4 React components and `operations.css` in
the local Vite build on 2026-07-25. The temporary evidence frame used a real
320 CSS-pixel iframe so the production `max-width: 720px` and
`max-width: 390px` media queries were active. The 200% check used a 640
CSS-pixel iframe rendered at 2x scale in a 1280-pixel evidence surface.

## 320px matrix

| Surface | Viewport | Document width | Horizontal overflow | Mobile media active | Primary actions | Focusable controls |
|---|---:|---:|---|---|---:|---:|
| Operations command center | 320 | 305 | none | 720 + 390 | 1 | 10 |
| Mitch fulfillment | 320 | 320 | none | 720 + 390 | 1 | 13 |
| Affiliate portal | 320 | 305 | none | 720 + 390 | 0 (read-only state) | 0 |
| Professional accounts | 320 | 320 | none | 720 + 390 | 1 | 2 |

The command-center tables transformed into mobile cards. Metric cards became
one column below 390px. Mitch retained one dominant row action, wrapped status
content, and did not expose member identity.

## 200% zoom matrix

| Surface | Effective viewport | Document width | Horizontal overflow | Mobile/table-card media active |
|---|---:|---:|---|---|
| Operations command center | 640 | 625 | none | yes |
| Mitch fulfillment | 640 | 640 | none | yes |
| Affiliate portal | 640 | 625 | none | yes |
| Professional accounts | 640 | 640 | none | yes |

## Keyboard structure

The 320px operations surface exposed ten native focus targets in DOM order.
Every target had `tabIndex=0`, was enabled, and had a visible text or accessible
name: primary queue, search, urgency filter, three metric links, task queue,
task action, exception queue, and exception action. No positive tabindex or
custom keyboard-only control was present.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS
