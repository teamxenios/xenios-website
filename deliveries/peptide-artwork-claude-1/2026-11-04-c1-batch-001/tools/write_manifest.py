"""Write the C1-001 contact sheet and media-batch manifest from the files on disk.

This repository is public: internal source evidence (workbook rows, selected sources) is never written here.

usage: python -I -X utf8 write_manifest.py <batch_dir> <catalog_json> <bindings_json>
Every hash, byte count and dimension is read from the delivered files; offering, variant and binding
ids are read from the hash-pinned release datasets.

Correction (2026-11-04, KAN-31/10732): the first manifest (commit a7f43426) cited only CLAUDE-2 label-fact
batch 01, which covers KPV. Ipamorelin, Selank and Thymosin Alpha-1 come from batch 02 (KAN-59/10667). The
manifest now cites both batches, and each record names its own label-fact source. Text files are committed with LF
line ends and hashed that way, so a Windows checkout with core.autocrlf verifies (as found for C1-002 in KAN-31/10737).
"""
import hashlib, json, os, sys
from PIL import Image, ImageDraw, ImageFont

BATCH, CATALOG, BINDINGS = sys.argv[1], sys.argv[2], sys.argv[3]
REL = 'deliveries/peptide-artwork-claude-1/2026-11-04-c1-batch-001'
BATCH_ID = 'claude1-peptide-artwork-2026-11-04-batch-c1-001'
RELEASE = '19d10e0495aed917b3d1fcf2844109e5e1cc6915'
IMAGERY_BASE = dict(branch='codex/catalog-imagery-20261104', sha='e41ce5bbf76e3c65b04cf620a74acab44411f680')
CATALOG_SHA = '76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5'
BINDINGS_SHA = '587595e68cb1b47a8ee7f55728eb65d64c2f55f36ad242080232743a9c53ae24'
CAPTION = 'Packaging design shown. Current packaging may differ.'
VARIANTS = [
    dict(slug='ipamorelin-10mg', name='Ipamorelin', code='IPAMORELIN', mg=10, offeringId='mo_e9e1c849f7549246cb89',
         sourceVariantId='mov_80aaef9ddc11edab6c89', sku='GEN-GRP-0302', facts='batch-02'),
    dict(slug='kpv-10mg', name='KPV', code='KPV', mg=10, offeringId='mo_bb39fc388cb58003b1f8',
         sourceVariantId='mov_15eddad2da8035493bd6', sku='GEN-GRP-0306', facts='batch-01'),
    dict(slug='selank-10mg', name='Selank', code='SELANK', mg=10, offeringId='mo_d045624d6f5d00d2cda2',
         sourceVariantId='mov_99e4c4e045d188c3026f', sku='GEN-GRP-0331', facts='batch-02'),
    dict(slug='thymosin-alpha-1-10mg', name='Thymosin Alpha-1', code='THYMOSINALPHA1', mg=10, offeringId='mo_f23a8023a45df853f6e1',
         sourceVariantId='mov_ba80c9a61870131db0cf', sku='GEN-GRP-0350', facts='batch-02'),
]
# CLAUDE-2's verified label facts, by batch. Each record names the batch that holds its exact offering.
LABEL_FACTS = {
    'batch-01': dict(reference='KAN-59/10654', file='research-batch-01.label-facts.json',
                     sha256='2a7b93e1c71234811fc1adc8651be54a7e5d28b8115bdb2633533387b2cb163c'),
    'batch-02': dict(reference='KAN-59/10667', file='research-batch-02.label-facts.json',
                     sha256='186a9673b12ac3931ca5f455f7c722ad7c56b574ff618f35936c198663cccccf'),
}


TEXT_EXT = ('.svg', '.json', '.py', '.ps1', '.md', '.txt')


def canon(path):
    """The committed bytes: text files (TEXT_EXT) with CRLF folded back to LF, because they are committed with LF and a
    Windows checkout with core.autocrlf rewrites them; PNG and WebP files as they are."""
    data = open(path, 'rb').read()
    return data.replace(b'\r\n', b'\n') if path.lower().endswith(TEXT_EXT) else data


