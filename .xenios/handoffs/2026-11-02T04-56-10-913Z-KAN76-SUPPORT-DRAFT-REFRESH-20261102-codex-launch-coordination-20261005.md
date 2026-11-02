{
  "state": "SUPPORT_GREEN_INDEPENDENTLY_ACCEPTED_PENDING_SOURCE_QA_HANDOFF",
  "task": "KAN76-SUPPORT-DRAFT-REFRESH-20261102",
  "lease": "2c587f20-9ad7-4acf-974f-130fbdbfea5f",
  "owner": "codex-launch-coordination-20261005",
  "ownerJira": "KAN76/10449",
  "PR": 361,
  "branch": "codex/support-draft-refresh-20261102",
  "head": "0166b35d91ef2958e62a78eec165a2519a3fe038",
  "tree": "d5f1f982c35b125e7b4c97ea081e72a23cfcbf4b",
  "parent": "0ca22721bc4cd5e46f50ffbc842f185e7e3d3360",
  "paths": {
    "client/src/research/account/AccountSupport.tsx": {
      "blob": "f1431a82b4fd234aa711d9595a1fca84c76daca9",
      "sha256": "358f258f9b1020d16c800acb88aeaab964fe4e3d85e84a6515ff94585c57e036",
      "bytes": 1084
    },
    "client/src/research/account/AccountSupport.refresh.test.tsx": {
      "blob": "df9199c6da4e55dbd1acc44f0f95ed4e605cf689",
      "sha256": "679749e8590994ec806012476c51e97730b2f489a7bcd4e894c4ed5f2dd24425",
      "bytes": 13464
    },
    "client/src/research/account-portal/views/SupportView.tsx": {
      "blob": "a4e12ae3df2d7fece446233864f878aae44fbc42",
      "sha256": "1cf39fbac4b83376c6f0e39b5fea5ddb2b8d2cf08ddab74c726f7fab7757367e",
      "bytes": 13993
    },
    "client/src/research/account-portal/views/SupportView.pending.test.tsx": {
      "blob": "5405ef37376c91a766b842cc88b065639d3f618c",
      "sha256": "2267fdcec6c41fa30b2470c3ea55d51a6fd8d825ede8e341d845d05436b98763",
      "bytes": 7588
    },
    "client/src/research/account-portal/views/support-documents.test.tsx": {
      "blob": "b4ec613ed6ca70e0ee7917e8ef261d4095142fee",
      "sha256": "921c57ff230cd237aa925c85f68039045153d576a2e393ad12223294284277f0",
      "bytes": 12104
    }
  },
  "claimCanonical": "79b6e367da5e2d3f92b0ac99e1c60c65713eafe1",
  "patchSHA256": "4bf92c49b3a85a9d74fdb6c0bfb0f729f4dccab6bcad3d3bbc69fe69fd8ae772",
  "zipSHA256": "695f36011ee07347933a6809719208c171630181549cb07ff171e6184a4fa601",
  "authorFocusedTests": {
    "support-draft/evidence/support-red.json": {
      "numTotalTests": 6,
      "numPassedTests": 2,
      "numFailedTests": 4,
      "numPendingTests": 0,
      "success": false,
      "files": [
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/views/SupportView.pending.test.tsx",
          "cases": 6
        }
      ]
    },
    "support-draft/evidence/support-green.json": {
      "numTotalTests": 111,
      "numPassedTests": 111,
      "numFailedTests": 0,
      "numPendingTests": 0,
      "success": true,
      "files": [
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/views/SupportView.pending.test.tsx",
          "cases": 6
        },
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/views/account-extension.test.tsx",
          "cases": 10
        },
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/views/account-portal.test.tsx",
          "cases": 85
        },
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/views/support-documents.test.tsx",
          "cases": 10
        }
      ]
    },
    "support-refresh/evidence/refresh-red-node20.json": {
      "numTotalTests": 11,
      "numPassedTests": 0,
      "numFailedTests": 11,
      "numPendingTests": 0,
      "success": false,
      "files": [
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account/AccountSupport.refresh.test.tsx",
          "cases": 11
        }
      ]
    },
    "support-refresh/evidence/refresh-green-node20.json": {
      "numTotalTests": 129,
      "numPassedTests": 129,
      "numFailedTests": 0,
      "numPendingTests": 0,
      "success": true,
      "files": [
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account/AccountSupport.refresh.test.tsx",
          "cases": 11
        },
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account/account-portal-gate.test.tsx",
          "cases": 2
        },
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/resource.test.tsx",
          "cases": 5
        },
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/views/SupportView.pending.test.tsx",
          "cases": 6
        },
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/views/account-extension.test.tsx",
          "cases": 10
        },
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/views/account-portal.test.tsx",
          "cases": 85
        },
        {
          "name": "/workspace/scratch/ea6c84083120/accel-build-runtime-20261102/client/src/research/account-portal/views/support-documents.test.tsx",
          "cases": 10
        }
      ]
    }
  },
  "actualHostedCI": {
    "state": "SUPPORT_ACTUAL_HOSTED_GREEN",
    "head": "0166b35d91ef2958e62a78eec165a2519a3fe038",
    "tree": "d5f1f982c35b125e7b4c97ea081e72a23cfcbf4b",
    "base": "0ca22721bc4cd5e46f50ffbc842f185e7e3d3360",
    "PR": 361,
    "run": 41390041746,
    "event": "pull_request",
    "attempt": 1,
    "full": {
      "passed": 18381,
      "failed": 0,
      "skipped": 83,
      "filesPassed": 985,
      "filesSkipped": 6
    },
    "newSupportCases": 17,
    "focused145": "overlapping fullsuite, not additive",
    "requiredChecks": {
      "Required CI completion": 125101023642,
      "test": 125099198884,
      "protection": 125099198827,
      "build": 125099198792,
      "typecheck": 125099198620
    },
    "jobs": {
      "typecheck": {
        "job": 125099198620,
        "checkoutSHA": "f300eeef36cf4bbb601be2364adad15a405fb400",
        "logSHA256": "a38a57ea18aa9b9bce57746d3d0923222cf95a21e3f92862dbff70856a6593ef"
      },
      "build": {
        "job": 125099198792,
        "checkoutSHA": "f300eeef36cf4bbb601be2364adad15a405fb400",
        "logSHA256": "3a255a51a1c7b49061fa950ca26e1cfff32effd18492ae6605ec32bc60f3eeeb"
      },
      "protection": {
        "job": 125099198827,
        "checkoutSHA": "0166b35d91ef2958e62a78eec165a2519a3fe038",
        "logSHA256": "2a9c8a920f7e8083f013c4f486cb2c9f2465c33f4a7700a5d7855253172d2a77"
      },
      "test": {
        "job": 125099198884,
        "checkoutSHA": "f300eeef36cf4bbb601be2364adad15a405fb400",
        "logSHA256": "aaa9c3deea3824ce54f796a8d1150c02b206a8ee9cd79e7e2b3e3c42ea8d0b33"
      }
    },
    "actualCheckoutTrees": {
      "f300eeef36cf4bbb601be2364adad15a405fb400": "d5f1f982c35b125e7b4c97ea081e72a23cfcbf4b",
      "0166b35d91ef2958e62a78eec165a2519a3fe038": "d5f1f982c35b125e7b4c97ea081e72a23cfcbf4b"
    },
    "allFourActualCheckoutTreesExact": true,
    "allFiveDeliveredCandidateBlobsExact": true,
    "paths": {
      "client/src/research/account/AccountSupport.tsx": {
        "blob": "f1431a82b4fd234aa711d9595a1fca84c76daca9",
        "sha256": "358f258f9b1020d16c800acb88aeaab964fe4e3d85e84a6515ff94585c57e036",
        "bytes": 1084
      },
      "client/src/research/account/AccountSupport.refresh.test.tsx": {
        "blob": "df9199c6da4e55dbd1acc44f0f95ed4e605cf689",
        "sha256": "679749e8590994ec806012476c51e97730b2f489a7bcd4e894c4ed5f2dd24425",
        "bytes": 13464
      },
      "client/src/research/account-portal/views/SupportView.tsx": {
        "blob": "a4e12ae3df2d7fece446233864f878aae44fbc42",
        "sha256": "1cf39fbac4b83376c6f0e39b5fea5ddb2b8d2cf08ddab74c726f7fab7757367e",
        "bytes": 13993
      },
      "client/src/research/account-portal/views/SupportView.pending.test.tsx": {
        "blob": "5405ef37376c91a766b842cc88b065639d3f618c",
        "sha256": "2267fdcec6c41fa30b2470c3ea55d51a6fd8d825ede8e341d845d05436b98763",
        "bytes": 7588
      },
      "client/src/research/account-portal/views/support-documents.test.tsx": {
        "blob": "b4ec613ed6ca70e0ee7917e8ef261d4095142fee",
        "sha256": "921c57ff230cd237aa925c85f68039045153d576a2e393ad12223294284277f0",
        "bytes": 12104
      }
    },
    "proof": [
      "2026-11-02T04:44:57.7547731Z  Test Files  4 passed (4)",
      "2026-11-02T04:44:57.7548971Z       Tests  145 passed (145)",
      "2026-11-02T04:47:14.0045051Z  \u2713 client/src/research/account/AccountSupport.refresh.test.tsx (11 tests) 485ms",
      "2026-11-02T04:48:38.2833876Z  \u2713 client/src/research/account-portal/views/SupportView.pending.test.tsx (6 tests) 367ms",
      "2026-11-02T04:50:11.2053742Z  Test Files  985 passed | 6 skipped (991)",
      "2026-11-02T04:50:11.2228445Z       Tests  18381 passed | 83 skipped (18464)"
    ],
    "authorship": "Work accelerator and directed helper; Root unchanged application only",
    "localNodeTestsBuildBrowserAuthManagedDBStagingDeployment": "NOT RUN",
    "nativeGoal": null
  },
  "independentReview": {
    "decision": "ACCEPTED_BOUNDED_SOURCE_ONLY",
    "reviewer": "Existing /root/ci_contract_ready",
    "head": "0166b35d91ef2958e62a78eec165a2519a3fe038",
    "tree": "d5f1f982c35b125e7b4c97ea081e72a23cfcbf4b",
    "authorshipDisclosure": "Authored none of the support proposal/runtime/tests; involvement was prior readiness reads and independent review. Root applied unchanged source, no material implementation/test edits.",
    "sourceVerification": "Exactly five reviewed files; content matches delivered patch; reconstructed runtime matches raw committed bytes; git diff --check passed.",
    "CIReview": "Stored actualrun41390041746 attempt1/all5trustedapp15368SUCCESS;18381PASS0FAIL83SKIP/17newcasesPASS; all4jobloghashes match; retained receipt binds logged merge checkout to accepted tree.",
    "requiredCorrections": [],
    "optional": [
      "Direct pending-POST account-change/unmount coverage is absent. Reviewed mounted guard and existing account boundary provide protection; no defect established."
    ],
    "limitations": "Read-only source/evidence review; no local execution/liveAuth/browser/DB/staging/deployment. Source acceptance is not production activation.",
    "status": "IDLE"
  },
  "RootMaterialCodeOrTestChanges": false,
  "sourceAcceptanceIsNotProductionGO": true,
  "nativeGoal": null,
  "production": "PR361 draft/unmerged/undeployed; recordedpriorLIVE0ca unchanged; no production action",
  "separateNextAdmin": "Actual Claude10446 delivery consumed, unchanged patch application/hosted RED then GREEN pending under existing87067847; no delivery waiting boundary remains",
  "selector": "Read-only review found no required source fix; proposal stays separate/unintegrated until actual supported native caller/current corpus binding is established; no canonical owner-route replacement",
  "holds": "All Core/Token8/Authdirty/security/private/staging/browser/SQL/nativePG17/resource/activation holds preserved",
  "observedAt": "2026-11-02T04:55:36.704729+00:00"
}
