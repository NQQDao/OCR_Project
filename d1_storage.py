# ============================================================
# d1_storage.py - Quản lý CSDL Cloudflare D1 (Serverless SQL)
# Cho phép lưu trữ, đồng bộ và truy vấn dữ liệu từ Cloudflare D1
# ============================================================

from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

CLOUDFLARE_ACCOUNT_ID = ""
D1_DATABASE_ID = ""
D1_API_TOKEN = ""


def reload_d1_config():
    """Nạp cấu hình D1 từ file .env hoặc biến môi trường hệ thống."""
    global CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, D1_API_TOKEN
    if ENV_FILE.exists():
        load_dotenv(dotenv_path=ENV_FILE, override=True)
    else:
        load_dotenv(override=True)

    CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip() or os.getenv("R2_ACCOUNT_ID", "").strip()
    D1_DATABASE_ID = os.getenv("CLOUDFLARE_D1_DATABASE_ID", "").strip() or os.getenv("D1_DATABASE_ID", "").strip()
    D1_API_TOKEN = os.getenv("CLOUDFLARE_D1_API_TOKEN", "").strip() or os.getenv("CLOUDFLARE_API_TOKEN", "").strip()


reload_d1_config()


def is_d1_configured() -> bool:
    """Kiểm tra xem hệ thống đã điền đủ thông tin kết nối Cloudflare D1 hay chưa."""
    reload_d1_config()
    return bool(CLOUDFLARE_ACCOUNT_ID and D1_DATABASE_ID and D1_API_TOKEN)


