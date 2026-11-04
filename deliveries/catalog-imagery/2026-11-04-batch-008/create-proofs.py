from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas


BATCH_DIR = Path(__file__).resolve().parent
ASSETS = BATCH_DIR / "assets"
OUTPUT = BATCH_DIR / "output" / "pdf"
PROOFS = OUTPUT / "xenios-bpc-157-5mg-15mg-supplier-design-proofs-v1.pdf"
EXCEPTIONS = OUTPUT / "xenios-bpc-157-5mg-15mg-print-spec-exceptions-v1.pdf"

INK = HexColor("#171026")
MUTED = HexColor("#595169")
PURPLE = HexColor("#6436c9")
CYAN = HexColor("#1b9dca")
PAPER = HexColor("#f7f5fb")
LINE = HexColor("#e4ddef")
WARM = HexColor("#fff3db")
AMBER = HexColor("#77481b")
MARGIN = 42


@dataclass(frozen=True)
class Variant:
    mg: int
    offering_id: str
    source_variant_id: str
    sku: str

    @property
    def name(self) -> str:
        return f"BPC-157 {self.mg} mg"

    def asset(self, role: str) -> Path:
        return ASSETS / f"bpc-157-{self.mg}mg-{role}-v1.png"


VARIANTS = (
    Variant(5, "mo_e4de11c77d16c4c3b83d", "mov_09db3e866424b64994d3", "GEN-GRP-0264"),
    Variant(15, "mo_9a755fa72de0409cd937", "mov_257330ea83ecbfc45fae", "GEN-GRP-0263"),
)


def text(c: Canvas, value: str, x: float, y: float, size: float, *, bold: bool = False, color=INK) -> None:
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.setFillColor(color)
    c.drawString(x, y, value)


def paragraph(c: Canvas, value: str, x: float, y: float, width: float, *, size: float = 10) -> float:
    for line in simpleSplit(value, "Helvetica", size, width):
        text(c, line, x, y, size, color=MUTED)
        y -= size + 4
    return y


def panel(c: Canvas, x: float, y: float, w: float, h: float, *, fill=PAPER, stroke=LINE) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.roundRect(x, y, w, h, 10, fill=1, stroke=1)


def line(c: Canvas, x1: float, x2: float, y: float, color=LINE, width: float = 1) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.line(x1, y, x2, y)


def header(c: Canvas, title: str, subtitle: str, width: float, height: float) -> None:
    text(c, "X E N I O S   /   P A C K A G I N G   D E S I G N", MARGIN, height - 39, 8, bold=True, color=PURPLE)
    status = "SUPPLIER REVIEW  /  PRESS FILE PENDING"
    right = width - MARGIN - stringWidth(status, "Helvetica-Bold", 8)
    text(c, status, right, height - 39, 8, bold=True, color=AMBER)
    text(c, title, MARGIN, height - 73, 26, bold=True)
    text(c, subtitle, MARGIN, height - 94, 10, color=MUTED)
    line(c, MARGIN, width - MARGIN, height - 108, PURPLE, 2)
    line(c, width - MARGIN - 58, width - MARGIN, height - 108, CYAN, 2)


def footer(c: Canvas, page: int, total: int, width: float) -> None:
    line(c, MARGIN, width - MARGIN, 38)
    text(c, "XENIOS  /  DESIGN STAGE  /  SUPPLIER APPROVAL PENDING", MARGIN, 23, 7.5, bold=True, color=MUTED)
    label = f"{page:02d} / {total:02d}"
    text(c, label, width - MARGIN - stringWidth(label, "Helvetica", 8), 23, 8, color=MUTED)


def fit_image(c: Canvas, path: Path, x: float, y: float, w: float, h: float) -> None:
    image = ImageReader(str(path))
    iw, ih = image.getSize()
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, mask="auto")


def identity(c: Canvas, variant: Variant, width: float, y: float) -> None:
    columns = (
        (MARGIN + 14, "OFFERING ID", variant.offering_id),
        (MARGIN + 260, "SOURCE VARIANT ID", variant.source_variant_id),
        (MARGIN + 506, "QUICK ORDER SKU", variant.sku),
    )
    panel(c, MARGIN, y, width - 2 * MARGIN, 50)
    for x, label, value in columns:
        text(c, label, x, y + 31, 8, bold=True, color=PURPLE)
        text(c, value, x, y + 13, 11, bold=True)


def front_page(c: Canvas, variant: Variant, page: int, width: float, height: float) -> None:
    header(
        c, f"{variant.name} | Vial and front label",
        f"{variant.mg} mg nominal content per vial  /  Lyophilized vial  /  Research Use Only  /  Nonclinical use only",
        width, height,
    )
    identity(c, variant, width, 440)

    panel(c, MARGIN, 145, 280, 280)
    text(c, "01  WEBSITE RENDER", MARGIN + 14, 405, 9, bold=True, color=PURPLE)
    fit_image(c, variant.asset("website-render"), MARGIN + 12, 153, 256, 241)
    right = MARGIN + 296
    right_width = width - MARGIN - right
    panel(c, right, 145, right_width, 280)
    text(c, "02  FRONT LABEL PREVIEW", right + 14, 405, 9, bold=True, color=PURPLE)
    fit_image(c, variant.asset("front-artwork"), right + 12, 153, right_width - 24, 241)

    panel(c, MARGIN, 58, width - 2 * MARGIN, 72, fill=WARM, stroke=WARM)
    text(c, "REVIEW SCOPE", MARGIN + 14, 110, 8, bold=True, color=AMBER)
    paragraph(
        c, "The render illustrates the Xenios packaging design. Current packaging may differ. "
        "The front preview shows the verified static label copy. The editable SVG accompanies this packet. "
        "The Quick Order SKU is a catalog identifier.",
        MARGIN + 14, 92, width - 2 * MARGIN - 28,
    )
    footer(c, page, 4, width)
    c.showPage()


