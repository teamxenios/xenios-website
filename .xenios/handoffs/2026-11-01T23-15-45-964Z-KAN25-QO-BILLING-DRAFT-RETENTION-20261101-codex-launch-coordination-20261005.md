{
  "state": "BILLING_CANDIDATE_GREEN_PENDING_QA_AND_INDEPENDENT_ACCEPTANCE",
  "PR": 360,
  "base": "0ca22721bc4cd5e46f50ffbc842f185e7e3d3360",
  "head": "0e7e27e0f9f946900bdc54676741ba0a9f79b5aa",
  "tree": "550c4ae5b95abcb8ce7ac4da5024e86a3a7a02e7",
  "parent": "21a769f9ab72a5c3b1a938d0ec1551163553670a",
  "branch": "codex/quick-order-billing-draft-20261101",
  "paths": {
    "client/src/research/assisted-order/RequestIntentForm.tsx": "966bd8ce9856ff49ba09c0a43d047f0f9c834940",
    "client/src/research/assisted-order/RequestIntentForm.test.tsx": "ec75a11d52bb9b823ba11f4afc8a62f56ce3b193"
  },
  "runtimeDelta": "+15/-2",
  "testDeltaFromBase": "+83/-0",
  "testsRawByteUnchangedFromRED": true,
  "runtimeLFbytes": 27588,
  "runtimeSHA256": "a86f592d887474546fd2ad59ebf1dc92237964251c5dd9b841465eb69e3d6047",
  "REDRun": 41359912022,
  "REDReceiptSHA256": "8d4e431bd0215068c686311e6ac62f30dee45378844cce32c8b187c0673889f1",
  "acceptance": "PENDING SAMEc16, authorsRoot/helper not acceptors",
  "nativeBrowserAuthStagingManagedDB": "NOT RUN",
  "localTests": "NOT RUN",
  "nativeGoal": null,
  "observedAt": "2026-11-01T23:15:18.946042+00:00",
  "task": "KAN25-QO-BILLING-DRAFT-RETENTION-20261101",
  "lease": "adda8d94-ee36-47d8-bf71-49307405f8fb",
  "claimCanonical": "4627285a3ee96cb28fe5af62551182788df4a5ff",
  "ownerRecord": "KAN25/10441",
  "independentReviewer": "SAME existing Claude c16; actual exact-head ACK/verdict pending; Root/helper are material authors",
  "reviewProvenance": "c16 raised billing-toggle loss as optional outside old PR357 in10435; no c16 implementation/test authorship in this unit is asserted",
  "RED": {
    "state": "BILLING_RED_ACTUAL_HOSTED_RESULT",
    "head": "21a769f9ab72a5c3b1a938d0ec1551163553670a",
    "tree": "325ea6031b1f40acd6a5d47d684d521b7596f314",
    "run": 41359912022,
    "event": "pull_request",
    "attempt": 1,
    "full": {
      "passed": 18364,
      "failed": 3,
      "skipped": 83
    },
    "Form": {
      "total": 51,
      "passed": 48,
      "failed": 3
    },
    "focused145": "PASS overlapping full suite, not additive",
    "requiredChecks": {
      "Required CI completion": 125009531910,
      "typecheck": 125007898349,
      "protection": 125007898466,
      "test": 125007898467,
      "build": 125007898511
    },
    "jobs": {
      "typecheck": {
        "job": 125007898349,
        "checkoutSHA": "68325264cdd257a9b0c44d4ec17577b390a47629",
        "logSHA256": "6622201536f77aedc7a4aa6e668dd9d6e4d7f264205dae479ef0c57a24ca48ec"
      },
      "protection": {
        "job": 125007898466,
        "checkoutSHA": "21a769f9ab72a5c3b1a938d0ec1551163553670a",
        "logSHA256": "899f737df6dc9621606153101d7e1127461a7defbcefe1e4e13a124249d9ea6e"
      },
      "test": {
        "job": 125007898467,
        "checkoutSHA": "68325264cdd257a9b0c44d4ec17577b390a47629",
        "logSHA256": "3fd81d85a6729d511529dfe02170baafdbf2ed1f891461671bf4d05a65cb8852"
      },
      "build": {
        "job": 125007898511,
        "checkoutSHA": "68325264cdd257a9b0c44d4ec17577b390a47629",
        "logSHA256": "52c1c501f2a53c735fe17f94bc4d60831011f99059f266c7f6f2aaa31ce72c2a"
      }
    },
    "actualCheckoutTrees": {
      "68325264cdd257a9b0c44d4ec17577b390a47629": "325ea6031b1f40acd6a5d47d684d521b7596f314",
      "21a769f9ab72a5c3b1a938d0ec1551163553670a": "325ea6031b1f40acd6a5d47d684d521b7596f314"
    },
    "allFourCheckoutTreesExact": true,
    "testBlob": "ec75a11d52bb9b823ba11f4afc8a62f56ce3b193",
    "runtimeBlob": "22a2b75d811630ae7d02b2ef7cc69599a38b75ef",
    "proof": [
      "2026-11-01T23:01:38.1185901Z  Test Files  4 passed (4)",
      "2026-11-01T23:01:38.1187236Z       Tests  145 passed (145)",
      "2026-11-01T23:01:57.3587207Z  \u276f client/src/research/assisted-order/RequestIntentForm.test.tsx (51 tests | 3 failed) 1663ms",
      "2026-11-01T23:01:57.3745076Z      \u00d7 retains raw billing input when toggled off and on: fresh separate address 46ms",
      "2026-11-01T23:01:57.3746915Z      \u00d7 retains raw billing input when toggled off and on: newer edits to a reviewed address 79ms",
      "2026-11-01T23:01:57.3748909Z      \u00d7 retains raw billing input when toggled off and on: hidden address across product navigation 61ms",
      "2026-11-01T23:06:40.0257813Z \u23af\u23af\u23af\u23af\u23af\u23af\u23af Failed Tests 3 \u23af\u23af\u23af\u23af\u23af\u23af\u23af",
      "2026-11-01T23:06:40.0263981Z  FAIL  client/src/research/assisted-order/RequestIntentForm.test.tsx > request selection layout and controls (component fixtures, not viewport proof) > retains raw billing input when toggled off and on: fresh separate address",
      "2026-11-01T23:06:40.0268697Z  FAIL  client/src/research/assisted-order/RequestIntentForm.test.tsx > request selection layout and controls (component fixtures, not viewport proof) > retains raw billing input when toggled off and on: hidden address across product navigation",
      "2026-11-01T23:06:40.0274298Z AssertionError: expected '' to be '  6 Synthetic Billing Lane  ' // Object.is equality",
      "2026-11-01T23:06:40.0631297Z  FAIL  client/src/research/assisted-order/RequestIntentForm.test.tsx > request selection layout and controls (component fixtures, not viewport proof) > retains raw billing input when toggled off and on: newer edits to a reviewed address",
      "2026-11-01T23:06:40.0634269Z AssertionError: expected '2 Synthetic Billing Street' to be '  6 Synthetic Billing Lane  ' // Object.is equality",
      "2026-11-01T23:06:40.0730150Z  Test Files  1 failed | 982 passed | 6 skipped (989)",
      "2026-11-01T23:06:40.0932598Z       Tests  3 failed | 18364 passed | 83 skipped (18450)",
      "2026-11-01T23:06:40.1234726Z ##[error]AssertionError: expected '' to be '  6 Synthetic Billing Lane  ' // Object.is equality",
      "2026-11-01T23:06:40.1253611Z ##[error]AssertionError: expected '2 Synthetic Billing Street' to be '  6 Synthetic Billing Lane  ' // Object.is equality",
      "2026-11-01T23:06:40.1261767Z ##[error]AssertionError: expected '' to be '  6 Synthetic Billing Lane  ' // Object.is equality"
    ],
    "nativeBrowserAuthStagingManagedDB": "NOT RUN; synthetic hosted component fixtures only",
    "nativeGoal": null
  },
  "GREEN": {
    "state": "BILLING_GREEN_ACTUAL_HOSTED_RESULT",
    "head": "0e7e27e0f9f946900bdc54676741ba0a9f79b5aa",
    "tree": "550c4ae5b95abcb8ce7ac4da5024e86a3a7a02e7",
    "run": 41360586888,
    "event": "pull_request",
    "attempt": 1,
    "full": {
      "passed": 18367,
      "failed": 0,
      "skipped": 83
    },
    "Form": {
      "total": 51,
      "passed": 51,
      "failed": 0
    },
    "focused145": "PASS overlapping full suite, not additive",
    "requiredChecks": {
      "Required CI completion": 125011307899,
      "test": 125009903025,
      "build": 125009903143,
      "typecheck": 125009903138,
      "protection": 125009902829
    },
    "jobs": {
      "protection": {
        "job": 125009902829,
        "checkoutSHA": "0e7e27e0f9f946900bdc54676741ba0a9f79b5aa",
        "logSHA256": "2dee9c288430eb04c3ce707afcde880abe3ce8e44ea1586c525edc5806cd3bb0"
      },
      "test": {
        "job": 125009903025,
        "checkoutSHA": "b220f6b0f13a648d436143f948249860ea7e600b",
        "logSHA256": "b89d28e3009f989fbddf00e98c6a2eb4e129fc573bb6a889b5c9601949ab2ccd"
      },
      "typecheck": {
        "job": 125009903138,
        "checkoutSHA": "b220f6b0f13a648d436143f948249860ea7e600b",
        "logSHA256": "169748e501f0e4a5afc3b4e8afeaaf25ba590e6df86e974dd63081d034434f3c"
      },
      "build": {
        "job": 125009903143,
        "checkoutSHA": "b220f6b0f13a648d436143f948249860ea7e600b",
        "logSHA256": "ec5958d766b255319575f07cbdb1e9a3fec99e968e0530736e6e3fa570158a0e"
      }
    },
    "actualCheckoutTrees": {
      "0e7e27e0f9f946900bdc54676741ba0a9f79b5aa": "550c4ae5b95abcb8ce7ac4da5024e86a3a7a02e7",
      "b220f6b0f13a648d436143f948249860ea7e600b": "550c4ae5b95abcb8ce7ac4da5024e86a3a7a02e7"
    },
    "allFourCheckoutTreesExact": true,
    "testBlob": "ec75a11d52bb9b823ba11f4afc8a62f56ce3b193",
    "runtimeBlob": "966bd8ce9856ff49ba09c0a43d047f0f9c834940",
    "proof": [
      "2026-11-01T23:09:35.8887924Z  Test Files  4 passed (4)",
      "2026-11-01T23:09:35.8888788Z       Tests  145 passed (145)",
      "2026-11-01T23:09:51.2129018Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (51 tests) 1073ms",
      "2026-11-01T23:13:31.5739078Z  Test Files  983 passed | 6 skipped (989)",
      "2026-11-01T23:13:31.5855109Z       Tests  18367 passed | 83 skipped (18450)"
    ],
    "nativeBrowserAuthStagingManagedDB": "NOT RUN; synthetic hosted component fixtures only",
    "nativeGoal": null
  },
  "mechanism": "Capture raw current contact fields before billing hides; retain absent billing fields during Back using field presence, so explicit blanks/latest edits prevail. Successful review still clears draft; shipping substitution and component-memory lifetime unchanged.",
  "regressionLimits": "Three RED cases each first fail at restored billing street: empty for fresh/navigation, older reviewed for newer edits. Downstream validation/ack/shipping/marker assertions were NOT RUN after those failures in RED; all execute/pass in GREEN. No native browser proof.",
  "allOtherApplicationBytesUnchangedFromBase": true,
  "noRuntimeAuthConfigSQLRolesFlagsNotificationProviderCustomerChanges": true,
  "localNodeTestsBuildBrowserManagedPrivateEvaluation": "NOT RUN",
  "actualHeadRequiredChecks": "all five trusted app15368 SUCCESS, actual four checkout trees exact550c; focused145 overlaps full suite",
  "hostedGREENQualificationSHA256": "52597ebb9e11ecf402ce4dcc5b6fc78e0b16a183c5f32ea14802d199279ec291",
  "hostedREDQualificationSHA256": "8d4e431bd0215068c686311e6ac62f30dee45378844cce32c8b187c0673889f1",
  "helper": "Existing quick_order_selection_unit actual RED and GREEN-preparation ACKs; authored3cases and private runtime patch, IDLE. Root reviewed/applied/committed; not independent acceptance.",
  "staging": "HELD. Actual Samuel confirms no verified security closure/private packet reference in checked records. Missing exact inputs recordedKAN85/10442 andKAN147/10443; no repeated search or operator identity ask. C2 source remainsclosed10434.",
  "nextSeparateLane": "Claude admin10437 delivered, actual writerACK/custody not known; do not duplicate. Document proposal10439 deferred as defensive synthetic hardening,14reportedPASS/VitestNOTRUN/unintegrated.",
  "production": "PR360 draft/unmerged/notdeployed; current completedrelease0ca/static scopes CLOSED; source acceptance alone is not productionGO"
}
