import crypto from "node:crypto";

const BATCH0_SCHEMA = "renderer-neutral-batch0-v1";

const CLASS_ORDER = Object.freeze([
  "peptide_lyophilized_vial",
  "liquid_vial",
  "injectable_solution_vial",
  "solution_container_neutral",
  "nasal_spray",
  "oral_liquid_neutral",
  "capsule_bottle",
  "tablet_bottle",
  "odt_container",
  "troche_container",
  "cream_tube_or_pump",
  "gel_tube_or_pump",
  "serum_dropper_or_pump",
  "supplement_bottle_generic",
  "supplement_tub_generic",
  "supplement_retail_unit_neutral",
  "accessory_pack",
  "syringe_supply_pack_neutral",
  "packaging_unverified",
  "neutral_product_identity",
  "care_pathway_neutral",
  "held_neutral",
  "quote_only_neutral",
  "coming_soon_offering",
  "shipping_service",
]);

const CLASS_SUBJECTS = Object.freeze({
  peptide_lyophilized_vial:
    "A single sealed clear-glass vial containing a small dry white lyophilized cake, with a plain stopper and matte-silver crimp cap.",
  liquid_vial:
    "A single sealed clear-glass vial containing a colorless liquid, with a plain stopper and matte-silver crimp cap.",
  injectable_solution_vial:
    "A single sealed clear-glass solution vial with a plain stopper and matte-silver crimp cap; no delivery accessories are present.",
  solution_container_neutral:
    "A single sealed neutral solution container in frosted glass with a plain matte-white closure and no asserted package design.",
  nasal_spray:
    "A single compact frosted-white pump-spray container with its protective cap closed and no emitted spray.",
  oral_liquid_neutral:
    "A single sealed amber-glass liquid container with a plain matte-white child-resistant closure and no dosing accessories.",
  capsule_bottle:
    "A single closed matte-white bottle with a plain child-resistant cap; its contents are not visible.",
  tablet_bottle:
    "A single closed low-profile matte-white bottle with a plain child-resistant cap; its contents are not visible.",
  odt_container:
    "A single closed compact round container with a smooth matte-white finish and no visible dosage form.",
  troche_container:
    "A single closed low-profile rectangular container with rounded corners and a smooth matte-white finish.",
  cream_tube_or_pump:
    "A single closed matte-white airless topical pump with a restrained brushed-silver collar.",
  gel_tube_or_pump:
    "A single sealed matte-white topical tube with a plain flush cap and a soft realistic material finish.",
  serum_dropper_or_pump:
    "A single closed frosted-glass serum pump bottle with a plain matte-white actuator and restrained silver collar.",
  supplement_bottle_generic:
    "A single closed opaque-white supplement-style bottle with a plain matte-white cap; its contents are not visible.",
  supplement_tub_generic:
    "A single closed low, wide cylindrical tub with a smooth matte-white body and matching plain lid.",
  supplement_retail_unit_neutral:
    "A neutral retail-unit proxy made from nested blank matte-white sleeves and soft-edged geometric forms, without asserting actual packaging.",
  accessory_pack:
    "A small sealed unbranded accessory case beside two empty capped sample tubes, arranged as a neutral category study.",
  syringe_supply_pack_neutral:
    "A single sealed tamper-evident supply pouch with blank matte surfaces; no contents or use instructions are visible.",
  packaging_unverified:
    "A blank matte-white carton-shaped proxy beside a sealed generic container, both deliberately non-identifying and not presented as actual packaging.",
  neutral_product_identity:
    "An empty low matte-stone pedestal with a translucent deep-green arc behind it; no physical item or package is depicted.",
  care_pathway_neutral:
    "A quiet empty consultation setting with two unoccupied curved chairs and a small round table holding one closed blank folio.",
  held_neutral:
    "An empty matte-stone display plinth behind a restrained translucent deep-green barrier form, with no physical item depicted.",
  quote_only_neutral:
    "A blank matte-white document folio beside one small brushed-silver review token and a translucent deep-green checkpoint arch.",
  coming_soon_offering:
    "An empty covered pedestal framed by two nested translucent deep-green arches, presented as an abstract future-offering study.",
  shipping_service:
    "An abstract matte-ceramic route sculpture with two neutral waypoint stones and a restrained deep-green path accent; no parcel or carrier object is present.",
});

