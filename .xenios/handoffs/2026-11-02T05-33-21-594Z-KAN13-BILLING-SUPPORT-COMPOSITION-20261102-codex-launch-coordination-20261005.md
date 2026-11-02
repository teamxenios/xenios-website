{
  "state": "COMPOSITION_GREEN_ACCEPTED_SOURCES_PRESERVED",
  "task": "KAN13-BILLING-SUPPORT-COMPOSITION-20261102",
  "lease": "ad60e1c5-3be2-4230-a696-d7d454c4d206",
  "owner": "codex-launch-coordination-20261005",
  "ownerRecord": "KAN13/10453",
  "PR": 362,
  "branch": "codex/billing-support-composition-20261102",
  "source": "25d00047f2d08118a5aa7ffb5117d274426d75e1",
  "tree": "99980889f8e6251bd88cb725b701dbc80fe67902",
  "base": "0ca22721bc4cd5e46f50ffbc842f185e7e3d3360",
  "parents": [
    "0e7e27e0f9f946900bdc54676741ba0a9f79b5aa",
    "0166b35d91ef2958e62a78eec165a2519a3fe038"
  ],
  "paths": {
    "client/src/research/assisted-order/RequestIntentForm.test.tsx": "ec75a11d52bb9b823ba11f4afc8a62f56ce3b193",
    "client/src/research/assisted-order/RequestIntentForm.tsx": "966bd8ce9856ff49ba09c0a43d047f0f9c834940",
    "client/src/research/account-portal/views/SupportView.pending.test.tsx": "5405ef37376c91a766b842cc88b065639d3f618c",
    "client/src/research/account-portal/views/SupportView.tsx": "a4e12ae3df2d7fece446233864f878aae44fbc42",
    "client/src/research/account-portal/views/support-documents.test.tsx": "b4ec613ed6ca70e0ee7917e8ef261d4095142fee",
    "client/src/research/account/AccountSupport.refresh.test.tsx": "df9199c6da4e55dbd1acc44f0f95ed4e605cf689",
    "client/src/research/account/AccountSupport.tsx": "f1431a82b4fd234aa711d9595a1fca84c76daca9"
  },
  "sourceAcceptances": [
    "10450/6569437901",
    "existingci_contract_ready exact0166/6569442387"
  ],
  "noNewImplementation": true,
  "allSevenAcceptedModesBlobsPreserved": true,
  "claimCanonical": "9a21949188ef9019a41109ac92a7d65c2d69a5bf",
  "CI": {
    "state": "COMPOSITION_CI_GREEN",
    "head": "25d00047f2d08118a5aa7ffb5117d274426d75e1",
    "tree": "99980889f8e6251bd88cb725b701dbc80fe67902",
    "source": "25d00047f2d08118a5aa7ffb5117d274426d75e1",
    "base": "0ca22721bc4cd5e46f50ffbc842f185e7e3d3360",
    "run": 41393860427,
    "event": "pull_request",
    "attempt": 1,
    "full": {
      "passed": 18384,
      "failed": 0,
      "skipped": 83,
      "filesPassed": 985,
      "filesSkipped": 6
    },
    "focused145": "overlaps full suite, not additive",
    "supplied180": "exact-tree focused author evidence, overlaps full suite",
    "requiredChecks": {
      "protection": 125110866502,
      "build": 125110866532,
      "test": 125110866445,
      "typecheck": 125110866257,
      "Required CI completion": 125112845616
    },
    "jobs": {
      "typecheck": {
        "job": 125110866257,
        "checkoutSHA": "1c70e967e0f7a431fe71748f3cd9807664af8490",
        "logSHA256": "a822ec94a7924dad2ee52cdc215e4b8feceef75bc52b5c4e0b61db9dc4471e52"
      },
      "test": {
        "job": 125110866445,
        "checkoutSHA": "1c70e967e0f7a431fe71748f3cd9807664af8490",
        "logSHA256": "ecc50d6492c08479090fa369fb9f46a7d6cee8d084a0117fce8e6185ba352c17"
      },
      "protection": {
        "job": 125110866502,
        "checkoutSHA": "25d00047f2d08118a5aa7ffb5117d274426d75e1",
        "logSHA256": "02ef328c637b92b2196bbebfc47e2627a8de1c3afecdc9f6f7902130292df3db"
      },
      "build": {
        "job": 125110866532,
        "checkoutSHA": "1c70e967e0f7a431fe71748f3cd9807664af8490",
        "logSHA256": "421ed891e0e6d421fc8dcf01e105294111bb5c5bf6d8879276cc566df9112513"
      }
    },
    "actualCheckoutTrees": {
      "1c70e967e0f7a431fe71748f3cd9807664af8490": "99980889f8e6251bd88cb725b701dbc80fe67902",
      "25d00047f2d08118a5aa7ffb5117d274426d75e1": "99980889f8e6251bd88cb725b701dbc80fe67902"
    },
    "allFourJobTreesExact": true,
    "allSevenAcceptedBlobsExact": true,
    "sourceAcceptances": [
      "KAN31/10450;PR360comment6569437901",
      "existingci_contract_ready exact0166;PR361comment6569442387"
    ],
    "proof": [
      "2026-11-02T05:25:59.1562042Z  Test Files  4 passed (4)",
      "2026-11-02T05:25:59.1563612Z       Tests  145 passed (145)",
      "2026-11-02T05:26:18.5800660Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (51 tests) 1780ms",
      "2026-11-02T05:28:21.3535610Z  \u2713 client/src/research/account/AccountSupport.refresh.test.tsx (11 tests) 520ms",
      "2026-11-02T05:29:47.3345358Z  \u2713 client/src/research/account-portal/views/SupportView.pending.test.tsx (6 tests) 326ms",
      "2026-11-02T05:31:23.2855314Z  Test Files  985 passed | 6 skipped (991)",
      "2026-11-02T05:31:23.3026202Z       Tests  18384 passed | 83 skipped (18467)"
    ],
    "nativeBrowserAuthManagedDBStaging": "NOT RUN; hosted synthetic/component fixtures only",
    "nativeGoal": null
  },
  "suppliedFocused180": "Same exact tree author support; overlaps fullsuite, not additive",
  "actualCurrentHumanDirection": "Integrate accepted changes, required resulting-tree CI, then complete qualified production release. Admin and selector separate. Profile candidate deferred.",
  "sourceAcceptanceIsNotProductionGO": true,
  "releaseChecksRemaining": "Fresh currentbase/protection/trustedchecks/threads/precedingLIVEcompatible0carollback, normal protected merge, actual releasepushCI/providerLIVE/scopedGETstatic verification",
  "rollbackBaseline": {
    "sha": "0ca22721bc4cd5e46f50ffbc842f185e7e3d3360",
    "tree": "aa2da5b293ebca0a7a0c5f1bbf1879f2e272531c",
    "deploy": "dep-dbjrrv95efls73ecgre0",
    "executed": false
  },
  "nativeBrowserAuthManagedDBSQLStaging": "NOT RUN; localNode/tests/build remain held; hostedCI only",
  "productionMutationsAtCapture": false,
  "adminLease": "87067847-af3a-45b0-b3ff-5fd45ee394d3 remains ACTIVE unchanged",
  "nativeGoal": null,
  "capturedAt": "2026-11-02T05:32:12.869494+00:00"
}
