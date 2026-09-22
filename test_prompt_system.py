# ============================================================
# test_prompt_system.py - Kiểm thử tính năng Prompt tùy chỉnh & Từ dễ nhầm
# ============================================================

import sys
from fastapi.testclient import TestClient

from web_app import app
from abbreviation_manager import abbreviation_mgr
from ocr import get_ocr_prompt
from database import SessionLocal, is_db_connected
from models import SystemSetting, Abbreviation

client = TestClient(app)

def test_prompt_system():
    print("============================================================")
    print("KIỂM THỬ HỆ THỐNG PROMPT TÙY CHỈNH & TỪ ĐIỂN TỪ DỄ NHẦM")
    print("============================================================")

    # 1. Kiểm tra danh mục từ dễ nhầm "de_nham"
    print("\n[Bước 1] Kiểm tra danh mục 'de_nham' trong từ điển...")
    categories = abbreviation_mgr.get_categories()
    assert "de_nham" in categories, "LỖI: Chưa có danh mục de_nham!"
    print(f" -> OK: Danh mục 'de_nham' đã có: '{categories['de_nham']}'")

    de_nham_items = abbreviation_mgr.get_items(category="de_nham")
    print(f" -> Số lượng từ dễ nhầm trong CSDL: {len(de_nham_items)}")
    assert len(de_nham_items) > 0, "LỖI: Chưa nạp từ dễ nhầm vào CSDL!"
    for it in de_nham_items:
        print(f"    • {it['short']} -> {it['full']}")

    # 2. Kiểm tra Prompt mặc định có chứa các quy tắc chống nhầm
    print("\n[Bước 2] Kiểm tra prompt mặc định được sinh tự động...")
    default_prompt = abbreviation_mgr.get_prompt_context()
    assert "QUY TẮC BẮT BUỘC ĐẶC TRỊ TỪ DỄ NHẦM LẪN" in default_prompt, "LỖI: Thiếu quy tắc đặc trị từ dễ nhầm!"
    assert "Cửa Nga My" in default_prompt, "LỖI: Thiếu quy tắc Cửa Nga My!"
    assert "Thượng Lương" in default_prompt, "LỖI: Thiếu Thượng Lương!"
    print(" -> OK: Prompt mặc định đã tích hợp đầy đủ quy tắc mộc cổ truyền và chống nhầm.")

    # 3. Kiểm tra API GET /api/abbreviations/prompt-preview
    print("\n[Bước 3] Kiểm tra GET /api/abbreviations/prompt-preview...")
    res = client.get("/api/abbreviations/prompt-preview")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "prompt_text" in data
    print(f" -> OK: API trả về thành công (is_custom: {data.get('is_custom')})")

    # 4. Kiểm tra lưu Prompt tùy chỉnh (POST /api/prompt/custom)
    print("\n[Bước 4] Kiểm tra người dùng chỉnh sửa và lưu Prompt tùy chỉnh...")
    custom_rule = "QUY TẮC TỰ ĐẶT: 'Cửa Nga My' luôn là CÔNG TRÌNH; 'thg lương' = Thượng Lương."
    res_save = client.post("/api/prompt/custom", json={"prompt_text": custom_rule})
    assert res_save.status_code == 200, f"Lỗi lưu: {res_save.text}"
    print(" -> OK: Đã lưu custom prompt qua API.")

    # 5. Kiểm tra tính bền vững trong SQLite (bảng system_settings)
    print("\n[Bước 5] Kiểm tra trực tiếp bảng system_settings trong CSDL SQLite...")
    db = SessionLocal()
    try:
        setting = db.query(SystemSetting).filter(SystemSetting.key == "custom_ocr_prompt").first()
        assert setting is not None, "LỖI: Không tìm thấy bản ghi trong system_settings!"
        assert setting.value == custom_rule, "LỖI: Giá trị lưu trong DB không khớp!"
        print(f" -> OK: CSDL SQLite đã lưu chính xác bản ghi: key='{setting.key}', value='{setting.value[:50]}...'")
    finally:
        db.close()

    # 6. Kiểm tra get_ocr_prompt() áp dụng ngay lập tức
    print("\n[Bước 6] Kiểm tra get_ocr_prompt() cập nhật theo Prompt tùy chỉnh...")
    active_prompt = get_ocr_prompt()
    assert custom_rule in active_prompt, "LỖI: get_ocr_prompt() chưa dùng custom prompt!"
    print(" -> OK: Gemini OCR sẽ nhận đúng Prompt tùy chỉnh người dùng vừa lưu.")

    # 7. Kiểm tra khôi phục Prompt về mặc định (POST /api/prompt/reset)
    print("\n[Bước 7] Kiểm tra chức năng 'Khôi phục mặc định'...")
    res_reset = client.post("/api/prompt/reset")
    assert res_reset.status_code == 200
    reset_data = res_reset.json()
    assert reset_data["is_custom"] is False
    assert "QUY TẮC BẮT BUỘC ĐẶC TRỊ TỪ DỄ NHẦM LẪN" in reset_data["prompt_text"]

    # Kiểm tra lại DB sau khi reset
    db = SessionLocal()
    try:
        setting_after = db.query(SystemSetting).filter(SystemSetting.key == "custom_ocr_prompt").first()
        assert setting_after is None, "LỖI: Bản ghi custom_ocr_prompt chưa được xóa khỏi DB sau khi reset!"
        print(" -> OK: Đã xóa custom prompt trong SQLite, quay lại Prompt tự sinh từ từ điển.")
    finally:
        db.close()

    print("\n============================================================")
    print("TẤT CẢ 7 BƯỚC KIỂM THỬ ĐÃ VƯỢT QUA 100% THÀNH CÔNG!")
    print("============================================================")

if __name__ == "__main__":
    test_prompt_system()

