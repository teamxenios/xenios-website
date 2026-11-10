"""Build one research-capsule artwork batch (CLAUDE-1): website render, front label master and preview, manifest.

usage (from the folder that holds catalog/ and the capsule tools):
  python -I -B -X utf8 cap_build.py <facts.json> <facts-ref> <claim-ref> <base-render.webp> <wrap-template.svg> <out-dir>
                                    [--declaration <packaging-declaration.json>]
                                    [--released-content <reviewed-public-content.json> --released-media <reviewed-public-media.json>
                                     --release <40-hex release commit>]

The printed text is exactly the label facts' verifiedStaticText. The capsule form line needs a basis: either a recorded
Xenios packaging declaration for research capsules, or the basis the accepted capsule batches used, which is released
reviewed copy for the exact variant stating Form "Research capsules" and the listed strength (checked against the two
released files). Without either, the build runs only with C1_DRY_RUN=1 and marks the manifest dry_run_never_publish.
No generative model is used.
"""
import hashlib, json, os, re, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'scripts')); sys.path.insert(0, HERE)
from PIL import Image
import cap_compose as C, cap_front as F
import xr_compose as X, svg_label_render as R

args = [a for a in sys.argv[1:] if not a.startswith('--')]
FACTS, FACTS_REF, CLAIM_REF, BASE, TEMPLATE, OUT = args[:6]
DECL = sys.argv[sys.argv.index('--declaration') + 1] if '--declaration' in sys.argv else None
if DECL:
    args.remove(DECL)
DRY = os.environ.get('C1_DRY_RUN') == '1'


