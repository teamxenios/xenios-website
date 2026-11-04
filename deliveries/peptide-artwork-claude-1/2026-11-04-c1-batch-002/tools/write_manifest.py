"""Write a CLAUDE-1 batch's contact sheet and media-batch manifest from the files on disk (C1-002 onward).

This repository is public: internal source evidence (workbook rows, selected sources, local paths) is never written here.

usage: python -I -X utf8 write_manifest.py <batch_dir> <catalog_json> <bindings_json> <variants_json> <batch_label, e.g. c1-002>
Every hash, byte count and dimension is read from the delivered files; offering, variant and binding ids are
read from the hash-pinned release datasets; printed text comes from the verified label facts in variants.json.
"""
import hashlib, json, math, os, re, sys
from PIL import Image, ImageDraw, ImageFont

BATCH, CATALOG, BINDINGS, VARIANTS_JSON, LABEL = sys.argv[1:6]
if not re.fullmatch(r'c1-\d{3}', LABEL):
    raise SystemExit('batch label must look like c1-002')
REL = 'deliveries/peptide-artwork-claude-1/2026-11-04-%s-batch-%s' % (LABEL.split('-')[0], LABEL.split('-')[1])
BATCH_ID = 'claude1-peptide-artwork-2026-11-04-batch-%s' % LABEL
RELEASE = '19d10e0495aed917b3d1fcf2844109e5e1cc6915'
IMAGERY_BASE = dict(branch='codex/catalog-imagery-20261104', sha='e41ce5bbf76e3c65b04cf620a74acab44411f680')
CATALOG_SHA = '76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5'
BINDINGS_SHA = '587595e68cb1b47a8ee7f55728eb65d64c2f55f36ad242080232743a9c53ae24'
CAPTION = 'Packaging design shown. Current packaging may differ.'
VARIANTS = json.load(open(VARIANTS_JSON, encoding='utf-8'))
BOLD, REG = 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/segoeui.ttf'


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def art(role, rel, fmt):
    p = os.path.join(BATCH, rel)
    a = dict(role=role, relativeAssetPath=REL + '/' + rel.replace(os.sep, '/'), format=fmt, bytes=os.path.getsize(p), sha256=sha(p))
    if fmt in ('png', 'webp'):
        w, h = Image.open(p).size
        a.update(width=w, height=h)
    elif fmt == 'svg':
        head = open(p, encoding='utf-8').read(400)
        a.update(width=int(re.search(r'width="(\d+)"', head).group(1)), height=int(re.search(r'height="(\d+)"', head).group(1)))
    return a


