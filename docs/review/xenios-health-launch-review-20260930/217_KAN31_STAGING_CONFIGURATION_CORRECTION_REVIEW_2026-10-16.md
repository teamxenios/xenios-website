# KAN-31 consolidated hosted staging configuration correction: review

**ACCEPTED as the configuration translation, with the staff-read phase disposition and the catalog literals.** It is
accepted subject to the stated isolation preconditions, which correctly stay **OPEN**.

- **What this is not.** Not an operation approval. No setting, secret, deploy or SQL is authorized.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Identity.** Core `d602a6b1` (tree `6795e7d9`, parent `227744ce`) adds exactly one file,
  `hosted-staging-config-r1/CONFIGURATION_CORRECTION_UNAPPLIED.json`, 14,601 B, SHA-256 `e82b8656…`, matching the
  packet.
- **Method.** Read-only against E33 `e33c12a9` source; no agents.

## Checks against E33 source

- **`SITE_URL`.** Changing it to `https://xenios-research-staging.onrender.com` is required. The request-intent origin
  derives from `SITE_URL` (`request-intent/production.ts` 66); the local `127.0.0.1:5237` would close the route.
- **`RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS`** = `[{"kind":"early_access_terms","version":"v1"}]`.
  - The format matches `readRequiredAgreements` (a JSON array of `{kind, version}`, `production-deps.ts` 647ff).
  - The Render start script sets `NODE_ENV=production`, so the process is production-like. The value must then
    exactly match the published policy identity, or commerce paths are forced closed (lines 330–346). The proposal
    cites `early_access_terms` v1 from `policies-data.ts`.
  - Request intent also requires a non-empty, non-form agreement pair list.
- **The three catalog literals are necessary for the hosted journey,** and I accept them for staging only:
  - `RESEARCH_MASTER_OFFERINGS_ENABLED=true`, because serving is dark otherwise (`visibility-policy.ts`);
  - `…_FOUNDER_ADMIN_ONLY=false`, because only the exact `"false"` gives `all_members`, and synthetic customer A is not
    a founder admin;
  - `…_MANUAL_PURCHASE_REQUESTS=true`, because it is a fail-closed exact-`true` customer call to action.

  Payment stays held, since `DIRECT_COMMERCE=false`.
- **The other policy values.** `ENABLED`, `SESSION_IDENTITY_ENABLED`, `OPEN_ACCESS` and `REQUEST_INTENT_ENABLED` are
  `true`, and `TTL` is `240`. They match the frozen policy's `requiredValues`. `OWNER_ID` reuses the existing
  allocation `997a4d89…` without re-allocating.
- **Staff read.** `RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED=false` for this phase is accepted.
  - The accepted browser source makes no staff call.
  - The required scoped staff read-back after the persistence snapshot remains **open, not waived**. It needs its own
    configuration and permission review, and website `ADMIN_EMAIL` or the owner UUID are not substitutes. That is
    correct.
- **The secret proposal is correct.**
  - It sets only the exact E33 key `RESEARCH_EARLY_ACCESS_SESSION_SECRET`, with no fallback to
    `RESEARCH_SESSION_SECRET`. It is fresh, random, staging-only, 32–4,096 characters, and never recorded or hashed.
  - The existing-value guard stops if an effective or inherited value exists, and the outer secret is untouched.
- **The isolation preconditions are correctly OPEN.** `STAGE-ISO-A` (`DATABASE_URL`), `-B` (service-key
  provenance), `-C` (session-secret independence) and `STAGE-CONFIG-INVENTORY` (including linked environment groups).
  These match Doc 216 §2. Nothing is inferred from variable names or the incomplete visible list.

## Conditions before any operation

1. **Close the preconditions first.** `STAGE-ISO-A`, `-B`, `-C` and the full effective inventory are closed through
   the secure custodian path before any write. Unknown means hold.
2. **Freeze the save mechanism.** Root freezes the exact Render save mechanism and its side effects. A save may restart
   or redeploy the current `65c9cc54`, so record which action is used.
3. **Approval.** Samuel's exact staging-only approval for the configuration writes and the one secret generation.
4. **Exposure (new).** Staging is publicly reachable. With `OPEN_ACCESS=true`, catalog `all_members` and request
   intents enabled, anyone can open the journey on staging.
   - This is acceptable for staging qualification, because payment is held and data stays synthetic.
   - Root should record the exposure, and decide whether to restore the request-intent and open-access flags after
     qualification.
5. **Separate gates.** The Doc457 E33 deploy, the Doc 212 SQL conditions (including the schema present on staging),
   A and B session states, and the hosted run itself remain separate.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | hosted staging configuration correction (Core d602a6b1, CONFIGURATION_CORRECTION_UNAPPLIED.json e82b8656) | reviewer 6abf1edf | ACCEPTED translation, staff-read=false phase disposition and catalog literals (ENABLED=true, FOUNDER_ADMIN_ONLY=false, MANUAL_PURCHASE_REQUESTS=true are needed for a non-founder customer journey; DIRECT_COMMERCE=false keeps payment held); SITE_URL staging origin required (request-intent origin); agreements literal parses and must match published policy under NODE_ENV=production; secret proposal correct (exact EA key, no fallback, existing-value guard). Conditions: close ISO-A DATABASE_URL, ISO-B service key, ISO-C session secrets and full inventory before any write; freeze save mechanism/side effects; Samuel's exact approval; record public-exposure decision; deploy/SQL/sessions/run separate | doc 217.`

Not an operation, credential, deployment, approval or production consent; not human approval.
