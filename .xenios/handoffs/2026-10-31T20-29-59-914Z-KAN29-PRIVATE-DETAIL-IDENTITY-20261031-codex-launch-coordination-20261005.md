{
  "state": "SOURCE_GREEN_PENDING_SAME_INDEPENDENT_ACCEPTANCE",
  "pr": 354,
  "source": "98cd532f1636d759485b6d77eb4edbbd57ba9bd5",
  "tree": "0ad175c17210819b185b3d0081c489db572e814a",
  "base": "a704fb939da02171cf5d64f6b8946f378368b121",
  "task": "KAN29-PRIVATE-DETAIL-IDENTITY-20261031",
  "lease": "8607fe8e-b469-459e-bd80-45a28cf27c13",
  "run": {
    "attempt": 1,
    "conclusion": "success",
    "databaseId": 41238592439,
    "event": "pull_request",
    "headSha": "98cd532f1636d759485b6d77eb4edbbd57ba9bd5",
    "jobs": [
      {
        "completedAt": "2026-10-31T20:29:04Z",
        "conclusion": "success",
        "databaseId": 124647479385,
        "name": "test",
        "startedAt": "2026-10-31T20:22:21Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:22:23Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:22:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:34Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T20:22:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:40Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T20:22:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:52Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T20:22:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:23:41Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T20:22:52Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:29:01Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T20:23:41Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:29:01Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T20:29:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:29:01Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T20:29:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:29:01Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T20:29:01Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124647479385"
      },
      {
        "completedAt": "2026-10-31T20:23:26Z",
        "conclusion": "success",
        "databaseId": 124647479491,
        "name": "typecheck",
        "startedAt": "2026-10-31T20:22:21Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:22:23Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:22:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:28Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T20:22:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:35Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T20:22:28Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:44Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T20:22:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:23:15Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T20:22:44Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:23:15Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T20:23:15Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:23:16Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T20:23:15Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:23:16Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T20:23:16Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124647479491"
      },
      {
        "completedAt": "2026-10-31T20:22:54Z",
        "conclusion": "success",
        "databaseId": 124647479597,
        "name": "protection",
        "startedAt": "2026-10-31T20:22:21Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:22:22Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:22:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:33Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T20:22:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:37Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T20:22:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:49Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T20:22:37Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:49Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T20:22:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:52Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T20:22:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:52Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T20:22:52Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:52Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T20:22:52Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:52Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T20:22:52Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124647479597"
      },
      {
        "completedAt": "2026-10-31T20:22:51Z",
        "conclusion": "success",
        "databaseId": 124647479613,
        "name": "build",
        "startedAt": "2026-10-31T20:22:21Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:22:23Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:22:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:27Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T20:22:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:33Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T20:22:27Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:42Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T20:22:33Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:49Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T20:22:42Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:49Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T20:22:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:49Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T20:22:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:22:49Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T20:22:49Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124647479613"
      },
      {
        "completedAt": "2026-10-31T20:29:10Z",
        "conclusion": "success",
        "databaseId": 124649051219,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T20:29:07Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T20:29:08Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T20:29:08Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:29:08Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T20:29:08Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T20:29:08Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T20:29:08Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124649051219"
      }
    ],
    "status": "completed",
    "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439"
  },
  "requiredChecks": {
    "test": {
      "id": 124647479385,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124647479385",
      "appId": 15368,
      "conclusion": "success"
    },
    "typecheck": {
      "id": 124647479491,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124647479491",
      "appId": 15368,
      "conclusion": "success"
    },
    "build": {
      "id": 124647479613,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124647479613",
      "appId": 15368,
      "conclusion": "success"
    },
    "protection": {
      "id": 124647479597,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124647479597",
      "appId": 15368,
      "conclusion": "success"
    },
    "Required CI completion": {
      "id": 124649051219,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41238592439/job/124649051219",
      "appId": 15368,
      "conclusion": "success"
    }
  },
  "full": {
    "passed": 18343,
    "failed": 0,
    "skipped": 83,
    "filesPassed": 981,
    "filesFailed": 0,
    "filesSkipped": 6
  },
  "fullRaw": [
    "test\tRun npx vitest run\t2026-10-31T20:29:01.1136618Z  Test Files  981 passed | 6 skipped (987)",
    "test\tRun npx vitest run\t2026-10-31T20:29:01.1338565Z       Tests  18343 passed | 83 skipped (18426)"
  ],
  "focusedRaw": [
    "test\tFocused guest-entry regression checks\t2026-10-31T20:23:41.4558736Z       Tests  143 passed (143)"
  ],
  "focusedOverlapNotAdditive": true,
  "perFileRaw": [
    "test\tRun npx vitest run\t2026-10-31T20:23:57.5566876Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (69 tests) 7735ms",
    "test\tRun npx vitest run\t2026-10-31T20:24:01.8809342Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (46 tests) 1378ms",
    "test\tRun npx vitest run\t2026-10-31T20:24:52.4226603Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 4078ms",
    "test\tRun npx vitest run\t2026-10-31T20:24:55.2361959Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 602ms",
    "test\tRun npx vitest run\t2026-10-31T20:25:54.6495830Z  \u2713 client/src/research/assisted-order/request-intent-api.test.ts (45 tests) 105ms",
    "test\tRun npx vitest run\t2026-10-31T20:26:01.8282610Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4319ms",
    "test\tRun npx vitest run\t2026-10-31T20:28:16.5697607Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 12ms"
  ],
  "provider": "e9a9c7930be4c185f6e6b33a07668222ddfa1d30",
  "providerTreeExact": true,
  "jobCheckoutSHAs": {
    "test": "e9a9c7930be4c185f6e6b33a07668222ddfa1d30",
    "typecheck": "e9a9c7930be4c185f6e6b33a07668222ddfa1d30",
    "protection": "98cd532f1636d759485b6d77eb4edbbd57ba9bd5",
    "build": "e9a9c7930be4c185f6e6b33a07668222ddfa1d30"
  },
  "allJobCheckoutTreesExact": true,
  "apiBlob": "c8d05c857d7a22de2f2b20f26114fee15dc1b314",
  "testBlob": "327c46a0af71089cbfbf0ee9d589fbfd9633438e",
  "testRawByteIdenticalRedToCorrected": true,
  "old39CaseFilePreservedExceptOneTypeImportAndAppendedSixCases": true,
  "redAssertionPrecision": "All six new cases executed on red; wrong-record case failed at its rejects assertion (line209). Its following transport-count/path assertions did not execute on red; all six complete cases including those assertions execute on green. Full suite executed on both. Matching/case/refusal controls and all39prior API cases passed red.",
  "failureEvidence": [],
  "redClassification": "One intended wrong-record assertion rejects a promise that instead resolves another request's complete internally consistent detail; all five new controls and 39 old API cases pass. No fixture failure. Full suite executed.",
  "outcome": "Bind validated private detail response ID to requested ID case-insensitively, retaining both accepted UUID spellings, all returned detail and original request path spelling. No new field validation or transport/authorization change.",
  "authorship": "Root authored source/tests. Existing quick_order_schema_receipt finite source/fixture-contract assistance is not independent acceptance. SAME c16 exact-source review required.",
  "preserved": "PR351a613 and35359b source/assignments stable and excluded. PR352a704 LIVE release/static scope closed.",
  "limits": {
    "syntheticHTTPResponseMockedTransportOnly": true,
    "applicationNetwork": "NOT RUN",
    "liveAuthOrStaffCustomerContents": "NOT RUN",
    "nativeBrowser": "NOT RUN; prior allowances consumed",
    "managedSQL": "NOT RUN; prior read consumed",
    "nativePG17": "NOT RUN/no eligible host/no job",
    "hostedBaselinePGNotNative17Qualification": true,
    "activationHolds10003And10241": "UNCHANGED",
    "fullKAN29KAN42OrLiveJourney": "NOT PROVEN",
    "productionThisSource": false,
    "newSkipWaiverRerunSoakLocalNodeHeavyJob": false,
    "hostedQualificationsSerialized": true
  },
  "rawLogSHA256": "2449a3e0ebc8d5d9b9e8552b5addc6987185754aeac509ab1caa532043a07ab9",
  "metadataParserCorrection": "Original preparatory capture_ci.py assumed a passed-first Tests summary and stopped before saving evidence on actual red. This separate corrected parser accepts failed-first summaries. Original preserved; no source/test/CI rerun.",
  "red": {
    "source": "c4d874bacbbfc1f9bf84905a171b853a6d572294",
    "tree": "ed4ec8f0cede57dbcb1f5f8f4f4e5a716b0ccbbf",
    "run": {
      "attempt": 1,
      "conclusion": "failure",
      "databaseId": 41237933560,
      "event": "pull_request",
      "headSha": "c4d874bacbbfc1f9bf84905a171b853a6d572294",
      "jobs": [
        {
          "completedAt": "2026-10-31T20:14:34Z",
          "conclusion": "success",
          "databaseId": 124645532791,
          "name": "protection",
          "startedAt": "2026-10-31T20:14:02Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T20:14:03Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T20:14:03Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:13Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T20:14:03Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:18Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T20:14:13Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:30Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T20:14:18Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:30Z",
              "conclusion": "success",
              "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
              "number": 5,
              "startedAt": "2026-10-31T20:14:30Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:33Z",
              "conclusion": "success",
              "name": "Run npm run verify:route-uniqueness",
              "number": 6,
              "startedAt": "2026-10-31T20:14:30Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:33Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T20:14:33Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:33Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T20:14:33Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:33Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T20:14:33Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41237933560/job/124645532791"
        },
        {
          "completedAt": "2026-10-31T20:14:39Z",
          "conclusion": "success",
          "databaseId": 124645532919,
          "name": "build",
          "startedAt": "2026-10-31T20:14:12Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T20:14:13Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T20:14:13Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:17Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T20:14:13Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:23Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T20:14:17Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:31Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T20:14:23Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:37Z",
              "conclusion": "success",
              "name": "Run npm run build",
              "number": 5,
              "startedAt": "2026-10-31T20:14:31Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:37Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T20:14:37Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:37Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T20:14:37Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:37Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T20:14:37Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41237933560/job/124645532919"
        },
        {
          "completedAt": "2026-10-31T20:15:04Z",
          "conclusion": "success",
          "databaseId": 124645533003,
          "name": "typecheck",
          "startedAt": "2026-10-31T20:14:03Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T20:14:04Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T20:14:03Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:09Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T20:14:04Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:15Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T20:14:09Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:25Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T20:14:15Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:15:02Z",
              "conclusion": "success",
              "name": "Run npm run check",
              "number": 5,
              "startedAt": "2026-10-31T20:14:25Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:15:02Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T20:15:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:15:02Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T20:15:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:15:02Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T20:15:02Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41237933560/job/124645533003"
        },
        {
          "completedAt": "2026-10-31T20:20:34Z",
          "conclusion": "failure",
          "databaseId": 124645533022,
          "name": "test",
          "startedAt": "2026-10-31T20:14:02Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T20:14:03Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T20:14:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:13Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T20:14:03Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:18Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T20:14:13Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:14:29Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T20:14:18Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:15:17Z",
              "conclusion": "success",
              "name": "Focused guest-entry regression checks",
              "number": 5,
              "startedAt": "2026-10-31T20:14:29Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:20:32Z",
              "conclusion": "failure",
              "name": "Run npx vitest run",
              "number": 6,
              "startedAt": "2026-10-31T20:15:17Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:20:32Z",
              "conclusion": "skipped",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T20:20:32Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:20:33Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T20:20:32Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:20:33Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T20:20:33Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41237933560/job/124645533022"
        },
        {
          "completedAt": "2026-10-31T20:20:39Z",
          "conclusion": "failure",
          "databaseId": 124647066164,
          "name": "Required CI completion",
          "startedAt": "2026-10-31T20:20:37Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T20:20:38Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T20:20:38Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:20:38Z",
              "conclusion": "failure",
              "name": "Refuse unsuccessful or missing required jobs",
              "number": 2,
              "startedAt": "2026-10-31T20:20:38Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T20:20:38Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 3,
              "startedAt": "2026-10-31T20:20:38Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41237933560/job/124647066164"
        }
      ],
      "status": "completed",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41237933560"
    },
    "full": {
      "passed": 18342,
      "failed": 1,
      "skipped": 83,
      "filesPassed": 980,
      "filesFailed": 1,
      "filesSkipped": 6
    },
    "provider": "5e41be868997b07cfba112564dbde8725be3c5d3",
    "qualificationSHA256": "b18e3560df8973c9220c0a084580a08b344bfe8a54d15285435420dacf8dd2c1"
  },
  "artifactSHA256": {
    "ACTIVE_CHECKPOINT_PREFIX.md": "9fb82b6b571930a52a557eebd4e6c02cc0620db2007a67a735c3c3be2fbf97b7",
    "ACTIVE_CHECKPOINT_RECEIPT.json": "412b1114053fb29c927d8e826118d7b81cd60e8a25f1ce9af50482f173d3ebe8",
    "ACTUAL_HUMAN_96b776d4.txt": "d663be02662d32c23f102deffbe0139c7aa4f5d9965b4420a6cc11819308f64e",
    "ACTUAL_HUMAN_INPUT_RECEIPT.json": "8b73936725705d86dacbd90c8cff6e15d86e5a29ecabeaef28d8c95b8da5b51f",
    "capture_ci.py": "928083f9fc8009982aabfe56dbe37a016f0cb35ee27889b2e41c48f0d3f903bb",
    "capture_ci_corrected.py": "6fd999f691b06719ae574e102259fee820445ec549727b2e74d237fe3d7a6459",
    "checkpoint_active.py": "110eb5859c41bc378836677d9b61fc7c656d8711d4509ecdec78de14cb0e5f45",
    "CLAIM_READBACK.json": "3eb9b4ccb56fabb6ace83ac657be241717ab0d002c9ddbd5fa3418a70517dabd",
    "GREEN_CHECK_RUNS.json": "e2a9c03c51388f4c7ef362d967ae0522e2a18d32bce3d715a459780e9e5f283b",
    "GREEN_CI.json": "c7a24b90ee7845c85aff581b1d11186b7d07f4e12d28948cfa268dde2f4f3177",
    "GREEN_CI_LOG.txt": "2449a3e0ebc8d5d9b9e8552b5addc6987185754aeac509ab1caa532043a07ab9",
    "GREEN_PR.json": "619a21f0679350b656c84f3ef2e3673d2dd68b6a4c5c047d9e66a781abca82b4",
    "GREEN_SOURCE_DIFF.patch": "934bdcc78dd0491fd3733d883a968eb54b4eb2185ff9370fe41c5485a5724a44",
    "GREEN_SOURCE_request-intent-api.test.ts": "491442b15334af63f15831a1236d2f8c7aac37a9beac441e1a48dce9905256ba",
    "GREEN_SOURCE_request-intent-api.ts": "08f90b784058f01dcce236bb448443b41e5d400869c80bb11dd95057bb7e401c",
    "HELPER_SOURCE_ASSISTANCE.json": "129e8cc085c370d7165b7730c63eaeccd35643ac4708b923f1d63a44ae623c36",
    "JIRA_STARTED_10412.md": "7b2d85e5019bded2e4cd5e170cccdc4e20364b1712f53edf5e685cbc152cb426",
    "JIRA_STARTED_DELIVERY_RECEIPT.json": "ab3f955a8ab3cbe2855d0b0c943eb3a94efcfcc38be0ff1dd3c1d2873073d9f6",
    "PR354_RELEASE_INPUTS_PENDING_ACCEPTANCE.json": "70e0e5e0b758378925e418a1aa8ba6bc2c6d170435b91bc08d1885afd20aab0d",
    "PREVIOUS_CHECKPOINT_82bf2c4.md": "82bf2c4b6b877cd05d2f7ce623b318316f6ff52a100c3cd082463b145dbec435",
    "PR_BODY_IMPLEMENTED.md": "4c181a5b44acd37c7a2fdddbd2af2ed40ee2be160e0594f31a12f0342ee0de68",
    "PR_BODY_TEST_ONLY.md": "da7f3b8e83ba84398fcac2c7875fd8383ece850051efbbdfd136b1d0ec8285e0",
    "qualify_green.py": "40f818039489c36fc7280f3ca4783b4eae62855b5c0085b6e4309c13de96c4d7",
    "RED_CHECK_RUNS.json": "6122c98afe0458f3f619db4560f4b143764556b3bf00305e0ce7c350c22cbda9",
    "RED_CI.json": "07b73e19748b9f9aa4a2eccff3daa2cc65c27aa338f708884550aa7f60a0649b",
    "RED_CI_LOG.txt": "f1c52ee29d0738ba849bfcb15364580b0704c59e83c6c01acf53fb9f64488a92",
    "RED_DETAIL_IDENTITY_FAILURE_c4d874b.json": "b18e3560df8973c9220c0a084580a08b344bfe8a54d15285435420dacf8dd2c1",
    "RED_PR.json": "aaf3163c1fef8e5352b2241fb567ef81947ab2f4c32042608c889a958e8549af",
    "RED_SOURCE_DIFF.patch": "b82e8e3476ce7629db51259a9ff577394c430eef168466144a839c2dac8b97eb",
    "RED_SOURCE_request-intent-api.test.ts": "491442b15334af63f15831a1236d2f8c7aac37a9beac441e1a48dce9905256ba",
    "RED_SOURCE_request-intent-api.ts": "168bef64c100d45c96d77692a5ef406bb7c62d2484e3f6a491cafea4b6d7f729",
    "SAME_CLAUDE_CONTINUATION_96b776d4.md": "baa5b1884637d8f3edc02a1aa23248a3f3884fe3e662c52564f3da5ed1e78162",
    "save_human_input.py": "e595c584021a64d4e34d0fef5898edd62f09f5adc7f27a419e55456869a753b0",
    "verify_claim.py": "aefb92c0a50980651cc39ba2f131e879751826f8af348bc34de37af7d2169746",
    "verify_qa_custody.py": "c3c1bd3c1be54e1b7e1fa0039b07843f214a6c90f1d262bc043a7f827e596729"
  }
}
