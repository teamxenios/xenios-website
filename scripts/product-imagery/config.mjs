export const ARTIFACT_GENERATED_AT = "2026-10-01T02:45:00.000Z";
export const CONTRACT_SCHEMA_VERSION = 4;
export const SOURCE_BASE_COMMIT = "49234f8a2dd804845245a18056a73904b320158a";
export const SOURCE_BASE_TREE = "36e1db47986916c3a96c82324ba43fbcec6e7861";
export const ASSET_BYTE_BUDGET = 120 * 1024;
export const ASSET_TOTAL_BYTE_BUDGET = 400 * 1024;

export const CATALOG_SOURCE_PATH =
  "server/research/master-offerings/data/member-safe-master-offerings.generated.json";
export const BINDING_SOURCE_PATH =
  "server/research/master-offerings/data/master-offering-bindings.generated.json";
export const CUSTOMER_EXPOSURE_SOURCE_PATH =
  "server/research/master-offerings/service.ts";
export const FEATURED_IDENTITY_SOURCE_PATH =
  "config/research/production-completion/catalog-live-identity-closure-20260922.json";
export const CATALOG_RECONCILIATION_SOURCE_PATH =
  "config/research/master-catalog-reconciliation-20260821.json";
export const MASTER_CATALOG_SUMMARY_SOURCE_PATH =
  "docs/research-launch/MASTER_CATALOG_2026-08-16_SUMMARY.json";
export const REVIEWED_CATALOG_SOURCE_PATH =
  "docs/research-launch/XENIOS_RETAIL_ONLY_MASTER_CATALOG_426_VARIANTS.csv";
export const FOUNDER_V3_SPEC_PATH =
  "docs/product-imagery/specs/Xenios_Product_Imagery_Parallel_Codex_Mega_Prompt_v3.md";
export const FOUNDER_V3_SPEC_SHA256 =
  "e37a13d7b99ac1f2416e00e29a92df3e7677ce7c92bce9dbf019de83d08b8b5c";

export const FALLBACK_ASSET_MANIFEST_PATH =
  "docs/product-imagery/manifests/fallback-assets.json";
export const COVERAGE_LEDGER_PATH =
  "docs/product-imagery/manifests/product-image-coverage.json";
export const RENDER_QUEUE_PATH =
  "docs/product-imagery/manifests/render-queue.json";
export const RENDERER_PACKET_PATH =
  "docs/product-imagery/manifests/renderer-packet-v3.json";
export const BATCH0_PROVENANCE_PATH =
  "docs/product-imagery/manifests/batch-000-provenance.json";
export const STATE_AUTHORITY_AUDIT_PATH =
  "docs/product-imagery/manifests/state-authority-audit.json";
export const BATCH0_ASSET_MANIFEST_PATH =
  "docs/product-imagery/manifests/batch-000-assets.json";
export const BATCH0_EVIDENCE_DIRECTORY =
  "docs/product-imagery/evidence/batch0-render-candidates";
export const PRE_V3_QUARANTINE_DIRECTORY =
  "docs/product-imagery/evidence/pre-v3-nonapprovable";
export const IDENTITY_CROSSWALK_PATH =
  "docs/product-imagery/manifests/product-image-identity-crosswalk.json";
export const COVERAGE_SUMMARY_PATH =
  "docs/product-imagery/COVERAGE_SUMMARY.md";

export const V3_ACCEPTANCE = Object.freeze({
  commit: "f4f899a7",
  path: "docs/review/xenios-health-launch-review-20260930/13_IMAGE_LAYER_ACCEPTANCE.md",
  founderPromptStatus: "attached_read_and_checksummed",
  founderSpecPath: FOUNDER_V3_SPEC_PATH,
  founderSpecSha256: FOUNDER_V3_SPEC_SHA256,
});

