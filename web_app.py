import subprocess
import json
import sys
from pathlib import Path
from unittest import result

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from abbreviation_manager import abbreviation_mgr
from database import SessionLocal, is_db_connected
from crud import (
    create_or_update_document,
    get_documents,
    get_document_by_id,
    get_document_by_file_name,
    delete_document
)
from init_db import init_database

# ============================================================
# CẤU HÌNH
# ============================================================
BASE_DIR = Path(__file__).resolve().parent

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


@app.on_event("startup")
def startup_event():
    """Khởi tạo database khi server bật (nếu có kết nối)."""
    if is_db_connected():
        try:
            init_database()
            print("[DB] Khởi tạo kết nối PostgreSQL thành công!")
        except Exception as e:
            print(f"[DB Warning] Không thể khởi tạo database: {e}")
    else:
        print("[DB Info] Chưa kết nối được PostgreSQL. Hệ thống tiếp tục chạy với tệp JSON cục bộ.")


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

    # Tự động đồng bộ vào PostgreSQL nếu có kết nối
    if is_db_connected():
        try:
            db = SessionLocal()
            json_data = json.loads(json_path.read_text(encoding="utf-8"))
            create_or_update_document(db, json_data, json_path.name, filename)
            db.close()
        except Exception as db_err:
            print(f"[DB Sync Error] {db_err}")

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

    # Tự động cập nhật PostgreSQL
    if is_db_connected():
        try:
            db = SessionLocal()
            create_or_update_document(db, data, filename)
            db.close()
        except Exception as db_err:
            print(f"[DB Save Error] {db_err}")

    return {
        "status": "saved",
        "file": filename
    }


# ============================================================
# XUẤT EXCEL TỪ 1 FILE JSON
# ============================================================

@app.get("/api/excel")
def export_excel(json_file: str):

    json_file = Path(json_file).name
    json_path = OUTPUT_DIR / json_file

    if not json_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Không tìm thấy JSON: {json_file}"
        )

    if json_path.suffix.lower() != ".json":
        raise HTTPException(
            status_code=400,
            detail="File được chọn không phải JSON."
        )

    excel_dir = BASE_DIR / "excel_exports"
    excel_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Chạy chính file json_to_excel.py bằng Python
        result = subprocess.run(
            [
                sys.executable,
                str(BASE_DIR / "json_to_excel_batch.py"),
                json_file
            ],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace"
        )

        if result.returncode != 0:
            raise RuntimeError(
                result.stderr or result.stdout or "json_to_excel.py bị lỗi."
            )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Không tạo được Excel: {e}"
        )

    # Tìm file Excel mới nhất có cùng tên JSON
    excel_files = sorted(
        excel_dir.glob(f"{json_path.stem}*.xlsx"),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )

    if not excel_files:
        raise HTTPException(
            status_code=500,
            detail=(
                "json_to_excel.py chạy xong nhưng "
                "không tìm thấy file Excel trong excel_exports."
            )
        )

    excel_path = excel_files[0]

    return FileResponse(
        excel_path,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        filename=excel_path.name
    )
# ============================================================
# XUẤT EXCEL TỔNG HỢP NHIỀU JSON
# ============================================================