const FIXTURES = Object.freeze([
  {
    groupId: "GRP-0264",
    movId: "mov_09db3e866424b64994d3",
    displayIdentity: "BPC-157 5 mg",
    alt: "Neutral unbranded dry-vial study for BPC-157 5 mg.",
  },
  {
    groupId: "GRP-0001",
    movId: "mov_a8af22bc4d1d96266669",
    displayIdentity: "5-Amino-1MQ",
    alt: "Neutral unbranded liquid-vial study for 5-Amino-1MQ.",
  },
  {
    groupId: "GRP-0010",
    movId: "mov_4b3417df465b8cbf0690",
    displayIdentity: "Ascorbic Acid",
    alt: "Neutral unbranded sealed-vial study for Ascorbic Acid.",
  },
  {
    groupId: "GRP-0363",
    movId: "mov_88fd1531d586cdebb896",
    displayIdentity: "Reconstitution Solution",
    alt: "Neutral unbranded solution-container study for Reconstitution Solution.",
  },
  {
    groupId: "GRP-0112",
    movId: "mov_de7158dd9892e7e78e1f",
    displayIdentity: "NAD+",
    alt: "Neutral unbranded capped-spray study for NAD+.",
  },
  {
    groupId: "GRP-0362",
    movId: "mov_30d35dcbc0bc8d59ff5b",
    displayIdentity: "Acetic Acid",
    alt: "Neutral unbranded liquid-container study for Acetic Acid.",
  },
  {
    groupId: "GRP-0249",
    movId: "mov_fe292b5f03527ec13e5e",
    displayIdentity: "KPV",
    alt: "Neutral unbranded closed-bottle study for KPV.",
  },
  {
    groupId: "GRP-0005",
    movId: "mov_0599d5a40aa70a61481b",
    displayIdentity: "Anastrozole Tablet",
    alt: "Neutral unbranded closed-bottle study for Anastrozole Tablet.",
  },
  {
    groupId: "GRP-0115",
    movId: "mov_70ed47e636867f37e9d3",
    displayIdentity: "Ondansetron",
    alt: "Neutral unbranded closed-container study for Ondansetron.",
  },
  {
    groupId: "GRP-0007",
    movId: "mov_34d2979a224be8a574f4",
    displayIdentity: "AOD-9604",
    alt: "Neutral unbranded closed-container study for AOD-9604.",
  },
  {
    groupId: "GRP-0145",
    movId: "mov_0146c6b245d5f09247a8",
    displayIdentity: "Progesterone",
    alt: "Neutral unbranded topical-container study for Progesterone.",
  },
  {
    groupId: "GRP-0068",
    movId: "mov_5375621d23911b130fd4",
    displayIdentity: "GHK-Cu serum/gel",
    alt: "Neutral unbranded topical-container study for GHK-Cu serum and gel.",
  },
  {
    groupId: "GRP-0420",
    movId: "mov_ea6077e070c07548c709",
    displayIdentity: "Radient XO",
    alt: "Neutral unbranded serum-container study for Radient XO.",
  },
  {
    groupId: null,
    movId: null,
    displayIdentity: "Class-only generic supplement bottle",
    alt: "Neutral unbranded generic supplement-bottle class study.",
  },
  {
    groupId: null,
    movId: null,
    displayIdentity: "Class-only generic supplement tub",
    alt: "Neutral unbranded generic supplement-tub class study.",
  },
  {
    groupId: "GRP-0375",
    movId: "mov_f5d63d95caa3d6d0a7a0",
    displayIdentity: "Magtein",
    alt: "Neutral packaging-unassertive retail-unit study for Magtein.",
  },
  {
    groupId: null,
    movId: null,
    displayIdentity: "Class-only generic accessory pack",
    alt: "Neutral unbranded generic accessory-pack class study.",
  },
  {
    groupId: "GRP-0365",
    movId: "mov_512ed6b875c04eee4753",
    displayIdentity: "Syringes & Alcohol Swabs",
    alt: "Neutral sealed-supply-pack study for Syringes and Alcohol Swabs.",
  },
  {
    groupId: "GRP-0073",
    movId: "mov_711f953e5a7be900fb65",
    displayIdentity: "Pregnyl",
    alt: "Packaging-unverified neutral-container study for Pregnyl.",
  },
  {
    groupId: "GRP-0392",
    movId: "mov_554ae2758dbe92e4baa6",
    displayIdentity: "BDNF",
    alt: "Form-neutral identity study for BDNF; no physical package is represented.",
  },
  {
    groupId: "GRP-0002",
    movId: "mov_82974ab2f9c652c2cb12",
    displayIdentity: "Anastrozole",
    alt: "Neutral guided-Care pathway study for Anastrozole; no product is represented.",
  },
  {
    groupId: "GRP-0394",
    movId: "mov_07317a1fe77fe228b793",
    displayIdentity: "CJC-1295 With DAC",
    alt: "Held-state neutral study for CJC-1295 With DAC; no physical package is represented.",
    qaGroupIds: ["GRP-0422"],
  },
  {
    groupId: "GRP-0244",
    movId: "mov_038386172c35c2ad8cca",
    displayIdentity: "BAM15",
    alt: "Neutral review-pathway study for BAM15; no price or package is represented.",
  },
  {
    groupId: null,
    movId: null,
    displayIdentity: "Superpower / Mito Health shared coming-soon class",
    alt: "Shared neutral coming-soon decorative study for Superpower and Mito Health; no partnership or package is represented.",
  },
  {
    groupId: "GRP-0364",
    movId: "mov_9b65ad5bb184691e19e0",
    displayIdentity: "FedEx Standard Overnight",
    alt: "Abstract shipping-service study for FedEx Standard Overnight; no carrier mark or merchandise is represented.",
  },
]);

