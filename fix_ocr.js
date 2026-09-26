const fs = require('fs');
let b = fs.readFileSync('cloudflare_worker/src/ocr.js');
let s = b.toString('utf8');
const idx = s.indexOf('export async function buildFastPrompt');
if (idx !== -1) {
    s = s.substring(0, idx);
} else {
    const utf16idx = s.indexOf('e\x00x\x00p\x00o\x00r\x00t');
    if (utf16idx !== -1) s = s.substring(0, utf16idx);
}
s += 'export async function buildFastPrompt(env) { return `Hãy quét nhanh hình ảnh này và trả về ĐÚNG MỘT JSON với định dạng sau (không giải thích gì thêm):\\n{\\n  "so_xe": "...", // Trích xuất mã số xe/số phiếu (ví dụ: 107 - I7085/1A). Nếu không có trả về chuỗi rỗng.\\n  "so_dong": 15 // Đếm số lượng dòng dữ liệu có trong bảng chi tiết cấu kiện. Trả về số nguyên (kiểu int).\\n}`; }\n';
fs.writeFileSync('cloudflare_worker/src/ocr.js', s, 'utf8');

