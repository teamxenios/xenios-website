// Source-only until Root's isolated Actions allocation. Importing runs no QA.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { release as kernelRelease } from "node:os";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { launchChromium } from "./lib/chrome.mjs";
import { CdpConnection, PageSession } from "./lib/cdp.mjs";
import { PAGE_AUDIT_SOURCE, FOCUS_BASELINE_SOURCE, FOCUS_PROBE_SOURCE } from "./lib/page-audit.js";
import { createImmutableDistSnapshot, inventoryDirectory, inventorySha256 } from "./lib/immutable-dist.mjs";
import { assertPinnedExecutingRuntime } from "./lib/provenance.mjs";

export const QUALIFIED_BASELINE = "47e46709060684ada6d365b1544500539b296620";
export const QUALIFIED_BASELINE_TREE = "1868d4a15e9531371e3b5fdcd2609c48ec26ba51";
export const WHOLESALE_ROUTE = "/research/organizations";
export const ROUTES = Object.freeze(["/", "/r/SAMPLE-CODE", WHOLESALE_ROUTE]);
/** Fixed synthetic GETs, never provider/Auth configuration or readiness. */
export const READ_ONLY_GET_FIXTURES = Object.freeze({
  "/api/config": Object.freeze({ status: 200, body: Object.freeze({ metaPixelId: null, turnstileSiteKey: null,
    calendlyUrl: "", supabaseUrl: null, supabaseAnonKey: null }) }),
  "/api/research/me": Object.freeze({ status: 200, body: Object.freeze({ configured: true, authed: false }) }),
  "/api/research/business-inquiries/config": Object.freeze({ status: 503, body: Object.freeze({ enabled: false }) }),
});

// Exact selected Root source bytes; contract's old bc9b hashes are historical only.
export const DISPLAY_SCENARIO = 'premium-synthetic-catalog-display';
/** MC10 is a version of the same display facility, never a new authority. */
export const LEGACY_DISPLAY_CONTRACT = 'legacy-eight-v1';
export const MC10_DISPLAY_CONTRACT = 'mc10-476-v1';
export const MC10_SCOPE = 'SYNTHETIC_CANONICAL_PROJECTION_AND_FRONTEND_TRANSITIONS_ONLY';
// Current exact pin overlay; original contract/fixture source identifiers below remain ancestry provenance.
const HISTORICAL_BROWSE_SUMMARY_PIN_COMPOSITION = Object.freeze({
  source: 'fc9e53ca416257aed6caf4e9f782f0150278b5de', tree: '605281bc21d958d90251b69ffb3bf7501c14f33c',
  selectionReceiptSha256: '9befd77234aaef2334c774816015e6f8614ccc649ff0ced8b6dff6ef645716f8',
  appSelectionReceiptSha256: '22efa3f2c382a211288f3799c1afe36ce704fb91c5353ca7d7d5b4e296176548',
  conservationReceiptSha256: '9befd77234aaef2334c774816015e6f8614ccc649ff0ced8b6dff6ef645716f8',
  provenanceRole: 'AUTHORED_BOUNDARY_TEST_MOVE_NOT_INDEPENDENT_REVIEW',
  previousRootComposition: Object.freeze({
    source: 'b29120185be9629a580af39f4133b69845d90b91', tree: 'e199e830f1cf13b8ffe558fcb9089b10d134c8e3',
    selectionReceiptSha256: '4a7892218800b58bebcf4efd072d0990b0bc8d89d7b62acd5352606c508ef109',
    appSelectionReceiptSha256: '22efa3f2c382a211288f3799c1afe36ce704fb91c5353ca7d7d5b4e296176548',
    conservationReceiptSha256: '4a7892218800b58bebcf4efd072d0990b0bc8d89d7b62acd5352606c508ef109',
    acceptedReorderWorkflowSha256: '11b510b1fa4434d519cbdebf7e7f500faa492284dd4219e95aa55d65325e82ea'
  }),
  importedHistorical: Object.freeze({
    source: '9ea1b865a4ca0bceecfc710531abbd705b3d8689', tree: '89f0085af67a97ef131eb5c2662210412e0f909c',
    authorHandoffSha256: '5939b5220401e3124bd9792536fbc9c5c46e17337ff50f85c3450022194351c9',
    conservationReceiptSha256: 'd2c824b61d74d6badf84471224e1fc6bace6666a3f3370fa1378770960f085e9',
    helperSource: '09eec92037e47f85fe008d7960468490f0ef5187',
    helperReviewSha256: '13684f67136349c8753171f2be8943c45f118ce5a114bca9ecfbbd9001ad9b17',
    coherentPinsSha256: 'a9fc2eda7fc9c80cdf89d28102dba4d10df5afd0e5a43c91643c3269edcf2872'
  })
});
const REVIEWED_APP_FOCUS_COMPANION = Object.freeze({
  "state": "SOURCE_BINDING_ONLY",
  "source": "ff55ffa004bc3aca5ff08033bde17c048511fbe5",
  "tree": "0042391bd456da838b5e6b774aa2982dbec0f3a7",
  "sourcePublicationReference": "KAN-225/14571",
  "independentSourceAcceptanceReference": null,
  "form": {
    "path": "client/src/research/assisted-order/RequestIntentForm.tsx",
    "mode": "100644",
    "blob": "7d5d88b2b1320ea940663f99a5fd98b457914d96",
    "bytes": 71357,
    "sha256": "e01ac0eee672b3d857c9d1f1d60556e1988f3ca943412c383c1ed283413f5b20"
  },
  "mountedFocusRegressionTest": {
    "mode": "100644",
    "blob": "dc42b02db73350466ef63fc16f29ab59188f8104",
    "bytes": 11481,
    "sha256": "aa166748f6816146629093b7b84753231b60521ccf9f73929f13350479a6df85",
    "path": "client/src/research/assisted-order/RequestIntentForm.pagination-focus.test.tsx",
    "state": "SOURCE_BINDING_ONLY",
    "independentAcceptanceAsserted": false,
    "fixtureProposalReference": "KAN-225/14569",
    "sourcePublicationReference": "KAN-225/14571"
  },
  "boundWorkflow": {
    "path": "C:/Users/sboad/projects/ea-current-release-20261118/APP-FOCUS-CI-PREPARATION-20261121/CHECKS-WITH-REVIEWED-FOCUS-SELECTOR-BOUND.yml",
    "bytes": 49536,
    "sha256": "efa0601a40a4d4551ac0c83c8934d236495535fa53c7d92b4fc23dceb8658bb5"
  },
  "boundWorkflowReceipt": {
    "path": "C:/Users/sboad/projects/ea-current-release-20261118/APP-FOCUS-CI-PREPARATION-20261121/BOUND-WORKFLOW-REMOVAL-TEST-CORRECTION-RECEIPT.json",
    "bytes": 1285,
    "sha256": "cd3e0957252f64e026f047a530a48acef504352efc03d5c313c3e990787425f1"
  },
  "finalComposition": null,
  "runtime": "UNRUN_CORRECTED_FIXTURE_AND_NEW_BINDING",
  "acceptanceAsserted": false,
  "fixtureCorrectionProposalReference": "KAN-225/14569",
  "constructionReceipt": {
    "path": "C:/Users/sboad/projects/ea-current-release-20261118/PRINT-MEDIA-CURRENT-INTEGRATION-20261121/FOCUS-FIXTURE-REMOVAL-CORRECTION-V1/CONSTRUCTION.json",
    "bytes": 1109,
    "sha256": "4552c806c9daf2ec0138a5980419b15ed62a5ecfe260fba64cd3e41809960bc7"
  },
  "originalFormSourceAcceptance": {
    "source": "7218fd69b8dbba77fcceb23b2d67f141783624a2",
    "tree": "d52fb2605596460c49b81f67e84448d2bae934ab",
    "sourcePublicationReference": "KAN-225/14560",
    "independentSourceAcceptanceReference": "KAN-225/14562",
    "scope": "UNCHANGED_FORM_ENDPOINT_ONLY_NOT_CURRENT_FIXTURE_OR_COMPOSITION_ACCEPTANCE",
    "form": {
      "path": "client/src/research/assisted-order/RequestIntentForm.tsx",
      "mode": "100644",
      "blob": "7d5d88b2b1320ea940663f99a5fd98b457914d96",
      "bytes": 71357,
      "sha256": "e01ac0eee672b3d857c9d1f1d60556e1988f3ca943412c383c1ed283413f5b20"
    }
  },
  "historicalMountedFocusRegressionTest": {
    "path": "client/src/research/assisted-order/RequestIntentForm.pagination-focus.test.tsx",
    "mode": "100644",
    "blob": "460ee0c162d769cecf37da3d818a25b9031b3648",
    "bytes": 11093,
    "sha256": "217a0e8981914f868ec0f5dd8906bc45c04baf3beaa23cca0550b03499fbf3a5",
    "source": "7218fd69b8dbba77fcceb23b2d67f141783624a2",
    "tree": "d52fb2605596460c49b81f67e84448d2bae934ab",
    "state": "HISTORICAL_TEST_ACCEPTANCE_WITHDRAWN",
    "withdrawalReferences": [
      "KAN-225/14567",
      "KAN-225/14569"
    ]
  },
  "historicalOriginal7218BoundWorkflowReceipt": {
    "path": "C:/Users/sboad/projects/ea-current-release-20261118/APP-FOCUS-CI-PREPARATION-20261121/BOUND-WORKFLOW-RECEIPT.json",
    "bytes": 639,
    "sha256": "cc534e2ac59b8e6e9f676bbcc32252a39766c4f81841dc91787a5b2d78f97c61",
    "role": "HISTORICAL_ORIGINAL_7218_460EE_TEST_BINDING_NOT_CURRENT_TEST_OR_ACCEPTANCE"
  }
});
const BROWSE_SUMMARY_PIN_COMPOSITION = Object.freeze({
  source: "ff55ffa004bc3aca5ff08033bde17c048511fbe5", tree: "0042391bd456da838b5e6b774aa2982dbec0f3a7", state: "SOURCE_BINDING_ONLY",
  finalRootComposition: null, compositionRole: "SOURCE_BINDING_ONLY_FF55_APP_FIXTURE_NOT_FINAL_ROOT_CANDIDATE",
  reviewedAppFocusCompanion: REVIEWED_APP_FOCUS_COMPANION,
  importedHistorical: HISTORICAL_BROWSE_SUMMARY_PIN_COMPOSITION
});
export const MC10_REFERENCE = Object.freeze({ source: 'ff524580ebc4c1d439d119e41fd2e404498d65cf',
  tree: '58b6090589d3a2804485b421e60c42c5d9a6681a',
  contractSha256: 'e56dd220ed0d7cd60653ec12fd0a7b5ce1ba6ebc93b69878dc33367dd99daf49',
  inventorySha256: '08d4ef55a5d1164a21e122ca463461539ccff41ef4b8ebbaebcb2dd5c35afb8c',
  grantSha256: '23c940a66ba3c1f05635c6618fdbc2bf941188f59d4aff94441d02ad578d9c5c',
  referenceRole: 'ORIGINAL_CANONICAL_CONTRACT_BASELINE', currentPinComposition: BROWSE_SUMMARY_PIN_COMPOSITION });
// These exact imports/data are canonical inputs, not a claimed whole import graph.
export const MC10_CANONICAL_PINS = freezeDisplayValue([
  {
    "path": "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
    "mode": "100644",
    "blob": "d0f1104e54a5a33f77eb4d34a8ce5993c8b11534",
    "bytes": 378927,
    "sha256": "0bd76792c4114761e5c57fc16ad2ceef0f2eef363bc90bc0139f9cd6c26ca9b9"
  },
  {
    "path": "server/research/master-offerings/data/master-offering-bindings.generated.json",
    "mode": "100644",
    "blob": "7760d5d8fb559c9c9c6cfc7622827fb4977b61d5",
    "bytes": 108239,
    "sha256": "587595e68cb1b47a8ee7f55728eb65d64c2f55f36ad242080232743a9c53ae24"
  },
  {
    "path": "server/research/master-offerings/data/reviewed-public-content.json",
    "mode": "100644",
    "blob": "69a59fd770cf98d54fc850dbd25736b56c86c47d",
    "bytes": 2121512,
    "sha256": "ad813827ec575f8c2220abdb01ff304da44c3ddbf223706d8bc41d48550e1aa5"
  },
  {
    "path": "server/research/master-offerings/data/reviewed-public-media.json",
    "mode": "100644",
    "blob": "83d3bc79236dd18fa11610ce2d61d02dfae1e070",
    "bytes": 238943,
    "sha256": "04e55f60d66777acfa8ab147ec14e0b48c64c40b33a523e2726790d3d17fb16e"
  },
  {
    "path": "server/research/master-offerings/data/reviewed-inquiry-review-states.json",
    "mode": "100644",
    "blob": "5e3037330b8d598b51135041c2d7cc1218244481",
    "bytes": 58352,
    "sha256": "3052cac71859b628162e0e4eb227d26646b062e4aabd0bc2c5fe01c3d2f5aca0"
  },
  {
    "path": "server/research/master-offerings/data/reviewed-inquiry-review-states.research.json",
    "mode": "100644",
    "blob": "91699c49f20477693600ee5723a96eb287117be3",
    "bytes": 406,
    "sha256": "ce92734e69264738ee31da54dee345d5e0193ba8c4fe60b21b3de2efd5c60536"
  },
  {
    "path": "server/research/master-offerings/data/reviewed-display-names.json",
    "mode": "100644",
    "blob": "66669cc49ff12042ee121bbbeb705b7311ca0643",
    "bytes": 6860,
    "sha256": "5a3f76de5963e4372849ea549ceda8f2880d923b800e390b42f8ff0e771217fc"
  },
  {
    "path": "server/research/master-offerings/data/reviewed-search-terms.json",
    "mode": "100644",
    "blob": "48ebe6183f62bd681b6ca30ca600a706296fe2b6",
    "bytes": 4693,
    "sha256": "1ac005c307263394373f228947155a49132c929b1725b4620daa04b4eb5035ab"
  },
  {
    "path": "config/research/master-catalog-reconciliation-20260821.json",
    "mode": "100644",
    "blob": "50a4b0eadac3bb999a26cb359bdccbb21d2ea362",
    "bytes": 5674,
    "sha256": "8ee32f7e15af318c1d52d8e5a077dadbe0b874fc031093b5789d0cbb98d4cd09"
  },
  {
    "path": "server/research/master-offerings/dataset-reader.ts",
    "mode": "100644",
    "blob": "aa14625541c43fc3bb72dcccc08ad23fa42ef2f6",
    "bytes": 20252,
    "sha256": "3973f0736de0b1d3ba9d3fc22c974a0aba79f440be27f1f4daafe808cac2812d"
  },
  {
    "path": "server/research/master-offerings/service.ts",
    "mode": "100644",
    "blob": "3b03b21e12c9a4b69003cf35e118e411005d91f9",
    "bytes": 11842,
    "sha256": "f6edb5c09004248a0c2dce5f1d49f172322945727c6e65382ebf0658113d8a52"
  },
  {
    "path": "server/research/master-offerings/customer-projection.ts",
    "mode": "100644",
    "blob": "f42006b9512f0bea4ffc30618a04bebe85cb40a8",
    "bytes": 6112,
    "sha256": "c65f797bb69406cd559cb968b33494f4b77a52ca5aac190e9c0479c3788ab45b"
  },
  {
    "path": "server/research/master-offerings/price-authority.ts",
    "mode": "100644",
    "blob": "95ad8f7b3db4ae40e2414e0e0e9ca8899fec8ac2",
    "bytes": 10233,
    "sha256": "7f43270d50ae6bed46df9be663a07f6d57872641767776abc21a5741db23015e"
  },
  {
    "path": "server/research/master-offerings/production-bindings.ts",
    "mode": "100644",
    "blob": "c9396f723a14de56cf6921ba0d330999733500c0",
    "bytes": 8769,
    "sha256": "8e95dabd938af12d114fb28bc583af3d8df656cdc688389f91184ce6cf9961aa"
  },
  {
    "path": "server/research/master-offerings/reviewed-holds.ts",
    "mode": "100644",
    "blob": "a967c8bc6c2fe64970853b0274247ce331803fe4",
    "bytes": 4286,
    "sha256": "b5d168543867e3e6c699362048628fd88a4da59b208c5415c70098f75a816baf"
  },
  {
    "path": "server/research/master-offerings/reviewed-content.ts",
    "mode": "100644",
    "blob": "0a24e50ef0fb33fdd78e13e8f334bcb99c35b0d0",
    "bytes": 4088,
    "sha256": "e191f45072a1d60e9046b46b8b5235d721fb079aa831861946fcabca875f6f93"
  },
  {
    "path": "server/research/master-offerings/held-education.ts",
    "mode": "100644",
    "blob": "20864fe1af937e372608416d042721ddd6548a1d",
    "bytes": 6879,
    "sha256": "9586c690dcc733894fa9394b5cbbb45c030c6aca32d794e2a29898118a38725b"
  },
  {
    "path": "server/research/master-offerings/held-education-registrations.ts",
    "mode": "100644",
    "blob": "66420e370c0e761105755e7121ad50ff25d057a1",
    "bytes": 1085751,
    "sha256": "6ccce1925d8e613325a0872ecd688d8b87c6dd8da6ad18ef7468ee36206f6891"
  },
  {
    "path": "server/research/master-offerings/inquiry-review-states.ts",
    "mode": "100644",
    "blob": "46e4687185bfa48ba1cfb638f80f17e1d41af396",
    "bytes": 4236,
    "sha256": "0547ddf9c2f92d27c0385c5817f6172956a68a843be8bf12e69edd1923cf0aa4"
  },
  {
    "path": "server/research/master-offerings/reviewed-search-terms.ts",
    "mode": "100644",
    "blob": "be37ed1468d35997ce0b596ff36843b19fafa525",
    "bytes": 8093,
    "sha256": "9e6bc0ed599fe7698dc25ad2ee1242992a265c01675877e101f72cd91cf9a4a7"
  },
  {
    "path": "server/research/assisted-order/request-intent/catalog.ts",
    "mode": "100644",
    "blob": "8e728a59010a2a3d70d0ab0dc66bd61d7f88f5f8",
    "bytes": 15559,
    "sha256": "267184109a98f9285aa0ba6f42ee45467a28cd7c44d226b9f94a775c130941ed"
  },
  {
    "path": "server/research/assisted-order/request-intent/catalog-search.ts",
    "mode": "100644",
    "blob": "53068c3f7f7139c1aecfa96331f26a0d031df656",
    "bytes": 21139,
    "sha256": "473675d8380afd138a24b9144eb43fe7659e77de6be4ebf389229d6af38e01e3"
  },
  {
    "path": "server/research/assisted-order/request-intent/ranking-source.ts",
    "mode": "100644",
    "blob": "e5fe0fd3ca6274f4b9666df0d4f2c8a55b9bb8a4",
    "bytes": 3807,
    "sha256": "be7f5ff6e7f11b0def35588aec4c01409895d8d64e6b82592233781e4c40ae10"
  },
  {
    "path": "server/research/assisted-order/production-catalog.ts",
    "mode": "100644",
    "blob": "f56b3e65d2b7cd5bbc09e8b11be75417dc19942e",
    "bytes": 21378,
    "sha256": "e8c93445afa37ae42fd5ce38ad3cc18044bc7c492294fc67e32c104d7246bac6"
  },
  {
    "path": "shared/research/assisted-order/action-policy.ts",
    "mode": "100644",
    "blob": "c9943cf72d40987024d384e1a3a2f93e6e8ccd84",
    "bytes": 5683,
    "sha256": "e4778ffd670bc8cef62458fe1be0d38ca1839fd47729b8a2e3577ccde550cb0d"
  },
  {
    "path": "shared/research/assisted-order/contract.ts",
    "mode": "100644",
    "blob": "ac7cec4a03915b83dd8a1d0a82c52db59c2d04b1",
    "bytes": 22475,
    "sha256": "3e6888683286c7404ed78390f1b1700d2301fbf007cd07d2f6b0fa6a1c377b42"
  },
  {
    "path": "shared/research/assisted-order/request-intent.ts",
    "mode": "100644",
    "blob": "116dbeeb98dc2483b576bedc5720759d0fc8e8fe",
    "bytes": 7792,
    "sha256": "3566017ddd05b028aa674dcbc18f6c33ae60e75a2f15b80d955fd6385dd95fff"
  },
  {
    "path": "shared/research/early-access/quote-only.ts",
    "mode": "100644",
    "blob": "707fc8c9c7e397746b2bbfe57935eb3df05ebe87",
    "bytes": 5153,
    "sha256": "e7edc20c4fd2a508f6b692009fd2002613b6a90e7caa3337e980e278f7507d50"
  },
  {
    "path": "shared/research/master-offerings/pathway-authority.ts",
    "mode": "100644",
    "blob": "abeebe1b40df96a1e55f67a1697b24014a8619ff",
    "bytes": 9165,
    "sha256": "d702cf9b67c0dec0d90a231b93cace52479e6bebc1c985615c10e891a0db0f29"
  },
  {
    "path": "shared/research/master-offerings/quote-cart.ts",
    "mode": "100644",
    "blob": "190ea2489902a7005b940f0347efee08bbb5d6e4",
    "bytes": 2557,
    "sha256": "37a73449167f68a3a9ad7fd7df6b7a11c82e66355a6b740c2a91b36044c461bb"
  },
  {
    "path": "shared/research/master-offerings/formulation-hold.ts",
    "mode": "100644",
    "blob": "c5c95e8cac1d24d6b81fbfba4f084bc83f68ce1f",
    "bytes": 5150,
    "sha256": "c5b11b2f468a77b0da111f7228ff27fa3c15e72f66c2dc15f4e864007dd9bbc5"
  },
  {
    "path": "shared/research/master-offerings/hcg-strength-review.ts",
    "mode": "100644",
    "blob": "234445db5f7ea54a0e41e2650801f0934424ea6f",
    "bytes": 1202,
    "sha256": "a6971547039f768cf3badfe185340194a4832875749bd1b18bdccaedb81efa79"
  },
  {
    "path": "client/src/research/product-media/reviewed-form-holds.ts",
    "mode": "100644",
    "blob": "44d7288f8e8013c545a2d9172e36f7642eb3a54d",
    "bytes": 8358,
    "sha256": "60e91bbac651051217de4aaa3df5e85589e7f080c0429e9fd42684a74e680d54"
  },
  {
    "path": "server/research/policies-data.ts",
    "mode": "100644",
    "blob": "640afa5b5aa65836381bb6714f1bc3f87afc5578",
    "bytes": 22967,
    "sha256": "7b208c3f2963938e041d3a6119a2cd06e4f1c5c686c6f93eeead4f7dd257d336"
  },
  {
    "path": "package-lock.json",
    "mode": "100644",
    "blob": "912f4f85e9a078ed97ed2b67ce8d1de09490eb29",
    "bytes": 262653,
    "sha256": "d25eb6b816b616cfa1dc7b1769c14971b944e5385bfae9be41e75d1cf5e64f74"
  }
]);
// Root selected these actual frozen application bytes; independent helper/composition
// review and hosted qualification remain separate. No old hero target, default products state or arbitrary selector
// is accepted as an alternative. Selection provenance is not an independent verdict.
export const MC10_UI_BINDING = freezeDisplayValue({
  "state": "ROOT_SELECTED_FROZEN_UI_SOURCE",
  "source": "ff55ffa004bc3aca5ff08033bde17c048511fbe5",
  "tree": "0042391bd456da838b5e6b774aa2982dbec0f3a7",
  "handoffSha256": "4552c806c9daf2ec0138a5980419b15ed62a5ecfe260fba64cd3e41809960bc7",
  "intakeContractSha256": "56b6c2ae6ea7b35a19cfb412084ce4cf339a13bb4a28feeb549b5815c83d347d",
  "composedSource": "ff55ffa004bc3aca5ff08033bde17c048511fbe5",
  "composedTree": "0042391bd456da838b5e6b774aa2982dbec0f3a7",
  "historicalComposition": {
    "source": "b59042b2ecc84ffeb26adade1426b99ae56fb591",
    "tree": "3262eb0d361dc167b4a0c6d83601ccd7cd5f3122",
    "selectionReceiptSha256": "89ee091824a33fc9ae5543905224bd4f963de6621fbcc5553397daf7ff58ebe5",
    "coherentPinsSha256": "72f72319526fab5e79540d745cd6d62ef3f637228898e3c13463205e52d939f4"
  },
  "compositionConservationSha256": null,
  "pins": [
    {
      "bytes": 4426,
      "sha256": "73e101c99c523e0269b5c5e1e60cb7a330a7220be968540671a84eb0469c706b",
      "mode": "100644",
      "path": "client/src/research/assisted-order/assisted-order-accessibility.test.ts",
      "blob": "f8d717e70117d1ca303df323d64de391f8108642"
    },
    {
      "bytes": 26110,
      "sha256": "5761450782915f23df68bdee680c45944b38c7252f25d731c10bac816cfa690a",
      "mode": "100644",
      "path": "client/src/research/assisted-order/assisted-order.css",
      "blob": "99ddd25036243358403b0c84e98945d8a6b9d6e9"
    },
    {
      "bytes": 2791,
      "sha256": "399f0448489fabc77f8afadaedca5d04ad3e3124b8359861a12a75abbd9c94c6",
      "mode": "100644",
      "path": "client/src/research/assisted-order/guest-catalog-phone.css",
      "blob": "0b737dbcfea3600eba2275100a9cd614cf089fe5"
    },
    {
      "bytes": 13143,
      "sha256": "d02f88fae5e4ec007c9f7f84516201c5fe55c368d6f7d71ec4e957a8ef7c632a",
      "mode": "100644",
      "path": "client/src/research/assisted-order/OrderRequestEntry.tsx",
      "blob": "b49a23cc9b1259844e300dc447cf21bb508090c7"
    },
    {
      "bytes": 3145,
      "sha256": "aa7654c9130afda38105e4b69280ad7014c88b0b404858c048b637e79bfcfa4a",
      "mode": "100644",
      "path": "client/src/research/assisted-order/persistent-request-bar-model.ts",
      "blob": "987ac986ce4b553aa625efe04a4457ec294d4052"
    },
    {
      "bytes": 3604,
      "sha256": "65527350af58961fd0f96ee6e3fc43106aa41471353bbe0d6f0b00afad337016",
      "mode": "100644",
      "path": "client/src/research/assisted-order/persistent-request-bar.css",
      "blob": "e3c83c871126afcc5944ccc25de31e96f4802c98"
    },
    {
      "bytes": 8088,
      "sha256": "e1b3dd2133a3e3f3d12cd2b0f6ae020cc1432f4be2cdd969fb6b5b9b9a8ad52a",
      "mode": "100644",
      "path": "client/src/research/assisted-order/PersistentRequestBar.tsx",
      "blob": "08099e33ec1cfa0964bff665526ff9881538b5b8"
    },
    {
      "bytes": 9937,
      "sha256": "22a899ed1ee49222e6b9807504723bea19dedf0f698f6e569d24e8da8c100365",
      "mode": "100644",
      "path": "client/src/research/assisted-order/PersistentRequestBar.viewport.test.tsx",
      "blob": "6a2d627b9b909994bc710308063e18c82658484b"
    },
    {
      "bytes": 3969,
      "sha256": "6b2e5ab7e074aa1b5deb1f9cb8218dbdf440af657899b4900efecccc5eaf9ad5",
      "mode": "100644",
      "path": "client/src/research/assisted-order/request-dock-premium.css",
      "blob": "184e2b4dc171d9cf7f05fdd481f12d057f776941"
    },
    {
      "bytes": 16223,
      "sha256": "1b4fdf804ce137e7bc30bdec82f06c1c8c66808a542403bc7b79f1d2ff558f82",
      "mode": "100644",
      "path": "client/src/research/assisted-order/request-intent-api.ts",
      "blob": "9481b8271790851433b5851c84b93dacb56671de"
    },
    {
      "bytes": 5299,
      "sha256": "4aad47cba3e9dece69b86593441ede5f73c338add691490d14fa1c19a741b052",
      "mode": "100644",
      "path": "client/src/research/assisted-order/request-intent-attempt.ts",
      "blob": "0708dfcc502252c8a4e481b452657e23c30a4c16"
    },
    {
      "bytes": 5657,
      "sha256": "d34513aeb09c7c63dce8866f971ac1bcfd2a4bf2786c9f73d5e0da9e796d93ae",
      "mode": "100644",
      "path": "client/src/research/assisted-order/RequestIntentEntry.tsx",
      "blob": "832c97f1ff6e95af6200827ed2136c2f64e7ebf1"
    },
    {
      "bytes": 12436,
      "sha256": "f8496c68046304496fce87e36d5449752186c40dfb53bf7611a416973124e939",
      "mode": "100644",
      "path": "client/src/research/assisted-order/RequestIntentForm.action-bar.test.tsx",
      "blob": "62fc3ed728bd384863b765ac1a4d73b2e4f61078"
    },
    {
      "bytes": 10919,
      "sha256": "55789df99946fa4dc9eea92fb0537e87c0e2f2f24268cd0bbafdcd498be28ba2",
      "mode": "100644",
      "path": "client/src/research/assisted-order/RequestIntentForm.category-entry.test.tsx",
      "blob": "ad457936331ecd60a722b2b99c97ce65f20c1b17"
    },
    {
      "bytes": 71357,
      "sha256": "e01ac0eee672b3d857c9d1f1d60556e1988f3ca943412c383c1ed283413f5b20",
      "mode": "100644",
      "path": "client/src/research/assisted-order/RequestIntentForm.tsx",
      "blob": "7d5d88b2b1320ea940663f99a5fd98b457914d96"
    },
    {
      "bytes": 421,
      "sha256": "43eb0d56c7b75673cafe7d9e1d3f5d6949b5c2ed66410c03dd4b6ca20cd8b484",
      "mode": "100644",
      "path": "client/src/research/early-access/BoundCatalogAdmission.tsx",
      "blob": "3a09e9a531c162e30da93f0e92cb44f533c07378"
    },
    {
      "bytes": 2826,
      "sha256": "eaebc2583410f2f6734b2394fbadbee7504fdb9e79ce54b36774c495e8011bc7",
      "mode": "100644",
      "path": "client/src/research/early-access/catalog-admission-api.ts",
      "blob": "89132afcb264da4164ebe59207b05597f274e271"
    },
    {
      "bytes": 9063,
      "sha256": "6b11b52ecf4c352f7f5b15c071eb631cc6192245b6b39e8e1f5591f39b421eac",
      "mode": "100644",
      "path": "client/src/research/early-access/CatalogStartingPointGuide.tsx",
      "blob": "45c66b463d9feff4bf4eb963d82585ccade39b89"
    },
    {
      "bytes": 40653,
      "sha256": "63b36416a53e92eafdc45b4d3466c2aceaadb22aa750d7b3104df1e36e0ed850",
      "mode": "100644",
      "path": "client/src/research/early-access/EarlyAccessRoute.tsx",
      "blob": "b191cb5759b94e061575ba1054c05d3e6cbd9eb7"
    },
    {
      "bytes": 11273,
      "sha256": "cb3a54655b1bc9b8f9bcbd1d48150c720c09120a659d75750bf208c9841ddc69",
      "mode": "100644",
      "path": "client/src/research/early-access/PreCatalogContact.tsx",
      "blob": "4b143a1edbcb9ac11d438784bb3d2877a8557eb8"
    },
    {
      "bytes": 14944,
      "sha256": "4553e12db083b140b56ba921776d1e32bcdf6621eee68406af17b2392764a85a",
      "mode": "100644",
      "path": "client/src/research/early-access/premium-early-access.css",
      "blob": "584b0e49b5eafb3dfb3aa6988b45f2cc22e94ea7"
    },
    {
      "bytes": 15828,
      "sha256": "26955c96e581a9951e9eefa3bb38f495815ef52836d6a46d2e2fb7e110bf693d",
      "mode": "100644",
      "path": "client/src/research/early-access/premium-early-access.test.tsx",
      "blob": "a0289d0fa93c2c595abe95416315450e97e36bcd"
    },
    {
      "bytes": 14880,
      "sha256": "0e0be4b83ea57aa711f22a407859b71bef134ca87fec657b8a06e1132ac44113",
      "mode": "100644",
      "path": "client/src/research/product-media/product-media-format.generated.json",
      "blob": "9e783a9b95a39dcb7bf51fad4a8c29185d4374d9"
    },
    {
      "bytes": 4072,
      "sha256": "74ab3783bacb4da7d46b5cb2991658463b097b151819e95d2b4f97ef9a19a164",
      "mode": "100644",
      "path": "client/src/research/product-media/ProductMedia.tsx",
      "blob": "ea1bdf96e4f2dc84841fe985055dd1b6c19071ab"
    },
    {
      "bytes": 1358,
      "sha256": "9ef797915373aac626171346dbae5fcafe628edc2ba4fcdd31c1a348be057cb8",
      "mode": "100644",
      "path": "shared/research/assisted-order/admission-address.ts",
      "blob": "08dd672ba43af0f6dbf80453773d43765769df02"
    },
    {
      "bytes": 2907,
      "sha256": "bbd277e59407b3d90be44b3c90ad842f221a28f78825a3a01954aee4c6228746",
      "mode": "100644",
      "path": "shared/research/master-offerings/approved-content.ts",
      "blob": "3a7d15472652a1943270a4e93d166e5721c23f75"
    }
  ],
  "productsSignal": "ACTUAL_VISIBLE_PRODUCTS_BRANCH",
  "productsHeading": "Browse the catalog",
  "rowIdentity": {
    "productId": "data-product-id",
    "variantId": "data-variant-id"
  },
  "focusContract": "ACTUAL_RETURN_AND_CURRENT_NATIVE_SUCCESSOR",
  "selectors": {
    "intake": "form[aria-label=\"Contact information for catalog access\"]",
    "fullLegalName": "form[aria-label=\"Contact information for catalog access\"] input[name=\"fullLegalName\"]",
    "email": "form[aria-label=\"Contact information for catalog access\"] input[name=\"email\"]",
    "line1": "form[aria-label=\"Contact information for catalog access\"] input[name=\"line1\"]",
    "city": "form[aria-label=\"Contact information for catalog access\"] input[name=\"city\"]",
    "region": "form[aria-label=\"Contact information for catalog access\"] input[name=\"region\"]",
    "postalCode": "form[aria-label=\"Contact information for catalog access\"] input[name=\"postalCode\"]",
    "countryCode": "form[aria-label=\"Contact information for catalog access\"] select[name=\"countryCode\"]",
    "confirm": "form[aria-label=\"Contact information for catalog access\"] button[type=\"submit\"]",
    "products": ".xenios-order-page--guest-catalog",
    "productsHeading": "header .xenios-order-catalog-start",
    "family": ".xenios-order-catalog-toolbar select",
    "blocking": "[role=\"alert\"],[data-testid=\"request-catalog-policy-gate\"],.xenios-order-receipt-continuations",
    "rows": ".xenios-order-cards > article",
    "rowName": ".xenios-order-card-identity > h2",
    "rowSpecification": ".xenios-order-card-identity > p:first-of-type",
    "rowSummary": ".xenios-order-card-description--reviewed",
    "rowQualifier": ".xenios-order-card-meta",
    "nextPage": "nav[aria-label=\"Catalog pages\"] button:last-of-type",
    "previousPage": "nav[aria-label=\"Catalog pages\"] button:first-of-type",
    "search": "input[data-testid=\"request-catalog-search\"]",
    "add": "button.xenios-order-button[aria-label]",
    "remove": "button.xenios-order-link[aria-label^=\"Remove \"]",
    "dock": "[data-testid=\"request-action-bar\"]",
    "dockStatus": ".xenios-request-dock__status > span",
    "spacer": "[data-testid=\"request-action-bar-spacer\"]",
    "continue": "button[data-testid=\"request-action-bar-primary\"]",
    "contact": ".xenios-order-page--guest-catalog > form",
    "back": ".xenios-order-page--guest-catalog > form > .xenios-order-actions > button[type=\"button\"]"
  },
  "dependencies": [
    "independent_four_helper_source_and_composition_review_before_CI",
    "existing_entry_and_legacy_semantic_reference_coupling_before_running_those_versions"
  ],
  "selectionReceiptSha256": "4552c806c9daf2ec0138a5980419b15ed62a5ecfe260fba64cd3e41809960bc7",
  "coherentPinsSha256": null,
  "historicalPriorSelectedBinding": {
    "state": "PENDING_REVIEWED_APP_FOCUS_RESTORATION",
    "source": "5edc10d206e2c48a419ffdac83f9ad60fb72bb60",
    "tree": "0cd2b5a3da65de081f410896514327b767212c59",
    "handoffSha256": "5bb34e70b38bbe132184568e0aebcf17451bd3e69bd6e8b3f35296e0726d9e5c",
    "composedSource": "fc9e53ca416257aed6caf4e9f782f0150278b5de",
    "composedTree": "605281bc21d958d90251b69ffb3bf7501c14f33c",
    "compositionConservationSha256": "9befd77234aaef2334c774816015e6f8614ccc649ff0ced8b6dff6ef645716f8",
    "selectionReceiptSha256": "9befd77234aaef2334c774816015e6f8614ccc649ff0ced8b6dff6ef645716f8",
    "coherentPinsSha256": "4cba0c5025c1e0a7e5abe2e52badab5c1062309de79132b61f14f349b61485e6"
  },
  "reviewedAppFocusCompanion": {
    "state": "SOURCE_BINDING_ONLY",
    "source": "ff55ffa004bc3aca5ff08033bde17c048511fbe5",
    "tree": "0042391bd456da838b5e6b774aa2982dbec0f3a7",
    "sourcePublicationReference": "KAN-225/14571",
    "independentSourceAcceptanceReference": null,
    "form": {
      "path": "client/src/research/assisted-order/RequestIntentForm.tsx",
      "mode": "100644",
      "blob": "7d5d88b2b1320ea940663f99a5fd98b457914d96",
      "bytes": 71357,
      "sha256": "e01ac0eee672b3d857c9d1f1d60556e1988f3ca943412c383c1ed283413f5b20"
    },
    "mountedFocusRegressionTest": {
      "mode": "100644",
      "blob": "dc42b02db73350466ef63fc16f29ab59188f8104",
      "bytes": 11481,
      "sha256": "aa166748f6816146629093b7b84753231b60521ccf9f73929f13350479a6df85",
      "path": "client/src/research/assisted-order/RequestIntentForm.pagination-focus.test.tsx",
      "state": "SOURCE_BINDING_ONLY",
      "independentAcceptanceAsserted": false,
      "fixtureProposalReference": "KAN-225/14569",
      "sourcePublicationReference": "KAN-225/14571"
    },
    "boundWorkflow": {
      "path": "C:/Users/sboad/projects/ea-current-release-20261118/APP-FOCUS-CI-PREPARATION-20261121/CHECKS-WITH-REVIEWED-FOCUS-SELECTOR-BOUND.yml",
      "bytes": 49536,
      "sha256": "efa0601a40a4d4551ac0c83c8934d236495535fa53c7d92b4fc23dceb8658bb5"
    },
    "boundWorkflowReceipt": {
      "path": "C:/Users/sboad/projects/ea-current-release-20261118/APP-FOCUS-CI-PREPARATION-20261121/BOUND-WORKFLOW-REMOVAL-TEST-CORRECTION-RECEIPT.json",
      "bytes": 1285,
      "sha256": "cd3e0957252f64e026f047a530a48acef504352efc03d5c313c3e990787425f1"
    },
    "finalComposition": null,
    "runtime": "UNRUN_CORRECTED_FIXTURE_AND_NEW_BINDING",
    "acceptanceAsserted": false,
    "fixtureCorrectionProposalReference": "KAN-225/14569",
    "constructionReceipt": {
      "path": "C:/Users/sboad/projects/ea-current-release-20261118/PRINT-MEDIA-CURRENT-INTEGRATION-20261121/FOCUS-FIXTURE-REMOVAL-CORRECTION-V1/CONSTRUCTION.json",
      "bytes": 1109,
      "sha256": "4552c806c9daf2ec0138a5980419b15ed62a5ecfe260fba64cd3e41809960bc7"
    },
    "originalFormSourceAcceptance": {
      "source": "7218fd69b8dbba77fcceb23b2d67f141783624a2",
      "tree": "d52fb2605596460c49b81f67e84448d2bae934ab",
      "sourcePublicationReference": "KAN-225/14560",
      "independentSourceAcceptanceReference": "KAN-225/14562",
      "scope": "UNCHANGED_FORM_ENDPOINT_ONLY_NOT_CURRENT_FIXTURE_OR_COMPOSITION_ACCEPTANCE",
      "form": {
        "path": "client/src/research/assisted-order/RequestIntentForm.tsx",
        "mode": "100644",
        "blob": "7d5d88b2b1320ea940663f99a5fd98b457914d96",
        "bytes": 71357,
        "sha256": "e01ac0eee672b3d857c9d1f1d60556e1988f3ca943412c383c1ed283413f5b20"
      }
    },
    "historicalMountedFocusRegressionTest": {
      "path": "client/src/research/assisted-order/RequestIntentForm.pagination-focus.test.tsx",
      "mode": "100644",
      "blob": "460ee0c162d769cecf37da3d818a25b9031b3648",
      "bytes": 11093,
      "sha256": "217a0e8981914f868ec0f5dd8906bc45c04baf3beaa23cca0550b03499fbf3a5",
      "source": "7218fd69b8dbba77fcceb23b2d67f141783624a2",
      "tree": "d52fb2605596460c49b81f67e84448d2bae934ab",
      "state": "HISTORICAL_TEST_ACCEPTANCE_WITHDRAWN",
      "withdrawalReferences": [
        "KAN-225/14567",
        "KAN-225/14569"
      ]
    },
    "historicalOriginal7218BoundWorkflowReceipt": {
      "path": "C:/Users/sboad/projects/ea-current-release-20261118/APP-FOCUS-CI-PREPARATION-20261121/BOUND-WORKFLOW-RECEIPT.json",
      "bytes": 639,
      "sha256": "cc534e2ac59b8e6e9f676bbcc32252a39766c4f81841dc91787a5b2d78f97c61",
      "role": "HISTORICAL_ORIGINAL_7218_460EE_TEST_BINDING_NOT_CURRENT_TEST_OR_ACCEPTANCE"
    }
  },
  "compositionReferenceRole": "SOURCE_BINDING_ONLY_FF55_APP_FIXTURE_NOT_FINAL_ROOT_CANDIDATE",
  "finalRootComposition": null,
  "selectionReceiptRole": "ROOT_FF55_SOURCE_CONSTRUCTION_BINDING_ONLY_NOT_ACCEPTANCE",
  "handoffRole": "ROOT_FF55_SOURCE_CONSTRUCTION_NOT_INDEPENDENT_ACCEPTANCE",
  "sourceAcceptanceAsserted": false
});
export const MC10_CONFIGURATIONS = freezeDisplayValue([
  {name:'mc10-phone320',width:320,height:844,font:16},
  {name:'mc10-phone375',width:375,height:844,font:16},
  {name:'mc10-phone390',width:390,height:844,font:16},
  {name:'mc10-phone320-200',width:320,height:844,font:32},
  {name:'mc10-phone375-200',width:375,height:844,font:32},
  {name:'mc10-phone390-200',width:390,height:844,font:32},
]);
export const MC10_PNG_CAP = 12;
export const MC10_ADMISSION_PATH = '/api/research/early-access/request-intents/admission';
export const MC10_POLICY_REVISION = 'e222864ba2bcd022bd3404ac6f2372a03bfb1d479a56b849fb4eb470080ff303';
export const MC10_CONTACT = freezeDisplayValue({ fullLegalName:'Owned Browser Synthetic',
  email:'owned-browser@example.invalid', postalAddress:{line1:'1 Synthetic Loopback Way',
    city:'Fixture',region:'TX',postalCode:'00000',countryCode:'US'}, policyRevision:MC10_POLICY_REVISION });
// Exact JSON serialization used by the real admission adapter; controls compare
// the adapter's actual wire bytes. No nonce, referral, owner or actor hint.
export const MC10_CONTACT_WIRE = JSON.stringify(MC10_CONTACT);
export const MC10_GET_PATHS = Object.freeze([
  '/api/config','/api/research/me','/api/research/early-access/session',
  '/api/research/early-access/assisted-orders/config','/api/research/policies',
  '/api/research/early-access/agreements','/api/research/early-access/request-intents/config',
  MC10_ADMISSION_PATH,'/api/research/early-access/request-intents/catalog',
]);
export function selectedDisplayContract(scenario, value = LEGACY_DISPLAY_CONTRACT) {
  requireThat(value === LEGACY_DISPLAY_CONTRACT || value === MC10_DISPLAY_CONTRACT, 'DISPLAY_CONTRACT_INVALID');
  requireThat(value === LEGACY_DISPLAY_CONTRACT || scenario === DISPLAY_SCENARIO, 'DISPLAY_CONTRACT_SCENARIO_MISMATCH');
  return value;
}
export function mc10CapturePlan() {
  return MC10_CONFIGURATIONS.flatMap(config => ['pre-intake','catalog-empty-dock','populated-dock','post-last-removal'].map(scene => ({
    configuration:config.name,scene,selected:scene==='catalog-empty-dock'
      ||scene==='pre-intake'&&['mc10-phone320','mc10-phone375-200'].includes(config.name)
      ||['populated-dock','post-last-removal'].includes(scene)&&['mc10-phone320-200','mc10-phone375-200'].includes(config.name),
    state:'NOT_RUN',scope:MC10_SCOPE,
  })));
}
/** Exact current adapter query order. No URL normalization or arbitrary search. */
export function mc10CatalogQuery(target, projectedTotal) {
  if(typeof target!=='string'||!Number.isSafeInteger(projectedTotal)||projectedTotal<1||projectedTotal>476)return null;
  const match=/^\/api\/research\/early-access\/request-intents\/catalog\?(?:search=(BPC-157|MOTS-c)&)?page=([1-9][0-9]?)&pageSize=24$/u.exec(target);
  if(!match)return null;
  const page=Number(match[2]);
  if(page>Math.ceil(projectedTotal/24))return null;
  return Object.freeze({...(match[1]?{search:match[1]}:{}),page,pageSize:24});
}
export function requireMC10UiBinding(binding = MC10_UI_BINDING) {
  requireThat(binding?.state==='ROOT_SELECTED_FROZEN_UI_SOURCE' && SHA.test(binding.source??'') && SHA.test(binding.tree??'')
    && SHA.test(binding.composedSource??'')&&SHA.test(binding.composedTree??'')
    && /^[a-f0-9]{64}$/u.test(binding.selectionReceiptSha256??'') && Array.isArray(binding.pins)&&binding.pins.length>=1,
    'MC10_UI_BINDING_UNRESOLVED');
  const names=['intake','fullLegalName','email','line1','city','region','postalCode','countryCode','confirm',
    'products','productsHeading','family','blocking','rows','rowName','rowSpecification','rowSummary','rowQualifier','nextPage','previousPage','search','add','remove','dock','dockStatus','spacer','continue','contact','back'];
  requireThat(binding.selectors && Object.keys(binding.selectors).length===names.length
    && names.every(key=>typeof binding.selectors[key]==='string'&&binding.selectors[key].length>0&&binding.selectors[key].length<=240
      &&!/[`\r\n\u0000-\u001f]/u.test(binding.selectors[key])), 'MC10_UI_SELECTOR_BINDING_INVALID');
  requireThat(binding.productsSignal==='ACTUAL_VISIBLE_PRODUCTS_BRANCH'
    &&binding.productsHeading==='Browse the catalog','MC10_CHILD_PRODUCTS_SIGNAL_UNRESOLVED');
  requireThat(binding.rowIdentity?.productId==='data-product-id'&&binding.rowIdentity?.variantId==='data-variant-id'
    &&binding.focusContract==='ACTUAL_RETURN_AND_CURRENT_NATIVE_SUCCESSOR','MC10_NATIVE_ROW_OR_FOCUS_BINDING_UNRESOLVED');
  return binding;
}
export const DISPLAY_SOURCE = Object.freeze({ source: 'b59042b2ecc84ffeb26adade1426b99ae56fb591', tree: '3262eb0d361dc167b4a0c6d83601ccd7cd5f3122', contractSha256: 'e5f1bb7d5ecc6fbaf3a2c6344a38e2e170a953d2170682d52c7960d6cd4eda74', grantSha256: 'e1f3fca0e2cde233dcb538d34ca373a0155fa4ff7b01af5b8d8a38886b250a3c', referenceRole: 'LEGACY_EIGHT_FIXTURE_VERSION_BASELINE', currentPinComposition: BROWSE_SUMMARY_PIN_COMPOSITION });
export const DISPLAY_SOURCE_PINS = freezeDisplayValue([
  {
    "path": "client/src/research/early-access/EarlyAccessRoute.tsx",
    "blob": "b191cb5759b94e061575ba1054c05d3e6cbd9eb7",
    "sha256": "63b36416a53e92eafdc45b4d3466c2aceaadb22aa750d7b3104df1e36e0ed850"
  },
  {
    "path": "client/src/research/adapters/earlyAccessAgreement.ts",
    "blob": "71e6c5dbfa7499d8db214f70166d4827f9999e06",
    "sha256": "92400b9b744ad930792249f151cc4afae731a6f2a910c225ae2165f5323a8d2a"
  },
  {
    "path": "client/src/research/early-access/catalog-admission-api.ts",
    "blob": "89132afcb264da4164ebe59207b05597f274e271",
    "sha256": "eaebc2583410f2f6734b2394fbadbee7504fdb9e79ce54b36774c495e8011bc7"
  },
  {
    "path": "client/src/research/early-access/PreCatalogContact.tsx",
    "blob": "4b143a1edbcb9ac11d438784bb3d2877a8557eb8",
    "sha256": "cb3a54655b1bc9b8f9bcbd1d48150c720c09120a659d75750bf208c9841ddc69"
  },
  {
    "path": "client/src/research/assisted-order/order-request-mode.ts",
    "blob": "280fc784bf99d6b1739babb609abb7855fa5dc16",
    "sha256": "3e99ef46ef427564a3eb07b0d6c85a21966100d7b8fbfe2280a0a75fc5279042"
  },
  {
    "path": "client/src/research/assisted-order/RequestIntentEntry.tsx",
    "blob": "832c97f1ff6e95af6200827ed2136c2f64e7ebf1",
    "sha256": "d34513aeb09c7c63dce8866f971ac1bcfd2a4bf2786c9f73d5e0da9e796d93ae"
  },
  {
    "path": "client/src/research/assisted-order/request-intent-api.ts",
    "blob": "9481b8271790851433b5851c84b93dacb56671de",
    "sha256": "1b4fdf804ce137e7bc30bdec82f06c1c8c66808a542403bc7b79f1d2ff558f82"
  },
  {
    "path": "client/src/research/assisted-order/wizard-state.ts",
    "blob": "af8f3fcdd53974eaaaf98b91c145a1f195bdcf9a",
    "sha256": "921a1a4a7e47dc69b7bb54f3a4602a3888055c7eef5178ab613b716da9538266"
  },
  {
    "path": "client/src/research/assisted-order/RequestIntentForm.tsx",
    "blob": "7d5d88b2b1320ea940663f99a5fd98b457914d96",
    "sha256": "e01ac0eee672b3d857c9d1f1d60556e1988f3ca943412c383c1ed283413f5b20",
    "mode": "100644",
    "bytes": 71357
  },
  {
    "path": "server/research/policies-data.ts",
    "blob": "640afa5b5aa65836381bb6714f1bc3f87afc5578",
    "sha256": "7b208c3f2963938e041d3a6119a2cd06e4f1c5c686c6f93eeead4f7dd257d336"
  },
  {
    "path": "shared/research/assisted-order/form.ts",
    "blob": "50dc8cdb925de3f722c9f2add9e6c220fc8d4d65",
    "sha256": "7b612ff1779558346335b9e0bece063d443a8530fafbd5420fd67942a40ee695"
  },
  {
    "path": "shared/research/early-access-quantity.ts",
    "blob": "45845cfeb7caf0691e1ae28e941c9eca411d36ef",
    "sha256": "873ace18b4b0a55ec137ae02ff0210e9980ea30dbc79e6d6d0bbc9e2fb55e7ea"
  },
  {
    "path": "shared/research/assisted-order/action-policy.ts",
    "blob": "c9943cf72d40987024d384e1a3a2f93e6e8ccd84",
    "sha256": "e4778ffd670bc8cef62458fe1be0d38ca1839fd47729b8a2e3577ccde550cb0d"
  },
  {
    "path": "shared/research/master-offerings/hcg-strength-review.ts",
    "blob": "234445db5f7ea54a0e41e2650801f0934424ea6f",
    "sha256": "a6971547039f768cf3badfe185340194a4832875749bd1b18bdccaedb81efa79"
  },
  {
    "path": "server/research/assisted-order/production-catalog.ts",
    "blob": "f56b3e65d2b7cd5bbc09e8b11be75417dc19942e",
    "sha256": "e8c93445afa37ae42fd5ce38ad3cc18044bc7c492294fc67e32c104d7246bac6"
  },
  {
    "path": "server/research/assisted-order/request-intent/catalog.ts",
    "blob": "8e728a59010a2a3d70d0ab0dc66bd61d7f88f5f8",
    "sha256": "267184109a98f9285aa0ba6f42ee45467a28cd7c44d226b9f94a775c130941ed"
  },
  {
    "path": "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
    "blob": "d0f1104e54a5a33f77eb4d34a8ce5993c8b11534",
    "sha256": "0bd76792c4114761e5c57fc16ad2ceef0f2eef363bc90bc0139f9cd6c26ca9b9"
  },
  {
    "path": "server/research/master-offerings/data/reviewed-public-media.json",
    "blob": "83d3bc79236dd18fa11610ce2d61d02dfae1e070",
    "sha256": "04e55f60d66777acfa8ab147ec14e0b48c64c40b33a523e2726790d3d17fb16e"
  },
  {
    "path": "server/research/master-offerings/data/reviewed-public-content.json",
    "blob": "69a59fd770cf98d54fc850dbd25736b56c86c47d",
    "sha256": "ad813827ec575f8c2220abdb01ff304da44c3ddbf223706d8bc41d48550e1aa5"
  },
  {
    "path": "server/research/master-offerings/data/master-offering-bindings.generated.json",
    "blob": "7760d5d8fb559c9c9c6cfc7622827fb4977b61d5",
    "sha256": "587595e68cb1b47a8ee7f55728eb65d64c2f55f36ad242080232743a9c53ae24"
  },
  {
    "path": "client/src/research/assisted-order/api.ts",
    "blob": "d9dbd2a102b0a8ea5620bfeb5d2ce7b5eda055f0",
    "sha256": "b5303be77f1108b5f5b0b042c2efb43604408984320714640a78fd75c7c62b10"
  },
  {
    "path": "client/src/research/early-access/BoundCatalogAdmission.tsx",
    "blob": "3a09e9a531c162e30da93f0e92cb44f533c07378",
    "sha256": "43eb0d56c7b75673cafe7d9e1d3f5d6949b5c2ed66410c03dd4b6ca20cd8b484"
  }
]);
export const DISPLAY_ROW_STUBS = freezeDisplayValue([
  {
    "identity": {
      "offeringId": "mo_af289f611c02b3fcef01",
      "sourceVariantId": "mov_ca3e45ae9712aee91430"
    },
    "sourceMediaPins": {
      "primarySha256": "b7ce66ec403a78e29df86758d93f2acdbb3a30fe7b968db97c0c59ffb0d7df71",
      "labelPreviewSha256": "ee0b3ebc5f216b38d8c2a2136bb9717f763e1c79ae08d334d1f33f673f33f318"
    },
    "item": {
      "productId": "92bd3921-c3c1-4568-86a5-6ef6c42b10f5",
      "variantId": "6915bc89-2311-4d42-8c5c-61195489febd",
      "productName": "BPC-157",
      "family": "research_peptides_materials",
      "channel": "Research Peptides & Materials",
      "specification": "BPC-157 10 mg",
      "format": null,
      "packBasis": null,
      "minimumQuantity": 1,
      "maximumQuantity": 100,
      "quantityIncrement": 1,
      "unitPriceCents": null,
      "currency": "USD",
      "workflowMode": "request_pricing",
      "actionLabel": "Add to quote cart",
      "accessNotice": null,
      "researchUseOnly": true,
      "catalogVersion": "PREMIUM-SYNTHETIC-DISPLAY-ONLY-V1",
      "priceVersion": null,
      "sourceSelection": {
        "family": "research_peptides_materials",
        "slug": "research-peptides-materials-bpc-157-bpc-157-10-mg",
        "variantId": "mov_ca3e45ae9712aee91430"
      },
      "selectableForReview": true,
      "intentExclusion": null,
      "clinicalReviewRequired": false,
      "sourceDisplayState": "request_access",
      "sourceVariantDisplayState": "request_access",
      "sourceRefusal": null
    }
  },
  {
    "identity": {
      "offeringId": "mo_b33c802f4f7735fe986d",
      "sourceVariantId": "mov_5d10608450270b22967f"
    },
    "sourceMediaPins": {
      "primarySha256": "5947874079270bd33fbffe19a973cc7a22e6997d08f6cdafa4aea96335d300cc",
      "labelPreviewSha256": "93071f3eafe85940c87f83b6747a984d4eacedbe3ce2054773a0283efe9ed8d8"
    },
    "item": {
      "productId": "92070192-32cf-4dd7-b549-b6d03cf2354e",
      "variantId": "0bbe7505-e818-4f6a-b7db-485bcc6394f8",
      "productName": "TB-500",
      "family": "research_peptides_materials",
      "channel": "Research Peptides & Materials",
      "specification": "TB-500 10 mg",
      "format": null,
      "packBasis": null,
      "minimumQuantity": 1,
      "maximumQuantity": 100,
      "quantityIncrement": 1,
      "unitPriceCents": null,
      "currency": "USD",
      "workflowMode": "request_pricing",
      "actionLabel": "Add to quote cart",
      "accessNotice": null,
      "researchUseOnly": true,
      "catalogVersion": "PREMIUM-SYNTHETIC-DISPLAY-ONLY-V1",
      "priceVersion": null,
      "sourceSelection": {
        "family": "research_peptides_materials",
        "slug": "research-peptides-materials-tb-500-tb-500-10-mg",
        "variantId": "mov_5d10608450270b22967f"
      },
      "selectableForReview": true,
      "intentExclusion": null,
      "clinicalReviewRequired": false,
      "sourceDisplayState": "request_access",
      "sourceVariantDisplayState": "request_access",
      "sourceRefusal": null
    }
  },
  {
    "identity": {
      "offeringId": "mo_33b6b3e982b2dc5113bb",
      "sourceVariantId": "mov_72b54c1f1e71b4229c2a"
    },
    "sourceMediaPins": {
      "primarySha256": "240b3946080dfcf458d5194c7bf5e21347e0af9a80bed7e7930f9eef634a46c4",
      "labelPreviewSha256": "1e43fddc0b03f951849ea84eee14e903e80d251f053017ca5324960d096f2f6e"
    },
    "item": {
      "productId": "1f2bbd9c-d1c5-44ca-98e3-129b3fa36446",
      "variantId": "d1ffeb84-cfd2-4115-a5aa-e4fab5195e70",
      "productName": "MOTS-C",
      "family": "research_peptides_materials",
      "channel": "Research Peptides & Materials",
      "specification": "MOTS-C 10 mg",
      "format": null,
      "packBasis": null,
      "minimumQuantity": 1,
      "maximumQuantity": 100,
      "quantityIncrement": 1,
      "unitPriceCents": null,
      "currency": "USD",
      "workflowMode": "request_pricing",
      "actionLabel": "Add to quote cart",
      "accessNotice": null,
      "researchUseOnly": true,
      "catalogVersion": "PREMIUM-SYNTHETIC-DISPLAY-ONLY-V1",
      "priceVersion": null,
      "sourceSelection": {
        "family": "research_peptides_materials",
        "slug": "research-peptides-materials-mots-c-mots-c-10-mg",
        "variantId": "mov_72b54c1f1e71b4229c2a"
      },
      "selectableForReview": true,
      "intentExclusion": null,
      "clinicalReviewRequired": false,
      "sourceDisplayState": "request_access",
      "sourceVariantDisplayState": "request_access",
      "sourceRefusal": null
    }
  },
  {
    "identity": {
      "offeringId": "mo_36fbcc90a698a8e7ada6",
      "sourceVariantId": "mov_3ff3d97173e8a1f7645b"
    },
    "sourceMediaPins": {
      "primarySha256": "117360fe32b0db2615f9f4ccc6ee771dd3c93534e7715df0fbd5ba38c429f80b",
      "labelPreviewSha256": "ed2c5fc646d414e3e42e50188cbcadcf7aabebc8e8d27ac9e2b87a232f79e326"
    },
    "item": {
      "productId": "f207461b-7317-4bd5-8c73-cbbf68a67cdd",
      "variantId": "a02563a4-9645-4883-a30e-ca19ba344af2",
      "productName": "Semaglutide",
      "family": "research_peptides_materials",
      "channel": "Research Peptides & Materials",
      "specification": "SEMAGLUTIDE 5 mg",
      "format": null,
      "packBasis": null,
      "minimumQuantity": 1,
      "maximumQuantity": 100,
      "quantityIncrement": 1,
      "unitPriceCents": null,
      "currency": "USD",
      "workflowMode": "request_pricing",
      "actionLabel": "Add to quote cart",
      "accessNotice": null,
      "researchUseOnly": true,
      "catalogVersion": "PREMIUM-SYNTHETIC-DISPLAY-ONLY-V1",
      "priceVersion": null,
      "sourceSelection": {
        "family": "research_peptides_materials",
        "slug": "research-peptides-materials-semaglutide-semaglutide-5-mg",
        "variantId": "mov_3ff3d97173e8a1f7645b"
      },
      "selectableForReview": true,
      "intentExclusion": null,
      "clinicalReviewRequired": false,
      "sourceDisplayState": "request_access",
      "sourceVariantDisplayState": "request_access",
      "sourceRefusal": null
    }
  },
  {
    "identity": {
      "offeringId": "mo_226c15232adfd35b3288",
      "sourceVariantId": "mov_8615d2aea357b8241ba3"
    },
    "sourceMediaPins": {
      "primarySha256": "c4b4294168090f2126a2e447947a8cee4805ddfe50c2c18cf3842432f77a35de",
      "labelPreviewSha256": "6eadc9b7ef4c805d2a0763ff5ab396d4c89c83f43ca796c9f2bfa02a7ca48a1f"
    },
    "item": {
      "productId": "8cdacd81-e1ad-4ffb-921b-acd985d99e73",
      "variantId": "e59490fb-8d65-409f-a931-a1505057ca97",
      "productName": "Tirzepatide",
      "family": "research_peptides_materials",
      "channel": "Research Peptides & Materials",
      "specification": "TIRZEPATIDE 5 mg",
      "format": null,
      "packBasis": null,
      "minimumQuantity": 1,
      "maximumQuantity": 100,
      "quantityIncrement": 1,
      "unitPriceCents": null,
      "currency": "USD",
      "workflowMode": "request_pricing",
      "actionLabel": "Add to quote cart",
      "accessNotice": null,
      "researchUseOnly": true,
      "catalogVersion": "PREMIUM-SYNTHETIC-DISPLAY-ONLY-V1",
      "priceVersion": null,
      "sourceSelection": {
        "family": "research_peptides_materials",
        "slug": "research-peptides-materials-tirzepatide-tirzepatide-5-mg",
        "variantId": "mov_8615d2aea357b8241ba3"
      },
      "selectableForReview": true,
      "intentExclusion": null,
      "clinicalReviewRequired": false,
      "sourceDisplayState": "request_access",
      "sourceVariantDisplayState": "request_access",
      "sourceRefusal": null
    }
  },
  {
    "identity": {
      "offeringId": "mo_28408f253a09df4cc6d8",
      "sourceVariantId": "mov_82974ab2f9c652c2cb12"
    },
    "sourceMediaPins": {
      "primarySha256": "60bfb3e532d56ffb17c1c4c9ce3a334ce987720a57f226aea3e51cd5542dd4e2"
    },
    "item": {
      "productId": "c93265b7-86c9-406f-9e95-35353f8ca46e",
      "variantId": "8bd00b5d-d7f7-4518-a29b-5b629a5debba",
      "productName": "Anastrozole",
      "family": "clinical_formulations_503a",
      "channel": "503A Clinical Formulations",
      "specification": "ANASTROZOLE 0.25MG CAPSULE",
      "format": null,
      "packBasis": null,
      "minimumQuantity": 1,
      "maximumQuantity": 100,
      "quantityIncrement": 1,
      "unitPriceCents": null,
      "currency": "USD",
      "workflowMode": "provider_request",
      "actionLabel": "Add to quote cart",
      "accessNotice": null,
      "researchUseOnly": false,
      "catalogVersion": "PREMIUM-SYNTHETIC-DISPLAY-ONLY-V1",
      "priceVersion": null,
      "sourceSelection": {
        "family": "clinical_formulations_503a",
        "slug": "clinical-formulations-503a-anastrozole-anastrozole-0-25mg-capsule",
        "variantId": "mov_82974ab2f9c652c2cb12"
      },
      "selectableForReview": true,
      "intentExclusion": null,
      "clinicalReviewRequired": true,
      "sourceDisplayState": "care_pathway",
      "sourceVariantDisplayState": "care_pathway",
      "sourceRefusal": "provider_pathway_family"
    }
  },
  {
    "identity": {
      "offeringId": "mo_2c3aec78638c9e2ff2a8",
      "sourceVariantId": "mov_13073979f2da65f4e160"
    },
    "sourceMediaPins": null,
    "item": {
      "productId": "4dfa7bae-31df-4ceb-b65e-47445ba11afc",
      "variantId": "d59ee344-a5b5-43cf-9b35-e99eda40c60d",
      "productName": "HCG",
      "family": "research_peptides_materials",
      "channel": "Research Peptides & Materials",
      "specification": "HCG strength unverified and formulation pending",
      "format": null,
      "packBasis": null,
      "minimumQuantity": 1,
      "maximumQuantity": 100,
      "quantityIncrement": 1,
      "unitPriceCents": null,
      "currency": "USD",
      "workflowMode": "availability_review",
      "actionLabel": "Details under review",
      "accessNotice": "Strength and formulation are being verified. You can add this listing to a quote request; the team confirms the details before quoting.",
      "researchUseOnly": true,
      "catalogVersion": "PREMIUM-SYNTHETIC-DISPLAY-ONLY-V1",
      "priceVersion": null,
      "sourceSelection": {
        "family": "research_peptides_materials",
        "slug": "research-peptides-materials-hcg-strength-under-review",
        "variantId": "mov_13073979f2da65f4e160"
      },
      "selectableForReview": true,
      "intentExclusion": "specification_review",
      "clinicalReviewRequired": false,
      "sourceDisplayState": "approval_required",
      "sourceVariantDisplayState": "approval_required",
      "sourceRefusal": "formulation_hold",
      "reviewMessage": "Strength and formulation are being verified. You can add this listing to a quote request; the team confirms the details before quoting."
    }
  },
  {
    "identity": {
      "offeringId": "mo_003b0c272099eeb1f114",
      "sourceVariantId": "mov_9b65ad5bb184691e19e0"
    },
    "sourceMediaPins": null,
    "item": {
      "productId": "unbound:mo_003b0c272099eeb1f114",
      "variantId": "unbound:mov_9b65ad5bb184691e19e0",
      "productName": "FedEx Standard Overnight",
      "family": "shipping_and_fulfillment",
      "channel": "Shipping & Fulfillment",
      "specification": "FedEx Standard Overnight",
      "format": null,
      "packBasis": null,
      "minimumQuantity": 1,
      "maximumQuantity": 100,
      "quantityIncrement": 1,
      "unitPriceCents": null,
      "currency": "USD",
      "workflowMode": "availability_review",
      "actionLabel": "Not a product request",
      "accessNotice": null,
      "researchUseOnly": false,
      "catalogVersion": "PREMIUM-SYNTHETIC-DISPLAY-ONLY-V1",
      "priceVersion": null,
      "sourceSelection": {
        "family": "shipping_and_fulfillment",
        "slug": "shipping-and-fulfillment-fedex-standard-overnight-fedex-standard-overnight",
        "variantId": "mov_9b65ad5bb184691e19e0"
      },
      "selectableForReview": false,
      "intentExclusion": "non_merchandise",
      "clinicalReviewRequired": false,
      "sourceDisplayState": "care_pathway",
      "sourceVariantDisplayState": "care_pathway",
      "sourceRefusal": "non_merchandise_family"
    }
  }
]);

export const PUBLIC_SCENARIO = "public-three-route";
export const PREMIUM_ENTRY_SCENARIO = "premium-entry-unavailable";
export const PREMIUM_ENTRY_ROUTE = "/earlyaccess";
export const PREMIUM_ENTRY_EXPECTED = Object.freeze({
  heading: "Explore the Xenios peptide catalog.",
  primary: "Explore products", secondary: "Book the team",
  unavailable: "Request intake is not available in this environment.",
});
export const PREMIUM_UI_REFERENCE = Object.freeze({
  source: "ff55ffa004bc3aca5ff08033bde17c048511fbe5", tree: "0042391bd456da838b5e6b774aa2982dbec0f3a7",
  sourceRole: "SOURCE_BINDING_ONLY_FF55_APP_FIXTURE_NOT_FINAL_ROOT_CANDIDATE",
  handoffSha256: "4552c806c9daf2ec0138a5980419b15ed62a5ecfe260fba64cd3e41809960bc7", composedReference: "ff55ffa004bc3aca5ff08033bde17c048511fbe5", composedReferenceTree: "0042391bd456da838b5e6b774aa2982dbec0f3a7",
  handoffRole: "ROOT_FF55_SOURCE_CONSTRUCTION_NOT_INDEPENDENT_ACCEPTANCE", sourceAcceptanceAsserted: false,
  finalRootComposition: null,
  reviewedAppFocusCompanion: REVIEWED_APP_FOCUS_COMPANION,
  historicalPriorSelectedReference: Object.freeze({
    source: "fc9e53ca416257aed6caf4e9f782f0150278b5de", tree: "605281bc21d958d90251b69ffb3bf7501c14f33c",
    handoffSha256: "9befd77234aaef2334c774816015e6f8614ccc649ff0ced8b6dff6ef645716f8",
    composedReference: "fc9e53ca416257aed6caf4e9f782f0150278b5de",
    composedReferenceTree: "605281bc21d958d90251b69ffb3bf7501c14f33c"
  }),
  historicalReference: Object.freeze({
    source: "b59042b2ecc84ffeb26adade1426b99ae56fb591", tree: "3262eb0d361dc167b4a0c6d83601ccd7cd5f3122",
    handoffSha256: "89ee091824a33fc9ae5543905224bd4f963de6621fbcc5553397daf7ff58ebe5",
    composedReference: "b59042b2ecc84ffeb26adade1426b99ae56fb591",
    composedReferenceTree: "3262eb0d361dc167b4a0c6d83601ccd7cd5f3122"
  }),
  semanticBlobs: Object.freeze({
  "client/src/research/early-access/EarlyAccessRoute.tsx": "b191cb5759b94e061575ba1054c05d3e6cbd9eb7",
  "client/src/research/early-access/EarlyAccessContactLinks.tsx": "070287f1a47f4b0fd6e16bcd5953a9aaae725815",
  "client/src/research/early-access/early-access-contacts.ts": "bf74c2b0751bb1ef591ccced942c7eea4d7bd211",
  "client/src/research/early-access/premium-early-access.css": "584b0e49b5eafb3dfb3aa6988b45f2cc22e94ea7",
  "client/src/research/early-access/request-experience-copy.ts": "60dae044cb0d615dcc2f79835db434c78e23a03d",
  "server/research/master-offerings/data/reviewed-public-media.json": "83d3bc79236dd18fa11610ce2d61d02dfae1e070"
})
});
/** Runtime-required application refs are checked before any Git interpolation. */
export function requirePremiumRuntimeReferences(reference = PREMIUM_UI_REFERENCE) {
  requireThat(reference && ['source','tree','composedReference','composedReferenceTree']
    .every(key => typeof reference[key] === 'string' && SHA.test(reference[key])),
    'PREMIUM_UI_RUNTIME_REFERENCE_UNRESOLVED');
  return reference;
}
export const PREMIUM_ARTWORK = Object.freeze({
  offeringId: "mo_af289f611c02b3fcef01", variantId: "mov_ca3e45ae9712aee91430",
  path: "/research/product-media/bpc-157-xenios-10mg-render.webp",
  sha256: "b7ce66ec403a78e29df86758d93f2acdbb3a30fe7b968db97c0c59ffb0d7df71",
  alt: "Xenios BPC-157 10 mg packaging design",
});
const PREMIUM_MEDIA_PATHS = Object.freeze([PREMIUM_ARTWORK.path,
  "/research/product-media/vial.svg", "/research/product-media/unknown.svg"]);
export const PREMIUM_CONTACT_HREFS = Object.freeze([
  "https://xeniostechnology.com", "https://xeniostechnology.com/earlyaccess",
  "https://calendly.com/team-xeniostechnology/30min", "mailto:team@xeniostechnology.com",
  "https://www.instagram.com/officialxenios/", "https://x.com/xenioshealth",
  "https://www.linkedin.com/company/officialxenios", "https://www.facebook.com/people/Xenios/61590788618749/",
  "tel:+17374186381", "mailto:samuel@xeniostechnology.com", "tel:+19704153774", "mailto:seth@xeniostechnology.com",
]);
export const PREMIUM_ENTRY_GET_FIXTURES = Object.freeze({
  "/api/config": READ_ONLY_GET_FIXTURES["/api/config"],
  "/api/research/me": READ_ONLY_GET_FIXTURES["/api/research/me"],
  "/api/research/early-access/session": Object.freeze({ status: 404, body: Object.freeze({
    ok: false, message: "API not available in this isolated preview.",
  }) }),
  "/api/research/early-access/assisted-orders/config": Object.freeze({ status: 503,
    body: Object.freeze({ enabled: false }) }),
});
export const PREMIUM_ENTRY_CONFIGURATIONS = Object.freeze([
  Object.freeze({ name: "phone320", width: 320, height: 844, font: 16 }),
  Object.freeze({ name: "phone375", width: 375, height: 844, font: 16 }),
  Object.freeze({ name: "phone390", width: 390, height: 844, font: 16 }),
  Object.freeze({ name: "tablet768", width: 768, height: 1024, font: 16 }),
  Object.freeze({ name: "desktop1440", width: 1440, height: 900, font: 16 }),
  Object.freeze({ name: "phone320-200", width: 320, height: 844, font: 32 }),
]);
export const DISPLAY_CONFIGURATIONS = Object.freeze([
  { name: "display-desktop1440", width: 1440, height: 900, font: 16 },
  { name: "display-tablet768", width: 768, height: 1024, font: 16 },
  { name: "display-phone375", width: 375, height: 812, font: 16 },
  { name: "display-phone320", width: 320, height: 812, font: 16 },
  { name: "display-phone375-200", width: 375, height: 812, font: 32 },
  { name: "display-phone320-200", width: 320, height: 812, font: 32 },
].map((config) => Object.freeze(config)));
export const DISPLAY_PNG_CAP = 13;
export const DISPLAY_CATALOG_PATH = "/api/research/early-access/request-intents/catalog";
export const DISPLAY_UNMATCHED_SEARCH = "__xenios_display_unmatched__";
export const DISPLAY_GET_PATHS = Object.freeze([
  "/api/config", "/api/research/me", "/api/research/early-access/session",
  "/api/research/early-access/assisted-orders/config", "/api/research/policies",
  "/api/research/early-access/agreements", "/api/research/early-access/request-intents/config",
  "/api/research/early-access/request-intents/admission", DISPLAY_CATALOG_PATH,
]);
const DISPLAY_FIXTURE_KEYS = Object.freeze(Object.fromEntries(DISPLAY_GET_PATHS.slice(0, -1).map((path) => [path, { status: path.endsWith("assisted-orders/config") ? 503 : 200 }])));
const DISPLAY_FAMILIES = Object.freeze(["research_peptides_materials", "clinical_formulations_503a", "shipping_and_fulfillment"]);
const DISPLAY_SEARCHES = Object.freeze(["bpc-157", "tb-500", "mots-c", "semaglutide", "tirzepatide", DISPLAY_UNMATCHED_SEARCH]);
export const DISPLAY_MEDIA_PINS = Object.freeze(DISPLAY_ROW_STUBS.flatMap((row) => {
  if (!row.sourceMediaPins) return [];
  const paths = {
    "BPC-157": ["bpc-157-xenios-10mg-render.webp", "bpc-157-xenios-10mg-front-label.webp"],
    "TB-500": ["tb-500-10mg-website-render-v1-1024.webp", "tb-500-10mg-front-artwork-v1.webp"],
    "MOTS-C": ["mots-c-10mg-website-render-v1-1024.webp", "mots-c-10mg-front-artwork-v1.webp"],
    Semaglutide: ["semaglutide-5mg-website-render-v1-1024.webp", "semaglutide-5mg-front-artwork-v1.webp"],
    Tirzepatide: ["tirzepatide-5mg-website-render-v1-1024.webp", "tirzepatide-5mg-front-artwork-v1.webp"],
    Anastrozole: ["studio-proposed-carton-mov_82974ab2f9c652c2cb12.webp"],
  }[row.item.productName];
  return paths.map((name, i) => ({ path: "/research/product-media/" + name,
    sha256: i ? row.sourceMediaPins.labelPreviewSha256 : row.sourceMediaPins.primarySha256 }));
}));

export function displayCatalogQuery(target) {
  if (typeof target !== "string" || target.length > 512 || /[\\#\s\u0000-\u001f]/u.test(target)) return null;
  const parts = target.split("?");
  if (parts.length !== 2 || parts[0] !== DISPLAY_CATALOG_PATH || !parts[1]) return null;
  const params = new URLSearchParams(parts[1]), keys = [...params.keys()];
  if (params.toString() !== parts[1] || new Set(keys).size !== keys.length
    || keys.some((key) => !["page", "pageSize", "search", "family"].includes(key))
    || params.get("page") !== "1" || params.get("pageSize") !== "24") return null;
  const search = params.get("search") ?? "", family = params.get("family") ?? "";
  if (search.length > 120 || search && !DISPLAY_SEARCHES.includes(search.toLowerCase())
    || family && !DISPLAY_FAMILIES.includes(family)) return null;
  const normalized = search.toLowerCase();
  // Only the explicit unmatched sentinel may produce a successful empty page.
  if (normalized && normalized !== DISPLAY_UNMATCHED_SEARCH && !DISPLAY_ROW_STUBS.some((row) =>
    row.item.productName.toLowerCase() === normalized && (!family || row.item.family === family))) return null;
  return { page: 1, pageSize: 24, search: normalized, family };
}

export function displayCatalogPage(query, items) {
  requireThat(query && query.page === 1 && query.pageSize === 24 && typeof query.search === "string"
    && (!query.search || DISPLAY_SEARCHES.includes(query.search)) && typeof query.family === "string"
    && (!query.family || DISPLAY_FAMILIES.includes(query.family)), "DISPLAY_QUERY_INVALID");
  requireThat(Array.isArray(items) && items.length === 8 && items.every((item) => item.unitPriceCents === null && item.priceVersion === null)
    && DISPLAY_ROW_STUBS.every((stub) => items.filter((item) => item.productId === stub.item.productId && item.variantId === stub.item.variantId
      && item.sourceSelection?.variantId === stub.identity.sourceVariantId).length === 1), "DISPLAY_ITEMS_INVALID");
  const filtered = items.filter((item) => (!query.family || item.family === query.family)
    && (!query.search || item.productName.toLowerCase() === query.search));
  requireThat(filtered.length > 0 || query.search === DISPLAY_UNMATCHED_SEARCH, "DISPLAY_EMPTY_NOT_AUTHORIZED");
  return { items: filtered, total: filtered.length, page: 1, pageSize: 24,
    families: [...DISPLAY_FAMILIES], channels: [], workflowModes: [...new Set(items.map((item) => item.workflowMode))] };
}

/** Real source identity/content joins, with only explicitly synthetic workflow/no-price fields. */
export function sourceDerivedDisplayRows({ catalog, bindings, media, content, hcg }) {
  requireThat(Array.isArray(catalog?.products) && Array.isArray(bindings?.bindings)
    && Array.isArray(media?.records) && Array.isArray(content?.records), "DISPLAY_SOURCE_DATA_INVALID");
  const one = (rows, predicate) => { const matches = rows.filter(predicate); requireThat(matches.length === 1, "DISPLAY_CANONICAL_JOIN_INVALID"); return matches[0]; };
  const items = DISPLAY_ROW_STUBS.map((stub) => {
    const { offeringId, sourceVariantId } = stub.identity, item = structuredClone(stub.item);
    item.catalogVersion = `PREMIUM-SYNTHETIC-DISPLAY-ONLY-${DISPLAY_SOURCE.source.slice(0, 8)}`;
    const product = one(catalog.products, (p) => p.id === offeringId), variant = one(product.variants, (v) => v.id === sourceVariantId);
    requireThat(product.displayName === item.productName && product.family === item.family
      && product.displayState === item.sourceDisplayState && variant.displayState === item.sourceVariantDisplayState,
    "DISPLAY_CANONICAL_IDENTITY_CHANGED");
    if (item.productName === "HCG") {
      requireThat(hcg?.variantId === sourceVariantId && item.specification === hcg.specification
        && item.sourceSelection.slug === hcg.slug && item.accessNotice === hcg.notice && item.reviewMessage === hcg.notice
        && item.selectableForReview === true && item.intentExclusion === "specification_review"
        && item.sourceRefusal === "formulation_hold", "DISPLAY_HCG_HOLD_CHANGED");
    } else requireThat(product.slug === item.sourceSelection.slug && variant.label === item.specification, "DISPLAY_SPECIFICATION_CHANGED");
    const bound = bindings.bindings.filter((b) => b.offeringId === offeringId && b.offeringVariantId === sourceVariantId);
    if (item.productName === "FedEx Standard Overnight") {
      requireThat(bound.length === 0 && item.productId === `unbound:${offeringId}` && item.variantId === `unbound:${sourceVariantId}`
        && item.selectableForReview === false && item.intentExclusion === "non_merchandise", "DISPLAY_NON_MERCHANDISE_CHANGED");
    } else requireThat(bound.length === 1 && bound[0].productId === item.productId && bound[0].variantId === item.variantId,
      "DISPLAY_BINDING_CHANGED");
    requireThat(item.unitPriceCents === null && item.priceVersion === null, "DISPLAY_PRICE_NOT_NULL");
    if (stub.sourceMediaPins) {
      const record = one(media.records, (m) => m.offeringId === offeringId && m.sourceVariantId === sourceVariantId);
      requireThat(record.primarySha256 === stub.sourceMediaPins.primarySha256
        && record.labelPreviewSha256 === stub.sourceMediaPins.labelPreviewSha256, "DISPLAY_MEDIA_IDENTITY_CHANGED");
      requireThat(DISPLAY_MEDIA_PINS.some((pin) => pin.path === record.media?.primary?.href && pin.sha256 === record.primarySha256)
        && (!record.media?.labelPreview || DISPLAY_MEDIA_PINS.some((pin) => pin.path === record.media.labelPreview.href && pin.sha256 === record.labelPreviewSha256)),
      "DISPLAY_MEDIA_PATH_CHANGED");
      item.reviewedMedia = structuredClone(record.media);
    }
    if (item.productName !== "HCG") item.reviewedContent = structuredClone(one(content.records,
      (c) => c.offeringId === offeringId && c.sourceVariantId === sourceVariantId).content);
    return item;
  });
  return freezeDisplayValue(items);
}

function freezeDisplayValue(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDisplayValue(child);
    Object.freeze(value);
  }
  return value;
}
const PREMIUM_ENTRY_SOURCES = Object.freeze([
  "client/src/research/early-access/EarlyAccessRoute.tsx",
  "client/src/research/early-access/request-experience-copy.ts",
  "client/src/research/assisted-order/OrderRequestEntry.tsx",
  "client/src/research/assisted-order/AssistedOrderCta.tsx",
  "client/src/research/assisted-order/api.ts",
  "client/src/research/assisted-order/RequestIntentEntry.tsx",
  "client/src/research/early-access/catalog-admission-api.ts",
  "client/src/research/assisted-order/RequestIntentForm.tsx",
  "client/src/research/assisted-order/RequestIntentReceipt.tsx",
  "client/src/research/assisted-order/assisted-order.css",
  "client/src/research/early-access/EarlyAccessContactLinks.tsx",
  "client/src/research/early-access/EarlyAccessContactLinks.test.tsx",
  "client/src/research/early-access/early-access-contacts.ts",
  "client/src/research/early-access/premium-early-access.css",
  "client/src/research/early-access/premium-early-access.test.tsx",
  "client/src/research/product-media/ProductMedia.tsx",
  "client/src/research/product-media/product-media-format.generated.json",
  "client/src/research/product-media/reviewed-form-holds.ts",
  "server/research/master-offerings/data/reviewed-public-media.json",
  ...PREMIUM_MEDIA_PATHS.map((path) => "client/public" + path),
]);

export const PARTNER_UI_REFERENCE = Object.freeze({
  "tree": "32ced413a106a4f7ca01c7867117457ee41e30dd",
  "handoffSha256": "03e889d0f1aa6c1721c1ecd3fc55bd4739d9a3fee9bb0b52b1c8651bc92bf6e9",
  "rootWorkflowSha256": "efa0601a40a4d4551ac0c83c8934d236495535fa53c7d92b4fc23dceb8658bb5",
  "source": "0f342e0a0a792093a52eac26cee8f53a9d6e376e",
  "contractSha256": "f4768dd309e0bd8a524069a2bc816c38191b6e056dee6f79e334007db9afd763"
});
export const PARTNER_SOURCE_PINS = Object.freeze([
  {
    "sha256": "a714d16c0f63a17debfbca1cc33e225aaf018e674c3a1cf4fe26664a6f6f1c53",
    "path": "client/src/research/pages/partners/Links.tsx",
    "blob": "0137b0299145b771e58d013020c9e04f39825ebf",
    "bytes": 37683
  },
  {
    "sha256": "a7e8da7ff84f4379cfa9c71ff21fe4679b4e350013dbcc210807bb30ae80d579",
    "path": "client/src/research/pages/partners/Dashboard.tsx",
    "blob": "1bf73b7875c64d4332d566286cbf3771679f7821",
    "bytes": 16923
  },
  {
    "sha256": "aa5572b6a7450cc7883fc9c37bd720aa78bf507409e293a62f11f32e686ddddc",
    "path": "client/src/research/core.tsx",
    "blob": "482257aec506273be3f882ac2bf530576b61cd59",
    "bytes": 25602
  },
  {
    "sha256": "21d11dda1f10ee0158904665415478e6f8e7ae98145528e12ec33475f862cfd1",
    "path": "client/src/research/gallery.tsx",
    "blob": "dd0b3b2cf004e32ca723ce53dc00e6ccba1ab58f",
    "bytes": 11273
  },
  {
    "sha256": "f40c60f68e0db39a7d81a689e35204240de8cf6ce8bafe1c2e28aa8cd3063e40",
    "path": "client/src/research/lib/fixtures.ts",
    "blob": "864cb98b3a7b3fb296004edfd17be84aac4de6a4",
    "bytes": 1023
  },
  {
    "sha256": "690035eb59e476d73fce0c1f7415178aad091f0a61cfe34ff0a3e8ef3c719209",
    "path": "client/src/research/layout.tsx",
    "blob": "7d3b769a16c43374ca4134ef60aeb938757879a9",
    "bytes": 19521
  },
  {
    "sha256": "c0439eaa45c4f8f055a0a3f84b070604cb3448140727eff1166ceabbcce815d9",
    "path": "client/src/research/lib/routes.ts",
    "blob": "23ad1ec69be2053f4a1993ce80e0f357c134b43e",
    "bytes": 9428
  },
  {
    "sha256": "eb087157013f2e99906ec8be268cee157d7b43dea86ec998d9f101aa5a069d96",
    "path": "client/src/research/lib/api.ts",
    "blob": "bcf1d6d6af8d7fb6be9ef13c9502ac42be5adfdf",
    "bytes": 7074
  },
  {
    "sha256": "ae2176f7c675694515ee513544be937223297075957eac03fbd94e0c69dfe2ab",
    "path": "client/src/research/adapters/partner.ts",
    "blob": "aabb34e686f6996c6c9ad85814cb1b12f7a2d5bc",
    "bytes": 14283
  },
  {
    "sha256": "cfe715e3cbb2b2c5a5281ab358f35dfbd47fa6865e590594899cb7010067c642",
    "path": "client/src/research/pages/partners/shared.ts",
    "blob": "989f58e7025a39d5780327adc0c7224e0cadd326",
    "bytes": 5895
  },
  {
    "sha256": "01c19d246199c24ea3df4a9c511b4b985422ca1389ea381590c0e0f0c0914527",
    "path": "client/src/research/recommendation/api.ts",
    "blob": "1e86b22e17839055856dd4a35a3f8dec27071097",
    "bytes": 12869
  },
  {
    "sha256": "6b48235ea6276f000bfa272d33e2f1c72f86fd51b7eedc3fb0092d959f1d7685",
    "path": "client/src/research/recommendation/DashboardShareCard.tsx",
    "blob": "08330e34a7f9c25d0e3e889f6a2b24413e0ce378",
    "bytes": 10067
  },
  {
    "sha256": "a0157cd6128805ae471085fbe1bf5d421a7567b70e1e594daa2a161e1b1f8db2",
    "path": "client/src/research/recommendation/share.ts",
    "blob": "443f68eb1cc45fccd21f31ec01a6d2f8125a60ac",
    "bytes": 2198
  },
  {
    "sha256": "dc8bc69da69327899c479bf1803e1ac0646db236229ea3f430bbbfb558966432",
    "path": "client/src/research/recommendation/qr-export.ts",
    "blob": "8fae6b1c3bfe58831e0f7b9d00923cb6144f0b66",
    "bytes": 2665
  },
  {
    "sha256": "f43a5631b6f264e9fe0d6f1ba2fd58249ff14b41f945e28709631bf8c09f9fd0",
    "path": "client/src/research/ui/kit.tsx",
    "blob": "f8455be8d92fe72d074f21abb6a62f2d886fb4e0",
    "bytes": 24289
  },
  {
    "sha256": "1bac0d432b4f18ab9f8c98ab9e8ff557d2111ed6898e1d3195d94debdb62afb7",
    "path": "shared/research/commerce-api.ts",
    "blob": "9bae694d9d30983de94a33e1ebb4f5dbd4eb462f",
    "bytes": 19742
  },
  {
    "sha256": "7c9d6fa0a7091db16f0acd5b179e2fd67f8a011c96f15f5369f6268793a0711b",
    "path": "shared/research/referral-v1.ts",
    "blob": "3737744b5399e600fd5d779310564a01316e9630",
    "bytes": 6714
  },
  {
    "sha256": "bb6f15e5b960c26bd3f1fc6f81977e9cf6409a19805d904769994f3b8e6b09e2",
    "path": "client/src/research/partner-gallery-fixtures.tsx",
    "blob": "205740d3aef0a34b234cf44247a490a001b70e16",
    "bytes": 21149
  },
  {
    "sha256": "51ecbe3bb25f9fdc20bdbca9aaef3974f7b9f8aee980136340e630503f115641",
    "path": "client/src/research/partner-gallery-fixtures.test.tsx",
    "blob": "a255cf8efea59d268f766210fda61d7425870bb3",
    "bytes": 26256
  },
  {
    "sha256": "61dfaf847f4f135060cac1e3bb18856f6ac9881f71eeb318ba91b222cfee148e",
    "path": "client/src/research/cart-session.ts",
    "blob": "1f5013dc6ea983bb14eefb2a305b72c0b65813e5",
    "bytes": 3841
  },
  {
    "sha256": "8ee3abbbcaf3fc0b922a067fff9c963401c449eaf17e19d2360d9c2617ec3162",
    "path": "client/src/main.tsx",
    "blob": "45d82ce59b4fe7e56123a06a6d8716c909d601a1",
    "bytes": 641
  },
  {
    "sha256": "526b3410937862010a5ae2d1190c8dd32537a25cbe34d26a05bd8890f07d9de5",
    "path": "client/src/research/section.tsx",
    "blob": "9964e47ae454412e81462ab95a81fd062910aec9",
    "bytes": 32177
  },
  {
    "sha256": "f6c34b55307b649ebdf124e41856c04fba2094c81502f5a9cbec8dcfa4b18e9d",
    "path": "client/src/research/recommendation/qr-png.ts",
    "blob": "64ea7d73a6eed6a6bdd9d40388b4c9acdc074182",
    "bytes": 2798
  },
  {
    "sha256": "af5c60f4aba868617ad42955cf56235aa124019600693f39567bf5f165ecfe5c",
    "path": "client/src/research/full-platform/transport.ts",
    "blob": "76348984af2a361d59870520c39933294224751d",
    "bytes": 3000
  }
,
{
    "path": "client/src/lib/attribution.ts",
    "sha256": "2c406d8ae4f93cc480e4811dd1d2c3930651a5d4ea7b6ad10f27dd02e45e29a8",
    "blob": "2897926ea13e8d1207730ecbda12fd6209ad5445",
    "bytes": 6871
  },
  {
    "path": "client/src/lib/tracking.ts",
    "sha256": "258eda2246cb6be9b7925e1895679b0dbbc7eeb1ccf38f147989496014518ad4",
    "blob": "dc02e9d97ef8d102d0d4265868c9057e76de170a",
    "bytes": 6807
  },
  {
    "path": "client/src/research/ui/shells.tsx",
    "sha256": "ba6763f95d692881558e52efd3610f37f6305cf48764a053f9be6f318b04d18d",
    "blob": "18b80985c0707735f15fa31bb095ffc4e8491cbc",
    "bytes": 14346
  }
]);
export const PARTNER_COMPONENT_SCENARIO = "dev-only-partner-component-display";
export const PARTNER_COMPONENT_SCOPE = "DEV_ONLY_PARTNER_COMPONENT_DISPLAY";
export const PARTNER_COMPONENT_CASES = Object.freeze({
  "partner-links": Object.freeze(["signed-out", "checking", "ready", "ineligible", "empty", "api401", "unavailable", "malformed", "refresh-failure", "loading"]),
  "partner-dashboard": Object.freeze(["signed-out", "checking", "connected", "disconnected", "unconfirmed", "confirmed-zero", "unavailable", "generic-forbidden", "partner-missing", "api401", "malformed", "error", "loading"]),
});
export const PARTNER_COMPONENT_CONFIGURATIONS = Object.freeze([
  { name: "partner-desktop1440", width: 1440, height: 900, font: 16 },
  { name: "partner-phone320", width: 320, height: 812, font: 16 },
  { name: "partner-phone320-200", width: 320, height: 812, font: 32 },
  { name: "partner-phone375", width: 375, height: 812, font: 16 },
  { name: "partner-phone375-200", width: 375, height: 812, font: 32 },
].map(Object.freeze));
export const PARTNER_COMPONENT_PNG_CAP = 13;
export const PARTNER_COMPONENT_BOOTSTRAP = Object.freeze({
  "/api/config": READ_ONLY_GET_FIXTURES["/api/config"],
  "/api/research/me": Object.freeze({ status: 200, body: Object.freeze({ configured: true, authed: true }) }),
});
export function partnerGalleryRoute(page, selectedCase) {
  requireThat(Object.hasOwn(PARTNER_COMPONENT_CASES, page) && PARTNER_COMPONENT_CASES[page].includes(selectedCase), "PARTNER_GALLERY_CASE_NOT_APPROVED");
  return `/research/__gallery/${page}?case=${selectedCase}`;
}
export function partnerGallerySelection(target) {
  if (typeof target !== "string" || target.length > 160 || /[%\\\s#\u0000-\u001f]/u.test(target)) return null;
  const match = /^\/research\/__gallery\/(partner-links|partner-dashboard)\?case=([a-z0-9-]+)$/u.exec(target);
  if (!match || !PARTNER_COMPONENT_CASES[match[1]].includes(match[2])) return null;
  return { page: match[1], selectedCase: match[2] };
}
export function partnerRoutesForConfiguration(config) {
  requireThat(PARTNER_COMPONENT_CONFIGURATIONS.some((known) => ["name", "width", "height", "font"].every((key) => known[key] === config?.[key])), "PARTNER_CONFIGURATION_NOT_APPROVED");
  const primary = [partnerGalleryRoute("partner-links", "ready"), partnerGalleryRoute("partner-dashboard", "disconnected")];
  return config.name === "partner-desktop1440" ? [...primary, ...Object.entries(PARTNER_COMPONENT_CASES).flatMap(([page, cases]) => cases.map((selectedCase) => partnerGalleryRoute(page, selectedCase))).filter((route) => !primary.includes(route))] : primary;
}
export function partnerCaptureMatrix() {
  const pages = PARTNER_COMPONENT_CONFIGURATIONS.flatMap((config) => Object.entries(PARTNER_COMPONENT_CASES).flatMap(([page, cases]) => cases.map((selectedCase) => ({
    configuration: config.name, page, selectedCase, scene: "primary", selected: page === "partner-links" && selectedCase === "ready"
      || page === "partner-dashboard" && selectedCase === "disconnected"
      || config.name === "partner-desktop1440" && (page === "partner-links" && selectedCase === "ineligible" || page === "partner-dashboard" && selectedCase === "unconfirmed"),
    state: "NOT_RUN", scope: PARTNER_COMPONENT_SCOPE,
  }))));
  return [...pages, ...PARTNER_COMPONENT_CONFIGURATIONS.map((config) => ({ configuration: config.name, page: "partner-dashboard", selectedCase: "disconnected",
    scene: "enlarged-qr", selected: config.name === "partner-phone375", state: "NOT_RUN", scope: PARTNER_COMPONENT_SCOPE }))];
}
export function ownedArtifactRelativeRoot(scenario) {
  requireThat([PUBLIC_SCENARIO, PREMIUM_ENTRY_SCENARIO, DISPLAY_SCENARIO, PARTNER_COMPONENT_SCENARIO].includes(scenario), "SCENARIO_INVALID");
  return scenario === PARTNER_COMPONENT_SCENARIO ? "dist/owned-partner-component-dev" : "dist/public";
}
export function partnerSafeNetworkTarget(target, origin, assets = new Set()) {
  try {
    const url = new URL(target, origin);
    if (url.origin !== origin || url.username || url.password || url.hash) return 'OFF_CONTRACT_REDACTED';
    const raw = url.pathname + url.search;
    if (partnerGallerySelection(raw)) return raw;
    if (!url.search && (Object.hasOwn(PARTNER_COMPONENT_BOOTSTRAP,url.pathname) || assets.has(url.pathname.slice(1)))) return url.pathname;
  } catch { /* No arbitrary URL, unknown path fingerprint or error content. */ }
  return 'OFF_CONTRACT_REDACTED';
}
export const PARTNER_SDK_PROBE_SOURCE = Object.freeze({
  "appGraph": [
    {"path":"client/src/App.tsx","blob":"ee91b35256f3b00791a5461c0118c400cf030f75"},
    {"path":"client/src/main.tsx","blob":"45d82ce59b4fe7e56123a06a6d8716c909d601a1"},
    {"path":"client/src/lib/supabaseBrowser.ts","blob":"6c649e2eb330f9cd68af0c92b2865121650b2df6"},
    {"path":"client/src/research/core.tsx","blob":"482257aec506273be3f882ac2bf530576b61cd59"}
  ],
  "id": "SUPABASE_AUTH_JS_2_108_2_IMPORT_STORAGE_CAPABILITY",
  "packageVersion": "2.108.2",
  "lockBlob": "912f4f85e9a078ed97ed2b67ce8d1de09490eb29",
  "lockSha256": "d25eb6b816b616cfa1dc7b1769c14971b944e5385bfae9be41e75d1cf5e64f74",
  "registryTarballIntegrity": "NOT_RECORDED_IN_FROZEN_LOCK; exact installed file SHA256 enforced",
  "files": [
    {
      "bytes": 5380,
      "path": "node_modules/@supabase/supabase-js/package.json",
      "sha256": "93c607cc70c670e02ffdae1c39c9f92584f699339a39d4686d06ea664342443a"
    },
    {
      "bytes": 35342,
      "path": "node_modules/@supabase/supabase-js/dist/index.mjs",
      "sha256": "05dc19f720aea11598f920c135cd223571f35022405c35aa3c7472144cdc6e23"
    },
    {
      "bytes": 1581,
      "path": "node_modules/@supabase/auth-js/package.json",
      "sha256": "99154f06ba0b922c75a3279002537125b242cc8d4291b985d317badcc98b3899"
    },
    {
      "bytes": 452,
      "path": "node_modules/@supabase/auth-js/dist/module/index.js",
      "sha256": "9be5694df0e46b33d4f3b7bb8bad0ecef05ce343a5734376d6b4c93a8233eba7"
    },
    {
      "bytes": 141,
      "path": "node_modules/@supabase/auth-js/dist/module/AuthClient.js",
      "sha256": "684b46b2be095e71fe7546e72f6791753f1cae9ebdaacd167b4905a5b7a87903"
    },
    {
      "bytes": 255902,
      "path": "node_modules/@supabase/auth-js/dist/module/GoTrueClient.js",
      "sha256": "d9d649205584937435fa1dff6631885f40aa21ffbe6d12f80444b7e63bd59197"
    },
    {
      "bytes": 15989,
      "path": "node_modules/@supabase/auth-js/dist/module/lib/locks.js",
      "sha256": "81698be5dade8c1367224856c96e9e1fad7243ad3c556aa6ff87ce6e17e1ac88"
    },
    {
      "bytes": 14947,
      "path": "node_modules/@supabase/auth-js/dist/module/lib/helpers.js",
      "sha256": "057cb41abc14506192a97d7dc9575bf05a5682adb090a3f12030302d728b7b5d"
    },
    {
      "bytes": 15131,
      "path": "node_modules/@supabase/auth-js/src/lib/helpers.ts",
      "sha256": "517830aaa7764c9ec0035e1d4ceb9b31687faaf7fafdf7da5a44b429c0abe90c"
    },
    {
      "bytes": 15369,
      "path": "node_modules/@supabase/auth-js/src/lib/locks.ts",
      "sha256": "969b2a37747c827cb3bef2bb69162ece38d3ed55d3811b327f3b61586002fdae"
    }
  ]
});
/** Hash actual installed input bytes without importing or modifying the SDK. */
export function verifyPartnerSdkProbeBytes(inputs){
  requireThat(inputs instanceof Map&&inputs.size===PARTNER_SDK_PROBE_SOURCE.files.length+1,'PARTNER_SDK_PROBE_SOURCE_INPUTS_INVALID');
  const lock=inputs.get('package-lock.json');requireThat(lock&&hash(lock)===PARTNER_SDK_PROBE_SOURCE.lockSha256,'PARTNER_SDK_PROBE_LOCK_MISMATCH');
  const files=PARTNER_SDK_PROBE_SOURCE.files.map(pin=>{const bytes=inputs.get(pin.path);requireThat(bytes&&bytes.length===pin.bytes&&hash(bytes)===pin.sha256,'PARTNER_SDK_PROBE_SOURCE_BYTES_MISMATCH');return {path:pin.path,bytes:bytes.length,sha256:hash(bytes)};});
  const parse=path=>{try{return JSON.parse(Buffer.from(inputs.get(path)).toString('utf8'));}catch{throw new Error('PARTNER_SDK_PROBE_METADATA_INVALID');}};
  const locked=parse('package-lock.json'),auth=locked.packages?.['node_modules/@supabase/auth-js'],client=locked.packages?.['node_modules/@supabase/supabase-js'];
  const authMetadata=parse('node_modules/@supabase/auth-js/package.json'),clientMetadata=parse('node_modules/@supabase/supabase-js/package.json');
  requireThat(auth?.version==='2.108.2'&&client?.version==='2.108.2'&&client.dependencies?.['@supabase/auth-js']==='2.108.2'
    &&authMetadata.version==='2.108.2'&&authMetadata.module==='dist/module/index.js'&&clientMetadata.version==='2.108.2'&&clientMetadata.module==='dist/index.mjs'
    &&!Object.hasOwn(auth,'integrity')&&!Object.hasOwn(client,'integrity'),'PARTNER_SDK_PROBE_VERSION_OR_IMPORT_MISMATCH');
  return {id:PARTNER_SDK_PROBE_SOURCE.id,packageVersion:'2.108.2',lockSha256:hash(lock),registryTarballIntegrity:PARTNER_SDK_PROBE_SOURCE.registryTarballIntegrity,files,
    scope:'EXACT_INSTALLED_SOURCE_ALGORITHM; actual typed storage witness still required; no Auth or old-run attribution'};
}
function readPartnerSdkProbeSource(repo){
  const inputs=new Map();
  for(const path of ['package-lock.json',...PARTNER_SDK_PROBE_SOURCE.files.map(pin=>pin.path)]){
    const file=join(repo,path),stat=lstatSync(file);
    requireThat(stat.isFile()&&!stat.isSymbolicLink()&&realpathSync(file)===file,'PARTNER_SDK_PROBE_SOURCE_PATH_UNSAFE');
    inputs.set(path,readFileSync(file));
  }
  return verifyPartnerSdkProbeBytes(inputs);
}
/** Primitive-only recognition of TWO canonical Math.random Number strings. */
export function isPartnerSdkCapabilityProbe(key,value) {
  if(typeof key!=='string'||typeof value!=='string'||key!==value||key.length>80||!key.startsWith('lswt-'))return false;
  const nonce=key.slice(5);
  const canonical=part=>/^(?:0|0\.\d+|[1-9](?:\.\d+)?e-\d+)$/u.test(part)
    &&Number.isFinite(Number(part))&&Number(part)>=0&&Number(part)<1&&String(Number(part))===part;
  let matches=0;
  for(let i=1;i<nonce.length;i++)if(canonical(nonce.slice(0,i))&&canonical(nonce.slice(i)))matches++;
  return matches===1;
}
/** Pass-through observation; a probe is proved by actual effects, never waived. */
export function installPartnerStorageObservation(win, approvedTargets) {
  if (!approvedTargets.includes(win.location.pathname + win.location.search)) return null;
  const key = "__xeniosPartnerStorageObservationV1";
  if (win[key]) return null;
  const events = [], counts = { setItem: 0, clear: 0, removeItem: 0, unknownReceiver: 0, unknownRemoval: 0, dropped: 0 };
  const capabilityProbe={sourceId:'SUPABASE_AUTH_JS_2_108_2_IMPORT_STORAGE_CAPABILITY',state:'NOT_OBSERVED',setItemCalls:0,removeItemCalls:0,pairs:0,violations:0,keyEqualsValue:false,sameTurn:false,nonceRetained:false,
    caller:{setSupported:false,removeSupported:false,ancestryEqual:false,framesCompared:0,atLimit:false,coverage:'BOUNDED_NAMED_CALLER_AND_ANCESTRY_NOT_RAW_STACK'}};
  let pendingProbe=null;
  let stores, proto, descriptors, restored = false;
  const areas = ["sessionStorage", "localStorage"];
  const privacyKeys = ['xen_landing_page','xen_utm','xen_referrer','xen_attribution_schema'];
  const classify = (area, value) => area === "sessionStorage" && value === "xenios.research.memberCart.v2" ? "CURRENT_SESSION_CART"
    : areas.includes(area) && value === "xenios-research-cart-v1" ? "LEGACY_CART"
    : area === 'sessionStorage' && privacyKeys.includes(value) ? 'ATTRIBUTION_PRIVACY_'+privacyKeys.indexOf(value) : "UNAPPROVED_KEY";
  try {
    stores = Object.fromEntries(areas.map((area) => [area, win[area]])); proto = win.Storage.prototype;
    descriptors = Object.fromEntries(["setItem", "removeItem", "clear", "getItem"].map((name) => [name, Object.getOwnPropertyDescriptor(proto, name)]));
    if (Object.values(descriptors).some((descriptor) => typeof descriptor?.value !== "function")) return null;
  } catch { return null; }
  const probe = () => Object.fromEntries(areas.map((area) => { try { return [area, { available: true, length: stores[area].length }]; }
    catch { return [area, { available: false, length: null }]; } }));
  const initial = probe(), areaFor = (receiver) => areas.find((area) => receiver === stores[area]) ?? "UNKNOWN_STORAGE";
  const presence = (receiver, value) => { try { return Reflect.apply(descriptors.getItem.value, receiver, [value]) !== null; } catch { return null; } };
  const localLength=()=>{try{return stores.localStorage.length;}catch{return null;}};
  const invalidateProbe=state=>{if(pendingProbe){pendingProbe=null;capabilityProbe.nonceRetained=false;capabilityProbe.violations++;capabilityProbe.state=state;}};
  const beforeProvider=()=>!Object.hasOwn(win,'__xeniosPartnerComponentDisplayV1');
  const privacyPrefix=()=>events.length===4&&events.every((e,i)=>e.method==='removeItem'&&e.area==='sessionStorage'&&e.keyClass==='ATTRIBUTION_PRIVACY_'+i&&e.beforePresent===false&&e.afterPresent===false&&!e.threw);
  const captureCaller=()=>{
    try{
      const nativeLimit=Object.getOwnPropertyDescriptor(win.Error,'stackTraceLimit');
      if(!nativeLimit||!Object.hasOwn(nativeLimit,'value')||!Number.isInteger(nativeLimit.value)||nativeLimit.value<3)return null;
      const raw=new win.Error().stack;if(typeof raw!=='string'||raw.length>8192)return null;
      const lines=raw.split(/\r?\n/u).slice(1);if(lines.length<3||lines.length>12||lines.some(line=>line.length>1024))return null;
      // Skip ONLY this collector and the actual method wrapper. Never compare
      // their differing setItem/removeItem labels as caller evidence.
      const frames=lines.slice(2,10),first=/^\s*at (.{1,160}) \((.+):(\d+):(\d+)\)\s*$/u.exec(frames[0]);
      if(!first||first[1].includes('async ')||first[1].includes('<anonymous>'))return null;
      const url=new win.URL(first[2]);
      if(url.origin!==win.location.origin||url.search||url.hash||!/^\/assets\/[A-Za-z0-9_.-]+\.(?:m?js)$/u.test(url.pathname))return null;
      return {named:first[1],script:first[2],ancestry:frames.slice(1).map(frame=>frame.trim()),atLimit:lines.length>=Math.min(nativeLimit.value,10)};
    }catch{return null;}
  };
  const sameCaller=(left,right)=>!!left&&!!right&&left.atLimit===false&&right.atLimit===false&&left.named===right.named&&left.script===right.script
    &&left.ancestry.length===right.ancestry.length&&left.ancestry.length>0&&left.ancestry.every((frame,i)=>frame===right.ancestry[i]);
  const installed = {};
  for (const name of ["setItem", "removeItem", "clear"]) {
    installed[name] = function (...args) {
      counts[name]++; const area = areaFor(this),ordinal=counts.setItem+counts.removeItem+counts.clear;
      let classification=classify(area,args[0]),probeOperation=false;
      if(pendingProbe){
        if(name==='removeItem'&&args.length===1&&area==='localStorage'&&args[0]===pendingProbe.key
          &&ordinal===pendingProbe.ordinal+1&&pendingProbe.turnOpen&&beforeProvider()){
          const caller=captureCaller();capabilityProbe.caller.removeSupported=!!caller;
          capabilityProbe.caller.ancestryEqual=sameCaller(pendingProbe.caller,caller);
          capabilityProbe.caller.framesCompared=caller?1+caller.ancestry.length:0;
          capabilityProbe.caller.atLimit=capabilityProbe.caller.atLimit||!!caller?.atLimit;
          if(capabilityProbe.caller.ancestryEqual){classification='SDK_STORAGE_CAPABILITY_PROBE';probeOperation=true;capabilityProbe.removeItemCalls++;}
          else invalidateProbe(pendingProbe.caller.atLimit||caller?.atLimit?'CALLER_EVIDENCE_TRUNCATED':caller?'CALLER_ANCESTRY_MISMATCH':'CALLER_WITNESS_UNAVAILABLE');
        }else invalidateProbe('INTERRUPTED_OR_MISMATCHED');
      }
      if(name==='setItem'&&counts.setItem===1&&!counts.clear&&capabilityProbe.setItemCalls===0&&area==='localStorage'
        &&args.length===2&&isPartnerSdkCapabilityProbe(args[0],args[1])&&beforeProvider()&&privacyPrefix()
        &&initial.localStorage.available&&initial.localStorage.length===0&&initial.sessionStorage.available&&initial.sessionStorage.length===0
        &&localLength()===0&&presence(this,args[0])===false&&typeof win.queueMicrotask==='function'){
        const caller=captureCaller();capabilityProbe.caller.setSupported=!!caller;capabilityProbe.caller.atLimit=!!caller?.atLimit;
        if(caller){
          classification='SDK_STORAGE_CAPABILITY_PROBE';probeOperation=true;
          pendingProbe={key:args[0],ordinal,turnOpen:true,caller};
          capabilityProbe.setItemCalls++;capabilityProbe.keyEqualsValue=true;capabilityProbe.nonceRetained=true;capabilityProbe.state='SET_IN_PROGRESS';
        }else capabilityProbe.state='CALLER_WITNESS_UNAVAILABLE';
      }
      if (area === "UNKNOWN_STORAGE") counts.unknownReceiver++;
      if (name === "removeItem" && classification === "UNAPPROVED_KEY") counts.unknownRemoval++;
      const beforePresent = (name === "removeItem"||probeOperation) && classification !== "UNAPPROVED_KEY" ? presence(this, args[0]) : null;
      const beforeLocalLength=probeOperation?localLength():null,preProvider=probeOperation?beforeProvider():null;
      let threw = false;
      try { return Reflect.apply(descriptors[name].value, this, args); }
      catch (error) { threw = true; throw error; }
      finally {
        const afterPresent=(name==='removeItem'||probeOperation)&&classification!=='UNAPPROVED_KEY'?presence(this,args[0]):null;
        const afterLocalLength=probeOperation?localLength():null;
        const event = { ordinal, method: name, area, keyClass: classification,beforePresent,afterPresent,threw,
          ...(probeOperation?{beforeLocalLength,afterLocalLength,preProvider,keyEqualsValue:capabilityProbe.keyEqualsValue,sameTurn:!!pendingProbe?.turnOpen}:{}) };
        if (events.length < 128) events.push(event); else counts.dropped++;
        if(probeOperation&&name==='setItem'){
          if(!threw&&beforePresent===false&&afterPresent===true&&beforeLocalLength===0&&afterLocalLength===1
            &&preProvider&&pendingProbe?.ordinal===ordinal){
            capabilityProbe.state='AWAITING_SYNC_REMOVE';
            try{win.queueMicrotask(()=>{if(pendingProbe?.ordinal===ordinal)invalidateProbe('ASYNCHRONOUS_OR_UNBALANCED');});}
            catch{invalidateProbe('TURN_OBSERVATION_UNAVAILABLE');}
          }else invalidateProbe('SET_EFFECT_OR_THROW_MISMATCH');
        }else if(probeOperation&&name==='removeItem'){
          if(!threw&&beforePresent===true&&afterPresent===false&&beforeLocalLength===1&&afterLocalLength===0
            &&preProvider&&pendingProbe?.ordinal===ordinal-1&&pendingProbe.turnOpen){
            pendingProbe=null;capabilityProbe.nonceRetained=false;capabilityProbe.pairs=1;capabilityProbe.sameTurn=true;
            capabilityProbe.state='PROVEN_BALANCED_NONPERSONAL_CAPABILITY';
          }else invalidateProbe('REMOVE_EFFECT_OR_THROW_MISMATCH');
        }
      }
    };
    Object.defineProperty(proto, name, { ...descriptors[name], value: installed[name] });
  }
  const api = Object.freeze({
    snapshot() { invalidateProbe('SNAPSHOT_BEFORE_BALANCE');return { schemaVersion: 1, scope: "PASS_THROUGH_STORAGE_OBSERVATION_ONLY", coverage: "full-document-before-application", initial, current: probe(), counts: { ...counts }, capabilityProbe:{...capabilityProbe,caller:{...capabilityProbe.caller}},events: events.map((event) => ({ ...event })), restored }; },
    restore() { invalidateProbe('RESTORE_BEFORE_BALANCE');for (const name of ["setItem", "removeItem", "clear"]) {
      if (Object.getOwnPropertyDescriptor(proto, name)?.value !== installed[name]) throw new Error("PARTNER_STORAGE_OBSERVER_REPLACED");
      Object.defineProperty(proto, name, descriptors[name]);
    } restored = true; return true; },
  });
  Object.defineProperty(win, key, { value: api, configurable: true }); return api;
}
export function partnerStorageCensus(snapshot) {
  const counts = snapshot?.counts, initial = snapshot?.initial, current = snapshot?.current, events = snapshot?.events;
  const capability=snapshot?.capabilityProbe,probeSets=capability?.setItemCalls??0;
  requireThat(counts && Array.isArray(events) && events.length <= 128 && counts.setItem===probeSets&&probeSets>=0&&probeSets<=1&&!capability?.violations&&!capability?.nonceRetained&&!counts.clear
    && !counts.unknownReceiver && !counts.unknownRemoval && !counts.dropped, "PARTNER_STORAGE_UNEXPECTED_OPERATION");
  requireThat(!capability||Number.isInteger(probeSets)&&Number.isInteger(capability.removeItemCalls)&&Number.isInteger(capability.pairs)
    &&capability.removeItemCalls>=0&&capability.removeItemCalls<=probeSets&&capability.pairs>=0&&capability.pairs<=probeSets
    &&(probeSets!==0||capability.removeItemCalls===0&&capability.pairs===0&&capability.state==='NOT_OBSERVED'),'PARTNER_SDK_PROBE_COUNTERS_INVALID');
  requireThat(!probeSets||capability.sourceId===PARTNER_SDK_PROBE_SOURCE.id&&capability.state==='PROVEN_BALANCED_NONPERSONAL_CAPABILITY'
    &&capability.removeItemCalls===1&&capability.pairs===1&&capability.keyEqualsValue===true&&capability.sameTurn===true
    &&capability.caller?.setSupported===true&&capability.caller.removeSupported===true&&capability.caller.ancestryEqual===true
    &&capability.caller.atLimit===false&&capability.caller.framesCompared>1&&capability.caller.framesCompared<=8,'PARTNER_SDK_PROBE_NOT_PROVEN');
  requireThat([initial, current].every((stores) => ["localStorage", "sessionStorage"].every((area) => stores?.[area]?.available === true && stores[area].length === 0)), "PARTNER_STORAGE_NOT_FRESH_EMPTY");
  let pending = null, clearGenerations = 0, mountPurgeGenerations = 0; const generations = [], privacyRemovals = [],probeEvents=[];
  for (const event of events) {
    if(event.keyClass==='SDK_STORAGE_CAPABILITY_PROBE'){
      const first=probeEvents.length===0;
      requireThat(probeSets===1&&probeEvents.length<2&&privacyRemovals.length===4&&!clearGenerations&&!mountPurgeGenerations&&pending===null
        &&event.ordinal===(first?5:6)&&event.method===(first?'setItem':'removeItem')&&event.area==='localStorage'
        &&event.beforePresent===!first&&event.afterPresent===first&&event.beforeLocalLength===(first?0:1)&&event.afterLocalLength===(first?1:0)
        &&event.preProvider===true&&event.keyEqualsValue===true&&event.sameTurn===true&&event.threw===false,'PARTNER_SDK_PROBE_EVENT_PROOF_INVALID');
      probeEvents.push(event);continue;
    }
    requireThat(event.method === "removeItem" && event.beforePresent === false && event.afterPresent === false && event.threw === false, "PARTNER_STORAGE_REMOVAL_NOT_EMPTY_OR_THREW");
    if(event.keyClass.startsWith('ATTRIBUTION_PRIVACY_')) {
      requireThat(pending===null&&event.area==='sessionStorage'&&event.keyClass==='ATTRIBUTION_PRIVACY_'+privacyRemovals.length,'PARTNER_PRIVACY_CLEANUP_ORDER_UNEXPECTED');
      privacyRemovals.push({ordinal:event.ordinal,keyClass:event.keyClass});continue;
    }
    if (event.area === "sessionStorage" && event.keyClass === "CURRENT_SESSION_CART") {
      requireThat(pending === null, "PARTNER_STORAGE_LIFECYCLE_ORDER_UNEXPECTED"); clearGenerations++; pending = { kind: "canonical-clear", ordinal: clearGenerations, stage: "legacy-session" };
    } else if (event.area === "sessionStorage" && event.keyClass === "LEGACY_CART") {
      if (pending === null) { mountPurgeGenerations++; pending = { kind: "mount-purge", ordinal: mountPurgeGenerations, stage: "legacy-local" }; }
      else { requireThat(pending.stage === "legacy-session", "PARTNER_STORAGE_LIFECYCLE_ORDER_UNEXPECTED"); pending.stage = "legacy-local"; }
    } else {
      requireThat(event.area === "localStorage" && event.keyClass === "LEGACY_CART" && pending?.stage === "legacy-local", "PARTNER_STORAGE_LIFECYCLE_ORDER_UNEXPECTED");
      generations.push({ kind: pending.kind, ordinal: pending.ordinal, finalEventOrdinal: event.ordinal }); pending = null;
    }
  }
  requireThat(pending === null && clearGenerations > 0 && mountPurgeGenerations > 0 && counts.removeItem+counts.setItem === events.length
    &&probeEvents.length===probeSets*2,
    "PARTNER_STORAGE_LIFECYCLE_INCOMPLETE");
  return { clearGenerations, mountPurgeGenerations, generations, privacyRemovals, expectedVectorFromObservedCanonicalSequences: {
    currentSession: clearGenerations, legacySession: clearGenerations + mountPurgeGenerations, legacyLocal: clearGenerations + mountPurgeGenerations },
    noSetItem: counts.setItem===0,noOrdinaryWrites:true,totalSetItemCalls:counts.setItem,totalRemoveItemCalls:counts.removeItem,
    capabilityProbe:{pairs:probeSets,sourceId:probeSets?capability.sourceId:null,proof:probeSets?'OBSERVED_EXACT_BALANCED_SOURCE_PINNED_ALGORITHM':'NOT_OBSERVED'},
    beforeAfterEmpty: true, callerAttribution: "CANONICAL_KEY_SEQUENCE_AND_SOURCE_PINNED_PROBE_WITNESS_NOT_A_STACK_OR_REAL_ACTOR_PROOF" };
}
/** Observe actual app focus before delegation; clock is isolated display-only. */
export function installPartnerPrelude(win, approvedTargets, installStorage, captureBaseline) {
  if (!approvedTargets.includes(win.location.pathname + win.location.search)) return null;
  const storage = installStorage(win, approvedTargets); if (!storage) return null;
  const focusOwner = win.HTMLElement.prototype, focusDescriptor = Object.getOwnPropertyDescriptor(focusOwner, "focus");
  const dateDescriptor = Object.getOwnPropertyDescriptor(win, "Date"), NativeDate = win.Date;
  if (typeof focusDescriptor?.value !== "function" || typeof NativeDate !== "function") { storage.restore(); return null; }
  const timers = { setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, performance: win.performance }, expectedEpochMs = NativeDate.parse("2026-11-20T00:00:00.000Z");
  const focus = { calls: 0, beforeCaptures: 0, captureFailures: 0, nativeThrows: 0, reentrantCalls: 0, maxDepth: 0 };
  let depth = 0, capturing = false, restored = false;
  const observedFocus = function (...args) {
    focus.calls++; depth++; if (depth > 1) focus.reentrantCalls++; focus.maxDepth = Math.max(focus.maxDepth, depth);
    try {
      if (!capturing) { capturing = true; try { captureBaseline(); focus.beforeCaptures++; } catch { focus.captureFailures++; } finally { capturing = false; } }
      else focus.captureFailures++;
      try { return Reflect.apply(focusDescriptor.value, this, args); } catch (error) { focus.nativeThrows++; throw error; }
    } finally { depth--; }
  };
  function DisplayDate(...args) {
    if (!new.target) return new NativeDate(expectedEpochMs).toString();
    return Reflect.construct(NativeDate, args.length ? args : [expectedEpochMs], new.target === DisplayDate ? NativeDate : new.target);
  }
  Object.setPrototypeOf(DisplayDate, NativeDate); DisplayDate.prototype = NativeDate.prototype;
  Object.defineProperty(DisplayDate, "now", { value: () => expectedEpochMs, configurable: true, writable: true });
  Object.defineProperty(focusOwner, "focus", { ...focusDescriptor, value: observedFocus });
  Object.defineProperty(win, "Date", { ...dateDescriptor, value: DisplayDate });
  const api = Object.freeze({
    snapshot() { return { schemaVersion: 1, mode: "DEV_ONLY_PARTNER_COMPONENT_DISPLAY", coverage: "full-document-before-application",
      focus: { ...focus }, storage: storage.snapshot(), clock: { expectedEpochMs, observedEpochMs: win.Date.now(), restored },
      hostTimersUnmodified: win.setTimeout === timers.setTimeout && win.clearTimeout === timers.clearTimeout && win.performance === timers.performance }; },
    restore() {
      if (arguments.length || restored) throw new Error("PARTNER_PRELUDE_RESTORE_NOT_CURRENT");
      const facts = { focus: false, clock: false, storage: false };
      if (Object.getOwnPropertyDescriptor(focusOwner, "focus")?.value === observedFocus) { Object.defineProperty(focusOwner, "focus", focusDescriptor); facts.focus = true; }
      if (win.Date === DisplayDate) { Object.defineProperty(win, "Date", dateDescriptor); facts.clock = true; }
      try { facts.storage = storage.restore() === true; } catch { /* No ownership or cleanup success inferred. */ }
      restored = facts.focus && facts.clock && facts.storage; return facts;
    },
  });
  Object.defineProperty(win, "__xeniosPartnerPreludeV1", { value: api, configurable: true }); return api;
}
export function partnerPreludeSource() {
  const targets = Object.entries(PARTNER_COMPONENT_CASES).flatMap(([page, cases]) => cases.map((selectedCase) => partnerGalleryRoute(page, selectedCase)));
  return `(${installPartnerPrelude.toString()})(window,${JSON.stringify(targets)},(win,targets)=>{const isPartnerSdkCapabilityProbe=${isPartnerSdkCapabilityProbe.toString()};return (${installPartnerStorageObservation.toString()})(win,targets);},()=>(${FOCUS_BASELINE_SOURCE}))`;
}
/** Fixed scenarios, never arbitrary route, origin, fixture or authority inputs. */
export function scenarioDefinition(name = PUBLIC_SCENARIO, displayContract = LEGACY_DISPLAY_CONTRACT) {
  selectedDisplayContract(name, displayContract);
  if (name === DISPLAY_SCENARIO && displayContract === MC10_DISPLAY_CONTRACT) return { name, displayContract, routes: Object.freeze([PREMIUM_ENTRY_ROUTE]), configurations: MC10_CONFIGURATIONS, fixtures: DISPLAY_FIXTURE_KEYS, scope: MC10_SCOPE, captureCount: 6, resolveCount: 0 };
  requireThat(name === PUBLIC_SCENARIO || name === PREMIUM_ENTRY_SCENARIO || name === DISPLAY_SCENARIO || name === PARTNER_COMPONENT_SCENARIO, "SCENARIO_INVALID");
  if (name === PARTNER_COMPONENT_SCENARIO) return { name, routes: Object.freeze(partnerRoutesForConfiguration(PARTNER_COMPONENT_CONFIGURATIONS[0])), configurations: PARTNER_COMPONENT_CONFIGURATIONS,
    fixtures: PARTNER_COMPONENT_BOOTSTRAP, scope: PARTNER_COMPONENT_SCOPE, captureCount: 31, resolveCount: 0 };
  if (name === DISPLAY_SCENARIO) return { name, routes: Object.freeze([PREMIUM_ENTRY_ROUTE]), configurations: DISPLAY_CONFIGURATIONS,
    fixtures: DISPLAY_FIXTURE_KEYS, scope: "SYNTHETIC_CATALOG_DISPLAY_ONLY_NO_REAL_AUTH_ASSENT_CONTACT_OR_ELIGIBILITY",
    captureCount: 6, resolveCount: 0 };
  return name === PUBLIC_SCENARIO
    ? { name, routes: ROUTES, configurations: CONFIGURATIONS, fixtures: READ_ONLY_GET_FIXTURES,
      scope: "LOCAL_STATIC_404_FIXTURE_ONLY", captureCount: 12, resolveCount: 5 }
    : { name, routes: Object.freeze([PREMIUM_ENTRY_ROUTE]), configurations: PREMIUM_ENTRY_CONFIGURATIONS,
      fixtures: PREMIUM_ENTRY_GET_FIXTURES, scope: "LOCAL_PREMIUM_ENTRY_UNAVAILABLE_ONLY",
      captureCount: 6, resolveCount: 0 };
}

export function observedMethodAllowed(method, url, origin, scenario = PUBLIC_SCENARIO, displayContract = LEGACY_DISPLAY_CONTRACT) {
  const definition = scenarioDefinition(scenario, displayContract);
  if (displayContract === MC10_DISPLAY_CONTRACT) return url.origin === origin && (["GET","HEAD"].includes(method) || method === "POST" && url.pathname === MC10_ADMISSION_PATH && !url.search && !url.hash);
  if (scenario === PARTNER_COMPONENT_SCENARIO) return url.origin === origin && method === "GET";
  return url.origin === origin && (method === "GET" || method === "HEAD"
    || definition.name === PUBLIC_SCENARIO && method === "POST"
      && url.pathname === "/api/research/referral/resolve" && !url.search);
}

/** A successful static rendering never establishes a customer/session/assent. */
export function assertScenarioFixtureCensus(counters, scenario = PUBLIC_SCENARIO, displayContract = LEGACY_DISPLAY_CONTRACT) {
  const definition = scenarioDefinition(scenario, displayContract), counts = counters.readOnlyGET;
  if (displayContract === MC10_DISPLAY_CONTRACT) {
    requireThat(counters.resolve404===0&&!counters.refused&&!counters.unexpected&&!counters.credentialAttempts && !counters.preAdmissionCatalog && counters.admissionPOST===6 && Object.keys(counts).length===9 && MC10_GET_PATHS.every(path=>Number.isInteger(counts[path])&&counts[path]>=(path==="/api/config"?1:6)&&counts[path]<=40), "MC10_FIXTURE_CENSUS_FAILED");
    return true;
  }
  requireThat(counters.resolve404 === definition.resolveCount && !counters.refused && !counters.unexpected
    && !counters.credentialAttempts, "PREVIEW_REQUEST_CONTRACT_FAILED");
  const boundedCount = (path, min, max) => Number.isInteger(counts[path]) && counts[path] >= min && counts[path] <= max;
  const profileCount = definition.configurations.length;
  if (scenario === PARTNER_COMPONENT_SCENARIO) {
    requireThat(Object.keys(counts).length === 2 && ["/api/config", "/api/research/me"].every((path) => boundedCount(path, 31, 100)), "PARTNER_HTTP_BOOTSTRAP_CENSUS_FAILED");
    return;
  }
  if (scenario === DISPLAY_SCENARIO) {
    requireThat(Object.keys(counts).length === 9 && DISPLAY_GET_PATHS.every((path) => boundedCount(path, path === "/api/config" ? 1 : 5, 40)),
      "DISPLAY_BOOTSTRAP_CENSUS_FAILED");
    return;
  }
  requireThat(boundedCount("/api/config", 1, profileCount * 6) && boundedCount("/api/research/me", profileCount, profileCount * 2)
    && (scenario === PUBLIC_SCENARIO
      ? boundedCount("/api/research/business-inquiries/config", 4, 8)
      : boundedCount("/api/research/early-access/session", profileCount, profileCount * 2)
        && boundedCount("/api/research/early-access/assisted-orders/config", profileCount, profileCount * 2)),
  "READONLY_BOOTSTRAP_CENSUS_FAILED");
}
export const WHOLESALE_PACKET = Object.freeze({
  sha256: "c75d2a32886265a876e9adb151ae4f6824738df0c920815bec81db438e1b0939",
  preparedSource: "68350df1fcccf3db806808a2568aed6371425c28",
  preparedTree: "f1d02ba49e48d12d25501204502f226a78ec030a",
  adoptedPageBlob: "1fb2de27cd75e7a16d5bd92aa57a3f756c604553",
});
export const WHOLESALE_EXPECTED = Object.freeze({
  title: "Wholesale and organization access | Xenios Research",
  description: "Wholesale product enquiries and reviewed organization access. Share exact items, variants, packages, quantities, and documentation needs with the Xenios team.",
  heading: "Wholesale enquiries for your organization.",
  unavailable: "Online business enquiries are not available in this session.",
});
export const CONFIGURATIONS = Object.freeze([
  { name: "phone100", width: 375, height: 812, font: 16 },
  { name: "phone200", width: 375, height: 812, font: 32 },
  { name: "desktop100", width: 1440, height: 900, font: 16 },
  { name: "desktop200", width: 1440, height: 900, font: 32 },
]);
export const OWNED_SOURCES = Object.freeze([
  "scripts/evidence/owned-runner-preview.ts", "scripts/evidence/owned-runner-browser-qa.mjs",
  "scripts/evidence/owned-runner-browser-qa.sh", "scripts/evidence/owned-runner-browser-qa.node-test.mjs",
  "scripts/evidence/lib/chrome.mjs", "scripts/evidence/lib/cdp.mjs", "scripts/evidence/lib/page-audit.js",
  "scripts/evidence/lib/immutable-dist.mjs", "scripts/evidence/lib/provenance.mjs",
  "server/research/seo/raw-http-document-policy.ts", "client/src/home/content.ts",
  "client/src/research/recommendation/Recipient.tsx", "client/src/research/recommendation/api.ts",
  "shared/research/referral-v1.ts", ".github/workflows/checks.yml", "package-lock.json",
  "client/src/research/b2b/OrganizationAccessPage.tsx", "client/src/research/b2b/ConnectedBusinessInquiryPage.tsx",
  "client/src/research/b2b/BusinessInquiryForm.tsx", "client/src/research/b2b/components.tsx",
  "client/src/research/b2b/pathways.css", "client/src/research/section.tsx", "client/src/research/layout.tsx",
  "client/src/research/core.tsx", "client/src/lib/config.ts", "client/src/lib/supabaseBrowser.ts",
  "client/src/research/lib/routes.ts", "client/src/research/seo/route-policy.ts",
  "scripts/evidence/routes.public.json",
]);
const SHA = /^[a-f0-9]{40}$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function requireThat(value, code) { if (!value) throw new Error(code); }

export const PAGE_CHECKS = Object.freeze([
  "PAGE_CREATE", "NETWORK_BOUNDARY_SETUP", "VIEWPORT_SETUP", "FONT_SETUP", "BLANK_FONT_CALIBRATION",
  "RAW_DOCUMENT", "DOCUMENT_NAVIGATE", "EXPECTED_UI_TEXT", "DOCUMENT_FONT_CALIBRATION",
  "PAGE_AUDIT", "PAGE_VIEW", "UI_ASSERTION_BUILD", "SCREENSHOT", "CAPTURE_WRITE",
]);

/** Classify only frozen helper forms; never persist an exception's text. */
export function pageCheckFailureCode(check, error) {
  requireThat(PAGE_CHECKS.includes(check), "PAGE_CHECK_INVALID");
  const message = typeof error?.message === "string" && error.message.length <= 500 ? error.message : "";
  if (["OVERALL_DEADLINE", "BOUNDED_OPERATION_TIMEOUT", "EXPECTED_UI_STATE_MISSING",
    "FONT_CAPABILITY_NOT_EXECUTED", "SCREENSHOT_VIEWPORT_MISMATCH"].includes(message)) return message;
  if (check === "DOCUMENT_NAVIGATE") {
    if (/^navigate [^\r\n]+: load event not fired within \d+ ms$/.test(message)) return "PAGE_DOCUMENT_LOAD_TIMEOUT";
    if (/^network did not remain idle through paint within \d+ ms; \d+ request\(s\) pending \[[A-Za-z, ]*\]$/.test(message)) return "PAGE_DOCUMENT_IDLE_TIMEOUT";
  }
  return `PAGE_CHECK_${check}_FAILED`;
}

export async function runPageCheck(check, operation, receipts, now = Date.now) {
  requireThat(PAGE_CHECKS.includes(check) && receipts.length < PAGE_CHECKS.length, "PAGE_CHECK_INVALID");
  const started = now(), receipt = { check, state: "STARTED", elapsedMs: null };
  receipts.push(receipt);
  try {
    const value = await operation();
    receipt.state = "PASS";
    return value;
  } catch (error) {
    receipt.state = "FAILED";
    receipt.failure = pageCheckFailureCode(check, error);
    throw new Error(receipt.failure);
  } finally {
    receipt.elapsedMs = Math.max(0, Math.min(300000, now() - started));
  }
}

/** Never start optional diagnostics using the reserved cleanup/tail budget. */
export function failureObservationBudget(deadline, now, ceiling) {
  requireThat([750, 1500].includes(ceiling), "DIAGNOSTIC_CEILING_INVALID");
  return Number.isFinite(deadline) && Number.isFinite(now)
    ? Math.max(0, Math.min(ceiling, Math.floor(deadline - now - 25000 - 500))) : 0;
}

/** A fixed scalar projection, excluding page text, URLs, exceptions and IDs. */
export function pageFailureMetrics(sample) {
  const numeric = ["width", "height", "dpr", "scale", "root", "rem", "scrollWidth", "clientWidth",
    "h1Count", "mainCount", "inflightCount", "boundaryTargetCount", "boundarySetupErrorCount"];
  const boolean = ["loaded", "domReady", "bodyPresent", "expectedTextPresent", "emMedia"];
  return Object.fromEntries([
    ...numeric.map((key) => [key, typeof sample?.[key] === "number" && Number.isFinite(sample[key])
      && sample[key] >= 0 && sample[key] <= 10000000 ? sample[key] : null]),
    ...boolean.map((key) => [key, typeof sample?.[key] === "boolean" ? sample[key] : null]),
  ]);
}

/** A rendered badge, not a mention elsewhere in the page, proves this label. */
export function hasInfinityDevelopmentBadge(sample) {
  return sample?.rendered === true && typeof sample.text === "string"
    && sample.text.trim().replace(/\s+/gu, " ").toLowerCase() === "in development";
}

/** The outer configuration cleanup owns this page even if setup/visit fails. */
export async function visitConfigurationPage({ create, own, configure, visit, scenario = PUBLIC_SCENARIO, configuration }) {
  const page = await create();
  own(page);
  await configure(page);
  for (const route of scenario === PARTNER_COMPONENT_SCENARIO ? partnerRoutesForConfiguration(configuration) : scenarioDefinition(scenario).routes) await visit(page, route);
}

export function configurationBoundaryOptions(origin, violations) {
  return { fulfillments: [], allowedOrigins: [origin], allowedWebSocketOrigins: [],
    // This global record survives the page helper's per-navigation resets.
    onViolation: () => violations.push({ reason: "PROFILE_NETWORK_BOUNDARY_VIOLATION" }) };
}

/** Observe real terminal/idle state after all interaction and capture work. */
export async function settlePostInteractionNetwork(page, bounded) {
  await bounded(page.settle({ quietMs: 150, maxSettleMs: 5000 }), 5000);
  await bounded(page.waitForBoundaryTargets());
}

export function assertNetworkBoundaryComplete(network) {
  requireThat(!network.fulfillmentCount && !network.pending && !network.pendingTargets
    && !network.setupErrors, "NETWORK_BOUNDARY_INCOMPLETE");
}

/** Own data only: diagnostic projection must not invoke record accessors. */
function ownData(value, key) {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function diagnosticPath(value, origin, assets, relative = false) {
  if (typeof value !== "string" || value.length > 4096) return { pathClass: "UNKNOWN", pathSha256: null };
  const unknown = (pathClass) => ({ pathClass, pathSha256: null });
  if (/^blob:/u.test(value)) return unknown("IN_MEMORY_BLOB");
  if (/^data:/u.test(value)) return unknown("IN_MEMORY_DATA");
  try {
    const url = relative ? new URL(value, origin) : new URL(value);
    if (url.username || url.password) return unknown("URL_CREDENTIALS");
    if (url.origin !== origin) return unknown("OFF_ORIGIN");
    if (!url.hash && url.search && displayCatalogQuery(url.pathname + url.search))
      return { pathClass: "SYNTHETIC_CATALOG_FIXTURE", pathSha256: hash(url.pathname) };
    if (url.search || url.hash) return unknown("QUERY_OR_FRAGMENT");
    if (/[\\%\s]/u.test(value) || value !== (relative && value.startsWith("/") ? url.pathname : origin + url.pathname)) return unknown("UNKNOWN");
    const fixed = { "/": "HOME_DOCUMENT", "/r/SAMPLE-CODE": "RECIPIENT_DOCUMENT",
      "/research/organizations": "WHOLESALE_DOCUMENT", "/sw.js": "SERVICE_WORKER_SCRIPT",
      "/offline.html": "OFFLINE_DOCUMENT", "/site.webmanifest": "MANIFEST",
      "/api/config": "CONFIG_FIXTURE", "/api/research/me": "SESSION_FIXTURE",
      "/api/research/business-inquiries/config": "BUSINESS_CONFIG_FIXTURE",
      "/api/research/referral/resolve": "RESOLVE_FIXTURE", "/earlyaccess": "PREMIUM_ENTRY_DOCUMENT",
      "/api/research/early-access/session": "EARLY_ACCESS_UNAVAILABLE_FIXTURE",
      "/api/research/early-access/assisted-orders/config": "ASSISTED_CONFIG_UNAVAILABLE_FIXTURE" };
    let pathClass = Object.hasOwn(fixed, url.pathname) ? fixed[url.pathname] : null;
    if (!pathClass && PREMIUM_MEDIA_PATHS.includes(url.pathname)
      && Set.prototype.has.call(assets, url.pathname.slice(1))) pathClass = "PREMIUM_MEDIA_ASSET";
    if (!pathClass && Set.prototype.has.call(assets, url.pathname.slice(1))
      && (/^\/assets\/[A-Za-z0-9._-]+\.(?:js|css|png|svg|jpe?g|webp|avif|ico|woff2?|ttf|otf|gif)$/u.test(url.pathname)
        || ["/favicon.ico", "/favicon.png", "/android-chrome-192x192.png", "/android-chrome-512x512.png", "/apple-touch-icon.png"].includes(url.pathname))) pathClass = "INVENTORIED_ASSET";
    return pathClass ? { pathClass, pathSha256: hash(url.pathname) } : unknown("UNKNOWN");
  } catch { return unknown("UNKNOWN"); }
}

/** Passive listeners only. Protocol IDs stay in bounded private lookup maps. */
export function observeOwnedCdpEvents(conn, page, { origin, assets, now = Date.now }) {
  const started = now(), sessions = new Map(), requests = new Map(), frames = new Map(), loaders = new Map();
  const events = [], off = [], awaitingOwnership = new Set();
  const truncated = { sessions: false, requests: false, events: false, lineage: false };
  let stopped = false, eventsSeen = 0, droppedEvents = 0, observerErrors = 0, unsubscribeErrors = 0;
  const id = (value) => typeof value === "string" && value.length > 0 && value.length <= 256 ? value : null;
  const closed = (value, choices) => choices.includes(value) ? value : "UNKNOWN";
  const resource = (value) => closed(value, ["Document", "Stylesheet", "Image", "Media", "Font", "Script", "TextTrack", "XHR", "Fetch",
    "Prefetch", "EventSource", "WebSocket", "Manifest", "SignedExchange", "Ping", "CSPViolationReport", "Preflight", "Other"]);
  const lineage = (map, value) => {
    if (!id(value)) return null;
    if (!map.has(value)) { if (map.size >= 64) { truncated.lineage = true; return null; } map.set(value, map.size); }
    return map.get(value);
  };
  const emit = (kind, session, fields = {}) => {
    if (stopped) return;
    eventsSeen = Math.min(1000000, eventsSeen + 1);
    const elapsed = now() - started;
    if (events.length >= 384) { events.splice(192, 1); truncated.events = true; droppedEvents = Math.min(1000000, droppedEvents + 1); }
    events.push({ sequence: eventsSeen - 1, kind, sessionOrdinal: session.ordinal, targetClass: session.kind,
      elapsedMs: Number.isFinite(elapsed) ? Math.max(0, Math.min(300000, elapsed)) : null, ...fields });
  };
  const request = (session, params, create) => {
    const requestId = id(ownData(params, "requestId"));
    if (requestId === null) return null;
    const key = session.ordinal + ":" + requestId;
    if (!requests.has(key) && create) {
      if (requests.size >= 128) { truncated.requests = true; return null; }
      requests.set(key, { ordinal: requests.size });
    }
    return requests.get(key) ?? null;
  };
  const listen = (method, callback, sessionId) => off.push(conn.on(method, (params) => {
    if (stopped) return;
    try { callback(params); } catch { observerErrors = Math.min(1000000, observerErrors + 1); }
  }, sessionId));
  const isOwnedChild = (sessionId) => {
    try { return Set.prototype.has.call(ownData(page, "boundarySessionIds"), sessionId); } catch { return false; }
  };
  const attach = (params) => {
    const sessionId = id(ownData(params, "sessionId"));
    if (!sessionId || sessions.has(sessionId) || awaitingOwnership.has(sessionId)) return;
    if (isOwnedChild(sessionId)) { install(sessionId, "CHILD"); return; }
    if (awaitingOwnership.size >= 16) { truncated.sessions = true; return; }
    // The existing boundary listener may run later in this same event dispatch.
    awaitingOwnership.add(sessionId);
    queueMicrotask(() => {
      awaitingOwnership.delete(sessionId);
      try { if (!stopped && isOwnedChild(sessionId)) install(sessionId, "CHILD"); } catch { observerErrors = Math.min(1000000, observerErrors + 1); }
    });
  };
  function install(sessionId, kind) {
    if (stopped || sessions.has(sessionId)) return;
    if (sessions.size >= 16) { truncated.sessions = true; return; }
    const session = { ordinal: sessions.size, kind };
    sessions.set(sessionId, session);
    emit("SESSION", session);
    listen("Network.requestWillBeSent", (params) => {
      const item = request(session, params, true), wire = ownData(params, "request");
      emit("REQUEST", session, { requestOrdinal: item?.ordinal ?? null,
        ...diagnosticPath(ownData(wire, "url"), origin, assets),
        method: closed(ownData(wire, "method"), ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"]),
        resourceType: resource(ownData(params, "type")),
        frameOrdinal: lineage(frames, ownData(params, "frameId")), loaderOrdinal: lineage(loaders, ownData(params, "loaderId")),
        currentLoaderOrdinal: lineage(loaders, ownData(page, "currentMainFrameLoaderId")),
        previousLoaderOrdinal: lineage(loaders, ownData(ownData(page, "mainFrameLoaderTransition"), "previousLoaderId")),
        generation: Number.isInteger(ownData(page, "recordsGeneration")) && ownData(page, "recordsGeneration") >= 0
          && ownData(page, "recordsGeneration") <= 1000000 ? ownData(page, "recordsGeneration") : null,
        initiatorType: closed(ownData(ownData(params, "initiator"), "type"), ["parser", "script", "preload", "SignedExchange", "preflight", "other"]) });
    }, sessionId);
    listen("Network.responseReceived", (params) => {
      const item = request(session, params, true), response = ownData(params, "response"), status = ownData(response, "status");
      const sw = ownData(response, "fromServiceWorker");
      emit("RESPONSE", session, { requestOrdinal: item?.ordinal ?? null,
        ...diagnosticPath(ownData(response, "url"), origin, assets), resourceType: resource(ownData(params, "type")),
        responseStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
        fromServiceWorker: typeof sw === "boolean" ? sw : null });
    }, sessionId);
    for (const [method, kind] of [["Network.loadingFinished", "FINISHED"], ["Network.loadingFailed", "FAILED"]]) {
      listen(method, (params) => {
        const canceled = ownData(params, "canceled");
        emit(kind, session, { requestOrdinal: request(session, params, false)?.ordinal ?? null,
          ...(kind === "FAILED" ? { resourceType: resource(ownData(params, "type")), canceled: typeof canceled === "boolean" ? canceled : null } : {}) });
      }, sessionId);
    }
    if (kind === "PAGE") {
      listen("Page.frameNavigated", (params) => {
        const frame = ownData(params, "frame");
        if (ownData(frame, "parentId")) return;
        emit("FRAME", session, { ...diagnosticPath(ownData(frame, "url"), origin, assets),
          frameOrdinal: lineage(frames, ownData(frame, "id")), loaderOrdinal: lineage(loaders, ownData(frame, "loaderId")),
          currentLoaderOrdinal: lineage(loaders, ownData(page, "currentMainFrameLoaderId")),
          previousLoaderOrdinal: lineage(loaders, ownData(ownData(page, "mainFrameLoaderTransition"), "previousLoaderId")) });
      }, sessionId);
      listen("Page.loadEventFired", () => emit("LOAD", session), sessionId);
    }
    listen("Target.attachedToTarget", attach, sessionId);
  }
  const pageSession = id(ownData(page, "sessionId"));
  requireThat(pageSession !== null, "TRACE_PAGE_IDENTITY_MISSING");
  install(pageSession, "PAGE");
  listen("Target.attachedToTarget", attach);
  const owned = ownData(page, "boundarySessionIds");
  try { for (const sessionId of Set.prototype.values.call(owned)) {
    if (sessions.size >= 16 && !sessions.has(sessionId)) { truncated.sessions = true; break; }
    if (id(sessionId)) install(sessionId, sessionId === pageSession ? "PAGE" : "CHILD");
  } } catch {}
  const summary = () => ({ scope: "PASSIVE_OWNED_CDP_EVENTS_ONLY", stopped, sessions: sessions.size, requests: requests.size,
    capturedEvents: events.length, eventsSeen, droppedEvents, retention: "FIRST_192_LAST_192",
    observerErrors, unsubscribeErrors, truncated: { ...truncated } });
  return {
    summary,
    snapshot() {
      const pending = [];
      try {
        for (const [key, value] of Map.prototype.entries.call(ownData(page, "inflight"))) {
          if (pending.length === 8) break;
          const sessionId = id(ownData(value, "sessionId")), session = sessions.get(sessionId);
          const requestId = sessionId === pageSession ? id(key) : typeof key === "string" && sessionId && key.startsWith(sessionId + ":") ? id(key.slice(sessionId.length + 1)) : null;
          pending.push({ pendingOrdinal: pending.length, sessionOrdinal: session?.ordinal ?? null,
            requestOrdinal: session && requestId ? requests.get(session.ordinal + ":" + requestId)?.ordinal ?? null : null });
        }
      } catch {}
      return { ...summary(), events: events.map((event) => ({ ...event })), pending };
    },
    stop() {
      if (!stopped) {
        stopped = true;
        for (const unsubscribe of off) { try { unsubscribe(); } catch { unsubscribeErrors++; } }
        awaitingOwnership.clear();
      }
      return summary();
    },
  };
}

/** Failure-only memory read; no idle reconciliation, requests or mutation. */
export function inflightFailureSnapshot(page, { origin, assets, ledger, now }) {
  const pending = ownData(page, "inflight");
  const output = { state: "UNAVAILABLE", pendingCount: null, truncated: false, entries: [],
    serverRecordsConsidered: 0, serverRecordsTruncated: false, serverRecordsAreNotCdpCompletionProof: true };
  let iterator;
  try {
    iterator = Map.prototype.entries.call(pending);
    output.pendingCount = Object.getOwnPropertyDescriptor(Map.prototype, "size").get.call(pending);
  } catch { return output; }
  const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"];
  const resources = ["Document", "Stylesheet", "Image", "Media", "Font", "Script", "TextTrack", "XHR", "Fetch",
    "Prefetch", "EventSource", "WebSocket", "Manifest", "SignedExchange", "Ping", "CSPViolationReport", "Preflight", "Other"];
  const closed = (value, choices) => choices.includes(value) ? value : "UNKNOWN";
  const identity = (value) => typeof value === "string" && value.length > 0 && value.length <= 256
    || Number.isInteger(value) && value >= 0;
  const relation = (left, right) => typeof left === typeof right && identity(left) && identity(right)
    ? left === right ? "SAME" : "DIFFERENT" : "UNKNOWN";
  const status = (value) => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
  const counts = new Map(), ledgerLength = Array.isArray(ledger) ? ownData(ledger, "length") : 0;
  output.serverRecordsTruncated = ledgerLength > 256;
  for (let i = 0; i < Math.min(ledgerLength, 256); i++) {
    const row = ownData(ledger, String(i)), path = diagnosticPath(ownData(row, "target"), origin, assets, true);
    output.serverRecordsConsidered++;
    const method = closed(ownData(row, "method"), methods);
    if (path.pathSha256 && status(ownData(row, "status")) !== null) {
      const key = method + ":" + path.pathSha256;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const transition = ownData(page, "mainFrameLoaderTransition");
  for (let i = 0; i < Math.min(output.pendingCount, 8); i++) {
    const request = iterator.next().value[1], response = ownData(request, "responseRecord");
    const responseDescriptor = request && typeof request === "object" ? Object.getOwnPropertyDescriptor(request, "responseRecord") : null;
    const path = diagnosticPath(ownData(request, "url"), origin, assets);
    const method = closed(ownData(request, "method"), methods), session = ownData(request, "sessionId");
    const sessionRelation = relation(session, ownData(page, "sessionId"));
    const observed = ownData(request, "observedAtMs"), age = Number.isFinite(observed) && observed >= 0
      && Number.isFinite(now) && now >= observed ? now - observed : null;
    const sw = ownData(request, "responseFromServiceWorker");
    output.entries.push({ ordinal: i, ...path, method, resourceType: closed(ownData(request, "type"), resources),
      targetClass: sessionRelation === "SAME" ? "PAGE" : sessionRelation === "DIFFERENT" && ownData(request, "targetType") === "worker-or-child" ? "CHILD" : "UNKNOWN",
      sessionRelation, generationRelation: relation(ownData(request, "generation"), ownData(page, "recordsGeneration")),
      frameRelation: relation(ownData(request, "frameId"), ownData(page, "mainFrameId")),
      currentLoaderRelation: relation(ownData(request, "loaderId"), ownData(page, "currentMainFrameLoaderId")),
      previousLoaderRelation: relation(ownData(request, "loaderId"), ownData(transition, "previousLoaderId")),
      initiatorType: closed(ownData(request, "initiatorType"), ["parser", "script", "preload", "SignedExchange", "preflight", "other"]),
      responsePresent: responseDescriptor && !Object.hasOwn(responseDescriptor, "value") ? null : !!response && typeof response === "object",
      responseStatus: status(ownData(response, "status")),
      responseFromServiceWorker: typeof sw === "boolean" ? sw : null,
      ageMsCapped: age === null ? null : Math.min(300000, age), ageCapped: age === null ? null : age > 300000,
      samePathServerResponseRecordCount: path.pathSha256 ? counts.get(method + ":" + path.pathSha256) ?? 0 : null });
  }
  output.state = "OBSERVED_READ_ONLY";
  output.truncated = output.pendingCount > output.entries.length;
  return output;
}

export function rawDocumentMetadata(html) {
  const decode = (value) => value.replace(/&(?:amp|lt|gt|quot|#39);/g,
    (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]);
  const tag = [...html.matchAll(/<meta\b[^>]*>/giu)].find((m) => /\sname\s*=\s*(["'])description\1/iu.test(m[0]))?.[0] ?? "";
  return { title: decode(/<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1]?.trim() ?? ""),
    description: decode(/\scontent\s*=\s*(["'])([\s\S]*?)\1/iu.exec(tag)?.[2] ?? "") };
}

export function safeNetworkUrl(value) {
  try {
    const u = new URL(value, "http://127.0.0.1");
    return `${u.origin === "http://127.0.0.1" ? "" : u.origin}${u.pathname}`.slice(0, 240);
  } catch { return "INVALID_URL"; }
}

/** Raw target boundary; URL parsing must not normalize hostile selectors. */
export function classifyRequest(method, target, assets, scenario = PUBLIC_SCENARIO, options = {}) {
  const displayContract = options.displayContract ?? LEGACY_DISPLAY_CONTRACT;
  const definition = scenarioDefinition(scenario, displayContract);
  if (displayContract === MC10_DISPLAY_CONTRACT && method === "GET") {
    const query = mc10CatalogQuery(target,options.projectedTotal);
    if(query)return {kind:"catalog_fixture",path:DISPLAY_CATALOG_PATH,query};
    if(typeof target==="string"&&(target===DISPLAY_CATALOG_PATH||target.startsWith(DISPLAY_CATALOG_PATH+"?")||target.startsWith(DISPLAY_CATALOG_PATH+"/")))return {kind:"refused"};
  }
  if (scenario === PARTNER_COMPONENT_SCENARIO) {
    if (method !== "GET") return { kind: "refused" };
    if (partnerGallerySelection(target)) return { kind: "partner_document", path: target };
  }
  if (scenario === DISPLAY_SCENARIO && displayContract === LEGACY_DISPLAY_CONTRACT && method === "GET" && displayCatalogQuery(target))
    return { kind: "catalog_fixture", path: DISPLAY_CATALOG_PATH, query: displayCatalogQuery(target) };
  if (typeof target !== "string" || !target.startsWith("/") || /[%\\\s?#\u0000-\u001f]/u.test(target)
    || target.includes("//") || target.split("/").some((part) => part === "." || part === "..")) return { kind: "refused" };
  if (displayContract === MC10_DISPLAY_CONTRACT && method === "POST" && target === MC10_ADMISSION_PATH) return { kind: "mc10_admission", path: target };
  if (scenario === PUBLIC_SCENARIO && method === "POST" && target === "/api/research/referral/resolve") return { kind: "resolve_fixture" };
  if (method === "GET" && Object.hasOwn(definition.fixtures, target)) return { kind: "readonly_fixture", path: target };
  if (target.startsWith("/api/")) return { kind: "refused" };
  if (method !== "GET" && method !== "HEAD") return { kind: "refused" };
  if (definition.routes.includes(target)) return { kind: "document" };
  if (displayContract === MC10_DISPLAY_CONTRACT && Array.isArray(options.mc10MediaPaths) && options.mc10MediaPaths.includes(target) && assets.has(target.slice(1))) return {kind:"asset",path:target.slice(1)};
  if (scenario === DISPLAY_SCENARIO && displayContract === LEGACY_DISPLAY_CONTRACT && [...DISPLAY_MEDIA_PINS.map((pin) => pin.path), ...PREMIUM_MEDIA_PATHS].includes(target)
    && assets.has(target.slice(1))) return { kind: "asset", path: target.slice(1) };
  if (scenario === PREMIUM_ENTRY_SCENARIO && PREMIUM_MEDIA_PATHS.includes(target) && assets.has(target.slice(1))) return { kind: "asset", path: target.slice(1) };
  if (scenario !== PUBLIC_SCENARIO && (target === "/" || target.startsWith(PREMIUM_ENTRY_ROUTE))) return { kind: "refused" };
  if (target === "/research" || target.startsWith("/research/") || target === "/r" || target.startsWith("/r/")) return { kind: "refused" };
  const path = target.slice(1);
  if (path && assets.has(path) && path !== "PREVIEW-SOURCE.json"
    && (!/\.html?$/i.test(path) || path === "offline.html")) return { kind: "asset", path };
  return { kind: "refused" };
}

export function validateSourceBinding({ sourceHead, sourceTree, runnerHead, runnerTree, runnerParents, preview }) {
  requireThat([sourceHead, sourceTree, runnerHead, runnerTree].every((x) => SHA.test(x ?? "")), "SOURCE_IDENTITY_INVALID");
  requireThat(preview?.sourceHead === sourceHead && preview?.sourceTree === sourceTree && preview?.executedCommit === runnerHead
    && preview?.executedTree === runnerTree && preview?.node === "v20.19.0", "PREVIEW_SOURCE_MISMATCH");
  requireThat(Array.isArray(runnerParents) && runnerParents.every((p) => SHA.test(p))
    && Array.isArray(preview.executedParents) && preview.executedParents.length === runnerParents.length
    && preview.executedParents.every((p, i) => p === runnerParents[i]), "PREVIEW_PARENT_MISMATCH");
  const direct = runnerHead === sourceHead;
  const baseHead = preview.baseHead;
  requireThat((baseHead === null && direct) || SHA.test(baseHead ?? ""), "BASE_IDENTITY_INVALID");
  requireThat(direct ? sourceTree === runnerTree : baseHead !== null && runnerParents.length === 2
    && runnerParents[0] === baseHead && runnerParents[1] === sourceHead, "RUNNER_GRAPH_MISMATCH");
  const sourceAndRunnerTreeEqual = sourceTree === runnerTree;
  return { sourceHead, sourceTree, baseHead, runnerHead, runnerTree, executedParents: [...runnerParents],
    checkoutKind: direct ? "DIRECT_SOURCE_CHECKOUT" : "PR_MERGE_CHECKOUT", sourceAndRunnerTreeEqual,
    evidenceScope: sourceAndRunnerTreeEqual ? "EXECUTED_TREE_EQUAL_TO_SOURCE_TREE" : "EXECUTED_COMPOSITION_ONLY",
    evidenceCommit: runnerHead, evidenceTree: runnerTree };
}

export function validateIsolation({ uid, netNamespace, parentNetNamespace, interfaces, routes, effectiveCaps, noNewPrivs }) {
  requireThat(Number.isInteger(uid) && uid > 0, "PRIVILEGE_DROP_MISSING");
  requireThat(/^net:\[\d+\]$/.test(netNamespace ?? "") && /^net:\[\d+\]$/.test(parentNetNamespace ?? "")
    && netNamespace !== parentNetNamespace, "NETWORK_NAMESPACE_MISSING");
  requireThat(Array.isArray(interfaces) && interfaces.length === 1 && interfaces[0] === "lo", "NETWORK_INTERFACE_ESCAPE");
  requireThat(Array.isArray(routes) && routes.length === 0 && /^0+$/.test(effectiveCaps) && noNewPrivs === "1", "NETWORK_PRIVILEGE_ESCAPE");
  return { uid, netNamespace, parentNetNamespace, interfaces, routes, effectiveCaps, noNewPrivs };
}

export function validateFontCalibration(sample, { width, font }) {
  const expectedMedia = font === 16;
  requireThat(sample && sample.width === width && sample.dpr === 1 && sample.scale === 1
    && Math.abs(sample.root - font) < 0.05 && Math.abs(sample.rem - font) < 0.05
    && sample.emMedia === expectedMedia, "FONT_CAPABILITY_NOT_EXECUTED");
  return sample;
}

/** Same child, no reset: reserve cleanup and a small diagnostic-settlement tail. */
export function ownedStartupBudget(deadline, now) {
  return Math.max(0, Math.min(45000, Math.floor(deadline - now - 25000 - 1500)));
}

/** Receipt validation is not a substitute for the real captured closes below. */
export function validateProfileReceipts(receipts, scenario = PUBLIC_SCENARIO, displayContract = LEGACY_DISPLAY_CONTRACT) {
  const configurations = scenarioDefinition(scenario, displayContract).configurations;
  requireThat(receipts.length === configurations.length, "PROFILE_CONFIGURATION_INCOMPLETE");
  const profiles = new Set(), processes = new Set();
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i], processIdentity = `${r.browserPid}:${r.browserStartTicks}`;
    requireThat(r.configuration === configurations[i].name && typeof r.profile === "string" && r.profile.startsWith("/")
      && !profiles.has(r.profile) && Number.isInteger(r.browserPid) && r.browserPid > 0
      && /^\d+$/.test(r.browserStartTicks ?? "") && !processes.has(processIdentity), "PROFILE_IDENTITY_REUSED_OR_MISSING");
    requireThat(r.cleanup?.page === true && r.cleanup?.cdp === true && r.cleanup?.browserExit === true
      && r.cleanup?.profileRemoved === true, "PROFILE_CLEANUP_UNCONFIRMED");
    requireThat(Number.isFinite(r.startedMs) && Number.isFinite(r.closedMs) && r.closedMs >= r.startedMs
      && (!i || r.startedMs >= receipts[i - 1].closedMs), "PROFILE_LIFETIME_OVERLAP");
    profiles.add(r.profile); processes.add(processIdentity);
  }
  return true;
}

export function assertInventorySafe(root) {
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), info = lstatSync(path);
      requireThat(!info.isSymbolicLink(), "DIST_SYMLINK_REFUSED");
      if (info.isDirectory()) visit(path); else requireThat(info.isFile(), "DIST_SPECIAL_FILE_REFUSED");
    }
  };
  requireThat(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), "DIST_ROOT_INVALID");
  visit(root);
}

const FONT_SAMPLE = (width) => `(() => {
  const e = document.createElement('div'); e.style.cssText = 'width:1rem;height:1rem;position:absolute;visibility:hidden';
  document.documentElement.append(e); const rem = e.getBoundingClientRect().width; e.remove();
  return {width:innerWidth,dpr:devicePixelRatio,scale:visualViewport.scale,
    root:parseFloat(getComputedStyle(document.documentElement).fontSize),rem,
    emMedia:matchMedia('(min-width:${width / 24}em)').matches};
})()`;

/** Read the frozen public introduction and closed gate; never seed an owner. */
export const PREMIUM_ENTRY_VIEW_SOURCE = String.raw`(() => {
  const root=document.querySelector('[data-testid="quick-order-request-only"]');
  const normalize=value=>(value??'').trim().replace(/\s+/gu,' ');
  const observe=element=>{
    if(!element?.isConnected||!element.getClientRects().length) return {rendered:false,inViewport:false,text:'',href:null};
    const r=element.getBoundingClientRect(); let rendered=r.width>0&&r.height>0;
    for(let node=element;rendered&&node;node=node.parentElement) {
      const style=getComputedStyle(node);
      if(node.hasAttribute('inert')||node.getAttribute('aria-hidden')==='true'||style.display==='none'
        ||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0) rendered=false;
    }
    return {rendered,inViewport:rendered&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth,
      text:normalize(element.innerText),href:element.getAttribute('href')};
  };
  const catalog=root?.querySelector('.xenios-order-page--guest-catalog');
  const catalogHeading=catalog?.querySelector('header .xenios-order-catalog-start'),search=catalog?.querySelector('input[data-testid="request-catalog-search"]');
  const navBooking=catalog?.querySelector('.xenios-premium-catalog-header a');
  const admittedCatalog={heading:observe(catalogHeading),search:observe(search),searchLabel:normalize(search?.closest('label')?.textContent),
    navBooking:observe(navBooking),navBookingTarget:navBooking?.target??null,navBookingRel:navBooking?.rel??null,
    introductionCount:root?.querySelectorAll('.xenios-premium-introduction').length??-1,
    intakeCount:root?.querySelectorAll('form[aria-label="Contact information for catalog access"]').length??-1,
    dockCount:document.querySelectorAll('[data-testid="request-action-bar"]').length,
    spacerCount:document.querySelectorAll('[data-testid="request-action-bar-spacer"]').length};
  const hero=root?.querySelector('.xenios-premium-hero'), gate=root?.querySelector('#xenios-ea-request-start');
  // Count DOM remnants, including hidden ones, only in the legacy entrance.
  // Reviewed product images and captions inside catalog cards remain allowed.
  const entranceArtworkCount=root?.querySelectorAll('.xenios-premium-hero-art, .xenios-premium-hero img, .xenios-premium-hero figure, .xenios-premium-hero [data-artwork-sha256]').length??-1;
  const entranceArtworkCaptionCount=[...root?.querySelectorAll('.xenios-premium-hero p, .xenios-premium-hero figcaption')??[]]
    .filter(node=>normalize(node.textContent).includes('Packaging design shown. Current packaging may differ.')
      ||normalize(node.textContent).startsWith('Artwork preview.')).length;
  const conversationGridCount=root?.querySelectorAll('.xenios-premium-interests, [aria-label="Start a conversation by interest"]').length??-1;
  return {atExactEntry:location.pathname==='/earlyaccess'&&!location.search&&!location.hash,
    rootCount:document.querySelectorAll('[data-testid="quick-order-request-only"]').length,
    heading:observe(hero?.querySelector('h2')), primary:observe(hero?.querySelector('.xenios-premium-primary')),
    secondary:observe(hero?.querySelector('.xenios-premium-secondary')),
    secondaryTarget:hero?.querySelector('.xenios-premium-secondary')?.getAttribute('target')??null,
    secondaryRel:hero?.querySelector('.xenios-premium-secondary')?.getAttribute('rel')??null,
    gate:observe(gate?.querySelector('[role="status"]')),
    privateFields:root?.querySelectorAll('form,input,select,textarea').length??-1,
    privateMounts:root?.querySelectorAll('[data-testid="quick-order-agreement-mount"],.xenios-ea-entry-request').length??-1,
    contacts:[...root?.querySelectorAll('.xenios-premium-contacts a')??[]].slice(0,13).map(a=>observe(a)),
    entranceArtworkCount,entranceArtworkCaptionCount,conversationGridCount,admittedCatalog};
})()`;

export function premiumEntryAssertions(sample) {
  const primary = sample?.primary, secondary = sample?.secondary;
  return [
    { name: "premium_exact_entry_and_visible_hero", passed: sample?.atExactEntry === true && sample.rootCount === 1
      && sample.heading?.rendered === true && sample.heading.text === PREMIUM_ENTRY_EXPECTED.heading },
    { name: "premium_primary_is_guarded_intake_anchor", passed: primary?.rendered === true
      && primary.text === PREMIUM_ENTRY_EXPECTED.primary && primary.href === "#xenios-ea-request-start" },
    { name: "premium_booking_is_href_only", passed: secondary?.rendered === true
      && secondary.text === `${PREMIUM_ENTRY_EXPECTED.secondary} (opens in a new tab)`
      && secondary.href === PREMIUM_CONTACT_HREFS[2] && sample.secondaryTarget === "_blank"
      && ["noopener", "noreferrer"].every((token) => sample.secondaryRel?.split(/\s+/u).includes(token)) },
    { name: "premium_gate_remains_truthfully_unavailable", passed: sample?.gate?.rendered === true
      && sample.gate.text.includes(PREMIUM_ENTRY_EXPECTED.unavailable) },
    { name: "premium_no_private_intake_or_agreement", passed: sample?.privateFields === 0 && sample.privateMounts === 0 },
    { name: "premium_twelve_public_contact_destinations", passed: Array.isArray(sample?.contacts) && sample.contacts.length === 12
      && PREMIUM_CONTACT_HREFS.every((href) => sample.contacts.some((link) => link.rendered === true && link.href === href)) },
    { name: "premium_entrance_artwork_and_captions_absent", passed: sample?.entranceArtworkCount === 0
      && sample.entranceArtworkCaptionCount === 0 },
    { name: "premium_entrance_conversation_grid_absent", passed: sample?.conversationGridCount === 0 },
  ];
}

/** Legacy8 is pre-admitted synthetic compatibility, never a real admission. */
export function legacyAdmittedChromeAssertions(sample){
  const catalog=sample?.admittedCatalog;
  return [
    {name:'legacy_actual_admitted_child_products',passed:sample?.atExactEntry===true&&sample.rootCount===1
      &&catalog?.heading.rendered===true&&catalog.heading.text==='Browse the catalog'
      &&catalog.search.rendered===true&&catalog.searchLabel==='Search catalog'&&catalog.intakeCount===0},
    {name:'legacy_no_entrance_or_empty_products_dock',passed:catalog?.introductionCount===0&&catalog.dockCount===0&&catalog.spacerCount===0},
    {name:'legacy_actual_catalog_booking_href_only',passed:catalog?.navBooking.rendered===true&&catalog.navBooking.href===PREMIUM_CONTACT_HREFS[2]
      &&catalog.navBookingTarget==='_blank'&&['noopener','noreferrer'].every(value=>catalog.navBookingRel?.split(/\s+/u).includes(value))},
  ];
}/** Order comes from the real current page, not a guessed control or extra Tab. */
export function premiumTabSuccessor(order, currentIdentity, reverse = false) {
  requireThat(Array.isArray(order) && order.length > 0 && order.length <= 128
    && new Set(order).size === order.length && order.every((id) => typeof id === "string" && id.length > 0 && id.length <= 512),
  "PREMIUM_KEYBOARD_ORDER_UNSUPPORTED");
  requireThat(currentIdentity === null || order.includes(currentIdentity), "PREMIUM_KEYBOARD_ACTIVE_NOT_IN_ORDER");
  if (currentIdentity === null) return order[reverse ? order.length - 1 : 0];
  return order[(order.indexOf(currentIdentity) + (reverse ? order.length - 1 : 1)) % order.length];
}

export const PREMIUM_PRIMARY_FOCUSED_SOURCE = `document.activeElement?.matches('[data-testid="quick-order-request-only"] .xenios-premium-hero a.xenios-premium-primary[href="#xenios-ea-request-start"]') === true`;

export async function premiumEntryKeyboardProof(page, bounded, progress = {}, capturePrimaryFocus = null) {
  progress.state = "INCOMPLETE"; progress.steps = [];
  let primaryReached = false;
  // Bounded traversal to the real primary link, then one reverse Tab. Never
  // activate links, policy, intake or a form, or skip a rejected focus sample.
  const step = async (reverse) => {
    const baseline = await bounded(page.evaluate(FOCUS_BASELINE_SOURCE));
    const current = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    const currentIdentity = current.body ? null : current.identity;
    const expectedIdentity = premiumTabSuccessor(baseline.tabbableIdentities, currentIdentity, reverse);
    await bounded(page.pressTab({ shift: reverse }));
    const actual = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    const observation = { reverse, expectedIdentity, actual };
    progress.steps.push(observation);
    requireThat(!actual.body && actual.identity === expectedIdentity && actual.indicator && actual.inViewport,
      "PREMIUM_KEYBOARD_FOCUS_NOT_VISIBLE_OR_LOGICAL");
    return observation;
  };
  for (let i = 0; i < 32; i++) {
    const observation = await step(false);
    observation.actualPrimaryLink = await bounded(page.evaluate(PREMIUM_PRIMARY_FOCUSED_SOURCE));
    if (observation.actualPrimaryLink === true) { primaryReached = true; break; }
  }
  requireThat(primaryReached, "PREMIUM_PRIMARY_NOT_KEYBOARD_REACHABLE");
  // Capture the proven primary focus, before the required reverse observation.
  if (capturePrimaryFocus) progress.primaryFocusScreenshot = await capturePrimaryFocus();
  await step(true);
  progress.state = "NATIVE_TAB_ONLY_OBSERVED";
  return { ...progress, primaryReached, activationExecuted: false, authPolicyIntakeSubmitted: false, destinationsVisited: false };
}

/** Read-only geometry, not painted/occlusion proof or a CSS acceptance oracle. */
export function collectDisplayCatalogGeometry(doc, view, identities) {
  const safe = (read) => { try { return read(); } catch { return null; } };
  const number = (value) => Number.isFinite(value) ? value : null;
  const css = (value) => typeof value === "string" ? value.slice(0, 64) : null;
  const box = (rect) => rect ? Object.fromEntries(["left", "top", "right", "bottom", "width", "height"].map((key) => [key, number(rect[key])])) : null;
  const width = number(view?.innerWidth), height = number(view?.innerHeight);
  const element = (node) => {
    if (!node) return { state: "NOT_PRESENT" };
    const rect = safe(() => box(node.getBoundingClientRect())), style = safe(() => view.getComputedStyle(node));
    const complete = rect && Object.values(rect).every((value) => value !== null);
    return { state: complete && style ? "OBSERVED_GEOMETRY_ONLY" : "UNAVAILABLE_OR_PARTIAL",
      rect, clientHeight: number(node.clientHeight), scrollHeight: number(node.scrollHeight),
      inViewport: complete && width !== null && height !== null ? rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width : null,
      fullyInViewport: complete && width !== null && height !== null ? rect.left >= 0 && rect.top >= 0 && rect.right <= width && rect.bottom <= height : null,
      rendered: style ? safe(() => node.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse") : null,
      effectiveOverflowY: css(style?.overflowY), effectiveOverflowX: css(style?.overflowX), maxHeight: css(style?.maxHeight),
      lineClamp: css(style?.webkitLineClamp ?? safe(() => style?.getPropertyValue("-webkit-line-clamp"))),
      paintedOrUnobscured: "NOT_ESTABLISHED_GEOMETRY_ONLY" };
  };
  const normalized = (value) => (value ?? "").trim().replace(/\s+/gu, " ");
  const observedCards = safe(() => Array.from(doc.querySelectorAll(".xenios-order-cards > article")));
  const cards = observedCards ?? [];
  const rootScrollHeight = number(doc?.documentElement?.scrollHeight), bodyScrollHeight = number(doc?.body?.scrollHeight);
  const lengths = [rootScrollHeight, bodyScrollHeight].filter((value) => value !== null);
  return { state: observedCards !== null && width !== null && height !== null && lengths.length === 2 ? "OBSERVED_GEOMETRY_ONLY" : "UNAVAILABLE_OR_PARTIAL",
    scope: "SYNTHETIC_SAME_PAGE_GEOMETRY_NOT_PAINTED_OR_ELIGIBILITY_PROOF", viewport: { width, height },
    page: { documentScrollHeight: rootScrollHeight, bodyScrollHeight, pageLength: lengths.length ? Math.max(...lengths) : null },
    cardCount: cards.length, droppedCards: Math.max(0, cards.length - 9), cards: cards.slice(0, 9).map((card, ordinal) => {
      const name = normalized(card.querySelector("h2")?.textContent), specification = normalized(card.querySelector(".xenios-order-card-identity > p")?.textContent);
      const matches = identities.filter((identity) => identity.name === name && identity.specification === specification);
      const summary = card.querySelector(".xenios-order-card-description--reviewed"), summaryMetrics = element(summary);
      const range = summary ? safe(() => { const range = doc.createRange(); range.selectNodeContents(summary);
        const rects = Array.from(range.getClientRects()); return { state: "OBSERVED_GEOMETRY_ONLY", bounds: box(range.getBoundingClientRect()),
          rects: rects.slice(0, 32).map(box), totalRects: rects.length, droppedRects: Math.max(0, rects.length - 32) }; }) : null;
      const ancestors = []; let current = summary?.parentElement ?? null, depth = 0, relevantCount = 0, unavailableAncestorCount = 0;
      for (; current && depth < 16; current = current.parentElement, depth++) {
        const style = safe(() => view.getComputedStyle(current));
        if (!style) { unavailableAncestorCount++; continue; }
        const clamp = style.webkitLineClamp ?? safe(() => style.getPropertyValue("-webkit-line-clamp"));
        if ([style.overflowX, style.overflowY].some((value) => ["hidden", "clip", "auto", "scroll"].includes(value))
          || style.maxHeight && style.maxHeight !== "none" || clamp && !["none", "normal", "0"].includes(clamp)) {
          relevantCount++; if (ancestors.length < 8) ancestors.push({ depth, tag: String(current.tagName ?? "").toLowerCase().slice(0, 24), ...element(current) });
        }
      }
      return { ordinal, fixtureIdentity: matches.length === 1 ? matches[0].identity : null,
        identityStatus: matches.length === 1 ? "MATCHED_EXACT_FIXTURE_NAME_AND_SPECIFICATION" : "UNMATCHED_OR_AMBIGUOUS",
        card: element(card), summary: { ...summaryMetrics, range: range ?? { state: summary ? "UNAVAILABLE" : "NOT_PRESENT" },
          clippingAncestors: ancestors, relevantAncestorCount: relevantCount, unavailableAncestorCount, droppedAncestors: Math.max(0, relevantCount - 8),
          ancestorScanTruncated: Boolean(current), ancestorScanLimit: 16 } };
    }) };
}
/** Computed source values only; reviewers, not this helper, judge contrast. */
export function collectDisplaySummaryContrast(doc, view) {
  const text = (value, cap = 64) => typeof value === "string" ? value.slice(0, cap) : null;
  const observe = (node, withText = true) => {
    try {
      const style = view.getComputedStyle(node), r = node.getBoundingClientRect();
      return { state: "OBSERVED_COMPUTED_STYLE_ONLY", foreground: text(style.color), background: text(style.backgroundColor),
        opacity: text(style.opacity), visibility: text(style.visibility), display: text(style.display),
        backgroundImagePresent: Boolean(style.backgroundImage && style.backgroundImage !== "none"),
        text: withText ? text(node.textContent?.trim().replace(/\s+/gu, " "), 220) : null,
        rect: Object.fromEntries(["left", "top", "right", "bottom", "width", "height"].map((key) => [key, Number.isFinite(r[key]) ? r[key] : null])),
        inViewport: r.bottom > 0 && r.top < view.innerHeight && r.right > 0 && r.left < view.innerWidth,
        rendered: node.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse",
        paintedOrContrastPass: "NOT_ESTABLISHED_COMPUTED_VALUES_ONLY" };
    } catch { return { state: "UNAVAILABLE" }; }
  };
  try {
    const panels = Array.from(doc.querySelectorAll(".xenios-order-summary"));
    if (panels.length !== 1) return { state: panels.length ? "AMBIGUOUS" : "NOT_PRESENT", panelCount: panels.length };
    const panel = panels[0], rows = [
      ["heading", "h2"], ["status", 'p[role="status"]'],
      ["emptyState", ".xenios-order-summary-content > p:not([role]):not(.xenios-order-small)"],
      ["finalReviewNotice", "p.xenios-order-small"],
    ];
    const observations = Object.fromEntries(rows.map(([name, selector]) => {
      const matches = Array.from(panel.querySelectorAll(selector));
      return [name, { state: matches.length === 1 ? "OBSERVED_COMPUTED_STYLE_ONLY" : matches.length ? "AMBIGUOUS" : "NOT_PRESENT",
        count: matches.length, samples: matches.slice(0, 4).map((node) => observe(node)), dropped: Math.max(0, matches.length - 4) }];
    }));
    const backgrounds = []; let current = panel.parentElement;
    for (let depth = 0; current && depth < 8; depth++, current = current.parentElement) backgrounds.push({ depth, ...observe(current, false) });
    return { state: "OBSERVED_COMPUTED_VALUES_ONLY", scope: "SYNTHETIC_SUMMARY_STYLE_NOT_A_LITERAL_OR_CONTRAST_PASS",
      panel: observe(panel, false), observations, ancestorBackgrounds: backgrounds, ancestorScanTruncated: Boolean(current) };
  } catch { return { state: "UNAVAILABLE" }; }
}
export const DISPLAY_CATALOG_VIEW_SOURCE = String.raw`(() => {
  const normalized=value=>(value??'').trim().replace(/\s+/gu,' ');
  const cards=[...document.querySelectorAll('.xenios-order-cards > article')];
  return {summaryContrast:(${collectDisplaySummaryContrast.toString()})(document,window), geometry:(${collectDisplayCatalogGeometry.toString()})(document,window,${JSON.stringify(DISPLAY_ROW_STUBS.map((stub) => ({ identity: stub.identity, name: stub.item.productName, specification: stub.item.specification }))) }), cards:cards.slice(0,9).map(card=>({name:normalized(card.querySelector('h2')?.textContent),
    specification:normalized(card.querySelector('.xenios-order-card-identity > p')?.textContent),
    summary:card.querySelector('.xenios-order-card-description--reviewed')?normalized(card.querySelector('.xenios-order-card-description--reviewed').textContent):null,
    text:normalized(card.innerText),media:[...card.querySelectorAll('img')].slice(0,2).map(img=>{
      const r=img.getBoundingClientRect(); let rendered=r.width>0&&r.height>0;
      for(let node=img;rendered&&node;node=node.parentElement) {const s=getComputedStyle(node);
        if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0)rendered=false;}
      return {path:img.getAttribute('src'),alt:img.alt,fit:getComputedStyle(img).objectFit,rendered,
        complete:img.complete,naturalWidth:img.naturalWidth,inViewport:rendered&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth};
    }),representation:card.querySelector('[data-representation]')?.getAttribute('data-representation')??null,
    canAdd:[...card.querySelectorAll('button')].some(button=>button.textContent.trim().startsWith('Add')&&!button.disabled)})),
    cardCount:cards.length,cartText:normalized(document.querySelector('.xenios-premium-catalog-header')?.textContent),
    contactInputs:document.querySelectorAll('.xenios-order-page input[name="email"],.xenios-order-page input[type="email"],.xenios-order-page input[name="fullLegalName"]').length,
    stepContact:!![...document.querySelectorAll('h2')].find(h=>h.textContent==='Contact details'),
    dialogOpen:!!document.querySelector('[role="dialog"]'),hcgImages:cards.find(c=>c.querySelector('h2')?.textContent==='HCG')?.querySelectorAll('img').length??-1,
    fedexImages:cards.find(c=>c.querySelector('h2')?.textContent==='FedEx Standard Overnight')?.querySelectorAll('img').length??-1};
})()`;

export function displayCatalogAssertions(sample, expected) {
  const rows = sample?.cards ?? [], hcg = rows.find((r) => r.name === "HCG"), shipping = rows.find((r) => r.name === "FedEx Standard Overnight");
  return [
    { name: "synthetic_eight_exact_canonical_rows", passed: sample?.cardCount === 8 && Array.isArray(expected) && expected.length === 8
      && expected.every((item) => rows.filter((row) => row.name === item.name && row.specification === item.specification).length === 1) },
    { name: "synthetic_full_reviewed_summaries", passed: expected?.every((item) => rows.find((row) => row.name === item.name)?.summary === item.summary) === true },
    { name: "synthetic_reviewed_media_mapping", passed: expected?.every((item) => {
      const row = rows.find((r) => r.name === item.name);
      return row && (item.media ? row.media.length === 1 && row.media[0].rendered === true && row.media[0].path === item.media && row.media[0].fit === "contain"
        && row.media[0].alt.length > 0 && (!row.media[0].inViewport || row.media[0].complete && row.media[0].naturalWidth > 0)
        && row.representation === item.representation : row.media.length === 0);
    }) === true },
    { name: "synthetic_hcg_neutral_hold_no_disputed_art", passed: hcg?.specification === "HCG strength unverified and formulation pending"
      && hcg.canAdd === true && sample?.hcgImages === 0 && !/120000|120,000|120\s*000/iu.test(hcg.text)
      && hcg.text.includes("Strength and formulation are being verified") },
    { name: "synthetic_fedex_non_merchandise", passed: shipping?.canAdd === false && sample?.fedexImages === 0
      && shipping.text.includes("Shipping or service entry, not a product request") },
    { name: "synthetic_no_price_or_purchase_claim", passed: rows.every((row) => !/\$\s*\d|\bUSD\s*\d|\bbuy now\b/iu.test(row.text)) },
    { name: "synthetic_cart_zero_no_contact_step", passed: sample?.cartText.includes("Quote cart (0)") === true
      && sample.contactInputs === 0 && sample.stepContact === false && sample.dialogOpen === false },
  ];
}

async function waitForDisplayCondition(page, expression, bounded, code) {
  for (let i = 0; i < 40; i++) {
    if (await bounded(page.evaluate(expression))) return;
    await bounded(new Promise((resolve) => setTimeout(resolve, 75)), 200);
  }
  throw new Error(code);
}

/** Actual positioning/paint only; no focus, handler, style, storage or data writes. */
export async function paintDisplaySection(page, selector, bounded) {
  requireThat(typeof selector === "string" && DISPLAY_SECTION_SELECTORS.includes(selector), "DISPLAY_SECTION_NOT_APPROVED");
  return bounded(page.evaluate(`(async()=>{
    const matches=document.querySelectorAll(${JSON.stringify(selector)});
    if(matches.length!==1) return {unique:false};
    const target=matches[0]; target.scrollIntoView({block:'center',behavior:'instant'});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const r=target.getBoundingClientRect(),style=getComputedStyle(target),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {unique:true,rendered:r.width>0&&r.height>0&&style.display!=='none'&&style.visibility!=='hidden',
      inViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
      unobscured:target.contains(hit),width:r.width,height:r.height,scrollX,scrollY};
  })()`));
}

export const DISPLAY_SECTION_SELECTORS = Object.freeze([
  ".xenios-order-cards > article:first-child h2",
  '.xenios-order-card:nth-child(7) h2', '.xenios-order-card:nth-child(8) h2',
  '.xenios-order-optional-guide [data-testid="catalog-guide"] > h2', '.xenios-premium-contacts:not(details) h2',
]);

/** Native inputs only. A rejected sample stops traversal; no click/focus bypass. */
export async function nativeDisplayTarget(page, expression, bounded, progress, limit = 80) {
  requireThat([DISPLAY_DETAILS_TARGET, DISPLAY_MOTS_TARGET, DISPLAY_SEARCH_TARGET, DISPLAY_FAQ_TARGET].includes(expression), "DISPLAY_NATIVE_TARGET_NOT_APPROVED");
  requireThat(Number.isInteger(limit) && limit > 0 && limit <= 80, "DISPLAY_KEYBOARD_LIMIT_INVALID");
  for (let i = 0; i < limit; i++) {
    await tabWithFreshFocusBaseline(page, bounded);
    const sample = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    const matched = await bounded(page.evaluate(expression));
    progress.push({ sample, matched });
    requireThat(!sample.body && sample.indicator && sample.inViewport, "DISPLAY_NATIVE_FOCUS_NOT_VISIBLE");
    if (matched === true) return sample;
  }
  throw new Error("DISPLAY_NATIVE_TARGET_UNREACHABLE");
}

export const DISPLAY_DETAILS_TARGET = `document.activeElement?.matches('button[aria-label="View details for BPC-157, BPC-157 10 mg"]') === true`;
// Historical export names are retained; only these actual frozen native targets qualify.
export const DISPLAY_MOTS_TARGET = `document.activeElement?.matches('input[data-testid="request-catalog-search"]') === true && document.activeElement.closest('label')?.textContent.trim()==='Search catalog'`;
export const DISPLAY_SEARCH_TARGET = `document.activeElement?.matches('input[data-testid="request-catalog-search"]') === true && document.activeElement.closest('label')?.textContent.trim()==='Search catalog'`;
export const DISPLAY_FAQ_TARGET = `document.activeElement?.matches('.xenios-order-optional-guide > summary') === true && document.activeElement.textContent.trim()==='Help me browse (optional)'`;
/** Scope the existing versioned collector order; no replacement visibility rules. */
export function collectDisplayDialogScope(doc, state, globalOrder) {
  const refuse = (reason, count = null) => ({ state: "UNOBSERVABLE_DIALOG_SCOPE", reason, dialogCount: count, order: [] });
  try {
    const dialogs = Array.from(doc.querySelectorAll('[role="dialog"][data-state="open"]'));
    if (dialogs.length !== 1) return refuse("ABSENT_OR_AMBIGUOUS", dialogs.length);
    const dialog = dialogs[0];
    if (!dialog.classList.contains("xenios-premium-product-dialog") || dialog.querySelector("h2")?.textContent.trim() !== "BPC-157") return refuse("UNEXPECTED_DIALOG", 1);
    if (!state?.baselines || typeof state.baselines.get !== "function" || !Array.isArray(globalOrder)
      || globalOrder.length > 512 || globalOrder.some((id) => typeof id !== "string" || !id || id.length > 4096)
      || new Set(globalOrder).size !== globalOrder.length) return refuse("BASELINE_UNOBSERVABLE", 1);
    const nodes = [dialog, ...dialog.querySelectorAll("*")];
    if (nodes.length > 512) return refuse("SCOPE_LIMIT", 1);
    const identities = new Set();
    for (const node of nodes) {
      const id = state.baselines.get(node)?.identity;
      if (!id) continue;
      if (identities.has(id)) return refuse("AMBIGUOUS_IDENTITY", 1);
      identities.add(id);
    }
    const order = globalOrder.filter((id) => identities.has(id));
    if (!order.length) return refuse("NO_OBSERVABLE_SCOPED_TAB_STOP", 1);
    return { state: "OBSERVED_SAME_BASELINE_DIALOG_ORDER", dialogCount: 1, order,
      globalCount: globalOrder.length, excludedBackgroundCount: globalOrder.length - order.length,
      inspectedNodes: nodes.length, activeInside: dialog.contains(doc.activeElement),
      activeIdentity: state.baselines.get(doc.activeElement)?.identity ?? null };
  } catch { return refuse("UNOBSERVABLE_API"); }
}

export const DISPLAY_DIALOG_BASELINE_SOURCE = `(() => {
  const baseline = ${FOCUS_BASELINE_SOURCE};
  return { ...baseline, dialogScope: (${collectDisplayDialogScope.toString()})(document, window.__xeniosEvidenceFocusStateV2, baseline.tabbableIdentities) };
})()`;
export const DISPLAY_DIALOG_FOCUS_PROBE_SOURCE = `(() => {
  const sample = ${FOCUS_PROBE_SOURCE};
  const dialogs = [...document.querySelectorAll('[role="dialog"][data-state="open"]')], dialog = dialogs[0];
  const recognized = dialogs.length === 1 && dialog.classList.contains('xenios-premium-product-dialog') && dialog.querySelector('h2')?.textContent.trim() === 'BPC-157';
  return { ...sample, dialogCount: dialogs.length, insideDialog: recognized && dialog.contains(document.activeElement) };
})()`;
export const DISPLAY_DIALOG_PRESENT = `!!document.querySelector('[role="dialog"][data-state="open"]')`;
export const DISPLAY_DIALOG_FOCUS = `document.querySelector('[role="dialog"]')?.contains(document.activeElement) === true`;
export const DISPLAY_DIALOG_CLOSED_AND_RETURNED = `!(${DISPLAY_DIALOG_PRESENT}) && (${DISPLAY_DETAILS_TARGET})`;

export async function displayDetailsProof(page, bounded, capture, progress = {}) {
  progress.state = "INCOMPLETE"; progress.walk = [];
  const opening = await nativeDisplayTarget(page, DISPLAY_DETAILS_TARGET, bounded, progress.walk);
  await dispatchActivationKey(page, "Enter", bounded);
  await waitForDisplayCondition(page, DISPLAY_DIALOG_PRESENT, bounded, "DISPLAY_DETAILS_NOT_OPEN");
  const dialog = await bounded(page.evaluate(`(()=>{const d=document.querySelector('[role="dialog"]'),r=d.getBoundingClientRect();return {
    title:d.querySelector('h2')?.textContent,description:d.innerText.includes('Final quantities, prices and availability are confirmed during review.'),
    caption:d.innerText.includes('Packaging design shown. Current packaging may differ.'),
    contacts:!!d.querySelector('.xenios-premium-contacts'),inViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};})()`));
  progress.dialog = dialog;
  requireThat(dialog.title === "BPC-157" && dialog.description && dialog.caption && dialog.contacts && dialog.inViewport,
    "DISPLAY_DETAILS_CONTENT_OR_VIEWPORT_INVALID");
  // Establish real focused-node baselines, then cross both actual trap edges.
  await tabWithFreshFocusBaseline(page, bounded);
  requireThat(await bounded(page.evaluate(DISPLAY_DIALOG_FOCUS)), "DISPLAY_DETAILS_FOCUS_ESCAPED");
  await tabWithFreshFocusBaseline(page, bounded, { shift: true });
  const baseline = await bounded(page.evaluate(DISPLAY_DIALOG_BASELINE_SOURCE));
  const scoped = baseline.dialogScope;
  const first = await bounded(page.evaluate(DISPLAY_DIALOG_FOCUS_PROBE_SOURCE));
  // Preserve decisive observations before any rejecting gate. These records are
  // incomplete diagnostics until every native trap/return check has passed.
  progress.focus = {
    state: "INCOMPLETE",
    baseline: { captured: baseline.captured ?? null, added: baseline.added ?? null,
      tabbableIdentities: baseline.tabbableIdentities.slice(0, 128), total: baseline.tabbableIdentities.length,
      dropped: Math.max(0, baseline.tabbableIdentities.length - 128), truncated: baseline.tabbableIdentities.length > 128 },
    dialogScope: { ...scoped, order: scoped.order.slice(0, 128), total: scoped.order.length,
      dropped: Math.max(0, scoped.order.length - 128), truncated: scoped.order.length > 128 },
    expectedGlobalFirst: baseline.tabbableIdentities[0] ?? null,
    expectedFirst: scoped.order[0] ?? null, expectedLast: scoped.order.at(-1) ?? null,
    first, firstPredicates: { identity: first.identity === scoped.order[0],
      indicator: Boolean(first.indicator), inViewport: Boolean(first.inViewport) },
  };
  requireThat(scoped.state === "OBSERVED_SAME_BASELINE_DIALOG_ORDER", "DISPLAY_DETAILS_DIALOG_SCOPE_UNOBSERVABLE");
  requireThat(first.identity === scoped.order[0] && first.indicator && first.inViewport && first.insideDialog === true,
    "DISPLAY_DETAILS_FIRST_FOCUS_INVALID");
  await tabWithFreshFocusBaseline(page, bounded, { shift: true });
  const last = await bounded(page.evaluate(DISPLAY_DIALOG_FOCUS_PROBE_SOURCE));
  progress.focus.last = last;
  requireThat(last.identity === scoped.order.at(-1) && last.indicator && last.inViewport && last.insideDialog === true
    && await bounded(page.evaluate(DISPLAY_DIALOG_FOCUS)), "DISPLAY_DETAILS_REVERSE_TRAP_FAILED");
  await tabWithFreshFocusBaseline(page, bounded);
  const wrapped = await bounded(page.evaluate(DISPLAY_DIALOG_FOCUS_PROBE_SOURCE));
  progress.focus.wrapped = wrapped;
  requireThat(wrapped.identity === first.identity && wrapped.indicator && wrapped.inViewport && wrapped.insideDialog === true
    && await bounded(page.evaluate(DISPLAY_DIALOG_FOCUS)), "DISPLAY_DETAILS_FORWARD_TRAP_FAILED");
  progress.focus.state = "NATIVE_TRAP_OBSERVED"; progress.screenshot = await capture();
  for (const type of ["keyDown", "keyUp"]) await bounded(page.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }));
  await waitForDisplayCondition(page, DISPLAY_DIALOG_CLOSED_AND_RETURNED, bounded, "DISPLAY_DETAILS_NOT_CLOSED_OR_FOCUS_NOT_RETURNED");
  const returned = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
  progress.returned = returned;
  requireThat(returned.identity === opening.identity && returned.indicator && returned.inViewport, "DISPLAY_DETAILS_FOCUS_RETURN_FAILED");
  progress.state = "NATIVE_DETAILS_DISPLAY_ONLY_OBSERVED";
  return progress;
}

export function displayCapturePlan() {
  return DISPLAY_CONFIGURATIONS.flatMap((config) => ["catalog", "details", "hcg-hold", "fedex-non-merchandise", "optional-guide", "footer-contact"].map((section) => ({
    configuration: config.name, section, selected: section === "catalog"
      || section === "details" && ["display-desktop1440", "display-phone375"].includes(config.name)
      || ["hcg-hold", "fedex-non-merchandise"].includes(section) && config.name === "display-desktop1440"
      || section === "optional-guide" && config.name === "display-phone375"
      || section === "footer-contact" && ["display-desktop1440", "display-phone375-200"].includes(config.name),
    state: "NOT_RUN", scope: "SYNTHETIC_DISPLAY_ONLY_NO_REAL_ACTOR_PROOF",
  })));
}

/** The optional guide precedes card Details in the actual catalog's native Tab order. */
export async function displayCatalogDisclosureProofs(configuration, actions) {
  requireThat(DISPLAY_CONFIGURATIONS.some((entry) => entry.name === configuration), "DISPLAY_CONFIGURATION_NOT_APPROVED");
  requireThat(typeof actions?.guide === "function" && typeof actions?.details === "function", "DISPLAY_DISCLOSURE_ACTIONS_INVALID");
  if (configuration === "display-phone375") await actions.guide();
  if (["display-desktop1440", "display-phone375"].includes(configuration)) await actions.details();
}

export async function displaySearchProof(page, bounded, progress = {}) {
  progress.state = "INCOMPLETE"; progress.walk = [];
  await assertNoDisplayAttempt(page,bounded);
  const acquired = await nativeDisplayTarget(page, DISPLAY_MOTS_TARGET, bounded, progress.walk);
  progress.acquired = acquired;
  await bounded(page.send('Input.insertText',{text:'MOTS-c'}));
  await waitForDisplayCondition(page, `document.querySelectorAll('.xenios-order-cards > article').length===1 && document.querySelector('.xenios-order-card h2')?.textContent==='MOTS-C'`, bounded, "DISPLAY_MOTS_SEARCH_FAILED");
  requireThat(await bounded(page.evaluate(`document.querySelector('.xenios-premium-catalog-header')?.textContent.includes('Quote cart (0)')`))===true,'DISPLAY_SEARCH_CHANGED_CART');
  progress.casefoldMotsCanonical = true;
  // Filtering retains this controlled input: re-prove the native focus, without a second Tab walk.
  const retained = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
  const matched = await bounded(page.evaluate(DISPLAY_SEARCH_TARGET));
  progress.retainedTarget = { sample: retained, matched };
  requireThat(typeof acquired.identity === "string" && acquired.identity.length > 0
    && retained.identity === acquired.identity && retained.body === false
    && retained.indicator === true && retained.inViewport === true && matched === true,
    "DISPLAY_SEARCH_NATIVE_FOCUS_NOT_RETAINED");
  for (const [key, code, windowsVirtualKeyCode, modifiers] of [["a", "KeyA", 65, 2], ["Backspace", "Backspace", 8, 0]])
    for (const type of ["keyDown", "keyUp"]) await bounded(page.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode, modifiers }));
  await waitForDisplayCondition(page, `document.querySelectorAll('.xenios-order-cards > article').length===8`, bounded, "DISPLAY_SEARCH_RESET_FAILED");
  await assertNoDisplayAttempt(page,bounded);
  progress.state = "NATIVE_FINITE_SEARCH_DISPLAY_ONLY_OBSERVED";
  return progress;
}

export const DISPLAY_NO_ATTEMPT_SOURCE = `['xenios.assisted-order.intent-attempt.v1','xenios.assisted-order.intent-receipt.v1','xenios.assisted-order.draft.v1'].every(key=>sessionStorage.getItem(key)===null&&localStorage.getItem(key)===null)`;
export async function assertNoDisplayAttempt(page, bounded) {
  requireThat(await bounded(page.evaluate(DISPLAY_NO_ATTEMPT_SOURCE)) === true, "DISPLAY_ATTEMPT_OR_RECEIPT_PRESENT");
  return true;
}

/** This observer never focuses; it records the existing baseline before app focus. */
export function installMC10FocusObservation(win,captureBaseline){
  if(win.location.pathname!=='/earlyaccess'||win.location.search||win.location.hash||win.__xeniosMC10FocusObservationV1)return null;
  const owner=win.HTMLElement.prototype,original=Object.getOwnPropertyDescriptor(owner,'focus');
  if(typeof original?.value!=='function')return null;
  let capturing=false,restored=false,depth=0;const counts={calls:0,baselines:0,failures:0,throws:0,reentrant:0};
  const observed=function(...args){
    counts.calls++;depth++;if(depth>1)counts.reentrant++;
    try{
      if(capturing)counts.failures++;
      else{capturing=true;try{captureBaseline();counts.baselines++;}catch{counts.failures++;}finally{capturing=false;}}
      try{return Reflect.apply(original.value,this,args);}catch(error){counts.throws++;throw error;}
    }finally{depth--;}
  };
  Object.defineProperty(owner,'focus',{...original,value:observed});
  const api=Object.freeze({snapshot(){return {scope:'PASS_THROUGH_BASELINE_BEFORE_APP_FOCUS',...counts,restored};},
    restore(){if(arguments.length||restored||Object.getOwnPropertyDescriptor(owner,'focus')?.value!==observed)return false;
      Object.defineProperty(owner,'focus',original);restored=true;return true;}});
  Object.defineProperty(win,'__xeniosMC10FocusObservationV1',{value:api,configurable:true});return api;
}
export function mc10FocusPreludeSource(){return `(${installMC10FocusObservation.toString()})(window,()=>(${FOCUS_BASELINE_SOURCE}))`;}

/** Public row geometry only. Contact values/body/answers never enter evidence. */
export function collectMC10View(doc,win,binding,expectedRows=[]){
  const s=binding.selectors,one=key=>{const nodes=doc.querySelectorAll(s[key]);return nodes.length===1?nodes[0]:null;};
  const rect=node=>{
    if(!node)return null;const r=node.getBoundingClientRect();
    const values=[r.x,r.y,r.width,r.height,r.top,r.right,r.bottom,r.left];
    if(values.some(value=>!Number.isFinite(value)||Math.abs(value)>10000000))return null;
    return {x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left};
  };
  const shown=node=>{
    if(!node?.isConnected||!node.getClientRects().length)return false;
    const box=rect(node);if(!box||box.width<=0||box.height<=0)return false;
    for(let n=node;n;n=n.parentElement){const cs=win.getComputedStyle(n);if(n.hasAttribute('inert')||n.getAttribute('aria-hidden')==='true'
      ||cs.display==='none'||['hidden','collapse'].includes(cs.visibility)||Number(cs.opacity)===0)return false;}
    return true;
  };
  const products=one('products'),intake=one('intake'),contact=one('contact'),dock=one('dock'),spacer=one('spacer');
  const cards=products?Array.from(products.querySelectorAll(s.rows)):[];
  const viewportFact=node=>({rendered:shown(node),box:rect(node)});
  const norm=value=>(value??" ").trim().replace(/\s+/gu," ");
  const geometry=cards.slice(0,24).map((card,index)=>{
    const name=card.querySelector(s.rowName),specification=card.querySelector(s.rowSpecification),summary=card.querySelector(s.rowSummary),qualifier=card.querySelector(s.rowQualifier);
    const expected=expectedRows[index],identityBound=cards.length===expectedRows.length&&!!expected
      &&card.getAttribute(binding.rowIdentity.productId)===expected.productId&&card.getAttribute(binding.rowIdentity.variantId)===expected.variantId
      &&norm(name?.textContent)===norm(expected.productName)&&norm(specification?.textContent)===norm(expected.specification||'Form not stated');
    const style=summary?win.getComputedStyle(summary):null;
    const ancestors=[];let n=summary?.parentElement;for(;n&&ancestors.length<8;n=n.parentElement){const cs=win.getComputedStyle(n);
      if(['hidden','clip','scroll','auto'].includes(cs.overflowX)||['hidden','clip','scroll','auto'].includes(cs.overflowY))ancestors.push({box:rect(n),overflowX:cs.overflowX,overflowY:cs.overflowY});}
    let range=null;if(summary){const r=doc.createRange();r.selectNodeContents(summary);range=rect({getBoundingClientRect:()=>r.getBoundingClientRect()});}
    return {productId:identityBound?expected.productId:null,variantId:identityBound?expected.variantId:null,identityBound,identityObservation:'DIRECT_PUBLIC_DTO_ATTRIBUTES_PLUS_QUERY_ORDER_AND_EXACT_NAME_SPECIFICATION',
      rendered:shown(card),card:rect(card),name:rect(name),media:Array.from(card.querySelectorAll('img')).slice(0,3).map(image=>{
        let path='UNKNOWN_REDACTED';try{const url=new URL(image.currentSrc||image.getAttribute('src'),win.location.href);
          if(url.origin===win.location.origin&&!url.search&&!url.hash&&/^\/research\/product-media\/[A-Za-z0-9._-]+$/u.test(url.pathname))path=url.pathname;}catch{}
        const box=rect(image);return {path,alt:(image.getAttribute('alt')??'').slice(0,200),rendered:shown(image),
          inViewport:!!box&&box.bottom>0&&box.top<win.innerHeight&&box.right>0&&box.left<win.innerWidth,
          complete:image.complete,naturalWidth:image.naturalWidth,fit:win.getComputedStyle(image).objectFit};}),
      mediaCount:card.querySelectorAll('img').length,representation:card.querySelector('[data-representation]')?.getAttribute('data-representation')??null,
      summaryText:norm(summary?.textContent),forbiddenCommercialCopy:/\$\s*\d|\bUSD\s*\d|\bbuy now\b/iu.test(card.textContent),
      controls:Array.from(card.querySelectorAll('button,input,select')).slice(0,12).map(control=>({tag:control.tagName,box:rect(control),rendered:shown(control)})),
      controlsTruncated:card.querySelectorAll('button,input,select').length>12,summary:{box:rect(summary),range,clientHeight:summary?.clientHeight??null,scrollHeight:summary?.scrollHeight??null,
        overflowY:style?.overflowY??null,maxHeight:style?.maxHeight??null,lineClamp:style?.webkitLineClamp??null,rendered:shown(summary),
        clippingAncestors:ancestors,ancestorScanTruncated:n!==null&&n!==undefined},
      qualifier:{box:rect(qualifier),rendered:shown(qualifier),clientHeight:qualifier?.clientHeight??null,scrollHeight:qualifier?.scrollHeight??null,lines:Array.from(qualifier?.querySelectorAll('p')??[]).slice(0,4).map(line=>({box:rect(line),rendered:shown(line)}))},belowViewport:!!rect(card)&&rect(card).top>=win.innerHeight};
  });
  const visibleBlocks=Array.from(doc.querySelectorAll(s.blocking)).filter(shown).length;
  const heading=products?.querySelector(s.productsHeading),search=products?.querySelector(s.search),family=products?.querySelector(s.family);
  const stage=shown(products)&&shown(heading)&&norm(heading.textContent)===binding.productsHeading
    &&shown(search)&&shown(family)&&!shown(intake)&&visibleBlocks===0?'CONFIRMED_PRODUCTS'
    :shown(intake)?'REQUIRED_INTAKE':shown(contact)?'CONTACT':'UNOBSERVABLE';
  const dockMatch=norm(dock?.querySelector(s.dockStatus)?.textContent).match(/^(\d+) variants? · (\d+) requested units?$/u);
  const root=doc.querySelector('[data-testid="quick-order-request-only"]');
  return {scope:MC10_SCOPE,coverage:'CURRENT_DOM_AND_GEOMETRY; below-viewport rows are not painted proof',stage,counts:{visibleBlocks,products:doc.querySelectorAll(s.products).length,intake:doc.querySelectorAll(s.intake).length,
      contact:doc.querySelectorAll(s.contact).length,rows:cards.length,dock:doc.querySelectorAll(s.dock).length,spacer:doc.querySelectorAll(s.spacer).length},
    catalogViewport:{heading:viewportFact(heading),search:viewportFact(search)},
    dock:{rendered:shown(dock),box:rect(dock),counts:dockMatch?{variants:Number(dockMatch[1]),units:Number(dockMatch[2])}:null},spacer:{rendered:shown(spacer),box:rect(spacer)},
    confirmBusy:one('confirm')?.disabled===true||one('confirm')?.getAttribute('aria-busy')==='true',
    rows:geometry,rowsTruncated:cards.length>24,
    viewport:{width:win.innerWidth,height:win.innerHeight,rootFont:parseFloat(win.getComputedStyle(doc.documentElement).fontSize),
      clientWidth:doc.documentElement.clientWidth,scrollWidth:doc.documentElement.scrollWidth},
    pageLength:Math.max(doc.documentElement.scrollHeight,doc.body?.scrollHeight??0),
    reducedMotion:win.matchMedia('(prefers-reduced-motion: reduce)').matches,
    noAttempt:['xenios.assisted-order.intent-attempt.v1','xenios.assisted-order.intent-receipt.v1','xenios.assisted-order.draft.v1']
      .every(key=>win.localStorage.getItem(key)===null&&win.sessionStorage.getItem(key)===null),
    stores:{localLength:win.localStorage.length,sessionLength:win.sessionStorage.length,values:'NOT_RETAINED'},
    entranceArtworkCount:root?.querySelectorAll('.xenios-premium-hero-art,.xenios-premium-hero img,.xenios-premium-hero figure,.xenios-premium-hero [data-artwork-sha256]').length??-1,
    entranceCaptions:Array.from(root?.querySelectorAll('.xenios-premium-hero p,.xenios-premium-hero figcaption')??[])
      .filter(n=>/Packaging design shown\. Current packaging may differ\.|^Artwork preview\./u.test(n.textContent.trim())).length,
    conversationGridCount:root?.querySelectorAll('.xenios-premium-interests,[aria-label="Start a conversation by interest"]').length??-1};
}
function mc10ViewSource(binding,expectedRows){return `(${collectMC10View.toString()})(document,window,${JSON.stringify(binding)},${JSON.stringify(expectedRows)})`.replace('scope:MC10_SCOPE',`scope:${JSON.stringify(MC10_SCOPE)}`);}
/** Failure-only public row facts; no DOM text, unknown URL, contact or thrown body is retained. */
export function mc10ReviewedRowDiagnostics(view,expected){
  const rowLimit=24,failureLimit=8,failures=[];let failedRows=0;
  const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000?value:null;
  const flag=value=>typeof value==='boolean'?value:null;
  const id=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/u.test(value)?value:null;
  const scanned=Math.min(view.rows.length,expected.length,rowLimit);
  for(let index=0;index<scanned;index++){
    const row=view.rows[index],item=expected[index],media=item.reviewedMedia,primary=media?.primary,image=row.media?.[0];
    const summary=item.reviewedContent?[(item.reviewedContent.brand?item.reviewedContent.brand+' · ':''),item.reviewedContent.summary].join('').trim().replace(/\s+/gu,' '):'';
    const checks={SUMMARY_EXACT:row.summaryText===summary,MEDIA_COUNT:row.mediaCount===(primary?1:0)};
    if(primary){
      checks.PRIMARY_OBSERVATION_COUNT=row.media?.length===1;
      checks.PRIMARY_PATH=image?image.path===primary.href:null;
      checks.PRIMARY_FIT=image?image.fit==='contain':null;
      checks.PRIMARY_RENDERED=image?Boolean(image.rendered):null;
      checks.PRIMARY_ALT_NONEMPTY=image?image.alt.length>0:null;
      checks.VISIBLE_PRIMARY_LOADED=image?Boolean(!image.inViewport||image.complete&&image.naturalWidth>0):null;
      checks.REPRESENTATION=row.representation===(media.representation??null);
    }
    const fields=Object.keys(checks).filter(key=>checks[key]===false);
    if(fields.length===0)continue;failedRows++;
    if(failures.length<failureLimit)failures.push({rowIndex:index,productId:id(item.productId),variantId:id(item.variantId),failedFields:fields,checks,
      facts:{primaryExpected:Boolean(primary),observedMediaCount:count(row.mediaCount),observedImages:count(row.media?.length),
        expectedSummaryCharacters:count(summary.length),observedSummaryCharacters:typeof row.summaryText==='string'?count(row.summaryText.length):null,
        firstImagePresent:Boolean(image),firstImageInViewport:flag(image?.inViewport),firstImageComplete:flag(image?.complete),
        firstImageNaturalWidth:count(image?.naturalWidth),firstImageRendered:flag(image?.rendered),
        firstImageAltCharacters:typeof image?.alt==='string'?count(image.alt.length):null}});
  }
  return {kind:'MC10_REVIEWED_ROW_FAILURE_ONLY',state:'OBSERVED_BOUNDED_COMPARISON_FACTS',accepted:false,
    observedRows:count(view.rows.length),expectedRows:count(expected.length),rowsScanned:scanned,rowLimit,
    failedRows,retainedFailures:failures.length,failureLimit,truncated:view.rows.length>rowLimit||expected.length>rowLimit||failedRows>failureLimit,failures};
}
export function assertMC10Stage(view,stage,expected=[],progress=null){
  requireThat(view?.stage===stage&&view.noAttempt===true&&!view.rowsTruncated&&view.reducedMotion===true
    &&view.viewport.scrollWidth<=view.viewport.clientWidth&&view.entranceArtworkCount===0&&view.entranceCaptions===0
    &&view.conversationGridCount===0&&view.rows.every(row=>row.rendered&&!row.forbiddenCommercialCopy&&!row.controlsTruncated),'MC10_STAGE_OR_LAYOUT_INVALID');
  if(stage==='CONFIRMED_PRODUCTS'){
    requireThat(view.counts.products===1&&view.counts.intake===0&&view.rows.length===expected.length
      &&view.rows.every((row,index)=>row.productId===expected[index].productId&&row.variantId===expected[index].variantId),
      'MC10_CANONICAL_RENDERED_IDENTITIES_MISMATCH');
    const reviewedMatch=view.rows.every((row,index)=>{
      const item=expected[index],media=item.reviewedMedia,primary=media?.primary;
      const summary=item.reviewedContent?[(item.reviewedContent.brand?item.reviewedContent.brand+' · ':''),item.reviewedContent.summary].join('').trim().replace(/\s+/gu,' '):'';
      return row.summaryText===summary&&(primary?row.mediaCount===1&&row.media.length===1&&row.media[0].path===primary.href
        &&row.media[0].fit==='contain'&&row.media[0].rendered&&row.media[0].alt.length>0
        &&(!row.media[0].inViewport||row.media[0].complete&&row.media[0].naturalWidth>0)
        &&row.representation===(media.representation??null):row.mediaCount===0);
    });
    if(!reviewedMatch&&progress){try{progress.reviewedRowFailure=mc10ReviewedRowDiagnostics(view,expected);}catch{
      progress.reviewedRowFailure={kind:'MC10_REVIEWED_ROW_FAILURE_ONLY',state:'UNAVAILABLE',accepted:false,reason:'BOUNDED_PROJECTION_REFUSED'};
    }}
    requireThat(reviewedMatch,'MC10_REVIEWED_CONTENT_OR_IMAGE_MISMATCH');
  }else if(stage==='REQUIRED_INTAKE')requireThat(view.counts.intake===1&&view.counts.products===0&&view.counts.rows===0,'MC10_PRE_ADMISSION_CATALOG_VISIBLE');
  return view;
}
export function assertMC10Dock(view,{empty=false}={}){
  requireThat(view?.stage==='CONFIRMED_PRODUCTS','MC10_DOCK_STAGE_UNOBSERVABLE');
  requireThat(empty?view.counts.dock===0&&view.counts.spacer===0
    :view.counts.dock===1&&view.dock.rendered&&view.dock.box?.height>=44&&view.dock.counts?.variants===1&&Number.isSafeInteger(view.dock.counts.units)&&view.dock.counts.units>=1,'MC10_PRODUCTS_DOCK_INVALID');
  return true;
}
export function mc10NativeTargetSource(binding,kind,identity=null,expectedRows=[]){
  const fields=['fullLegalName','email','line1','city','region','postalCode','countryCode'];
  requireThat([...fields,'confirm','nextPage','previousPage','search','add','remove','details','continue','back'].includes(kind),'MC10_NATIVE_TARGET_NOT_APPROVED');
  requireThat(['add','remove','details'].includes(kind)?identity&&Object.keys(identity).length===2&&['productId','variantId'].every(key=>typeof identity[key]==='string'&&identity[key].length<=128):identity===null,'MC10_ROW_TARGET_INVALID');
  const rowIndex=identity?expectedRows.findIndex(row=>row.productId===identity.productId&&row.variantId===identity.variantId):-1;
  requireThat(!identity||Array.isArray(expectedRows)&&expectedRows.length<=24&&rowIndex>=0
    &&expectedRows.filter(row=>row.productId===identity.productId&&row.variantId===identity.variantId).length===1,'MC10_TARGET_CANONICAL_ROW_UNBOUND');
  const row=identity?expectedRows[rowIndex]:null;
  // Exact selected7218 CatalogDetails -> catalogRowName -> rowSpecification contract.
  // reviewedPackage is the first Package specification, then Listed package fallback.
  const packageLabel=row?.reviewedContent?.specifications?.find(({label})=>label==='Package')?.value
    ??row?.reviewedContent?.specifications?.find(({label})=>label==='Listed package')?.value;
  const sameWords=(a,b)=>{const norm=value=>(value??'').trim().replace(/\s+/gu,' ').toLowerCase();return Boolean(norm(a))&&norm(a)===norm(b);};
  const rowSpecification=[row?.specification,sameWords(packageLabel,row?.specification)?undefined:packageLabel].filter(Boolean).join(', ');
  const detailsLabel=kind==='details'?'View details for '+[row.productName,rowSpecification].filter(Boolean).join(', '):null;
  return `(()=>{const binding=${JSON.stringify(binding)},kind=${JSON.stringify(kind)},identity=${JSON.stringify(identity)},row=${JSON.stringify(row)},index=${rowIndex},detailsLabel=${JSON.stringify(detailsLabel)};
    let scope=document;if(identity){const candidates=[...document.querySelectorAll(binding.selectors.rows)];if(candidates.length!==${expectedRows.length})return {unique:false,matched:false};scope=candidates[index];const norm=value=>(value??'').trim().replace(/\\s+/gu,' ');if(!scope||scope.getAttribute(binding.rowIdentity.productId)!==identity.productId||scope.getAttribute(binding.rowIdentity.variantId)!==identity.variantId||norm(scope.querySelector(binding.selectors.rowName)?.textContent)!==norm(row.productName)||norm(scope.querySelector(binding.selectors.rowSpecification)?.textContent)!==norm(row.specification||'Form not stated'))return {unique:false,matched:false};}
    const nodes=kind==='details'?[...scope.querySelectorAll('button[aria-label]')].filter(node=>node.getAttribute('aria-label')===detailsLabel&&node.textContent?.trim()==='View details'):scope.querySelectorAll(binding.selectors[kind]),node=nodes.length===1?nodes[0]:null;
    const fields=['fullLegalName','email','line1','city','region','postalCode','search'];
    const safeKind=!!node&&(kind==='countryCode'?node.tagName==='SELECT':fields.includes(kind)?node.tagName==='INPUT'&&['text','email','tel','search'].includes(node.type)
      :node.tagName==='BUTTON'&&node.type===(kind==='confirm'?'submit':'button'))
      &&(kind!=='confirm'||document.querySelectorAll(binding.selectors.intake).length===1&&node.form===document.querySelector(binding.selectors.intake));
    return {unique:nodes.length===1,safeKind,matched:nodes.length===1&&node===document.activeElement&&!node.disabled};})()`;
}
// Apply the same strict rounded-control geometry to the newly covered native
// form controls. No point, clipping or viewport predicate is removed.
export function mc10ActiveGeometrySource(){
  const original="const interactive=el.matches('a[href],button,summary');";
  requireThat(HOME_DISMISS_STATE_SOURCE.split(original).length===2,'MC10_GEOMETRY_SOURCE_CHANGED');
  return HOME_DISMISS_STATE_SOURCE.replace(original,"const interactive=el.matches('a[href],button,summary,input,select,textarea');");
}
async function mc10NativeStep(page,source,kind,bounded,progress,direction,entry=null){
  try{await tabWithFreshFocusBaseline(page,bounded,{shift:direction==='reverse'});if(entry)entry.inputDispatched=true;}catch(error){if(entry)entry.inputDispatched=null;throw error;}
  const sample=await bounded(page.evaluate(FOCUS_PROBE_SOURCE)),target=await bounded(page.evaluate(source));
  if(entry){entry.sample=sample;entry.target=target;}else{progress.push({kind,direction,sample,target});if(progress.length>256)throw new Error('MC10_NATIVE_OBSERVATION_CAP');}
  requireThat(!sample.body&&sample.indicator&&sample.inViewport,'MC10_NATIVE_FOCUS_INVALID');
  requireThat(target.unique&&target.safeKind===true,'MC10_NATIVE_TARGET_ABSENT_AMBIGUOUS_OR_UNSAFE_KIND');
  if(target.matched){sample.geometry=(await bounded(page.evaluate(mc10ActiveGeometrySource()))).active;
    requireThat(partnerFocusAccepted(sample,sample.identity),'MC10_NATIVE_TARGET_OBSCURED_CLIPPED_OR_SMALL');}
  return {sample,target};
}
export async function mc10NativeTarget(page,binding,kind,identity,bounded,progress,expectedRows=[],direction='forward'){
  requireThat(direction==='forward'||direction==='reverse'&&['fullLegalName','previousPage','search'].includes(kind),'MC10_NATIVE_DIRECTION_NOT_APPROVED');
  const source=mc10NativeTargetSource(binding,kind,identity,expectedRows);
  for(let i=0;i<80;i++){
    const step=await mc10NativeStep(page,source,kind,bounded,progress,direction);
    if(step.target.matched)return step.sample;
  }
  throw new Error('MC10_NATIVE_TARGET_UNREACHABLE');
}
/** Closed read-only target/current relation; existing versioned baselines own identity/visibility. */
export function mc10CurrentOrderSource(binding,kind){
  requireThat(['previousPage','search','continue'].includes(kind),'MC10_CURRENT_ORDER_KIND_NOT_APPROVED');
  const approved=mc10NativeTargetSource(binding,kind);
  return `(()=>{const binding=${JSON.stringify(binding)},kind=${JSON.stringify(kind)},approved=(${approved});
    const nodes=document.querySelectorAll(binding.selectors[kind]),node=nodes.length===1?nodes[0]:null,current=document.activeElement;
    const state=window.__xeniosEvidenceFocusStateV2,body=!current||current===document.body||current===document.documentElement;
    let relation='UNOBSERVABLE';if(body)relation='UNFOCUSED';else if(node&&current===node)relation='ON_TARGET';
    else if(node&&current.isConnected&&current.ownerDocument===document){const position=current.compareDocumentPosition(node);
      if(!(position&1))relation=position&4?'BEFORE_TARGET':position&2?'AFTER_TARGET':'UNOBSERVABLE';}
    const products=document.querySelectorAll(binding.selectors.products),headings=products.length===1?products[0].querySelectorAll(binding.selectors.productsHeading):[];
    const currentProductsHeading=!body&&headings.length===1&&headings[0]===current&&['H1','H2','H3','H4','H5','H6'].includes(current.tagName)&&current.tabIndex===-1;
    const currentKnownPager=!body&&current.tagName==='BUTTON'&&current.type==='button'&&['previousPage','nextPage'].some(key=>{const matches=document.querySelectorAll(binding.selectors[key]);return matches.length===1&&matches[0]===current;});
    return {unique:approved.unique,safeKind:approved.safeKind,enabled:!!node&&!node.disabled,
      targetIdentity:node?state?.baselines?.get(node)?.identity??null:null,currentIdentity:body?null:state?.baselines?.get(current)?.identity??null,
      currentBody:body,currentDisabled:!body&&current.disabled===true,currentKnownPager,currentProductsHeading,currentConnected:body||current.isConnected&&current.ownerDocument===document,
      currentTabIndex:body?null:current.tabIndex,targetTabIndex:node?.tabIndex??null,relation};})()`;
}
export async function mc10CurrentOrderTarget(page,binding,kind,bounded,progress){
  const relationSource=mc10CurrentOrderSource(binding,kind),source=mc10NativeTargetSource(binding,kind);
  const identity=value=>typeof value==='string'&&value.length<=4096?value:null;
  const flag=value=>typeof value==='boolean'?value:null;
  const number=value=>Number.isSafeInteger(value)&&Math.abs(value)<=1000000?value:null;
  for(let i=0;i<80;i++){
    const baseline=await bounded(page.evaluate(FOCUS_BASELINE_SOURCE)),current=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    const relation=await bounded(page.evaluate(relationSource)),order=baseline?.tabbableIdentities;
    const usableOrder=Array.isArray(order)&&order.length<=256&&order.every(id=>typeof id==='string'&&id.length>0&&id.length<=4096)&&new Set(order).size===order.length;
    const targetIndex=Array.isArray(order)?order.indexOf(relation?.targetIdentity):-1,currentIndex=current?.body?-1:Array.isArray(order)?order.indexOf(current?.identity):-1;
    const entry={kind,direction:null,inputDispatched:false,nativeTargetProved:false,start:{
      sample:{body:flag(current?.body),identity:identity(current?.identity),indicator:flag(current?.indicator),inViewport:flag(current?.inViewport),tabIndex:number(current?.tabIndex)},
      targetIdentity:identity(relation?.targetIdentity),relationCurrentIdentity:identity(relation?.currentIdentity),
      targetUnique:flag(relation?.unique),targetSafeKind:flag(relation?.safeKind),targetEnabled:flag(relation?.enabled),
      currentIndex,targetIndex,orderCount:Array.isArray(order)?number(order.length):null,usableOrder,
      relation:['BEFORE_TARGET','AFTER_TARGET','ON_TARGET','UNFOCUSED'].includes(relation?.relation)?relation.relation:'UNOBSERVABLE',
      currentConnected:flag(relation?.currentConnected),currentTabIndex:number(relation?.currentTabIndex),
      initialUnfocused:current?.body===true,initialOnTarget:i===0&&relation?.relation==='ON_TARGET',
      currentProductsHeading:flag(relation?.currentProductsHeading),currentDisabled:flag(relation?.currentDisabled),knownDisabledPager:relation?.currentKnownPager===true&&relation?.currentDisabled===true}};
    progress.push(entry);if(progress.length>256)throw new Error('MC10_NATIVE_OBSERVATION_CAP');
    requireThat(usableOrder,'MC10_CURRENT_ORDER_UNOBSERVABLE');
    requireThat(relation?.unique===true&&relation.safeKind===true&&relation.enabled===true
      &&typeof relation.targetIdentity==='string'&&order.filter(id=>id===relation.targetIdentity).length===1,'MC10_NATIVE_TARGET_ABSENT_AMBIGUOUS_OR_UNSAFE_KIND');
    requireThat(current&&typeof current==='object','MC10_CURRENT_ORDER_UNOBSERVABLE');
    let direction;
    requireThat(current.body===false&&relation.currentDisabled!==true,'MC10_APP_FOCUS_NOT_RESTORED');
    {
      requireThat(relation.currentBody===false&&relation.currentConnected===true&&typeof current.identity==='string'&&relation.currentIdentity===current.identity,'MC10_CURRENT_ORDER_UNOBSERVABLE');
      requireThat(['BEFORE_TARGET','AFTER_TARGET'].includes(relation.relation)||i===0&&relation.relation==='ON_TARGET'&&currentIndex===targetIndex,'MC10_CURRENT_ORDER_UNOBSERVABLE');
      direction=relation.relation==='AFTER_TARGET'?'reverse':'forward';
      requireThat(currentIndex>=0?(currentIndex===targetIndex?i===0&&relation.relation==='ON_TARGET':(currentIndex<targetIndex)===(direction==='forward')):relation.currentProductsHeading===true&&relation.currentTabIndex===-1,'MC10_CURRENT_ORDER_UNOBSERVABLE');
    }
    entry.direction=direction;
    const step=await mc10NativeStep(page,source,kind,bounded,progress,direction,entry);
    if(step.target.matched){requireThat(!(i===0&&relation.relation==='ON_TARGET'),'MC10_CURRENT_TARGET_NOT_LEFT');requireThat(step.sample.identity===relation.targetIdentity,'MC10_CURRENT_TARGET_IDENTITY_CHANGED');entry.nativeTargetProved=true;return step.sample;}
  }
  throw new Error('MC10_NATIVE_TARGET_UNREACHABLE');
}
/** Reuse only this page's prior native-acquired Search identity; never call it a new Tab. */
export async function mc10SearchTarget(page,binding,bounded,progress,previous=null){
  if(previous===null)return mc10CurrentOrderTarget(page,binding,'search',bounded,progress);
  requireThat(progress.some(row=>row.kind==='search'&&row.sample===previous&&row.target?.unique===true
    &&row.target.safeKind===true&&row.target.matched===true&&(!Object.hasOwn(row,'start')||row.inputDispatched===true&&row.nativeTargetProved===true)&&partnerFocusAccepted(previous,previous.identity)),'MC10_SEARCH_NATIVE_PROOF_REQUIRED');
  await bounded(page.evaluate(FOCUS_BASELINE_SOURCE));
  const sample=await bounded(page.evaluate(FOCUS_PROBE_SOURCE)),target=await bounded(page.evaluate(mc10NativeTargetSource(binding,'search')));
  progress.push({kind:'search',observation:'CURRENT_FOCUS_REVALIDATION',sample,target});if(progress.length>256)throw new Error('MC10_NATIVE_OBSERVATION_CAP');
  requireThat(target.unique&&target.safeKind===true,'MC10_NATIVE_TARGET_ABSENT_AMBIGUOUS_OR_UNSAFE_KIND');
  if(target.matched&&!sample.body&&sample.identity===previous.identity){
    requireThat(sample.indicator&&sample.inViewport,'MC10_NATIVE_FOCUS_INVALID');
    sample.geometry=(await bounded(page.evaluate(mc10ActiveGeometrySource()))).active;
    requireThat(partnerFocusAccepted(sample,previous.identity),'MC10_SEARCH_RETAINED_FOCUS_INVALID');
    return sample;
  }
  // A render can move the native starting point; use its current relation, not the prior action.
  return mc10CurrentOrderTarget(page,binding,'search',bounded,progress);
}
export async function mc10LastRemovalContinuation(page,bounded,progress){
  const baseline=await bounded(page.evaluate(FOCUS_BASELINE_SOURCE)),returned=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
  returned.geometry=(await bounded(page.evaluate(mc10ActiveGeometrySource()))).active;
  progress.returned=returned;progress.order=baseline.tabbableIdentities;
  requireThat(partnerFocusAccepted(returned,returned.identity),'MC10_LAST_REMOVAL_RETURN_INVALID');
  const expected=premiumTabSuccessor(baseline.tabbableIdentities,returned.identity);progress.expected=expected;
  await tabWithFreshFocusBaseline(page,bounded);
  const next=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));next.geometry=(await bounded(page.evaluate(mc10ActiveGeometrySource()))).active;progress.next=next;
  requireThat(partnerFocusAccepted(next,expected),'MC10_LAST_REMOVAL_NEXT_TAB_INVALID');return true;
}
/** Closed current child scope only; it observes app focus without moving it. */
export function mc10RestoredFocusSource(binding){
  return `(()=>{const binding=${JSON.stringify(binding)},products=document.querySelectorAll(binding.selectors.products),current=document.activeElement;
    const scope=products.length===1?products[0]:null,headings=scope?scope.querySelectorAll(binding.selectors.productsHeading):[];
    const previous=scope?scope.querySelectorAll(binding.selectors.previousPage):[],next=scope?scope.querySelectorAll(binding.selectors.nextPage):[];
    const body=!current||current===document.body||current===document.documentElement;
    const isPrevious=previous.length===1&&previous[0]===current,isNext=next.length===1&&next[0]===current;
    const heading=headings.length===1&&headings[0]===current&&['H1','H2','H3','H4','H5','H6'].includes(current.tagName)&&current.tabIndex===-1;
    const pager=(isPrevious||isNext)&&current.tagName==='BUTTON'&&current.type==='button';
    return {uniqueProducts:products.length===1,uniqueHeading:headings.length===1,uniquePagers:previous.length===1&&next.length===1,
      kind:body?'BODY':heading?'CATALOG_HEADING':pager&&current.disabled?'DISABLED_PAGER':pager?(isPrevious?'PREVIOUS_PAGE':'NEXT_PAGE'):'OTHER',
      connected:!body&&current.isConnected&&current.ownerDocument===document,disabled:!body&&current.disabled===true,
      identity:body?null:window.__xeniosEvidenceFocusStateV2?.baselines?.get(current)?.identity??null,
      appFocus:window.__xeniosMC10FocusObservationV1?.snapshot()??null};})()`;
}
export function assertMC10AppRestoredFocus(observation,transition,before){
  requireThat(['ADMISSION','NEXT_PAGE','PREVIOUS_PAGE'].includes(transition),'MC10_FOCUS_TRANSITION_NOT_APPROVED');
  const {sample,facts}=observation??{},geometry=sample?.geometry,after=facts?.appFocus,prior=before?.observer;
  requireThat(facts?.uniqueProducts===true&&facts.uniqueHeading===true&&facts.connected===true&&facts.disabled===false
    &&(facts.kind==='CATALOG_HEADING'||transition!=='ADMISSION'&&facts.uniquePagers===true&&['PREVIOUS_PAGE','NEXT_PAGE'].includes(facts.kind))
    &&sample?.body===false&&typeof sample.identity==='string'&&sample.identity.length>0&&sample.identity===facts.identity
    &&sample.baselineCaptured===true&&sample.indicator===true&&sample.inViewport===true
    &&geometry?.rendered===true&&geometry.fullyInViewport===true&&geometry.unobscured===true&&geometry.indicatorUnclipped===true
    &&Number.isFinite(geometry.width)&&geometry.width>0&&Number.isFinite(geometry.height)&&geometry.height>0,
    'MC10_APP_FOCUS_NOT_RESTORED');
  if(facts.kind!=='CATALOG_HEADING')requireThat(partnerFocusAccepted(sample,sample.identity),'MC10_APP_RESTORED_PAGER_GEOMETRY_INVALID');
  const retained=transition!=='ADMISSION'&&facts.kind!=='CATALOG_HEADING'
    &&partnerFocusAccepted(before?.nativePager,before?.nativePager?.identity)&&before.nativePager.identity===sample.identity;
  const focusCallObserved=Number.isSafeInteger(prior?.calls)&&Number.isSafeInteger(after?.calls)&&after.calls>prior.calls
    &&after.baselines===after.calls&&after.failures===0&&after.reentrant===0&&after.throws===0;
  return {...observation,outcome:retained?'RETAINED_NATIVE_PAGER_FOCUS':focusCallObserved?'APP_FOCUS_CALL_AND_PERMITTED_RESULT':'PERMITTED_FOCUS_RESULT_ONLY',
    appFocusCallObserved:focusCallObserved,appFocusReceiver:'NOT_RECORDED_BY_EXISTING_OBSERVER'};
}
/** Existing bounded double-RAF facility waits for the app itself; it never sends a navigation key. */
export async function requireMC10AppRestoredFocus(page,binding,transition,before,bounded,progress){
  const source=mc10RestoredFocusSource(binding),receipt={transition,state:'INCOMPLETE',snapshots:0,last:null};
  progress.appFocusRestoration??=[];
  requireThat(Array.isArray(progress.appFocusRestoration)&&progress.appFocusRestoration.length<3,'MC10_APP_FOCUS_RECEIPT_CAP');
  progress.appFocusRestoration.push(receipt);
  const read=async()=>{
    await bounded(page.evaluate(FOCUS_BASELINE_SOURCE));
    const sample=await bounded(page.evaluate(FOCUS_PROBE_SOURCE)),facts=await bounded(page.evaluate(source));
    sample.geometry=(await bounded(page.evaluate(mc10ActiveGeometrySource()))).active;
    receipt.snapshots++;receipt.last={sample,facts};return receipt.last;
  };
  try{
    const found=await waitForMC10Condition(page,bounded,read,observation=>{
      try{assertMC10AppRestoredFocus(observation,transition,before);return true;}
      catch(error){if(!['MC10_APP_FOCUS_RESTORATION_UNOBSERVED','MC10_APP_FOCUS_NOT_RESTORED','MC10_APP_RESTORED_PAGER_GEOMETRY_INVALID'].includes(error?.message))throw error;return false;}
    },'MC10_APP_FOCUS_NOT_RESTORED');
    const proved=assertMC10AppRestoredFocus(found,transition,before);receipt.state='OBSERVED_PERMITTED_APP_FOCUS_RESULT';receipt.outcome=proved.outcome;
    receipt.appFocusCallObserved=proved.appFocusCallObserved;receipt.appFocusReceiver=proved.appFocusReceiver;return proved;
  }catch(error){receipt.state='REFUSED';throw error;}
}
/** Raw catalog geometry is a separate prerequisite to a catalog-named PNG. */
export function assertMC10CatalogViewport(view,progress=null){
  const width=view?.viewport?.width,height=view?.viewport?.height;
  const fully=box=>!!box&&['left','top','right','bottom','width','height'].every(k=>Number.isFinite(box[k]))
    &&box.width>0&&box.height>0&&box.left>=0&&box.top>=0&&box.right<=width&&box.bottom<=height;
  const intersects=box=>!!box&&['left','top','right','bottom'].every(k=>Number.isFinite(box[k]))
    &&box.right>0&&box.left<width&&box.bottom>0&&box.top<height;
  const heading=view?.catalogViewport?.heading,search=view?.catalogViewport?.search;
  const row=Array.isArray(view?.rows)?view.rows.find(row=>row.identityBound===true&&row.rendered===true&&intersects(row.card)&&fully(row.name)):null;
  const facts={scope:'ACTUAL_CURRENT_CATALOG_VIEWPORT_ONLY',headingRendered:heading?.rendered===true,headingFullyInViewport:fully(heading?.box),
    searchRendered:search?.rendered===true,searchFullyInViewport:fully(search?.box),canonicalRowNameFullyInViewport:!!row,
    canonicalRowIndex:row?view.rows.indexOf(row):null,accepted:false};
  if(progress)progress.catalogViewport=facts;
  requireThat(view?.stage==='CONFIRMED_PRODUCTS'&&Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0
    &&facts.canonicalRowNameFullyInViewport,'MC10_CATALOG_VIEWPORT_NOT_COVERED');
  facts.accepted=true;return facts;
}
export async function saveMC10Scene(scene,observe,save,progress,expected=[]){
  requireThat(['pre-intake','catalog-empty-dock','populated-dock','post-last-removal'].includes(scene),'MC10_CAPTURE_STAGE_REFUSED');
  const fresh=await observe();
  assertMC10Stage(fresh,scene==='pre-intake'?'REQUIRED_INTAKE':'CONFIRMED_PRODUCTS',expected,progress);
  if(scene==='catalog-empty-dock')assertMC10CatalogViewport(fresh,progress);
  return save(scene,fresh);
}

/** Chromium native select typeahead; verification, never DOM value injection. */
export async function mc10SelectUnitedStates(page,bounded){
  const state=await bounded(page.evaluate(`({select:document.activeElement?.tagName==='SELECT',count:[...document.activeElement?.options??[]].filter(option=>option.value==='US').length})`));
  requireThat(state.select===true&&state.count===1,'MC10_COUNTRY_SELECT_UNOBSERVABLE');
  for(const char of 'United States'){
    const letter=/[A-Za-z]/u.test(char),virtual=letter?char.toUpperCase().charCodeAt(0):32;
    const key={key:char,code:letter?'Key'+char.toUpperCase():'Space',windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual};
    await bounded(page.send('Input.dispatchKeyEvent',{type:'keyDown',...key,text:char,unmodifiedText:char}));
    await bounded(page.send('Input.dispatchKeyEvent',{type:'keyUp',...key}));
  }
  requireThat(await bounded(page.evaluate(`document.activeElement?.tagName==='SELECT'&&document.activeElement.value==='US'`))===true,'MC10_COUNTRY_NATIVE_SELECTION_UNSUPPORTED');
}
/** The existing MC10 condition facility: same40 reads, same bounded double-RAF pause. */
export async function waitForMC10Condition(page,bounded,observe,predicate,code){
  for(let i=0;i<40;i++){const view=await observe();if(predicate(view))return view;
    await bounded(page.send('Runtime.evaluate',{expression:'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',awaitPromise:true,returnByValue:true}));}throw new Error(code);
}
/** Only a correctly matched visible primary still loading may wait; final predicate is unchanged. */
export async function settleMC10VisibleImages(initial,expected,wait,progress){
  const receipt={scope:'ACTUAL_VISIBLE_PRIMARY_IMAGE_READINESS',state:'CHECKING',snapshots:0,pendingSnapshots:0,maxPendingRows:0,waited:false};
  if(progress){progress.visibleImageReadiness??=[];requireThat(Array.isArray(progress.visibleImageReadiness)&&progress.visibleImageReadiness.length<8,'MC10_IMAGE_READINESS_OBSERVATION_CAP');progress.visibleImageReadiness.push(receipt);}
  let last=initial;
  const ready=view=>{
    last=view;receipt.snapshots++;
    try{assertMC10Stage(view,'CONFIRMED_PRODUCTS',expected);receipt.state='READY';return true;}catch(error){
      if(error?.message!=='MC10_REVIEWED_CONTENT_OR_IMAGE_MISMATCH')return assertMC10Stage(view,'CONFIRMED_PRODUCTS',expected,progress);
      let pending=0,eligible=true;
      try{for(let index=0;index<view.rows.length;index++){
        const row=mc10ReviewedRowDiagnostics({rows:[view.rows[index]]},[expected[index]]).failures[0];
        if(!row)continue;
        if(row.failedFields.length!==1||row.failedFields[0]!=='VISIBLE_PRIMARY_LOADED'
          ||row.facts.primaryExpected!==true||row.facts.firstImagePresent!==true||row.facts.firstImageRendered!==true
          ||row.facts.firstImageInViewport!==true||row.facts.firstImageComplete!==false
          ||!Number.isSafeInteger(row.facts.firstImageNaturalWidth)||row.facts.firstImageNaturalWidth<0){eligible=false;break;}
        pending++;
      }}catch{eligible=false;}
      if(!eligible||pending===0)return assertMC10Stage(view,'CONFIRMED_PRODUCTS',expected,progress);
      receipt.state='PENDING';receipt.pendingSnapshots++;receipt.maxPendingRows=Math.max(receipt.maxPendingRows,pending);return false;
    }
  };
  try{
    if(ready(initial))return assertMC10Stage(initial,'CONFIRMED_PRODUCTS',expected,progress);
    receipt.waited=true;
    const loaded=await wait(ready,'MC10_VISIBLE_PRIMARY_LOAD_PENDING');
    return assertMC10Stage(loaded,'CONFIRMED_PRODUCTS',expected,progress);
  }catch(error){
    receipt.state='REFUSED';
    if(error?.message==='MC10_VISIBLE_PRIMARY_LOAD_PENDING')return assertMC10Stage(last,'CONFIRMED_PRODUCTS',expected,progress);
    if(progress&&error?.message!=='MC10_REVIEWED_CONTENT_OR_IMAGE_MISMATCH'){
      try{progress.reviewedRowFailure=mc10ReviewedRowDiagnostics(last,expected);}catch{progress.reviewedRowFailure={kind:'MC10_REVIEWED_ROW_FAILURE_ONLY',state:'UNAVAILABLE',accepted:false,reason:'BOUNDED_PROJECTION_REFUSED'};}
    }
    throw error;
  }
}
/** Orchestrates the real, closed native actions. An unresolved binding never reaches this function. */
export async function mc10TransitionProof({page,binding,config,bounded,fixture,save,progress={}}){
  requireMC10UiBinding(binding);
  let expectedRows=[];
  const publicRows=items=>items.map(({productId,variantId,productName,specification,reviewedMedia,reviewedContent})=>({productId,variantId,productName,specification,reviewedMedia,reviewedContent}));
  const observe=async()=>bounded(page.evaluate(mc10ViewSource(binding,expectedRows)));
  const wait=(predicate,code)=>waitForMC10Condition(page,bounded,observe,predicate,code);
  const noAttempt=()=>assertNoDisplayAttempt(page,bounded);
  const native=[];progress.native=native;
  const assertStage=async(view,stage,expected=[])=>stage==='CONFIRMED_PRODUCTS'
    ?settleMC10VisibleImages(view,expected,wait,progress):assertMC10Stage(view,stage,expected,progress);
  const action=async(kind,identity=null)=>{await noAttempt();const acquired=await (['previousPage','continue'].includes(kind)?mc10CurrentOrderTarget(page,binding,kind,bounded,native):mc10NativeTarget(page,binding,kind,identity,bounded,native,expectedRows));
    const focusBefore=['confirm','nextPage','previousPage'].includes(kind)?{observer:await bounded(page.evaluate('window.__xeniosMC10FocusObservationV1?.snapshot()??null')),nativePager:['nextPage','previousPage'].includes(kind)?acquired:null}:null;
    await dispatchActivationKey(page,'Enter',bounded);await noAttempt();return focusBefore;};
  const capture=(scene)=>saveMC10Scene(scene,observe,save,progress,expectedRows);

  const fields=[['fullLegalName',MC10_CONTACT.fullLegalName],['email',MC10_CONTACT.email],['line1',MC10_CONTACT.postalAddress.line1],
    ['city',MC10_CONTACT.postalAddress.city],['region',MC10_CONTACT.postalAddress.region],['postalCode',MC10_CONTACT.postalAddress.postalCode]];
  let view=await assertStage(await observe(),'REQUIRED_INTAKE');progress.before={stage:view.stage,view};
  requireThat(fixture.snapshot().phase==='REQUIRED'&&fixture.snapshot().catalogReads===0,'MC10_INITIAL_FIXTURE_NOT_REQUIRED');
  if(mc10CapturePlan().some(item=>item.configuration===config.name&&item.scene==='pre-intake'&&item.selected)){
    await noAttempt();progress.before.focus=await mc10NativeTarget(page,binding,'fullLegalName',null,bounded,native);
    view=await assertStage(await observe(),'REQUIRED_INTAKE');await capture('pre-intake');
  }
  await noAttempt();await mc10NativeTarget(page,binding,'countryCode',null,bounded,native);
  await mc10SelectUnitedStates(page,bounded);await noAttempt();
  for(const [kind,value]of fields){
    await noAttempt();await mc10NativeTarget(page,binding,kind,null,bounded,native,[],kind==='fullLegalName'?'reverse':'forward');
    // Real keyboard editing, not a DOM value/focus/submit shortcut.
    await bounded(page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2}));
    await bounded(page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2}));
    await bounded(page.send('Input.insertText',{text:value}));await noAttempt();
  }

  const admissionFocusBefore=await action('confirm');
  view=await wait(v=>v.stage==='REQUIRED_INTAKE'&&v.confirmBusy,'MC10_HELD_SAVING_NOT_OBSERVED');
  progress.held={fixture:fixture.snapshot(),view};
  requireThat(progress.held.fixture.phase==='PENDING_HELD'&&progress.held.fixture.catalogReads===0&&view.counts.rows===0,'MC10_HELD_ADMISSION_LEAK');
  fixture.releaseAdmission();
  const first=await fixture.expectedPage(1);expectedRows=publicRows(first.items);
  view=await wait(v=>v.stage==='CONFIRMED_PRODUCTS'&&v.rows.length===first.items.length,'MC10_CONFIRMED_CHILD_PRODUCTS_NOT_OBSERVED');
  view=await assertStage(view,'CONFIRMED_PRODUCTS',first.items);assertMC10Dock(view,{empty:true});progress.confirmed=view;
  await requireMC10AppRestoredFocus(page,binding,'ADMISSION',admissionFocusBefore,bounded,progress);
  // Native focus frames the exact first canonical row; Details is never activated.
  const frameRow=first.items[0];
  requireThat(frameRow,'MC10_CATALOG_FRAMING_ROW_ABSENT');await noAttempt();
  await mc10NativeTarget(page,binding,'details',{productId:frameRow.productId,variantId:frameRow.variantId},bounded,native,expectedRows);
  view=await assertStage(await observe(),'CONFIRMED_PRODUCTS',first.items);await noAttempt();
  await capture('catalog-empty-dock');
  if(config.name==='mc10-phone320'&&first.total>24){
    const second=await fixture.expectedPage(2);expectedRows=publicRows(second.items);const nextFocusBefore=await action('nextPage');
    const next=await assertStage(await wait(v=>v.rows[0]?.variantId===second.items[0]?.variantId,'MC10_NATIVE_PAGE_TWO_NOT_READY'),'CONFIRMED_PRODUCTS',second.items);
    await requireMC10AppRestoredFocus(page,binding,'NEXT_PAGE',nextFocusBefore,bounded,progress);
    expectedRows=publicRows(first.items);const previousFocusBefore=await action('previousPage');view=await wait(v=>v.rows[0]?.variantId===first.items[0]?.variantId,'MC10_NATIVE_PAGE_RETURN_NOT_READY');view=await assertStage(view,'CONFIRMED_PRODUCTS',first.items);
    await requireMC10AppRestoredFocus(page,binding,'PREVIOUS_PAGE',previousFocusBefore,bounded,progress);
    progress.pagination={pageOne:first.items.map(row=>row.variantId),pageTwo:second.items.map(row=>row.variantId),returned:true};
  }
  if(['mc10-phone320-200','mc10-phone375-200'].includes(config.name)){
    const search=await fixture.expectedSearch();
    let nativeSearch=null;
    const typeSearch=async(value)=>{
      requireThat(['BPC-157','MOTS-c'].includes(value),'MC10_NATIVE_SEARCH_NOT_APPROVED');
      nativeSearch=await mc10SearchTarget(page,binding,bounded,native,nativeSearch);
      await bounded(page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2}));
      await bounded(page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2}));
      await bounded(page.send('Input.insertText',{text:value}));
      requireThat(await bounded(page.evaluate(`document.activeElement?.matches(${JSON.stringify(binding.selectors.search)})&&document.activeElement.value===${JSON.stringify(value)}`))===true,'MC10_NATIVE_SEARCH_VALUE_NOT_OBSERVED');
      await noAttempt();
    };
    expectedRows=publicRows(search.items);await typeSearch('BPC-157');
    view=await wait(v=>v.rows.length===search.items.length&&v.rows.every((row,index)=>row.variantId===search.items[index].variantId),'MC10_SEARCH_IDENTITIES_NOT_READY');
    view=await assertStage(view,'CONFIRMED_PRODUCTS',search.items);const target=fixture.selection();
    requireThat(search.items.some(row=>row.productId===target.productId&&row.variantId===target.variantId&&row.selectableForReview&&!row.clinicalReviewRequired),'MC10_SELECTION_NOT_GENUINE');
    await action('add',target);view=await wait(v=>v.dock.rendered,'MC10_POPULATED_DOCK_NOT_READY');assertMC10Dock(view);progress.populated=view;await capture('populated-dock');
    const mots=await fixture.expectedSearch('MOTS-c');requireThat(mots.total>0&&mots.items.length>0,'MC10_FIXED_MOTS_SEARCH_MISSING');
    expectedRows=publicRows(mots.items);await typeSearch('MOTS-c');
    let motsView=await wait(v=>v.rows.length===mots.items.length&&v.rows.every((row,index)=>row.variantId===mots.items[index].variantId),'MC10_MOTS_SEARCH_NOT_READY');
    motsView=await assertStage(motsView,'CONFIRMED_PRODUCTS',mots.items);assertMC10Dock(motsView);
    progress.motsSearch={view:motsView,selectedVariantPreserved:target.variantId};
    expectedRows=publicRows(search.items);await typeSearch('BPC-157');
    view=await wait(v=>v.rows.length===search.items.length&&v.rows.every((row,index)=>row.variantId===search.items[index].variantId),'MC10_BPC_RETURN_NOT_READY');
    view=await assertStage(view,'CONFIRMED_PRODUCTS',search.items);assertMC10Dock(view);    await action('continue');view=await wait(v=>v.stage==='CONTACT','MC10_CONTACT_BACK_NAVIGATION_MISSING');progress.contact={stage:view.stage,dock:view.dock};
    await action('back');view=await wait(v=>v.stage==='CONFIRMED_PRODUCTS','MC10_PRODUCTS_RETURN_MISSING');assertMC10Dock(view);
    await action('remove',target);view=await wait(v=>v.stage==='CONFIRMED_PRODUCTS'&&v.counts.dock===0&&v.counts.spacer===0,'MC10_EMPTY_PRODUCTS_DOCK_NOT_REMOVED');assertMC10Dock(view,{empty:true});
    progress.lastRemoval={view};await mc10LastRemovalContinuation(page,bounded,progress.lastRemoval);await noAttempt();await capture('post-last-removal');
  }
  if(config.name==='mc10-phone320'){
    fixture.expire();await bounded(page.navigate(fixture.origin+'/earlyaccess',{quietMs:150,maxSettleMs:5000,loadTimeoutMs:8000}));
    const expired=await wait(v=>v.stage==='REQUIRED_INTAKE','MC10_SYNTHETIC_EXPIRY_GATE_NOT_RESTORED');await assertStage(expired,'REQUIRED_INTAKE');progress.expiry={synthetic:true,view:expired,realTtlProof:false};
  }
  await settlePostInteractionNetwork(page,bounded);
  const focus=await bounded(page.evaluate('window.__xeniosMC10FocusObservationV1?.snapshot()??null'));
  requireThat(focus&&focus.failures===0&&focus.reentrant===0,'MC10_FOCUS_OBSERVATION_INCOMPLETE');progress.focusObservation=focus;
  await noAttempt();
  return {scope:MC10_SCOPE,state:'OBSERVED_SYNTHETIC_TRANSITIONS_ONLY',assertions:[
    {name:'actual_frontend_required_held_confirmed_transition',passed:true},{name:'canonical_page_and_row_identity',passed:true},
    {name:'no_attempt_receipt_or_draft',passed:true},{name:'native_focus_and_stage_dock_contract',passed:true},
    {name:'reduced_motion_and_calibrated_font',passed:view.reducedMotion===true}],progress};
}
/** All browser requests stay attributed, even if page helpers reset telemetry. */
function observeRequests(conn, targetOrigin, violations, scenario = PUBLIC_SCENARIO, displayContract = LEGACY_DISPLAY_CONTRACT) {
  const observe = ({ request }) => {
    if (!request) return;
    let allowed = false;
    try {
      const url = new URL(request.url);
      allowed = observedMethodAllowed(request.method, url, targetOrigin, scenario, displayContract);
      if (["data:", "blob:", "about:"].includes(url.protocol)
        && (scenario === PUBLIC_SCENARIO || ["GET", "HEAD"].includes(request.method))) allowed = true;
    } catch {}
    if (!allowed) violations.push({ method: request.method, target: scenario === PARTNER_COMPONENT_SCENARIO ? 'OFF_CONTRACT_REDACTED' : safeNetworkUrl(request.url), reason: "OFF_CONTRACT_REQUEST" });
  };
  return conn.on("Network.requestWillBeSent", observe);
}

/** Closed observational DTO, never an Auth/context or arbitrary page serializer. */
export const PARTNER_READ_PATHS = Object.freeze(['/api/research/partner/dashboard','/api/research/partner/links','/api/research/partner/readable-codes']);
export const PARTNER_EPOCH_MS = 1795132800000;
const exactPartnerKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
export function validatePartnerSnapshot(value, selection, { retired = false } = {}) {
  const finite = n => Number.isSafeInteger(n) && n >= 0 && n <= 10000000000000;
  requireThat(exactPartnerKeys(value,['schemaVersion','mode','page','case','generation','active','provider','reads','pending','held','violations','droppedRecords','restore','clock','storage'])
    && value.schemaVersion === 1 && value.mode === PARTNER_COMPONENT_SCOPE && value.page === selection.page && value.case === selection.selectedCase
    && finite(value.generation) && value.generation > 0 && value.active === !retired && value.provider === 'NOT_OBSERVED', 'PARTNER_HOOK_IDENTITY_INVALID');
  requireThat(Array.isArray(value.reads) && value.reads.length <= 64 && finite(value.pending) && finite(value.held)
    && value.pending <= value.reads.length && value.held <= value.pending && Array.isArray(value.violations) && value.violations.length === 0
    && value.droppedRecords === 0, 'PARTNER_HOOK_BOUNDARY_OR_LIMIT_FAILED');
  const ordinals = new Map();
  for (const read of value.reads) {
    requireThat(exactPartnerKeys(read,['method','path','ordinal','status','responseSha256','terminal']) && read.method === 'GET'
      && PARTNER_READ_PATHS.includes(read.path) && read.ordinal === (ordinals.get(read.path) ?? 0) + 1
      && ['pending','response','error','aborted'].includes(read.terminal)
      && (read.status === null || [200,401,403,404,503].includes(read.status))
      && (read.responseSha256 === null || /^[a-f0-9]{64}$/u.test(read.responseSha256)), 'PARTNER_HOOK_READ_INVALID');
    requireThat(read.terminal !== 'response' || read.status !== null && read.responseSha256 !== null, 'PARTNER_HOOK_RESPONSE_UNBOUND');
    ordinals.set(read.path,read.ordinal);
  }
  requireThat(exactPartnerKeys(value.restore,['fetch','storage','hook']) && Object.values(value.restore).every(v => v === null || typeof v === 'boolean')
    && (!retired || Object.values(value.restore).every(v => v === null || v === true)), 'PARTNER_HOOK_RESTORATION_UNOBSERVED');
  requireThat(exactPartnerKeys(value.clock,['expectedEpochMs','observedEpochMs']) && value.clock.expectedEpochMs === PARTNER_EPOCH_MS
    && value.clock.observedEpochMs === PARTNER_EPOCH_MS, 'PARTNER_DISPLAY_CLOCK_INVALID');
  const storage = value.storage;
  requireThat(exactPartnerKeys(storage,['coverage','before','after','cleanup','setItemAttempts']) && storage.coverage === 'gallery-only'
    && [storage.before,storage.after].every(v => exactPartnerKeys(v,['session','local']) && v.session === 0 && v.local === 0)
    && storage.setItemAttempts === 0 && Array.isArray(storage.cleanup) && storage.cleanup.length <= 64
    && storage.cleanup.every(v => exactPartnerKeys(v,['area','key','hadValue','completed']) && ['session','local'].includes(v.area)
      && ['current-cart','legacy-cart'].includes(v.key) && v.hadValue === false && v.completed === true), 'PARTNER_GALLERY_STORAGE_INVALID');
  return value;
}
/** Fixed source fixture expectations; response byte hashes are checked independently. */
export function partnerExpectedResponse(selection, path, ordinal, origin) {
  requireThat(partnerGallerySelection(partnerGalleryRoute(selection.page,selection.selectedCase)) && PARTNER_READ_PATHS.includes(path)
    && Number.isSafeInteger(ordinal) && ordinal > 0 && ordinal <= 4 && /^http:\/\/127\.0\.0\.1:\d+$/u.test(origin), 'PARTNER_EXPECTATION_INPUT_INVALID');
  const c = selection.selectedCase, main = path === (selection.page === 'partner-links' ? PARTNER_READ_PATHS[1] : PARTNER_READ_PATHS[0]);
  let status = 200, body;
  const row = (suffix, patch = {}) => ({id:`f0000000-0000-4000-8000-0000000000${suffix}`,state:'ready',destinationPath:'/health',url:origin+'/r/DISPLAY-READY',createdAt:'2026-11-18T12:00:00.000Z',expiresAt:'2026-11-27T12:00:00.000Z',revokedAt:null,opens:3,accountsLinked:1,...patch});
  const links = () => [row('20'),row('21',{state:'revoked',url:null,revokedAt:'2026-11-19T12:00:00.000Z'}),row('22',{state:'expired',url:null,expiresAt:'2026-11-19T12:00:00.000Z'}),row('23',{state:'partner_inactive',url:null}),row('24',{state:'unavailable',url:null}),row('25',{url:origin+'/r/DISPLAY-OTHER'})];
  if (main && c === 'api401') {status=401;body={ok:false,code:'sign_in_required'};}
  else if (main && c === 'unavailable') {status=503;body={ok:false,code:selection.page === 'partner-links' ? 'unavailable' : 'capability_disabled'};}
  else if (path === PARTNER_READ_PATHS[0]) {
    if (c === 'generic-forbidden') {status=403;body={ok:false};}
    else if (c === 'partner-missing') {status=404;body={ok:false,code:'partner_not_found'};}
    else if (c === 'error') return {terminal:'error',status:null,responseSha256:null};
    else {
      const partner = {partnerId:'f0000000-0000-4000-8000-000000000010',role:'affiliate',state:'active',leadCount:0,financialReporting:'connected',conversionCount:2,totalCommissionCents:1500,payableCents:500,
        conversions:[{attributedAt:'2026-11-18T12:00:00.000Z',eligibleNetCents:10000,commissionCents:1000,state:'held'},{attributedAt:'2026-11-19T12:00:00.000Z',eligibleNetCents:5000,commissionCents:500,state:'payable'}],outstandingTraining:[{moduleKey:'referral-basics',version:'1.0'}]};
      if (['disconnected','loading','malformed'].includes(c)) Object.assign(partner,{financialReporting:'not_connected',conversionCount:null,totalCommissionCents:null,payableCents:null,conversions:null});
      if(c === 'malformed') partner.conversionCount=0;
      if(['confirmed-zero','unconfirmed'].includes(c)) Object.assign(partner,{conversionCount:0,totalCommissionCents:0,payableCents:0,conversions:[]});
      if(c === 'unconfirmed') delete partner.financialReporting;
      body={ok:true,partner};
    }
  } else if (path === PARTNER_READ_PATHS[1]) {
    if(selection.page === 'partner-links' && c === 'refresh-failure' && ordinal === 2){status=503;body={ok:false,code:'unavailable'};}
    else if(selection.page === 'partner-links' && c === 'malformed') body={ok:true,eligible:'yes',links:[]};
    else body={ok:true,...(c === 'ineligible' ? {eligible:false,links:[]} : c === 'empty' ? {eligible:true,links:[]} : {eligible:true,links:links()})};
  } else body={ok:true,aliases:c === 'empty' ? [] : [{code:'DISPLAY-CODE',assignedAt:'2026-11-19T12:00:00.000Z',link:links()[0]}]};
  return {terminal:'response',status,responseSha256:hash(JSON.stringify(body))};
}
export function assertPartnerReadCensus(snapshot, selection, origin, { qr = false, refresh = false } = {}) {
  validatePartnerSnapshot(snapshot,selection);
  requireThat(snapshot.pending === 0 && snapshot.held === 0, 'PARTNER_READS_UNSETTLED');
  const noReads=['signed-out','checking'].includes(selection.selectedCase), links=selection.page === 'partner-links';
  const allowed = links ? [PARTNER_READ_PATHS[1],PARTNER_READ_PATHS[2]] : [PARTNER_READ_PATHS[0],...(qr ? [PARTNER_READ_PATHS[1]] : [])];
  requireThat(noReads ? snapshot.reads.length === 0 : snapshot.reads.length > 0 && snapshot.reads.every(r => allowed.includes(r.path)), 'PARTNER_READ_PATH_CENSUS_FAILED');
  for(const read of snapshot.reads){const expected=partnerExpectedResponse(selection,read.path,read.ordinal,origin);
    requireThat(Object.keys(expected).every(k => read[k] === expected[k]), 'PARTNER_READ_RESPONSE_BYTES_MISMATCH');}
  const count = path => snapshot.reads.filter(r=>r.path===path).length;
  if(!noReads) requireThat(count(links?PARTNER_READ_PATHS[1]:PARTNER_READ_PATHS[0]) === (refresh?2:1), 'PARTNER_PRIMARY_READ_CENSUS_FAILED');
  const eligible=links && ['ready','empty','loading','refresh-failure'].includes(selection.selectedCase);
  requireThat(count(PARTNER_READ_PATHS[2]) === (eligible?1:0) && (links || count(PARTNER_READ_PATHS[1]) === (qr?1:0)), 'PARTNER_AUTOMATIC_ALIAS_OR_QR_READ_CENSUS_FAILED');
  return {scope:'IN_MEMORY_GETS_NOT_HTTP_OR_ROLE_PROOF',count:snapshot.reads.length,automaticAliasReads:count(PARTNER_READ_PATHS[2]),qrRead:qr};
}

/** Only observed public fixture fields. Refuse marker leakage before serialization. */
export function collectPartnerView(doc, view) {
  const norm = value => (value??'').trim().replace(/\s+/gu,' '), text=norm(doc.body?.innerText ?? doc.body?.textContent);
  const mains=Array.from(doc.querySelectorAll('main')),main=mains.length===1?mains[0]:null;
  const documentSignIn=Array.from(doc.querySelectorAll('a')).filter(a=>norm(a.textContent)==='Sign in');
  const componentSignIn=main?documentSignIn.filter(a=>main.contains(a)):[];
  const inputs=Array.from(doc.querySelectorAll('input')).map(n=>n.value);
  if(/DISPLAY-NOT-A-CREDENTIAL|NO-SIGNATURE/u.test(text) || inputs.some(v=>/DISPLAY-NOT-A-CREDENTIAL|NO-SIGNATURE/u.test(v))) throw new Error('PARTNER_MARKER_REACHED_DOM');
  const box = node => { if(!node)return null;const r=node.getBoundingClientRect(),s=view.getComputedStyle(node);return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,overflowX:s.overflowX,overflowY:s.overflowY,rendered:node.getClientRects().length>0&&s.display!=='none'&&s.visibility!=='hidden'};};
  const navs=Array.from(doc.querySelectorAll('nav[aria-label="Partner tools"],nav[aria-label="Account and partner tools"]')).map(n=>({label:n.getAttribute('aria-label'),links:Array.from(n.querySelectorAll('a')).map(a=>({text:norm(a.textContent),href:a.getAttribute('href'),current:a.getAttribute('aria-current'),geometry:box(a)}))}));
  const metrics=Array.from(doc.querySelectorAll('[data-testid="pd-metrics"] [data-testid="ra-metric"]')).map(n=>{const p=n.querySelectorAll('p');return {label:norm(p[0]?.textContent),value:norm(p[1]?.textContent),summary:norm(p[2]?.textContent),geometry:box(n)};});
    const cards=Array.from(doc.querySelectorAll('section[aria-labelledby="recommendation-links-title"] article')).map(n=>({state:norm(n.querySelector('p')?.textContent),text:norm(n.innerText??n.textContent),counts:Array.from(n.querySelectorAll('dd')).map(d=>norm(d.textContent)),values:Array.from(n.querySelectorAll('input')).map(i=>({value:i.value,readOnly:i.readOnly})),geometry:box(n)}));
  return {scope:'DEV_ONLY_COMPONENT_SYNTHETIC_TEXT_AND_GEOMETRY',text:text.slice(0,24000),textTruncated:text.length>24000,h1:Array.from(doc.querySelectorAll('h1')).map(n=>norm(n.textContent)),mainCount:mains.length,
    overflow:doc.documentElement.scrollWidth>view.innerWidth+1,pageLength:Math.max(doc.body?.scrollHeight??0,doc.documentElement.scrollHeight),viewport:{width:view.innerWidth,height:view.innerHeight},navs,metrics,cards,
    signInHrefs:componentSignIn.map(a=>a.getAttribute('href')),
    signInScope:{state:main?'UNIQUE_COMPONENT_MAIN':mains.length?'AMBIGUOUS_COMPONENT_MAIN':'MISSING_COMPONENT_MAIN',documentCount:documentSignIn.length,componentCount:componentSignIn.length,outsideComponentCount:main?documentSignIn.length-componentSignIn.length:null},
    alert:Array.from(doc.querySelectorAll('[role="alert"]')).map(n=>norm(n.textContent)),loading:!!doc.querySelector('#recommendation-links-loading,[data-testid="ra-loading"]'),
    ineligible:!!doc.querySelector('#recommendation-access-title'),linksSection:!!doc.querySelector('#recommendation-links-title'),codesSection:!!doc.querySelector('#readable-codes-title'),
    metricError:!!doc.querySelector('[data-testid="ra-error"]'),denial:!!doc.querySelector('[data-testid="ra-denial"]'),
    training:norm(doc.querySelector('[aria-labelledby="pd-training"]')?.textContent),identity:norm(doc.querySelector('[data-testid="pd-identity"]')?.textContent),
    conversionRows:Array.from(doc.querySelectorAll('[aria-labelledby="pd-conversions"] tbody tr')).map(n=>Array.from(n.querySelectorAll('td')).map(td=>norm(td.textContent))),
    dialogCount:doc.querySelectorAll('dialog[open]').length,controls:Array.from(doc.querySelectorAll('main button')).map(n=>({text:norm(n.textContent),disabled:n.disabled,geometry:box(n)})).slice(0,96)};
}
const PARTNER_VIEW_SOURCE=`(${collectPartnerView.toString()})(document,window)`;
export function partnerUiReady(view,selection,{afterRefresh=false}={}) {
  const c=selection.selectedCase, links=selection.page==='partner-links';
  if(!view || view.mainCount!==1 || !view.h1?.includes(links?'Referral links':'Partner dashboard')) return false;
  if(c==='checking')return view.loading||view.text.includes('Checking your account');
  if(c==='signed-out'||!links&&c==='api401') return view.signInHrefs.length===1;
  if(view.loading)return false;
  if(links){if(c==='ineligible')return view.ineligible;
    if(['api401','unavailable','malformed'].includes(c)||afterRefresh)return view.alert.length>0&&view.cards.length===0;
    return view.linksSection&&view.codesSection&&(c==='empty'?view.cards.length===0:view.cards.length===6)&&!view.text.includes('Checking your referral codes');}
  if(c==='partner-missing')return view.denial&&view.metrics.length===0;
  if(['malformed','error'].includes(c))return view.metricError&&view.metrics.length===0;
  return view.metrics.length===4;
}
export function partnerUiAssertions(view, selection) {
  const c=selection.selectedCase, links=selection.page==='partner-links', noMetrics=['signed-out','checking','api401','partner-missing','malformed','error'].includes(c);
  const tests=[{name:'exact_component_heading',passed:view.h1.length===1&&view.h1[0]===(links?'Referral links':'Partner dashboard')},
    {name:'one_main_no_document_overflow',passed:view.mainCount===1&&!view.overflow},
    {name:'bounded_marker_free_public_fixture_text',passed:!view.textTruncated},
    {name:'exact_current_case_not_false_empty',passed:partnerUiReady(view,selection)}];
  const expectedNav=links?[['Partner dashboard','/research/partners/dashboard'],['Referral links','/research/partners/links'],['Partner resources','/research/partners/resources'],['My account','/research/account'],['Account support','/research/account/support']]
    :[['My account','/research/account'],['Browse catalog','/research/member/catalog'],['Referral links','/research/partners/links'],['Account support','/research/account/support']];
  tests.push({name:'actual_tool_nav_exact_hrefs_read_only',passed:view.navs.length===1&&view.navs[0].links.length===expectedNav.length&&expectedNav.every(([text,href],i)=>view.navs[0].links[i].text===text&&view.navs[0].links[i].href===href)});
  if(c==='signed-out'||!links&&c==='api401')tests.push({name:'context_or_dashboard401_signin_no_data',passed:view.signInHrefs[0]==='/research/sign-in?returnTo='+encodeURIComponent(links?'/research/partners/links':'/research/partners/dashboard')&&view.cards.length===0&&view.metrics.length===0});
  if(c==='checking')tests.push({name:'checking_not_zero_or_denial',passed:!view.cards.length&&!view.metrics.length&&!view.denial});
  if(links){
    if(c==='ineligible')tests.push({name:'ineligible_no_issue_or_share_controls',passed:view.ineligible&&!view.linksSection&&!view.codesSection&&!view.controls.some(v=>/Create|Copy|Share|Download|Revoke/u.test(v.text))});
    if(c==='empty')tests.push({name:'eligible_empty_distinct_from_denied',passed:view.linksSection&&view.codesSection&&!view.ineligible&&view.text.includes('You have no recommendation links yet.')});
    if(c==='api401')tests.push({name:'positive_context_401_is_role_alert_not_context_signin',passed:view.alert.some(t=>t.includes('Your session has ended. Sign in again to continue.'))&&view.signInHrefs.length===0&&!view.cards.length});
    if(['unavailable','malformed'].includes(c))tests.push({name:'failed_read_has_no_stale_or_false_zero_links',passed:view.alert.length>0&&!view.cards.length&&!view.linksSection});
    if(['ready','refresh-failure','loading'].includes(c))tests.push({name:'all_six_link_states_and_whole_ready_values',passed:view.cards.length===6&&['Active','Revoked','Expired','Partner inactive','Unavailable','Active'].every((s,i)=>view.cards[i].state===s)&&view.cards.filter(v=>v.values.length).length===2&&view.cards.filter(v=>v.values.length).every(v=>v.values.length===1&&v.values[0].readOnly&&/\/r\/DISPLAY-(READY|OTHER)$/u.test(v.values[0].value))},
      {name:'automatic_alias_visible_only_as_synthetic_display',passed:view.codesSection&&view.text.includes('DISPLAY-CODE')},
      {name:'exact_link_counts_and_nonready_refusal',passed:view.cards.every(card=>JSON.stringify(card.counts)===JSON.stringify(['3','1']))&&view.cards.filter(card=>!card.values.length).every(card=>card.text.includes('This link is not available to share.'))});
    if(!['signed-out','checking'].includes(c))tests.push({name:'referral_rules_are_not_order_or_commission_proof',passed:view.text.includes('An open or linked account does not mean an order, payment, clinical relationship, or earned commission.')&&view.text.includes('Share only approved content and disclose your partner relationship in the message itself.')});
  }else if(!noMetrics){
    const connected=['connected','confirmed-zero'].includes(c),zero=c==='confirmed-zero',unknown=c==='unconfirmed';
    tests.push({name:'leads_are_not_a_legacy_zero',passed:view.metrics[0].value==='Not reported'&&view.metrics[0].summary.includes('This is not a zero count.')},
      {name:'four_source_ordered_metrics',passed:['Leads','Commission-linked conversions','Net recorded commissions','Payable balance'].every((v,i)=>view.metrics[i]?.label===v)},
      {name:'connected_values_or_explicit_unknown',passed:view.metrics.slice(1).every((m,i)=>m.value===(connected?(zero?['0','$0.00','$0.00']:['2','$15.00','$5.00'])[i]:'Unavailable'))},
      {name:'reporting_qualifiers_not_purchase_or_payout_proof',passed:connected?view.metrics[1].summary.includes('Not all purchases.')&&view.metrics[2].summary.includes('Not a payout balance.')&&view.metrics[3].summary.includes('does not confirm a scheduled or completed payout'):view.metrics.slice(1).every(m=>m.summary.includes(unknown?'could not be confirmed':c==='disconnected'||c==='loading'?'not connected yet':'could not be loaded'))});
    if(c==='connected')tests.push({name:'exact_synthetic_conversion_rows',passed:JSON.stringify(view.conversionRows)===JSON.stringify([['2026-11-18T12:00:00.000Z','$100.00','$10.00','held'],['2026-11-19T12:00:00.000Z','$50.00','$5.00','payable']])});
    if(c==='unconfirmed')tests.push({name:'omitted_reporting_is_unconfirmed_not_not_connected',passed:view.text.includes('could not be confirmed')&&!view.text.includes('Commission reporting is not connected yet')});
    if(!['unavailable','generic-forbidden'].includes(c))tests.push({name:'actual_role_state_training_not_an_inferred_permission',passed:view.identity.includes('Affiliate')&&view.identity.includes('active')&&view.training.includes('referral basics')&&view.training.includes('version 1.0')});
  }
  return tests;
}

export const PARTNER_NATIVE_TARGETS=Object.freeze({assign:`document.activeElement?.tagName==='BUTTON'&&document.activeElement.textContent.trim()==='Assign a referral code'`,cancel:`document.activeElement?.tagName==='BUTTON'&&document.activeElement.textContent.trim()==='Cancel code change'`,refresh:`document.activeElement?.id==='recommendation-refresh'`,share:`document.activeElement?.tagName==='BUTTON'&&document.activeElement.textContent.trim()==='Open referral tools'`,qr:`document.activeElement?.tagName==='BUTTON'&&document.activeElement.textContent.trim()==='Enlarge QR'`});
export function partnerFocusAccepted(sample,expectedIdentity,{inside=false}={}){
  return Boolean(sample&&!sample.body&&sample.identity===expectedIdentity&&sample.indicator&&sample.inViewport
    &&(!inside||sample.inside===true)&&sample.geometry?.rendered&&sample.geometry.fullyInViewport&&sample.geometry.unobscured
    &&sample.geometry.indicatorUnclipped&&sample.geometry.width>=44&&sample.geometry.height>=44);
}
export async function partnerNativeTarget(page,kind,bounded,progress){
  requireThat(typeof kind==='string'&&Object.hasOwn(PARTNER_NATIVE_TARGETS,kind),'PARTNER_NATIVE_ACTION_NOT_APPROVED');
  // Separate closed gate: premium expressions/allowlist remain unchanged.
  const expression=PARTNER_NATIVE_TARGETS[kind];
  for(let i=0;i<80;i++){
    await tabWithFreshFocusBaseline(page,bounded);
    const sample=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    const matched=await bounded(page.evaluate(expression));
    progress.push({sample,matched});
    requireThat(!sample.body&&sample.indicator&&sample.inViewport,'PARTNER_NATIVE_FOCUS_NOT_VISIBLE');
    if(matched===true){
      sample.geometry=(await bounded(page.evaluate(HOME_DISMISS_STATE_SOURCE))).active;
      requireThat(partnerFocusAccepted(sample,sample.identity),'PARTNER_NATIVE_TARGET_OBSCURED_CLIPPED_OR_SMALL');
      return sample;
    }
  }
  throw new Error('PARTNER_NATIVE_TARGET_UNREACHABLE');
}
export function collectPartnerQrScope(doc,state,globalOrder){
  const dialogs=Array.from(doc.querySelectorAll('dialog[open][aria-label="Enlarged referral QR"]'));
  if(dialogs.length!==1||!state?.baselines||!Array.isArray(globalOrder)||globalOrder.length>512
    ||new Set(globalOrder).size!==globalOrder.length||globalOrder.some(id=>typeof id!=='string'||id.length>4096))return {state:'UNOBSERVABLE',order:[],inside:false};
  const nodes=[dialogs[0],...dialogs[0].querySelectorAll('*')];if(nodes.length>128)return {state:'UNOBSERVABLE',order:[],inside:false};
  const ids=new Set(nodes.map(n=>state.baselines.get(n)?.identity).filter(Boolean));
  const order=globalOrder.filter(id=>ids.has(id));
  return {state:order.length?'OBSERVED_SAME_BASELINE_DIALOG_ORDER':'UNOBSERVABLE',order,inside:dialogs[0].contains(doc.activeElement),activeIdentity:state.baselines.get(doc.activeElement)?.identity??null};
}
const PARTNER_QR_BASELINE=`(()=>{const baseline=${FOCUS_BASELINE_SOURCE};return {global:baseline.tabbableIdentities,scope:(${collectPartnerQrScope.toString()})(document,window.__xeniosEvidenceFocusStateV2,baseline.tabbableIdentities)};})()`;
const partnerQrProbeSource=()=>`(()=>{const sample=${FOCUS_PROBE_SOURCE};return {...sample,geometry:(${HOME_DISMISS_STATE_SOURCE}).active,inside:document.querySelectorAll('dialog[open][aria-label="Enlarged referral QR"]').length===1&&document.querySelector('dialog[open][aria-label="Enlarged referral QR"]').contains(document.activeElement)};})()`;
export async function partnerQrProof(page,bounded,save,progress={}){
  progress.state='INCOMPLETE';progress.walk=[];
  await partnerNativeTarget(page,'share',bounded,progress.walk);await dispatchActivationKey(page,'Enter',bounded);
  await waitForDisplayCondition(page,`!!document.querySelector('.xh-share .xh-qr svg[aria-label="Your referral QR code"]')`,bounded,'PARTNER_QR_READ_NOT_READY');
  const opener=await partnerNativeTarget(page,'qr',bounded,progress.walk);
  await bounded(page.evaluate(FOCUS_BASELINE_SOURCE));await dispatchActivationKey(page,'Enter',bounded);
  await waitForDisplayCondition(page,`document.querySelector('dialog[aria-label="Enlarged referral QR"]')?.open===true`,bounded,'PARTNER_QR_NOT_OPEN');
  const baseline=await bounded(page.evaluate(PARTNER_QR_BASELINE));progress.baseline=baseline;
  requireThat(baseline.scope.state==='OBSERVED_SAME_BASELINE_DIALOG_ORDER','PARTNER_QR_SCOPE_UNOBSERVABLE');
  const first=await bounded(page.evaluate(partnerQrProbeSource()));progress.first=first;
  requireThat(partnerFocusAccepted(first,baseline.scope.order[0],{inside:true}),'PARTNER_QR_INITIAL_FOCUS_INVALID');
  await tabWithFreshFocusBaseline(page,bounded,{shift:true});const last=await bounded(page.evaluate(partnerQrProbeSource()));progress.last=last;
  requireThat(partnerFocusAccepted(last,baseline.scope.order.at(-1),{inside:true}),'PARTNER_QR_REVERSE_TRAP_INVALID');
  await tabWithFreshFocusBaseline(page,bounded);const wrapped=await bounded(page.evaluate(partnerQrProbeSource()));progress.wrapped=wrapped;
  requireThat(partnerFocusAccepted(wrapped,first.identity,{inside:true}),'PARTNER_QR_FORWARD_TRAP_INVALID');
  progress.screenshot=await save();
  for(const type of ['keyDown','keyUp'])await bounded(page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27}));
  await waitForDisplayCondition(page,`document.querySelector('dialog[aria-label="Enlarged referral QR"]')?.open===false&&(${PARTNER_NATIVE_TARGETS.qr})`,bounded,'PARTNER_QR_ESCAPE_OR_RETURN_FAILED');
  const returned=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));progress.returned=returned;
  returned.geometry=(await bounded(page.evaluate(HOME_DISMISS_STATE_SOURCE))).active;
  requireThat(partnerFocusAccepted(returned,opener.identity),'PARTNER_QR_RETURN_FOCUS_INVALID');
  progress.state='NATIVE_QR_DISPLAY_ONLY_OBSERVED';return progress;
}
/** Normal scrolling paints each finite qualifier; geometry never implies AA/authority. */
export async function partnerPaintedObservations(page,selection,bounded){
  const selectors=selection.page==='partner-links'?['nav[aria-label="Partner tools"] a','section[aria-labelledby="recommendation-links-title"] article > p','section[aria-labelledby="recommendation-links-title"] article input','section[aria-labelledby="recommendation-links-title"] article dl','[aria-labelledby="readable-codes-title"] > p','[aria-labelledby="recommendation-rules-title"] > p']
    :['nav[aria-label="Account and partner tools"] a','[data-testid="pd-metrics"] [data-testid="ra-metric"] p','[aria-labelledby="pd-conversions"] > p','[aria-labelledby="pd-training"] p'];
  return bounded(page.evaluate(`(async()=>{const list=${JSON.stringify(selectors)}.flatMap(selector=>[...document.querySelectorAll(selector)]),seen=new Set(),rows=[];
    for(const node of list){if(seen.has(node))continue;seen.add(node);if(rows.length>=64)return {state:'TRUNCATED',rows};
      node.scrollIntoView({block:'center',behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const r=node.getBoundingClientRect(),s=getComputedStyle(node),l=Math.max(0,r.left),t=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom),hit=right>l&&bottom>t?document.elementFromPoint((l+right)/2,(t+bottom)/2):null;
      const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect(),ancestors=[];let current=node.parentElement;
      for(let depth=0;current&&depth<8;depth++,current=current.parentElement){const a=getComputedStyle(current);if(['hidden','clip','auto','scroll'].includes(a.overflowX)||['hidden','clip','auto','scroll'].includes(a.overflowY)){const b=current.getBoundingClientRect();ancestors.push({depth,left:b.left,top:b.top,right:b.right,bottom:b.bottom,overflowX:a.overflowX,overflowY:a.overflowY});}}
      rows.push({ordinal:rows.length,text:(node.textContent??'').trim().replace(/\\s+/g,' ').slice(0,600),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},rangeBounds:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,lineClamp:s.webkitLineClamp,overflowX:s.overflowX,overflowY:s.overflowY,visibleIntersection:right>l&&bottom>t,unobscuredVisibleCenter:!!hit&&node.contains(hit),rendered:node.getClientRects().length>0&&s.visibility!=='hidden'&&s.display!=='none',clippingAncestors:ancestors,ancestorScanTruncated:!!current,scope:'OBSERVED_SELECTED_TEXT_ONLY_NOT_AA_OR_FULL_PAGE'});}
    return {state:'OBSERVED_FINITE_SCROLL_SAMPLES',rows};})()`),12000);
}
export async function partnerCaseProof(page,selection,config,bounded,save,progress={}){
  progress.state='INCOMPLETE';progress.selection=selection;
  await waitForDisplayCondition(page,`!!window.__xeniosPartnerComponentDisplayV1&&!!window.__xeniosPartnerPreludeV1`,bounded,'PARTNER_HOOK_OR_PRELUDE_MISSING');
  const snapshot=async()=>validatePartnerSnapshot(await bounded(page.evaluate('window.__xeniosPartnerComponentDisplayV1.snapshot()')),selection);
  const readView=()=>bounded(page.evaluate(PARTNER_VIEW_SOURCE));
  let first=await snapshot();progress.initial=first;
  if(selection.selectedCase==='loading'){
    await waitForDisplayCondition(page,selection.page==='partner-links'?`!!document.querySelector('#recommendation-links-loading')`:`!!document.querySelector('[data-testid="ra-loading"]')`,bounded,'PARTNER_HELD_LOADING_NOT_OBSERVED');
    first=await snapshot();requireThat(first.held===1&&first.pending===1,'PARTNER_HELD_READ_CENSUS_INVALID');progress.heldLoading=first;
    progress.release=await bounded(page.evaluate('window.__xeniosPartnerComponentDisplayV1.releasePending()'));
  }
  let view;
  for(let i=0;i<40;i++){
    view=await readView();const ready=partnerUiReady(view,selection);
    progress.lastReadiness={ready,mainCount:view.mainCount,signInScope:view.signInScope};
    if(ready)break;await bounded(new Promise(r=>setTimeout(r,75)),200);
  }
  requireThat(partnerUiReady(view,selection),'PARTNER_ACTUAL_CASE_UI_NOT_READY');
  progress.initialView=view;progress.assertions=partnerUiAssertions(view,selection);
  requireThat(progress.assertions.every(a=>a.passed),'PARTNER_COMPONENT_UI_ASSERTIONS_FAILED');
  const selected=partnerCaptureMatrix().find(v=>v.configuration===config.name&&v.page===selection.page&&v.selectedCase===selection.selectedCase&&v.scene==='primary');
  progress.screenshot=selected?.selected?await save('primary'):null;progress.screenshotState=selected?.selected?'OBSERVED_DEV_SYNTHETIC_DISPLAY_ONLY':'NOT_RUN';
  if(config.name==='partner-desktop1440'&&selection.page==='partner-links'&&selection.selectedCase==='ready'){
    const actions={state:'INCOMPLETE',walk:[]};progress.form=actions;
    actions.opener=await partnerNativeTarget(page,'assign',bounded,actions.walk);await dispatchActivationKey(page,'Enter',bounded);
    await waitForDisplayCondition(page,`document.activeElement?.id==='readable-code-input'`,bounded,'PARTNER_ASSIGN_FIRST_FIELD_NOT_FOCUSED');
    actions.first=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));requireThat(actions.first.indicator&&actions.first.inViewport&&!actions.first.body,'PARTNER_ASSIGN_FOCUS_NOT_VISIBLE');
    await partnerNativeTarget(page,'cancel',bounded,actions.walk);await dispatchActivationKey(page,'Enter',bounded);
    await waitForDisplayCondition(page,`!document.querySelector('#readable-code-input')&&(${PARTNER_NATIVE_TARGETS.assign})`,bounded,'PARTNER_ASSIGN_CANCEL_FOCUS_NOT_RETURNED');
    actions.returned=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));requireThat(actions.returned.indicator&&actions.returned.inViewport&&!actions.returned.body,'PARTNER_ASSIGN_RETURN_FOCUS_NOT_VISIBLE');actions.state='NATIVE_OPEN_CANCEL_ONLY_NO_SUBMISSION';
  }
  const refresh=selection.page==='partner-links'&&selection.selectedCase==='refresh-failure';
  if(refresh){
    const actions={state:'INCOMPLETE',walk:[]};progress.refresh=actions;
    actions.opener=await partnerNativeTarget(page,'refresh',bounded,actions.walk);await dispatchActivationKey(page,'Enter',bounded);
    await waitForDisplayCondition(page,`document.activeElement?.id==='recommendation-links-loading'`,bounded,'PARTNER_REFRESH_LOADING_FOCUS_MISSING');
    actions.loading=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));requireThat(actions.loading.indicator&&actions.loading.inViewport&&!actions.loading.body,'PARTNER_REFRESH_LOADING_FOCUS_NOT_VISIBLE');
    const held=await snapshot();requireThat(held.held===1&&held.pending===1,'PARTNER_REFRESH_HELD_READ_MISSING');actions.held=held;
    actions.release=await bounded(page.evaluate('window.__xeniosPartnerComponentDisplayV1.releasePending()'));
    await waitForDisplayCondition(page,`document.activeElement?.id==='recommendation-refresh-error'`,bounded,'PARTNER_REFRESH_ERROR_FOCUS_MISSING');
    actions.error=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));requireThat(actions.error.indicator&&actions.error.inViewport&&!actions.error.body,'PARTNER_REFRESH_ERROR_FOCUS_NOT_VISIBLE');
    actions.view=await readView();requireThat(partnerUiReady(actions.view,selection,{afterRefresh:true})&&!actions.view.linksSection&&!actions.view.codesSection,'PARTNER_REFRESH_STALE_DATA_RETAINED');actions.state='NATIVE_REFRESH_HELD_LOADING_ERROR_CLEARS_STALE_CONTENT';
  }
  const qr=config.name==='partner-phone375'&&selection.page==='partner-dashboard'&&selection.selectedCase==='disconnected';
  if(qr){progress.qr={};await partnerQrProof(page,bounded,()=>save('qr'),progress.qr);}
  progress.painted=await partnerPaintedObservations(page,selection,bounded);
  requireThat(progress.painted.state==='OBSERVED_FINITE_SCROLL_SAMPLES'&&progress.painted.rows.every(r=>r.rendered&&r.visibleIntersection&&r.unobscuredVisibleCenter),'PARTNER_SELECTED_QUALIFIER_NOT_PAINTED');
  const terminal=await snapshot();progress.terminal=terminal;progress.readCensus=assertPartnerReadCensus(terminal,selection,new URL(await bounded(page.evaluate('location.href'))).origin,{qr,refresh});
  progress.observation=await bounded(page.evaluate('window.__xeniosPartnerPreludeV1.snapshot()'));
  progress.storageCensus=partnerStorageCensus(progress.observation.storage);
  requireThat(progress.observation.hostTimersUnmodified&&progress.observation.clock.observedEpochMs===PARTNER_EPOCH_MS&&progress.observation.focus.captureFailures===0&&progress.observation.focus.nativeThrows===0&&progress.storageCensus.privacyRemovals.length===4&&progress.storageCensus.capabilityProbe.pairs===1,'PARTNER_PRELUDE_OBSERVATION_FAILED');
  await settlePostInteractionNetwork(page,bounded);
  // Fixture retirement is the final fixture action. Actual mounted guards remain owned.
  const remote=await bounded(page.send('Runtime.evaluate',{expression:'window.__xeniosPartnerComponentDisplayV1',returnByValue:false}));
  const id=remote.result?.objectId;requireThat(typeof id==='string'&&id.length>0,'PARTNER_HOOK_OBJECT_UNOBSERVABLE');
  try{
    const call=async expression=>{const result=await bounded(page.send('Runtime.callFunctionOn',{objectId:id,functionDeclaration:expression,returnByValue:true}));requireThat(!result.exceptionDetails,'PARTNER_DISPOSE_OBSERVATION_FAILED');return result.result?.value;};
    progress.disposal=await call('function(){return this.dispose();}');
    requireThat(exactPartnerKeys(progress.disposal,['generation','active','restore','provider'])&&progress.disposal.generation===terminal.generation&&progress.disposal.active===false&&progress.disposal.provider==='NOT_OBSERVED'&&exactPartnerKeys(progress.disposal.restore,['fetch','storage','hook'])&&Object.values(progress.disposal.restore).every(v=>v===null),'PARTNER_FIXTURE_RETIREMENT_NOT_OBSERVED');
    progress.retired=validatePartnerSnapshot(await call('function(){return this.snapshot();}'),selection,{retired:true});
    requireThat(progress.retired.pending===0&&progress.retired.held===0&&Object.values(progress.retired.restore).every(v=>v===null)
      &&await call('function(){return this===window.__xeniosPartnerComponentDisplayV1;}')===true,'PARTNER_FIXTURE_READS_REMAIN_OR_GUARD_REMOVED');
    progress.preludeRestoration=await bounded(page.evaluate('window.__xeniosPartnerPreludeV1.restore()'));
    requireThat(progress.preludeRestoration.focus===true&&progress.preludeRestoration.clock===true,'PARTNER_PRELUDE_OWN_RESTORATION_UNOBSERVED');
    progress.storageRestoration=progress.preludeRestoration.storage===true?'OBSERVED':'PENDING_MOUNTED_FIXTURE_OWNS_GUARD';
  }finally{await bounded(page.send('Runtime.releaseObject',{objectId:id}));}
  progress.provider='NOT_OBSERVED';progress.state='OBSERVED_DEV_ONLY_SYNTHETIC_COMPONENT';return progress;
}

async function run() {
  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
  const env = process.env;
  const started = Number(env.XR_QA_STARTED_MS), deadline = started + 300000;
  const result = {
    schemaVersion: 1, kind: "OWNED_RUNNER_FRONTEND_BROWSER_QA", scope: "LOCAL_STATIC_404_FIXTURE_ONLY",
    qualifiedBaseline: QUALIFIED_BASELINE, qualifiedBaselineTree: QUALIFIED_BASELINE_TREE,
    productionQualified: false, managedAuthQualified: false, fullReleaseQualified: false,
    startedAt: new Date(started).toISOString(), state: "INCOMPLETE", phase: "capability",
    run: { id: env.XR_QA_RUN_ID, attempt: env.XR_QA_RUN_ATTEMPT, jobKey: env.XR_QA_JOB_KEY,
      numericJobId: env.XR_QA_JOB_ID || null, runnerImage: env.XR_QA_RUNNER_IMAGE,
      repository: "teamxenios/xenios-website" },
    captures: [], requests: [], violations: [], cleanup: {}, browserProfiles: [], pageChecks: [],
    wholesale: { packet: WHOLESALE_PACKET, scope: "LOCAL_PUBLIC_UNAVAILABLE_FIXTURES_ONLY", cases: [
      { id: "W01", status: "NOT_RUN", plannedParts: "heading/landmarks/metadata/public page with locked fixture gate" },
      { id: "W02", status: "NOT_RUN", reason: "Alias/query navigation excluded" },
      { id: "W03", status: "NOT_RUN", plannedParts: "unavailable anchors/observed focus/no form" },
      { id: "W04", status: "NOT_RUN", reason: "Destination navigation excluded; href inspection only" },
      { id: "W05", status: "NOT_RUN", plannedParts: "format/boundary text and DOM layout; middle cards lack separate PNGs" },
      { id: "W06", status: "NOT_RUN", reason: "375/1440/font cases planned;320 remains NOT_RUN" },
      { id: "W07", status: "NOT_RUN", reason: "Ready form excluded" },
      { id: "W08", status: "NOT_RUN", reason: "Forty-row ready-form interaction excluded" },
      { id: "W09", status: "NOT_RUN", reason: "Submission/uncertainty fixture not authorized" },
      { id: "W10", status: "NOT_RUN", plannedParts: "local source/fixture/capture correlation, no live deployment" },
    ] },
  };
  const out = realpathSync(env.XR_QA_OUT);
  let pngWrites = 0;
  const write = (name, value) => {
    requireThat(/^[a-z0-9][a-z0-9.-]+$/.test(name), "OUTPUT_NAME_INVALID");
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2) + "\n");
    if (name.endsWith(".png")) {
      requireThat((definition?.name !== DISPLAY_SCENARIO || pngWrites < (isMC10 ? MC10_PNG_CAP : DISPLAY_PNG_CAP)) && (definition?.name !== PARTNER_COMPONENT_SCENARIO || pngWrites < PARTNER_COMPONENT_PNG_CAP), "DISPLAY_PNG_CAP_REACHED");
      pngWrites++;
    }
    writeFileSync(join(out, name), bytes, { flag: "wx", mode: 0o600 });
    return { file: name, bytes: bytes.length, sha256: hash(bytes) };
  };
  let browser, conn, page, preview, snapshot, observerOff, cleanupPromise, launchStarted = false, stopped = false;
  let activeProfile, closeConfigurationPromise, activePageCheck, pageEventTrace, diagnosticAssets = new Set();
  let watchdog;
  let definition, mc10Binding, isMC10 = false, displayContract = LEGACY_DISPLAY_CONTRACT;
  let sourcePaths = OWNED_SOURCES;
  const bounded = (work, ceiling = 15000, cleanup = false) => {
    const remaining = deadline - Date.now() - (cleanup ? 3000 : 25000);
    const ms = Math.min(remaining, ceiling);
    if (ms <= 0) { void Promise.resolve(work).catch(() => {}); return Promise.reject(new Error("OVERALL_DEADLINE")); }
    let timer;
    return Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("BOUNDED_OPERATION_TIMEOUT")), ms); })])
      .finally(() => clearTimeout(timer));
  };
  const setPhase = (phase) => { result.phase = phase; };
  try {
    definition = scenarioDefinition(env.XR_QA_SCENARIO === undefined ? PUBLIC_SCENARIO : env.XR_QA_SCENARIO,
      env.XR_QA_DISPLAY_CONTRACT === undefined ? LEGACY_DISPLAY_CONTRACT : env.XR_QA_DISPLAY_CONTRACT);
    displayContract = definition.displayContract ?? LEGACY_DISPLAY_CONTRACT; isMC10 = displayContract === MC10_DISPLAY_CONTRACT;
    if(isMC10){
      sourcePaths=[...new Set([...OWNED_SOURCES,...PREMIUM_ENTRY_SOURCES,...MC10_CANONICAL_PINS.map(pin=>pin.path),...(MC10_UI_BINDING.pins??[]).map(pin=>pin.path)])];
      result.syntheticDisplay={scope:MC10_SCOPE,version:displayContract,canonicalReference:MC10_REFERENCE,
        uiBindingState:MC10_UI_BINDING.state,captureMatrix:mc10CapturePlan(),sourceCoverageIsNotPaintedCoverage:true,
        realAuthentication:false,realAssent:false,realContactRecord:false,realEligibility:false,realTtlProof:false,
        unqualified:['real_actors','managed_admission','real_human_assent','TTL','final_request','review_frozen_recovery_browser','provider','clinical','430px','desktop','default_motion','all_rows_painted','true_browser_zoom','mobile_hardware_keyboard']};
    }
    result.scenario = definition.name;
    result.scope = definition.scope;
    if (definition.name === PARTNER_COMPONENT_SCENARIO) {
      sourcePaths = [...new Set([...OWNED_SOURCES, ...PARTNER_SOURCE_PINS.map(pin => pin.path)])];
      result.partnerDisplay = { sourceReference: PARTNER_UI_REFERENCE, scope: PARTNER_COMPONENT_SCOPE,
        productionBundleEquivalence: false, realActor: false, roleOrEligibilityProof: false, ledgerOrPaymentProof: false,
        providerLifecycle: 'NOT_OBSERVED', captureMatrix: partnerCaptureMatrix(), sourcePins: [],
        excluded: ['Auth','policy_or_age_acceptance','create','revoke','assign_or_move_submit','Copy','Share','Download','Print','destination_activation','real_customers','real_ledger','providers','managed_changes'],
        fixtureTransport: 'IN_MEMORY_EXACT_GET_ONLY; no HTTP authorization or cookie', selectedImageCap: PARTNER_COMPONENT_PNG_CAP };
    }
    if (!isMC10 && [PREMIUM_ENTRY_SCENARIO, DISPLAY_SCENARIO].includes(definition.name)) {
      sourcePaths = [...new Set([...OWNED_SOURCES, ...PREMIUM_ENTRY_SOURCES,
        ...(definition.name === DISPLAY_SCENARIO ? DISPLAY_SOURCE_PINS.map((pin) => pin.path) : [])])];
      result.premiumEntry = { uiReference: PREMIUM_UI_REFERENCE, artifactScope: "PUBLIC_ENTRY_WITH_SYNTHETIC_UNAVAILABLE_GATE_ONLY",
        catalogQualified: false, customerAccessQualified: false, assentRecorded: false,
        excluded: ["catalog", "intake", "Auth", "policy_or_age_acceptance", "requests", "receipts", "payment", "desktop200", "full_page"],
        semanticSelectors: { root: '[data-testid="quick-order-request-only"]', heading: ".xenios-premium-hero h2",
          primary: ".xenios-premium-primary", unavailable: '#xenios-ea-request-start [role="status"]' } };
      if (!isMC10 && definition.name === DISPLAY_SCENARIO) {
        result.premiumEntry.artifactScope = definition.scope;
        result.premiumEntry.excluded = ["real_catalog_authority", "intake", "Auth", "policy_or_age_acceptance", "requests", "receipts", "payment", "full_page"];
        delete result.premiumEntry.semanticSelectors.unavailable;
        result.syntheticDisplay = {
        sourceReference: DISPLAY_SOURCE, scope: definition.scope, syntheticPositiveReads: true,
        realAuthentication: false, realAssent: false, realContact: false, realEligibility: false,
        actualActorProof: false, cartActionsExecuted: false, cartCountExpected: 0,
        capturePlan: "6catalog +2nativeDetails +2HCG/FedEx +1nativeOptionalGuide +2footer/contact; allothersection/viewportcombinations NOT_RUN",
        unqualified: ["P4_contact", "P5_review", "P6_receipt", "P7_retry_recovery", "real_guest_assent", "full_catalog", "staff_quote_authorization", "notice", "production"],
        sections: [], sourcePins: [], captureMatrix: displayCapturePlan() };
      }
    }
    requireThat(process.platform === "linux" && env.XR_QA_ACTIONS === "true"
      && Number.isFinite(started) && Date.now() >= started && Date.now() - started < 60000, "ACTIONS_CAPABILITY_MISSING");
    requireThat(/^\d+$/.test(env.XR_QA_RUN_ID ?? "") && /^\d+$/.test(env.XR_QA_RUN_ATTEMPT ?? "")
      && /^[a-zA-Z0-9_-]+$/.test(env.XR_QA_JOB_KEY ?? ""), "ACTIONS_IDENTITY_INVALID");
    const status = readFileSync("/proc/self/status", "utf8");
    result.isolation = validateIsolation({ uid: process.getuid(), netNamespace: readlinkSync("/proc/self/ns/net"),
      parentNetNamespace: env.XR_QA_PARENT_NET_NS,
      interfaces: JSON.parse(execFileSync("/usr/sbin/ip", ["-j", "link", "show"], { encoding: "utf8" })).map((i) => i.ifname).sort(),
      routes: [[], ["-6"]].flatMap((family) => JSON.parse(execFileSync("/usr/sbin/ip", [...family, "-j", "route", "show", "table", "main"], { encoding: "utf8" }))),
      effectiveCaps: /^CapEff:\s*(\w+)/m.exec(status)?.[1] ?? "unknown",
      noNewPrivs: /^NoNewPrivs:\s*(\d+)/m.exec(status)?.[1] ?? "unknown" });
    requireThat(/^pid:\[\d+\]$/.test(env.XR_QA_PARENT_PID_NS ?? "")
      && readlinkSync("/proc/self/ns/pid") !== env.XR_QA_PARENT_PID_NS, "PID_NAMESPACE_MISSING");
    result.isolation.pidNamespace = readlinkSync("/proc/self/ns/pid");
    const osRelease = readFileSync("/etc/os-release", "utf8");
    result.runner = { platform: process.platform, arch: process.arch, kernel: kernelRelease(),
      osId: /^ID=(.*)$/m.exec(osRelease)?.[1] ?? null, versionId: /^VERSION_ID=(.*)$/m.exec(osRelease)?.[1] ?? null };
    const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    requireThat(!git("status", "--porcelain=v1", "--untracked-files=all"), "CHECKOUT_DIRTY");
    const sourceHead = env.XR_QA_SOURCE_HEAD, sourceTree = git("rev-parse", `${sourceHead}^{tree}`);
    requireThat(SHA.test(sourceHead ?? "") && sourceTree === env.XR_QA_SOURCE_TREE, "EXPECTED_SOURCE_MISMATCH");
    const runnerHead = git("rev-parse", "HEAD"), runnerTree = git("rev-parse", "HEAD^{tree}");
    git("merge-base", "--is-ancestor", QUALIFIED_BASELINE, runnerHead);
    const runnerParents = git("show", "-s", "--format=%P", runnerHead).split(/\s+/).filter(Boolean);
    const markerBytes = readFileSync(join(repo, ownedArtifactRelativeRoot(definition.name), "PREVIEW-SOURCE.json"));
    const marker = JSON.parse(markerBytes);
    result.source = validateSourceBinding({ sourceHead, sourceTree, runnerHead, runnerTree, runnerParents, preview: marker });
    if (marker.baseHead !== null) requireThat(git("rev-parse", `${marker.baseHead}^{commit}`) === marker.baseHead, "BASE_COMMIT_MISSING");
    result.previewMarker = { bytes: markerBytes.length, sha256: hash(markerBytes) };
    const runtime = assertPinnedExecutingRuntime();
    result.runtime = { nodeVersion: runtime.nodeVersion, npmVersion: runtime.npmVersion };
    result.sources = sourcePaths.map((path) => ({ path, sha256: hash(readFileSync(join(repo, path))) }));
    if(isMC10){
      setPhase('mc10_ui_source_binding');
      mc10Binding=requireMC10UiBinding();
      git('merge-base','--is-ancestor',MC10_REFERENCE.source,runnerHead);
      git('merge-base','--is-ancestor',mc10Binding.source,runnerHead);
      git('merge-base','--is-ancestor',mc10Binding.composedSource,runnerHead);
      requireThat(git('rev-parse',`${MC10_REFERENCE.source}^{tree}`)===MC10_REFERENCE.tree
        &&git('rev-parse',`${mc10Binding.source}^{tree}`)===mc10Binding.tree
        &&git('rev-parse',`${mc10Binding.composedSource}^{tree}`)===mc10Binding.composedTree,'MC10_REFERENCE_TREE_MISMATCH');
      result.syntheticDisplay.sourcePins=[...MC10_CANONICAL_PINS,...mc10Binding.pins].map(pin=>{
        requireThat(typeof pin.path==='string'&&/^[A-Za-z0-9._/-]+$/u.test(pin.path)&&!pin.path.includes('..')&&!pin.path.startsWith('/')&&pin.mode==='100644'
          &&SHA.test(pin.blob)&&/^[a-f0-9]{64}$/u.test(pin.sha256)&&Number.isSafeInteger(pin.bytes),'MC10_SOURCE_PIN_INVALID');
        const file=join(repo,pin.path),bytes=readFileSync(file),actualBlob=git('rev-parse',`HEAD:${pin.path}`);
        requireThat(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink()&&realpathSync(file)===file
          &&actualBlob===pin.blob&&git('ls-tree','HEAD','--',pin.path)===`${pin.mode} blob ${pin.blob}\t${pin.path}`
          &&bytes.length===pin.bytes&&hash(bytes)===pin.sha256,'MC10_SOURCE_PIN_MISMATCH');
        return {...pin,actualBlob,actualSha256:hash(bytes)};
      });
      result.syntheticDisplay.uiReference={source:mc10Binding.source,tree:mc10Binding.tree,selectionReceiptSha256:mc10Binding.selectionReceiptSha256};
    }
    if (definition.name === PARTNER_COMPONENT_SCENARIO) {
      requireThat(git('rev-parse','HEAD:package-lock.json')===PARTNER_SDK_PROBE_SOURCE.lockBlob,'PARTNER_SDK_PROBE_LOCK_BLOB_MISMATCH');
      result.partnerDisplay.sdkStorageProbeSource=readPartnerSdkProbeSource(repo);
      result.partnerDisplay.sdkStorageProbeSource.appGraph=PARTNER_SDK_PROBE_SOURCE.appGraph.map(pin=>{const actual=git('rev-parse',`HEAD:${pin.path}`);requireThat(actual===pin.blob,'PARTNER_SDK_PROBE_APP_IMPORT_MISMATCH');return {...pin,actualBlob:actual};});
      git('merge-base','--is-ancestor',PARTNER_UI_REFERENCE.source,runnerHead);
      requireThat(git('rev-parse',`${PARTNER_UI_REFERENCE.source}^{tree}`) === PARTNER_UI_REFERENCE.tree, 'PARTNER_SOURCE_TREE_MISMATCH');
      requireThat(hash(readFileSync(join(repo,'.github/workflows/checks.yml'))) === PARTNER_UI_REFERENCE.rootWorkflowSha256, 'PARTNER_ROOT_WORKFLOW_BYTES_MISMATCH');
      result.partnerDisplay.sourcePins = PARTNER_SOURCE_PINS.map(pin => {
        const actualBlob=git('rev-parse',`HEAD:${pin.path}`), bytes=readFileSync(join(repo,pin.path));
        requireThat(actualBlob===pin.blob&&hash(bytes)===pin.sha256&&bytes.length===pin.bytes,'PARTNER_FROZEN_SOURCE_PIN_MISMATCH');
        return {...pin,actualBlob,actualSha256:hash(bytes)};
      });
      const productionRoot=join(repo,'dist/public');assertInventorySafe(productionRoot);
      result.partnerDisplay.productionInventorySha256=inventorySha256(inventoryDirectory(productionRoot));
      result.partnerDisplay.artifactScope='SEPARATE_DEVELOPMENT_BUILD_NOT_PRODUCTION_EQUIVALENCE';
    }
    if (!isMC10 && [PREMIUM_ENTRY_SCENARIO, DISPLAY_SCENARIO].includes(definition.name)) {
      requirePremiumRuntimeReferences();
      result.premiumEntry.actualSemanticBlobs = Object.entries(PREMIUM_UI_REFERENCE.semanticBlobs).map(([path, blob]) => {
        const actual = git("rev-parse", `HEAD:${path}`);
        requireThat(actual === blob, "PREMIUM_FROZEN_UI_SOURCE_MISMATCH");
        return { path, blob: actual };
      });
    }
    if (!isMC10 && definition.name === DISPLAY_SCENARIO) {
      git("merge-base", "--is-ancestor", DISPLAY_SOURCE.source, runnerHead);
      requireThat(git("rev-parse", `${DISPLAY_SOURCE.source}^{tree}`) === DISPLAY_SOURCE.tree
        && git("rev-parse", `${PREMIUM_UI_REFERENCE.source}^{tree}`) === PREMIUM_UI_REFERENCE.tree
        && git("rev-parse", `${PREMIUM_UI_REFERENCE.composedReference}^{tree}`) === PREMIUM_UI_REFERENCE.composedReferenceTree,
      "DISPLAY_REFERENCE_TREE_MISMATCH");
      result.syntheticDisplay.sourcePins = DISPLAY_SOURCE_PINS.map((pin) => {
        const actualBlob = git("rev-parse", `HEAD:${pin.path}`), sha256 = hash(readFileSync(join(repo, pin.path)));
        requireThat(actualBlob === pin.blob && sha256 === pin.sha256, "DISPLAY_SOURCE_PIN_MISMATCH");
        return { ...pin, actualBlob, actualSha256: sha256 };
      });
    }
    result.wholesale.sourceRebind = { source: result.source,
      actualPageBlob: git("rev-parse", "HEAD:client/src/research/b2b/OrganizationAccessPage.tsx"),
      preparedPageBlob: WHOLESALE_PACKET.adoptedPageBlob, metadataExpected: WHOLESALE_EXPECTED,
      finalSourceHashes: result.sources.filter((s) => s.path.includes("/b2b/") || s.path.includes("raw-http-document-policy")
        || s.path.includes("routes.public.json") || s.path.includes("/research/core") || s.path.includes("/research/layout")
        || s.path.includes("/research/section") || s.path.includes("/lib/config") || s.path.includes("/lib/supabaseBrowser")) };
    result.packageLockSha256 = result.sources.find((s) => s.path === "package-lock.json").sha256;
    const publicRoot = join(repo, ownedArtifactRelativeRoot(definition.name));
    assertInventorySafe(publicRoot);
    const inventory = inventoryDirectory(publicRoot), inventoryHash = inventorySha256(inventory);
    diagnosticAssets = new Set(inventory.map((file) => file.path));
    result.build = { inventory, inventorySha256: inventoryHash };
    if (definition.name === PARTNER_COMPONENT_SCENARIO) result.build.scope = 'SEPARATE_DEV_COMPONENT_DISPLAY_DIST';
    if (!isMC10 && [PREMIUM_ENTRY_SCENARIO, DISPLAY_SCENARIO].includes(definition.name)) {
      const art = inventory.find((file) => file.path === PREMIUM_ARTWORK.path.slice(1));
      requireThat(art?.sha256 === PREMIUM_ARTWORK.sha256, "PREMIUM_REVIEWED_ARTWORK_BYTES_MISMATCH");
      result.premiumEntry.artworkInventory = art;
    }
    snapshot = createImmutableDistSnapshot({ repoRoot: repo, sourceDistRoot: publicRoot,
      expectedInventory: inventory, expectedInventorySha256: inventoryHash });
    const stop = (reason) => {
      stopped = true; result.state = "FAILED_OR_NOT_EXECUTED"; result.failure = reason;
      void cleanup().finally(() => process.exit(1));
    };
    watchdog = setTimeout(() => stop("OVERALL_DEADLINE"), Math.max(1, deadline - Date.now() - 18000));
    process.once("SIGTERM", () => stop("TERMINATED"));
    setPhase("preview_start");
    const { startOwnedPreview, UNAVAILABLE_FIXTURE } = await import("./owned-runner-preview.ts");
    preview = await bounded(startOwnedPreview({ root: snapshot.distRoot, inventory, ledger: result.requests, scenario: definition.name, displayContract }));
    result.fixture = { kind: definition.name === PUBLIC_SCENARIO ? "STATIC_404_UNAVAILABLE"
      : definition.name === PARTNER_COMPONENT_SCENARIO ? PARTNER_COMPONENT_SCOPE
      : definition.name === DISPLAY_SCENARIO ? "SYNTHETIC_DISPLAY_NOT_REAL_AUTH_ASSENT_CONTACT_OR_ELIGIBILITY" : "SYNTHETIC_READONLY_ENTRY_UNAVAILABLE_NO_AUTH_NO_ASSENT",
      responseSha256: definition.name === DISPLAY_SCENARIO ? null : hash(JSON.stringify(UNAVAILABLE_FIXTURE)),
      realServerApiQualified: false, persistence: false };
    if (definition.name === DISPLAY_SCENARIO) result.syntheticDisplay.fixture = preview.displayReceipt;
    const chrome = realpathSync(env.XR_QA_CHROME);
    requireThat(lstatSync(chrome).isFile(), "CHROME_BINARY_INVALID");
    result.browserLauncher = { path: chrome, sha256: hash(readFileSync(chrome)) };
    for (const config of definition.configurations) {
      requireThat(!browser && !conn && !page && !launchStarted && !stopped
        && deadline - Date.now() > 25000, "PREVIOUS_PROFILE_NOT_CLOSED_OR_DEADLINE");
      closeConfigurationPromise = null;
      activeProfile = { configuration: config.name, startedMs: Date.now(), profile: null,
        browserPid: null, browserStartTicks: null, closedMs: null, cleanup: null };
      result.browserProfiles.push(activeProfile);
      setPhase(`${config.name}_browser_start`);
      const startupBudgetMs = ownedStartupBudget(deadline, Date.now());
      requireThat(startupBudgetMs > 0, "OVERALL_DEADLINE");
      activeProfile.startupBudgetMs = startupBudgetMs;
      launchStarted = true;
      browser = await bounded(launchChromium({ chromePath: chrome, timeoutMs: startupBudgetMs, onSpawned(handle) {
        // Capture ownership before readiness can reject. Do not require a live
        // /proc entry yet: a genuine early exit may already have removed it.
        browser = handle;
        activeProfile.profile = handle.userDataDir;
        activeProfile.browserPid = handle.process.pid ?? null;
        activeProfile.launchDiagnostics = handle.diagnostics();
        activeProfile.browserStartTicks = activeProfile.launchDiagnostics.startupObservations.find((o) => o.available && o.startTicks)?.startTicks ?? null;
      } }), startupBudgetMs + 1200);
      activeProfile.launchDiagnostics = browser.diagnostics();
      const processStat = readFileSync(`/proc/${browser.process.pid}/stat`, "utf8");
      const readyStartTicks = processStat.slice(processStat.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
      requireThat(activeProfile.browserStartTicks === null || activeProfile.browserStartTicks === readyStartTicks, "BROWSER_PROCESS_IDENTITY_CHANGED");
      activeProfile.browserStartTicks = readyStartTicks;
      requireThat(Number.isInteger(activeProfile.browserPid) && /^\d+$/.test(activeProfile.browserStartTicks ?? ""), "BROWSER_PROCESS_IDENTITY_MISSING");
      const executable = realpathSync(`/proc/${browser.process.pid}/exe`);
      activeProfile.binary = { path: executable, sha256: hash(readFileSync(executable)) };
      activeProfile.browser = { version: browser.browserVersion, protocol: browser.protocolVersion, sandboxDisabled: false };
      activeProfile.identity = hash(JSON.stringify([activeProfile.browserPid, activeProfile.browserStartTicks, activeProfile.profile]));
      requireThat(!result.browserProfiles.slice(0, -1).some((r) => r.profile === activeProfile.profile
        || r.identity === activeProfile.identity), "PROFILE_IDENTITY_REUSED_OR_MISSING");
      const mc10Case=isMC10?preview.mc10.beginCase(config.name):null;
      conn = await bounded(new CdpConnection(browser.wsUrl).open());
      observerOff = observeRequests(conn, preview.origin, result.violations, definition.name, displayContract);
      await bounded(conn.send("Browser.setDownloadBehavior", { behavior: "deny" }));
      const beginRoute = (route) => {
        const partnerSelection=definition.name===PARTNER_COMPONENT_SCENARIO?partnerGallerySelection(route):null;
        setPhase(`${config.name}_${partnerSelection ? partnerSelection.page+'-'+partnerSelection.selectedCase : definition.name === DISPLAY_SCENARIO ? "synthetic-catalog" : route === PREMIUM_ENTRY_ROUTE ? "premium-entry" : route === "/" ? "home" : route === WHOLESALE_ROUTE ? "wholesale" : "recipient"}`);
        activePageCheck = { configuration: config.name, route, expectedText: partnerSelection ? partnerSelection.page==='partner-links'?'Referral links':'Partner dashboard' : route === "/" ? "Browse Peptides & Supplements"
          : route === PREMIUM_ENTRY_ROUTE ? isMC10 ? "Before you view the catalog" : definition.name === DISPLAY_SCENARIO ? "Search catalog" : PREMIUM_ENTRY_EXPECTED.unavailable
          : route === WHOLESALE_ROUTE ? WHOLESALE_EXPECTED.unavailable : "We cannot check this recommendation right now.",
          checks: [] };
        result.pageChecks.push(activePageCheck);
      };
      beginRoute(definition.routes[0]);
      const setupChecks = activePageCheck.checks;
      await visitConfigurationPage({
        scenario: definition.name, configuration: config,
        create: () => runPageCheck("PAGE_CREATE", () => bounded(PageSession.create(conn)), setupChecks),
        own: (ownedPage) => {
          page = ownedPage;
          requireThat(typeof page.targetId === "string" && page.targetId.length > 0
            && typeof page.sessionId === "string" && page.sessionId.length > 0, "PROFILE_PAGE_IDENTITY_MISSING");
          activeProfile.pageLifetime = { identity: hash(JSON.stringify([activeProfile.identity, page.targetId, page.sessionId])),
            createdMs: Date.now(), routes: [] };
          pageEventTrace = observeOwnedCdpEvents(conn, page, { origin: preview.origin, assets: diagnosticAssets });
        },
        configure: (ownedPage) => runPageCheck("NETWORK_BOUNDARY_SETUP", async () => {
          await bounded(ownedPage.enforceNetworkBoundary(preview.origin, configurationBoundaryOptions(preview.origin, result.violations)));
          if(definition.name===PARTNER_COMPONENT_SCENARIO) await bounded(ownedPage.send('Page.addScriptToEvaluateOnNewDocument',{source:partnerPreludeSource()}));
          if(isMC10){
            await bounded(ownedPage.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]}));
            await bounded(ownedPage.send('Page.addScriptToEvaluateOnNewDocument',{source:mc10FocusPreludeSource()}));
          }
        }, setupChecks),
        visit: async (ownedPage, route) => {
        requireThat(ownedPage === page, "PROFILE_PAGE_OWNERSHIP_CHANGED");
        if (route !== definition.routes[0]) beginRoute(route);
        const routeName = definition.name === DISPLAY_SCENARIO ? "synthetic-catalog" : route === PREMIUM_ENTRY_ROUTE ? "premium-entry" : route === "/" ? "home" : route === WHOLESALE_ROUTE ? "wholesale" : "recipient";
        const requestStart = result.requests.length;
        activeProfile.pageLifetime.routes.push(route);
        activePageCheck.pageIdentity = activeProfile.pageLifetime.identity;
        const check = (name, operation) => runPageCheck(name, operation, activePageCheck.checks);
        const pageOff = conn.on("Network.requestWillBeSent", (p) => {
          if (!p.request) return;
          let u;
          try { u = new URL(p.request.url); } catch { return; }
          const safe = observedMethodAllowed(p.request.method, u, preview.origin, definition.name, displayContract);
          const inert = ["data:", "blob:"].includes(u.protocol)
            && (definition.name === PUBLIC_SCENARIO || ["GET", "HEAD"].includes(p.request.method));
          if (!safe && !inert) result.violations.push({ target: definition.name === PARTNER_COMPONENT_SCENARIO ? 'OFF_CONTRACT_REDACTED' : safeNetworkUrl(u.href), reason: "PAGE_REQUEST_BLOCKED_OR_OFF_CONTRACT" });
        }, page.sessionId);
        await check("VIEWPORT_SETUP", () => bounded(page.setViewport({ width: config.width, height: config.height, deviceScaleFactor: 1 })));
        try {
          await check("FONT_SETUP", () => bounded(page.send("Page.setFontSizes", { fontSizes: { standard: config.font, fixed: config.font === 16 ? 13 : 26 } })));
          await check("BLANK_FONT_CALIBRATION", async () => {
            await bounded(page.navigate("about:blank", { quietMs: 50, maxSettleMs: 1000, loadTimeoutMs: 3000 }));
            const sample = await bounded(page.evaluate(FONT_SAMPLE(config.width)));
            activePageCheck.blankFont = pageFailureMetrics(sample);
            validateFontCalibration(sample, config);
          });
        } catch { throw new Error("FONT_CAPABILITY_NOT_EXECUTED"); }
        let rawDocument;
        if (route === WHOLESALE_ROUTE || route === PREMIUM_ENTRY_ROUTE) {
          await check("RAW_DOCUMENT", async () => {
          const response = await bounded(fetch(preview.origin + route, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000) }));
          const html = await bounded(response.text());
          rawDocument = { client: "OWNED_NODE_HTTP_READ", status: response.status,
            robots: response.headers.get("x-robots-tag"), cacheControl: response.headers.get("cache-control"),
            referrerPolicy: response.headers.get("referrer-policy"), bodySha256: hash(html), ...rawDocumentMetadata(html) };
          requireThat(rawDocument.status === 200 && rawDocument.robots?.includes("noindex")
            && rawDocument.cacheControl === "no-store" && rawDocument.referrerPolicy === "no-referrer"
            && (route === PREMIUM_ENTRY_ROUTE || rawDocument.title === WHOLESALE_EXPECTED.title
              && rawDocument.description === WHOLESALE_EXPECTED.description),
          route === PREMIUM_ENTRY_ROUTE ? "PREMIUM_PRIVATE_RAW_DOCUMENT_MISMATCH" : "WHOLESALE_RAW_DOCUMENT_METADATA_MISMATCH");
          });
        }
        await check("DOCUMENT_NAVIGATE", () => bounded(page.navigate(preview.origin + route, { quietMs: 150, maxSettleMs: 5000, loadTimeoutMs: 8000 })));
        await check("EXPECTED_UI_TEXT", async () => {
          await waitForText(page, activePageCheck.expectedText, bounded);
          if (!isMC10 && definition.name === DISPLAY_SCENARIO) {
            await waitForDisplayCondition(page, `document.querySelectorAll('.xenios-order-cards > article').length===8`, bounded, "DISPLAY_EIGHT_ROWS_NOT_READY");
            await assertNoDisplayAttempt(page, bounded);
            const painted = await paintDisplaySection(page, DISPLAY_SECTION_SELECTORS[0], bounded);
            requireThat(painted.unique && painted.rendered && painted.inViewport && painted.unobscured, "DISPLAY_CATALOG_NOT_PAINTED");
            activePageCheck.catalogPaint = painted;
          }
        });
        const font = await check("DOCUMENT_FONT_CALIBRATION", async () => {
          const sample = await bounded(page.evaluate(FONT_SAMPLE(config.width)));
          activePageCheck.documentFont = pageFailureMetrics(sample);
          return validateFontCalibration(sample, config);
        });
        if(isMC10){
          activePageCheck.mc10Progress={};
          const images=[];
          const save=async(scene,view)=>{
            const entry=result.syntheticDisplay.captureMatrix.find(item=>item.configuration===config.name&&item.scene===scene);
            requireThat(entry?.selected&&entry.state==='NOT_RUN','MC10_CAPTURE_OUTSIDE_SELECTED_MATRIX');
            requireThat(['REQUIRED_INTAKE','CONFIRMED_PRODUCTS'].includes(view.stage),'MC10_CAPTURE_STAGE_REFUSED');
            // Pre-intake image is taken before any synthetic contact is entered.
            const image=await bounded(page.screenshot({fullPage:false}));
            requireThat(image.coverage.capturedWidthPx===config.width&&image.coverage.capturedHeightPx===config.height,'SCREENSHOT_VIEWPORT_MISMATCH');
            const record={...write(`${config.name}-${scene}.png`,image.bytes),coverage:image.coverage,
              caption:'MC10 SYNTHETIC DISPLAY/FRONTEND TRANSITION ONLY; no real actor, assent, TTL, request or provider proof'};
            images.push({scene,...record});entry.state='OBSERVED_UNACCEPTED_SYNTHETIC_TRANSITION';return record;
          };
          const proof=await mc10TransitionProof({page,binding:mc10Binding,config,bounded,
            fixture:{...mc10Case,origin:preview.origin},save,progress:activePageCheck.mc10Progress});
          const network={violations:page.networkBoundaryViolations.map(v=>({target:safeNetworkUrl(v.url),reason:v.reason})),
            fulfillmentCount:page.networkBoundaryFulfillments.length,pending:page.inflight.size,
            pendingTargets:page.boundaryTargetPromises.size,setupErrors:page.boundarySetupErrors.length,
            console:{count:page.console.length,content:'NOT_RETAINED; no contact values or arbitrary diagnostics'}};
          result.violations.push(...network.violations);assertNetworkBoundaryComplete(network);
          result.captures.push({route,configuration:config,browserIdentity:activeProfile.identity,pageIdentity:activeProfile.pageLifetime.identity,
            scope:MC10_SCOPE,font,rawDocument,images,screenshot:images.find(image=>image.scene==='catalog-empty-dock'),
            assertions:proof.assertions,text:write(`${config.name}.text.json`,proof),network});
          activeProfile.mc10Admission=preview.mc10.snapshot();
          delete activePageCheck.mc10Progress;pageOff();activePageCheck=null;return;
        }
        if(definition.name===PARTNER_COMPONENT_SCENARIO){
          const selection=partnerGallerySelection(route);requireThat(selection,'PARTNER_SELECTED_ROUTE_INVALID');
          const slug=`${config.name}-${selection.page}-${selection.selectedCase}`;
          activePageCheck.partnerProgress={};
          const save=async scene=>{
            requireThat(['primary','qr'].includes(scene),'PARTNER_IMAGE_SCENE_INVALID');
            const image=await bounded(page.screenshot({fullPage:false}));
            requireThat(image.coverage.capturedWidthPx===config.width&&image.coverage.capturedHeightPx===config.height,'SCREENSHOT_VIEWPORT_MISMATCH');
            const record={...write(`${slug}-${scene}.png`,image.bytes),coverage:image.coverage,caption:'DEV_ONLY_PARTNER_COMPONENT_DISPLAY — synthetic context/ledger; not real role, Auth, customer or production-build proof'};
            const matrix=result.partnerDisplay.captureMatrix.find(entry=>entry.configuration===config.name&&entry.page===selection.page&&entry.selectedCase===selection.selectedCase&&entry.scene===(scene==='qr'?'enlarged-qr':'primary'));
            requireThat(matrix?.selected&&matrix.state==='NOT_RUN','PARTNER_IMAGE_OUTSIDE_SELECTED_MATRIX');matrix.state='OBSERVED_UNACCEPTED_DEV_DISPLAY';return record;
          };
          const proof=await partnerCaseProof(page,selection,config,bounded,save,activePageCheck.partnerProgress);
          const network={violations:page.networkBoundaryViolations.map(v=>({target:partnerSafeNetworkTarget(v.url,preview.origin,diagnosticAssets),reason:v.reason})),fulfillmentCount:page.networkBoundaryFulfillments.length,pending:page.inflight.size,pendingTargets:page.boundaryTargetPromises.size,setupErrors:page.boundarySetupErrors.length,
            console:{count:page.console.length,content:'NOT_RETAINED; no raw page/credential diagnostics'}};
          result.violations.push(...network.violations);assertNetworkBoundaryComplete(network);
          result.captures.push({route,configuration:config,browserIdentity:activeProfile.identity,pageIdentity:activeProfile.pageLifetime.identity,font,assertions:proof.assertions,
            scope:PARTNER_COMPONENT_SCOPE,screenshot:proof.screenshot,text:write(`${slug}.text.json`,proof),network});
          delete activePageCheck.partnerProgress;pageOff();activePageCheck=null;return;
        }
        const audit = await check("PAGE_AUDIT", () => bounded(page.evaluate(PAGE_AUDIT_SOURCE)));
        const view = await check("PAGE_VIEW", () => bounded(page.evaluate(`({ text:document.body.innerText, title:document.title,
          description:document.querySelector('meta[name="description"]')?.content ?? '',
          h1:document.querySelectorAll('h1').length,
          h1Text:document.querySelector('h1')?.textContent?.trim() ?? '',
          h3:[...document.querySelectorAll('h3')].map(e=>e.textContent.trim()),
          passwordInputs:document.querySelectorAll('input[type="password"]').length,
          inquiryFields:document.querySelector('#organization-inquiry')?.querySelectorAll('form,input,select,textarea').length ?? 0,
          fitHeadingPresent:!!document.getElementById('organization-fit-heading'),
          infinityStatus:(() => {
            const badge=document.querySelector('#infinity [data-copy="infinity.status"]');
            if(!badge) return {text:'',rendered:false,inViewport:false};
            const r=badge.getBoundingClientRect(); let rendered=r.width>0&&r.height>0;
            for(let node=badge;rendered&&node;node=node.parentElement) {
              const style=getComputedStyle(node);
              if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0) rendered=false;
            }
            return {text:badge.innerText,rendered,inViewport:rendered&&r.bottom>0&&r.top<innerHeight};
          })(),
          main:document.querySelectorAll('main').length, overflow:document.documentElement.scrollWidth > innerWidth + 1,
          robots:document.querySelector('meta[name="robots"]')?.content ?? '',
          authorityTags:document.querySelectorAll('link[rel="canonical"],meta[property^="og:"],script[type="application/ld+json"]').length,
          premiumEntry:${route === PREMIUM_ENTRY_ROUTE ? PREMIUM_ENTRY_VIEW_SOURCE : "null"},
          syntheticCatalog:${definition.name === DISPLAY_SCENARIO ? DISPLAY_CATALOG_VIEW_SOURCE : "null"},
          controls:[...document.querySelectorAll('a,button')].map(e=>({text:e.textContent.trim(),href:e.getAttribute('href'),
            height:e.getBoundingClientRect().height,disabled:!!e.disabled})).filter(e=>e.height>0) })`)));
        const assertions = await check("UI_ASSERTION_BUILD", () => {
        const assertions = [
          { name: "one_heading_and_main", passed: view.h1 === 1 && view.main === 1 },
          { name: "no_horizontal_overflow", passed: !view.overflow },
          { name: "actual_default_font_calibrated", passed: true },
          { name: "no_duplicate_ids", passed: audit.duplicateIds.length === 0 },
          { name: "no_unlabelled_controls", passed: audit.forms.unlabelledControls.length === 0 },
          { name: "no_invalid_aria_references", passed: audit.invalidAriaRefs.length === 0 },
          { name: "no_missing_image_alt", passed: audit.images.missingAlt.length === 0 },
          { name: "no_clipped_text", passed: audit.overflow.clippedText.length === 0 },
        ];
        if (definition.name === DISPLAY_SCENARIO) assertions.push(...displayCatalogAssertions(view.syntheticCatalog, preview.displayExpectations),
            ...legacyAdmittedChromeAssertions(view.premiumEntry), ...premiumEntryAssertions(view.premiumEntry).filter((entry) => ["premium_twelve_public_contact_destinations", "premium_entrance_artwork_and_captions_absent", "premium_entrance_conversation_grid_absent"].includes(entry.name)),
          { name: "synthetic_display_private_document", passed: view.robots.includes("noindex") });
        else if (route === PREMIUM_ENTRY_ROUTE) assertions.push(...premiumEntryAssertions(view.premiumEntry),
          { name: "premium_noindex", passed: view.robots.includes("noindex") });
        else if (route === "/") assertions.push(
          { name: "home_offerings", passed: view.text.includes("Tensa Health") && view.text.includes("Browse Peptides & Supplements") },
          { name: "infinity_in_development", passed: view.text.includes("Infinity") && hasInfinityDevelopmentBadge(view.infinityStatus) },
          { name: "home_cta_and_category_hrefs", passed: view.controls.some((c) => c.text === "Browse Peptides & Supplements" && c.href === "/earlyaccess")
            && ["clinical", "research_peptides", "supplements", "topicals"].every((category) => view.controls.some((c) => c.href === `/earlyaccess?category=${category}`)) });
        else if (route === WHOLESALE_ROUTE) assertions.push(
          { name: "wholesale_heading_and_metadata", passed: view.h1Text === WHOLESALE_EXPECTED.heading
            && view.title === WHOLESALE_EXPECTED.title && view.description === WHOLESALE_EXPECTED.description },
          { name: "wholesale_unavailable_no_auth_or_form", passed: view.text.includes(WHOLESALE_EXPECTED.unavailable)
            && view.passwordInputs === 0 && view.inquiryFields === 0 && view.fitHeadingPresent },
          { name: "wholesale_five_formats", passed: ["Vials", "Nasal sprays", "Capsules", "Strips", "Tablets"].every((label) => view.h3.includes(label)) },
          { name: "wholesale_boundaries_price_free", passed: view.text.includes("Wholesale and organization-specific terms remain private and human-approved.")
            && view.text.includes("A clinic's Research account never authorizes treatment, prescribing, telehealth, or pharmacy fulfillment.")
            && !/\$\s*\d|\bUSD\s*\d|\b\d+(?:\.\d{2})?\s*(?:USD|dollars)\b/i.test(view.text) },
          { name: "wholesale_safe_hrefs", passed: view.controls.some((c) => c.text === "Contact support" && c.href === "/research/support")
            && view.controls.some((c) => c.text === "Browse the catalog" && c.href === "/earlyaccess") },
          { name: "wholesale_noindex", passed: view.robots.includes("noindex") });
        else assertions.push(
          { name: "recipient_unavailable_truthful", passed: view.text.includes("We cannot check this recommendation right now.") && !view.text.includes("invalid, expired") },
          { name: "recipient_noindex", passed: view.robots.includes("noindex") },
          { name: "recipient_no_authority_tags", passed: view.authorityTags === 0 },
          { name: "recipient_controls_44px", passed: ["Try again", "Explore Xenios Health", "Research support", "Care support"].every((text) => view.controls.some((c) => c.text === text && c.height >= 44)) });
        return assertions;
        });
        activePageCheck.assertions = assertions;
        const slug = `${config.name}-${routeName}`;
        const screenshot = await check("SCREENSHOT", async () => {
          const image = await bounded(page.screenshot({ fullPage: false }));
          requireThat(image.coverage.capturedWidthPx === config.width && image.coverage.capturedHeightPx === config.height, "SCREENSHOT_VIEWPORT_MISMATCH");
          return image;
        });
        const capture = await check("CAPTURE_WRITE", () => ({ route, configuration: config, browserIdentity: activeProfile.identity,
          pageIdentity: activeProfile.pageLifetime.identity, font, audit, assertions,
          ...(rawDocument ? { rawDocument } : {}),
          screenshot: write(`${slug}.png`, screenshot.bytes), text: write(`${slug}.text.json`, view),
          screenshotCoverage: screenshot.coverage, network: [] }));
        if (definition.name === DISPLAY_SCENARIO) capture.caption = "SYNTHETIC CATALOG DISPLAY ONLY — no real authentication, assent, contact, eligibility, request or managed readiness";
        result.captures.push(capture);
        if (definition.name === DISPLAY_SCENARIO) result.syntheticDisplay.captureMatrix.find((entry) => entry.configuration === config.name && entry.section === "catalog").state = "CAPTURED_UNQUALIFIED";
        if (route === "/" && config.font === 32) {
          activePageCheck.homeDismissalProgress = {};
          capture.homeDismissal = await homeInstallDismissalProof(page, config, bounded, activePageCheck.homeDismissalProgress);
          delete activePageCheck.homeDismissalProgress;
          const dismissed = await bounded(page.screenshot({ fullPage: false }));
          requireThat(dismissed.coverage.capturedWidthPx === config.width && dismissed.coverage.capturedHeightPx === config.height,
            "SCREENSHOT_VIEWPORT_MISMATCH");
          capture.homeDismissal.screenshot = write(`${slug}-post-dismiss.png`, dismissed.bytes);
          capture.homeDismissal.screenshotCoverage = dismissed.coverage;
          capture.homeDismissal.screenshotState = capture.homeDismissal.nativeDismissExecuted
            ? "AFTER_NATIVE_DISMISS_AND_FOCUS" : "BANNER_ABSENT_WITHOUT_DISMISS";
        }
        if (route === PREMIUM_ENTRY_ROUTE && definition.name !== DISPLAY_SCENARIO) {
          activePageCheck.keyboardProgress = {};
          capture.keyboard = await premiumEntryKeyboardProof(page, bounded, activePageCheck.keyboardProgress, async () => {
            const focused = await bounded(page.screenshot({ fullPage: false }));
            requireThat(focused.coverage.capturedWidthPx === config.width && focused.coverage.capturedHeightPx === config.height,
              "SCREENSHOT_VIEWPORT_MISMATCH");
            return write(`${slug}-focus.png`, focused.bytes);
          });
          capture.focusScreenshot = capture.keyboard.primaryFocusScreenshot;
          delete activePageCheck.keyboardProgress;
        }
        if (config.name === "phone100" && route !== WHOLESALE_ROUTE && route !== PREMIUM_ENTRY_ROUTE) {
          activePageCheck.keyboardProgress = {};
          capture.keyboard = await keyboardProof(page, route, bounded, activePageCheck.keyboardProgress);
          delete activePageCheck.keyboardProgress;
          const focused = await bounded(page.screenshot({ fullPage: false }));
          capture.focusScreenshot = write(`${slug}-focus.png`, focused.bytes);
        }
        if (route === WHOLESALE_ROUTE) {
          if (config.name === "phone100") {
            activePageCheck.keyboardProgress = {};
            capture.keyboard = await wholesaleKeyboardProof(page, bounded, activePageCheck.keyboardProgress);
            delete activePageCheck.keyboardProgress;
          }
          // Capture positioning only; the keyboard observations above precede it.
          await bounded(page.evaluate("document.getElementById('organization-inquiry').scrollIntoView({block:'start',behavior:'instant'}); new Promise(r=>requestAnimationFrame(()=>r(true)))"));
          const section = await bounded(page.screenshot({ fullPage: false }));
          requireThat(section.coverage.capturedWidthPx === config.width && section.coverage.capturedHeightPx === config.height, "SCREENSHOT_VIEWPORT_MISMATCH");
          capture.sectionScreenshot = write(`${slug}-inquiry.png`, section.bytes);
          capture.fixtureRequests = result.requests.slice(requestStart).filter((r) => r.kind === "STATIC_READONLY_UNAVAILABLE_FIXTURE");
          requireThat(capture.fixtureRequests.some((r) => r.target.endsWith("/api/research/business-inquiries/config") && r.status === 503), "WHOLESALE_UNAVAILABLE_FIXTURE_NOT_OBSERVED");
        }
        if (!isMC10 && definition.name === DISPLAY_SCENARIO) {
          const save = async (suffix) => {
            const image = await bounded(page.screenshot({ fullPage: false }));
            requireThat(image.coverage.capturedWidthPx === config.width && image.coverage.capturedHeightPx === config.height, "SCREENSHOT_VIEWPORT_MISMATCH");
            return { ...write(`${slug}-${suffix}.png`, image.bytes), caption: "SYNTHETIC DISPLAY ONLY — no real Auth, assent, contact, eligibility or request proof" };
          };
          const section = async (id, selector) => {
            const painted = await paintDisplaySection(page, selector, bounded);
            const record = { id, configuration: config.name, scope: definition.scope, painted, state: "INCOMPLETE" };
            result.syntheticDisplay.sections.push(record);
            requireThat(painted.unique && painted.rendered && painted.inViewport && painted.unobscured, "DISPLAY_SECTION_NOT_PAINTED");
            record.screenshot = await save(id); record.state = "OBSERVED_SYNTHETIC_SECTION_ONLY";
            result.syntheticDisplay.captureMatrix.find((entry) => entry.configuration === config.name && entry.section === id).state = "CAPTURED_UNQUALIFIED";
          };
          if (config.name === "display-phone375") {
            activePageCheck.displaySearchProgress = {};
            capture.search = await displaySearchProof(page, bounded, activePageCheck.displaySearchProgress);
            delete activePageCheck.displaySearchProgress;
          }
          await displayCatalogDisclosureProofs(config.name, {
            guide: async () => {
              activePageCheck.displayFaqWalk = [];
              await nativeDisplayTarget(page, DISPLAY_FAQ_TARGET, bounded, activePageCheck.displayFaqWalk);
              await dispatchActivationKey(page, "Enter", bounded);
              await waitForDisplayCondition(page, `document.querySelector('.xenios-order-optional-guide')?.open===true`, bounded, "DISPLAY_OPTIONAL_GUIDE_NOT_OPEN");
              await section("optional-guide", DISPLAY_SECTION_SELECTORS[3]);
              const guideFocus=await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
              requireThat(await bounded(page.evaluate(DISPLAY_FAQ_TARGET))===true&&!guideFocus.body&&guideFocus.indicator&&guideFocus.inViewport,'DISPLAY_OPTIONAL_GUIDE_FOCUS_INVALID');
              await dispatchActivationKey(page,'Enter',bounded);
              await waitForDisplayCondition(page,`document.querySelector('.xenios-order-optional-guide')?.open===false`,bounded,'DISPLAY_OPTIONAL_GUIDE_DID_NOT_CLOSE');
              delete activePageCheck.displayFaqWalk;
            },
            details: async () => {
              activePageCheck.displayDetailsProgress = {};
              capture.details = await displayDetailsProof(page, bounded, () => save("details"), activePageCheck.displayDetailsProgress);
              result.syntheticDisplay.captureMatrix.find((entry) => entry.configuration === config.name && entry.section === "details").state = "CAPTURED_UNQUALIFIED";
              delete activePageCheck.displayDetailsProgress;
            },
          });
          if (config.name === "display-desktop1440") {
            await section("hcg-hold", DISPLAY_SECTION_SELECTORS[1]);
            await section("fedex-non-merchandise", DISPLAY_SECTION_SELECTORS[2]);
          }
          if (["display-desktop1440", "display-phone375-200"].includes(config.name)) await section("footer-contact", DISPLAY_SECTION_SELECTORS[4]);
        }
        await settlePostInteractionNetwork(page, bounded);
        if (!isMC10 && definition.name === DISPLAY_SCENARIO) {
          capture.noAttemptOrReceiptAfterInteractions = await assertNoDisplayAttempt(page, bounded);
          requireThat(await bounded(page.evaluate(`document.querySelector('.xenios-premium-catalog-header')?.textContent.replace(/\\s+/g,' ').includes('Quote cart (0)')===true`)),
            "DISPLAY_CART_CHANGED_WITHOUT_AUTHORIZED_ACTION");
        }
        capture.network = { violations: page.networkBoundaryViolations.map((v) => ({ target: safeNetworkUrl(v.url), reason: v.reason })),
          fulfillmentCount: page.networkBoundaryFulfillments.length, pending: page.inflight.size,
          pendingTargets: page.boundaryTargetPromises.size, setupErrors: page.boundarySetupErrors.length,
          console: page.console.map(({ level, text }) => ({ level, text: String(text).slice(0, 300) })) };
        result.violations.push(...capture.network.violations);
        assertNetworkBoundaryComplete(capture.network);
        pageOff();
        activePageCheck = null;
        },
      });
      setPhase(`${config.name}_browser_cleanup`);
      const closed = await closeConfiguration();
      requireThat(Object.values(closed).every(Boolean), "PROFILE_CLEANUP_UNCONFIRMED");
    }
    validateProfileReceipts(result.browserProfiles, definition.name, displayContract);
    requireThat(new Set(result.browserProfiles.map((profile) => profile.pageLifetime?.identity)).size === definition.configurations.length
      && result.browserProfiles.every((profile) => /^[a-f0-9]{64}$/u.test(profile.pageLifetime?.identity ?? "")
        && profile.pageLifetime.routes.length === (definition.name === PARTNER_COMPONENT_SCENARIO ? partnerRoutesForConfiguration(definition.configurations.find(c => c.name === profile.configuration)) : definition.routes).length
        && profile.pageLifetime.routes.every((route, index) => route === (definition.name === PARTNER_COMPONENT_SCENARIO ? partnerRoutesForConfiguration(definition.configurations.find(c => c.name === profile.configuration)) : definition.routes)[index])
        && result.captures.filter((capture) => capture.configuration.name === profile.configuration)
          .every((capture) => capture.pageIdentity === profile.pageLifetime.identity)), "PROFILE_PAGE_LIFETIME_UNCONFIRMED");
    snapshot.assertUnchanged();
    requireThat(inventorySha256(inventoryDirectory(publicRoot)) === inventoryHash, "BUILD_CHANGED_DURING_QA");
    if(definition.name===PARTNER_COMPONENT_SCENARIO) requireThat(inventorySha256(inventoryDirectory(join(repo,'dist/public')))===result.partnerDisplay.productionInventorySha256,'PRODUCTION_BUILD_CHANGED_DURING_DEV_DISPLAY');
    requireThat(sourcePaths.every((path, i) => hash(readFileSync(join(repo, path))) === result.sources[i].sha256), "SOURCE_CHANGED_DURING_QA");
    result.fixture.counters = JSON.parse(JSON.stringify(preview.counters));
    result.fixture.readOnlyGET = preview.fixtureReceipts();
    if (definition.name === DISPLAY_SCENARIO) result.syntheticDisplay.catalogQueries = preview.catalogQueryReceipts();
    assertScenarioFixtureCensus(preview.counters, definition.name, displayContract);
    if(isMC10){
      result.syntheticDisplay.catalogQueries=preview.catalogQueryReceipts();result.syntheticDisplay.admissionCensus=preview.mc10.census();
      requireThat(result.syntheticDisplay.admissionCensus.length===6&&result.syntheticDisplay.admissionCensus.every((entry,index)=>entry.profile===MC10_CONFIGURATIONS[index].name&&entry.posts===1&&entry.catalogReads>=1
        &&entry.phase===(index===0?'EXPIRED':'CONFIRMED')),'MC10_ADMISSION_GENERATION_CENSUS_FAILED');
      requireThat(pngWrites===MC10_PNG_CAP&&result.syntheticDisplay.captureMatrix.filter(entry=>entry.selected).every(entry=>entry.state==='OBSERVED_UNACCEPTED_SYNTHETIC_TRANSITION'),'MC10_SELECTED_CAPTURE_SET_INCOMPLETE');
      result.syntheticDisplay.completeSuccessPngCount=pngWrites;
      result.syntheticDisplay.otherViewStateCombinations='NOT_RUN; no all-row painted or default-motion claim';
    }
    requireThat(!result.violations.length, "NETWORK_BOUNDARY_VIOLATION");
    requireThat(!stopped && result.captures.length === definition.captureCount && result.captures.every((c) => c.assertions.every((a) => a.passed)), "UI_ASSERTIONS_FAILED");
    if(definition.name===PARTNER_COMPONENT_SCENARIO){
      requireThat(pngWrites===PARTNER_COMPONENT_PNG_CAP&&result.partnerDisplay.captureMatrix.filter(entry=>entry.selected).every(entry=>entry.state==='OBSERVED_UNACCEPTED_DEV_DISPLAY'),'PARTNER_SELECTED_CAPTURE_SET_INCOMPLETE');
      result.partnerDisplay.completeSelectedPngCount=pngWrites;
      result.partnerDisplay.otherImageCombinations='NOT_RUN; alternate mobile cases are also DOM_NOT_RUN';
    }
    if (!isMC10 && definition.name === DISPLAY_SCENARIO) {
      requireThat(result.captures.filter((capture) => capture.details?.state === "NATIVE_DETAILS_DISPLAY_ONLY_OBSERVED").length === 2
        && result.syntheticDisplay.sections.length === 5 && result.syntheticDisplay.sections.every((section) => section.state === "OBSERVED_SYNTHETIC_SECTION_ONLY"),
      "DISPLAY_FINITE_CAPTURE_SET_INCOMPLETE");
      result.syntheticDisplay.completeSuccessPngCount = DISPLAY_PNG_CAP;
      result.syntheticDisplay.otherViewportSectionCombinations = "NOT_RUN";
      for (const entry of result.syntheticDisplay.captureMatrix.filter((entry) => entry.selected)) {
        requireThat(entry.state === "CAPTURED_UNQUALIFIED", "DISPLAY_FINITE_CAPTURE_SET_INCOMPLETE");
        entry.state = "OBSERVED_SYNTHETIC_DISPLAY_ONLY";
      }
    }
    for (const item of definition.name === PUBLIC_SCENARIO ? result.wholesale.cases : []) {
      if (["W01", "W03"].includes(item.id)) item.status = "PASS_LOCAL_UNAVAILABLE_FIXTURE_ONLY";
      else if (["W05", "W06", "W10"].includes(item.id)) item.status = "PARTIAL_LOCAL_FIXTURE_ONLY";
    }
    result.state = "AUTOMATED_PASS_LOCAL_FIXTURE_ONLY";
    setPhase("complete");
  } catch (error) {
    result.state = "FAILED_OR_NOT_EXECUTED";
    result.failure = /^[A-Z0-9_]+$/.test(error?.message ?? "") ? error.message : "OWNED_QA_FAILED";
    await observePageFailure();
  } finally {
    clearTimeout(watchdog);
    await cleanup();
  }

  function cleanup() { return cleanupPromise ??= performCleanup(); }
  async function observePageFailure() {
    if (!activePageCheck || !page) return;
    const diagnostic = { scope: definition?.name === DISPLAY_SCENARIO ? "SYNTHETIC_DISPLAY_FAILURE_ONLY_NOT_ACCEPTED_CAPTURE" : "LOCAL_PUBLIC_PAGE_FAILURE_DIAGNOSTIC_ONLY", acceptedCapture: false,
      configuration: activePageCheck.configuration, route: activePageCheck.route,
      lastCheck: activePageCheck.checks.at(-1)?.check ?? null,
      metricsState: "NOT_EXECUTED_BUDGET", screenshotState: "NOT_EXECUTED_BUDGET",
      pageState: pageFailureMetrics({ loaded: page.loaded, inflightCount: page.inflight.size,
        boundaryTargetCount: page.boundaryTargetPromises.size, boundarySetupErrorCount: page.boundarySetupErrors.length }) };
    if (activePageCheck.keyboardProgress) diagnostic.keyboardProgress = activePageCheck.keyboardProgress;
    if (activePageCheck.displayDetailsProgress) diagnostic.displayDetailsProgress = activePageCheck.displayDetailsProgress;
    if (activePageCheck.partnerProgress) diagnostic.partnerProgress = activePageCheck.partnerProgress;
    if (activePageCheck.mc10Progress) diagnostic.mc10Progress = activePageCheck.mc10Progress;
    if (activePageCheck.displaySearchProgress) diagnostic.displaySearchProgress = activePageCheck.displaySearchProgress;
    if (activePageCheck.displayFaqWalk) diagnostic.displayFaqWalk = activePageCheck.displayFaqWalk;
    if (activePageCheck.homeDismissalProgress) diagnostic.homeDismissalProgress = activePageCheck.homeDismissalProgress;
    result.failureDiagnostic = diagnostic;
    diagnostic.inflight = inflightFailureSnapshot(page, { origin: preview.origin, assets: diagnosticAssets,
      ledger: result.requests, now: Date.now() });
    if (pageEventTrace) diagnostic.eventTrace = pageEventTrace.snapshot();
    let budget = failureObservationBudget(deadline, Date.now(), 750);
    if (budget > 0) {
      try {
        const sample = await bounded(page.evaluate(`(() => {
          const de=document.documentElement, body=document.body;
          const e=document.createElement('div'); e.style.cssText='width:1rem;position:absolute;visibility:hidden';
          de.append(e); const rem=e.getBoundingClientRect().width; e.remove();
          return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scale:visualViewport.scale,
            root:parseFloat(getComputedStyle(de).fontSize),rem,scrollWidth:de.scrollWidth,clientWidth:de.clientWidth,
            h1Count:document.querySelectorAll('h1').length,mainCount:document.querySelectorAll('main').length,
            domReady:document.readyState==='complete',bodyPresent:!!body,
            expectedTextPresent:!!body&&body.innerText.includes(${JSON.stringify(activePageCheck.expectedText)}),
            emMedia:matchMedia('(min-width:${definition.configurations.find((c) => c.name === activePageCheck.configuration).width / 24}em)').matches};
        })()`), budget);
        diagnostic.metrics = pageFailureMetrics(sample);
        diagnostic.metricsState = "OBSERVED";
      } catch { diagnostic.metricsState = "UNAVAILABLE"; }
    }
    budget = failureObservationBudget(deadline, Date.now(), 1500);
    const screenshotCapReached = definition?.name === DISPLAY_SCENARIO && pngWrites >= DISPLAY_PNG_CAP
      || definition?.name === PARTNER_COMPONENT_SCENARIO && pngWrites >= PARTNER_COMPONENT_PNG_CAP;
    if (screenshotCapReached) diagnostic.screenshotState = "NOT_EXECUTED_CAPTURE_CAP";
    if(isMC10)diagnostic.screenshotState='NOT_EXECUTED_SYNTHETIC_CONTACT_PRIVACY';
    if (budget > 0 && !screenshotCapReached && !isMC10) {
      try {
        if(definition?.name===PARTNER_COMPONENT_SCENARIO) requireThat(await bounded(page.evaluate(`!/DISPLAY-NOT-A-CREDENTIAL|NO-SIGNATURE/.test(document.body?.textContent??'')&&[...document.querySelectorAll('input')].every(n=>!/DISPLAY-NOT-A-CREDENTIAL|NO-SIGNATURE/.test(n.value))`),Math.min(budget,500)),'PARTNER_MARKER_REACHED_DOM');
        const image = await bounded(page.screenshot({ fullPage: false }), budget);
        diagnostic.screenshot = write(`diagnostic-${activePageCheck.configuration}-${definition?.name === DISPLAY_SCENARIO ? "synthetic-catalog" : activePageCheck.route === "/" ? "home" : activePageCheck.route === WHOLESALE_ROUTE ? "wholesale" : "recipient"}-failure.png`, image.bytes);
        diagnostic.screenshotState = "OBSERVED_NOT_ACCEPTED_CAPTURE";
      } catch { diagnostic.screenshotState = "UNAVAILABLE"; }
    }
  }
  function closeConfiguration() { return closeConfigurationPromise ??= performConfigurationClose(); }
  async function performConfigurationClose() {
    const status = { page: !page, cdp: !conn, browserExit: !launchStarted, profileRemoved: !launchStarted };
    const close = async (name, fn) => { try { await bounded(Promise.resolve().then(fn), 3000, true); status[name] = true; } catch { status[name] = false; } };
    observerOff?.(); observerOff = null;
    if (pageEventTrace) await close("eventTrace", () => {
      const initialPending = result.failureDiagnostic?.eventTrace?.pending ?? [];
      const finalTrace = result.failureDiagnostic ? pageEventTrace.snapshot() : null;
      const summary = pageEventTrace.stop();
      if (finalTrace) result.failureDiagnostic.eventTrace = { ...finalTrace, ...summary, failurePending: initialPending };
      if (activeProfile) activeProfile.eventTrace = summary;
      requireThat(summary.unsubscribeErrors === 0, "EVENT_TRACE_CLEANUP_UNCONFIRMED");
      pageEventTrace = null;
    });
    if(isMC10&&page){
      await close('mc10FocusObserver',async()=>{
        const facts=await page.evaluate(`(()=>{const api=window.__xeniosMC10FocusObservationV1;if(!api)return {observed:false,restored:false};const snapshot=api.snapshot();return {observed:true,snapshot,restored:api.restore()};})()`);
        if(activeProfile)activeProfile.mc10FocusCleanup=facts;
        requireThat(facts.observed&&facts.restored===true,'MC10_FOCUS_OBSERVER_RESTORE_UNCONFIRMED');
      });
    }
    if(isMC10&&preview?.mc10){preview.mc10.retireCase();}
    if (page) await close("page", () => page.close());
    if (conn) await close("cdp", () => conn.close());
    if (browser) {
      await close("browserExit", async () => {
        await browser.close();
        if (!await waitForOwnedExit(browser.process, 700)) {
          if (activeProfile) activeProfile.cleanupEscalatedToKill = true;
          browser.process.kill("SIGKILL");
          requireThat(await waitForOwnedExit(browser.process, 1200), "BROWSER_EXIT_UNCONFIRMED");
        }
        // A late writer may have recreated a directory after the first close.
        if (existsSync(browser.userDataDir)) await browser.close();
      });
      status.profileRemoved = !existsSync(browser.userDataDir);
      if (activeProfile) activeProfile.launchDiagnostics = browser.diagnostics();
    }
    if (activeProfile) {
      activeProfile.cleanup = { ...status };
      activeProfile.closedMs = Date.now();
    }
    if (Object.values(status).every(Boolean)) {
      page = null; conn = null; browser = null; launchStarted = false; activeProfile = null;
    }
    return status;
  }
  async function performCleanup() {
    const current = await closeConfiguration();
    result.cleanup = { ...current, completedProfiles: result.browserProfiles.every((r) => r.cleanup
      && Object.values(r.cleanup).every(Boolean)), server: !preview, snapshot: !snapshot };
    const close = async (name, fn) => { try { await bounded(Promise.resolve().then(fn), 3000, true); result.cleanup[name] = true; } catch { result.cleanup[name] = false; } };
    if (preview) await close("server", () => preview.close());
    if (snapshot) await close("snapshot", () => { snapshot.dispose(); requireThat(!existsSync(snapshot.parent), "SNAPSHOT_REMAINS"); });
    if (!Object.values(result.cleanup).every(Boolean)) { result.state = "FAILED_OR_NOT_EXECUTED"; result.failure ??= "CLEANUP_FAILED"; }
    result.finishedAt = new Date().toISOString();
    result.elapsedMs = Date.now() - started;
    write("result.json", result);
  }
  return result.state === "AUTOMATED_PASS_LOCAL_FIXTURE_ONLY" ? 0 : 1;
}

function waitForOwnedExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((done) => {
    const finish = (exited) => { clearTimeout(timer); child.off("exit", exitedHandler); done(exited); };
    const exitedHandler = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", exitedHandler);
  });
}

async function waitForText(page, text, bounded) {
  for (let i = 0; i < 40; i++) {
    if (await bounded(page.evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`))) return;
    await bounded(new Promise((r) => setTimeout(r, 75)), 200);
  }
  throw new Error("EXPECTED_UI_STATE_MISSING");
}

export async function dispatchActivationKey(page, keyName, bounded) {
  requireThat(keyName === "Enter" || keyName === " ", "ACTIVATION_KEY_INVALID");
  const code = keyName === " " ? "Space" : "Enter", text = keyName === "Enter" ? "\r" : " ";
  for (const type of ["keyDown", "keyUp"]) await bounded(page.send("Input.dispatchKeyEvent", {
    type, key: keyName, code, windowsVirtualKeyCode: keyName === "Enter" ? 13 : 32,
    ...(type === "keyDown" ? { text, unmodifiedText: text } : {}),
  }));
}

/** Incremental collector skips focused/captured nodes; real Tab follows it. */
export async function tabWithFreshFocusBaseline(page, bounded, { shift = false } = {}) {
  await bounded(page.evaluate(FOCUS_BASELINE_SOURCE));
  await bounded(page.pressTab({ shift }));
}

/** CSS Backgrounds3 sections4.1/4.5: quarter ellipses and common overlap scale. */
export function roundedControlHitPoints({ left, top, width, height, radii }) {
  const refused = { supported: false, points: [] };
  if (![left, top, width, height].every(Number.isFinite) || Math.abs(left) > 1000000 || Math.abs(top) > 1000000
    || width < 4 || height < 4 || width > 1000000 || height > 1000000 || !Array.isArray(radii) || radii.length !== 4) return refused;
  const parse = (token, dimension) => {
    if (token === "0") return 0;
    const match = /^(\d+(?:\.\d+)?|\.\d+)(px|%)$/u.exec(token);
    if (!match) return null;
    const value = Number(match[1]) * (match[2] === "%" ? dimension / 100 : 1);
    return Number.isFinite(value) && value <= 1000000 ? value : null;
  };
  const corners = [];
  for (const css of radii) {
    if (typeof css !== "string" || css.length > 64) return refused;
    const tokens = css.trim().split(/\s+/u);
    if (tokens.length < 1 || tokens.length > 2) return refused;
    const x = parse(tokens[0], width), y = parse(tokens[1] ?? tokens[0], height);
    // Degenerate one-axis corners are outside this finite measurement contract.
    if (x === null || y === null || (x === 0) !== (y === 0)) return refused;
    corners.push([x, y]);
  }
  const side = (length, sum) => sum > 0 ? length / sum : 1;
  const scale = Math.min(1, side(width, corners[0][0] + corners[1][0]), side(width, corners[3][0] + corners[2][0]),
    side(height, corners[0][1] + corners[3][1]), side(height, corners[1][1] + corners[2][1]));
  const [tl, tr, br, bl] = corners.map(([x, y]) => [x * scale, y * scale]);
  const edge = (offset, radius, depth) => radius > 0 && offset < radius
    ? depth * (1 - Math.sqrt(Math.max(0, 1 - ((offset - radius) / radius) ** 2))) : 0;
  const diagonal = 1 - Math.SQRT1_2;
  const boundary = [
    ["TOP_LEFT", tl[0] * diagonal, tl[1] * diagonal], ["TOP_RIGHT", width - tr[0] * diagonal, tr[1] * diagonal],
    ["BOTTOM_LEFT", bl[0] * diagonal, height - bl[1] * diagonal], ["BOTTOM_RIGHT", width - br[0] * diagonal, height - br[1] * diagonal],
    ["TOP_EDGE", width / 2, Math.max(edge(width / 2, tl[0], tl[1]), edge(width / 2, tr[0], tr[1]))],
    ["RIGHT_EDGE", width - Math.max(edge(height / 2, tr[1], tr[0]), edge(height / 2, br[1], br[0])), height / 2],
    ["BOTTOM_EDGE", width / 2, height - Math.max(edge(width / 2, bl[0], bl[1]), edge(width / 2, br[0], br[1]))],
    ["LEFT_EDGE", Math.max(edge(height / 2, tl[1], tl[0]), edge(height / 2, bl[1], bl[0])), height / 2],
  ];
  const inside = (x, y) => [[tl, x, y], [tr, width - x, y], [br, width - x, height - y], [bl, x, height - y]]
    .every(([[rx, ry], dx, dy]) => rx === 0 || dx >= rx || dy >= ry || ((dx - rx) / rx) ** 2 + ((dy - ry) / ry) ** 2 < 1);
  const points = [{ point: "CENTER", x: left + width / 2, y: top + height / 2 }];
  for (const [point, x, y] of boundary) {
    const dx = width / 2 - x, dy = height / 2 - y, distance = Math.hypot(dx, dy);
    const fraction = distance > 0 ? Math.min(1 / distance, 0.5) : 0;
    const px = x + dx * fraction, py = y + dy * fraction;
    if (!(px > 0 && py > 0 && px < width && py < height && inside(px, py))) return refused;
    points.push({ point, x: left + px, y: top + py });
  }
  return { supported: true, scale, radii: [tl, tr, br, bl], points };
}

/** Public Home observations only: no focus, click, style, storage or handler writes. */
export const HOME_DISMISS_STATE_SOURCE = String.raw`(() => {
  const roundedPoints=(${roundedControlHitPoints.toString()});
  const rendered = (el) => {
    if (!el?.isConnected || !el.getClientRects().length) return false;
    for (let node=el; node; node=node.parentElement) {
      const cs=getComputedStyle(node);
      if (node.hasAttribute('inert') || node.getAttribute('aria-hidden')==='true'
        || cs.display==='none' || cs.visibility==='hidden' || cs.visibility==='collapse' || Number(cs.opacity)===0) return false;
    }
    return true;
  };
  const observe = (el) => {
    if (!el) return {present:false,rendered:false,inViewport:false,fullyInViewport:false,unobscured:false};
    const r=el.getBoundingClientRect(), visible=rendered(el), cs=getComputedStyle(el);
    const left=Math.max(0,r.left), right=Math.min(innerWidth,r.right), top=Math.max(0,r.top), bottom=Math.min(innerHeight,r.bottom);
    const inViewport=visible&&right>left&&bottom>top;
    const interactive=el.matches('a[href],button,summary');
    let geometrySupported=true, shape=null;
    if (interactive) {
      geometrySupported=el.getClientRects().length===1;
      for(let node=el;node&&geometrySupported;node=node.parentElement) {
        const style=getComputedStyle(node), matrix=style.transform;
        const translation=matrix==='none'||(/^matrix\(([^)]+)\)$/.test(matrix)&&(()=>{
          const values=matrix.slice(7,-1).split(',').map(Number);
          return values.length===6&&values.every(Number.isFinite)&&values[0]===1&&values[1]===0&&values[2]===0&&values[3]===1;
        })());
        if(!translation||style.perspective!=='none'||style.clipPath!=='none'||style.maskImage!=='none'||style.clip!=='auto'
          ||style.rotate&&style.rotate!=='none'||style.scale&&style.scale!=='none'
          ||style.zoom&&Number(style.zoom)!==1) geometrySupported=false;
      }
      if(geometrySupported) {
        shape=roundedPoints({left:r.left,top:r.top,width:r.width,height:r.height,
          radii:[cs.borderTopLeftRadius,cs.borderTopRightRadius,cs.borderBottomRightRadius,cs.borderBottomLeftRadius]});
        geometrySupported=shape.supported;
      }
    }
    const points=inViewport&&geometrySupported ? interactive ? shape.points :
      [[(left+right)/2,(top+bottom)/2],[left+1,top+1],[right-1,top+1],[left+1,bottom-1],[right-1,bottom-1]]
        .map(([x,y],index)=>({point:['CENTER','TOP_LEFT','TOP_RIGHT','BOTTOM_LEFT','BOTTOM_RIGHT'][index],x,y})) : [];
    const hitRelations=points.map(({point,x,y})=>{
      const hit=document.elementFromPoint(x,y), onTarget=el.contains(hit);
      return {point,onTarget,
        relation:!hit?'NONE':hit===el?'SELF':onTarget?'DESCENDANT':hit.contains(el)?'ANCESTOR':'OTHER'};
    });
    const unobscured=inViewport&&geometrySupported&&hitRelations.length>0&&hitRelations.every(hit=>hit.onTarget);
    const ring=cs.outlineStyle==='none' ? 0 : Math.max(0,parseFloat(cs.outlineWidth)||0)+Math.max(0,parseFloat(cs.outlineOffset)||0);
    let indicatorUnclipped=r.left-ring>=0&&r.top-ring>=0&&r.right+ring<=innerWidth&&r.bottom+ring<=innerHeight;
    for (let node=el.parentElement; node&&indicatorUnclipped; node=node.parentElement) {
      const style=getComputedStyle(node), box=node.getBoundingClientRect();
      if (['hidden','clip','scroll','auto'].includes(style.overflowX) && (r.left-ring<box.left || r.right+ring>box.right)) indicatorUnclipped=false;
      if (['hidden','clip','scroll','auto'].includes(style.overflowY) && (r.top-ring<box.top || r.bottom+ring>box.bottom)) indicatorUnclipped=false;
    }
    return {present:true,rendered:visible,inViewport,fullyInViewport:visible&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
      unobscured,indicatorUnclipped,width:r.width,height:r.height,geometrySupported,
      shape:shape?.supported?{scale:shape.scale,radii:shape.radii}:null,hitRelations};
  };
  const banners=[...document.querySelectorAll('[role="status"]')].filter(el=>
    el.textContent.includes('Add xenios to your home screen.') || el.textContent.includes('Install xenios: tap Share, then'));
  const dismisses=banners.flatMap(el=>[...el.querySelectorAll('button[aria-label="Dismiss"]')]);
  const dismiss=dismisses.length===1 ? dismisses[0] : null;
  const heading=document.querySelector('.xh-hero #xh-hero-title'), cta=document.querySelector('.xh-hero a[data-destination="healthRequest"]');
  const active=document.activeElement;
  return {atHome:location.pathname==='/'&&!location.search&&!location.hash,
    bannerCount:banners.length,dismissCount:dismisses.length,banner:observe(banners[0]),dismiss:observe(dismiss),
    activeIsDismiss:!!dismiss&&active===dismiss&&!dismiss.disabled&&dismiss.getAttribute('aria-label')==='Dismiss',
    activeIsHeroCta:!!cta&&active===cta,active:observe(active),
    activeKind:active===document.body||active===document.documentElement ? 'BODY' : active===dismiss ? 'DISMISS'
      : active===cta ? 'HERO_CTA' : active?.matches('a[href],button,summary,input,select,textarea,[tabindex]') ? 'OTHER_CONTROL' : 'OTHER',
    positiveTabIndexCount:[...document.querySelectorAll('[tabindex]')].filter(el=>el.tabIndex>0&&rendered(el)).length,
    heading:observe(heading),cta:observe(cta)};
})()`;

function requireDismissFocus(sample, state) {
  requireThat(state.activeIsDismiss && state.dismiss.rendered && state.dismiss.fullyInViewport
    && state.dismiss.unobscured && state.dismiss.indicatorUnclipped && state.dismiss.width >= 44 && state.dismiss.height >= 44
    && sample.indicator && sample.inViewport, "HOME_DISMISS_FOCUS_OR_TARGET_NOT_VISIBLE");
}

function requireHomeContent(state) {
  requireThat(state.atHome && state.heading.rendered && state.heading.inViewport && state.heading.unobscured,
    "HOME_POST_DISMISS_HERO_OBSCURED");
}

/** Bounded evidence only; unknown content/accessors are never serialized. */
export function homeContinuationDiagnostic(order, fromFocus, expectedIdentity, sample, state) {
  const identity = (value) => typeof value === "string" && value.length <= 512
    && /^focusable-[0-9]{1,6}@[a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]{0,5}\)(?:>[a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]{0,5}\))*$/u.test(value) ? value : null;
  const flag = (value) => typeof value === "boolean" ? value : null;
  const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10000000 ? value : null;
  const sourceOrder = ownData(order, "tabbableIdentities"), actualIdentity = ownData(sample, "identity");
  const length = Array.isArray(sourceOrder) ? sourceOrder.length : 0;
  const identities = Array.from({ length: Math.min(128, length) }, (_, index) => identity(ownData(sourceOrder, String(index))));
  const active = ownData(state, "active"), hits = ownData(active, "hitRelations");
  const points = ["CENTER", "TOP_LEFT", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_RIGHT", "TOP_EDGE", "RIGHT_EDGE", "BOTTOM_EDGE", "LEFT_EDGE"];
  const relations = ["NONE", "SELF", "DESCENDANT", "ANCESTOR", "OTHER"];
  const activeState = Object.fromEntries(["present", "rendered", "inViewport", "fullyInViewport", "unobscured", "indicatorUnclipped", "geometrySupported"]
    .map((key) => [key, flag(ownData(active, key))]));
  Object.assign(activeState, { width: number(ownData(active, "width")), height: number(ownData(active, "height")),
    hitRelations: Array.isArray(hits) ? Array.from({ length: Math.min(9, hits.length) }, (_, index) => {
      const hit = ownData(hits, String(index)), point = ownData(hit, "point"), relation = ownData(hit, "relation");
      return { point: points.includes(point) ? point : null, relation: relations.includes(relation) ? relation : null,
        onTarget: flag(ownData(hit, "onTarget")) };
    }) : [] });
  return { state: "INCOMPLETE_DIAGNOSTIC", accepted: false,
    fromIdentity: identity(ownData(fromFocus, "identity")), expectedIdentity: identity(expectedIdentity),
    actualIdentity: identity(actualIdentity), order: { identities, total: length, dropped: Math.max(0, length - 128),
      truncated: length > 128, unrecognizedRetained: identities.filter((value) => value === null).length },
    sample: { body: flag(ownData(sample, "body")), indicator: flag(ownData(sample, "indicator")), inViewport: flag(ownData(sample, "inViewport")) },
    nextState: { atHome: flag(ownData(state, "atHome")), activeKind: ["BODY", "DISMISS", "HERO_CTA", "OTHER_CONTROL", "OTHER"].includes(ownData(state, "activeKind"))
      ? ownData(state, "activeKind") : null, active: activeState },
    conjuncts: { nonbody: !ownData(sample, "body"), identityMatches: actualIdentity === expectedIdentity,
      indicator: Boolean(ownData(sample, "indicator")), inViewport: Boolean(ownData(sample, "inViewport")),
      fullyInViewport: Boolean(ownData(active, "fullyInViewport")), unobscured: Boolean(ownData(active, "unobscured")),
      indicatorUnclipped: Boolean(ownData(active, "indicatorUnclipped")) } };
}

/** Native keyboard dismissal, with the original overlap capture retained by the caller. */
export async function homeInstallDismissalProof(page, config, bounded, progress = {}) {
  requireThat(["phone200", "desktop200"].includes(config.name) && config.font === 32, "HOME_DISMISS_CONFIGURATION_INVALID");
  startKeyboardProgress(progress);
  const loader = page.currentMainFrameLoaderId;
  requireThat(typeof loader === "string" && loader.length > 0, "HOME_DISMISS_DOCUMENT_IDENTITY_UNAVAILABLE");
  const read = () => bounded(page.evaluate(HOME_DISMISS_STATE_SOURCE));
  const before = await read();
  requireThat(before.atHome && before.positiveTabIndexCount === 0, "HOME_DISMISS_DOCUMENT_OR_TAB_ORDER_CHANGED");
  let afterRemoval = before, afterRemovalFocus = null, next = null, activated = false;
  const key = config.name === "phone200" ? "Enter" : " ";
  if (before.bannerCount) {
    requireThat(before.bannerCount === 1 && before.dismissCount === 1 && before.banner.rendered,
      "HOME_INSTALL_HINT_CONTROL_AMBIGUOUS");
    let state, sample, reached = false;
    for (let i = 0; i < 48; i++) {
      progress.phase = "HOME_DISMISS_REVERSE_TAB";
      await tabWithFreshFocusBaseline(page, bounded, { shift: true });
      sample = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
      state = await read();
      keyboardStep(progress, sample, state.activeKind, i, "exact accessible Dismiss", true);
      if (state.activeIsDismiss) { requireDismissFocus(sample, state); reached = true; break; }
    }
    requireThat(reached, "HOME_DISMISS_NOT_KEYBOARD_REACHABLE");
    progress.phase = "HOME_DISMISS_NATIVE_ACTIVATION";
    await dispatchActivationKey(page, key, bounded);
    await bounded(page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))"));
    afterRemoval = await read();
    afterRemovalFocus = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    progress.afterRemoval = afterRemoval;
    progress.afterRemovalFocus = afterRemovalFocus;
    requireThat(afterRemoval.bannerCount === 0 && afterRemoval.dismissCount === 0, "HOME_INSTALL_HINT_NOT_REMOVED");
    requireHomeContent(afterRemoval);
    requireThat(afterRemovalFocus.body === false && typeof afterRemovalFocus.identity === "string"
      && afterRemovalFocus.identity.length > 0 && afterRemovalFocus.indicator && afterRemovalFocus.inViewport
      && afterRemoval.activeKind !== "BODY" && afterRemoval.activeKind !== "DISMISS"
      && afterRemoval.active.rendered && afterRemoval.active.fullyInViewport
      && afterRemoval.active.unobscured && afterRemoval.active.indicatorUnclipped,
      "HOME_POST_DISMISS_FOCUS_NOT_RESTORED");
    // The application owns restoration. Observe its actual focus and NEW order;
    // never infer the successor from the removed Dismiss or repair BODY here.
    const order = await bounded(page.evaluate(FOCUS_BASELINE_SOURCE));
    const index = order.tabbableIdentities.indexOf(afterRemovalFocus.identity);
    requireThat(index >= 0 && order.tabbableIdentities.length > 1 && afterRemoval.positiveTabIndexCount === 0,
      "HOME_DISMISS_TAB_SUCCESSOR_UNAVAILABLE");
    const expectedNext = order.tabbableIdentities[(index + 1) % order.tabbableIdentities.length];
    activated = true;
    progress.phase = "HOME_DISMISS_CONTINUATION_TAB";
    await tabWithFreshFocusBaseline(page, bounded);
    sample = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    state = await read();
    keyboardStep(progress, sample, state.activeKind, 0, "actual next logical control", false);
    next = { sample, state, fromIdentity: afterRemovalFocus.identity, expectedIdentity: expectedNext,
      orderObservedAfterRemoval: true };
    progress.continuation = homeContinuationDiagnostic(order, afterRemovalFocus, expectedNext, sample, state);
    requireThat(!sample.body && sample.identity === expectedNext && sample.indicator && sample.inViewport
      && state.active.fullyInViewport && state.active.unobscured && state.active.indicatorUnclipped,
      "HOME_DISMISS_CONTINUATION_FOCUS_NOT_VISIBLE_OR_LOGICAL");
  } else {
    requireThat(before.dismissCount === 0, "HOME_INSTALL_HINT_CONTROL_AMBIGUOUS");
    requireHomeContent(before);
  }
  let current = await read(), ctaFocus = next?.sample ?? null;
  for (let i = 0; !current.activeIsHeroCta && i < 48; i++) {
    progress.phase = "HOME_POST_DISMISS_CTA_TAB";
    await tabWithFreshFocusBaseline(page, bounded);
    ctaFocus = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    current = await read();
    keyboardStep(progress, ctaFocus, current.activeKind, i, "hero primary CTA without activation", false);
  }
  requireThat(current.bannerCount === 0 && current.activeIsHeroCta && ctaFocus?.indicator && ctaFocus.inViewport
    && current.cta.rendered && current.cta.fullyInViewport && current.cta.unobscured && current.cta.indicatorUnclipped
    && current.cta.height >= 44, "HOME_POST_DISMISS_CTA_NOT_UNOBSTRUCTED");
  requireThat(current.atHome && page.currentMainFrameLoaderId === loader, "HOME_DISMISS_NAVIGATION_CHANGED");
  return { state: activated ? "NATIVE_DISMISS_AND_FOCUS_OBSERVED" : "BANNER_ABSENT_NATIVE_DISMISS_NOT_EXECUTED",
    nativeDismissExecuted: activated, key: activated ? (key === " " ? "Space" : "Enter") : null,
    before, afterRemoval, afterRemovalFocus, next, cta: { state: current, focus: ctaFocus }, navigationUnchanged: true,
    heroCoverage: "VISIBLE_HEADING_PORTION_AT_REMOVAL", ctaCoverage: "FULL_VISIBLE_PRIMARY_CTA_AFTER_NATIVE_TAB",
    installPromptTelemetry: "NOT_INSTRUMENTED_EXISTING_SOURCE_TESTS_SEPARATE", acceptedRouteCaptureCountAdded: 0 };
}

function startKeyboardProgress(progress) {
  Object.assign(progress, { state: "INCOMPLETE_DIAGNOSTIC", accepted: false, phase: "START", stepCount: 0,
    droppedSteps: 0, retention: "FIRST_32_LAST_32", steps: [] });
}

function keyboardStep(progress, sample, text, desiredIndex, expectedControl, shift) {
  if (progress.steps.length >= 64) { progress.steps.splice(32, 1); progress.droppedSteps++; }
  const step = { sequence: progress.stepCount++, sample, text: text.slice(0, 100), desiredIndex, expectedControl, shift };
  progress.steps.push(step);
  progress.lastStep = step;
  progress.phase = "CHECK_FOCUS";
}

export async function keyboardProof(page, route, bounded, progress = {}) {
  startKeyboardProgress(progress);
  const walk = [];
  const desired = route === "/" ? null : ["Try again", "Explore Xenios Health", "Research support", "Care support"];
  let found = 0, actionDone = false;
  for (let i = 0; i < (route === "/" ? 36 : 16); i++) {
    progress.phase = "FORWARD_TAB";
    await tabWithFreshFocusBaseline(page, bounded);
    const sample = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    const text = await bounded(page.evaluate("document.activeElement?.textContent?.trim() ?? ''"));
    walk.push({ sample, text: text.slice(0, 100) });
    keyboardStep(progress, sample, text, found, desired?.[found] ?? "native menu", false);
    if (desired && text === desired[found]) {
      requireThat(sample.indicator && sample.inViewport, "KEYBOARD_FOCUS_NOT_VISIBLE");
      if (found === 0) {
        progress.phase = "ACTIVATE_RETRY";
        await dispatchActivationKey(page, "Enter", bounded);
        await waitForText(page, "We cannot check this recommendation right now.", bounded);
        actionDone = true;
      }
      found++;
      if (found === desired.length) break;
    }
    if (!desired && !actionDone) {
      const menu = await bounded(page.evaluate("document.activeElement?.tagName === 'SUMMARY' && document.activeElement.parentElement?.matches('details.xh-mobile-nav:not([open])')"));
      if (menu) {
        requireThat(sample.indicator, "KEYBOARD_HOME_FOCUS_NOT_VISIBLE");
        await dispatchActivationKey(page, "Enter", bounded);
        requireThat(await bounded(page.evaluate("document.activeElement?.closest('details.xh-mobile-nav')?.open === true")), "KEYBOARD_MENU_DID_NOT_OPEN");
        await dispatchActivationKey(page, " ", bounded);
        requireThat(await bounded(page.evaluate("document.activeElement?.closest('details.xh-mobile-nav')?.open === false")), "KEYBOARD_MENU_DID_NOT_CLOSE");
        actionDone = true;
        break;
      }
    }
  }
  requireThat(actionDone && (!desired || found === desired.length), "KEYBOARD_CONTRACT_INCOMPLETE");
  progress.phase = "REVERSE_TAB";
  await tabWithFreshFocusBaseline(page, bounded, { shift: true });
  const reverse = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
  keyboardStep(progress, reverse, "", found, "reverse focus", true);
  requireThat(reverse.indicator && reverse.inViewport, "KEYBOARD_REVERSE_FOCUS_NOT_VISIBLE");
  return { walk, reverse, enterOrSpaceAction: actionDone, policyOrAccountSubmitted: false };
}

async function wholesaleKeyboardProof(page, bounded, progress = {}) {
  startKeyboardProgress(progress);
  const observations = [];
  for (const [index, label] of ["Start a business enquiry", "Start a wholesale enquiry"].entries()) {
    let found = false;
    for (let i = 0; i < 48; i++) {
      progress.phase = "WHOLESALE_TAB";
      await tabWithFreshFocusBaseline(page, bounded, { shift: index === 1 });
      const text = await bounded(page.evaluate("document.activeElement?.textContent?.trim() ?? ''"));
      const focus = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
      keyboardStep(progress, focus, text, index, label, index === 1);
      if (text !== label) continue;
      requireThat(focus.indicator && focus.inViewport, "WHOLESALE_KEYBOARD_FOCUS_NOT_VISIBLE");
      await dispatchActivationKey(page, "Enter", bounded);
      let target;
      for (let settle = 0; settle < 40; settle++) {
        target = await bounded(page.evaluate(`(() => {
        const section=document.getElementById('organization-inquiry'), r=section.getBoundingClientRect();
        const y=Math.min(innerHeight-1,Math.max(1,r.top+8)), x=Math.min(innerWidth-1,Math.max(1,r.left+r.width/2));
        return { hash:location.hash, top:r.top, bottom:r.bottom,
          inViewport:r.top>=-1&&r.top<innerHeight&&r.bottom>0,
          unobscured:section.contains(document.elementFromPoint(x,y)),
          activeTag:document.activeElement?.tagName ?? null,
          activeText:(document.activeElement?.textContent ?? '').trim().slice(0,100) };
        })()`));
        if (target.hash === "#organization-inquiry" && target.inViewport && target.unobscured) break;
        await bounded(new Promise((r) => setTimeout(r, 50)), 100);
      }
      requireThat(target.hash === "#organization-inquiry" && target.inViewport && target.unobscured, "WHOLESALE_ANCHOR_TARGET_HIDDEN_OR_UNREACHED");
      observations.push({ label, openingFocus: focus, target, focusTransferAssumed: false });
      found = true; break;
    }
    requireThat(found, "WHOLESALE_ANCHOR_CONTROL_UNREACHABLE");
  }
  progress.phase = "WHOLESALE_CONTINUATION_TAB";
  await tabWithFreshFocusBaseline(page, bounded);
  const next = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
  keyboardStep(progress, next, "", observations.length, "continuation focus", false);
  requireThat(!next.body && next.indicator && next.inViewport, "WHOLESALE_KEYBOARD_CONTINUATION_NOT_VISIBLE");
  return { observations, next, policyOrAccountSubmitted: false, liveGateOrReadinessProved: false };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3 || process.argv[2] !== "--run") {
    process.stderr.write("OWNED_QA_INVOCATION_REFUSED\n"); process.exitCode = 1;
  } else {
    run().then((code) => { process.exit(code); }).catch(() => {
      process.stderr.write("OWNED_QA_PRECONDITION_FAILED\n"); process.exit(1);
    });
  }
}
