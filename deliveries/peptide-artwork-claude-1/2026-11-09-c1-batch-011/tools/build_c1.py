"""Build a CLAUDE-1 peptide artwork batch (C1-001 onward, 2026-11-04).

usage: python -I -X utf8 build_c1.py kern  <ref_b004_dir> <work_dir> <tools_dir> <variants.json>   (writes tools/kern-table.segoe-ui.json via WPF)
       python -I -X utf8 build_c1.py build <ref_b004_dir> <out_batch_dir> <tools_dir> <variants.json>
variants.json lists slug, name, code, amount and sku per variant (written by c1_variants.py from the verified label facts).
The amount is the verified text with its unit ("10 mg", "10,000 IU"); variants files before C1-007 give an integer mg
instead, read as "<mg> mg", so earlier batches rebuild unchanged.

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
VARIANTS = []      # filled from the batch's variants.json by load_variants()
AMOUNT = re.compile(r'(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?) (mg|IU)')
# Blends (Root's Option B, KAN-59/11404): the exact name, broken only after ' + ', and the ordered component amounts with
# their unit, joined by '/' as KAN-59/11401 proposed after the live capsule blend's "500/500 mcg" ("10/10 mg", "10/2.5 mg").
BLEND_SEP = ' + '
COMPONENT_AMOUNT = re.compile(r'(\d+(?:\.\d+)?) (mg)')          # every in-scope blend component is stated in mg
BLEND_AMOUNT = re.compile(r'\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)+ mg')


def blend_amount(v):
    """The printed amount of a blend: its components' amounts in name order, joined by '/', then their one unit. Each
    component must sit in its own name segment, in order, so the amounts read in the order of the printed name."""
    comps, segs = v['components'], v['name'].split(BLEND_SEP)
    if len(comps) < 2 or len(segs) != len(comps):
        raise SystemExit('blend %s: %d name segments for %d components' % (v.get('slug'), len(segs), len(comps)))
    nums, units = [], set()
    for c, s in zip(comps, segs):
        m = COMPONENT_AMOUNT.fullmatch(c['amount'])
        if not m:
            raise SystemExit('blend %s: component amount %r has no template review' % (v.get('slug'), c['amount']))
        if not re.search(r'(?<![A-Za-z0-9])%s(?![A-Za-z0-9])' % re.escape(c['name']), s, re.I):
            raise SystemExit('blend %s: component %r is not in its name segment %r' % (v.get('slug'), c['name'], s))
        nums.append(m.group(1))
        units.add(m.group(2))
    if len(units) != 1:
        raise SystemExit('blend %s: components in different units need a template review' % v.get('slug'))
    return '/'.join(nums) + ' ' + units.pop()


def amount_of(v):
    """The printed amount without the per-vial basis: the verified text with its unit. Variants files before C1-007
    carry an integer mg only. A blend's amount is derived from its components (blend_amount)."""
    if v.get('components'):
        a = blend_amount(v)
        if v.get('amount') not in (None, a) or not BLEND_AMOUNT.fullmatch(a):
            raise SystemExit('blend %s: amount %r is not its components\' %r' % (v.get('slug'), v.get('amount'), a))
        return a
    if BLEND_SEP in v['name']:
        raise SystemExit('blend name %r without its components' % v['name'])
    a = v['amount'] if v.get('amount') else '%d mg' % int(v['mg'])
    if not AMOUNT.fullmatch(a):
        raise SystemExit('amount %r has no template review' % a)
    return a


