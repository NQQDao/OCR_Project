import json
import sys
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

# ============================================================
# CẤU HÌNH
# ============================================================

BASE_DIR = Path(r"D:\workspace\OCR_Project")

OUTPUT_DIR = BASE_DIR / "output"
UPLOAD_DIR = BASE_DIR / "web_uploads"

TEMPLATE_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

app = FastAPI(
    title="OCR Project",
    version="1.0"
)

app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static"
)


# ============================================================
# TRANG CHÍNH
# ============================================================

@app.get("/", response_class=HTMLResponse)
def home():

    html_file = TEMPLATE_DIR / "index.html"

    if not html_file.exists():
        raise HTTPException(
            status_code=500,
            detail="Không tìm thấy templates/index.html"
        )

    return html_file.read_text(
        encoding="utf-8"
    )


# ============================================================
# OCR ẢNH
# ============================================================

@app.post("/api/ocr")
async def run_ocr(
    file: UploadFile = File(...)
):

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Chưa chọn ảnh."
        )

    # Chặn đường dẫn lạ
    filename = Path(
        file.filename
    ).name

    allowed = {
        ".jpg",
        ".jpeg",
        ".png",
        ".JPG",
        ".JPEG",
        ".PNG"
    }

    if Path(filename).suffix not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Chỉ hỗ trợ JPG, JPEG, PNG."
        )

    upload_path = (
        UPLOAD_DIR / filename
    )

    content = await file.read()

    upload_path.write_bytes(
        content
    )

    # Import OCR tại thời điểm chạy
    # để lỗi OCR không làm website không khởi động.
    try:

        import ocr

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Không import được ocr.py: {e}"
        )

    try:

        result = ocr.process_image(
            upload_path
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"OCR thất bại: {e}"
        )

    # Tìm JSON tương ứng
    json_path = (
        OUTPUT_DIR
        / f"{upload_path.stem}_v51.json"
    )

    if not json_path.exists():

        # Một số version có thể tạo tên khác
        candidates = list(
            OUTPUT_DIR.glob(
                f"{upload_path.stem}*.json"
            )
        )

        if candidates:
            json_path = candidates[0]

    if not json_path.exists():

        raise HTTPException(
            status_code=500,
            detail="OCR chạy xong nhưng không tìm thấy JSON."
        )

    return {
        "status": "success",
        "file": filename,
        "json_file": json_path.name
    }


# ============================================================
# ĐỌC JSON
# ============================================================

@app.get("/api/json/{filename}")
def read_json(filename: str):

    filename = Path(
        filename
    ).name

    json_path = OUTPUT_DIR / filename

    if not json_path.exists():

        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy JSON."
        )

    try:

        data = json.loads(
            json_path.read_text(
                encoding="utf-8"
            )
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"JSON lỗi: {e}"
        )

    return data


# ============================================================
# LƯU JSON ĐÃ SỬA
# ============================================================

@app.put("/api/json/{filename}")
async def save_json(
    filename: str,
    data: dict
):

    filename = Path(
        filename
    ).name

    json_path = OUTPUT_DIR / filename

    if not json_path.exists():

        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy JSON."
        )

    try:

        json_path.write_text(
            json.dumps(
                data,
                ensure_ascii=False,
                indent=2
            ),
            encoding="utf-8"
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Không lưu được JSON: {e}"
        )

    return {
        "status": "saved",
        "file": filename
    }


# ============================================================
# XUẤT EXCEL
# ============================================================

@app.get("/api/excel")
def export_excel():

    try:

        import json_to_excel

        json_to_excel.main()

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Không tạo được Excel: {e}"
        )

    excel_path = (
        OUTPUT_DIR
        / "KET_QUA_OCR.xlsx"
    )

    if not excel_path.exists():

        raise HTTPException(
            status_code=500,
            detail="Không tìm thấy file Excel."
        )

    return FileResponse(
        excel_path,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        filename="KET_QUA_OCR.xlsx"
    )