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
    # Giữ lại các trường V5.1 để tương thích dữ liệu cũ.
    ngay_nhap: str = ""
    ngay_xe: str = ""
    so_xe: str = ""
    kich_thuoc_go_tron: str = ""
    khoi_luong_go_tron: str = ""
    kich_thuoc_xe: str = ""


class RoundWood(BaseModel):
    """
    Thông tin gỗ tròn được tách riêng để Excel có thể map trực tiếp
    theo mẫu sổ nhật ký.
    """
    so: str = ""
    ky_hieu: str = ""

    kt_mua_vao_dai: str = ""
    kt_mua_vao_vanh: str = ""

    kt_do_thuc_te_dai: str = ""
    kt_do_thuc_te_vanh: str = ""

    khoi_luong: str = ""
    don_gia: str = ""
    thanh_tien: str = ""


class Item(BaseModel):
    dong: int = Field(
        description="Số dòng dữ liệu thực tế trong bảng, bắt đầu từ 1"
    )

    ngay: str = ""

    # Giữ nguyên chuỗi gốc nhìn thấy trên giấy.
    kich_thuoc_so_luong: str = ""

    # Tách cấu trúc để Excel không phải tự parse lại.
    rong: str = ""
    cao: str = ""
    dai: str = ""
    so_luong: str = ""

    khoi_luong: str = ""

    cong_trinh: str = ""

    stt_cau_kien: str = ""

    ten_cau_kien: str = ""

    nha_cung_cap: str = ""

    ghi_chu: str = ""


class DateEvent(BaseModel):
    ngay: str = ""

    dong_bat_dau: int | None = None

    dong_ket_thuc: int | None = None

    do_tin_cay: str = ""

    vi_tri: str = ""


class Document(BaseModel):
    schema_version: str = "1.1"

    document_type: str = ""

    header: Header

    round_wood: RoundWood = Field(
        default_factory=RoundWood
    )

    items: List[Item] = Field(
        default_factory=list
    )

    date_events: List[DateEvent] = Field(
        default_factory=list
    )


# ============================================================
# 4. PROMPT DUY NHẤT
# ============================================================

