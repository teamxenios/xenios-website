# Protected change review — B-1 clarity amendment

## Decision and exact identities

Samuel's owner approval in strategy SHA `af5713863dcf9b8455c568b89ffc15f6c103e58a` explicitly authorizes B-1: the protected root/shared-chrome redesign needed for the clarity program. It does not authorize unrelated redesign, access-control changes, or production mutation.

- Audited implementation base: `3298f279ad760a861e26e3e08514bb49694fae38`
- Base tree: `ac69ecf87e3c622738908bb4fa7a1779aad493fb`
- Runtime candidate: `cfdfd4e66429cee03ad3c59113ce22dd1469f0ef`
- Runtime tree: `560485b32d01061fef94f8849201417b40adc63f`
- Protected-control commit: `98b43d68d3e0a2f63e14ec5ad5afd7abe2f9fb80`
- Production mutation: none

The implementing session registered and claimed the clarity lane before runtime work. The final lease inventory covers every touched runtime, test, protected-control, site-record and evidence path; a closeout audit added exact test paths that the original narrow source-path list did not cover. No competing writer held those paths. The canonical manifest was re-baselined in the protected-control commit after runtime scope was fixed.

## Touched protected seams

| Protected seam | B-1 purpose | Review finding |
| --- | --- | --- |
| `client/index.html` | Replace stale coach-home metadata and unsupported structured-data claims with approved Xenios Care/Research identity. | Scoped to public metadata/structured data; no runtime authority. |
| `client/public/sitemap.xml` | Publish the approved clarity IA and remove token/auth, retired-role and legacy marketing entries. | Public document inventory only. |
| `client/src/App.tsx` | Register approved clarity routes, safe redirects, workspace relocation, and fragment-focus behavior. | Existing Research wildcard/account/admin authority remains mounted; no guard bypass. |
| `client/src/components/AccountAccessChooser.tsx` | Use the approved account, activation, ordering and Care entry vocabulary. | Navigation/copy only; points to canonical authorities. |
| `client/src/components/Footer.tsx` | Add coherent public navigation and exact legal entity line. | Shared chrome only. |
| `client/src/components/Navbar.tsx` | Add coherent desktop/mobile public navigation, account entry and accessible menu behavior. | Shared chrome only; focus/escape/reflow tested. |
| `client/src/components/PageShell.tsx` | Align the legacy shell with the approved shared chrome and skip-link structure. | Composition only. |
| `client/src/components/SeoHead.tsx` | Support explicit public/auth robots policy and canonical clarity metadata. | Metadata only. |
| `client/src/index.css` | Add the shared clarity layout, form, menu, responsive and focus styles. | Visual system only; 390/768/1440 and high-reflow checks show no overflow. |
| `client/src/lib/careers.ts` | Remove stale named-role publication data. | I-1 truthfulness; no job authority added. |
| `client/src/pages/Careers.tsx` | Replace named roles with the approved general-interest application path. | I-1 only. |
| `client/src/pages/ForCoaches.tsx` | Keep coach-product content under the `/workspace` context instead of the clarity root. | Existing product preserved; no new capability. |
| `client/src/pages/Home.tsx` | Implement the B-2 hero, Care/Research separation, pathway tiles and conservative practice/partner statements. | Approved copy and paths only; no product cards, prices or direct commerce. |
| `client/src/pages/Waitlist.tsx` | Remove customer-facing `Early Access` wording from the preserved coach flow. | Copy only. |
| `server/index.ts` | Mount the isolated durable inquiry POST before the legacy Research wall. | Exact endpoint only; its own validation, persistence-first response, rate limit and human check; existing wall/guards unchanged. |
| `server/static.ts` | Apply exact permanent redirects for approved legacy public documents and their raw-HTTP policy. | Exact map only; no account/workspace/admin prefix redirect. |

## Canonical gate result

Command:

```text
node scripts/acceptance/verify-core-site-protection.mjs 3298f279ad760a861e26e3e08514bb49694fae38 cfdfd4e66429cee03ad3c59113ce22dd1469f0ef
```

Result: **PASS**.

- 114 changed files classified
- 93 allowed Research/Care paths
- 5 infrastructure paths
- 37 protected hashes verified
- 16 permitted seam files reported and reviewed above

The separate core protection test passes against the 37/37 protected hash inventory. Route uniqueness, raw-document redirects/robots, App registration, shared chrome, Careers, inquiry isolation, admin guard, recovery denial, Care boundaries, commerce-dark and owner-isolation tests supply focused regression coverage.

## Disposition

Protected change: **PASS for the B-1 scope**. This review does not approve deployment and does not broaden any clinical, commerce, payment, account, admin, supplier, partner, notification or production authority.
