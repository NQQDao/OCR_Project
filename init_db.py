# ============================================================
# init_db.py - Khởi tạo CSDL (SQLite / PostgreSQL) và bảng
# ============================================================

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

# Reconfigure stdout/stderr for Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from database import DATABASE_URL, DB_TYPE, engine, SessionLocal, Base
from models import Document, DocumentItem, DateEvent, Abbreviation


def ensure_postgres_database_exists(db_url: str) -> bool:
    """Đảm bảo database mục tiêu (ví dụ: ocr_db) đã được tạo trên máy chủ Postgres."""
    try:
        import psycopg2
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    except ImportError:
        print("[CANH_BAO] Chưa cài đặt psycopg2, bỏ qua bước tự động tạo DB Postgres.")
        return False

    parsed = urlparse(db_url)
    db_name = parsed.path.lstrip("/")
    user = parsed.username or "postgres"
    password = parsed.password or ""
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432

    try:
        # Kết nối tới database mặc định 'postgres' để kiểm tra
        conn = psycopg2.connect(
            dbname="postgres",
            user=user,
            password=password,
            host=host,
            port=port,
            connect_timeout=3
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
        exists = cur.fetchone()
        if not exists:
            cur.execute(f'CREATE DATABASE "{db_name}"')
            print(f"[OK] Đã tạo mới cơ sở dữ liệu PostgreSQL '{db_name}'.")
        else:
            print(f"[OK] Cơ sở dữ liệu PostgreSQL '{db_name}' đã sẵn sàng.")

        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"[CANH_BAO] Không thể tự động tạo DB qua psycopg2: {e}")
        return False


def seed_initial_abbreviations():
    """Nạp bộ từ điển mặc định từ abbreviations.json vào CSDL nếu bảng còn trống."""
    json_path = BASE_DIR / "abbreviations.json"
    if not json_path.exists():
        return

    db = SessionLocal()
    try:
        count = db.query(Abbreviation).count()
        if count == 0:
            print(f"[INFO] Đang nạp từ điển ban đầu vào bảng abbreviations ({DB_TYPE.upper()})...")
            content = json.loads(json_path.read_text(encoding="utf-8"))
            for it in content.get("items", []):
                abbr = Abbreviation(
                    id=it["id"],
                    category=it.get("category", "cong_trinh"),
                    short=it.get("short", ""),
                    full=it.get("full", ""),
                    description=it.get("description", ""),
                    synonyms=it.get("synonyms", [])
                )
                db.add(abbr)
            db.commit()
            print(f"[OK] Đã nạp {len(content.get('items', []))} từ viết tắt vào CSDL.")
        else:
            print(f"[OK] Bảng abbreviations đã có sẵn {count} bản ghi.")
    except Exception as e:
        print(f"[LOI] Không thể nạp từ điển vào DB: {e}")
        db.rollback()
    finally:
        db.close()


def init_database() -> bool:
    """Khởi tạo toàn diện cơ sở dữ liệu và các bảng."""
    print("=" * 60)
    print(f"KHỞI TẠO CƠ SỞ DỮ LIỆU {DB_TYPE.upper()} (OCR_PROJECT)")
    print("=" * 60)

    # 1. Đảm bảo CSDL tồn tại
    if DB_TYPE == "postgresql":
        ensure_postgres_database_exists(DATABASE_URL)
    elif DB_TYPE == "sqlite":
        print(f"[OK] CSDL SQLite tự động quản lý tệp: {DATABASE_URL}")

    # 2. Tạo tất cả bảng quan hệ
    try:
        Base.metadata.create_all(bind=engine)
        print("[OK] Đã khởi tạo cấu trúc các bảng: documents, document_items, date_events, abbreviations, system_settings.")
    except Exception as e:
        print(f"[LOI] Không thể khởi tạo bảng: {e}")
        return False

    # 3. Nạp từ điển ban đầu
    seed_initial_abbreviations()

    print("=" * 60)
    print(f"HOÀN TẤT KHỞI TẠO CƠ SỞ DỮ LIỆU {DB_TYPE.upper()} THÀNH CÔNG!")
    print("=" * 60)
    return True


if __name__ == "__main__":
    init_database()