def _opt(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


REL_CONTENT, REL_MEDIA, RELEASE = _opt('--released-content'), _opt('--released-media'), _opt('--release')
RELEASED = False
CAPSULE_AUTHORITY = ['KAN-59/10615', 'KAN-225/10616']      # the authority the accepted capsule batches record in their manifests
CAT ='catalog/member-safe-master-offerings.generated.json'
BND = 'catalog/master-offering-bindings.generated.json'
BASE_REF = dict(path='deliveries/catalog-imagery/2026-11-04-batch-012/assets/5-amino-1mq-50mg-website-render-v1-1024.webp',
                commit='0ab9ebc1c4cc0272325f3250aeaeabd8c8a9f8a5', sha256='fc4477d3e2ecc5ad92032690033058c08df5b77cde885aef04fe6a5183c05ca2',
                acceptedIn='KAN-31/10756')
TPL_REF = dict(path='deliveries/catalog-imagery/2026-11-04-batch-012/labels/5-amino-1mq-50mg-wrap-proof-v1.svg',
               commit='0ab9ebc1c4cc0272325f3250aeaeabd8c8a9f8a5', sha256='4f6820ad145ea1ef89bb59edb4da7398dd4dc46b23bbeae939eb8f2818d1893d')
TEMPLATE_LINES = ['XENIOS', 'LISTED STRENGTH', 'RESEARCH CAPSULES', 'RESEARCH USE ONLY', 'NONCLINICAL USE ONLY']
TOOLS = ['cap_build.py', 'cap_compose.py', 'cap_front.py', 'cap_verify.py', 'xr_compose.py', 'svg_label_render.py', 'wpf_kern.ps1']


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def fail(msg):
    raise SystemExit('BUILD REFUSED: ' + msg)


if os.path.exists(OUT):
    fail('output folder exists: ' + OUT)
if sha(BASE) != BASE_REF['sha256'] or sha(TEMPLATE) != TPL_REF['sha256']:
    fail('base render or label template is not the pinned Batch 012 file')
if not (FACTS_REF.startswith('KAN-59/') and (DRY or CLAIM_REF.startswith('KAN-59/'))):
    fail('facts and claim references must be KAN-59 comments')
decl = None
if DECL:
    decl = json.load(open(DECL, encoding='utf-8'))
    ok = (decl.get('kind') == 'xenios_packaging_declaration' and decl.get('status') == 'RECORDED' and decl.get('form') == 'Research capsules'
          and re.fullmatch(r'KAN-\d+/\d+', decl.get('reference', '')) and decl.get('signer') and decl.get('signedDate'))
    if not ok:
        fail('the packaging declaration is not a recorded research-capsule declaration')
elif REL_CONTENT or REL_MEDIA or RELEASE:
    # The basis the accepted capsule batches used: released reviewed copy for the exact variant states the form and the
    # listed strength, under the founder authority those batches record. Checked per variant below.
    if not (REL_CONTENT and REL_MEDIA and RELEASE and re.fullmatch(r'[0-9a-f]{40}', RELEASE)):
        fail('the released-copy basis needs --released-content, --released-media and --release <40-hex sha>')
    RELEASED = True
elif not DRY:
    fail('no form basis: pass a packaging declaration or the released-copy basis, or set C1_DRY_RUN=1 for a private dry run')

cat = json.load(open(CAT, encoding='utf-8')); bj = json.load(open(BND, encoding='utf-8'))
bl = next(v for v in bj.values() if isinstance(v, list) and v and isinstance(v[0], dict) and 'productControlSku' in v[0])
var = {v['id']: (p, v) for p in cat['products'] for v in p['variants']}
facts = json.load(open(FACTS, encoding='utf-8'))
variants = []
for r in facts['records']:
    t = r['verifiedStaticText']
    if set(t) != {'brand', 'productName', 'strengthCaption', 'amount', 'formLine', 'classification', 'productCode'}:
        fail('unexpected printable keys: %s' % sorted(t))
    p, v = var[r['sourceVariantId']]
    bs = [b for b in bl if b['offeringVariantId'] == v['id']]
    checks = {
        'offering id': p['id'] == r['offeringId'], 'one binding': len(bs) == 1,
        'family research_capsules': p['family'] == 'research_capsules', 'subcategory Capsule / Bottle': p['subcategory'] == 'Capsule / Bottle',
        'variant label is NAME AMOUNT': v['label'] == '%s %s' % (t['productName'].upper(), t['amount']),
        'display name': p['displayName'].lower() == t['productName'].lower(),
        'brand': t['brand'] == 'Xenios', 'caption': t['strengthCaption'].upper() == 'LISTED STRENGTH',
        'form line': t['formLine'].upper() == 'RESEARCH CAPSULES', 'classification': t['classification'] == 'For laboratory research use only.',
        'amount shape': bool(re.fullmatch(r'\d+(\.\d+)? (mcg|mg)', t['amount'])),
        'product code is the bound code': len(bs) == 1 and t['productCode'] == 'Product code ' + bs[0]['productControlSku'],
    }
    bad = [k for k, okk in checks.items() if not okk]
    if bad:
        fail('%s: %s' % (v['label'], ', '.join(bad)))
    slug = re.sub(r'[^a-z0-9]+', '-', t['productName'].lower()).strip('-') + '-' + t['amount'].replace(' ', '') + '-capsule'
    released_basis = None
    if RELEASED:
        content = [c for c in json.load(open(REL_CONTENT, encoding='utf-8'))['records']
                   if (c['offeringId'], c['sourceVariantId']) == (p['id'], v['id'])]
        specs = {s['label']: s['value'] for s in (content[0]['content'].get('specifications') or [])} if len(content) == 1 else {}
        if specs.get('Form') != 'Research capsules' or specs.get('Listed strength') != t['amount']:
            fail('%s: the released reviewed copy does not state Form "Research capsules" and Listed strength %r' % (v['label'], t['amount']))
        fam = {(pp['id'], vv['id']): pp['family'] for pp in cat['products'] for vv in pp['variants']}
        live = [m for m in json.load(open(REL_MEDIA, encoding='utf-8'))['records']
                if fam.get((m['offeringId'], m['sourceVariantId'])) == 'research_capsules' and m['media'].get('packagingDesign') is True]
        if not any(m['media']['primary']['href'].endswith('/' + os.path.basename(BASE_REF['path'])) for m in live):
            fail('the base capsule render is not a released packaging design')
        released_basis = dict(
            kind='released_reviewed_copy', release=RELEASE,
            reviewedContent=dict(file='server/research/master-offerings/data/reviewed-public-content.json', sha256=sha(REL_CONTENT),
                                 form=specs['Form'], listedStrength=specs['Listed strength']),
            releasedCapsuleDesigns=dict(file='server/research/master-offerings/data/reviewed-public-media.json', sha256=sha(REL_MEDIA),
                                        researchCapsulePairsWithPackagingDesign=len(live)),
            authorityRecordedByAcceptedCapsuleBatches=CAPSULE_AUTHORITY, packagingDeclaration=None,
            note='The form line repeats the released reviewed copy for this exact variant; it is not a new source statement. '
                 'No separate packaging declaration for research capsules exists. Whether this basis is enough is for the reviewer.')
    variants.append(dict(slug=slug, sku=bs[0]['productControlSku'], product=p, variant=v, text=t, doNotPrint=r['doNotPrint'], binding=bs[0],
                         releasedBasis=released_basis))

for d in ('assets', 'labels', 'tools'):
    os.makedirs(os.path.join(OUT, d))
for f in TOOLS:
    src = os.path.join(HERE, f) if os.path.exists(os.path.join(HERE, f)) else os.path.join(HERE, '..', 'scripts', f)
    shutil.copyfile(src, os.path.join(OUT, 'tools', f))

# kerning: every string the render and the front label draw
req = {'700': []}
nofit = {}
for v in variants:
    for s in (v['text']['productName'], v['text']['amount']):
        if s not in req['700']:
            req['700'].append(s)
    svg, _ = F.front_svg(TEMPLATE, v['text']['productName'], v['text']['amount'])
    pth = os.path.join(OUT, 'tools', v['slug'] + '.nofit.svg')
    open(pth, 'w', encoding='utf-8', newline='\n').write(svg)
    wsvg, _ = F.wrap_svg(TEMPLATE, v['text']['productName'], v['text']['amount'], v['sku'])
    wpth = os.path.join(OUT, 'tools', v['slug'] + '.wrap.nofit.svg')
    open(wpth, 'w', encoding='utf-8', newline='\n').write(wsvg)
    for q in (pth, wpth):
        for key, text in R.strings_for_kerning(q):
            if text not in req.setdefault(key, []):
                req[key].append(text)
        os.remove(q)
rq = os.path.join(OUT, 'tools', 'kern-request.json')
json.dump(req, open(rq, 'w', encoding='utf-8', newline='\n'), indent=1)
kt = os.path.join(OUT, 'tools', 'kern-table.segoe-ui.json')
subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', os.path.join(OUT, 'tools', 'wpf_kern.ps1'),
                '-InFile', rq, '-OutFile', kt], check=True, timeout=110)