@app.post("/api/excel/batch")
async def export_excel_batch(data: dict):

    print()
    print("========================================")
    print("===== API EXCEL BATCH =====")
    print("========================================")

    json_files = data.get("json_files", [])

    print("JSON nhận từ website:", json_files)
    print("Số JSON nhận được:", len(json_files))

    if not isinstance(json_files, list) or not json_files:
        raise HTTPException(
            status_code=400,
            detail="Chưa có danh sách JSON để xuất Excel."
        )

    json_paths = []

    for filename in json_files:

        if not isinstance(filename, str):
            continue

        filename = Path(filename).name

        if not filename.lower().endswith(".json"):
            continue

        json_path = OUTPUT_DIR / filename

        if json_path.exists() and json_path.is_file():

            json_paths.append(json_path)

            print(
                f"[OK] JSON hợp lệ: {json_path.name}"
            )

        else:

            print(
                f"[BO QUA] Không tìm thấy JSON: {filename}"
            )

    if not json_paths:

        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy JSON hợp lệ."
        )

    print()
    print("===== CHUẨN BỊ CREATE BATCH EXCEL =====")
    print("Số JSON hợp lệ:", len(json_paths))

    for path in json_paths:
        print(" -", path.name)

    try:

        import json_to_excel_batch

        print()
        print("===== GỌI CREATE_BATCH_EXCEL =====")

        excel_path = (
            json_to_excel_batch.create_batch_excel(
                json_paths
            )
        )

        print()
        print("===== CREATE BATCH EXCEL HOÀN TẤT =====")
        print("Excel vừa tạo:", excel_path)
        print("Excel tồn tại:", excel_path.exists())

    except Exception as e:

        print()
        print("===== LỖI CREATE BATCH EXCEL =====")
        print(str(e))

        raise HTTPException(
            status_code=500,
            detail=(
                "Không tạo được Excel tổng hợp: "
                + str(e)
            )
        )

    if not excel_path.exists():

        raise HTTPException(
            status_code=500,
            detail="Đã tạo Excel nhưng không tìm thấy file."
        )

    print()
    print("===== TRẢ FILE EXCEL VỀ WEBSITE =====")
    print("Tên file:", excel_path.name)
    print("Đường dẫn:", excel_path)

    return FileResponse(
        excel_path,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        filename=excel_path.name
    )
# ============================================================
# OCR HÀNG LOẠT
# ============================================================

@app.post("/api/ocr/batch")
async def run_ocr_batch(
    files: list[UploadFile] = File(...)
):

    if not files:
        raise HTTPException(
            status_code=400,
            detail="Chưa chọn ảnh."
        )

    allowed = {
        ".jpg",
        ".jpeg",
        ".png"
    }

    results = []

    try:
        import ocr
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Không import được ocr.py: {e}"
        )

    for file in files:

        if not file.filename:
            results.append({
                "status": "error",
                "file": "",
                "error": "Tên file không hợp lệ."
            })
            continue

        filename = Path(
            file.filename
        ).name

        suffix = Path(
            filename
        ).suffix.lower()

        if suffix not in allowed:
            results.append({
                "status": "error",
                "file": filename,
                "error": "Chỉ hỗ trợ JPG, JPEG, PNG."
            })
            continue

        upload_path = (
            UPLOAD_DIR / filename
        )

        try:

            content = await file.read()

            upload_path.write_bytes(
                content
            )

            # OCR từng ảnh
            ocr.process_image(
                upload_path
            )

            # Tìm JSON tương ứng
            json_path = (
                OUTPUT_DIR
                / f"{upload_path.stem}_v51.json"
            )

            if not json_path.exists():

                candidates = list(
                    OUTPUT_DIR.glob(
                        f"{upload_path.stem}*.json"
                    )
                )

                if candidates:
                    json_path = candidates[0]

            if not json_path.exists():

                results.append({
                    "status": "error",
                    "file": filename,
                    "error": (
                        "OCR chạy xong nhưng "
                        "không tìm thấy JSON."
                    )
                })

                continue

            # Tự động đồng bộ vào PostgreSQL nếu có kết nối
            if is_db_connected():
                try:
                    db = SessionLocal()
                    json_data = json.loads(json_path.read_text(encoding="utf-8"))
                    create_or_update_document(db, json_data, json_path.name, filename)
                    db.close()
                except Exception as db_err:
                    print(f"[DB Sync Error] {db_err}")

            results.append({
                "status": "success",
                "file": filename,
                "json_file": json_path.name
            })

        except Exception as e:

            results.append({
                "status": "error",
                "file": filename,
                "error": str(e)
            })

    success_count = sum(
        1
        for item in results
        if item["status"] == "success"
    )

    error_count = len(results) - success_count

    return {
        "status": "completed",
        "total": len(results),
        "success": success_count,
        "error": error_count,
        "results": results
    }
# ============================================================
# TỪ ĐIỂN CHỮ VIẾT TẮT & HUẤN LUYỆN PROMPT
# ============================================================

