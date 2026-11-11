"""Build one form-neutral label-card batch (CLAUDE-1) for catalog rows whose form no source states.

usage (from the claude1 scratch root):
  python -I -B -X utf8 fn/fn_build.py <template.svg> <released-content.json> <extra-terms-source c1_variants.py> <facts-ref> <claim-ref> <out-dir>
                                      [--approved <KAN-n/n>] <CODE>=<label-facts.json>[=<KAN-59/n>] [...]

Without --approved (the founder's approval of the label-card template, as a Jira comment reference) the build runs only
with C1_DRY_RUN=1 and marks the manifest dry_run_never_publish. The printed text is exactly the label facts' verified
text; nothing states a form. No generative model is used.
"""
import ast, hashlib, json, os, re, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'scripts')); sys.path.insert(0, HERE)
from PIL import Image
import svg_label_render as R
import fn_lib as L

argv = sys.argv[1:]
APPROVED = None
if '--approved' in argv:
    i = argv.index('--approved'); APPROVED = argv[i + 1]; del argv[i:i + 2]
TEMPLATE, REL_CONTENT, TERMS_SRC, FACTS_REF, CLAIM_REF, OUT = argv[:6]
ROWS = [(a.split('=') + [None])[:3] for a in argv[6:]]      # CODE=<label-facts.json>[=<KAN-59/n reference for that record>]
DRY = os.environ.get('C1_DRY_RUN') == '1'
CAT, BND = 'catalog/member-safe-master-offerings.generated.json', 'catalog/master-offering-bindings.generated.json'
TOOLS = ['fn_build.py', 'fn_lib.py', 'fn_verify.py', 'svg_label_render.py', 'wpf_kern.ps1']


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()



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


def fail(msg):
    raise SystemExit('BUILD REFUSED: ' + msg)


if os.path.exists(OUT):
    fail('output folder exists: ' + OUT)
if sha(TEMPLATE) != L.TEMPLATE_SHA256:
    fail('the template is not the pinned Batch 004 front label master')
if APPROVED and not re.fullmatch(r'KAN-\d+/\d+', APPROVED):
    fail('--approved must be a Jira comment reference')
if not APPROVED and not DRY:
    fail('no approval of the label-card template; set C1_DRY_RUN=1 for a private dry run')
if not DRY and not (FACTS_REF.startswith('KAN-59/') and CLAIM_REF.startswith('KAN-59/')):
    fail('facts and claim references must be KAN-59 comments')
if not ROWS:
    fail('no rows')

src = open(TERMS_SRC, encoding='utf-8').read()
i = src.index('EXTRA_TERMS = {'); j = src.index('\n}\n', i) + 2
EXTRA = ast.literal_eval(src[i + len('EXTRA_TERMS = '):j])
cat = json.load(open(CAT, encoding='utf-8')); bj = json.load(open(BND, encoding='utf-8'))
bl = next(v for v in bj.values() if isinstance(v, list) and v and isinstance(v[0], dict) and 'productControlSku' in v[0])
released = {(c['offeringId'], c['sourceVariantId']): c['content'] for c in json.load(open(REL_CONTENT, encoding='utf-8'))['records']}
tpl = open(TEMPLATE, encoding='utf-8').read()
variants = []
for code, facts_path, row_ref in ROWS:
    row_ref = row_ref or FACTS_REF
    if not DRY and not row_ref.startswith('KAN-59/'):
        fail('%s: the label-facts reference must be a KAN-59 comment' % code)
    sku = 'GEN-GRP-' + code
    bs = [b for b in bl if b['productControlSku'] == sku]
    if len(bs) != 1:
        fail('%s: %d bindings' % (sku, len(bs)))
    pair = (bs[0]['offeringId'], bs[0]['offeringVariantId'])
    pv = [(p, v) for p in cat['products'] for v in p['variants'] if (p['id'], v['id']) == pair]
    recs = [r for r in json.load(open(facts_path, encoding='utf-8'))['records'] if (r['offeringId'], r['sourceVariantId']) == pair]
    if len(pv) != 1 or len(recs) != 1:
        fail('%s: %d catalog rows, %d label-facts records in %s' % (sku, len(pv), len(recs), facts_path))
    (p, v), r = pv[0], recs[0]
    t = r['verifiedStaticText']
    specs = {s['label']: s['value'] for s in (released.get(pair) or {}).get('specifications') or []}
    checks = {
        'printable keys are brand, name, amount, classification, code': set(t) == {'brand', 'productName', 'amount', 'classification', 'productCode'},
        'the facts state no form and carry the hold': 'form' not in t and bool(r.get('hold')),
        'brand': t.get('brand') == 'Xenios', 'classification': t.get('classification') == 'For laboratory research use only.',
        'amount shape': bool(re.fullmatch(r'\d+(\.\d+)? (mcg|mg|IU)', t.get('amount', ''))),
        'product code is the bound code': t.get('productCode') == 'Product code ' + sku,
        'one variant': len(p['variants']) == 1,
        'family research_peptides_materials': p['family'] == 'research_peptides_materials',
        'catalog subcategory is Form not stated': p['subcategory'] == 'Form not stated',
        'variant label is NAME (AMOUNT), or a declared variance of the catalog display name':
            label_binding(v['label'], t.get('productName', ''), t.get('amount', ''), p['displayName'])[0],
        'released copy, where there is one, states this listed amount and no form':
            (pair not in released) or (specs.get('Listed amount') == t.get('amount') and 'Form' not in specs),
    }
    bad = [k for k, ok in checks.items() if not ok]
    if bad:
        fail('%s: %s' % (sku, '; '.join(bad)))
    slug = re.sub(r'[^a-z0-9]+', '-', t['productName'].lower()).strip('-') + '-' + t['amount'].replace(' ', '').lower()
    variants.append(dict(sku=sku, slug=slug, p=p, v=v, t=t, facts=facts_path, hold=r['hold'], hasReleasedCopy=pair in released, ref=row_ref,
                         variance=label_binding(v['label'], t['productName'], t['amount'], p['displayName'])[1],
                         terms=EXTRA.get(t['productName'], [])))

