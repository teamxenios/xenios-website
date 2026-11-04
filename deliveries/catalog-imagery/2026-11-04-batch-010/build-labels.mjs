import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.XENIOS_LABEL_SHARP_MODULE || 'sharp');
const batch = fileURLToPath(new URL('.', import.meta.url));
const templates = fileURLToPath(new URL('../2026-11-04-batch-008/labels/', import.meta.url));
const labels = join(batch, 'labels');
const assets = join(batch, 'assets');

function substitute(artwork, expected, replacement) {
  if (!artwork.includes(expected)) {
    throw new Error('Unexpected Batch 008 template. Missing ' + expected);
  }
  return artwork.replaceAll(expected, replacement);
}

await Promise.all([mkdir(labels, { recursive: true }), mkdir(assets, { recursive: true })]);
for (const kind of ['front-artwork', 'wrap-proof']) {
  const template = await readFile(join(templates, 'bpc-157-5mg-' + kind + '-v1.svg'), 'utf8');
  let artwork = substitute(template.replaceAll('\r\n', '\n'), 'BPC-157', 'Dihexa');
  artwork = substitute(artwork, '5 mg', '10 mg');
  if (kind === 'wrap-proof') {
    artwork = substitute(artwork, 'BPC157-5-WRAP-v1', 'DIHEXA-10-WRAP-v1');
    artwork = substitute(artwork, 'GEN-GRP-0264', 'GEN-GRP-0280');
  }

  const stem = 'dihexa-10mg-' + kind + '-v1';
  const svg = Buffer.from(artwork);
  await writeFile(join(labels, stem + '.svg'), svg);
  await sharp(svg).png({ compressionLevel: 9 }).toFile(join(assets, stem + '.png'));
  if (kind === 'front-artwork') {
    await sharp(svg).webp({ quality: 92 }).toFile(join(assets, stem + '.webp'));
  }
}
