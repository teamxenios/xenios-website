{
  "observedAt": "2026-10-30T16:08:42.099463+00:00",
  "pr": 340,
  "head": "a6da0536d35b485083b59476afdafb63518febec",
  "tree": "e526d394b0629e7ed6060dbd16eb67c537b83904",
  "parent": "0398b2bacc1f4acc6736ee45f69f0bb98c238256",
  "base": "81b9cbe05c6ef500a5e02f6216ee89c5b0ae039a",
  "branch": "codex/quick-order-requirements-refresh-20261030",
  "task": "KAN31-QUICK-ORDER-REQUIREMENTS-REFRESH-20261030",
  "lease": "e8ddffe2-2f18-4bc8-885b-741b079936bc",
  "paths": [
    "client/src/research/assisted-order/RequestIntentForm.tsx",
    "client/src/research/assisted-order/RequestIntentForm.test.tsx"
  ],
  "diff": "+158/-7 (runtime+23/-1; test+135/-6)",
  "testBlobUnchangedFromRed": "a556a7326e8d3a8797baf77391e7068db10bd255",
  "run": 41085561938,
  "attempt": 1,
  "provider": "64b63a2ddc8f6950c8a569c75404b2c74f5476bc",
  "providerTree": "e526d394b0629e7ed6060dbd16eb67c537b83904",
  "jobs": [
    {
      "id": 124165679703,
      "name": "test",
      "status": "completed",
      "conclusion": "success"
    },
    {
      "id": 124165680030,
      "name": "build",
      "status": "completed",
      "conclusion": "success"
    },
    {
      "id": 124165680229,
      "name": "protection",
      "status": "completed",
      "conclusion": "success"
    },
    {
      "id": 124165680238,
      "name": "typecheck",
      "status": "completed",
      "conclusion": "success"
    },
    {
      "id": 124170055344,
      "name": "Required CI completion",
      "status": "completed",
      "conclusion": "success"
    }
  ],
  "trustedCheckAppIds": [
    15368,
    15368,
    15368,
    15368,
    15368
  ],
  "otherChecks": [
    {
      "name": "Supabase Preview",
      "appId": 330661,
      "conclusion": "skipped",
      "required": false
    }
  ],
  "summary": [
    "2026-10-30T16:01:28.0061806Z  Test Files  4 passed (4)",
    "2026-10-30T16:01:28.0062659Z       Tests  110 passed (110)",
    "2026-10-30T16:01:54.9781570Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (32 tests) 981ms",
    "2026-10-30T16:06:16.2168373Z  Test Files  979 passed | 6 skipped (985)",
    "2026-10-30T16:06:16.2356681Z       Tests  18240 passed | 83 skipped (18323)"
  ],
  "rawSha256": "3b6e26f6b6932f81b3761fb35e9977e61ddc4b8864fa10c6346d26b294ccadaf",
  "redRun": 41084272025,
  "redReceiptSha256": "d4bd69fc24991c0e0bfcc77873c56386b629fb4aa2d0f4cad4f8c52b406905d2",
  "redRawSha256": "fa0b9b7165a5dc8d62738efaa7c97545cb6afbb62d2705a0a373ba97c7ae66c9",
  "outcome": "All32 request-form component cases PASS, including explicit v1-to-v2 requirements refresh with preserved volatile selections/contact, fresh consent and explicit submission; refresh failure/retry and pending-click dedup; existing same-key uncertainty controls retained.",
  "limits": "JSDOM/component/synthetic API version validation. Not native CSS/browser, managed persistence/liveAuth/current commercial authority/provider/inbox/production proof. No local Node/browser/DB execution. Skipped non-required SupabasePreview is not managed qualification.",
  "independentAcceptance": "NOT YET OBSERVED; ONE existing SAME request KAN31/10364; authors are not independent acceptance.",
  "release": "DRAFT/unmerged/no productionGO; production remains separately verified81b.",
  "counts": "Focused110/full18240/component32 overlap; never additive."
}