for d in ('assets', 'labels', 'tools'):
    os.makedirs(os.path.join(OUT, d))
for f in TOOLS:
    s = os.path.join(HERE, f) if os.path.exists(os.path.join(HERE, f)) else os.path.join(HERE, '..', 'scripts', f)
    shutil.copyfile(s, os.path.join(OUT, 'tools', f))
json.dump({v['t']['productName']: v['terms'] for v in variants}, open(os.path.join(OUT, 'tools', 'extra-terms.json'), 'w', encoding='utf-8', newline='\n'),
          indent=1, ensure_ascii=False)

req = {}
for v in variants:
    tmp = os.path.join(OUT, 'tools', v['slug'] + '.nofit.svg')
    open(tmp, 'w', encoding='utf-8', newline='\n').write(L.label_svg(tpl, v['t']['productName'], v['t']['amount'], L.NAME_SIZE))
    for key, text in R.strings_for_kerning(tmp):
        if text not in req.setdefault(key, []):
            req[key].append(text)
    os.remove(tmp)
rq, kt = os.path.join(OUT, 'tools', 'kern-request.json'), os.path.join(OUT, 'tools', 'kern-table.segoe-ui.json')
json.dump(req, open(rq, 'w', encoding='utf-8', newline='\n'), indent=1)
subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', os.path.join(OUT, 'tools', 'wpf_kern.ps1'),
                '-InFile', rq, '-OutFile', kt], check=True, timeout=110)
raw = open(kt, 'rb').read().replace(b'\r\n', b'\n'); open(kt, 'wb').write(raw)
R.load_kern(kt)


def art(path, role):
    im = Image.open(path)
    return dict(role=role, relativeAssetPath=os.path.relpath(path, OUT).replace(os.sep, '/'), bytes=os.path.getsize(path), sha256=sha(path),
                width=im.size[0], height=im.size[1], format=os.path.splitext(path)[1][1:])


