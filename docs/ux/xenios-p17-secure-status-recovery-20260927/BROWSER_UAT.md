# Local exact-build browser UAT

The exact production build was served locally at `127.0.0.1:5001`. The
computer-use skill was used only against that local build; no external form,
credential, customer data or email was involved.

Observed:

1. `/status` rendered the exact title, supporting copy and reference/email form.
2. A fresh document navigation to `/status#recovery=<43-character fixture>`
   immediately became `/status`; the fragment was absent from visible history.
3. The page showed `Secure status link ready` and required explicit
   `View status`; initial document load did not exchange or consume the token.
4. The page meta referrer policy was `no-referrer`.
5. With the static preview API intentionally unavailable, explicit exchange
   failed closed to the neutral request form with a safe invalid/expired-link
   message and no status disclosure.

Automated browser-component tests additionally cover initial session restore
after a closed tab, refresh/session loss, explicit end, storage absence and the
production cookie/header contract. Static-server tests cover no-store,
no-referrer, noindex and same-origin resources for `/status`.
