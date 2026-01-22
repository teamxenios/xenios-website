import { ShieldCheck, Zap, Brain, Activity, Heart } from "lucide-react";

export const content = {
  hero: {
    title: {
      line1: "PREDICT",
      line2: "PREVENT",
      line3: "PROSPER."
    },
    subtitle: "The first proactive health platform that doesn't just track your data—it understands it.",
    cta: "Start your journey",
    features: [
      {
        icon: Activity,
        title: "Real-time Analysis",
        text: "Continuous monitoring of 50+ biomarkers with clinical-grade accuracy."
      },
      {
        icon: Heart,
        title: "Holistic Context",
        text: "We correlate sleep, movement, and nutrition to give you the full picture."
      },
      {
        icon: Zap,
        title: "Actionable Insights",
        text: "Don't just see the data. Know exactly what to do with it, every single day."
      },
      {
        icon: Brain,
        title: "Cognitive Load",
        text: "Measure mental fatigue and optimize your workday for peak performance."
      }
    ]
  },
  
  nav: {
    links: [
      { id: "included", label: "What's Included" },
      { id: "conditions", label: "Conditions" },
      { id: "foryou", label: "For You" },
      { id: "forpros", label: "For Pros" },
      { id: "faq", label: "FAQ" }
    ],
    cta: "Join Waitlist"
  },

  ticker: [
    { label: "Sleep Quality", value: "85", unit: "%", desc: "Deep sleep cycles optimized" },
    { label: "HRV", value: "112", unit: "ms", desc: "Recovery index peak" },
    { label: "Glucose", value: "98", unit: "mg/dL", desc: "Stable post-meal response" },
    { label: "VO2 Max", value: "54", unit: "mL", desc: "Cardiovascular efficiency" },
    { label: "Resting HR", value: "48", unit: "bpm", desc: "Athlete-level conditioning" },
    { label: "SpO2", value: "99", unit: "%", desc: "Oxygen saturation optimal" },
    { label: "Stress", value: "Low", unit: "lvl", desc: "Cortisol levels balanced" },
    { label: "Sleep Quality", value: "85", unit: "%", desc: "Deep sleep cycles optimized" },
    { label: "HRV", value: "112", unit: "ms", desc: "Recovery index peak" },
    { label: "Glucose", value: "98", unit: "mg/dL", desc: "Stable post-meal response" },
    { label: "VO2 Max", value: "54", unit: "mL", desc: "Cardiovascular efficiency" }
  ],

  valueProps: {
    headline: "Intelligence,",
    headlineAccent: "encoded.",
    description: "We've condensed a medical lab into a seamless digital experience.",
    items: [
      {
        icon: ShieldCheck,
        title: "Clinical Accuracy",
        desc: "Validated against gold-standard medical equipment for reliable data you can trust."
      },
      {
        icon: Zap,
        title: "Instant Feedback",
        desc: "Latency-free processing means you know your body's status the moment it changes."
      },
      {
        icon: Brain,
        title: "AI Interpretation",
        desc: "Our neural engine contextualizes data points to explain 'why' not just 'what'."
      },
      {
        icon: Activity,
        title: "Trend Forecasting",
        desc: "Predictive modeling helps you anticipate health dips before they become problems."
      }
    ]
  },

  whatIf: {
    headline: "What if health was...",
    points: [
      { title: "Proactive, not reactive", desc: "Stop waiting for symptoms to appear." },
      { title: "Continuous, not episodic", desc: "Health happens 24/7, not just at the doctor's office." },
      { title: "Personalized, not generic", desc: "Guidelines based on your biology, not population averages." },
      { title: "Transparent, not obscure", desc: "Own your data. Understand your metrics." },
      { title: "Empowering, not intimidating", desc: "Tools that make you the expert on you." }
    ]
  },

  dashboard: {
    headline: "Your body, mapped.",
    description: "A command center for your biology. Visualize complex metrics with elegant simplicity."
  },

  features: [
    {
      title: "Metabolic Flexibility",
      desc: "Train your metabolism to switch efficiently between fuel sources. Our nutrition engine adapts to your daily activity.",
      image: "/feature-geo-1.png",
      align: "left"
    },
    {
      title: "Circadian Synchronization",
      desc: "Align your lifestyle with your internal clock. Get personalized recommendations for light exposure, sleep, and meal timing.",
      image: "/feature-geo-2.png",
      align: "right"
    }
  ],

  conditions: {
    headline: "Conditions we track.",
    categories: [
      {
        category: "Metabolic",
        items: ["Insulin Resistance", "Pre-diabetes", "Obesity", "Metabolic Syndrome"]
      },
      {
        category: "Cardiovascular",
        items: ["Hypertension", "Arrhythmia Monitoring", "HRV Optimization", "Endurance Training"]
      },
      {
        category: "Hormonal",
        items: ["Cortisol Management", "Thyroid Health", "Cycle Tracking", "Testosterone Optimization"]
      },
      {
        category: "Cognitive",
        items: ["Focus & Attention", "Sleep Architecture", "Stress Resilience", "Mental Clarity"]
      }
    ]
  },

  audience: {
    personal: {
      label: "Personal",
      headline: "Optimize Yourself",
      description: "For biohackers, athletes, and anyone wanting to master their biology.",
      features: [
        "Daily Readiness Score",
        "Sleep Stage Analysis",
        "Nutrition Logging",
        "Stress Management",
        "Community Challenges"
      ]
    },
    professional: {
      label: "Professional",
      headline: "Empower Teams",
      description: "For coaches, trainers, and organizations managing high-performance rosters.",
      features: [
        "Coach Dashboard Access",
        "Team Aggregate Data",
        "Injury Risk Prediction",
        "Training Load Management",
        "API Export Capabilities"
      ]
    }
  },

  timeline: [
    {
      number: "01",
      title: "Within Minutes",
      items: ["• Connect your devices", "• Baseline establishment", "• Initial metabolic reading"]
    },
    {
      number: "02",
      title: "Within Days",
      items: ["• Pattern recognition", "• Sleep cycle analysis", "• Stress trigger identification"]
    },
    {
      number: "03",
      title: "Within Months",
      items: ["• Long-term trend forecasting", "• Lifestyle adaptation", "• Validated health improvement"]
    }
  ],

  faq: {
    headline: "Frequently Asked.",
    description: "Can't find the answer you're looking for? Reach out to our support team.",
    items: [
      { question: "What devices are compatible?", answer: "We support Oura, Whoop, Apple Watch, Garmin, and most major continuous glucose monitors (CGMs)." },
      { question: "Is my health data private?", answer: "Your data is encrypted end-to-end and stored in HIPAA-compliant vaults. We never sell your data to third parties." },
      { question: "Do I need a doctor's prescription?", answer: "No. Our platform is a wellness tool. However, we can generate reports to share with your healthcare provider." },
      { question: "How accurate are the biomarkers?", answer: "We only ingest data from clinically validated sensors. Our algorithms filter out noise to provide high-confidence metrics." },
      { question: "Can I use this for my family?", answer: "Yes, we offer family plans that allow you to manage multiple profiles under one billing account." },
      { question: "What is the battery impact on my phone?", answer: "Minimal. We use background fetch technologies that are optimized for efficiency." },
      { question: "Is there a contract?", answer: "No. You can cancel your subscription at any time with no penalties." },
      { question: "Do you offer coaching?", answer: "Yes, the Pro plan includes monthly sessions with a certified metabolic health coach." },
      { question: "Does it work with Android?", answer: "Yes, our Android app is fully featured and supports Google Fit integration." },
      { question: "How do I interpret the recovery score?", answer: "The recovery score aggregates HRV, sleep, and resting heart rate to give you a daily capacity percentage." }
    ]
  },

  footer: {
    tagline: "The operating system for high-performance biology. Designed in Zürich, Switzerland.",
    columns: {
      platform: {
        title: "Platform",
        links: ["Features", "Science", "Integrations", "Pricing"]
      },
      company: {
        title: "Company",
        links: ["About", "Careers", "Blog", "Contact"]
      }
    },
    bottom: {
      copyright: "© 2026 Mono Inc. All rights reserved.",
      legal: ["Privacy Policy", "Terms of Service"],
      social: ["TW", "IG", "LI"]
    }
  }
};
