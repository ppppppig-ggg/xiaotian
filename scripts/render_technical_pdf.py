from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "technical-design.md"
OUTPUT = ROOT / "output" / "pdf" / "campusrace-technical-design.pdf"
FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\msyh.ttc"),
    Path(r"C:\Windows\Fonts\simhei.ttf"),
]


def register_chinese_font() -> str:
    font_path = next((path for path in FONT_CANDIDATES if path.exists()), None)
    if font_path is None:
        raise FileNotFoundError("找不到微软雅黑或黑体字体，无法生成中文 PDF。")
    pdfmetrics.registerFont(TTFont("CampusCN", str(font_path), subfontIndex=0))
    pdfmetrics.registerFontFamily(
        "CampusCN", normal="CampusCN", bold="CampusCN", italic="CampusCN", boldItalic="CampusCN"
    )
    return "CampusCN"


FONT = register_chinese_font()
INK = colors.HexColor("#172b4d")
BLUE = colors.HexColor("#176b87")
MUTED = colors.HexColor("#5b6b7b")
PALE = colors.HexColor("#eef4f8")

STYLES = {
    "title": ParagraphStyle(
        "DocTitle", fontName=FONT, fontSize=23, leading=31, textColor=INK,
        alignment=TA_CENTER, spaceAfter=15,
    ),
    "h1": ParagraphStyle(
        "Heading1CN", fontName=FONT, fontSize=15, leading=21, textColor=INK,
        spaceBefore=13, spaceAfter=8, keepWithNext=True,
    ),
    "h2": ParagraphStyle(
        "Heading2CN", fontName=FONT, fontSize=11.5, leading=17, textColor=BLUE,
        spaceBefore=9, spaceAfter=5, keepWithNext=True,
    ),
    "h3": ParagraphStyle(
        "Heading3CN", fontName=FONT, fontSize=9.8, leading=14, textColor=INK,
        spaceBefore=6, spaceAfter=3, keepWithNext=True,
    ),
    "body": ParagraphStyle(
        "BodyCN", fontName=FONT, fontSize=9, leading=14.3, textColor=INK,
        alignment=TA_LEFT, spaceAfter=5, wordWrap="CJK",
    ),
    "bullet": ParagraphStyle(
        "BulletCN", fontName=FONT, fontSize=8.8, leading=13.5, textColor=INK,
        leftIndent=12, firstLineIndent=-8, spaceAfter=3, wordWrap="CJK",
    ),
    "quote": ParagraphStyle(
        "QuoteCN", fontName=FONT, fontSize=8.6, leading=13.5, textColor=MUTED,
        leftIndent=12, borderColor=BLUE, borderWidth=1, borderPadding=6,
        backColor=PALE, spaceBefore=4, spaceAfter=8, wordWrap="CJK",
    ),
    "code": ParagraphStyle(
        "CodeCN", fontName=FONT, fontSize=7.2, leading=10.4, textColor=INK,
        backColor=PALE, borderColor=colors.HexColor("#d9e2ec"), borderWidth=0.5,
        borderPadding=6, spaceBefore=3, spaceAfter=8, wordWrap="CJK",
    ),
    "table": ParagraphStyle(
        "TableCN", fontName=FONT, fontSize=7.7, leading=11.2, textColor=INK,
        wordWrap="CJK",
    ),
    "table_header": ParagraphStyle(
        "TableHeaderCN", fontName=FONT, fontSize=7.8, leading=11.4,
        textColor=colors.white, wordWrap="CJK",
    ),
    "meta": ParagraphStyle(
        "MetaCN", fontName=FONT, fontSize=9.2, leading=15, textColor=MUTED,
        alignment=TA_CENTER, spaceAfter=3,
    ),
}


def inline_markup(value: str) -> str:
    escaped = html.escape(value, quote=False)
    escaped = re.sub(r"`([^`]+)`", r'<font color="#176b87">\1</font>', escaped)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", escaped)
    escaped = re.sub(r"&lt;(https?://[^&]+)&gt;", r"\1", escaped)
    return escaped


def flush_paragraph(lines: list[str], story: list) -> None:
    if lines:
        story.append(Paragraph(inline_markup(" ".join(line.strip() for line in lines)), STYLES["body"]))
        lines.clear()


