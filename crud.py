# ============================================================
# crud.py - Các hàm thao tác dữ liệu (CRUD) cho PostgreSQL
# ============================================================

import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from models import Document, DocumentItem, DateEvent, Abbreviation, SystemSetting


def parse_float(val: Any) -> Optional[float]:
    """Chuyển đổi an toàn chuỗi sang float."""
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return float(val)
    try:
        s = str(val).replace(",", ".").replace(" ", "").strip()
        return float(s)
    except Exception:
        return None


def create_or_update_document(
    db: Session,
    data: Dict[str, Any],
    file_name: str,
    image_path: Optional[str] = None
) -> Document:
    """
    Lưu hoặc cập nhật toàn bộ thông tin biểu mẫu OCR và các dòng chi tiết vào CSDL.
    """
    header = data.get("header", {})
    source = data.get("source", {})
    if not image_path:
        image_path = source.get("file", "")

    doc = db.query(Document).filter(Document.file_name == file_name).first()
    if not doc:
        doc = Document(file_name=file_name)
        db.add(doc)

    # Cập nhật thông tin phiếu
    doc.image_path = image_path
    doc.document_type = data.get("document_type", "")
    doc.ngay_nhap = header.get("ngay_nhap", "")
    doc.ngay_xe = header.get("ngay_xe", "")
    doc.so_xe = header.get("so_xe", "")
    doc.kich_thuoc_go_tron = header.get("kich_thuoc_go_tron", "")
    doc.khoi_luong_go_tron = header.get("khoi_luong_go_tron", "")
    doc.kich_thuoc_xe = header.get("kich_thuoc_xe", "")
    doc.raw_json = data
    doc.status = "COMPLETED"

    # Xóa các items cũ nếu có để nạp lại đầy đủ
    db.query(DocumentItem).filter(DocumentItem.document_id == doc.id).delete()
    db.query(DateEvent).filter(DateEvent.document_id == doc.id).delete()

    db.flush()  # Đảm bảo có doc.id

    # Lưu danh sách dòng thành khí
    for it in data.get("items", []):
        item = DocumentItem(
            document_id=doc.id,
            dong=it.get("dong", 1),
            ngay=it.get("ngay", ""),
            kich_thuoc_so_luong=it.get("kich_thuoc_so_luong", ""),
            rong=str(it.get("rong", "")),
            cao=str(it.get("cao", "")),
            dai=str(it.get("dai", "")),
            so_luong=str(it.get("so_luong", "")),
            khoi_luong=parse_float(it.get("khoi_luong")),
            cong_trinh=it.get("cong_trinh", ""),
            stt_cau_kien=str(it.get("stt_cau_kien", "")),
            ten_cau_kien=it.get("ten_cau_kien", ""),
            nha_cung_cap=it.get("nha_cung_cap", ""),
            ghi_chu=it.get("ghi_chu", "")
        )
        db.add(item)

    # Lưu các sự kiện ngày
    for ev in data.get("date_events", []):
        event = DateEvent(
            document_id=doc.id,
            ngay=ev.get("ngay", ""),
            dong_bat_dau=ev.get("dong_bat_dau"),
            dong_ket_thuc=ev.get("dong_ket_thuc"),
            do_tin_cay=ev.get("do_tin_cay", ""),
            vi_tri=ev.get("vi_tri", "")
        )
        db.add(event)

    db.commit()
    db.refresh(doc)

    # Tự động đồng bộ sang Cloudflare D1 nếu có cấu hình
    try:
        import d1_storage
        if d1_storage.is_d1_configured():
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
            d1_storage.save_document_to_d1(doc_dict)
    except Exception as d1_err:
        print(f"[Cloudflare D1 Warning] {d1_err}")

    return doc


def get_documents(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None
) -> List[Document]:
    """Lấy danh sách các phiếu có tìm kiếm và phân trang."""
    query = db.query(Document)
    if search:
        s = f"%{search}%"
        query = query.filter(
            or_(
                Document.file_name.ilike(s),
                Document.so_xe.ilike(s),
                Document.ngay_xe.ilike(s),
                Document.kich_thuoc_go_tron.ilike(s)
            )
        )
    return query.order_by(desc(Document.created_at)).offset(skip).limit(limit).all()