export const FALLBACK_ASSET_PROVENANCE = Object.freeze({
  "xenios-fallback-form-vial-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:56.198Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-97cb2d09-5f0e-482b-85ec-9319c2680a29.png",
      sha256: "48e356485a8569dfee8f6699ac2584bcb639015890d367eb0c48d04eb23c596d",
      byteSize: 1425171,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T19:53:43.826Z",
      observedLastWriteAt: "2026-09-30T19:53:43.827Z",
    },
  },
  "xenios-fallback-form-bottle-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:54.062Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-6eb9798e-3ba1-4eee-b11c-2fa28529f490.png",
      sha256: "1251178c22fefb9f319db72574e5284a5b09f925839544e4908f95a6f9ec2c56",
      byteSize: 1310528,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T19:54:27.072Z",
      observedLastWriteAt: "2026-09-30T19:54:27.073Z",
    },
  },
  "xenios-fallback-form-spray-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:55.380Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-d6dbf70a-0785-4fb2-90fe-18c4be61c6f8.png",
      sha256: "61bdb0cf02c8211560ea667607babb8b0c52a1137d012da8897b0cef82b67392",
      byteSize: 1303642,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T19:54:52.646Z",
      observedLastWriteAt: "2026-09-30T19:54:52.648Z",
    },
  },
  "xenios-fallback-form-accessory-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:53.695Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-c41b850e-9f08-4db9-98a7-61637ecc6927.png",
      sha256: "9b597ceb0564384d5c4d806302f3359a0cefd8f614bbb66a087136278f206983",
      byteSize: 1549977,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T19:55:25.284Z",
      observedLastWriteAt: "2026-09-30T19:55:25.285Z",
    },
  },
  "xenios-fallback-form-topical-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:55.769Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-4de080f7-21c3-446c-932c-79fa02beca71.png",
      sha256: "fe3bfdfffc496d55e84b2fb9114e0f1af05a8b77ea9b3025ac79734e80c5f043",
      byteSize: 1290639,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T19:57:30.755Z",
      observedLastWriteAt: "2026-09-30T19:57:30.756Z",
    },
  },
  "xenios-fallback-form-liquid-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:54.513Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-68f0785a-920d-4ab8-8bf0-5f0d49f2cb30.png",
      sha256: "d3d338b0d3af220591fe8b813e23394c6d51ee854bb21e124e434aaad4678f00",
      byteSize: 1314253,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T19:58:02.370Z",
      observedLastWriteAt: "2026-09-30T19:58:02.381Z",
    },
  },
  "xenios-fallback-form-pending-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:54.914Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-c7484889-2b7d-4c8b-8efb-3e98d8a04aca.png",
      sha256: "809956f4b32cebd35d1601ae4fe51f2deeb391d297ee23b7e3e4826944d49e0d",
      byteSize: 1400890,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T19:58:28.429Z",
      observedLastWriteAt: "2026-09-30T19:58:28.429Z",
    },
  },
  "xenios-fallback-service-shipping-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:57.755Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-5aca9786-5b93-400e-8167-34b549123042.png",
      sha256: "6bddb831bb93e8d33ed41aba48a00510d5488f1b1728912b9fc9a622191a25be",
      byteSize: 1593592,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T19:58:54.168Z",
      observedLastWriteAt: "2026-09-30T19:58:54.178Z",
    },
  },
  "xenios-fallback-journey-care-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:56.934Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-c99a5bcf-aa55-4f88-9d62-3cfb2bb8d939.png",
      sha256: "3f94fcb52a9fe7c4d22d2f509908e9f587eb2653b06ce4a86ba06cbf6c0c9b84",
      byteSize: 2201480,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T20:00:29.652Z",
      observedLastWriteAt: "2026-09-30T20:00:29.653Z",
    },
  },
  "xenios-fallback-journey-request-v1": {
    pixelGeneratedAt: "unknown",
    encodedAt: "2026-09-30T20:09:57.320Z",
    sourceArtifact: {
      status: "local_original_retained_outside_repository",
      evidenceRef:
        "codex-generated-image/exec-2d2714f0-6165-461f-812f-f399ea184eca.png",
      sha256: "69b4e5e433bab3a3b208aa918eaf21dc20bf94c6c6c9ca93a8c70e38b037ddc9",
      byteSize: 1649855,
      format: "PNG",
      width: 1254,
      height: 1254,
      observedCreatedAt: "2026-09-30T20:01:02.892Z",
      observedLastWriteAt: "2026-09-30T20:01:02.892Z",
    },
  },
});

