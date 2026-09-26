const fs = require('fs');
let ocr = fs.readFileSync('cloudflare_worker/src/ocr.js', 'utf8');

ocr = ocr.replace(
  `- kich_thuoc_xe`,
  `- kich_thuoc_xe\n- don_gia (Đọc số tiền ở mục TỔNG CỘNG của phần thông tin gỗ tròn)`
);

fs.writeFileSync('cloudflare_worker/src/ocr.js', ocr, 'utf8');
