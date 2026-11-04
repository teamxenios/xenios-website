from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


BATCH_DIR = Path(__file__).resolve().parent
ASSET_DIR = BATCH_DIR / "assets"
OUTPUT_DIR = BATCH_DIR / "output" / "pdf"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PROOF_PDF = OUTPUT_DIR / "xenios-bpc-157-10mg-supplier-proof-v3.pdf"
EXCEPTIONS_PDF = OUTPUT_DIR / "xenios-bpc-157-10mg-print-spec-exceptions-v1.pdf"

NAVY = colors.HexColor("#171026")
PURPLE = colors.HexColor("#6436c9")
CYAN = colors.HexColor("#1b9dca")
PAPER = colors.HexColor("#f7f5fb")
MUTED = colors.HexColor("#62596e")
AMBER_BG = colors.HexColor("#fff5dd")
AMBER = colors.HexColor("#9b651b")
BLUE_BG = colors.HexColor("#eaf6fb")
BLUE = colors.HexColor("#2c728e")
RED = colors.HexColor("#a42f58")


def draw_header(c: canvas.Canvas, title: str, subtitle: str, width: float, height: float) -> None:
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(42, height - 46, title)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10)
    c.drawString(42, height - 63, subtitle)
    c.setStrokeColor(PURPLE)
    c.setLineWidth(3)
    c.line(42, height - 76, width - 42, height - 76)


def draw_footer(c: canvas.Canvas, page: int, total: int, width: float) -> None:
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(42, 24, "Supplier design proof - not press ready - no supplier send performed")
    c.drawRightString(width - 42, 24, f"Page {page} of {total}")


def fit_image(c: canvas.Canvas, path: Path, x: float, y: float, width: float, height: float) -> None:
    image = ImageReader(str(path))
    iw, ih = image.getSize()
    scale = min(width / iw, height / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(image, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh, mask="auto")


def draw_chip(c: canvas.Canvas, x: float, y: float, text: str, fill: colors.Color, stroke: colors.Color) -> float:
    pad_x = 12
    chip_width = stringWidth(text, "Helvetica-Bold", 9) + pad_x * 2
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.roundRect(x, y, chip_width, 24, 12, fill=1, stroke=1)
    c.setFillColor(stroke)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(x + chip_width / 2, y + 8, text)
    return chip_width


def make_supplier_proof() -> None:
    page_size = landscape(letter)
    width, height = page_size
    c = canvas.Canvas(str(PROOF_PDF), pagesize=page_size, pageCompression=1)
    c.setTitle("Xenios BPC-157 10 mg supplier proof v3")
    c.setAuthor("Xenios")

    draw_header(
        c,
        "BPC-157 10 mg - supplier design proof",
        "Exact pair mo_af289f611c02b3fcef01 / mov_ca3e45ae9712aee91430 | Artwork BPC157-10-WEB-SUPPLIER-v3",
        width,
        height,
    )
    c.setFillColor(PAPER)
    c.roundRect(42, 64, 445, 450, 18, fill=1, stroke=0)
    fit_image(c, ASSET_DIR / "bpc-157-10mg-website-render-v3.png", 50, 72, 429, 434)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(515, 485, "Website artwork candidate")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 11)
    lines = [
        "Original Xenios packaging artwork; not a supplier photograph.",
        "Complete vial, cap, label and base remain visible.",
        "Verified static identity only: BPC-157, 10 mg total content, lyophilized vial, Research Use Only and Nonclinical use only.",
        "Packaging state remains design; printed/in-use is not established.",
        "No lot, expiry/BUD, purity, certification, CAS or QR is invented.",
    ]
    y = draw_bullets(c, lines, 515, 450, width - 557, 9.5) - 2
    draw_chip(c, 515, y, "WEBSITE ARTWORK", BLUE_BG, BLUE)
    draw_chip(c, 642, y, "PHYSICAL STATE: DESIGN", AMBER_BG, AMBER)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(515, y - 42, "Current Quick Order SKU")
    c.setFillColor(PURPLE)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(515, y - 67, "GEN-GRP-0262")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(515, y - 83, "Catalog identifier only; not manufacturing traceability.")
    draw_footer(c, 1, 3, width)
    c.showPage()

    draw_header(
        c,
        "Editable front artwork",
        "Front-facing fixed art - physical scale and dieline remain supplier inputs",
        width,
        height,
    )
    c.setFillColor(PAPER)
    c.roundRect(42, 64, width - 84, height - 160, 18, fill=1, stroke=0)
    fit_image(c, ASSET_DIR / "bpc-157-10mg-front-artwork-v3.png", 55, 78, width - 110, height - 188)
    draw_footer(c, 2, 3, width)
    c.showPage()

    draw_header(
        c,
        "Editable wrap and back/side proof",
        "Proof annotations are non-print guides; no press-ready dimensions are asserted",
        width,
        height,
    )
    c.setFillColor(PAPER)
    c.roundRect(42, 64, width - 84, height - 160, 18, fill=1, stroke=0)
    fit_image(c, ASSET_DIR / "bpc-157-10mg-wrap-proof-v3.png", 50, 72, width - 100, height - 176)
    draw_footer(c, 3, 3, width)
    c.save()