def get_document_by_id(db: Session, doc_id: int) -> Optional[Document]:
    """Tìm phiếu theo ID."""
    return db.query(Document).filter(Document.id == doc_id).first()


def get_document_by_file_name(db: Session, file_name: str) -> Optional[Document]:
    """Tìm phiếu theo tên file."""
    return db.query(Document).filter(Document.file_name == file_name).first()


def delete_document(db: Session, doc_id: int) -> bool:
    """Xóa phiếu và tất cả dòng con liên quan."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        return False
    db.delete(doc)
    db.commit()

    # Tự động xóa trên Cloudflare D1 nếu có cấu hình
    try:
        import d1_storage
        if d1_storage.is_d1_configured():
            d1_storage.delete_document_from_d1(doc_id)
    except Exception:
        pass

    return True


# ============================================================
# CRUD TỪ ĐIỂN CHỮ VIẾT TẮT TRONG CSDL
# ============================================================

def get_db_abbreviations(
    db: Session,
    category: Optional[str] = None,
    search: Optional[str] = None
) -> List[Abbreviation]:
    """Lấy danh sách từ viết tắt từ PostgreSQL."""
    query = db.query(Abbreviation)
    if category and category != "all":
        query = query.filter(Abbreviation.category == category)
    if search:
        s = f"%{search}%"
        query = query.filter(
            or_(
                Abbreviation.short.ilike(s),
                Abbreviation.full.ilike(s),
                Abbreviation.description.ilike(s)
            )
        )
    return query.order_by(Abbreviation.category, Abbreviation.short).all()


def save_db_abbreviation(db: Session, item_dict: Dict[str, Any]) -> Abbreviation:
    """Thêm mới hoặc cập nhật từ viết tắt vào PostgreSQL."""
    item_id = item_dict.get("id")
    abbr = None
    if item_id:
        abbr = db.query(Abbreviation).filter(Abbreviation.id == item_id).first()

    if not abbr:
        abbr = Abbreviation(id=item_id or f"{item_dict.get('category', 'ct')[:2]}_{uuid.uuid4().hex[:6]}")
        db.add(abbr)

    abbr.category = item_dict.get("category", abbr.category or "cong_trinh")
    abbr.short = str(item_dict.get("short", abbr.short)).strip()
    abbr.full = str(item_dict.get("full", abbr.full)).strip()
    abbr.description = str(item_dict.get("description", abbr.description or "")).strip()
    synonyms = item_dict.get("synonyms", [])
    if isinstance(synonyms, str):
        synonyms = [s.strip() for s in synonyms.split(",") if s.strip()]
    abbr.synonyms = synonyms

    db.commit()
    db.refresh(abbr)
    return abbr


def delete_db_abbreviation(db: Session, item_id: str) -> bool:
    """Xóa từ viết tắt khỏi PostgreSQL."""
    abbr = db.query(Abbreviation).filter(Abbreviation.id == item_id).first()
    if not abbr:
        return False
    db.delete(abbr)
    db.commit()
    return True


# ============================================================
# CRUD CẤU HÌNH HỆ THỐNG / PROMPT TÙY CHỈNH
# ============================================================

def get_system_setting(db: Session, key: str, default: Optional[str] = None) -> Optional[str]:
    """Lấy giá trị cấu hình hệ thống theo key."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting:
        return setting.value
    return default


def set_system_setting(db: Session, key: str, value: str, description: Optional[str] = None) -> SystemSetting:
    """Lưu hoặc cập nhật giá trị cấu hình hệ thống theo key."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        setting = SystemSetting(key=key, value=value, description=description)
        db.add(setting)
    else:
        setting.value = value
        if description is not None:
            setting.description = description
    db.commit()
    db.refresh(setting)
    return setting


def delete_system_setting(db: Session, key: str) -> bool:
    """Xóa cấu hình hệ thống theo key."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        return False
    db.delete(setting)
    db.commit()
    return True

