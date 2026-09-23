/**
 * Module quản lý truy vấn Cloudflare D1 Database:
 * Bảng: documents, document_items, abbreviations, system_settings
 */

import { parseNumber } from "./ocr.js";

export async function countDocuments(db, search = null) {
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    const res = await db.prepare(
      `SELECT count(*) as count FROM documents 
       WHERE file_name LIKE ? OR so_xe LIKE ? OR ngay_xe LIKE ? OR kich_thuoc_go_tron LIKE ?`
    ).bind(q, q, q, q).first();
    return res?.count || 0;
  }
  const res = await db.prepare("SELECT count(*) as count FROM documents").first();
  return res?.count || 0;
}

export async function getDocuments(db, { skip = 0, limit = 50, search = null } = {}) {
  let docsQuery;
  const cleanSearch = search && search.trim() ? `%${search.trim()}%` : null;

  if (cleanSearch) {
    docsQuery = db.prepare(
      `SELECT id, file_name, image_path, so_xe, ngay_xe, kich_thuoc_go_tron, created_at 
       FROM documents 
       WHERE file_name LIKE ? OR so_xe LIKE ? OR ngay_xe LIKE ? OR kich_thuoc_go_tron LIKE ?
       ORDER BY id DESC LIMIT ? OFFSET ?`
    ).bind(cleanSearch, cleanSearch, cleanSearch, cleanSearch, limit, skip);
  } else {
    docsQuery = db.prepare(
      `SELECT id, file_name, image_path, so_xe, ngay_xe, kich_thuoc_go_tron, created_at 
       FROM documents 
       ORDER BY id DESC LIMIT ? OFFSET ?`
    ).bind(limit, skip);
  }

  const { results: docs } = await docsQuery.all();
  if (!docs || docs.length === 0) return [];

  // Lấy số lượng items của từng document
  const docIds = docs.map(d => d.id);
  const placeholders = docIds.map(() => "?").join(",");
  const { results: counts } = await db.prepare(
    `SELECT document_id, count(*) as item_count 
     FROM document_items 
     WHERE document_id IN (${placeholders}) 
     GROUP BY document_id`
  ).bind(...docIds).all();

  const countMap = {};
  for (const c of (counts || [])) {
    countMap[c.document_id] = c.item_count;
  }

  return docs.map(d => ({
    id: d.id,
    file_name: d.file_name,
    image_path: d.image_path,
    so_xe: d.so_xe,
    ngay_xe: d.ngay_xe,
    kich_thuoc_go_tron: d.kich_thuoc_go_tron,
    total_items: countMap[d.id] || 0,
    created_at: d.created_at
  }));
}

export async function getDocumentById(db, id) {
  const doc = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first();
  if (!doc) return null;

  const { results: items } = await db.prepare(
    "SELECT * FROM document_items WHERE document_id = ? ORDER BY dong ASC, id ASC"
  ).bind(id).all();

  let rawJson = null;
  if (doc.raw_json) {
    try {
      rawJson = JSON.parse(doc.raw_json);
    } catch {
      rawJson = doc.raw_json;
    }
  }

  return {
    ...doc,
    raw_json: rawJson,
    items: items || []
  };
}

export async function getDocumentByFileName(db, fileName) {
  return await db.prepare("SELECT * FROM documents WHERE file_name = ?").bind(fileName).first();
}

export async function deleteDocument(db, id) {
  // SQLite Foreign Keys cascade xóa document_items
  await db.prepare("DELETE FROM document_items WHERE document_id = ?").bind(id).run();
  const res = await db.prepare("DELETE FROM documents WHERE id = ?").bind(id).run();
  return res.success;
}

