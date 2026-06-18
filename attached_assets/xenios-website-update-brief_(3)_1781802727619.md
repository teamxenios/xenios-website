# xenios — Website Update Brief (for Replit) · v3

**Site:** xeniostechnology.com · **Pages:** Home / Network / About
**Scope:** Copy and content updates, two small spacing fixes, and a full functional + operational build.

**v3 changes:** finalizes Samuel's open decisions, adds Samuel's admin email, and adds an "Implementation details Replit should not guess" appendix (Supabase tables, environment variables, statuses, duplicate handling, success and error states, attribution capture, concept-gallery editing, and a public-content restriction). Adds a "do not overbuild" rule.

---

## Ground rules (apply to everything)

- **Design stays as-is.** Keep the UI, colors, fonts, layout, and components exactly as they are. The only visual changes in this brief are the two spacing fixes in Part 3.
- **Do not overbuild.** Build the simplest stable version of each feature first. Do not redesign the site. Do not add dashboards, charts, animations, or new visual systems unless this brief requires them. Prioritize working forms, working emails, working admin access, and working tracking.
- **Brand voice for all copy.** Write "xenios" lowercase everywhere, including at the start of a sentence. No em dashes anywhere in site copy or emails. Plain, premium English. No hype or aggressive sales language.
- **Honesty rule.** Anything not yet in front of real users is labeled a concept or "in development," never presented as shipped.
- **Build on staging, ship after review.** Do the work in a Replit preview, get Samuel's sign-off on the preview URL, then publish to production. Checkpoint the current live site before deploying.

---

## Samuel's final locked inputs

These are final. Build to them and do not pause to ask.

| Input | Value |
|---|---|
| Hero lead-in line | **The AI drafts. The coach decides.** |
| Hero headline | **Two AI agents for every coach.** |
| Customer term | **client** (everywhere; no "athlete" in body copy) |
| Waitlist number | **556** (use the current real number if higher; drive it from the database) |
| Calendly | **https://calendly.com/samuel-xeniostechnology/30min** |
| Admin email (only admin at launch) | **sboadu1212@gmail.com** |
| Database / Auth / Email stack | **Supabase / Supabase Auth / Resend** |

**Assets Samuel still needs to drop in before build (cannot be invented):**
- Meta Pixel ID: `[Samuel to paste]`
- Favicon and OpenGraph/Twitter share image
- Confirm the Instagram and LinkedIn URLs Replit already has are current (add both to the footer)

---

## Part 1 — HOME page copy

### 1a. Hero lead-in line (final)
**Find:** `The AI helps. The professional leads.`
**Replace with:** `The AI drafts. The coach decides.`

### 1b. Hero headline (final)
**Find:** `Two AI agents for every health professional.`
**Replace with:** `Two AI agents for every coach.`

### 1c. Hero supporting line
**Find:** `One helps you run the practice. One supports your client or athlete between sessions.`
**Replace with:** `One runs your practice. One supports each client between sessions, in your voice, always disclosed as AI, always yours to approve.`

### 1d. "Who it's for" section (relocate and reorder the long audience list)
The long list should not sit at the top as the audience definition. Move it lower into a labeled section and lead with coaches.
- **Section label:** `Who it's for`
- **Lead line:** `Built for serious coaches who run real client relationships.`
- **List (reordered to lead with coaches, same items):** Personal trainers · Strength and performance coaches · Health and longevity coaches · Nutritionists and dietitians · Physical therapists · Performance gyms · Wellness and longevity clinics · Sports teams · Corporate wellness teams
- Apply the bullet-spacing fix (Part 3a) here.

### 1e. Problem section (cut about 50%)
**Header — Find:** `The best professionals are limited by time.` **Replace with:** `The best coaches are limited by time.`
**Body — target copy:**
> A great coach can only hold so many real relationships at once. And between sessions, where most of the change actually happens, clients are on their own.

### 1f. Product / "two agents" section (cut about 50%, one customer term)
Trim to about half its length, change every "client or athlete" to "client," and use:
- **Intro:** `Two agents. One for you. One for each client.`
- **Xen:** `Xen runs the practice (check-ins, programming, scheduling, notes) and surfaces only what needs your judgment.`
- **Athena:** `Athena keeps each client supported between sessions, in your voice. You stay in control. The relationship stays human.`

