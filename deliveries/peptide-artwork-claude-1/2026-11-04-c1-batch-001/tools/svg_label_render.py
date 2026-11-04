"""Minimal renderer for the Xenios label SVG templates (Batch 004 v3 front + wrap, Batch 008 derivatives).

Supports exactly what those templates use and raises on anything else:
  <rect> (x, y, width, height, rx; solid or objectBoundingBox linearGradient fill; stroke, stroke-width,
         stroke-dasharray; the drop-shadow filter), <line> (stroke, dash), <text> (x, y, font-size,
         font-weight, letter-spacing, fill, text-anchor, class), <g> (translate, presentation attributes,
         group opacity), and class rules from the <style> block (author CSS beats presentation attributes).
Fonts: Segoe UI faces chosen by nearest weight (ties to the heavier face), which is how the accepted
Batch 004 preview resolved them; OpenType pair kerning comes from a WPF-measured table (wpf_kern.ps1).
Validated against the accepted Batch 004 front preview: mean absolute difference 0.77 of 255.
"""
import json, math, re, sys, xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

NS = '{http://www.w3.org/2000/svg}'
SS = 4
FONTS = {600: 'C:/Windows/Fonts/seguisb.ttf', 700: 'C:/Windows/Fonts/segoeuib.ttf', 900: 'C:/Windows/Fonts/seguibl.ttf'}
KERN = {}
INHERITED = ('fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor')


def load_kern(path):
    t = json.load(open(path, encoding='utf-8-sig'))
    KERN.clear()
    for k, v in t.items():
        KERN[k] = v['pairs']


def face_key(w):
    w = int(float(w))
    return str(min(FONTS, key=lambda k: (abs(k - w), -k)))


def kern_em(key, pair):
    try:
        return KERN[key][pair]
    except KeyError:
        raise KeyError('kerning pair %r missing for face %s; regenerate the kern table' % (pair, key))


def hex_rgb(s):
    s = s.strip().lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def num(v):
    return float(str(v).replace('px', '').strip())


def font(weight, size):
    return ImageFont.truetype(FONTS[int(face_key(weight))], round(size * SS))


def advances(text, size, weight, spacing):
    f = font(weight, size); key = face_key(weight)
    adv = []
    for i, c in enumerate(text):
        nxt = text[i + 1] if i + 1 < len(text) else None
        a = f.getlength(c) + (kern_em(key, c + nxt) * size * SS if nxt else 0)
        adv.append(a + spacing * SS)
    return f, adv


def measure_text(text, size, weight, spacing):
    """Advance width in px without the trailing letter-spacing."""
    _, adv = advances(text, size, weight, spacing)
    return (sum(adv) - spacing * SS) / SS


def cap_height(size, weight):
    f = font(weight, size)
    m = Image.new('L', (int(size * SS * 2), int(size * SS * 2)), 0)
    ImageDraw.Draw(m).text((size * SS / 2, size * SS * 1.5), 'H', font=f, fill=255, anchor='ls')
    bb = m.getbbox()
    return (bb[3] - bb[1]) / SS


def parse_style(root):
    rules = {}
    for st in root.iter(NS + 'style'):
        for sel, body in re.findall(r'\.([\w-]+)\s*\{([^}]*)\}', st.text or ''):
            props = {}
            for decl in body.split(';'):
                if ':' in decl:
                    k, v = decl.split(':', 1)
                    props[k.strip()] = v.strip()
            rules[sel] = props
    return rules


def parse_gradients(root):
    grads = {}
    for g in root.iter(NS + 'linearGradient'):
        stops = [(float(s.get('offset')), hex_rgb(s.get('stop-color'))) for s in g.findall(NS + 'stop')]
        grads[g.get('id')] = dict(x1=float(g.get('x1', 0)), y1=float(g.get('y1', 0)), x2=float(g.get('x2', 1)), y2=float(g.get('y2', 0)), stops=stops)
    return grads


def ramp(stops):
    lut = []
    for i in range(256):
        t = i / 255
        if t <= stops[0][0]:
            lut.append(stops[0][1]); continue
        if t >= stops[-1][0]:
            lut.append(stops[-1][1]); continue
        for (o0, c0), (o1, c1) in zip(stops, stops[1:]):
            if o0 <= t <= o1:
                f = (t - o0) / (o1 - o0) if o1 > o0 else 0
                lut.append(tuple(round(c0[k] + (c1[k] - c0[k]) * f) for k in range(3)))
                break
    return lut


