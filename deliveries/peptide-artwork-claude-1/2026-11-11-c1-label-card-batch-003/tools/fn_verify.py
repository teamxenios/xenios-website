"""Verify one form-neutral label-card batch (CLAUDE-1).

usage: python -I -B -X utf8 <batch>/tools/fn_verify.py <batch-dir> --catalog <json> --bindings <json> --template <front-label.svg>
                                                         --released-content <json> [--allow-dry-run] [--mutate <name>]
It never counts a check it could not run as a pass. --mutate applies one named negative control in memory and must FAIL.
"""
import hashlib, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageChops
import svg_label_render as R
import fn_lib as L


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


BATCH = sys.argv[1]
CAT, BND, TEMPLATE, REL = opt('--catalog'), opt('--bindings'), opt('--template'), opt('--released-content')
ALLOW_DRY, MUTATE = '--allow-dry-run' in sys.argv, opt('--mutate')
passed, failed = [], []


def check(ok, what):
    (passed if ok else failed).append(what)



def label_binding(label, name, amount, display):
    """(ok, variance). ok with no variance when the catalog variant label is exactly NAME (AMOUNT), case apart. Otherwise the
    printed name must be the catalog display name and the label must be that name with different punctuation, or that name
    followed by one bracketed text, before the same (AMOUNT). The bracketed text is never printed."""
    tail = '(%s)' % amount.replace(' ', '')
    if label.lower() == ('%s %s' % (name, tail)).lower():
        return True, None
    if not label.lower().endswith(tail.lower()) or name != display:
        return False, None
    head = label[:len(label) - len(tail)].strip()
    sq = lambda s: re.sub(r'[^a-z0-9]+', '', s.lower())
    if sq(head) == sq(name):
        return True, dict(catalogVariantLabel=label, printedName=name, kind='punctuation only')
    if re.fullmatch(re.escape(name) + r' \([^()]+\)', head, re.I):
        return True, dict(catalogVariantLabel=label, printedName=name, kind='the label adds one bracketed text after the name; it is not printed')
    return False, None


def sha_b(b):
    return hashlib.sha256(b).hexdigest()


def sha(p):
    return sha_b(open(p, 'rb').read())


GENERIC = [r'GEN-GRP', r'purity', r'assay', r'\bCAS\b', r'\blot\b', r'expir', r'\bstore\b', r'storage', r'\boral', r'mg/kg', r'mg/mL', r'inject',
           r'\bdose', r'dosage', r'human', r'patient', r'sterile', r'QR', r'certif', r'FDA', r'approved', r'compounded', r'\$', r'price',
           r'\bGMP\b', r'\bUSP\b', r'%', r'batch[- ]tested', r'cold[- ]chain']

m = json.load(open(os.path.join(BATCH, 'media-batch.v1.json'), encoding='utf-8'))
released = {(c['offeringId'], c['sourceVariantId']): c['content'] for c in json.load(open(REL, encoding='utf-8'))['records']}
r0 = m['records'][0]
if MUTATE == 'sha':
    r0['artifacts']['website_primary']['sha256'] = '0' * 64
if MUTATE == 'form':
    r0['websiteReviewCandidates'][0]['altText'] += ', lyophilized vial'
if MUTATE == 'code':
    r0['websiteReviewCandidates'][1]['altText'] += ' ' + r0['quickOrderSku']
if MUTATE == 'amount':
    r0['labelFacts']['verifiedStaticText']['amount'] = '11 mg'
if MUTATE == 'variant':
    r0['sourceVariantId'] = 'mov_00000000000000000000'
if MUTATE == 'term':
    r0['websiteReviewCandidates'][0]['altText'] += ' ' + (r0['extraDoNotPrintTerms'] or ['purity'])[0]
if MUTATE == 'released':
    for s in released.get((r0['offeringId'], r0['sourceVariantId']), {}).get('specifications', []):
        if s['label'] == 'Listed amount':
            s['value'] = '999 mg'
if MUTATE == 'releasedform':
    released.setdefault((r0['offeringId'], r0['sourceVariantId']), {'specifications': []})['specifications'].append({'label': 'Form', 'value': 'Lyophilized vial'})
