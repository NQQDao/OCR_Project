const fs = require('fs');

let html = fs.readFileSync('templates/index.html', 'utf8');

// Use a regex to reliably find and replace the block
const regex = /(<div class="field full">\s*<label>[^<]+Kích thước xẻ[^<]*<\/label>\s*<input id="kich_thuoc_xe" type="text">\s*<\/div>)/i;

const newHTML = `$1
                        <div class="field full">
                            <label>💰 Đơn giá (TỔNG CỘNG)</label>
                            <input id="don_gia" type="text">
                        </div>`;

html = html.replace(regex, newHTML);

// Also make the event listener registration robust
html = html.replace(
    `["so_xe", "ngay_xe", "kich_thuoc_go_tron", "khoi_luong_go_tron", "kich_thuoc_xe", "don_gia"].forEach(id => {
            document.getElementById(id).addEventListener("input", updateJSONFromForm);
        });`,
    `["so_xe", "ngay_xe", "kich_thuoc_go_tron", "khoi_luong_go_tron", "kich_thuoc_xe", "don_gia"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener("input", updateJSONFromForm);
        });`
);

// Also make the updating values robust
html = html.replace(
    `document.getElementById("don_gia").value = header.don_gia || "";`,
    `const donGiaEl = document.getElementById("don_gia"); if (donGiaEl) donGiaEl.value = header.don_gia || "";`
);

html = html.replace(
    `currentData.header.don_gia =\n                document.getElementById("don_gia").value;`,
    `const donGiaEl2 = document.getElementById("don_gia"); if (donGiaEl2) currentData.header.don_gia = donGiaEl2.value;`
);


fs.writeFileSync('templates/index.html', html, 'utf8');