def gradient_image(grad, w, h):
    dx, dy = grad['x2'] - grad['x1'], grad['y2'] - grad['y1']
    if grad['x1'] or grad['y1'] or dx < 0 or dy < 0:
        raise ValueError('unsupported gradient vector')
    n2 = dx * dx + dy * dy
    u = Image.linear_gradient('L').rotate(90).resize((w, h), Image.BILINEAR)    # rotate is counter-clockwise: 0 left -> 255 right
    v = Image.linear_gradient('L').resize((w, h), Image.BILINEAR)               # 0 top -> 255 bottom
    if dy == 0:
        t = u
    elif dx == 0:
        t = v
    else:
        t = ImageChops.add(u.point(lambda p: p * dx / n2), v.point(lambda p: p * dy / n2))
    p = t.convert('P'); p.putpalette([c for rgb in ramp(grad['stops']) for c in rgb])
    return p.convert('RGB')


def rounded_mask(w, h, r):
    m = Image.new('L', (max(1, round(w * SS)), max(1, round(h * SS))), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, m.width - 1, m.height - 1), radius=max(0, r * SS), fill=255)
    return m.resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS)


def rect_path(x, y, w, h, r, steps=12):
    """Rect outline as a closed polyline, starting at (x + r, y) clockwise (SVG rect path order)."""
    def arc(cx, cy, a0):
        return [(cx + r * math.cos(math.radians(a0 + 90 * i / steps)), cy + r * math.sin(math.radians(a0 + 90 * i / steps))) for i in range(1, steps + 1)]
    pts = [(x + r, y), (x + w - r, y)] + arc(x + w - r, y + r, -90)
    pts += [(x + w, y + h - r)] + arc(x + w - r, y + h - r, 0)
    pts += [(x + r, y + h)] + arc(x + r, y + h - r, 90)
    pts += [(x, y + r)] + arc(x + r, y + r, 180)
    return pts


def dash_segments(pts, pattern):
    segs, on, idx, left = [], True, 0, pattern[0]
    cur = [pts[0]]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0); pos = 0.0
        while L - pos > 1e-9:
            step = min(left, L - pos); pos += step; left -= step
            px, py = x0 + (x1 - x0) * pos / L, y0 + (y1 - y0) * pos / L
            if on:
                cur.append((px, py))
            if left <= 1e-9:
                if on:
                    segs.append(cur)
                on = not on; idx = (idx + 1) % len(pattern); left = pattern[idx]
                cur = [(px, py)]
    if on and len(cur) > 1:
        segs.append(cur)
    return segs


def stroke_mask(size, polylines, width):
    m = Image.new('L', (size[0] * SS, size[1] * SS), 0); d = ImageDraw.Draw(m)
    for pl in polylines:
        d.line([(x * SS, y * SS) for x, y in pl], fill=255, width=max(1, round(width * SS)), joint='curve')
    return m.resize(size, Image.LANCZOS)


