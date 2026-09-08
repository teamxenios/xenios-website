# Render live identity recheck — 2026-09-08

Read-only Render checks against workspace `tea-d8nhh6a8qa3s73f4ocj0`, service `srv-d8s9vej7uimc7384dfcg`, and deployment `dep-dag1reu7bikc73e16ie0` returned:

- Service `xenios-website`: `autoDeploy=no`, trigger `off`, branch `release/early-access-code-session-checkout`, health path `/api/health`, status not suspended.
- Deployment: status `live`, exact commit `3814c687ef9293f84f939c372fdbc01b278a9193`, finished `2026-09-08T14:38:44.68489Z`.

This confirms the current production identity and deployment mechanics without triggering a deploy or changing configuration. It does not qualify the undeployed `8be5d582` candidate.