### 1g. Trust line (below the CTA)
**Find:** `Built for professionals. Not to replace them.` **Optional swap:** `Built for coaches. Not to replace them.`

### 1h. CTAs — no change
Keep `Join the waitlist` (primary) and `See how it works` (secondary).

---

## Part 2 — NETWORK page copy
Apply the global term swap ("client") and these light edits.
- **Header — Find:** `Refer between practitioners.` **Replace with:** `Refer between coaches.`
- **Add sub-line:** `and the trainers, clinicians, and practitioners on the network.`
- **Keep:** `The xenios agent handles the handoff in your voice.` · `Bring your roster. Grow without leaving.` · CTA `Join the waitlist`

---

## Part 3 — VISUAL FIXES (the only design changes)

### 3a. Space between bullets and text
On the audience list the bullet sits flush against the word (for example `•Personal trainers`). Add about **0.4 to 0.5em** of space between marker and label.
- Standard `<ul><li>`: `list-style-position: outside;` with `padding-left: 1.25em;` (and `li { padding-left: 0.35em; }` if needed).
- Custom bullets: add `margin-right: 0.4em;` to the bullet, or `gap: 0.4em;` if the row is flex.

### 3b. Tighten section-transition whitespace
Reduce the vertical section padding/margins at section boundaries by roughly **30 to 40%** so transitions feel intentional. Apply consistently to all section boundaries. (Density inside sections is handled by the "cut about 50%" notes; this handles the gaps between them.)

---

## Part 4 — ABOUT page copy
**Lead — replace the opening sentence with:**
> xenios helps coaches manage more clients without losing the human relationship. One workspace that drafts the busywork and keeps every client record connected.

**Expansion line:**
> It is built for coaches first, with clinicians, nutritionists, and performance teams alongside them.

Trim any dense About body by about half, same plain voice.

---

## Part 5 — GLOBAL / FOOTER + consistency

### 5a. Fix the waitlist number
Use **one** number everywhere, driven from the Supabase `waitlist_signups` count so pages cannot drift apart. Show the real current count (locked at 556 for now).

### 5b. Footer descriptor
Keep `An AI workspace for health and performance professionals.` as the umbrella company line in the footer. Narrow to "for serious coaches" only if you want the whole site coach-only.

### 5c. Social + contact
- Keep `Remote first. Austin preferred.`
- **Add LinkedIn** next to Instagram (Replit has both URLs). Today the footer shows only Instagram; show both with the same treatment.
- **Inquiries email:** `team@xeniostechnology.com` is the single contact for all inquiries. Use it in the footer, on the contact/book section, and as reply-to on every confirmation email.

### 5d. Page titles
Give each page a unique `<title>` and meta description (see Part 12). Today Home and Network share the same metadata.

---

## Part 6 — FUNCTIONAL BUILD

> Data-layer specifics (tables, env vars, statuses, duplicate handling, success and error copy, attribution fields) live in **"Implementation details Replit should not guess"** near the end. This section describes the experience; that section is the authoritative spec.

