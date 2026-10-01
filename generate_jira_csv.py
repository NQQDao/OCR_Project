# -*- coding: utf-8 -*-
"""
Script sinh file CSV chuẩn Jira và Notion cho 42 User Stories của dự án OCR Nhật ký xẻ gỗ
"""

import csv

PROJECT_KEY = "OCR"

STORIES = [
    # Epic 1: OCR & Nhận Dạng Hình Ảnh
    ("Story", "Upload ảnh phiếu nhật ký xẻ gỗ để AI nhận dạng tự động", "Là nhân viên, tôi muốn upload ảnh phiếu nhật ký xẻ gỗ để AI nhận dạng tự động thay vì nhập tay.\n\nAcceptance Criteria:\n- Hỗ trợ ảnh JPG/PNG/WEBP\n- Upload qua giao diện Web và kéo thả\n- Lưu trữ bảo mật trên Cloudflare R2", "High", "OCR AI Vision", "ocr,upload,r2"),
    ("Story", "Sử dụng OpenRouter Multi-Model Gateway làm AI Vision chính", "Là nhà phát triển, tôi muốn hệ thống kết nối OpenRouter với cơ chế fallback tự động để đảm bảo OCR hoạt động liên tục.", "High", "OCR AI Vision", "ai,openrouter,vision"),
    ("Story", "Fallback sang Google Gemini API trực tiếp khi OpenRouter gặp sự cố", "Là nhà phát triển, tôi muốn có cơ chế dự phòng sang Google Gemini API chính thức khi cổng OpenRouter bị gián đoạn.", "Medium", "OCR AI Vision", "ai,gemini,fallback"),
    ("Story", "Nhận dạng thông tin đầu phiếu (Mã gỗ, Ngày xẻ, Kích thước, Đơn giá)", "Là kế toán, tôi muốn AI trích xuất chính xác các trường đầu phiếu để không phải gõ lại.", "High", "OCR AI Vision", "ocr,header,metadata"),
    ("Story", "Nhận dạng chi tiết từng dòng cấu kiện mộc", "Là nhân viên xưởng, tôi muốn AI đọc toàn bộ bảng danh sách cấu kiện (ngày, kích thước, số lượng, khối lượng, tên cấu kiện, công trình, ghi chú).", "High", "OCR AI Vision", "ocr,items,table"),
    ("Story", "Lọc ảnh phiếu trùng lặp siêu tốc (Fast-Pass Filter)", "Là người dùng, tôi muốn hệ thống quét nhanh mã gỗ và ngày xẻ trong 1 giây để cảnh báo phiếu trùng trước khi chạy OCR toàn diện.", "Medium", "OCR AI Vision", "ocr,fast-pass,filter"),

    # Epic 2: Xem, Soát Lỗi & Chỉnh Sửa Phiếu
    ("Story", "Xem ảnh phiếu gốc song song với bảng dữ liệu OCR", "Là nhân viên nhập liệu, tôi muốn xem ảnh gốc ở khung bên trái và dữ liệu bảng ở khung bên phải để dễ đối chiếu.", "High", "Xem & Soát Lỗi", "ui,viewer,workspace"),
    ("Story", "Công cụ Thu phóng, Xoay và Di chuyển ảnh (Pan & Zoom)", "Là người kiểm tra, tôi muốn phóng to, thu nhỏ, xoay 90 độ và kéo ảnh tự do để đọc rõ các nét chữ mờ.", "High", "Xem & Soát Lỗi", "ui,image-tools,panzoom"),
    ("Story", "Kính lúp soi chữ viết tay (Magnifier)", "Là người kiểm tra, tôi muốn có kính lúp rê chuột để soi cận cảnh các con số viết tay khó đọc.", "Medium", "Xem & Soát Lỗi", "ui,magnifier"),
    ("Story", "Xem ảnh phiếu toàn màn hình (Lightbox Fullscreen)", "Là người dùng, tôi muốn mở ảnh toàn màn hình để kiểm tra chi tiết rõ nhất.", "Medium", "Xem & Soát Lỗi", "ui,lightbox"),
    ("Story", "Chỉnh sửa trực tiếp dữ liệu trên bảng biểu (Live Cell Editing)", "Là kế toán, tôi muốn chỉnh sửa nhanh bất kỳ ô nào trên bảng và lưu tự động vào CSDL.", "High", "Xem & Soát Lỗi", "ui,editing,table"),

    # Epic 3: Đối Chiếu Toán Học & Kiểm Tra Dữ Liệu
    ("Story", "Tự động tính toán khối lượng thanh gỗ theo công thức Mộc", "Là hệ thống, tôi muốn tự động tính Khối lượng = Rộng x Cao x Dài x Số lượng (m3) theo chuẩn ngành gỗ.", "High", "Đối Chiếu Toán Học", "math,volume,calculation"),
    ("Story", "Đối chiếu khối lượng tính toán và khối lượng ghi trên giấy (Tolerance = 0.002)", "Là kế toán, tôi muốn hệ thống tô đỏ cảnh báo nếu khối lượng thợ tính lệch quá 0.002 m3 so với thực tế.", "High", "Đối Chiếu Toán Học", "validation,tolerance,warning"),
    ("Story", "Đối chiếu Tổng Khối lượng Thành khí cuối ngày", "Là quản lý, tôi muốn hệ thống so sánh tổng các dòng với số tổng ghi ở chân phiếu và báo xanh khi khớp 100%.", "High", "Đối Chiếu Toán Học", "validation,reconciliation"),
    ("Story", "Tính Tỷ lệ thu hồi gỗ thành khí so với gỗ tròn (%)", "Là chủ xưởng, tôi muốn biết tỷ lệ thu hồi thành khí đạt bao nhiêu % để đánh giá chất lượng cây gỗ.", "High", "Đối Chiếu Toán Học", "analytics,recovery-rate"),

    # Epic 4: Quản Lý Phiếu & Cơ Sở Dữ Liệu Cloudflare D1
    ("Story", "Lưu trữ phiếu xẻ và chi tiết cấu kiện vào Cloudflare D1 SQLite", "Là nhà phát triển, tôi muốn toàn bộ phiếu xẻ được lưu vào CSDL SQLite phân tán với độ trễ 0ms.", "High", "Quản Lý Phiếu D1", "d1,database,sqlite"),
    ("Story", "Tìm kiếm và lọc phiếu xẻ thông minh theo nhiều tiêu chí", "Là kế toán, tôi muốn tìm kiếm phiếu theo mã gỗ, ngày xẻ, công trình hoặc số lượng dòng.", "High", "Quản Lý Phiếu D1", "search,filter,history"),
    ("Story", "Phân trang dữ liệu lịch sử phiếu xẻ", "Là người dùng, tôi muốn danh sách phiếu được phân trang mượt mà để tải nhanh khi có hàng ngàn phiếu.", "Medium", "Quản Lý Phiếu D1", "pagination,ui"),
    ("Story", "Xóa phiếu đơn lẻ hoặc xóa hàng loạt phiếu", "Là quản trị viên, tôi muốn có thể xóa 1 phiếu hoặc chọn nhiều phiếu để xóa an toàn kèm xác nhận.", "Medium", "Quản Lý Phiếu D1", "delete,batch,safety"),

    # Epic 5: Xuất Báo Cáo Excel Chuyên Dụng
    ("Story", "Xuất file Excel tổng hợp 5 Sheet chuẩn ngành gỗ", "Là kế toán, tôi muốn xuất file Excel gồm 5 sheet: Nhật ký hàng ngày, Tổng hợp ngày, Tổng hợp phiếu, Chi tiết, Cảnh báo.", "High", "Xuất Báo Cáo Excel", "excel,export,sheets"),
    ("Story", "Xuất Excel lô nhiều phiếu đã chọn", "Là kế toán, tôi muốn chọn nhiều phiếu xẻ trong lịch sử và gộp chung vào 1 file Excel tổng hợp.", "High", "Xuất Báo Cáo Excel", "excel,batch,export"),
    ("Story", "Tự động tô màu cảnh báo chênh lệch trong Sheet Cảnh Báo", "Là người kiểm tra, tôi muốn các dòng tính sai khối lượng được gom riêng sang Sheet Cảnh Báo và tô màu vàng/đỏ.", "Medium", "Xuất Báo Cáo Excel", "excel,formatting,warning"),

    # Epic 6: Bộ Từ Điển Huấn Luyện Chữ Viết Tắt
    ("Story", "Quản lý danh mục từ viết tắt theo 5 phân loại", "Là người dùng, tôi muốn quản lý từ điển viết tắt: Mã công trình, Cấu kiện mộc, Từ dễ nhầm, Quy cách gỗ, Ghi chú.", "High", "Từ Điển Viết Tắt", "dictionary,abbreviations"),
    ("Story", "Tự động tiêm từ điển vào Prompt AI khi chạy OCR", "Là nhà phát triển, tôi muốn các từ viết tắt mới được tự động nạp vào prompt để AI ngày càng thông minh hơn.", "High", "Từ Điển Viết Tắt", "ai,prompt,learning"),
    ("Story", "Xem trước và Tùy chỉnh Prompt AI trực tiếp", "Là quản trị viên, tôi muốn xem prompt thực tế và có thể chỉnh sửa, lưu riêng vào CSDL.", "Medium", "Từ Điển Viết Tắt", "prompt,customization"),

    # Epic 7: Bảo Mật, Đăng Nhập & R2 Private
    ("Story", "Bảo vệ kho R2 ở chế độ 100% Private chống lộ lọt dữ liệu", "Là quản trị viên, tôi muốn tắt public R2.dev để không ai trên Internet có thể tải trái phép ảnh phiếu gốc.", "High", "Bảo Mật & R2 Private", "security,r2,private"),
    ("Story", "Đăng nhập xác thực người dùng với phiên duy trì 24 giờ", "Là người dùng, tôi muốn đăng nhập tài khoản an toàn với phiên làm việc 24h bằng HttpOnly Cookie.", "High", "Bảo Mật & R2 Private", "auth,login,session"),
    ("Story", "Đổi mật khẩu tài khoản người dùng trực tiếp trên giao diện", "Là người dùng, tôi muốn có thể tự đổi mật khẩu mới an toàn bất kỳ lúc nào.", "Medium", "Bảo Mật & R2 Private", "auth,password"),

    # Epic 8: Tối Ưu Nhập Liệu Đa Ngày Xẻ
    ("Story", "Nhập cụm ngày xẻ đa ngày ở Header (VD: 11 & 16/08/2026)", "Là kế toán, tôi muốn nhập lóng gỗ xẻ qua 2 hoặc nhiều ngày với các ô nhập trực quan.", "High", "Tối Ưu Nhập Liệu", "date,multi-date,header"),
    ("Story", "Nút chọn ngày nhanh 1 chạm (Quick Date Pills) ở từng dòng cấu kiện", "Là nhân viên nhập liệu, tôi muốn bấm 1 click để điền ngày xẻ cho dòng mà không cần gõ tay.", "High", "Tối Ưu Nhập Liệu", "ui,quick-select,pills"),
    ("Story", "Sao chép ngày xuống tất cả các dòng bên dưới chỉ trong 1 click", "Là người dùng, tôi muốn áp dụng ngày của dòng hiện tại cho toàn bộ các dòng dưới để tiết kiệm thời gian.", "High", "Tối Ưu Nhập Liệu", "ui,fill-down,efficiency")
]

def main():
    filename = "jira_user_stories.csv"
    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["Issue Type", "Summary", "Description", "Priority", "Epic Name", "Labels", "Assignee", "Reporter"])
        for story in STORIES:
            issue_type, summary, desc, priority, epic, labels = story
            writer.writerow([issue_type, summary, desc, priority, epic, labels, "Admin", "Admin"])
    print(f"[OK] Da sinh thanh cong file {filename} voi {len(STORIES)} User Stories.")

if __name__ == "__main__":
    main()

