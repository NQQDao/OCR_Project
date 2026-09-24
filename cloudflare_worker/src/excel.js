/**
 * Module xuất Excel bằng ExcelJS (tương thích 100% với định dạng json_to_excel_batch.py)
 * Tạo 5 Sheet chuyên nghiệp:
 *   1. NHAT_KY_HANG_NGAY: Mẫu sổ theo dõi nhật ký xẻ gỗ hàng ngày
 *   2. TONG_HOP_NGAY: Bảng tổng hợp theo từng ngày
 *   3. TONG_HOP_PHEU: Bảng tổng hợp theo từng phiếu xẻ
 *   4. CHI_TIET: Đối chiếu chi tiết từng dòng, kích thước, khối lượng ghi vs tính
 *   5. CANH_BAO: Danh sách các dòng sai lệch khối lượng vượt ngưỡng
 */

import ExcelJS from "exceljs";

const TOLERANCE = 0.002;

function txt(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  let s = txt(value).replace(/\s+/g, "");
  if (!s) return null;
  if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  s = s.replace(/[^0-9.\-]/g, "");
  const res = parseFloat(s);
  return isNaN(res) ? null : res;
}

function parseDate(value) {
  const s = txt(value).replace(/[-.]/g, "/");
  if (!s) return null;
  const parts = s.split("/");
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }
  return null;
}

function monthFromDate(value) {
  const d = parseDate(value);
  return d ? d.getUTCMonth() + 1 : null;
}

function parseDimensions(value) {
  const s = txt(value).toLowerCase().replace(/×/g, "x").replace(/\*/g, "x");
  const numbers = s.match(/\d+(?:[.,]\d+)?/g);
  if (!numbers || numbers.length < 3) return null;
  try {
    const day = parseFloat(numbers[0].replace(",", "."));
    const rong = parseFloat(numbers[1].replace(",", "."));
    const dai = parseFloat(numbers[2].replace(",", "."));
    let sl = 1;
    if (numbers.length >= 4) {
      sl = Math.round(parseFloat(numbers[3].replace(",", ".")));
    }
    return { dai, rong, day, sl };
  } catch {
    return null;
  }
}

function calculateVolume(dai, rong, day, sl) {
  if (dai == null || rong == null || day == null || sl == null) return null;
  return (dai * rong * day * sl) / 1000000;
}

function getRoundWood(data) {
  const header = data.header || {};
  let structured = data.round_wood || header.go_tron || data.go_tron || {};
  if (typeof structured !== "object") structured = {};

  return {
    so: structured.so || structured.so_go_tron || header.so_go_tron || data.so_go_tron || "",
    ky_hieu: structured.ky_hieu || structured.ki_hieu || header.ky_hieu_go_tron || data.ky_hieu_go_tron || "",
    mua_dai: structured.kt_mua_vao_dai || structured.mua_vao_dai || header.kt_mua_vao_dai || data.kt_mua_vao_dai || "",
    mua_vanh: structured.kt_mua_vao_vanh || structured.mua_vao_vanh || header.kt_mua_vao_vanh || data.kt_mua_vao_vanh || "",
    thuc_dai: structured.kt_do_thuc_te_dai || structured.do_thuc_te_dai || header.kt_do_thuc_te_dai || data.kt_do_thuc_te_dai || "",
    thuc_vanh: structured.kt_do_thuc_te_vanh || structured.do_thuc_te_vanh || header.kt_do_thuc_te_vanh || data.kt_do_thuc_te_vanh || "",
    khoi_luong: structured.khoi_luong || structured.khoi_luong_go_tron || header.khoi_luong_go_tron || data.khoi_luong_go_tron || "",
    don_gia: structured.don_gia || header.don_gia || data.don_gia || "",
    thanh_tien: structured.thanh_tien || header.thanh_tien || data.thanh_tien || "",
    raw: txt(header.kich_thuoc_go_tron || data.kich_thuoc_go_tron || ""),
  };
}

