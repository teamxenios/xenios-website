"""Form-neutral label cards for BLEND rows whose form no source states (CLAUDE-1). Build and verify in one tool.

usage (from the claude1 scratch root):
  build:  python -I -B -X utf8 fn/fn_blend.py build <template.svg> <released-content.json> <facts-ref> <claim-ref> <out-dir>
                                               --approved <KAN-n/n> <CODE>=<blend-label-facts.json> [...]
  verify: python -I -B -X utf8 <batch>/tools/fn_blend.py verify <batch-dir> --catalog <json> --bindings <json>
                                               --template <front-label.svg> --released-content <json> [--mutate <name>]

The name is set exactly as the accepted vial blends set it (tools/build_c1.py front_svg: the exact name, broken only after
" + "), and the amount is the accepted blend form: the components' amounts in name order joined by "/", with their one
unit. Then the form line is removed, the content caption becomes "LISTED AMOUNT" and the per-vial basis is dropped, so the
card states no form and shows no container. Components in different units are refused. No generative model is used.
"""
import hashlib, json, os, re, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'c1014s', 'tools-src'), os.path.join(HERE, '..', 'scripts')):
    if os.path.isdir(p) and p not in sys.path:
        sys.path.append(p)
from PIL import Image, ImageChops
import svg_label_render as R
import fn_lib as L
import build_c1 as B

TOOLS = ['fn_blend.py', 'fn_lib.py', 'build_c1.py', 'xr_compose.py', 'svg_label_render.py', 'wpf_kern.ps1']
CAT, BND = 'catalog/member-safe-master-offerings.generated.json', 'catalog/master-offering-bindings.generated.json'
GENERIC = [r'GEN-GRP', r'purity', r'assay', r'\bCAS\b', r'\blot\b', r'expir', r'\bstore\b', r'storage', r'\boral', r'mg/kg', r'mg/mL', r'inject',
           r'\bdose', r'dosage', r'human', r'patient', r'sterile', r'QR', r'certif', r'FDA', r'approved', r'compounded', r'\$', r'price',
           r'\bGMP\b', r'\bUSP\b', r'%', r'batch[- ]tested', r'cold[- ]chain', r'blend', r'combination', r'combined', r'synerg', r'ratio']


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def front_clear(amount):
    """The front-label part of the accepted blend clearance (build_c1.blend_amount_clear), for the amount without a basis:
    the large amount stays inside its field, and the right-aligned listed amount stays 24 px clear of the line beside it."""
    w = R.measure_text
    if not 158 + w(amount, 98, '780', 0) <= 1450:
        raise ValueError('amount %r does not fit its field: layout review needed' % amount)
    if not 145 + 1250 - w(amount, 38, '820', 0) >= 145 + 58 + w('NONCLINICAL USE ONLY', 27, '650', 2.2) + 24:
        raise ValueError('listed amount %r crowds the classification line: layout review needed' % amount)


def blend_svg(tpl, name, components, fit=True):
    v = dict(name=name, components=components, slug='label-card')
    amount = B.amount_of(v)
    a = B.shared_artwork(tpl, v, 'front')
    if fit:
        a, info = B.set_name_blend(a, name, 1450, '470')          # the accepted blend rule; the gradient rule spans x 150..1450
        front_clear(amount)
    else:
        a, info = B.set_name(a, name, 1450, '470', False)
    if B.template_text_left(a, v, info.get('lines', ())):
        raise ValueError('template name left in the artwork')
    a, n = re.subn(r'\n?[ \t]*<text[^>]*>LYOPHILIZED VIAL</text>', '', a)
    if n != 1:
        raise ValueError('form line not found')
    a = L._need(a, '>NOMINAL CONTENT</text>', '>LISTED AMOUNT</text>')
    a = L._need(a, '>%s per vial</text>' % amount, '>%s</text>' % amount)
    a, n1 = re.subn(r'(<title[^>]*>)[^<]*(</title>)', lambda m: m.group(1) + 'Xenios %s %s label design' % (name, amount) + m.group(2), a, count=1)
    a, n2 = re.subn(r'(<desc[^>]*>)[^<]*(</desc>)', lambda m: m.group(1) + 'Editable Xenios %s %s label design. It prints the name, the listed '
                    'amounts and the research classification only.' % (name, amount) + m.group(2), a, count=1)
    if n1 != 1 or n2 != 1:
        raise ValueError('title or desc not found')
    lines = info['lines'] if isinstance(info, dict) and info.get('lines') else [name]
    size = info['fontSize'] if isinstance(info, dict) and 'fontSize' in info else None
    return a, amount, lines, size


