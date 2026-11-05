"""Verify CLAUDE-1 batch C1-001 from the files alone.

usage (from the repository root):
  python -I -X utf8 deliveries/peptide-artwork-claude-1/2026-11-04-c1-batch-001/tools/verify_c1.py
      [--repo-root .] [--catalog <member-safe-master-offerings.generated.json>] [--bindings <master-offering-bindings.generated.json>]

Checks: every declared artifact (bytes, sha256, dimensions); tool hashes; the exact label text per SVG
against the record's facts; the do-not-print list; each render differs from the accepted Batch 004 base
only inside its declared erased rows and columns; ids against the pinned release datasets.
Anything that cannot be checked is printed as SKIPPED and the summary says so; it is never counted as a pass.
"""
import argparse, hashlib, json, os, re, sys, xml.etree.ElementTree as ET
from PIL import Image, ImageChops

NS = '{http://www.w3.org/2000/svg}'
HERE = os.path.dirname(os.path.abspath(__file__))
BATCH = os.path.dirname(HERE)
FORBIDDEN = re.compile(r'purity|assay|\bCAS\b|batch[- ]tested|cold[- ]chain|°|mg/mL|inject|\bdose|dosage|human|patient|sterile|certif|\bGMP\b|\bUSP\b|%|'
                       r'supplier name|manufacturer name|\bQR\b|LOT:|\bEXP\b|\bBUD\b|expir|molecular|formula|acetate|excipient', re.I)
ok, failed, skipped = [], [], []


def check(cond, msg):
    (ok if cond else failed).append(msg)


