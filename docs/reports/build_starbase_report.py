"""Build the editable STARBASE report on the supplied YRT letterhead.

Run: python build_starbase_report.py /path/to/starbase.pdf
Requires: reportlab and pypdf. The Markdown beside this file is the text source.
"""

from __future__ import annotations

from html import escape
from io import BytesIO
from pathlib import Path
import re
import sys

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "YRT-GEN-01_STARBASE_Tanitim_ve_Kullanim_Kilavuzu.md"
OUTPUT = SOURCE.with_suffix(".pdf")
LETTERHEAD = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "İndirilenler/starbase.pdf"
TITLE = "STARBASE Proje Tanıtımı ve Kullanım Kılavuzu"
CODE = "YRT-GEN-01"
DATE = "19.11.2026"

pdfmetrics.registerFont(TTFont("Carlito", str(ROOT / "assets/Carlito-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Carlito-Bold", str(ROOT / "assets/Carlito-Bold.ttf")))
pdfmetrics.registerFontFamily("Carlito", normal="Carlito", bold="Carlito-Bold")


def markup(value: str) -> str:
    value = escape(value)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"`(.+?)`", r"<font name='Carlito-Bold'>\1</font>", value)
    return value


class ScreenshotSlot(Flowable):
    def __init__(self, label: str):
        super().__init__()
        self.width = 450
        self.height = 190
        self.label = label
        number = re.search(r"GÖRSEL ([1-4])", label)
        names = {"1": "01-api-akisi.png", "2": "02-uygulamalar.png", "3": "03-ana-sayfa.png", "4": "04-paylasim-yonetim.png"}
        self.image = ROOT / "screenshots" / names[number.group(1)] if number else None

    def draw(self):
        c = self.canv
        c.setStrokeColor(colors.HexColor("#9A9A9A"))
        c.setDash(3, 3)
        c.roundRect(0, 0, self.width, self.height, 5, stroke=1, fill=0)
        c.setDash()
        if self.image and self.image.exists():
            source = ImageReader(str(self.image))
            width, height = source.getSize()
            scale = min((self.width - 14) / width, (self.height - 28) / height)
            w, h = width * scale, height * scale
            c.drawImage(source, (self.width - w) / 2, 22 + (self.height - 28 - h) / 2, w, h, mask="auto")
            c.setFont("Carlito", 8)
            c.setFillColor(colors.HexColor("#666666"))
            c.drawCentredString(self.width / 2, 8, self.label.split(" — ")[0])
            return
        c.setFont("Carlito", 9)
        c.setFillColor(colors.HexColor("#666666"))
        c.drawCentredString(self.width / 2, self.height / 2, self.label)


def furniture(c, doc):
    c.saveState()
    page = doc.page
    c.setFillColor(colors.white)
    if page == 1:
        c.rect(62, 100, 480, 627, stroke=0, fill=1)
    else:
        c.rect(62, 73, 480, 695, stroke=0, fill=1)
    if page != 1:
        c.rect(455, 761, 100, 65, stroke=0, fill=1)
    c.rect(66, 29, 145, 31, stroke=0, fill=1)
    c.rect(493, 29, 53, 31, stroke=0, fill=1)
    c.setFillColor(colors.black)
    c.setFont("Carlito", 6)
    c.drawRightString(527, 718 if page == 1 else 806, f"Rapor Kodu: {CODE}")
    c.drawRightString(527, 710 if page == 1 else 798, f"Rapor Tarihi: {DATE}")
    c.setFont("Carlito", 8)
    c.drawString(71, 47, "STARBASE Kılavuzu")
    c.drawRightString(526, 47, f"{page}/{len(pages)}")
    if page == 1:
        w, _ = A4
        c.setFont("Carlito-Bold", 36)
        c.drawCentredString(w / 2, 655, "YILDIZ ROKET TAKIMI")
        c.setFont("Carlito-Bold", 22)
        c.drawCentredString(w / 2, 604, "STARBASE")
        c.setFont("Carlito", 16)
        c.drawCentredString(w / 2, 574, "Merkezi Hesap ve Uygulama Platformu")
        c.drawCentredString(w / 2, 549, "Proje Tanıtımı ve Kullanım Kılavuzu")
        c.setStrokeColor(colors.HexColor("#777777"))
        c.line(130, 525, 465, 525)
        c.setFont("Carlito", 11)
        c.drawCentredString(w / 2, 494, "Hazırlayan: Muhammet Ayberk ARSLAN")
        c.drawCentredString(w / 2, 474, "Yönetim kurulu değerlendirmesi için taslak")
        c.setFont("Carlito", 10)
        c.drawCentredString(w / 2, 400, "Tek hesap  ·  kontrollü erişim  ·  ortak yazılım altyapısı")
    c.restoreState()


body = ParagraphStyle("Body", fontName="Carlito", fontSize=11, leading=14.6, spaceAfter=8)
heading = ParagraphStyle("Heading", parent=body, fontName="Carlito-Bold", fontSize=12, leading=15, spaceBefore=3, spaceAfter=10)
bullet = ParagraphStyle("Bullet", parent=body, leftIndent=14, firstLineIndent=-9, spaceAfter=6)
slot_style = ParagraphStyle("Slot", parent=body, alignment=TA_CENTER)


def elements(page_text: str):
    result = []
    paragraph = []

    def flush():
        if paragraph:
            result.append(Paragraph(markup(" ".join(paragraph)), body))
            paragraph.clear()

    for line in page_text.splitlines():
        line = line.strip()
        if not line:
            flush()
        elif line.startswith("## "):
            flush()
            result.append(Paragraph(markup(line[3:]), heading))
        elif line.startswith("- "):
            flush()
            result.append(Paragraph("• " + markup(line[2:]), bullet))
        elif line.startswith("[[GÖRSEL "):
            flush()
            result.append(Spacer(1, 12))
            result.append(ScreenshotSlot(line[2:-2]))
        else:
            paragraph.append(line)
    flush()
    return result


pages = [part.strip() for part in SOURCE.read_text(encoding="utf-8").split("<!-- PAGE -->")]
if len(pages) != 8:
    raise SystemExit("Expected cover and seven content pages")

overlay = BytesIO()
doc = SimpleDocTemplate(overlay, pagesize=A4, leftMargin=70, rightMargin=70, topMargin=105, bottomMargin=77,
                        title=TITLE, author="Yıldız Roket Takımı")
story = [Spacer(1, 1), PageBreak()]
for index, page_text in enumerate(pages[1:]):
    story.extend(elements(page_text))
    if index < len(pages) - 2:
        story.append(PageBreak())
doc.build(story, onFirstPage=furniture, onLaterPages=furniture)

content = PdfReader(overlay)
if len(content.pages) != len(pages):
    raise SystemExit(f"Report has {len(content.pages)} pages; expected {len(pages)}. Shorten content or slots.")
writer = PdfWriter()
for index, layer in enumerate(content.pages):
    template = PdfReader(str(LETTERHEAD))
    writer.add_page(template.pages[0 if index == 0 else 1])
    writer.pages[-1].merge_page(layer)
writer.add_metadata({"/Title": TITLE, "/Author": "Yıldız Roket Takımı", "/Subject": CODE})
with OUTPUT.open("wb") as file:
    writer.write(file)
print(OUTPUT)
