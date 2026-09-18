# ============================================================
# json_to_excel_batch_v2.py
# OCR_Project
#
# Nhiều JSON -> 1 file Excel tổng hợp
# Mẫu chính bám theo mẫu NHẬT KÝ GỖ XẺ HÀNG NGÀY:
#   - Ngày nhập / Ngày xe / Tháng
#   - Gỗ tròn: Số, Ký hiệu, KT mua vào, KT đo thực tế,
#     Khối lượng, Đơn giá, Thành tiền
#   - Xe thành khí: Rộng, Cao, Dài, SL, Khối lượng
#   - Công trình, STT, Tên cấu kiện, Nhà cung cấp
#   - Khối lượng thành khí, Phần trăm
#
# Đồng thời tạo:
#   - TONG_HOP_NGAY: mỗi ngày một dòng, có đầy đủ gỗ tròn + thành khí
#   - CHI_TIET: đối chiếu từng dòng
#   - CANH_BAO: các dòng cần kiểm tra
#
# Không ghi đè file Excel cũ.
# ============================================================

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.dimensions import ColumnDimension


# ============================================================
# CẤU HÌNH
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
JSON_DIR = BASE_DIR / "output"
EXCEL_DIR = BASE_DIR / "excel_exports"
EXCEL_DIR.mkdir(parents=True, exist_ok=True)

TOLERANCE = 0.002


# ============================================================
# HỖ TRỢ DỮ LIỆU
# ============================================================

