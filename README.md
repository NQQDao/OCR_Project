---

# OCR Project (Powered by Gemini)

Hệ thống nhận diện và trích xuất dữ liệu từ hình ảnh/tài liệu sử dụng sức mạnh của Google Gemini 3.8 Flash.

---

## 📌 Tính năng chính
* Trích xuất văn bản từ hình ảnh với độ chính xác cao.
* Xử lý tốt các tài liệu phức tạp (hóa đơn, biểu mẫu, chữ viết tay).
* Trả về dữ liệu có cấu trúc (JSON, Markdown) theo yêu cầu prompt.
* Tốc độ xử lý nhanh và tối ưu chi phí nhờ model Flash.

---

## 🛠 Công nghệ sử dụng
* **Ngôn ngữ:** Python 3.x
* **AI Engine:** Google Gemini API (Model: `gemini-3.8-flash`)
* **Thư viện chính:** `google-generativeai` (hoặc SDK tương ứng), `python-dotenv` (quản lý biến môi trường)

---

## 🚀 Hướng dẫn cài đặt

### 1. Yêu cầu hệ thống & API Key
* Python >= 3.9
* Cần có **API Key** từ [Google AI Studio](https://aistudio.google.com/).

### 2. Cài đặt môi trường
Clone repo về máy:
```bash
git clone [https://github.com/NQQDao/OCR_Project.git](https://github.com/NQQDao/OCR_Project.git)
cd OCR_Project