export const FALLBACK_ASSETS = [
  {
    assetId: "xenios-fallback-form-vial-v1",
    taxonomyKey: "vial",
    semanticClass: "form_fallback",
    useRestriction:
      "generic_liquid_vial_only_not_for_lyophilized_or_exact_product_use",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-form-vial-fallback-v1-16e20b949b28.webp",
    publicPath: null,
    sha256: "16e20b949b2863d8f7f27bb7de5b0cf799d18cb8f53a2df0a4f32981b862ba30",
    byteSize: 25374,
    width: 1024,
    height: 1024,
    altDescription: "Representative unlabeled vial form; no exact product is depicted.",
    prompt:
      "Product-mockup asset for Xenios Research catalog fallback taxonomy. A single generic clear research vial with a restrained matte silver cap, centered upright on a warm off-white seamless studio background, soft diffused daylight, subtle grounding shadow, premium minimal clinical editorial photography aesthetic, neutral cool-gray and muted deep-green accents only in the background lighting. The vial must be completely unbranded and unlabeled: no words, letters, numbers, logo, dosage, strength, ingredient, barcode, claims, syringe, needle, people, hands, packaging, medical procedure, or purchase cues. This is explicitly a form-level placeholder illustration, not an exact product, supplier photograph, medicine claim, or proof of availability. Square 1:1 composition with generous safe margins for responsive card crops, object occupying about 62 percent of frame, crisp realistic glass and cap materials, no decorative props.",
  },
  {
    assetId: "xenios-fallback-form-bottle-v1",
    taxonomyKey: "bottle",
    semanticClass: "form_fallback",
    useRestriction:
      "generic_container_only_no_official_or_third_party_packaging_claim",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-form-bottle-fallback-v1-45d1a44583e9.webp",
    publicPath: null,
    sha256: "45d1a44583e932b5286ab307c67125ad37acbf249334d89aff9acfe3f42fb2d6",
    byteSize: 10154,
    width: 1024,
    height: 1024,
    altDescription: "Representative unlabeled bottle form; no exact product is depicted.",
    prompt:
      "Product-mockup asset for Xenios Research catalog fallback taxonomy. A single generic matte-white supplement bottle with a restrained brushed-silver cap, centered upright on the same warm off-white seamless studio background as a premium clinical editorial catalog, soft diffused daylight, subtle grounding shadow, restrained cool-gray and muted deep-green background accents. Bottle must be completely unbranded with a perfectly blank surface: no label, words, letters, numbers, logo, ingredient, dosage, capsules visible, claims, barcode, certification marks, people, hands, props, or purchase cues. This is explicitly a form-level placeholder illustration, not an exact product, supplier photograph, medicine claim, or proof of availability. Square 1:1 composition with generous responsive crop safe margins, object about 62 percent of frame, realistic materials, no decorative objects.",
  },
  {
    assetId: "xenios-fallback-form-spray-v1",
    taxonomyKey: "spray",
    semanticClass: "form_fallback",
    useRestriction:
      "generic_spray_form_only_no_administration_or_exact_packaging_claim",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-form-spray-fallback-v1-387cf64b2ba4.webp",
    publicPath: null,
    sha256: "387cf64b2ba4367f45587a4a6ebcf7fd64ba6222795a4bedf18c3c6aae19bad9",
    byteSize: 10898,
    width: 1024,
    height: 1024,
    altDescription: "Representative unlabeled spray form; no exact product is depicted.",
    prompt:
      "Product-mockup asset for Xenios Research catalog fallback taxonomy. A single generic compact pump-spray bottle with a protective cap, matte frosted-white body and restrained brushed-silver hardware, centered upright on a warm off-white seamless studio background, soft diffused daylight, subtle grounding shadow, premium minimal clinical editorial photography aesthetic, restrained cool-gray and muted deep-green accents only in background lighting. Entire container completely unbranded and blank: no label, words, letters, numbers, logo, ingredient, dosage, claims, barcode, nostril, person, hand, spray plume, medical procedure, packaging, or purchase cues. This is explicitly a form-level placeholder illustration, not an exact product, supplier photograph, treatment claim, or proof of availability. Square 1:1 composition with generous safe margins for card crops, object about 58 percent of frame, crisp realistic materials, no props.",
  },
  {
    assetId: "xenios-fallback-form-accessory-v1",
    taxonomyKey: "accessory",
    semanticClass: "form_fallback",
    useRestriction:
      "generic_non_medical_accessory_only_no_syringe_sample_or_device_claim",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-form-accessory-fallback-v1-8bed268b0a33.webp",
    publicPath: null,
    sha256: "8bed268b0a3367418b36635e4022bc8c512f32518f150931721768be781f25f5",
    byteSize: 31370,
    width: 1024,
    height: 1024,
    altDescription: "Representative unbranded research accessory form; no exact product is depicted.",
    prompt:
      "Product-mockup asset for Xenios Research catalog fallback taxonomy. A generic non-medical research accessory arrangement: one empty clear capped sample tube resting in a minimal brushed-silver tabletop rack beside a small neutral protective case, centered on a warm off-white seamless studio background, soft diffused daylight, subtle shadows, premium restrained clinical editorial photography aesthetic, cool-gray and muted deep-green background accents. Everything completely unbranded and blank: no label, words, letters, numbers, logo, ingredient, dosage, fluid, biological sample, syringe, needle, gloves, people, hands, medical procedure, shipping carrier, claims, barcode, or purchase cues. This is explicitly a category-level placeholder illustration, not an exact product, supplier photograph, clinical device, or proof of availability. Square 1:1 composition with generous responsive crop safe margins, objects together occupying about 58 percent of frame, realistic materials, no decorative props.",
  },
  {
    assetId: "xenios-fallback-form-topical-v1",
    taxonomyKey: "topical",
    semanticClass: "form_fallback",
    useRestriction:
      "generic_topical_container_only_no_treatment_or_exact_packaging_claim",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-form-topical-fallback-v1-d4cafdac87e7.webp",
    publicPath: null,
    sha256: "d4cafdac87e772d1f3329ef2e207852db233381dedbccf78dfdae64f3d754a94",
    byteSize: 10974,
    width: 1024,
    height: 1024,
    altDescription: "Representative unlabeled topical pump form; no exact product is depicted.",
    prompt:
      "Product-mockup asset for Xenios Research catalog fallback taxonomy. A single generic matte-white airless topical pump container with restrained brushed-silver collar, centered upright on a warm off-white seamless studio background, soft diffused daylight, subtle grounding shadow, premium minimal clinical editorial photography aesthetic, cool-gray and muted deep-green accents only in background lighting. Completely unbranded and blank: no label, words, letters, numbers, logo, ingredient, dosage, skin, person, hand, application gesture, medical claim, packaging, barcode, or purchase cues. This is explicitly a form-level placeholder illustration, not an exact product, supplier photograph, treatment claim, or proof of availability. Square 1:1 composition with generous responsive crop safe margins, object about 58 percent of frame, crisp realistic materials, no props.",
  },
  {
    assetId: "xenios-fallback-form-liquid-v1",
    taxonomyKey: "liquid",
    semanticClass: "form_fallback",
    useRestriction:
      "generic_liquid_container_only_no_administration_or_exact_packaging_claim",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-form-liquid-fallback-v1-db47a5d0f44e.webp",
    publicPath: null,
    sha256: "db47a5d0f44e2b938b76e0490ea8b0d1add6c1f6435fcb5371f035339c8ba93f",
    byteSize: 22644,
    width: 1024,
    height: 1024,
    altDescription: "Representative unlabeled liquid bottle form; no exact product is depicted.",
    prompt:
      "Product-mockup asset for Xenios Research catalog fallback taxonomy. A single generic sealed amber-glass liquid bottle with a plain matte-white child-resistant cap, centered upright on a warm off-white seamless studio background, soft diffused daylight, subtle grounding shadow, premium restrained clinical editorial photography aesthetic, cool-gray and muted deep-green background accents. Bottle completely unbranded with a blank surface: no label, words, letters, numbers, logo, ingredient, dosage, dropper, spoon, syringe, claims, barcode, people, hands, medical procedure, packaging, or purchase cues. This is explicitly a form-level placeholder illustration, not an exact product, supplier photograph, medicine claim, or proof of availability. Square 1:1 composition with generous safe margins, object about 58 percent of frame, realistic glass, no props.",
  },
  {
    assetId: "xenios-fallback-form-pending-v1",
    taxonomyKey: "pending",
    semanticClass: "non_product_state",
    useRestriction: "form_neutral_non_product_state_only",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-form-pending-fallback-v1-a3fae1cdfaf0.webp",
    publicPath: null,
    sha256: "a3fae1cdfaf0e1bfb9ad7229c256563c6791410189566bd0cec0f0f3f44d6586",
    byteSize: 22824,
    width: 1024,
    height: 1024,
    altDescription: "Empty studio pedestal indicating that visual identification is pending.",
    prompt:
      "Non-product fallback asset for Xenios Research catalog entries whose physical form is not yet stated. An empty warm off-white seamless studio set with one low matte stone pedestal and a restrained translucent deep-green arc of light behind it, premium minimal clinical editorial aesthetic, soft diffused daylight, subtle shadows, calm spacious composition. Absolutely no product, container, parcel, object for sale, label, words, letters, numbers, logo, ingredient, dosage, claim, people, hands, medical device, or purchase cues. This image must communicate that visual identification is pending without pretending to depict the item. Square 1:1 composition with generous responsive crop safe margins.",
  },
  {
    assetId: "xenios-fallback-service-shipping-v1",
    taxonomyKey: "shipping_service",
    semanticClass: "non_merchandise_service",
    useRestriction: "shipping_service_symbol_only_not_merchandise_or_carrier_claim",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-service-shipping-fallback-v1-a2885fe2f7ff.webp",
    publicPath: null,
    sha256: "a2885fe2f7ffde1d6030c758dbd7ac3c19e21cdb9824ba52e0b8987181aacf2d",
    byteSize: 24152,
    width: 1024,
    height: 1024,
    altDescription: "Abstract shipping service illustration; no merchandise is depicted.",
    prompt:
      "Non-merchandise service fallback asset for a generic shipping-and-fulfillment catalog row. A premium restrained studio still life showing one abstract matte off-white route tile with a subtle embossed path line and two small neutral waypoint dots, beside a closed unbranded kraft transit box shown only as a logistics symbol, on a warm off-white seamless background with soft diffused daylight, cool-gray and muted deep-green accents, subtle shadows. No carrier branding, FedEx colors or logo, product label, words, letters, numbers, barcode, price, shopping bag, add-to-cart cue, merchandise contents, delivery person, vehicle, claims, or medical objects. This is explicitly a service illustration, not merchandise, not a product photograph, and not proof of availability. Square 1:1 composition with generous crop safe margins.",
  },
  {
    assetId: "xenios-fallback-journey-care-v1",
    taxonomyKey: "care",
    semanticClass: "non_product_pathway",
    useRestriction: "care_pathway_scene_only_no_product_treatment_or_outcome_claim",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-journey-care-fallback-v1-58884347b983.webp",
    publicPath: null,
    sha256: "58884347b983a381671771504e6b322d0893b345f4c911ff43ca36b1cfb22030",
    byteSize: 114964,
    width: 1024,
    height: 1024,
    altDescription: "Empty consultation setting representing a guided Care pathway; no product is depicted.",
    prompt:
      "Non-product pathway fallback asset for Xenios Research Care catalog entries. A quiet premium consultation setting with two empty curved chairs facing a small round table, a single closed neutral folder on the table, warm off-white seamless architectural background, soft diffused daylight, subtle shadows, restrained cool-gray and muted deep-green accents, calm clinical editorial photography aesthetic. No people, faces, clinicians, product containers, medicine, medical equipment, prescription pad, stethoscope, laptop screen, words, letters, numbers, logo, claims, price, shopping bag, parcel, or purchase cues. This image must communicate a guided Care pathway, not merchandise, not treatment outcome, not a direct-order item, and not proof of availability. Square 1:1 composition with generous responsive crop safe margins.",
  },
  {
    assetId: "xenios-fallback-journey-request-v1",
    taxonomyKey: "request",
    semanticClass: "non_product_pathway",
    useRestriction:
      "review_pathway_scene_only_no_approval_quote_or_purchase_claim",
    filePath:
      "docs/product-imagery/evidence/pre-v3-nonapprovable/xenios-journey-request-fallback-v1-5ea6de457764.webp",
    publicPath: null,
    sha256: "5ea6de4577648a5536e951c8ac69e59140f06bc58404e899d5ce70bb862eaf43",
    byteSize: 18982,
    width: 1024,
    height: 1024,
    altDescription: "Abstract review checkpoint representing request access or quote follow-up; no product is depicted.",
    prompt:
      "Non-product pathway fallback asset for Xenios Research request-access or quote-required catalog entries. A premium restrained studio still life with a blank matte off-white document folio, one small brushed-silver review token, and a muted deep-green translucent checkpoint arch, on a warm off-white seamless background with soft diffused daylight and subtle shadows. No product container, merchandise, parcel, person, hand, pen, signature, words, letters, numbers, logo, currency, price, shopping cart, barcode, medical object, claim, or approval mark. This image must communicate review and follow-up, not direct purchase, not an accepted quote, not availability, and not an exact product. Square 1:1 composition with generous responsive crop safe margins.",
  },
];

// Presentation taxonomy only. Commerce state is deliberately absent.
export const DOSAGE_FORM_TO_IMAGE_CLASS = new Map([
  ["Lyophilized Vial", "peptide_lyophilized_vial"],
  ["Compounded Vial / Liquid", "liquid_vial"],
  ["Injectable Solution", "injectable_solution_vial"],
  ["Capsule", "capsule_bottle"],
  ["Capsule / Bottle", "capsule_bottle"],
  ["Supplement Unit", "supplement_retail_unit_neutral"],
  ["Tablet", "tablet_bottle"],
  ["Troche", "troche_container"],
  ["ODT / Tablet", "odt_container"],
  ["Nasal Spray", "nasal_spray"],
  ["Topical Cream", "cream_tube_or_pump"],
  ["Topical Gel / Serum", "gel_tube_or_pump"],
  ["Topical Serum", "serum_dropper_or_pump"],
  ["Solution", "solution_container_neutral"],
  ["Liquid", "oral_liquid_neutral"],
  ["Included Supply", "syringe_supply_pack_neutral"],
  ["Listed Unit", "packaging_unverified"],
  ["Shipping Service", "shipping_service"],
  ["Form not stated", "neutral_product_identity"],
]);
