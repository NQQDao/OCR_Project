import os
import io
import json
import re
import time
from pathlib import Path
from typing import List

from PIL import Image, ImageOps, ImageEnhance, ImageFilter
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

from abbreviation_manager import abbreviation_mgr


# ============================================================
# OCR V5.1
# ẢNH -> JSON
#
# Mục tiêu:
#   - 1 ảnh chỉ gọi Gemini 1 lần
#   - Không retry khi 429 quota
#   - Có retry khi lỗi server tạm thời
#   - Python tự kiểm tra khối lượng
#   - JSON chuẩn hóa cho bước Excel sau này
# ============================================================


# ============================================================
# 1. CẤU HÌNH
# ============================================================

MODEL = "gemini-3.6-flash"

BASE_DIR = Path(__file__).resolve().parent

IMAGE_DIR = BASE_DIR / "images"
OUTPUT_DIR = BASE_DIR / "output"

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)

# Ảnh mẫu của bạn đang nằm ngang.
# Nếu bộ ảnh sau này đã đúng chiều thì đổi thành 0.
ROTATE_DEGREES = 90

# Chất lượng ảnh gửi Gemini
JPEG_QUALITY = 95

# Số lần retry cho lỗi server tạm thời
MAX_RETRIES = 4

# Thời gian chờ cơ bản
RETRY_DELAY = 3

# Nếu True:
# đã có mau_01_v51.json thì bỏ qua mau_01
SKIP_EXISTING = True

# Lưu ảnh đã xoay để kiểm tra
SAVE_DEBUG_IMAGE = True


# ============================================================
# 2. API KEY
# ============================================================

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise RuntimeError(
        "\n"
        "KHÔNG TÌM THẤY GEMINI_API_KEY.\n"
        "Kiểm tra biến môi trường GEMINI_API_KEY trên Windows.\n"
    )

client = genai.Client(
    api_key=API_KEY
)


# ============================================================
# 3. SCHEMA JSON
# ============================================================

class Header(BaseModel):
    ngay_xe: str = ""
    so_xe: str = ""
    kich_thuoc_go_tron: str = ""
    khoi_luong_go_tron: str = ""
    kich_thuoc_xe: str = ""


class Item(BaseModel):
    dong: int = Field(
        description="Số dòng dữ liệu thực tế trong bảng, bắt đầu từ 1"
    )

    ngay: str = ""

    kich_thuoc_so_luong: str = ""

    khoi_luong: str = ""

    cong_trinh: str = ""

    stt_cau_kien: str = ""

    ten_cau_kien: str = ""

    ghi_chu: str = ""


class DateEvent(BaseModel):
    ngay: str = ""

    dong_bat_dau: int | None = None

    dong_ket_thuc: int | None = None

    do_tin_cay: str = ""

    vi_tri: str = ""


class Document(BaseModel):
    schema_version: str = "1.0"

    document_type: str = ""

    header: Header

    items: List[Item] = Field(
        default_factory=list
    )

    date_events: List[DateEvent] = Field(
        default_factory=list
    )


# ============================================================
# 4. PROMPT DUY NHẤT
# ============================================================