if MUTATE == 'shorten':        # a multi-word name cut to its first word in an alt text
    rs = next(r for r in m['records'] if ' ' in r['labelFacts']['verifiedStaticText']['productName'])
    rs['websiteReviewCandidates'][0]['altText'] += ' and ' + rs['labelFacts']['verifiedStaticText']['productName'].split(' ')[0]
if MUTATE == 'variance':       # a declared name variance that the catalog label does not support
    rv = next(r for r in m['records'] if r.get('nameVarianceFromCatalogLabel'))
    rv['nameVarianceFromCatalogLabel'] = None
if MUTATE == 'approval':
    m['publicationState'] = 'review_only_not_runtime'; m['templateApproval'] = None

dry = m.get('publicationState') == 'dry_run_never_publish'
check(m.get('publicationState') in ('review_only_not_runtime', 'dry_run_never_publish'), 'publication state is review-only or dry run')
if dry:
    check(ALLOW_DRY, 'DRY RUN batch verified only with --allow-dry-run (never publish)')
else:
    check(bool(re.fullmatch(r'KAN-\d+/\d+', m.get('templateApproval') or '')), 'a review-only batch names the approval of the label-card template')
check(m.get('formBasis', {}).get('kind') == 'form_not_stated_label_card', 'form basis is the form-not-stated label card')
check(sha(TEMPLATE) == m['labelTemplate']['sha256'] == L.TEMPLATE_SHA256, 'label template is the pinned accepted front label master')
check(sha(CAT) == m['catalogDataset']['sha256'] and sha(BND) == m['bindingDataset']['sha256'], 'datasets are the pinned ones')
check(sha(REL) == m['releasedContent']['sha256'], 'released content file is the pinned one')
for t in m['tools']:
    p = os.path.join(BATCH, t['path'])
    check(os.path.exists(p) and sha(p) == t['sha256'], 'tool hash ' + t['path'])
extra = json.load(open(os.path.join(BATCH, 'tools', 'extra-terms.json'), encoding='utf-8'))

