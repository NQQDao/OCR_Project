const fs = require('fs');

let content = fs.readFileSync('cloudflare_worker/src/excel.js', 'utf8');

const newCode = `
  // ----------------------------------------------------
  // SHEET 6: BAO_CAO_THANG
  // ----------------------------------------------------
  const ws6 = wb.addWorksheet("BAO_CAO_THANG", { views: [{ showGridLines: true }] });
  
  ws6.mergeCells("A1:G1");
  const a6_1 = ws6.getCell("A1");
  a6_1.value = "BÁO CÁO TỔNG HỢP KHỐI LƯỢNG GỖ THEO THÁNG";
  a6_1.font = { name: "Times New Roman", size: 14, bold: true };
  a6_1.alignment = { horizontal: "center", vertical: "middle" };
  
  const h6 = ws6.getRow(2);
  h6.values = [
    "STT", 
    "Nội dung", 
    "Đơn vị tính", 
    "Khối lượng gỗ tròn đưa vào xẻ", 
    "Thành tiền", 
    "Khối lượng gỗ", 
    "Phần Trăm"
  ];
  
  h6.height = 30;
  for (let i = 1; i <= 7; i++) {
    const c = h6.getCell(i);
    c.font = { name: "Times New Roman", size: 11, bold: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyBorder(c);
  }
  
  ws6.getColumn(1).width = 8;
  ws6.getColumn(2).width = 25;
  ws6.getColumn(3).width = 15;
  ws6.getColumn(4).width = 25;
  ws6.getColumn(5).width = 20;
  ws6.getColumn(6).width = 20;
  ws6.getColumn(7).width = 15;

  // Gom nhóm dữ liệu theo tháng
  const monthData = {};
  for (const record of records) {
    let dateStr = record.ngay_xe || record.ngay_nhap || "";
    let monthKey = "Không rõ";
    if (dateStr) {
      // Parse dd/mm/yyyy
      const parts = dateStr.split("/");
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10);
        const y = parts.length >= 3 ? parts[2].split(" ")[0] : new Date().getFullYear();
        if (!isNaN(m)) {
          monthKey = \`Tháng \${m}/\${y}\`;
        }
      }
    }
    
    if (!monthData[monthKey]) {
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
  }

  let r6Row = 3;
  let totalKlTron = 0;
  let totalKlXe = 0;
  
  for (const [mKey, mData] of Object.entries(monthData)) {
    const row = ws6.getRow(r6Row);
    row.getCell(1).value = r6Row - 2;
    row.getCell(2).value = mKey;
    row.getCell(3).value = "m3";
    row.getCell(4).value = mData.kl_go_tron;
    row.getCell(5).value = 0; // Thành tiền để 0
    row.getCell(6).value = mData.kl_go_xe;
    
    row.getCell(7).value = { formula: \`IF(D\${r6Row}=0, 0, F\${r6Row}/D\${r6Row})\`, result: (mData.kl_go_tron > 0 ? (mData.kl_go_xe / mData.kl_go_tron) : 0) };
    
    totalKlTron += mData.kl_go_tron;
    totalKlXe += mData.kl_go_xe;
    
    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Times New Roman", size: 11 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      applyBorder(cell);
      
      if (c === 4 || c === 6) {
        cell.numFmt = "#,##0.000";
      }
      if (c === 5) {
        cell.numFmt = "#,##0";
      }
      if (c === 7) {
        cell.numFmt = "0.00%";
      }
    }
    r6Row++;
  }
  
  // Total Row
  const tRow = ws6.getRow(r6Row);
  tRow.getCell(2).value = "Tổng";
  tRow.getCell(4).value = { formula: \`SUM(D3:D\${r6Row-1})\`, result: totalKlTron };
  tRow.getCell(5).value = { formula: \`SUM(E3:E\${r6Row-1})\`, result: 0 };
  tRow.getCell(6).value = { formula: \`SUM(F3:F\${r6Row-1})\`, result: totalKlXe };
  tRow.getCell(7).value = { formula: \`IF(D\${r6Row}=0, 0, F\${r6Row}/D\${r6Row})\`, result: (totalKlTron > 0 ? (totalKlXe / totalKlTron) : 0) };
  
  for (let c = 1; c <= 7; c++) {
      const cell = tRow.getCell(c);
      cell.font = { name: "Times New Roman", size: 11, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      applyBorder(cell);
      
      if (c === 4 || c === 6) {
        cell.numFmt = "#,##0.000";
      }
      if (c === 5) {
        cell.numFmt = "#,##0";
      }
      if (c === 7) {
        cell.numFmt = "0.00%";
      }
  }

  return await wb.xlsx.writeBuffer();
`;

content = content.replace("  return await wb.xlsx.writeBuffer();", newCode);

fs.writeFileSync('cloudflare_worker/src/excel.js', content, 'utf8');