raw = open(kt, 'rb').read().replace(b'\r\n', b'\n'); open(kt, 'wb').write(raw)       # delivered text files are LF
X.load_kern(kt)


def art(path, role):
    im = Image.open(path)
    return dict(role=role, relativeAssetPath=os.path.relpath(path, OUT).replace(os.sep, '/'), bytes=os.path.getsize(path), sha256=sha(path),
                width=im.size[0], height=im.size[1], format=os.path.splitext(path)[1][1:])


records = []
for v in variants:
    t, slug = v['text'], v['slug']
    im, layout = C.compose_image(BASE, t['productName'], t['amount'])
    png = os.path.join(OUT, 'assets', slug + '-website-render-v1.png'); im.save(png, optimize=True)
    webp = os.path.join(OUT, 'assets', slug + '-website-render-v1-1024.webp'); im.save(webp, 'WEBP', quality=89, method=6)
    svg, name_size = F.front_svg(TEMPLATE, t['productName'], t['amount'], kt)
    fsvg = os.path.join(OUT, 'labels', slug + '-front-artwork-v1.svg'); open(fsvg, 'w', encoding='utf-8', newline='\n').write(svg)
    fpng = os.path.join(OUT, 'assets', slug + '-front-artwork-v1.png')
    R.load_kern(kt); R.render(fsvg, fpng)
    fwebp = os.path.join(OUT, 'assets', slug + '-front-artwork-v1.webp'); Image.open(fpng).convert('RGB').save(fwebp, 'WEBP', quality=92, method=6)
    wsvg, _ = F.wrap_svg(TEMPLATE, t['productName'], t['amount'], v['sku'], kt)
    wpath = os.path.join(OUT, 'labels', slug + '-wrap-proof-v1.svg'); open(wpath, 'w', encoding='utf-8', newline='\n').write(wsvg)
    wpng = os.path.join(OUT, 'assets', slug + '-wrap-proof-v1.png')
    R.load_kern(kt); R.render(wpath, wpng)
    wwebp = os.path.join(OUT, 'assets', slug + '-wrap-proof-v1.webp'); Image.open(wpng).convert('RGB').save(wwebp, 'WEBP', quality=92, method=6)
    alt_p = 'Xenios packaging design for %s research capsules, listed strength %s' % (t['productName'], t['amount'])
    alt_l = '%s research capsule front label design, listed strength %s' % (t['productName'], t['amount'])
    records.append(dict(
        offeringId=v['product']['id'], sourceVariantId=v['variant']['id'], quickOrderSku=v['sku'],
        catalogDisplayName=v['product']['displayName'], catalogVariantLabel=v['variant']['label'],
        mediaKind='original_xenios_website_render', websiteArtworkState='pending_independent_file_level_review',
        physicalPackagingState='design', runtimeLinked=False, publicationAuthorized=False,
        labelFacts=dict(reference=FACTS_REF, file=os.path.basename(FACTS), sha256=sha(FACTS), verifiedStaticText=t),
        exactDepictedFacts=dict(brand=t['brand'], productName=t['productName'], strengthCaption='LISTED STRENGTH', amount=t['amount'],
                                formLine='RESEARCH CAPSULES', templateLines=['RESEARCH USE ONLY', 'NONCLINICAL USE ONLY'],
                                productCodeOnWrap=v['sku'], productCodeOnRenderOrFront=False, capsuleCountPrinted=False),
        doNotPrint=dict(source=FACTS_REF, file=os.path.basename(FACTS), termCount=len(v['doNotPrint']),
                        note='The terms are in the cited label-facts record. tools/cap_verify.py checks their mechanical patterns.'),
        formBasis=(dict(kind=decl['kind'], reference=decl['reference'], signer=decl['signer'], signedDate=decl['signedDate'], form=decl['form'],
                        status=decl['status']) if decl else v['releasedBasis'] if v['releasedBasis']
                   else dict(kind='none', note='DRY RUN: no research-capsule packaging declaration exists')),
        renderLayout=layout, labelNameSetting=dict(fontSize=name_size),
        websiteReviewCandidates=[
            dict(role='primary', altText=alt_p, caption='Packaging design shown. Current packaging may differ.',
                 relativeAssetPath='assets/' + slug + '-website-render-v1-1024.webp', sha256=sha(webp)),
            dict(role='labelPreview', altText=alt_l, relativeAssetPath='assets/' + slug + '-front-artwork-v1.webp', sha256=sha(fwebp))],
        artifacts=dict(website_primary=art(webp, 'website_primary'), website_source_master=art(png, 'website_source_master'),
                       front_label_master=dict(role='front_label_master', relativeAssetPath='labels/' + slug + '-front-artwork-v1.svg',
                                               bytes=os.path.getsize(fsvg), sha256=sha(fsvg)),
                       front_label_preview_png=art(fpng, 'front_label_preview_png'), front_label_preview=art(fwebp, 'front_label_preview'),
                       wrap_proof_master=dict(role='wrap_proof_master', relativeAssetPath='labels/' + slug + '-wrap-proof-v1.svg',
                                              bytes=os.path.getsize(wpath), sha256=sha(wpath)),
                       wrap_proof_preview_png=art(wpng, 'wrap_proof_preview_png'), wrap_proof_preview=art(wwebp, 'wrap_proof_preview'))))