def sha(path):
    return hashlib.sha256(canon(path)).hexdigest()


def art(role, rel, fmt):
    p = os.path.join(BATCH, rel)
    a = dict(role=role, relativeAssetPath=REL + '/' + rel.replace(os.sep, '/'), format=fmt, bytes=len(canon(p)), sha256=sha(p))
    if fmt in ('png', 'webp'):
        w, h = Image.open(p).size
        a.update(width=w, height=h)
    elif fmt == 'svg':
        import re
        head = open(p, encoding='utf-8').read(400)
        a.update(width=int(re.search(r'width="(\d+)"', head).group(1)), height=int(re.search(r'height="(\d+)"', head).group(1)))
    return a


def contact_sheet(path):
    W, H = 1800, 1180
    sheet = Image.new('RGB', (W, H), (246, 244, 250))
    d = ImageDraw.Draw(sheet)
    fb = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 30)
    fr = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 19)
    fs = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 16)
    d.text((40, 28), 'Xenios peptide artwork - CLAUDE-1 batch C1-001 (review only, not runtime)', font=fb, fill=(23, 16, 38))
    d.text((40, 70), 'Base: accepted Batch 004 BPC-157 10 mg v3 render; only the name line (and, for Thymosin Alpha-1, the amount) re-set in Segoe UI Bold. '
                     'Caption: "' + CAPTION + '"', font=fr, fill=(84, 74, 104))
    for i, v in enumerate(VARIANTS):
        x0 = 30 + i * 440
        r = Image.open(os.path.join(BATCH, 'assets', v['slug'] + '-website-render-v1-1024.webp')).convert('RGB').resize((420, 420), Image.LANCZOS)
        sheet.paste(r, (x0, 115))
        f = Image.open(os.path.join(BATCH, 'assets', v['slug'] + '-front-artwork-v1.png')).convert('RGB').resize((420, 262), Image.LANCZOS)
        sheet.paste(f, (x0, 550))
        y = 828
        d.text((x0, y), '%s %d mg' % (v['name'], v['mg']), font=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 24), fill=(23, 16, 38))
        for line in (v['sku'], v['offeringId'], v['sourceVariantId']):
            y += 30 if line == v['sku'] else 24
            d.text((x0, y), line, font=fs, fill=(84, 74, 104))
        # card-size legibility check: what a phone thumbnail shows
        for j, px in enumerate((72, 120)):
            t = Image.open(os.path.join(BATCH, 'assets', v['slug'] + '-website-render-v1-1024.webp')).convert('RGB').resize((px, px), Image.LANCZOS)
            sheet.paste(t, (x0 + j * 140, 1000 + (120 - px)))
        d.text((x0 + 280, 1080), '72 / 120 px', font=fs, fill=(120, 110, 140))
    d.text((40, 1140), 'Front label previews are drawn from the editable SVG masters (Segoe UI, kerning measured with WPF). '
                       'Wrap proofs and hashes: media-batch.v1.json.', font=fs, fill=(120, 110, 140))
    sheet.save(path, optimize=True)


