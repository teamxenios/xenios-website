# Xenios UX release-control reconciliation

Date: 2026-09-24  
Production base: `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`  
Previous UX runtime candidate: `8315710f90a6db4335db4c5dddac652bf05d9546`  
Previous UX runtime tree: `522d6d8612f59462ea7f5f0e38e2fd852c920cbc`  
Production mutation: none

## Manifest mismatch disposition

Five hard-tripwire mismatches were found and individually reviewed. The manifest was not regenerated.

| File | Manifest hash before | Production-base hash | UX-candidate hash | Disposition |
|---|---|---|---|---|
| `client/src/components/Navbar.tsx` | `a4d414440431bc646811f82b6551d5d877667e3a755484eda4e1b1de01746fad` | same as manifest | `1b2930b1298f09fd2f6a0d9ed00c2ffcbd457656a9e67ef88521d636dbe0a82b` | Intentional candidate: persistent desktop/mobile Sign in, Get access, and Menu controls while retaining the accessible overlay. |
| `client/src/pages/Home.tsx` | `6200f6faaa62232c1c39dd23c392184a3fc3f93fa4f0550f6daadcb9d3890ee9` | same as manifest | `644b639c7a02d86df085775756ffe8a152ab958b2de504367d2ede07ea0d0548` | Intentional candidate: mounts the reviewed account-access chooser. |
| `client/src/lib/nav.ts` | `496dd7567ed1580f39c694775f73fc8e3dcac4a67fe762efa64f098cdfb27f73` | same as manifest | `15cf2d408c72326eb2f62623265a15cfd6f3a342df451b0f08deb4158baedbe0` | Intentional candidate: adds canonical Sign in and Get access route identities. |
| `client/src/components/TopRibbon.tsx` | `ea71af1096edd022ede6edd002370201e36369b1b7bb8a380d94518bd5868666` | `33293060886e1d8e866078c02bc43703e628155c9c2702ff029b5349584ff8ad` | same as production base | Pre-existing drift from reviewed production-lineage commit `9f9da854`: suppresses the non-clinical cohort ribbon on the exact Care route family. |
| `package.json` | `c01129601999b1e6b2f02790af0245350182e08fcf739fe40174e4b004c9e081` | `27a6b86fc66aefa1eb2cea035faa5ab4ca09e027774a4b5cebe65b5fc3a4b748` | same as production base | Pre-existing drift from reviewed production-lineage commit `9f9da854`: adds only `xenios:control` and `test:xenios-control` aliases. |

No unrelated runtime file was modified to make the gate pass. The manifest records the exact old/new hashes and rationale for each entry.

## Verification

- Core-site protection: 36/36 passed.
- Release-relevant focused suite: 12 files, 138 tests passed.
- Xenios control package: 11/11 passed under the required Node 20.19.0 and npm 10.8.2 toolchain.
- Pgcrypto repository scanner: 17/17 passed independently. A parallel full-suite attempt had one five-second scanner timeout under host contention; it was superseded by the uncontended release run below.
- Full release suite, serialized with 120-second test timeout: 970 files passed, 6 skipped; 18,030 tests passed, 85 skipped; zero failures.
- TypeScript: passed.
- Production build: passed with only existing Vite mixed-import and chunk-size warnings.
- `git diff --check`: passed.

## Runtime identity rule

The final runtime commit must retain the exact application bytes from UX candidate `8315710f` and add only the reconciled protection manifest plus repository continuity/release records. The later handoff successor is documentation metadata and is not the runtime deployment SHA.

No deployment, configuration change, credential change, database mutation, migration, notification send, or native-commerce activation occurred.
