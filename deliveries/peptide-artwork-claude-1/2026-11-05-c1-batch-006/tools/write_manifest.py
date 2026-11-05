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
FOLDER = os.path.basename(os.path.normpath(BATCH))     # <yyyy-mm-dd>-c1-batch-<nnn>, the repository folder name
_m = re.fullmatch(r'(\d{4}-\d{2}-\d{2})-c1-batch-(\d{3})', FOLDER)
if not _m or 'c1-' + _m.group(2) != LABEL:
    raise SystemExit('batch folder %s does not match label %s' % (FOLDER, LABEL))
REL = 'deliveries/peptide-artwork-claude-1/' + FOLDER
BATCH_ID = 'claude1-peptide-artwork-%s-batch-%s' % (_m.group(1), LABEL)
RELEASE = '19d10e0495aed917b3d1fcf2844109e5e1cc6915'
IMAGERY_BASE = dict(branch='codex/catalog-imagery-20261104', sha='e41ce5bbf76e3c65b04cf620a74acab44411f680')
CATALOG_SHA = '76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5'
BINDINGS_SHA = '587595e68cb1b47a8ee7f55728eb65d64c2f55f36ad242080232743a9c53ae24'
CAPTION = 'Packaging design shown. Current packaging may differ.'
VARIANTS = json.load(open(VARIANTS_JSON, encoding='utf-8'))
BOLD, REG = 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/segoeui.ttf'
CORRECTIONS = {'c1-003': [dict(
    date='2026-11-04', requestedBy='KAN-31/10775',
    previousCommit='b189bc92a33cdfc9b7c3082ce8ddbcd56b1ca65e',
    previousManifestSha256='1d861c18a65c3a65ed2bcf0c961718c606cb2a40ee5b3307a78883f1d02aef96',
    change='verify_c1.py, build_c1.py and write_manifest.py hash text files as committed, with LF line ends, so a Windows checkout with core.autocrlf (CRLF) verifies, including the release dataset joins. The tool files that had been committed with CRLF line ends (build_c1.py, xr_compose.py, wpf_kern.ps1 and kern-table.segoe-ui.json) are now LF like every other text file; only their line ends changed. artworkVersion is the exact product code for every record, as corrected for C1-002 in KAN-31/10737; verify_c1.py checks it. No image or label master changed.')],
    'c1-004': [dict(
        date='2026-11-05', requestedBy='KAN-59/11283',
        previousCommit='423081518440d189fc789df7d02942d59bad92f8',
        previousManifestSha256='e53c7c273816c20be53e9ecd89531e6d0de1dc6130c5dbca5d984705949f2f49',
        change='Metadata only. Each record now carries formBasis, citing Xenios\'s packaging declaration KAN-225/11259 as the authority '
               'for the printed vial and the per-vial amount basis; the manifest carries packagingDeclaration and lists KAN-225/11259 under '
               'authority. labelFacts still cites KAN-59/10855 as the source of each product\'s name, amount, product code and classification. '
               'tools/variants.json carries the declaration per record; c1_variants.py, write_manifest.py and verify_c1.py carry and check '
               'a declaration on form-bearing facts as well as form-neutral ones. No render, label master, preview or contact sheet changed.')]}
DRY_RUN = os.environ.get('C1_DRY_RUN') == '1'      # local rehearsal only: placeholders allowed and the output is marked never-publish
CLAIM_REFS = {'c1-002': 'KAN-59/10695', 'c1-003': 'KAN-59/10722', 'c1-004': 'KAN-59/10869', 'c1-005': 'KAN-59/11292', 'c1-006': 'KAN-59/11292'}     # the post that claimed each batch
if LABEL not in CLAIM_REFS and not DRY_RUN:
    raise SystemExit('no claim reference recorded for %s; add it to CLAIM_REFS' % LABEL)
CLAIM_REF = CLAIM_REFS.get(LABEL, 'DRY-RUN-UNCLAIMED')


