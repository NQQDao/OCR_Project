const fs = require('fs');
let ocr = fs.readFileSync('cloudflare_worker/src/ocr.js', 'utf8');

ocr = ocr.replace(
  `- kich_thuoc_go_tron\n- khoi_luong_go_tron\n- kich_thuoc_xe`,
  `- kich_thuoc_go_tron\n- khoi_luong_go_tron\n- kich_thuoc_xe\n- don_gia (Đọc số tiền ở mục TỔNG CỘNG của phần thông tin gỗ tròn)`
);

ocr = ocr.replace(
  `"kich_thuoc_xe": ""`,
  `"kich_thuoc_xe": "",\n    "don_gia": ""`
);

fs.writeFileSync('cloudflare_worker/src/ocr.js', ocr, 'utf8');