BASE_OCR_PROMPT = r"""
Bạn là hệ thống OCR chuyên nghiệp đọc biểu mẫu tiếng Việt viết tay.

Ảnh đã được xoay đúng chiều.

Nhiệm vụ duy nhất:
Đọc toàn bộ biểu mẫu và trả về JSON đúng schema.

Đây là phiếu dạng:
"NHẬT KÝ XE GỖ TẠI / THÔNG TIN GỖ THÀNH KHÍ"

============================================================
PHẦN 1 - HEADER
============================================================

Đọc chính xác:

- document_type
- ngay_xe
- so_xe
- kich_thuoc_go_tron
- khoi_luong_go_tron
- kich_thuoc_xe

QUY TẮC:

1. so_xe chỉ chứa số xẻ.
2. Tuyệt đối không nối ngày vào so_xe.
3. Không tự đổi chữ I thành số 1.
4. Không tự đổi số 1 thành chữ I.
5. Không lấy ngày trong bảng làm ngay_xe.
6. Nếu không đọc chắc thì để trống.
7. Không tự sửa dữ liệu theo suy đoán.

============================================================
PHẦN 2 - BẢNG DỮ LIỆU
============================================================

Chỉ tạo item cho những dòng thực sự có dữ liệu.

Mỗi item gồm:

- dong
- ngay
- kich_thuoc_so_luong
- khoi_luong
- cong_trinh
- stt_cau_kien
- ten_cau_kien
- ghi_chu

dong phải là số dòng dữ liệu thực tế:
1, 2, 3, 4, 5...

Không dùng số thứ tự in sẵn của biểu mẫu làm dong.

============================================================
PHẦN 3 - NGÀY TRONG BẢNG
============================================================

Đây là phần đặc biệt quan trọng.

Trong bảng có cột ngày.

Ngày có thể được viết một lần rồi áp dụng cho một nhóm dòng.

Ví dụ:

Dòng 1: 6/9/2026
Dòng 2: không viết ngày
Dòng 3: 7/9/2026

Không được tự động điền 6/9/2026 cho dòng 2 nếu
không có bằng chứng rõ ràng.

Bạn phải cố gắng tìm TẤT CẢ ngày được viết trong bảng.

Mỗi ngày tìm được phải đưa thêm vào date_events.

Ví dụ:

{
  "ngay": "7/9/2026",
  "dong_bat_dau": 3,
  "dong_ket_thuc": 5,
  "do_tin_cay": "high",
  "vi_tri": "cột ngày trong bảng, cạnh dòng 3"
}

Nếu thấy ngày nhưng không chắc dòng nào thì:

dong_bat_dau = null
dong_ket_thuc = null

Không đoán.

============================================================
PHẦN 4 - KÍCH THƯỚC
============================================================

Giữ nguyên nội dung nhìn thấy.

Ví dụ:

11 x 11 x 335 = 12

11 x 11 x 305 = 1

28 x 28 x 250 = 1

6 x 40 x 250 = 3

6 x 55 x 250 = 2

Không làm tròn kích thước.

============================================================
PHẦN 5 - KHỐI LƯỢNG
============================================================

Đọc nguyên giá trị trên giấy:

0,486
0,037
0,196
0,180
0,165

Không tự sửa.

============================================================
PHẦN 6 - STT CẤU KIỆN
============================================================

STT cấu kiện phải nằm riêng trong:

stt_cau_kien

Không gộp với ten_cau_kien.

============================================================
PHẦN 7 - GHI CHÚ
============================================================

Các tổng kết cuối ngày như:

0,523 m3
0,541 m3

phải giữ trong ghi_chu.

Không biến tổng cuối ngày thành một dòng vật liệu mới.

============================================================
PHẦN 8 - CHỮ VIẾT TAY
============================================================

Đọc gần với chữ thực tế nhất.

Không tự sửa thành từ "đẹp" hoặc từ quen thuộc.

Ví dụ nếu chữ khó đọc:
giữ nguyên cách đọc gần nhất.

Không bịa.

============================================================
PHẦN 9 - TUYỆT ĐỐI KHÔNG SUY DIỄN
============================================================

Không:
- tự điền ngày bị thiếu
- tự sửa biển số
- tự nối các trường
- tự thêm cấu kiện
- tự thêm số lượng
- tự thêm STT
- tự sửa khối lượng

Nếu không nhìn thấy:
để chuỗi rỗng.

============================================================
PHẦN 10 - KIỂM TRA NỘI BỘ
============================================================

Sau khi đọc toàn bộ bảng, hãy kiểm tra:

- số dòng thực tế
- tất cả các ngày trong bảng
- số xẻ
- kích thước
- khối lượng
- ghi chú tổng m3

Trả JSON duy nhất theo schema.
Không trả lời bằng văn bản bên ngoài JSON.
"""


def get_ocr_prompt() -> str:
    """Ghép nối prompt cơ bản với bộ từ điển huấn luyện chữ viết tắt và quy tắc tùy chỉnh mới nhất."""
    dict_context = abbreviation_mgr.get_effective_prompt_context()
    if dict_context:
        return f"{BASE_OCR_PROMPT}\n\n{dict_context}"
    return BASE_OCR_PROMPT



OCR_PROMPT = get_ocr_prompt()


# ============================================================
# 5. XỬ LÝ ẢNH
# ============================================================

def load_image(image_path: Path) -> Image.Image:

    image = Image.open(
        image_path
    )

    image = ImageOps.exif_transpose(
        image
    )

    if ROTATE_DEGREES != 0:

        image = image.rotate(
            ROTATE_DEGREES,
            expand=True
        )

    if image.mode != "RGB":

        image = image.convert(
            "RGB"
        )

    return image


