# customer-price-authority: classification

FINAL CLASSIFICATION: RESOURCE_CONTENTION (delivery system), not PRODUCT_DEFECT.

## Evidence at the final candidate
| context | repetitions | passes | failures |
|---|---:|---:|---:|
| isolation | 5 | 5 | 0 |
| domain suite (217 tests) | 3 | 3 | 0 |
| full suite, 16 workers | 4 observed total | 3 | 1 |

The single full-suite failure occurred in the run where 342 of 392 files
failed simultaneously at IMPORT level, including files with no relation to
pricing. That run coincided with concurrent preview-server start attempts on
this machine. Every subsequent full run passed with 7,025 tests.

## Mechanism
File: server/research/products-diagnostics/customer-price-authority.test.ts:93
It walks the repository and reads every candidate file once per superseded
price identifier. No caching, no index, no bounded file set. Cost grows with
repository size and with identifier count, and it is I/O bound, so it is
sensitive to worker contention rather than to content.

Determinism: the assertion compares a collected offenders array to []. It has
no ordering dependency, no shared state, and no generated-output inclusion.
Re-running it does not change the result in a quiet machine.

## Why no timeout was added
Three tests of this identical class have already required timeout headroom in
this release. A fourth is a pattern, not a coincidence. Adding a fourth
timeout would hide the shape of the problem. The assertion is intact,
unsuppressed, and not quarantined.

## Post-release item
Shared indexed scanner: one repository walk cached across all scanning guards,
a bounded file set, worker-aware scheduling, and an explicit timeout budget.