def contact_sheet(path):
    n = len(VARIANTS)
    cols = min(5, n); rows = math.ceil(n / cols)
    W = 1800; cw = (W - 60) // cols; rs = cw - 20; lh = round(rs * 262 / 420)
    block = rs + 15 + lh + 15 + 30 + 3 * 22 + 15 + 120 + 25
    H = 115 + rows * block + 50
    sheet = Image.new('RGB', (W, H), (246, 244, 250))
    d = ImageDraw.Draw(sheet)
    fb, fr, fs = ImageFont.truetype(BOLD, 30), ImageFont.truetype(REG, 19), ImageFont.truetype(REG, 15)
    d.text((40, 28), 'Xenios peptide artwork - CLAUDE-1 batch %s (review only, not runtime)' % LABEL.upper(), font=fb, fill=(23, 16, 38))
    d.text((40, 70), 'Base: accepted Batch 004 BPC-157 10 mg v3 render; only the name line and, where it changes, the amount line '
                     're-set in Segoe UI Bold. Caption: "' + CAPTION + '"', font=fr, fill=(84, 74, 104))
    for i, v in enumerate(VARIANTS):
        x0 = 30 + (i % cols) * cw; y0 = 115 + (i // cols) * block
        prim = Image.open(os.path.join(BATCH, 'assets', v['slug'] + '-website-render-v1-1024.webp')).convert('RGB')
        sheet.paste(prim.resize((rs, rs), Image.LANCZOS), (x0, y0))
        f = Image.open(os.path.join(BATCH, 'assets', v['slug'] + '-front-artwork-v1.png')).convert('RGB').resize((rs, lh), Image.LANCZOS)
        sheet.paste(f, (x0, y0 + rs + 15))
        y = y0 + rs + 15 + lh + 15
        d.text((x0, y), '%s %d mg' % (v['name'], v['mg']), font=ImageFont.truetype(BOLD, 22), fill=(23, 16, 38))
        y += 30
        for line in (v['sku'], v['offeringId'], v['sourceVariantId']):
            d.text((x0, y), line, font=fs, fill=(84, 74, 104)); y += 22
        y += 15
        for j, px in enumerate((72, 120)):        # what a phone thumbnail shows
            sheet.paste(prim.resize((px, px), Image.LANCZOS), (x0 + j * 100, y + (120 - px)))
        d.text((x0 + 230, y + 100), '72 / 120 px', font=fs, fill=(120, 110, 140))
    d.text((40, H - 40), 'Front label previews are drawn from the editable SVG masters (Segoe UI, kerning measured with WPF). '
                         'Wrap proofs, label-fact sources and hashes: media-batch.v1.json.', font=fs, fill=(120, 110, 140))
    sheet.save(path, optimize=True)


def main():
    if sha(CATALOG) != CATALOG_SHA or sha(BINDINGS) != BINDINGS_SHA:
        raise SystemExit('release dataset hash mismatch')
    cat = json.load(open(CATALOG, encoding='utf-8'))
    bind = json.load(open(BINDINGS, encoding='utf-8'))
    blist = bind if isinstance(bind, list) else next(v for v in bind.values() if isinstance(v, list))
    report = {r['slug']: r for r in json.load(open(os.path.join(BATCH, 'tools', 'build-report.json'), encoding='utf-8'))}
    contact_sheet(os.path.join(BATCH, 'contact-sheet-v1.png'))
    records, sources = [], {}
    for v in VARIANTS:
        name, mg = v['name'], int(v['mg'])
        prod = next(p for p in cat['products'] if p['id'] == v['offeringId'])
        var = next(x for x in prod['variants'] if x['id'] == v['sourceVariantId'])
        b = [x for x in blist if x.get('offeringVariantId') == v['sourceVariantId']]
        if len(b) != 1 or b[0]['productControlSku'] != v['sku'] or b[0]['offeringId'] != v['offeringId']:
            raise SystemExit('binding mismatch for ' + v['slug'])
        var_ok = v.get('nameVariance') and v['nameVariance']['catalogDisplayName'] == prod['displayName'] and prod['displayName'].lower() == name.lower()
        if (prod['displayName'] != name and not var_ok) or prod['subcategory'] != 'Lyophilized Vial' or prod['family'] != 'research_peptides_materials':
            raise SystemExit('catalog fact mismatch for ' + v['slug'])
        if var['label'].lower() != ('%s %d mg' % (name, mg)).lower():
            raise SystemExit('variant label mismatch for ' + v['slug'])
        vst = v['verifiedStaticText']
        if (vst['productName'] != name or vst['amount'] != '%d mg per vial' % mg or vst['productCode'] != 'Product code ' + v['sku']
                or vst['form'] != 'Lyophilized vial' or vst['classification'] != 'For laboratory research use only.' or vst['brand'] != 'Xenios'):
            raise SystemExit('label facts disagree with variant for ' + v['slug'])
        sources[v['labelFactsRef']] = dict(reference=v['labelFactsRef'], file=v['labelFactsFile'], sha256=v['labelFactsSha256'], author='CLAUDE-2')
        s = v['slug']
        arts = dict(
            website_primary=art('website_primary', 'assets/%s-website-render-v1-1024.webp' % s, 'webp'),
            website_source_master=art('website_source_master', 'assets/%s-website-render-v1.png' % s, 'png'),
            front_editable_master=art('front_editable_master', 'labels/%s-front-artwork-v1.svg' % s, 'svg'),
            front_preview=art('front_preview', 'assets/%s-front-artwork-v1.png' % s, 'png'),
            front_preview_web=art('front_preview_web', 'assets/%s-front-artwork-v1.webp' % s, 'webp'),
            wrap_editable_master=art('wrap_editable_master', 'labels/%s-wrap-proof-v1.svg' % s, 'svg'),
            wrap_preview=art('wrap_preview', 'assets/%s-wrap-proof-v1.png' % s, 'png'),
            wrap_preview_web=art('wrap_preview_web', 'assets/%s-wrap-proof-v1.webp' % s, 'webp'),
        )
        lay = report[s]['renderLayout']
        rec = dict(
            offeringId=v['offeringId'], sourceVariantId=v['sourceVariantId'], quickOrderSku=v['sku'],
            quickOrderProductId=b[0]['productId'], quickOrderVariantId=b[0]['variantId'],
            canonicalName=prod['canonicalName'], catalogDisplayName=prod['displayName'],
            canonicalVariant='%s %d mg' % (name, mg), catalogVariantLabel=var['label'],
            nominalAmountPerVialMg=mg, form='Lyophilized vial', classification='For laboratory research use only.',
            artworkVersion='%s-%d-WEB-SUPPLIER-v1' % (v['code'], mg),
            mediaKind='original_xenios_website_render', websiteArtworkState='pending_independent_file_level_review',
            physicalPackagingState='design', runtimeLinked=False, publicationAuthorized=False,
            labelFacts=dict(reference=v['labelFactsRef'], file=v['labelFactsFile'], sha256=v['labelFactsSha256'], verifiedStaticText=vst),
            exactDepictedFacts=dict(brand='Xenios', productName=name, amountOnRender='%d mg' % mg,
                                    amountOnLabel='%d mg per vial' % mg, form='Lyophilized vial',
                                    classificationOnArtwork=['Research Use Only', 'Nonclinical use only', 'For laboratory research use only.'],
                                    productCodeOnWrap=v['sku']),
            extraDoNotPrintTerms=v.get('extraDoNotPrintTerms') or [],
            renderLayout=dict(mode=lay['mode'], runs=[dict(text=r['text'], fontSizePx=r['size'], baselineRow=r['baseline'], inkBox=r['inkBox'])
                                                      for r in lay['runs']], erasedRows=lay['eraseRows'], erasedColumns=[448, 807],
                              oneLineFitPx=lay.get('oneLineFit'), stackScale=lay.get('k')),
            labelNameSetting=dict(front=report[s]['frontNameFit'], wrapFrontPanel=report[s]['wrapNameFit']),
            websiteReviewCandidates=[
                dict(role='primary', altText='Xenios %s %d mg lyophilized vial packaging design' % (name, mg), caption=CAPTION,
                     relativeAssetPath=arts['website_primary']['relativeAssetPath'], sha256=arts['website_primary']['sha256']),
                dict(role='label_detail', altText='Xenios %s %d mg per vial front label design for research use' % (name, mg), caption=CAPTION,
                     relativeAssetPath=arts['front_preview_web']['relativeAssetPath'], sha256=arts['front_preview_web']['sha256']),
            ],
            artifacts=arts)
        if v.get('nameVariance'):
            rec['nameVariance'] = v['nameVariance']
        records.append(rec)
    tools = []
    for f in sorted(os.listdir(os.path.join(BATCH, 'tools'))):
        p = os.path.join(BATCH, 'tools', f)
        tools.append(dict(path=REL + '/tools/' + f, bytes=os.path.getsize(p), sha256=sha(p)))
    cs = art('contact_sheet', 'contact-sheet-v1.png', 'png')
    manifest = dict(
        schemaVersion=1, batchId=BATCH_ID, producer='CLAUDE-1 peptide artwork lane (Claude Code session c16cbf1c)',
        releaseBaseline=RELEASE, imageryBase=IMAGERY_BASE,
        catalogDataset=dict(path='server/research/master-offerings/data/member-safe-master-offerings.generated.json', sha256=CATALOG_SHA, bytes=os.path.getsize(CATALOG)),
        bindingDataset=dict(path='server/research/master-offerings/data/master-offering-bindings.generated.json', sha256=BINDINGS_SHA, bytes=os.path.getsize(BINDINGS)),
        acceptedVisualReference=dict(reference='KAN-31/10627', path='deliveries/catalog-imagery/2026-11-04-batch-004/assets/bpc-157-10mg-website-render-v3.png',
                                     sha256='674868e8914407fb65c3495bff77b92a9335b9a6dc900264a8b5d84c27d9017b'),
        labelTemplates=[dict(path='deliveries/catalog-imagery/2026-11-04-batch-004/labels/bpc-157-10mg-front-artwork-v3.svg', sha256='716d79fc7aed61485099fcf9f31a902ca30ac40cf2606901ed192f99206f4e4a'),
                        dict(path='deliveries/catalog-imagery/2026-11-04-batch-004/labels/bpc-157-10mg-wrap-proof-v3.svg', sha256='529370fb98e0984b0d8227963d93cf4fb857bd3e96d997d89055c62c608004b6')],
        authority=['KAN-59/10615', 'KAN-225/10616', 'KAN-225/10638', 'KAN-225/10644', 'KAN-225/10683', 'KAN-59/10695'],
        labelFactSources=[dict(reference='KAN-6/10624', note='Session 3 static artwork facts: product code wording')] + [sources[k] for k in sorted(sources)],
        publicationState='review_only_not_runtime', supplierSendPerformed=False,
        requiredMountedViewportsAfterReview=[320, 390, 768, 1280],
        method=dict(
            render='Accepted Batch 004 render is the base. Rows 567-671 (name) or 567-742 (name and amount) of columns 448-807 are refilled by per-column linear interpolation between clean label rows with matched grain (sigma 0.67); every other pixel is byte-identical to the base. Type: Segoe UI Bold, name 91.6 px with -0.034 em tracking (matched to the base render, IoU 0.86), amount 63.2 px (IoU 0.90). Long names are fitted to the rule width and centred on the original cap band, then raised if needed so a descender stays 9 px above the amount digits. Amounts other than 10 mg are re-set at the base amount size and position. A full-size name with a descender stops the build for a layout review. A name below 70% size that contains a space stacks on two lines with the amount scaled by the same factor.',
            labels='Front and wrap SVG masters are the Batch 004 v3 templates transformed exactly as Batch 008 build-labels.mjs does (port verified byte-identical on BPC-157 5 mg), plus the compound name, a name size fit for long names, and the side-panel field label PRODUCT CODE.',
            previews='Previews are drawn from the SVG masters by tools/svg_label_render.py with Segoe UI faces (nearest weight, ties to the heavier face) and OpenType pair kerning measured through WPF (tools/wpf_kern.ps1). Against the accepted Batch 004 previews the mean absolute difference is 0.80 (front) and 1.61 (wrap) of 255.'),
        differencesFromBatch008=[
            'Wrap side panel field label reads PRODUCT CODE (Batch 008: QUICK ORDER SKU), matching the Session 3 and CLAUDE-2 wording "Product code GEN-GRP-xxxx".',
            'Batch 008 previews resolve font-weight 800 (XENIOS, RESEARCH USE ONLY) to Segoe UI Bold; these previews follow the accepted Batch 004 previews, which resolve it to Segoe UI Black.',
            'No supplier PDF proofs in this batch; the wrap SVG and its preview carry the same proof notes.',
            'The wrap proof id is the exact product code (for example GEN-GRP-0308-WRAP-v1), not code-amount: KISSPEPTIN-10 would print a fragment name the Kisspeptin label facts forbid.'],
        changesFromC1001=[
            'The build reads its variants (names, amounts, codes, verified label text) from tools/variants.json instead of a constant.',
            'Amounts other than 10 mg (5, 50 and 100 mg here) re-set the amount line at the base size and position.',
            'A full-size name with a descender now stops the build instead of being placed (no name in this batch is one).',
            'Each record carries its label-fact source (reference, file, sha256, verified static text) and any per-compound do-not-print terms.',
            'The wrap proof id is the exact product code instead of code-amount (C1-001: IPAMORELIN-10-WRAP-v1), because KISSPEPTIN-10 is a forbidden fragment name; verify_c1.py checks it. C1-001 has no such collision and is unchanged.',
            'The batch files were built by the copies in tools/ (tools/build_c1.py build), and verify_c1.py --recompute rebuilds every image from them.'],
        contactSheet=cs, tools=tools, records=records)
    json.dump(manifest, open(os.path.join(BATCH, 'media-batch.v1.json'), 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
    print('records', len(records), 'contact sheet', cs['sha256'][:16], cs['width'], cs['height'])


if __name__ == '__main__':
    main()