def load_variants(path):
    rows = json.load(open(path, encoding='utf-8'))
    VARIANTS[:] = [dict(slug=v['slug'], name=v['name'], code=v['code'], amount=amount_of(v), sku=v['sku'],
                        **({'components': [dict(name=c['name'], amount=c['amount']) for c in v['components']]}
                           if v.get('components') else {})) for v in rows]
    if len({v['slug'] for v in VARIANTS}) != len(VARIANTS) or len({v['sku'] for v in VARIANTS}) != len(VARIANTS):
        raise SystemExit('duplicate slug or sku in ' + path)

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
    """Port of Batch 008 sharedArtwork(), plus the compound name. Every "10 mg" of the template becomes the verified amount."""
    amount, name = amount_of(v), v['name']
    a = tpl.replace('10 mg', amount).replace('version 3', 'version 1')
    a = need(a, re.compile(r'<desc id="desc">[^<]*</desc>'),
             '<desc id="desc">Editable Xenios %s %s per vial packaging design. Lyophilized vial for laboratory research use only. '
             'Physical dimensions are pending the supplier dieline.</desc>' % (name, amount))
    a = a.replace('TOTAL CONTENT', 'NOMINAL CONTENT')
    a = need(a, re.compile(r'(<text[^>]+(?:x="1250"|x="790")[^>]+>)%s(</text>)' % re.escape(amount)),
             lambda m: m.group(1) + '%s per vial' % amount + m.group(2))
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


# Option B on the label masters (KAN-59/11404). A blend name's first line keeps its ink as far below the gradient rule as
# the XENIOS baseline sits above it: front rule 246-254 with XENIOS at 205 (41 px), wrap rule 320-328 with XENIOS at 280 (40 px).
NAME_TOP = {'470': 254 + 41, '520': 328 + 40}
SIDE = dict(y=122, pitch=34, size=28, weight='680', right=1590 - 20)    # wrap side-panel value; the fold guide is at x 1590


def ink_rows(text, size, weight):
    """Ink above and below the baseline at 1x, from the face's glyph boxes (kerning moves glyphs only sideways)."""
    bb = R.font(weight, size).getbbox(text, anchor='ls')
    return -bb[1] / R.SS, bb[3] / R.SS


def set_name_blend(svg, name, avail_right, anchor_y):
    """The template's one-line fit (as set_name), or the exact name broken only after ' + ' into lines at one size,
    whichever sets the name larger; a tie keeps fewer lines, then the more even line widths. Lines keep the template's x,
    weight, fill and tracking ratio; the last line keeps the template baseline and each line above it steps up by the
    render stack's leading; the first line's ink stays at or below NAME_TOP."""
    pat = re.compile(r'<text x="[\d.]+" y="%s" font-size="[\d.]+" font-weight="\d+" letter-spacing="-?[\d.]+" fill="#171023">BPC-157</text>' % anchor_y)
    m = pat.search(svg)
    if not m:
        raise ValueError('name element missing at y=%s' % anchor_y)
    el = m.group(0)
    x = float(re.search(r' x="([\d.]+)"', el).group(1))
    y = float(re.search(r' y="([\d.]+)"', el).group(1))
    size0 = float(re.search(r'font-size="([\d.]+)"', el).group(1))
    ls0 = float(re.search(r'letter-spacing="(-?[\d.]+)"', el).group(1))
    weight = re.search(r'font-weight="(\d+)"', el).group(1)
    one = fit_name(el, name, avail_right)
    cands = [(one[0], -1, 0.0, [name], [one[2]], one[1], one[3])]
    for lines in X.blend_partitions(name)[1:]:
        size = size0
        while size >= 20:
            sp = ls0 * size / size0
            ws = [R.measure_text(t, size, weight, sp) for t in lines]
            if x + max(ws) <= avail_right:
                rows = [ink_rows(t, size, weight) for t in lines]
                pitch = [max(round(1.0 * size), round(rows[i][1] + rows[i + 1][0] + 0.10 * size)) for i in range(len(lines) - 1)]
                if y - sum(pitch) - rows[0][0] >= NAME_TOP[anchor_y]:
                    bases = [y]
                    for p in reversed(pitch):
                        bases.insert(0, bases[0] - p)
                    cands.append((size, -len(lines), -round(max(ws) - min(ws), 1), lines, bases, round(sp, 2), round(x + max(ws), 1)))
                    break
            size = round(size - 0.5, 1)
    size, _, _, lines, bases, ls, right = max(cands, key=lambda c: c[:3])

    def element(text, base):
        new = re.sub(r' y="[\d.]+"', ' y="%g"' % base, el, count=1)
        new = re.sub(r'font-size="[\d.]+"', 'font-size="%g"' % size, new)
        new = re.sub(r'letter-spacing="-?[\d.]+"', 'letter-spacing="%g"' % ls, new)
        return new.replace('>BPC-157<', '>%s<' % text)
    out = svg.replace(el, '\n    '.join(element(t, b) for t, b in zip(lines, bases)))
    return out, dict(fontSize=size, letterSpacing=ls, baselines=bases, lines=lines, inkRightEstimate=right, oneLineFitPx=one[0],
                     candidates=[dict(lines=c[3], fontSize=c[0]) for c in cands])


