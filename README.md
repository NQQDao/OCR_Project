# OCR Project

Hệ thống nhận diện ký tự quang học (OCR) xử lý và trích xuất văn bản từ hình ảnh/tài liệu tự động.

---

## 📌 Tính năng chính
* Nhận diện văn bản từ hình ảnh (JPG, PNG, PDF...).
* Tiền xử lý ảnh (khử nhiễu, cân bằng sáng, xoay góc nghiêng).
* Xuất dữ liệu sang định dạng văn bản (TXT, JSON hoặc Excel).

---

## 🛠 Công nghệ sử dụng
* **Ngôn ngữ:** Python 3.x
* **Thư viện OCR:** Tesseract / EasyOCR / PaddleOCR *(chọn thư viện bạn dùng)*
* **Xử lý ảnh:** OpenCV, Pillow
* **Framework giao diện / API (nếu có):** FastAPI / Flask / Streamlit

---

## 🚀 Hướng dẫn cài đặt

### 1. Yêu cầu hệ thống
* Python >= 3.9
* Tesseract-OCR (nếu dùng thư viện `pytesseract`):
  * **Windows:** Tải bộ cài đặt từ [UB-Mannheim](https://github.com/UB-Mannheim/tesseract/wiki) và thêm vào biến môi trường PATH.
  * **Ubuntu/Debian:** `sudo apt-get install tesseract-ocr`

### 2. Cài đặt môi trường
Clone repo về máy (nếu chưa có):
```bash
git clone [https://github.com/NQQDao/OCR_Project.git](https://github.com/NQQDao/OCR_Project.git)
cd OCR_Project