const STUDIO_STYLE = Object.freeze({
  medium: "photorealistic editorial studio still life",
  aesthetic: "premium, restrained, calm, minimal, and materially realistic",
  background: "warm-white seamless studio background",
  accent: "one subtle deep-green environmental accent, never applied as a mark",
  lighting: "soft diffused studio light with a restrained grounding shadow",
  composition:
    "square 1:1 frame, centered subject, front three-quarter view, and generous crop-safe margins",
});

const REQUIRED_POLICIES = Object.freeze({
  provenanceBoundary: "fixture_metadata_excluded_from_renderer_input",
  identity: "generic_class_only",
  visibleText: "none",
  labels: "none",
  logos: "none",
  brandMarks: "none",
  trademarks: "none",
  claims: "none",
  certifications: "none",
  people: "none",
  hands: "none",
  administration: "none",
  commercialCues: "none",
  numericFacts: "none",
  packagingAuthority: "not_asserted",
  outputUse: "non_public_review_evidence_only",
});

const REQUIRED_FORBIDDEN_OBJECTS = Object.freeze([
  "readable words, letters, or numbers",
  "labels or label-like panels",
  "logos, brand marks, or trademarks",
  "certification marks or regulatory seals",
  "medical, performance, or outcome claims",
  "people, faces, hands, or body parts",
  "administration, application, or procedure scenes",
  "needles, syringes, or exposed sharps",
  "active droppers, spray plumes, or dispensing gestures",
  "currency, prices, carts, checkout elements, or sale badges",
  "barcodes or QR codes",
  "carrier marks, delivery branding, or commercial signage",
]);

const VISIBLE_IDENTITY_PATTERNS = Object.freeze([
  /\bbpc[-\s]?157\b/i,
  /\b5[-\s]?amino[-\s]?1mq\b/i,
  /\bascorbic\s+acid\b/i,
  /\breconstitution\s+solution\b/i,
  /\bnad\+?(?![a-z0-9])/i,
  /\bacetic\s+acid\b/i,
  /\bkpv\b/i,
  /\banastrozole\b/i,
  /\bondansetron\b/i,
  /\baod[-\s]?9604\b/i,
  /\bprogesterone\b/i,
  /\bghk[-\s]?cu\b/i,
  /\bradient\s+xo\b/i,
  /\bcjc[-\s]?1295\b/i,
  /\bbdnf\b/i,
  /\bbam15\b/i,
  /\bsyringes?\s*(?:&|and)\s*alcohol\s+swabs?\b/i,
]);

