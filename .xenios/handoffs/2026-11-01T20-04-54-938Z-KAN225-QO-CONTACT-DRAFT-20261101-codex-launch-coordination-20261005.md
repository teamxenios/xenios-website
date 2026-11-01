{
  "state": "FUNCTIONAL_CANDIDATE_PUSHED_PENDING_ACTUAL_GREEN",
  "source": "06cca6ac38c49ef484a0bbe4ae3b6a7bcf1b9766",
  "tree": "2bf3d1cd530ddc619013c4b6e800785822925dba",
  "parent": "cb9a7efe656513e2c4ac9915ffd45db20af85ac3",
  "base": "97b26c1f7460ec31ffa99e0e93e928ea01248dcf",
  "branch": "codex/quick-order-contact-draft-20261101",
  "paths": [
    "client/src/research/assisted-order/RequestIntentForm.tsx",
    "client/src/research/assisted-order/RequestIntentForm.test.tsx"
  ],
  "runtimeBlob": "22a2b75d811630ae7d02b2ef7cc69599a38b75ef",
  "testBlobUnchangedFromRed": "75b1ca704bbb13a8c9909f1b625a499d1b61fbd2",
  "diffFromBase": "78\t0\tclient/src/research/assisted-order/RequestIntentForm.test.tsx\n14\t6\tclient/src/research/assisted-order/RequestIntentForm.tsx",
  "redRun": 41342921416,
  "redVerified": {
    "pass": true,
    "source": "cb9a7efe656513e2c4ac9915ffd45db20af85ac3",
    "tree": "06cc621aad190fa67a5e30445caace75e94c7443",
    "actualCheckout": "b62deb028112994f076cb4cdae979a8c74274950",
    "run": 41342921416,
    "testJob": 124956561796,
    "focused145": "PASS overlapping full suite",
    "full": {
      "passed": 18357,
      "failed": 2,
      "skipped": 83,
      "filesPassed": 982,
      "filesFailed": 1,
      "filesSkipped": 6
    },
    "failures": [
      "fresh draft empty",
      "newer unreviewed draft reverted to prior Synthetic Customer"
    ],
    "trustedChecks": [
      {
        "name": "Required CI completion",
        "conclusion": "failure",
        "app": 15368,
        "headSha": "cb9a7efe656513e2c4ac9915ffd45db20af85ac3"
      },
      {
        "name": "test",
        "conclusion": "failure",
        "app": 15368,
        "headSha": "cb9a7efe656513e2c4ac9915ffd45db20af85ac3"
      },
      {
        "name": "typecheck",
        "conclusion": "success",
        "app": 15368,
        "headSha": "cb9a7efe656513e2c4ac9915ffd45db20af85ac3"
      },
      {
        "name": "protection",
        "conclusion": "success",
        "app": 15368,
        "headSha": "cb9a7efe656513e2c4ac9915ffd45db20af85ac3"
      },
      {
        "name": "build",
        "conclusion": "success",
        "app": 15368,
        "headSha": "cb9a7efe656513e2c4ac9915ffd45db20af85ac3"
      }
    ],
    "logSHA256": "ac4352f999bf21762260f7f5f7cc2ff216134ebc11283fba882007c83c1f0e8d",
    "nativeGoal": null
  },
  "hostedGreen": "PASS actual41343864309 attempt1 all5trusted15368SUCCESS",
  "PR": 357,
  "independentAcceptance": "PENDING SAMEc16 exact-source; helper/Root not acceptance",
  "executionStaging": "HELD",
  "nativeGoal": null,
  "task": "KAN225-QO-CONTACT-DRAFT-20261101",
  "lease": "42f80a68-deb2-468d-9923-c7a24fd77bcb",
  "claimCanonical": "6021efaac4396de657ca80381fe25e17b3040417",
  "currentCanonicalBeforeQA": "276dd4afa502d5b7044aaedb908d15ee9d70508b",
  "currentCounts": [
    95,
    116,
    57
  ],
  "customerOutcome": "Raw unfinished contact/address/age/separate billing survives in-mount back-to-products and quantity edit; later successful review clears draft; existing validation/ack/frozen attempt/owner unmount preserved; no contact browser storage",
  "checks": {
    "pass": true,
    "source": "06cca6ac38c49ef484a0bbe4ae3b6a7bcf1b9766",
    "tree": "2bf3d1cd530ddc619013c4b6e800785822925dba",
    "run": 41343864309,
    "attempt": 1,
    "full": {
      "passed": 18359,
      "failed": 0,
      "skipped": 83,
      "filesPassed": 983,
      "filesSkipped": 6
    },
    "focused145": "PASS overlapping full suite",
    "Form": "48PASS including two previously RED cases",
    "jobs": {
      "protection": {
        "job": 124959399305,
        "logSHA256": "df68b6171cd8475f1a4537e55c032e946623a2f27dbae00a7035fa50b701ef78",
        "checkoutSHAs": [
          "06cca6ac38c49ef484a0bbe4ae3b6a7bcf1b9766"
        ]
      },
      "test": {
        "job": 124959399476,
        "logSHA256": "aef72992bbec9cd5456fb33a32ff3e860f619191697117a25cbec1c2b42c6636",
        "checkoutSHAs": [
          "71c63b2df08396b32562ad676ac21a6f06c1c310"
        ]
      },
      "build": {
        "job": 124959399495,
        "logSHA256": "6562c604869b59c0679f7c3b37db74c75ed9d4e66a2fd325f713b931f12b5396",
        "checkoutSHAs": [
          "71c63b2df08396b32562ad676ac21a6f06c1c310"
        ]
      },
      "typecheck": {
        "job": 124959399507,
        "logSHA256": "3e1c8ec069369c8fdb283f678910fefb69c9e3cc1509ddb6da64fce22248e8db",
        "checkoutSHAs": [
          "71c63b2df08396b32562ad676ac21a6f06c1c310"
        ]
      }
    },
    "allFourActualCheckoutTrees": {
      "06cca6ac38c49ef484a0bbe4ae3b6a7bcf1b9766": "2bf3d1cd530ddc619013c4b6e800785822925dba",
      "71c63b2df08396b32562ad676ac21a6f06c1c310": "2bf3d1cd530ddc619013c4b6e800785822925dba"
    },
    "trustedAll5": [
      {
        "name": "Required CI completion",
        "conclusion": "success",
        "app": 15368,
        "headSha": "06cca6ac38c49ef484a0bbe4ae3b6a7bcf1b9766"
      },
      {
        "name": "typecheck",
        "conclusion": "success",
        "app": 15368,
        "headSha": "06cca6ac38c49ef484a0bbe4ae3b6a7bcf1b9766"
      },
      {
        "name": "build",
        "conclusion": "success",
        "app": 15368,
        "headSha": "06cca6ac38c49ef484a0bbe4ae3b6a7bcf1b9766"
      },
      {
        "name": "test",
        "conclusion": "success",
        "app": 15368,
        "headSha": "06cca6ac38c49ef484a0bbe4ae3b6a7bcf1b9766"
      },
      {
        "name": "protection",
        "conclusion": "success",
        "app": 15368,
        "headSha": "06cca6ac38c49ef484a0bbe4ae3b6a7bcf1b9766"
      }
    ],
    "proof": [
      "^[[2m Test Files ^[[22m ^[[1m^[[32m4 passed^[[39m^[[22m^[[90m (4)^[[39m",
      "^[[32m\u2713^[[39m client/src/research/assisted-order/RequestIntentForm.test.tsx ^[[2m(^[[22m^[[2m48 tests^[[22m^[[2m)^[[22m^[[33m 1433^[[2mms^[[22m^[[39m",
      "^[[2m Test Files ^[[22m ^[[1m^[[32m983 passed^[[39m^[[22m^[[2m | ^[[22m^[[33m6 skipped^[[39m^[[90m (989)^[[39m"
    ],
    "redRun": 41342921416,
    "red": "18357PASS2FAIL83SKIP; oldruntime; two expected loss/revert failures",
    "testBlobUnchanged": "75b1ca704bbb13a8c9909f1b625a499d1b61fbd2",
    "runtimeBlob": "22a2b75d811630ae7d02b2ef7cc69599a38b75ef",
    "nativeManagedAndStaging": "NOT RUN; hosted component/synthetic fixture evidence only",
    "independentAcceptance": "PENDING actual SAMEc16 exact verdict",
    "nativeGoal": null
  },
  "actualIndependentReview": {
    "reviewer": "SAME Claude c16cbf1c",
    "ACK": "KAN225/10431, no implementation involvement",
    "exactRequest": "KAN31/10432 actual delivered for06cca6a; source disposition PENDING",
    "proposalDisclosure": "Reviewer10431 named reviewed-snapshot precedence acceptance check; Root/helper authored code/tests. Runtime clears draft on successful review. No authored test/code accepted by self."
  },
  "implementationBuilder": "Existing quick_order_selection_unit actualACK RED/GREEN, authored scoped tests/runtime, returnedIDLE; no selfacceptance",
  "custody": "Exact2pathRootlease; all previous records preserved atclaim. Other current RootResources task/lease4c028bd8 must remain claimed/active, source8f74d59 test-only REDpending.",
  "privateRuntime": "No localNode/test/build/browser/SQL/Auth/customer/privatepacket/production changes; hosted component/synthetic fixture evidence only; nativePG17NOTRUN",
  "reusedBaseline": "PR35397b/tree89ac/release-static10422/10423 CLOSED; no repeatpublicGET/deploy inspection",
  "applicationPathsOnly": [
    "client/src/research/assisted-order/RequestIntentForm.tsx",
    "client/src/research/assisted-order/RequestIntentForm.test.tsx"
  ],
  "allOtherAppAuthConfigSQLBytesUnchanged": true,
  "allExistingSourceOperationalAndResourceHoldsPreserved": true,
  "staging": "HELD10003/privatebindings/10241",
  "artifacts": {
    "CONTACT_RED_SOURCE.json": "e631be7ca719bf5382ecb3da01dda430ea5ccb863e24e909282736f15a5f305f",
    "CONTACT_RED_VERIFIED.json": "fc25e4cfb1b46ecf5eb9fc8a7b2ba8c8d915beaba6d3c5ae2318a4b552a529bb",
    "CONTACT_GREEN_SOURCE.json": "ac3e1a43a361a899235ab2f9c7ee819a5e09ec6a6bf13b2aaadb8d7347eb172c",
    "CONTACT_GREEN_VERIFIED.json": "f8c3ffd27f23d5543b18682cd796babeebdb9e1a396ddac8ffafa284240ecd4f",
    "CONTACT_DRAFT_CLAIM_VERIFIED.json": "d9ffd41d02d121d47b40592f32916033109509a7611f87607870772a94e47a71",
    "CONTACT_EXACT_REVIEW_DELIVERY.json": "220a9deca4bd062dbc1c2d868757b86bcca2dfe6ef70ff412a334e439db43264"
  }
}
