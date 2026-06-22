export type CareerGroup = "open" | "cohort";

export interface CareerRole {
  slug: string;
  group: CareerGroup;
  title: string;
  tagline: string;
  type: string;
  location: string;
  summary: string;
  applySubject?: string;
  applyBody?: string;
  detail: Array<
    | { kind: "paragraph"; text: string }
    | { kind: "heading"; text: string }
    | { kind: "list"; items: string[] }
  >;
}

export const CAREERS_ROLES: CareerRole[] = [
  {
    slug: "founding-designer",
    group: "open",
    title: "Founding Designer",
    tagline: "AI-native health and performance OS",
    type: "Contract to full-time",
    location: "Remote, US",
    summary: "Set the visual identity and design system for the operating system behind proactive-health professionals.",
    applySubject: "Founding Designer, xenios",
    detail: [
      { kind: "paragraph", text: "xenios is building the AI-native operating system for the proactive-health professional: coaches, clinicians, performance specialists, and the organizations that employ them. One platform, three commercial surfaces: a professional workspace, a consumer behavioral companion, and a clinical enterprise tier. A great coach today maxes out around 20 to 40 clients before quality breaks. xenios is the substrate that lets one coach serve far more clients without losing what makes coaching transformative." },
      { kind: "paragraph", text: "Design is not a layer here. It is the product. The professional workspace lives or dies on whether hours of weekly operational drag disappear the moment they open it. The consumer companion lives or dies on whether it feels like their coach, not like a chatbot. The clinical surface lives or dies on whether a longevity clinic's medical director trusts it inside an audited prescribing workflow. The founding designer sets that foundation." },
      { kind: "paragraph", text: "The team. The founding team includes a CTO with two prior healthcare-technology exits totaling over 710 million dollars, an MD cofounder with a 30,000-plus patient prescribing history and clinical leadership through a 1.6 billion dollar SPAC, and a founding bench spanning performance science, clinical operations, product, and operator-side experience across coaching, healthtech, and consumer. Pre-seed stage, with named angel capital closed and the MVP build active now. Aesthetic and posture: Anthropic, Stripe, Palantir. Infrastructure, not vertical SaaS." },
      { kind: "heading", text: "What you own in the first 90 days" },
      { kind: "list", items: [
        "Visual identity and design system from scratch: Figma library, tokens, components, motion principles",
        "End-to-end flows for the professional workspace: operator dashboard, client roster, protocol builder, lab interpretation, prescribing handoff",
        "End-to-end flows for the consumer companion: daily check-in, food log, form-check video capture, wearable synthesis, conversational layer",
        "Onboarding and migration UX: moving working professionals off legacy platforms quickly",
        "A consistent design language across web, mobile, conversational, and clinical surfaces"
      ] },
      { kind: "paragraph", text: "The founding designer reports to the CEO and works directly with the CTO. Ships to production weekly. No PM gates between design and shipped UI." },
      { kind: "heading", text: "Who fits" },
      { kind: "list", items: [
        "5 or more years shipping product design",
        "A portfolio that holds visual quality and information density at the same time",
        "Experience designing systems-heavy products such as B2B SaaS, fintech infrastructure, clinical, or performance tooling",
        "Comfortable building a design system from a blank file",
        "Fast iteration, taste over polish, no patience for design theater"
      ] },
      { kind: "paragraph", text: "Bonus: health, fitness, performance, longevity, or clinical product experience; designing for AI-assisted workflows; a design system that scaled past 50 components." },
      { kind: "paragraph", text: "Stack the team uses: Figma. React, Next.js, Tailwind v4, React Native (Expo). Supabase backend. Anthropic Claude. MCP server architecture. Vercel and Fly.io. AI-assisted design tools welcome." },
      { kind: "paragraph", text: "Compensation: Competitive market-rate cash, paid in 4-week cycles from start date. Founding-level equity grant with a 4-year vest and 6-month cliff. A 30-day reassessment after start. Final cash terms set at offer based on scope and time commitment. Full-time transition available as the company scales." },
      { kind: "paragraph", text: "Work authorization: This role requires current authorization to work in the United States on a permanent basis, without current or future employer-sponsored work visa. This is solely because we are not able to sponsor employment visas at this stage." },
      { kind: "paragraph", text: "How to apply: Email team@xeniostechnology.com with the subject \"Founding Designer, xenios\". Include your resume, your portfolio, one paragraph on a 0 to 1 product you designed, and why xenios specifically. The founding team responds to every serious applicant within 48 hours." }
    ]
  },
  {
    slug: "innovative-product-builder",
    group: "open",
    title: "Innovative Product Builder",
    tagline: "Founding engineer, own a platform module end to end",
    type: "Contract to full-time",
    location: "Remote",
    summary: "Own an entire platform module from problem framing to production, building with Claude Code as a core tool.",
    applySubject: "Innovative Product Builder, xenios",
    detail: [
      { kind: "paragraph", text: "xenios is building the platform that puts a coach in every client's pocket: available around the clock, sounding like the real coach, and scaling one coach's expertise to serve many more clients without losing the personal touch that makes coaching work. We are a small, fast-moving team shipping real product, not decks, not committees, not endless planning cycles." },
      { kind: "paragraph", text: "Why this matters. A great coach can only serve 20 to 40 clients before quality degrades. Scheduling, follow-ups, check-ins, program adjustments, motivation, and accountability grow with every new client. Clients need their coach early in the morning at the gym, late at night before they order takeout, and in the moments they are about to skip a workout. The coach cannot be there around the clock, but the coach's knowledge, philosophy, voice, and judgment can. We are building the system that clones that expertise into an AI that acts on the coach's behalf: drafting personalized plans, giving real-time form feedback through the phone camera, analyzing food logs, sending check-ins, encouraging clients, and escalating to the human coach when it matters." },
      { kind: "paragraph", text: "The role. We are looking for engineers who want to own an entire platform module, from problem framing through production deployment. You will run Discovery Builds: researching the domain, building proofs of concept, turning working prototypes into specs, and shipping production software. You will also pick up well-scoped Feature Sprints and ship them fast. We follow a build-to-learn process: working prototypes are specs that run. If your instinct is to demand a detailed requirements document before you open an editor, this is not the right fit. This is not a role where someone assigns you tickets each morning. You get context, alignment on the goal, and then you run with it." },
      { kind: "heading", text: "What you will do" },
      { kind: "list", items: [
        "Own a major platform module end to end: the agent orchestrator, the coach personality system, the client experience, the real-time form-feedback pipeline, or the communication engine. Architecture, implementation, testing, deployment, iteration.",
        "Run Discovery Builds: problem brief, proof of concept, domain-expert review, refined spec, production build. Test the hardest 10 percent of the problem first, then hand the proven approach to Claude Code.",
        "Ship Feature Sprints: take a brief with clear acceptance criteria and ship it in 1 to 3 days using Claude Code.",
        "Write machine-ready PRDs: working proof-of-concept code, concrete acceptance criteria, data requirements with schemas and API payloads, and a verification plan precise enough for an AI agent to execute against.",
        "Collaborate through a generate, review, refine loop with domain experts.",
        "Communicate asynchronously through learning logs instead of daily standups. If there is no blocker, protect deep work."
      ] },
      { kind: "heading", text: "Who you are" },
      { kind: "list", items: [
        "You have built entire platforms from scratch, with or without AI tools. You have taken something from zero to production and kept it running.",
        "You think in specs that machines can execute, and you know a working proof of concept communicates architectural intent better than prose.",
        "You have an ownership mindset and you are a strong teammate who makes the people around you more effective.",
        "You solve the hardest problem first. Here that means security and compliance (HIPAA, SOC 2), the agent guardrail pipeline that keeps AI outputs inside safety boundaries, and the event-driven orchestration layer that processes 15,000-plus tasks per day reliably.",
        "You have deep engineering standards: clean architecture, the OWASP Top 10 designed against from the start, tests first, database-first modeling in PostgreSQL with real schemas and migrations, structured logging, and monitoring that tells you something when things break.",
        "You can commit meaningful, focused time. We ship on real deadlines."
      ] },
      { kind: "paragraph", text: "What you will build. xenios is an event-driven agentic platform: five input types (messages, heartbeats, crons, hooks, webhooks) feed a task queue, processed by specialized AI agents with persisting state. From the outside it looks like the coach is always there. From the inside it is a Go-native orchestrator running on Fly.io. The platform includes a coach personality system that clones a coach's voice and methodology into a structured prompt refined over time, an agent orchestrator across 12-plus specialized agents with model tiering (Haiku for triage, Sonnet for drafting, Opus for edge cases), real-time exercise form feedback via on-device pose estimation, a food-logging system powered by Claude's vision API, a multi-channel communication engine across in-app, SMS, WhatsApp, and email with a guardrail pipeline, coach and client dashboards in React and Next.js, a React Native app via Expo, and multi-tenant architecture on Supabase (PostgreSQL with pgvector) with row-level security and a full audit trail." },
      { kind: "paragraph", text: "Tech context: Go, React (Next.js), React Native (Expo), and PostgreSQL (Supabase), with integrations across Anthropic Claude, Twilio, Stripe, Recall.ai, Deepgram, MediaPipe, Apple HealthKit, Google Health Connect, and SendGrid. Backend on Fly.io, frontends on Vercel. We build with Claude Code as a primary tool for shipping production software fast, with automated quality checks in CI and a living CLAUDE.md as institutional memory. Experience building entire platforms from scratch is required, with or without AI tools." },
      { kind: "paragraph", text: "Compensation: Paid role with founding equity. Final terms set at offer based on scope and time commitment." },
      { kind: "paragraph", text: "How to apply: Email team@xeniostechnology.com with the subject \"Innovative Product Builder, xenios\". Tell us about a platform you built from scratch: how you framed the problem, what your proof of concept looked like, how your spec evolved as you built, what you shipped, and what you would do differently. Bonus if you have built event-driven systems, worked with LLM APIs in production, or shipped AI-assisted coaching, health, or fitness products." }
    ]
  },
  {
    slug: "founding-coach-cohort",
    group: "cohort",
    title: "Founding Coach Cohort",
    tagline: "Beta tester and design partner, 30 seats",
    type: "Design-partner program, free early access",
    location: "Remote, US",
    summary: "Help build the coaching OS. Free early access, a direct line to the founder, and your name among the first coaches on it.",
    applyBody: "Who you are and who you coach:%0D%0AOnline, in-person, or hybrid:%0D%0AMain specialty:%0D%0AActive client count:%0D%0ACheck-in cadence:%0D%0ATools used today:%0D%0AWhere follow-up or client attention breaks:%0D%0AAudience links or handles:%0D%0AAre you willing to join a private Slack and test weekly:%0D%0AWhy you want in:%0D%0AAnything else we should know:",
    detail: [
      { kind: "paragraph", text: "We are building the operating system for proactive health, and we want 30 of the best coaches to help build it with us. xenios is an AI-native system for coaches. The professional stays in front. The AI carries the work behind them. Over time it is meant to consolidate the fragmented stack of tools a serious coach juggles into one system, with the human in front. We are not there yet, and we are honest about that. We are starting with two coach-side products, both human-approved and non-clinical in version one:" },
      { kind: "list", items: [
        "Hercules, the weekly check-in engine. For every client, every week, it prepares a check-in in your voice, grounded in that client's actual week. You edit, approve, or reject. Nothing sends on its own.",
        "The Studio, the client attention queue. Across your whole roster it shows who needs attention today, why they were flagged, the source behind the reason, and the next action prepared for your approval."
      ] },
      { kind: "paragraph", text: "This is a founding cohort, not a public launch and not a paid job. We are hand-picking a small group of high-caliber coaches who get early access, shape what we build, and become some of the first names on it when we launch. It is capped at 30." },
      { kind: "heading", text: "What you get" },
      { kind: "list", items: [
        "Free early access to xenios, starting with Hercules and the Studio, with founding-coach pricing when we go paid",
        "Concierge support from the team while we build",
        "A direct line to the founder, including a private Slack and real influence over the roadmap",
        "Founding-coach recognition, your name among the first coaches who shaped the product",
        "Early visibility into Athena, the future client-side AI companion, always disclosed as AI and always under the coach"
      ] },
      { kind: "heading", text: "What we ask" },
      { kind: "list", items: [
        "Use it for real and tell us the truth: what works, what is broken, what is missing",
        "Test new features as they ship and flag bugs as they come up",
        "Bring real client context, since the product can only be judged on real work",
        "A short weekly check-in in Slack",
        "Patience with an early product that will have rough edges",
        "Optional, and only if you mean it: share your experience with your audience, in your words, with everything approved by you"
      ] },
      { kind: "paragraph", text: "Who we are looking for. You are a strong fit if you are a personal trainer, strength and conditioning coach, health or wellness coach, dietitian, or performance and longevity practitioner, and most of the following are true: you actively coach a real book of clients, roughly 20 to 80 or more; you run weekly or biweekly check-ins; you are certified and respected in your field, for example NASM, NSCA, ACE, CSCS, or RD; you are the kind of coach other coaches come to for advice. An engaged audience, a following, a newsletter, a podcast, or a community, is a plus but not required." },
      { kind: "paragraph", text: "This is a build-with-us seat, not a free login. You are not a fit if you are looking for paid sponsorship, do not actively coach clients, are building competing coach software, or just want a free login with no interest in giving feedback." },
      { kind: "heading", text: "The boundaries that matter" },
      { kind: "list", items: [
        "xenios does not replace the coach. You stay in front of every client.",
        "xenios does not practice medicine. Version one is non-clinical.",
        "Nothing client-facing goes out without your approval.",
        "Athena, the future client-side AI, is always disclosed as AI.",
        "Your data and your clients' data are handled with care and confidentiality, and we will walk you through how we handle data before you onboard."
      ] },
      { kind: "paragraph", text: "How to apply. Email team@xeniostechnology.com and tell us: who you are and who you coach, and whether you are online, in-person, or hybrid; your main specialty; roughly how many active clients you coach now; how often you check in with clients; the tools you use today; the single biggest place follow-up or client attention breaks for you; your audience, where it lives and how big it is, with handles or links welcome; whether you will join a private Slack, test early flows weekly, and bring real client context; why you want in; and anything else we should know. We review on a rolling basis and reach out personally for a short conversation before confirming a spot. Spots are limited, and the founding window closes once the cohort is full." }
    ]
  }
];

export const OPEN_ROLES = CAREERS_ROLES.filter((role) => role.group === "open");
export const COHORT_ROLES = CAREERS_ROLES.filter((role) => role.group === "cohort");

export const EQUAL_OPPORTUNITY_STATEMENT = "xenios is an equal opportunity employer. We do not discriminate on the basis of race, color, national origin, ancestry, religion, sex, gender identity, sexual orientation, age, disability, veteran status, or any other characteristic protected by applicable law. Any work-authorization requirement noted on a role is solely because we are not able to sponsor employment visas at this stage.";

export function careerApplyHref(role: CareerRole) {
  const subject = role.applySubject ? `?subject=${encodeURIComponent(role.applySubject)}` : "";
  const body = role.applyBody ? `${subject ? "&" : "?"}body=${role.applyBody}` : "";
  return `mailto:team@xeniostechnology.com${subject}${body}`;
}

export function careerDescription(role: CareerRole) {
  return role.detail
    .filter((block): block is Extract<CareerRole["detail"][number], { kind: "paragraph" }> => block.kind === "paragraph")
    .map((block) => block.text)
    .join("\n\n");
}