const KNOWN_MARK_PATTERNS = Object.freeze([
  /\bxenios\b/i,
  /\bpregnyl\b/i,
  /\bkyzatrex\b/i,
  /\bzofran\b/i,
  /\bversabase\b/i,
  /\bmagtein\b/i,
  /\bultrabiotic\b/i,
  /\bcollagen\s+renew\b/i,
  /\bdynamic\s+multi\b/i,
  /\bsuperpower\b/i,
  /\bmito\s+health\b/i,
  /\bfedex\b/i,
  /\bhexarelin\b/i,
  /\boxytocin\b/i,
]);

const NUMERIC_FACT_PATTERN = new RegExp(
  String.raw`(?:[$\u20ac\u00a3\u00a5]\s*\d|\b(?:usd|cad|eur|gbp)\s*\d|\b\d+(?:\.\d+)?\s*(?:mcg|ug|\u00b5g|mg|kg|g|ml|l|iu|units?|percent|%|oz|fl\.?\s*oz)\b|\b\d+\s*(?:count|ct|capsules?|tablets?|troches?|vials?|bottles?|tubs?|packs?|pieces?|servings?)\b)`,
  "i",
);

const CLAIM_PATTERN =
  /\b(?:clinically\s+proven|doctor\s+recommended|cures?|treats?|prevents?|diagnoses?|heals?|guaranteed|anti[-\s]?aging|fat[-\s]?burning|weight[-\s]?loss|therapeutic\s+benefits?|improves?|enhances?|boosts?)\b/i;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function evidenceFilename(index, imageClass, rendererPayload) {
  const promptSha12 = crypto
    .createHash("sha256")
    .update(buildRendererPrompt(rendererPayload), "utf8")
    .digest("hex")
    .slice(0, 12);
  return `batch0-${String(index + 1).padStart(2, "0")}-${imageClass}-${promptSha12}.png`;
}

function makeJob(imageClass, fixture, index) {
  const rendererPayload = {
    schema: BATCH0_SCHEMA,
    imageClass,
    subject: CLASS_SUBJECTS[imageClass],
    style: STUDIO_STYLE,
    policies: REQUIRED_POLICIES,
    forbiddenObjects: REQUIRED_FORBIDDEN_OBJECTS,
  };
  const filename = evidenceFilename(index, imageClass, rendererPayload);
  return {
    jobId: `batch0-${String(index + 1).padStart(2, "0")}-${imageClass}`,
    batch: 0,
    imageClass,
    classKey: imageClass,
    fixture: {
      provenanceOnly: true,
      groupId: fixture.groupId,
      movId: fixture.movId,
      displayIdentity: fixture.displayIdentity,
      alt: fixture.alt,
      qaGroupIds: fixture.qaGroupIds ?? [],
    },
    evidenceTarget: {
      visibility: "non_public_evidence",
      filename,
      repositoryPath: `docs/product-imagery/evidence/batch0-render-candidates/${filename}`,
    },
    rendererPayload,
  };
}

