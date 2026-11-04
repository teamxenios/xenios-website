"""Xenios peptide render compositor (CLAUDE-1, 2026-11-04).

Base: the accepted Batch 004 BPC-157 10 mg v3 website render (1254 x 1254).
Only the compound-name line and, when needed, the amount line are erased and re-set
in Segoe UI Bold, matched to the render (name IoU 0.86, amount IoU 0.90). Every pixel
outside the erased rows of the text column is byte-identical to the base render.
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


def layout(name, amount, mode='auto'):
    name_base0, amount_base0 = calibrated_baselines()
    max_w = RIGHT_LIMIT - LEFT_NAME
    one = fit_size(name, NAME, max_w, NAME['size'])
    if mode == 'auto':
        mode = 'one' if (one >= 0.70 * NAME['size'] or ' ' not in name) else 'stack'
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
    # stack: two name lines + amount, scaled together by k, centred between the rule and LYOPHILIZED VIAL
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
    return mode, ops, [(NAME_ROWS[0], AMOUNT_ROWS[1])], dict(oneLineFit=one, k=round(k, 3))


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
