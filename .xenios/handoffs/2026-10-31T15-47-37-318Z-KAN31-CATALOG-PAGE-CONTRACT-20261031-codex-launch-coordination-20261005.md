{
  "state": "SOURCE_GREEN_PENDING_SAME_INDEPENDENT_ACCEPTANCE",
  "pr": 350,
  "source": "2a682165d0b8ae1d2ebccb70596effc0681fc93a",
  "tree": "138cdd6734dd3fc8d822eeb8fe4ed50bbd44e360",
  "base": "8a35dc708dcc1bb4007038e0dc35d90864cfcc94",
  "task": "KAN31-CATALOG-PAGE-CONTRACT-20261031",
  "lease": "6a3fc929-7822-4306-b2b0-b2b3c895a944",
  "run": {
    "attempt": 1,
    "conclusion": "success",
    "databaseId": 41215959634,
    "event": "pull_request",
    "headSha": "2a682165d0b8ae1d2ebccb70596effc0681fc93a",
    "jobs": [
      {
        "completedAt": "2026-10-31T15:41:25Z",
        "conclusion": "success",
        "databaseId": 124580414349,
        "name": "typecheck",
        "startedAt": "2026-10-31T15:40:23Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:40:24Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:40:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:28Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T15:40:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:33Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T15:40:28Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:44Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T15:40:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:41:23Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T15:40:44Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:41:24Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T15:41:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:41:24Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T15:41:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:41:24Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T15:41:24Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124580414349"
      },
      {
        "completedAt": "2026-10-31T15:40:52Z",
        "conclusion": "success",
        "databaseId": 124580414478,
        "name": "protection",
        "startedAt": "2026-10-31T15:40:23Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:40:24Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:40:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:34Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T15:40:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:40Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T15:40:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:47Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T15:40:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:47Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T15:40:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:49Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T15:40:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:49Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T15:40:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:49Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T15:40:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:50Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T15:40:49Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124580414478"
      },
      {
        "completedAt": "2026-10-31T15:40:56Z",
        "conclusion": "success",
        "databaseId": 124580414507,
        "name": "build",
        "startedAt": "2026-10-31T15:40:23Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:40:25Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:40:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:29Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T15:40:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:35Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T15:40:29Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:46Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T15:40:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:54Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T15:40:46Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:54Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T15:40:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:54Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T15:40:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:54Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T15:40:54Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124580414507"
      },
      {
        "completedAt": "2026-10-31T15:45:04Z",
        "conclusion": "success",
        "databaseId": 124580414535,
        "name": "test",
        "startedAt": "2026-10-31T15:40:23Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:40:24Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:40:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:34Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T15:40:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:39Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T15:40:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:40:46Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T15:40:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:41:26Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T15:40:46Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:45:01Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T15:41:26Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:45:01Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T15:45:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:45:02Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T15:45:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:45:02Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T15:45:02Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124580414535"
      },
      {
        "completedAt": "2026-10-31T15:45:11Z",
        "conclusion": "success",
        "databaseId": 124581513396,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T15:45:08Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:45:09Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:45:09Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:45:09Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T15:45:09Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:45:09Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T15:45:09Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124581513396"
      }
    ],
    "status": "completed",
    "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634"
  },
  "requiredChecks": {
    "test": {
      "id": 124580414535,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124580414535",
      "appId": 15368
    },
    "typecheck": {
      "id": 124580414349,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124580414349",
      "appId": 15368
    },
    "build": {
      "id": 124580414507,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124580414507",
      "appId": 15368
    },
    "protection": {
      "id": 124580414478,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124580414478",
      "appId": 15368
    },
    "Required CI completion": {
      "id": 124581513396,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215959634/job/124581513396",
      "appId": 15368
    }
  },
  "fullRaw": [
    "test\tRun npx vitest run\t2026-10-31T15:45:01.6132534Z  Test Files  981 passed | 6 skipped (987)",
    "test\tRun npx vitest run\t2026-10-31T15:45:01.6313740Z       Tests  18322 passed | 83 skipped (18405)"
  ],
  "focusedRaw": [
    "test\tFocused guest-entry regression checks\t2026-10-31T15:41:26.0839382Z       Tests  131 passed (131)"
  ],
  "focusedOverlapNotAdditive": true,
  "perFileRaw": [
    "test\tRun npx vitest run\t2026-10-31T15:41:38.0370738Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (57 tests) 5792ms",
    "test\tRun npx vitest run\t2026-10-31T15:41:40.3348007Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (43 tests) 824ms",
    "test\tRun npx vitest run\t2026-10-31T15:42:15.4745825Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 3805ms",
    "test\tRun npx vitest run\t2026-10-31T15:42:16.9177810Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 448ms",
    "test\tRun npx vitest run\t2026-10-31T15:43:03.0586913Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4231ms",
    "test\tRun npx vitest run\t2026-10-31T15:43:26.8748175Z  \u2713 client/src/research/assisted-order/request-intent-api.test.ts (39 tests) 63ms",
    "test\tRun npx vitest run\t2026-10-31T15:44:30.9894198Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 6ms"
  ],
  "provider": "d386fee5c57fcb76c4c7715e0d9f55f61a9416b2",
  "providerTreeExact": true,
  "paths": {
    "client/src/research/assisted-order/request-intent-api.ts": {
      "base": "d327fb2d41b5016f488660790bf870b7f78cbf08",
      "candidate": "509248c66f0fbea61c9fb8c11be9e809a573b7c4"
    },
    "client/src/research/assisted-order/request-intent-api.test.ts": {
      "base": "7c13379f33981f28df8cd2b3728ce5be8c846c01",
      "candidate": "b83a24659865b90c4858885ded66b4b32b8f03df"
    }
  },
  "testBlobRedAndGreen": "b83a24659865b90c4858885ded66b4b32b8f03df",
  "testRawByteIdenticalRedToCorrected": true,
  "entireOld17ExpandedCaseFilePrefixUnchanged": true,
  "red": {
    "source": "bf7af8977769f37a2092d7e3c5763f44f7b2253a",
    "tree": "da5add73bb6a242f1e21d3b4af82ebfa03c92330",
    "run": {
      "attempt": 1,
      "conclusion": "failure",
      "databaseId": 41215022869,
      "event": "pull_request",
      "headSha": "bf7af8977769f37a2092d7e3c5763f44f7b2253a",
      "jobs": [
        {
          "completedAt": "2026-10-31T15:29:13Z",
          "conclusion": "success",
          "databaseId": 124577658901,
          "name": "protection",
          "startedAt": "2026-10-31T15:28:40Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:28:41Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:28:41Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:28:51Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T15:28:41Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:28:56Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T15:28:51Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:08Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T15:28:56Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:08Z",
              "conclusion": "success",
              "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
              "number": 5,
              "startedAt": "2026-10-31T15:29:08Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:11Z",
              "conclusion": "success",
              "name": "Run npm run verify:route-uniqueness",
              "number": 6,
              "startedAt": "2026-10-31T15:29:08Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:12Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T15:29:11Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:12Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T15:29:12Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:12Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T15:29:12Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215022869/job/124577658901"
        },
        {
          "completedAt": "2026-10-31T15:33:53Z",
          "conclusion": "failure",
          "databaseId": 124577659008,
          "name": "test",
          "startedAt": "2026-10-31T15:28:40Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:28:41Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:28:41Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:28:52Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T15:28:41Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:28:58Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T15:28:52Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:07Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T15:28:58Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:50Z",
              "conclusion": "success",
              "name": "Focused guest-entry regression checks",
              "number": 5,
              "startedAt": "2026-10-31T15:29:07Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:33:51Z",
              "conclusion": "failure",
              "name": "Run npx vitest run",
              "number": 6,
              "startedAt": "2026-10-31T15:29:50Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:33:51Z",
              "conclusion": "skipped",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T15:33:51Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:33:51Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T15:33:51Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:33:51Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T15:33:51Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215022869/job/124577659008"
        },
        {
          "completedAt": "2026-10-31T15:29:37Z",
          "conclusion": "success",
          "databaseId": 124577659023,
          "name": "typecheck",
          "startedAt": "2026-10-31T15:28:40Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:28:42Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:28:41Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:28:46Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T15:28:42Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:28:53Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T15:28:46Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:02Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T15:28:53Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:34Z",
              "conclusion": "success",
              "name": "Run npm run check",
              "number": 5,
              "startedAt": "2026-10-31T15:29:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:34Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T15:29:34Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:34Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T15:29:34Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:34Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T15:29:34Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215022869/job/124577659023"
        },
        {
          "completedAt": "2026-10-31T15:29:15Z",
          "conclusion": "success",
          "databaseId": 124577659116,
          "name": "build",
          "startedAt": "2026-10-31T15:28:41Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:28:42Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:28:41Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:28:47Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T15:28:42Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:28:52Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T15:28:47Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:04Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T15:28:52Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:12Z",
              "conclusion": "success",
              "name": "Run npm run build",
              "number": 5,
              "startedAt": "2026-10-31T15:29:04Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:12Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T15:29:12Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:12Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T15:29:12Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:29:12Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T15:29:12Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215022869/job/124577659116"
        },
        {
          "completedAt": "2026-10-31T15:34:01Z",
          "conclusion": "failure",
          "databaseId": 124578908179,
          "name": "Required CI completion",
          "startedAt": "2026-10-31T15:33:57Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:33:58Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:33:58Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:33:58Z",
              "conclusion": "failure",
              "name": "Refuse unsuccessful or missing required jobs",
              "number": 2,
              "startedAt": "2026-10-31T15:33:58Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:33:58Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 3,
              "startedAt": "2026-10-31T15:33:58Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215022869/job/124578908179"
        }
      ],
      "status": "completed",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41215022869"
    },
    "provider": "6a48f19d73fa8ebb2be3debdc9fed941c2b487e3",
    "actualFull": "18305PASS17intendedFAIL83SKIP/980PASS1FAIL6SKIPfiles",
    "api": "22PASS17intendedFAILof39; old17+new5controlsPASS",
    "focused": "131PASS overlaps full",
    "buildTypecheckProtection": "PASS",
    "harnessFailure": false,
    "qualificationSHA256": "df03f81fca598f64cceed670e5a203013d4c2311f449897abeb1c810e318fcda"
  },
  "outcome": "Requested customer page is positive safeinteger with no invented cap, requested pageSize safeinteger1..100 before transport; returnedpage/size must equal effective request and rows<=size,total. Declared optional defaults1/24 retained, validpartial and emptylater10001/MAXSAFE retained. No coerce/clamp/maxfromtotal. Does not prove current server emitted malformed metadata.",
  "scope": "Exactly2clientAPIpaths+77/-1: runtime+10/-1, tests+67/-0; no Core/Auth/Care/transport/itemshape/catalogauthority/prices/search/family/hintscan/server/SQL/config/flag/role/capability/notification/provider/payment/activation change.",
  "authorship": "Root implementation/tests; finite quick_order_schema_receipt read-only trace/bounds/finalsource assistance. Not independent acceptance. SAME c16 review required.",
  "preserved": "PR349367sixpaths/qualification/SAME10405 stable; next operator testa650fb1 separate/noPR/noCIyet. PriorPR348LIVE/release-staticCLOSED.",
  "limits": {
    "realHTTPResponseSyntheticTransportOnly": true,
    "applicationNetwork": "NOT RUN",
    "liveAuthOrStaffCustomerContents": "NOT RUN",
    "nativeBrowser": "NOT RUN; old allowance consumed",
    "managedSQL": "NOT RUN; no read",
    "nativePG17": "NOT RUN/nohost/nojob; hostedbaselinePGguards not native qualification",
    "fullLiveJourney": "NOT PROVEN",
    "productionThisSource": false,
    "KAN29ActivationAndAllSensitiveResourceHolds": "UNCHANGED",
    "newSkipWaiverRerunSoakLocalNodeHeavyJob": false
  },
  "artifactSHA256": {
    "ACTIVE_CHECKPOINT_PREFIX.md": "69952cae8baa52667b3223660e5529e112e1c41b83c49277717304dfb2b34376",
    "ACTIVE_CHECKPOINT_RECEIPT.json": "80764df25eb7b28c3a975b251a043eb200e965e4777ff857b70477fb2853126f",
    "capture_red.py": "ecf1bd7fefa15346209bbb64075cdfb13168c0a981e83d3ef4649aab72626489",
    "checkpoint_active.py": "7ce33b072bbe7fc4fcab1eb87a5372d49ec848e8c456edcbde80d2b98efd53cd",
    "CLAIM_READBACK.json": "05c275eb67c68f7755613e909060a3a58763e0964d9f537866a758ed2d4d10ac",
    "CLAUDE_CONTINUE_TEXT.txt": "2dfce3eaffac51891487d2445eef9974bdf6aae3171fbbdff367c0da69d3df33",
    "GREEN_CHECK_RUNS.json": "d9f330daf959a17c56873eb5f0c047e0ed611ae137c20a35506321e4b7391578",
    "GREEN_CI.json": "46531ab4f823017d78b2ee753357a1d2170c6a5895b7c0440f2d298bb4682d10",
    "GREEN_CI_LOG.txt": "b094a65c3db4f128a5166e533fecc0f459045331de63b48fceec18d2de6d8c6c",
    "HELPER_SOURCE_ASSISTANCE.json": "4e3c6819a7142ee538e28a1a2bfd70335a56935916da0009e7d7149b71c9a49e",
    "HUMAN_DELIVERY_RECEIPT.json": "4cbafa0f33fb582c88209603cfbe2c7a7f8ea6c9103b1a7d30c8b8b8f7f332ab",
    "INITIAL_CANONICAL_SNAPSHOT.json": "0cd3d922bacf88272084e5004b831d4cdf4c957ebc843aada1e761e0f6118764",
    "INITIAL_OWNERSHIP.json": "5fb19ae9d624babd3cc21950074a18fea086ee4ff335688edb416838a18d8ebb",
    "prepare_qa_verifier.py": "5f45d10f52961f666f83c2179671bddac5e75562dd28451dd55e067bea452ba2",
    "PR_BODY_RED.md": "667a5a1a5cccf54822384569a964a95d34d7a3554cc871f21f972a7a776aca12",
    "QUALIFIED_PR.json": "c47c544bab9997ba4ef4634b61c36a39b397fd8e25663e503c837f8129219ddc",
    "qualify_green.py": "707170ac021566ad7509dbf14fcf024d6ab866c1f9c9b436bbc6c5cffcf52ad7",
    "RED_CATALOG_CONTRACT_FAILURE_bf7af89.json": "df03f81fca598f64cceed670e5a203013d4c2311f449897abeb1c810e318fcda",
    "RED_CHECK_RUNS.json": "8d27d3a07468dc528667e5ec2a4e032753aad470c051af5406dded99f41991af",
    "RED_CI.json": "e56e05cc62b782bff2c3bb38e9a9f6e488d3b8d92c9b858056418d049884af48",
    "RED_CI_LOG.txt": "eb2bcbe4c9f9467d79628579d9da67e2293305d264fa34f24f5a7937b97c8343",
    "RED_JOB_CHECKOUTS.json": "6ba27785e0a75b8708ab115346145486ca6da8c5724fac820cce044f09bbb97a",
    "snapshot.py": "972bead187603805e5c67c74d4e19cba00e9e17adc03033571414aa4b192a494",
    "SOURCE_DIFF.patch": "fda5c5e68b74e0d30e8d150e53c9c59e5e227fd08c4f053e1a4ebb2e1e6c07c1",
    "SOURCE_request-intent-api.test.ts": "1aa9f2b21d840050c9e17eecffaf90380bc1e363881708666272a1115a43e187",
    "SOURCE_request-intent-api.ts": "168bef64c100d45c96d77692a5ef406bb7c62d2484e3f6a491cafea4b6d7f729",
    "verify_claim.py": "570b34e60601b0d85944f05e2749f901a399c1d6575883c880081ec197cf43f6",
    "verify_qa_custody.py": "71283ee97e81667bceb1c0576d27cc54d321b77ec042bed965b395f7ae29ee7f"
  }
}
