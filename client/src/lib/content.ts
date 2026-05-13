export const content = {
  contact: {
    email: "hello@xeniostechnology.com",
    investorsEmail: "investors@xeniostechnology.com",
    pressEmail: "press@xeniostechnology.com",
    careersEmail: "careers@xeniostechnology.com",
    securityEmail: "security@xeniostechnology.com",
    location: "Austin, Texas",
    socials: [
      { label: "LinkedIn", url: "https://www.linkedin.com/company/xenios-technology" },
      { label: "X", url: "https://x.com/xeniostech" }
    ]
  },

  ribbon: {
    text: "Now raising pre-seed.",
    suffix: "Coaches & investors",
    cta: "join the waitlist",
    href: "/waitlist"
  },

  nav: {
    links: [
      { label: "Manifesto", href: "/manifesto" },
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "FAQ", href: "/faq" }
    ],
    cta: "Join waitlist"
  },

  footer: {
    columns: [
      {
        title: "Company",
        links: [
          { label: "Manifesto", href: "/manifesto" },
          { label: "About", href: "/about" },
          { label: "Careers", href: "/careers" },
          { label: "Contact", href: "mailto:hello@xeniostechnology.com" }
        ]
      },
      {
        title: "Product",
        links: [
          { label: "For coaches", href: "/#audience" },
          { label: "For clients", href: "/#audience" },
          { label: "FAQ", href: "/faq" },
          { label: "Security", href: "/security" }
        ]
      },
      {
        title: "Resources",
        links: [
          { label: "Waitlist", href: "/waitlist" },
          { label: "Press", href: "mailto:press@xeniostechnology.com" }
        ]
      },
      {
        title: "Legal",
        links: [
          { label: "Terms", href: "/terms" },
          { label: "Privacy", href: "/privacy" },
          { label: "Security & HIPAA", href: "/security" }
        ]
      }
    ],
    copyright: "© 2026 Xenios Technologies, Inc. Austin, TX.",
    disclaimer: "Xenios is not a medical device. Not a substitute for licensed medical or clinical care."
  },

  home: {
    hero: {
      eyebrow: "PRE-SEED · AUSTIN, TX",
      title: { line1: "Put a coach in every", line2: "client's pocket." },
      subhead: "Most coaches cap out at 40 clients. Xenios is the AI-native operating system that lets one coach run a practice of hundreds — without losing the depth of one-on-one care.",
      ctaPrimary: "Join the waitlist",
      ctaSecondary: "Read the manifesto",
      microcopy: "No spam. Occasional updates. Potential early access for design-partner coaches."
    },

    metrics: {
      items: [
        { value: "40", label: "Clients the average human coach can serve well." },
        { value: "$710M", label: "Prior exits by Xenios's founding team across healthcare infrastructure companies." },
        { value: "6M+", label: "U.S. health coaches, trainers, and nutritionists." },
        { value: "~1", label: "Coaches per hundred clients in the current model." }
      ],
      footnote: "Sources: IHRSA 2024, NASM coach census, internal estimates. Founder exit figure aggregates prior outcomes including FinDox and InstaMed."
    },

    thesis: {
      eyebrow: "THE THESIS",
      h2: "Three forces are colliding. Coaching is about to change forever.",
      lede: "GLP-1s reshaped metabolic health. Wearables made every body legible. And LLMs finally made it possible to deliver coaching-grade reasoning at the cost of a text message. The coaches who win the next decade won't be the ones who work harder. They'll be the ones with an operating system that works for them.",
      cards: [
        {
          number: "01",
          title: "GLP-1 changed the assignment.",
          body: "Sixty percent of new coaching clients arrive on a metabolic medication. Coaches now need to understand pharmacology, lab trends, and side-effect timelines — not just programming and macros."
        },
        {
          number: "02",
          title: "Wearables made the data ambient.",
          body: "Oura, WHOOP, Apple Watch, Dexcom, Levels — every client now generates more biometric data per day than a 2010 cardiologist saw per patient per year. Coaches don't need more data. They need a system that reads it for them."
        },
        {
          number: "03",
          title: "LLMs collapsed the coaching ratio.",
          body: "A well-tuned agent can draft a personalized check-in, flag a trend, and surface the right intervention in under a second. The 1:40 coach-to-client cap is a software problem now. We're solving it."
        }
      ]
    },

    howItWorks: {
      eyebrow: "THE PRODUCT",
      h2: "One operating system. Four moving parts.",
      lede: "Xenios sits between your clients' wearables, your knowledge, and the messages you'd send if you had infinite time.",
      steps: [
        {
          number: "01",
          name: "Ingest",
          title: "Connect every signal your client generates.",
          body: "Wearables, labs, food logs, training apps, calendars. Xenios pulls in every stream a client produces and normalizes it into one timeline you can read in ten seconds."
        },
        {
          number: "02",
          name: "Reason",
          title: "Your protocols. Our reasoning layer.",
          body: "You define the playbook — training principles, nutrition philosophy, the questions you always ask. Xenios's agents apply it to every client, every day, at scale, in your voice."
        },
        {
          number: "03",
          name: "Act",
          title: "Drafts every message you'd send. You approve.",
          body: "Daily check-ins, weekly summaries, \"you seemed off today\" nudges, program adjustments. Xenios drafts them. You review, edit, send — or set auto-send for clients you trust the system with."
        },
        {
          number: "04",
          name: "Compound",
          title: "Every interaction makes the next one sharper.",
          body: "Xenios remembers what worked for which client, what didn't, and what your best clients have in common. Your practice gets better the more you use it."
        }
      ]
    },

    features: [
      {
        eyebrow: "ROSTER",
        h3: "See every client at a glance. Know who needs you today.",
        body: "A single dashboard shows you every client's last 14 days at a glance — recovery, training adherence, mood, weight, glucose, anything you care about. Xenios surfaces the three clients who need you most today and tells you why.",
        bullets: [
          "Auto-sorted by \"needs attention\" score",
          "Color-coded trends for each metric you set",
          "One-click jump into a client's full timeline and agent thread",
          "Filter by program phase, life event, or custom tag"
        ]
      },
      {
        eyebrow: "AGENT",
        h3: "An AI co-pilot per client. In your voice. Always.",
        body: "Every client has a dedicated agent that knows their full history, your protocols, and the way you talk. It drafts every check-in, every program adjustment, every \"hey, I noticed your sleep dipped this week\" message — for you to review and send.",
        bullets: [
          "Trained on your written voice (upload past messages or coach in real-time)",
          "Knows every protocol document you've ever written",
          "Flags anything outside your scope (mental health, medical) for human-only response",
          "Auto-sends only with your explicit per-client permission"
        ]
      },
      {
        eyebrow: "PROTOCOLS",
        h3: "Your playbook, structured. Applied to everyone, instantly.",
        body: "Stop copy-pasting program templates. Define each protocol once — training, nutrition, recovery, supplementation, GLP-1 titration — and Xenios applies it to every client it fits, personalizes it to their data, and updates it as they progress.",
        bullets: [
          "Markdown-native — write protocols the way you already do",
          "Version control: every protocol has a history; you can A/B and compare",
          "Branching logic for life events (travel, injury, surgery, pregnancy, medication change)",
          "Shareable with team members (for multi-coach practices)"
        ]
      }
    ],

    audience: {
      eyebrow: "WHO IT'S FOR",
      h2: "Built for coaches. Felt by clients.",
      coaches: {
        title: "For coaches, trainers, and nutritionists.",
        body: "You spent ten years getting good. You're capped at 40 clients. You write the same check-in fifty times a week. Your DMs are a graveyard.\n\nXenios is your operating system. It runs the practice you'd run if you had a team of ten. Without hiring a team of ten.",
        cta: "Join the coach waitlist"
      },
      clients: {
        title: "For people working with a coach.",
        body: "You hired a coach because you wanted someone who knows you. You don't want an AI coach. You want your coach, available more often, paying closer attention.\n\nThat's what Xenios does for them. So you get more of them.",
        cta: "Tell your coach about Xenios"
      }
    },

    trust: {
      eyebrow: "TRUST",
      h2: "Built by operators who've shipped healthcare infrastructure before.",
      signals: [
        {
          headline: "$710M+",
          body: "in prior exits across the founding team — in healthcare infrastructure, payments, and document automation."
        },
        {
          headline: "2 prior healthcare exits",
          body: "including FinDox and InstaMed (acquired by JPMorgan Chase). The same playbook for trust, security, and clinical-grade reliability is being applied here."
        },
        {
          headline: "Now raising pre-seed.",
          body: "We're talking to a small, focused group of investors who understand AI infrastructure, healthcare distribution, and operator-coded products. If that's you, reach us at investors@xeniostechnology.com."
        }
      ],
      microcopy: "Customer testimonials and design partner logos coming as we onboard the first cohort in Q2 2026."
    },

    team: {
      eyebrow: "THE TEAM",
      h2: "A small team. A long résumé.",
      body: [
        "Xenios is being built in Austin, Texas, by a founding team whose previous companies have been acquired for a combined $710M+ across healthcare payments and document infrastructure — including FinDox and InstaMed.",
        "The team's prior experience spans clinical workflow software, payments infrastructure used by hundreds of thousands of providers, AI/ML engineering at scale, and operator roles inside high-growth healthcare startups.",
        "We're staying lean and heads-down until the product is in coaches' hands. No headshots yet. The work is the proof."
      ],
      cta: "See open roles"
    },

    finalCta: {
      h2Line1: "The next ten years of coaching get built now.",
      h2Line2: "Want a seat?",
      body: "We send occasional updates — what we're building, what we're learning, and what early access looks like. No spam. Unsubscribe anytime."
    }
  },

  manifesto: {
    title: "Put a coach in every client's pocket.",
    subhead: "The Xenios manifesto, 2026.",
    sections: [
      {
        heading: "The Problem",
        paragraphs: [
          "Forty.",
          "That's how many clients the average human coach can serve well. Push past that and something breaks — usually the client.",
          "The math has been the same for fifty years. A great coach can hold maybe forty people in their head: who's deloading, who's traveling, who just started a GLP-1, who slept three hours, who's about to quit. Past forty, the depth collapses into a group chat and a Notion doc.",
          "Meanwhile, the demand for coaching has never been higher.",
          "Six million Americans work with a paid health coach, trainer, or nutritionist today. Tens of millions more should be — but can't, because there aren't enough coaches, and the ones who exist can't take more clients.",
          "Coaching, as a profession, has been priced like therapy and scaled like a barbershop. Brilliant practitioners stuck running tiny businesses. Clients who could be transformed left scrolling through TikTok for advice.",
          "This is the problem."
        ]
      },
      {
        heading: "The Mission",
        paragraphs: [
          "We are building an operating system for coaches.",
          "Not an AI coach. Not a chatbot that replaces them. The opposite — an AI-native software stack that lets one excellent human coach run a practice of hundreds without losing the depth of one-on-one care.",
          "The agent reads the wearable data. The agent drafts the check-in. The agent flags the client who slept four hours and skipped breakfast and probably needs a phone call today. The agent remembers everything the coach has ever said about anyone.",
          "The coach makes the calls. The coach holds the relationship. The coach is the brand.",
          "The agent does the work of the team the coach has never been able to afford."
        ]
      },
      {
        heading: "The Why Now",
        paragraphs: [
          "Three things have changed in the last twenty-four months.",
          "GLP-1s changed the assignment. Sixty percent of new clients arrive on a metabolic medication. Coaches now need to understand pharmacology, lab trends, side-effect timelines, and titration schedules. The job got harder.",
          "Wearables made every body legible. Continuous glucose, continuous heart rate, sleep staging, recovery scores, menstrual phase, training load. Every client now produces more biometric data per day than a 2010 cardiologist saw per patient per year. The signal got louder.",
          "And LLMs finally made it cheap to read it all. A well-tuned reasoning model can hold a client's full history in context, apply a coach's protocol, and draft a personalized response — for less than the cost of an SMS. The tool got real.",
          "Pick any two. The third arrives soon. All three at once, right now, for the first time. This is the window. It will close."
        ]
      },
      {
        heading: "The Vision",
        paragraphs: [
          "In ten years, every serious coach will work this way.",
          "They will start their day with a roster view that tells them which three clients need them today and why. They will spend the rest of the day on the phone, in person, or in a high-touch message — being a coach, doing the part of the job no software can do.",
          "Every check-in their clients receive will read like the coach wrote it themselves. Most of them won't have been written by the coach personally. They will all have been written by an agent the coach trained, in the coach's voice, with the coach's protocols, on the coach's data — and approved by the coach before sending. That distinction will matter to a few purists in 2026 and to no one by 2030.",
          "The result: the same human coach you would have hired in 2024 will, in 2030, run a hundred-client practice with the depth of a forty-client practice. Their revenue triples. Their burnout drops. The number of people in the world who get to work with a real coach goes from six million to sixty million.",
          "This is what we mean by \"put a coach in every client's pocket.\"",
          "Not an AI in every client's pocket.",
          "A real coach. Amplified."
        ]
      },
      {
        heading: "The Goal",
        paragraphs: [
          "Sixty million people working with a coach by 2035.",
          "One coach per hundred clients, at the depth of one per forty.",
          "Zero coaches lost to burnout because the software wouldn't let them scale.",
          "Every person on a GLP-1 with a coach who actually knows what to do. Every person with a wearable who has someone reading it. Every coach with a real business instead of a glorified hobby.",
          "That's the goal."
        ]
      },
      {
        heading: "Join Us",
        paragraphs: [
          "This is not a tracking app. Not a wellness app. Not a chatbot. Not an AI coach.",
          "This is the software the next generation of coaches will run their practice on.",
          "If you're a coach who feels capped — join the waitlist. We're choosing twenty design-partner practices for our Q2 2026 private beta.",
          "If you're a client who wishes your coach had more of themselves to give — tell them about us.",
          "If you're an investor, an engineer, or a designer who wants to build this with us — find the right link in this site and reach out.",
          "The next ten years of coaching get built now.",
          "We'd like you in.",
          "— The Xenios team"
        ]
      }
    ]
  },

  about: {
    h1: "A small team. A long résumé.",
    lede: "We've shipped infrastructure software that handles millions of healthcare interactions a day. We're doing it again. This time for the people who actually move human health forward — coaches.",
    sections: [
      {
        heading: "The Background",
        paragraphs: [
          "Xenios Technologies, Inc. is being built in Austin, Texas by a founding team whose prior companies have been acquired for a combined $710M+ in the healthcare infrastructure space — including FinDox and InstaMed (acquired by JPMorgan Chase in 2019)."
        ],
        bullets: [
          "Clinical and healthcare payments infrastructure used by hundreds of thousands of U.S. providers",
          "Document-automation software embedded in clinical and financial workflows",
          "Applied AI and machine learning at production scale",
          "Operator roles inside multiple high-growth healthcare and fintech startups",
          "Coaching, performance training, and metabolic-health practice (as both operators and clients)"
        ],
        outro: "The thesis driving Xenios — that one excellent coach should be able to serve hundreds of clients with one-on-one depth, and that AI-native infrastructure is the missing piece — comes directly from that résumé."
      },
      {
        heading: "Why We're Stealth-ish",
        paragraphs: [
          "We've chosen to keep the team behind the wordmark, for now.",
          "Two reasons.",
          "First: the product matters more than the founders. When the private beta opens in Q2 2026, the proof will be the practices we run on Xenios — not the LinkedIn profiles of the people building it.",
          "Second: healthcare is full of demo-ware and AI-flavored marketing. We'd rather show up with a working operating system in twenty coaching practices than a press release.",
          "If you need to know who's behind this — to invest, to partner, to join — write to us. We'll talk directly."
        ]
      },
      {
        heading: "Where We Are",
        paragraphs: [
          "Austin, Texas.",
          "We're hiring on the ground here. The careers page is the best place to start. Investors, design-partner coaches, and journalists can reach us at the addresses below."
        ],
        emails: [
          "investors@xeniostechnology.com",
          "press@xeniostechnology.com",
          "hello@xeniostechnology.com",
          "careers@xeniostechnology.com"
        ]
      }
    ],
    cta: { title: "Want to help build this?", button: "See open roles" }
  },

  faq: {
    h1: "Frequently asked.",
    subhead: "If you have a question we haven't answered, email hello@xeniostechnology.com.",
    items: [
      {
        q: "What is Xenios?",
        a: "Xenios is an AI-native operating system for health coaches, trainers, nutritionists, and performance specialists. It connects every signal a client generates — wearables, labs, food logs, training apps, calendars — and gives the coach a single dashboard, an AI agent per client trained in the coach's voice, and a protocol library that scales their best work across their entire roster."
      },
      {
        q: "When does it launch?",
        a: "We're targeting a private beta with ~20 design-partner coaching practices in Q2 2026. Public launch follows once the beta cohort is producing measurable client outcomes. The waitlist is how we choose who gets in first."
      },
      {
        q: "Who is Xenios for?",
        a: "Primarily: coaches, trainers, nutritionists, performance staff, and small coaching practices (1–10 coaches) who already have a working business and feel capped by the 1:40 ratio. Secondarily: solo practitioners adding their first AI tool, and larger coaching companies that need infrastructure rather than another point solution. It is not (yet) a direct-to-consumer app. Clients interact with their coach through Xenios — they don't sign up for Xenios."
      },
      {
        q: "How is this different from Trainerize, TrueCoach, or Future?",
        a: "Trainerize and TrueCoach are workflow tools — calendar, programming, messaging, billing. They are excellent at the things they do. They were also designed before LLMs were useful. They do not reason about a client's data, draft messages in the coach's voice, or flag the three clients who need attention today. Future is the opposite trade — a great human coach delivered through an app, but priced and staffed at the same 1:40 ratio every other coaching company is stuck at. Xenios is the missing layer: the AI-native operating system that sits underneath the workflow tools and lets one human coach do the work of a team."
      },
      {
        q: "Will Xenios replace coaches?",
        a: "No. The whole company is built on the opposite bet. The thing we believe is that the relationship a great coach has with a client is the most valuable thing in the entire stack — and the part AI is worst at. The pieces AI is good at — reading wearable data, drafting consistent check-ins, remembering everything, applying a protocol across a roster — are the pieces that currently burn coaches out and cap their practice at forty clients. Xenios automates those. It does not replace the coach. It removes everything getting between the coach and being a coach."
      },
      {
        q: "What about HIPAA?",
        a: "We are building Xenios HIPAA-ready from day one. Encryption at rest and in transit, audited access logs, business associate agreements available for any practice that needs one, and a security & compliance page at /security with the specifics. For coaches working with clinical clients (e.g., a coach embedded in a longevity clinic), Xenios is being designed to meet the standard a covered entity would expect."
      },
      {
        q: "How much will it cost?",
        a: "Pricing for the private beta will be set with our design-partner cohort. Public launch pricing will be designed for solo coaches and small practices first, with team and enterprise tiers as we scale. We'll publish a pricing page when public launch opens."
      },
      {
        q: "How does the waitlist work?",
        a: "You join. We send occasional updates. Closer to private beta, we pick ~20 coaching practices to onboard first — chosen for diversity of client type, willingness to give feedback, and whether their practice represents a use case we want to learn from. Everyone else gets early-access invitations as we scale."
      },
      {
        q: "Are you raising? Can I invest?",
        a: "Yes — Xenios is raising a pre-seed round right now. If you invest at this stage in AI-native vertical software, healthcare infrastructure, or coaching/creator-economy tools, write to investors@xeniostechnology.com with a sentence about your fund and we'll get back to you fast."
      },
      {
        q: "Where are you based?",
        a: "Austin, Texas. We're hiring engineers and designers who want to be there with us. See /careers."
      },
      {
        q: "Why are there no team names on the site?",
        a: "Because we're heads-down building. The team has a combined $710M+ in prior healthcare-infrastructure exits — including FinDox and InstaMed — and we will say more about who we are when the product is in coaches' hands. Until then: the work is the proof. If you need to know who's behind this for an investment, partnership, or hire decision, email us and we'll talk directly."
      },
      {
        q: "Can I reach a human?",
        a: "Yes. hello@xeniostechnology.com gets to a founder. We answer every email."
      }
    ]
  },

  security: {
    h1: "We're treating client health data the way we'd want ours treated.",
    intro: "Xenios is being built HIPAA-ready from day one. We have not yet operated long enough to claim a SOC 2 Type II report or a multi-year audit trail — but the foundational practices are in place and the third-party attestation work begins ahead of the private beta in Q2 2026.",
    today: {
      title: "What we do today",
      items: [
        "All data encrypted in transit (TLS 1.2+) and at rest (AES-256).",
        "Strict role-based access control. No engineer touches production client data without a logged audit event.",
        "Health data segregated from operational data.",
        "Vendors who process protected health information are required to sign a BAA before integration.",
        "For coaching practices that need a BAA with us, we can sign one — write to security@xeniostechnology.com."
      ]
    },
    coming: {
      title: "What's coming",
      items: [
        "SOC 2 Type I attestation ahead of public launch.",
        "Penetration testing by an independent firm in advance of private beta.",
        "Public bug bounty.",
        "Full transparency report on data residency, retention, and deletion practices."
      ]
    },
    promises: [
      "We'll never sell client data.",
      "We'll never train shared models on identifiable client data.",
      "We'll never use a client's information to advertise to them, their coach, or anyone else.",
      "If a coach leaves Xenios, they take a clean export of their roster, protocols, and message history with them."
    ]
  },

  terms: {
    h1: "Terms of Service",
    lede: "Effective May 2026. These terms govern your use of xeniostechnology.com and any Xenios products you access. If you are using Xenios on behalf of a coaching practice or organization, you confirm you have authority to bind that organization to these terms.",
    note: "These terms are a v1 draft and will be revised by counsel before private beta launch. For questions, write to hello@xeniostechnology.com."
  },

  privacy: {
    h1: "Privacy Policy",
    lede: "Effective May 2026. This policy describes what data Xenios Technologies, Inc. collects, how we use it, who we share it with (a short list), and how you can request access, correction, or deletion.",
    sections: [
      {
        heading: "What we collect",
        body: "Marketing site: only your email address and the role you select when you join the waitlist, plus optional notes you choose to share. We use minimal, privacy-respecting analytics with no advertising trackers."
      },
      {
        heading: "How we use it",
        body: "To send you occasional product updates, respond to your inquiries, and decide who to invite into the private beta. We don't sell, share, or rent your information to anyone, ever."
      },
      {
        heading: "Your rights",
        body: "California (CCPA/CPRA), Virginia (VCDPA), and Colorado (CPA) residents have the right to access, correct, or delete the information we hold about them. To exercise these rights, email hello@xeniostechnology.com."
      },
      {
        heading: "HIPAA",
        body: "The marketing site is not subject to HIPAA. The Xenios product (when it launches) will be built HIPAA-ready — see /security for details."
      },
      {
        heading: "Accessibility",
        body: "We target WCAG 2.2 AA on every page of this site. If you encounter an accessibility barrier, please email hello@xeniostechnology.com so we can fix it."
      }
    ],
    note: "This policy is a v1 draft and will be revised by counsel before private beta launch."
  },

  careers: {
    h1: "Help us build it.",
    lede: "We're hiring a small founding team in Austin, Texas. If you've ever wanted to ship something where every line of code, every pixel, and every interaction with a coach materially changes the shape of an industry — this is that.",
    howWeHire: {
      title: "How we hire",
      body: "We move fast and we read every application. Email the role you're interested in to careers@xeniostechnology.com with three things: a one-paragraph note on why this, links to one or two pieces of work you're proudest of, and your résumé or LinkedIn. We respond inside 72 hours.",
      footnote: "We are hiring in-person in Austin, TX. We sponsor relocation for the right person. We do not currently sponsor visas."
    },
    roles: [
      {
        title: "Founding Senior Software Engineer",
        meta: "Full-time · Austin, TX (on-site)",
        body: "You'll be one of the first engineers building the Xenios platform end-to-end — from the agent reasoning layer, to the data ingestion pipelines connecting Oura/WHOOP/Apple Health/Dexcom/Levels, to the coach-facing dashboard, to the messaging infrastructure that delivers an LLM-drafted check-in to a client's iMessage.",
        looking: "We're looking for: 5+ years shipping production software, fluency in modern TypeScript and Python, comfort with LLM tooling (Anthropic, OpenAI, agent frameworks), and the kind of engineer who reads a product spec and immediately starts asking the right questions about edge cases and abuse vectors.",
        bonus: "Bonus: prior experience in healthcare, fintech, or any regulated-data environment. Prior experience working closely with a designer and founder. Prior experience being the second or third engineer at a company.",
        cta: "Apply: careers@xeniostechnology.com"
      },
      {
        title: "Founding UI/UX Designer",
        meta: "Full-time · Austin, TX (on-site)",
        body: "You will own the Xenios product surface end-to-end — the coach's dashboard, the agent threads, the protocol studio, the client-facing messages, and every onboarding flow in between. The product needs to feel like a tool, not a chatbot. Like something an operator earns the right to use, not something marketed at them.",
        looking: "We're looking for: a designer who has shipped real product (not portfolio decks), strong opinions about information density, type, and motion, fluency in Figma + at least one prototyping tool, and an instinct for how operators actually work day-to-day.",
        bonus: "Bonus: prior experience in B2B software, healthcare, fintech, or coaching/creator tools. A point of view on the difference between an \"AI feature\" and an \"AI-native product.\"",
        cta: "Apply: careers@xeniostechnology.com"
      },
      {
        title: "Fractional CTO / Technical Advisor",
        meta: "Part-time · Remote-friendly with quarterly Austin visits",
        body: "For the right operator — someone who has built and scaled engineering teams inside a healthcare or AI infrastructure company — we're open to a fractional CTO or senior technical advisor relationship for the first 12 months.",
        looking: "We're looking for: prior CTO or VP Engineering experience at a company that shipped real product in regulated software, a network we can pull from for early hires, and the judgment to keep us out of architecture mistakes we'd otherwise spend a year unwinding.",
        bonus: "This role includes meaningful equity, a clear time commitment, and direct collaboration with the founding team.",
        cta: "Inquire: careers@xeniostechnology.com"
      }
    ],
    bottomCta: {
      body: "Don't see your role? If you'd be a great fit for Xenios in a role that's not listed, write to us. We make exceptions for exceptional people.",
      cta: "careers@xeniostechnology.com"
    }
  },

  waitlistPage: {
    h1: "Save your spot.",
    subhead: "We'll send the occasional update — what we're building, what we're learning, and what early access looks like. That's it.",
    successTitle: "You're in.",
    successBody: "We'll be in touch as we get closer to opening the beta. In the meantime, the manifesto is the best way to know what we're doing and why.",
    successCta: "Read the manifesto"
  },

  waitlistForm: {
    roleOptions: [
      "Coach, trainer, or nutritionist",
      "Performance specialist (sports / physio / clinical)",
      "Client of a coach",
      "Healthcare provider",
      "Investor",
      "Press / writer",
      "Engineer or designer",
      "Other"
    ],
    activeClientsOptions: [
      "I'm not a coach",
      "1–10",
      "11–25",
      "26–50",
      "51–100",
      "100+"
    ],
    submit: "Save my spot",
    microcopy: "By submitting, you agree to receive occasional email updates from Xenios Technologies. We don't sell, share, or rent your information to anyone. Ever.",
    placeholders: {
      email: "you@yourdomain.com",
      role: "Select an option",
      clients: "Select…",
      notes: "Your practice, your stack, what you'd want this to do for you, or who we should be talking to."
    }
  }
};
