"""Xenios peptide render compositor (CLAUDE-1, 2026-11-04).

Base: the accepted Batch 004 BPC-157 10 mg v3 website render (1254 x 1254).
Only the compound-name line and, when needed, the amount line are erased and re-set
in Segoe UI Bold, matched to the render (name IoU 0.86, amount IoU 0.90). Every pixel
outside the erased rows of the text column is byte-identical to the base render.
A blend name (one containing ' + ') takes Root's Option B (KAN-59/11404): the exact name, broken only after ' + ',
with every name line and the amount scaled together; any other name keeps the layout of C1-001 to C1-007.
"""
import json, random
from PIL import Image, ImageDraw, ImageFont

BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
KERN_BOLD = {}     # pair -> em, Segoe UI Bold, measured with WPF (scripts/wpf_kern.ps1)


def load_kern(path):
    t = json.load(open(path, encoding='utf-8-sig'))
    KERN_BOLD.clear(); KERN_BOLD.update(t['700']['pairs'])


def kern_em(pair):
    if pair not in KERN_BOLD:
        raise KeyError('kerning pair %r missing; regenerate the kern table' % pair)
    return KERN_BOLD[pair]
SS = 4
NAME = dict(size=91.6, track_em=-6 / 176, ink=(12, 9, 40), thr=99)      # SVG letter-spacing -6 at 176
AMOUNT = dict(size=63.2, track_em=-1.25 / 63.2, ink=(73, 11, 197), thr=119)
COL_X0, COL_X1 = 448, 807            # text column erased (inclusive)
LEFT_NAME, LEFT_AMOUNT = 458, 460    # left ink edges (threshold 150) in the base render
RIGHT_LIMIT = 801                    # right end of the gradient rule
RULE_BOTTOM, LV_TOP = 563, 753       # gradient rule bottom row; LYOPHILIZED VIAL top row
NAME_ROWS = (567, 671)               # erase rows for the name line
AMOUNT_ROWS = (672, 742)             # erase rows for the amount line
ORIG_NAME_CAP = (591, 657)           # BPC-157 ink rows (threshold 150)
ORIG_AMOUNT_DIGITS = (676, 720)      # "10" ink rows (threshold 150)


