"""Verify a CLAUDE-1 peptide artwork batch from the files alone (C1-002 onward).

usage (from the repository root):
  python -I -X utf8 deliveries/peptide-artwork-claude-1/<batch>/tools/verify_c1.py
      [--repo-root .] [--catalog <member-safe-master-offerings.generated.json>] [--bindings <master-offering-bindings.generated.json>]
      [--extra-forbidden <local list>] [--recompute]

Checks:
 1. every declared artifact (bytes, sha256, dimensions) and every tool hash. Text files are committed with LF line
    ends; a Windows checkout with core.autocrlf rewrites them to CRLF, so CRLF is folded back to LF before hashing,
    release datasets included, and a NOTE names those files. PNG and WebP files are hashed as they are;
 2. each record's verified label facts appear as printed text (front and wrap), the front text set is exact,
    titles and descriptions name the right variant, and the wrap proof id and artworkVersion are the record's
    product code. The amount is the verified text with its unit ("10 mg", "10,000 IU"); nominalAmountPerVialMg is
    its integer for mg and null otherwise;
 3. the do-not-print terms: the generic list, the record's per-compound terms, and an optional local list; an
    amount in IU prints no mass unit anywhere, since the facts give no mass;
 4. each render differs from the accepted Batch 004 base only inside its declared rows and columns; the declared
    render runs spell the name and amount; when the amount is not 10 mg the amount rows changed too;
 5. ids, names and bindings against the pinned release datasets (a case-only name difference must be declared);
 6. with --recompute: every render and label preview is rebuilt from the pinned tools and must be pixel-identical,
    so each image provably shows the text its record declares.
Anything that cannot be checked is printed as SKIPPED and the summary says so; it is never counted as a pass.
"""
import argparse, hashlib, json, os, re, sys, xml.etree.ElementTree as ET
from PIL import Image, ImageChops

NS = '{http://www.w3.org/2000/svg}'
HERE = os.path.dirname(os.path.abspath(__file__))
BATCH = os.path.dirname(HERE)
FORBIDDEN = re.compile(r'purity|assay|\bCAS\b|batch[- ]tested|cold[- ]chain|°|mg/mL|inject|\bdose|dosage|human|patient|sterile|certif|\bGMP\b|\bUSP\b|%|'
                       r'supplier name|manufacturer name|\bQR\b|LOT:|\bEXP\b|\bBUD\b|expir|molecular|formula|acetate|excipient', re.I)
AMOUNT_ROWS_TOP = 672
AMOUNT = re.compile(r'(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?) (mg|IU)')       # the number as the facts print it, then its unit
MASS_UNIT = re.compile(r'(?<![A-Za-z])(?:mg|mcg|µg|ug|g|kg|gram|grams|milligram|milligrams|microgram|micrograms)(?![A-Za-z])', re.I)
ok, failed, skipped = [], [], []


def check(cond, msg):
    (ok if cond else failed).append(msg)


TEXT_EXT = ('.svg', '.json', '.py', '.ps1', '.md', '.txt')
CRLF_FILES = set()
DECLARED = []          # (product code, declaration reference, facts kind) for records whose vial form rests on a packaging declaration


def canon(path):
    """The committed bytes. Every text file in a CLAUDE-1 batch is committed with LF line ends, and a Windows checkout
    with core.autocrlf rewrites them to CRLF, so text files (TEXT_EXT) are read with CRLF folded back to LF; PNG and
    WebP files are read as they are."""
    data = open(path, 'rb').read()
    if path.lower().endswith(TEXT_EXT) and b'\r\n' in data:
        CRLF_FILES.add(os.path.basename(path))
        data = data.replace(b'\r\n', b'\n')
    return data


def sha(path):
    return hashlib.sha256(canon(path)).hexdigest()


def local(rel_asset_path, rel_prefix):
    return os.path.join(BATCH, rel_asset_path[len(rel_prefix) + 1:].replace('/', os.sep))


def texts(svg_path):
    root = ET.parse(svg_path).getroot()
    body = [el.text for el in root.iter(NS + 'text')]
    meta = [root.find(NS + 'title').text, root.find(NS + 'desc').text]
    return body, meta