function normalizeRecord(data, filename) {
  const header = data.header || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const roundWood = getRoundWood(data);

  const normItems = items.map((item, idx) => {
    const raw = txt(item.kich_thuoc_so_luong || item.kich_thuoc || "");
    let rong = num(item.rong);
    let cao = num(item.cao);
    let dai = num(item.dai);
    let sl = num(item.so_luong);

    if (rong == null || cao == null || dai == null || sl == null) {
      const parsed = parseDimensions(raw);
      if (parsed) {
        if (dai == null) dai = parsed.dai;
        if (rong == null) rong = parsed.rong;
        if (cao == null) cao = parsed.day;
        if (sl == null) sl = parsed.sl;
      }
    }
    if (sl != null) sl = Math.round(sl);

    const written = num(item.khoi_luong !== undefined ? item.khoi_luong : item.khoi_luong_m3);
    const calculated = calculateVolume(dai, rong, cao, sl);
    let difference = null;
    let status = "KIỂM TRA";

    if (written != null && calculated != null) {
      difference = calculated - written;
      status = Math.abs(difference) <= TOLERANCE ? "OK" : "CHÊNH LỆCH";
    }

    const ngay = txt(item.ngay);

    return {
      index: idx + 1,
      dong: item.dong !== undefined && item.dong !== null ? item.dong : idx + 1,
      ngay,
      ngay_date: parseDate(ngay),
      thang: monthFromDate(ngay),
      raw,
      dai,
      rong,
      cao,
      day: cao,
      sl,
      written,
      calculated,
      difference,
      status,
      cong_trinh: txt(item.cong_trinh),
      stt_cau_kien: txt(item.stt_cau_kien),
      ten_cau_kien: txt(item.ten_cau_kien),
      nha_cung_cap: txt(item.nha_cung_cap),
      ghi_chu: txt(item.ghi_chu),
    };
  });

  const roundMassNum = num(roundWood.khoi_luong);
  const totalCalculated = normItems.reduce((acc, it) => acc + (it.calculated || 0), 0);

  const dailyGroups = {};
  for (const it of normItems) {
    const k = it.ngay || "";
    if (!dailyGroups[k]) dailyGroups[k] = [];
    dailyGroups[k].push(it);
  }

  return {
    file: filename || txt(data.source?.file) || "unnamed.json",
    source_file: txt(data.source?.file) || filename || "",
    ngay_nhap: txt(header.ngay_nhap || data.ngay_nhap),
    so_xe: txt(header.so_xe || data.so_xe || data.bien_so_xe),
    ngay_xe: txt(header.ngay_xe || data.ngay_xe),
    kich_thuoc_go_tron: txt(header.kich_thuoc_go_tron || data.kich_thuoc_go_tron),
    khoi_luong_go_tron: roundWood.khoi_luong,
    khoi_luong_go_tron_num: roundMassNum,
    kich_thuoc_xe: txt(header.kich_thuoc_xe || data.kich_thuoc_xe),
    round_wood: roundWood,
    items,
    norm_items: normItems,
    tong_khoi_luong_tinh: Math.round(totalCalculated * 1000) / 1000,
    daily_groups: dailyGroups,
    daily_ranges: [],
  };
}

const borderThin = {
  top: { style: "thin", color: { argb: "000000" } },
  left: { style: "thin", color: { argb: "000000" } },
  bottom: { style: "thin", color: { argb: "000000" } },
  right: { style: "thin", color: { argb: "000000" } },
};

function applyBorder(cell) {
  cell.border = borderThin;
}

