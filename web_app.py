import subprocess
import json
import sys
from pathlib import Path
from unittest import result

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from abbreviation_manager import abbreviation_mgr
from database import SessionLocal, is_db_connected, DB_TYPE, DATABASE_URL
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

app.mount(
    "/web_uploads",
    StaticFiles(directory=UPLOAD_DIR),
    name="web_uploads"
)


def sync_output_json_to_db():
    """Tự động đồng bộ các file JSON trong output/ vào CSDL SQLite/PostgreSQL nếu chưa có."""
    if not is_db_connected():
        return
    db = SessionLocal()
    try:
        from models import Document
        existing_filenames = {d.file_name for d in db.query(Document.file_name).all()}
        for json_path in OUTPUT_DIR.glob("*.json"):
            if json_path.name not in existing_filenames:
                try:
                    data = json.loads(json_path.read_text(encoding="utf-8"))
                    img_name = (data.get("source", {}) or {}).get("file", "")
                    create_or_update_document(db, data, json_path.name, img_name)
                    print(f"[DB Auto-sync] Đã nạp file {json_path.name} vào CSDL.")
                except Exception as e:
                    print(f"[DB Auto-sync Error] {json_path.name}: {e}")
    except Exception as err:
        print(f"[DB Auto-sync Error] {err}")
    finally:
        db.close()


