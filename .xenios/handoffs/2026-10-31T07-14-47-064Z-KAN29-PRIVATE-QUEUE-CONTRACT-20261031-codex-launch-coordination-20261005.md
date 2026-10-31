{
  "state": "APPLIED_PUSHED_GREEN_INDEPENDENT_SOURCE_REVIEW_PENDING",
  "pr": 347,
  "head": "48cca5c179773966dfa176046cd922efdfcad046",
  "tree": "db029a287468782d0364738444f69e930e0822b6",
  "parent": "eda873142d41fbc813c4c47d646adc4cadee2737",
  "base": "e0f349c04c10a820c847e4ed59490a7a90ea9449",
  "provider": "d3cbd8ca065d77b0c35fcc75d181062442e66272",
  "providerTreeExact": true,
  "task": "KAN29-PRIVATE-QUEUE-CONTRACT-20261031",
  "lease": "cc72136d-29d5-431b-9647-dd9e7940d71d",
  "owner": "codex-launch-coordination-20261005",
  "claimCanonical": "953cc88d668688fff7b2425d71be7b1f635b4955",
  "claimReadbackSHA256": "097e04203e5f346e94945c968f3e31f739af4e52e9a60e89e6b187ee98fa1e2c",
  "paths": [
    {
      "path": "client/src/research/assisted-order/request-intent-api.ts",
      "blob": "d327fb2d41b5016f488660790bf870b7f78cbf08",
      "baseBlob": "6bf4a57e387c66dec04c7d273e4a8e9cd15163bc"
    },
    {
      "path": "client/src/research/assisted-order/request-intent-api.test.ts",
      "blob": "7c13379f33981f28df8cd2b3728ce5be8c846c01",
      "baseBlob": "9d45544a2f00ca8e9e9fb92ccf8bf3b9953c0d4e"
    }
  ],
  "numstat": "48\t0\tclient/src/research/assisted-order/request-intent-api.test.ts\n5\t1\tclient/src/research/assisted-order/request-intent-api.ts",
  "testBlobUnchangedRedToGreen": true,
  "all4OldCaseBodiesUnchanged": true,
  "change": "Validate requestedpage safeinteger1..10000 beforetransport; require returnedpage===requestedpage, positive safeintegerpageSize and coherentitems.length<=pageSize,total; no coercion/default/clamping, guessedsizecap ormaxpagefromtotal. Validpartial/emptylatepage10000 retained.",
  "red": {
    "state": "ELEVEN_INTENDED_QUEUE_CONTRACT_FAILURES",
    "head": "eda873142d41fbc813c4c47d646adc4cadee2737",
    "tree": "481786884ad58ff75288539e73ebc4f67bfcd7f8",
    "run": 41178719441,
    "attempt": 1,
    "full": {
      "passed": 18279,
      "failed": 11,
      "skipped": 83,
      "filesPassed": 980,
      "filesFailed": 1,
      "filesSkipped": 6
    },
    "focused": {
      "passed": 126,
      "failed": 0,
      "overlapNotAdditive": true
    },
    "apiFile": {
      "passed": 6,
      "failed": 11,
      "total": 17
    },
    "positiveControls": "Validpartialpage+emptylaterpage10000 pass, all4oldcasebodiesretained",
    "failures": [
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1172171Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses invalid requested page 0 before transport",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1175300Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses invalid requested page 1.5 before transport",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1178433Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses invalid requested page 10001 before transport",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1224687Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses a successful envelope with missing returned page",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1265846Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses a successful envelope with wrong returned page",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1289164Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses a successful envelope with missing page size",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1322159Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses a successful envelope with zero page size",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1344919Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses a successful envelope with fractional page size",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1367877Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses a successful envelope with unsafe page size",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1391966Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses a successful envelope with more rows than page size",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1421115Z  FAIL  client/src/research/assisted-order/request-intent-api.test.ts > private queue response page identity and bounds > refuses a successful envelope with more rows than total"
    ],
    "provider": "8c822ff3b1997fbae68417718bd7930d21aeb2da",
    "rawLogSHA256": "dc42681098f4aa237afd385bc00458ae3687aca134ffb8d87e3ec0d4cc9f0415",
    "rawSummaries": [
      "test\tFocused guest-entry regression checks\t2026-10-31T06:59:54.8942967Z  Test Files  4 passed (4)",
      "test\tFocused guest-entry regression checks\t2026-10-31T06:59:54.8944198Z       Tests  126 passed (126)",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1166497Z \u23af\u23af\u23af\u23af\u23af\u23af Failed Tests 11 \u23af\u23af\u23af\u23af\u23af\u23af\u23af",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1444013Z  Test Files  1 failed | 980 passed | 6 skipped (987)",
      "test\tRun npx vitest run\t2026-10-31T07:05:07.1539200Z       Tests  11 failed | 18279 passed | 83 skipped (18373)"
    ],
    "jobs": {
      "build": "success",
      "test": "failure",
      "typecheck": "success",
      "protection": "success",
      "Required CI completion": "failure"
    },
    "scope": "SyntheticHTTPResponsefixtures; invalidargszerotransport; noapplicationnetwork"
  },
  "ci": {
    "attempt": 1,
    "conclusion": "success",
    "createdAt": "2026-10-31T07:06:35Z",
    "databaseId": 41179280242,
    "event": "pull_request",
    "headSha": "48cca5c179773966dfa176046cd922efdfcad046",
    "jobs": [
      {
        "completedAt": "2026-10-31T07:07:14Z",
        "conclusion": "success",
        "databaseId": 124473171127,
        "name": "build",
        "startedAt": "2026-10-31T07:06:39Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T07:06:40Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T07:06:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:06:45Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T07:06:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:06:52Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T07:06:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:03Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T07:06:52Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:11Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T07:07:03Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:11Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T07:07:11Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:12Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T07:07:11Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:12Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T07:07:12Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124473171127"
      },
      {
        "completedAt": "2026-10-31T07:07:46Z",
        "conclusion": "success",
        "databaseId": 124473171159,
        "name": "typecheck",
        "startedAt": "2026-10-31T07:06:39Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T07:06:40Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T07:06:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:06:45Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T07:06:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:06:51Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T07:06:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:02Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T07:06:51Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:44Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T07:07:02Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:44Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T07:07:44Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:44Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T07:07:44Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:44Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T07:07:44Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124473171159"
      },
      {
        "completedAt": "2026-10-31T07:07:10Z",
        "conclusion": "success",
        "databaseId": 124473171171,
        "name": "protection",
        "startedAt": "2026-10-31T07:06:38Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T07:06:39Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T07:06:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:06:49Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T07:06:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:06:54Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T07:06:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:05Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T07:06:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:05Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T07:07:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:08Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T07:07:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:08Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T07:07:08Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:09Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T07:07:08Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:09Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T07:07:09Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124473171171"
      },
      {
        "completedAt": "2026-10-31T07:13:10Z",
        "conclusion": "success",
        "databaseId": 124473171183,
        "name": "test",
        "startedAt": "2026-10-31T07:06:38Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T07:06:39Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T07:06:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:06:49Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T07:06:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:06:54Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T07:06:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:06Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T07:06:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:07:53Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T07:07:06Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:13:08Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T07:07:53Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:13:08Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T07:13:08Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:13:08Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T07:13:08Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:13:08Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T07:13:08Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124473171183"
      },
      {
        "completedAt": "2026-10-31T07:13:16Z",
        "conclusion": "success",
        "databaseId": 124474480963,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T07:13:13Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T07:13:14Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T07:13:13Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:13:14Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T07:13:14Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T07:13:14Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T07:13:14Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124474480963"
      }
    ],
    "status": "completed",
    "updatedAt": "2026-10-31T07:13:16Z"
  },
  "requiredChecks": {
    "test": {
      "id": 124473171183,
      "appId": 15368,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124473171183"
    },
    "build": {
      "id": 124473171127,
      "appId": 15368,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124473171127"
    },
    "typecheck": {
      "id": 124473171159,
      "appId": 15368,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124473171159"
    },
    "protection": {
      "id": 124473171171,
      "appId": 15368,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124473171171"
    },
    "Required CI completion": {
      "id": 124474480963,
      "appId": 15368,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41179280242/job/124474480963"
    }
  },
  "full": {
    "passed": 18290,
    "failed": 0,
    "skipped": 83,
    "filesPassed": 981,
    "filesSkipped": 6
  },
  "focused": {
    "passed": 126,
    "failed": 0,
    "files": 4,
    "overlapNotAdditive": true
  },
  "selectedFullCases": [
    "test\tRun npx vitest run\t2026-10-31T07:08:10.3021525Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (52 tests) 5381ms",
    "test\tRun npx vitest run\t2026-10-31T07:08:13.6454674Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (38 tests) 1235ms",
    "test\tRun npx vitest run\t2026-10-31T07:09:03.3563999Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 4096ms",
    "test\tRun npx vitest run\t2026-10-31T07:09:07.1253420Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 600ms",
    "test\tRun npx vitest run\t2026-10-31T07:10:12.3253623Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4368ms",
    "test\tRun npx vitest run\t2026-10-31T07:11:58.8170112Z  \u2713 client/src/research/assisted-order/request-intent-api.test.ts (17 tests) 67ms",
    "test\tRun npx vitest run\t2026-10-31T07:12:33.4543805Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 11ms"
  ],
  "rawSummaries": [
    "test\tFocused guest-entry regression checks\t2026-10-31T07:07:53.9222794Z  Test Files  4 passed (4)",
    "test\tFocused guest-entry regression checks\t2026-10-31T07:07:53.9223873Z       Tests  126 passed (126)",
    "test\tRun npx vitest run\t2026-10-31T07:13:08.2963550Z  Test Files  981 passed | 6 skipped (987)",
    "test\tRun npx vitest run\t2026-10-31T07:13:08.3158467Z       Tests  18290 passed | 83 skipped (18373)"
  ],
  "limits": {
    "sourceAcceptance": "NOT OBSERVED; SAMEc16required",
    "runtime": "SyntheticHTTPResponse/transportonly; invalidrequestargszerotransportcalls; noapplicationnetwork/Auth/session/staff/customerdata",
    "nativeBrowserManagedDBStaffActivation": "NOT RUN",
    "CareAuthCoreServerSQLConfigFlagsRolesCapabilityNotificationProvider": "UNCHANGED",
    "PR345And346": "Exactpinnedsourcebranchesuntouched; excluded/disjoint; notcombinedqualification",
    "KAN29OrKAN42Complete": false,
    "activation10003And10241": "HELD",
    "nativePG17": "NOT RUN/nohostinput/nojob",
    "production": "DRAFT/unmerged/notdeployed; livee0funchanged",
    "rerunSoakSkipWaiverLocalNode": false
  },
  "artifactSHA256": {
    "RED_CI.json": "b4194b6a957b008ba00a373fa0af54af36409768057162c32e502e2f6c80fb10",
    "RED_CI_LOG.txt": "dc42681098f4aa237afd385bc00458ae3687aca134ffb8d87e3ec0d4cc9f0415",
    "RED_QUEUE_CONTRACT_FAILURE_eda8731.json": "482f4833564acc70c85294b303d8eb54de7753fc8c950aacaf69bc640f005bbd",
    "GREEN_CI.json": "441d5a9fda520bda4755ba80231928d0a708c0e758f42c4bb9c6867fbd4e6aac",
    "GREEN_CI_LOG.txt": "8506d5c977506b061877c19cc3364dee0194b10d1e0b7b10d7aca0d2245a1619",
    "GREEN_CHECK_RUNS.json": "4c9762478f99820d671bc7bcfb3b395c3ddc0eaa979c028a98f791f7fc40bd13"
  }
}
