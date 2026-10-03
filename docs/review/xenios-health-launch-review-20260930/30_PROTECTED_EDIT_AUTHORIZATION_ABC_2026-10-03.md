# Protected-file edit authorization for the A/B/C visible shell (record)

## The authorization

Samuel stated it in the Claude review session on 2026-10-03. Quoted verbatim:

> I authorize Core to edit exactly these protected files for the approved A/B/C visible-shell implementation,
> provided their pre-edit sha256-lf values match exactly:
>
> client/src/components/Navbar.tsx
> e37a5b94cb07674e8f4471ddc37b9a5e8a6f848d300408ba67ff3b706941eb1f
>
> client/src/components/Footer.tsx
> 25da700fcea32178d19fc21a3d6db4192d11b403418b7fa83100b4c88d9e2a3a
>
> client/src/index.css
> 70d3302a8b4f5d22aa324c3728ae51963d12222ab880c29fcd3f8ea3e477d0e6
>
> This authorizes editing from those exact baselines only.
>
> It does NOT approve the successor hashes.
>
> Do not update the protection manifest with new hashes until the exact successor bytes have been independently
> reviewed and I explicitly approve each old-to-new hash pair.
>
> Do not edit any additional protected file under this approval.

## Verification at recording time

Claude checked the baselines at Core tip `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`, frozen runtime `c0e25c73`.

| File | Authorized baseline | Current bytes (`sha256-lf`) | Manifest pin |
| --- | --- | --- | --- |
| `client/src/components/Navbar.tsx` | `e37a5b94…eb1f` | equal | equal |
| `client/src/components/Footer.tsx` | `25da700f…2a3a` | equal | equal |
| `client/src/index.css` | `70d3302a…d0e6` | equal | equal |

## Scope as recorded

- **Authorized:** edits to these three HARD files only, for the approved A/B/C visible shell (decision record `a4e647e`,
  doc 28). Each edit must start from the exact baseline above.
- **Not authorized:**
  - successor hashes;
  - any protection-manifest update;
  - any other protected file. That includes:
    - the Tier-2 files in doc 29: `index.html`, `SeoHead.tsx`, `PageShell.tsx`, `Home.tsx`, `PwaLifecycle.tsx`,
      `offline.html`, `llms.txt`, `sitemap.xml` and `Wordmark.tsx`;
    - the Tier-3 files: `static.ts`, `App.tsx` and `server/index.ts`;
    - every protected-path violation listed in doc 29.
- **Consequence for A.** Brand changes are limited to what these three files, plus allowed-zone files, can deliver.
  Document titles, og/JSON-LD names, PWA text, the manifest name and the OG raster stay unchanged under this approval.
- **Allowed-zone, gate-blind files** are not protected, so this approval doesn't govern them. They include
  `client/src/clarity/brand.ts` and `server/research/seo/raw-http-document-policy.ts`. Doc 29 recommends reviewing
  any change to them as a protected change, because they alter what the HARD files render.
- **Next gate.**
  1. Core implements.
  2. Claude independently reviews the exact successor bytes.
  3. Samuel explicitly approves each old→new hash pair.
  4. Only then does the protection owner update the manifest, in its own commit citing that approval.
- **Unchanged:**
  - GATE-01 (`static.ts`/`App.tsx`/`server/index.ts`/`server/research/index.ts` already mismatched) stays open;
  - scope questions S1–S5 (doc 29) remain for implementation;
  - no deployment or production effect is authorized.