def wrapped_lines(c: canvas.Canvas, text: str, max_width: float, font: str, size: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_bullets(c: canvas.Canvas, items: list[str], x: float, y: float, width: float, size: float = 9.5) -> float:
    c.setFont("Helvetica", size)
    c.setFillColor(NAVY)
    for item in items:
        lines = wrapped_lines(c, item, width - 18, "Helvetica", size)
        c.circle(x + 3, y + 3, 2, fill=1, stroke=0)
        for index, line in enumerate(lines):
            c.drawString(x + 14, y - index * 14, line)
        y -= 14 * len(lines) + 7
    return y


def make_exception_sheet() -> None:
    width, height = letter
    c = canvas.Canvas(str(EXCEPTIONS_PDF), pagesize=letter, pageCompression=1)
    c.setTitle("Xenios BPC-157 10 mg print specification exceptions")
    c.setAuthor("Xenios")

    draw_header(
        c,
        "Print-spec exception sheet",
        "BPC-157 10 mg | Artwork BPC157-10-WEB-SUPPLIER-v3 | Physical packaging state: design",
        width,
        height,
    )
    c.setFillColor(AMBER_BG)
    c.setStrokeColor(AMBER)
    c.roundRect(42, height - 155, width - 84, 56, 12, fill=1, stroke=1)
    c.setFillColor(AMBER)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(58, height - 123, "NOT PRESS READY")
    c.setFillColor(NAVY)
    c.setFont("Helvetica", 9)
    c.drawString(180, height - 119, "Website artwork is finished; physical production inputs remain")
    c.drawString(180, height - 135, "supplier-owned or unconfirmed.")

    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(42, height - 185, "Supplier inputs required before a press-ready export")
    required = [
        "Actual selected vial and closure manufacturer/specification.",
        "Finished label width and height, printable area, seam/overlap, bleed and safe area.",
        "Substrate/material, adhesive, finish, varnish or laminate.",
        "Print process, color profile, winding/orientation and roll core.",
        "Supplier-approved storage statement.",
        "Manufacturer/distributor legal attribution.",
        "Lot and expiry/BUD variable-data owner, format and application method.",
        "Applicable barcode or serialization requirement.",
        "Matched product-specific documentation/COA destination if a QR is required.",
    ]
    y = draw_bullets(c, required, 46, height - 210, width - 92)

    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(42, y - 8, "Explicitly not established by this package")
    not_established = [
        "Supplier proof approval or supplier acceptance of physical dimensions.",
        "Printed or in-use packaging.",
        "Any lot number, expiry date or beyond-use date.",
        "Purity, assay, sterility, certification or CAS identifier.",
        "Documentation or COA link.",
    ]
    y = draw_bullets(c, not_established, 46, y - 34, width - 92)

    c.setFillColor(BLUE_BG)
    c.setStrokeColor(BLUE)
    c.roundRect(42, 72, width - 84, 76, 12, fill=1, stroke=1)
    c.setFillColor(BLUE)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(58, 126, "AUTHORITY AND SCOPE")
    c.setFillColor(NAVY)
    c.setFont("Helvetica", 9)
    c.drawString(58, 108, "Website artwork: KAN-59/10615 and KAN-225/10616.")
    c.drawString(58, 92, "Physical production: later supplier confirmation required. No supplier send occurred in this task.")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawRightString(width - 42, 40, "Page 1 of 1")
    c.save()


if __name__ == "__main__":
    make_supplier_proof()
    make_exception_sheet()
    print(PROOF_PDF)
    print(EXCEPTIONS_PDF)
