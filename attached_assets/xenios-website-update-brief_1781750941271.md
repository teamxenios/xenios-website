# xenios — Website Update Brief (for Replit)

**Site:** xeniostechnology.com · **Pages:** Home / Network / About
**Scope:** Copy + content updates, two small spacing fixes, and a functional build layer.
**Hard rule:** Keep the UI, colors, fonts, layout, and components exactly as they are. The only *visual* changes in this brief are the two spacing fixes in Part 3. Everything else is copy, content structure, and functionality.

This brief turns the team's feedback (Christine Chun's notes + the brand research) into specific, page-by-page changes. Where I could see the exact live copy, I give you find → replace. Where the live page is rendered by JS and I couldn't pull the full body text, I give you the target copy plus a clear editing rule to apply against the source you have in Replit.

---

## Part 0 — The strategic decisions driving every change

The brand research and Christine's feedback agree on the same four moves. These are baked into the copy below. **Samuel: flag any you want to change before this ships.**

1. **Name one audience: Coaches.** Today the site speaks to "professionals" and backs it with a long descriptor list (trainers, nutritionists, clinicians, gyms, teams…). That's too broad to be memorable. We lead with **coaches** at the top of every page, and move the full list into a clearly labeled **"Who it's for"** section. *(Brand research names the bullseye explicitly: the serious, depth-first coach.)*

2. **Pick one word for the coach's customer: "client."** Today it alternates between "client" and "athlete." Pick one for consistency. **Recommendation: "client"** — it's the universal term for a coach's customer and leaves room to expand. (Sports/performance contexts can still say "athlete," but the site should be consistent: client.)

3. **Strengthen the hero line.** "The AI helps. The professional leads." — "helps" is understated (Christine). The site's *own metadata* already uses a stronger pairing: "The AI drafts. The professional approves." We align to that energy. Options in the Home section below.

4. **Cut density ~50%, but tighten empty whitespace.** The Problem and Product sections are dense — trim about half the words. At the same time the *transitions between* sections have too much empty space — tighten those. Both are addressed (copy below + Part 3).

---

## Part 1 — HOME page

### 1a. Hero — lead-in line (the punchy two-statement line)

**Find:**
> The AI helps. The professional leads.

**Replace with one of these** (Samuel/Zay to pick — all keep the two-short-statement punchiness Christine liked):