export async function createBatchExcel(recordsData) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cloudflare OCR Worker";
  wb.created = new Date();

  const records = recordsData.map(({ data, filename }) => normalizeRecord(data, filename));

  // ----------------------------------------------------
  // SHEET 1: NHAT_KY_HANG_NGAY
  // ----------------------------------------------------
  const ws1 = wb.addWorksheet("NHAT_KY_HANG_NGAY", { views: [{ showGridLines: true }] });

  ws1.mergeCells("A1:W1");
  const a1 = ws1.getCell("A1");
  a1.value = "NHẬT KÝ GỖ XẺ HÀNG NGÀY";
  a1.font = { name: "Arial", size: 14, bold: true };
  a1.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(1).height = 24;

  const groupDefs = [
    ["A2", "A3", "Ngày nhập"],
    ["B2", "B3", "Ngày xẻ"],
    ["C2", "C3", "Tháng"],
    ["D2", "L2", "Gỗ tròn"],
    ["M2", "Q2", "Xẻ thành khí"],
    ["R2", "R3", "Công trình"],
    ["S2", "S3", "STT"],
    ["T2", "T3", "Tên Cấu kiện"],
    ["U2", "U3", "Nhà cung cấp"],
    ["V2", "V3", "Tổng khối lượng gỗ thành phẩm (m³)"],
    ["W2", "W3", "Tỷ lệ % thành phẩm"],
  ];

  for (const [start, end, title] of groupDefs) {
    ws1.mergeCells(`${start}:${end}`);
    const cell = ws1.getCell(start);
    cell.value = title;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "D9EAF7" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }

  const subheaders = {
    D3: "Số", E3: "Ký hiệu", F3: "Dài", G3: "Vành", H3: "Dài", I3: "Vành",
    J3: "Khối lượng gỗ tròn", K3: "Đơn giá", L3: "Thành tiền",
    M3: "Rộng", N3: "Cao", O3: "Dài", P3: "SL", Q3: "Khối lượng",
  };

  for (const [coord, text] of Object.entries(subheaders)) {
    const c = ws1.getCell(coord);
    c.value = text;
    c.font = { name: "Arial", size: 9, bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F2F2F2" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }

  for (let r = 2; r <= 3; r++) {
    for (let c = 1; c <= 23; c++) {
      applyBorder(ws1.getRow(r).getCell(c));
    }
  }
  ws1.getRow(2).height = 24;
  ws1.getRow(3).height = 42;

  let row = 4;
  for (const record of records) {
    const recordStart = row;
    let normItems = record.norm_items;
    if (!normItems || normItems.length === 0) {
      normItems = [{
        index: 1, dong: 1, ngay: "", ngay_date: null, thang: null,
        raw: "", dai: null, rong: null, day: null, sl: null,
        written: null, calculated: null, difference: null, status: "KIỂM TRA",
        cong_trinh: "", stt_cau_kien: "", ten_cau_kien: "", ghi_chu: ""
      }];
    }

    const grouped = {};
    for (const it of normItems) {
      const k = it.ngay || "";
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(it);
    }

    for (const [dateKey, groupItems] of Object.entries(grouped)) {
      const groupStart = row;
      for (const item of groupItems) {
        const r = ws1.getRow(row);
        r.height = 26;
        const vals = {
          1: record.ngay_nhap || "",
          2: parseDate(record.ngay_xe) || item.ngay_date || record.ngay_xe || "",
          3: item.thang || "",
          4: record.round_wood.so || "",
          5: record.round_wood.ky_hieu || "",
          6: num(record.round_wood.mua_dai),
          7: num(record.round_wood.mua_vanh),
          8: num(record.round_wood.thuc_dai),
          9: num(record.round_wood.thuc_vanh),
          10: record.khoi_luong_go_tron_num,
          11: num(record.round_wood.don_gia),
          12: num(record.round_wood.thanh_tien),
          13: item.rong,
          14: item.cao ?? item.day,
          15: item.dai,
          16: item.sl,
          17: { formula: `IFERROR(M${row}*N${row}*O${row}*P${row}/1000000,"")` },
          18: item.cong_trinh || "",
          19: item.stt_cau_kien || "",
          20: item.ten_cau_kien || "",
          21: item.nha_cung_cap || "",
        };

        for (let col = 1; col <= 23; col++) {
          const cell = r.getCell(col);
          if (vals[col] !== undefined) {
            cell.value = vals[col];
          }
          cell.font = { name: "Arial", size: 9 };
          cell.alignment = {
            horizontal: [18, 20, 21].includes(col) ? "left" : "center",
            vertical: "middle",
            wrapText: true,
          };
          applyBorder(cell);
        }

        [10, 11, 12, 17].forEach(c => {
          r.getCell(c).numFmt = "0.000";
        });
        if (vals[2] instanceof Date) {
          r.getCell(2).numFmt = "dd/mm/yyyy";
        }

        row++;
      }

      const groupEnd = row - 1;
      if (groupEnd >= groupStart) {
        if (groupEnd > groupStart) {
          ws1.mergeCells(`V${groupStart}:V${groupEnd}`);
          ws1.mergeCells(`W${groupStart}:W${groupEnd}`);
        }
        const vCell = ws1.getCell(`V${groupStart}`);
        const wCell = ws1.getCell(`W${groupStart}`);
        vCell.value = { formula: `SUM(Q${groupStart}:Q${groupEnd})` };
        wCell.value = { formula: `IFERROR(V${groupStart}/J${recordStart},"")` };
        vCell.numFmt = "0.000";
        wCell.numFmt = "0.0%";
        vCell.font = { name: "Arial", size: 9, bold: true };
        wCell.font = { name: "Arial", size: 9, bold: true };
        vCell.alignment = { horizontal: "center", vertical: "middle" };
        wCell.alignment = { horizontal: "center", vertical: "middle" };

        record.daily_ranges.push({
          ngay: dateKey,
          start_row: groupStart,
          end_row: groupEnd,
        });
      }
    }

    const recordEnd = row - 1;
    if (recordEnd > recordStart) {
      for (let col = 4; col <= 12; col++) {
        ws1.mergeCells(recordStart, col, recordEnd, col);
        ws1.getCell(recordStart, col).alignment = { horizontal: "center", vertical: "middle" };
      }
    }
  }

  const widths1 = {
    A: 13, B: 13, C: 8, D: 10, E: 13, F: 10, G: 10, H: 10, I: 10,
    J: 14, K: 13, L: 16, M: 9, N: 9, O: 10, P: 7, Q: 14,
    R: 22, S: 8, T: 22, U: 18, V: 19, W: 12,
  };
  for (const [col, w] of Object.entries(widths1)) {
    ws1.getColumn(col).width = w;
  }
  ws1.views = [{ state: "frozen", xSplit: 3, ySplit: 3 }];

  // ----------------------------------------------------
  // SHEET 2: TONG_HOP_NGAY
  // ----------------------------------------------------
  const ws2 = wb.addWorksheet("TONG_HOP_NGAY", { views: [{ showGridLines: true }] });
  ws2.mergeCells("A1:J1");
  const a2_1 = ws2.getCell("A1");
  a2_1.value = "TỔNG HỢP GỖ THEO NGÀY";
  a2_1.font = { name: "Arial", size: 14, bold: true };
  a2_1.alignment = { horizontal: "center", vertical: "middle" };

  const headers2 = [
    "Ngày", "File / Phiếu", "Ngày xẻ", "Số xẻ", "Kích thước gỗ tròn",
    "Khối lượng gỗ tròn (m³)", "Số dòng thành khí", "Khối lượng thành khí ngày (m³)",
    "Tỷ lệ ngày / gỗ tròn", "Cảnh báo"
  ];
  const r2Header = ws2.getRow(3);
  headers2.forEach((h, idx) => {
    const c = r2Header.getCell(idx + 1);
    c.value = h;
    c.font = { name: "Arial", size: 9, bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F2F2F2" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyBorder(c);
  });
  r2Header.height = 32;

  let r2Row = 4;
  for (const record of records) {
    for (const daily of record.daily_ranges) {
      const dateKey = daily.ngay;
      const startRow = daily.start_row;
      const endRow = daily.end_row;
      const roundMass = record.khoi_luong_go_tron_num;

      const warnings = [];
      if (!dateKey) warnings.push("THIEU_NGAY");
      if (roundMass == null) warnings.push("THIEU_KHOI_LUONG_GO_TRON");
      for (const it of (record.daily_groups[dateKey] || [])) {
        if (it.status !== "OK") warnings.push(`DONG_${it.dong}_${it.status}`);
      }

      const r = ws2.getRow(r2Row);
      r.height = 24;
      const parsedD = parseDate(dateKey);
      const parsedNx = parseDate(record.ngay_xe);

      r.getCell(1).value = parsedD || dateKey;
      r.getCell(2).value = record.file;
      r.getCell(3).value = parsedNx || record.ngay_xe;
      r.getCell(4).value = record.so_xe;
      r.getCell(5).value = record.kich_thuoc_go_tron;
      r.getCell(6).value = roundMass;
      r.getCell(7).value = endRow - startRow + 1;
      r.getCell(8).value = { formula: `SUM('NHAT_KY_HANG_NGAY'!Q${startRow}:Q${endRow})` };
      r.getCell(9).value = { formula: `IFERROR(H${r2Row}/F${r2Row},"")` };
      r.getCell(10).value = [...new Set(warnings)].join("; ");

      for (let c = 1; c <= 10; c++) {
        const cell = r.getCell(c);
        cell.font = { name: "Arial", size: 9 };
        cell.alignment = {
          horizontal: [2, 4, 5, 10].includes(c) ? "left" : "center",
          vertical: "middle"
        };
        applyBorder(cell);
      }

      r.getCell(6).numFmt = "0.000";
      r.getCell(8).numFmt = "0.000";
      r.getCell(9).numFmt = "0.0%";
      if (parsedD) r.getCell(1).numFmt = "dd/mm/yyyy";
      if (parsedNx) r.getCell(3).numFmt = "dd/mm/yyyy";

      r2Row++;
    }
  }

  // Row Tổng Sheet 2
  const totalR2 = ws2.getRow(r2Row);
  totalR2.getCell(1).value = "TỔNG";
  totalR2.getCell(1).font = { name: "Arial", size: 9, bold: true };
  totalR2.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  if (r2Row > 4) {
    totalR2.getCell(6).value = { formula: `SUM(F4:F${r2Row - 1})` };
    totalR2.getCell(8).value = { formula: `SUM(H4:H${r2Row - 1})` };
    totalR2.getCell(6).numFmt = "0.000";
    totalR2.getCell(8).numFmt = "0.000";
    totalR2.getCell(6).font = { name: "Arial", size: 9, bold: true };
    totalR2.getCell(8).font = { name: "Arial", size: 9, bold: true };
  }
  for (let c = 1; c <= 10; c++) {
    const cell = totalR2.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "EAF2F8" } };
    applyBorder(cell);
  }

  const widths2 = { A: 13, B: 30, C: 13, D: 18, E: 30, F: 22, G: 19, H: 27, I: 20, J: 35 };
  for (const [col, w] of Object.entries(widths2)) {
    ws2.getColumn(col).width = w;
  }
  ws2.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];

  // ----------------------------------------------------
  // SHEET 3: TONG_HOP_PHIEU
  // ----------------------------------------------------
  const ws3 = wb.addWorksheet("TONG_HOP_PHIEU", { views: [{ showGridLines: true }] });
  ws3.mergeCells("A1:J1");
  const a3_1 = ws3.getCell("A1");
  a3_1.value = "TỔNG HỢP NHẬT KÝ XE GỖ";
  a3_1.font = { name: "Arial", size: 14, bold: true };
  a3_1.alignment = { horizontal: "center", vertical: "middle" };

  const headers3 = [
    "STT", "File / Phiếu", "Ngày xẻ", "Số xẻ", "Kích thước gỗ tròn",
    "Khối lượng gỗ tròn (m³)", "Số dòng gỗ thành khí", "Tổng khối lượng thành khí (m³)",
    "Tỷ lệ % thành phẩm", "Kích thước xẻ"
  ];
  const r3Header = ws3.getRow(3);
  headers3.forEach((h, idx) => {
    const c = r3Header.getCell(idx + 1);
    c.value = h;
    c.font = { name: "Arial", size: 9, bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F2F2F2" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyBorder(c);
  });
  r3Header.height = 32;

  let r3Row = 4;
  records.forEach((record, idx) => {
    const r = ws3.getRow(r3Row);
    r.height = 24;
    const roundMass = record.khoi_luong_go_tron_num;
    const total = record.tong_khoi_luong_tinh;
    const ratio = roundMass ? total / roundMass : null;
    const parsedNx = parseDate(record.ngay_xe);

    r.getCell(1).value = idx + 1;
    r.getCell(2).value = record.file;
    r.getCell(3).value = parsedNx || record.ngay_xe;
    r.getCell(4).value = record.so_xe;
    r.getCell(5).value = record.kich_thuoc_go_tron;
    r.getCell(6).value = roundMass;
    r.getCell(7).value = record.norm_items.length;
    r.getCell(8).value = total;
    r.getCell(9).value = ratio;
    r.getCell(10).value = record.kich_thuoc_xe;

    for (let c = 1; c <= 10; c++) {
      const cell = r.getCell(c);
      cell.font = { name: "Arial", size: 9 };
      cell.alignment = {
        horizontal: [2, 4, 5, 10].includes(c) ? "left" : "center",
        vertical: "middle"
      };
      applyBorder(cell);
    }

    if (parsedNx) r.getCell(3).numFmt = "dd/mm/yyyy";
    r.getCell(6).numFmt = "0.000";
    r.getCell(8).numFmt = "0.000";
    r.getCell(9).numFmt = "0.0%";

    r3Row++;
  });

  const totalR3 = ws3.getRow(r3Row);
  totalR3.getCell(5).value = "TỔNG";
  totalR3.getCell(5).font = { name: "Arial", size: 9, bold: true };
  totalR3.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
  if (r3Row > 4) {
    totalR3.getCell(6).value = { formula: `SUM(F4:F${r3Row - 1})` };
    totalR3.getCell(8).value = { formula: `SUM(H4:H${r3Row - 1})` };
    totalR3.getCell(6).numFmt = "0.000";
    totalR3.getCell(8).numFmt = "0.000";
    totalR3.getCell(6).font = { name: "Arial", size: 9, bold: true };
    totalR3.getCell(8).font = { name: "Arial", size: 9, bold: true };
  }
  for (let c = 1; c <= 10; c++) {
    const cell = totalR3.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "EAF2F8" } };
    applyBorder(cell);
  }

  const widths3 = { A: 8, B: 30, C: 13, D: 18, E: 30, F: 22, G: 20, H: 28, I: 12, J: 24 };
  for (const [col, w] of Object.entries(widths3)) {
    ws3.getColumn(col).width = w;
  }
  ws3.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];

  // ----------------------------------------------------
  // SHEET 4: CHI_TIET
  // ----------------------------------------------------
  const ws4 = wb.addWorksheet("CHI_TIET", { views: [{ showGridLines: true }] });
  ws4.mergeCells("A1:V1");
  const a4_1 = ws4.getCell("A1");
  a4_1.value = "CHI TIẾT GỖ TRÒN + GỖ THÀNH KHÍ";
  a4_1.font = { name: "Arial", size: 14, bold: true };
  a4_1.alignment = { horizontal: "center", vertical: "middle" };

  const headers4 = [
    "File / Phiếu", "Ngày", "Ngày xẻ", "Số xẻ", "Thông tin gỗ tròn OCR gốc",
    "Khối lượng gỗ tròn (m³)", "STT dòng", "Kích thước và số lượng",
    "Dài (cm)", "Rộng (cm)", "Dày (cm)", "SL", "Khối lượng ghi (m³)",
    "Khối lượng tính (m³)", "Chênh lệch (m³)", "Trạng thái", "Công trình",
    "STT cấu kiện", "Tên cấu kiện", "Kích thước xẻ", "Ghi chú", "Nguồn ảnh"
  ];
  const r4Header = ws4.getRow(3);
  headers4.forEach((h, idx) => {
    const c = r4Header.getCell(idx + 1);
    c.value = h;
    c.font = { name: "Arial", size: 9, bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F2F2F2" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyBorder(c);
  });
  r4Header.height = 32;

  let r4Row = 4;
  for (const record of records) {
    for (const item of record.norm_items) {
      const r = ws4.getRow(r4Row);
      r.height = 24;
      const parsedD = item.ngay_date;
      const parsedNx = parseDate(record.ngay_xe);

      r.getCell(1).value = record.file;
      r.getCell(2).value = parsedD || item.ngay;
      r.getCell(3).value = parsedNx || record.ngay_xe;
      r.getCell(4).value = record.so_xe;
      r.getCell(5).value = record.round_wood.raw;
      r.getCell(6).value = record.khoi_luong_go_tron_num;
      r.getCell(7).value = item.dong;
      r.getCell(8).value = item.raw;
      r.getCell(9).value = item.dai;
      r.getCell(10).value = item.rong;
      r.getCell(11).value = item.cao ?? item.day;
      r.getCell(12).value = item.sl;
      r.getCell(13).value = item.written;
      r.getCell(14).value = item.calculated;
      r.getCell(15).value = item.difference;
      r.getCell(16).value = item.status;
      r.getCell(17).value = item.cong_trinh;
      r.getCell(18).value = item.stt_cau_kien;
      r.getCell(19).value = item.ten_cau_kien;
      r.getCell(20).value = record.kich_thuoc_xe;
      r.getCell(21).value = item.ghi_chu;
      r.getCell(22).value = record.source_file;

      for (let c = 1; c <= 22; c++) {
        const cell = r.getCell(c);
        cell.font = { name: "Arial", size: 9 };
        cell.alignment = {
          horizontal: [5, 8, 17, 19, 20, 21, 22].includes(c) ? "left" : "center",
          vertical: "middle"
        };
        applyBorder(cell);
      }

      [6, 13, 14, 15].forEach(c => {
        r.getCell(c).numFmt = "0.000";
      });
      if (parsedD) r.getCell(2).numFmt = "dd/mm/yyyy";
      if (parsedNx) r.getCell(3).numFmt = "dd/mm/yyyy";

      r4Row++;
    }
  }

  const totalR4 = ws4.getRow(r4Row);
  totalR4.getCell(1).value = "TỔNG CỘNG";
  totalR4.getCell(1).font = { name: "Arial", size: 9, bold: true };
  if (r4Row > 4) {
    [12, 13, 14, 15].forEach(c => {
      const colLetter = ws4.getColumn(c).letter;
      totalR4.getCell(c).value = { formula: `SUM(${colLetter}4:${colLetter}${r4Row - 1})` };
      totalR4.getCell(c).numFmt = "0.000";
      totalR4.getCell(c).font = { name: "Arial", size: 9, bold: true };
    });
  }
  for (let c = 1; c <= 22; c++) {
    const cell = totalR4.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "EAF2F8" } };
    applyBorder(cell);
  }

  const widths4 = {
    A: 28, B: 13, C: 13, D: 18, E: 32, F: 22, G: 10, H: 25, I: 11,
    J: 11, K: 11, L: 8, M: 18, N: 18, O: 16, P: 16, Q: 24, R: 16,
    S: 24, T: 24, U: 32, V: 24
  };
  for (const [col, w] of Object.entries(widths4)) {
    ws4.getColumn(col).width = w;
  }
  ws4.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];

  // ----------------------------------------------------
  // SHEET 5: CANH_BAO
  // ----------------------------------------------------
  const ws5 = wb.addWorksheet("CANH_BAO", { views: [{ showGridLines: true }] });
  ws5.mergeCells("A1:J1");
  const a5_1 = ws5.getCell("A1");
  a5_1.value = "CẢNH BÁO / KIỂM TRA OCR";
  a5_1.font = { name: "Arial", size: 14, bold: true };
  a5_1.alignment = { horizontal: "center", vertical: "middle" };

  const headers5 = [
    "File", "Ngày", "Ngày xẻ", "Số xẻ", "STT dòng or Chủng loại",
    "Kích thước", "Khối lượng ghi", "Khối lượng tính", "Chênh lệch", "Trạng thái"
  ];
  const r5Header = ws5.getRow(3);
  headers5.forEach((h, idx) => {
    const c = r5Header.getCell(idx + 1);
    c.value = h;
    c.font = { name: "Arial", size: 9, bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F2F2F2" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyBorder(c);
  });
  r5Header.height = 32;

  let r5Row = 4;
  for (const record of records) {
    // 1. Kiểm tra chênh lệch Gỗ tròn
    const strGoTron = record.kich_thuoc_go_tron || "";
    const matches = [...strGoTron.matchAll(/(\d+(?:[,.]\d+)?)[\s\-]*[Vv]\s*(\d+)/g)];
    if (matches.length >= 2) {
      const parseNum = (s) => parseFloat(s.replace(',', '.'));
      const dai1 = parseNum(matches[0][1]);
      const vanh1 = parseInt(matches[0][2], 10);
      const dai2 = parseNum(matches[1][1]);
      const vanh2 = parseInt(matches[1][2], 10);
      
      if (!isNaN(dai1) && !isNaN(dai2) && !isNaN(vanh1) && !isNaN(vanh2)) {
        const lengthDiff = +(dai2 - dai1).toFixed(2);
        const girthDiff = vanh2 - vanh1;
        
        if (Math.abs(lengthDiff) > 0 || Math.abs(girthDiff) > 0) {
          const r = ws5.getRow(r5Row);
          r.height = 36;
          const parsedNx = parseDate(record.ngay_xe);
          
          r.getCell(1).value = record.file;
          r.getCell(2).value = parsedNx || record.ngay_xe;
          r.getCell(3).value = parsedNx || record.ngay_xe;
          r.getCell(4).value = record.so_xe;
          r.getCell(5).value = "Gỗ tròn";
          r.getCell(6).value = strGoTron;
          r.getCell(7).value = `Dài: ${dai1}m\nVanh: ${vanh1}cm`;
          r.getCell(8).value = `Dài: ${dai2}m\nVanh: ${vanh2}cm`;
          
          const diffTexts = [];
          if (lengthDiff !== 0) diffTexts.push(`Dài: ${lengthDiff > 0 ? '+'+lengthDiff : lengthDiff}m`);
          if (girthDiff !== 0) diffTexts.push(`Vanh: ${girthDiff > 0 ? '+'+girthDiff : girthDiff}cm`);
          r.getCell(9).value = diffTexts.join("\n");
          r.getCell(10).value = "SAI LỆCH KÍCH THƯỚC";
          
          for (let c = 1; c <= 10; c++) {
            const cell = r.getCell(c);
            cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF0000" } };
            cell.alignment = { horizontal: [1, 6].includes(c) ? "left" : "center", vertical: "middle", wrapText: true };
            applyBorder(cell);
          }
          if (parsedNx) r.getCell(2).numFmt = "dd/mm/yyyy";
          if (parsedNx) r.getCell(3).numFmt = "dd/mm/yyyy";
          r5Row++;
        }
      }
    }

    // 2. Cảnh báo các dòng gỗ xẻ bị sai lệch khối lượng
    for (const item of record.norm_items) {
      if (item.status === "OK") continue;

      const r = ws5.getRow(r5Row);
      r.height = 24;
      const parsedD = item.ngay_date;
      const parsedNx = parseDate(record.ngay_xe);

      r.getCell(1).value = record.file;
      r.getCell(2).value = parsedD || item.ngay;
      r.getCell(3).value = parsedNx || record.ngay_xe;
      r.getCell(4).value = record.so_xe;
      r.getCell(5).value = item.dong;
      r.getCell(6).value = item.raw;
      r.getCell(7).value = item.written;
      r.getCell(8).value = item.calculated;
      r.getCell(9).value = item.difference;
      r.getCell(10).value = item.status;

      for (let c = 1; c <= 10; c++) {
        const cell = r.getCell(c);
        cell.font = { name: "Arial", size: 9 };
        cell.alignment = {
          horizontal: [1, 6].includes(c) ? "left" : "center",
          vertical: "middle"
        };
        applyBorder(cell);
      }

      [7, 8, 9].forEach(c => {
        r.getCell(c).numFmt = "0.000";
      });
      if (parsedD) r.getCell(2).numFmt = "dd/mm/yyyy";
      if (parsedNx) r.getCell(3).numFmt = "dd/mm/yyyy";

      r5Row++;
    }
  }

  if (r5Row === 4) {
    const r = ws5.getRow(4);
    r.getCell(1).value = "Không có dòng vượt ngưỡng kiểm tra.";
    r.getCell(1).font = { name: "Arial", size: 9, bold: true };
    r.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  }

  const widths5 = { A: 30, B: 13, C: 13, D: 18, E: 11, F: 28, G: 18, H: 18, I: 18, J: 18 };
  for (const [col, w] of Object.entries(widths5)) {
    ws5.getColumn(col).width = w;
  }
  ws5.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];

  return await wb.xlsx.writeBuffer();
}

