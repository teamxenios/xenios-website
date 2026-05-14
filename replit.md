# Xenios Technologies — Marketing & Waitlist Site (Spec v3)

## Overview
Marketing & waitlist site for Xenios — "the proactive health OS." Multi-agent AI OS
for proactive/preventive health practitioners. Stealth, pre-seed, Austin TX. Heritage
line: built by operators behind $710M+ in prior exits, including FinDox and InstaMed.

## Tech Stack
- **Frontend:** React + TypeScript, Vite, TailwindCSS + custom design tokens, wouter, CSS-only animations (no framer-motion)
- **Backend:** Express (Node.js), Drizzle ORM, PostgreSQL
- **Email:** Resend (via Replit connector)
- **Security:** Helmet, IP rate-limit (5 / 10 min), honeypot, Zod validation

## Brand System (v3)
- Colors: `#F4EFE6` paper · `#0E0E0C` ink · `#FF5A1F` pulse · gradient pill stops `#F4B98A → #E8836E → #B964D4 → #5D7CFF`
- Typography: Inter Tight (weights 500/600/700/800/900) + JetBrains Mono for caps
- Type scale: clamp-based per-breakpoint (Display XL 40→132px, Display L, Display M, H1–H3, body L/M/S, quote-lead, mono-cap)
- Container widths: 100% → 720 → 760 → 960 → 1200 → 1320 → 1440 → 1600 across 7 breakpoints
- Buttons: 4px radius, 52→56→60→64px height; ghost = underline, no rounded
- Six atmospheric gradient presets with film-grain overlay (`grad-01-dawn` … `grad-06-horizon`)
- Wordmark: lowercase `xenios` + orange `.` period

## Project Structure
```
client/src/
  components/
    Navbar (6-item, hamburger overlay w/ focus trap + Esc + scroll lock + aria-modal)
    Footer (wordmark, sitemap, contact, socials, counter line)
    TopRibbon (counter + dismiss)
    Wordmark, PageShell
    RotatingHero (CSS kinetic gradient pill; freezes under prefers-reduced-motion; SR-only static label)
    EcosystemMarquee (52 names, 2 rows reverse, mask fade, pause-on-hover, RM-aware)
    AgentDiagram (8 agents, "what it never does" line per card)
    Counter (line + bignum variants, on-dark)
    SeoHead (per-page title/description/og/twitter/canonical/hreflang)
    WaitlistForm, ContactForm
  lib/
    content.ts (canonical v3 copy: ROTATING_ROLES, PRACTITIONER_TILES×18, AGENTS×8,
                ECOSYSTEM_CLUSTERS — 13 clusters / 52 names, REVENUE_CHIPS×10,
                FAQ_QA, all page copy)
    waitlist-service.ts
  pages/
    Home (13 sections: hero, who's signing up, movement, built-for, ecosystem marquee,
          multi-agent OS, network block, OS-layer 3-strip, revenue chips, heritage,
          common questions, final CTA)
    Product (7 capabilities + 8-agent deep dive + network + revenue layer + glossary + FAQ)
    ForPractitioners (18 tiles)
    Ecosystem (52 names across 13 clusters + marquee + disclaimer)
    Network (4 pillars + 6-step example flow)
    About (heritage + 5 beliefs)
    Careers (5 founding roles, advisor dropped)
    Waitlist, Contact, Privacy, Terms, not-found
server/
  index.ts, routes.ts, storage.ts, services/email.ts (unchanged from v2)
shared/
  schema.ts (PRACTITIONER_TYPE_VALUES aligned with v3 tile values)
public/
  sitemap.xml, robots.txt (allows GPTBot/ClaudeBot/PerplexityBot/Google-Extended), llms.txt
client/index.html
  Universal head (canonical, og, twitter, geo) + 4 JSON-LD blocks
  (Organization, LocalBusiness, WebSite, FAQPage)
```

## Database
- `waitlist_signups`: id, first_name, last_name, email (unique), practitioner_type
  (one of 19 v3 values), city, country, free_text, how_heard, position, ip_country,
  user_agent, created_at
- `counter_state`: id (=1), base_count (default 550), signups_count, updated_at
- Position derivation: transactional `SELECT … FOR UPDATE` on counter row.

## API Endpoints
- `POST /api/waitlist` — submit (honeypot, rate-limit, idempotent on duplicate email)
- `POST /api/contact` — contact form (subject auto-prefix by persona; auto-reply)
- `GET  /api/counter` / `/api/waitlist/count` — public live total (cached 5s)
- `GET  /api/waitlist` — admin list (Bearer ADMIN_API_KEY)
- `GET  /api/health`

## Pages & Routes
- `/`, `/product`, `/for-practitioners`, `/ecosystem`, `/network`, `/about`, `/careers`,
  `/waitlist`, `/contact`, `/privacy`, `/terms`, 404
- Retired v2 routes redirected: `/manifesto → /about`, `/investors → /contact`,
  `/partners → /ecosystem`, `/faq → /product`, `/security → /privacy`

## Key v3 Features
- Rotating-word kinetic hero with gradient pill (18 roles, 2.2s dwell, freezes on RM)
- Live waitlist counter (8s polling) shown in TopRibbon, hero pill, footer, CTA blocks
- 18-tile audience grid (rotating gradient presets) on `/` and `/for-practitioners`
- 52-name dual-row ecosystem marquee (mask fade, reverse second row, pause-on-hover)
- 8-agent diagram with "what it never does" guardrail line per agent
- 6 atmospheric gradient presets with subtle film-grain overlay
- Subject-line conventions: `[INVESTOR]`, `[PRESS]`, `[PARTNER]`, `[ROLE — …]`,
  `[HELLO]`, `[PRACTITIONER]`
- Mobile hamburger overlay: focus trap, Esc to close, scroll lock, focus restore,
  `aria-modal`, `aria-controls`
- Reduced-motion respected throughout (rotation, marquee, counter dot, transitions)
- Per-page SEO: canonical, OG, Twitter, hreflang, geo meta
- JSON-LD: Organization, LocalBusiness, WebSite, FAQPage in `index.html`
- Stealth guardrails: no team-member names, no founder photos, no advisor role
- All copy centralized in `client/src/lib/content.ts`

## Contact
- Email: team@xeniostechnology.com
- Instagram: @officialxenios · LinkedIn: /company/officialxenios
- Location: Austin, TX