cat = json.load(open(CAT, encoding='utf-8')); bj = json.load(open(BND, encoding='utf-8'))
bl = next(v for v in bj.values() if isinstance(v, list) and v and isinstance(v[0], dict) and 'productControlSku' in v[0])
var = {v['id']: (p, v) for p in cat['products'] for v in p['variants']}
tpl = open(TEMPLATE, encoding='utf-8').read()
kt = os.path.join(BATCH, 'tools', 'kern-table.segoe-ui.json')
R.load_kern(kt)
seen = set()
for r in m['records']:
    t = r['labelFacts']['verifiedStaticText']; tag = r['quickOrderSku']
    name, amount = t['productName'], t['amount']
    pv = var.get(r['sourceVariantId'])
    check(pv is not None, 'variant exists in the dataset ' + tag)
    if pv is None:
        continue
    p, v = pv
    bs = [b for b in bl if b['offeringVariantId'] == v['id']]
    check(p['id'] == r['offeringId'] and len(bs) == 1 and bs[0]['productControlSku'] == tag and len(p['variants']) == 1, 'ids and the one binding ' + tag)
    check((p['id'], v['id']) not in seen, 'pair appears once ' + tag); seen.add((p['id'], v['id']))
    check(p['family'] == 'research_peptides_materials' and p['subcategory'] == 'Form not stated' == r['catalogSubcategory'],
          'catalog family, and subcategory "Form not stated" ' + tag)
    bound, variance = label_binding(v['label'], name, amount, p['displayName'])
    check(bound and variance == r.get('nameVarianceFromCatalogLabel'),
          'variant label is the facts\' name and amount, or the declared variance of the catalog display name ' + tag)
    check(set(t) == {'brand', 'productName', 'amount', 'classification', 'productCode'} and bool(r['labelFacts'].get('hold')),
          'label facts state no form and carry the form hold ' + tag)
    check(t['productCode'] == 'Product code ' + tag and t['brand'] == 'Xenios' and t['classification'] == 'For laboratory research use only.',
          'verified brand, classification and product code ' + tag)
    specs = {s['label']: s['value'] for s in (released.get((p['id'], v['id'])) or {}).get('specifications') or []}
    has = (p['id'], v['id']) in released
    check(has == r['releasedReviewedCopy'], 'released-copy flag is true to the released file ' + tag)
    check((not has) or specs.get('Listed amount') == amount, 'released copy states this listed amount ' + tag)
    check('Form' not in specs, 'released copy states no form ' + tag)
    check(extra.get(name) == r['extraDoNotPrintTerms'], 'compound terms are the pinned ones ' + tag)
    for a in r['artifacts'].values():
        path = os.path.join(BATCH, a['relativeAssetPath'])
        ok = os.path.exists(path) and os.path.getsize(path) == a['bytes'] and sha(path) == a['sha256']
        if ok and 'width' in a:
            ok = Image.open(path).size == (a['width'], a['height'])
        check(ok, 'file bytes, hash and dimensions %s %s' % (tag, a['role']))
    for c in r['websiteReviewCandidates']:
        check(sha(os.path.join(BATCH, c['relativeAssetPath'])) == c['sha256'], 'website candidate pin %s %s' % (tag, c['role']))
    alts = {c['role']: c['altText'] for c in r['websiteReviewCandidates']}
    check(alts == {'primary': 'Xenios %s %s label design' % (name, amount), 'labelPreview': 'Front label artwork for Xenios %s %s' % (name, amount)},
          'alt text is the name and amount with "label design" ' + tag)
    fsvg = os.path.join(BATCH, r['artifacts']['label_master']['relativeAssetPath'])
    svg = open(fsvg, encoding='utf-8').read()
    texts = L.texts_of(svg)
    check(texts == L.EXPECTED_LINES(name, amount) == r['exactDepictedFacts']['printedLines'], 'label text is exactly the verified text and the template lines ' + tag)
    printed = texts + L.title_desc_of(svg) + list(alts.values())
    check(not [s for s in printed if L.FORM_WORDING.search(s)], 'no form or container wording in any printed string, title, description or alt text ' + tag)
    for pat in GENERIC:
        check(not [s for s in printed if re.search(pat, s, re.I)], 'no do-not-print pattern %r %s' % (pat, tag))
    if ' ' in name:
        lead = name.split(' ')[0]
        cut = [s for s in printed for mm in re.finditer(r'(?<![A-Za-z0-9])' + re.escape(lead) + r'(?![A-Za-z0-9-])', s, re.I)
               if not s[mm.start():].lower().startswith(name.lower())]
        check(not cut, 'the name is never shortened to %r %s' % (lead, tag))
    for term in r['extraDoNotPrintTerms']:
        check(not [s for s in printed if re.search(r'(?<![A-Za-z])' + re.escape(term) + r'(?![A-Za-z])', s, re.I)],
              'no compound term %r %s' % (term, tag))
    try:
        size = L.fit_name(name)
        rebuilt_svg = L.label_svg(tpl, name, amount, size)
        label = R.render_image(fsvg).convert('RGB')
    except Exception as e:
        check(False, 'label could not be rebuilt from the record %s: %s' % (tag, str(e)[:120]))
        continue
    check(size == r['labelNameSetting']['fontSizePx']
          and L.NAME_LEFT + R.measure_text(name, size, L.NAME_WEIGHT, L.NAME_SPACING) <= L.NAME_MAX_RIGHT,
          'name size is the fitted one and the name ends inside the rule ' + tag)
    check(rebuilt_svg == svg, 'label master is a rebuild of the template with the verified text ' + tag)
    prev = Image.open(os.path.join(BATCH, r['artifacts']['label_preview_png']['relativeAssetPath'])).convert('RGB')
    check(ImageChops.difference(label, prev).getbbox() is None, 'label preview is pixel-identical to a rebuild ' + tag)
    check(sha_b(L.webp_bytes(label, 92)) == r['artifacts']['label_preview']['sha256'], 'label preview WebP is the encoded preview ' + tag)
    card = L.card_image(label)
    master = Image.open(os.path.join(BATCH, r['artifacts']['website_source_master']['relativeAssetPath'])).convert('RGB')
    check(ImageChops.difference(card, master).getbbox() is None, 'card master is pixel-identical to a rebuild ' + tag)
    check(sha_b(L.webp_bytes(card, 89)) == r['artifacts']['website_primary']['sha256'], 'primary WebP is the encoded card ' + tag)

for f in failed:
    print('FAIL', f)
print('%s: %d checks passed, %d failed%s' % ('FAIL' if failed else 'PASS', len(passed), len(failed), ' (DRY RUN, never publish)' if dry else ''))
sys.exit(1 if failed else 0)
