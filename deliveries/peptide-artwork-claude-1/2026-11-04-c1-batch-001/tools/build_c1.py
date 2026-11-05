"""Build CLAUDE-1 peptide artwork batch C1-001 (2026-11-04).

usage: python -I -X utf8 build_c1.py kern  <ref_b004_dir> <work_dir> <tools_dir>   (writes tools/kern-table.segoe-ui.json via WPF)
       python -I -X utf8 build_c1.py build <ref_b004_dir> <out_batch_dir> <tools_dir>

Inputs (all verified by sha256 before use):
  Batch 004 accepted BPC-157 10 mg v3 render, front SVG and wrap SVG (catalog-imagery branch).
Outputs per variant: front + wrap SVG masters, front/wrap previews (PNG, WebP), the complete vial
render (1254 PNG master, 1024 WebP primary), then the contact sheet. The manifest is written by
write_manifest.py so the hashes come from the files on disk.
"""
import hashlib, json, os, re, subprocess, sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svg_label_render as R   # noqa: E402
import xr_compose as X         # noqa: E402

BASE_SHA = {
    'bpc-157-10mg-website-render-v3.png': '674868e8914407fb65c3495bff77b92a9335b9a6dc900264a8b5d84c27d9017b',
    'bpc-157-10mg-front-artwork-v3.svg': '716d79fc7aed61485099fcf9f31a902ca30ac40cf2606901ed192f99206f4e4a',
    'bpc-157-10mg-wrap-proof-v3.svg': '529370fb98e0984b0d8227963d93cf4fb857bd3e96d997d89055c62c608004b6',
}
VARIANTS = [
    dict(slug='ipamorelin-10mg', name='Ipamorelin', code='IPAMORELIN', mg=10, sku='GEN-GRP-0302'),
    dict(slug='kpv-10mg', name='KPV', code='KPV', mg=10, sku='GEN-GRP-0306'),
    dict(slug='selank-10mg', name='Selank', code='SELANK', mg=10, sku='GEN-GRP-0331'),
    dict(slug='thymosin-alpha-1-10mg', name='Thymosin Alpha-1', code='THYMOSINALPHA1', mg=10, sku='GEN-GRP-0350'),
]

PENDING_PANEL = """  <g class="sans" id="back-panel-proof-only" transform="translate(1650 205)">
    <text x="0" y="0" class="eyebrow">SUPPLIER PROOF NOTES</text>
    <rect x="0" y="25" width="595" height="5" rx="2" fill="url(#rule)"/>

    <g transform="translate(0 70)">
      <rect width="595" height="150" rx="16" fill="#f2edf8" stroke="#9c8cad" stroke-width="2"/>
      <text x="22" y="38" class="label">TRACEABILITY AREA</text>
      <text x="22" y="81" class="value">Reserved for supplier-issued data</text>
      <text x="22" y="118" class="note">Blank on the proof artwork.</text>
    </g>

    <g transform="translate(0 245)">
      <rect width="595" height="130" rx="16" fill="#fff8e9" stroke="#d6aa50" stroke-width="2"/>
      <text x="22" y="38" class="label">STORAGE COPY</text>
      <text x="22" y="78" class="value">Supplier-approved copy required</text>
      <text x="22" y="110" class="note">Reserved area pending confirmation.</text>
    </g>

    <g transform="translate(0 405)">
      <rect width="595" height="130" rx="16" fill="#fff8e9" stroke="#d6aa50" stroke-width="2"/>
      <text x="22" y="38" class="label">LEGAL ATTRIBUTION</text>
      <text x="22" y="78" class="value">Supplier legal identity required</text>
      <text x="22" y="110" class="note">Reserved area pending confirmation.</text>
    </g>

    <g transform="translate(0 565)">
      <rect width="595" height="140" rx="16" fill="#edf6fa" stroke="#5c9bb4" stroke-width="2"/>
      <text x="22" y="38" class="label">MATCHED DOCUMENTATION</text>
      <text x="22" y="78" class="value">Product-specific document pending</text>
      <text x="22" y="111" class="note">Any destination requires a verified match.</text>
    </g>
  </g>
"""