def term_hit(term, s):
    return re.search(r'(?<![A-Za-z])' + re.escape(term) + r'(?![A-Za-z])', s or '', re.I) is not None


def same_pixels(a, b):
    return a.size == b.size and ImageChops.difference(a.convert('RGB'), b.convert('RGB')).getbbox() is None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo-root', default='.')
    ap.add_argument('--catalog'); ap.add_argument('--bindings')
    ap.add_argument('--extra-forbidden', help='local file, one term per line (for example supplier names); never committed')
    ap.add_argument('--recompute', action='store_true', help='rebuild every render and preview from the pinned tools and compare pixels')
    ap.add_argument('--allow-draft-declaration', action='store_true',
                    help='local dry runs only: accept a packaging-declaration reference that is not a KAN comment id')
    a = ap.parse_args()
    extra = [t.strip() for t in open(a.extra_forbidden, encoding='utf-8')] if a.extra_forbidden else []
    extra = [t for t in extra if t]
    m = json.load(open(os.path.join(BATCH, 'media-batch.v1.json'), encoding='utf-8'))
    rel = m['records'][0]['artifacts']['website_primary']['relativeAssetPath'].split('/assets/')[0]
    # 1. artifacts and tools
    arts = [m['contactSheet']] + [x for r in m['records'] for x in r['artifacts'].values()]
    for x in arts:
        p = local(x['relativeAssetPath'], rel)
        if not os.path.exists(p):
            failed.append('missing ' + x['relativeAssetPath']); continue
        check(len(canon(p)) == x['bytes'] and sha(p) == x['sha256'], 'bytes+sha256 ' + os.path.basename(p))
        if x['format'] in ('png', 'webp'):
            check(Image.open(p).size == (x['width'], x['height']), 'dimensions ' + os.path.basename(p))
    for t in m['tools']:
        p = local(t['path'], rel)
        if os.path.basename(p) == 'verify_c1.py':
            continue                       # the verifier cannot pin itself; its hash is in the manifest for the record
        check(os.path.exists(p) and sha(p) == t['sha256'], 'tool hash ' + os.path.basename(p))
    check(os.path.exists(os.path.join(BATCH, 'README.md')), 'README present')
    # 2-3. printed text against the verified label facts, and the do-not-print terms
    for r in m['records']:
        f = r['exactDepictedFacts']
        name, mg, sku = f['productName'], r['nominalAmountPerVialMg'], r['quickOrderSku']
        amount = f['amountOnRender']          # the verified amount with its unit; tied to the facts below
        per_vial = amount + ' per vial'
        am = AMOUNT.fullmatch(amount or '')
        unit = am.group(2) if am else None
        check(bool(am) and f['amountOnLabel'] == per_vial and r['canonicalVariant'] == '%s %s' % (name, amount)
              and ((unit == 'mg' and type(mg) is int and amount == '%d mg' % mg) or (unit not in (None, 'mg') and mg is None)),
              'amount %r: unit, label wording, variant name and nominalAmountPerVialMg %r (%s)' % (amount, mg, name))
        vst = r['labelFacts']['verifiedStaticText']
        fpath = local(r['artifacts']['front_editable_master']['relativeAssetPath'], rel)
        wpath = local(r['artifacts']['wrap_editable_master']['relativeAssetPath'], rel)
        fb, fm = texts(fpath)
        wb, wm = texts(wpath)
        check(sorted(fb) == sorted(['XENIOS', name, amount, 'LYOPHILIZED VIAL', 'RESEARCH USE ONLY', 'NONCLINICAL USE ONLY',
                                    'NOMINAL CONTENT', per_vial]), 'front text set ' + name)
        check(fm[0] == 'Xenios %s %s front label artwork version 1' % (name, amount), 'front title ' + name)
        check(fm[1].startswith('Editable Xenios %s %s packaging design.' % (name, per_vial)), 'front desc ' + name)
        for need in (name, amount, per_vial, 'Lyophilized vial', 'Research Use Only', 'Nonclinical use only',
                     'For laboratory research use only.', 'PRODUCT CODE', sku):
            check(need in wb, 'wrap has %r (%s)' % (need, name))
        check(wb.count(name) == 2 and wb.count(sku) == 1, 'wrap name x2, code x1 ' + name)
        pid = [s for s in wb if 'WRAP-V' in (s or '').upper()]
        check(pid == ['%s-WRAP-v1 | SCALE PENDING SUPPLIER DIELINE' % sku], 'wrap proof id is the product code %s %s' % (name, pid))
        check(r['artworkVersion'] == '%s-WEB-SUPPLIER-v1' % sku, 'artworkVersion is the product code %s %r' % (name, r['artworkVersion']))
        check(wm[0] == 'Xenios %s %s supplier wrap proof version 1' % (name, amount), 'wrap title ' + name)
        # every verified static fact is printed, exactly as verified
        check(vst['brand'] == 'Xenios' and 'XENIOS' in fb and 'XENIOS' in wb, 'facts: brand ' + name)
        check(vst['productName'] == name, 'facts: product name %r printed as %r' % (vst['productName'], name))
        basis = r.get('formBasis')
        if basis:
            # The vial and the per-vial basis come from Xenios's packaging declaration, cited by reference. Form-neutral facts
            # state no form; form-bearing facts state one that the declaration supersedes as the basis (KAN-59/11283), and
            # their printed text must still equal the facts.
            neutral = 'form' not in vst
            check(basis.get('kind') == 'xenios_packaging_declaration' and basis.get('form') == 'Lyophilized vial'
                  and basis.get('amountBasis') == 'per vial'
                  and ((neutral and r['labelFacts'].get('formNeutral') is True and not basis.get('supersedesFactsForm'))
                       or (not neutral and 'formNeutral' not in r['labelFacts'] and basis.get('supersedesFactsForm') is True)),
                  'form basis: declaration shape ' + name)
            check(bool(re.fullmatch(r'KAN-\d+/\d+', basis.get('reference', ''))) or a.allow_draft_declaration,
                  'form basis: declaration reference %r %s' % (basis.get('reference'), name))
            check((m.get('packagingDeclaration') or {}).get('reference') == basis.get('reference'), 'form basis: manifest declaration ' + name)
            check(basis.get('reference') in (m.get('authority') or []), 'form basis: declaration listed under authority ' + name)
            if neutral:
                check(vst['amount'] == amount and per_vial in fb and per_vial in wb,
                      'facts: amount, per-vial basis declared ' + name)
            else:
                check(vst['amount'] == per_vial and vst['amount'] in fb and vst['amount'] in wb, 'facts: amount ' + name)
                check(vst['form'] == 'Lyophilized vial' and vst['form'].upper() in fb and vst['form'] in wb, 'facts: form ' + name)
            check('LYOPHILIZED VIAL' in fb and 'Lyophilized vial' in wb, 'declared form printed ' + name)
            DECLARED.append((r['quickOrderSku'], basis.get('reference'), 'form-neutral facts' if neutral else 'facts form superseded'))
        else:
            check(vst['amount'] == per_vial and vst['amount'] in fb and vst['amount'] in wb, 'facts: amount ' + name)
            check(vst['form'] == 'Lyophilized vial' and vst['form'].upper() in fb and vst['form'] in wb, 'facts: form ' + name)
        check(vst['classification'] in wb, 'facts: classification ' + name)
        check(vst['productCode'] == 'Product code ' + sku and sku in wb and sku not in fb, 'facts: product code on the wrap only ' + name)
        terms = r.get('extraDoNotPrintTerms') or []
        for label, strings in (('front', fb + fm), ('wrap', wb + wm)):
            hits = [s for s in strings if FORBIDDEN.search(s or '') or any(t.lower() in (s or '').lower() for t in extra)
                    or any(term_hit(t, s) for t in terms)]
            check(not hits, 'do-not-print %s %s %s' % (label, name, hits if hits else ''))
            check(not any('BPC' in (s or '') for s in strings), 'no BPC-157 text left %s %s' % (label, name))
        for c in r.get('websiteReviewCandidates', []):
            check(not any(term_hit(t, c['altText']) for t in terms) and not FORBIDDEN.search(c['altText']), 'alt text clean ' + name)
        if unit not in (None, 'mg'):
            # An activity unit has no mass: no front, wrap or alt text may state one (a mass equivalent is never printed).
            masses = [s for s in fb + fm + wb + wm + [c['altText'] for c in r.get('websiteReviewCandidates', [])]
                      if MASS_UNIT.search(s or '')]
            check(not masses, 'no mass unit printed for an amount in %s %s %s' % (unit, name, masses if masses else ''))
    # 3b. the top-level label-fact index lists exactly the records' distinct label-fact pins, keyed by reference, file and
    # digest: two facts files can share one Jira reference (batches 05r2 and 06, KAN-59/10906; KAN-31/11384)
    row_pins = {(r['labelFacts']['reference'], r['labelFacts']['file'], r['labelFacts']['sha256']) for r in m['records']}
    top_pins = [(s.get('reference'), s.get('file'), s.get('sha256')) for s in m.get('labelFactSources', [])
                if isinstance(s, dict) and 'file' in s]
    check(len(top_pins) == len(set(top_pins)), 'label-fact index has no duplicate entry')
    check(set(top_pins) == row_pins, 'label-fact index equals the distinct record pins%s' % (
        '' if set(top_pins) == row_pins else ' (missing %s; extra %s)' % (sorted(p[1] for p in row_pins - set(top_pins)),
                                                                         sorted(p[1] for p in set(top_pins) - row_pins))))
    digests = {}
    for _, f, d in top_pins:
        digests.setdefault(f, set()).add(d)
    check(all(len(ds) == 1 for ds in digests.values()), 'label-fact index: one digest per file')
    # 4. render pixels outside the erased area are byte-identical to the accepted base; runs spell the variant
    base = os.path.join(a.repo_root, m['acceptedVisualReference']['path'].replace('/', os.sep))
    base_ok = os.path.exists(base) and sha(base) == m['acceptedVisualReference']['sha256']
    for r in m['records']:
        name, amount = r['exactDepictedFacts']['productName'], r['exactDepictedFacts']['amountOnRender']
        runs = [x['text'] for x in r['renderLayout']['runs']]
        amount_runs = [x for x in runs if x == amount]
        name_runs = [x for x in runs if x != amount]
        check(' '.join(name_runs) == name and len(amount_runs) <= 1, 'render runs spell %r (%s)' % (name, runs))
        check(amount == '10 mg' or amount_runs, 'render re-sets the amount for %s' % amount)
        p2 = local(r['artifacts']['website_primary']['relativeAssetPath'], rel)
        check(Image.open(p2).size == (1024, 1024), 'primary 1024 ' + r['canonicalVariant'])
    if base_ok:
        B = Image.open(base).convert('RGB')
        for r in m['records']:
            amount = r['exactDepictedFacts']['amountOnRender']
            p = local(r['artifacts']['website_source_master']['relativeAssetPath'], rel)
            bb = ImageChops.difference(B, Image.open(p).convert('RGB')).getbbox()
            rows = r['renderLayout']['erasedRows']; cols = r['renderLayout']['erasedColumns']
            inside = bb is not None and bb[0] >= cols[0] and bb[2] - 1 <= cols[1] and bb[1] >= min(x[0] for x in rows) and bb[3] - 1 <= max(x[1] for x in rows)
            check(inside, 'render changed only inside erased area %s (diff bbox %s)' % (r['canonicalVariant'], bb))
            if amount != '10 mg':
                check(bb is not None and bb[3] - 1 >= AMOUNT_ROWS_TOP, 'render amount rows changed for %s' % r['canonicalVariant'])
    else:
        skipped.append('render-vs-base pixel check: accepted base not found at %s with the pinned hash' % base)
    # 5. ids, names and bindings against the pinned release datasets
    cat = a.catalog or os.path.join(a.repo_root, m['catalogDataset']['path'])
    bnd = a.bindings or os.path.join(a.repo_root, m['bindingDataset']['path'])
    if os.path.exists(cat) and os.path.exists(bnd) and sha(cat) == m['catalogDataset']['sha256'] and sha(bnd) == m['bindingDataset']['sha256']:
        c = json.load(open(cat, encoding='utf-8')); bj = json.load(open(bnd, encoding='utf-8'))
        bl = bj if isinstance(bj, list) else next(v for v in bj.values() if isinstance(v, list))
        for r in m['records']:
            name = r['exactDepictedFacts']['productName']
            p = [x for x in c['products'] if x['id'] == r['offeringId']]
            v = [x for x in (p[0]['variants'] if p else []) if x['id'] == r['sourceVariantId']]
            b = [x for x in bl if x.get('offeringVariantId') == r['sourceVariantId']]
            nv = r.get('nameVariance')
            disp = p[0]['displayName'] if p else None
            name_ok = disp == name or bool(nv and nv.get('catalogDisplayName') == disp and (disp or '').lower() == name.lower())
            check(len(p) == 1 and len(v) == 1 and name_ok and p[0]['subcategory'] == 'Lyophilized Vial'
                  and v[0]['label'] == r['catalogVariantLabel'], 'catalog facts ' + r['canonicalVariant'])
            check(len(b) == 1 and b[0]['productControlSku'] == r['quickOrderSku'] and b[0]['productId'] == r['quickOrderProductId']
                  and b[0]['variantId'] == r['quickOrderVariantId'], 'binding ' + r['canonicalVariant'])
            if nv:
                print('NOTE declared name variance %s: printed %r, catalog %r' % (r['quickOrderSku'], name, disp))
    else:
        skipped.append('id check: pinned release datasets not found (pass --catalog/--bindings with sha256 %s / %s)'
                       % (m['catalogDataset']['sha256'][:12], m['bindingDataset']['sha256'][:12]))
    # 6. recompute every image from the pinned tools
    if not a.recompute:
        skipped.append('recompute: not requested (pass --recompute to rebuild every render and preview and compare pixels)')
    else:
        sys.path.insert(0, HERE)
        import xr_compose as X
        import svg_label_render as R
        fonts = [X.BOLD] + list(R.FONTS.values())
        if not all(os.path.exists(x) for x in fonts):
            skipped.append('recompute: Segoe UI faces not installed (%s)' % [x for x in fonts if not os.path.exists(x)])
        elif not base_ok:
            skipped.append('recompute: accepted base render not available')
        else:
            kt = os.path.join(HERE, 'kern-table.segoe-ui.json')
            X.load_kern(kt); R.load_kern(kt)
            for r in m['records']:
                name, amount = r['exactDepictedFacts']['productName'], r['exactDepictedFacts']['amountOnRender']
                im, info = X.compose_image(base, name, amount)
                got = Image.open(local(r['artifacts']['website_source_master']['relativeAssetPath'], rel))
                check(same_pixels(im, got), 'recompute render pixel-identical ' + r['canonicalVariant'])
                check(info['mode'] == r['renderLayout']['mode'] and [x['text'] for x in info['runs']] == [x['text'] for x in r['renderLayout']['runs']],
                      'recompute layout matches manifest ' + r['canonicalVariant'])
                for svg_role, png_role in (('front_editable_master', 'front_preview'), ('wrap_editable_master', 'wrap_preview')):
                    img = R.render_image(local(r['artifacts'][svg_role]['relativeAssetPath'], rel))
                    got = Image.open(local(r['artifacts'][png_role]['relativeAssetPath'], rel))
                    check(same_pixels(img, got), 'recompute %s pixel-identical %s' % (png_role, r['canonicalVariant']))
    if not extra:
        skipped.append('supplier-name check: no --extra-forbidden list supplied (kept off this public repository)')
    if CRLF_FILES:
        print('NOTE %d text files have CRLF line ends, as a Windows checkout writes them; hashed with LF as committed: %s'
              % (len(CRLF_FILES), ', '.join(sorted(CRLF_FILES))))
    check(bool(DECLARED) == bool(m.get('packagingDeclaration')), 'manifest packaging declaration present exactly when a record uses one')
    if DECLARED:
        print('NOTE %d records print the vial form under Xenios packaging declaration %s: %s'
              % (len(DECLARED), sorted({d[1] for d in DECLARED}), ', '.join('%s (%s)' % (d[0], d[2]) for d in DECLARED)))
        if m.get('publicationState') == 'dry_run_never_publish':
            print('NOTE this manifest is a dry run and must never be published')
    for f_ in failed:
        print('FAIL', f_)
    for s in skipped:
        print('SKIPPED', s)
    print('%s: %d checks passed, %d failed, %d skipped' % ('FAIL' if failed else ('PASS' if not skipped else 'PASS WITH SKIPS'), len(ok), len(failed), len(skipped)))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
