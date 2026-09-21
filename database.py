# ============================================================
# database.py - Quản lý kết nối PostgreSQL cho OCR_Project
# ============================================================

import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent

# Tải biến môi trường từ .env nếu có
ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(dotenv_path=ENV_FILE)
else:
    load_dotenv()

# Mặc định kết nối PostgreSQL cục bộ
DEFAULT_DB_URL = "postgresql://postgres:123321@localhost:5432/ocr_db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

# Tạo SQLAlchemy Engine với connection pool
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    pool_pre_ping=True  # Tự động kiểm tra tính sống của kết nối
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
    """Kiểm tra xem kết nối đến PostgreSQL có hoạt động hay không."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
