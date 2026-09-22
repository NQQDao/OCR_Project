# ============================================================
# r2_storage.py - Quản lý lưu trữ Cloudflare R2 (S3-Compatible)
# Hỗ trợ lưu trữ ảnh, file JSON và file Excel trên Cloudflare R2
# Phân phối tải tốc độ cao qua Cloudflare Worker (Zero Egress Fee)
# ============================================================

from __future__ import annotations

import os
import io
import json
import mimetypes
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

R2_ACCOUNT_ID = ""
R2_ACCESS_KEY_ID = ""
R2_SECRET_ACCESS_KEY = ""
R2_BUCKET_NAME = "ocr-vn01"
R2_ENDPOINT_URL = ""
R2_PUBLIC_URL = ""


def reload_r2_config():
    """Tải hoặc nạp lại cấu hình R2 từ file .env."""
    global R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT_URL, R2_PUBLIC_URL
    if ENV_FILE.exists():
        load_dotenv(dotenv_path=ENV_FILE, override=True)
    else:
        load_dotenv(override=True)

    R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "").strip()
    R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "ocr-vn01").strip()
    R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL", "").strip()
    R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "").strip().rstrip("/")

    # Tự động tính toán endpoint Cloudflare R2 nếu có Account ID
    if not R2_ENDPOINT_URL and R2_ACCOUNT_ID:
        R2_ENDPOINT_URL = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"


# Khởi tạo nạp cấu hình lần đầu
reload_r2_config()


def is_r2_configured() -> bool:
    """Kiểm tra xem hệ thống đã điền đủ thông tin kết nối Cloudflare R2 hay chưa."""
    reload_r2_config()
    return bool(R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and (R2_ENDPOINT_URL or R2_ACCOUNT_ID))



def get_r2_client():
    """
    Khởi tạo Boto3 S3 Client kết nối tới Cloudflare R2.
    Cloudflare R2 dùng chuẩn S3 API với signature_version='s3v4' và region_name='auto'.
    """
    if not is_r2_configured():
        return None

    try:
        import boto3
        from botocore.config import Config

        client = boto3.client(
            service_name="s3",
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"}
            )
        )
        return client
    except Exception as e:
        print(f"[R2 Error] Không thể khởi tạo boto3 S3 client: {e}")
        return None


def get_r2_status() -> Dict[str, Any]:
    """
    Kiểm tra trạng thái kết nối Cloudflare R2 thực tế.
    Trả về thông tin kết nối để hiển thị trên Web UI hoặc API.
    """
    if not is_r2_configured():
        return {
            "configured": False,
            "connected": False,
            "bucket": R2_BUCKET_NAME,
            "public_url": R2_PUBLIC_URL,
            "message": "Chưa điền R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY trong file .env"
        }

    client = get_r2_client()
    if not client:
        return {
            "configured": True,
            "connected": False,
            "bucket": R2_BUCKET_NAME,
            "public_url": R2_PUBLIC_URL,
            "message": "Lỗi khởi tạo thư viện boto3 client kết nối R2."
        }

    try:
        # Thử liệt kê 1 file để xác thực quyền
        client.list_objects_v2(Bucket=R2_BUCKET_NAME, MaxKeys=1)
        return {
            "configured": True,
            "connected": True,
            "bucket": R2_BUCKET_NAME,
            "public_url": R2_PUBLIC_URL,
            "message": f"Đã kết nối thành công tới Bucket '{R2_BUCKET_NAME}' trên Cloudflare R2."
        }
    except Exception as e:
        return {
            "configured": True,
            "connected": False,
            "bucket": R2_BUCKET_NAME,
            "public_url": R2_PUBLIC_URL,
            "message": f"Lỗi xác thực hoặc không tìm thấy Bucket '{R2_BUCKET_NAME}': {e}"
        }


def upload_file(
    file_source: Union[str, Path, bytes, io.BytesIO],
    r2_key: str,
    content_type: Optional[str] = None
) -> Optional[str]:
    """
    Tải một file hoặc dữ liệu bytes lên Cloudflare R2 bucket.
    :param file_source: Đường dẫn file cục bộ hoặc bytes dữ liệu
    :param r2_key: Đường dẫn lưu trên R2 (vd: 'images/mau_01.jpg', 'output/mau_01.xlsx')
    :param content_type: MIME type (nếu None sẽ tự động đoán theo đuôi file)
    :return: URL truy cập file (nếu có Worker) hoặc r2_key nếu thành công
    """
    client = get_r2_client()
    if not client:
        print("[R2 Warning] Cloudflare R2 chưa được cấu hình. Bỏ qua tải lên đám mây.")
        return None

    # Chuẩn hóa r2_key
    r2_key = r2_key.lstrip("/").replace("\\", "/")

    # Tự động đoán content-type nếu chưa truyền
    if not content_type:
        guessed_type, _ = mimetypes.guess_type(r2_key)
        content_type = guessed_type or "application/octet-stream"

    extra_args = {"ContentType": content_type}

    try:
        if isinstance(file_source, (str, Path)):
            local_path = Path(file_source)
            if not local_path.exists():
                raise FileNotFoundError(f"Không tìm thấy file cục bộ: {local_path}")
            client.upload_file(
                Filename=str(local_path),
                Bucket=R2_BUCKET_NAME,
                Key=r2_key,
                ExtraArgs=extra_args
            )
        elif isinstance(file_source, bytes):
            client.put_object(
                Bucket=R2_BUCKET_NAME,
                Key=r2_key,
                Body=file_source,
                **extra_args
            )
        elif isinstance(file_source, io.BytesIO):
            file_source.seek(0)
            client.put_object(
                Bucket=R2_BUCKET_NAME,
                Key=r2_key,
                Body=file_source.getvalue(),
                **extra_args
            )
        else:
            raise ValueError(f"Kiểu dữ liệu file_source không hợp lệ: {type(file_source)}")

        # Trả về link công khai qua Cloudflare Worker nếu có cấu hình
        if R2_PUBLIC_URL:
            return f"{R2_PUBLIC_URL}/{r2_key}"
        return r2_key

    except Exception as e:
        print(f"[R2 Error] Lỗi tải file '{r2_key}' lên Cloudflare R2: {e}")
        return None


