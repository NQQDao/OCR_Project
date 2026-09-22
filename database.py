# ============================================================
# database.py - Quản lý kết nối CSDL (SQLite & PostgreSQL)
# ============================================================

import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent

# Tải biến môi trường từ .env nếu có
ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(dotenv_path=ENV_FILE)
else:
    load_dotenv()

# Mặc định kết nối SQLite (Zero-config: tự tạo file ocr_data.db trong thư mục gốc)
DEFAULT_SQLITE_PATH = BASE_DIR / "ocr_data.db"
DEFAULT_DB_URL = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or DEFAULT_DB_URL


def get_db_type(url: str = None) -> str:
    """Xác định loại cơ sở dữ liệu dựa trên DATABASE_URL."""
    target_url = (url or DATABASE_URL).lower()
    if target_url.startswith("sqlite"):
        return "sqlite"
    elif "postgres" in target_url:
        return "postgresql"
    return "other"


DB_TYPE = get_db_type()

if DB_TYPE == "sqlite":
    # 1. Cấu hình cho SQLite
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False
    )

    # Kích hoạt WAL mode, Khóa ngoại (Foreign Keys) và Timeout xử lý đồng thời
    @event.listens_for(Engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.execute("PRAGMA busy_timeout=5000;")
            cursor.close()
        except Exception:
            pass

else:
    # 2. Cấu hình cho PostgreSQL
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,
        pool_pre_ping=True
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    """FastAPI Dependency để inject DB session vào các router."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_db_connected() -> bool:
    """Kiểm tra xem kết nối đến CSDL có hoạt động hay không."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
