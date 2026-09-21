# ============================================================
# Dockerfile cho OCR_Project
# ============================================================

FROM python:3.12-slim

# Thiết lập biến môi trường
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Cài đặt các thư viện hệ thống cần thiết cho OpenCV, Pillow và PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir sqlalchemy psycopg2-binary python-dotenv

# Copy mã nguồn dự án
COPY . .

# Khởi tạo các thư mục lưu trữ dữ liệu
RUN mkdir -p output web_uploads excel_exports images

EXPOSE 8000

# Khởi động ứng dụng
CMD ["uvicorn", "web_app:app", "--host", "0.0.0.0", "--port", "8000"]
