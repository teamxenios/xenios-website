# Xenios Technologies — Marketing & Waitlist Site

## Overview
Marketing and waitlist site for Xenios Technologies — "The operating system for proactive health professionals." Targets personal trainers, health coaches, strength coaches, and performance staff.

## Tech Stack
- **Frontend:** React + TypeScript, Vite, TailwindCSS, shadcn/ui, Framer Motion, wouter (routing)
- **Backend:** Express (Node.js), Drizzle ORM, PostgreSQL
- **Email:** Resend (via Replit connector integration)
- **Security:** Helmet (security headers)

## Project Structure
```
client/src/
  components/       — UI components (WaitlistForm, CoachApplicationForm, DashboardSection, etc.)
  lib/              — content.ts (all copy), waitlist-service.ts (API client)
  pages/            — Route pages
  hooks/            — Custom React hooks
server/
  index.ts          — Express app setup (helmet, logging, error handler)
  routes.ts         — API routes (/api/waitlist, /api/health)
  storage.ts        — Database storage interface (Drizzle)
  services/email.ts — Resend email confirmation service
  db.ts             — Database connection
shared/
  schema.ts         — Drizzle schema + Zod validation
```

## Database
- PostgreSQL via `DATABASE_URL`
- Table: `waitlist_submissions` with fields: id (uuid), firstName, lastName, email (unique), role, missingTechFeedback, sourcePage, activeClients, adminHours, dataSources, anonymizedDataConsent, submissionType, status (default "Waitlist"), createdAt

## API Endpoints
- `POST /api/waitlist` — Submit waitlist entry (duplicate email prevention, sends confirmation email)
- `GET /api/waitlist` — List all submissions (admin)
- `GET /api/health` — Health check

## Pages
- `/` — Home (9 inline marketing sections)
- `/manifesto` — The Xenios Manifesto
- `/about` — About the company
- `/careers` — Careers page with philosophy, open roles, talent CTA
- `/faq` — Accordion-style FAQ
- `/security` — Security & data practices
- `/privacy` — Privacy policy
- `/terms` — Terms of service
- `/waitlist` — Standalone waitlist page (form + role selector)

## Key Features
- Two submission types: "general" waitlist and "coach_partner" application
- Duplicate email prevention (unique constraint + application-level check)
- Automated confirmation email via Resend on successful submission
- Security headers via Helmet
- All marketing copy centralized in `client/src/lib/content.ts`
- Medical disclaimer in footer

## Contact
- Email: team@xeniostechnology.com
- Phone: 737-418-6381
- Location: Austin, Texas