manifest = dict(
    schemaVersion=1, batchId='claude1-capsule-artwork-' + os.path.basename(os.path.normpath(OUT)),
    producer='CLAUDE-1 imagery lane (Claude Code session c16cbf1c)', claim=CLAIM_REF,
    publicationState='dry_run_never_publish' if (DRY or not (decl or RELEASED)) else 'review_only_not_runtime', supplierSendPerformed=False,
    formBasisKind='xenios_packaging_declaration' if decl else 'released_reviewed_copy' if RELEASED else 'none',
    catalogDataset=dict(file=os.path.basename(CAT), sha256=sha(CAT)), bindingDataset=dict(file=os.path.basename(BND), sha256=sha(BND)),
    acceptedVisualReference=BASE_REF, labelTemplate=TPL_REF,
    packagingDeclaration=(decl if decl else None),
    method=dict(generativeModelUsed=False,
                render='Only the name rows and the listed-strength rows of the accepted capsule render are erased and re-set in Segoe UI Bold; '
                       'every other pixel equals the decoded base. Primary: WebP quality 89.',
                frontLabel='The front panel of the accepted capsule label with only the name and listed strength replaced; weights below 850 '
                           'take Segoe UI Bold and 900 takes Black, as the accepted capsule previews resolved them. Preview: WebP quality 92.',
                wrapProof='The accepted capsule wrap proof with only the name, listed strength, product code and proof id replaced. '
                          'The product code prints on the wrap only.'),
    tools=[dict(path='tools/' + f, sha256=sha(os.path.join(OUT, 'tools', f))) for f in TOOLS + ['kern-table.segoe-ui.json', 'kern-request.json']],
    records=records)