def upload_image(file_source: Union[str, Path, bytes], file_name: str) -> Optional[str]:
    """Tải ảnh phiếu xẻ gỗ lên thư mục 'images/' trên R2."""
    key = f"images/{Path(file_name).name}"
    return upload_file(file_source, key)


def upload_json(json_data: Union[Dict[str, Any], str, Path], file_name: str) -> Optional[str]:
    """Tải file JSON kết quả OCR lên thư mục 'output/' trên R2."""
    key = f"output/{Path(file_name).name}"
    if isinstance(json_data, dict):
        body = json.dumps(json_data, ensure_ascii=False, indent=2).encode("utf-8")
        return upload_file(body, key, content_type="application/json; charset=utf-8")
    return upload_file(json_data, key, content_type="application/json; charset=utf-8")


def upload_excel(file_source: Union[str, Path, bytes, io.BytesIO], file_name: str) -> Optional[str]:
    """Tải file Excel báo cáo lên thư mục 'output/' trên R2."""
    key = f"output/{Path(file_name).name}"
    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return upload_file(file_source, key, content_type=content_type)


def download_file(r2_key: str, local_destination: Union[str, Path]) -> bool:
    """Tải một file từ Cloudflare R2 về đĩa cứng cục bộ."""
    client = get_r2_client()
    if not client:
        return False

    r2_key = r2_key.lstrip("/").replace("\\", "/")
    dest_path = Path(local_destination)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        client.download_file(
            Bucket=R2_BUCKET_NAME,
            Key=r2_key,
            Filename=str(dest_path)
        )
        return True
    except Exception as e:
        print(f"[R2 Error] Lỗi tải file '{r2_key}' từ R2 về '{dest_path}': {e}")
        return False


def get_file_bytes(r2_key: str) -> Optional[bytes]:
    """Đọc trực tiếp nội dung bytes của file trên Cloudflare R2."""
    client = get_r2_client()
    if not client:
        return None

    r2_key = r2_key.lstrip("/").replace("\\", "/")
    try:
        response = client.get_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
        return response["Body"].read()
    except Exception as e:
        print(f"[R2 Error] Lỗi đọc bytes '{r2_key}': {e}")
        return None


def generate_presigned_url(r2_key: str, expiration_seconds: int = 3600, http_method: str = "get_object") -> Optional[str]:
    """
    Sinh đường link tạm có chữ ký (Presigned URL) để tải hoặc xem file
    khi bucket để ở chế độ Private (không mở công khai).
    """
    client = get_r2_client()
    if not client:
        return None

    r2_key = r2_key.lstrip("/").replace("\\", "/")
    try:
        url = client.generate_presigned_url(
            ClientMethod=http_method,
            Params={"Bucket": R2_BUCKET_NAME, "Key": r2_key},
            ExpiresIn=expiration_seconds
        )
        return url
    except Exception as e:
        print(f"[R2 Error] Không thể tạo Presigned URL cho '{r2_key}': {e}")
        return None


def list_r2_files(prefix: str = "", max_keys: int = 100) -> List[Dict[str, Any]]:
    """Liệt kê danh sách file đang lưu trên Cloudflare R2 theo tiền tố thư mục."""
    client = get_r2_client()
    if not client:
        return []

    try:
        resp = client.list_objects_v2(
            Bucket=R2_BUCKET_NAME,
            Prefix=prefix,
            MaxKeys=max_keys
        )
        contents = resp.get("Contents", [])
        results = []
        for obj in contents:
            key = obj["Key"]
            public_link = f"{R2_PUBLIC_URL}/{key}" if R2_PUBLIC_URL else None
            results.append({
                "key": key,
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat() if obj.get("LastModified") else None,
                "public_url": public_link
            })
        return results
    except Exception as e:
        print(f"[R2 Error] Lỗi liệt kê file trên R2: {e}")
        return []