def image_to_bytes(
    image: Image.Image
) -> bytes:

    buffer = io.BytesIO()

    image.save(
        buffer,
        format="JPEG",
        quality=JPEG_QUALITY,
        optimize=True
    )

    return buffer.getvalue()


# ============================================================
# 6. GEMINI
# ============================================================

def call_gemini(
    image: Image.Image
):

    image_bytes = image_to_bytes(
        image
    )

    last_error = None

    for attempt in range(
        1,
        MAX_RETRIES + 1
    ):

        try:

            response = client.models.generate_content(
                model=MODEL,

                contents=[
                    get_ocr_prompt(),

                    types.Part.from_bytes(
                        data=image_bytes,
                        mime_type="image/jpeg"
                    )
                ],

                config=types.GenerateContentConfig(

                    response_mime_type="application/json",

                    response_schema=Document,

                    temperature=0
                )
            )

            return response

        except Exception as e:

            last_error = e

            error_text = str(e).lower()

            # =================================================
            # 429 = QUOTA
            #
            # KHÔNG retry
            # =================================================

            if (
                "429" in error_text
                or "resource_exhausted" in error_text
                or "quota" in error_text
            ):

                raise RuntimeError(
                    "QUOTA_429\n"
                    + str(e)
                )

            # =================================================
            # 5xx = SERVER TEMPORARY ERROR
            # =================================================

            retryable = any(
                x in error_text
                for x in [
                    "500",
                    "502",
                    "503",
                    "504",
                    "unavailable",
                    "overloaded",
                    "deadline"
                ]
            )

            if not retryable:

                raise

            if attempt >= MAX_RETRIES:

                break

            wait_seconds = (
                RETRY_DELAY * attempt
            )

            print(
                f"      Gemini lỗi tạm thời "
                f"(lần {attempt}/{MAX_RETRIES})"
            )

            print(
                f"      Chờ {wait_seconds}s..."
            )

            time.sleep(
                wait_seconds
            )

    raise RuntimeError(
        "GEMINI_TEMP_ERROR\n"
        f"Sau {MAX_RETRIES} lần thử.\n"
        f"{last_error}"
    )


# ============================================================
# 7. PARSE JSON
# ============================================================

def parse_response(
    response
) -> Document:

    text = response.text

    if not text:

        raise RuntimeError(
            "Gemini trả về dữ liệu rỗng."
        )

    try:

        data = json.loads(
            text
        )

    except Exception as e:

        raise RuntimeError(
            "Không đọc được JSON từ Gemini.\n"
            f"Response:\n{text}"
        ) from e

    return Document.model_validate(
        data
    )


# ============================================================
# 8. CHUẨN HÓA NGÀY
# ============================================================

def clean_date(
    date_text: str
) -> str:

    if not date_text:
        return ""

    return date_text.strip()


def apply_verified_dates(
    document: Document
):

    # Xóa khoảng trắng
    for item in document.items:

        item.ngay = clean_date(
            item.ngay
        )

    # Áp dụng ngày mà AI xác định rõ
    for event in document.date_events:

        ngay = clean_date(
            event.ngay
        )

        if not ngay:
            continue

        start = event.dong_bat_dau

        end = event.dong_ket_thuc

        # Không có dòng bắt đầu -> không tự đoán
        if start is None:
            continue

        if end is None:

            end = len(
                document.items
            )

        for item in document.items:

            if (
                start
                <= item.dong
                <= end
            ):

                item.ngay = ngay

    return document


# ============================================================
# 9. TÍNH KHỐI LƯỢNG
# ============================================================

def parse_number(
    value: str
):

    if not value:
        return None

    value = value.strip()
    value = value.replace(
        " ",
        ""
    )

    # 0,486 -> 0.486
    if (
        "," in value
        and "." not in value
    ):

        value = value.replace(
            ",",
            "."
        )

    try:

        return float(
            value
        )

    except Exception:

        return None