records = []
for v in variants:
    t, slug = v['t'], v['slug']
    size = L.fit_name(t['productName'])
    svg = L.label_svg(tpl, t['productName'], t['amount'], size)
    fsvg = os.path.join(OUT, 'labels', slug + '-label-design-v1.svg'); open(fsvg, 'w', encoding='utf-8', newline='\n').write(svg)
    fpng = os.path.join(OUT, 'assets', slug + '-label-design-v1.png'); R.render(fsvg, fpng)
    label = Image.open(fpng).convert('RGB')
    fwebp = os.path.join(OUT, 'assets', slug + '-label-design-v1.webp'); open(fwebp, 'wb').write(L.webp_bytes(label, 92))
    card = L.card_image(label)
    cpng = os.path.join(OUT, 'assets', slug + '-label-card-v1.png'); card.save(cpng, optimize=True)
    cwebp = os.path.join(OUT, 'assets', slug + '-label-card-v1-1024.webp'); open(cwebp, 'wb').write(L.webp_bytes(card, 89))
    printed = '%s %s' % (t['productName'], t['amount'])
    records.append(dict(
        offeringId=v['p']['id'], sourceVariantId=v['v']['id'], quickOrderSku=v['sku'],
        catalogDisplayName=v['p']['displayName'], catalogVariantLabel=v['v']['label'], catalogSubcategory=v['p']['subcategory'],
        catalogDisplayState=[v['p']['displayState'], v['v']['displayState']], canonicalVariant=printed,
        nameVarianceFromCatalogLabel=v['variance'],
        mediaKind='original_xenios_label_card', websiteArtworkState='pending_independent_file_level_review',
        physicalPackagingState='not_depicted', runtimeLinked=False, publicationAuthorized=False,
        labelFacts=dict(reference=v['ref'], file=os.path.basename(v['facts']), sha256=sha(v['facts']), verifiedStaticText=t, hold=v['hold']),
        exactDepictedFacts=dict(printedLines=L.EXPECTED_LINES(t['productName'], t['amount']), containerDepicted=False, formStated=False,
                                productCodePrinted=False),
        releasedReviewedCopy=v['hasReleasedCopy'], extraDoNotPrintTerms=v['terms'], labelNameSetting=dict(fontSizePx=size),
        websiteReviewCandidates=[
            dict(role='primary', altText='Xenios %s label design' % printed, relativeAssetPath='assets/' + slug + '-label-card-v1-1024.webp', sha256=sha(cwebp)),
            dict(role='labelPreview', altText='Front label artwork for Xenios %s' % printed, relativeAssetPath='assets/' + slug + '-label-design-v1.webp',
                 sha256=sha(fwebp))],
        artifacts=dict(website_primary=art(cwebp, 'website_primary'), website_source_master=art(cpng, 'website_source_master'),
                       label_master=dict(role='label_master', relativeAssetPath='labels/' + slug + '-label-design-v1.svg', bytes=os.path.getsize(fsvg),
                                         sha256=sha(fsvg)),
                       label_preview_png=art(fpng, 'label_preview_png'), label_preview=art(fwebp, 'label_preview'))))

manifest = dict(
    schemaVersion=1, batchId='claude1-label-card-' + os.path.basename(os.path.normpath(OUT)),
    producer='CLAUDE-1 imagery lane (Claude Code session c16cbf1c)', claim=CLAIM_REF,
    publicationState='review_only_not_runtime' if (APPROVED and not DRY) else 'dry_run_never_publish', supplierSendPerformed=False,
    templateApproval=APPROVED,
    formBasis=dict(kind='form_not_stated_label_card',
                   note='The catalog subcategory of every row is "Form not stated" and the label facts state no form. The image is a flat label: '
                        'it states no form and depicts no container. No packaging declaration is used or needed for what it prints.'),
    catalogDataset=dict(file=os.path.basename(CAT), sha256=sha(CAT)), bindingDataset=dict(file=os.path.basename(BND), sha256=sha(BND)),
    releasedContent=dict(file='server/research/master-offerings/data/reviewed-public-content.json', sha256=sha(REL_CONTENT)),
    labelTemplate=L.TEMPLATE_REF,
    method=dict(generativeModelUsed=False,
                label='The accepted Batch 004 front label with the name and amount replaced, the form line removed and the content field '
                      'relabelled "LISTED AMOUNT". Preview: WebP quality 92.',
                card='The label preview scaled to 880 px wide on a plain 1024 x 1024 ground with a soft shadow. Primary: WebP quality 89.'),
    tools=[dict(path='tools/' + f, sha256=sha(os.path.join(OUT, 'tools', f))) for f in TOOLS + ['kern-table.segoe-ui.json', 'kern-request.json', 'extra-terms.json']],
    records=records)
