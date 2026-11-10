"""Capsule front label (CLAUDE-1): a standalone capsule front-label SVG master (1000 x 850) made from the front panel of
the accepted capsule wrap proof (Codex Batch 012, public commit 0ab9ebc1), with only the name and listed strength replaced,
and its preview drawn by scripts/svg_label_render.py (Segoe UI faces, WPF-measured kerning). No generative model.

usage (from the claude1 scratch root):
  python -I -B -X utf8 caps/cap_front.py svg     <wrap-template.svg> <name> <amount> <out.svg>
  python -I -B -X utf8 caps/cap_front.py kernreq <front.svg> [<front.svg> ...] <out-request.json>
  python -I -B -X utf8 caps/cap_front.py render  <front.svg> <kern-table.json> <out.png>
"""
import json, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svg_label_render as R

# The accepted capsule previews (Sharp/librsvg) drew weight 800 with Segoe UI Bold, where the Batch 004 vial previews drew
# it with Black. For capsule labels a weight below 850 therefore takes Bold; 900 takes Black.
R.face_key = lambda w: '900' if float(w) >= 850 else '700'

# The accepted capsule wrap carries a <view> element (a named viewBox for the front crop). It draws nothing, so the
# renderer skips it here; the shared vial renderer is left byte-identical.
_renderer_init = R.Renderer.__init__


def _init_skipping_view(self, svg_path):
    _renderer_init(self, svg_path)
    for parent in list(self.root.iter()):
        for el in list(parent):
            if el.tag == R.NS + 'view':
                parent.remove(el)


R.Renderer.__init__ = _init_skipping_view

TPL_NAME, TPL_AMOUNT = '5-Amino-1MQ', '50 mg'
NAME_X, NAME_SIZE, NAME_SPACING, RIGHT = 72, 118.0, -3.0, 922      # the rule ends at x 922


def front_svg(template, name, amount, kern_table=None):
    s = open(template, encoding='utf-8').read()
    defs = re.search(r'<defs>.*?</defs>', s, re.S).group(0)
    panel = re.search(r'<g id="front-panel" transform="translate\(100 150\)">(.*?)\n    </g>', s, re.S).group(1)
    name_line = '<text x="72" y="336" font-size="118" font-weight="800" letter-spacing="-3">%s</text>' % TPL_NAME
    amt_line = '<text x="73" y="565" font-size="120" font-weight="800" fill="#5616d2">%s</text>' % TPL_AMOUNT
    assert panel.count(name_line) == 1 and panel.count(amt_line) == 1
    size = NAME_SIZE
    if kern_table:                      # fit the name to the rule, as the vial labels do
        R.load_kern(kern_table)
        while R.measure_text(name, size, 800, NAME_SPACING * size / NAME_SIZE) > RIGHT - NAME_X and size > 40:
            size -= 0.5
    sp = round(NAME_SPACING * size / NAME_SIZE, 2)
    panel = panel.replace(name_line, '<text x="72" y="336" font-size="%g" font-weight="800" letter-spacing="%g">%s</text>' % (size, sp, name))
    panel = panel.replace(amt_line, amt_line.replace(TPL_AMOUNT, amount))
    panel = '\n'.join(l[2:] if l.startswith('  ') else l for l in panel.split('\n'))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="850" viewBox="0 0 1000 850" role="img" aria-labelledby="title description">\n'
            '  <title id="title">Xenios %s %s capsule bottle front label design</title>\n'
            '  <desc id="description">Editable front label for a research capsule bottle design with a listed strength of %s.</desc>\n'
            '  %s\n'
            '  <g font-family="Segoe UI, Arial, sans-serif" fill="#171431">%s\n  </g>\n</svg>\n' % (name, amount, amount, defs, panel)), size


def wrap_svg(template, name, amount, sku, kern_table=None):
    """The accepted capsule wrap proof with the name, listed strength, product code and proof id replaced, nothing else."""
    s = open(template, encoding='utf-8').read()
    size = NAME_SIZE
    if kern_table:
        R.load_kern(kern_table)
        while R.measure_text(name, size, 800, NAME_SPACING * size / NAME_SIZE) > RIGHT - NAME_X and size > 40:
            size -= 0.5
    sp = round(NAME_SPACING * size / NAME_SIZE, 2)
    pairs = [
        ('<title id="title">Xenios %s %s capsule bottle wrap design</title>' % (TPL_NAME, TPL_AMOUNT),
         '<title id="title">Xenios %s %s capsule bottle wrap design</title>' % (name, amount)),
        ('with a listed strength of %s. The proof' % TPL_AMOUNT, 'with a listed strength of %s. The proof' % amount),
        ('>GEN-GRP-0243-WRAP-v1</text>', '>%s-WRAP-v1</text>' % sku),
        ('<text x="72" y="336" font-size="118" font-weight="800" letter-spacing="-3">%s</text>' % TPL_NAME,
         '<text x="72" y="336" font-size="%g" font-weight="800" letter-spacing="%g">%s</text>' % (size, sp, name)),
        ('<text x="73" y="565" font-size="120" font-weight="800" fill="#5616d2">%s</text>' % TPL_AMOUNT,
         '<text x="73" y="565" font-size="120" font-weight="800" fill="#5616d2">%s</text>' % amount),
        ('<text x="0" y="120" font-size="40" font-weight="800">%s</text>' % TPL_NAME, '<text x="0" y="120" font-size="40" font-weight="800">%s</text>' % name),
        ('>Listed strength %s</text>' % TPL_AMOUNT, '>Listed strength %s</text>' % amount),
        ('<text x="0" y="377" font-size="40" font-weight="800">GEN-GRP-0243</text>', '<text x="0" y="377" font-size="40" font-weight="800">%s</text>' % sku),
    ]
    for a, b in pairs:
        assert s.count(a) == 1, (a[:60], s.count(a))
        s = s.replace(a, b)
    assert TPL_NAME not in s and 'GEN-GRP-0243' not in s and (TPL_AMOUNT == amount or TPL_AMOUNT not in s)
    return s, size


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'svg':
        tpl, name, amount, out = sys.argv[2:6]
        kt = sys.argv[6] if len(sys.argv) > 6 else None
        svg, size = front_svg(tpl, name, amount, kt)
        open(out, 'w', encoding='utf-8', newline='\n').write(svg)
        print(json.dumps(dict(out=out, nameFontSize=size)))
    elif cmd == 'kernreq':
        req = {}
        for p in sys.argv[2:-1]:
            for key, text in R.strings_for_kerning(p):
                if text not in req.setdefault(key, []):
                    req[key].append(text)
        json.dump(req, open(sys.argv[-1], 'w', encoding='utf-8'), indent=1)
        print({k: len(v) for k, v in req.items()})
    elif cmd == 'render':
        R.load_kern(sys.argv[3])
        print(json.dumps(R.render(sys.argv[2], sys.argv[4])))
