# Coordinator evidence audit — accepted integration756a906

Performed by /root/f1_audit using immutable Git objects and pushed receipts; no test, build, browser, database or hosted action executed.

Verified source756a906877dbc174b7e228a259d2faa9c3af48ca, evidencefc53751ff7a988d029d5dabbd9f24f1431b62d19 and pushed final handoff38c723964358c18b8c5090f2f9a0aa92f74601b0. Successors are records-only.

All44 indexed evidence files match byte sizes and SHA-256. Eight completed jobs consistently identify the clean source/tree, command, timing, exit and log hashes. Exact17-path subscription run401/0/0 and36-path affected run626/0/0 include all25 changed test files. Their intersection is4 files and union49, so test counts are not additive. All source bindings match committed blobs.

Actual Response400/403 adapter cases assert canonical refusal and one fetch. They are mocked-fetch cases, not liveHTTP/provider proof. Typecheck and build exit0 receipts verified; sampled process provenance remains sampled, not continuous. Protection failures are retained and correctly classified. Full aggregate is DEFERRED/NOT RUN.

One producer provenance gap: README mentions approximately304MiB free during typecheck; retained samples support only the later805/1452MiB values. Those samples independently support the deferral. Do not fabricate the missing raw sample.

Final Claude verdict04cbbee0d3d3ab32dfd6ae9002b82837423f6265 independently accepts source and closes PS-R1 and adapter-level PS-R5. It was pushed and read fully. All release holds remain. Its statement7 shared test files is an arithmetic typo against immutable command arrays (actual4); same-reviewer records correction completed and independently checked at fffa33a6b3407b407b2b43d3c5a5c7054887f590. Decision and holds unchanged.

Historical Finance ENOSPC receipt at b13c29ea6caa4b9715c295d45232e065511a85db was located and verified with stdout/stderr hashes. It records Finance sourcedfd8b9b09815357d6c92f9c00eadf1782325269a, exit1,2failed/19078passed/85skippedtests and16failed/1007passed/6skippedfiles. Stderr containsENOSPC. This historical shared-host failure includes dirty continuity/evidence files and is not integrated candidate evidence.