def expected_lines(lines, amount):
    return ['XENIOS'] + list(lines) + [amount, 'RESEARCH USE ONLY', 'NONCLINICAL USE ONLY', 'LISTED AMOUNT', amount]


def load_sets():
    cat = json.load(open(opt('--catalog', CAT), encoding='utf-8')); bj = json.load(open(opt('--bindings', BND), encoding='utf-8'))
    bl = next(v for v in bj.values() if isinstance(v, list) and v and isinstance(v[0], dict) and 'productControlSku' in v[0])
    return cat, bl


def build():
    argv = sys.argv[2:]
    approved = None
    if '--approved' in argv:
        i = argv.index('--approved'); approved = argv[i + 1]; del argv[i:i + 2]
    template, rel_content, facts_ref, claim_ref, out = argv[:5]
    rows = [a.split('=', 1) for a in argv[5:]]

    def fail(msg):
        raise SystemExit('BUILD REFUSED: ' + msg)
    if os.path.exists(out): fail('output folder exists')
    if sha(template) != L.TEMPLATE_SHA256: fail('template is not the pinned Batch 004 front label master')
    if not (approved and re.fullmatch(r'KAN-\d+/\d+', approved)): fail('the label-card template approval reference is required')
    if not (facts_ref.startswith('KAN-59/') and claim_ref.startswith('KAN-59/')): fail('facts and claim references must be KAN-59 comments')
    cat, bl = load_sets()
    released = {(c['offeringId'], c['sourceVariantId']) for c in json.load(open(rel_content, encoding='utf-8'))['records']}
    tpl = open(template, encoding='utf-8').read()
    variants = []
    for code, facts in rows:
        sku = 'GEN-GRP-' + code
        bs = [b for b in bl if b['productControlSku'] == sku]
        if len(bs) != 1: fail('%s: %d bindings' % (sku, len(bs)))
        pair = (bs[0]['offeringId'], bs[0]['offeringVariantId'])
        pv = [(p, v) for p in cat['products'] for v in p['variants'] if (p['id'], v['id']) == pair]
        recs = [r for r in json.load(open(facts, encoding='utf-8'))['records'] if (r['offeringId'], r['sourceVariantId']) == pair]
        if len(pv) != 1 or len(recs) != 1: fail('%s: catalog rows %d, label records %d' % (sku, len(pv), len(recs)))
        (p, v), r = pv[0], recs[0]; t = r['verifiedStaticText']
        checks = {
            'printable keys': set(t) == {'brand', 'productName', 'components', 'classification', 'productCode'},
            'no form, and the hold': 'form' not in t and bool(r.get('hold')),
            'brand and classification': t.get('brand') == 'Xenios' and t.get('classification') == 'For laboratory research use only.',
            'product code is the bound code': t.get('productCode') == 'Product code ' + sku,
            'one variant, research family, Form not stated': len(p['variants']) == 1 and p['family'] == 'research_peptides_materials' and p['subcategory'] == 'Form not stated',
            'the record names this catalog variant label': r.get('variantLabelOfSource') == v['label'],
            'no released copy (a released blend record is not handled)': pair not in released,
        }
        bad = [k for k, ok in checks.items() if not ok]
        if bad: fail('%s: %s' % (sku, '; '.join(bad)))
        comps = [dict(name=c['name'], amount=c['amount']) for c in t['components']]
        amount = B.amount_of(dict(name=t['productName'], components=comps, slug=sku))      # refuses mixed units
        slug = re.sub(r'[^a-z0-9]+', '-', t['productName'].lower()).strip('-') + '-' + re.sub(r'[^a-z0-9]+', '-', amount.replace(' ', '').lower())
        whole = json.load(open(facts, encoding='utf-8'))
        if whole.get('datasetSha256') != sha(opt('--catalog', CAT)): fail('%s: the label facts were written against another dataset' % sku)
        variants.append(dict(sku=sku, slug=slug, p=p, v=v, t=t, comps=comps, amount=amount, facts=facts, hold=r['hold'],
                             caveat=bool(r.get('labelHasNoComponentSeparator')),
                             terms=B_TERMS.get(t['productName'], [])))
    for d in ('assets', 'labels', 'tools'):
        os.makedirs(os.path.join(out, d))
    for f in TOOLS:
        src = next(os.path.join(d, f) for d in (HERE, os.path.join(HERE, '..', 'c1014s', 'tools-src'), os.path.join(HERE, '..', 'scripts'))
                   if os.path.exists(os.path.join(d, f)))
        shutil.copyfile(src, os.path.join(out, 'tools', f))
    req = {}
    for x in variants:
        tmp = os.path.join(out, 'tools', x['slug'] + '.nofit.svg')
        open(tmp, 'w', encoding='utf-8', newline='\n').write(blend_svg(tpl, x['t']['productName'], x['comps'], fit=False)[0])
        for key, text in R.strings_for_kerning(tmp):
            if text not in req.setdefault(key, []):
                req[key].append(text)
        os.remove(tmp)
    rq, kt = os.path.join(out, 'tools', 'kern-request.json'), os.path.join(out, 'tools', 'kern-table.segoe-ui.json')
    json.dump(req, open(rq, 'w', encoding='utf-8', newline='\n'), indent=1)
    subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', os.path.join(out, 'tools', 'wpf_kern.ps1'),
                    '-InFile', rq, '-OutFile', kt], check=True, timeout=110)
    raw = open(kt, 'rb').read().replace(b'\r\n', b'\n'); open(kt, 'wb').write(raw)
    R.load_kern(kt)

    def art(path, role):
        im = Image.open(path)
        return dict(role=role, relativeAssetPath=os.path.relpath(path, out).replace(os.sep, '/'), bytes=os.path.getsize(path), sha256=sha(path),
                    width=im.size[0], height=im.size[1], format=os.path.splitext(path)[1][1:])
    records = []
    for x in variants:
        name = x['t']['productName']
        svg, amount, lines, size = blend_svg(tpl, name, x['comps'])
        fsvg = os.path.join(out, 'labels', x['slug'] + '-label-design-v1.svg'); open(fsvg, 'w', encoding='utf-8', newline='\n').write(svg)
        fpng = os.path.join(out, 'assets', x['slug'] + '-label-design-v1.png'); R.render(fsvg, fpng)
        label = Image.open(fpng).convert('RGB')
        fwebp = os.path.join(out, 'assets', x['slug'] + '-label-design-v1.webp'); open(fwebp, 'wb').write(L.webp_bytes(label, 92))
        card = L.card_image(label)
        cpng = os.path.join(out, 'assets', x['slug'] + '-label-card-v1.png'); card.save(cpng, optimize=True)
        cwebp = os.path.join(out, 'assets', x['slug'] + '-label-card-v1-1024.webp'); open(cwebp, 'wb').write(L.webp_bytes(card, 89))
        printed = '%s %s' % (name, amount)
        records.append(dict(
            offeringId=x['p']['id'], sourceVariantId=x['v']['id'], quickOrderSku=x['sku'], catalogDisplayName=x['p']['displayName'],
            catalogVariantLabel=x['v']['label'], catalogSubcategory=x['p']['subcategory'],
            catalogDisplayState=[x['p']['displayState'], x['v']['displayState']], canonicalVariant=printed, componentAmounts=x['comps'],
            mediaKind='original_xenios_label_card', websiteArtworkState='pending_independent_file_level_review',
            physicalPackagingState='not_depicted', runtimeLinked=False, publicationAuthorized=False,
            labelFacts=dict(reference=facts_ref, file=os.path.basename(x['facts']), sha256=sha(x['facts']), verifiedStaticText=x['t'], hold=x['hold'],
                            componentSplitCheckableAgainstCatalogLabel=not x['caveat']),
            exactDepictedFacts=dict(printedLines=L.texts_of(svg), nameLines=lines, containerDepicted=False, formStated=False, productCodePrinted=False),
            releasedReviewedCopy=False, extraDoNotPrintTerms=x['terms'], labelNameSetting=dict(fontSizePx=size, lines=lines),
            websiteReviewCandidates=[
                dict(role='primary', altText='Xenios %s label design' % printed, relativeAssetPath='assets/' + x['slug'] + '-label-card-v1-1024.webp', sha256=sha(cwebp)),
                dict(role='labelPreview', altText='Front label artwork for Xenios %s' % printed, relativeAssetPath='assets/' + x['slug'] + '-label-design-v1.webp',
                     sha256=sha(fwebp))],
            artifacts=dict(website_primary=art(cwebp, 'website_primary'), website_source_master=art(cpng, 'website_source_master'),
                           label_master=dict(role='label_master', relativeAssetPath='labels/' + x['slug'] + '-label-design-v1.svg',
                                             bytes=os.path.getsize(fsvg), sha256=sha(fsvg)),
                           label_preview_png=art(fpng, 'label_preview_png'), label_preview=art(fwebp, 'label_preview'))))
    json.dump({x['t']['productName']: x['terms'] for x in variants}, open(os.path.join(out, 'tools', 'extra-terms.json'), 'w', encoding='utf-8', newline='\n'),
              indent=1, ensure_ascii=False)
    manifest = dict(
        schemaVersion=1, batchId='claude1-label-card-' + os.path.basename(os.path.normpath(out)), producer='CLAUDE-1 imagery lane (Claude Code session c16cbf1c)',
        claim=claim_ref, publicationState='review_only_not_runtime', supplierSendPerformed=False, templateApproval=approved,
        formBasis=dict(kind='form_not_stated_label_card', note='The catalog subcategory of every row is "Form not stated" and the label facts state no form. '
                       'The image is a flat label: it states no form and depicts no container.'),
        catalogDataset=dict(file=os.path.basename(CAT), sha256=sha(CAT)), bindingDataset=dict(file=os.path.basename(BND), sha256=sha(BND)),
        releasedContent=dict(file='server/research/master-offerings/data/reviewed-public-content.json', sha256=sha(rel_content)),
        labelTemplate=L.TEMPLATE_REF,
        method=dict(generativeModelUsed=False,
                    label='The accepted Batch 004 front label. The name is set by the accepted blend rule (the exact name, broken only after " + "); the amount '
                          'is the components\' amounts in name order joined by "/". The form line is removed, the content caption reads "LISTED AMOUNT" and '
                          'the per-vial basis is dropped. Preview: WebP quality 92.',
                    card='The label preview scaled to 880 px wide on a plain 1024 x 1024 ground with a soft shadow. Primary: WebP quality 89.'),
        tools=[dict(path='tools/' + f, sha256=sha(os.path.join(out, 'tools', f))) for f in TOOLS + ['kern-table.segoe-ui.json', 'kern-request.json', 'extra-terms.json']],
        records=records)
    json.dump(manifest, open(os.path.join(out, 'media-batch.v1.json'), 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
    table = '\n'.join('| %s | `%s` | `%s` | `%s` |' % (r['canonicalVariant'], r['offeringId'], r['sourceVariantId'], r['quickOrderSku']) for r in records)
    readme = ('# Label-card artwork for blend rows: CLAUDE-1 label-card batch\n\nThis batch delivers Xenios website artwork for %d research catalog blend '
              'variants whose form no source states. It is for review only: nothing here is linked into the runtime. The founder approved the label-card '
              'template in %s; publication and physical production are not approved.\n\n| Variant | Offering | Source variant | Product code |\n|---|---|---|---|\n%s\n\n'
              '## What prints, and why there is no container\n\nFor every variant the catalog subcategory is "Form not stated" and the label facts (%s) state no '
              'form, so the image is the label alone, flat, on a plain ground. It prints the brand Xenios, the product name from the label facts, the listed '
              'amounts, "Research Use Only" and "Nonclinical use only". The name is set as on the accepted vial blends: the exact name, broken only after " + ". '
              'The amount is the components\' amounts in the order of the name, joined by "/", with their one unit; the caption above its repeat reads "Listed '
              'amount". Nothing is said about the combination: no "blend", "ratio" or "combined" wording, no product code, no form line and no "per" basis.\n\n'
              'Rows whose components are stated in different units are not in this batch.%s\n\n## Files\n\nFor each variant: '
              '`assets/<variant>-label-card-v1-1024.webp` (website primary, 1024 x 1024) and its lossless `.png` master; '
              '`labels/<variant>-label-design-v1.svg` (editable label master, 1600 x 1000) with its `.webp` and `.png` preview. `media-batch.v1.json` holds '
              'the mapping, printed lines, label-fact source and every file\'s bytes, sha256 and dimensions. `tools/` holds the build, render and verification '
              'sources and the measured kern table.\n\nNo generative image model was used; all lettering is set from installed fonts.\n\n## Verify\n\n```text\n'
              'python -I -B -X utf8 tools/fn_blend.py verify <this dir> --catalog <member-safe-master-offerings.generated.json> --bindings '
              '<master-offering-bindings.generated.json> --template <Batch 004 front label svg> --released-content <reviewed-public-content.json> [--label-facts <the label-facts json>]\n```\n\n'
              'With `--label-facts` it also checks each record against the label-facts file itself. It needs Windows with Segoe UI.\n\n## Review\n\nIndependent file-level review goes to KAN-31; the producer cannot be the reviewer. Root or the '
              'integrator integrates accepted artwork.\n') % (len(records), approved, table, facts_ref, ''.join(
        ' For %s the catalog variant label writes the components as one run of text, so the assignment of each amount to its component '
        'rests on the label-facts record and cannot be cross-checked against that label; the card prints the amounts in the order that label gives them.'
        % r['canonicalVariant'] for r in records if not r['labelFacts']['componentSplitCheckableAgainstCatalogLabel']))
    open(os.path.join(out, 'README.md'), 'w', encoding='utf-8', newline='\n').write(readme)
    print(json.dumps(dict(out=out, records=len(records), layouts=[(r['quickOrderSku'], r['canonicalVariant'], r['labelNameSetting']) for r in records])))


def verify():
    batch = sys.argv[2]
    template, rel = opt('--template'), opt('--released-content')
    mutate = opt('--mutate')
    passed, failed = [], []

    def check(ok, what):
        (passed if ok else failed).append(what)
    m = json.load(open(os.path.join(batch, 'media-batch.v1.json'), encoding='utf-8'))
    released = {(c['offeringId'], c['sourceVariantId']) for c in json.load(open(rel, encoding='utf-8'))['records']}
    facts_p = opt('--label-facts')
    facts = {(r['offeringId'], r['sourceVariantId']): r for r in json.load(open(facts_p, encoding='utf-8'))['records']} if facts_p else None
    r0 = m['records'][0]
    if mutate == 'sha': r0['artifacts']['website_primary']['sha256'] = '0' * 64
    if mutate == 'form': r0['websiteReviewCandidates'][0]['altText'] += ', lyophilized vial'
    if mutate == 'blendword': r0['websiteReviewCandidates'][0]['altText'] += ' blend'
    if mutate == 'component': r0['labelFacts']['verifiedStaticText']['components'][0]['amount'] = '999 mg'
    if mutate == 'order': r0['labelFacts']['verifiedStaticText']['components'].reverse()
    if mutate == 'variant': r0['sourceVariantId'] = 'mov_00000000000000000000'
    if mutate == 'approval': m['templateApproval'] = None
    if mutate == 'released': released.add((r0['offeringId'], r0['sourceVariantId']))
    if mutate == 'facts': r0['labelFacts']['verifiedStaticText']['productName'] += ' Plus'
    check(m.get('publicationState') == 'review_only_not_runtime' and bool(re.fullmatch(r'KAN-\d+/\d+', m.get('templateApproval') or '')),
          'review-only batch that names the approval of the label-card template')
    check(sha(template) == m['labelTemplate']['sha256'] == L.TEMPLATE_SHA256, 'label template is the pinned accepted front label master')
    cat, bl = load_sets()
    check(sha(opt('--catalog', CAT)) == m['catalogDataset']['sha256'] and sha(opt('--bindings', BND)) == m['bindingDataset']['sha256'], 'datasets are the pinned ones')
    check(sha(rel) == m['releasedContent']['sha256'], 'released content file is the pinned one')
    for t in m['tools']:
        p = os.path.join(batch, t['path'])
        check(os.path.exists(p) and sha(p) == t['sha256'], 'tool hash ' + t['path'])
    var = {v['id']: (p, v) for p in cat['products'] for v in p['variants']}
    tpl = open(template, encoding='utf-8').read()
    R.load_kern(os.path.join(batch, 'tools', 'kern-table.segoe-ui.json'))
    for r in m['records']:
        tag = r['quickOrderSku']; t = r['labelFacts']['verifiedStaticText']; name = t['productName']
        pv = var.get(r['sourceVariantId'])
        check(pv is not None, 'variant exists in the dataset ' + tag)
        if pv is None:
            continue
        p, v = pv
        bs = [b for b in bl if b['offeringVariantId'] == v['id']]
        check(p['id'] == r['offeringId'] and len(bs) == 1 and bs[0]['productControlSku'] == tag and len(p['variants']) == 1, 'ids and the one binding ' + tag)
        check(p['family'] == 'research_peptides_materials' and p['subcategory'] == 'Form not stated', 'catalog subcategory is "Form not stated" ' + tag)
        check(v['label'] == r['catalogVariantLabel'], 'catalog variant label is the dataset label ' + tag)
        check(set(t) == {'brand', 'productName', 'components', 'classification', 'productCode'} and bool(r['labelFacts'].get('hold')),
              'label facts state no form and carry the form hold ' + tag)
        check((p['id'], v['id']) not in released, 'the row has no released copy that could state a form or an amount differently ' + tag)
        if facts is not None:
            fr = facts.get((p['id'], v['id']))
            check(fr is not None and sha(facts_p) == r['labelFacts']['sha256'] and fr['verifiedStaticText'] == t and fr.get('hold') == r['labelFacts']['hold']
                  and fr.get('variantLabelOfSource') == v['label']
                  and (not fr.get('labelHasNoComponentSeparator')) == r['labelFacts']['componentSplitCheckableAgainstCatalogLabel'],
                  'the record equals the label-facts file, which names this catalog variant label ' + tag)
        comps = [dict(name=c['name'], amount=c['amount']) for c in t['components']]
        check(comps == r['componentAmounts'], 'components are the label facts\' components, in order ' + tag)
        for a in r['artifacts'].values():
            path = os.path.join(batch, a['relativeAssetPath'])
            ok = os.path.exists(path) and os.path.getsize(path) == a['bytes'] and sha(path) == a['sha256']
            if ok and 'width' in a:
                ok = Image.open(path).size == (a['width'], a['height'])
            check(ok, 'file bytes, hash and dimensions %s %s' % (tag, a['role']))
        try:
            svg2, amount, lines, size = blend_svg(tpl, name, comps)
        except (Exception, SystemExit) as e:
            check(False, 'label could not be rebuilt from the record %s: %s' % (tag, str(e)[:140])); continue
        fsvg = os.path.join(batch, r['artifacts']['label_master']['relativeAssetPath'])
        svg = open(fsvg, encoding='utf-8').read()
        texts = L.texts_of(svg)
        printed = '%s %s' % (name, amount)
        check(r['canonicalVariant'] == printed, 'printed variant is the name and the components\' amounts joined by "/" ' + tag)
        check(' '.join(lines) == name and texts == expected_lines(lines, amount) == r['exactDepictedFacts']['printedLines'],
              'label text is exactly the name lines, the amount and the template lines ' + tag)
        alts = {c['role']: c['altText'] for c in r['websiteReviewCandidates']}
        check(alts == {'primary': 'Xenios %s label design' % printed, 'labelPreview': 'Front label artwork for Xenios %s' % printed}, 'alt text ' + tag)
        allp = texts + L.title_desc_of(svg) + list(alts.values())
        check(not [s for s in allp if L.FORM_WORDING.search(s)], 'no form or container wording anywhere ' + tag)
        for pat in GENERIC:
            check(not [s for s in allp if re.search(pat, s, re.I)], 'no do-not-print pattern %r %s' % (pat, tag))
        for term in r['extraDoNotPrintTerms']:
            check(not [s for s in allp if re.search(r'(?<![A-Za-z])' + re.escape(term) + r'(?![A-Za-z])', s, re.I)], 'no compound term %r %s' % (term, tag))
        check(svg2 == svg and size == r['labelNameSetting']['fontSizePx'], 'label master is a rebuild from the record ' + tag)
        label = R.render_image(fsvg).convert('RGB')
        prev = Image.open(os.path.join(batch, r['artifacts']['label_preview_png']['relativeAssetPath'])).convert('RGB')
        check(ImageChops.difference(label, prev).getbbox() is None, 'label preview is pixel-identical to a rebuild ' + tag)
        check(hashlib.sha256(L.webp_bytes(label, 92)).hexdigest() == r['artifacts']['label_preview']['sha256'], 'label preview WebP is the encoded preview ' + tag)
        card = L.card_image(label)
        master = Image.open(os.path.join(batch, r['artifacts']['website_source_master']['relativeAssetPath'])).convert('RGB')
        check(ImageChops.difference(card, master).getbbox() is None, 'card master is pixel-identical to a rebuild ' + tag)
        check(hashlib.sha256(L.webp_bytes(card, 89)).hexdigest() == r['artifacts']['website_primary']['sha256'], 'primary WebP is the encoded card ' + tag)
    for f in failed:
        print('FAIL', f)
    print('%s: %d checks passed, %d failed' % ('FAIL' if failed else 'PASS', len(passed), len(failed)))
    sys.exit(1 if failed else 0)


B_TERMS = {}
if __name__ == '__main__':
    if sys.argv[1] == 'build':
        src = os.path.join(HERE, '..', 'c1014s', 'tools-src', 'c1_variants.py')
        if os.path.exists(src):
            import ast
            s = open(src, encoding='utf-8').read(); i = s.index('EXTRA_TERMS = {'); j = s.index('\n}\n', i) + 2
            B_TERMS.update(ast.literal_eval(s[i + len('EXTRA_TERMS = '):j]))
        build()
    else:
        verify()
