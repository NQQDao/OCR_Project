const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

const fieldHTML = `                        <div class="field full">
                            <label>📏 Kích thước xẻ</label>
                            <input id="kich_thuoc_xe" type="text">
                        </div>`;

const newFieldHTML = `                        <div class="field full">
                            <label>📏 Kích thước xẻ</label>
                            <input id="kich_thuoc_xe" type="text">
                        </div>
                        <div class="field full">
                            <label>💰 Đơn giá (TỔNG CỘNG)</label>
                            <input id="don_gia" type="text">
                        </div>`;

html = html.replace(fieldHTML, newFieldHTML);

html = html.replace(
  `document.getElementById("kich_thuoc_xe").value = header.kich_thuoc_xe || "";`,
  `document.getElementById("kich_thuoc_xe").value = header.kich_thuoc_xe || "";\n            document.getElementById("don_gia").value = header.don_gia || "";`
);

html = html.replace(
  `currentData.header.kich_thuoc_xe =\n                document.getElementById("kich_thuoc_xe").value;`,
  `currentData.header.kich_thuoc_xe =\n                document.getElementById("kich_thuoc_xe").value;\n            currentData.header.don_gia =\n                document.getElementById("don_gia").value;`
);

html = html.replace(
  `["so_xe", "ngay_xe", "kich_thuoc_go_tron", "khoi_luong_go_tron", "kich_thuoc_xe"].forEach(id => {`,
  `["so_xe", "ngay_xe", "kich_thuoc_go_tron", "khoi_luong_go_tron", "kich_thuoc_xe", "don_gia"].forEach(id => {`
);

fs.writeFileSync('templates/index.html', html, 'utf8');
