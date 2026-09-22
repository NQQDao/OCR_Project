# ============================================================
# test_web_full.py
# Kịch bản kiểm thử (Test Case) toàn diện cho Giao diện Web & API
# ============================================================

import sys
import json
import httpx

# Đảm bảo hiển thị tiếng Việt trên Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_URL = "http://127.0.0.1:8000"


def test_web_interface():
    print("=" * 70)
    print("BẮT ĐẦU THỬ NGHIỆM GIAO DIỆN WEB & CÁC API TƯƠNG TÁC (HTTP)")
    print(f"Địa chỉ kiểm thử: {BASE_URL}")
    print("=" * 70)

    client = httpx.Client(base_url=BASE_URL, timeout=10.0)

    try:
        # TEST 1: Tải trang chủ giao diện Web (GET /)
        print("\n[Test 1] Kiểm tra trang chủ Web UI (GET /)...")
        res_home = client.get("/")
        assert res_home.status_code == 200, f"LỖI: Mã phản hồi {res_home.status_code}"
        html_content = res_home.text
        print(f" -> Tải trang thành công (200 OK) - Dung lượng: {len(html_content)} bytes")

        # Kiểm tra các thành phần giao diện quan trọng trên HTML
        print("\n[Test 2] Kiểm định các thành phần giao diện Web quan trọng...")
        checks = {
            "Chuẩn hóa thuật ngữ 'Số xẻ' (thay vì Số xe)": "Số xẻ" in html_content,
            "Thanh công cụ Kính lúp (magnifierToggleBtn)": "magnifierToggleBtn" in html_content and "imageMagnifier" in html_content,
            "Thanh trượt Zoom ảnh (zoomSlider)": "zoomSlider" in html_content,
            "Cửa sổ Lightbox phóng to toàn màn hình": "image-lightbox-modal" in html_content,
            "Tab Điều hướng (Workspace & Lịch sử)": "tabBtnWorkspace" in html_content and "tabBtnHistory" in html_content,
            "Bảng Quản lý Lịch sử phiếu xẻ (history-table)": "history-table" in html_content,
            "Tính năng Xuất Excel hàng loạt (btnExportBatchHistory)": "btnExportBatchHistory" in html_content,
            "Modal Quản lý Từ điển Viết tắt (dictModal)": "dictModal" in html_content,
            "Tab Xem Prompt AI trực quan (tabDictPrompt)": "tabDictPrompt" in html_content,
        }

        all_passed = True
        for name, passed in checks.items():
            status = "✓ ĐẠT" if passed else "✗ THIẾU"
            print(f"   • {name:50}: {status}")
            if not passed:
                all_passed = False
        assert all_passed, "LỖI: Một số thành phần giao diện Web bị thiếu!"
        print(" -> Giao diện HTML đáp ứng đầy đủ 100% tính năng yêu cầu.")

        # TEST 3: Kiểm tra trạng thái CSDL (GET /api/database/status)
        print("\n[Test 3] Kiểm tra trạng thái kết nối CSDL (GET /api/database/status)...")
        res_db = client.get("/api/database/status")
        assert res_db.status_code == 200
        db_data = res_db.json()
        print(f" -> Trạng thái: {db_data.get('status')} | Loại DB: {db_data.get('db_type')} | Chi tiết: {db_data.get('details')}")
        assert db_data.get("status") == "connected", "LỖI: CSDL chưa kết nối!"
        assert db_data.get("db_type") == "sqlite", "LỖI: Loại CSDL không phải sqlite!"

        # TEST 4: Kiểm tra tải danh sách từ điển trên Web (GET /api/abbreviations)
        print("\n[Test 4] Kiểm tra tải danh sách Từ điển viết tắt (GET /api/abbreviations)...")
        res_abbrev = client.get("/api/abbreviations")
        assert res_abbrev.status_code == 200
        abbrev_data = res_abbrev.json()
        items_list = abbrev_data.get("items", [])
        print(f" -> Danh sách từ điển hiện hành: {len(items_list)} mục (Danh mục: {len(abbrev_data.get('categories', {}))})")
        assert len(items_list) >= 21, f"LỖI: Thiếu dữ liệu từ điển ban đầu ({len(items_list)} mục)!"

        # TEST 5: Mô phỏng người dùng tạo từ viết tắt mới trên Web UI (POST /api/abbreviations)
        print("\n[Test 5] Mô phỏng người dùng thêm từ viết tắt mới qua Modal Web...")
        new_term_payload = {
            "category": "cau_kien",
            "short": "TEST_WEB",
            "full": "Kiểm Thử Web UI Tự Động",
            "description": "Thanh gỗ kiểm thử giao diện",
            "synonyms": ["TEST_W", "TEST_UI"]
        }
        res_add = client.post("/api/abbreviations", json=new_term_payload)
        assert res_add.status_code in [200, 201], f"LỖI: Không thể thêm từ! {res_add.text}"
        added_data = res_add.json()
        created_id = added_data.get("item", {}).get("id") or added_data.get("id")
        print(f" -> Đã lưu từ viết tắt mới thành công! ID: {created_id}")

        # TEST 6: Kiểm tra tab 'Xem Prompt AI' trên Web (GET /api/abbreviations/prompt-preview)
        print("\n[Test 6] Kiểm tra tab 'Xem Prompt AI' cập nhật từ điển thời gian thực...")
        res_prompt = client.get("/api/abbreviations/prompt-preview")
        assert res_prompt.status_code == 200
        prompt_data = res_prompt.json()
        prompt_text = prompt_data.get("prompt_text", "")
        default_prompt = prompt_data.get("default_prompt", "")
        assert '"TEST_WEB" -> Kiểm Thử Web UI Tự Động' in (default_prompt or prompt_text), "LỖI: Prompt chưa đồng bộ từ mới!"
        print(" -> Tab 'Xem Prompt AI' đã cập nhật ngay lập tức từ điển vừa thêm!")


        # TEST 7: Xóa từ thử nghiệm (DELETE /api/abbreviations/{id})
        print("\n[Test 7] Mô phỏng người dùng bấm nút xóa từ trong Modal...")
        res_del = client.delete(f"/api/abbreviations/{created_id}")
        assert res_del.status_code == 200, "LỖI: Không thể xóa từ vừa thêm!"
        print(f" -> Đã xóa thành công từ có ID: {created_id}")

        # TEST 8: Kiểm tra tải danh sách lịch sử phiếu xẻ (GET /api/documents)
        print("\n[Test 8] Kiểm tra tab '📂 Lịch sử phiếu xẻ' tải dữ liệu (GET /api/documents)...")
        res_docs = client.get("/api/documents?skip=0&limit=10")
        assert res_docs.status_code == 200
        docs_data = res_docs.json()
        print(f" -> Tải thành công! Tổng số phiếu trong CSDL: {docs_data.get('total')} phiếu (Trạng thái: {docs_data.get('status')})")

        # TEST 9: Kiểm tra tính năng Xuất Excel Batch (POST /api/excel/batch)
        print("\n[Test 9] Kiểm tra API xuất Excel phiếu xẻ gỗ (POST /api/excel/batch)...")
        from pathlib import Path
        output_dir = Path("output")
        output_dir.mkdir(exist_ok=True)
        test_json_file = output_dir / "test_web_phiếu_x01.json"
        sample_doc_content = {
            "thong_tin_phieu": {
                "so_xe": "X-88",
                "ngay_xe": "21/09/2026",
                "kich_thuoc_go_tron": "D35 x L4.2m",
                "khoi_luong_go_tron": "0.404",
                "kich_thuoc_xe": "5x15, 8x20"
            },
            "chi_tiet_cau_kien": [
                {
                    "dong": 1,
                    "ngay": "21/09",
                    "kich_thuoc_so_luong": "5x15x2.5m - 10 thanh",
                    "khoi_luong": "0.1875",
                    "cong_trinh": "Nhà gỗ A",
                    "ten_cau_kien": "Xà gồ mái",
                    "ghi_chu": "Gỗ Căm xẻ loại 1"
                }
            ]
        }
        test_json_file.write_text(json.dumps(sample_doc_content, ensure_ascii=False, indent=2), encoding="utf-8")

        try:
            excel_payload = {"json_files": [test_json_file.name]}
            res_excel = client.post("/api/excel/batch", json=excel_payload)
            assert res_excel.status_code == 200, f"Lỗi xuất Excel: {res_excel.text}"
            assert "spreadsheetml" in res_excel.headers.get("content-type", "")
            print(f" -> Xuất Excel thành công! Kích thước file Excel nhận được: {len(res_excel.content)} bytes")
        finally:
            if test_json_file.exists():
                test_json_file.unlink()

        # TEST 10: Kiểm tra API truy vấn chi tiết phiếu không tồn tại (404 Not Found)
        print("\n[Test 10] Kiểm tra xử lý an toàn lỗi 404 (GET /api/documents/999999)...")
        res_404 = client.get("/api/documents/999999")
        assert res_404.status_code == 404
        print(" -> Trả về mã lỗi 404 an toàn chính xác: OK")

        print("\n" + "=" * 70)
        print("TẤT CẢ 10 TEST CASE TRÊN GIAO DIỆN WEB & API ĐÃ HOÀN TOÀN VƯỢT QUA (100% PASSED)!")
        print("=" * 70)

    finally:
        client.close()


if __name__ == "__main__":
    test_web_interface()