def run_mask(text, spec, size):
    """Coverage mask (L, 255 = ink) at 1x and the baseline row index inside the mask."""
    f = ImageFont.truetype(BOLD, round(size * SS))
    asc, desc = f.getmetrics()
    track = spec['track_em'] * size * SS
    adv = []
    for i, c in enumerate(text):
        nxt = text[i + 1] if i + 1 < len(text) else None
        a = f.getlength(c) + (kern_em(c + nxt) * size * SS if nxt else 0)
        adv.append(a + (track if nxt else 0))
    pad = 12 * SS
    top_pad = pad + (-(pad + asc)) % SS          # baseline lands on a whole 1x row
    w = int(sum(adv) + 2 * pad); w += (-w) % SS
    h = int(top_pad + asc + desc + pad); h += (-h) % SS
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    x = pad
    for c, a in zip(text, adv):
        d.text((x, top_pad), c, font=f, fill=255)
        x += a
    return img.resize((w // SS, h // SS), Image.LANCZOS), (top_pad + asc) // SS


def ink_box(mask, thr):
    return mask.point(lambda v: 255 if v > thr else 0).getbbox()      # (x0, y0, x1 + 1, y1 + 1)


def measure(text, spec, size):
    m, base = run_mask(text, spec, size)
    bb = ink_box(m, spec['thr'])
    return dict(w=bb[2] - bb[0], above=base - bb[1], below=bb[3] - 1 - base)


def coverage_rows(text, spec, size):
    """Rows above and below the baseline that receive any coverage at all (threshold 0), faint anti-aliasing included."""
    m, base = run_mask(text, spec, size)
    bb = ink_box(m, 0)
    return base - bb[1], bb[3] - 1 - base


def calibrated_baselines():
    """Baselines that put BPC-157 and 10 mg exactly on their base-render ink rows."""
    n = measure('BPC-157', NAME, NAME['size'])
    d = measure('10', AMOUNT, AMOUNT['size'])
    return ORIG_NAME_CAP[1] - n['below'], ORIG_AMOUNT_DIGITS[1] - d['below']


def column_median(px, rows):
    out = []
    for x in range(COL_X0, COL_X1 + 1):
        vals = sorted(px[x, y] for y in range(rows[0], rows[1] + 1))
        out.append(vals[len(vals) // 2])
    return out


def erase(im, rows, above_rows, below_rows, seed):
    """Fill rows of the text column by per-column linear interpolation between clean rows, plus matched grain."""
    px = im.load()
    above = column_median(px, above_rows); below = column_median(px, below_rows)
    ya = (above_rows[0] + above_rows[1]) / 2; yb = (below_rows[0] + below_rows[1]) / 2
    rnd = random.Random(seed)
    for i, x in enumerate(range(COL_X0, COL_X1 + 1)):
        a, b = above[i], below[i]
        for y in range(rows[0], rows[1] + 1):
            t = (y - ya) / (yb - ya)
            n = rnd.gauss(0, 0.67)
            px[x, y] = tuple(max(0, min(255, round(a[k] * (1 - t) + b[k] * t + n))) for k in range(3))


def paste_run(im, text, spec, size, left, baseline):
    m, base = run_mask(text, spec, size)
    bb = ink_box(m, spec['thr'])
    dx = left - bb[0]; dy = baseline - base
    im.paste(Image.new('RGB', m.size, spec['ink']), (dx, dy), m)
    return dict(text=text, size=round(size, 2), left=left, baseline=baseline,
                inkBox=[bb[0] + dx, bb[1] + dy, bb[2] + dx - 1, bb[3] + dy - 1])


def fit_size(text, spec, max_w, start):
    s = start
    while measure(text, spec, s)['w'] > max_w and s > 20:
        s -= 0.2
    return round(s, 2)


def split_two(name):
    words = name.split(' ')
    if len(words) < 2:
        return None
    best = None
    for i in range(1, len(words)):
        a, b = ' '.join(words[:i]), ' '.join(words[i:])
        score = abs(len(a) - len(b))
        if best is None or score < best[0]:
            best = (score, a, b)
    return best[1], best[2]


SEP = ' + '      # a blend name's component separator; Option B (KAN-59/11404) breaks the printed name only after it


def blend_partitions(name):
    """Every way to break a blend name only after ' + ', first the unbroken name. Each is a list of lines; every line but
    the last ends in ' +', so ' '.join(lines) gives back the exact name."""
    segs = name.split(SEP)
    out = []
    for mask in range(2 ** (len(segs) - 1)):
        lines, cur = [], segs[0]
        for i, s in enumerate(segs[1:]):
            if mask >> i & 1:
                lines.append(cur + ' +')
                cur = s
            else:
                cur += SEP + s
        lines.append(cur)
        out.append(lines)
    return out


class NoFit(ValueError):
    """A blend line set that cannot fit the name band at any allowed scale."""


def stack_lines(lines, amount, max_w):
    """Name lines and the amount scaled together by k inside the name band, centred between the rule and LYOPHILIZED VIAL,
    with stack_ops' leading and gap (the KAN-59/11401 mock). The gap runs to the top of the amount's own ink, so a glyph
    rising above the digits cannot crowd the name. Returns (ops, k, name size, amount size)."""
    top_lim, bot_lim = RULE_BOTTOM + 16, LV_TOP - 13
    k = 1.0
    while True:
        sn, sa = NAME['size'] * k, AMOUNT['size'] * k
        ms = [measure(t, NAME, sn) for t in lines]
        ma, mdig = measure(amount, AMOUNT, sa), measure('10', AMOUNT, sa)
        top_a = max(mdig['above'], ma['above'])
        if max(m['w'] for m in ms) <= max_w and ma['w'] <= max_w:
            leads = [max(round(1.0 * sn), ms[i]['below'] + ms[i + 1]['above'] + round(0.10 * sn)) for i in range(len(ms) - 1)]
            gap = max(round(18 * k), ms[-1]['below'] + round(0.12 * sn))
            h = ms[0]['above'] + sum(leads) + gap + top_a + ma['below']
            if h <= bot_lim - top_lim:
                # every pixel the stack touches, faint anti-aliasing included, must lie in the erased rows: the rows just
                # outside them are the clean rows the erase interpolates from, and stay byte-identical to the base render
                b = top_lim + ((bot_lim - top_lim) - h) // 2 + ms[0]['above']
                bases = [b]
                for i in range(len(ms) - 1):
                    bases.append(bases[-1] + leads[i])
                bases.append(bases[-1] + gap + top_a)
                cov = [coverage_rows(t, NAME, sn) for t in lines] + [coverage_rows(amount, AMOUNT, sa)]
                if min(y - c[0] for y, c in zip(bases, cov)) >= NAME_ROWS[0] and max(y + c[1] for y, c in zip(bases, cov)) <= AMOUNT_ROWS[1]:
                    break
        k = round(k - 0.005, 3)
        if k < 0.3:
            raise NoFit('blend lines %r do not fit the name band' % (lines,))
    b = top_lim + ((bot_lim - top_lim) - h) // 2 + ms[0]['above']
    ops = [('name', lines[0], sn, LEFT_NAME, b)]
    for i, t in enumerate(lines[1:]):
        b += leads[i]
        ops.append(('name', t, sn, LEFT_NAME, b))
    ops.append(('amount', amount, sa, LEFT_AMOUNT, b + gap + top_a))
    return ops, k, sn, sa


def blend_layout(name, amount):
    """Option B (KAN-59/11404): the exact name, broken only after ' + ', on whichever line set gives the largest scale;
    a tie keeps fewer lines, then the more even line widths. Every name line and the amount scale together."""
    max_w = RIGHT_LIMIT - LEFT_NAME
    cands, unfit = [], []
    for lines in blend_partitions(name):
        try:
            ops, k, sn, sa = stack_lines(lines, amount, max_w)
        except NoFit:
            unfit.append(lines)      # this line set cannot fit; another may
            continue
        widths = [measure(t, NAME, sn)['w'] for t in lines]
        cands.append((k, -len(lines), -(max(widths) - min(widths)), lines, ops, sn))
    if not cands:
        raise ValueError('blend name %r does not fit the name band on any line set' % name)
    k, _, _, lines, ops, sn = max(cands, key=lambda c: c[:3])
    one = [c for c in cands if len(c[3]) == 1]
    info = dict(oneLineFit=round(one[0][5], 2) if one else None, k=k,
                blendCandidates=[dict(lines=c[3], k=c[0], nameSize=round(c[5], 2)) for c in cands])
    if unfit:
        info['unfitLineSets'] = unfit
    return 'blend-%d' % len(lines), ops, [(NAME_ROWS[0], AMOUNT_ROWS[1])], info


def layout(name, amount, mode='auto'):
    if SEP in name:
        if mode != 'auto':
            raise ValueError('a blend name takes the Option B layout only')
        return blend_layout(name, amount)
    name_base0, amount_base0 = calibrated_baselines()
    max_w = RIGHT_LIMIT - LEFT_NAME
    one = fit_size(name, NAME, max_w, NAME['size'])
    if mode == 'auto':
        mode = 'one' if (one >= 0.70 * NAME['size'] or ' ' not in name) else 'stack'
        if mode == 'stack' and stack_ops(name, amount, max_w)[2] <= one:
            mode = 'one'      # a stack only helps when it sets the name larger than one line does (not so for Melanotan II, C1-005)
    if mode == 'one':
        s = one
        if s == NAME['size']:
            base = name_base0
            if measure(name, NAME, s)['below'] > ORIG_AMOUNT_DIGITS[0] - 9 - base:   # fail closed: no tested layout yet
                raise ValueError('full-size name with a descender would crowd the amount line: %r needs a layout review' % name)
        else:
            cap = measure('H', NAME, s)['above']
            base = round((ORIG_NAME_CAP[0] + ORIG_NAME_CAP[1]) / 2 + cap / 2)
            desc = measure(name, NAME, s)['below']
            base = min(base, ORIG_AMOUNT_DIGITS[0] - 9 - max(0, desc))     # keep 9 px above the amount digits
        ops = [('name', name, s, LEFT_NAME, base)]
        erase_rows = [NAME_ROWS]
        if amount != '10 mg':
            ops.append(('amount', amount, AMOUNT['size'], LEFT_AMOUNT, amount_base0))
            erase_rows = [(NAME_ROWS[0], AMOUNT_ROWS[1])]
        return mode, ops, erase_rows, dict(oneLineFit=one)
    ops, k, _ = stack_ops(name, amount, max_w)
    return mode, ops, [(NAME_ROWS[0], AMOUNT_ROWS[1])], dict(oneLineFit=one, k=round(k, 3))


def stack_ops(name, amount, max_w):
    """Two name lines + amount, scaled together by k, centred between the rule and LYOPHILIZED VIAL. Returns (ops, k, name size)."""
    l1, l2 = split_two(name)
    top_lim, bot_lim = RULE_BOTTOM + 16, LV_TOP - 13
    k = 1.0
    while k > 0.4:
        sn, sa = NAME['size'] * k, AMOUNT['size'] * k
        m1, m2 = measure(l1, NAME, sn), measure(l2, NAME, sn)
        ma, mdig = measure(amount, AMOUNT, sa), measure('10', AMOUNT, sa)
        if max(m1['w'], m2['w']) <= max_w:
            lead = max(round(1.0 * sn), m1['below'] + m2['above'] + round(0.10 * sn))
            gap = max(round(18 * k), m2['below'] + round(0.12 * sn))
            h = m1['above'] + lead + gap + mdig['above'] + ma['below']
            if h <= bot_lim - top_lim:
                break
        k -= 0.005
    top = top_lim + ((bot_lim - top_lim) - h) // 2
    b1 = top + m1['above']; b2 = b1 + lead; ba = b2 + gap + mdig['above']
    ops = [('name', l1, sn, LEFT_NAME, b1), ('name', l2, sn, LEFT_NAME, b2), ('amount', amount, sa, LEFT_AMOUNT, ba)]
    return ops, k, sn


def compose(base_path, out_path, name, amount='10 mg', mode='auto', seed=20261104):
    im, info = compose_image(base_path, name, amount, mode, seed)
    im.save(out_path, optimize=True)
    return info


def compose_image(base_path, name, amount='10 mg', mode='auto', seed=20261104):
    """The composite as an image plus its layout record; compose() saves it. verify_c1.py --recompute uses this."""
    im = Image.open(base_path).convert('RGB')
    mode, ops, erase_rows, info = layout(name, amount, mode)
    for rows in erase_rows:
        if rows == NAME_ROWS:
            erase(im, rows, (564, 570), (662, 671), seed)
        elif rows == AMOUNT_ROWS:
            erase(im, rows, (662, 671), (743, 750), seed)
        else:
            erase(im, rows, (564, 570), (743, 750), seed)
    placed = []
    for kind, text, size, left, base in ops:
        spec = NAME if kind == 'name' else AMOUNT
        placed.append(dict(kind=kind, **paste_run(im, text, spec, size, left, base)))
    lo = min(r[0] for r in erase_rows); hi = max(r[1] for r in erase_rows)
    for p in placed:
        x0, y0, x1, y1 = p['inkBox']
        assert COL_X0 <= x0 and x1 <= RIGHT_LIMIT + 1 and lo <= y0 and y1 <= hi, ('ink outside erased area', p)
    return im, dict(name=name, amount=amount, mode=mode, eraseRows=erase_rows, runs=placed, **info)


if __name__ == '__main__':
    import sys
    a = sys.argv[1:]
    mode = a[a.index('--mode') + 1] if '--mode' in a else 'auto'
    amount = a[a.index('--amount') + 1] if '--amount' in a else '10 mg'
    print(json.dumps(compose(a[0], a[1], a[2], amount, mode)))
