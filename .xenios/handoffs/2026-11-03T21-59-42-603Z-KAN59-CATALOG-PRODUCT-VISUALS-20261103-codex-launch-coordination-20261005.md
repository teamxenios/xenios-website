{
  "schemaVersion": 1,
  "task": "KAN59-CATALOG-PRODUCT-VISUALS-20261103",
  "lease": "ad0d11cc-2ea7-41a0-980d-2d8884dd838f",
  "owner": "codex-launch-coordination-20261005",
  "issue": "https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10539",
  "branch": "codex/catalog-product-visuals-20261103",
  "pr": "https://github.com/teamxenios/xenios-website/pull/368",
  "head": "e1d9d45021b4c2a9a1b2e74809f06acbd58716c1",
  "tree": "3731a6a05ab1bdbc86651b17a1fe521425969d0a",
  "previous": "1cecd45d2513005b61d6ad2af91752e03e540025",
  "base": "865d846c6e8bcceb6f12e97d91b91c5b9211a3e1",
  "recordedRelease": "d0fd93bf0402c72bb173f147e884256b04c927ed",
  "custody": {
    "claim": "2669130cc851ec9716e3a114410fa7aab57afcd4",
    "testPathExtension": "7a58fa7de7ff4cebd3bdcf5c487d4d0515e8b237",
    "finalClosureAtCapture": "pending",
    "exactPaths": [
      "A\tclient/public/research/product-media/capsule.svg",
      "A\tclient/public/research/product-media/liquid.svg",
      "A\tclient/public/research/product-media/tablet.svg",
      "A\tclient/public/research/product-media/topical.svg",
      "A\tclient/public/research/product-media/unknown.svg",
      "A\tclient/public/research/product-media/vial.svg",
      "M\tclient/src/research/master-offerings/MasterOfferingCard.tsx",
      "M\tclient/src/research/master-offerings/MasterOfferingDetail.tsx",
      "A\tclient/src/research/master-offerings/product-media.test.tsx",
      "A\tclient/src/research/product-media/ProductMedia.tsx",
      "A\tclient/src/research/product-media/product-media-format.generated.json"
    ]
  },
  "art": {
    "file": "product-format-art.svg",
    "sha256": "2469a4256cf36fc213c563dafd123af13b194218a0bac0b33f4ea2bc49ee976a",
    "bytes": 6251,
    "author": "quick_order_selection_unit",
    "integratedStandaloneBytes": 14004
  },
  "coverage": {
    "compiledVariants": 420,
    "mapped": 353,
    "byFormat": {
      "vial": 105,
      "capsule": 108,
      "tablet": 16,
      "topical": 31,
      "liquid": 93
    },
    "neutralInterim": 67,
    "guestIntegration": false,
    "finalPackaging": false
  },
  "red": {
    "run": 41723192460,
    "passed": 18421,
    "failed": 1,
    "skipped": 83,
    "focusedNewPassed": 3,
    "issue": "Test imported catalog-owned components from outside their lane. Moved to master-offerings with three relative imports changed. Runtime and assertions unchanged."
  },
  "green": {
    "run": 41724933409,
    "attempt": 1,
    "watchTerminalExit": 0,
    "passed": 18422,
    "failed": 0,
    "skipped": 83,
    "passedFiles": 990,
    "skippedFiles": 6,
    "productMediaPassed": 3,
    "catalogBoundaryPassed": 12,
    "providerMerge": "b0bdfd6e8e66883fb82035251681a37eeba3dc9f",
    "actualProviderMerge": "{\"parents\":[\"865d846c6e8bcceb6f12e97d91b91c5b9211a3e1\",\"e1d9d45021b4c2a9a1b2e74809f06acbd58716c1\"],\"sha\":\"b0bdfd6e8e66883fb82035251681a37eeba3dc9f\",\"tree\":\"3731a6a05ab1bdbc86651b17a1fe521425969d0a\"}",
    "actualRunAndPR": "{\"conclusion\":\"success\",\"event\":\"pull_request\",\"head_sha\":\"e1d9d45021b4c2a9a1b2e74809f06acbd58716c1\",\"id\":41724933409,\"run_attempt\":1,\"status\":\"completed\"}\n{\"base\":\"865d846c6e8bcceb6f12e97d91b91c5b9211a3e1\",\"draft\":true,\"head\":\"e1d9d45021b4c2a9a1b2e74809f06acbd58716c1\",\"merge_commit_sha\":\"b0bdfd6e8e66883fb82035251681a37eeba3dc9f\",\"merged\":false}",
    "actualChecks": "{\"app\":15368,\"conclusion\":\"success\",\"details_url\":\"https://github.com/teamxenios/xenios-website/actions/runs/41724933409/job/126230995592\",\"id\":126230995592,\"name\":\"Required CI completion\",\"status\":\"completed\"}\n{\"app\":15368,\"conclusion\":\"success\",\"details_url\":\"https://github.com/teamxenios/xenios-website/actions/runs/41724933409/job/126227112486\",\"id\":126227112486,\"name\":\"build\",\"status\":\"completed\"}\n{\"app\":15368,\"conclusion\":\"success\",\"details_url\":\"https://github.com/teamxenios/xenios-website/actions/runs/41724933409/job/126227112349\",\"id\":126227112349,\"name\":\"typecheck\",\"status\":\"completed\"}\n{\"app\":15368,\"conclusion\":\"success\",\"details_url\":\"https://github.com/teamxenios/xenios-website/actions/runs/41724933409/job/126227112290\",\"id\":126227112290,\"name\":\"protection\",\"status\":\"completed\"}\n{\"app\":15368,\"conclusion\":\"success\",\"details_url\":\"https://github.com/teamxenios/xenios-website/actions/runs/41724933409/job/126227111817\",\"id\":126227111817,\"name\":\"test\",\"status\":\"completed\"}",
    "jobCheckoutExcerpts": [
      "2026-11-03T21:49:19.3461369Z [command]/usr/bin/git log -1 --format=%H\r\n2026-11-03T21:49:19.3482688Z b0bdfd6e8e66883fb82035251681a37eeba3dc9f",
      "2026-11-03T21:53:37.3522293Z e1d9d45021b4c2a9a1b2e74809f06acbd58716c1\r\n2026-11-03T21:53:38.0357779Z [command]/usr/bin/git log -1 --format=%H\r\n2026-11-03T21:53:38.0372836Z e1d9d45021b4c2a9a1b2e74809f06acbd58716c1\r\n2026-11-03T21:54:09.0740049Z TEST FILES TOUCHED (permitted: a test cannot change what a visitor sees.",
      "2026-11-03T21:47:37.6921745Z [command]/usr/bin/git log -1 --format=%H\r\n2026-11-03T21:47:37.6945369Z b0bdfd6e8e66883fb82035251681a37eeba3dc9f",
      "2026-11-03T21:48:08.7730069Z [command]/usr/bin/git log -1 --format=%H\r\n2026-11-03T21:48:08.7754864Z b0bdfd6e8e66883fb82035251681a37eeba3dc9f"
    ],
    "testTotalsExcerpt": "2026-11-03T21:50:33.8397057Z  Test Files  4 passed (4)\r\n2026-11-03T21:51:46.4876779Z  ✓ server/research/master-offerings/catalog-boundaries.test.ts (12 tests) 329ms\r\n2026-11-03T21:54:31.3488591Z  ✓ client/src/research/master-offerings/product-media.test.tsx (3 tests) 84ms\r\n2026-11-03T21:54:43.9144843Z  Test Files  990 passed | 6 skipped (996)\r\n2026-11-03T21:54:43.9258308Z       Tests  18422 passed | 83 skipped (18505)"
  },
  "review": {
    "sameClaudeRoute": "c16",
    "requestedAtExistingComment": "10539",
    "fullNormalizedJiraEcho": true,
    "fullNormalizedPrEcho": true,
    "exactVerdict": "pending",
    "nativeAcknowledgment": "unverified"
  },
  "limits": {
    "nativeViewportEvidence": "not run",
    "productionRelease": "not authorized or executed",
    "pricePublication": "none",
    "guestFiles": "PR365/366 frozen and separately owned",
    "sourceQualification": "hosted component DOM and static asset existence, not native pixels or served production"
  }
}
