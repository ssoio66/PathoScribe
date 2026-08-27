from __future__ import annotations

import json
from pathlib import Path
from xml.sax.saxutils import escape

import qrcode
from PIL import Image
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "PathoScribe_Portfolio_v1.2.pdf"
TMP = ROOT / "tmp" / "pdfs"
SCREENSHOTS = ROOT / "public" / "images" / "portfolio"
QR_PATH = TMP / "pathoscribe-qr.png"
LUNG_MARK = ROOT / "public" / "images" / "pathoscribe-lung-mark.png"
EVALUATION_CASES = ROOT / "data" / "evaluation" / "evaluation-cases.json"

PAGE_W, PAGE_H = landscape(A4)
MARGIN = 38

NAVY = HexColor("#092F3A")
TEAL = HexColor("#007B78")
TEAL_DARK = HexColor("#006562")
MINT = HexColor("#DFF8F5")
MINT_SOFT = HexColor("#F1FBFA")
INK = HexColor("#17353E")
SLATE = HexColor("#516873")
LINE = HexColor("#D4E1E5")
PAPER = HexColor("#F5F8F9")
WHITE = HexColor("#FFFFFF")
AMBER = HexColor("#B56A00")
AMBER_BG = HexColor("#FFF4DE")
RED = HexColor("#B73834")
RED_BG = HexColor("#FDE8E6")
GREEN = HexColor("#13875E")
GREEN_BG = HexColor("#E7F8EF")

FONT_REGULAR = "Malgun"
FONT_BOLD = "MalgunBold"


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, r"C:\Windows\Fonts\malgun.ttf"))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, r"C:\Windows\Fonts\malgunbd.ttf"))


def paragraph_style(name: str, size: float, leading: float | None = None, color=INK, bold=False, align=TA_LEFT):
    return ParagraphStyle(
        name,
        fontName=FONT_BOLD if bold else FONT_REGULAR,
        fontSize=size,
        leading=leading or size * 1.45,
        textColor=color,
        alignment=align,
        wordWrap="CJK",
        splitLongWords=True,
        spaceAfter=0,
    )


BODY = None
SMALL = None
TINY = None
CARD_TITLE = None


def draw_para(c, text: str, x: float, top: float, width: float, style, max_height: float = 500) -> float:
    p = Paragraph(text, style)
    _, height = p.wrap(width, max_height)
    p.drawOn(c, x, top - height)
    return height


def draw_para_middle(c, text: str, x: float, y: float, width: float, height: float, style) -> float:
    """Draw a paragraph vertically centered inside a fixed rectangle."""
    p = Paragraph(text, style)
    _, paragraph_height = p.wrap(width, height)
    p.drawOn(c, x, y + max(0, (height - paragraph_height) / 2))
    return paragraph_height


def rounded(c, x, y, w, h, fill=WHITE, stroke=LINE, radius=8, line_width=0.8):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(line_width)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)


def pill(c, text, x, y, w, h=24, fill=MINT, color=TEAL_DARK, stroke=None):
    rounded(c, x, y, w, h, fill, stroke or fill, radius=h / 2, line_width=0.6)
    c.setFillColor(color)
    c.setFont(FONT_BOLD, 8.3)
    c.drawCentredString(x + w / 2, y + 7.2, text)


def section_header(c, page, eyebrow, title, subtitle=None):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(TEAL)
    c.setFont(FONT_BOLD, 9.2)
    c.drawString(MARGIN, PAGE_H - 35, eyebrow)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 23)
    c.drawString(MARGIN, PAGE_H - 67, title)
    line_y = PAGE_H - 102
    if subtitle:
        subtitle_height = draw_para(c, escape(subtitle), MARGIN, PAGE_H - 81, PAGE_W - MARGIN * 2, SMALL, 50)
        line_y = min(line_y, PAGE_H - 86 - subtitle_height)
    c.setStrokeColor(TEAL)
    c.setLineWidth(1.2)
    c.line(MARGIN, line_y, PAGE_W - MARGIN, line_y)
    footer(c, page)


def footer(c, page):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(MARGIN, 25, PAGE_W - MARGIN, 25)
    c.setFont(FONT_REGULAR, 7.6)
    c.setFillColor(SLATE)
    c.drawString(MARGIN, 12, "PathoScribe · Portfolio Prototype v1.2 · 공개 합성데이터·가상 자료 전용")
    c.drawRightString(PAGE_W - MARGIN, 12, f"{page:02d} / 12")


def card(c, x, y, w, h, title, body, accent=TEAL, fill=WHITE, title_size=11, body_size=8.8):
    rounded(c, x, y, w, h, fill, LINE)
    c.setFillColor(accent)
    c.roundRect(x, y, 4, h, 2, stroke=0, fill=1)
    title_style = paragraph_style("ct", title_size, bold=True, color=NAVY)
    title_height = draw_para(c, escape(title), x + 16, y + h - 15, w - 30, title_style, 45)
    body_top = y + h - 23 - title_height
    draw_para(
        c,
        escape(body),
        x + 16,
        body_top,
        w - 30,
        paragraph_style("cb", body_size, leading=body_size * 1.55, color=SLATE),
        max(0, body_top - y - 12),
    )