- **Recommended:** `The AI drafts. The coach decides.` *(crispest, matches the product reality and the site's own metadata)*
- Alt A: `The AI does the work. The coach leads.`
- Alt B (keeps "professional"): `The AI does the work. The professional leads.`

### 1b. Hero — headline

**Find:**
> Two AI agents for every health professional.

**Replace with:**
> Two AI agents for every coach.

*(This is the single biggest "pick a lane" move. If you'd rather keep "health professional" as the umbrella, keep the headline as-is — but then 1d below must do the audience-narrowing work instead.)*

### 1c. Hero — supporting line

**Find:**
> One helps you run the practice. One supports your client or athlete between sessions.

**Replace with:**
> One runs your practice. One supports each client between sessions — in your voice, always disclosed as AI, always yours to approve.

*(Shorter alt if the long version feels heavy: "One runs your practice. One supports each client between sessions.")*

### 1d. "Who it's for" — relocate and reorder the audience list

The long bulleted list (Personal trainers, Strength coaches, Nutritionists, Health coaches, Physical therapists, Longevity clinicians, Performance gyms, Wellness clinics, Sports teams, Corporate wellness teams) should **not** sit at the top as the audience definition. Move it into a clearly labeled section lower on the page, and lead it with coaches.

**Section label:** `Who it's for`

**Lead line:**
> Built for serious coaches who run real client relationships.

**List (reordered to lead with coaches, same items, grouped):**
- Personal trainers
- Strength & performance coaches
- Health & longevity coaches
- Nutritionists & dietitians
- Physical therapists
- Performance gyms
- Wellness & longevity clinics
- Sports teams
- Corporate wellness teams

*(Apply the bullet-spacing fix from Part 3 to this list.)*

### 1e. Problem section — cut ~50%

**Header — Find:**
> The best professionals are limited by time.

**Replace with:**
> The best coaches are limited by time.

**Body — target copy (replace the current denser Problem paragraph with copy at about this length and voice; cut roughly half the words):**
> A great coach can only hold so many real relationships at once. And between sessions — where most of the change actually happens — clients are on their own.

### 1f. Product / "two agents" section — cut ~50%, one customer term

Trim the existing two-agents explanation to about half its current length, remove every "client or athlete" → "client," and use these blocks:

**Intro:**
> Two agents. One for you. One for each client.

**Xen (the coach's agent):**
> Xen runs the practice — check-ins, programming, scheduling, notes — and surfaces only what needs your judgment.

**Athena (the client's agent):**
> Athena keeps each client supported between sessions, in your voice. You stay in control. The relationship stays human.

### 1g. Trust line (below the CTA)

**Find:**
> Built for professionals. Not to replace them.

**Replace with (optional, for bullseye consistency):**
> Built for coaches. Not to replace them.

*(This line is on-brand either way — change only if you're committing fully to coach-first language. Keep "professionals" if you want the broader umbrella here.)*

### 1h. CTAs — no change
Keep `Join the waitlist` (primary) and `See how it works` (secondary).

---

## Part 2 — NETWORK page

This page is already fairly tight. Apply the global term swap ("client"), the spacing fixes, and these light edits.

**Header — Find:**
> Refer between practitioners.

**Replace with:**
> Refer between coaches.

**Add as the sub-line (so the broader network is still named):**
> …and the trainers, clinicians, and practitioners on the network.

**Keep as-is:**
- `The xenios agent handles the handoff in your voice.`
- `Bring your roster. Grow without leaving.`
- CTA: `Join the waitlist`

---

## Part 3 — VISUAL FIXES (the only design changes)

Everything else about the design stays the same. Two fixes only.

### 3a. Space between bullets and text
On the audience / "who it's for" list, the bullet sits flush against the word (e.g. `•Personal trainers`). Add ~**0.4–0.5em** of breathing room between the marker and the label.

- If it's a standard `<ul><li>`: set `list-style-position: outside;` and give the list `padding-left: 1.25em;` (and `li { padding-left: 0.35em; }` if needed).
- If the bullets are custom (a `::before` dot or an inline bullet character): add `margin-right: 0.4em;` to the bullet, or `gap: 0.4em;` if the row is a flex container.

Target: a clear, consistent gap between every bullet and its text.

### 3b. Tighten the empty whitespace between sections
There's too much empty vertical space at the section transitions (e.g. between the CTA / "Built for…" block and "THE PROBLEM"). Reduce the vertical section padding/margins at those boundaries by roughly **30–40%** so transitions feel intentional rather than empty.

- Apply this consistently to **all** section boundaries — don't tighten one and leave the rest, or the rhythm will look uneven.
- This is about the *gaps between* sections. The "cut ~50%" instructions above handle density *within* sections. Both are intended.

---

## Part 4 — ABOUT page

**Lead — Replace the current opening sentence with this tighter, coach-first version:**
> xenios helps coaches manage more clients without losing the human relationship — one workspace that drafts the busywork and keeps every client record connected.

**Then, for expansion (so clinics/teams are still named):**
> It's built for coaches first, with clinicians, nutritionists, and performance teams alongside them.

**Editing rule for the rest of the About body:** same as the Home Problem/Product sections — trim dense paragraphs by about half, keep the voice human and plain, claim less and prove more.

---

## Part 5 — GLOBAL / FOOTER + consistency cleanup

### 5a. Fix the waitlist number (currently inconsistent: 550 on one page, 556 on another)
Use **one** number everywhere. Set it to the real current count — `LIVE • 556 on the waitlist` if that's accurate — and ideally drive it from a **single source of truth** (the waitlist store in Part 6) so the two pages can never drift apart again.

### 5b. Footer descriptor
Keep `An AI workspace for health and performance professionals.` as the umbrella (it's fine for the company line in the footer even though the *marketing lead* is now coach-first). Narrow it to "for serious coaches" only if you want the whole site, top to bottom, to be coach-only.

### 5c. Keep as-is
`Remote first. Austin preferred.` · `team@xeniostechnology.com` · `Instagram`

### 5d. Page titles
The home page `<title>` currently reads as the two-agents line in search, while the shared meta title is the "AI workspace…" line. Pick one positioning for the home `<title>` so it matches the hero. Low priority, but worth aligning.

---

## Part 6 — FUNCTIONAL BUILD (separate from the copy edits)

These are the build items, distinct from the copy work above. **Honesty rule throughout: anything not yet in front of real users is labeled a concept/mockup, never presented as shipped.**

1. **Schedule-a-meeting** — Embed Calendly or Cal.com (Cal.com if you want the open-source option). Add it as an inline embed on a contact/book section, plus a button in the nav and footer.

2. **Waitlist signup** — A real email-capture form writing to one store (Google Sheet / Airtable / Supabase — pick one). That same store feeds the live count in 5a, so the number is always real and consistent. Fire a confirmation email on signup.

3. **Early concept gallery** — A section/page for the product concept screenshots (the Stitch coach-console concepts). **Each item labeled "Concept" / "In development."** Do not frame these as live product.

4. **LOI flow** — A simple flow for a coach to register intent / sign a non-binding letter of intent: form → confirmation screen → store the entry → notify the team. Keep the "non-binding" language explicit (this ties to the 165 signed LOIs in the company doc).

5. **Confirmation emails** — Waitlist, LOI, and meeting bookings should each send a confirmation email. Use a transactional provider (Resend / Postmark / SendGrid). **Samuel verifies each one actually fires** with a real test send before launch — this was called out specifically.

---

## Pre-launch checklist

- [ ] Hero "helps / professional" line replaced with the chosen stronger line
- [ ] Audience narrowed to **coaches** at the top of every page; full list moved to "Who it's for"
- [ ] One customer term — **"client"** — used everywhere (no "athlete" left in body copy)
- [ ] Problem, Product, and About sections trimmed ~50%
- [ ] Bullet-to-text spacing fixed
- [ ] Section-transition whitespace tightened (consistently, all sections)
- [ ] Waitlist count is real and identical on every page
- [ ] All concepts labeled as concepts
- [ ] Confirmation emails tested and confirmed firing (waitlist, LOI, booking)
- [ ] UI, colors, fonts, and layout otherwise unchanged

---

### Note on what I could and couldn't see
The site is a client-rendered Replit app, so a direct fetch only returned the page head/metadata, not the full rendered body. The copy above is built from the team's page-by-page transcription, the live metadata, and the brand research. For the Problem / Product / About **body paragraphs** I couldn't pull verbatim, I've given you the target copy and a clear "cut ~50%, this voice" rule to apply against the actual source in Replit. One useful catch from the metadata: the site's own OpenGraph description already uses "The AI drafts. The professional approves." — stronger than the live hero line, which is why the recommended hero options lean that way.
