# Bounded acceptance: synthetic credential fixture rebind

Reviewed successor `37cd7bf4d12ac170ef8f474287989816ff64dbd7` (tree `bcfc2c92bede676331bf094a24aa422bebf16db1`) against `bf7b5fee78102289bcc6c68e9e336bb0ea0c9d5e`.

The successor changes exactly three evidence records: `REVIEWED_SYNTHETIC_CREDENTIALS.json`, `synthetic-credential-context-review.json`, and the added `synthetic-credential-whitespace-rebind.json`. The application diff from the prior reviewed source remains limited to the documented EOF-only browser-runner change plus the previously recorded release-control test change; no scanner policy or runtime implementation changed.

The rebind record is `PENDING_INDEPENDENT_REVIEW`, records registry SHA-256 `2ec665354677bd2cb41fb513a018b9890f2cfedbfa43a3bcbdad3cc8dc6219e6`, and context hash `069df252ebfe2370ff2e346e9e5a003b2e3a5e31a0978c649c837f53de562801`. I accept reuse of the prior 102 reviewed synthetic contexts on the stated immutable source equivalence, subject to A's planned 35 scanner tests and full-suite run. This is not scanner PASS, release qualification, privacy approval, or production authorization.