def stat(c, x, y, w, label, value, detail, color=TEAL):
    rounded(c, x, y, w, 90, WHITE, LINE)
    c.setFillColor(color)
    c.setFont(FONT_BOLD, 8.5)
    c.drawString(x + 14, y + 65, label)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 22)
    c.drawString(x + 14, y + 37, value)
    draw_para(c, escape(detail), x + 14, y + 28, w - 28, TINY, 28)


def draw_image_contain(c, path: Path, x, y, w, h, border=True):
    image = ImageReader(str(path))
    iw, ih = image.getSize()
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    if border:
        rounded(c, x, y, w, h, WHITE, LINE)
    c.drawImage(image, dx, dy, dw, dh, preserveAspectRatio=True, mask="auto")


def link_text(c, text, url, x, y, size=8.2, color=TEAL_DARK):
    c.setFont(FONT_REGULAR, size)
    c.setFillColor(color)
    c.drawString(x, y, text)
    c.linkURL(url, (x, y - 2, x + pdfmetrics.stringWidth(text, FONT_REGULAR, size), y + size + 2), relative=0)


def load_evaluation_cases() -> dict[str, dict]:
    payload = json.loads(EVALUATION_CASES.read_text(encoding="utf-8"))
    cases = payload["cases"] if isinstance(payload, dict) else payload
    return {item["caseId"]: item for item in cases}


def expected_field(case: dict, key: str) -> dict:
    for field in case["groundTruth"]["expectedExtraction"]:
        if field["key"] == key:
            return field
    return {"label": key, "value": None, "evidenceText": None, "status": "not_found"}


def value_text(field: dict) -> str:
    return "확인 필요" if field.get("value") is None else str(field["value"])


def focused_screenshot(path: Path) -> Path:
    """Create a reproducible crop that removes the sidebar and unused page margins."""
    output = TMP / f"focus-{path.name}"
    with Image.open(path) as image:
        width, height = image.size
        crop = image.crop((int(width * 0.19), 0, width, int(height * 0.92)))
        crop.save(output, optimize=True)
    return output


def draw_fixture_workspace(c, image_path: Path, case: dict, fields: list[str], x: float, y: float, w: float, h: float):
    """Show a focused interface crop beside a non-overlapping educational result summary."""
    image_w = 350
    rounded(c, x, y, image_w, h, WHITE, LINE)
    c.setFillColor(TEAL_DARK)
    c.setFont(FONT_BOLD, 9.4)
    c.drawString(x + 14, y + h - 22, "실제 웹 시연 화면")
    c.setFillColor(SLATE)
    c.setFont(FONT_REGULAR, 7.4)
    c.drawString(x + 14, y + h - 38, "역할 선택 후 사례를 불러온 원문 입력 영역")
    draw_image_contain(c, focused_screenshot(image_path), x + 12, y + 35, image_w - 24, h - 84, border=False)
    c.setFillColor(SLATE)
    c.setFont(FONT_REGULAR, 7.2)
    c.drawCentredString(x + image_w / 2, y + 15, "핵심 업무 영역을 확대해 표시")

    px, pw = x + image_w + 14, w - image_w - 14
    rounded(c, px, y, pw, h, WHITE, LINE)
    c.setFillColor(TEAL)
    c.setFont(FONT_BOLD, 9.2)
    c.drawString(px + 14, y + h - 22, "저장된 교육용 검수 결과")
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 12.2)
    c.drawString(px + 14, y + h - 43, case["caseId"])
    pill(c, "검토 전", px + pw - 78, y + h - 53, 62, 21, AMBER_BG, AMBER, LINE)

    c.setFillColor(SLATE)
    c.setFont(FONT_BOLD, 7.8)
    c.drawString(px + 14, y + h - 66, "교육용 가상 원문")
    raw = case["inputText"].replace("\n", " · ")
    draw_para(c, escape(raw), px + 14, y + h - 74, pw - 28, paragraph_style("fixture-raw", 6.95, 9.35, INK), 40)

    row_top = y + h - 126
    c.setFillColor(TEAL_DARK)
    c.setFont(FONT_BOLD, 8.1)
    c.drawString(px + 14, row_top, "AI 제안값 · 원문 근거")
    row_y = row_top - 12
    for key in fields:
        field = expected_field(case, key)
        rounded(c, px + 14, row_y - 27, pw - 28, 25, MINT_SOFT, LINE, radius=4, line_width=0.45)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 7.2)
        c.drawString(px + 22, row_y - 10, field["label"])
        c.setFont(FONT_REGULAR, 7.2)
        c.setFillColor(INK)
        c.drawString(px + 86, row_y - 10, value_text(field)[:42])
        evidence = field.get("evidenceText") or "근거 없음"
        c.setFillColor(SLATE)
        c.setFont(FONT_REGULAR, 6.2)
        c.drawRightString(px + pw - 22, row_y - 21, f"근거: {evidence[:26]}")
        row_y -= 30

    warning_text = " · ".join(item["description"] for item in case.get("expectedWarnings", [])) or "예상 경고 없음"
    warning_y = y + 32
    rounded(c, px + 14, warning_y, pw - 28, 40, RED_BG if case.get("expectedWarnings") else GREEN_BG, LINE, radius=5)
    c.setFillColor(RED if case.get("expectedWarnings") else GREEN)
    c.setFont(FONT_BOLD, 8)
    c.drawString(px + 22, warning_y + 24, "규칙 검수")
    c.setFillColor(INK)
    c.setFont(FONT_REGULAR, 7.1)
    c.drawString(px + 22, warning_y + 10, warning_text[:62])
    c.setFillColor(TEAL_DARK)
    c.setFont(FONT_BOLD, 7.5)
    c.drawString(px + 14, y + 16, "담당자 확정값")
    c.setFillColor(SLATE)
    c.setFont(FONT_REGULAR, 7.1)
    c.drawString(px + 86, y + 16, "비어 있음 · 원문 확인 후 사용자만 입력")