def side_lines(name):
    """The wrap side panel prints the name at its value size. A blend name wider than the panel breaks only after ' + '
    onto the fewest lines that fit (then the more even widths), SIDE['pitch'] apart; the last line's ink must stay 12 px
    above the next field label, or the build stops for a layout review."""
    best = None
    for lines in X.blend_partitions(name):
        ws = [R.measure_text(t, SIDE['size'], SIDE['weight'], 0) for t in lines]
        if 1080 + max(ws) <= SIDE['right']:
            key = (-len(lines), -round(max(ws) - min(ws), 1))
            if best is None or key > best[0]:
                best = (key, lines)
    if best is None:
        raise SystemExit('side-panel name %r does not fit on any Option B line set' % name)
    lines = best[1]
    bottom = SIDE['y'] + SIDE['pitch'] * (len(lines) - 1) + ink_rows(lines[-1], SIDE['size'], SIDE['weight'])[1]
    if bottom > 190 - ink_rows('NOMINAL CONTENT', 21, '780')[0] - 12:
        raise SystemExit('side-panel name %r on %d lines crowds the next field label: layout review needed' % (name, len(lines)))
    return lines


def blend_amount_clear(v):
    """A blend's amount strings are longer than any single amount: each must stay inside its field, and the right-aligned
    nominal content must stay 24 px clear of the left-aligned line beside it (template elements, hash-pinned in BASE_SHA)."""
    amount = amount_of(v)
    per_vial = amount + ' per vial'
    w = R.measure_text
    checks = [
        ('front amount', 158 + w(amount, 98, '780', 0) <= 1450),
        ('front nominal content', 145 + 1250 - w(per_vial, 38, '820', 0) >= 145 + 58 + w('NONCLINICAL USE ONLY', 27, '650', 2.2) + 24),
        ('wrap amount', 153 + w(amount, 88, '790', 0) <= 960),
        ('wrap nominal content', 140 + 790 - w(per_vial, 34, '840', 0) >= 140 + 50 + w('NONCLINICAL USE ONLY', 24, '650', 1.8) + 24),
        ('wrap side-panel nominal content', 1080 + w(per_vial, SIDE['size'], SIDE['weight'], 0) <= SIDE['right']),
    ]
    bad = [k for k, ok in checks if not ok]
    if bad:
        raise SystemExit('blend %s: %s do not fit: layout review needed' % (v['slug'], ', '.join(bad)))


def template_text_left(a, v, lines=()):
    """True when 'BPC' remains outside the printed name and its lines (the template's BPC-157 text was not all replaced)."""
    rest = a
    for t in sorted({v['name'], *lines}, key=len, reverse=True):
        rest = rest.replace(t, '')
    return 'BPC' in rest