def parse_dimensions(
    text: str
):

    if not text:
        return None

    s = text.lower()

    s = s.replace(
        "×",
        "x"
    )

    s = s.replace(
        "*",
        "x"
    )

    numbers = re.findall(
        r"\d+(?:[.,]\d+)?",
        s
    )

    if len(numbers) < 4:

        return None

    try:

        a = float(
            numbers[0].replace(
                ",",
                "."
            )
        )

        b = float(
            numbers[1].replace(
                ",",
                "."
            )
        )

        c = float(
            numbers[2].replace(
                ",",
                "."
            )
        )

        qty = float(
            numbers[3].replace(
                ",",
                "."
            )
        )

        return (
            a,
            b,
            c,
            qty
        )

    except Exception:

        return None


def calculate_volume(
    item: Item
):

    parsed = parse_dimensions(
        item.kich_thuoc_so_luong
    )

    if not parsed:
        return None

    a, b, c, qty = parsed

    return (
        a * b * c * qty
    ) / 1_000_000


# ============================================================
# 10. VALIDATE TỪNG DÒNG
# ============================================================

def validate_items(
    items: List[Item]
):

    results = []

    for item in items:

        calculated = calculate_volume(
            item
        )

        written = parse_number(
            item.khoi_luong
        )

        if (
            calculated is None
            and written is None
        ):

            status = "KHONG_CO_DU_LIEU"

        elif calculated is None:

            status = "KHONG_TINH_DUOC"

        elif written is None:

            status = "THIEU_KHOI_LUONG"

        else:

            difference = abs(
                calculated
                - written
            )

            status = (
                "OK"
                if difference <= 0.002
                else "CANH_BAO"
            )

        results.append({

            "dong":
                item.dong,

            "ngay":
                item.ngay,

            "kich_thuoc_so_luong":
                item.kich_thuoc_so_luong,

            "khoi_luong_ghi":
                written,

            "khoi_luong_tinh":
                (
                    round(calculated, 3)
                    if calculated is not None
                    else None
                ),

            "chenh_lech":
                (
                    round(
                        abs(
                            calculated - written
                        ),
                        6
                    )
                    if (
                        calculated is not None
                        and written is not None
                    )
                    else None
                ),

            "trang_thai":
                status
        })

    return results


# ============================================================
# 11. LẤY TỔNG M3 GHI TRÊN GIẤY
# ============================================================

def extract_daily_totals(
    items: List[Item]
):

    results = []

    for item in items:

        text = item.ghi_chu or ""

        matches = re.findall(
            r"(\d+[.,]\d+)\s*m3",
            text.lower()
        )

        for match in matches:

            try:

                value = float(
                    match.replace(
                        ",",
                        "."
                    )
                )

            except:

                continue

            results.append({

                "dong":
                    item.dong,

                "ngay":
                    item.ngay,

                "tong_m3_ghi_tren_giay":
                    value
            })

    return results


# ============================================================
# 12. TỔNG HỢP THEO NGÀY
# ============================================================

def calculate_daily_summary(
    items: List[Item]
):

    groups = {}

    for item in items:

        if not item.ngay:
            continue

        volume = calculate_volume(
            item
        )

        if volume is None:
            continue

        if item.ngay not in groups:

            groups[item.ngay] = {
                "so_dong": 0,
                "tong_m3": 0.0
            }

        groups[item.ngay][
            "so_dong"
        ] += 1

        groups[item.ngay][
            "tong_m3"
        ] += volume

    results = []

    for ngay, data in groups.items():

        results.append({

            "ngay":
                ngay,

            "so_dong":
                data["so_dong"],

            "tong_m3_tinh":
                round(
                    data["tong_m3"],
                    3
                )
        })

    return results


# ============================================================
# 13. SO SÁNH TỔNG NGÀY
# ============================================================

def validate_daily_totals(
    items: List[Item]
):

    calculated = {}

    for item in items:

        if not item.ngay:
            continue

        volume = calculate_volume(
            item
        )

        if volume is None:
            continue

        calculated.setdefault(
            item.ngay,
            0.0
        )

        calculated[
            item.ngay
        ] += volume

    written = extract_daily_totals(
        items
    )

    results = []

    for record in written:

        ngay = record["ngay"]

        total_written = (
            record[
                "tong_m3_ghi_tren_giay"
            ]
        )

        total_calculated = (
            calculated.get(
                ngay
            )
        )

        if total_calculated is None:

            results.append({

                "ngay":
                    ngay,

                "tong_ghi_tren_giay":
                    total_written,

                "tong_tinh":
                    None,

                "trang_thai":
                    "KHONG_CO_NHOM_NGAY"
            })

            continue

        difference = abs(
            total_calculated
            - total_written
        )

        status = (
            "OK"
            if difference <= 0.003
            else "CANH_BAO"
        )

        results.append({

            "ngay":
                ngay,

            "tong_ghi_tren_giay":
                round(
                    total_written,
                    3
                ),

            "tong_tinh":
                round(
                    total_calculated,
                    3
                ),

            "chenh_lech":
                round(
                    difference,
                    6
                ),

            "trang_thai":
                status
        })

    return results


