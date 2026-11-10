"""Verify one research-capsule artwork batch (CLAUDE-1). Run from the batch folder's parent that holds catalog/, or pass paths.

usage: python -I -B -X utf8 <batch>/tools/cap_verify.py <batch-dir> --catalog <json> --bindings <json> --base <base-render.webp>
                                                          --template <wrap-template.svg> [--allow-dry-run] [--mutate <name>]
                                                          [--released-content <json> --released-media <json>]
A batch whose manifest says formBasisKind released_reviewed_copy needs the two released files and is checked against them.
It never counts a check it could not run as a pass. --mutate applies one named negative control in memory and must FAIL.
"""
import hashlib, io, json, os, re, sys, xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageChops
import cap_compose as C, cap_front as F
import xr_compose as X, svg_label_render as R


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


BATCH = sys.argv[1]
CAT, BND, BASE, TEMPLATE = opt('--catalog'), opt('--bindings'), opt('--base'), opt('--template')
ALLOW_DRY, MUTATE = '--allow-dry-run' in sys.argv, opt('--mutate')
passed, failed = [], []


def check(ok, what):
    (passed if ok else failed).append(what)


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha(p):
    return sha_bytes(open(p, 'rb').read())


m = json.load(open(os.path.join(BATCH, 'media-batch.v1.json'), encoding='utf-8'))
if MUTATE == 'sha':
    m['records'][0]['artifacts']['website_primary']['sha256'] = '0' * 64
if MUTATE == 'code':
    m['records'][0]['websiteReviewCandidates'][0]['altText'] += ' ' + m['records'][0]['quickOrderSku']
if MUTATE == 'count':
    m['records'][0]['websiteReviewCandidates'][1]['altText'] += ', bottle of 60 capsules'
if MUTATE == 'declaration':
    m['records'][0]['formBasis'] = dict(kind='xenios_packaging_declaration', reference='KAN-225/00000', form='Research capsules', status='RECORDED')
if MUTATE == 'amount':
    m['records'][0]['labelFacts']['verifiedStaticText']['amount'] = '250 mcg'
if MUTATE == 'variant':
    m['records'][0]['sourceVariantId'] = 'mov_00000000000000000000'

GENERIC = [r'GEN-GRP', r'per capsule', r'\bcapsules? x ?\d', r'\bx ?\d+\b', r'bottle of', r'\b\d+[- ]count\b', r'\b\d+ capsules\b', r'purity', r'assay',
           r'\blot\b', r'expir', r'\bstore\b', r'storage', r'\boral', r'mg/kg', r'bioavailab', r'\bdose', r'dosage', r'\btake\b', r'QR', r'certif',
           r'FDA', r'approved', r'compounded', r'\$', r'price']
EXTRA = {'Tesofensine': [r'NS ?2330', r'weight', r'appetite', r'obes', r'metabol']}

dry = m.get('publicationState') == 'dry_run_never_publish'
check(m.get('publicationState') in ('review_only_not_runtime', 'dry_run_never_publish'), 'publication state is review-only or dry run')
decl = m.get('packagingDeclaration')
released = m.get('formBasisKind') == 'released_reviewed_copy'
REL_CONTENT, REL_MEDIA = opt('--released-content'), opt('--released-media')
rel_content = rel_media = None
if dry:
    check(ALLOW_DRY, 'DRY RUN batch verified only with --allow-dry-run (never publish)')
elif released and not decl:
    check(bool(REL_CONTENT) and bool(REL_MEDIA), 'the released content and media files are given for a released-copy form basis')
    if REL_CONTENT and REL_MEDIA:
        rel_content = json.load(open(REL_CONTENT, encoding='utf-8'))['records']
        rel_media = json.load(open(REL_MEDIA, encoding='utf-8'))['records']
        if MUTATE == 'servedform':
            for c in rel_content:
                if c['sourceVariantId'] == m['records'][0]['sourceVariantId']:
                    for s in c['content']['specifications']:
                        if s['label'] == 'Form':
                            s['value'] = 'Research tablets'
        if MUTATE == 'servedstrength':
            for c in rel_content:
                if c['sourceVariantId'] == m['records'][0]['sourceVariantId']:
                    for s in c['content']['specifications']:
                        if s['label'] == 'Listed strength':
                            s['value'] = '250 mcg'
else:
    check(bool(decl) and decl.get('kind') == 'xenios_packaging_declaration' and decl.get('status') == 'RECORDED'
          and decl.get('form') == 'Research capsules' and bool(re.fullmatch(r'KAN-\d+/\d+', decl.get('reference', ''))),
          'a recorded research-capsule packaging declaration is in the manifest')
