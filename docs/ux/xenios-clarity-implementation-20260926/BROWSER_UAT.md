# Xenios clarity browser UAT

## Candidate identity

- Runtime SHA: `5dcbc45f49a753bb857b8f6f035e83d212bd9648`
- Runtime tree: `4bd01064388dfd39692e056c4b059fcbc1c3851b`
- Browser surface: controlled Google Chrome plus bounded in-app Chromium follow-up
- Production mutation: none

## Responsive and reflow checks

| Check | Result | Evidence |
| --- | --- | --- |
| 1440 CSS px | PASS | `innerWidth=1440`, `clientWidth=1425`, no horizontal overflow, one main region, expected root H1. |
| 768 CSS px | PASS | `innerWidth=768`, `clientWidth=753`, no horizontal overflow, one main region. |
| 390 CSS px | PASS | `innerWidth=390`, `clientWidth=375`, no horizontal overflow, one main region, compact menu visible. |
| 200% reflow equivalent | PASS WITH METHOD LIMITATION | Chrome DevTools device-metrics override at 720 CSS px / DPR 2: `clientWidth=705`, no horizontal overflow, compact menu visible. |
| 400% reflow equivalent | PASS WITH METHOD LIMITATION | Chrome DevTools device-metrics override at 360 CSS px / DPR 4: `clientWidth=345`, no horizontal overflow; every sampled visible control was at least 44 CSS px tall; primary controls were 52 CSS px. |

The provided controlled-browser surface cannot focus browser chrome, so browser-level `Ctrl++` did not change the browser zoom. The 200% and 400% results above exercise Chrome's layout engine with equivalent CSS viewport/DPR constraints, but they are not a claim that the exact manual browser-zoom procedure in U-G09 was run. A reviewer with interactive desktop-browser chrome should repeat U-G09 before release.

At 400% equivalent reflow, opening the navigation produced modal dialog `clarity-navigation`, moved focus to **Close menu**, locked body scrolling, retained no-overflow layout, closed on Escape, and returned focus to **Menu**.

## Route and copy checks

| Route | Observed H1 / outcome | Other observations |
| --- | --- | --- |
| `/` | Care and research products, clearly separated. | One main; index/follow; no overflow. |
| `/care/schedule` | Start Care | One main; noindex/follow; one form. The client-only preview correctly showed availability unavailable without an API. |
| `/products` | Research products | No public product-card grid or overflow. |
| `/practices` | For practices: refer clients, keep your relationships. | Inquiry form present; no overflow. |
| `/partners` | Become a Xenios partner | Two distinct forms; no overflow. |
| `/suppliers` | Supply or fulfil with Xenios | One inquiry form; no overflow. |
| `/workspace` | The AI workspace for serious coaches. | Legacy coach surface preserved away from root; no overflow. |
| `/quality` | Quality and documentation | One form; no overflow. |
| `/careers` | Work with Xenios | General-interest path only; one form; no named-role grid; no overflow. |
| `/status` | Check status | noindex/nofollow; explicitly requires the submitting browser or account authority and says a reference alone never unlocks details. The canonical `View Account Orders` shortcut is present. |
| `/sign-in` | Sign in | noindex/nofollow. |
| `/activate` | Activate your account | noindex/nofollow; no-token state says the secure emailed link is required. |
| `/research` | How research orders work | No overflow. The client-only preview injects index/follow; the production raw-document policy independently tests noindex for this legacy route. |

`/partners/apply?source=uat` resolved to `/partners#inquiry`, preserved the partner inquiry destination, and displayed the partner H1 and inquiry section. The browser console returned no warnings or errors.

## Exact-built-bundle smoke

After the final `npm run build`, the generated `dist/public` bundle was served locally with Vite preview and opened in controlled Chromium at `http://127.0.0.1:5001/`. The follow-up build loaded hashed production assets including `/assets/index-B__yCREs.js` and `/assets/index-Bzc8R8qm.css`, not Vite source modules.

- Root returned the approved H1, one main region and no horizontal overflow at the native controlled-Chrome viewport (`scrollWidth=623`, `clientWidth=623`, `innerWidth=638`, DPR 1.5).
- Built routes returned the expected H1s for Care scheduling, products, practices, partners and careers.
- Careers explicitly said general interest only and rendered one application form.
- `/status` at an exact 390 px viewport retained `noindex, nofollow`, rendered H1 `Check status`, had `scrollWidth=375` / `innerWidth=390` with no overflow, and exposed `View Account Orders` at `/research/account/orders`.
- Activating that shortcut while signed out reached `/research/sign-in?returnTo=%2Fresearch%2Faccount%2Forders`, preserving the canonical private destination without exposing a credential.
- `/activate` retained `noindex, nofollow` and the secure-link-required no-token state.
- `/partners/apply?source=build-smoke` resolved to `/partners#inquiry` and rendered the partner page.
- Captured warning/error entries all originated from installed Chrome extensions; zero entry originated from the Xenios preview origin or its built assets.

## Scope note

The initial responsive route inspection used the Vite client preview; the separate pass above confirms the final production-built bundle boots and preserves the critical route/copy boundaries. Real browser-chrome zoom and the complete route-by-route exact-build UAT matrix remain manual review items. Server-backed accepted/rejected/uncertain, replay, owner-isolation, notification, Care, commerce-dark, route and migration behavior is covered by the automated release evidence rather than this static-preview route pass.