TEXT_EXT = ('.svg', '.json', '.py', '.ps1', '.md', '.txt')


def canon(path):
    """The committed bytes: text files (TEXT_EXT) with CRLF folded back to LF, because they are committed with LF and a
    Windows checkout with core.autocrlf rewrites them; PNG and WebP files as they are."""
    data = open(path, 'rb').read()
    return data.replace(b'\r\n', b'\n') if path.lower().endswith(TEXT_EXT) else data


def sha(path):
    return hashlib.sha256(canon(path)).hexdigest()


def need(text, search, repl, count=1):
    """Replace exactly `count` occurrences (string) or the first regex match; fail loudly otherwise."""
    if isinstance(search, str):
        n = text.count(search)
        if n != count:
            raise ValueError('expected %d x %r, found %d' % (count, search, n))
        return text.replace(search, repl)
    m = search.search(text)
    if not m:
        raise ValueError('pattern missing: ' + search.pattern)
    return text[:m.start()] + (repl(m) if callable(repl) else repl) + text[m.end():]


def shared_artwork(tpl, v, kind):
    """Port of Batch 008 sharedArtwork(), plus the compound name."""
    mg, name = v['mg'], v['name']
    a = tpl.replace('10 mg', '%d mg' % mg).replace('version 3', 'version 1')
    a = need(a, re.compile(r'<desc id="desc">[^<]*</desc>'),
             '<desc id="desc">Editable Xenios %s %d mg per vial packaging design. Lyophilized vial for laboratory research use only. '
             'Physical dimensions are pending the supplier dieline.</desc>' % (name, mg))
    a = a.replace('TOTAL CONTENT', 'NOMINAL CONTENT')
    a = need(a, re.compile(r'(<text[^>]+(?:x="1250"|x="790")[^>]+>)\d+ mg(</text>)'),
             lambda m: m.group(1) + '%d mg per vial' % mg + m.group(2))
    a = need(a, re.compile(r'<title id="title">Xenios BPC-157 '), '<title id="title">Xenios %s ' % name)
    return a


def fit_name(tpl_text_el, name, avail_right, fit=True):
    """Return (font-size, letter-spacing, baseline) for the name <text>, keeping the template's
    size and spacing ratio unless the name is wider than the space to `avail_right`."""
    x = float(re.search(r' x="([\d.]+)"', tpl_text_el).group(1))
    y = float(re.search(r' y="([\d.]+)"', tpl_text_el).group(1))
    size0 = float(re.search(r'font-size="([\d.]+)"', tpl_text_el).group(1))
    ls0 = float(re.search(r'letter-spacing="(-?[\d.]+)"', tpl_text_el).group(1))
    weight = re.search(r'font-weight="(\d+)"', tpl_text_el).group(1)
    if not fit:
        return size0, ls0, y, None
    size = size0
    while True:
        w = R.measure_text(name, size, weight, ls0 * size / size0)
        if x + w <= avail_right:
            break
        size = round(size - 0.5, 1)
    cap0 = R.cap_height(size0, weight); cap = R.cap_height(size, weight)
    base = y - (cap0 - cap) / 2.0          # centre the smaller name on the template's cap band
    return size, round(ls0 * size / size0, 2), round(base, 1), round(x + w, 1)


def set_name(svg, name, avail_right, anchor_y, fit=True):
    pat = re.compile(r'<text x="[\d.]+" y="%s" font-size="[\d.]+" font-weight="\d+" letter-spacing="-?[\d.]+" fill="#171023">BPC-157</text>' % anchor_y)
    m = pat.search(svg)
    if not m:
        raise ValueError('name element missing at y=%s' % anchor_y)
    el = m.group(0)
    size, ls, base, right = fit_name(el, name, avail_right, fit)
    new = re.sub(r' y="[\d.]+"', ' y="%g"' % base, el, count=1)
    new = re.sub(r'font-size="[\d.]+"', 'font-size="%g"' % size, new)
    new = re.sub(r'letter-spacing="-?[\d.]+"', 'letter-spacing="%g"' % ls, new)
    new = new.replace('>BPC-157<', '>%s<' % name)
    return svg.replace(el, new), dict(fontSize=size, letterSpacing=ls, baseline=base, inkRightEstimate=right)


