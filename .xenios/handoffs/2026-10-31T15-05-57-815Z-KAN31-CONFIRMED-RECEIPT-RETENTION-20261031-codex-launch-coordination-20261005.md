{
  "state": "SOURCE_GREEN_PENDING_INDEPENDENT_ACCEPTANCE",
  "task": "KAN31-CONFIRMED-RECEIPT-RETENTION-20261031",
  "lease": "e0fb1e9f-564c-4359-a061-22f222fa99ea",
  "rootSession": "codex-launch-coordination-20261005",
  "source": "3671656df1f33ebad27d370f330d6693d9aec4dd",
  "tree": "b8d5a7a62e70a596026cc13063c1d587d81b78d1",
  "base": "8a35dc708dcc1bb4007038e0dc35d90864cfcc94",
  "pr": 349,
  "run": {
    "attempt": 1,
    "conclusion": "success",
    "databaseId": 41212558538,
    "event": "pull_request",
    "headSha": "3671656df1f33ebad27d370f330d6693d9aec4dd",
    "jobs": [
      {
        "completedAt": "2026-10-31T14:58:40Z",
        "conclusion": "success",
        "databaseId": 124570421520,
        "name": "build",
        "startedAt": "2026-10-31T14:58:03Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T14:58:05Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T14:58:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:10Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T14:58:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:16Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T14:58:10Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:28Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T14:58:16Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:36Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T14:58:28Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:36Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T14:58:36Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:37Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T14:58:36Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:37Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T14:58:37Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124570421520"
      },
      {
        "completedAt": "2026-10-31T14:58:59Z",
        "conclusion": "success",
        "databaseId": 124570421657,
        "name": "typecheck",
        "startedAt": "2026-10-31T14:58:03Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T14:58:05Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T14:58:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:10Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T14:58:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:16Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T14:58:10Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:25Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T14:58:16Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:56Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T14:58:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:56Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T14:58:56Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:56Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T14:58:56Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:56Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T14:58:56Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124570421657"
      },
      {
        "completedAt": "2026-10-31T14:58:35Z",
        "conclusion": "success",
        "databaseId": 124570421671,
        "name": "protection",
        "startedAt": "2026-10-31T14:58:03Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T14:58:04Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T14:58:03Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:14Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T14:58:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:18Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T14:58:14Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:30Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T14:58:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:30Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T14:58:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:33Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T14:58:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:33Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T14:58:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:33Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T14:58:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:33Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T14:58:33Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124570421671"
      },
      {
        "completedAt": "2026-10-31T15:04:33Z",
        "conclusion": "success",
        "databaseId": 124570421699,
        "name": "test",
        "startedAt": "2026-10-31T14:58:03Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T14:58:05Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T14:58:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:16Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T14:58:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:22Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T14:58:16Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:58:33Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T14:58:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T14:59:19Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T14:58:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:04:30Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T14:59:19Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:04:30Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T15:04:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:04:31Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T15:04:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:04:31Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T15:04:31Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124570421699"
      },
      {
        "completedAt": "2026-10-31T15:04:38Z",
        "conclusion": "success",
        "databaseId": 124571955824,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T15:04:36Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:04:37Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:04:37Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:04:37Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T15:04:37Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:04:37Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T15:04:37Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124571955824"
      }
    ],
    "status": "completed",
    "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538"
  },
  "requiredChecks": {
    "test": {
      "id": 124570421699,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124570421699",
      "appId": 15368
    },
    "build": {
      "id": 124570421520,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124570421520",
      "appId": 15368
    },
    "typecheck": {
      "id": 124570421657,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124570421657",
      "appId": 15368
    },
    "protection": {
      "id": 124570421671,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124570421671",
      "appId": 15368
    },
    "Required CI completion": {
      "id": 124571955824,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41212558538/job/124571955824",
      "appId": 15368
    }
  },
  "fullRaw": [
    "test\tRun npx vitest run\t2026-10-31T15:04:30.3337858Z  Test Files  981 passed | 6 skipped (987)",
    "test\tRun npx vitest run\t2026-10-31T15:04:30.3535988Z       Tests  18315 passed | 83 skipped (18398)"
  ],
  "focusedRaw": [
    "test\tFocused guest-entry regression checks\t2026-10-31T14:59:19.0770303Z       Tests  143 passed (143)"
  ],
  "focusedOverlapNotAdditive": true,
  "perFileRaw": [
    "test\tRun npx vitest run\t2026-10-31T14:59:34.5936600Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (69 tests) 7668ms",
    "test\tRun npx vitest run\t2026-10-31T14:59:38.7835393Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (46 tests) 1316ms",
    "test\tRun npx vitest run\t2026-10-31T15:00:28.3624848Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 4086ms",
    "test\tRun npx vitest run\t2026-10-31T15:00:31.1165071Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 574ms",
    "test\tRun npx vitest run\t2026-10-31T15:01:34.4103931Z  \u2713 client/src/research/assisted-order/OrderRequestEntry.test.tsx (28 tests) 522ms",
    "test\tRun npx vitest run\t2026-10-31T15:01:36.2792985Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4528ms",
    "test\tRun npx vitest run\t2026-10-31T15:03:22.6013740Z  \u2713 client/src/research/assisted-order/request-intent-api.test.ts (17 tests) 59ms",
    "test\tRun npx vitest run\t2026-10-31T15:03:47.4222077Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 11ms"
  ],
  "providerMerge": "008a2839e9328befb716390aca7a691814d3d19e",
  "providerTreeExact": true,
  "paths": {
    "client/src/research/assisted-order/RequestIntentReceipt.tsx": {
      "base": null,
      "candidate": "66ad54df9159df1ca918455d6cd683f4a4acdcfc"
    },
    "client/src/research/assisted-order/RequestIntentEntry.tsx": {
      "base": "f775b29e64a55cb75dc26ed629e26d1ac18e7837",
      "candidate": "e50c2ba494f710a620e34e915e8829d236edb81f"
    },
    "client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx": {
      "base": "6cadf32c94ea79b5017d1794a0fd1baa02f0ad71",
      "candidate": "6c17d083808e8470349a4f5e90a7510e6cb739cd"
    },
    "client/src/research/assisted-order/RequestIntentForm.test.tsx": {
      "base": "205f84d6fbff5e4c3c03f66e78cf438f71c005fb",
      "candidate": "a678bb50c09513aa9435ba275619ee1de18b8b86"
    },
    "client/src/research/assisted-order/RequestIntentForm.tsx": {
      "base": "022055da58dc920c80615262ce7d1b891aa95646",
      "candidate": "30262c74983e556679b6f06a2324c2bca441fab5"
    },
    "client/src/research/assisted-order/OrderRequestEntry.tsx": {
      "base": "ad462b627bd3e8f32a00c2416cff006fdbccee9a",
      "candidate": "d0474954de32a99fcdd1fab23a28026aa75b188f"
    }
  },
  "diffStat": ".../research/assisted-order/OrderRequestEntry.tsx  |  22 ++-\n .../research/assisted-order/RequestIntentEntry.tsx |   6 +-\n .../assisted-order/RequestIntentForm.test.tsx      |  33 ++++\n .../research/assisted-order/RequestIntentForm.tsx  |  13 +-\n .../assisted-order/RequestIntentReceipt.tsx        |  14 ++\n .../EarlyAccessRoute.storefront.test.tsx           | 177 ++++++++++++++++++++-\n 6 files changed, 252 insertions(+), 13 deletions(-)",
  "red": {
    "source": "29a9c983010bf39a691fd0cd58f16b9291176e59",
    "tree": "1094bb482b6b7d718d582bbae09c0adb09425c06",
    "run": 41212295955,
    "fiveIntendedStorefrontFailures": true,
    "focusedPassed": 137,
    "focusedFailed": 5,
    "fullSuite": "NOT RUN: focused gate failed",
    "FormCallbackCases": "NOT RUN on red",
    "buildTypecheckProtection": "PASS",
    "logSHA256": "a8f1fbdcbe8983e4df29c07dd985aae50f0d24d801232b01de949006bf7b5ff5"
  },
  "testPrecision": {
    "redAssertionsRetained": true,
    "existingSameMemberCase": "intentionally strengthens receipt-loss expectation to retention; owner-change agreement behavior preserved",
    "afterRedChanges": [
      "Callback records marker in callback and asserts outside catch boundary",
      "Adds replacement-marker callback negative control",
      "Adds direct authenticated A-to-B-to-A discard control"
    ],
    "redToGreenTestByteIdentity": false,
    "noWeakenedAssertionOrNewSkipOrWaiver": true
  },
  "behavior": "Confirmed normalized receipt + verified member cartScope retained only in component memory above Research checking return; hidden during checking, shown before fresh door selection only to same verified member. Permanently discard on other owner/signout/recovery/failure/invalidscope/route reset. Anonymous literal not retained. Existing owned-marker/mounted/normalized-success safeguards precede confirmation callback. Shared receipt presentation preserves copy and heading focus.",
  "authorship": "Root implementation/tests; finite quick_order_selection_unit read-only trace/harness/final-source assistance. Not independent acceptance. SAME c16 exact-source acceptance still required.",
  "limits": {
    "syntheticMountedReactJSDOM": true,
    "applicationNetwork": "NOT RUN; synthetic fetch/API fixtures",
    "nativeBrowser": "NOT RUN; prior allowance consumed",
    "liveAuth": "NOT RUN",
    "managedDatabaseStaffCustomerReads": "NOT RUN; no SQL",
    "nativePG17": "NOT RUN/no host/nojob; baseline hosted PG guards not native qualification",
    "fullLiveJourney": "NOT PROVEN",
    "CoreAuthServerSQLConfigFlagsRolesCapabilityNotificationsProviderPaymentChanges": false,
    "productionOfThisSource": false,
    "KAN29ActivationAndAllSensitiveHolds": "UNCHANGED"
  },
  "previousRelease": "PR348 LIVE8a35dc7/dep-dbj00t2vcj2c73eeq1mg/public static192chunksPASS separately frozen545426030cd7b97f01b4ca1c699a8089c621aea2e19173c7f0ab1efd5e5c5af6",
  "artifactSHA256": {
    "capture_red.py": "dc119b071a5b1dc7ee706f332134f6fc22f4458122aae38565a77b16dd17d08e",
    "CLAIM_READBACK.json": "942820eb266e2496534f84cd840a5254efe1d62b93fcbe1f899a7152dae51f70",
    "GREEN_CHECK_RUNS.json": "018900c040baeb5790ae9a488db40f09e02c0cda6e23dde2e243ad147ad51930",
    "GREEN_CI.json": "707b9b337797a1150a0cab9ba93688c183f98a59ede68315424405102b0f32e4",
    "GREEN_CI_LOG.txt": "4c54b8efb36253e1395da90542c687fbc8ff70a83a25c95d2dc5cc3c66c1bccf",
    "HELPER_SOURCE_ASSISTANCE.json": "9ed448472b600641748887ab1560ff7d9bb342accdc2180b83c2a2acb235b250",
    "NEXT_OPERATION_INPUTS.json": "35c6663288f9bd05ff1b014a0668609508fc216a06804c2c626ef84eda01a227",
    "prepare_claim_verifier.py": "5531f99be0e59f8db1b31222a028984536ee1a810f9ed4663f9d05b996d5ae2c",
    "prepare_qa_verifier.py": "f16d47e2522448fe64555d181b4f2184e836a7be44b93c6ddecc0ae789e15ede",
    "PR_BODY_RED.md": "1d4c566bb3b654c5e312b7b7962b26a4e810725052bf15b68af0ebc50ab2315b",
    "QUALIFIED_PR.json": "a84e3d4026e06ea25b020df4c5c2e1144b503c6155e26ac88497161883732e8c",
    "qualify_green.py": "62b89cce813a976db098fea598afe4bab19ddcdb2d18bfd6591b521a4c9d01a2",
    "RED_CHECK_RUNS.json": "e98b6bdc7933cac4f57799704d65e7ad58dac66204af70707f4271f3e7e3b819",
    "RED_CI.json": "f238b9ba67235d6704f502976d4ab1984874456f73ea72d7a73b711a4814178a",
    "RED_CI_LOG.txt": "a8f1fbdcbe8983e4df29c07dd985aae50f0d24d801232b01de949006bf7b5ff5",
    "RED_PROVIDER_BINDING.json": "cb67469fa56545654f6680b8ba7e793a8941a33121130ee9cf0918a50393e803",
    "RED_RECEIPT_FAILURE_29a9c98.json": "40f07284de81db3de2052e36d73844394e3266a412f179f0bae0c7fca5f26d75",
    "SOURCE_DIFF.patch": "8491e63fd5b0b511f9be000a36b06583771ffc624d3d82dd2a70d51caf65d809",
    "SOURCE_EarlyAccessRoute.storefront.test.tsx": "f51089625093bd828507d41154939459b724aa348fadabfb22172b2797c6315a",
    "SOURCE_OrderRequestEntry.tsx": "97aab13e250341e0464c7a422256a40e497d23e472e6f0c3b25a016e903ac3e1",
    "SOURCE_RequestIntentEntry.tsx": "ec8d0201078616a6d987c5b4b16bc14a4feda07c626be96305e1d2c2f09db37b",
    "SOURCE_RequestIntentForm.test.tsx": "678812133d9c0ca5fc13ae9961359488da09c8c3ea2199c57b407546b3a77393",
    "SOURCE_RequestIntentForm.tsx": "7bd4fafa28e802d55ec72f2867bba1c71639d0dd34f6dea493f8d677d0a6e737",
    "SOURCE_RequestIntentReceipt.tsx": "736e15c3b9cf23c901d2ceac20175cdd03e46ef19ea06abb2659753a0b026141",
    "verify_claim.py": "d84796bdbf90219f53d01adf30fd0dce1e0ee9d45dc34fa3568542e2c69578e1",
    "verify_qa_custody.py": "16ac205ad96a5840331bed7e69a169812af88810363a4107f16f4455c9658757"
  }
}