@app.get("/api/abbreviations")
def get_abbreviations(category: str = None, search: str = None):
    try:
        items = abbreviation_mgr.get_items(category=category, search=search)
        categories = abbreviation_mgr.get_categories()
        return {
            "status": "success",
            "categories": categories,
            "items": items,
            "total": len(items)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lấy từ điển: {e}")


@app.get("/api/abbreviations/prompt-preview")
def get_abbreviations_prompt_preview():
    try:
        prompt_text = abbreviation_mgr.get_prompt_context()
        return {
            "status": "success",
            "prompt_text": prompt_text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tạo prompt: {e}")


@app.post("/api/abbreviations")
async def save_abbreviation(item: dict):
    try:
        if not item.get("short"):
            raise HTTPException(status_code=400, detail="Từ viết tắt không được để trống.")

        saved_item = abbreviation_mgr.add_item(item)
        return {
            "status": "success",
            "message": "Đã lưu từ viết tắt thành công!",
            "item": saved_item
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lưu từ viết tắt: {e}")


@app.delete("/api/abbreviations/{item_id}")
def delete_abbreviation(item_id: str):
    try:
        deleted = abbreviation_mgr.delete_item(item_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Không tìm thấy mục cần xóa.")
        return {
            "status": "success",
            "message": "Đã xóa thành công!"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xóa từ viết tắt: {e}")


@app.post("/api/abbreviations/reset-defaults")
def reset_abbreviations_defaults():
    try:
        data = abbreviation_mgr.reset_to_defaults()
        return {
            "status": "success",
            "message": "Đã khôi phục từ điển mặc định ban đầu!",
            "total": len(data.get("items", []))
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khôi phục mặc định: {e}")


# ============================================================
# CƠ SỞ DỮ LIỆU POSTGRESQL API
# ============================================================

@app.get("/api/database/status")
def get_database_status():
    connected = is_db_connected()
    return {
        "status": "connected" if connected else "disconnected",
        "database": "PostgreSQL",
        "message": "Đã kết nối cơ sở dữ liệu PostgreSQL." if connected else "Chưa kết nối CSDL (đang lưu file JSON cục bộ)."
    }


@app.get("/api/documents")
def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: str = Query(None)
):
    if not is_db_connected():
        raise HTTPException(status_code=503, detail="Chưa kết nối tới cơ sở dữ liệu PostgreSQL.")
    db = SessionLocal()
    try:
        docs = get_documents(db, skip=skip, limit=limit, search=search)
        results = []
        for d in docs:
            results.append({
                "id": d.id,
                "file_name": d.file_name,
                "image_path": d.image_path,
                "so_xe": d.so_xe,
                "ngay_xe": d.ngay_xe,
                "kich_thuoc_go_tron": d.kich_thuoc_go_tron,
                "total_items": len(d.items),
                "created_at": d.created_at.isoformat() if d.created_at else None
            })
        return {
            "status": "success",
            "total": len(results),
            "documents": results
        }
    finally:
        db.close()


@app.get("/api/documents/{doc_id}")
def get_document_detail(doc_id: int):
    if not is_db_connected():
        raise HTTPException(status_code=503, detail="Chưa kết nối tới cơ sở dữ liệu PostgreSQL.")
    db = SessionLocal()
    try:
        doc = get_document_by_id(db, doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu trong CSDL.")
        return {
            "status": "success",
            "document": {
                "id": doc.id,
                "file_name": doc.file_name,
                "image_path": doc.image_path,
                "so_xe": doc.so_xe,
                "ngay_xe": doc.ngay_xe,
                "kich_thuoc_go_tron": doc.kich_thuoc_go_tron,
                "khoi_luong_go_tron": doc.khoi_luong_go_tron,
                "kich_thuoc_xe": doc.kich_thuoc_xe,
                "raw_json": doc.raw_json,
                "items": [
                    {
                        "dong": it.dong,
                        "ngay": it.ngay,
                        "kich_thuoc_so_luong": it.kich_thuoc_so_luong,
                        "khoi_luong": it.khoi_luong,
                        "cong_trinh": it.cong_trinh,
                        "ten_cau_kien": it.ten_cau_kien,
                        "ghi_chu": it.ghi_chu
                    }
                    for it in doc.items
                ]
            }
        }
    finally:
        db.close()