def front_svg(tpl, v, fit=True):
    a = shared_artwork(tpl, v, 'front')
    a, fit = set_name(a, v['name'], 1450, '470', fit)     # gradient rule spans x 150..1450
    if 'BPC' in a and v['name'] != 'BPC-157':
        raise ValueError('BPC-157 text left in front artwork')
    return a, fit


def wrap_svg(tpl, v, fit=True):
    mg, sku = v['mg'], v['sku']
    a = shared_artwork(tpl, v, 'wrap')
    a = need(a, 'BPC157-10-WRAP-v3', '%s-%d-WRAP-v1' % (v['code'], mg))
    a = need(a, 'GEN-GRP-0262', sku)
    a = need(a, '>%d mg</text>\n    <text x="0" y="295"' % mg, '>%d mg per vial</text>\n    <text x="0" y="295"' % mg)
    a = need(a, '    <text x="0" y="545" class="label">QUICK ORDER SKU</text>',
             '    <text x="0" y="510" class="note">For laboratory research use only.</text>\n'
             '    <text x="0" y="545" class="label">PRODUCT CODE</text>')
    a = need(a, re.compile(r'  <g class="sans" id="back-panel"[\s\S]*?(?=\n  <g class="sans" fill="#554b60">)'), PENDING_PANEL)
    a = need(a, 'panel divisions and dashed safe boundary are proof annotations; dimensions, bleed, seam, material, adhesive, finish and winding remain supplier inputs.',
             'Panel divisions, dashed lines and back-panel notes are proof guides. The supplier will confirm dimensions, bleed, seam and material.')
    a = need(a, 'This proof establishes fixed website artwork and supplier handoff intent. It does not establish printed/in-use packaging.',
             'Packaging design proof. Supplier confirmation and physical production approval are pending.')
    a = need(a, '<text x="0" y="122" class="value">BPC-157</text>', '<text x="0" y="122" class="value">%s</text>' % v['name'])
    a, fit = set_name(a, v['name'], 960, '520', fit)       # front-panel rule spans x 150..960
    if 'BPC' in a and v['name'] != 'BPC-157':
        raise ValueError('BPC-157 text left in wrap artwork')
    return a, fit


def load_templates(REF):
    for f, h in BASE_SHA.items():
        got = sha(os.path.join(REF, f))
        if got != h:
            raise SystemExit('base file hash mismatch: %s %s' % (f, got))
    front_tpl = open(os.path.join(REF, 'bpc-157-10mg-front-artwork-v3.svg'), encoding='utf-8').read().replace('\r\n', '\n')
    wrap_tpl = open(os.path.join(REF, 'bpc-157-10mg-wrap-proof-v3.svg'), encoding='utf-8').read().replace('\r\n', '\n')
    return front_tpl, wrap_tpl


PORT_TEST = dict(slug='port-test-bpc-157-5mg', name='BPC-157', code='BPC157', mg=5, sku='GEN-GRP-0264')