def main():
    if sha(CATALOG) != CATALOG_SHA or sha(BINDINGS) != BINDINGS_SHA:
        raise SystemExit('release dataset hash mismatch')
    cat = json.load(open(CATALOG, encoding='utf-8'))
    bind = json.load(open(BINDINGS, encoding='utf-8'))
    blist = bind if isinstance(bind, list) else next(v for v in bind.values() if isinstance(v, list))
    report = {r['slug']: r for r in json.load(open(os.path.join(BATCH, 'tools', 'build-report.json'), encoding='utf-8'))}
    contact_sheet(os.path.join(BATCH, 'contact-sheet-v1.png'))
    records = []
    for v in VARIANTS:
        prod = next(p for p in cat['products'] if p['id'] == v['offeringId'])
        var = next(x for x in prod['variants'] if x['id'] == v['sourceVariantId'])
        b = [x for x in blist if x.get('offeringVariantId') == v['sourceVariantId']]
        if len(b) != 1 or b[0]['productControlSku'] != v['sku'] or b[0]['offeringId'] != v['offeringId']:
            raise SystemExit('binding mismatch for ' + v['slug'])
        if prod['displayName'] != v['name'] or prod['subcategory'] != 'Lyophilized Vial' or prod['family'] != 'research_peptides_materials':
            raise SystemExit('catalog fact mismatch for ' + v['slug'])
        if var['label'].lower() != ('%s %d mg' % (v['name'], v['mg'])).lower():
            raise SystemExit('variant label mismatch for ' + v['slug'])
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
        records.append(dict(
            offeringId=v['offeringId'], sourceVariantId=v['sourceVariantId'], quickOrderSku=v['sku'],
            quickOrderProductId=b[0]['productId'], quickOrderVariantId=b[0]['variantId'],
            canonicalName=prod['canonicalName'], canonicalVariant='%s %d mg' % (v['name'], v['mg']), catalogVariantLabel=var['label'],
            nominalAmountPerVialMg=v['mg'], form='Lyophilized vial', classification='For laboratory research use only.',
            artworkVersion='%s-%d-WEB-SUPPLIER-v1' % (v['code'], v['mg']),
            mediaKind='original_xenios_website_render', websiteArtworkState='pending_independent_file_level_review',
            physicalPackagingState='design', runtimeLinked=False, publicationAuthorized=False,
            labelFacts=dict(LABEL_FACTS[v['facts']]),
            exactDepictedFacts=dict(brand='Xenios', productName=v['name'], amountOnRender='%d mg' % v['mg'],
                                    amountOnLabel='%d mg per vial' % v['mg'], form='Lyophilized vial',
                                    classificationOnArtwork=['Research Use Only', 'Nonclinical use only', 'For laboratory research use only.'],
                                    productCodeOnWrap=v['sku']),
            renderLayout=dict(mode=lay['mode'], runs=[dict(text=r['text'], fontSizePx=r['size'], baselineRow=r['baseline'], inkBox=r['inkBox'])
                                                      for r in lay['runs']], erasedRows=lay['eraseRows'], erasedColumns=[448, 807]),
            labelNameSetting=dict(front=report[s]['frontNameFit'], wrapFrontPanel=report[s]['wrapNameFit']),
            websiteReviewCandidates=[
                dict(role='primary', altText='Xenios %s %d mg lyophilized vial packaging design' % (v['name'], v['mg']), caption=CAPTION,
                     relativeAssetPath=arts['website_primary']['relativeAssetPath'], sha256=arts['website_primary']['sha256']),
                dict(role='label_detail', altText='Xenios %s %d mg per vial front label design for research use' % (v['name'], v['mg']), caption=CAPTION,
                     relativeAssetPath=arts['front_preview_web']['relativeAssetPath'], sha256=arts['front_preview_web']['sha256']),
            ],
            artifacts=arts))
    tools = []
    for f in sorted(os.listdir(os.path.join(BATCH, 'tools'))):
        p = os.path.join(BATCH, 'tools', f)
        tools.append(dict(path=REL + '/tools/' + f, bytes=len(canon(p)), sha256=sha(p)))
    cs = art('contact_sheet', 'contact-sheet-v1.png', 'png')
    manifest = dict(
        schemaVersion=1, batchId=BATCH_ID, producer='CLAUDE-1 peptide artwork lane (Claude Code session c16cbf1c)',
        releaseBaseline=RELEASE, imageryBase=IMAGERY_BASE,
        catalogDataset=dict(path='server/research/master-offerings/data/member-safe-master-offerings.generated.json', sha256=CATALOG_SHA, bytes=len(canon(CATALOG))),
        bindingDataset=dict(path='server/research/master-offerings/data/master-offering-bindings.generated.json', sha256=BINDINGS_SHA, bytes=len(canon(BINDINGS))),
        acceptedVisualReference=dict(reference='KAN-31/10627', path='deliveries/catalog-imagery/2026-11-04-batch-004/assets/bpc-157-10mg-website-render-v3.png',
                                     sha256='674868e8914407fb65c3495bff77b92a9335b9a6dc900264a8b5d84c27d9017b'),
        labelTemplates=[dict(path='deliveries/catalog-imagery/2026-11-04-batch-004/labels/bpc-157-10mg-front-artwork-v3.svg', sha256='716d79fc7aed61485099fcf9f31a902ca30ac40cf2606901ed192f99206f4e4a'),
                        dict(path='deliveries/catalog-imagery/2026-11-04-batch-004/labels/bpc-157-10mg-wrap-proof-v3.svg', sha256='529370fb98e0984b0d8227963d93cf4fb857bd3e96d997d89055c62c608004b6')],
        authority=['KAN-59/10615', 'KAN-225/10616', 'KAN-225/10638', 'KAN-225/10644'],
        labelFactSources=['KAN-6/10624 (Session 3 static artwork facts)', 'KAN-59/10654 (CLAUDE-2 label facts, research-batch-01.label-facts.json sha256 2a7b93e1c71234811fc1adc8651be54a7e5d28b8115bdb2633533387b2cb163c)',
                          'KAN-59/10667 (CLAUDE-2 label facts, research-batch-02.label-facts.json sha256 186a9673b12ac3931ca5f455f7c722ad7c56b574ff618f35936c198663cccccf)'],
        corrections=[dict(
            date='2026-11-04', requestedBy='KAN-31/10732',
            previousCommit='a7f43426ec3270c3f25270b4a37bf1633a2bbeb1',
            previousManifestSha256='3adfb80ce82762f4b74a634b727a495f1a7764794ceadb6e004d69258e7835f8',
            change='The previous manifest cited only label-fact batch 01, which covers KPV. It now also cites batch 02 (KAN-59/10667), the source for Ipamorelin, Selank and Thymosin Alpha-1, and each record names its label-fact source in labelFacts. As found for C1-002 in KAN-31/10737, verify_c1.py, build_c1.py and write_manifest.py now hash text files as committed, with LF line ends, so a Windows checkout with core.autocrlf (CRLF) verifies. The tool files that had been committed with CRLF line ends (build_c1.py, xr_compose.py, wpf_kern.ps1, kern-table.segoe-ui.json and build-report.json) are now LF like every other text file; only their line ends changed. No image or label master changed.')],
        publicationState='review_only_not_runtime', supplierSendPerformed=False,
        requiredMountedViewportsAfterReview=[320, 390, 768, 1280],
        method=dict(
            render='Accepted Batch 004 render is the base. Rows 567-671 (name) or 567-742 (name and amount) of columns 448-807 are refilled by per-column linear interpolation between clean label rows with matched grain (sigma 0.67); every other pixel is byte-identical to the base. Type: Segoe UI Bold, name 91.6 px with -0.034 em tracking (matched to the base render, IoU 0.86), amount 63.2 px (IoU 0.90); long names fit to the rule width; a name below 70% size stacks on two lines with the amount scaled by the same factor.',
            labels='Front and wrap SVG masters are the Batch 004 v3 templates transformed exactly as Batch 008 build-labels.mjs does (port verified byte-identical on BPC-157 5 mg), plus the compound name, a name size fit for long names, and the side-panel field label PRODUCT CODE.',
            previews='Previews are drawn from the SVG masters by tools/svg_label_render.py with Segoe UI faces (nearest weight, ties to the heavier face) and OpenType pair kerning measured through WPF (tools/wpf_kern.ps1). Against the accepted Batch 004 previews the mean absolute difference is 0.80 (front) and 1.61 (wrap) of 255.'),
        differencesFromBatch008=[
            'Wrap side panel field label reads PRODUCT CODE (Batch 008: QUICK ORDER SKU), matching the Session 3 and CLAUDE-2 wording "Product code GEN-GRP-xxxx".',
            'Batch 008 previews resolve font-weight 800 (XENIOS, RESEARCH USE ONLY) to Segoe UI Bold; these previews follow the accepted Batch 004 previews, which resolve it to Segoe UI Black.',
            'No supplier PDF proofs in this batch; the wrap SVG and its preview carry the same proof notes.'],
        contactSheet=cs, tools=tools, records=records)
    json.dump(manifest, open(os.path.join(BATCH, 'media-batch.v1.json'), 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
    print('records', len(records), 'contact sheet', cs['sha256'][:16], cs['width'], cs['height'])


if __name__ == '__main__':
    main()
