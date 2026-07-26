# Care PR5 visual verification

Visual evidence is captured from the real PR5 React components with the
existing Xenios global styles. The temporary data harness is isolated to local
visual verification and is removed before the frozen commit.

| Evidence | Viewport | State |
|---|---:|---|
| `desktop-populated.png` | 1440 × 1000 | Patient instruction and released supply kit |
| `mobile-empty-375.png` | 375 × 812 | Truthful empty patient state |
| `mobile-error-320.png` | 320 × 700 | Fail-closed error and retry state |
| `desktop-readiness-200-zoom.png` | 720 CSS px (1440 at 200% equivalent) | Authorized exact-input readiness state |
| `mobile-pharmacy-375.png` | 375 × 812 | Restricted replacement work queue |

The screenshots contain only deterministic local visual fixtures. They are not
database seeds and are not shipped by the production bundle.