TEXT_EXT = ('.svg', '.json', '.py', '.ps1', '.md', '.txt')
CRLF_FILES = set()


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo-root', default='.')
    ap.add_argument('--catalog'); ap.add_argument('--bindings')
    ap.add_argument('--extra-forbidden', help='local file, one term per line (for example supplier names); never committed')
    a = ap.parse_args()
    extra = [t.strip() for t in open(a.extra_forbidden, encoding='utf-8')] if a.extra_forbidden else []
    extra = [t for t in extra if t]
    m = json.load(open(os.path.join(BATCH, 'media-batch.v1.json'), encoding='utf-8'))
    rel = m['records'][0]['artifacts']['website_primary']['relativeAssetPath'].split('/assets/')[0]
    # 1. artifacts
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
        if os.path.basename(p) in ('verify_c1.py',):
            continue                       # the verifier cannot pin itself; its hash is in the manifest for the record
        check(os.path.exists(p) and sha(p) == t['sha256'], 'tool hash ' + os.path.basename(p))
    check(os.path.exists(os.path.join(BATCH, 'README.md')), 'README present')
    # 2. label text and do-not-print
    for r in m['records']:
        name, mg, sku = r['exactDepictedFacts']['productName'], r['nominalAmountPerVialMg'], r['quickOrderSku']
        f = local(r['artifacts']['front_editable_master']['relativeAssetPath'], rel)
        w = local(r['artifacts']['wrap_editable_master']['relativeAssetPath'], rel)
        fb, fm = texts(f)
        check(sorted(fb) == sorted(['XENIOS', name, '%d mg' % mg, 'LYOPHILIZED VIAL', 'RESEARCH USE ONLY', 'NONCLINICAL USE ONLY',
                                    'NOMINAL CONTENT', '%d mg per vial' % mg]), 'front text set ' + name)
        check(fm[0] == 'Xenios %s %d mg front label artwork version 1' % (name, mg), 'front title ' + name)
        check(fm[1].startswith('Editable Xenios %s %d mg per vial packaging design.' % (name, mg)), 'front desc ' + name)
        wb, wm = texts(w)
        for need in (name, '%d mg' % mg, '%d mg per vial' % mg, 'Lyophilized vial', 'Research Use Only', 'Nonclinical use only',
                     'For laboratory research use only.', 'PRODUCT CODE', sku):
            check(need in wb, 'wrap has %r (%s)' % (need, name))
        check(wb.count(name) == 2 and wb.count(sku) == 1, 'wrap name x2, code x1 ' + name)
        check(wm[0] == 'Xenios %s %d mg supplier wrap proof version 1' % (name, mg), 'wrap title ' + name)
        for label, strings in (('front', fb + fm), ('wrap', wb + wm)):
            hits = [s for s in strings if FORBIDDEN.search(s or '') or any(t.lower() in (s or '').lower() for t in extra)]
            check(not hits, 'do-not-print %s %s %s' % (label, name, hits if hits else ''))
            check(not any('BPC' in (s or '') for s in strings), 'no BPC-157 text left %s %s' % (label, name))
    # 3. render pixels outside the erased area are byte-identical to the accepted base
    base = os.path.join(a.repo_root, m['acceptedVisualReference']['path'].replace('/', os.sep))
    if os.path.exists(base) and sha(base) == m['acceptedVisualReference']['sha256']:
        B = Image.open(base).convert('RGB')
        for r in m['records']:
            p = local(r['artifacts']['website_source_master']['relativeAssetPath'], rel)
            bb = ImageChops.difference(B, Image.open(p).convert('RGB')).getbbox()
            rows = r['renderLayout']['erasedRows']; cols = r['renderLayout']['erasedColumns']
            inside = bb is not None and bb[0] >= cols[0] and bb[2] - 1 <= cols[1] and bb[1] >= min(x[0] for x in rows) and bb[3] - 1 <= max(x[1] for x in rows)
            check(inside, 'render changed only inside erased area %s (diff bbox %s)' % (r['canonicalVariant'], bb))
            p2 = local(r['artifacts']['website_primary']['relativeAssetPath'], rel)
            check(Image.open(p2).size == (1024, 1024), 'primary 1024 ' + r['canonicalVariant'])
    else:
        skipped.append('render-vs-base pixel check: accepted base not found at %s with the pinned hash' % base)
    # 4. ids against the pinned release datasets
    cat = a.catalog or os.path.join(a.repo_root, m['catalogDataset']['path'])
    bnd = a.bindings or os.path.join(a.repo_root, m['bindingDataset']['path'])
    if os.path.exists(cat) and os.path.exists(bnd) and sha(cat) == m['catalogDataset']['sha256'] and sha(bnd) == m['bindingDataset']['sha256']:
        c = json.load(open(cat, encoding='utf-8')); bj = json.load(open(bnd, encoding='utf-8'))
        bl = bj if isinstance(bj, list) else next(v for v in bj.values() if isinstance(v, list))
        for r in m['records']:
            p = [x for x in c['products'] if x['id'] == r['offeringId']]
            v = [x for x in (p[0]['variants'] if p else []) if x['id'] == r['sourceVariantId']]
            b = [x for x in bl if x.get('offeringVariantId') == r['sourceVariantId']]
            check(len(p) == 1 and len(v) == 1 and p[0]['displayName'] == r['exactDepictedFacts']['productName']
                  and p[0]['subcategory'] == 'Lyophilized Vial' and v[0]['label'] == r['catalogVariantLabel'], 'catalog facts ' + r['canonicalVariant'])
            check(len(b) == 1 and b[0]['productControlSku'] == r['quickOrderSku'] and b[0]['productId'] == r['quickOrderProductId']
                  and b[0]['variantId'] == r['quickOrderVariantId'], 'binding ' + r['canonicalVariant'])
    else:
        skipped.append('id check: pinned release datasets not found (pass --catalog/--bindings with sha256 %s / %s)'
                       % (m['catalogDataset']['sha256'][:12], m['bindingDataset']['sha256'][:12]))
    if not extra:
        skipped.append('supplier-name check: no --extra-forbidden list supplied (kept off this public repository)')
    if CRLF_FILES:
        print('NOTE %d text files have CRLF line ends, as a Windows checkout writes them; hashed with LF as committed: %s'
              % (len(CRLF_FILES), ', '.join(sorted(CRLF_FILES))))
    for f_ in failed:
        print('FAIL', f_)
    for s in skipped:
        print('SKIPPED', s)
    print('%s: %d checks passed, %d failed, %d skipped' % ('FAIL' if failed else ('PASS' if not skipped else 'PASS WITH SKIPS'), len(ok), len(failed), len(skipped)))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
