"""Form-neutral label card (CLAUDE-1): shared, deterministic drawing code for fn_build.py and fn_verify.py.

The card is the accepted Batch 004 front label, flat, for a catalog row whose form no source states. It prints Xenios, the
name, the listed amount and the research classification lines. It removes the template's form line, relabels the
content field "LISTED AMOUNT" (the released copy's own specification label) and draws no container. No generative model.
"""
import io, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageDraw, ImageFilter
import svg_label_render as R

TEMPLATE_SHA256 = '716d79fc7aed61485099fcf9f31a902ca30ac40cf2606901ed192f99206f4e4a'      # Batch 004 front label master v3
TEMPLATE_REF = dict(path='deliveries/catalog-imagery/2026-11-04-batch-004/labels/bpc-157-10mg-front-artwork-v3.svg',
                    sha256=TEMPLATE_SHA256, acceptedIn='KAN-31/10627', note='the accepted Batch 004 BPC-157 front label master (path and digest from that batch\'s manifest)')
NAME_MAX_RIGHT, NAME_LEFT, NAME_WEIGHT, NAME_SPACING, NAME_SIZE = 1450, 150, '790', -6, 176.0
FORM_WORDING = re.compile(r'vial|lyophili|container|ampoul|powder|capsule|tablet|bottle|solution|liquid|cartridge|syringe|\bper\b', re.I)
EXPECTED_LINES = lambda name, amount: ['XENIOS', name, amount, 'RESEARCH USE ONLY', 'NONCLINICAL USE ONLY', 'LISTED AMOUNT', amount]


def _need(s, a, b):
    if s.count(a) != 1:
        raise ValueError('template text %r found %d times' % (a, s.count(a)))
    return s.replace(a, b)


def label_svg(template_text, name, amount, name_size):
    s = template_text
    s = _need(s, 'Xenios BPC-157 10 mg front label artwork version 3', 'Xenios %s %s label design' % (name, amount))
    s, n = re.subn(r'(<desc[^>]*>)[^<]*(</desc>)',
                   lambda m: m.group(1) + 'Editable Xenios %s %s label design. It prints the name, the listed amount and the research '
                                          'classification only.' % (name, amount) + m.group(2), s, count=1)
    if n != 1:
        raise ValueError('template desc not found')
    s = _need(s, 'font-size="176" font-weight="790" letter-spacing="-6" fill="#171023">BPC-157</text>',
              'font-size="%g" font-weight="790" letter-spacing="-6" fill="#171023">%s</text>' % (name_size, name))
    s = _need(s, 'font-size="98" font-weight="780" fill="#6436c9">10 mg</text>', 'font-size="98" font-weight="780" fill="#6436c9">%s</text>' % amount)
    s, n = re.subn(r'\n?[ \t]*<text[^>]*>LYOPHILIZED VIAL</text>', '', s)
    if n != 1:
        raise ValueError('template form line not found')
    s = _need(s, '>TOTAL CONTENT</text>', '>LISTED AMOUNT</text>')
    s = _need(s, 'font-size="38" font-weight="820" text-anchor="end" fill="#ffffff">10 mg</text>',
              'font-size="38" font-weight="820" text-anchor="end" fill="#ffffff">%s</text>' % amount)
    if 'BPC' in s.replace(name, ''):
        raise ValueError('template name left in the artwork')
    return s


def fit_name(name):
    """Largest size, in 0.8 px steps from the template's 176, at which the name ends at or before the rule's right end."""
    size = NAME_SIZE
    while NAME_LEFT + R.measure_text(name, size, NAME_WEIGHT, NAME_SPACING) > NAME_MAX_RIGHT:
        size = round(size - 0.8, 1)
        if size < 60:
            raise ValueError('name %r does not fit the label: layout review needed' % name)
    return size


def texts_of(svg_text):
    return [m.group(1) for m in re.finditer(r'<text[^>]*>([^<]*)</text>', svg_text)]


def title_desc_of(svg_text):
    return [m.group(2) for m in re.finditer(r'<(title|desc)[^>]*>([^<]*)</', svg_text)]


def card_image(label_rgb):
    """The 1024 x 1024 website image: the flat label, scaled to 880 px wide, on a plain ground with a soft shadow."""
    W, card_w = 1024, 880
    card = label_rgb.resize((card_w, round(card_w * label_rgb.size[1] / label_rgb.size[0])), Image.LANCZOS)
    ground = Image.new('RGB', (W, W), (246, 244, 250))
    x, y = (W - card.size[0]) // 2, (W - card.size[1]) // 2
    shadow = Image.new('L', (W, W), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((x + 4, y + 14, x + card.size[0] + 4, y + card.size[1] + 14), 18, fill=70)
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    ground.paste((205, 198, 222), (0, 0), shadow)
    mask = Image.new('L', card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.size[0] - 1, card.size[1] - 1), 18, fill=255)
    ground.paste(card, (x, y), mask)
    return ground


def webp_bytes(im, quality):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=6)
    return buf.getvalue()
