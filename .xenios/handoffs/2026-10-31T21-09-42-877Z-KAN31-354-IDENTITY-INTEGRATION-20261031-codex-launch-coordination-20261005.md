{
  "state": "PURE_ACCEPTED_COMPOSITION_GREEN",
  "pr": 356,
  "source": "8f19a7d37c6df97c18fef473b25dcc90ca1f8f78",
  "tree": "75b7c3eef86340e17e47e0b033dbc8b6fab927ca",
  "base": "50d7e4bde01132301218dce455e5d8313f563a43",
  "run": {
    "attempt": 1,
    "conclusion": "success",
    "createdAt": "2026-10-31T21:02:20Z",
    "databaseId": 41241681075,
    "event": "pull_request",
    "headSha": "8f19a7d37c6df97c18fef473b25dcc90ca1f8f78",
    "jobs": [
      {
        "completedAt": "2026-10-31T21:03:17Z",
        "conclusion": "success",
        "databaseId": 124656686960,
        "name": "typecheck",
        "startedAt": "2026-10-31T21:02:23Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T21:02:24Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T21:02:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:29Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T21:02:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:35Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T21:02:29Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:44Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T21:02:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:14Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T21:02:44Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:15Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T21:03:14Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:15Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T21:03:15Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:15Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T21:03:15Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124656686960"
      },
      {
        "completedAt": "2026-10-31T21:08:13Z",
        "conclusion": "success",
        "databaseId": 124656687122,
        "name": "test",
        "startedAt": "2026-10-31T21:02:23Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T21:02:24Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T21:02:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:37Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T21:02:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:43Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T21:02:37Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:53Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T21:02:43Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:41Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T21:02:53Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:08:11Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T21:03:41Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:08:11Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T21:08:11Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:08:11Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T21:08:11Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:08:11Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T21:08:11Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124656687122"
      },
      {
        "completedAt": "2026-10-31T21:02:59Z",
        "conclusion": "success",
        "databaseId": 124656687130,
        "name": "build",
        "startedAt": "2026-10-31T21:02:25Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T21:02:26Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T21:02:26Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:31Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T21:02:26Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:37Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T21:02:31Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:48Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T21:02:37Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:56Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T21:02:48Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:57Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T21:02:56Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:57Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T21:02:57Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:57Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T21:02:57Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124656687130"
      },
      {
        "completedAt": "2026-10-31T21:03:12Z",
        "conclusion": "success",
        "databaseId": 124656687498,
        "name": "protection",
        "startedAt": "2026-10-31T21:02:40Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T21:02:42Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T21:02:41Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:53Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T21:02:42Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:02:59Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T21:02:53Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:07Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T21:02:59Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:07Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T21:03:07Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:09Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T21:03:07Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:10Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T21:03:09Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:10Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T21:03:10Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:03:10Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T21:03:10Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124656687498"
      },
      {
        "completedAt": "2026-10-31T21:08:20Z",
        "conclusion": "success",
        "databaseId": 124658082636,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T21:08:16Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T21:08:17Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T21:08:17Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:08:17Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T21:08:17Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T21:08:17Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T21:08:17Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124658082636"
      }
    ],
    "status": "completed",
    "updatedAt": "2026-10-31T21:08:20Z",
    "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075"
  },
  "requiredChecks": {
    "test": {
      "id": 124656687122,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124656687122",
      "app": 15368
    },
    "typecheck": {
      "id": 124656686960,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124656686960",
      "app": 15368
    },
    "build": {
      "id": 124656687130,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124656687130",
      "app": 15368
    },
    "protection": {
      "id": 124656687498,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124656687498",
      "app": 15368
    },
    "Required CI completion": {
      "id": 124658082636,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41241681075/job/124658082636",
      "app": 15368
    }
  },
  "full": {
    "passed": 18351,
    "failed": 0,
    "skipped": 83,
    "filesPassed": 982,
    "filesSkipped": 6
  },
  "fullRaw": [
    "test\tRun npx vitest run\t2026-10-31T21:08:10.7855787Z  Test Files  982 passed | 6 skipped (988)",
    "test\tRun npx vitest run\t2026-10-31T21:08:10.7964442Z       Tests  18351 passed | 83 skipped (18434)"
  ],
  "focusedRaw": [
    "test\tFocused guest-entry regression checks\t2026-10-31T21:03:41.4506380Z       Tests  143 passed (143)"
  ],
  "focusedOverlapNotAdditive": true,
  "perFileRaw": [
    "test\tRun npx vitest run\t2026-10-31T21:03:55.8466457Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (69 tests) 7358ms",
    "test\tRun npx vitest run\t2026-10-31T21:03:59.5236249Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (46 tests) 1135ms",
    "test\tRun npx vitest run\t2026-10-31T21:04:42.5534635Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 3779ms",
    "test\tRun npx vitest run\t2026-10-31T21:04:44.6316686Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 486ms",
    "test\tRun npx vitest run\t2026-10-31T21:05:34.4141803Z  \u2713 client/src/research/assisted-order/request-intent-api.test.ts (45 tests) 79ms",
    "test\tRun npx vitest run\t2026-10-31T21:05:40.9495163Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4119ms",
    "test\tRun npx vitest run\t2026-10-31T21:06:36.2177982Z  \u2713 client/src/research/assisted-order/RequestIntentStaffReadback.test.tsx (8 tests) 224ms",
    "test\tRun npx vitest run\t2026-10-31T21:07:34.0824524Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 7ms"
  ],
  "providerMerge": "503b1f1ae8be0ced71e59bb0d53ac734692efdad",
  "providerTreeExact": true,
  "jobCheckoutSHAs": {
    "typecheck": "503b1f1ae8be0ced71e59bb0d53ac734692efdad",
    "test": "503b1f1ae8be0ced71e59bb0d53ac734692efdad",
    "build": "503b1f1ae8be0ced71e59bb0d53ac734692efdad",
    "protection": "8f19a7d37c6df97c18fef473b25dcc90ca1f8f78"
  },
  "allJobCheckoutTreesExact": true,
  "acceptedSources": [
    {
      "pr": 354,
      "head": "98cd532f1636d759485b6d77eb4edbbd57ba9bd5",
      "tree": "0ad175c17210819b185b3d0081c489db572e814a",
      "verdict": 6549003709,
      "jira": "10416"
    }
  ],
  "acceptedBlobs": {
    "client/src/research/assisted-order/request-intent-api.ts": {
      "baseBlob": "509248c66f0fbea61c9fb8c11be9e809a573b7c4",
      "acceptedBlob": "c8d05c857d7a22de2f2b20f26114fee15dc1b314",
      "acceptedFrom": 354,
      "head": "98cd532f1636d759485b6d77eb4edbbd57ba9bd5"
    },
    "client/src/research/assisted-order/request-intent-api.test.ts": {
      "baseBlob": "b83a24659865b90c4858885ded66b4b32b8f03df",
      "acceptedBlob": "327c46a0af71089cbfbf0ee9d589fbfd9633438e",
      "acceptedFrom": 354,
      "head": "98cd532f1636d759485b6d77eb4edbbd57ba9bd5"
    }
  },
  "allAcceptedBlobsByteIdentical": true,
  "newSourceEdits": false,
  "excluded353": true,
  "prior351BlobsUnchanged": true,
  "old18343NotCurrentQualification": true,
  "testRerunOrNewSkips": false,
  "authorship": "Root pure composition. Existing exact354 source acceptance reused; no composition source edits. Reviewer source-traced current351 caller compatibility; Root preserves accepted blobs and executes actual resulting-tree qualification.",
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
    "ACTIVE_CHECKPOINT_PREFIX.md": "4c67d04e7e64ece30821ed4a42184a8ae38c11be898920d2f2259baf2bbd4f9f",
    "ACTIVE_CHECKPOINT_RECEIPT.json": "93eead81da07bae9d3356f7ee8f0480025b743f8ad2e58581f80019c2f4e248e",
    "bind_postcheck.py": "0da9a01f48f83674c9d1ab9aefcda673c53f87f54e320b8b61bd7f2669753206",
    "checkpoint_active.py": "ae8c462797084013ec3d50c0d2c31c586badbb2bfbb7e36821ecbb8462f443a0",
    "CLAIM_READBACK.json": "281fa2c3ddf548adabd0f41d4ae6e725d22f015c28f162e595f66b3d3efaba33",
    "fetch_review_threads.py": "c64da9d502c550a2a191d678b6a69309a391906fe0afd6399d7fc9fa60121596",
    "finalize_release.py": "938a5d83c08b8b92517553969cbc2e412f40b7ae6b81ea010c19ed7493566175",
    "integrate.py": "45a3058482c8ba05794aad486399c3e0fe07798c87cc11b1d8b149a3c49ff657",
    "INTEGRATION_CHECK_RUNS.json": "b2996271cab71bba868b2dcc1b6bd82e11baecc42005a910be182cb405c73ad7",
    "INTEGRATION_CI.json": "8479963eada30d13dfecf4dde480d46db46ef1bd9147ed9404803634e5a9c368",
    "INTEGRATION_CI_LOG.txt": "08837fe72bb07e71872932befcafccda3fc52924f9cd29f4bc236330fea51249",
    "INTEGRATION_SOURCE.json": "56053c7baf77e8f35a8942d1bba8bf021075c475a61a59490285a40d37633ba0",
    "JIRA_STARTED_10417.md": "76906bb8943a27549328c2f01ef44cd51e5135237ed9d981383d89e0634cd764",
    "JIRA_STARTED_DELIVERY_RECEIPT.json": "33a7d5f9d3c30011b6284e774b1ed6b838b7e7364a1cab516a0633e5da58c268",
    "MERGE_OPERATION.json": "b87a6ac80979a461215639c97f43465c1bbbc727b6bf2a13898a48d48fed0a0c",
    "merge_qualified.py": "942732e9e4d54ab38fe8840187da1c5709722081c3c51ddfcd591eea9c771b97",
    "post-deploy-detail-identity-check.sh": "7c2269706a849ec4a96555bca10fc396eacd7e5069b52e1cc6f9f835b7e26c44",
    "POSTCHECK_SCRIPT_ROOT_REVIEW.json": "0be54072e9d035ed42a67e14dee8c0baca0d40086207eeefbdefc1fb1baabea5",
    "preflight.py": "1c230ff5a422e4f317a671a80864806db3f2f3465e3d461081febe9af0bf4660",
    "prepare_qualified_body.py": "b45cec6d2be8b40ff1c0fee1525b33332b2c962bc6b4320c11998cf8e593db39",
    "prepare_release_tools.py": "3557b0c9ebcc2e40f90ecd180c7166b7690b4c36e31080088c601a236f802e2b",
    "PREVIOUS_CHECKPOINT_3df9e19f.md": "3df9e19f7fdae3c9731fb78dea8d098f278b8798c6209428982c84753630aa7b",
    "PR_BODY_STARTED.md": "d22d3951f2e02983a324a0772cad79ae6908c01b6c0183910b660f1704b92afc",
    "QUALIFIED_PR.json": "52503153350fc8cec00a1bb62d0f6daab0fe13653c6359fef545eb24c9bf1716",
    "qualify.py": "84a5fe14bc797e3aeebffe7c2f5424c5c6e4174c6e2a4d378370ebef34d5a8bc",
    "qualify_release.py": "ab8dd422cdb2a588802f31f0bbcbd5ffe43dfc1e1d61a82523ecc5a83da0477c",
    "RELEASE_TOOL_PREPARATION.json": "b80f77688b54013ea20bdb2d2415a342e5895b1bfecd937552db3c8bcadf9a27",
    "SAME_354_VERDICT_6549003709.md": "ec961e5da06104cf0dd2cb364f8892b867c77d9b4822e5e5569d5e3f21852ac4",
    "SAME_354_VERDICT_KAN31_10416.md": "8124172001ba68ea8a113f94be0a4dd21ef4f7934f6fc1f44f503f5ccf18aa4a",
    "SOURCE_ACCEPTANCE_RECEIPT.json": "624b3fae15120c86a322d0603d4b631242c9090687c36054ac6cb1f28c4a4675",
    "SOURCE_DIFF.patch": "934bdcc78dd0491fd3733d883a968eb54b4eb2185ff9370fe41c5485a5724a44",
    "SOURCE_request-intent-api.test.ts": "491442b15334af63f15831a1236d2f8c7aac37a9beac441e1a48dce9905256ba",
    "SOURCE_request-intent-api.ts": "08f90b784058f01dcce236bb448443b41e5d400869c80bb11dd95057bb7e401c",
    "verify_claim.py": "691d5c8cd2be7a0780d0714a439b8d8112edec0f7dd2b47ae411de8888c4da61",
    "verify_qa_custody.py": "5fbce1aa9811e665f43017f6d6ffb4e47566741eb3430136bccecaa2f12ab2b3"
  }
}
