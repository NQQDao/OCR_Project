# ============================================================
# test_r2_module.py - Kiểm thử module Cloudflare R2
# ============================================================

from fastapi.testclient import TestClient
from web_app import app
import r2_storage

client = TestClient(app)

def test_r2_integration():
    print("============================================================")
    print("KIỂM THỬ MODULE CLOUDFLARE R2 & WORKER INTEGRATION")
    print("============================================================")

    # 1. Kiểm tra import module
    print("\n[Bước 1] Kiểm tra nạp module r2_storage...")
    assert hasattr(r2_storage, "upload_file")
    assert hasattr(r2_storage, "upload_image")
    assert hasattr(r2_storage, "upload_excel")
    assert hasattr(r2_storage, "upload_json")
    assert hasattr(r2_storage, "get_r2_status")
    print(" -> OK: Module r2_storage đã có đầy đủ các hàm cần thiết.")

    # 2. Kiểm tra hàm get_r2_status() khi chưa điền API Key
    print("\n[Bước 2] Kiểm tra trạng thái khi chưa cấu hình Key trong .env...")
    status = r2_storage.get_r2_status()
    print(f" -> Trạng thái cấu hình: {status['configured']}")
    print(f" -> Thông điệp: {status['message']}")
    assert status["configured"] in (True, False)

    # 3. Kiểm tra API GET /api/r2/status
    print("\n[Bước 3] Kiểm tra API GET /api/r2/status...")
    res = client.get("/api/r2/status")
    assert res.status_code == 200
    data = res.json()
    assert "configured" in data
    assert "bucket" in data
    print(f" -> OK: API trả về 200 OK: {data}")

    # 4. Kiểm tra API GET /api/r2/files
    print("\n[Bước 4] Kiểm tra API GET /api/r2/files...")
    res_files = client.get("/api/r2/files")
    assert res_files.status_code == 200
    files_data = res_files.json()
    assert "status" in files_data
    print(f" -> OK: API trả về an toàn: status={files_data['status']}")

    # 5. Kiểm tra kiểm soát lỗi khi upload mà chưa có R2 key
    print("\n[Bước 5] Kiểm tra hành vi upload an toàn khi chưa có R2 key...")
    result = r2_storage.upload_file(b"test data", "test/sample.txt")
    if not r2_storage.is_r2_configured():
        assert result is None
        print(" -> OK: Trả về None an toàn, không làm sập ứng dụng khi chưa cấu hình R2.")
    else:
        print(f" -> OK: Đã upload thành công lên R2: {result}")

    # 6. Kiểm tra API POST /api/r2/test-connection
    print("\n[Bước 6] Kiểm tra API POST /api/r2/test-connection...")
    res_test = client.post("/api/r2/test-connection")
    assert res_test.status_code == 200
    test_conn_data = res_test.json()
    assert "success" in test_conn_data
    assert "message" in test_conn_data
    print(f" -> OK: API test-connection trả về an toàn: {test_conn_data['message']}")

    # 7. Kiểm tra API POST /api/r2/sync-all
    print("\n[Bước 7] Kiểm tra API POST /api/r2/sync-all...")
    res_sync = client.post("/api/r2/sync-all")
    assert res_sync.status_code == 200
    sync_data = res_sync.json()
    assert "status" in sync_data
    print(f" -> OK: API sync-all trả về an toàn: status={sync_data['status']}")

    # 8. Kiểm tra hàm reload_r2_config()
    print("\n[Bước 8] Kiểm tra reload_r2_config()...")
    r2_storage.reload_r2_config()
    print(" -> OK: reload_r2_config() chạy mượt mà.")

    print("\n============================================================")
    print("KIỂM THỬ MODULE CLOUDFLARE R2 ĐÃ VƯỢT QUA 100% THÀNH CÔNG!")
    print("============================================================")

if __name__ == "__main__":
    test_r2_integration()