@app.on_event("startup")
def startup_event():
    """Khởi tạo database khi server bật (nếu có kết nối)."""
    if is_db_connected():
        try:
            init_database()
            sync_output_json_to_db()

            # Tự động kéo dữ liệu từ Cloudflare D1 về nếu SQLite chưa có phiếu nào (trường hợp chạy trên container như Hugging Face)
            import d1_storage
            if d1_storage.is_d1_configured():
                db_check = SessionLocal()
                try:
                    from models import Document
                    count = db_check.query(Document).count()
                    if count == 0:
                        print("[Cloudflare D1] Database cục bộ rỗng, đang tự động khôi phục từ Cloudflare D1...")
                        res_pull = d1_storage.sync_d1_to_local_sqlite(db_check)
                        print(f"[Cloudflare D1] {res_pull.get('message')}")
                finally:
                    db_check.close()

            print(f"[DB] Khởi tạo kết nối CSDL {DB_TYPE.upper()} thành công! ({DATABASE_URL})")
        except Exception as e:
            print(f"[DB Warning] Không thể khởi tạo database {DB_TYPE.upper()}: {e}")
    else:
        print(f"[DB Info] Chưa kết nối được CSDL {DB_TYPE.upper()}. Hệ thống tiếp tục chạy với tệp JSON cục bộ.")


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
        err_file = OUTPUT_DIR / f"{upload_path.stem}_ERROR.txt"
        err_429 = OUTPUT_DIR / f"{upload_path.stem}_ERROR_429.txt"
        if err_429.exists():
            err_detail = err_429.read_text(encoding="utf-8", errors="ignore").strip()
            raise HTTPException(status_code=500, detail=f"Lỗi Quota Gemini (429): {err_detail[:300]}")
        elif err_file.exists():
            err_detail = err_file.read_text(encoding="utf-8", errors="ignore").strip()
            raise HTTPException(status_code=500, detail=f"Lỗi Gemini AI: {err_detail[:300]}")
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

    # Tự động đẩy file lên Cloudflare R2 nếu đã cấu hình
    if is_r2_configured():
        try:
            upload_image(upload_path, filename)
            upload_json(json_path, json_path.name)
        except Exception as r2_err:
            print(f"[R2 Auto-upload Error] {r2_err}")

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

    try:
        import json_to_excel_batch
        excel_path = json_to_excel_batch.create_batch_excel([json_path])
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Không tạo được Excel: {e}"
        )

    if not excel_path or not excel_path.exists():
        raise HTTPException(
            status_code=500,
            detail="Đã tạo Excel nhưng không tìm thấy file."
        )


    # Tự động đẩy file Excel lên Cloudflare R2 nếu đã cấu hình
    if is_r2_configured():
        try:
            upload_excel(excel_path, excel_path.name)
        except Exception as r2_err:
            print(f"[R2 Excel Auto-upload Error] {r2_err}")

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

    # Tự động đẩy file Excel tổng hợp lên Cloudflare R2 nếu đã cấu hình
    if is_r2_configured():
        try:
            upload_excel(excel_path, excel_path.name)
        except Exception as r2_err:
            print(f"[R2 Excel Batch Auto-upload Error] {r2_err}")

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
                err_file = OUTPUT_DIR / f"{upload_path.stem}_ERROR.txt"
                err_429 = OUTPUT_DIR / f"{upload_path.stem}_ERROR_429.txt"
                err_msg = "OCR chạy xong nhưng không tìm thấy JSON."
                if err_429.exists():
                    err_msg = f"Lỗi Gemini 429 Quota: {err_429.read_text(encoding='utf-8', errors='ignore')[:200]}"
                elif err_file.exists():
                    err_msg = f"Lỗi Gemini AI: {err_file.read_text(encoding='utf-8', errors='ignore')[:200]}"

                results.append({
                    "status": "error",
                    "file": filename,
                    "error": err_msg
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

            # Tự động đẩy file lên Cloudflare R2 nếu đã cấu hình
            if is_r2_configured():
                try:
                    upload_image(upload_path, filename)
                    upload_json(json_path, json_path.name)
                except Exception as r2_err:
                    print(f"[R2 Batch Auto-upload Error] {r2_err}")

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
        effective_text = abbreviation_mgr.get_effective_prompt_context()
        default_text = abbreviation_mgr.get_prompt_context()
        custom_text = abbreviation_mgr.get_custom_prompt()
        return {
            "status": "success",
            "prompt_text": effective_text,
            "default_prompt": default_text,
            "custom_prompt": custom_text,
            "is_custom": custom_text is not None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tạo prompt: {e}")


@app.post("/api/prompt/custom")
async def save_custom_prompt_endpoint(data: dict):
    try:
        prompt_text = data.get("prompt_text", "")
        if not prompt_text or not prompt_text.strip():
            raise HTTPException(status_code=400, detail="Nội dung prompt không được để trống.")
        
        abbreviation_mgr.save_custom_prompt(prompt_text)
        return {
            "status": "success",
            "message": "Đã lưu Prompt tùy chỉnh thành công vào cơ sở dữ liệu!",
            "is_custom": True
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lưu prompt tùy chỉnh: {e}")


@app.post("/api/prompt/reset")
def reset_custom_prompt_endpoint():
    try:
        abbreviation_mgr.reset_custom_prompt()
        default_text = abbreviation_mgr.get_prompt_context()
        return {
            "status": "success",
            "message": "Đã khôi phục Prompt về mặc định tự động sinh từ bộ từ điển!",
            "prompt_text": default_text,
            "is_custom": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khôi phục prompt: {e}")



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
# CLOUDFLARE R2 OBJECT STORAGE API
# ============================================================

from r2_storage import (
    get_r2_status,
    is_r2_configured,
    list_r2_files,
    test_r2_connection,
    sync_all_local_files_to_r2,
    upload_image,
    upload_json,
    upload_excel
)

@app.get("/api/r2/status")
def get_cloudflare_r2_status():
    """Kiểm tra trạng thái cấu hình và kết nối tới Cloudflare R2 Bucket."""
    return get_r2_status()


@app.post("/api/r2/test-connection")
def test_cloudflare_r2_endpoint():
    """Thực hiện test ghi và đọc trực tiếp trên Cloudflare R2."""
    return test_r2_connection()


@app.post("/api/r2/sync-all")
def sync_all_to_cloudflare_r2():
    """Đồng bộ toàn bộ file cục bộ (JSON, Excel, Ảnh) lên Cloudflare R2."""
    images_dir = BASE_DIR / "images"
    excel_dir = BASE_DIR / "excel_exports"
    return sync_all_local_files_to_r2(
        output_dir=OUTPUT_DIR,
        uploads_dir=UPLOAD_DIR,
        images_dir=images_dir,
        excel_dir=excel_dir
    )


@app.get("/api/r2/files")
def list_cloudflare_r2_files(prefix: str = Query("")):
    """Liệt kê danh sách file đang lưu trữ trên Cloudflare R2."""
    if not is_r2_configured():
        return {
            "status": "not_configured",
            "files": [],
            "message": "Chưa cấu hình Cloudflare R2 trong .env"
        }
    files = list_r2_files(prefix=prefix)
    return {
        "status": "success",
        "total": len(files),
        "files": files
    }


# ============================================================
# CLOUDFLARE D1 (SERVERLESS SQL DATABASE) API
# ============================================================
import d1_storage

@app.get("/api/d1/status")
def get_cloudflare_d1_status():
    """Kiểm tra trạng thái cấu hình và kết nối tới Cloudflare D1 Database."""
    return d1_storage.get_d1_status()


@app.post("/api/d1/sync")
def sync_all_to_cloudflare_d1():
    """Đồng bộ toàn bộ bảng dữ liệu SQLite cục bộ lên Cloudflare D1 Database."""
    if not is_db_connected():
        raise HTTPException(status_code=503, detail="CSDL cục bộ chưa kết nối.")
    db = SessionLocal()
    try:
        return d1_storage.sync_local_sqlite_to_d1(db)
    finally:
        db.close()


# ============================================================
# CƠ SỞ DỮ LIỆU (SQLITE / POSTGRESQL) API
# ============================================================

@app.get("/api/database/status")

def get_database_status():
    connected = is_db_connected()
    db_name = "SQLite" if DB_TYPE == "sqlite" else "PostgreSQL"
    safe_url = DATABASE_URL
    if "@" in safe_url:
        safe_url = safe_url.split("@")[-1]
    return {
        "status": "connected" if connected else "disconnected",
        "database": db_name,
        "db_type": DB_TYPE,
        "database_url": safe_url,
        "message": f"Đã kết nối cơ sở dữ liệu {db_name}." if connected else f"Chưa kết nối CSDL {db_name} (đang lưu file JSON cục bộ)."
    }


@app.get("/api/documents")
def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: str = Query(None)
):
    if not is_db_connected():
        raise HTTPException(status_code=503, detail=f"Chưa kết nối tới cơ sở dữ liệu {DB_TYPE.upper()}.")
    if skip == 0 and not search:
        sync_output_json_to_db()
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
        raise HTTPException(status_code=503, detail=f"Chưa kết nối tới cơ sở dữ liệu {DB_TYPE.upper()}.")
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


@app.delete("/api/documents/{doc_id}")
def delete_document_endpoint(doc_id: int):
    if not is_db_connected():
        raise HTTPException(status_code=503, detail=f"Chưa kết nối tới cơ sở dữ liệu {DB_TYPE.upper()}.")
    db = SessionLocal()
    try:
        doc = get_document_by_id(db, doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu để xóa.")
        file_name = doc.file_name
        success = delete_document(db, doc_id)
        if not success:
            raise HTTPException(status_code=500, detail="Không thể xóa phiếu khỏi CSDL.")
        # Xóa file JSON tương ứng nếu có
        json_file = OUTPUT_DIR / file_name
        if json_file.exists():
            try:
                json_file.unlink()
            except Exception as del_err:
                print(f"[Delete JSON Warning] {del_err}")
        return {
            "status": "success",
            "message": f"Đã xóa phiếu ID #{doc_id} thành công!"
        }
    finally:
        db.close()



