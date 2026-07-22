// Shop by Goal: editorial navigation copy (presentation data, allowed in
// production). These entries describe how a member can THINK about a goal.
// They are not server facts, not product claims, and not medical guidance.
// Product rows on the detail page come only from the real gated catalog;
// this file names supplement CATEGORIES only, never products or doses.

import type { Product, ProductCategory } from "@shared/research/types";

export interface ResearchGoal {
  slug: string;
  name: string;
  /** One calm sentence describing the goal in plain language. */
  plainLanguageGoal: string;
  /** The non-negotiable daily foundation, before any product enters the picture. */
  lifestyleFoundation: string[];
  fitnessConsiderations: string[];
  nutritionConsiderations: string[];
  /** Supplement category NAMES only. No products, no doses, no claims. */
  supplementCategories: string[];
  /** One honest sentence. xenios does not promise outcomes. */
  whatXeniosDoesNotPromise: string;
  /** Topics a member can look for in the Guides library. */
  relatedGuideTopics: string[];
  /** Hints used to match REAL catalog products by tag or category. */
  productMatch: {
    categories?: ProductCategory[];
    tags: string[];
  };
}

export const RESEARCH_GOALS: ResearchGoal[] = [
  {
    slug: "get-leaner",
    name: "Get Leaner",
    plainLanguageGoal:
      "Carry less body fat while keeping the muscle you have, at a pace your life can actually sustain.",
    lifestyleFoundation: [
      "A consistent sleep schedule, because short sleep reliably makes appetite harder to manage.",
      "Daily walking or other easy movement outside of formal training.",
      "A honest food log for at least a couple of weeks, so decisions rest on real data.",
      "Stress management, since chronic stress often shows up as unplanned eating.",
    ],
    fitnessConsiderations: [
      "Resistance training two to four times per week to signal the body to keep muscle.",
      "A modest amount of cardio you enjoy enough to repeat, rather than punishing sessions you quit.",
      "Progress measured over weeks and months, not day-to-day scale readings.",
    ],
    nutritionConsiderations: [
      "A moderate calorie deficit rather than an aggressive one, so training quality holds.",
      "Protein at every meal to support satiety and muscle retention.",
      "Mostly whole foods, with room left for foods you genuinely like.",
    ],
    supplementCategories: [
      "Protein support",
      "Electrolytes and hydration",
      "Metabolic support",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise a rate of fat loss or a body composition result, and nothing here diagnoses or treats any condition.",
    relatedGuideTopics: [
      "Setting a sustainable calorie deficit",
      "Protein basics",
      "Walking as a fat loss tool",
      "Tracking progress beyond the scale",
    ],
    productMatch: {
      tags: ["fat loss", "fat-loss", "lean", "metabolic", "metabolism", "weight", "body composition"],
    },
  },
  {
    slug: "build-muscle",
    name: "Build Muscle",
    plainLanguageGoal:
      "Add muscle and strength gradually, with training and recovery doing most of the work.",
    lifestyleFoundation: [
      "Seven to nine hours of sleep, because muscle is built between sessions, not during them.",
      "A repeatable weekly training schedule you can protect.",
      "Patience measured in months, since muscle accrues slowly for everyone.",
    ],
    fitnessConsiderations: [
      "Progressive overload: small, tracked increases in load or reps over time.",
      "Coverage of the major movement patterns each week rather than isolated body parts only.",
      "Deliberate easier weeks when recovery lags, instead of pushing through fatigue.",
    ],
    nutritionConsiderations: [
      "Enough total food; building muscle in a large deficit is very difficult.",
      "Sufficient daily protein spread across meals.",
      "Carbohydrate around training to support session quality.",
    ],
    supplementCategories: [
      "Protein support",
      "Creatine",
      "Recovery support",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise a specific amount of muscle gain or strength, and no product on this platform replaces training and food.",
    relatedGuideTopics: [
      "Progressive overload explained",
      "How much protein you actually need",
      "Programming a training week",
    ],
    productMatch: {
      tags: ["muscle", "strength", "hypertrophy", "performance", "creatine", "protein"],
    },
  },
  {
    slug: "recover-faster",
    name: "Recover Faster",
    plainLanguageGoal:
      "Bounce back between sessions and hard days so training stays consistent instead of stalling.",
    lifestyleFoundation: [
      "Sleep treated as the primary recovery tool, protected before anything else.",
      "Genuine rest days without guilt.",
      "Simple stress hygiene, since mental load slows physical recovery too.",
    ],
    fitnessConsiderations: [
      "Managing weekly training volume so hard days are followed by easier ones.",
      "Low intensity movement, such as walking or easy cycling, on recovery days.",
      "Listening to persistent soreness or declining performance as a signal to ease off.",
    ],
    nutritionConsiderations: [
      "Eating enough overall, because under-fueling is a common hidden recovery problem.",
      "Protein and carbohydrate in the hours after training.",
      "Steady hydration through the day rather than catching up at night.",
    ],
    supplementCategories: [
      "Recovery support",
      "Electrolytes and hydration",
      "Magnesium",
      "Omega 3 fatty acids",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise faster healing or injury recovery, and persistent pain belongs with a qualified clinician, not a product page.",
    relatedGuideTopics: [
      "Reading your own recovery signals",
      "Deload weeks",
      "Sleep and training adaptation",
    ],
    productMatch: {
      tags: ["recovery", "repair", "soreness", "inflammation", "magnesium", "omega"],
    },
  },
  {
    slug: "sleep-better",
    name: "Sleep Better",
    plainLanguageGoal:
      "Fall asleep more easily and wake feeling rested, by fixing the routine before reaching for anything else.",
    lifestyleFoundation: [
      "A consistent bedtime and wake time, including weekends.",
      "A dark, cool, quiet bedroom.",
      "Screens and bright light wound down in the last hour of the day.",
      "Caffeine finished by early afternoon.",
    ],
    fitnessConsiderations: [
      "Regular daytime exercise, which reliably supports sleep quality.",
      "Very intense training kept away from the final hours before bed when possible.",
      "Morning daylight exposure to anchor the body clock.",
    ],
    nutritionConsiderations: [
      "Alcohol treated honestly, since it fragments sleep even when it helps you doze off.",
      "Heavy meals finished a few hours before bed.",
      "A consistent eating schedule that supports a consistent sleep schedule.",
    ],
    supplementCategories: [
      "Sleep support",
      "Magnesium",
      "Relaxation and calm support",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise better sleep, and ongoing insomnia or suspected sleep apnea should be raised with a clinician.",
    relatedGuideTopics: [
      "Building a wind-down routine",
      "Caffeine timing",
      "Light exposure and the body clock",
    ],
    productMatch: {
      tags: ["sleep", "rest", "calm", "relaxation", "magnesium", "circadian"],
    },
  },
  {
    slug: "think-sharper",
    name: "Think Sharper",
    plainLanguageGoal:
      "Protect focus and mental clarity through the habits that carry most of the load: sleep, movement, and attention hygiene.",
    lifestyleFoundation: [
      "Sleep first, because no focus tool outperforms a rested brain.",
      "Blocks of uninterrupted work with notifications actually off.",
      "Regular breaks and daylight during the day.",
    ],
    fitnessConsiderations: [
      "Regular aerobic exercise, one of the best-supported habits for cognitive health.",
      "Movement breaks during long sedentary stretches.",
      "Strength training as part of the overall picture, not a separate concern.",
    ],
    nutritionConsiderations: [
      "Steady meals instead of long fasts followed by heavy ones, if focus dips are a problem.",
      "Hydration, since even mild dehydration dulls concentration.",
      "Caffeine used deliberately rather than continuously.",
    ],
    supplementCategories: [
      "Cognitive support",
      "Omega 3 fatty acids",
      "Energy and focus support",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise improved memory, intelligence, or focus, and cognitive concerns deserve a clinician rather than a supplement aisle.",
    relatedGuideTopics: [
      "Deep work basics",
      "Caffeine and focus",
      "Exercise and the brain",
    ],
    productMatch: {
      tags: ["cognitive", "cognition", "focus", "brain", "nootropic", "clarity", "memory"],
    },
  },
  {
    slug: "feel-more-energized",
    name: "Feel More Energized",
    plainLanguageGoal:
      "Have steadier energy through the day by finding what is draining it, instead of only adding stimulants.",
    lifestyleFoundation: [
      "Enough sleep on a consistent schedule, the most common missing piece.",
      "Daily movement, since inactivity itself lowers energy.",
      "A honest look at stress, workload, and screen time in the evening.",
    ],
    fitnessConsiderations: [
      "Regular moderate exercise, which raises baseline energy for most people.",
      "Avoiding a pattern of only all-out sessions that leave you drained.",
      "Short walks as a genuine mid-day energy tool.",
    ],
    nutritionConsiderations: [
      "Eating enough; chronic under-eating is a frequent cause of persistent fatigue.",
      "Balanced meals that avoid large blood sugar swings.",
      "Caffeine as a tool with a cutoff time, not an all-day drip.",
    ],
    supplementCategories: [
      "Energy and focus support",
      "B vitamins",
      "Electrolytes and hydration",
      "Iron status support",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise more energy, and unexplained persistent fatigue is a reason to see a clinician, not to buy more products.",
    relatedGuideTopics: [
      "Finding your energy leaks",
      "Blood sugar and meal timing",
      "When fatigue needs a doctor",
    ],
    productMatch: {
      tags: ["energy", "fatigue", "vitality", "mitochondria", "b12", "iron", "electrolyte"],
    },
  },
  {
    slug: "age-better",
    name: "Age Better",
    plainLanguageGoal:
      "Stay strong, mobile, and independent for as long as possible, with habits that compound over decades.",
    lifestyleFoundation: [
      "Strength training kept in your life permanently, since muscle and bone respond at every age.",
      "Sleep, social connection, and purpose treated as health inputs, because they are.",
      "Regular checkups and screenings with your own clinician.",
    ],
    fitnessConsiderations: [
      "Resistance training for muscle and bone, the foundation of physical aging well.",
      "Cardiovascular work across easy and harder intensities.",
      "Balance and mobility practice before it becomes urgent.",
    ],
    nutritionConsiderations: [
      "Adequate protein, which tends to become more important with age, not less.",
      "A mostly whole-food pattern you can hold for years.",
      "Alcohol kept modest.",
    ],
    supplementCategories: [
      "Longevity research compounds",
      "Omega 3 fatty acids",
      "Vitamin D",
      "Protein support",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise a longer life or slower aging, and no compound on this platform is a substitute for the fundamentals or for medical care.",
    relatedGuideTopics: [
      "Strength training after forty",
      "Protein needs across the lifespan",
      "The longevity evidence, honestly read",
    ],
    productMatch: {
      tags: ["longevity", "aging", "healthspan", "nad", "cellular", "vitamin d", "omega"],
    },
  },
  {
    slug: "look-better",
    name: "Look Better",
    plainLanguageGoal:
      "Support skin, hair, and overall appearance from the inside, on top of the training and sleep that do most of the work.",
    lifestyleFoundation: [
      "Sleep, the most visible daily habit in the mirror.",
      "Sun protection, the single best-supported skin habit.",
      "Not smoking, and keeping alcohol modest.",
    ],
    fitnessConsiderations: [
      "Resistance training, which changes shape more than any scale number does.",
      "Consistency over intensity; appearance follows months of ordinary sessions.",
      "Posture work, an underrated part of how you carry yourself.",
    ],
    nutritionConsiderations: [
      "Enough protein, which skin and hair are built from.",
      "Plenty of water and produce.",
      "Avoiding chronic crash dieting, which shows up in skin and hair over time.",
    ],
    supplementCategories: [
      "Skin and beauty support",
      "Collagen support",
      "Hydration support",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise visible cosmetic results, and skin conditions belong with a dermatologist rather than a product page.",
    relatedGuideTopics: [
      "Skin basics that are actually supported",
      "Training for shape",
      "Hydration and appearance",
    ],
    productMatch: {
      tags: ["skin", "beauty", "collagen", "hair", "glow", "aesthetic"],
    },
  },
  {
    slug: "gut-and-immune-health",
    name: "Gut and Immune Health",
    plainLanguageGoal:
      "Support digestion and everyday resilience through diet, sleep, and stress, the levers with the strongest evidence.",
    lifestyleFoundation: [
      "Sleep, one of the most reliable inputs to immune function.",
      "Stress management, since the gut responds quickly to chronic stress.",
      "Regular movement and time outdoors.",
      "Basic hygiene and staying current with your own clinician's advice.",
    ],
    fitnessConsiderations: [
      "Moderate regular exercise, which supports immune resilience.",
      "Avoiding sustained overtraining, which can work in the other direction.",
      "Easy movement, like walking after meals, as a digestion aid.",
    ],
    nutritionConsiderations: [
      "Fiber from a wide variety of plants, the best-supported gut habit.",
      "Fermented foods if you tolerate them well.",
      "Noticing personal trigger foods honestly instead of following someone else's list.",
    ],
    supplementCategories: [
      "Probiotics and gut support",
      "Fiber support",
      "Immune support",
      "Vitamin D",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise immunity from illness or relief from digestive conditions, and persistent gut symptoms warrant a clinician.",
    relatedGuideTopics: [
      "Fiber, simply",
      "Fermented foods",
      "Stress and the gut",
    ],
    productMatch: {
      tags: ["gut", "digestion", "digestive", "probiotic", "immune", "immunity", "microbiome", "fiber"],
    },
  },
  {
    slug: "intimacy-and-vitality",
    name: "Intimacy and Vitality",
    plainLanguageGoal:
      "Support drive, confidence, and connection through overall health, since intimate wellbeing usually reflects the whole system.",
    lifestyleFoundation: [
      "Sleep and stress addressed first, because both directly affect drive.",
      "Honest conversation with your partner and, where relevant, your clinician.",
      "Alcohol kept modest, since it works against this goal more than most people expect.",
    ],
    fitnessConsiderations: [
      "Regular training, which supports circulation, hormones, and confidence together.",
      "Strength work as a core component rather than cardio alone.",
      "Managing overtraining, which can suppress drive.",
    ],
    nutritionConsiderations: [
      "Eating enough; chronic dieting can noticeably lower drive.",
      "A heart-healthy overall pattern, since circulation is central here.",
      "Micronutrient adequacy through mostly whole foods.",
    ],
    supplementCategories: [
      "Vitality support",
      "Hormone health research compounds",
      "Circulation support",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise changes in libido, performance, or hormones, and concerns in this area deserve a clinician's evaluation.",
    relatedGuideTopics: [
      "Lifestyle and drive",
      "Sleep, stress, and hormones",
      "When to talk to a clinician",
    ],
    productMatch: {
      tags: ["vitality", "libido", "hormone", "testosterone", "intimacy", "circulation"],
    },
  },
  {
    slug: "everyday-health",
    name: "Everyday Health",
    plainLanguageGoal:
      "Cover the basics well, so the ordinary days that make up most of your life quietly work in your favor.",
    lifestyleFoundation: [
      "A consistent sleep schedule.",
      "Daily movement, even when it is just walking.",
      "Regular checkups with your own clinician.",
      "Time with people you care about, treated as a health habit.",
    ],
    fitnessConsiderations: [
      "Some strength work and some cardio each week, at whatever entry point fits your life.",
      "A routine simple enough to survive busy weeks.",
      "Gradual progression instead of January-style overhauls.",
    ],
    nutritionConsiderations: [
      "Mostly whole foods, mostly plants, enough protein.",
      "Water as the default drink.",
      "A pattern you can keep on your worst week, not just your best.",
    ],
    supplementCategories: [
      "Daily foundation support",
      "Vitamin D",
      "Omega 3 fatty acids",
      "Magnesium",
    ],
    whatXeniosDoesNotPromise:
      "xenios does not promise health outcomes, and supplements sit on top of the fundamentals rather than standing in for them.",
    relatedGuideTopics: [
      "The minimum effective routine",
      "Building habits that survive real life",
      "What a daily foundation actually covers",
    ],
    productMatch: {
      categories: ["supplements"],
      tags: ["foundation", "daily", "essential", "wellness", "multivitamin", "vitamin d", "omega", "magnesium"],
    },
  },
];

export function findGoal(slug: string | undefined): ResearchGoal | null {
  if (!slug) return null;
  return RESEARCH_GOALS.find((goal) => goal.slug === slug) ?? null;
}

export function goalHref(slug: string): string {
  return `/research/member/goals/${slug}`;
}

/**
 * Match REAL catalog products to a goal by tag or category. This never
 * invents products; it only filters what the gated catalog API returned.
 */
export function productsForGoal(products: Product[], goal: ResearchGoal, limit = 6): Product[] {
  const keywords = goal.productMatch.tags.map((tag) => tag.toLowerCase());
  const matched = products.filter((product) => {
    if (goal.productMatch.categories?.includes(product.category)) return true;
    const productTags = product.tags.map((tag) => tag.toLowerCase());
    return keywords.some((keyword) => productTags.some((tag) => tag.includes(keyword) || keyword.includes(tag)));
  });
  return matched.slice(0, limit);
}
