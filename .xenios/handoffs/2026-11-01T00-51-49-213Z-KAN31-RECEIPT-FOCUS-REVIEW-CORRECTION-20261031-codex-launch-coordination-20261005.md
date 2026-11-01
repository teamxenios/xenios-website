{
  "state": "SOURCE_GREEN_PENDING_SAME_INDEPENDENT_ACCEPTANCE",
  "stage": "GREEN",
  "pr": 353,
  "source": "2981d60a39bc8975d28dc2d5889d11dc2030546c",
  "tree": "89ac4efb4bef1a0f5450247feb8fde607dad3bd6",
  "base": "6c63aa923c457c1bdaec5a94c3bbe9b8d4664f7f",
  "old353Head": "59b828b32a7ee5d71d5e58f64cd887b2c1a94e2c",
  "baselineMerge": "cbb0e3d9509ad71d983590954cde5dd3cb77189c",
  "task": "KAN31-RECEIPT-FOCUS-REVIEW-CORRECTION-20261031",
  "lease": "5035f775-87fe-4743-ae92-02e679537010",
  "sourceStatus": {
    "head": "2981d60a39bc8975d28dc2d5889d11dc2030546c",
    "branch": "codex/quick-order-receipt-focus-20261031",
    "porcelain": "",
    "sourceRemote": {
      "ref": "refs/heads/codex/quick-order-receipt-focus-20261031",
      "sha": "2981d60a39bc8975d28dc2d5889d11dc2030546c"
    },
    "releaseRemote": {
      "ref": "refs/heads/release/early-access-code-session-checkout",
      "sha": "6c63aa923c457c1bdaec5a94c3bbe9b8d4664f7f"
    }
  },
  "run": {
    "attempt": 1,
    "conclusion": "success",
    "databaseId": 41258051541,
    "event": "pull_request",
    "headSha": "2981d60a39bc8975d28dc2d5889d11dc2030546c",
    "jobs": [
      {
        "completedAt": "2026-11-01T00:50:34Z",
        "conclusion": "success",
        "databaseId": 124705331568,
        "name": "test",
        "startedAt": "2026-11-01T00:44:21Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-11-01T00:44:22Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-11-01T00:44:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:33Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-11-01T00:44:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:38Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-11-01T00:44:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:49Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-11-01T00:44:38Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:45:34Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-11-01T00:44:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:50:31Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-11-01T00:45:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:50:31Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-11-01T00:50:31Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:50:31Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-11-01T00:50:31Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:50:31Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-11-01T00:50:31Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124705331568"
      },
      {
        "completedAt": "2026-11-01T00:45:09Z",
        "conclusion": "success",
        "databaseId": 124705331723,
        "name": "typecheck",
        "startedAt": "2026-11-01T00:44:21Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-11-01T00:44:22Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-11-01T00:44:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:26Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-11-01T00:44:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:32Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-11-01T00:44:26Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:39Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-11-01T00:44:32Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:45:07Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-11-01T00:44:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:45:07Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-11-01T00:45:07Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:45:07Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-11-01T00:45:07Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:45:07Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-11-01T00:45:07Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124705331723"
      },
      {
        "completedAt": "2026-11-01T00:45:03Z",
        "conclusion": "success",
        "databaseId": 124705331728,
        "name": "protection",
        "startedAt": "2026-11-01T00:44:22Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-11-01T00:44:24Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-11-01T00:44:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:39Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-11-01T00:44:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:46Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-11-01T00:44:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:57Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-11-01T00:44:46Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:57Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-11-01T00:44:57Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:45:00Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-11-01T00:44:57Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:45:00Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-11-01T00:45:00Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:45:01Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-11-01T00:45:00Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:45:01Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-11-01T00:45:01Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124705331728"
      },
      {
        "completedAt": "2026-11-01T00:44:54Z",
        "conclusion": "success",
        "databaseId": 124705331757,
        "name": "build",
        "startedAt": "2026-11-01T00:44:21Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-11-01T00:44:22Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-11-01T00:44:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:27Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-11-01T00:44:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:32Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-11-01T00:44:27Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:43Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-11-01T00:44:32Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:52Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-11-01T00:44:43Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:52Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-11-01T00:44:52Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:52Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-11-01T00:44:52Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:44:52Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-11-01T00:44:52Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124705331757"
      },
      {
        "completedAt": "2026-11-01T00:50:40Z",
        "conclusion": "success",
        "databaseId": 124706699368,
        "name": "Required CI completion",
        "startedAt": "2026-11-01T00:50:37Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-11-01T00:50:37Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-11-01T00:50:37Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:50:37Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-11-01T00:50:37Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-11-01T00:50:37Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-11-01T00:50:37Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124706699368"
      }
    ],
    "status": "completed",
    "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541"
  },
  "requiredChecks": {
    "test": {
      "id": 124705331568,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124705331568",
      "appId": 15368,
      "head": "2981d60a39bc8975d28dc2d5889d11dc2030546c",
      "conclusion": "success"
    },
    "typecheck": {
      "id": 124705331723,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124705331723",
      "appId": 15368,
      "head": "2981d60a39bc8975d28dc2d5889d11dc2030546c",
      "conclusion": "success"
    },
    "build": {
      "id": 124705331757,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124705331757",
      "appId": 15368,
      "head": "2981d60a39bc8975d28dc2d5889d11dc2030546c",
      "conclusion": "success"
    },
    "protection": {
      "id": 124705331728,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124705331728",
      "appId": 15368,
      "head": "2981d60a39bc8975d28dc2d5889d11dc2030546c",
      "conclusion": "success"
    },
    "Required CI completion": {
      "id": 124706699368,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41258051541/job/124706699368",
      "appId": 15368,
      "head": "2981d60a39bc8975d28dc2d5889d11dc2030546c",
      "conclusion": "success"
    }
  },
  "full": {
    "tests": {
      "passed": 18357,
      "failed": 0,
      "skipped": 83
    },
    "files": {
      "passed": 983,
      "failed": 0,
      "skipped": 6
    },
    "raw": [
      "test\tRun npx vitest run\t2026-11-01T00:50:31.3318262Z  Test Files  983 passed | 6 skipped (989)",
      "test\tRun npx vitest run\t2026-11-01T00:50:31.3427728Z       Tests  18357 passed | 83 skipped (18440)"
    ]
  },
  "focused": {
    "tests": {
      "passed": 145,
      "failed": 0,
      "skipped": 0
    },
    "files": {
      "passed": 4,
      "failed": 0,
      "skipped": 0
    },
    "raw": [
      "test\tFocused guest-entry regression checks\t2026-11-01T00:45:34.9301550Z  Test Files  4 passed (4)",
      "test\tFocused guest-entry regression checks\t2026-11-01T00:45:34.9302445Z       Tests  145 passed (145)"
    ]
  },
  "focusedOverlapNotAdditive": true,
  "component": {
    "cases": 4,
    "passed": 4,
    "failed": 0,
    "fileRaw": [
      "test\tRun npx vitest run\t2026-11-01T00:50:19.4834132Z  \u2713 client/src/research/assisted-order/RequestIntentReceipt.test.tsx (4 tests) 60ms"
    ],
    "controls": {
      "leaves focus alone by default": "PASS",
      "preserves deliberate focus outside the receipt": "PASS"
    },
    "controlPassBasis": "Four-case source plus terminal file result and exhaustive failing-case headers; not invented per-case reporter output.",
    "failureClassification": {}
  },
  "failureEvidence": [],
  "provider": "60bec1999525bb3ed4aabc37830e6a7b867b89a6",
  "providerTreeExact": true,
  "jobCheckoutSHAs": {
    "test": "60bec1999525bb3ed4aabc37830e6a7b867b89a6",
    "typecheck": "60bec1999525bb3ed4aabc37830e6a7b867b89a6",
    "protection": "2981d60a39bc8975d28dc2d5889d11dc2030546c",
    "build": "60bec1999525bb3ed4aabc37830e6a7b867b89a6"
  },
  "jobCheckoutTrees": {
    "test": "89ac4efb4bef1a0f5450247feb8fde607dad3bd6",
    "typecheck": "89ac4efb4bef1a0f5450247feb8fde607dad3bd6",
    "protection": "89ac4efb4bef1a0f5450247feb8fde607dad3bd6",
    "build": "89ac4efb4bef1a0f5450247feb8fde607dad3bd6"
  },
  "allFourJobCheckoutTreesExact": true,
  "checkoutTreeBasis": "Each checkout is exactly source or provider; local source tree and GitHub provider tree match.",
  "preimages": {
    "client/src/research/assisted-order/RequestIntentReceipt.tsx": {
      "old59": "88903e2279672279cc51e5d350f32571419f5b09",
      "baselineMerge": "88903e2279672279cc51e5d350f32571419f5b09",
      "red": "88903e2279672279cc51e5d350f32571419f5b09",
      "source": "98557061c14bf11fc6cd3cd406508f38dc3345a2",
      "currentBase": "66ad54df9159df1ca918455d6cd683f4a4acdcfc"
    },
    "client/src/research/assisted-order/RequestIntentReceipt.test.tsx": {
      "old59": "e304e112822f7da2089b2cf85fce28c5ace14405",
      "baselineMerge": "e304e112822f7da2089b2cf85fce28c5ace14405",
      "red": "aaeeb503a145cc8de028c7b88ff30c09459ee009",
      "source": "aaeeb503a145cc8de028c7b88ff30c09459ee009",
      "currentBase": null
    },
    "client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx": {
      "old59": "71cc61a380f9263148b1c39d7f231ba05ccfcf39",
      "baselineMerge": "71cc61a380f9263148b1c39d7f231ba05ccfcf39",
      "red": "71cc61a380f9263148b1c39d7f231ba05ccfcf39",
      "source": "71cc61a380f9263148b1c39d7f231ba05ccfcf39",
      "currentBase": "6c17d083808e8470349a4f5e90a7510e6cb739cd"
    }
  },
  "acceptedBaselineBlobsUnchanged": {
    "client/src/research/assisted-order/request-intent-api.ts": "c8d05c857d7a22de2f2b20f26114fee15dc1b314",
    "client/src/research/assisted-order/request-intent-api.test.ts": "327c46a0af71089cbfbf0ee9d589fbfd9633438e",
    "client/src/research/assisted-order/RequestIntentStaffReadback.tsx": "1d848bc163996456163379845ea93443a728564a",
    "client/src/research/assisted-order/RequestIntentStaffReadback.test.tsx": "9901e0303378214284b8bd6d17908b46afc2155a"
  },
  "old59ToNewRedComponentTestsChanged": true,
  "sourceComponentTestRawByteIdenticalToRed": true,
  "greenTestsRawByteIdenticalToRed": true,
  "storefrontRawByteIdenticalOld59RedSource": true,
  "reviewerInput": {
    "comment": 6549243063,
    "record": "KAN31/10418",
    "disposition": "CHANGES REQUIRED",
    "adoptedOption": "Allow focused ancestor via active.contains(node); preserve outside focus; restore node.focus() with no options."
  },
  "authorship": "Root authors source/tests. Existing quick_order_selection_unit finite proposal/harness/capture preparation is implementation assistance, NOT independent acceptance. SAME c16 exact-source review remains required.",
  "history": "Original 59b/cdb/796 evidence histories remain separate and untouched. Component tests changed old59 to this red; storefront did not. No prior qualification is reused for this tree.",
  "limits": {
    "jsdom": "Pins activeElement and focus-call arguments only; no native scroll, layout or engine proof.",
    "nativeBrowser": "NOT RUN",
    "liveJourney": "NOT PROVEN",
    "liveAuthOrPrivateContents": "NOT RUN",
    "managedSQL": "NOT RUN",
    "nativePG17": "NOT RUN",
    "localNodeBuildTests": "NOT RUN",
    "productionThisSource": false,
    "independentAcceptance": false,
    "newSkipWaiverRerunSoak": false,
    "serialization": "Root must establish actual serialization; this capture never starts CI or acquires admission.",
    "holds": "All existing activation, native-resource, browser, SQL, Auth/Core and production holds remain unchanged."
  },
  "rawLogSHA256": "8b8d1ec77df9719269f09506ed71d2050133c93915a5067220bfaa5769495a18",
  "parser": "Failed-first/passed-first summaries accepted; actual full totals parsed, never hardcoded. Focused 145 overlaps the full suite.",
  "logStepRecovery": {
    "used": false,
    "basis": "Exact focused/full raw command group markers; original raw log preserved. Original capture script stopped before evidence writes because gh returned UNKNOWN STEP. No source/test/CI rerun."
  },
  "red": {
    "qualificationFile": "RED_FOCUS_REVIEW_FAILURE_04df36a.json",
    "sha256": "7f1205327914172dc186b6bd15f4bf32254222bf7ee4bb7e0d7077f610840a2d",
    "bytes": 38330,
    "source": "04df36a51929562960b6cc6be6fa34387c2d96eb",
    "tree": "5f1f47a72f80af37eefdb22476b4fd955f9ca260",
    "run": {
      "attempt": 1,
      "conclusion": "failure",
      "databaseId": 41249239182,
      "event": "pull_request",
      "headSha": "04df36a51929562960b6cc6be6fa34387c2d96eb",
      "jobs": [
        {
          "completedAt": "2026-10-31T22:41:07Z",
          "conclusion": "success",
          "databaseId": 124679075928,
          "name": "build",
          "startedAt": "2026-10-31T22:40:34Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T22:40:36Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T22:40:35Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:41Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T22:40:36Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:47Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T22:40:41Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:57Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T22:40:47Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:04Z",
              "conclusion": "success",
              "name": "Run npm run build",
              "number": 5,
              "startedAt": "2026-10-31T22:40:57Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:04Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T22:41:04Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:05Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T22:41:04Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:05Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T22:41:05Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41249239182/job/124679075928"
        },
        {
          "completedAt": "2026-10-31T22:41:08Z",
          "conclusion": "success",
          "databaseId": 124679076087,
          "name": "protection",
          "startedAt": "2026-10-31T22:40:34Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T22:40:36Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T22:40:35Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:46Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T22:40:36Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:51Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T22:40:46Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:03Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T22:40:51Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:03Z",
              "conclusion": "success",
              "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
              "number": 5,
              "startedAt": "2026-10-31T22:41:03Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:06Z",
              "conclusion": "success",
              "name": "Run npm run verify:route-uniqueness",
              "number": 6,
              "startedAt": "2026-10-31T22:41:03Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:06Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T22:41:06Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:06Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T22:41:06Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:06Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T22:41:06Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41249239182/job/124679076087"
        },
        {
          "completedAt": "2026-10-31T22:47:14Z",
          "conclusion": "failure",
          "databaseId": 124679076099,
          "name": "test",
          "startedAt": "2026-10-31T22:40:34Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T22:40:35Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T22:40:35Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:46Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T22:40:35Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:50Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T22:40:46Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:02Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T22:40:50Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:51Z",
              "conclusion": "success",
              "name": "Focused guest-entry regression checks",
              "number": 5,
              "startedAt": "2026-10-31T22:41:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:47:12Z",
              "conclusion": "failure",
              "name": "Run npx vitest run",
              "number": 6,
              "startedAt": "2026-10-31T22:41:51Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:47:12Z",
              "conclusion": "skipped",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T22:47:12Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:47:13Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T22:47:12Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:47:13Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T22:47:13Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41249239182/job/124679076099"
        },
        {
          "completedAt": "2026-10-31T22:41:40Z",
          "conclusion": "success",
          "databaseId": 124679076103,
          "name": "typecheck",
          "startedAt": "2026-10-31T22:40:34Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T22:40:36Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T22:40:35Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:40Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T22:40:36Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:46Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T22:40:40Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:40:57Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T22:40:46Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:38Z",
              "conclusion": "success",
              "name": "Run npm run check",
              "number": 5,
              "startedAt": "2026-10-31T22:40:57Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:38Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T22:41:38Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:38Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T22:41:38Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:41:39Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T22:41:39Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41249239182/job/124679076103"
        },
        {
          "completedAt": "2026-10-31T22:47:21Z",
          "conclusion": "failure",
          "databaseId": 124680509210,
          "name": "Required CI completion",
          "startedAt": "2026-10-31T22:47:18Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T22:47:19Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T22:47:19Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:47:19Z",
              "conclusion": "failure",
              "name": "Refuse unsuccessful or missing required jobs",
              "number": 2,
              "startedAt": "2026-10-31T22:47:19Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T22:47:19Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 3,
              "startedAt": "2026-10-31T22:47:19Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41249239182/job/124680509210"
        }
      ],
      "status": "completed",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41249239182"
    },
    "full": {
      "tests": {
        "passed": 18355,
        "failed": 2,
        "skipped": 83
      },
      "files": {
        "passed": 982,
        "failed": 1,
        "skipped": 6
      },
      "raw": [
        "test\tRun npx vitest run\t2026-10-31T22:47:12.5244605Z  Test Files  1 failed | 982 passed | 6 skipped (989)",
        "test\tRun npx vitest run\t2026-10-31T22:47:12.5408900Z       Tests  2 failed | 18355 passed | 83 skipped (18440)"
      ]
    },
    "component": {
      "cases": 4,
      "passed": 2,
      "failed": 2,
      "fileRaw": [
        "test\tRun npx vitest run\t2026-10-31T22:46:59.6206780Z  \u276f client/src/research/assisted-order/RequestIntentReceipt.test.tsx (4 tests | 2 failed) 124ms"
      ],
      "controls": {
        "leaves focus alone by default": "PASS",
        "preserves deliberate focus outside the receipt": "PASS"
      },
      "controlPassBasis": "Four-case source plus terminal file result and exhaustive failing-case headers; not invented per-case reporter output.",
      "failureClassification": {
        "focuses the confirmation with default scrolling when focus is on the body": {
          "failureLine": 43,
          "headingAssertionLine": 42,
          "zeroArgumentAssertionLine": 43,
          "headingAssertion": "PASSED_BEFORE_ZERO_ARGUMENT_FAILURE",
          "zeroArgumentAssertion": "FAILED_OLD_PREVENT_SCROLL_OPTIONS",
          "basis": "Observed failure header/location plus straight-line source assertion order."
        },
        "moves ancestor-container focus to the confirmation": {
          "failureLine": 51,
          "headingAssertionLine": 51,
          "zeroArgumentAssertionLine": 52,
          "headingAssertion": "FAILED",
          "zeroArgumentAssertion": "NOT_RUN_AFTER_HEADING_FAILURE",
          "basis": "Observed failure header/location plus straight-line source assertion order."
        }
      }
    },
    "provider": "f7f197882bfe9d930e96e928f051ed5047d05387"
  },
  "artifacts": {
    "GREEN_OLD59_SOURCE_RequestIntentReceipt.tsx": {
      "sha256": "7bc39120164bf2769332daa3da8e8814d241fa5294366b7fa7c12513d6ea04bc",
      "bytes": 1237
    },
    "GREEN_SOURCE_RequestIntentReceipt.tsx": {
      "sha256": "cf7bef1ad3ee2f6a0464bb633a08b346ff6392440f0c1c9d47834862da2c3ef5",
      "bytes": 1256
    },
    "GREEN_BASE6C_SOURCE_RequestIntentReceipt.tsx": {
      "sha256": "736e15c3b9cf23c901d2ceac20175cdd03e46ef19ea06abb2659753a0b026141",
      "bytes": 1050
    },
    "GREEN_OLD59_SOURCE_RequestIntentReceipt.test.tsx": {
      "sha256": "ab1f13d25791904b87c1cad15e55d3e6cd5b9fd4146eb95e0a78bf9b148a1be5",
      "bytes": 2209
    },
    "GREEN_SOURCE_RequestIntentReceipt.test.tsx": {
      "sha256": "960c394f161940eb51ec609b1a16d6ee96412b4ba957a6fd3bffbece0b7aa105",
      "bytes": 2648
    },
    "GREEN_OLD59_SOURCE_EarlyAccessRoute.storefront.test.tsx": {
      "sha256": "e833b70be70c618dbaa24fbf39d14f6ff09804403778fdece53c46e1c8e39d47",
      "bytes": 80651
    },
    "GREEN_SOURCE_EarlyAccessRoute.storefront.test.tsx": {
      "sha256": "e833b70be70c618dbaa24fbf39d14f6ff09804403778fdece53c46e1c8e39d47",
      "bytes": 80651
    },
    "GREEN_BASE6C_SOURCE_EarlyAccessRoute.storefront.test.tsx": {
      "sha256": "f51089625093bd828507d41154939459b724aa348fadabfb22172b2797c6315a",
      "bytes": 77262
    },
    "GREEN_ACCEPTED_BASELINE_request-intent-api.ts": {
      "sha256": "08f90b784058f01dcce236bb448443b41e5d400869c80bb11dd95057bb7e401c",
      "bytes": 8860
    },
    "GREEN_ACCEPTED_BASELINE_request-intent-api.test.ts": {
      "sha256": "491442b15334af63f15831a1236d2f8c7aac37a9beac441e1a48dce9905256ba",
      "bytes": 13853
    },
    "GREEN_ACCEPTED_BASELINE_RequestIntentStaffReadback.tsx": {
      "sha256": "2ff7e58c50232423da140812a02d07ae9b14f3dc919f600294bbdcf27ea57bee",
      "bytes": 5872
    },
    "GREEN_ACCEPTED_BASELINE_RequestIntentStaffReadback.test.tsx": {
      "sha256": "80bc3f7fb4daefc364bacf36d922b067f65217551c59f52e398eb25fdf137522",
      "bytes": 8544
    },
    "GREEN_CI.json": {
      "sha256": "13d1dca12a653b06935ff7e11f5a613b8db356fcc780331596e86b77bee713aa",
      "bytes": 7564
    },
    "GREEN_CHECK_RUNS.json": {
      "sha256": "e0a96602ab5b275fc713913d5c255264a93a97723e2ec9dbee87416b38db299b",
      "bytes": 21276
    },
    "GREEN_CI_LOG.txt": {
      "sha256": "8b8d1ec77df9719269f09506ed71d2050133c93915a5067220bfaa5769495a18",
      "bytes": 1723359
    },
    "GREEN_PR.json": {
      "sha256": "6c5e489f797595fa8057c234f540929c38d43539bf581a6b1649bbea88bb0eeb",
      "bytes": 19380
    },
    "GREEN_PROVIDER_COMMIT.json": {
      "sha256": "c8cf4971ba289e0a06ab1843084a4bf5e68848abd3f1c84bb3179ef8d4867c9a",
      "bytes": 2668
    },
    "GREEN_CLAIM_READBACK.json": {
      "sha256": "6608a8abc3368219b1d29f2032e7bdfc3d8032632b3a2f74b4b4927243e21864",
      "bytes": 2801
    },
    "GREEN_BASELINE_RECONCILIATION.json": {
      "sha256": "aed8433229665719f4d8d21a601739fc708cd85fec0ddf1063151fc5ddbaa071",
      "bytes": 1520
    },
    "GREEN_SOURCE_PREIMAGES.json": {
      "sha256": "e3b978397f2c1e19c890dd7edf5cfddf8872b3eb5296bcaf78081bbc65622e5a",
      "bytes": 1087
    },
    "GREEN_SOURCE_STATUS.json": {
      "sha256": "eef68dc7e19e1914130a77aa16f8ebc10267df270994f97cb322a2538735c397",
      "bytes": 425
    },
    "GREEN_SOURCE_DIFF_VS6C.patch": {
      "sha256": "12f310f5148bdf58db0606275f35d987ed363045e20a5cdbd76225f39bc3ad8b",
      "bytes": 9251
    },
    "GREEN_SOURCE_DIFF_VSRED.patch": {
      "sha256": "5203a6af65e50a89e1ddea05aad35e27e419fa2625cbe9a275fd8bc7db2985d3",
      "bytes": 1021
    },
    "GREEN_FAILURE_EVIDENCE.json": {
      "sha256": "d03e364311e440a1488de4ea6190930e5d5bdb8c01f688d6a834515ee9d985fb",
      "bytes": 43
    },
    "GREEN_CAPTURE_SCRIPT.py": {
      "sha256": "58fe9e5c690debab0d11cd5c3fe62540ad53a18fcd19f8ff1fbc71c817d1ecb5",
      "bytes": 25761
    }
  }
}