def delete_r2_file(r2_key: str) -> bool:
    """Xóa file khỏi Cloudflare R2 bucket."""
    client = get_r2_client()
    if not client:
        return False

    r2_key = r2_key.lstrip("/").replace("\\", "/")
    try:
        client.delete_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
        return True
    except Exception as e:
        print(f"[R2 Error] Lỗi xóa file '{r2_key}' trên R2: {e}")
        return False


def test_r2_connection() -> Dict[str, Any]:
    """
    Thực hiện kiểm tra ghi, đọc và dọn dẹp một file test nhỏ trên bucket Cloudflare R2
    để xác minh quyền đọc/ghi và kết nối Cloudflare Worker CDN.
    """
    reload_r2_config()
    if not is_r2_configured():
        return {
            "success": False,
            "configured": False,
            "bucket": R2_BUCKET_NAME,
            "public_url": R2_PUBLIC_URL,
            "message": "Chưa cấu hình thông tin R2 trong file .env (cần R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)."
        }

    client = get_r2_client()
    if not client:
        return {
            "success": False,
            "configured": True,
            "bucket": R2_BUCKET_NAME,
            "public_url": R2_PUBLIC_URL,
            "message": "Không thể kết nối S3 client tới Cloudflare R2. Vui lòng kiểm tra lại Access Key."
        }

    import time
    test_key = "system_tests/health_check.txt"
    test_content = f"Cloudflare R2 health check OK at {time.time()}".encode("utf-8")

    try:
        # Ghi file test
        client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=test_key,
            Body=test_content,
            ContentType="text/plain; charset=utf-8"
        )

        # Đọc lại để kiểm tra tính toàn vẹn
        resp = client.get_object(Bucket=R2_BUCKET_NAME, Key=test_key)
        read_bytes = resp["Body"].read()

        public_test_url = f"{R2_PUBLIC_URL}/{test_key}" if R2_PUBLIC_URL else None

        # Dọn dẹp file test
        client.delete_object(Bucket=R2_BUCKET_NAME, Key=test_key)

        return {
            "success": True,
            "configured": True,
            "bucket": R2_BUCKET_NAME,
            "public_url": R2_PUBLIC_URL,
            "test_key": test_key,
            "worker_sample_url": public_test_url,
            "message": f"Kiểm tra thành công! Đã ghi và đọc file test trên Bucket '{R2_BUCKET_NAME}'."
        }
    except Exception as e:
        return {
            "success": False,
            "configured": True,
            "bucket": R2_BUCKET_NAME,
            "public_url": R2_PUBLIC_URL,
            "message": f"Lỗi kiểm tra quyền ghi/đọc trên Cloudflare R2: {e}"
        }


def sync_all_local_files_to_r2(
    output_dir: Optional[Path] = None,
    uploads_dir: Optional[Path] = None,
    images_dir: Optional[Path] = None,
    excel_dir: Optional[Path] = None
) -> Dict[str, Any]:
    """
    Quét toàn bộ ảnh, JSON và Excel hiện có trên máy cục bộ và đẩy lên Cloudflare R2.
    """
    reload_r2_config()
    if not is_r2_configured():
        return {
            "status": "error",
            "message": "Chưa cấu hình Cloudflare R2 trong .env",
            "synced_count": 0,
            "synced_files": []
        }

    synced = []
    errors = []

    # 1. Quét JSON trong output_dir
    if output_dir and output_dir.exists():
        for jf in output_dir.glob("*.json"):
            try:
                res = upload_json(jf, jf.name)
                if res:
                    synced.append({"file": jf.name, "type": "json", "url": res})
            except Exception as e:
                errors.append(f"JSON {jf.name}: {e}")

    # 2. Quét Excel trong output_dir và excel_dir
    excel_dirs = [d for d in [output_dir, excel_dir] if d and d.exists()]
    scanned_excel = set()
    for ed in excel_dirs:
        for ef in ed.glob("*.xlsx"):
            if ef.name in scanned_excel:
                continue
            scanned_excel.add(ef.name)
            try:
                res = upload_excel(ef, ef.name)
                if res:
                    synced.append({"file": ef.name, "type": "excel", "url": res})
            except Exception as e:
                errors.append(f"Excel {ef.name}: {e}")

    # 3. Quét ảnh trong uploads_dir và images_dir
    img_dirs = [d for d in [uploads_dir, images_dir] if d and d.exists()]
    scanned_imgs = set()
    for idir in img_dirs:
        for ext in ("*.jpg", "*.jpeg", "*.png"):
            for img in idir.glob(ext):
                if img.name in scanned_imgs:
                    continue
                scanned_imgs.add(img.name)
                try:
                    res = upload_image(img, img.name)
                    if res:
                        synced.append({"file": img.name, "type": "image", "url": res})
                except Exception as e:
                    errors.append(f"Image {img.name}: {e}")

    return {
        "status": "success",
        "synced_count": len(synced),
        "synced_files": synced,
        "error_count": len(errors),
        "errors": errors,
        "message": f"Đã đồng bộ {len(synced)} file lên Cloudflare R2!"
    }