OCR_PROMPT = r"""
Bạn là hệ thống OCR chuyên nghiệp đọc biểu mẫu tiếng Việt viết tay.

Ảnh đã được xoay đúng chiều.

Nhiệm vụ duy nhất:
Đọc toàn bộ biểu mẫu và trả về JSON đúng schema.

Đây là phiếu dạng:
"NHẬT KÝ XE GỖ TẠI / THÔNG TIN GỖ THÀNH KHÍ"

============================================================
PHẦN 1 - THÔNG TIN CHUNG
============================================================

Đọc chính xác nếu nhìn thấy:
- document_type
- header.ngay_nhap
- header.ngay_xe
- header.so_xe
- header.kich_thuoc_go_tron
- header.khoi_luong_go_tron
- header.kich_thuoc_xe

QUY TẮC:
1. so_xe chỉ chứa nội dung biển/số xe nhìn thấy.
2. Tuyệt đối không nối ngày vào so_xe.
3. Không tự đổi chữ I thành số 1.
4. Không tự đổi số 1 thành chữ I.
5. Không lấy ngày trong bảng thành header.ngay_xe.
6. header.ngay_nhap chỉ lấy nếu có bằng chứng rõ ràng ở phần "Ngày nhập".
7. Nếu không đọc chắc thì để trống.
8. Không tự sửa dữ liệu theo suy đoán.

============================================================
PHẦN 2 - THÔNG TIN GỖ TRÒN
============================================================

Tách thông tin gỗ tròn vào object:

round_wood = {
  "so": "",
  "ky_hieu": "",
  "kt_mua_vao_dai": "",
  "kt_mua_vao_vanh": "",
  "kt_do_thuc_te_dai": "",
  "kt_do_thuc_te_vanh": "",
  "khoi_luong": "",
  "don_gia": "",
  "thanh_tien": ""
}

QUY TẮC:
1. Chỉ điền trường nào thực sự nhìn thấy trên ảnh.
2. Không suy diễn số, ký hiệu, đơn giá hoặc thành tiền.
3. Nếu phần gỗ tròn chỉ nhìn thấy dưới dạng chuỗi như
   "7,6 - V247" hoặc "đo TT: 7.65 - V247",
   đồng thời giữ nguyên toàn bộ nội dung đó trong:
   header.kich_thuoc_go_tron
   và tách riêng vào các trường round_wood chỉ khi xác định rõ.
4. "Số" gỗ tròn phải là số trên cột gỗ tròn, không phải số xe.
5. "Ký hiệu" giữ nguyên ký tự nhìn thấy.
6. Không tự đổi dấu phẩy thành dấu chấm trong dữ liệu OCR.
7. Không tự tính thành tiền nếu trên giấy không có đơn giá/thành tiền.
8. Không lấy kích thước của gỗ thành khí đưa vào round_wood.

============================================================
PHẦN 3 - BẢNG GỖ THÀNH KHÍ
============================================================

Chỉ tạo item cho những dòng thực sự có dữ liệu.

Mỗi item gồm:
- dong
- ngay
- kich_thuoc_so_luong
- rong
- cao
- dai
- so_luong
- khoi_luong
- cong_trinh
- stt_cau_kien
- ten_cau_kien
- nha_cung_cap
- ghi_chu

"kich_thuoc_so_luong" phải giữ nguyên chuỗi nhìn thấy, ví dụ:
11 x 11 x 335 = 12
11 x 11 x 305 = 1
28 x 28 x 250 = 1

Nếu có thể xác định rõ từ cùng chuỗi, tách thêm:
- rong
- cao
- dai
- so_luong

Theo thứ tự trên biểu mẫu:
Rộng x Cao x Dài = SL.

Nếu không chắc một giá trị thì để chuỗi rỗng, nhưng vẫn giữ
nguyên chuỗi trong kich_thuoc_so_luong.

============================================================
PHẦN 4 - NGÀY TRONG BẢNG
============================================================

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

Nếu thấy ngày nhưng không chắc dòng nào:
dong_bat_dau = null
dong_ket_thuc = null

Không đoán.

============================================================
PHẦN 5 - KHỐI LƯỢNG
============================================================

Đọc nguyên giá trị trên giấy.

Ví dụ:
0,486
0,037
0,196
0,180
0,165

Không tự sửa.

============================================================
PHẦN 6 - CÔNG TRÌNH / CẤU KIỆN / NHÀ CUNG CẤP
============================================================

- cong_trinh: giữ gần với chữ thực tế nhất.
- stt_cau_kien: để riêng số STT cấu kiện.
- ten_cau_kien: tên cấu kiện.
- nha_cung_cap: chỉ điền khi có thông tin nhà cung cấp trên ảnh.
- ghi_chu: giữ ghi chú, bao gồm tổng m3 cuối ngày.

Không gộp stt_cau_kien vào ten_cau_kien.

============================================================
PHẦN 7 - TỔNG CUỐI NGÀY
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

Nếu chữ khó đọc:
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
- tự tính đơn giá
- tự tính thành tiền
- tự tạo nhà cung cấp

Nếu không nhìn thấy:
để chuỗi rỗng.

============================================================
PHẦN 10 - KIỂM TRA NỘI BỘ
============================================================

Sau khi đọc toàn bộ bảng, hãy kiểm tra:
- số dòng thực tế
- tất cả các ngày trong bảng
- số xe
- thông tin gỗ tròn
- kích thước từng dòng
- số lượng từng dòng
- khối lượng từng dòng
- công trình
- STT cấu kiện
- tên cấu kiện
- nhà cung cấp
- ghi chú tổng m3

Trả JSON duy nhất theo schema.
Không trả lời bằng văn bản bên ngoài JSON.
"""



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
                    OCR_PROMPT,

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
    # V5.2 ưu tiên các trường đã được Gemini tách sẵn.
    structured = [
        item.rong,
        item.cao,
        item.dai,
        item.so_luong
    ]

    if all(str(value).strip() for value in structured):
        try:
            a = parse_number(item.rong)
            b = parse_number(item.cao)
            c = parse_number(item.dai)
            qty = parse_number(item.so_luong)

            if None not in (a, b, c, qty):
                return (
                    a * b * c * qty
                ) / 1_000_000
        except Exception:
            pass

    # Fallback: parse chuỗi cũ để tương thích V5.1.
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

    # Thiếu số xe
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
            "1.1",

        "source": {

            "file":
                image_path.name,

            "model":
                MODEL,

            "rotation_degrees":
                ROTATE_DEGREES,

            "ocr_version":
                "5.2"
        },

        "document_type":
            document.document_type,

        "header":
            document.header.model_dump(),

        "round_wood":
            document.round_wood.model_dump(),

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
        / f"{image_path.stem}_v52.json"
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
            / f"{image_path.stem}_rotated_v52.jpg"
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
        f"JSON V5.2: {output_json}"
    )

    # --------------------------------------------------------
    # Tóm tắt
    # --------------------------------------------------------

    print()
    print(
        "------ KẾT QUẢ ------"
    )

    print(
        "Số xe:",
        document.header.so_xe
    )

    print(
        "Ngày nhập:",
        document.header.ngay_nhap
    )

    print(
        "Ngày xe:",
        document.header.ngay_xe
    )

    print(
        "Gỗ tròn - Số:",
        document.round_wood.so
    )

    print(
        "Gỗ tròn - Ký hiệu:",
        document.round_wood.ky_hieu
    )

    print(
        "Gỗ tròn - Khối lượng:",
        document.round_wood.khoi_luong
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
            f" | NCC={item.nha_cung_cap}"
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
    print("OCR V5.2 - TEST MAU_01")
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
        "OCR V5.2"
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