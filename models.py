# ============================================================
# models.py - Các thực thể CSDL quan hệ cho OCR_Project
# ============================================================

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Text, DateTime, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from database import Base


class Document(Base):
    """Bảng lưu thông tin biểu mẫu nhật ký xẻ gỗ (Header và metadata)."""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    file_name = Column(String(255), unique=True, index=True, nullable=False)
    image_path = Column(String(500), nullable=True)
    document_type = Column(String(255), nullable=True)

    # Thông tin xe & ngày xẻ
    ngay_nhap = Column(String(50), nullable=True)
    ngay_xe = Column(String(50), index=True, nullable=True)
    so_xe = Column(String(100), index=True, nullable=True)

    # Thông tin gỗ tròn
    kich_thuoc_go_tron = Column(String(255), nullable=True)
    khoi_luong_go_tron = Column(String(50), nullable=True)
    kich_thuoc_xe = Column(String(255), nullable=True)

    # Dữ liệu JSON nguyên bản để đối chiếu
    raw_json = Column(JSON, nullable=True)
    status = Column(String(50), default="COMPLETED")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Quan hệ 1 - Nhiều với dòng chi tiết và sự kiện ngày
    items = relationship(
        "DocumentItem",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentItem.dong"
    )
    date_events = relationship(
        "DateEvent",
        back_populates="document",
        cascade="all, delete-orphan"
    )


class DocumentItem(Base):
    """Bảng lưu từng dòng thành khí trong bảng vật tư của phiếu."""
    __tablename__ = "document_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)

    dong = Column(Integer, nullable=False, default=1)
    ngay = Column(String(50), index=True, nullable=True)

    # Chuỗi kích thước gốc trên giấy
    kich_thuoc_so_luong = Column(String(255), nullable=True)

    # Các trường quy cách đã bóc tách
    rong = Column(String(50), nullable=True)
    cao = Column(String(50), nullable=True)
    dai = Column(String(50), nullable=True)
    so_luong = Column(String(50), nullable=True)

    # Khối lượng tính toán (m3)
    khoi_luong = Column(Float, nullable=True)

    # Phân loại công trình & cấu kiện
    cong_trinh = Column(String(255), index=True, nullable=True)
    stt_cau_kien = Column(String(50), nullable=True)
    ten_cau_kien = Column(String(255), index=True, nullable=True)
    nha_cung_cap = Column(String(255), nullable=True)
    ghi_chu = Column(Text, nullable=True)

    document = relationship("Document", back_populates="items")


class DateEvent(Base):
    """Bảng lưu các sự kiện nhóm ngày được AI bóc tách từ bảng."""
    __tablename__ = "date_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)

    ngay = Column(String(50), nullable=True)
    dong_bat_dau = Column(Integer, nullable=True)
    dong_ket_thuc = Column(Integer, nullable=True)
    do_tin_cay = Column(String(50), nullable=True)
    vi_tri = Column(String(255), nullable=True)

    document = relationship("Document", back_populates="date_events")


class Abbreviation(Base):
    """Bảng lưu bộ từ điển chữ viết tắt chuyên ngành xẻ gỗ trong PostgreSQL."""
    __tablename__ = "abbreviations"

    id = Column(String(100), primary_key=True, index=True)
    category = Column(String(100), index=True, nullable=False, default="cong_trinh")
    short = Column(String(100), index=True, nullable=False)
    full = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    synonyms = Column(JSON, default=list)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