def execute_d1_query(sql: str, params: Optional[List[Any]] = None) -> Dict[str, Any]:
    """Thực thi câu lệnh SQL trên Cloudflare D1 thông qua REST API."""
    reload_d1_config()
    if not is_d1_configured():
        return {
            "success": False,
            "error": "Chưa cấu hình CLOUDFLARE_D1_DATABASE_ID hoặc CLOUDFLARE_D1_API_TOKEN trong file .env"
        }

    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
    headers = {
        "Authorization": f"Bearer {D1_API_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "sql": sql,
        "params": params or []
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        res_data = response.json()
        if response.status_code == 200 and res_data.get("success"):
            results = []
            if res_data.get("result") and len(res_data["result"]) > 0:
                results = res_data["result"][0].get("results", [])
            return {
                "success": True,
                "results": results,
                "meta": res_data.get("result", [{}])[0].get("meta", {})
            }
        else:
            errors = res_data.get("errors", [])
            err_msg = errors[0].get("message") if errors else response.text
            return {
                "success": False,
                "error": f"Lỗi Cloudflare D1 API ({response.status_code}): {err_msg}"
            }
    except Exception as e:
        return {
            "success": False,
            "error": f"Lỗi kết nối tới Cloudflare D1: {str(e)}"
        }


def init_d1_schema() -> Dict[str, Any]:
    """Tạo bảng trên Cloudflare D1 nếu chưa tồn tại."""
    schema_sqls = [
        """
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT UNIQUE NOT NULL,
            image_path TEXT,
            document_type TEXT,
            ngay_nhap TEXT,
            ngay_xe TEXT,
            so_xe TEXT,
            kich_thuoc_go_tron TEXT,
            khoi_luong_go_tron TEXT,
            kich_thuoc_xe TEXT,
            raw_json TEXT,
            status TEXT DEFAULT 'COMPLETED',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS document_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            dong INTEGER NOT NULL DEFAULT 1,
            ngay TEXT,
            kich_thuoc_so_luong TEXT,
            rong TEXT,
            cao TEXT,
            dai TEXT,
            so_luong TEXT,
            khoi_luong REAL,
            cong_trinh TEXT,
            stt_cau_kien TEXT,
            ten_cau_kien TEXT,
            nha_cung_cap TEXT,
            ghi_chu TEXT,
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS abbreviations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            viet_tat TEXT NOT NULL,
            nghia_goc TEXT NOT NULL,
            danh_muc TEXT DEFAULT 'Chung',
            ghi_chu TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    ]

    for sql in schema_sqls:
        res = execute_d1_query(sql)
        if not res.get("success"):
            return res

    return {
        "success": True,
        "message": "Đã khởi tạo bảng thành công trên Cloudflare D1."
    }


def save_document_to_d1(doc_data: Dict[str, Any]) -> Dict[str, Any]:
    """Lưu hoặc cập nhật một phiếu xẻ gỗ vào Cloudflare D1."""
    if not is_d1_configured():
        return {"success": False, "error": "Chưa cấu hình Cloudflare D1"}

    file_name = doc_data.get("file_name", "")
    if not file_name:
        return {"success": False, "error": "file_name không được để trống"}

    # Kiểm tra xem phiếu đã tồn tại trong D1 chưa
    check_res = execute_d1_query("SELECT id FROM documents WHERE file_name = ?", [file_name])
    existing_id = None
    if check_res.get("success") and check_res.get("results"):
        existing_id = check_res["results"][0]["id"]

    raw_json_str = json.dumps(doc_data.get("raw_json", {}), ensure_ascii=False) if isinstance(doc_data.get("raw_json"), (dict, list)) else (doc_data.get("raw_json") or "")

    if existing_id:
        update_sql = """
        UPDATE documents SET
            image_path = ?,
            document_type = ?,
            ngay_nhap = ?,
            ngay_xe = ?,
            so_xe = ?,
            kich_thuoc_go_tron = ?,
            khoi_luong_go_tron = ?,
            kich_thuoc_xe = ?,
            raw_json = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """
        params = [
            doc_data.get("image_path", ""),
            doc_data.get("document_type", "Nhật ký xẻ gỗ"),
            doc_data.get("ngay_nhap", ""),
            doc_data.get("ngay_xe", ""),
            doc_data.get("so_xe", ""),
            doc_data.get("kich_thuoc_go_tron", ""),
            doc_data.get("khoi_luong_go_tron", ""),
            doc_data.get("kich_thuoc_xe", ""),
            raw_json_str,
            doc_data.get("status", "COMPLETED"),
            existing_id
        ]
        res = execute_d1_query(update_sql, params)
        if not res.get("success"):
            return res
        doc_id = existing_id
        # Xóa các items cũ để ghi lại
        execute_d1_query("DELETE FROM document_items WHERE document_id = ?", [doc_id])
    else:
        insert_sql = """
        INSERT INTO documents (
            file_name, image_path, document_type, ngay_nhap, ngay_xe, so_xe,
            kich_thuoc_go_tron, khoi_luong_go_tron, kich_thuoc_xe, raw_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = [
            file_name,
            doc_data.get("image_path", ""),
            doc_data.get("document_type", "Nhật ký xẻ gỗ"),
            doc_data.get("ngay_nhap", ""),
            doc_data.get("ngay_xe", ""),
            doc_data.get("so_xe", ""),
            doc_data.get("kich_thuoc_go_tron", ""),
            doc_data.get("khoi_luong_go_tron", ""),
            doc_data.get("kich_thuoc_xe", ""),
            raw_json_str,
            doc_data.get("status", "COMPLETED")
        ]
        res = execute_d1_query(insert_sql, params)
        if not res.get("success"):
            return res

        # Lấy lại ID vừa tạo
        fetch_id = execute_d1_query("SELECT id FROM documents WHERE file_name = ?", [file_name])
        if fetch_id.get("success") and fetch_id.get("results"):
            doc_id = fetch_id["results"][0]["id"]
        else:
            return {"success": False, "error": "Không thể lấy ID vừa tạo trên D1"}

    # Thêm các dòng items
    items = doc_data.get("items", [])
    for it in items:
        item_sql = """
        INSERT INTO document_items (
            document_id, dong, ngay, kich_thuoc_so_luong, rong, cao, dai,
            so_luong, khoi_luong, cong_trinh, stt_cau_kien, ten_cau_kien, nha_cung_cap, ghi_chu
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        item_params = [
            doc_id,
            it.get("dong", 1),
            it.get("ngay", ""),
            it.get("kich_thuoc_so_luong", ""),
            it.get("rong", ""),
            it.get("cao", ""),
            it.get("dai", ""),
            it.get("so_luong", ""),
            float(it.get("khoi_luong") or 0.0) if it.get("khoi_luong") is not None else 0.0,
            it.get("cong_trinh", ""),
            it.get("stt_cau_kien", ""),
            it.get("ten_cau_kien", ""),
            it.get("nha_cung_cap", ""),
            it.get("ghi_chu", "")
        ]
        execute_d1_query(item_sql, item_params)

    return {
        "success": True,
        "id": doc_id,
        "message": f"Đã lưu phiếu #{doc_id} ({file_name}) thành công lên Cloudflare D1."
    }


def get_d1_status() -> Dict[str, Any]:
    """Kiểm tra trạng thái kết nối Cloudflare D1."""
    reload_d1_config()
    if not is_d1_configured():
        return {
            "configured": False,
            "connected": False,
            "database_id": D1_DATABASE_ID or None,
            "account_id": CLOUDFLARE_ACCOUNT_ID or None,
            "message": "Chưa điền CLOUDFLARE_D1_DATABASE_ID hoặc CLOUDFLARE_D1_API_TOKEN trong file .env"
        }

    res = execute_d1_query("SELECT 1 AS ping")
    if res.get("success"):
        return {
            "configured": True,
            "connected": True,
            "database_id": D1_DATABASE_ID,
            "account_id": CLOUDFLARE_ACCOUNT_ID,
            "message": f"Kết nối Cloudflare D1 thành công (Database ID: {D1_DATABASE_ID[:8]}...)"
        }
    else:
        return {
            "configured": True,
            "connected": False,
            "database_id": D1_DATABASE_ID,
            "account_id": CLOUDFLARE_ACCOUNT_ID,
            "message": res.get("error", "Không thể kết nối Cloudflare D1.")
        }


def delete_document_from_d1(doc_id: int) -> Dict[str, Any]:
    """Xóa một phiếu xẻ khỏi Cloudflare D1."""
    if not is_d1_configured():
        return {"success": False, "error": "Chưa cấu hình Cloudflare D1"}
    
    # Xóa items trước
    execute_d1_query("DELETE FROM document_items WHERE document_id = ?", [doc_id])
    res = execute_d1_query("DELETE FROM documents WHERE id = ?", [doc_id])
    return res


def get_documents_from_d1(limit: int = 100) -> List[Dict[str, Any]]:
    """Lấy danh sách phiếu từ Cloudflare D1."""
    if not is_d1_configured():
        return []
    
    sql = "SELECT * FROM documents ORDER BY created_at DESC LIMIT ?"
    res = execute_d1_query(sql, [limit])
    if not res.get("success"):
        return []
    
    docs = res.get("results", [])
    for d in docs:
        # Lấy items của từng doc
        items_res = execute_d1_query("SELECT * FROM document_items WHERE document_id = ? ORDER BY dong ASC", [d["id"]])
        d["items"] = items_res.get("results", []) if items_res.get("success") else []
        if isinstance(d.get("raw_json"), str) and d["raw_json"]:
            try:
                d["raw_json"] = json.loads(d["raw_json"])
            except Exception:
                pass
    return docs


def sync_local_sqlite_to_d1(db_session) -> Dict[str, Any]:
    """Đồng bộ toàn bộ dữ liệu từ SQLite nội bộ lên Cloudflare D1."""
    from crud import get_documents
    if not is_d1_configured():
        return {"success": False, "error": "Chưa cấu hình Cloudflare D1"}

    # Tạo bảng nếu chưa có
    init_res = init_d1_schema()
    if not init_res.get("success"):
        return init_res

    docs = get_documents(db_session, limit=1000)
    synced_count = 0
    errors = []

    for doc in docs:
        doc_dict = {
            "file_name": doc.file_name,
            "image_path": doc.image_path,
            "document_type": doc.document_type,
            "ngay_nhap": doc.ngay_nhap,
            "ngay_xe": doc.ngay_xe,
            "so_xe": doc.so_xe,
            "kich_thuoc_go_tron": doc.kich_thuoc_go_tron,
            "khoi_luong_go_tron": doc.khoi_luong_go_tron,
            "kich_thuoc_xe": doc.kich_thuoc_xe,
            "raw_json": doc.raw_json,
            "status": doc.status or "COMPLETED",
            "items": [
                {
                    "dong": it.dong,
                    "ngay": it.ngay,
                    "kich_thuoc_so_luong": it.kich_thuoc_so_luong,
                    "rong": it.rong,
                    "cao": it.cao,
                    "dai": it.dai,
                    "so_luong": it.so_luong,
                    "khoi_luong": it.khoi_luong,
                    "cong_trinh": it.cong_trinh,
                    "stt_cau_kien": it.stt_cau_kien,
                    "ten_cau_kien": it.ten_cau_kien,
                    "nha_cung_cap": it.nha_cung_cap,
                    "ghi_chu": it.ghi_chu
                }
                for it in doc.items
            ]
        }
        res = save_document_to_d1(doc_dict)
        if res.get("success"):
            synced_count += 1
        else:
            errors.append(f"{doc.file_name}: {res.get('error')}")

    return {
        "success": True,
        "synced_count": synced_count,
        "total": len(docs),
        "errors": errors,
        "message": f"Đã đồng bộ {synced_count}/{len(docs)} phiếu lên Cloudflare D1 thành công!"
    }


def sync_d1_to_local_sqlite(db_session) -> Dict[str, Any]:
    """Kéo dữ liệu từ Cloudflare D1 về nạp vào SQLite cục bộ (dùng khi server mới khởi động lại)."""
    from crud import create_or_update_document
    if not is_d1_configured():
        return {"success": False, "error": "Chưa cấu hình Cloudflare D1"}

    d1_docs = get_documents_from_d1(limit=1000)
    pulled_count = 0
    for d in d1_docs:
        file_name = d.get("file_name", "")
        if not file_name:
            continue
        data = {
            "document_type": d.get("document_type", "Nhật ký xẻ gỗ"),
            "header": {
                "ngay_nhap": d.get("ngay_nhap", ""),
                "ngay_xe": d.get("ngay_xe", ""),
                "so_xe": d.get("so_xe", ""),
                "kich_thuoc_go_tron": d.get("kich_thuoc_go_tron", ""),
                "khoi_luong_go_tron": d.get("khoi_luong_go_tron", ""),
                "kich_thuoc_xe": d.get("kich_thuoc_xe", "")
            },
            "source": {"file": d.get("image_path", "")},
            "items": d.get("items", []),
            "date_events": []
        }
        create_or_update_document(db_session, data, file_name, d.get("image_path", ""))
        pulled_count += 1

    return {
        "success": True,
        "pulled_count": pulled_count,
        "message": f"Đã tự động kéo {pulled_count} phiếu từ Cloudflare D1 về SQLite cục bộ thành công!"
    }