export async function saveOrUpdateDocument(db, jsonData, fileName, imagePath = null) {
  const header = jsonData.header || {};
  const items = Array.isArray(jsonData.items) ? jsonData.items : [];
  const rawJsonStr = JSON.stringify(jsonData);

  const docType = jsonData.document_type || "NHẬT KÝ XẺ GỖ";
  const ngayNhap = header.ngay_nhap || "";
  const ngayXe = header.ngay_xe || "";
  const soXe = header.so_xe || "";
  const ktGoTron = header.kich_thuoc_go_tron || "";
  const klGoTron = header.khoi_luong_go_tron || "";
  const ktXe = header.kich_thuoc_xe || "";

  // 1. Kiểm tra tài liệu đã tồn tại hay chưa
  const existing = await getDocumentByFileName(db, fileName);
  let docId;

  if (existing) {
    docId = existing.id;
    const finalImagePath = imagePath || existing.image_path || "";
    await db.prepare(
      `UPDATE documents 
       SET image_path = ?, document_type = ?, ngay_nhap = ?, ngay_xe = ?, so_xe = ?,
           kich_thuoc_go_tron = ?, khoi_luong_go_tron = ?, kich_thuoc_xe = ?,
           raw_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      finalImagePath, docType, ngayNhap, ngayXe, soXe,
      ktGoTron, klGoTron, ktXe, rawJsonStr, docId
    ).run();

    // Xóa các items cũ để nạp danh sách items mới
    await db.prepare("DELETE FROM document_items WHERE document_id = ?").bind(docId).run();
  } else {
    const finalImagePath = imagePath || "";
    const insertRes = await db.prepare(
      `INSERT INTO documents 
       (file_name, image_path, document_type, ngay_nhap, ngay_xe, so_xe,
        kich_thuoc_go_tron, khoi_luong_go_tron, kich_thuoc_xe, raw_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`
    ).bind(
      fileName, finalImagePath, docType, ngayNhap, ngayXe, soXe,
      ktGoTron, klGoTron, ktXe, rawJsonStr
    ).run();

    docId = insertRes.meta.last_row_id;
  }

  // 2. Chèn các items vào document_items theo batch
  if (items.length > 0) {
    const statements = items.map((it, idx) => {
      const dong = it.dong !== undefined && it.dong !== null ? it.dong : idx + 1;
      const ngay = it.ngay || "";
      const ktSl = it.kich_thuoc_so_luong || "";
      const rong = it.rong || "";
      const cao = it.cao || "";
      const dai = it.dai || "";
      const sl = it.so_luong || "";
      const kl = parseNumber(it.khoi_luong);
      const ct = it.cong_trinh || "";
      const sttCk = it.stt_cau_kien || "";
      const tenCk = it.ten_cau_kien || "";
      const ncc = it.nha_cung_cap || "";
      const gc = it.ghi_chu || "";

      return db.prepare(
        `INSERT INTO document_items 
         (document_id, dong, ngay, kich_thuoc_so_luong, rong, cao, dai,
          so_luong, khoi_luong, cong_trinh, stt_cau_kien, ten_cau_kien, nha_cung_cap, ghi_chu)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(docId, dong, ngay, ktSl, rong, cao, dai, sl, kl, ct, sttCk, tenCk, ncc, gc);
    });

    // D1 batch execute
    await db.batch(statements);
  }

  return docId;
}

// ----------------------------------------------------
// TỪ ĐIỂN CHỮ VIẾT TẮT & PROMPT SETTINGS
// ----------------------------------------------------

export async function getAbbreviations(db, { category = null, search = null } = {}) {
  let query = "SELECT * FROM abbreviations WHERE 1=1";
  const params = [];

  if (category && category.trim()) {
    query += " AND category = ?";
    params.push(category.trim());
  }
  if (search && search.trim()) {
    query += " AND (short LIKE ? OR full LIKE ? OR description LIKE ?)";
    const q = `%${search.trim()}%`;
    params.push(q, q, q);
  }
  query += " ORDER BY category, short";

  const { results } = await db.prepare(query).bind(...params).all();
  return (results || []).map(r => ({
    ...r,
    synonyms: r.synonyms ? JSON.parse(r.synonyms) : []
  }));
}

export async function saveAbbreviation(db, item) {
  const id = item.id || `ab_${Date.now()}`;
  const category = item.category || "cong_trinh";
  const short = String(item.short || "").trim();
  const full = String(item.full || "").trim();
  const description = String(item.description || "").trim();
  const synonyms = JSON.stringify(item.synonyms || []);

  await db.prepare(
    `INSERT OR REPLACE INTO abbreviations 
     (id, category, short, full, description, synonyms, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(id, category, short, full, description, synonyms).run();

  return { id, category, short, full, description, synonyms: item.synonyms || [] };
}

export async function deleteAbbreviation(db, id) {
  const res = await db.prepare("DELETE FROM abbreviations WHERE id = ?").bind(id).run();
  return res.success;
}

export async function getSystemSetting(db, key) {
  const res = await db.prepare("SELECT value FROM system_settings WHERE key = ?").bind(key).first();
  return res ? res.value : null;
}

export async function setSystemSetting(db, key, value, description = "") {
  await db.prepare(
    `INSERT OR REPLACE INTO system_settings (key, value, description, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(key, value, description).run();
}

export async function deleteSystemSetting(db, key) {
  await db.prepare("DELETE FROM system_settings WHERE key = ?").bind(key).run();
}

