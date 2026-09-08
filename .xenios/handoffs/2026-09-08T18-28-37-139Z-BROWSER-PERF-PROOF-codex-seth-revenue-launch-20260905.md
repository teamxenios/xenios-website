# Browser performance task checkpoint — current source

This checkpoint records focused source evidence for the existing browser/performance task. It does not replace the full seeded-browser measurement in `BROWSER_PERF_PROOF_2026-08-21.md` and does not claim a production performance result.

## Source and focused validation

The current application source contains the bulk catalog path (`ProductControlReadRepository.listDetails`), chunked catalog reads and the cached pricing source. The focused amplification suites were run on 2026-09-08 with the repository's Node 20 toolchain:

```
node node_modules/vitest/vitest.mjs run \
  server/research/catalog/catalog-read-amplification.test.ts \
  server/research/pricing/catalog-read-amplification.test.ts
```

Result: 2 test files passed, 11 tests passed, zero failures, in 738 ms. This confirms the bounded source-level read-amplification behavior currently under test. It is not a substitute for a fresh seeded full-catalog browser timing run.

## Remaining proof

The existing full-catalog document measured an older source head (`23b496e`). A fresh seeded local browser/performance run is still required before claiming current mobile/performance qualification. It must use disposable local credentials and fixtures, preserve the 414 query-size finding and negative controls, and must not touch production. The current corrected Resource Hub release remains a separate frozen candidate; this task does not authorize its deployment or activation.