check(sha(BASE) == m['acceptedVisualReference']['sha256'], 'base render is the pinned accepted capsule render')
check(sha(TEMPLATE) == m['labelTemplate']['sha256'], 'label template is the pinned accepted capsule label')
check(sha(CAT) == m['catalogDataset']['sha256'] and sha(BND) == m['bindingDataset']['sha256'], 'datasets are the pinned ones')
for t in m['tools']:
    p = os.path.join(BATCH, t['path'])
    check(os.path.exists(p) and sha(p) == t['sha256'], 'tool hash ' + t['path'])

cat = json.load(open(CAT, encoding='utf-8')); bj = json.load(open(BND, encoding='utf-8'))
bl = next(v for v in bj.values() if isinstance(v, list) and v and isinstance(v[0], dict) and 'productControlSku' in v[0])
var = {v['id']: (p, v) for p in cat['products'] for v in p['variants']}
kt = os.path.join(BATCH, 'tools', 'kern-table.segoe-ui.json')
X.load_kern(kt)
base_im = Image.open(BASE).convert('RGB')
for r in m['records']:
    t = r['labelFacts']['verifiedStaticText']; tag = r['quickOrderSku']
    pv = var.get(r['sourceVariantId'])
    check(pv is not None, 'variant exists in the dataset ' + tag)
    if pv is None:
        continue
    p, v = pv
    bs = [b for b in bl if b['offeringVariantId'] == v['id']]
    check(p['id'] == r['offeringId'] and len(bs) == 1 and bs[0]['productControlSku'] == tag, 'ids and the one binding ' + tag)
    check(p['family'] == 'research_capsules' and p['subcategory'] == 'Capsule / Bottle', 'catalog family and subcategory ' + tag)
    check(v['label'] == '%s %s' % (t['productName'].upper(), t['amount']), 'variant label equals NAME AMOUNT of the label facts ' + tag)
    fb = r['formBasis']
    if decl:
        check(fb.get('reference') == decl.get('reference') and fb.get('form') == 'Research capsules', 'form basis cites the manifest declaration ' + tag)
    elif released and not dry:
        ok = fb.get('kind') == 'released_reviewed_copy' and rel_content is not None
        if ok:
            rc, rm = fb.get('reviewedContent') or {}, fb.get('releasedCapsuleDesigns') or {}
            mine = [c for c in rel_content if (c['offeringId'], c['sourceVariantId']) == (r['offeringId'], r['sourceVariantId'])]
            specs = {s['label']: s['value'] for s in (mine[0]['content'].get('specifications') or [])} if len(mine) == 1 else {}
            fam = {(pp['id'], vv['id']): pp['family'] for pp in cat['products'] for vv in pp['variants']}
            live = [x for x in rel_media if fam.get((x['offeringId'], x['sourceVariantId'])) == 'research_capsules'
                    and x['media'].get('packagingDesign') is True]
            base_name = m['acceptedVisualReference']['path'].rsplit('/', 1)[-1]
            check(sha(REL_CONTENT) == rc.get('sha256') and sha(REL_MEDIA) == rm.get('sha256'), 'released files are the ones the form basis pins ' + tag)
            check(specs.get('Form') == 'Research capsules' == rc.get('form') == t['formLine'],
                  'released reviewed copy for this variant states Form "Research capsules" ' + tag)
            check(specs.get('Listed strength') == t['amount'] == rc.get('listedStrength'),
                  'released reviewed copy for this variant states the listed strength ' + tag)
            check(len(live) == rm.get('researchCapsulePairsWithPackagingDesign') and len(live) >= 1
                  and any(x['media']['primary']['href'].endswith('/' + base_name) for x in live),
                  'the base render is a released capsule packaging design and the count of released capsule designs is as recorded ' + tag)
            check(fb.get('packagingDeclaration') is None and bool(re.fullmatch(r'[0-9a-f]{40}', fb.get('release', ''))),
                  'the form basis claims no packaging declaration and names the release ' + tag)
        else:
            check(False, 'form basis is the released reviewed copy, checked against the released files ' + tag)
    else:
        check(fb.get('kind') == 'none' and dry, 'without a manifest declaration the record claims no form basis and the batch is a dry run ' + tag)
    # files
    for a in r['artifacts'].values():
        path = os.path.join(BATCH, a['relativeAssetPath'])
        ok = os.path.exists(path) and os.path.getsize(path) == a['bytes'] and sha(path) == a['sha256']
        if ok and 'width' in a:
            ok = Image.open(path).size == (a['width'], a['height'])
        check(ok, 'file bytes, hash and dimensions %s %s' % (tag, a['role']))
    for c in r['websiteReviewCandidates']:
        check(sha(os.path.join(BATCH, c['relativeAssetPath'])) == c['sha256'], 'website candidate pin %s %s' % (tag, c['role']))
    # the front label prints exactly the verified text plus the template lines
    fsvg = os.path.join(BATCH, r['artifacts']['front_label_master']['relativeAssetPath'])
    root = ET.parse(fsvg).getroot(); ns = '{http://www.w3.org/2000/svg}'
    texts = [''.join(e.itertext()) for e in root.iter(ns + 'text')]
    expect = ['XENIOS', t['productName'], t['strengthCaption'].upper(), t['amount'], t['formLine'].upper(), 'RESEARCH USE ONLY', 'NONCLINICAL USE ONLY']
    check(texts == expect, 'front label text is exactly the verified text and the template lines ' + tag)
    printed = texts + [''.join(e.itertext()) for e in root.iter(ns + 'title')] + [''.join(e.itertext()) for e in root.iter(ns + 'desc')] \
        + [c['altText'] for c in r['websiteReviewCandidates']] + [c.get('caption', '') for c in r['websiteReviewCandidates']]
    for pat in GENERIC + EXTRA.get(t['productName'], []):
        hit = [s for s in printed if re.search(pat, s, re.I)]
        check(not hit, 'no do-not-print pattern %r in any printed string or alt text %s' % (pat, tag))
    check(t['productName'] in EXTRA, 'compound-specific do-not-print patterns are defined for ' + t['productName'])
    # recompute: render and front label are reproducible from the pinned tools, and the render differs from the base only where declared
    try:
        im, layout = C.compose_image(BASE, t['productName'], t['amount'])
    except Exception as e:
        check(False, 'render could not be rebuilt from the record %s: %s' % (tag, str(e)[:120]))
        continue
    master = Image.open(os.path.join(BATCH, r['artifacts']['website_source_master']['relativeAssetPath'])).convert('RGB')
    check(ImageChops.difference(im, master).getbbox() is None, 'render master is pixel-identical to a rebuild ' + tag)
    check(layout == r['renderLayout'], 'render layout is the declared one ' + tag)
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=89, method=6)
    check(sha_bytes(buf.getvalue()) == r['artifacts']['website_primary']['sha256'], 'primary WebP is the encoded master ' + tag)
    d = ImageChops.difference(base_im, master)
    for rows in layout['erasedRows']:
        d.paste((0, 0, 0), (layout['erasedColumns'][0], rows[0], layout['erasedColumns'][1] + 1, rows[1] + 1))
    check(d.getbbox() is None, 'render equals the accepted base outside the declared rectangles ' + tag)
    changed = ImageChops.difference(base_im, master).getbbox()
    check(changed is not None, 'render differs from the base (name or strength was re-set) ' + tag)
    try:
        svg, _ = F.front_svg(TEMPLATE, t['productName'], t['amount'], kt)
        R.load_kern(kt)
        rebuilt = R.render_image(fsvg).convert('RGB')
    except Exception as e:
        check(False, 'front label could not be rebuilt from the record %s: %s' % (tag, str(e)[:120]))
        continue
    check(svg == open(fsvg, encoding='utf-8').read(), 'front label master is a rebuild of the template with the verified text ' + tag)
    wpath = os.path.join(BATCH, r['artifacts']['wrap_proof_master']['relativeAssetPath'])
    try:
        wsvg, _ = F.wrap_svg(TEMPLATE, t['productName'], t['amount'], tag, kt)
        wre = R.render_image(wpath).convert('RGB')
    except Exception as e:
        check(False, 'wrap proof could not be rebuilt from the record %s: %s' % (tag, str(e)[:120]))
        continue
    check(wsvg == open(wpath, encoding='utf-8').read(), 'wrap proof master is a rebuild of the template with the verified text ' + tag)
    wprev = Image.open(os.path.join(BATCH, r['artifacts']['wrap_proof_preview_png']['relativeAssetPath'])).convert('RGB')
    check(ImageChops.difference(wre, wprev).getbbox() is None, 'wrap preview is pixel-identical to a rebuild ' + tag)
    wtexts = [''.join(e.itertext()) for e in ET.parse(wpath).getroot().iter(ns + 'text')]
    check(t['productCode'] == 'Product code ' + tag, 'verified product code is the record code ' + tag)
    check(sorted(s for s in wtexts if 'GEN-GRP' in s) == sorted([tag, tag + '-WRAP-v1']), 'the wrap prints the product code once and the proof id once ' + tag)
    for pat in [g for g in GENERIC if g != r'GEN-GRP'] + EXTRA.get(t['productName'], []):
        check(not [s for s in wtexts if re.search(pat, s, re.I)], 'no do-not-print pattern %r on the wrap %s' % (pat, tag))
    prev = Image.open(os.path.join(BATCH, r['artifacts']['front_label_preview_png']['relativeAssetPath'])).convert('RGB')
    check(ImageChops.difference(rebuilt, prev).getbbox() is None, 'front preview is pixel-identical to a rebuild ' + tag)

for f in failed:
    print('FAIL', f)
print('%s: %d checks passed, %d failed%s' % ('FAIL' if failed else 'PASS', len(passed), len(failed), ' (DRY RUN, never publish)' if dry else ''))
sys.exit(1 if failed else 0)
