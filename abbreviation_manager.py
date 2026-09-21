# ============================================================
# abbreviation_manager.py
# Quản lý bộ từ điển "Huấn Luyện chữ viết tắt" cho OCR_Project
# ============================================================

from __future__ import annotations

import json
import re
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent
DICT_FILE = BASE_DIR / "abbreviations.json"
BACKUP_DEFAULT_FILE = BASE_DIR / "abbreviations_default.json"


class AbbreviationManager:
    """
    Quản lý lưu trữ, truy vấn, và sinh Prompt Huấn Luyện từ điển chữ viết tắt.
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
            # Tự động tạo bản sao lưu mặc định ban đầu
            shutil.copy2(self.dict_path, BACKUP_DEFAULT_FILE)

    def load_raw(self) -> Dict[str, Any]:
        """Tải dữ liệu thô từ file JSON."""
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

    def get_categories(self) -> Dict[str, str]:
        """Lấy danh mục các nhóm từ điển."""
        data = self.load_raw()
        return data.get("categories", {
            "cong_trinh": "Mã / Tên công trình",
            "cau_kien": "Tên cấu kiện mộc",
            "go_tron_quy_cach": "Quy cách & Gỗ tròn",
            "ghi_chu": "Ghi chú & Đơn vị"
        })

    def get_items(
        self,
        category: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Lấy danh sách các từ viết tắt, hỗ trợ lọc theo nhóm và tìm kiếm.
        """
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
        """Lấy chi tiết 1 từ theo ID."""
        data = self.load_raw()
        for item in data.get("items", []):
            if item.get("id") == item_id:
                return item
        return None

    def add_item(self, item_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Thêm mới 1 từ viết tắt vào từ điển.
        """
        data = self.load_raw()
        items = data.get("items", [])

        # Kiểm tra trùng lặp mã viết tắt trong cùng nhóm
        short_val = str(item_dict.get("short", "")).strip()
        cat_val = str(item_dict.get("category", "cong_trinh")).strip()

        if not short_val:
            raise ValueError("Từ viết tắt (short) không được để trống.")

        # Chuẩn bị item mới
        item_id = item_dict.get("id") or f"{cat_val[:2]}_{uuid.uuid4().hex[:6]}"
        synonyms = item_dict.get("synonyms", [])
        if isinstance(synonyms, str):
            synonyms = [s.strip() for s in synonyms.split(",") if s.strip()]

        new_item = {
            "id": item_id,
            "category": cat_val,
            "short": short_val,
            "full": str(item_dict.get("full", "")).strip(),
            "description": str(item_dict.get("description", "")).strip(),
            "synonyms": synonyms
        }

        # Nếu đã tồn tại id thì cập nhật, ngược lại thêm mới
        existing_idx = next((i for i, it in enumerate(items) if it.get("id") == item_id), None)
        if existing_idx is not None:
            items[existing_idx] = new_item
        else:
            items.append(new_item)

        data["items"] = items
        self.save_raw(data)
        return new_item

    def update_item(self, item_id: str, item_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Cập nhật thông tin 1 từ viết tắt."""
        data = self.load_raw()
        items = data.get("items", [])

        existing_idx = next((i for i, it in enumerate(items) if it.get("id") == item_id), None)
        if existing_idx is None:
            raise ValueError(f"Không tìm thấy mục có ID: {item_id}")

        synonyms = item_dict.get("synonyms", items[existing_idx].get("synonyms", []))
        if isinstance(synonyms, str):
            synonyms = [s.strip() for s in synonyms.split(",") if s.strip()]

        items[existing_idx]["category"] = item_dict.get("category", items[existing_idx].get("category"))
        items[existing_idx]["short"] = str(item_dict.get("short", items[existing_idx].get("short"))).strip()
        items[existing_idx]["full"] = str(item_dict.get("full", items[existing_idx].get("full"))).strip()
        items[existing_idx]["description"] = str(item_dict.get("description", items[existing_idx].get("description", ""))).strip()
        items[existing_idx]["synonyms"] = synonyms

        data["items"] = items
        self.save_raw(data)
        return items[existing_idx]

    def delete_item(self, item_id: str) -> bool:
        """Xóa 1 từ viết tắt theo ID."""
        data = self.load_raw()
        items = data.get("items", [])
        new_items = [it for it in items if it.get("id") != item_id]

        if len(new_items) == len(items):
            return False

        data["items"] = new_items
        self.save_raw(data)
        return True

    def reset_to_defaults(self) -> Dict[str, Any]:
        """Khôi phục lại bộ từ điển mặc định ban đầu."""
        if BACKUP_DEFAULT_FILE.exists():
            shutil.copy2(BACKUP_DEFAULT_FILE, self.dict_path)
        return self.load_raw()

    def get_prompt_context(self) -> str:
        """
        Sinh khối văn bản huấn luyện từ viết tắt (Grounding Context)
        để nạp trực tiếp vào Prompt của Gemini OCR.
        """
        data = self.load_raw()
        items = data.get("items", [])
        categories = data.get("categories", {})

        if not items:
            return ""

        # Nhóm items theo category
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

        cat_order = ["cong_trinh", "cau_kien", "go_tron_quy_cach", "ghi_chu"]
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

        # Thêm bất kỳ category nào khác chưa có trong cat_order
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
            "QUY TẮC BẮT BUỘC:",
            "1. Nhận dạng đúng các từ/ký hiệu viết tắt ở trên, KHÔNG tự ý suy diễn sai lệch thành từ vô nghĩa.",
            "2. Trong các trường như 'cong_trinh', 'ten_cau_kien', giữ nguyên cách ghi hoặc kèm mã viết tắt chính xác như trên giấy.",
            "============================================================"
        ])

        return "\n".join(lines)

    def normalize_term(self, term: str, category: Optional[str] = None) -> str:
        """
        Tra cứu và chuẩn hóa một từ viết tắt sang tên đầy đủ (nếu có trong từ điển).
        Nếu không có, giữ nguyên từ gốc.
        """
        if not term:
            return ""

        clean_term = term.strip()
        data = self.load_raw()
        items = data.get("items", [])

        for it in items:
            if category and it.get("category") != category:
                continue

            short = it.get("short", "").strip()
            full = it.get("full", "").strip()
            synonyms = [s.strip().lower() for s in it.get("synonyms", [])]

            if clean_term.lower() == short.lower() or clean_term.lower() in synonyms:
                return full if full else short

        return clean_term


# Khởi tạo singleton mặc định
abbreviation_mgr = AbbreviationManager()