def front_svg(tpl, v, fit=True):
    a = shared_artwork(tpl, v, 'front')
    lines = ()
    if fit and BLEND_SEP in v['name']:
        a, fit = set_name_blend(a, v['name'], 1450, '470')     # gradient rule spans x 150..1450
        lines = fit['lines']
        blend_amount_clear(v)
    else:
        a, fit = set_name(a, v['name'], 1450, '470', fit)     # gradient rule spans x 150..1450
    if v['name'] != 'BPC-157' and template_text_left(a, v, lines):
        raise ValueError('BPC-157 text left in front artwork')
    return a, fit


def wrap_svg(tpl, v, fit=True):
    amount, sku = amount_of(v), v['sku']
    a = shared_artwork(tpl, v, 'wrap')
    # The proof id is the exact product code. The template form, code-amount (BPC157-10), would print
    # KISSPEPTIN-10 for Kisspeptin 10 mg: a fragment name its verified label facts forbid.
    a = need(a, 'BPC157-10-WRAP-v3', '%s-WRAP-v1' % sku)
    a = need(a, 'GEN-GRP-0262', sku)
    a = need(a, '>%s</text>\n    <text x="0" y="295"' % amount, '>%s per vial</text>\n    <text x="0" y="295"' % amount)
    a = need(a, '    <text x="0" y="545" class="label">QUICK ORDER SKU</text>',
             '    <text x="0" y="510" class="note">For laboratory research use only.</text>\n'
             '    <text x="0" y="545" class="label">PRODUCT CODE</text>')
    a = need(a, re.compile(r'  <g class="sans" id="back-panel"[\s\S]*?(?=\n  <g class="sans" fill="#554b60">)'), PENDING_PANEL)
    a = need(a, 'panel divisions and dashed safe boundary are proof annotations; dimensions, bleed, seam, material, adhesive, finish and winding remain supplier inputs.',
             'Panel divisions, dashed lines and back-panel notes are proof guides. The supplier will confirm dimensions, bleed, seam and material.')
    a = need(a, 'This proof establishes fixed website artwork and supplier handoff intent. It does not establish printed/in-use packaging.',
             'Packaging design proof. Supplier confirmation and physical production approval are pending.')
    blend = fit and BLEND_SEP in v['name']
    side = side_lines(v['name']) if blend else [v['name']]
    a = need(a, '<text x="0" y="122" class="value">BPC-157</text>',
             '\n    '.join('<text x="0" y="%d" class="value">%s</text>' % (SIDE['y'] + SIDE['pitch'] * i, t) for i, t in enumerate(side)))
    if blend:
        a, fit = set_name_blend(a, v['name'], 960, '520')       # front-panel rule spans x 150..960
        fit['sideLines'] = side
        lines = fit['lines'] + side
    else:
        a, fit = set_name(a, v['name'], 960, '520', fit)       # front-panel rule spans x 150..960
        lines = ()
    if v['name'] != 'BPC-157' and template_text_left(a, v, lines):
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
        for t in (v['name'], amount_of(v), '10') + tuple(v['name'].split(' ')):
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
        comp = X.compose(os.path.join(REF, 'bpc-157-10mg-website-render-v3.png'), rpng, v['name'], amount_of(v))
        Image.open(rpng).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(
            os.path.join(OUT, 'assets', stem + '-website-render-v1-1024.webp'), 'WEBP', quality=90, method=6)
        report.append(dict(slug=stem, frontNameFit=ffit, wrapNameFit=wfit, renderLayout=comp,
                           frontRuns=fruns, wrapRuns=wruns))
    json.dump(report, open(os.path.join(TOOLS, 'build-report.json'), 'w', encoding='utf-8', newline='\n'), indent=1)
    print(json.dumps([dict(slug=r['slug'], front=r['frontNameFit'], wrap=r['wrapNameFit'], render=dict(mode=r['renderLayout']['mode'],
                     runs=[(p['text'], p['size'], p['baseline']) for p in r['renderLayout']['runs']])) for r in report], indent=1))


if __name__ == '__main__':
    cmd = sys.argv[1]
    load_variants(sys.argv[5])
    {'kern': kern, 'build': build}[cmd](*sys.argv[2:5])
