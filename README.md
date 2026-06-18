# Xenios Website

Marketing & waitlist site for **xenios** — an AI workspace for health and performance professionals.

- **Frontend:** React + TypeScript, Vite, TailwindCSS, wouter
- **Backend:** Express (Node.js), Drizzle ORM
- **Database:** PostgreSQL / Supabase
- **Email:** Resend
- **Bot protection:** Cloudflare Turnstile
- **Analytics:** Meta Pixel

> GitHub is the source of truth for the code. Replit is the runtime, preview, secrets manager, and deployment environment.

## Prerequisites

- Node.js 20+
- A PostgreSQL/Supabase database
- (Optional) Resend, Meta Pixel, Calendly, and Turnstile credentials for full functionality

## Environment variables

Copy `.env.example` to `.env` and fill in the values for local development:

```bash
cp .env.example .env
```

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | yes | Public anon key (safe in browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server-only.** Never expose to the frontend, logs, or git |
| `RESEND_API_KEY` | yes | Transactional email |
| `META_PIXEL_ID` | no | Analytics; site degrades gracefully if unset |
| `CALENDLY_WEBHOOK_SECRET` | no | Verifies Calendly booking webhooks |
| `TURNSTILE_SITE_KEY` | no | Public site key (browser) |
| `TURNSTILE_SECRET_KEY` | no | **Server-only** verification key |
| `ADMIN_EMAIL` | yes | Admin login email |
| `FROM_EMAIL` | yes | Sender address for outgoing email |
| `REPLY_TO_EMAIL` | yes | Reply-to address |
| `SITE_URL` | yes | Canonical site URL |

**Never commit real secrets.** `.env` and other secret files are gitignored. In Replit, set
these in the Secrets pane (Tools → Secrets), not in any committed file.

## Run locally

```bash
npm install
npm run db:push   # sync the Drizzle schema to your database
npm run dev       # starts the Express server + Vite on port 5000
```

The app is served at `http://localhost:5000`.

## Run on Replit

Replit runs the configured **Start application** workflow, which executes `npm run dev`.
Secrets are read from the Replit Secrets pane. Press **Run** (or restart the workflow) to start it.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Express + Vite) on port 5000 |
| `npm run build` | Production build (`script/build.ts`) |
| `npm run start` | Run the production build (`dist/index.cjs`) |
| `npm run check` | TypeScript type-check |
| `npm run db:push` | Push the Drizzle schema to the database |

## Deployment

Deployment is handled by **Replit Publishing**:

- **Build command:** `npm run build`
- **Run command:** `npm run start`
- Production secrets live only in Replit Secrets (never in git).
- Publishing handles build, hosting, TLS, and health checks. The app is served on its
  `.replit.app` domain or a configured custom domain.

## Security

- The Supabase **service role key** is used server-side only (`server/supabase.ts`). It must
  never appear in frontend code, the browser bundle, logs, or any committed file.
- Public keys (Supabase anon key, Turnstile site key) are safe to expose in the browser.