### 6.1 Tech stack (locked)
Supabase (database) + Supabase Auth (Samuel's admin login) + Resend (email on a verified domain). No direct client-side database writes: all writes go through a server-side endpoint that validates input and uses the service key server-side only. Row-Level Security enabled on every table.

### 6.2 Schedule a meeting (Calendly)
- Embed `https://calendly.com/samuel-xeniostechnology/30min` as an inline embed on a contact/book section, plus a "Book a call" button in the nav and footer.
- **Tracking:** write each booking into `calendly_bookings` (name, email, event time, source) via a Calendly webhook (or Zapier/Make if simpler). Track a successful booking as a `Schedule` conversion event (Part 6.7). After booking, show or track: `Your call is booked.` Calendly sends its own booking confirmation.

### 6.3 Waitlist form
Keep this **short**. A long waitlist form kills signups, and waitlist is top of funnel.
- **Required:** Name · Email · Role (dropdown, values matching the "Who it's for" list) · Number of clients you manage (range dropdown) · Consent checkbox
- **Optional:** Phone · Company / gym / practice · City · Instagram or website · What are you interested in?
- **Captured automatically (hidden):** the full attribution set + timestamp + IP + honeypot (see Implementation details)
- On submit: write to `waitlist_signups`, fire the waitlist confirmation email (6.6) and the internal alert, increment the live count, and show the success state.

### 6.4 Early interest form (the LOI flow)
Higher intent, so more fields are fine.
- **Public label:** call it an **"early interest form,"** not a formal LOI, until counsel reviews the language (see Part 11). Keep the non-binding acknowledgment either way.
- **Fields:** Name · Email · Phone · Business name · Role · Website or Instagram · Number of clients · Why interested in xenios (text) · Checkbox: "I understand this is a non-binding indication of interest."
- **Captured automatically:** the full attribution set + timestamp + IP + honeypot
- On submit: write to `loi_submissions`, fire the confirmation email and internal alert, show the success state.

### 6.5 Early concept gallery
- Each concept card: title, short description, **status label**, and date. Every item reads **"Concept"** or **"In development."** No screenshot may imply the product is fully live unless it is.
- Built so Samuel can add or update concepts easily later (editable from Supabase `concept_gallery_items` or a simple JSON/content file; each item has a visible toggle so it can be hidden without deleting).
- Fire `ViewContent` when the gallery is viewed.

### 6.6 Confirmation + notification emails (templates, ready to use)
All send from and reply-to `team@xeniostechnology.com` via Resend on the verified domain. Merge fields in `{curly_braces}`.

**A. Waitlist confirmation (to the signup)** — Subject: `You're on the xenios waitlist`
```
Hi {first_name},

Thanks for joining the xenios waitlist. You're on the list.

xenios gives coaches two AI agents. One helps run the practice. One supports each client between sessions, in your voice, always disclosed as AI.

We onboard coaches in small groups, so we will reach out as soon as a spot opens for you. If you have a question before then, just reply to this email or write to team@xeniostechnology.com.

The xenios team
```

**B. Early-interest confirmation (to the submitter)** — Subject: `We received your interest in xenios`
```
Hi {first_name},

Thanks for sharing your interest in xenios. We have received it.

To be clear, this is a non-binding indication of interest, not a contract and not a commitment to pay. It simply tells us you would like to be part of the early founding group of coaches.

Someone from our team will follow up to talk through how xenios could fit your practice. If you want to reach us first, reply here or write to team@xeniostechnology.com.

The xenios team
```

**C. Internal alert — waitlist (to team@xeniostechnology.com)** — Subject: `New waitlist signup: {name}, {role}`
```
New waitlist signup.

Name: {name}
Email: {email}
Phone: {phone}
Role: {role}
Company/gym/practice: {company}
City: {city}
Instagram/website: {handle_or_url}
Clients managed: {client_count}
Interested in: {interest}
Consent: {consent}

Source page: {source_page}
Landing page: {landing_page}
Referrer: {referrer_url}
UTM: {utm_source} / {utm_medium} / {utm_campaign} / {utm_content} / {utm_term}
Submitted: {timestamp}
```

**D. Internal alert — early interest (to team@xeniostechnology.com)** — Subject: `New early-interest submission: {name}, {business_name}`
```
New early-interest submission (non-binding).

Name: {name}
Email: {email}
Phone: {phone}
Business name: {business_name}
Role: {role}
Website/Instagram: {url_or_handle}
Clients: {client_count}
Why interested: {why_interested}
Non-binding acknowledged: {checkbox}

Source page: {source_page}
Landing page: {landing_page}
Referrer: {referrer_url}
UTM: {utm_source} / {utm_medium} / {utm_campaign} / {utm_content} / {utm_term}
Submitted: {timestamp}
IP: {ip}
```

**E. Calendly follow-up:** optional. Calendly already sends a booking confirmation; only build a branded follow-up if Samuel wants one.

### 6.7 Meta Pixel
- Install the Meta Pixel base code site-wide. **Pixel ID:** `[Samuel to paste]`.
- Events: `PageView` on load · `ViewContent` on the concept gallery · `Lead` on waitlist submit · `CompleteRegistration` on early-interest submit · `Schedule` on a Calendly booking (if trackable).
- Capture the full attribution set into Supabase records.
- If a cookie/consent banner is added (Part 11), gate the Pixel behind consent where required.
- Pixel data lives in Meta Events Manager, not on the site (access in Part 8).

---

## Part 7 — Admin dashboard (Samuel's view)
Login-protected (for example `/admin`), gated by Supabase Auth. Real authentication, no shared front-end password. Only Samuel/admin can view submissions.
- **Tabs:** Waitlist · Early interest · Bookings · Analytics
- **Columns:** name · email · role · company · client count · source · UTM campaign · date submitted · status · notes
- **Actions:** export CSV · change status · add notes · filter by role/date/source · search by name/email/company
- **Status values:** see Implementation details.
- The Analytics tab summarizes counts over time (signups, early-interest, bookings). Deeper paid-performance numbers live in Meta Events Manager unless Samuel later wants them pulled in (Part 8).

---

## Part 8 — Access, ownership & analytics (what Samuel logs into)

### 8a. First-party data (Supabase)
- Give Samuel a working `/admin` login (Supabase Auth, `sboadu1212@gmail.com`).
- Add Samuel as **owner/admin on the Supabase project** so he can reach raw data and export at any time without Replit.
- **Deliver:** admin URL, Samuel's login, Supabase project access.

### 8b. Meta Pixel data
- The Pixel reports to **Meta Events Manager**. Make sure Samuel has admin access to the Meta Business account and the Pixel asset. If the Business account does not exist yet, create one under Samuel and attach the Pixel.
- **Verify firing** with the Meta Pixel Helper extension before launch.
- **Deliver:** Pixel ID, confirmation it is firing, admin access to Events Manager.
- *Optional v2:* surface conversion numbers inside the `/admin` Analytics tab via Meta's Conversions API (one login instead of two). Heavier build, not launch scope.

### 8c. Ownership and backups
- Samuel owns the Supabase project, the Resend account (or has admin access), and the Meta Business / Pixel.
- Database exportable at any time; add a **weekly CSV export** of waitlist, early-interest, and bookings.

---

## Part 9 — Security & secrets
- No API keys in front-end code. All secrets in environment variables (list in Implementation details).
- Supabase **service key used server-side only**; the browser only sees the anon key.
- All form writes go through a server-side endpoint (no direct client-to-database writes).
- **Row-Level Security enabled** on every table; only the admin role reads submissions.
- Admin route protected by Supabase Auth.

---

## Part 10 — Email deliverability
- Set up **SPF, DKIM, and DMARC** for `xeniostechnology.com` and verify the domain in Resend.
- Confirmation emails send from a real `team@xeniostechnology.com` address, not a random provider address.
- Test delivery to **Gmail, Outlook, and iPhone Mail**; confirm inbox, not spam.

---

## Part 11 — Legal & compliance pages
Add basic legal pages linked in the footer:
- Privacy Policy · Terms of Use · Cookie / tracking disclosure (and a simple consent mechanism if added) · AI disclosure (the client-facing agent is always disclosed as AI) · Medical disclaimer (xenios is not medical advice, diagnosis, treatment, or emergency care) · Data deletion request contact: `team@xeniostechnology.com`

**Counsel review:** Replit can draft these, but they should be reviewed by counsel before launch, especially the medical disclaimer and anything touching the clinical side. **The early-interest / LOI language and non-binding flow should also be reviewed by counsel before public use.** Until reviewed, keep the public label "early interest form" rather than a formal LOI. Treat all generated legal text as a draft, not final.

---

## Part 12 — SEO & share previews
- Unique `<title>` and meta description for **Home, Network, and About** (today they share one set). Suggested:
  - Home: `xenios — two AI agents for every coach`
  - Network: `xenios Network — refer between coaches`
  - About: `About xenios — an AI workspace for coaches`
- OpenGraph image and Twitter/X card image (Samuel to provide).
- Favicon, `sitemap.xml`, `robots.txt`, canonical URLs on each page.
- **Fix the leftover default:** current `twitter:site` is `@replit`; change it to the xenios handle.
- Run a social-preview test before launch.

---

## Part 13 — QA (mobile, cross-browser, accessibility)
**Devices/browsers:** desktop, tablet, mobile; Chrome, Safari, mobile Safari. Check nav, footer, all forms, the Calendly embed, the concept gallery, and the admin login. No horizontal scroll. All forms usable on a phone.
**Accessibility basics:** buttons have accessible labels; forms have labels and clear error messages; readable color contrast; clear hover/focus states; keyboard navigation works; images have alt text.

---

## Part 14 — Staging & launch process
- Build in a Replit preview / staging first.
- Samuel reviews staging before production.
- Do not push to live until forms, emails, admin login, Pixel, and Calendly are tested.
- Checkpoint/back up the current live site before deploying.
- After launch, test everything again on production.

---

## Part 15 — Definition of done
Complete when Samuel can: visit the live site, join the waitlist, submit the early-interest form, book a call, receive the confirmation emails (inbox, not spam), log into `/admin`, view and export submissions, and verify Meta Pixel events firing in Events Manager, with the copy updated, the two spacing fixes applied, and the design otherwise unchanged.

---

## Implementation details Replit should not guess

This is the authoritative technical spec. If anything above is ambiguous, this section wins.

### Admin user
- Create Samuel's admin login via Supabase Auth: **sboadu1212@gmail.com**.
- Only this email has admin access at launch. Add other admins only with Samuel's approval.

### Supabase tables
- **waitlist_signups** — `id`, `name`, `email` (unique), `phone`, `role`, `company`, `city`, `handle_or_url`, `client_count`, `interest`, `consent` (bool), `status` (enum), `email_status` (enum), `source_page`, `landing_page`, `referrer_url`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `ip`, `created_at`, `updated_at`
- **loi_submissions** — `id`, `name`, `email`, `phone`, `business_name`, `role`, `url_or_handle`, `client_count`, `why_interested`, `nonbinding_ack` (bool), `status` (enum), `email_status` (enum), `source_page`, `landing_page`, `referrer_url`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `ip`, `created_at` — **keeps history: allow multiple rows per email, do not dedupe**
- **calendly_bookings** — `id`, `name`, `email`, `event_time`, `source`, `status`, `created_at`
- **admin_notes** — `id`, `record_type` (waitlist / loi / booking), `record_id`, `note`, `author`, `created_at` — threaded notes per record (the dashboard's "notes" action writes here)
- **concept_gallery_items** — `id`, `title`, `description`, `image_url`, `status` (Concept / In development / Live), `date`, `visible` (bool), `sort_order`

### Status values
- **waitlist_signups.status:** New · Contacted · Qualified · Not a fit · Converted · Archived
- **loi_submissions.status:** New · Reviewing · Followed up · Signed · Not moving forward
- **email_status (both):** sent · failed

### Duplicate handling (dedupe key is email)
- **Waitlist:** `email` is unique. If the same email signs up again, **update the existing row** with the latest source, attribution, and timestamp (upsert). Do not create duplicates. Still confirm success to the user normally.
- **Early interest / LOI:** **keep every submission** (history). Do not dedupe; allow multiple rows per email so submission history is preserved.

### Success states (after submit)
- Waitlist: `You're on the xenios waitlist. Check your email for confirmation.`
- Early interest: `We received your interest. This is non-binding. The xenios team will follow up.`
- Calendly booking: `Your call is booked.`

### Error states (do not build happy-path only)
- Form submit fails: show a plain error message and keep the entered data.
- Email send fails but the database write succeeds: store the record and set `email_status = failed` (never lose the lead).
- Duplicate email on waitlist: update the existing record (see above) and show normal success.
- Admin login fails: show a clear login error.

### Attribution capture (store on every waitlist + early-interest submission)
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `referrer_url`, `landing_page` (first page of the visit), `source_page` (page the form was submitted from). This matters once Samuel posts links, runs ads, or sends investor and coach links.

### CSV export contents
All visible admin columns **plus** the hidden fields: `created_at` (timestamp), `source_page`, `landing_page`, `referrer_url`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `ip`, `consent`, `email_status`, and notes.

### Environment variables
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
META_PIXEL_ID
CALENDLY_WEBHOOK_SECRET
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
ADMIN_EMAIL
```

### Concept gallery editing
Items editable from Supabase (`concept_gallery_items`) or a simple JSON/content file. Each item: `title`, `description`, `image_url`, `status`, `date`, `visible` toggle, `sort_order`. `visible = false` hides an item without deleting it.

### What not to show publicly (stealth and compliance)
Do not mention **peptides, GLP-1s, clinical prescribing, medical practice operations, or future regulated care flows** anywhere on the public website unless Samuel explicitly approves. Keep the public site focused on coaches, client support, practice operations, waitlist, network, and early concepts. This matches the company's deliberate separation of the clinical rail.

---

## Pre-launch checklist

**Copy & content**
- [ ] Hero line set to "The AI drafts. The coach decides."
- [ ] Headline set to "Two AI agents for every coach."
- [ ] Audience narrowed to coaches at the top; full list moved to "Who it's for"
- [ ] One customer term ("client") used everywhere
- [ ] Problem, Product, About trimmed ~50%
- [ ] xenios lowercase and no em dashes throughout
- [ ] Waitlist count real and identical on every page (556, from the database)
- [ ] All concepts labeled as concepts
- [ ] No peptides / GLP-1 / clinical prescribing language anywhere public

**Visual (only two changes)**
- [ ] Bullet-to-text spacing fixed
- [ ] Section-transition whitespace tightened, consistently
- [ ] UI, colors, fonts, layout otherwise unchanged

**Functional**
- [ ] Supabase tables created with RLS; Supabase Auth + Resend wired up
- [ ] Env vars set (full list)
- [ ] Calendly embed live + "Book a call" in nav/footer + booking webhook to `calendly_bookings`
- [ ] Waitlist form (short, upsert dedupe) and early-interest form (full, history) capture to Supabase
- [ ] Success states and error states implemented (including `email_status = failed` fallback)
- [ ] Attribution set captured on every submission
- [ ] Concept gallery with status labels + visible toggle, easy to update
- [ ] LinkedIn added next to Instagram
- [ ] Spam protection: honeypot, rate limiting, Turnstile, server-side validation
- [ ] Confirmation emails (waitlist, early interest) tested and firing, reply-to team@xeniostechnology.com
- [ ] Internal alerts to team@xeniostechnology.com on every submission, all fields
- [ ] Meta Pixel installed and firing (Pixel Helper verified); attribution captured

**Access, security & ownership (Samuel)**
- [ ] Admin login = sboadu1212@gmail.com only; dashboard live with tabs, statuses, filter, search, export
- [ ] Samuel is owner/admin on Supabase; weekly CSV export available
- [ ] Samuel has admin access to Resend and Meta Business / Events Manager
- [ ] No keys in front-end; service key server-side only; RLS enabled
- [ ] SPF, DKIM, DMARC set; domain verified; inbox-tested on Gmail/Outlook/iPhone

**Legal, SEO & QA**
- [ ] Privacy, Terms, cookie/AI disclosure, medical disclaimer, deletion contact (counsel-reviewed)
- [ ] Early-interest / LOI flow counsel-reviewed; labeled "early interest form" until then
- [ ] Unique titles/descriptions per page; OG + Twitter image; favicon; sitemap; robots.txt; canonicals; twitter:site fixed
- [ ] Mobile/tablet/desktop + Chrome/Safari/mobile Safari tested; no horizontal scroll
- [ ] Accessibility basics pass
- [ ] Staging reviewed by Samuel; live site backed up before deploy; retested on production

---

### Note on what I could and couldn't see
The site is a client-rendered Replit app, so a direct fetch only returned page head/metadata, not the full rendered body. The copy is built from the team's page-by-page transcription, the live metadata, and the brand research. For the Problem / Product / About body paragraphs I could not pull verbatim, I gave target copy plus a "cut ~50%, this voice" rule to apply against the actual source in Replit. Catches from the metadata: the OpenGraph description already uses "The AI drafts. The professional approves." (close to the locked hero line), and `twitter:site` is still the default `@replit`, which should be fixed.
