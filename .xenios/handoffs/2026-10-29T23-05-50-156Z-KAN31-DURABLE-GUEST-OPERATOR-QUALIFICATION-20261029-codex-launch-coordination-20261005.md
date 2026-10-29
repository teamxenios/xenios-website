{
  "pr": 338,
  "head": "b0e5b225d081e195173b14df18c02e7908522199",
  "tree": "3f27bb19df3f7802df83ff187d8a91e2ba03e1cc",
  "releaseBase": "81b9cbe05c6ef500a5e02f6216ee89c5b0ae039a",
  "run": 40969839608,
  "attempt": 1,
  "provider": "bf36914357525115916a1b59fd8451d856b41cee",
  "providerTree": "3f27bb19df3f7802df83ff187d8a91e2ba03e1cc",
  "trustedApp": 15368,
  "jobs": [
    {
      "id": 123783546190,
      "name": "build",
      "conclusion": "success"
    },
    {
      "id": 123783546519,
      "name": "test",
      "conclusion": "success"
    },
    {
      "id": 123783546594,
      "name": "typecheck",
      "conclusion": "success"
    },
    {
      "id": 123783546652,
      "name": "protection",
      "conclusion": "success"
    },
    {
      "id": 123785693904,
      "name": "Required CI completion",
      "conclusion": "success"
    }
  ],
  "summary": [
    "test\tFocused guest-entry regression checks\t2026-10-29T22:59:51.9941477Z  Test Files  4 passed (4)",
    "test\tFocused guest-entry regression checks\t2026-10-29T22:59:51.9942426Z       Tests  110 passed (110)",
    "test\tRun npx vitest run\t2026-10-29T23:00:30.4729513Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4165ms",
    "test\tRun npx vitest run\t2026-10-29T23:03:54.1422660Z  Test Files  980 passed | 6 skipped (986)",
    "test\tRun npx vitest run\t2026-10-29T23:03:54.1561935Z       Tests  18239 passed | 83 skipped (18322)"
  ],
  "rawSha": "906ed148d275bd9493bc88712884a06ffb867006513b4959f976a23420f4c07c",
  "changedOnly": "server/research/assisted-order/request-intent/durable-journey.pg.test.ts",
  "testOnly": true,
  "result": "The one new disposable PostgreSQL journey test passed through its final positive operator read, negative role/scope/browser-role checks, immutable row/count audit assertions and owned-container cleanup. Baseline unchanged.",
  "overlap": "focused and full counts overlap, not additive",
  "limitations": "Synthetic guest/catalog/Care authority; SQL-backed RPC adapter, not managed Supabase/PostgREST/live Auth. Post-COMMIT reply loss injected at adapter boundary. No actual network cut, concurrent-writer contention, provider/inbox delivery, current-price or full mounted-browser proof. No production GO.",
  "initialFailure": "40968593387/d87f5ddf preserved; only canonical provider refusal expectation corrected; no weakened assertion/product change."
}