class Renderer:
    def __init__(self, svg_path):
        self.root = ET.parse(svg_path).getroot()
        self.W, self.H = int(self.root.get('width')), int(self.root.get('height'))
        self.grads = parse_gradients(self.root)
        self.rules = parse_style(self.root)
        sh = self.root.find('.//' + NS + 'feDropShadow')
        self.shadow = None if sh is None else dict(dx=int(num(sh.get('dx'))), dy=int(num(sh.get('dy'))), sd=num(sh.get('stdDeviation')),
                                                   color=hex_rgb(sh.get('flood-color')), op=num(sh.get('flood-opacity')))
        self.runs = []

    def style(self, el, inherited):
        """Inherited values < presentation attributes < class rules (author CSS)."""
        s = {k: v for k, v in inherited.items() if k in INHERITED}
        for k in INHERITED + ('opacity',):
            if el.get(k) is not None:
                s[k] = el.get(k)
        for cls in (el.get('class') or '').split():
            for k, v in self.rules.get(cls, {}).items():
                if k != 'font-family':
                    s[k] = v
        return s

    def rect(self, layer, el, ox, oy, s):
        x = ox + num(el.get('x', 0)); y = oy + num(el.get('y', 0))
        w, h, r = num(el.get('width')), num(el.get('height')), num(el.get('rx', 0))
        X0, Y0 = round(x), round(y)
        fill = s.get('fill', '#000000')
        if el.get('filter') == 'url(#shadow)':
            sh = self.shadow; mask = rounded_mask(w, h, r)
            m = Image.new('L', layer.size, 0); m.paste(mask, (X0 + sh['dx'], Y0 + sh['dy']))
            m = m.filter(ImageFilter.GaussianBlur(sh['sd'])).point(lambda p: round(p * sh['op']))
            layer.paste(Image.new('RGB', layer.size, sh['color']), (0, 0), m)
        elif el.get('filter'):
            raise ValueError('unsupported filter ' + el.get('filter'))
        if fill != 'none':
            mask = rounded_mask(w, h, r) if r else Image.new('L', (round(w), round(h)), 255)
            mg = re.fullmatch(r'url\(#([\w-]+)\)', fill)
            src = gradient_image(self.grads[mg.group(1)], round(w), round(h)) if mg else Image.new('RGB', mask.size, hex_rgb(fill))
            layer.paste(src, (X0, Y0), mask)
        if s.get('stroke') and s['stroke'] != 'none':
            sw = num(s.get('stroke-width', 1))
            pts = rect_path(x, y, w, h, r) + [(x + r, y)]
            dash = s.get('stroke-dasharray')
            pls = dash_segments(pts, [num(t) for t in re.split(r'[ ,]+', dash.strip())]) if dash and dash != 'none' else [pts]
            layer.paste(Image.new('RGB', layer.size, hex_rgb(s['stroke'])), (0, 0), stroke_mask(layer.size, pls, sw))

    def line(self, layer, el, ox, oy, s):
        pts = [(ox + num(el.get('x1')), oy + num(el.get('y1'))), (ox + num(el.get('x2')), oy + num(el.get('y2')))]
        dash = s.get('stroke-dasharray')
        pls = dash_segments(pts, [num(t) for t in re.split(r'[ ,]+', dash.strip())]) if dash and dash != 'none' else [pts]
        layer.paste(Image.new('RGB', layer.size, hex_rgb(s['stroke'])), (0, 0), stroke_mask(layer.size, pls, num(s.get('stroke-width', 1))))

    def text(self, layer, el, ox, oy, s):
        text = el.text
        size = num(s['font-size']); weight = s.get('font-weight', '400')
        spacing = num(s.get('letter-spacing', 0)); anchor = s.get('text-anchor', 'start')
        f, adv = advances(text, size, weight, spacing)
        width = sum(adv) - spacing * SS            # ink advance without the trailing spacing
        anchor_width = sum(adv)                    # librsvg anchors with the trailing letter-spacing included
        asc, desc = f.getmetrics()
        pad = 8 * SS
        Wd = int(width + 2 * pad); Wd += (-Wd) % SS
        top = pad + (-(pad + asc)) % SS
        Hd = int(top + asc + desc + pad); Hd += (-Hd) % SS
        m = Image.new('L', (Wd, Hd), 0); d = ImageDraw.Draw(m)
        xx = pad
        for c, a in zip(text, adv):
            d.text((xx, top), c, font=f, fill=255)
            xx += a
        m = m.resize((Wd // SS, Hd // SS), Image.LANCZOS)
        x = ox + num(el.get('x')); y = oy + num(el.get('y'))
        if anchor == 'end':
            x -= anchor_width / SS
        elif anchor == 'middle':
            x -= anchor_width / SS / 2
        layer.paste(Image.new('RGB', m.size, hex_rgb(s['fill'])), (round(x - pad / SS), round(y - (top + asc) / SS)), m)
        self.runs.append(dict(text=text, x=round(x, 1), baseline=round(y, 1), size=size, weight=int(float(weight)),
                              face=int(face_key(weight)), right=round(x + width / SS, 1)))

    def walk(self, node, layer, ox, oy, inherited):
        for el in node:
            tag = el.tag.replace(NS, '')
            if tag in ('title', 'desc', 'defs'):
                continue
            s = self.style(el, inherited)
            if tag == 'g':
                dx = dy = 0
                tr = el.get('transform')
                if tr:
                    mt = re.fullmatch(r'translate\(([-\d.]+)[ ,]+([-\d.]+)\)', tr)
                    if not mt:
                        raise ValueError('unsupported transform ' + tr)
                    dx, dy = float(mt.group(1)), float(mt.group(2))
                op = float(s.pop('opacity', 1))
                if op < 1:
                    sub = layer.copy()
                    self.walk(el, sub, ox + dx, oy + dy, s)
                    layer.paste(Image.blend(layer, sub, op))
                else:
                    self.walk(el, layer, ox + dx, oy + dy, s)
            elif tag == 'rect':
                self.rect(layer, el, ox, oy, s)
            elif tag == 'line':
                self.line(layer, el, ox, oy, s)
            elif tag == 'text':
                if len(el):
                    raise ValueError('nested text content unsupported')
                self.text(layer, el, ox, oy, s)
            else:
                raise ValueError('unsupported element ' + tag)

    def render(self, out_png):
        canvas = Image.new('RGB', (self.W, self.H), (255, 255, 255))
        self.walk(self.root, canvas, 0, 0, {'fill': '#000000'})
        canvas.save(out_png, optimize=True)
        return self.runs


def render(svg_path, out_png):
    return Renderer(svg_path).render(out_png)


def strings_for_kerning(svg_path):
    """(face key, text) for every text element, so the kern table can be generated before rendering."""
    r = Renderer(svg_path); out = []

    def walk(node, inherited):
        for el in node:
            tag = el.tag.replace(NS, '')
            if tag in ('title', 'desc', 'defs'):
                continue
            s = r.style(el, inherited)
            if tag == 'g':
                walk(el, s)
            elif tag == 'text':
                out.append((face_key(s.get('font-weight', '400')), el.text))
    walk(r.root, {'fill': '#000000'})
    return out


if __name__ == '__main__':
    load_kern(sys.argv[3])
    print(json.dumps(render(sys.argv[1], sys.argv[2])))
