# Hướng Dẫn Deploy Cloudflare Worker Phân Phối File Từ Cloudflare R2

Thư mục này chứa mã nguồn Cloudflare Worker để làm **CDN Gateway** phân phối ảnh, file JSON và file Excel từ **Cloudflare R2 Bucket** với tốc độ cao và miễn phí băng thông truyền tải (*Zero Egress Fee*).

---

## 1. Yêu cầu cài đặt
Máy tính của bạn cần có **Node.js** (tải tại [nodejs.org](https://nodejs.org/)).

Kiểm tra trên Terminal / PowerShell:
```bash
node -v
npm -v
```

---

## 2. Các bước triển khai lên Cloudflare

### Bước 1: Mở thư mục worker trên Terminal
```bash
cd d:\workspace\OCR_Project\cloudflare_worker
```

### Bước 2: Đăng nhập tài khoản Cloudflare
Lệnh này sẽ tự động mở trình duyệt để bạn ủy quyền tài khoản Cloudflare:
```bash
npx wrangler login
```

### Bước 3: Kiểm tra tên Bucket trong file `wrangler.toml`
Mở file `wrangler.toml`, đảm bảo dòng `bucket_name` trùng với tên Bucket bạn đã tạo trên Cloudflare Dashboard:
```toml
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "ocr-wood-storage"
```

### Bước 4: Deploy Worker lên Cloudflare
```bash
npx wrangler deploy
```

Sau khi hoàn tất, terminal sẽ in ra đường link công khai, ví dụ:
```text
Uploaded ocr-r2-worker (1.23 sec)
Deployed ocr-r2-worker triggers
  https://ocr-r2-worker.<your-subdomain>.workers.dev
```

---

## 3. Cập nhật URL vào file `.env` của dự án

Copy đường link Worker trên dán vào file `.env` ở thư mục gốc dự án:
```env
R2_PUBLIC_URL=https://ocr-r2-worker.<your-subdomain>.workers.dev
```

---

## 4. Cách kiểm tra hoạt động
1. Truy cập `https://ocr-r2-worker.<your-subdomain>.workers.dev` trên trình duyệt $\rightarrow$ Sẽ thấy thông báo `OCR Wood Storage CDN is online`.
2. Khi hệ thống tải lên 1 ảnh tên `mau_01.jpg`, bạn có thể xem trực tiếp tại:
   `https://ocr-r2-worker.<your-subdomain>.workers.dev/images/mau_01.jpg`

