# ============================================================
# Dockerfile cho OCR_Project (Tương thích Hugging Face Spaces & Cloud)
# ============================================================

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Tạo user 1000 theo chuẩn Hugging Face Spaces
RUN useradd -m -u 1000 user

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir sqlalchemy psycopg2-binary python-dotenv requests

COPY --chown=user:user . .

RUN mkdir -p output web_uploads excel_exports images \
    && chown -R user:user /app

USER user

EXPOSE 7860

CMD ["sh", "-c", "uvicorn web_app:app --host 0.0.0.0 --port ${PORT:-7860}"]
