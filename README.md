## 🛠 Công nghệ sử dụng
* **Ngôn ngữ:** Python 3.x
* **OCR Engine:** [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)
* **Thư viện chính:** `pytesseract`, `opencv-python`, `Pillow`

---

## 🚀 Hướng dẫn cài đặt

### 1. Cài đặt Tesseract OCR Engine (Bắt buộc)
Do `pytesseract` chỉ là wrapper của Python, bạn cần cài đặt trực tiếp bộ công cụ Tesseract lên hệ điều hành:

* **Windows:**
  1. Tải bộ cài installer từ [UB-Mannheim Tesseract](https://github.com/UB-Mannheim/tesseract/wiki).
  2. Trong quá trình cài đặt, tích chọn **Additional language data** nếu cần nhận diện tiếng Việt (`vie.traineddata`).
  3. Đường dẫn mặc định: `C:\Program Files\Tesseract-OCR\tesseract.exe`.
  4. Thêm thư mục trên vào biến môi trường **PATH** của hệ thống.

* **Linux (Ubuntu/Debian):**
  ```bash
  sudo apt-get update
  sudo apt-get install tesseract-ocr
  # Cài gói ngôn ngữ tiếng Việt (nếu cần):
  sudo apt-get install tesseract-ocr-vie
