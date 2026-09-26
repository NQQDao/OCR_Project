const fs = require('fs');

let content = fs.readFileSync('cloudflare_worker/src/excel.js', 'utf8');

const oldCode1 = `    if (!monthData[monthKey]) {
      monthData[monthKey] = {
        kl_go_tron: 0,
        kl_go_xe: 0
      };
    }
    
    const klTron = num(record.khoi_luong_go_tron) || 0;
    monthData[monthKey].kl_go_tron += klTron;
    
    if (record.items && record.items.length > 0) {
      for (const item of record.items) {
        monthData[monthKey].kl_go_xe += (num(item.khoi_luong) || 0);
      }
    }
  }`;

const newCode1 = `    if (!monthData[monthKey]) {
      monthData[monthKey] = {
        kl_go_tron: 0,
        kl_go_xe: 0,
        thanh_tien: 0
      };
    }
    
    const klTron = num(record.khoi_luong_go_tron) || 0;
    const donGia = record.don_gia || 0;
    
    monthData[monthKey].kl_go_tron += klTron;
    monthData[monthKey].thanh_tien += (klTron * donGia);
    
    if (record.items && record.items.length > 0) {
      for (const item of record.items) {
        monthData[monthKey].kl_go_xe += (num(item.khoi_luong) || 0);
      }
    }
  }`;

content = content.replace(oldCode1, newCode1);

const oldCode2 = `    row.getCell(5).value = 0; // ThAnh ti?n \` 0`;
const newCode2 = `    row.getCell(5).value = mData.thanh_tien;`;

// because of encoding in oldCode2 (A), we will do generic regex
content = content.replace(/row\.getCell\(5\)\.value = 0; \/\/.*?\n/g, 'row.getCell(5).value = mData.thanh_tien;\n');

// Also update the total formula result for E column
const oldCode3 = `tRow.getCell(5).value = { formula: \`SUM(E3:E\${r6Row-1})\`, result: 0 };`;
// We need to calculate totalThanhTien
const newCode3 = `tRow.getCell(5).value = { formula: \`SUM(E3:E\${r6Row-1})\`, result: totalThanhTien };`;
content = content.replace(oldCode3, newCode3);

// And we need to add let totalThanhTien = 0;
content = content.replace(`  let totalKlXe = 0;`, `  let totalKlXe = 0;\n  let totalThanhTien = 0;`);

// And add totalThanhTien += mData.thanh_tien;
content = content.replace(`    totalKlXe += mData.kl_go_xe;`, `    totalKlXe += mData.kl_go_xe;\n    totalThanhTien += mData.thanh_tien;`);

fs.writeFileSync('cloudflare_worker/src/excel.js', content, 'utf8');