def build_pdf() -> None:
    register_fonts()
    global BODY, SMALL, TINY, CARD_TITLE
    BODY = paragraph_style("body", 10.2, 15.3, INK)
    SMALL = paragraph_style("small", 8.8, 13.3, SLATE)
    TINY = paragraph_style("tiny", 7.5, 10.4, SLATE)
    CARD_TITLE = paragraph_style("card-title", 11.2, 15, NAVY, bold=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    evaluation_cases = load_evaluation_cases()
    qr = qrcode.QRCode(version=None, box_size=8, border=2)
    qr.add_data("https://pathoscribe.vercel.app/")
    qr.make(fit=True)
    qr.make_image(fill_color="#092F3A", back_color="white").save(QR_PATH)

    c = canvas.Canvas(str(OUT), pagesize=landscape(A4), pageCompression=1)
    c.setTitle("PathoScribe: 생성형 AI 기반 병리 전사·검수 지원 웹서비스")
    c.setAuthor("김선미")
    c.setSubject("생성형 AI·의료데이터 개인 포트폴리오")
    c.setCreator("PathoScribe Portfolio Generator")

    # 1. Cover
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(TEAL)
    c.rect(0, PAGE_H - 10, PAGE_W, 10, stroke=0, fill=1)
    if LUNG_MARK.exists():
        c.drawImage(str(LUNG_MARK), MARGIN, PAGE_H - 88, 42, 42, mask="auto")
    c.setFillColor(MINT)
    c.setFont(FONT_BOLD, 10)
    c.drawString(MARGIN + 54, PAGE_H - 56, "PORTFOLIO PROTOTYPE v1.2")
    c.setFillColor(WHITE)
    c.setFont(FONT_BOLD, 37)
    c.drawString(MARGIN, PAGE_H - 145, "PathoScribe")
    c.setFont(FONT_BOLD, 22)
    c.drawString(MARGIN, PAGE_H - 181, "생성형 AI 기반 병리 전사·검수 지원 웹서비스")
    draw_para(c,
        "육안 소견, 병리 결과, 위탁검사 결과의 입력·구조화·검수 과정에서 생성형 AI가 초안을 제안하고<br/>사용자가 원문 근거를 확인한 뒤 승인하도록 설계한 폐암 중심 교육용 웹서비스",
        MARGIN, PAGE_H - 216, 555, paragraph_style("cover-lead", 12.2, 19, Color(0.88, 0.95, 0.95)), 80)
    rounded(c, MARGIN, 108, 555, 112, HexColor("#123F49"), HexColor("#2A5D66"), radius=10)
    c.setFillColor(MINT)
    c.setFont(FONT_BOLD, 10)
    c.drawString(MARGIN + 18, 195, "핵심 정의")
    draw_para(c,
        "<b>병리 진단을 대신하는 서비스가 아닙니다.</b><br/>공개 자료와 교육용 가상 업무 흐름을 바탕으로 설계했으며,<br/>AI 제안은 원문 대조와 사용자 최종 확인을 위한 초안입니다.",
        MARGIN + 18, 181, 520, paragraph_style("cover-key", 13.5, 20, WHITE), 80)
    c.drawImage(str(QR_PATH), 657, 255, 118, 118, mask="auto")
    c.setFillColor(WHITE)
    c.setFont(FONT_BOLD, 10)
    c.drawCentredString(716, 235, "서비스 바로가기")
    link_text(c, "pathoscribe.vercel.app", "https://pathoscribe.vercel.app/", 653, 217, 9.2, MINT)
    link_text(c, "github.com/ssoio66/PathoScribe", "https://github.com/ssoio66/PathoScribe", 626, 196, 8.2, MINT)
    pill(c, "공개 합성데이터·가상 자료", 626, 154, 180, 26, HexColor("#184B54"), MINT)
    pill(c, "사용자 최종 확인", 626, 118, 180, 26, HexColor("#184B54"), MINT)
    c.setFillColor(Color(0.75, 0.84, 0.86))
    c.setFont(FONT_REGULAR, 8)
    c.drawString(MARGIN, 42, "제작자 김선미 · 개인 프로젝트 · 서비스 기획 · 공개데이터 정제 · AI 검수 설계 · 웹 구현 · Vercel 배포")
    c.setFont(FONT_BOLD, 8)
    c.drawRightString(PAGE_W - MARGIN, 42, "01 / 12")
    c.showPage()

    # 2. Pain points
    section_header(c, 2, "제작 계기", "병리 전사·입력 업무의 반복 입력과 수작업 대조", "공개 자료와 교육용 가상 업무 흐름을 바탕으로, 원문과 입력값을 같은 화면에서 확인하는 개인 프로젝트로 설계했습니다.")
    pain = [
        ("01", "육안 소견 입력 오류", "영문 의학용어, 숫자·단위, 좌우, 검체 수가 다시 입력되는 과정에서 달라질 수 있습니다."),
        ("02", "결과문 정보 혼재", "진단명, 종양 크기, 절제연, 림프절, 병기, 면역·분자병리 값이 한 문장에 섞여 있습니다."),
        ("03", "위탁 결과 수작업 대조", "결과지 형식이 기관마다 달라 검사번호·검체·날짜·결과를 내부 의뢰정보와 비교해야 합니다."),
        ("04", "분리된 업무 데이터", "검사·검체·블록·보고서·면역·분자 결과가 서로 다른 화면과 ID에 나뉩니다."),
        ("05", "분산된 입력 지침", "신규 담당자는 병리 용어와 입력 형식을 여러 문서에서 찾아야 합니다."),
        ("06", "AI의 원문 밖 생성 위험", "생성형 AI가 원문에 없는 값을 보완하면 중요한 오입력으로 이어질 수 있습니다."),
    ]
    start_y = 380
    for i, (num, title, body) in enumerate(pain):
        col, row = i % 2, i // 2
        x = MARGIN + col * 388
        y = start_y - row * 118
        rounded(c, x, y, 370, 98, WHITE, LINE)
        pill(c, num, x + 14, y + 61, 38, 23, MINT, TEAL_DARK)
        draw_para(c, escape(title), x + 64, y + 82, 284, CARD_TITLE, 30)
        draw_para(c, escape(body), x + 64, y + 52, 284, SMALL, 52)
    rounded(c, MARGIN, 42, PAGE_W - MARGIN * 2, 44, NAVY, NAVY)
    draw_para_middle(
        c,
        "<b>목표:</b> 누락·불일치를 눈에 보이게 하고, AI 결과를 그대로 확정할 때의 오류 위험을 줄이도록 담당자의 원문 대조와 최종 확인을 지원합니다.",
        MARGIN + 18,
        48,
        PAGE_W - MARGIN * 2 - 36,
        32,
        paragraph_style("goal", 10.2, 15, WHITE),
    )
    c.showPage()

    # 3. Three workflows
    section_header(c, 3, "업무-기능 연결", "세 가지 전사업무를 하나의 검수 원칙으로 연결", "각 업무는 원문, AI 추출값, ground truth, 담당자 확정값을 분리해 보여 줍니다.")
    workflows = [
        ("01", "육안 소견 입력·검수", "장기 · 검체 · 좌우 · 크기 · 개수\n절단면 · 병변 위치 · 블록 수", "숫자·단위·좌우·검체 수 대조", TEAL),
        ("02", "병리 결과 구조화·검수", "진단 · 유형 · 크기 · 분화도 · 절제연\n림프절 · 면역 · 분자 · 원문 병기", "자체 템플릿 + 의학용어 검수", AMBER),
        ("03", "위탁검사 입력·매칭", "의뢰번호 · 기관 · 검사명 · 검체\n접수일 · 보고일 · 결과 · 참고사항", "가상 내부 의뢰정보 항목별 대조", RED),
    ]
    for i, (num, title, fields, feature, accent) in enumerate(workflows):
        x = MARGIN + i * 258
        rounded(c, x, 170, 238, 286, WHITE, LINE)
        c.setFillColor(accent)
        c.circle(x + 28, 423, 15, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD, 9)
        c.drawCentredString(x + 28, 420, num)
        draw_para(c, escape(title), x + 18, 386, 202, paragraph_style("wf-title", 14, 19, NAVY, bold=True), 50)
        c.setFillColor(LINE)
        c.rect(x + 18, 348, 202, 1, stroke=0, fill=1)
        c.setFillColor(SLATE)
        c.setFont(FONT_BOLD, 8.5)
        c.drawString(x + 18, 328, "구조화 항목")
        draw_para(c, escape(fields).replace("\n", "<br/>"), x + 18, 316, 202, paragraph_style("wf-body", 8.8, 14.5, INK), 90)
        pill(c, feature, x + 18, 203, 202, 30, MINT_SOFT, TEAL_DARK, LINE)
    c.setFillColor(TEAL)
    c.setLineWidth(2)
    c.line(116, 125, 720, 125)
    stages = ["원문", "AI 구조화", "ground truth 대조", "오류 표시", "담당자 확인"]
    for i, stage in enumerate(stages):
        x = 116 + i * 151
        c.setFillColor(WHITE)
        c.setStrokeColor(TEAL)
        c.circle(x, 125, 8, stroke=1, fill=1)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 8.5)
        c.drawCentredString(x, 100, stage)
    c.setFillColor(RED)
    c.setFont(FONT_BOLD, 9.5)
    c.drawCentredString(PAGE_W / 2, 60, "AI 자동확정 금지 · 원문에 없는 값은 null 또는 확인 필요")
    c.showPage()

    # 4. Users and flow
    section_header(c, 4, "주요 사용자", "보건의료정보관리사 중심의 역할 기반 시제품", "실제 인증·권한체계가 아니라 직군별 업무 관점을 보여 주는 교육용 선택기입니다.")
    roles = [
        ("주 사용자", "보건의료정보관리사", "원문·AI 추출값 대조, 오류 수정, 담당자 확정값 작성"),
        ("원문 작성·판독", "병리의사", "전사 내용과 원문 비교, 확인 필요 항목과 검토 상태 조회"),
        ("검사정보 제공", "병리 검사 담당자", "검사·검체·블록 진행상태와 면역·분자 검사 상태 확인"),
        ("품질 현황", "품질관리자", "개인정보가 제거된 누락·불일치·수정 요청 현황 조회"),
    ]
    for i, (tag, title, body) in enumerate(roles):
        x = MARGIN + (i % 2) * 388
        y = 344 - (i // 2) * 132
        rounded(c, x, y, 370, 110, WHITE, LINE)
        pill(c, tag, x + 14, y + 72, 98, 23, MINT, TEAL_DARK)
        draw_para(c, escape(title), x + 128, y + 92, 222, paragraph_style("role-title", 12.8, 18, NAVY, bold=True), 30)
        draw_para(c, escape(body), x + 14, y + 60, 338, SMALL, 48)
    rounded(c, MARGIN, 65, PAGE_W - MARGIN * 2, 76, NAVY, NAVY)
    c.setFillColor(MINT)
    c.setFont(FONT_BOLD, 9)
    c.drawString(MARGIN + 18, 119, "사용 흐름")
    flow = ["역할 선택", "업무 선택", "가상 사례", "AI 구조화", "원문 대조", "담당자 확인"]
    x = MARGIN + 18
    for i, label in enumerate(flow):
        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD, 10.2)
        c.drawString(x, 84, label)
        x += pdfmetrics.stringWidth(label, FONT_BOLD, 10.2) + 22
        if i < len(flow) - 1:
            c.setFillColor(TEAL)
            c.drawString(x - 14, 84, "→")
    c.showPage()

    # 5-7. Real interface context with result panels derived from fixed educational fixtures.
    screen_pages = [
        (5, "업무 화면 01", "육안 소견 전사·검수", "gross-workspace.png", "EVAL-GROSS-006", ["laterality", "lesionLocation", "size", "blockCount"]),
        (6, "업무 화면 02", "병리 결과 구조화·의학용어 검수", "pathology-workspace.png", "EVAL-PATH-015", ["diagnosis", "grade", "immunopathology", "pathologicM"]),
        (7, "업무 화면 03", "위탁검사 결과 입력·매칭", "referral-workspace.png", "EVAL-OUT-004", ["order_number", "test_name", "specimen", "reported_date"]),
    ]
    for page, eyebrow, title, image_name, case_id, field_keys in screen_pages:
        subtitle = "교육용 가상 사례의 원문, 저장된 AI 제안, 근거, 경고와 담당자 확정값을 함께 보여 줍니다."
        section_header(c, page, eyebrow, title, subtitle)
        image_path = SCREENSHOTS / image_name
        draw_fixture_workspace(c, image_path, evaluation_cases[case_id], field_keys, MARGIN, 107, PAGE_W - MARGIN * 2, 365)
        rounded(c, MARGIN, 43, PAGE_W - MARGIN * 2, 50, WHITE, LINE)
        c.setFillColor(TEAL)
        c.roundRect(MARGIN, 43, 4, 50, 2, stroke=0, fill=1)
        draw_para(
            c,
            "<b>표시 원칙</b> · 교육용 가상 사례와 저장된 재현 결과이며 실제 환자 데이터가 아닙니다. AI 제안은 자동 확정되지 않고 담당자가 원문을 확인해 최종값을 입력합니다.",
            MARGIN + 18,
            77,
            PAGE_W - MARGIN * 2 - 36,
            paragraph_style(f"screen-note-{page}", 8.5, 13, INK),
            28,
        )
        c.showPage()

    # 8. Data
    section_header(c, 8, "데이터와 출처", "실제 공개자료와 프로젝트 생성 가상자료를 구분", "집계·메타정보를 환자별 결과로 사용하지 않고, 원본에 없는 연결 ID와 자유서술 문장은 가상 값으로 표시합니다.")
    columns = [MARGIN, 182, 315, 505, 662, PAGE_W - MARGIN]
    headers = ["데이터·기준", "제공기관", "프로젝트 내 사용 목적", "연결 방식", "주의사항"]
    table_top, row_h = 442, 57
    rounded(c, MARGIN, table_top - row_h, PAGE_W - MARGIN * 2, row_h, NAVY, NAVY, radius=7)
    for index, label in enumerate(headers):
        draw_para_middle(
            c,
            label,
            columns[index] + 8,
            table_top - row_h + 8,
            columns[index + 1] - columns[index] - 16,
            row_h - 16,
            paragraph_style(f"data-head-{index}", 7.5, 10, WHITE, bold=True),
        )
    rows = [
        ("암 임상 라이브러리 합성데이터(폐암)\n원본 XLSX 15,000개 합성 레코드", "국립암센터", "업무 연결·평가사례의 구조화 원천", "원본 행의 구조화 값 매핑", "실제 환자 결과가 아닌 공개 합성데이터"),
        ("세부진단·면역병리·병기·기관지내시경 API\n고정 처리 JSON", "국립암센터\n공공데이터포털", "검색·입력 형식·집계 참고", "서버 동기화 후 로컬 참조", "개인 결과·자동 진단에 사용하지 않음"),
        ("암정보사전 3,544개\n레지스트리 메타정보 253필드", "국가암지식정보센터\n국립암센터", "근거 검색·용어 후보·필드 정의", "고정 스냅샷·CSV 처리 JSON", "기관 지침이나 환자별 병리 결과가 아님"),
        ("가상 연결 데이터\n전체 9개 테이블 150,000행", "PathoScribe", "검사-검체-블록-보고서 타임라인", "원본 합성행을 가상 ID로 확장", "모든 ID·관계는 교육용 생성값"),
        ("웹 미리보기 48건\n고정 평가사례 35건\n위탁 PDF 9개·PNG 1개", "PathoScribe", "업무 시연·ground truth 기반 회귀 검증", "JSON fixture·가상 문서", "실제 진료·의료기록·임상 성능평가 아님"),
    ]
    for row_index, row in enumerate(rows):
        y = table_top - row_h * (row_index + 2)
        rounded(c, MARGIN, y, PAGE_W - MARGIN * 2, row_h, WHITE, LINE, radius=0, line_width=0.45)
        for index, value in enumerate(row):
            style = paragraph_style(f"data-row-{row_index}-{index}", 6.75 if index != 0 else 7.1, 8.8, NAVY if index == 0 else SLATE, bold=index == 0)
            draw_para_middle(
                c,
                escape(value).replace("\n", "<br/>"),
                columns[index] + 8,
                y + 6,
                columns[index + 1] - columns[index] - 16,
                row_h - 12,
                style,
            )
    rounded(c, MARGIN, 45, PAGE_W - MARGIN * 2, 45, WHITE, LINE)
    link_text(c, "data.go.kr · 국립암센터 공개데이터", "https://www.data.go.kr/", MARGIN + 14, 70, 8.1)
    link_text(c, "cancer.go.kr · 국가암지식정보센터 암정보사전", "https://www.cancer.go.kr/lay1/S1T523C850/contents.do", MARGIN + 300, 70, 8.1)
    link_text(c, "iaslc.org · 폐암 TNM 형식 참고", "https://www.iaslc.org/science-research/scientific-projects/iaslc-staging-project-lung-cancer-thymic-tumors-and", MARGIN + 14, 53, 8.1)
    c.setFillColor(SLATE)
    c.setFont(FONT_REGULAR, 7)
    c.drawRightString(PAGE_W - MARGIN - 14, 53, "실제 병원 EMR·LIS와 연동하지 않으며, 기관별 지침과 최신 기준은 별도 검증이 필요합니다.")
    c.showPage()

    # 9. AI and approval
    section_header(c, 9, "생성형 AI 활용", "생성형 AI를 안전한 입력 보조 도구로 설계한 방법", "Gemini는 원문 의미 구조화와 근거 연결을 담당하고, 형식·일관성은 규칙으로 한 번 더 확인합니다.")
    ai_steps = [
        ("01", "원문 구조화", "명시된 값만 구조화하고 미기재 값은 추정하지 않음"),
        ("02", "근거 연결", "각 값에 evidenceText, 미존재 값은 null · not_found"),
        ("03", "하이브리드 검수", "날짜 · 숫자 · 단위 · 좌우 · 검사번호 · 검체명 규칙 대조"),
        ("04", "사용자 최종 확인", "제안 적용 · 원문 유지 · 직접 수정 · 확인 필요"),
    ]
    for i, (num, title, body) in enumerate(ai_steps):
        x = MARGIN + i * 194
        rounded(c, x, 278, 177, 155, WHITE, LINE)
        pill(c, num, x + 14, 391, 38, 22, MINT, TEAL_DARK)
        draw_para(c, escape(title), x + 14, 374, 149, paragraph_style("ai-title", 11.5, 16, NAVY, bold=True), 35)
        draw_para_middle(c, escape(body), x + 14, 296, 149, 62, SMALL)
    c.setFillColor(TEAL)
    c.setLineWidth(2)
    c.line(88, 241, 752, 241)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 10)
    c.drawString(MARGIN, 210, "수정 제안 상태")
    states = [
        ("pending", "검토 전", AMBER_BG, AMBER),
        ("accepted", "제안 적용", GREEN_BG, GREEN),
        ("rejected", "원문 유지", PAPER, SLATE),
        ("manually_edited", "직접 수정", MINT, TEAL_DARK),
        ("needs_review", "확인 필요", RED_BG, RED),
    ]
    x = MARGIN
    for code, label, fill, color in states:
        rounded(c, x, 146, 144, 47, fill, LINE)
        c.setFillColor(color)
        c.setFont(FONT_BOLD, 8.4)
        c.drawString(x + 12, 174, code)
        c.setFillColor(NAVY)
        c.setFont(FONT_REGULAR, 8.3)
        c.drawString(x + 12, 157, label)
        x += 154
    rounded(c, MARGIN, 54, PAGE_W - MARGIN * 2, 66, NAVY, NAVY)
    draw_para(c, "<b>자동수정 차단:</b> positive/negative, left/right, pT·pN·pM, 크기·단위, 절제연, 림프절, 면역표지자, 유전자·변이, 검사번호, 검체명", MARGIN + 18, 101, PAGE_W - MARGIN * 2 - 36, paragraph_style("block", 9.2, 15, WHITE), 45)
    c.showPage()

    # 10. Evaluation and safety
    section_header(c, 10, "평가와 안전장치", "교육용 기능 검증과 실제 Gemini 연결을 구분", "고정 정답 기준값(ground truth) 회귀검증과 대표 실호출 기본 동작 시험(smoke test)을 구분하며, 이를 35건 Gemini 임상 성능평가로 확대 해석하지 않습니다.")
    stat(c, MARGIN, 360, 238, "고정 교육용 평가사례", "35건", "육안 소견 10 · 병리 결과 15 · 위탁검사 10", TEAL)
    stat(c, MARGIN + 258, 360, 238, "오류 사례 회귀", "23건", "각 사례의 expectedWarnings 24개 코드 재현", GREEN)
    stat(c, MARGIN + 516, 360, 238, "실제 Gemini smoke", "HTTP 200", "대표 가상 사례 1건 · mode=gemini", AMBER)
    rounded(c, MARGIN, 220, PAGE_W - MARGIN * 2, 112, WHITE, LINE)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 10.5)
    c.drawString(MARGIN + 16, 306, "실제 확인 범위")
    check_columns = [
        ["JSON/런타임 스키마 통과", "evidenceText 연결", "not_found 처리"],
        ["고위험 자동 제안 0건", "담당자 확정값 자동 반환 없음"],
    ]
    for column_index, items in enumerate(check_columns):
        x = MARGIN + 16 + column_index * 384
        for row_index, item in enumerate(items):
            y = 278 - row_index * 23
            c.setFillColor(GREEN)
            c.circle(x + 4, y + 2, 3, stroke=0, fill=1)
            c.setFillColor(INK)
            c.setFont(FONT_REGULAR, 8.8)
            c.drawString(x + 14, y - 1, item)
    safeguards = [
        ("실제 환자정보 입력 금지", RED), ("고정 caseId·가상 문서만", TEAL),
        ("API 키 서버 보관", TEAL), ("요청 크기·호출 제한", AMBER),
        ("실패 결과 위장 금지", RED), ("사용자 최종 확인", GREEN),
    ]
    for i, (label, color) in enumerate(safeguards):
        x = MARGIN + (i % 3) * 258
        y = 156 - (i // 3) * 57
        rounded(c, x, y, 238, 43, WHITE, LINE)
        c.setFillColor(color)
        c.circle(x + 18, y + 21, 5, stroke=0, fill=1)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 8.7)
        c.drawString(x + 32, y + 17, label)
    c.setFillColor(SLATE)
    c.setFont(FONT_REGULAR, 7.4)
    c.drawString(MARGIN, 45, "HTTP 200은 Gemini API 연결과 구조화 응답 반환이 정상적으로 완료되었다는 뜻이며, 의료적 정확도를 증명하는 수치가 아닙니다. 35건 전체 Gemini 연속 실호출 결과는 등록되어 있지 않습니다.")
    c.showPage()

    # 11. Stack and role
    section_header(c, 11, "기술 구성", "서버 전용 AI 호출과 추적 가능한 가상 데이터", "사용했다고 표시한 기술은 현재 코드·빌드·배포에서 실제로 확인된 범위로 제한합니다.")
    x_positions = [MARGIN, 225, 412, 599]
    stack = [
        ("FRONTEND", "Next.js 16 · React 19\nTypeScript · 반응형 CSS"),
        ("SERVER", "Route Handler\nZod/런타임 스키마"),
        ("AI + RULES", "@google/genai\n근거 추출 + 규칙 검수"),
        ("DATA + SECURITY", "JSON fixture · 선택형 Redis REST\n고정 caseId · rate limit"),
    ]
    for x, (tag, body) in zip(x_positions, stack):
        rounded(c, x, 322, 168, 120, WHITE, LINE)
        pill(c, tag, x + 12, 401, 92, 22, MINT, TEAL_DARK)
        draw_para_middle(
            c,
            escape(body).replace("\n", "<br/>"),
            x + 12,
            336,
            144,
            52,
            paragraph_style("stack", 9.2, 16, NAVY, bold=True),
        )
    c.setStrokeColor(TEAL)
    c.setLineWidth(2)
    c.line(118, 300, 720, 300)
    rounded(c, MARGIN, 63, 470, 205, NAVY, NAVY)
    c.setFillColor(MINT)
    c.setFont(FONT_BOLD, 10)
    c.drawString(MARGIN + 18, 239, "직접 수행한 역할")
    role_items = [
        "서비스 문제 정의와 역할별 업무 흐름 기획",
        "공개 합성·집계·메타정보 조사와 데이터 카탈로그 작성",
        "9개 연결 테이블·가상 ID·35건 평가사례 설계",
        "Gemini 프롬프트·응답 스키마·하이브리드 검수 규칙 구현",
        "UI/UX·접근성·오류 상태·사용자 승인 흐름 구현",
        "테스트·보안 검증·GitHub·Vercel 배포와 문서화",
    ]
    y = 211
    for item in role_items:
        c.setFillColor(TEAL)
        c.circle(MARGIN + 23, y + 2, 3, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(FONT_REGULAR, 9)
        c.drawString(MARGIN + 34, y - 1, item)
        y -= 27
    rounded(c, 530, 63, 273, 205, WHITE, LINE)
    draw_para(c, "<b>구현하지 않은 기술</b>", 548, 240, 235, paragraph_style("not-title", 10.5, 15, NAVY, bold=True), 30)
    draw_para(c, "데이터베이스, 범용 OCR, 음성인식, 실제 인증·전자서명, 실제 PIS/EMR/LIS 연결, 자동 진단·판독·병기 판정", 548, 210, 235, paragraph_style("not-body", 9.1, 16, SLATE), 120)
    pill(c, "검증된 기술만 표시", 548, 82, 152, 27, GREEN_BG, GREEN, LINE)
    c.showPage()

    # 12. Limits and links
    section_header(c, 12, "한계와 다음 단계", "교육용 시제품의 경계를 명확히 기록", "현재 구현을 과장하지 않고, 실제 업무 적용 전에 필요한 검증과 개선 과제를 분리했습니다.")
    limitations = [
        "실제 환자정보·실제 병리보고서·실제 병원 시스템과 연결하지 않음",
        "임의 PDF OCR·음성인식·자동 진단·판독·병기 판정 미구현",
        "승인 상태는 브라우저 세션에만 유지하며 영구 감사로그가 아님",
        "용어사전과 규칙이 모든 의학 표현과 중대 오류를 포괄하지 않음",
    ]
    improvements = [
        "390·768·1280·1440px 실제 브라우저 접근성·인쇄 검증 확대",
        "승인된 35건 Gemini 일괄 실행 결과를 버전 파일로 등록",
        "폐암 병리 용어 후보와 교육용 오류사례 범위 확장",
        "개인정보를 저장하지 않는 세션 단위 감사 흐름 고도화",
    ]
    rounded(c, MARGIN, 218, 370, 235, WHITE, LINE)
    draw_para(c, "<b>현재 한계</b>", MARGIN + 18, 424, 330, paragraph_style("lim-title", 13, 18, NAVY, bold=True), 30)
    y = 389
    for item in limitations:
        c.setFillColor(RED)
        c.circle(MARGIN + 23, y + 2, 3, stroke=0, fill=1)
        draw_para(c, escape(item), MARGIN + 35, y + 10, 320, SMALL, 47)
        y -= 46
    rounded(c, MARGIN + 388, 218, 370, 235, WHITE, LINE)
    draw_para(c, "<b>향후 개선</b>", MARGIN + 406, 424, 330, paragraph_style("imp-title", 13, 18, NAVY, bold=True), 30)
    y = 389
    for item in improvements:
        c.setFillColor(TEAL)
        c.circle(MARGIN + 411, y + 2, 3, stroke=0, fill=1)
        draw_para(c, escape(item), MARGIN + 423, y + 10, 320, SMALL, 47)
        y -= 46
    rounded(c, MARGIN, 55, PAGE_W - MARGIN * 2, 133, NAVY, NAVY)
    c.setFillColor(MINT)
    c.setFont(FONT_BOLD, 9)
    c.drawString(MARGIN + 18, 160, "LINKS")
    link_text(c, "서비스 · https://pathoscribe.vercel.app/", "https://pathoscribe.vercel.app/", MARGIN + 18, 132, 9.4, WHITE)
    link_text(c, "GitHub · https://github.com/ssoio66/PathoScribe", "https://github.com/ssoio66/PathoScribe", MARGIN + 18, 105, 9.4, WHITE)
    link_text(c, "다른 프로젝트 · https://github.com/ssoio66", "https://github.com/ssoio66", MARGIN + 18, 78, 9.4, WHITE)
    c.drawImage(str(QR_PATH), 686, 68, 94, 94, mask="auto")
    c.save()
    print(OUT)


if __name__ == "__main__":
    build_pdf()
