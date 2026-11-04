import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.XENIOS_LABEL_SHARP_MODULE || 'sharp');
const batchDir = fileURLToPath(new URL('.', import.meta.url));
const predecessorDir = fileURLToPath(new URL('../2026-11-04-batch-004/labels/', import.meta.url));
const assetDir = join(batchDir, 'assets');
const labelDir = join(batchDir, 'labels');

const variants = [
  { mg: 5, sku: 'GEN-GRP-0264' },
  { mg: 15, sku: 'GEN-GRP-0263' },
];

const pendingPanel = `  <g class="sans" id="back-panel-proof-only" transform="translate(1650 205)">
    <text x="0" y="0" class="eyebrow">SUPPLIER PROOF NOTES</text>
    <rect x="0" y="25" width="595" height="5" rx="2" fill="url(#rule)"/>

    <g transform="translate(0 70)">
      <rect width="595" height="150" rx="16" fill="#f2edf8" stroke="#9c8cad" stroke-width="2"/>
      <text x="22" y="38" class="label">TRACEABILITY AREA</text>
      <text x="22" y="81" class="value">Reserved for supplier-issued data</text>
      <text x="22" y="118" class="note">Blank on the proof artwork.</text>
    </g>

    <g transform="translate(0 245)">
      <rect width="595" height="130" rx="16" fill="#fff8e9" stroke="#d6aa50" stroke-width="2"/>
      <text x="22" y="38" class="label">STORAGE COPY</text>
      <text x="22" y="78" class="value">Supplier-approved copy required</text>
      <text x="22" y="110" class="note">Reserved area pending confirmation.</text>
    </g>

    <g transform="translate(0 405)">
      <rect width="595" height="130" rx="16" fill="#fff8e9" stroke="#d6aa50" stroke-width="2"/>
      <text x="22" y="38" class="label">LEGAL ATTRIBUTION</text>
      <text x="22" y="78" class="value">Supplier legal identity required</text>
      <text x="22" y="110" class="note">Reserved area pending confirmation.</text>
    </g>

    <g transform="translate(0 565)">
      <rect width="595" height="140" rx="16" fill="#edf6fa" stroke="#5c9bb4" stroke-width="2"/>
      <text x="22" y="38" class="label">MATCHED DOCUMENTATION</text>
      <text x="22" y="78" class="value">Product-specific document pending</text>
      <text x="22" y="111" class="note">Any destination requires a verified match.</text>
    </g>
  </g>
`;

function replaceRequired(text, search, replacement) {
  if (typeof search === 'string' ? !text.includes(search) : !search.test(text)) {
    throw new Error('Unexpected predecessor template. Missing ' + search);
  }
  return text.replace(search, replacement);
}

function sharedArtwork(template, mg) {
  let artwork = template.replaceAll('10 mg', mg + ' mg').replaceAll('version 3', 'version 1');
  artwork = replaceRequired(artwork, /<desc id="desc">[^<]*<\/desc>/,
    '<desc id="desc">Editable Xenios BPC-157 ' + mg + ' mg per vial packaging design. Lyophilized vial for laboratory research use only. Physical dimensions are pending the supplier dieline.</desc>');
  artwork = artwork.replaceAll('TOTAL CONTENT', 'NOMINAL CONTENT');
  // Preserve the prominent short amount and qualify each content field per vial.
  return replaceRequired(artwork, /(<text[^>]+(?:x="1250"|x="790")[^>]+>)\d+ mg(<\/text>)/,
    (_match, openingTag, closingTag) => openingTag + mg + ' mg per vial' + closingTag);
}

function wrapArtwork(template, mg, sku) {
  let artwork = sharedArtwork(template, mg);
  artwork = replaceRequired(artwork, 'BPC157-10-WRAP-v3', 'BPC157-' + mg + '-WRAP-v1');
  artwork = replaceRequired(artwork, 'GEN-GRP-0262', sku);
  artwork = replaceRequired(artwork, '>' + mg + ' mg</text>\n    <text x="0" y="295"',
    '>' + mg + ' mg per vial</text>\n    <text x="0" y="295"');
  artwork = replaceRequired(artwork, '    <text x="0" y="545" class="label">QUICK ORDER SKU</text>',
    '    <text x="0" y="510" class="note">For laboratory research use only.</text>\n' +
    '    <text x="0" y="545" class="label">QUICK ORDER SKU</text>');
  artwork = replaceRequired(artwork, /  <g class="sans" id="back-panel"[^]*?(?=\n  <g class="sans" fill="#554b60">)/, pendingPanel);
  artwork = replaceRequired(artwork,
    'panel divisions and dashed safe boundary are proof annotations; dimensions, bleed, seam, material, adhesive, finish and winding remain supplier inputs.',
    'Panel divisions, dashed lines and back-panel notes are proof guides. The supplier will confirm dimensions, bleed, seam and material.');
  return replaceRequired(artwork,
    'This proof establishes fixed website artwork and supplier handoff intent. It does not establish printed/in-use packaging.',
    'Packaging design proof. Supplier confirmation and physical production approval are pending.');
}

await Promise.all([mkdir(assetDir, { recursive: true }), mkdir(labelDir, { recursive: true })]);
const [frontTemplate, wrapTemplate] = await Promise.all(
  ['front-artwork', 'wrap-proof'].map((kind) =>
    readFile(join(predecessorDir, 'bpc-157-10mg-' + kind + '-v3.svg'), 'utf8')
      .then((source) => source.replaceAll('\r\n', '\n'))),
);
for (const { mg, sku } of variants) {
  const designs = [
    ['front-artwork', sharedArtwork(frontTemplate, mg)],
    ['wrap-proof', wrapArtwork(wrapTemplate, mg, sku)],
  ];
  for (const [kind, svg] of designs) {
    const stem = 'bpc-157-' + mg + 'mg-' + kind + '-v1';
    const svgBytes = Buffer.from(svg);
    await writeFile(join(labelDir, stem + '.svg'), svgBytes);
    await sharp(svgBytes).png({ compressionLevel: 9 }).toFile(join(assetDir, stem + '.png'));
    if (kind === 'front-artwork') {
      await sharp(svgBytes).webp({ quality: 92 }).toFile(join(assetDir, stem + '.webp'));
    }
  }
}