# ============================================================
# 14. XÁC ĐỊNH CẢNH BÁO
# ============================================================

def build_warnings(
    document: Document,
    line_validation,
    daily_validation
):

    warnings = []

    # Thiếu số xẻ
    if not document.header.so_xe:

        warnings.append(
            "THIEU_SO_XE"
        )

    # Thiếu ngày xe
    if not document.header.ngay_xe:

        warnings.append(
            "THIEU_NGAY_XE"
        )

    # Dòng có lỗi khối lượng
    for row in line_validation:

        if row["trang_thai"] != "OK":

            warnings.append(
                f"DONG_{row['dong']}_"
                f"{row['trang_thai']}"
            )

    # Tổng ngày
    for row in daily_validation:

        if row["trang_thai"] != "OK":

            warnings.append(
                f"TONG_NGAY_"
                f"{row['ngay']}_"
                f"{row['trang_thai']}"
            )

    return warnings


# ============================================================
# 15. TẠO JSON CUỐI
# ============================================================

def build_final_json(
    image_path: Path,
    document: Document
):

    # Áp dụng date_events
    document = apply_verified_dates(
        document
    )

    line_validation = validate_items(
        document.items
    )

    daily_summary = (
        calculate_daily_summary(
            document.items
        )
    )

    daily_validation = (
        validate_daily_totals(
            document.items
        )
    )

    warnings = build_warnings(
        document,
        line_validation,
        daily_validation
    )

    result = {

        "schema_version":
            "1.0",

        "source": {

            "file":
                image_path.name,

            "model":
                MODEL,

            "rotation_degrees":
                ROTATE_DEGREES
        },

        "document_type":
            document.document_type,

        "header":
            document.header.model_dump(),

        "items": [

            item.model_dump()

            for item in document.items
        ],

        "date_events": [

            event.model_dump()

            for event in document.date_events
        ],

        "validation": {

            "line_volume":
                line_validation,

            "daily_summary":
                daily_summary,

            "daily_total_validation":
                daily_validation,

            "warnings":
                warnings
        }
    }

    return result


# ============================================================
# 16. XỬ LÝ 1 ẢNH
# ============================================================