def kern(REF, WORK, TOOLS):
    """Collect every (face, string) the batch will draw, then measure pair kerning with WPF."""
    front_tpl, wrap_tpl = load_templates(REF)
    os.makedirs(WORK, exist_ok=True)
    req = {}
    paths = [os.path.join(REF, 'bpc-157-10mg-front-artwork-v3.svg'), os.path.join(REF, 'bpc-157-10mg-wrap-proof-v3.svg')]
    for v in VARIANTS + [PORT_TEST]:
        fsvg, _ = front_svg(front_tpl, v, fit=False)
        wsvg, _ = wrap_svg(wrap_tpl, v, fit=False)
        for kind, svg in (('front', fsvg), ('wrap', wsvg)):
            path = os.path.join(WORK, '%s-%s.nofit.svg' % (v['slug'], kind))
            open(path, 'w', encoding='utf-8', newline='\n').write(svg)
            paths.append(path)
    for path in paths:
        for key, text in R.strings_for_kerning(path):
            req.setdefault(key, [])
            if text not in req[key]:
                req[key].append(text)
    for v in VARIANTS:                      # the vial render draws names and amounts in Bold
        for t in (v['name'], '%d mg' % v['mg'], '10') + tuple(v['name'].split(' ')):
            if t not in req.setdefault('700', []):
                req['700'].append(t)
    rq = os.path.join(WORK, 'kern-request.json')
    json.dump(req, open(rq, 'w', encoding='utf-8'), indent=1)
    out = os.path.join(TOOLS, 'kern-table.segoe-ui.json')
    ps = os.path.join(TOOLS, 'wpf_kern.ps1')
    subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, '-InFile', rq, '-OutFile', out],
                   check=True, timeout=110)
    t = json.load(open(out, encoding='utf-8-sig'))
    print('kern table', {k: (v['face'], len(v['pairs']), sum(1 for x in v['pairs'].values() if abs(x) > 0.0005)) for k, v in t.items()})


def build(REF, OUT, TOOLS):
    front_tpl, wrap_tpl = load_templates(REF)
    R.load_kern(os.path.join(TOOLS, 'kern-table.segoe-ui.json'))
    X.load_kern(os.path.join(TOOLS, 'kern-table.segoe-ui.json'))
    for d in ('assets', 'labels'):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
    report = []
    for v in VARIANTS:
        stem = v['slug']
        fsvg, ffit = front_svg(front_tpl, v)
        wsvg, wfit = wrap_svg(wrap_tpl, v)
        fpath = os.path.join(OUT, 'labels', stem + '-front-artwork-v1.svg')
        wpath = os.path.join(OUT, 'labels', stem + '-wrap-proof-v1.svg')
        open(fpath, 'w', encoding='utf-8', newline='\n').write(fsvg)
        open(wpath, 'w', encoding='utf-8', newline='\n').write(wsvg)
        fpng = os.path.join(OUT, 'assets', stem + '-front-artwork-v1.png')
        wpng = os.path.join(OUT, 'assets', stem + '-wrap-proof-v1.png')
        fruns = R.render(fpath, fpng)
        wruns = R.render(wpath, wpng)
        Image.open(fpng).save(os.path.join(OUT, 'assets', stem + '-front-artwork-v1.webp'), 'WEBP', quality=92, method=6)
        Image.open(wpng).save(os.path.join(OUT, 'assets', stem + '-wrap-proof-v1.webp'), 'WEBP', quality=92, method=6)
        rpng = os.path.join(OUT, 'assets', stem + '-website-render-v1.png')
        comp = X.compose(os.path.join(REF, 'bpc-157-10mg-website-render-v3.png'), rpng, v['name'], '%d mg' % v['mg'])
        Image.open(rpng).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(
            os.path.join(OUT, 'assets', stem + '-website-render-v1-1024.webp'), 'WEBP', quality=90, method=6)
        report.append(dict(slug=stem, frontNameFit=ffit, wrapNameFit=wfit, renderLayout=comp,
                           frontRuns=fruns, wrapRuns=wruns))
    json.dump(report, open(os.path.join(TOOLS, 'build-report.json'), 'w', encoding='utf-8'), indent=1)
    print(json.dumps([dict(slug=r['slug'], front=r['frontNameFit'], wrap=r['wrapNameFit'], render=dict(mode=r['renderLayout']['mode'],
                     runs=[(p['text'], p['size'], p['baseline']) for p in r['renderLayout']['runs']])) for r in report], indent=1))


if __name__ == '__main__':
    cmd = sys.argv[1]
    {'kern': kern, 'build': build}[cmd](*sys.argv[2:5])
