{
  "state": "PURE_ACCEPTED_COMPOSITION_GREEN",
  "pr": 352,
  "source": "b6ca0c2287f4051e359de6ec05b841c826ed0774",
  "tree": "6785bd40d57271e1aad4186ed0078024b6799d98",
  "base": "8a35dc708dcc1bb4007038e0dc35d90864cfcc94",
  "run": {
    "attempt": 1,
    "conclusion": "success",
    "createdAt": "2026-10-31T16:26:50Z",
    "databaseId": 41219721144,
    "event": "pull_request",
    "headSha": "b6ca0c2287f4051e359de6ec05b841c826ed0774",
    "jobs": [
      {
        "completedAt": "2026-10-31T16:27:21Z",
        "conclusion": "success",
        "databaseId": 124591560838,
        "name": "build",
        "startedAt": "2026-10-31T16:26:53Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:26:54Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:26:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:26:59Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T16:26:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:04Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T16:26:59Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:13Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T16:27:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:19Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T16:27:13Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:19Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T16:27:19Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:19Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T16:27:19Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:19Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T16:27:19Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124591560838"
      },
      {
        "completedAt": "2026-10-31T16:33:43Z",
        "conclusion": "success",
        "databaseId": 124591560989,
        "name": "test",
        "startedAt": "2026-10-31T16:26:54Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:26:55Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:26:55Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:05Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T16:26:55Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:10Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T16:27:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:22Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T16:27:10Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:28:10Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T16:27:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:33:30Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T16:28:10Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:33:30Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T16:33:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:33:31Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T16:33:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:33:31Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T16:33:31Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124591560989"
      },
      {
        "completedAt": "2026-10-31T16:27:35Z",
        "conclusion": "success",
        "databaseId": 124591561030,
        "name": "protection",
        "startedAt": "2026-10-31T16:27:00Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:27:02Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:27:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:12Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T16:27:02Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:18Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T16:27:12Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:30Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T16:27:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:30Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T16:27:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:33Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T16:27:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:33Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T16:27:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:33Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T16:27:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:33Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T16:27:33Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124591561030"
      },
      {
        "completedAt": "2026-10-31T16:27:44Z",
        "conclusion": "success",
        "databaseId": 124591561223,
        "name": "typecheck",
        "startedAt": "2026-10-31T16:26:53Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:26:56Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:26:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:01Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T16:26:56Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:07Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T16:27:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:14Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T16:27:07Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:41Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T16:27:14Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:41Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T16:27:41Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:42Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T16:27:41Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:27:42Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T16:27:42Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124591561223"
      },
      {
        "completedAt": "2026-10-31T16:33:50Z",
        "conclusion": "success",
        "databaseId": 124593190585,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T16:33:46Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:33:47Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:33:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:33:47Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T16:33:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:33:47Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T16:33:47Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124593190585"
      }
    ],
    "status": "completed",
    "updatedAt": "2026-10-31T16:33:50Z",
    "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144"
  },
  "requiredChecks": {
    "test": {
      "id": 124591560989,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124591560989",
      "app": 15368
    },
    "typecheck": {
      "id": 124591561223,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124591561223",
      "app": 15368
    },
    "build": {
      "id": 124591560838,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124591560838",
      "app": 15368
    },
    "protection": {
      "id": 124591561030,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124591561030",
      "app": 15368
    },
    "Required CI completion": {
      "id": 124593190585,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41219721144/job/124593190585",
      "app": 15368
    }
  },
  "full": {
    "passed": 18337,
    "failed": 0,
    "skipped": 83,
    "filesPassed": 981,
    "filesSkipped": 6
  },
  "fullRaw": [
    "test\tRun npx vitest run\t2026-10-31T16:33:30.4340420Z  Test Files  981 passed | 6 skipped (987)",
    "test\tRun npx vitest run\t2026-10-31T16:33:30.4524547Z       Tests  18337 passed | 83 skipped (18420)"
  ],
  "focusedRaw": [
    "test\tFocused guest-entry regression checks\t2026-10-31T16:28:10.4396274Z       Tests  143 passed (143)"
  ],
  "focusedOverlapNotAdditive": true,
  "perFileRaw": [
    "test\tRun npx vitest run\t2026-10-31T16:28:26.3679782Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (69 tests) 7779ms",
    "test\tRun npx vitest run\t2026-10-31T16:28:30.5959886Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (46 tests) 1346ms",
    "test\tRun npx vitest run\t2026-10-31T16:29:22.0077407Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 4005ms",
    "test\tRun npx vitest run\t2026-10-31T16:29:24.6760698Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 618ms",
    "test\tRun npx vitest run\t2026-10-31T16:30:31.3439937Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4341ms",
    "test\tRun npx vitest run\t2026-10-31T16:31:08.5784452Z  \u2713 client/src/research/assisted-order/request-intent-api.test.ts (39 tests) 94ms",
    "test\tRun npx vitest run\t2026-10-31T16:32:46.4732508Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 10ms"
  ],
  "providerMerge": "fbaf7657027a954c83500bd13af6384ba304354f",
  "providerTreeExact": true,
  "jobCheckoutSHAs": {
    "build": "fbaf7657027a954c83500bd13af6384ba304354f",
    "test": "fbaf7657027a954c83500bd13af6384ba304354f",
    "protection": "b6ca0c2287f4051e359de6ec05b841c826ed0774",
    "typecheck": "fbaf7657027a954c83500bd13af6384ba304354f"
  },
  "allJobCheckoutTreesExact": true,
  "acceptedSources": [
    {
      "pr": 349,
      "head": "3671656df1f33ebad27d370f330d6693d9aec4dd",
      "verdict": 6545531501,
      "jira": "10408"
    },
    {
      "pr": 350,
      "head": "2a682165d0b8ae1d2ebccb70596effc0681fc93a",
      "verdict": 6545592794,
      "jira": "10409"
    }
  ],
  "acceptedBlobs": {
    "client/src/research/assisted-order/OrderRequestEntry.tsx": {
      "acceptedFrom": 349,
      "head": "3671656df1f33ebad27d370f330d6693d9aec4dd",
      "acceptedBlob": "d0474954de32a99fcdd1fab23a28026aa75b188f",
      "baseBlob": "ad462b627bd3e8f32a00c2416cff006fdbccee9a"
    },
    "client/src/research/assisted-order/RequestIntentEntry.tsx": {
      "acceptedFrom": 349,
      "head": "3671656df1f33ebad27d370f330d6693d9aec4dd",
      "acceptedBlob": "e50c2ba494f710a620e34e915e8829d236edb81f",
      "baseBlob": "f775b29e64a55cb75dc26ed629e26d1ac18e7837"
    },
    "client/src/research/assisted-order/RequestIntentForm.test.tsx": {
      "acceptedFrom": 349,
      "head": "3671656df1f33ebad27d370f330d6693d9aec4dd",
      "acceptedBlob": "a678bb50c09513aa9435ba275619ee1de18b8b86",
      "baseBlob": "205f84d6fbff5e4c3c03f66e78cf438f71c005fb"
    },
    "client/src/research/assisted-order/RequestIntentForm.tsx": {
      "acceptedFrom": 349,
      "head": "3671656df1f33ebad27d370f330d6693d9aec4dd",
      "acceptedBlob": "30262c74983e556679b6f06a2324c2bca441fab5",
      "baseBlob": "022055da58dc920c80615262ce7d1b891aa95646"
    },
    "client/src/research/assisted-order/RequestIntentReceipt.tsx": {
      "acceptedFrom": 349,
      "head": "3671656df1f33ebad27d370f330d6693d9aec4dd",
      "acceptedBlob": "66ad54df9159df1ca918455d6cd683f4a4acdcfc",
      "baseBlob": null
    },
    "client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx": {
      "acceptedFrom": 349,
      "head": "3671656df1f33ebad27d370f330d6693d9aec4dd",
      "acceptedBlob": "6c17d083808e8470349a4f5e90a7510e6cb739cd",
      "baseBlob": "6cadf32c94ea79b5017d1794a0fd1baa02f0ad71"
    },
    "client/src/research/assisted-order/request-intent-api.test.ts": {
      "acceptedFrom": 350,
      "head": "2a682165d0b8ae1d2ebccb70596effc0681fc93a",
      "acceptedBlob": "b83a24659865b90c4858885ded66b4b32b8f03df",
      "baseBlob": "7c13379f33981f28df8cd2b3728ce5be8c846c01"
    },
    "client/src/research/assisted-order/request-intent-api.ts": {
      "acceptedFrom": 350,
      "head": "2a682165d0b8ae1d2ebccb70596effc0681fc93a",
      "acceptedBlob": "509248c66f0fbea61c9fb8c11be9e809a573b7c4",
      "baseBlob": "d327fb2d41b5016f488660790bf870b7f78cbf08"
    }
  },
  "allEightAcceptedBlobsByteIdentical": true,
  "newSourceEdits": false,
  "excluded351": true,
  "testRerunOrNewSkips": false,
  "authorship": "Root pure composition; finite source assistance is not independent acceptance. Existing exact349/350 source acceptances reused; no composition source edits.",
  "limits": {
    "nativeBrowser": "NOT RUN",
    "liveAuth": "NOT RUN",
    "managedDatabaseStaffReads": "NOT RUN",
    "nativePG17": "NOT RUN; source accepted launcher21mocks separate",
    "fullLiveJourney": "NOT PROVEN",
    "activationAndSensitiveOps": "HELD",
    "productionMutation": false
  },
  "artifactSHA256": {
    "ACCEPTANCE_JIRA_10408_10409.json": "bc5aef3f5bb485301804b762872dc3b79fe2606ec4b95a81e08873ea82adf766",
    "ACCEPTANCE_PR349.json": "28dc80f6904747cba1ac75e88b86ea68a5b19beb692942faa6bbe35c91efb1f3",
    "ACCEPTANCE_PR350.json": "b3796129f322a883cc6b81e8d6a9ecf2b2b787e2d911e6eba09988a28ffb5f0e",
    "ACTIVE_CHECKPOINT_PREFIX.md": "9a71ec529822f5538752bd3bd183af960b5df25794eddae44b72813e462d8db8",
    "ACTIVE_CHECKPOINT_RECEIPT.json": "e4f85587a907450ce2275c39ea5e034331f605ea62c4258deb89213b583acdaa",
    "checkpoint_active.py": "c5c7be4b9ff5620840c6807cc0dc4b1613cd74615c636963593e9472820911be",
    "CLAIM_READBACK.json": "48c90ebefd1ae23bbc7f30606c5feb9826831e519f5c19e13056bb1cb1be6a6e",
    "finalize_release.py": "1c65929738779a54833a25a42e016910be8a220f4e5c18483739551b955e9980",
    "integrate.py": "c6bcceddd4a2a0a42d59fa4bef0da56d488f9bcbf2a556e4999ad01064b253cf",
    "INTEGRATION_CHECK_RUNS.json": "6538caec073357b8392a7d764d607bc24120a8f39cee984918c99def80dbd030",
    "INTEGRATION_CI.json": "52fa009f9825601cbcdb08848ad76956dd216b20aaa895af7297a9c318b0a15e",
    "INTEGRATION_CI_LOG.txt": "456aa1f5299152f53885a579e1aef846b8195aefa45d39881a0fbb540a878630",
    "INTEGRATION_SOURCE.json": "6202aced1ae877a8735fd9aab56ffa7721d34a35a83d2f15a0e4c874583c2f58",
    "MERGE_OPERATIONS.json": "e997a91dabc3c6efbe170a32d2e8f9bd7ce62ea1832509c02e3c3f75e6612e99",
    "merge_qualified.py": "c06c6cb8dfc7dc278ad96d53b9f98cf2a699bba679b07edefd0cc2439124e6b3",
    "post-deploy-receipt-catalog-check.sh": "ff1c748f486886155bd19e463d2103b27e162636074771b8d261fc0b05c5f0e6",
    "preflight.py": "9f57ddc1a83432c79f8774b8b36ef76c89434b8944c3812fc4cdccedd2808bcd",
    "prepare_release_tools.py": "3c8aab955e47c5e3978dc6db6656383298f327699a698a5360923d90c0e5a98e",
    "PR_BODY_PENDING.md": "6523c447de4101460cc250655aeae52ce22a4cd142e5d404db0682d30af60f82",
    "QUALIFIED_PR.json": "0bd564b6a94906caeaaf43abd6686be21c18c8828eaf6b7f3a95e5cd4d3ce05e",
    "qualify.py": "e4874f16710957bc3e311f565c0dc57f3ce486a569e97f79460677063c33ff33",
    "qualify_release.py": "18946160987c8e27eb60b9cd7c0aea266e9eaa1856f809039618495cb8e7fb35",
    "SOURCE_DIFF.patch": "1b84410d9f76501cce2a0b2532a10727b1a9219928db560d9391db63aca9bae4",
    "SOURCE_EarlyAccessRoute.storefront.test.tsx": "f51089625093bd828507d41154939459b724aa348fadabfb22172b2797c6315a",
    "SOURCE_OrderRequestEntry.tsx": "97aab13e250341e0464c7a422256a40e497d23e472e6f0c3b25a016e903ac3e1",
    "SOURCE_request-intent-api.test.ts": "1aa9f2b21d840050c9e17eecffaf90380bc1e363881708666272a1115a43e187",
    "SOURCE_request-intent-api.ts": "168bef64c100d45c96d77692a5ef406bb7c62d2484e3f6a491cafea4b6d7f729",
    "SOURCE_RequestIntentEntry.tsx": "ec8d0201078616a6d987c5b4b16bc14a4feda07c626be96305e1d2c2f09db37b",
    "SOURCE_RequestIntentForm.test.tsx": "678812133d9c0ca5fc13ae9961359488da09c8c3ea2199c57b407546b3a77393",
    "SOURCE_RequestIntentForm.tsx": "7bd4fafa28e802d55ec72f2867bba1c71639d0dd34f6dea493f8d677d0a6e737",
    "SOURCE_RequestIntentReceipt.tsx": "736e15c3b9cf23c901d2ceac20175cdd03e46ef19ea06abb2659753a0b026141",
    "verify_claim.py": "1a76fe1e1e2624e63321d2e32ab543a36882e622aa6af4b4d0cf9a9db17cbf23",
    "verify_qa_custody.py": "4942d5e95b4fb6417af05173b954bd2ae68f9356e47e9e77fd65140975992c08"
  }
}