def process_image(
    image_path: Path
):

    print()
    print(
        "=" * 70
    )

    print(
        f"ĐANG XỬ LÝ: "
        f"{image_path.name}"
    )

    print(
        "=" * 70
    )

    output_json = (
        OUTPUT_DIR
        / f"{image_path.stem}_v51.json"
    )

    # --------------------------------------------------------
    # Skip nếu đã có
    # --------------------------------------------------------

    if (
        SKIP_EXISTING
        and output_json.exists()
    ):

        print(
            "Đã có JSON -> bỏ qua."
        )

        return "SKIPPED"

    # --------------------------------------------------------
    # Chuẩn bị ảnh
    # --------------------------------------------------------

    print(
        "[1/3] Chuẩn bị ảnh..."
    )

    image = load_image(
        image_path
    )

    if SAVE_DEBUG_IMAGE:

        debug_path = (
            OUTPUT_DIR
            / f"{image_path.stem}_rotated_v51.jpg"
        )

        image.save(
            debug_path,
            quality=JPEG_QUALITY
        )

        print(
            f"      {debug_path}"
        )

    # --------------------------------------------------------
    # Gemini
    # --------------------------------------------------------

    print(
        "[2/3] Gemini OCR..."
    )

    try:

        response = call_gemini(
            image
        )

        document = parse_response(
            response
        )

    except RuntimeError as e:

        error_text = str(e)

        print()
        print(
            "!!! GEMINI ERROR !!!"
        )
        print(
            error_text
        )

        # ----------------------------------------------------
        # QUOTA 429
        # ----------------------------------------------------

        if error_text.startswith(
            "QUOTA_429"
        ):

            # Ghi lỗi
            error_file = (
                OUTPUT_DIR
                / f"{image_path.stem}_ERROR_429.txt"
            )

            with open(
                error_file,
                "w",
                encoding="utf-8"
            ) as f:

                f.write(
                    error_text
                )

            # Quan trọng:
            # quota project-wide nên dừng toàn bộ batch.
            raise RuntimeError(
                "DỪNG BATCH DO GEMINI 429 QUOTA.\n"
                "Không chạy tiếp các ảnh còn lại.\n"
                + error_text
            )

        # ----------------------------------------------------
        # lỗi khác
        # ----------------------------------------------------

        error_file = (
            OUTPUT_DIR
            / f"{image_path.stem}_ERROR.txt"
        )

        with open(
            error_file,
            "w",
            encoding="utf-8"
        ) as f:

            f.write(
                error_text
            )

        return "ERROR"

    # --------------------------------------------------------
    # Validation + JSON
    # --------------------------------------------------------

    print(
        "[3/3] Kiểm tra + ghi JSON..."
    )

    result = build_final_json(
        image_path,
        document
    )

    with open(
        output_json,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            result,
            f,
            ensure_ascii=False,
            indent=2
        )

    print()
    print(
        f"JSON: {output_json}"
    )

    # --------------------------------------------------------
    # Tóm tắt
    # --------------------------------------------------------

    print()
    print(
        "------ KẾT QUẢ ------"
    )

    print(
        "Số xẻ:",
        document.header.so_xe
    )

    print(
        "Ngày xẻ:",
        document.header.ngay_xe
    )

    print(
        "Số dòng:",
        len(document.items)
    )

    for item in document.items:

        print(

            f"  Dòng {item.dong}: "
            f"ngày="
            f"{item.ngay or '[trống]'} | "
            f"{item.kich_thuoc_so_luong} | "
            f"{item.khoi_luong} | "
            f"{item.ten_cau_kien}"
        )

    print()
    print(
        "Cảnh báo:"
    )

    warnings = result[
        "validation"
    ][
        "warnings"
    ]

    if warnings:

        for warning in warnings:

            print(
                "  -",
                warning
            )

    else:

        print(
            "  Không có cảnh báo."
        )

    return "SUCCESS"


# ============================================================
# 17. BATCH
# ============================================================

def main():

    IMAGE_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    image_path = IMAGE_DIR / "mau_01.jpg"

    if not image_path.exists():
        print(f"Không tìm thấy: {image_path}")
        return

    print("=" * 70)
    print("OCR V5.1 - TEST MAU_01")
    print("=" * 70)

    try:
        process_image(image_path)

    except Exception as e:
        print()
        print("LỖI:")
        print(e)

    if not images:

        print()
        print(
            "Không tìm thấy ảnh."
        )
        print(
            f"Thư mục: {IMAGE_DIR}"
        )

        return

    print()
    print(
        "=" * 70
    )

    print(
        "OCR V5.1"
    )

    print(
        "ẢNH -> JSON"
    )

    print(
        "=" * 70
    )

    print(
        f"Model: {MODEL}"
    )

    print(
        f"Số ảnh tìm thấy: "
        f"{len(images)}"
    )

    print(
        f"Xoay ảnh: "
        f"{ROTATE_DEGREES}°"
    )

    print(
        "Gemini request: "
        "1 ảnh = 1 request"
    )

    print(
        "=" * 70
    )

    success = 0
    skipped = 0
    failed = 0

    for index, image_path in enumerate(
        images,
        start=1
    ):

        print()
        print(
            f"[{index}/{len(images)}]"
        )

        try:

            status = process_image(
                image_path
            )

            if status == "SUCCESS":

                success += 1

            elif status == "SKIPPED":

                skipped += 1

            else:

                failed += 1

        except RuntimeError as e:

            # QUOTA -> dừng toàn bộ
            print()
            print(
                "=" * 70
            )

            print(
                "BATCH ĐÃ DỪNG"
            )

            print(
                str(e)
            )

            print(
                "=" * 70
            )

            break

    print()
    print(
        "=" * 70
    )

    print(
        "KẾT THÚC"
    )

    print(
        "=" * 70
    )

    print(
        f"Thành công: {success}"
    )

    print(
        f"Bỏ qua: {skipped}"
    )

    print(
        f"Lỗi: {failed}"
    )

    print()
    print(
        f"JSON nằm tại:"
    )

    print(
        OUTPUT_DIR
    )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()