json.dump(manifest, open(os.path.join(OUT, 'media-batch.v1.json'), 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
rows = '\n'.join('| %s | `%s` | `%s` | `%s` | %s |' % (r['canonicalVariant'], r['offeringId'], r['sourceVariantId'], r['quickOrderSku'],
                                                       'yes' if r['releasedReviewedCopy'] else 'no') for r in records)
state = ('It is for review only: nothing here is linked into the runtime. The founder approved the label-card template in %s; publication and '
         'physical production are not approved.' % APPROVED) if (APPROVED and not DRY) else \
        '**DRY RUN, never publish.** The label-card template has no recorded approval.'
README = '''# Label-card artwork: CLAUDE-1 label-card batch

This batch delivers Xenios website artwork for {N} research catalog variant{S} whose form no source states. {STATE}

| Variant | Offering | Source variant | Product code | Reviewed copy released |
|---|---|---|---|---|
{ROWS}

The ids and product codes are read from the release datasets `member-safe-master-offerings.generated.json` (sha256 `{CAT8}…`) and `master-offering-bindings.generated.json` (`{BND8}…`).

## Why a label card and not a container

For every variant here the catalog subcategory is "Form not stated", the label facts state no form, and the released reviewed copy, where there is any, states a listed amount and no form. A drawing of a vial, a bottle or any other container would state a form that nothing gives. So the image is the label alone, flat, on a plain ground. It states no form and depicts no container, and it needs no packaging declaration for what it prints.

## What prints

From the label facts ({FACTS_REF}): the brand Xenios, the product name and the amount. From the accepted label design, unchanged: "Research Use Only" and "Nonclinical use only". The caption above the repeated amount reads "Listed amount", which is the label the released reviewed copy uses for the same figure.

{VARIANCE}Nothing else prints. There is no form line, no "per" basis, no product code, no purity, lot or expiry, no storage text, no supplier name and no dose, route or outcome wording. `tools/fn_verify.py` checks these on every printed string, title, description and alt text, together with the compound-specific terms in `tools/extra-terms.json`. A name of more than one word is also checked never to appear shortened.

## Files

For each variant:

- `assets/<variant>-label-card-v1-1024.webp` is the website primary, 1024 x 1024; `assets/<variant>-label-card-v1.png` is its lossless master.
- `labels/<variant>-label-design-v1.svg` is the editable label master (1600 x 1000); `assets/<variant>-label-design-v1.webp` and `.png` are its preview.

`media-batch.v1.json` holds the mapping, the printed lines, the label-fact source and every file's bytes, sha256 and dimensions. `tools/` holds the build, render and verification sources and the measured kern table.

Proposed alt text: "Xenios <name> <amount> label design" and "Front label artwork for Xenios <name> <amount>". The website caption for a label card is the integrator's choice; the existing caption speaks of a packaging design, and this image shows a label only.

## How the artwork was made

No generative image model was used, and all lettering is set from installed fonts. The label is the accepted Batch 004 front label master (`{TPL_PATH}`, accepted in {TPL_ACCEPTED}) with the name and the amount replaced, the form line removed and the content caption changed to "Listed amount". The preview is drawn by `tools/svg_label_render.py` with pair kerning measured through WPF. The website image is that preview scaled to 880 px wide on a plain ground with a soft shadow.

## Verify

```text
python -I -B -X utf8 tools/fn_verify.py <this dir> --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --template <Batch 004 front label svg> --released-content <reviewed-public-content.json>
```

It checks every file's bytes, hash and dimensions, the tool hashes, the ids and the one binding, that the catalog says "Form not stated", that the released copy states the same listed amount and no form, the exact text of the label, the absence of form, container and do-not-print wording, and that the label preview and the card are pixel-identical to a rebuild. It needs Windows with Segoe UI. A batch built without a recorded approval of the template is a dry run and fails verification unless `--allow-dry-run` is passed; a dry run is never published.

## Review

Independent file-level review goes to KAN-31; the producer cannot be the reviewer. {REVIEW_NOTE} Root or the integrator integrates accepted artwork.
'''
open(os.path.join(OUT, 'README.md'), 'w', encoding='utf-8', newline='\n').write(README.format(
    VARIANCE=''.join('For %s the catalog variant label reads "%s": %s. The printed name is the catalog display name, as the label facts give it.\n\n'
                     % (r['canonicalVariant'], r['catalogVariantLabel'], r['nameVarianceFromCatalogLabel']['kind']) for r in records if r['nameVarianceFromCatalogLabel']),
    REVIEW_NOTE=os.environ.get('C1_REVIEW_NOTE', 'The label-card template is new, so the review covers the template as well as each variant.'),
    N=len(records), S='' if len(records) == 1 else 's', STATE=state, ROWS=rows, CAT8=sha(CAT)[:8], BND8=sha(BND)[:8], FACTS_REF='; '.join(sorted({r['labelFacts']['reference'] for r in records})),
    TPL_PATH=L.TEMPLATE_REF['path'], TPL_ACCEPTED=L.TEMPLATE_REF['acceptedIn']))
print(json.dumps(dict(out=OUT, records=len(records), publicationState=manifest['publicationState'],
                      layouts=[(r['quickOrderSku'], r['canonicalVariant'], r['labelNameSetting']['fontSizePx']) for r in records])))
