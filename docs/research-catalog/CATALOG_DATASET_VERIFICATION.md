# Catalog dataset verification

The authoritative workbook was located on this machine, exported, built, and loaded
through the production reader. The counts below are **recomputed**, not carried over from
the foundation's handoff.

## Authoritative source

```text
Workbook   C:\Users\sboad\Downloads\XENIOS_MASTER_OFFERINGS_PRICING_2026-08-09_AUSTIN_BENCHMARK_UPDATED.xlsx
SHA-256    c6937431bcb64f628352016d5af16ea133add9a0a05b5947d5a0ac75d9e2d438
Sheets     "01 Full Master Offerings", "02 Early Access Now"
```

Identified by hash rather than by filename. A second byte-identical copy exists in the
same folder as `... (1).xlsx`; both match, so either may be used. The hash equals the one
the frozen Catalog Foundation recorded, which is what makes this the same workbook the
1,121 figure originally came from rather than a look-alike.

## Recomputed counts

```text
source rows                   1,236
Early Access rows                22
member-safe offerings         1,121
member-safe variants          1,181
admin-only holds                 11
```

Every number matches the foundation's independently verified result exactly. The
verification script counts the offerings and variants itself and separately reports what
the file's own header claims; they agree.

### Member-safe offerings by family

```text
supplements                     893
research_vials                   70
diagnostics                      42
clinician_guided_care            30
education_and_tracking           24
programs                         20
blends                           17
quantum                           8
shipping_and_fulfillment          7
white_label_and_partners          7
laboratory_supplies               3
provider_network                  0
```

### Member-safe variants by availability

```text
planned                         982
request_access                   86
care_pathway                     78
available_now                    18
approval_required                13
temporarily_unavailable           4
```

**This is the shape of the launch, and it is worth reading carefully.** Only 18 of 1,181
variants are `available_now`; 982 are `planned`. The catalog is overwhelmingly a
planning catalog today, which is exactly why display authority and commerce authority had
to stay separate. A surface that inferred "listed, therefore buyable" would have been
wrong 1,163 times out of 1,181.

### Builder posture, from its own manifest

```text
routeMounted            false
commerceBindingCreated  false
productionMutated       false
databaseMutated         false
```

### Import issues the builder recorded

```text
regulatory_hold               22
duplicate_source_row          14
sensitive_provider_identity    7
placeholder_source_id          3
zero_planning_price            1
```

These are held or flagged at import and never reach a member surface. The 11 admin-only
holds are the offerings that result; a test asserts none of them can reach a card, a
filter, a detail, or an export.

## Where the data lives, and where it does not

```text
.local/research/master-offerings/private-intake.json                          PRIVATE, gitignored
.local/research/master-offerings/generated/member-safe-master-offerings.generated.json
.local/research/master-offerings/generated/master-offerings-audit.generated.json
.local/research/master-offerings/generated/master-offerings-manifest.generated.json
```

**Nothing generated is committed.** `.local` is gitignored, the private intake carries
supplier, wholesale, margin and source fields, and the foundation's policy holds the
member-safe payload out of the repository until existing-registry reconciliation is done.
Point the server at the generated file with `XENIOS_MASTER_OFFERINGS_DATASET`.

## Reproducing this

```bash
python scripts/research/export-master-offerings.py <workbook.xlsx> \
  --output .local/research/master-offerings/private-intake.json
npx tsx scripts/research/build-master-offerings.ts .local/research/master-offerings/private-intake.json
npx tsx scripts/research/verify-master-offerings-dataset.ts \
  .local/research/master-offerings/generated/member-safe-master-offerings.generated.json
```

The exporter needs only the Python standard library. The verifier loads through the same
reader the server uses, so a dataset that passes it is one the catalog can actually serve.

## Measured against this dataset

Through the production reader, not a fixture:

```text
dataset load and search warm-up   ~200 ms, once per process or file change
search, warm                       ~9 ms  (100 consecutive searches in 884 ms)
all 47 pages, 24 per page          118 ms  (~2.5 ms per page)
detail by slug                     0.3 ms
full price list export, 1181 rows   19 ms
```

Two search defects were found by running real queries against real names and both are
fixed:

- A lone `s` token, left behind when punctuation stripping split `Men's` into `men s`,
  matched almost every product and pushed unrelated results to the top of a search for
  `men's panel`. Tokens are now rejoined, so `men's panel` and `mens panel` agree and both
  lead with the men's health panel. As a side effect `60s` now finds the `60's` products.
- The first search of a process paid 130 ms to normalize all 1,121 offerings. The
  haystacks are warmed when the dataset loads, so that cost no longer lands on whichever
  member types first.

## What is directly purchasable today

**Zero.** Direct purchase requires an exact Product Control binding plus a resolved
`CartProductSelection`, and `commerceBindingCreated` is false: no binding exists for any
of the 1,181 variants. Every row therefore reads `Price on request` and offers a request
path.

That is a truthful launch state, not a broken one, and it will change the moment Product
Control binds and approves exact variants. No code change is needed for prices and carts
to appear.
