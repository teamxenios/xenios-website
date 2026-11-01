{
  "state": "SOURCE_IMPLEMENTED_HOSTED_QUALIFIED_PENDING_INDEPENDENT_ACCEPTANCE",
  "source": "9d34c5cfd9fbca873750f8543b7c85d375865f79",
  "tree": "af16131c7817ca1532f9777189a4b589286e5447",
  "parent": "8f74d59a3380b1d95ab8f66ccad4a121e52085f5",
  "base": "97b26c1f7460ec31ffa99e0e93e928ea01248dcf",
  "branch": "codex/partner-resource-save-recovery-20261101",
  "paths": [
    "client/src/research/pages/partners/Resources.tsx",
    "client/src/research/pages/partners/Resources.test.tsx"
  ],
  "task": "KAN8-PARTNER-DOWNLOAD-RECOVERY-20261101",
  "lease": "4c028bd8-1b37-4cb4-8b15-e45ce49900b5",
  "canonicalBeforeQA": "e1dc95b2199f6eddf5ad6f65333c32392553657a",
  "counts": [
    96,
    117,
    57
  ],
  "outcome": "Catch browser-save exceptions into fixed uncertainty error with explicit fresh authorized retry; temporary anchor/allocated objectURL cleanup; current-operation and principal boundaries preserved",
  "red": {
    "run": "41344791357",
    "attempt": 1,
    "source": "8f74d59a3380b1d95ab8f66ccad4a121e52085f5",
    "testJob": 124962200753,
    "actualCheckout": "794c8db41f2e905542a1e31f7f6b341b66e5ee28",
    "actualTree": "a45747ae256f04ce76c54ce54768564db29f3c1d",
    "logSHA256": "b66c61888717fc8f3380a780f62cabcac0f631af9bedb4341bc7b8fc1e9b4e81",
    "trusted": [
      {
        "name": "Required CI completion",
        "conclusion": "failure",
        "app": 15368
      },
      {
        "name": "build",
        "conclusion": "success",
        "app": 15368
      },
      {
        "name": "test",
        "conclusion": "failure",
        "app": 15368
      },
      {
        "name": "typecheck",
        "conclusion": "success",
        "app": 15368
      },
      {
        "name": "protection",
        "conclusion": "success",
        "app": 15368
      }
    ],
    "evidence": [
      "test\tFocused guest-entry regression checks\t2026-11-01T20:04:07.8026574Z ",
      "test\tFocused guest-entry regression checks\t2026-11-01T20:04:07.8031019Z ^[[2m Test Files ^[[22m ^[[1m^[[32m4 passed^[[39m^[[22m^[[90m (4)^[[39m",
      "test\tFocused guest-entry regression checks\t2026-11-01T20:04:07.8031956Z ^[[2m      Tests ^[[22m ^[[1m^[[32m145 passed^[[39m^[[22m^[[90m (145)^[[39m",
      "test\tFocused guest-entry regression checks\t2026-11-01T20:04:07.8032642Z ^[[2m   Start at ^[[22m 20:03:20",
      "test\tFocused guest-entry regression checks\t2026-11-01T20:04:07.8034696Z ^[[2m   Duration ^[[22m 47.51s^[[2m (transform 1.15s, setup 0ms, import 2.05s, tests 43.76s, environment 1.17s)^[[22m",
      "test\tFocused guest-entry regression checks\t2026-11-01T20:04:07.8037051Z ",
      "test\tRun npx vitest run\t\ufeff2026-11-01T20:04:07.8521838Z ##[group]Run npx vitest run",
      "test\tRun npx vitest run\t2026-11-01T20:05:47.7908620Z      ^[[33m^[[2m\u2713^[[22m^[[39m NEGATIVE: no listing state renders Buy Now from a non-purchase action ^[[33m 324^[[2mms^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:05:47.9095412Z  ^[[31m\u276f^[[39m client/src/research/pages/partners/Resources.test.tsx ^[[2m(^[[22m^[[2m16 tests^[[22m^[[2m | ^[[22m^[[31m5 failed^[[39m^[[2m)^[[22m^[[33m 568^[[2mms^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:05:47.9098151Z      ^[[32m\u2713^[[39m renders each card from the server projection with its usage label, purpose, audience, and size, and offers no share control^[[32m 167^[[2mms^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:05:47.9158033Z      ^[[32m\u2713^[[39m downloads through the server-authorized path with the member bearer and saves the streamed bytes^[[32m 38^[[2mms^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:05:47.9179819Z ^[[31m     ^[[31m\u00d7^[[31m recovers from a browser object-url failure only after an explicit fresh download^[[39m^[[32m 34^[[2mms^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:05:47.9181648Z ^[[31m     ^[[31m\u00d7^[[31m recovers from a browser anchor-click failure only after an explicit fresh download^[[39m^[[32m 28^[[2mms^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:05:47.9183197Z ^[[31m     ^[[31m\u00d7^[[31m discards the old download before browser handoff after logout^[[39m^[[32m 43^[[2mms^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7839190Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7840604Z ^[[31m\u23af\u23af\u23af\u23af\u23af\u23af\u23af^[[39m^[[1m^[[41m Failed Tests 5 ^[[49m^[[22m^[[31m\u23af\u23af\u23af\u23af\u23af\u23af\u23af^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7840957Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7844612Z ^[[41m^[[1m FAIL ^[[22m^[[49m client/src/research/pages/partners/Resources.test.tsx^[[2m > ^[[22mpartner resources library^[[2m > ^[[22mrecovers from a browser object-url failure only after an explicit fresh download",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7846358Z ^[[41m^[[1m FAIL ^[[22m^[[49m client/src/research/pages/partners/Resources.test.tsx^[[2m > ^[[22mpartner resources library^[[2m > ^[[22mrecovers from a browser anchor-click failure only after an explicit fresh download",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7850815Z ^[[31m^[[1mAssertionError^[[22m: expected true to be false // Object.is equality^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7851153Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7851348Z ^[[32m- Expected^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7851790Z ^[[31m+ Received^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7851990Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7852131Z ^[[32m- false^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7852498Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7852931Z ^[[36m ^[[2m\u276f^[[22m client/src/research/pages/partners/Resources.test.tsx:^[[2m210:40^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7912120Z     ^[[90m208|^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7913168Z     ^[[90m209|^[[39m     ^[[34mexpect^[[39m(fetcher)^[[33m.^[[39m^[[34mtoHaveBeenCalledTimes^[[39m(^[[34m1^[[39m)^[[33m;^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7914546Z     ^[[90m210|^[[39m     ^[[34mexpect^[[39m(^[[34mdownloadButton^[[39m()^[[33m?.^[[39mdisabled)^[[33m.^[[39m^[[34mtoBe^[[39m(^[[35mfalse^[[39m)^[[33m;^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7915244Z     ^[[90m   |^[[39m                                        ^[[31m^^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7916279Z     ^[[90m211|^[[39m     ^[[34mexpect^[[39m(host^[[33m.^[[39m^[[34mquerySelector^[[39m(^[[32m'[role=\"alert\"]'^[[39m)^[[33m?.^[[39mtextContent)",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7918395Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7919217Z ^[[41m^[[1m FAIL ^[[22m^[[49m client/src/research/pages/partners/Resources.test.tsx^[[2m > ^[[22mpartner resources library^[[2m > ^[[22mdiscards the old download before browser handoff after logout",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7920830Z ^[[41m^[[1m FAIL ^[[22m^[[49m client/src/research/pages/partners/Resources.test.tsx^[[2m > ^[[22mpartner resources library^[[2m > ^[[22mdiscards the old download before browser handoff after account-switch",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7922378Z ^[[41m^[[1m FAIL ^[[22m^[[49m client/src/research/pages/partners/Resources.test.tsx^[[2m > ^[[22mpartner resources library^[[2m > ^[[22mdiscards the old download before browser handoff after unmount",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7923430Z ^[[31m^[[1mAssertionError^[[22m: expected <a href=\"blob:failed-attempt\" \u2026(2)></a> to be null^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7923776Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7923910Z ^[[32m- Expected:^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7924126Z null",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7924240Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7924369Z ^[[31m+ Received:^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7925684Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7926238Z ^[[36m ^[[2m\u276f^[[22m client/src/research/pages/partners/Resources.test.tsx:^[[2m275:56^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7927032Z     ^[[90m273|^[[39m     ^[[34mexpect^[[39m(revokeObjectURL)^[[33m.^[[39mnot^[[33m.^[[39m^[[34mtoHaveBeenCalled^[[39m()^[[33m;^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7927726Z     ^[[90m274|^[[39m     ^[[34mexpect^[[39m(savedAs)^[[33m.^[[39m^[[34mtoEqual^[[39m([])^[[33m;^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7928932Z     ^[[90m275|^[[39m     ^[[34mexpect^[[39m(document^[[33m.^[[39mbody^[[33m.^[[39m^[[34mquerySelector^[[39m(^[[32m\"a[download]\"^[[39m))^[[33m.^[[39m^[[34mtoBeNull^[[39m()^[[33m;^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7929674Z     ^[[90m   |^[[39m                                                        ^[[31m^^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7930267Z     ^[[90m276|^[[39m     expect(host.textContent).not.toContain(\"PRIVATE-STALE-SAVE-DETAIL\"\u2026",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7931925Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7932277Z ^[[31m\u23af\u23af\u23af\u23af\u23af\u23af^[[39m^[[1m^[[41m Unhandled Errors ^[[49m^[[22m^[[31m\u23af\u23af\u23af\u23af\u23af\u23af^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7932649Z ^[[31m^[[1m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7932957Z Vitest caught 2 unhandled errors during the test run.",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7933682Z This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7934443Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7934890Z ^[[31m\u23af\u23af\u23af\u23af^[[39m^[[1m^[[41m Unhandled Rejection ^[[49m^[[22m^[[31m\u23af\u23af\u23af\u23af\u23af^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7935376Z ^[[31m^[[1mError^[[22m: PRIVATE-BROWSER-SAVE-DETAIL^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7936320Z ^[[36m ^[[2m\u276f^[[22m Function.<anonymous> client/src/research/pages/partners/Resources.test.tsx:^[[2m199:60^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7937624Z     ^[[90m197|^[[39m     ^[[35mconst^[[39m privateDetail ^[[33m=^[[39m ^[[32m\"PRIVATE-BROWSER-SAVE-DETAIL\"^[[39m^[[33m;^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7938667Z     ^[[90m198|^[[39m     ^[[35mif^[[39m (failure ^[[33m===^[[39m ^[[32m\"object-url\"^[[39m) {",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7939682Z     ^[[90m199|^[[39m       createObjectURL.mockImplementationOnce(() => { throw new Error(p\u2026",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7940686Z     ^[[90m   |^[[39m                                                            ^[[31m^^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7941829Z     ^[[90m200|^[[39m         ^[[33m.^[[39m^[[34mmockReturnValueOnce^[[39m(^[[32m\"blob:manual-retry\"^[[39m)^[[33m;^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7942787Z     ^[[90m201|^[[39m     } ^[[35melse^[[39m {",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7947242Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7948912Z ^[[31mThis error originated in \"^[[1mclient/src/research/pages/partners/Resources.test.tsx^[[22m\" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7950417Z ^[[31mThe latest test that might've caused the error is \"^[[1mrecovers from a browser object-url failure only after an explicit fresh download^[[22m\". It might mean one of the following:",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7951801Z - The error was thrown, while Vitest was running this test.",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7953137Z - If the error occurred after the test had been completed, this was the last documented test before it was thrown.^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7953564Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7953857Z ^[[31m\u23af\u23af\u23af\u23af^[[39m^[[1m^[[41m Unhandled Rejection ^[[49m^[[22m^[[31m\u23af\u23af\u23af\u23af\u23af^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7954337Z ^[[31m^[[1mError^[[22m: PRIVATE-BROWSER-SAVE-DETAIL^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7955080Z ^[[36m ^[[2m\u276f^[[22m HTMLAnchorElement.<anonymous> client/src/research/pages/partners/Resources.test.tsx:^[[2m203:56^[[22m^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7955682Z     ^[[90m201|^[[39m     } ^[[35melse^[[39m {",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7956343Z     ^[[90m202|^[[39m       createObjectURL.mockReturnValueOnce(\"blob:failed-attempt\").mockR\u2026",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7957014Z     ^[[90m203|^[[39m       anchorClick.mockImplementationOnce(() => { throw new Error(priva\u2026",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7957570Z     ^[[90m   |^[[39m                                                        ^[[31m^^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7957924Z     ^[[90m204|^[[39m     }",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7961051Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7962015Z ^[[31mThis error originated in \"^[[1mclient/src/research/pages/partners/Resources.test.tsx^[[22m\" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7963462Z ^[[31mThe latest test that might've caused the error is \"^[[1mrecovers from a browser anchor-click failure only after an explicit fresh download^[[22m\". It might mean one of the following:",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7964290Z - The error was thrown, while Vitest was running this test.",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7965030Z - If the error occurred after the test had been completed, this was the last documented test before it was thrown.^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7965662Z ^[[31m\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af\u23af^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7965842Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.7965862Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8067787Z ^[[2m Test Files ^[[22m ^[[1m^[[31m1 failed^[[39m^[[22m^[[2m | ^[[22m^[[1m^[[32m982 passed^[[39m^[[22m^[[2m | ^[[22m^[[33m6 skipped^[[39m^[[90m (989)^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8267840Z ^[[2m      Tests ^[[22m ^[[1m^[[31m5 failed^[[39m^[[22m^[[2m | ^[[22m^[[1m^[[32m18357 passed^[[39m^[[22m^[[2m | ^[[22m^[[33m83 skipped^[[39m^[[90m (18445)^[[39m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8268668Z ^[[2m     Errors ^[[22m ^[[1m^[[31m2 errors^[[39m^[[22m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8269078Z ^[[2m   Start at ^[[22m 20:04:08",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8283105Z ^[[2m   Duration ^[[22m 295.27s^[[2m (transform 41.95s, setup 0ms, import 197.87s, tests 280.11s, environment 215.03s)^[[22m",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8285224Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8522841Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8554473Z ##[error]Error: PRIVATE-BROWSER-SAVE-DETAIL",
      "test\tRun npx vitest run\t \u276f Function.<anonymous> client/src/research/pages/partners/Resources.test.tsx:199:60",
      "test\tRun npx vitest run\t \u276f saveBlob client/src/research/pages/partners/Resources.tsx:76:19",
      "test\tRun npx vitest run\t \u276f handleDownload client/src/research/pages/partners/Resources.tsx:136:7",
      "test\tRun npx vitest run\t",
      "test\tRun npx vitest run\tThis error originated in \"client/src/research/pages/partners/Resources.test.tsx\" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.",
      "test\tRun npx vitest run\tThe latest test that might've caused the error is \"recovers from a browser object-url failure only after an explicit fresh download\". It might mean one of the following:",
      "test\tRun npx vitest run\t- The error was thrown, while Vitest was running this test.",
      "test\tRun npx vitest run\t- If the error occurred after the test had been completed, this was the last documented test before it was thrown.",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8564861Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8572288Z ##[error]Error: PRIVATE-BROWSER-SAVE-DETAIL",
      "test\tRun npx vitest run\t \u276f HTMLAnchorElement.<anonymous> client/src/research/pages/partners/Resources.test.tsx:203:56",
      "test\tRun npx vitest run\t \u276f saveBlob client/src/research/pages/partners/Resources.tsx:82:10",
      "test\tRun npx vitest run\tThe latest test that might've caused the error is \"recovers from a browser anchor-click failure only after an explicit fresh download\". It might mean one of the following:",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8576171Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8578007Z ##[error]AssertionError: expected true to be false // Object.is equality",
      "test\tRun npx vitest run\t- Expected",
      "test\tRun npx vitest run\t+ Received",
      "test\tRun npx vitest run\t- false",
      "test\tRun npx vitest run\t \u276f client/src/research/pages/partners/Resources.test.tsx:210:40",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8579173Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8580833Z ##[error]AssertionError: expected true to be false // Object.is equality",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8582366Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8584703Z ##[error]AssertionError: expected <a href=\"blob:failed-attempt\" \u2026(2)></a> to be null",
      "test\tRun npx vitest run\t- Expected:",
      "test\tRun npx vitest run\tnull",
      "test\tRun npx vitest run\t+ Received:",
      "test\tRun npx vitest run\t \u276f client/src/research/pages/partners/Resources.test.tsx:275:56",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8586403Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8588750Z ##[error]AssertionError: expected <a href=\"blob:failed-attempt\" \u2026(2)></a> to be null",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8590404Z ",
      "test\tRun npx vitest run\t2026-11-01T20:09:03.8592368Z ##[error]AssertionError: expected <a href=\"blob:failed-attempt\" \u2026(2)></a> to be null",
      "test\tRun npx vitest run\t2026-11-01T20:09:04.0251877Z ##[error]Process completed with exit code 1.",
      "test\tPost Run actions/checkout@v4\t\ufeff2026-11-01T20:09:04.0399361Z Post job cleanup.",
      "test\tPost Run actions/checkout@v4\t2026-11-01T20:09:04.1250874Z [command]/usr/bin/git version"
    ]
  },
  "redClassification": "18357PASS5FAIL83SKIP/2unhandled rejections; two intended stuck-save failures, three later controls contaminated by leaked prior anchor, not independently reproduced stale-response failures",
  "green": {
    "pass": true,
    "source": "9d34c5cfd9fbca873750f8543b7c85d375865f79",
    "tree": "af16131c7817ca1532f9777189a4b589286e5447",
    "run": 41345711737,
    "attempt": 1,
    "full": {
      "passed": 18362,
      "failed": 0,
      "skipped": 83,
      "filesPassed": 983,
      "filesSkipped": 6
    },
    "focused145": "PASS overlapping full suite",
    "Resources": "16PASS including all five new cases",
    "jobs": {
      "typecheck": {
        "job": 124964951339,
        "logSHA256": "d27689048a0434c9c3aff24db7e58f5f20846f17f6da52cd9ce2c9f93cadb67a",
        "checkoutSHAs": [
          "fd0967534419037dfce1d158b2642dba8aba6b73"
        ]
      },
      "test": {
        "job": 124964951422,
        "logSHA256": "b836101d7fd8ceca7e0ba6395520ba87ee8c198d09387ef7834651ff184cdecf",
        "checkoutSHAs": [
          "fd0967534419037dfce1d158b2642dba8aba6b73"
        ]
      },
      "protection": {
        "job": 124964951435,
        "logSHA256": "cc4877d52a294aa76360bf2018f331a8694e7a2c39afc8e9df1839b878e3003a",
        "checkoutSHAs": [
          "9d34c5cfd9fbca873750f8543b7c85d375865f79"
        ]
      },
      "build": {
        "job": 124964951444,
        "logSHA256": "6ee72cb5c698028e036dc40b36bcf47f6c01f4e42a1bf5be3ef03e3c9d9a6f9a",
        "checkoutSHAs": [
          "fd0967534419037dfce1d158b2642dba8aba6b73"
        ]
      }
    },
    "allFourActualCheckoutTrees": {
      "fd0967534419037dfce1d158b2642dba8aba6b73": "af16131c7817ca1532f9777189a4b589286e5447",
      "9d34c5cfd9fbca873750f8543b7c85d375865f79": "af16131c7817ca1532f9777189a4b589286e5447"
    },
    "trustedAll5": [
      {
        "name": "Required CI completion",
        "conclusion": "success",
        "app": 15368,
        "headSha": "9d34c5cfd9fbca873750f8543b7c85d375865f79"
      },
      {
        "name": "build",
        "conclusion": "success",
        "app": 15368,
        "headSha": "9d34c5cfd9fbca873750f8543b7c85d375865f79"
      },
      {
        "name": "protection",
        "conclusion": "success",
        "app": 15368,
        "headSha": "9d34c5cfd9fbca873750f8543b7c85d375865f79"
      },
      {
        "name": "test",
        "conclusion": "success",
        "app": 15368,
        "headSha": "9d34c5cfd9fbca873750f8543b7c85d375865f79"
      },
      {
        "name": "typecheck",
        "conclusion": "success",
        "app": 15368,
        "headSha": "9d34c5cfd9fbca873750f8543b7c85d375865f79"
      }
    ],
    "proof": [
      "2026-11-01T20:14:31.3516379Z  Test Files  4 passed (4)",
      "2026-11-01T20:14:31.3518012Z       Tests  145 passed (145)",
      "2026-11-01T20:16:19.2181918Z  \u2713 client/src/research/pages/partners/Resources.test.tsx (16 tests) 652ms",
      "2026-11-01T20:19:50.8281562Z  Test Files  983 passed | 6 skipped (989)",
      "2026-11-01T20:19:50.8452956Z       Tests  18362 passed | 83 skipped (18445)"
    ],
    "redRun": 41344791357,
    "red": "18357PASS5FAIL83SKIP and2unhandled errors; two stuck-save cases plus leak contamination of three later controls",
    "testBlobUnchanged": "c0dce8c026e20b67ef253a91a50e6b00fbeb38e4",
    "runtimeBlob": "54c5068496b7d01d1d3768530dc40dd7a4d921aa",
    "nativeManagedAndStaging": "NOT RUN; hosted component/synthetic fixture evidence only",
    "resourceActivation": "HELD unchanged",
    "independentAcceptance": "PENDING actual SAME c16 exact verdict",
    "nativeGoal": null
  },
  "implementation": "Existing ci_contract_ready actual ACK RED/GREEN and returned IDLE; Root directed/reviewed/committed; neither is independent acceptor",
  "independentAcceptance": {
    "reviewer": "SAME Claude c16",
    "request": "KAN31/10433 actual delivered for frozen9d34c5c; GREEN addendum follows on SAME comment",
    "state": "PENDING actual exact-source disposition; no pickup/job inferred"
  },
  "existingIssue": "KAN8/10429",
  "PR": 358,
  "sourceUnchangedOutsideTwoPaths": true,
  "testUnchangedFromRED": true,
  "nativeBrowserLiveAuthManagedDBStaging": "NOT RUN; hosted component/synthetic fixtures only",
  "ResourceHubActivation": "HELD, policy/gate/Auth/backend unchanged",
  "allSourceOperationalAndResourceHoldsPreserved": true,
  "operatorStaging": "HELD10003/privatebindings/10241",
  "privateW1D": "NOT READ/WRITTEN/REEVALUATED; no private relay evaluation",
  "releaseBaseline": "PR35397b/dep-dbja8cfb9u1s73bhgd90/static10422/10423 CLOSED; no repeat public GET/deploy poll",
  "integrationAndDeployment": "NOT RUN, pending exact independent source acceptance and existing release qualifications",
  "custody": "Close only this task/lease; ContactQA and C2QA preserved, all foreign identities/rules/history/prior handoffs retained",
  "nativeGoal": null,
  "artifactSHA256": {
    "RESOURCE_CLAIM_VERIFIED.json": "4cb192b78b579a92ea20d0de96a3c9c917d05c6cfd76bb539dbb46a33ce754cb",
    "RESOURCE_RED_SOURCE.json": "18d2f59a15da45446a68f6b5ca2cb609b484553013e7287035054a15ed9f1502",
    "RESOURCE_RED_RESULT.json": "0d2a21f4b7935fc2a65e1aa4c2421f73382d0d136810dd240245355913a9b861",
    "RESOURCE_GREEN_SOURCE.json": "ae5d2c016f619e7e7870c838307dbdc8bc49b6f8e0e18e32e4d3b8a554160dbf",
    "RESOURCE_GREEN_VERIFIED.json": "41d8af0df693f7f1112b6a8d0b9aa5ff1987e4656b1ec022133838347d82d76f",
    "C2_QA_VERIFIED.json": "86d7e8f3cc2cc49dd4478bb752d4f23cbb37da2550c4c208fc15611e1f917c08",
    "RESOURCE_EXACT_REVIEW_DELIVERY.json": "1e20ca16f8687bda49c6529c152e62cfecdcad4f6ee4d0def75ac54fca3a90ea"
  }
}
