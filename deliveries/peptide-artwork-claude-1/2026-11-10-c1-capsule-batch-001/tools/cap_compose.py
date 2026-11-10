"""Capsule render compositor (CLAUDE-1). Base: the accepted capsule render of Codex imagery Batch 012 (5-Amino-1MQ 50 mg,
1024 x 1024 WebP, public commit 0ab9ebc1). Only the name rows and the listed-strength rows are erased and re-set in
Segoe UI Bold. No generative model. Every pixel outside the two erased rectangles is identical to the decoded base.

usage: python -I -B -X utf8 caps/cap_compose.py <base.webp> <kern-table.json> <out.png> <name> <amount>
"""
import json, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageChops
import xr_compose as X

COL = (255, 775)                    # label columns erased (inclusive)
NAME = dict(size=90.3, track_em=-0.034, ink=(12, 9, 40), thr=99, erase=(464, 562), above=(447, 462), below=(564, 570),
            left=263, baseline=536, max_w=503)
AMT = dict(size=89.0, track_em=-0.030, ink=(77, 6, 205), thr=119, erase=(604, 695), above=(593, 602), below=(697, 703),
           left=268, baseline=671, max_w=497)


def _erase(im, spec, seed):
    px = im.load(); rnd = random.Random(seed)

    def med(rows):
        out = []
        for x in range(COL[0], COL[1] + 1):
            v = sorted(px[x, y] for y in range(rows[0], rows[1] + 1)); out.append(v[len(v) // 2])
        return out
    a, b = med(spec['above']), med(spec['below'])
    ya = sum(spec['above']) / 2; yb = sum(spec['below']) / 2
    for i, x in enumerate(range(COL[0], COL[1] + 1)):
        for y in range(spec['erase'][0], spec['erase'][1] + 1):
            t = (y - ya) / (yb - ya)
            px[x, y] = tuple(max(0, min(255, round(a[i][k] * (1 - t) + b[i][k] * t + rnd.gauss(0, 0.5)))) for k in range(3))


def _put(im, text, spec):
    size = spec['size']
    while X.measure(text, spec, size)['w'] > spec['max_w'] and size > 30:
        size = round(size - 0.2, 2)
    m, bl = X.run_mask(text, spec, size)
    bb = X.ink_box(m, spec['thr'])
    dx = spec['left'] - bb[0]; dy = spec['baseline'] - bl
    box = [bb[0] + dx, bb[1] + dy, bb[2] + dx - 1, bb[3] + dy - 1]
    cov = X.ink_box(m, 0)
    if not (spec['erase'][0] <= cov[1] + dy and cov[3] - 1 + dy <= spec['erase'][1] and COL[0] <= cov[0] + dx and cov[2] - 1 + dx <= COL[1]):
        raise ValueError('text %r does not stay inside its erased rectangle' % text)
    im.paste(Image.new('RGB', m.size, spec['ink']), (dx, dy), m)
    return dict(text=text, fontSizePx=round(size, 2), baselineRow=spec['baseline'], inkBox=box)


def compose_image(base_path, name, amount):
    """Return (image, layout). Raises unless every pixel outside the two erased rectangles equals the decoded base."""
    src = Image.open(base_path).convert('RGB')
    if src.size != (1024, 1024):
        raise ValueError('base render must be 1024 x 1024')
    im = src.copy()
    _erase(im, NAME, 1); _erase(im, AMT, 2)
    runs = [_put(im, name, NAME), _put(im, amount, AMT)]
    diff = ImageChops.difference(src, im)
    for spec in (NAME, AMT):
        diff.paste((0, 0, 0), (COL[0], spec['erase'][0], COL[1] + 1, spec['erase'][1] + 1))
    if diff.getbbox() is not None:
        raise ValueError('pixels changed outside the erased rectangles')
    return im, dict(mode='capsule-one-line', runs=runs, erasedRows=[list(NAME['erase']), list(AMT['erase'])], erasedColumns=list(COL))


if __name__ == '__main__':
    base, kern, out, name, amount = sys.argv[1:6]
    X.load_kern(kern)
    im, layout = compose_image(base, name, amount)
    im.save(out)
    print(json.dumps(dict(out=out, layout=layout)))
