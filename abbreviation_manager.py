# ============================================================
# abbreviation_manager.py
# Quản lý bộ từ điển "Huấn Luyện chữ viết tắt" cho OCR_Project
# (Hỗ trợ Database-First trên SQLite / PostgreSQL + Đồng bộ JSON)
# ============================================================

from __future__ import annotations

import json
import re
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from database import SessionLocal, is_db_connected
from models import Abbreviation
from crud import (
    get_db_abbreviations, save_db_abbreviation, delete_db_abbreviation,
    get_system_setting, set_system_setting, delete_system_setting
)

BASE_DIR = Path(__file__).resolve().parent
DICT_FILE = BASE_DIR / "abbreviations.json"
BACKUP_DEFAULT_FILE = BASE_DIR / "abbreviations_default.json"


class AbbreviationManager:
    """
    Quản lý lưu trữ, truy vấn, và sinh Prompt Huấn Luyện từ điển chữ viết tắt.
    Ưu tiên đọc và ghi trực tiếp từ CSDL (SQLite/PostgreSQL) và tự động đồng bộ file JSON.
    """

    def __init__(self, dict_path: Path = DICT_FILE):
        self.dict_path = dict_path
        self._ensure_file_exists()

    def _ensure_file_exists(self) -> None:
        """Đảm bảo file abbreviations.json luôn tồn tại và có sao lưu mặc định."""
        if not self.dict_path.exists():
            if BACKUP_DEFAULT_FILE.exists():
                shutil.copy2(BACKUP_DEFAULT_FILE, self.dict_path)
            else:
                self.save_raw({
                    "version": "1.0",
                    "categories": {
                        "cong_trinh": "Mã / Tên công trình",
                        "cau_kien": "Tên cấu kiện mộc",
                        "go_tron_quy_cach": "Quy cách & Gỗ tròn",
                        "ghi_chu": "Ghi chú & Đơn vị"
                    },
                    "items": []
                })
        elif not BACKUP_DEFAULT_FILE.exists() and self.dict_path.exists():
            shutil.copy2(self.dict_path, BACKUP_DEFAULT_FILE)

    def load_raw(self) -> Dict[str, Any]:
        """Tải dữ liệu thô từ file JSON (dùng làm bộ nhớ đệm dự phòng)."""
        try:
            content = self.dict_path.read_text(encoding="utf-8")
            return json.loads(content)
        except Exception:
            return {"version": "1.0", "categories": {}, "items": []}

    def save_raw(self, data: Dict[str, Any]) -> None:
        """Lưu dữ liệu thô vào file JSON với định dạng UTF-8 đẹp mắt."""
        self.dict_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    def _sync_db_to_json(self) -> None:
        """Đồng bộ toàn bộ danh sách từ CSDL ra file JSON để làm bản sao lưu dự phòng."""
        if not is_db_connected():
            return
        db = SessionLocal()
        try:
            db_items = get_db_abbreviations(db)
            data = self.load_raw()
            data["items"] = [
                {
                    "id": it.id,
                    "category": it.category,
                    "short": it.short,
                    "full": it.full,
                    "description": it.description or "",
                    "synonyms": it.synonyms or []
                }
                for it in db_items
            ]
            self.save_raw(data)
        except Exception as e:
            print(f"[AbbreviationManager Sync Warning] Lỗi đồng bộ DB sang JSON: {e}")
        finally:
            db.close()

    def get_categories(self) -> Dict[str, str]:
        """Lấy danh mục các nhóm từ điển."""
        data = self.load_raw()
        return data.get("categories", {
            "cong_trinh": "Mã / Tên công trình",
            "cau_kien": "Tên cấu kiện mộc",
            "de_nham": "Từ dễ nhầm (Cấu kiện vs Công trình)",
            "go_tron_quy_cach": "Quy cách & Gỗ tròn",
            "ghi_chu": "Ghi chú & Đơn vị"
        })


    def get_items(
        self,
        category: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Lấy danh sách các từ viết tắt.
        Ưu tiên đọc từ CSDL (SQLite/PostgreSQL), nếu mất kết nối tự động đọc từ JSON.
        """
        if is_db_connected():
            db = SessionLocal()
            try:
                db_items = get_db_abbreviations(db, category=category, search=search)
                return [
                    {
                        "id": it.id,
                        "category": it.category,
                        "short": it.short,
                        "full": it.full,
                        "description": it.description or "",
                        "synonyms": it.synonyms or []
                    }
                    for it in db_items
                ]
            except Exception as e:
                print(f"[AbbreviationManager DB Error] Lỗi đọc từ CSDL, chuyển sang file JSON: {e}")
            finally:
                db.close()

        # Fallback đọc từ JSON
        data = self.load_raw()
        items = data.get("items", [])

        if category and category != "all":
            items = [item for item in items if item.get("category") == category]

        if search:
            q = search.lower().strip()
            def match(item: Dict[str, Any]) -> bool:
                short = str(item.get("short", "")).lower()
                full = str(item.get("full", "")).lower()
                desc = str(item.get("description", "")).lower()
                syns = " ".join(item.get("synonyms", [])).lower()
                return q in short or q in full or q in desc or q in syns

            items = [item for item in items if match(item)]

        return items

    def get_item(self, item_id: str) -> Optional[Dict[str, Any]]:
        """Lấy chi tiết 1 từ theo ID (từ CSDL hoặc JSON)."""
        if is_db_connected():
            db = SessionLocal()
            try:
                it = db.query(Abbreviation).filter(Abbreviation.id == item_id).first()
                if it:
                    return {
                        "id": it.id,
                        "category": it.category,
                        "short": it.short,
                        "full": it.full,
                        "description": it.description or "",
                        "synonyms": it.synonyms or []
                    }
            finally:
                db.close()

        # Fallback JSON
        data = self.load_raw()
        for item in data.get("items", []):
            if item.get("id") == item_id:
                return item
        return None

    def add_item(self, item_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Thêm mới hoặc cập nhật 1 từ viết tắt vào CSDL SQLite và đồng bộ ra JSON.
        """
        short_val = str(item_dict.get("short", "")).strip()
        cat_val = str(item_dict.get("category", "cong_trinh")).strip()

        if not short_val:
            raise ValueError("Từ viết tắt (short) không được để trống.")

        item_id = item_dict.get("id") or f"{cat_val[:2]}_{uuid.uuid4().hex[:6]}"
        synonyms = item_dict.get("synonyms", [])
        if isinstance(synonyms, str):
            synonyms = [s.strip() for s in synonyms.split(",") if s.strip()]

        clean_item = {
            "id": item_id,
            "category": cat_val,
            "short": short_val,
            "full": str(item_dict.get("full", "")).strip(),
            "description": str(item_dict.get("description", "")).strip(),
            "synonyms": synonyms
        }

        if is_db_connected():
            db = SessionLocal()
            try:
                saved = save_db_abbreviation(db, clean_item)
                clean_item = {
                    "id": saved.id,
                    "category": saved.category,
                    "short": saved.short,
                    "full": saved.full,
                    "description": saved.description or "",
                    "synonyms": saved.synonyms or []
                }
            finally:
                db.close()

        # Đồng bộ ra file JSON
        data = self.load_raw()
        items = data.get("items", [])
        existing_idx = next((i for i, it in enumerate(items) if it.get("id") == item_id), None)
        if existing_idx is not None:
            items[existing_idx] = clean_item
        else:
            items.append(clean_item)
        data["items"] = items
        self.save_raw(data)

        return clean_item

    def update_item(self, item_id: str, item_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Cập nhật thông tin 1 từ viết tắt trong CSDL và file JSON."""
        item_dict["id"] = item_id
        return self.add_item(item_dict)

    def delete_item(self, item_id: str) -> bool:
        """Xóa 1 từ viết tắt theo ID khỏi CSDL SQLite và file JSON."""
        db_success = False
        if is_db_connected():
            db = SessionLocal()
            try:
                db_success = delete_db_abbreviation(db, item_id)
            finally:
                db.close()

        # Xóa trong file JSON
        data = self.load_raw()
        items = data.get("items", [])
        new_items = [it for it in items if it.get("id") != item_id]
        json_success = len(new_items) != len(items)

        if json_success:
            data["items"] = new_items
            self.save_raw(data)

        return db_success or json_success

    def reset_to_defaults(self) -> Dict[str, Any]:
        """Khôi phục lại bộ từ điển mặc định ban đầu vào CSDL SQLite và JSON."""
        if not BACKUP_DEFAULT_FILE.exists():
            return self.load_raw()

        content = json.loads(BACKUP_DEFAULT_FILE.read_text(encoding="utf-8"))
        default_items = content.get("items", [])

        if is_db_connected():
            db = SessionLocal()
            try:
                db.query(Abbreviation).delete()
                for it in default_items:
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
            except Exception as e:
                db.rollback()
                print(f"[AbbreviationManager Error] Lỗi khôi phục mặc định CSDL: {e}")
            finally:
                db.close()

        # Khôi phục file JSON
        shutil.copy2(BACKUP_DEFAULT_FILE, self.dict_path)
        return self.load_raw()

    def get_prompt_context(self) -> str:
        """
        Sinh khối văn bản huấn luyện từ viết tắt (Grounding Context)
        đọc trực tiếp từ CSDL SQLite/PostgreSQL để nạp vào Prompt của Gemini OCR.
        """
        items = self.get_items()
        categories = self.get_categories()

        if not items:
            return ""

        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for it in items:
            cat = it.get("category", "khac")
            grouped.setdefault(cat, []).append(it)

        lines = [
            "============================================================",
            "BỘ TỪ ĐIỂN TỪ VIẾT TẮT & THUẬT NGỮ CHUYÊN NGÀNH (HUẤN LUYỆN)",
            "============================================================",
            "Biểu mẫu xẻ gỗ có nhiều ký hiệu viết tắt đặc thù xưởng mộc và công trình.",
            "Khi gặp chữ viết tay mờ hoặc nét có thể đọc thành nhiều cách, HÃY ƯU TIÊN ĐỐI CHIẾU với danh mục sau:",
            ""
        ]

        cat_order = ["de_nham", "cong_trinh", "cau_kien", "go_tron_quy_cach", "ghi_chu"]
        for cat_key in cat_order:
            if cat_key not in grouped:
                continue
            cat_name = categories.get(cat_key, cat_key.upper())
            lines.append(f"• {cat_name.upper()}:")
            for it in grouped[cat_key]:
                short = it.get("short", "")
                full = it.get("full", "")
                syns = it.get("synonyms", [])
                desc = it.get("description", "")

                entry = f"  - \"{short}\""
                if full and full != short:
                    entry += f" -> {full}"
                extra_notes = []
                if syns:
                    extra_notes.append(f"biến thể dễ nhầm: {', '.join(syns)}")
                if desc:
                    extra_notes.append(desc)
                if extra_notes:
                    entry += f" ({'; '.join(extra_notes)})"

                lines.append(entry)
            lines.append("")

        for cat_key, it_list in grouped.items():
            if cat_key in cat_order:
                continue
            cat_name = categories.get(cat_key, cat_key.upper())
            lines.append(f"• {cat_name.upper()}:")
            for it in it_list:
                short = it.get("short", "")
                full = it.get("full", "")
                lines.append(f"  - \"{short}\" -> {full}")
            lines.append("")

        lines.extend([
            "QUY TẮC BẮT BUỘC ĐẶC TRỊ TỪ DỄ NHẦM LẪN:",
            "1. PHÂN BIỆT CỘT 'CÔNG TRÌNH' VS 'TÊN CẤU KIỆN':",
            "   - 'Cửa Nga My', 'Chùa Dâu', 'Cổ Ngõa', 'Bùi Xá', 'Ức Lý', 'Lầu Xá', 'Hạ Vũ'... LUÔN là CÔNG TRÌNH.",
            "   - Tuyệt đối KHÔNG cắt chữ 'Cửa' trong 'Cửa Nga My' sang cột ten_cau_kien.",
            "   - Cấu kiện tại các dòng 'Cửa Nga My' thực chất là: cái đứng, khuôn ngang, khung ngang, đố, ván bưng, ván huỳnh...",
            "2. CẤU KIỆN MỘC CỔ TRUYỀN DỄ ĐỌC SAI:",
            "   - 'thg lương', 'thg lg', 'TL' -> Thượng Lương (Đòn nóc). Đi kèm: 'đầu thg lương', 'thg lg (BS)', 'dép TL' (Dép Thượng Lương).",
            "   - 'con chg', 'con chông' -> Con Chồng (Thanh gối ngàm trong vì nóc). KHÔNG đọc thành 'con chuồng' hay 'con chong'.",
            "   - 'khoá giang', 'quá giang' -> Quá Giang / Khóa Giang.",
            "   - 'tàu dừa' -> Tàu Dừa (Thanh hoành đỡ diềm ngói).",
            "   - 'bẩy mái', 'bay mai' -> Bảy Mái / Bẩy Mái.",
            "   - 'lá mái' -> Lá Mái (Ván lót ngói).",
            "   - 'cột trốn', 'trụ trốn' -> Cột Trốn / Trụ Trốn (Cột lửng gác trên quá giang).",
            "   - 'đầu dôi' -> Đầu Dôi (Phần xà/dầm nhô ra ngoài).",
            "3. KÝ HIỆU KỸ THUẬT & VIẾT TẮT:",
            "   - 'XTH' -> Xà Thượng (cột ten_cau_kien).",
            "   - 'XKH' -> Xà Khóa (cột ten_cau_kien).",
            "   - '(PS)' -> Phát Sinh. Ví dụ: 'Hoành (PS)', 'xà hạ (PS)'. Giữ nguyên trong cột cấu kiện, KHÔNG tách sang công trình.",
            "   - '(BS)' -> Bổ Sung. Ví dụ: 'thg lg (BS)'.",
            "   - '(đôi)' -> Cặp đôi. Ví dụ: 'Ức Lý (đôi)', 'Cầu dâu (đôi)'.",
            "============================================================"
        ])

        return "\n".join(lines)

    def get_custom_prompt(self) -> Optional[str]:
        """Lấy prompt tùy chỉnh do người dùng lưu trong SQLite/PostgreSQL (nếu có)."""
        if is_db_connected():
            db = SessionLocal()
            try:
                val = get_system_setting(db, "custom_ocr_prompt")
                if val and val.strip():
                    return val.strip()
            except Exception as e:
                print(f"[AbbreviationManager Error] Lỗi đọc custom prompt từ DB: {e}")
            finally:
                db.close()
        return None

    def save_custom_prompt(self, prompt_text: str) -> bool:
        """Lưu prompt tùy chỉnh vào SQLite/PostgreSQL."""
        if is_db_connected():
            db = SessionLocal()
            try:
                set_system_setting(
                    db,
                    key="custom_ocr_prompt",
                    value=prompt_text.strip(),
                    description="Prompt Gemini OCR tùy chỉnh bởi người dùng trên Web"
                )
                return True
            except Exception as e:
                print(f"[AbbreviationManager Error] Lỗi lưu custom prompt vào DB: {e}")
                raise e
            finally:
                db.close()
        return False

    def reset_custom_prompt(self) -> bool:
        """Xóa prompt tùy chỉnh để quay về prompt mặc định của hệ thống."""
        if is_db_connected():
            db = SessionLocal()
            try:
                delete_system_setting(db, "custom_ocr_prompt")
                return True
            except Exception as e:
                print(f"[AbbreviationManager Error] Lỗi reset custom prompt: {e}")
                raise e
            finally:
                db.close()
        return False

    def get_effective_prompt_context(self) -> str:
        """
        Lấy prompt ngữ cảnh thực tế sẽ gửi tới Gemini:
        Ưu tiên prompt tùy chỉnh nếu có, ngược lại sinh prompt mặc định từ từ điển.
        """
        custom = self.get_custom_prompt()
        if custom:
            return custom
        return self.get_prompt_context()


    def normalize_term(self, term: str, category: Optional[str] = None) -> str:
        """
        Tra cứu và chuẩn hóa một từ viết tắt sang tên đầy đủ (từ CSDL SQLite).
        Nếu không có, giữ nguyên từ gốc.
        """
        if not term:
            return ""

        clean_term = term.strip()
        items = self.get_items(category=category)

        for it in items:
            short = it.get("short", "").strip()
            full = it.get("full", "").strip()
            synonyms = [s.strip().lower() for s in it.get("synonyms", [])]

            if clean_term.lower() == short.lower() or clean_term.lower() in synonyms:
                return full if full else short

        return clean_term


# Khởi tạo singleton mặc định
abbreviation_mgr = AbbreviationManager()
