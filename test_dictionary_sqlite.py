# ============================================================
# test_dictionary_sqlite.py
# Kịch bản kiểm thử (Test Case) tự động cho Từ điển SQLite
# ============================================================

import sys
from pathlib import Path

# Đảm bảo hiển thị tiếng Việt trên console Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from database import SessionLocal, is_db_connected, DB_TYPE
from models import Abbreviation
from abbreviation_manager import abbreviation_mgr


def run_test_case():
    print("=" * 65)
    print(f"BẮT ĐẦU KIỂM THỬ TỪ ĐIỂN VỚI CSDL {DB_TYPE.upper()}")
    print("=" * 65)

    # 1. Kiểm tra kết nối CSDL
    print("\n[Bước 1] Kiểm tra kết nối CSDL...")
    assert is_db_connected() is True, "LỖI: Chưa kết nối được CSDL!"
    print(" -> Kết nối CSDL thành công: OK")

    # 2. Đọc số lượng từ điển hiện tại từ SQLite
    print("\n[Bước 2] Đọc từ điển trực tiếp từ bảng 'abbreviations' (SQLite)...")
    items_before = abbreviation_mgr.get_items()
    count_before = len(items_before)
    print(f" -> Số lượng từ hiện có trong SQLite: {count_before} từ")
    assert count_before >= 21, "LỖI: CSDL thiếu dữ liệu từ điển ban đầu!"

    # 3. Thêm mới 1 từ viết tắt chuyên ngành xẻ gỗ vào SQLite
    test_term = {
        "id": "test_xg_01",
        "category": "cau_kien",
        "short": "XG",
        "full": "Xà gồ mái nhà gỗ",
        "description": "Thanh xà gồ đỡ rui mè trên mái",
        "synonyms": ["XA_GO", "X_GO"]
    }
    print(f"\n[Bước 3] Thêm mới từ viết tắt: '{test_term['short']}' -> '{test_term['full']}'...")
    saved_item = abbreviation_mgr.add_item(test_term)
    print(f" -> Thêm thành công vào hệ thống với ID: {saved_item['id']}")

    # 4. Truy vấn trực tiếp bằng SQLAlchemy để chứng minh dữ liệu đã nằm trong SQLite
    print("\n[Bước 4] Xác thực trực tiếp trong tệp CSDL SQLite 'ocr_data.db'...")
    db = SessionLocal()
    try:
        db_record = db.query(Abbreviation).filter(Abbreviation.short == "XG").first()
        assert db_record is not None, "LỖI: Dữ liệu chưa được ghi vào SQLite!"
        print(f" -> Đã tìm thấy bản ghi trong SQLite:")
        print(f"    • ID: {db_record.id}")
        print(f"    • Từ viết tắt: {db_record.short}")
        print(f"    • Tên đầy đủ: {db_record.full}")
        print(f"    • Nhóm: {db_record.category}")
        print(f"    • Biến thể dễ nhầm: {db_record.synonyms}")
        print(" -> Xác thực trong file SQLite: THÀNH CÔNG")
    finally:
        db.close()

    # 5. Kiểm tra hàm chuẩn hóa từ viết tắt
    print("\n[Bước 5] Kiểm tra hàm chuẩn hóa normalize_term()...")
    normalized = abbreviation_mgr.normalize_term("XG", category="cau_kien")
    assert normalized == "Xà gồ mái nhà gỗ", f"LỖI: Chuẩn hóa thất bại, nhận được: {normalized}"
    print(f" -> normalize_term('XG') => '{normalized}': CHÍNH XÁC")

    # 6. Kiểm tra khối Prompt huấn luyện Gemini OCR
    print("\n[Bước 6] Kiểm tra khối Prompt ngữ cảnh gửi sang Gemini OCR...")
    prompt_context = abbreviation_mgr.get_prompt_context()
    assert '"XG" -> Xà gồ mái nhà gỗ' in prompt_context, "LỖI: Từ mới chưa xuất hiện trong Prompt!"
    print(" -> Khối Prompt OCR đã tự động tích hợp từ mới từ SQLite: CHÍNH XÁC")

    # 7. Xóa từ thử nghiệm để trả về trạng thái ban đầu
    print("\n[Bước 7] Dọn dẹp: Xóa từ viết tắt thử nghiệm khỏi SQLite...")
    deleted = abbreviation_mgr.delete_item("test_xg_01")
    assert deleted is True, "LỖI: Không thể xóa bản ghi khỏi SQLite!"
    
    # Xác thực đã xóa trong SQLite
    db = SessionLocal()
    try:
        db_record_after = db.query(Abbreviation).filter(Abbreviation.id == "test_xg_01").first()
        assert db_record_after is None, "LỖI: Bản ghi vẫn còn tồn tại trong SQLite sau khi xóa!"
        print(" -> Đã xóa sạch bản ghi thử nghiệm khỏi CSDL: OK")
    finally:
        db.close()

    # 8. Kết luận
    items_after = abbreviation_mgr.get_items()
    assert len(items_after) == count_before, "LỖI: Số lượng từ sau khi xóa không khớp ban đầu!"
    print("\n" + "=" * 65)
    print("KẾT QUẢ: TẤT CẢ CÁC BƯỚC KIỂM THỬ SQLITE ĐỀU THÀNH CÔNG (PASSED 100%)!")
    print("=" * 65)


if __name__ == "__main__":
    run_test_case()