export const BATCH0_JOBS = deepFreeze(
  CLASS_ORDER.map((imageClass, index) => makeJob(imageClass, FIXTURES[index], index)),
);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateExactKeys(value, expectedKeys, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }

  const expected = new Set(expectedKeys);
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) errors.push(`${label}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) errors.push(`${label}.${key} is not permitted`);
  }
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return output;
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
  return output;
}

function validateRendererText(value, label, errors) {
  const strings = collectStrings(value);
  for (const text of strings) {
    for (const pattern of VISIBLE_IDENTITY_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`${label} contains a visible fixture identity term`);
        break;
      }
    }
    for (const pattern of KNOWN_MARK_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`${label} contains a prohibited name or known mark`);
        break;
      }
    }

    const withoutSquareRatio = text.replace(/\b1\s*:\s*1\b/g, "");
    if (NUMERIC_FACT_PATTERN.test(withoutSquareRatio)) {
      errors.push(`${label} contains numeric dosage, strength, concentration, volume, count, or price text`);
    }
    if (CLAIM_PATTERN.test(text)) {
      errors.push(`${label} contains claim language`);
    }
  }
}

function buildRendererPrompt(payload) {
  return [
    "Create one square 1:1 studio still life for internal visual review.",
    payload.subject,
    `Medium and aesthetic: ${payload.style.medium}; ${payload.style.aesthetic}.`,
    `Set: ${payload.style.background}; ${payload.style.accent}.`,
    `Lighting: ${payload.style.lighting}.`,
    `Composition: ${payload.style.composition}.`,
    "Use only the generic class description. Do not add or infer a named identity, maker, ingredient, formulation, strength, concentration, volume, count, or price.",
    "No visible text of any kind: no words, letters, numbers, labels, logos, brand marks, trademarks, claims, certifications, seals, barcodes, or QR codes.",
    "No people, faces, hands, body parts, administration, application, procedure, or active dispensing.",
    "No currency, price, cart, checkout, sale, carrier, partnership, availability, or other commercial cue.",
    `Forbidden objects and cues: ${payload.forbiddenObjects.join("; ")}.`,
  ].join(" ");
}

export function validateRendererJob(job) {
  const errors = [];
  validateExactKeys(
    job,
    [
      "jobId",
      "batch",
      "imageClass",
      "classKey",
      "fixture",
      "evidenceTarget",
      "rendererPayload",
    ],
    "job",
    errors,
  );
  if (!isPlainObject(job)) {
    throw new TypeError(`Invalid renderer job: ${errors.join("; ")}`);
  }

  const classIndex = CLASS_ORDER.indexOf(job.imageClass);
  if (classIndex < 0) errors.push("job.imageClass is not a Batch 0 class");
  if (job.classKey !== job.imageClass) errors.push("job.classKey must equal job.imageClass");
  if (job.batch !== 0) errors.push("job.batch must be 0");
  if (classIndex >= 0) {
    const expectedId = `batch0-${String(classIndex + 1).padStart(2, "0")}-${job.imageClass}`;
    if (job.jobId !== expectedId) errors.push("job.jobId does not match its ordered Batch 0 class");
  }

  validateExactKeys(
    job.fixture,
    ["provenanceOnly", "groupId", "movId", "displayIdentity", "alt", "qaGroupIds"],
    "job.fixture",
    errors,
  );
  if (isPlainObject(job.fixture)) {
    if (job.fixture.provenanceOnly !== true) errors.push("job.fixture must be provenance-only");
    const hasGroup = job.fixture.groupId !== null;
    const hasMov = job.fixture.movId !== null;
    if (hasGroup !== hasMov) errors.push("job.fixture groupId and movId must both be set or both be null");
    if (hasGroup && !/^GRP-\d{4}$/.test(job.fixture.groupId ?? "")) {
      errors.push("job.fixture.groupId is invalid");
    }
    if (hasMov && !/^mov_[a-f0-9]{20}$/.test(job.fixture.movId ?? "")) {
      errors.push("job.fixture.movId is invalid");
    }
    if (typeof job.fixture.displayIdentity !== "string" || !job.fixture.displayIdentity.trim()) {
      errors.push("job.fixture.displayIdentity is required");
    }
    if (typeof job.fixture.alt !== "string" || !job.fixture.alt.trim()) {
      errors.push("job.fixture.alt is required");
    }
    if (!Array.isArray(job.fixture.qaGroupIds)) {
      errors.push("job.fixture.qaGroupIds must be an array");
    } else if (job.fixture.qaGroupIds.some((groupId) => !/^GRP-\d{4}$/.test(groupId))) {
      errors.push("job.fixture.qaGroupIds contains an invalid group ID");
    } else if (new Set(job.fixture.qaGroupIds).size !== job.fixture.qaGroupIds.length) {
      errors.push("job.fixture.qaGroupIds contains a duplicate group ID");
    }
  }

  validateExactKeys(
    job.evidenceTarget,
    ["visibility", "filename", "repositoryPath"],
    "job.evidenceTarget",
    errors,
  );
  if (isPlainObject(job.evidenceTarget) && classIndex >= 0) {
    const expectedFilename = evidenceFilename(classIndex, job.imageClass, job.rendererPayload);
    const expectedPath = `docs/product-imagery/evidence/batch0-render-candidates/${expectedFilename}`;
    if (job.evidenceTarget.visibility !== "non_public_evidence") {
      errors.push("job.evidenceTarget must remain non-public evidence");
    }
    if (job.evidenceTarget.filename !== expectedFilename) {
      errors.push("job.evidenceTarget.filename is not deterministic");
    }
    if (job.evidenceTarget.repositoryPath !== expectedPath) {
      errors.push("job.evidenceTarget.repositoryPath is outside the Batch 0 evidence target");
    }
    if (/client[\\/]public|(?:^|[\\/])public(?:[\\/]|$)/i.test(job.evidenceTarget.repositoryPath ?? "")) {
      errors.push("job.evidenceTarget may not use a public asset path");
    }
  }

  validateExactKeys(
    job.rendererPayload,
    ["schema", "imageClass", "subject", "style", "policies", "forbiddenObjects"],
    "job.rendererPayload",
    errors,
  );
  if (isPlainObject(job.rendererPayload)) {
    if (job.rendererPayload.schema !== BATCH0_SCHEMA) {
      errors.push("job.rendererPayload.schema is invalid");
    }
    if (job.rendererPayload.imageClass !== job.imageClass) {
      errors.push("job.rendererPayload.imageClass must equal job.imageClass");
    }
    if (classIndex >= 0 && job.rendererPayload.subject !== CLASS_SUBJECTS[job.imageClass]) {
      errors.push("job.rendererPayload.subject is not the approved generic class subject");
    }

    validateExactKeys(
      job.rendererPayload.style,
      ["medium", "aesthetic", "background", "accent", "lighting", "composition"],
      "job.rendererPayload.style",
      errors,
    );
    if (isPlainObject(job.rendererPayload.style)) {
      for (const [key, expected] of Object.entries(STUDIO_STYLE)) {
        if (job.rendererPayload.style[key] !== expected) {
          errors.push(`job.rendererPayload.style.${key} must use the shared Batch 0 style`);
        }
      }
    }

    validateExactKeys(
      job.rendererPayload.policies,
      Object.keys(REQUIRED_POLICIES),
      "job.rendererPayload.policies",
      errors,
    );
    if (isPlainObject(job.rendererPayload.policies)) {
      for (const [key, expected] of Object.entries(REQUIRED_POLICIES)) {
        if (job.rendererPayload.policies[key] !== expected) {
          errors.push(`job.rendererPayload.policies.${key} must be ${expected}`);
        }
      }
    }

    if (!Array.isArray(job.rendererPayload.forbiddenObjects)) {
      errors.push("job.rendererPayload.forbiddenObjects must be an array");
    } else {
      if (
        job.rendererPayload.forbiddenObjects.length !== REQUIRED_FORBIDDEN_OBJECTS.length ||
        job.rendererPayload.forbiddenObjects.some(
          (value, index) => value !== REQUIRED_FORBIDDEN_OBJECTS[index],
        )
      ) {
        errors.push("job.rendererPayload.forbiddenObjects must exactly match the approved list");
      }
    }

    validateRendererText(job.rendererPayload, "job.rendererPayload", errors);
    if (
      isPlainObject(job.rendererPayload.policies) &&
      job.rendererPayload.policies.visibleText !== "none"
    ) {
      errors.push("job.rendererPayload visible text must be empty");
    }
    validateRendererText(buildRendererPrompt(job.rendererPayload), "compiled renderer prompt", errors);
  }

  if (errors.length > 0) {
    throw new TypeError(`Invalid renderer job: ${[...new Set(errors)].join("; ")}`);
  }
  return true;
}

export function compileRendererPrompt(job) {
  validateRendererJob(job);
  return buildRendererPrompt(job.rendererPayload);
}
