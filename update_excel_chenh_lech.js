const fs = require('fs');
let code = fs.readFileSync('cloudflare_worker/src/excel.js', 'utf8');

const startTag = '// SHEET 5: CANH_BAO';
const endTag = 'return await wb.xlsx.writeBuffer();';

const startIndex = code.indexOf(startTag);
const endIndex = code.lastIndexOf(endTag);

if (startIndex === -1 || endIndex === -1) {
    console.error("Tags not found");
    process.exit(1);
}

const newSheet5 = `  // SHEET 5: CHENH_LECH
  // ----------------------------------------------------
  const ws5 = wb.addWorksheet("CHENH_LECH", { views: [{ showGridLines: true }] });
  
  // Row 1
  ws5.mergeCells("A1:A2");
  ws5.getCell("A1").value = "Số xẻ";
  
  ws5.mergeCells("B1:D1");
  ws5.getCell("B1").value = "BB gỗ về";
  
  ws5.mergeCells("E1:G1");
  ws5.getCell("E1").value = "Đo thực tế";
  
  ws5.mergeCells("H1:J1");
  ws5.getCell("H1").value = "Chênh lệch";
  
  ws5.mergeCells("K1:K2");
  ws5.getCell("K1").value = "Đơn giá";
  
  ws5.mergeCells("L1:L2");
  ws5.getCell("L1").value = "Thành tiền";

  // Row 2
  const subHeaders = ["Dài", "Vanh", "KL", "Dài", "Vanh", "KL", "Dài", "Vanh", "KL"];
  for (let i = 0; i < 9; i++) {
    ws5.getCell(2, i + 2).value = subHeaders[i];
  }

  // Formatting Headers
  const row1 = ws5.getRow(1);
  const row2 = ws5.getRow(2);
  row1.height = 25;
  row2.height = 25;

  const headerFmt = (cell, bgColor) => {
    cell.font = { name: "Times New Roman", size: 12, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    applyBorder(cell);
  };

  headerFmt(ws5.getCell("A1"), "FFFFFFFF"); // White
  headerFmt(ws5.getCell("B1"), "FFFFFF00"); // Yellow
  headerFmt(ws5.getCell("E1"), "FF92D050"); // Green
  headerFmt(ws5.getCell("H1"), "FFFFFFFF"); // White
  headerFmt(ws5.getCell("K1"), "FFFFFF00"); // Yellow
  headerFmt(ws5.getCell("L1"), "FFFFFF00"); // Yellow
  
  for (let c = 2; c <= 4; c++) headerFmt(ws5.getCell(2, c), "FFFFFF00");
  for (let c = 5; c <= 7; c++) headerFmt(ws5.getCell(2, c), "FF92D050");
  for (let c = 8; c <= 10; c++) headerFmt(ws5.getCell(2, c), "FFFFFFFF");

  // Columns Width
  ws5.getColumn(1).width = 15; // Số xẻ
  [2,3,4, 5,6,7, 8,9,10].forEach(col => ws5.getColumn(col).width = 10);
  ws5.getColumn(11).width = 15; // Đơn giá
  ws5.getColumn(12).width = 18; // Thành tiền

  let r5Row = 3;
  for (const record of records) {
    const strGoTron = record.kich_thuoc_go_tron || "";
    const matches = [...strGoTron.matchAll(/(\\d+(?:[,.]\\d+)?)[\\s\\-]*[Vv]\\s*(\\d+)/g)];
    
    if (matches.length >= 2) {
      const parseNum = (s) => parseFloat(s.replace(',', '.'));
      const dai1 = parseNum(matches[0][1]);
      const vanh1 = parseInt(matches[0][2], 10);
      const dai2 = parseNum(matches[1][1]);
      const vanh2 = parseInt(matches[1][2], 10);
      
      if (!isNaN(dai1) && !isNaN(dai2) && !isNaN(vanh1) && !isNaN(vanh2)) {
        const r = ws5.getRow(r5Row);
        
        const kl1 = 0.08 * Math.pow(vanh1 / 100, 2) * dai1;
        const kl2 = 0.08 * Math.pow(vanh2 / 100, 2) * dai2;
        
        r.getCell(1).value = record.so_xe || "";
        
        r.getCell(2).value = dai1;
        r.getCell(3).value = vanh1;
        r.getCell(4).value = kl1;
        
        r.getCell(5).value = dai2;
        r.getCell(6).value = vanh2;
        r.getCell(7).value = kl2;
        
        r.getCell(8).value = dai2 - dai1;
        r.getCell(9).value = vanh2 - vanh1;
        r.getCell(10).value = kl2 - kl1;
        
        // Formula for Thanh Tien (L = J * K)
        r.getCell(12).value = { formula: \`J\${r5Row}*K\${r5Row}\`, result: 0 };
        
        // Formatting data row
        for (let c = 1; c <= 12; c++) {
          const cell = r.getCell(c);
          cell.font = { name: "Times New Roman", size: 11 };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          applyBorder(cell);
          
          // Backgrounds
          if (c >= 2 && c <= 4) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
          else if (c >= 5 && c <= 7) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
          else if (c === 11 || c === 12) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
          
          // Number Formats
          if (c === 4 || c === 7) cell.numFmt = "0.0000"; // KL
          if (c === 8 || c === 10) cell.numFmt = "#,##0.00;[Red](#,##0.00)"; // diff with parens and red for negative? or just accounting
          if (c === 11 || c === 12) cell.numFmt = "#,##0;[Red](#,##0)"; 
        }
        r.getCell(10).numFmt = "#,##0.00_);(#,##0.00)"; // exact parens format from image for KL diff
        r.getCell(12).numFmt = "#,##0_);(#,##0)"; // exact parens format for money
        
        r5Row++;
      }
    }
  }

  `;

let newCode = code.substring(0, startIndex) + newSheet5 + code.substring(endIndex);
fs.writeFileSync('cloudflare_worker/src/excel.js', newCode, 'utf8');