def amounts_text():
    other = sorted({int(v['mg']) for v in VARIANTS if int(v['mg']) != 10})
    if not other:
        return 'none in this batch'
    nums = [str(x) for x in other]
    return (', '.join(nums[:-1]) + ' and ' + nums[-1] if len(nums) > 1 else nums[0]) + ' mg here'


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
        head = open(p, encoding='utf-8').read(400)
        a.update(width=int(re.search(r'width="(\d+)"', head).group(1)), height=int(re.search(r'height="(\d+)"', head).group(1)))
    return a


def contact_sheet(path):
    n = len(VARIANTS)
    cols = min(5, n); rows = math.ceil(n / cols)
    W = 1800; cw = (W - 60) // max(cols, 5); rs = cw - 20; lh = round(rs * 262 / 420)     # cells keep the five-column size in small batches
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
        decl = v.get('packagingDeclaration')
        form_neutral = 'form' not in vst
        if decl:
            # The printed vial and per-vial basis come from Xenios's packaging declaration, not the facts.
            if (decl.get('kind') != 'xenios_packaging_declaration' or decl.get('form') != 'Lyophilized vial'
                    or decl.get('amountBasis') != 'per vial'
                    or not (DRY_RUN or re.fullmatch(r'KAN-\d+/\d+', decl.get('reference', '')))):
                raise SystemExit('packaging declaration unusable for ' + v['slug'])
            if form_neutral:
                if vst['amount'] != '%d mg' % mg:
                    raise SystemExit('form-neutral facts unusable for ' + v['slug'])
                form_ok, amount_ok = True, True
            else:
                # Form-bearing facts (KAN-59/11283): the declaration supersedes their form line as the basis; the printed
                # text must still equal the facts.
                if not decl.get('supersedesFactsForm'):
                    raise SystemExit('declaration on form-bearing facts must mark supersedesFactsForm: ' + v['slug'])
                form_ok = vst.get('form') == 'Lyophilized vial'
                amount_ok = vst['amount'] == '%d mg per vial' % mg
        else:
            if form_neutral:
                raise SystemExit('form-neutral facts need a packaging declaration: ' + v['slug'])
            form_ok = vst.get('form') == 'Lyophilized vial'
            amount_ok = vst['amount'] == '%d mg per vial' % mg
        if (vst['productName'] != name or not amount_ok or vst['productCode'] != 'Product code ' + v['sku']
                or not form_ok or vst['classification'] != 'For laboratory research use only.' or vst['brand'] != 'Xenios'):
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
            artworkVersion='%s-WEB-SUPPLIER-v1' % v['sku'],
            mediaKind='original_xenios_website_render', websiteArtworkState='pending_independent_file_level_review',
            physicalPackagingState='design', runtimeLinked=False, publicationAuthorized=False,
            labelFacts=dict(reference=v['labelFactsRef'], file=v['labelFactsFile'], sha256=v['labelFactsSha256'], verifiedStaticText=vst,
                            **({'formNeutral': True, 'hold': v.get('labelFactsHold')} if form_neutral else {})),
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
        if decl:
            rec['formBasis'] = dict(decl)
            if form_neutral:
                rec['formBasis']['note'] = ('The verified label facts state no form. The vial and the per-vial amount basis printed on this artwork '
                                           'are Xenios\'s own packaging decision under the referenced declaration, not a statement about the selected source.')
            else:
                rec['formBasis']['note'] = ('The verified label facts state the form Lyophilized vial and a per-vial amount; that form came from the '
                                           'catalog\'s generated subcategory, which KAN-31/10870 found is not a source statement. The vial and the '
                                           'per-vial amount basis printed on this artwork are Xenios\'s own packaging decision under the referenced '
                                           'declaration, not a statement about the selected source. The product name, amount, product code and '
                                           'classification keep the label-fact source in labelFacts.')
        records.append(rec)
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
        authority=['KAN-59/10615', 'KAN-225/10616', 'KAN-225/10638', 'KAN-225/10644', 'KAN-225/10683', CLAIM_REF],
        labelFactSources=[dict(reference='KAN-6/10624', note='Session 3 static artwork facts: product code wording')] + [sources[k] for k in sorted(sources)],
        publicationState=('dry_run_never_publish' if DRY_RUN else 'review_only_not_runtime'), supplierSendPerformed=False,
        requiredMountedViewportsAfterReview=[320, 390, 768, 1280],
        method=dict(
            render='Accepted Batch 004 render is the base. Rows 567-671 (name) or 567-742 (name and amount) of columns 448-807 are refilled by per-column linear interpolation between clean label rows with matched grain (sigma 0.67); every other pixel is byte-identical to the base. Type: Segoe UI Bold, name 91.6 px with -0.034 em tracking (matched to the base render, IoU 0.86), amount 63.2 px (IoU 0.90). Long names are fitted to the rule width and centred on the original cap band, then raised if needed so a descender stays 9 px above the amount digits. Amounts other than 10 mg are re-set at the base amount size and position. A full-size name with a descender stops the build for a layout review. A name below 70% size that contains a space stacks on two lines with the amount scaled by the same factor, but only when stacking sets the name larger than one line does; otherwise it stays on one line.',
            labels='Front and wrap SVG masters are the Batch 004 v3 templates transformed exactly as Batch 008 build-labels.mjs does (port verified byte-identical on BPC-157 5 mg), plus the compound name, a name size fit for long names, and the side-panel field label PRODUCT CODE.',
            previews='Previews are drawn from the SVG masters by tools/svg_label_render.py with Segoe UI faces (nearest weight, ties to the heavier face) and OpenType pair kerning measured through WPF (tools/wpf_kern.ps1). Against the accepted Batch 004 previews the mean absolute difference is 0.80 (front) and 1.61 (wrap) of 255.'),
        differencesFromBatch008=[
            'Wrap side panel field label reads PRODUCT CODE (Batch 008: QUICK ORDER SKU), matching the Session 3 and CLAUDE-2 wording "Product code GEN-GRP-xxxx".',
            'Batch 008 previews resolve font-weight 800 (XENIOS, RESEARCH USE ONLY) to Segoe UI Bold; these previews follow the accepted Batch 004 previews, which resolve it to Segoe UI Black.',
            'No supplier PDF proofs in this batch; the wrap SVG and its preview carry the same proof notes.',
            'The wrap proof id is the exact product code (for example %s-WRAP-v1), not code-amount, because code-amount can spell a fragment name that label facts forbid (KISSPEPTIN-10 in C1-002).' % VARIANTS[0]['sku']],
        changesFromC1001=[
            'The build reads its variants (names, amounts, codes, verified label text) from tools/variants.json instead of a constant.',
            'Amounts other than 10 mg (%s) re-set the amount line: at the base size and position under a one-line name, or inside the stack under a stacked name, as in C1-001.' % amounts_text(),
            'A full-size name with a descender now stops the build instead of being placed (no name in this batch is one).',
            'Each record carries its label-fact source (reference, file, sha256, verified static text) and any per-compound do-not-print terms.',
            'The wrap proof id and the artworkVersion are the exact product code instead of code-amount (C1-001: IPAMORELIN-10-WRAP-v1 and IPAMORELIN-10-WEB-SUPPLIER-v1), because code-amount spelled KISSPEPTIN-10, a forbidden fragment name; verify_c1.py checks both. C1-001 has no such collision and keeps code-amount.',
            'The batch files were built by the copies in tools/ (tools/build_c1.py build), and verify_c1.py --recompute rebuilds every image from them.'],
        contactSheet=cs, tools=tools, records=records)
    if LABEL == 'c1-003':
        manifest['changesFromC1002'] = [
            'None in the build, render, label or verification method: build_c1.py, xr_compose.py, svg_label_render.py, verify_c1.py, '
            'c1_variants.py and wpf_kern.ps1 are byte-identical to C1-002 as corrected for KAN-31/10737. write_manifest.py now derives '
            'the batch-specific text (claim reference, example code, amounts) from the variants. The kern table covers this batch\'s strings.']
    if LABEL == 'c1-004':
        manifest['changesFromC1003'] = [
            'None in the build, render or label method: build_c1.py, xr_compose.py, svg_label_render.py and wpf_kern.ps1 are '
            'byte-identical to C1-003 (commit c5b93b3a). c1_variants.py adds the reference for label-fact batch 05 and per-compound '
            'do-not-print terms for SS-31 and Retatrutide. write_manifest.py takes the date in the batch path and id from the batch folder '
            'name, and keeps contact-sheet cells at the five-column size when a batch has fewer than five variants. The kern table covers '
            'the strings in this batch. Since the 2026-11-05 correction (see corrections), c1_variants.py, write_manifest.py and verify_c1.py '
            'also carry and check the packaging declaration, and c1_variants.py holds the references and terms of the later label-fact batches.']
    if LABEL in ('c1-005', 'c1-006'):
        neutral = sum(1 for v in VARIANTS if 'form' not in v['verifiedStaticText'])
        form_note = ('%d of %d records have form-neutral label facts: they state the name, the amount in mg, the product code and the '
                     'classification, and no form. For those records the printed vial and the per-vial amount basis rest on the packaging '
                     'declaration alone; labelFacts keeps CLAUDE-2\'s hold note and formBasis cites the declaration.' % (neutral, len(VARIANTS)))
        if LABEL == 'c1-005':
            manifest['changesFromC1004'] = [
                'One change in the render method: xr_compose.py stacks a name that falls below 70% size only when stacking sets it larger '
                'than one line does. Melanotan II is the first name where it would not (one line 63.0 px; stacked, 62.29 px with the amount '
                'at 42.98 px), so it stays on one line. No earlier record changes: under C1-004\'s copy and this one, every record of C1-001 to '
                'C1-004 and the other 23 records of this batch get the same layout, and Thymosin Alpha-1 (C1-001, C1-003) still stacks.',
                'None in the build, label or verification method: build_c1.py, svg_label_render.py, wpf_kern.ps1 and verify_c1.py are '
                'byte-identical to C1-004 as corrected (commit 7a488755). c1_variants.py adds per-compound do-not-print '
                'terms that the label facts list and the C1-004 copy lacked: for this batch, arousal for PT-141, and Epithalamine, regulatory '
                'and indication for Epithalon; for batch C1-006, the developer codes of Liraglutide and Semaglutide, semaglutide and its '
                'combination product for Cagrilintide, and the approved medicine\'s brand name and syndrome wording for SS-31. '
                'write_manifest.py records the claim references of C1-005 and C1-006 and the change notes of both. The kern table covers '
                'the strings in this batch.',
                form_note]
        else:
            manifest['changesFromC1005'] = [
                'None: build_c1.py, xr_compose.py, svg_label_render.py, wpf_kern.ps1, verify_c1.py, c1_variants.py and write_manifest.py '
                'are byte-identical to C1-005\'s copies. The kern table covers the strings in this batch.',
                form_note]
    decls = {json.dumps({k: x for k, x in v['packagingDeclaration'].items() if k != 'supersedesFactsForm'}, sort_keys=True)
             for v in VARIANTS if v.get('packagingDeclaration')}
    if decls:
        if len(decls) != 1:
            raise SystemExit('records cite different packaging declarations')
        manifest['packagingDeclaration'] = json.loads(decls.pop())
        if manifest['packagingDeclaration']['reference'] not in manifest['authority']:
            manifest['authority'].append(manifest['packagingDeclaration']['reference'])
    if LABEL in CORRECTIONS:
        manifest['corrections'] = CORRECTIONS[LABEL]
    json.dump(manifest, open(os.path.join(BATCH, 'media-batch.v1.json'), 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
    print('records', len(records), 'contact sheet', cs['sha256'][:16], cs['width'], cs['height'])


if __name__ == '__main__':
    main()