json.dump(manifest, open(os.path.join(OUT, 'media-batch.v1.json'), 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
README = '# Research capsule artwork: CLAUDE-1 capsule batch\n\nThis batch delivers Xenios website artwork and editable label masters for {N} exact research-capsule variant{S}. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.\n\n{TABLE}\n\nThe ids and product codes are read from the release datasets `member-safe-master-offerings.generated.json` (sha256 `{CAT8}…`) and `master-offering-bindings.generated.json` (`{BND8}…`).\n\n## What prints, and on what basis\n\nFrom the label facts ({FACTS_REF}, `{FACTS_FILE}`, sha256 `{FACTS8}…`): the brand Xenios, the product name, the caption "Listed strength", the amount, the classification line and, on the wrap only, the product code.\n\nFrom the accepted capsule design, unchanged: "Research Use Only" and "Nonclinical use only".\n\n{FORM_BASIS}\n\nNothing else prints. In particular there is no capsule count, no per-capsule amount, no purity, lot or expiry, no storage text, no supplier name and no dose, route or outcome wording. The full do-not-print list is in the cited label-facts record; `tools/cap_verify.py` checks its mechanical patterns on every printed string and alt text.\n\n## Files\n\nFor each variant:\n\n- `assets/<variant>-website-render-v1-1024.webp` is the website primary, a complete bottle render at 1024 x 1024; `assets/<variant>-website-render-v1.png` is its lossless master.\n- `labels/<variant>-front-artwork-v1.svg` is the editable front label master (1000 x 850); `assets/<variant>-front-artwork-v1.webp` and `.png` are its preview.\n- `labels/<variant>-wrap-proof-v1.svg` is the editable wrap proof (front panel, product-details panel with the product code, proof notes); `assets/<variant>-wrap-proof-v1.webp` and `.png` are its preview (2400 x 1200).\n\n`media-batch.v1.json` holds the mapping, the depicted facts, the label-fact source and every file\'s bytes, sha256 and dimensions. `tools/` holds the build, render and verification sources and the measured kern table.\n\nWebsite caption for every image: **"Packaging design shown. Current packaging may differ."**\n\n## How the artwork was made\n\nNo generative image model was used, and all lettering is set from installed fonts.\n\n- **Bottle render.** The base is the accepted capsule render of catalog-imagery Batch 012 (`{BASE_PATH}`, commit `{BASE_COMMIT8}`, accepted in {BASE_ACCEPTED}). Only the name rows and the listed-strength rows are erased, refilled from the clean label paper above and below, and re-set in Segoe UI Bold. Every other pixel equals the decoded base; the verifier checks this.\n- **Front label and wrap.** They are the accepted Batch 012 capsule label with only the name, listed strength, product code and proof id replaced. Previews are drawn by `tools/svg_label_render.py` with pair kerning measured through WPF. Weights below 850 take Segoe UI Bold and 900 takes Black, as the accepted capsule previews resolved them.\n\nOne difference from the ten capsule renders already live: their lettering was drawn by an image model and is not a font. Lettering set from Segoe UI Bold reads slightly lighter and less condensed beside them. Whether that is acceptable is a review decision.\n\n## Verify\n\n```text\npython -I -B -X utf8 tools/cap_verify.py <this dir> --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --base <Batch 012 render webp> --template <Batch 012 wrap svg>\n```\n\nIt checks every file\'s bytes, hash and dimensions, the tool hashes, the ids and the one binding, the exact text of the front label, that the product code prints once on the wrap and nowhere else, the do-not-print patterns, and that the render, the front preview and the wrap preview are pixel-identical to a rebuild. It needs Windows with Segoe UI. A batch built without a recorded packaging declaration is a dry run and fails verification unless `--allow-dry-run` is passed; a dry run is never published.\n\n## Still outstanding for physical production\n\nBottle and closure specification, dieline, seam, bleed, stock and finish; capsule count and selling unit; storage copy, lot and expiry; chemical form and excipients. The wrap is marked "PACKAGING DESIGN PROOF - NOT PRESS READY", and nothing has been sent to a supplier.\n\n## Review\n\nIndependent file-level review goes to KAN-31; the producer cannot be the reviewer. Root integrates accepted artwork.\n'
rows = '\n'.join('| %s %s | `%s` | `%s` | `%s` | %s |' % (r['labelFacts']['verifiedStaticText']['productName'],
                 r['labelFacts']['verifiedStaticText']['amount'], r['offeringId'], r['sourceVariantId'], r['quickOrderSku'], FACTS_REF) for r in records)
form_basis = ('The words "Research capsules" and the capsule bottle rest on the founder\'s packaging declaration (%s, %s): on research '
              'capsule artwork they are Xenios\'s packaging choice, not a statement about the selected source.' % (decl['reference'], decl['signedDate'])
              if decl else
              ('The words "Research capsules" and the listed strength repeat the reviewed copy already released for this exact variant '
               '(release `%s`, `reviewed-public-content.json`: Form "Research capsules"). They are not a new source statement. The capsule bottle is '
               'the Xenios packaging design already released for %d research-capsule variants; the accepted capsule batches 012 to 015 record '
               '%s as their authority. No separate packaging declaration for research capsules exists. **Whether this basis is enough for this variant is a '
               'question for the reviewer**, and `media-batch.v1.json` records it under `formBasis`.'
               % (RELEASE[:8], variants[0]['releasedBasis']['releasedCapsuleDesigns']['researchCapsulePairsWithPackagingDesign'],
                  ' and '.join(CAPSULE_AUTHORITY))) if RELEASED else
              '**DRY RUN, never publish.** No research-capsule packaging declaration exists, so the form line has no recorded basis.')
if RELEASED:
    a = '--base <Batch 012 render webp> --template <Batch 012 wrap svg>\n'
    b = ('--base <Batch 012 render webp> --template <Batch 012 wrap svg> --released-content <reviewed-public-content.json> '
         '--released-media <reviewed-public-media.json>\n')
    assert README.count(a) == 1
    README = README.replace(a, b)
    a = 'A batch built without a recorded packaging declaration is a dry run and fails verification unless `--allow-dry-run` is passed; a dry run is never published.'
    b = ('The two released files are the ones at the release named in the manifest; the verifier checks their digests, that the released copy '
         'for each variant states the form and the listed strength, and the number of released capsule designs.')
    assert README.count(a) == 1
    README = README.replace(a, b)
open(os.path.join(OUT, 'README.md'), 'w', encoding='utf-8', newline='\n').write(README.format(
    N=len(records), S='' if len(records) == 1 else 's',
    TABLE='| Variant | Offering | Source variant | Product code | Label facts |\n|---|---|---|---|---|\n' + rows,
    CAT8=sha(CAT)[:8], BND8=sha(BND)[:8], FACTS_REF=FACTS_REF, FACTS_FILE=os.path.basename(FACTS), FACTS8=sha(FACTS)[:8], FORM_BASIS=form_basis,
    BASE_PATH=BASE_REF['path'], BASE_COMMIT8=BASE_REF['commit'][:8], BASE_ACCEPTED=BASE_REF['acceptedIn']))
print(json.dumps(dict(out=OUT, records=len(records), publicationState=manifest['publicationState'],
                      layouts=[(r['quickOrderSku'], [x['fontSizePx'] for x in r['renderLayout']['runs']], r['labelNameSetting']) for r in records])))