def parse_table(lines: list[str], width: float) -> Table | None:
    rows = []
    for line in lines:
        raw_cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if raw_cells and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in raw_cells):
            continue
        rows.append(raw_cells)
    if not rows:
        return None

    column_count = max(map(len, rows))
    normalized = [row + [""] * (column_count - len(row)) for row in rows]
    if column_count == 2:
        weights = [0.28, 0.72]
    elif column_count == 3:
        weights = [0.25, 0.18, 0.57]
    else:
        weights = [1 / column_count] * column_count
    data = []
    for row_index, row in enumerate(normalized):
        style = STYLES["table_header"] if row_index == 0 else STYLES["table"]
        data.append([Paragraph(inline_markup(cell), style) for cell in row])

    table = Table(data, colWidths=[width * weight for weight in weights], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#d0dae4")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f9fb")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def markdown_to_story(markdown: str, width: float) -> list:
    story = []
    paragraph: list[str] = []
    table_lines: list[str] = []
    code_lines: list[str] = []
    in_code = False

    def flush_table() -> None:
        nonlocal table_lines
        if table_lines:
            table = parse_table(table_lines, width)
            if table:
                story.extend([Spacer(1, 3), table, Spacer(1, 7)])
            table_lines = []

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()
        if line.startswith("```"):
            flush_paragraph(paragraph, story)
            flush_table()
            if in_code:
                code_text = "\n".join(code_lines)
                story.append(KeepTogether([Preformatted(code_text, STYLES["code"], maxLineLength=100)]))
                code_lines.clear()
                in_code = False
            else:
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue

        if line.startswith("|"):
            flush_paragraph(paragraph, story)
            table_lines.append(line)
            continue
        flush_table()

        heading = re.match(r"^(#{1,3})\s+(.*)$", line)
        if heading:
            flush_paragraph(paragraph, story)
            level = len(heading.group(1))
            style = {1: STYLES["title"], 2: STYLES["h1"], 3: STYLES["h2"]}[level]
            story.append(Paragraph(inline_markup(heading.group(2)), style))
            if level == 1:
                story.append(HRFlowable(width="35%", thickness=1.2, color=BLUE, spaceAfter=12, hAlign="CENTER"))
            continue
        if line.strip() == "---":
            flush_paragraph(paragraph, story)
            story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#d0dae4"), spaceBefore=4, spaceAfter=7))
            continue
        if not line.strip():
            flush_paragraph(paragraph, story)
            continue
        if line.startswith("> "):
            flush_paragraph(paragraph, story)
            story.append(Paragraph(inline_markup(line[2:]), STYLES["quote"]))
            continue
        if line.startswith("- ") or re.match(r"^\d+\.\s", line):
            flush_paragraph(paragraph, story)
            bullet = "•" if line.startswith("- ") else re.match(r"^(\d+)\.", line).group(1) + "."
            content = line[2:] if line.startswith("- ") else re.sub(r"^\d+\.\s", "", line)
            story.append(Paragraph(f"{bullet}&nbsp;&nbsp;{inline_markup(content)}", STYLES["bullet"]))
            continue
        paragraph.append(line)

    flush_paragraph(paragraph, story)
    flush_table()
    return story


def draw_page(canvas, doc) -> None:
    canvas.saveState()
    page_width, page_height = A4
    canvas.setStrokeColor(colors.HexColor("#d0dae4"))
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, page_height - 31, page_width - doc.rightMargin, page_height - 31)
    canvas.setFont(FONT, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, page_height - 25, "赛博赛事雷达 · 技术设计说明")
    canvas.line(doc.leftMargin, 31, page_width - doc.rightMargin, 31)
    canvas.drawString(doc.leftMargin, 19, "CampusRace Radar | 技术设计与复现说明")
    canvas.drawRightString(page_width - doc.rightMargin, 19, f"第 {doc.page} 页")
    canvas.restoreState()


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"缺少 Markdown 源稿：{SOURCE}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, title="赛博赛事雷达技术设计说明",
        author="CampusRace Radar 项目组", subject="架构、Prompt 工程与复现说明",
        leftMargin=47, rightMargin=47, topMargin=49, bottomMargin=47,
    )
    markdown = SOURCE.read_text(encoding="utf-8")
    story = markdown_to_story(markdown, doc.width)
    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    print(f"PDF 已生成：{OUTPUT}")


if __name__ == "__main__":
    main()