def txt(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def num(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)

    s = txt(value).replace(" ", "")
    if not s:
        return None

    if "," in s and "." not in s:
        s = s.replace(",", ".")
    elif "," in s and "." in s:
        s = s.replace(".", "")
        s = s.replace(",", ".")

    s = re.sub(r"[^0-9.\-]", "", s)

    try:
        return float(s)
    except ValueError:
        return None


def parse_date(value: Any):
    s = txt(value)
    if not s:
        return None

    s = s.replace("-", "/").replace(".", "/")
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass

    return None


def month_from_date(value: Any) -> int | None:
    parsed = parse_date(value)
    return parsed.month if parsed else None


def parse_dim(value: Any):
    """
    JSON:
        Dày x Rộng x Dài = SL

    Ví dụ:
        11 x 11 x 335 = 12

    Trả về:
        dài, rộng, dày, SL
    """
    s = txt(value).lower().replace("×", "x")
    numbers = re.findall(r"\d+(?:[.,]\d+)?", s)

    if len(numbers) < 3:
        return None

    try:
        day = float(numbers[0].replace(",", "."))
        rong = float(numbers[1].replace(",", "."))
        dai = float(numbers[2].replace(",", "."))
        sl = 1
        if len(numbers) >= 4:
            sl = int(round(float(numbers[3].replace(",", "."))))
        return dai, rong, day, sl
    except ValueError:
        return None


def calculate_volume(
    dai: float | None,
    rong: float | None,
    day: float | None,
    sl: int | None,
):
    if None in (dai, rong, day, sl):
        return None
    try:
        return dai * rong * day * sl / 1_000_000
    except Exception:
        return None


def unique_path(stem: str) -> Path:
    EXCEL_DIR.mkdir(parents=True, exist_ok=True)

    first = EXCEL_DIR / f"{stem}.xlsx"
    if not first.exists():
        return first

    version = 2
    while True:
        path = EXCEL_DIR / f"{stem}_v{version}.xlsx"
        if not path.exists():
            return path
        version += 1


def first_value(*values: Any) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return ""


def get_round_wood(data: dict) -> dict:
    """Đọc gỗ tròn. Ưu tiên schema có cấu trúc nếu OCR sau này được nâng cấp."""
    header = data.get("header") or {}
    structured = data.get("round_wood")
    if not isinstance(structured, dict):
        structured = first_value(
            header.get("go_tron"),
            data.get("go_tron"),
        )
    if not isinstance(structured, dict):
        structured = {}

    return {
        "so": first_value(
            structured.get("so"),
            structured.get("so_go_tron"),
            header.get("so_go_tron"),
            data.get("so_go_tron"),
        ),
        "ky_hieu": first_value(
            structured.get("ky_hieu"),
            structured.get("ki_hieu"),
            header.get("ky_hieu_go_tron"),
            data.get("ky_hieu_go_tron"),
        ),
        "mua_dai": first_value(
            structured.get("kt_mua_vao_dai"),
            structured.get("mua_vao_dai"),
            header.get("kt_mua_vao_dai"),
            data.get("kt_mua_vao_dai"),
        ),
        "mua_vanh": first_value(
            structured.get("kt_mua_vao_vanh"),
            structured.get("mua_vao_vanh"),
            header.get("kt_mua_vao_vanh"),
            data.get("kt_mua_vao_vanh"),
        ),
        "thuc_dai": first_value(
            structured.get("kt_do_thuc_te_dai"),
            structured.get("do_thuc_te_dai"),
            header.get("kt_do_thuc_te_dai"),
            data.get("kt_do_thuc_te_dai"),
        ),
        "thuc_vanh": first_value(
            structured.get("kt_do_thuc_te_vanh"),
            structured.get("do_thuc_te_vanh"),
            header.get("kt_do_thuc_te_vanh"),
            data.get("kt_do_thuc_te_vanh"),
        ),
        "khoi_luong": first_value(
            structured.get("khoi_luong"),
            structured.get("khoi_luong_go_tron"),
            header.get("khoi_luong_go_tron"),
            data.get("khoi_luong_go_tron"),
        ),
        "don_gia": first_value(
            structured.get("don_gia"),
            header.get("don_gia"),
            data.get("don_gia"),
        ),
        "thanh_tien": first_value(
            structured.get("thanh_tien"),
            header.get("thanh_tien"),
            data.get("thanh_tien"),
        ),
        "raw": txt(
            header.get("kich_thuoc_go_tron")
            or data.get("kich_thuoc_go_tron")
        ),
    }


def read_json(json_path: Path) -> dict:
    with json_path.open("r", encoding="utf-8-sig") as f:
        data = json.load(f)

    if not isinstance(data, dict):
        raise ValueError("JSON cấp cao nhất phải là object.")

    header = data.get("header")
    if not isinstance(header, dict):
        header = {}

    items = data.get("items")
    if not isinstance(items, list):
        items = []

    round_wood = get_round_wood(data)

    return {
        "file": json_path.name,
        "source_file": txt((data.get("source") or {}).get("file")) or json_path.stem,
        "ngay_nhap": first_value(
            header.get("ngay_nhap"),
            data.get("ngay_nhap"),
        ),
        "so_xe": txt(
            header.get("so_xe")
            or data.get("so_xe")
            or data.get("bien_so_xe")
        ),
        "ngay_xe": first_value(
            header.get("ngay_xe"),
            data.get("ngay_xe"),
        ),
        "kich_thuoc_go_tron": txt(
            header.get("kich_thuoc_go_tron")
            or data.get("kich_thuoc_go_tron")
        ),
        "khoi_luong_go_tron": first_value(
            round_wood["khoi_luong"],
            header.get("khoi_luong_go_tron"),
            data.get("khoi_luong_go_tron"),
        ),
        "kich_thuoc_xe": txt(
            header.get("kich_thuoc_xe")
            or data.get("kich_thuoc_xe")
        ),
        "round_wood": round_wood,
        "items": items,
    }


# ============================================================
# STYLE
# ============================================================

def create_styles():
    thin = Side(style="thin", color="000000")
    medium = Side(style="medium", color="000000")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    outer_border = Border(left=medium, right=medium, top=medium, bottom=medium)

    title = Font(name="Arial", size=14, bold=True)
    group = Font(name="Arial", size=10, bold=True)
    header = Font(name="Arial", size=9, bold=True)
    body = Font(name="Arial", size=9)
    body_bold = Font(name="Arial", size=9, bold=True)

    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left = Alignment(horizontal="left", vertical="center", wrap_text=True)

    # Màu nhẹ chỉ dùng ở vùng tiêu đề nhóm; dữ liệu vẫn trắng như mẫu.
    group_fill = PatternFill(fill_type="solid", fgColor="D9EAF7")
    sub_fill = PatternFill(fill_type="solid", fgColor="F2F2F2")
    summary_fill = PatternFill(fill_type="solid", fgColor="EAF2F8")

    return {
        "border": border,
        "outer_border": outer_border,
        "title": title,
        "group": group,
        "header": header,
        "body": body,
        "body_bold": body_bold,
        "center": center,
        "left": left,
        "group_fill": group_fill,
        "sub_fill": sub_fill,
        "summary_fill": summary_fill,
    }


def style_range(ws, cell_range: str, *, border=None, fill=None, font=None, alignment=None):
    for row in ws[cell_range]:
        for cell in row:
            if border:
                cell.border = border
            if fill:
                cell.fill = fill
            if font:
                cell.font = font
            if alignment:
                cell.alignment = alignment


def apply_widths(ws, widths: dict[str, float]):
    for col, width in widths.items():
        ws.column_dimensions[col].width = width


# ============================================================
# DỮ LIỆU TÍNH TOÁN
# ============================================================

def normalize_item(item: dict, index: int) -> dict:
    # V5.2 đã tách sẵn Rộng/Cao/Dài/SL.
    # Nếu thiếu dữ liệu thì fallback về chuỗi kích thước của JSON cũ.
    raw = txt(
        item.get("kich_thuoc_so_luong")
        or item.get("kich_thuoc")
    )

    rong = num(item.get("rong"))
    cao = num(item.get("cao"))
    dai = num(item.get("dai"))
    sl_value = num(item.get("so_luong"))

    if None in (rong, cao, dai, sl_value):
        parsed = parse_dim(raw)
        if parsed:
            old_dai, old_rong, old_day, old_sl = parsed
            if dai is None:
                dai = old_dai
            if rong is None:
                rong = old_rong
            if cao is None:
                cao = old_day
            if sl_value is None:
                sl_value = old_sl

    sl = int(round(sl_value)) if sl_value is not None else None

    written = num(
        item.get("khoi_luong")
        if item.get("khoi_luong") is not None
        else item.get("khoi_luong_m3")
    )

    calculated = calculate_volume(dai, rong, cao, sl)
    difference = None
    status = "KIỂM TRA"

    if written is not None and calculated is not None:
        difference = calculated - written
        status = "OK" if abs(difference) <= TOLERANCE else "CHÊNH LỆCH"

    ngay = txt(item.get("ngay"))

    return {
        "index": index,
        "dong": first_value(item.get("dong"), index),
        "ngay": ngay,
        "ngay_date": parse_date(ngay),
        "thang": month_from_date(ngay),
        "raw": raw,
        "dai": dai,
        "rong": rong,
        "cao": cao,
        "day": cao,
        "sl": sl,
        "written": written,
        "calculated": calculated,
        "difference": difference,
        "status": status,
        "cong_trinh": txt(item.get("cong_trinh")),
        "stt_cau_kien": txt(item.get("stt_cau_kien")),
        "ten_cau_kien": txt(item.get("ten_cau_kien")),
        "nha_cung_cap": txt(item.get("nha_cung_cap")),
        "ghi_chu": txt(item.get("ghi_chu")),
    }


def enrich_records(records: list[dict]) -> None:
    for record in records:
        normalized = [
            normalize_item(item, idx)
            for idx, item in enumerate(record["items"], 1)
        ]
        record["norm_items"] = normalized
        record["tong_khoi_luong_tinh"] = round(
            sum(x["calculated"] or 0 for x in normalized),
            6,
        )
        record["khoi_luong_go_tron_num"] = num(record["khoi_luong_go_tron"])

        grouped = defaultdict(list)
        for item in normalized:
            key = item["ngay"] or ""
            grouped[key].append(item)

        record["daily_groups"] = dict(grouped)
        record["daily_ranges"] = []


# ============================================================
# SHEET 1: NHẬT KÝ THEO MẪU
# ============================================================

def create_main_sheet(wb: Workbook, records: list[dict]) -> None:
    ws = wb.active
    ws.title = "NHAT_KY_HANG_NGAY"
    ws.sheet_view.showGridLines = False

    st = create_styles()

    # Cột A:W giống mẫu người dùng gửi.
    ws.merge_cells("A1:W1")
    ws["A1"] = "NHẬT KÝ GỖ XẺ HÀNG NGÀY"
    ws["A1"].font = st["title"]
    ws["A1"].alignment = st["center"]
    ws.row_dimensions[1].height = 24

    # Nhóm tiêu đề dòng 2.
    group_defs = [
        ("A2", "A3", "Ngày nhập"),
        ("B2", "B3", "Ngày xe"),
        ("C2", "C3", "Tháng"),
        ("D2", "L2", "Gỗ tròn"),
        ("M2", "Q2", "Xe thành khí"),
        ("R2", "R3", "Công trình"),
        ("S2", "S3", "STT"),
        ("T2", "T3", "Tên Cấu kiện"),
        ("U2", "U3", "Nhà cung cấp"),
        ("V2", "V3", "Khối lượng thành khí"),
        ("W2", "W3", "Phần trăm"),
    ]

    for start, end, title in group_defs:
        ws.merge_cells(f"{start}:{end}")
        cell = ws[start]
        cell.value = title
        cell.font = st["group"]
        cell.fill = st["group_fill"]
        cell.alignment = st["center"]
        style_range(ws, f"{start}:{end}", border=st["border"])

    subheaders = {
        "D3": "Số",
        "E3": "Ký hiệu",
        "F3": "Dài",
        "G3": "Vành",
        "H3": "Dài",
        "I3": "Vành",
        "J3": "Khối lượng",
        "K3": "Đơn giá",
        "L3": "Thành tiền",
        "M3": "Rộng",
        "N3": "Cao",
        "O3": "Dài",
        "P3": "SL",
        "Q3": "Khối lượng",
    }

    for coord, value in subheaders.items():
        c = ws[coord]
        c.value = value
        c.font = st["header"]
        c.fill = st["sub_fill"]
        c.alignment = st["center"]
        c.border = st["border"]

    for coord in ["A3", "B3", "C3", "R3", "S3", "T3", "U3", "V3", "W3"]:
        ws[coord].border = st["border"]

    # Bao viền toàn vùng header.
    style_range(ws, "A2:W3", border=st["border"])
    ws.row_dimensions[2].height = 24
    ws.row_dimensions[3].height = 42

    row = 4

    for record in records:
        record_start = row
        norm_items = record["norm_items"]
        if not norm_items:
            # Vẫn tạo một dòng cho phiếu không có items.
            norm_items = [{
                "index": 1, "dong": 1, "ngay": "", "ngay_date": None, "thang": None,
                "raw": "", "dai": None, "rong": None, "day": None, "sl": None,
                "written": None, "calculated": None, "difference": None, "status": "KIỂM TRA",
                "cong_trinh": "", "stt_cau_kien": "", "ten_cau_kien": "", "ghi_chu": ""
            }]

        # Chúng ta trình bày theo thứ tự ngày xuất hiện trong JSON.
        grouped = defaultdict(list)
        for item in norm_items:
            grouped[item["ngay"]].append(item)

        record_rows = []
        for date_key, group_items in grouped.items():
            group_start = row
            for item in group_items:
                record_rows.append((row, item, date_key))

                # Ngày/tháng lấy trực tiếp từ dòng thành khí vì JSON hiện tại có ngày ở item.
                values = {
                    "A": record.get("ngay_nhap", ""),
                    "B": parse_date(record["ngay_xe"]) or item["ngay_date"] or record["ngay_xe"],
                    "C": item["thang"],
                    "D": record["round_wood"]["so"],
                    "E": record["round_wood"]["ky_hieu"],
                    "F": num(record["round_wood"]["mua_dai"]),
                    "G": num(record["round_wood"]["mua_vanh"]),
                    "H": num(record["round_wood"]["thuc_dai"]),
                    "I": num(record["round_wood"]["thuc_vanh"]),
                    "J": record["khoi_luong_go_tron_num"],
                    "K": num(record["round_wood"]["don_gia"]),
                    "L": num(record["round_wood"]["thanh_tien"]),
                    "M": item["rong"],
                    "N": item.get("cao", item.get("day")),
                    "O": item["dai"],
                    "P": item["sl"],
                    "Q": None,
                    "R": item["cong_trinh"],
                    "S": item["stt_cau_kien"],
                    "T": item["ten_cau_kien"],
                    "U": item.get("nha_cung_cap", ""),
                    "V": None,
                    "W": None,
                }

                for col, value in values.items():
                    c = ws[f"{col}{row}"]
                    c.value = value
                    c.font = st["body"]
                    c.alignment = st["left"] if col in ("R", "T", "U") else st["center"]
                    c.border = st["border"]

                ws[f"Q{row}"] = f'=IFERROR(M{row}*N{row}*O{row}*P{row}/1000000,"")'
                ws[f"Q{row}"].font = st["body"]
                ws[f"Q{row}"].alignment = st["center"]
                ws[f"Q{row}"].border = st["border"]

                for col in ["J", "K", "L", "Q"]:
                    ws[f"{col}{row}"].number_format = "0.000"

                # Dòng dữ liệu có thể có ngày dạng date thật.
                if hasattr(values["B"], "strftime"):
                    ws[f"B{row}"].number_format = "dd/mm/yyyy"

                row += 1

            group_end = row - 1

            # V: tổng KL thành khí của ngày; W: tỷ lệ ngày / KL gỗ tròn.
            if group_end >= group_start:
                ws.merge_cells(start_row=group_start, start_column=22, end_row=group_end, end_column=22)
                ws.merge_cells(start_row=group_start, start_column=23, end_row=group_end, end_column=23)
                v = ws.cell(group_start, 22)
                w = ws.cell(group_start, 23)
                v.value = f"=SUM(Q{group_start}:Q{group_end})"
                w.value = (
                    f'=IFERROR(V{group_start}/J{record_start},"")'
                )
                v.number_format = "0.000"
                w.number_format = "0.0%"
                v.font = st["body_bold"]
                w.font = st["body_bold"]
                v.alignment = st["center"]
                w.alignment = st["center"]
                v.border = st["border"]
                w.border = st["border"]

                # Lưu tổng ngày để sheet tổng hợp dùng lại.
                record["daily_ranges"].append({
                    "ngay": date_key,
                    "start_row": group_start,
                    "end_row": group_end,
                })
                day_total = round(
                    sum(x["calculated"] or 0 for x in group_items),
                    6,
                )
                for item in group_items:
                    item["daily_total"] = day_total

        record_end = row - 1

        # Gộp thông tin gỗ tròn / xe theo phiếu như mẫu.
        if record_end >= record_start:
            for col in range(1, 13):
                # A và C có thể thay đổi theo ngày; B ngày xe/ngày phiếu cần giữ từng dòng.
                if col in (1, 2, 3):
                    continue
                ws.merge_cells(start_row=record_start, start_column=col, end_row=record_end, end_column=col)
                cell = ws.cell(record_start, col)
                cell.border = st["border"]
                cell.alignment = st["center"]

        # Merge Ngày xe nếu có, nhưng nếu ngày xe trống thì giữ trống.
        # Gộp thêm các cột thông tin chung của phiếu đã xử lý ở trên.
        for merged_range in list(ws.merged_cells.ranges):
            pass

    # Sửa lại Ngày xe ở cột B: nếu header trống thì lấy ngày xe trống, không suy diễn.
    # Cột B phải phản ánh header.ngay_xe.
    for record in records:
        # Không cần thao tác thêm; các giá trị đã được ghi từ header.
        pass

    widths = {
        "A": 13, "B": 13, "C": 8,
        "D": 10, "E": 13, "F": 10, "G": 10, "H": 10, "I": 10,
        "J": 14, "K": 13, "L": 16,
        "M": 9, "N": 9, "O": 10, "P": 7, "Q": 14,
        "R": 22, "S": 8, "T": 22, "U": 18, "V": 19, "W": 12,
    }
    apply_widths(ws, widths)

    # Giới hạn chiều cao để giống sổ theo dõi thực tế.
    for r in range(4, max(row, 5)):
        ws.row_dimensions[r].height = 28

    ws.freeze_panes = "D4"
    ws.auto_filter.ref = f"A3:W{max(row - 1, 3)}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = "1:3"


# ============================================================
# SHEET 2: TỔNG HỢP NGÀY
# ============================================================

def create_daily_summary_sheet(wb: Workbook, records: list[dict]) -> None:
    ws = wb.create_sheet("TONG_HOP_NGAY")
    ws.sheet_view.showGridLines = False
    st = create_styles()

    ws.merge_cells("A1:J1")
    ws["A1"] = "TỔNG HỢP GỖ THEO NGÀY"
    ws["A1"].font = st["title"]
    ws["A1"].alignment = st["center"]

    headers = [
        "Ngày",
        "File / Phiếu",
        "Ngày xẻ",
        "Số xẻ",
        "Kích thước gỗ tròn",
        "Khối lượng gỗ tròn (m³)",
        "Số dòng thành khí",
        "Khối lượng thành khí ngày (m³)",
        "Tỷ lệ ngày / gỗ tròn",
        "Cảnh báo",
    ]

    for col, value in enumerate(headers, 1):
        cell = ws.cell(3, col, value)
        cell.font = st["header"]
        cell.fill = st["sub_fill"]
        cell.alignment = st["center"]
        cell.border = st["border"]

    row = 4
    for record in records:
        for daily in record.get("daily_ranges", []):
            date_key = daily["ngay"]
            start_row = daily["start_row"]
            end_row = daily["end_row"]
            round_mass = record["khoi_luong_go_tron_num"]

            warning = []
            if not date_key:
                warning.append("THIEU_NGAY")
            if round_mass is None:
                warning.append("THIEU_KHOI_LUONG_GO_TRON")
            for item in record["daily_groups"].get(date_key, []):
                if item["status"] != "OK":
                    warning.append(f"DONG_{item['dong']}_{item['status']}")

            values = [
                parse_date(date_key) or date_key,
                record["file"],
                parse_date(record["ngay_xe"]) or record["ngay_xe"],
                record["so_xe"],
                record["kich_thuoc_go_tron"],
                round_mass,
                end_row - start_row + 1,
                None,
                None,
                "; ".join(dict.fromkeys(warning)),
            ]

            for col, value in enumerate(values, 1):
                cell = ws.cell(row, col, value)
                cell.font = st["body"]
                cell.alignment = st["left"] if col in (2, 4, 5, 10) else st["center"]
                cell.border = st["border"]

            ws.cell(row, 8, f"=SUM('NHAT_KY_HANG_NGAY'!Q{start_row}:Q{end_row})")
            ws.cell(row, 9, f'=IFERROR(H{row}/F{row},"")')
            ws.cell(row, 6).number_format = "0.000"
            ws.cell(row, 8).number_format = "0.000"
            ws.cell(row, 9).number_format = "0.0%"

            if hasattr(values[0], "strftime"):
                ws.cell(row, 1).number_format = "dd/mm/yyyy"
            if hasattr(values[2], "strftime"):
                ws.cell(row, 3).number_format = "dd/mm/yyyy"

            row += 1

    total_row = row
    ws.cell(total_row, 1, "TỔNG")
    ws.cell(total_row, 1).font = st["body_bold"]
    ws.cell(total_row, 1).alignment = st["center"]

    if row > 4:
        ws.cell(total_row, 6, f"=SUM(F4:F{row - 1})")
        ws.cell(total_row, 8, f"=SUM(H4:H{row - 1})")
        ws.cell(total_row, 6).number_format = "0.000"
        ws.cell(total_row, 8).number_format = "0.000"
        ws.cell(total_row, 6).font = st["body_bold"]
        ws.cell(total_row, 8).font = st["body_bold"]

    for col in range(1, 11):
        ws.cell(total_row, col).border = st["border"]
        ws.cell(total_row, col).fill = st["summary_fill"]

    apply_widths(ws, {
        "A": 13, "B": 30, "C": 13, "D": 18, "E": 30,
        "F": 22, "G": 19, "H": 27, "I": 20, "J": 35,
    })
    ws.freeze_panes = "A4"
    ws.auto_filter.ref = f"A3:J{max(row - 1, 3)}"


# ============================================================
# SHEET 3: TỔNG HỢP PHIẾU
# ============================================================

def create_summary_sheet(wb: Workbook, records: list[dict]) -> None:
    ws = wb.create_sheet("TONG_HOP_PHEU")
    ws.sheet_view.showGridLines = False
    st = create_styles()

    ws.merge_cells("A1:J1")
    ws["A1"] = "TỔNG HỢP NHẬT KÝ XE GỖ"
    ws["A1"].font = st["title"]
    ws["A1"].alignment = st["center"]

    headers = [
        "STT", "File / Phiếu", "Ngày xe", "Số xe",
        "Kích thước gỗ tròn", "Khối lượng gỗ tròn (m³)",
        "Số dòng gỗ thành khí", "Tổng khối lượng thành khí (m³)",
        "Tỷ lệ", "Kích thước xe",
    ]

    for col, value in enumerate(headers, 1):
        c = ws.cell(3, col, value)
        c.font = st["header"]
        c.fill = st["sub_fill"]
        c.alignment = st["center"]
        c.border = st["border"]

    for idx, record in enumerate(records, 1):
        row = idx + 3
        round_mass = record["khoi_luong_go_tron_num"]
        total = record["tong_khoi_luong_tinh"]
        ratio = (total / round_mass) if round_mass else None
        values = [
            idx,
            record["file"],
            parse_date(record["ngay_xe"]) or record["ngay_xe"],
            record["so_xe"],
            record["kich_thuoc_go_tron"],
            round_mass,
            len(record["norm_items"]),
            total,
            ratio,
            record["kich_thuoc_xe"],
        ]

        for col, value in enumerate(values, 1):
            c = ws.cell(row, col, value)
            c.font = st["body"]
            c.alignment = st["left"] if col in (2, 4, 5, 10) else st["center"]
            c.border = st["border"]

        if hasattr(values[2], "strftime"):
            ws.cell(row, 3).number_format = "dd/mm/yyyy"
        ws.cell(row, 6).number_format = "0.000"
        ws.cell(row, 8).number_format = "0.000"
        ws.cell(row, 9).number_format = "0.0%"

    total_row = len(records) + 4
    for col in range(1, 11):
        ws.cell(total_row, col).border = st["border"]
        ws.cell(total_row, col).fill = st["summary_fill"]

    ws.cell(total_row, 5, "TỔNG")
    ws.cell(total_row, 5).font = st["body_bold"]
    if records:
        ws.cell(total_row, 6, f"=SUM(F4:F{total_row - 1})")
        ws.cell(total_row, 8, f"=SUM(H4:H{total_row - 1})")
        ws.cell(total_row, 6).number_format = "0.000"
        ws.cell(total_row, 8).number_format = "0.000"
        ws.cell(total_row, 6).font = st["body_bold"]
        ws.cell(total_row, 8).font = st["body_bold"]

    apply_widths(ws, {
        "A": 8, "B": 30, "C": 13, "D": 18, "E": 30,
        "F": 22, "G": 20, "H": 28, "I": 12, "J": 24,
    })
    ws.freeze_panes = "A4"
    ws.auto_filter.ref = f"A3:J{max(total_row - 1, 3)}"


# ============================================================
# SHEET 4: CHI TIẾT
# ============================================================

def create_detail_sheet(wb: Workbook, records: list[dict]) -> None:
    ws = wb.create_sheet("CHI_TIET")
    ws.sheet_view.showGridLines = False
    st = create_styles()

    ws.merge_cells("A1:V1")
    ws["A1"] = "CHI TIẾT GỖ TRÒN + GỖ THÀNH KHÍ"
    ws["A1"].font = st["title"]
    ws["A1"].alignment = st["center"]

    headers = [
        "File / Phiếu", "Ngày", "Ngày xe", "Số xe",
        "Thông tin gỗ tròn OCR gốc", "Khối lượng gỗ tròn (m³)",
        "STT dòng", "Kích thước và số lượng",
        "Dài (cm)", "Rộng (cm)", "Dày (cm)", "SL",
        "Khối lượng ghi (m³)", "Khối lượng tính (m³)",
        "Chênh lệch (m³)", "Trạng thái",
        "Công trình", "STT cấu kiện", "Tên cấu kiện",
        "Kích thước xe", "Ghi chú", "Nguồn ảnh",
    ]

    for col, value in enumerate(headers, 1):
        c = ws.cell(3, col, value)
        c.font = st["header"]
        c.fill = st["sub_fill"]
        c.alignment = st["center"]
        c.border = st["border"]

    row = 4
    for record in records:
        for item in record["norm_items"]:
            values = [
                record["file"],
                item["ngay_date"] or item["ngay"],
                parse_date(record["ngay_xe"]) or record["ngay_xe"],
                record["so_xe"],
                record["round_wood"]["raw"],
                record["khoi_luong_go_tron_num"],
                item["dong"],
                item["raw"],
                item["dai"],
                item["rong"],
                item.get("cao", item.get("day")),
                item["sl"],
                item["written"],
                item["calculated"],
                item["difference"],
                item["status"],
                item["cong_trinh"],
                item["stt_cau_kien"],
                item["ten_cau_kien"],
                record["kich_thuoc_xe"],
                item["ghi_chu"],
                record["source_file"],
            ]

            for col, value in enumerate(values, 1):
                c = ws.cell(row, col, value)
                c.font = st["body"]
                c.alignment = st["left"] if col in (5, 8, 17, 19, 20, 21, 22) else st["center"]
                c.border = st["border"]

            for col in (6, 13, 14, 15):
                ws.cell(row, col).number_format = "0.000"

            if hasattr(values[1], "strftime"):
                ws.cell(row, 2).number_format = "dd/mm/yyyy"
            if hasattr(values[2], "strftime"):
                ws.cell(row, 3).number_format = "dd/mm/yyyy"

            row += 1

    total_row = row
    for col in range(1, len(headers) + 1):
        ws.cell(total_row, col).border = st["border"]
        ws.cell(total_row, col).fill = st["summary_fill"]

    ws.cell(total_row, 1, "TỔNG CỘNG")
    ws.cell(total_row, 1).font = st["body_bold"]

    if total_row > 4:
        ws.cell(total_row, 12, f"=SUM(L4:L{total_row - 1})")
        ws.cell(total_row, 13, f"=SUM(M4:M{total_row - 1})")
        ws.cell(total_row, 14, f"=SUM(N4:N{total_row - 1})")
        ws.cell(total_row, 15, f"=SUM(O4:O{total_row - 1})")
        for col in (12, 13, 14, 15):
            ws.cell(total_row, col).number_format = "0.000"
            ws.cell(total_row, col).font = st["body_bold"]

    apply_widths(ws, {
        "A": 28, "B": 13, "C": 13, "D": 18, "E": 32, "F": 22,
        "G": 10, "H": 25, "I": 11, "J": 11, "K": 11, "L": 8,
        "M": 18, "N": 18, "O": 16, "P": 16, "Q": 24, "R": 16,
        "S": 24, "T": 24, "U": 32, "V": 24,
    })
    ws.freeze_panes = "A4"
    ws.auto_filter.ref = f"A3:V{max(row - 1, 3)}"


# ============================================================
# SHEET 5: CẢNH BÁO
# ============================================================

def create_warning_sheet(wb: Workbook, records: list[dict]) -> None:
    ws = wb.create_sheet("CANH_BAO")
    ws.sheet_view.showGridLines = False
    st = create_styles()

    ws.merge_cells("A1:J1")
    ws["A1"] = "CẢNH BÁO / KIỂM TRA OCR"
    ws["A1"].font = st["title"]
    ws["A1"].alignment = st["center"]

    headers = [
        "File", "Ngày", "Ngày xe", "Số xe", "STT dòng",
        "Kích thước", "Khối lượng ghi", "Khối lượng tính",
        "Chênh lệch", "Trạng thái",
    ]

    for col, value in enumerate(headers, 1):
        c = ws.cell(3, col, value)
        c.font = st["header"]
        c.fill = st["sub_fill"]
        c.alignment = st["center"]
        c.border = st["border"]

    row = 4
    for record in records:
        for item in record["norm_items"]:
            if item["status"] == "OK":
                continue

            values = [
                record["file"],
                item["ngay_date"] or item["ngay"],
                parse_date(record["ngay_xe"]) or record["ngay_xe"],
                record["so_xe"],
                item["dong"],
                item["raw"],
                item["written"],
                item["calculated"],
                item["difference"],
                item["status"],
            ]

            for col, value in enumerate(values, 1):
                c = ws.cell(row, col, value)
                c.font = st["body"]
                c.alignment = st["left"] if col in (1, 6) else st["center"]
                c.border = st["border"]

            for col in (7, 8, 9):
                ws.cell(row, col).number_format = "0.000"

            row += 1

    if row == 4:
        ws.cell(4, 1, "Không có dòng vượt ngưỡng kiểm tra.")
        ws.cell(4, 1).font = st["body_bold"]
        ws.cell(4, 1).alignment = st["left"]

    apply_widths(ws, {
        "A": 30, "B": 13, "C": 13, "D": 18, "E": 11,
        "F": 28, "G": 18, "H": 18, "I": 18, "J": 18,
    })
    ws.freeze_panes = "A4"
    ws.auto_filter.ref = f"A3:J{max(row - 1, 3)}"


# ============================================================
# TẠO EXCEL
# ============================================================

def create_batch_excel(json_paths: list[Path]) -> Path:
    records: list[dict] = []

    for json_path in json_paths:
        try:
            data = read_json(json_path)
            records.append(data)
        except Exception as e:
            print(f"[CANH BAO] {json_path.name}: {e}")

    if not records:
        raise ValueError("Không có JSON hợp lệ để tạo Excel.")

    enrich_records(records)

    wb = Workbook()
    create_main_sheet(wb, records)
    create_daily_summary_sheet(wb, records)
    create_summary_sheet(wb, records)
    create_detail_sheet(wb, records)
    create_warning_sheet(wb, records)

    output = unique_path("NHAT_KY_XE_GO_BATCH")
    wb.save(output)
    return output


# ============================================================
# MAIN
# ============================================================

def main():
    json_paths: list[Path] = []

    if len(sys.argv) > 1:
        for argument in sys.argv[1:]:
            path = Path(argument)
            if not path.is_absolute():
                path = JSON_DIR / path
            if path.exists() and path.suffix.lower() == ".json":
                json_paths.append(path)
    else:
        json_paths = sorted(JSON_DIR.glob("*.json"))

    if not json_paths:
        print("[LOI] Không tìm thấy JSON.")
        print("Ví dụ:")
        print(r".\.venv\Scripts\python.exe .\json_to_excel_batch.py mau_01_v51.json mau_02_v51.json")
        return

    print(f"Đang xử lý {len(json_paths)} JSON...")
    output = create_batch_excel(json_paths)
    print()
    print("[OK] Đã tạo Excel:")
    print(output)


if __name__ == "__main__":
    main()