# Xenios Technologies — Marketing & Waitlist Site (Spec v2)

## Overview
Marketing & waitlist site for Xenios — "the proactive health OS." Targets 18 categories
of proactive health practitioners (personal trainers, nutritionists, GLP-1 coaches,
longevity specialists, functional medicine, recovery, concierge, etc.).

## Tech Stack
- **Frontend:** React + TypeScript, Vite, TailwindCSS + custom design tokens, wouter, Framer-style CSS-only animations
- **Backend:** Express (Node.js), Drizzle ORM, PostgreSQL
- **Email:** Resend (via Replit connector)
- **Security:** Helmet, IP rate-limit (5 / 10 min), honeypot, Zod validation

## Brand System
- Colors: `#F4EFE6` paper · `#0E0E0C` ink · `#FF5A1F` pulse (orange period)
- Typography: Inter Tight (PP Neue Montreal stand-in) — weights 500/700/800/900 only; JetBrains Mono for caps
- Buttons: 4px radius, square feel, no gradients
- Six atmospheric gradient presets: `grad-01-dawn`, `grad-02-tide`, `grad-03-fieldwork`,
  `grad-04-meridian` (dark), `grad-05-meadow`, `grad-06-horizon` (dark) — film-grain overlay
- Wordmark: lowercase `xenios` with orange `.` period

## Project Structure
```
client/src/
  components/       — Wordmark, Navbar (6-item), TopRibbon (counter+dismiss), Footer,
                      Counter (line + bignum), AtmosCard (gradient card), Constellation (16 nodes),
                      WaitlistForm, ContactForm, PageShell
  lib/              — content.ts (canonical copy), waitlist-service.ts (waitlist + contact)
  pages/            — Home, Manifesto, Product, Contact, Investors, Partners,
                      Waitlist, About, Careers, FAQ, Security, Privacy, Terms, not-found
server/
  index.ts          — Express + helmet + logging
  routes.ts         — /api/waitlist, /api/contact, /api/counter, /api/health
  storage.ts        — Drizzle storage (transactional position assignment with FOR UPDATE)
  services/email.ts — Resend: 4 templates (internal alert, confirmation, contact forward, contact auto-reply)
shared/
  schema.ts         — waitlist_signups + counter_state tables, Zod insert + contact schemas
```

## Database
- `waitlist_signups`: id, first_name, last_name, email (unique), practitioner_type,
  city, country, free_text, how_heard, position (absolute incl. base), ip_country, user_agent, created_at
- `counter_state`: id (=1), base_count (default 550), signups_count, updated_at
- Position derivation: `position = base_count + signups_count + 1`, computed inside
  a transaction with `SELECT … FOR UPDATE` on the counter row.

## API Endpoints
- `POST /api/waitlist` — submit (honeypot, rate-limit, idempotent on duplicate email)
- `POST /api/contact` — contact form (auto-prefixed subject by persona; auto-reply)
- `GET  /api/counter` — public live total (cached 5s)
- `GET  /api/waitlist/count` — back-compat alias for counter
- `GET  /api/waitlist` — admin list (Bearer ADMIN_API_KEY)
- `GET  /api/health` — health check

## Pages
- `/` — Home: hero ("The proactive health OS."), thesis, ecosystem (constellation),
  built-for grid (18 tiles), trust strip ($710M+ FinDox/InstaMed), final CTA
- `/product` — 5 capabilities, gradient sections per capability
- `/manifesto` — "Care, finally upstream."
- `/contact` — 6 routing cards + free-form contact form (subject auto-prefixed by persona)
- `/investors` — pre-seed thesis, inbound instructions
- `/partners` — 3 tracks (integrations, creators, influencer practitioners)
- `/waitlist` — full multi-field form + live counter
- `/about`, `/careers` (5 founding roles), `/faq` (12 Q&A), `/security`, `/privacy`, `/terms`

## Key Features
- Live waitlist counter (8s polling) shown in TopRibbon and on key pages
- Constellation SVG visualization: xenios. center + 16 satellite signals + secondary cross-links, animates on scroll-into-view
- 18-tile audience grid with rotating gradient presets
- Atmospheric gradients with subtle film-grain overlay
- Subject-line conventions: `[INVESTOR]`, `[PRESS]`, `[PARTNER]`, `[ROLE — …]`, `[HELLO]`
- Reduced-motion respected (animations disabled, counter dot stops pulsing)
- All copy centralized in `client/src/lib/content.ts`

## Contact
- Email: team@xeniostechnology.com
- Instagram: @officialxenios · LinkedIn: /company/officialxenios
- Location: Austin, TX