def wrap_page(c: Canvas, variant: Variant, page: int, width: float, height: float) -> None:
    header(
        c, f"{variant.name} | Wrap layout",
        f"{variant.sku}  /  Front, side and back panels  /  Supplier dieline and scale pending",
        width, height,
    )
    panel(c, MARGIN, 122, width - 2 * MARGIN, 365)
    fit_image(c, variant.asset("wrap-proof"), MARGIN + 9, 129, width - 2 * MARGIN - 18, 351)

    text(c, "PROOF ANNOTATIONS", MARGIN, 102, 8, bold=True, color=PURPLE)
    paragraph(
        c, "Panel boundaries and reserved field guides are review annotations. Confirm physical fit, "
        "storage, legal attribution and variable-data requirements using the accompanying exception sheet.",
        MARGIN, 84, width - 2 * MARGIN,
    )
    footer(c, page, 4, width)
    c.showPage()


def write_proofs() -> None:
    width, height = landscape(letter)
    c = Canvas(str(PROOFS), pagesize=(width, height), pageCompression=1, invariant=1)
    c.setTitle("Xenios BPC-157 5 mg and 15 mg supplier design proofs")
    c.setAuthor("Xenios")
    for index, variant in enumerate(VARIANTS):
        front_page(c, variant, index * 2 + 1, width, height)
        wrap_page(c, variant, index * 2 + 2, width, height)
    c.save()


EXCEPTION_ROWS = (
    (
        "Vial and closure",
        "Confirm the selected vial and closure specification for each SKU. This determines label fit and the physical mockup.",
    ),
    (
        "Dieline and fit",
        "Supply actual finished dimensions, printable area, seam or overlap, bleed, safe area and application tolerances.",
    ),
    (
        "Materials and finish",
        "Specify substrate, adhesive, laminate or varnish, finish and any feasible metallic effect.",
    ),
    (
        "Printing and roll",
        "Specify print process, ink or color profile, tolerances, roll core, orientation and winding.",
    ),
    (
        "Approved copy",
        "Supply the approved storage statement, exact manufacturer or distributor legal attribution, and any additional required labeling.",
    ),
    (
        "Traceability",
        "Confirm who issues and applies lot and expiry or beyond-use values, plus the required format, position and serialization or barcode rules.",
    ),
    (
        "Documentation",
        "Provide an exact, verified product-specific document or COA destination before adding a QR or documentation reference.",
    ),
)


def write_exceptions() -> None:
    width, height = letter
    c = Canvas(str(EXCEPTIONS), pagesize=(width, height), pageCompression=1, invariant=1)
    c.setTitle("Xenios BPC-157 5 mg and 15 mg print-spec exceptions")
    c.setAuthor("Xenios")
    header(
        c, "Print-spec exceptions",
        "BPC-157 5 mg and 15 mg  /  Lyophilized vial  /  Shared supplier review checklist",
        width, height,
    )
    panel(c, MARGIN, 599, width - 2 * MARGIN, 69, fill=WARM, stroke=WARM)
    text(c, "PHYSICAL PACKAGING STATE  /  DESIGN", MARGIN + 14, 646, 9, bold=True, color=AMBER)
    text(c, "BPC-157 5 mg  /  GEN-GRP-0264", MARGIN + 14, 626, 10, bold=True)
    text(c, "BPC-157 15 mg  /  GEN-GRP-0263", 309, 626, 10, bold=True)
    text(c, "Obtain supplier inputs and approve a physical proof before artwork goes to press.", MARGIN + 14, 610, 9, color=MUTED)

    text(c, "SUPPLIER INPUT", MARGIN, 570, 9, bold=True, color=PURPLE)
    text(c, "REQUIRED CONFIRMATION", 177, 570, 9, bold=True, color=PURPLE)
    line(c, MARGIN, width - MARGIN, 559, PURPLE)
    y = 541
    for label, details in EXCEPTION_ROWS:
        text(c, label, MARGIN, y, 10, bold=True)
        next_y = paragraph(c, details, 177, y, width - MARGIN - 177)
        line(c, MARGIN, width - MARGIN, next_y + 3)
        y = next_y - 13

    panel(c, MARGIN, 62, width - 2 * MARGIN, 99)
    text(c, "HANDOFF STATUS", MARGIN + 14, 142, 8, bold=True, color=PURPLE)
    paragraph(
        c, "Issued lot and expiry values, purity, assay, sterility, certification, scientific identifiers "
        "and documentation links are absent from this design. Supplier proof approval and press release are pending. "
        "Website artwork direction is recorded in KAN-59/10615 and KAN-225/10616.",
        MARGIN + 14, 125, width - 2 * MARGIN - 28,
    )
    footer(c, 1, 1, width)
    c.showPage()
    c.save()


def main() -> None:
    for variant in VARIANTS:
        for role in ("website-render", "front-artwork", "wrap-proof"):
            ImageReader(str(variant.asset(role))).getSize()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    write_proofs()
    write_exceptions()
    print(PROOFS)
    print(EXCEPTIONS)


if __name__ == "__main__":
    main()
