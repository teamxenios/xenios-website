# Care PR 6 visual evidence

Captured from the focused local PR6 branch with deterministic private
non-production response fixtures. Fixtures exist only in the temporary visual
harness, which is removed before commit; no database record or seed survives.

| File | Surface / state | Viewport | Result |
|---|---|---:|---|
| `patient-populated-desktop-1440.png` | Patient populated messages/lab/issue flow | 1440px | PR6 content fits; no horizontal overflow |
| `patient-empty-mobile-375.png` | Patient empty state | 375px | PR6 content fits; no horizontal overflow |
| `patient-error-mobile-320.png` | Patient fail-closed error/retry | 320px | PR6 content fits; no horizontal overflow |
| `clinician-populated-mobile-375.png` | Assigned-clinician reply | 375px | PR6 content fits; no horizontal overflow |
| `lab-review-populated-mobile-375.png` | Assigned lab-review reference form | 375px | PR6 content fits; no horizontal overflow |
| `safety-populated-200pct-reflow-720.png` | Assigned safety queue at 1440/200% equivalent | 720px | PR6 content fits; no horizontal overflow |

Browser console errors/warnings: none.

The screenshots preserve the current shared `PageShell` and expose the known
Website 2-locked global navigation defect: the desktop early-access CTA uses
`hidden sm:inline-flex`, while the shared `.btn` rule wins at narrow widths. The
exact integration correction remains:

```tsx
className="btn btn-primary !hidden sm:!inline-flex"
```

in `client/src/components/Navbar.tsx`. PR6 does not edit that locked shared file.
The PR6 content itself has `scrollWidth === clientWidth` at every measured
viewport.
