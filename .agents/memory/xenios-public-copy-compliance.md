---
name: xenios public-copy compliance
description: What public-facing copy may and may not say on the xenios marketing site, and how to scrub it
---

# xenios public copy compliance

The authoritative update brief forbids showing certain concepts on PUBLIC pages of the
xenios site: peptides, GLP-1, clinical prescribing/diagnosis, telemedicine/telehealth,
and medical-practice-management framing. Customer term is "client" (never "athlete").

**Why:** stealth pre-seed posture + regulatory exposure. The brief states its compliance
section wins over any other section if ambiguous.

**How to apply:**
- Reword prohibited terms to compliant on-brand equivalents instead of deleting whole
  tiles/pages, so routes, sitemap slugs, and the "25 categories"/"18 categories" counts
  stay intact. Mappings used: GLP-1 -> metabolic health; peptide clinic -> wellness clinic;
  telemedicine startup -> virtual coaching business.
- Keep ICP `value` in shared/schema.ts PRACTITIONER_TYPE_VALUES, the tile `slug`/`value` in
  content.ts, the email.ts label map, and public/sitemap.xml + llms.txt all in lockstep when
  renaming an audience.
- The word "clinician"/"clinics" as an ADJACENT AUDIENCE is allowed (the brief itself names
  clinicians); only clinical prescribing/diagnosis/telemedicine framing is prohibited.
- `/telemedicine` route is intentionally a redirect to `/product` (preserves old inbound links).

**Open stealth tension:** replit.md says no team-member/founder names, but About.tsx +
index.html JSON-LD still name a founder. Confirm with user before removing — may be intentional.
