{
  "state": "PURE_ACCEPTED_COMPOSITION_GREEN",
  "pr": 355,
  "source": "23cd475222e6e1f4c3eed6bb3d67deea499889c7",
  "tree": "6b00706e16b72bff09ff7ed09848d9fbacc7a866",
  "base": "a704fb939da02171cf5d64f6b8946f378368b121",
  "run": {
    "attempt": 1,
    "conclusion": "success",
    "createdAt": "2026-10-31T20:35:14Z",
    "databaseId": 41239601317,
    "event": "pull_request",
    "headSha": "23cd475222e6e1f4c3eed6bb3d67deea499889c7",
    "jobs": [
      {
        "completedAt": "2026-10-31T20:36:36Z",
        "conclusion": "success",
        "databaseId": 124650533183,
        "name": "typecheck",
        "startedAt": "2026-10-31T20:35:18Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:35:20Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:35:19Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:25Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T20:35:20Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:32Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T20:35:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:45Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T20:35:32Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:36:33Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T20:35:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:36:33Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T20:36:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:36:33Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T20:36:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:36:33Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T20:36:33Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124650533183"
      },
      {
        "completedAt": "2026-10-31T20:35:50Z",
        "conclusion": "success",
        "databaseId": 124650533269,
        "name": "protection",
        "startedAt": "2026-10-31T20:35:17Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:35:18Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:35:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:28Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T20:35:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:33Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T20:35:28Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:45Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T20:35:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:45Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T20:35:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:48Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T20:35:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:48Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T20:35:48Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:48Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T20:35:48Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:48Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T20:35:48Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124650533269"
      },
      {
        "completedAt": "2026-10-31T20:41:50Z",
        "conclusion": "success",
        "databaseId": 124650533313,
        "name": "test",
        "startedAt": "2026-10-31T20:35:17Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:35:19Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:35:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:29Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T20:35:19Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:34Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T20:35:29Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:45Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T20:35:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:36:33Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T20:35:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:41:48Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T20:36:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:41:48Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T20:41:48Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:41:49Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T20:41:48Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:41:49Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T20:41:49Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124650533313"
      },
      {
        "completedAt": "2026-10-31T20:35:53Z",
        "conclusion": "success",
        "databaseId": 124650533373,
        "name": "build",
        "startedAt": "2026-10-31T20:35:18Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:35:19Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:35:19Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:24Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T20:35:19Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:30Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T20:35:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:42Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T20:35:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:50Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T20:35:42Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:50Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T20:35:50Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:51Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T20:35:50Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:35:51Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T20:35:51Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124650533373"
      },
      {
        "completedAt": "2026-10-31T20:41:57Z",
        "conclusion": "success",
        "databaseId": 124652046891,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T20:41:53Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:41:54Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:41:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:41:54Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T20:41:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:41:55Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T20:41:55Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124652046891"
      }
    ],
    "status": "completed",
    "updatedAt": "2026-10-31T20:41:57Z",
    "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317"
  },
  "requiredChecks": {
    "test": {
      "id": 124650533313,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124650533313",
      "app": 15368
    },
    "typecheck": {
      "id": 124650533183,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124650533183",
      "app": 15368
    },
    "build": {
      "id": 124650533373,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124650533373",
      "app": 15368
    },
    "protection": {
      "id": 124650533269,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124650533269",
      "app": 15368
    },
    "Required CI completion": {
      "id": 124652046891,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41239601317/job/124652046891",
      "app": 15368
    }
  },
  "full": {
    "passed": 18345,
    "failed": 0,
    "skipped": 83,
    "filesPassed": 982,
    "filesSkipped": 6
  },
  "fullRaw": [
    "test\tRun npx vitest run\t2026-10-31T20:41:48.4905683Z  Test Files  982 passed | 6 skipped (988)",
    "test\tRun npx vitest run\t2026-10-31T20:41:48.5022164Z       Tests  18345 passed | 83 skipped (18428)"
  ],
  "focusedRaw": [
    "test\tFocused guest-entry regression checks\t2026-10-31T20:36:33.1828028Z       Tests  143 passed (143)"
  ],
  "focusedOverlapNotAdditive": true,
  "perFileRaw": [
    "test\tRun npx vitest run\t2026-10-31T20:36:48.9389892Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (69 tests) 7705ms",
    "test\tRun npx vitest run\t2026-10-31T20:36:52.9962695Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (46 tests) 1275ms",
    "test\tRun npx vitest run\t2026-10-31T20:37:42.8383229Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 4096ms",
    "test\tRun npx vitest run\t2026-10-31T20:37:45.7236259Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 690ms",
    "test\tRun npx vitest run\t2026-10-31T20:38:52.1904087Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4540ms",
    "test\tRun npx vitest run\t2026-10-31T20:39:28.7751875Z  \u2713 client/src/research/assisted-order/request-intent-api.test.ts (39 tests) 98ms",
    "test\tRun npx vitest run\t2026-10-31T20:39:57.6656328Z  \u2713 client/src/research/assisted-order/RequestIntentStaffReadback.test.tsx (8 tests) 239ms",
    "test\tRun npx vitest run\t2026-10-31T20:41:05.3227439Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 11ms"
  ],
  "providerMerge": "c729e4e85c4bc14cddcb00d09dd60ab60d55315d",
  "providerTreeExact": true,
  "jobCheckoutSHAs": {
    "typecheck": "c729e4e85c4bc14cddcb00d09dd60ab60d55315d",
    "protection": "23cd475222e6e1f4c3eed6bb3d67deea499889c7",
    "test": "c729e4e85c4bc14cddcb00d09dd60ab60d55315d",
    "build": "c729e4e85c4bc14cddcb00d09dd60ab60d55315d"
  },
  "allJobCheckoutTreesExact": true,
  "acceptedSources": [
    {
      "pr": 351,
      "head": "a613440ad98e29cb466146952f4cf3e3ae225023",
      "tree": "b41975198306758f50e1f85140f2c7a63a965a1f",
      "verdict": 6548650423,
      "jira": "10413"
    }
  ],
  "acceptedBlobs": {
    "client/src/research/assisted-order/RequestIntentStaffReadback.tsx": {
      "baseBlob": "a46960cada352ea6cba0305c2db7c6472dd501f3",
      "acceptedBlob": "1d848bc163996456163379845ea93443a728564a",
      "acceptedFrom": 351,
      "head": "a613440ad98e29cb466146952f4cf3e3ae225023"
    },
    "client/src/research/assisted-order/RequestIntentStaffReadback.test.tsx": {
      "baseBlob": null,
      "acceptedBlob": "9901e0303378214284b8bd6d17908b46afc2155a",
      "acceptedFrom": 351,
      "head": "a613440ad98e29cb466146952f4cf3e3ae225023"
    }
  },
  "allAcceptedBlobsByteIdentical": true,
  "newSourceEdits": false,
  "excluded353354": true,
  "old18308NotCurrentQualification": true,
  "testRerunOrNewSkips": false,
  "authorship": "Root pure composition; finite source assistance is not independent acceptance. Existing exact351 source acceptance reused; no composition source edits.",
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
    "ACTIVE_CHECKPOINT_PREFIX.md": "096f20f59fe3ff4bf3bdbe4865d9ee73b139f94cdb8dae5882dc070970a2a69b",
    "ACTIVE_CHECKPOINT_RECEIPT.json": "7f997aa4f8c6b967f5be16ad64756ad89488ae0f96b6167b6bca34df8cfff703",
    "checkpoint_active.py": "31936902531b581ca24207dd2a7d132ad6d78c3e789b19f16bf89172657241c2",
    "CLAIM_READBACK.json": "abca8efff327845b9218ced673f1b8e14dc0b9d8f9c22cc801863f32da5ccc8b",
    "fetch_review_threads.py": "ac90fbe9d652dc56a4ba12f3ac3ea137de44c0d9ce401cc39b592a942b9c04ff",
    "finalize_release.py": "f8539e504e562612c99be728998b057329377c8e95383606196fbaca30e5d9de",
    "HELPER_COMPOSITION_ASSISTANCE.json": "74dfe67bade72616737edeae3cb5a4bc4665efc0655d4bca79af25163955ba83",
    "INITIAL_RENDER_DEPLOYS.json": "523223f29aaa8ad1682f7cc886fec980a818d3ce0b363b071b84320035d66325",
    "INITIAL_RENDER_SERVICE.json": "b9e186695e39ac8c2e519ee2077ecd704514a6556991586eb1838efa1a8074ad",
    "integrate.py": "4dca7f4db1c8971a29749ee3d0db912dc85accc759993faabf94de25a6621e7d",
    "INTEGRATION_CHECK_RUNS.json": "ee7f7378fc735fa72ae97d86289d31aefc5e6371dcbc424e1dad4d02972cbc96",
    "INTEGRATION_CI.json": "156adfc5c5c09e33bdd5bb2ffd8eeeb4c30e5674211d2e60638c6839faf3cf0d",
    "INTEGRATION_CI_LOG.txt": "24d085c405496224f9b1e5f8e6a8a49bb191a3729771d7d971e09a1db4206a6b",
    "INTEGRATION_SOURCE.json": "96e9e0bdc7353833d25759620d8af5212528de884894c9d5794fdab10cae78b8",
    "JIRA_STARTED_10415.md": "7fd9d633ec106603c0c05e743ef612b640ae336527771687499df64be5d4c7a1",
    "JIRA_STARTED_DELIVERY_RECEIPT.json": "f7aef9d4fd63f5a499fd79a56534d7c932d3d4fa4c27fa93e915061679568c4a",
    "MERGE_OPERATION.json": "87f051b1125b8d91ccac6ced174dd4373071726cba00f9d43f10540d371c9fe3",
    "merge_qualified.py": "d4c96efe60aed3ab6df34a1e95240471e08a3789b5e1597b63d30ee31c01e78a",
    "post-deploy-staff-pending-check.sh": "f87acb0b83c57d580d1d66eb6ae306bd5c162d60cd1f78f291b97a232ca59a7b",
    "POSTCHECK_SCRIPT_ROOT_REVIEW.json": "ed6184f549ffe253ed90af8f433d6303fc3f415e4573855aea850863d0f44c83",
    "preflight.py": "5b899333f5040353f30eeae8d3c3040431cc69262e5333bf8eb1c27da27f3992",
    "PREVIOUS_CHECKPOINT_4c160780.md": "4c160780c96873ad00ff5064517ec274eea70f75be373d976fc9f3fb4af658bb",
    "PR_BODY_STARTED.md": "fd8e7943f5eb3fa08a79fa3bdc4f31b5c57ad11e3b66f4ba06595bc5307be56c",
    "QUALIFIED_PR.json": "a17b5f79e6fcea4dafd60138b2328fbde88a1c486c24e36b4b5480139e1afee1",
    "qualify.py": "3d562393732f89d8bc438e0536812284ca54f32ad7e7103a7f54d4b7f2fe610d",
    "qualify_release.py": "8614ba3ee2cb7806a27fa9ddfcf42ef23f701c349342c31562305e53a89aac7a",
    "RENDER_REFERENCE_RECEIPT.json": "96858235d20fea2a2766faf5937eb8409d7d67046b99b7bdcdd1a6af2ebf17f9",
    "SAME_351_VERDICT_6548650423.md": "01a33b4d3581d176215cc7851f16ac74526c3193d68cc95243234ee8ab912d11",
    "SAME_351_VERDICT_KAN31_10413.md": "dbf02c49b58dc143298e434e1fa77df8cb16782fe0b4bca3d4cdfe282324014d",
    "SOURCE_ACCEPTANCE_RECEIPT.json": "27ec4c1bb5716b132014cd3853c3c4f140bf05b7d639c0479574817164d62b34",
    "SOURCE_DIFF.patch": "fb22fc2cd2b1f0e8b77ae9ab9b94b31b939273ecc3167673bca7483a181f697e",
    "SOURCE_RequestIntentStaffReadback.test.tsx": "80bc3f7fb4daefc364bacf36d922b067f65217551c59f52e398eb25fdf137522",
    "SOURCE_RequestIntentStaffReadback.tsx": "2ff7e58c50232423da140812a02d07ae9b14f3dc919f600294bbdcf27ea57bee",
    "verify_claim.py": "e4f68b2fe9e7d43872629ab287fbf7b08574facf6ef31f6772cb8436aeced103",
    "verify_qa_custody.py": "37a71bb075a2bb490ba7534e401002f3364305606e6c0922464d6d3cbd442473"
  }
}
