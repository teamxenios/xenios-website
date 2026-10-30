{
  "observedAt": "2026-10-30T17:03:48.780519+00:00",
  "pr": 341,
  "head": "4f0a6b05566826de9c59e9e282d5bff6480abf66",
  "tree": "d18066d7aeeed7a0e3dadd97bf3f824c1a18a52f",
  "parent": "18c407aff84efed34f7bc35c72cc9c751c526c70",
  "base": "81b9cbe05c6ef500a5e02f6216ee89c5b0ae039a",
  "branch": "codex/quick-order-closed-intake-recovery-20261030",
  "task": "KAN31-CLOSED-INTAKE-RECOVERY-20261030",
  "lease": "e10aae88-328b-490d-bed0-8e7010a2e9d9",
  "paths": [
    "server/research/assisted-order/request-intent/express.ts",
    "server/research/assisted-order/request-intent/production.test.ts"
  ],
  "diff": "+130/-9 (runtime+3/-2; test+127/-7)",
  "testBlob": "9c6c2f294bbaf19d04280e86b284504f6a65156e",
  "runtimeBlob": "c20b5adb7d3f1ccab592c35315bbd62f95ce6070",
  "run": 41094362271,
  "attempt": 1,
  "provider": "ceff2c318c0bbfa3157545595368ad06b2f1f2e8",
  "providerTree": "d18066d7aeeed7a0e3dadd97bf3f824c1a18a52f",
  "jobs": [
    {
      "id": 124196143222,
      "name": "build",
      "status": "completed",
      "conclusion": "success"
    },
    {
      "id": 124196143496,
      "name": "typecheck",
      "status": "completed",
      "conclusion": "success"
    },
    {
      "id": 124196143552,
      "name": "test",
      "status": "completed",
      "conclusion": "success"
    },
    {
      "id": 124196143614,
      "name": "protection",
      "status": "completed",
      "conclusion": "success"
    },
    {
      "id": 124199460831,
      "name": "Required CI completion",
      "status": "completed",
      "conclusion": "success"
    }
  ],
  "trustedApp": 15368,
  "otherChecks": [
    {
      "name": "Supabase Preview",
      "appId": 330661,
      "conclusion": "skipped",
      "required": false
    }
  ],
  "summary": [
    "2026-10-30T16:57:31.7499144Z  Test Files  4 passed (4)",
    "2026-10-30T16:57:31.7500051Z       Tests  110 passed (110)",
    "2026-10-30T16:58:46.1743627Z  \u2713 server/research/assisted-order/request-intent/production.test.ts (28 tests) 285ms",
    "2026-10-30T17:02:42.5577458Z  Test Files  979 passed | 6 skipped (985)",
    "2026-10-30T17:02:42.5742651Z       Tests  18249 passed | 83 skipped (18332)"
  ],
  "rawSha256": "4e6b7a8c300f3f658918cc3932d171fe5c81a6ebe2103873ec3fed530f1d57ad",
  "redRun": 41093101441,
  "redReceiptSha256": "d63815d213a189bd3eae8aaee874ecdce20e4bcafec9d3647c647796f2dea87c",
  "redRawSha256": "658a8ca4411afb75bebe5afacd821be9a8edf39a519dc347def7906712ae9816",
  "redDiagnosis": "10 real gate503 failures and one separate HEAD object-body harness TypeError. Corrected GET/HEAD request shape; all negative503/noRPC assertions retained.",
  "outcome": "All28 production-route cases pass: saved owner recovery while intake/legal readiness closed, receipt whitelist, foreign session/key, rejected bearer/capability/origin/metadata/JSON/body/limiter denials, exact path/method bounds and submit/config/catalog still closed. Existing limiter policy unchanged.",
  "limits": "Real registration/HTTP middleware/service/RPC adapter with synthetic saved-RPC results; not actual managed DB/liveAuth/persistence/cookies/native browser or production proof. No SQL/config/flag/privilege or local runtime action.",
  "independentAcceptance": "NOT YET OBSERVED; authors not acceptance",
  "release": "DRAFT/unmerged/no productionGO",
  "counts": "Focused110/full/route28 overlap, not additive"
}
