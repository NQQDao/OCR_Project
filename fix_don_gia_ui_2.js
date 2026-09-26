const fs = require('fs');

let html = fs.readFileSync('templates/index.html', 'utf8');

// Also make the event listener registration robust
const regex2 = /\["so_xe", "ngay_xe", "kich_thuoc_go_tron", "khoi_luong_go_tron", "kich_thuoc_xe", "don_gia"\]\.forEach\(id => \{\s*document\.getElementById\(id\)\.addEventListener\("input", updateJSONFromForm\);\s*\}\);/i;

const newHTML2 = `["so_xe", "ngay_xe", "kich_thuoc_go_tron", "khoi_luong_go_tron", "kich_thuoc_xe", "don_gia"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener("input", updateJSONFromForm);
        });`;

html = html.replace(regex2, newHTML2);

// Make currentData update robust
const regex3 = /currentData\.header\.don_gia =\s*document\.getElementById\("don_gia"\)\.value;/i;
const newHTML3 = `const donGiaEl2 = document.getElementById("don_gia"); if (donGiaEl2) currentData.header.don_gia = donGiaEl2.value;`;
html = html.replace(regex3, newHTML3);

fs.writeFileSync('templates/index.html', html, 'utf8');
