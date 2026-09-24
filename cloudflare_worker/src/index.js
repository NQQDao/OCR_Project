/**
 * Cloudflare Worker: Fullstack Serverless OCR Wood Project
 * - Compute: Cloudflare Workers (0ms cold start, globally distributed)
 * - Storage: Cloudflare R2 (images, output JSON, Excel exports)
 * - Database: Cloudflare D1 (Serverless SQLite database)
 * - AI Vision: Google Gemini API (v1beta REST with multi-model fallback)
 * - Excel: ExcelJS generating 5 specialized logbook sheets
 */

import htmlContent from "./html.js";
import { createBatchExcel } from "./excel.js";
import {
  buildOcrPrompt,
  buildFastPrompt,
  callGeminiVision,
  parseAndValidateOcrResponse,
  BASE_OCR_PROMPT
} from "./ocr.js";
import {
  countDocuments,
  getDocuments,
  getDocumentById,
  getDocumentByFileName,
  deleteDocument,
  saveOrUpdateDocument,
  getAbbreviations,
  saveAbbreviation,
  deleteAbbreviation,
  getSystemSetting,
  setSystemSetting,
  deleteSystemSetting,
  getDailyStats
} from "./db.js";

const DEFAULT_CATEGORIES = {
  cong_trinh: "Mã / Tên công trình",
  cau_kien: "Tên cấu kiện mộc",
  de_nham: "Từ dễ nhầm (Cấu kiện vs Công trình)",
  go_tron_quy_cach: "Quy cách & Gỗ tròn",
  ghi_chu: "Ghi chú & Đơn vị"
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",
      "Access-Control-Allow-Headers": "*",
      ...extraHeaders
    }
  });
}

function corsPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400"
    }
  });
}

const SAW_BLADE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/></linearGradient><linearGradient id="m" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#cbd5e1"/></linearGradient></defs><path d="M 32 4 L 36 12.4 L 43 7.9 L 46 7.8 L 45.2 17 L 53.6 16.6 L 56.2 18 L 51 25.6 L 58.4 29.5 L 60 32 L 51.6 36 L 56.1 43 L 56.2 46 L 47 45.2 L 47.4 53.6 L 46 56.2 L 38.4 51 L 34.5 58.4 L 32 60 L 28 51.6 L 21 56.1 L 18 56.2 L 18.8 47 L 10.4 47.4 L 7.8 46 L 13 38.4 L 5.6 34.5 L 4 32 L 12.4 28 L 7.9 21 L 7.8 18 L 17 18.8 L 16.6 10.4 L 18 7.8 L 25.6 13 L 29.5 5.6 Z" fill="url(#g)" stroke="#78350f" stroke-width="1.5" stroke-linejoin="round"/><circle cx="32" cy="32" r="15" fill="none" stroke="#fef3c7" stroke-width="1.2" opacity="0.9" stroke-dasharray="3.5 2"/><circle cx="32" cy="32" r="7.5" fill="url(#m)" stroke="#78350f" stroke-width="1.2"/><circle cx="32" cy="32" r="3.5" fill="#0f172a"/><circle cx="32" cy="18" r="1.6" fill="#78350f"/><circle cx="32" cy="46" r="1.6" fill="#78350f"/><circle cx="18" cy="32" r="1.6" fill="#78350f"/><circle cx="46" cy="32" r="1.6" fill="#78350f"/></svg>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;

    // 1. OPTIONS Preflight CORS
    if (method === "OPTIONS") {
      return corsPreflightResponse();
    }

    try {
      // Favicon lưỡi cưa xẻ gỗ tròn
      if ((pathname === "/favicon.ico" || pathname === "/favicon.svg") && (method === "GET" || method === "HEAD")) {
        return new Response(SAW_BLADE_SVG, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=604800, immutable",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // 2. GET / : Trả về Web UI Dashboard
      if ((pathname === "/" || pathname === "/index.html") && method === "GET") {
        return new Response(htmlContent, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=3600"
          }
        });
      }

      // 3. GET /images/*, /web_uploads/*, /api/image/* : Phục vụ ảnh từ R2
      if (
        (pathname.startsWith("/images/") ||
          pathname.startsWith("/web_uploads/") ||
          pathname.startsWith("/api/image/")) &&
        (method === "GET" || method === "HEAD")
      ) {
        let filename = decodeURIComponent(pathname.replace(/^\/(images|web_uploads|api\/image)\//, ""));
        filename = filename.replace(/^(\.\.[\/\\])+/, ""); // ngăn chặn path traversal

        let obj = await env.MY_BUCKET.get(`images/${filename}`);
        if (!obj) {
          obj = await env.MY_BUCKET.get(`web_uploads/${filename}`);
        }
        if (!obj) {
          obj = await env.MY_BUCKET.get(filename);
        }

        if (!obj) {
          return jsonResponse({ error: "Không tìm thấy ảnh trên Cloudflare R2", file: filename }, 404);
        }

        const headers = new Headers();
        obj.writeHttpMetadata(headers);
        headers.set("etag", obj.httpEtag);
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Cache-Control", "public, max-age=604800, immutable");

        if (!headers.has("content-type")) {
          const lower = filename.toLowerCase();
          if (lower.endsWith(".png")) headers.set("content-type", "image/png");
          else headers.set("content-type", "image/jpeg");
        }

        if (method === "HEAD") return new Response(null, { headers });
        return new Response(obj.body, { headers, status: 200 });
      }

      // ============================================================
      // 4. API TÀI LIỆU (DOCUMENTS & D1)
      // ============================================================

      // GET /api/documents : Danh sách phiếu xẻ
      if (pathname === "/api/documents" && method === "GET") {
        const skip = Math.max(0, parseInt(url.searchParams.get("skip") || "0", 10));
        const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
        const search = url.searchParams.get("search");
        const sortBy = url.searchParams.get("sortBy") || "newest_created";

        const total = await countDocuments(env.DB, search);
        const docs = await getDocuments(env.DB, { skip, limit, search, sortBy });

        return jsonResponse({
          status: "success",
          total,
          skip,
          limit,
          count: docs.length,
          documents: docs
        });
      }

      // GET /api/documents/:id : Chi tiết 1 phiếu xẻ kèm dòng vật tư
      if (pathname.startsWith("/api/documents/") && method === "GET") {
        const id = parseInt(pathname.slice("/api/documents/".length), 10);
        if (isNaN(id)) return jsonResponse({ error: "ID không hợp lệ" }, 400);

        const doc = await getDocumentById(env.DB, id);
        if (!doc) return jsonResponse({ error: "Không tìm thấy phiếu trong CSDL D1" }, 404);

        return jsonResponse({
          status: "success",
          document: {
            id: doc.id,
            file_name: doc.file_name,
            image_path: doc.image_path,
            so_xe: doc.so_xe,
            ngay_xe: doc.ngay_xe,
            kich_thuoc_go_tron: doc.kich_thuoc_go_tron,
            khoi_luong_go_tron: doc.khoi_luong_go_tron,
            kich_thuoc_xe: doc.kich_thuoc_xe,
            raw_json: doc.raw_json,
            items: (doc.items || []).map(it => ({
              dong: it.dong,
              ngay: it.ngay,
              kich_thuoc_so_luong: it.kich_thuoc_so_luong,
              khoi_luong: it.khoi_luong,
              cong_trinh: it.cong_trinh,
              ten_cau_kien: it.ten_cau_kien,
              ghi_chu: it.ghi_chu
            }))
          }
        });
      }

      // DELETE /api/documents/:id : Xóa phiếu
      if (pathname.startsWith("/api/documents/") && method === "DELETE") {
        const id = parseInt(pathname.slice("/api/documents/".length), 10);
        if (isNaN(id)) return jsonResponse({ error: "ID không hợp lệ" }, 400);

        const doc = await getDocumentById(env.DB, id);
        if (!doc) return jsonResponse({ error: "Không tìm thấy phiếu để xóa" }, 404);

        await deleteDocument(env.DB, id);

        // Xóa file JSON trên R2 nếu có
        try {
          await env.MY_BUCKET.delete(`output/${doc.file_name}`);
        } catch {}

        return jsonResponse({
          status: "success",
          message: `Đã xóa phiếu '${doc.file_name}' khỏi Cloudflare D1 & R2 thành công.`
        });
      }

      // ============================================================
      // 5. API JSON (R2 & D1)
      // ============================================================

      // GET /api/json/:filename : Lấy nội dung file JSON
      if (pathname.startsWith("/api/json/") && method === "GET") {
        let filename = decodeURIComponent(pathname.slice("/api/json/".length));
        if (!filename.toLowerCase().endsWith(".json")) filename += ".json";

        // Thử tìm trên R2 trước
        let obj = await env.MY_BUCKET.get(`output/${filename}`);
        if (!obj) obj = await env.MY_BUCKET.get(filename);

        if (obj) {
          const content = await obj.text();
          return new Response(content, {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=60"
            }
          });
        }

        // Nếu R2 chưa có, thử tìm trong D1
        const doc = await getDocumentByFileName(env.DB, filename);
        if (doc && doc.raw_json) {
          return new Response(
            typeof doc.raw_json === "string" ? doc.raw_json : JSON.stringify(doc.raw_json),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }

        return jsonResponse({ error: "Không tìm thấy file JSON", file: filename }, 404);
      }

      // PUT /api/json/:filename : Lưu chỉnh sửa JSON & cập nhật D1
      if (pathname.startsWith("/api/json/") && method === "PUT") {
        let filename = decodeURIComponent(pathname.slice("/api/json/".length));
        if (!filename.toLowerCase().endsWith(".json")) filename += ".json";

        const jsonData = await request.json();
        const jsonStr = JSON.stringify(jsonData, null, 2);

        // 1. Lưu lên Cloudflare R2
        await env.MY_BUCKET.put(`output/${filename}`, jsonStr, {
          httpMetadata: { contentType: "application/json; charset=utf-8" }
        });

        // 2. Cập nhật Cloudflare D1
        const imageFile = filename.replace(/_v51\.json$/i, ".jpg").replace(/\.json$/i, ".jpg");
        await saveOrUpdateDocument(env.DB, jsonData, filename, imageFile);

        return jsonResponse({
          status: "success",
          message: `Đã lưu chỉnh sửa JSON '${filename}' và đồng bộ lên D1 & R2 thành công!`
        });
      }

      // ============================================================
      // 6. API OCR & BATCH OCR (GEMINI VISION + R2 + D1)
      // ============================================================

      if ((pathname === "/api/ocr" || pathname === "/api/ocr/batch") && method === "POST") {
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
          return jsonResponse({ error: "Yêu cầu định dạng multipart/form-data" }, 400);
        }

        const formData = await request.formData();
        const files = [];

        for (const [key, value] of formData.entries()) {
          if (value && typeof value === "object" && typeof value.arrayBuffer === "function") {
            files.push(value);
          }
        }

        if (files.length === 0) {
          return jsonResponse({ error: "Chưa chọn file ảnh nào để nhận diện." }, 400);
        }

        const urlParams = new URL(request.url); const mode = urlParams.searchParams.get('mode'); const prompt = mode === 'fast' ? await buildFastPrompt(env) : await buildOcrPrompt(env);
        const results = [];

        for (const file of files) {
          const originalName = file.name || "upload.jpg";
          const lower = originalName.toLowerCase();
          if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg") && !lower.endsWith(".png")) {
            results.push({
              status: "error",
              file: originalName,
              error: "Chỉ hỗ trợ file ảnh định dạng JPG, JPEG, PNG."
            });
            continue;
          }

          try {
            const arrayBuf = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuf);

            // Chuyển binary sang base64
            let binaryStr = "";
            const len = bytes.byteLength;
            for (let i = 0; i < len; i += 8192) {
              binaryStr += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
            }
            const base64Data = btoa(binaryStr);
            const mimeType = lower.endsWith(".png") ? "image/png" : "image/jpeg";

            // 1. Lưu ảnh gốc lên R2
            await env.MY_BUCKET.put(`images/${originalName}`, arrayBuf, {
              httpMetadata: { contentType: mimeType }
            });
            await env.MY_BUCKET.put(`web_uploads/${originalName}`, arrayBuf, {
              httpMetadata: { contentType: mimeType }
            });

            // 2. Gọi Google Gemini Vision với Fallback
            const aiResp = await callGeminiVision({
              imageBase64: base64Data,
              mimeType,
              prompt,
              env
            });

            if (mode === 'fast') {
                let fastJson = { so_xe: "", so_dong: 0 };
                const match = aiResp.text.match(/\{[\s\S]*?\}/);
                if (match) {
                    try {
                        fastJson = JSON.parse(match[0]);
                    } catch (e) {}
                }
                results.push({
                   status: "success",
                   file: originalName,
                   raw_json: fastJson,
                   model_used: aiResp.modelUsed
                });
                continue;
            }

            // 3. Parse và kiểm tra đối chiếu khối lượng
            const finalDoc = parseAndValidateOcrResponse(aiResp.text, originalName, aiResp.modelUsed);

            // 4. Tạo tên file JSON và lưu vào R2
            const stem = originalName.replace(/\.[^/.]+$/, "");
            const jsonFileName = `${stem}_v51.json`;
            const jsonText = JSON.stringify(finalDoc, null, 2);

            await env.MY_BUCKET.put(`output/${jsonFileName}`, jsonText, {
              httpMetadata: { contentType: "application/json; charset=utf-8" }
            });

            // 5. Lưu kết quả vào Cloudflare D1
            await saveOrUpdateDocument(env.DB, finalDoc, jsonFileName, originalName);

            results.push({
              status: "success",
              file: originalName,
              json_file: jsonFileName,
              model_used: aiResp.modelUsed
            });
          } catch (ocrErr) {
            results.push({
              status: "error",
              file: originalName,
              error: ocrErr.message || String(ocrErr)
            });
          }
        }

        const successCount = results.filter(r => r.status === "success").length;
        const errorCount = results.length - successCount;

        const batchResponse = {
          status: "completed",
          total: results.length,
          success: successCount,
          error: errorCount,
          results: results
        };

        if (pathname === "/api/ocr" && results.length === 1) {
          return jsonResponse(results[0]);
        }

        return jsonResponse(batchResponse);
      }

      // ============================================================
      // 7. API XUẤT EXCEL (EXCELJS STREAMING TỪ R2/D1)
      // ============================================================

      if (pathname === "/api/excel/batch" && method === "POST") {
        let reqData = {};
        try {
          reqData = await request.json();
        } catch {}

        let jsonFiles = reqData.json_files || [];

        // Nếu không gửi danh sách file, tự động lấy toàn bộ từ D1
        if (!Array.isArray(jsonFiles) || jsonFiles.length === 0) {
          const { results: allDocs } = await env.DB.prepare(
            "SELECT file_name, raw_json FROM documents ORDER BY id DESC"
          ).all();
          if (!allDocs || allDocs.length === 0) {
            return jsonResponse({ error: "Chưa có dữ liệu nào trong CSDL để xuất Excel." }, 400);
          }
          jsonFiles = allDocs.map(d => d.file_name);
        }

        const recordsData = [];
        for (const fileName of jsonFiles) {
          let clean = fileName.trim();
          if (!clean.endsWith(".json")) clean += ".json";

          // Thử đọc từ R2
          let obj = await env.MY_BUCKET.get(`output/${clean}`);
          if (!obj) obj = await env.MY_BUCKET.get(clean);

          if (obj) {
            try {
              const d = JSON.parse(await obj.text());
              recordsData.push({ data: d, filename: clean });
              continue;
            } catch {}
          }

          // Thử đọc từ D1
          const doc = await getDocumentByFileName(env.DB, clean);
          if (doc && doc.raw_json) {
            try {
              const d = typeof doc.raw_json === "string" ? JSON.parse(doc.raw_json) : doc.raw_json;
              recordsData.push({ data: d, filename: clean });
            } catch {}
          }
        }

        if (recordsData.length === 0) {
          return jsonResponse({ error: "Không tìm thấy dữ liệu JSON hợp lệ để xuất Excel." }, 400);
        }

        // Sinh file Excel bằng ExcelJS
        const excelBuffer = await createBatchExcel(recordsData);
        const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
        const excelFileName = `nhat_ky_xe_tong_hop_${timestamp}.xlsx`;

        // Tự động sao lưu file Excel lên Cloudflare R2
        try {
          await env.MY_BUCKET.put(`excel_exports/${excelFileName}`, excelBuffer, {
            httpMetadata: {
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
          });
        } catch {}

        return new Response(excelBuffer, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${excelFileName}"`,
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      if (pathname === "/api/excel" && method === "GET") {
        const jsonFile = url.searchParams.get("json_file");
        if (!jsonFile) return jsonResponse({ error: "Chưa truyền tham số json_file" }, 400);

        let clean = jsonFile.trim();
        if (!clean.endsWith(".json")) clean += ".json";

        let jsonData = null;
        let obj = await env.MY_BUCKET.get(`output/${clean}`);
        if (!obj) obj = await env.MY_BUCKET.get(clean);

        if (obj) {
          try {
            jsonData = JSON.parse(await obj.text());
          } catch {}
        }

        if (!jsonData) {
          const doc = await getDocumentByFileName(env.DB, clean);
          if (doc && doc.raw_json) {
            jsonData = typeof doc.raw_json === "string" ? JSON.parse(doc.raw_json) : doc.raw_json;
          }
        }

        if (!jsonData) return jsonResponse({ error: "Không tìm thấy file JSON" }, 404);

        const excelBuffer = await createBatchExcel([{ data: jsonData, filename: clean }]);
        const excelFileName = clean.replace(/\.json$/i, ".xlsx");

        // Tự động sao lưu file Excel lên Cloudflare R2
        try {
          await env.MY_BUCKET.put(`excel_exports/${excelFileName}`, excelBuffer, {
            httpMetadata: {
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
          });
        } catch (e) {
          console.warn("Lỗi lưu file Excel đơn lên R2:", e);
        }

        return new Response(excelBuffer, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${excelFileName}"`,
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // ============================================================
      // 8. DASHBOARD THỐNG KÊ
      // ============================================================

      if (pathname === "/api/dashboard/stats" && method === "GET") {
        // Lấy ngày hiện tại theo giờ Việt Nam (GMT+7)
        let targetDateStr = url.searchParams.get("date");
        if (!targetDateStr) {
          const now = new Date();
          now.setHours(now.getHours() + 7);
          targetDateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
        }

        const stats = await getDailyStats(env.DB, targetDateStr);

        // Fetch R2 stats
        let r2TotalFiles = 0;
        let r2TotalSize = 0;
        let r2TodayFiles = 0;
        let r2TodaySize = 0;

        if (env.MY_BUCKET) {
          try {
            const listParams = { limit: 1000 };
            let listed = await env.MY_BUCKET.list(listParams);
            let objects = listed.objects;
            
            // Lấy tối đa 3000 file để tránh timeout (nếu nhiều quá)
            let loops = 0;
            while (listed.truncated && loops < 3) {
              listParams.cursor = listed.cursor;
              listed = await env.MY_BUCKET.list(listParams);
              objects.push(...listed.objects);
              loops++;
            }

            for (const obj of objects) {
              r2TotalFiles++;
              r2TotalSize += obj.size;
              
              if (obj.uploaded) {
                const uploadDate = new Date(obj.uploaded);
                uploadDate.setHours(uploadDate.getHours() + 7); // GMT+7
                const uploadDateStr = uploadDate.toISOString().split("T")[0];
                if (uploadDateStr === targetDateStr) {
                  r2TodayFiles++;
                  r2TodaySize += obj.size;
                }
              }
            }
          } catch (e) {
            console.warn("Lỗi khi đếm R2 stats:", e);
          }
        }

        stats.r2_total_files = r2TotalFiles;
        stats.r2_total_size = r2TotalSize;
        stats.r2_today_files = r2TodayFiles;
        stats.r2_today_size = r2TodaySize;

        return jsonResponse({
          status: "success",
          data: stats
        });
      }

      // ============================================================
      // 9. TỪ ĐIỂN VIẾT TẮT & HUẤN LUYỆN PROMPT
      // ============================================================

      if (pathname === "/api/abbreviations" && method === "GET") {
        const category = url.searchParams.get("category");
        const search = url.searchParams.get("search");
        const items = await getAbbreviations(env.DB, { category, search });

        return jsonResponse({
          status: "success",
          categories: DEFAULT_CATEGORIES,
          items,
          total: items.length
        });
      }

      if (pathname === "/api/abbreviations" && method === "POST") {
        const item = await request.json();
        if (!item.short) return jsonResponse({ error: "Từ viết tắt không được để trống." }, 400);

        const saved = await saveAbbreviation(env.DB, item);
        return jsonResponse({
          status: "success",
          message: "Đã lưu từ viết tắt thành công vào D1!",
          item: saved
        });
      }

      if (pathname.startsWith("/api/abbreviations/") && method === "DELETE") {
        const id = decodeURIComponent(pathname.slice("/api/abbreviations/".length));
        await deleteAbbreviation(env.DB, id);
        return jsonResponse({ status: "success", message: "Đã xóa từ viết tắt thành công!" });
      }

      if (pathname === "/api/abbreviations/prompt-preview" && method === "GET") {
        const customPrompt = await getSystemSetting(env.DB, "custom_prompt");
        const effectivePrompt = await buildOcrPrompt(env);

        return jsonResponse({
          status: "success",
          prompt_text: effectivePrompt,
          default_prompt: BASE_OCR_PROMPT,
          custom_prompt: customPrompt,
          is_custom: customPrompt !== null && customPrompt !== undefined
        });
      }

      if (pathname === "/api/prompt/custom" && method === "POST") {
        const body = await request.json();
        const text = body.prompt_text || "";
        if (!text.trim()) return jsonResponse({ error: "Nội dung prompt không được để trống." }, 400);

        await setSystemSetting(env.DB, "custom_prompt", text.trim(), "Custom Gemini OCR prompt");
        return jsonResponse({
          status: "success",
          message: "Đã lưu Prompt tùy chỉnh thành công vào Cloudflare D1!",
          is_custom: true
        });
      }

      if (pathname === "/api/prompt/reset" && method === "POST") {
        await deleteSystemSetting(env.DB, "custom_prompt");
        const effectivePrompt = await buildOcrPrompt(env);
        return jsonResponse({
          status: "success",
          message: "Đã khôi phục Prompt về mặc định tự động sinh từ bộ từ điển D1!",
          prompt_text: effectivePrompt,
          is_custom: false
        });
      }

      // ============================================================
      // 9. TRẠNG THÁI HỆ THỐNG (R2 & D1 STATUS)
      // ============================================================

      if (pathname === "/api/r2/status" && method === "GET") {
        const bucketName = env.R2_BUCKET_NAME || "ocr-vn01";
        return jsonResponse({
          status: "success",
          configured: true,
          connected: true,
          bucket: bucketName,
          bucket_name: bucketName,
          public_url: env.R2_PUBLIC_URL || "",
          message: `Đã kết nối trực tiếp R2 Bucket '${bucketName}' qua Cloudflare Worker (Zero Egress Fee).`
        });
      }

      if (pathname === "/api/r2/test-connection" && method === "POST") {
        try {
          const bucketName = env.R2_BUCKET_NAME || "ocr-vn01";
          const testKey = `test_connection_${Date.now()}.txt`;
          await env.MY_BUCKET.put(testKey, "Cloudflare Worker R2 Connection Test OK");
          await env.MY_BUCKET.delete(testKey);

          return jsonResponse({
            status: "success",
            success: true,
            message: `Kiểm tra đọc/ghi trên Cloudflare R2 ('${bucketName}') hoạt động hoàn hảo!`
          });
        } catch (e) {
          return jsonResponse({
            status: "error",
            success: false,
            message: `Lỗi kiểm tra R2: ${e.message}`
          }, 500);
        }
      }

      if (pathname === "/api/r2/sync-all" && method === "POST") {
        try {
          const list = await env.MY_BUCKET.list({ limit: 1000 });
          const count = list.objects ? list.objects.length : 0;
          return jsonResponse({
            status: "success",
            success: true,
            synced_count: count,
            message: `Toàn bộ ${count} file đã được đồng bộ sẵn sàng trên Cloudflare R2!`
          });
        } catch (e) {
          return jsonResponse({
            status: "error",
            success: false,
            message: `Lỗi đồng bộ R2: ${e.message}`
          }, 500);
        }
      }

      if (pathname === "/api/r2/files" && method === "GET") {
        const prefix = url.searchParams.get("prefix") || "";
        const type = (url.searchParams.get("type") || "all").toLowerCase();
        const search = (url.searchParams.get("search") || "").toLowerCase().trim();
        const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") || "1000", 10)));

        let r2Prefix = prefix;
        if (type === "excel") r2Prefix = "excel_exports/";
        else if (type === "json") r2Prefix = "output/";
        else if (type === "image") r2Prefix = "web_uploads/";

        const list = await env.MY_BUCKET.list({ prefix: r2Prefix, limit });
        const pubBase = (env.R2_PUBLIC_URL || "").replace(/\/$/, "");

        let allFiles = (list.objects || []).map(obj => {
          const key = obj.key;
          let fileType = "other";
          let folder = "root";

          if (key.startsWith("excel_exports/") || key.toLowerCase().endsWith(".xlsx") || key.toLowerCase().endsWith(".xls")) {
            fileType = "excel";
            folder = "excel_exports";
          } else if (key.startsWith("output/") || key.toLowerCase().endsWith(".json")) {
            fileType = "json";
            folder = "output";
          } else if (
            key.startsWith("web_uploads/") ||
            key.startsWith("images/") ||
            /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(key)
          ) {
            fileType = "image";
            folder = key.includes("/") ? key.split("/")[0] : "images";
          }

          const fileName = key.includes("/") ? key.split("/").pop() : key;
          const sizeKb = obj.size / 1024;
          const sizeFormatted = sizeKb >= 1024 
            ? (sizeKb / 1024).toFixed(2) + " MB" 
            : sizeKb.toFixed(1) + " KB";

          return {
            key: obj.key,
            name: fileName,
            folder: folder,
            file_type: fileType,
            size: obj.size,
            size_formatted: sizeFormatted,
            last_modified: obj.uploaded ? obj.uploaded.toISOString() : null,
            uploaded: obj.uploaded,
            public_url: pubBase ? `${pubBase}/${obj.key}` : `/${obj.key}`
          };
        });

        // Thống kê tổng hợp trước khi filter
        const stats = {
          total: allFiles.length,
          excel_count: allFiles.filter(f => f.file_type === "excel").length,
          json_count: allFiles.filter(f => f.file_type === "json").length,
          image_count: allFiles.filter(f => f.file_type === "image").length,
          other_count: allFiles.filter(f => f.file_type === "other").length
        };

        // Lọc theo type nếu cần
        if (type !== "all") {
          allFiles = allFiles.filter(f => f.file_type === type);
        }

        // Lọc theo từ khóa tìm kiếm
        if (search) {
          allFiles = allFiles.filter(f => 
            f.key.toLowerCase().includes(search) || 
            f.name.toLowerCase().includes(search)
          );
        }

        return jsonResponse({
          status: "success",
          bucket: env.R2_BUCKET_NAME || "ocr-vn01",
          stats,
          count: allFiles.length,
          files: allFiles
        });
      }

      // DELETE /api/r2/files : Xóa file trên Cloudflare R2
      if (pathname === "/api/r2/files" && method === "DELETE") {
        const key = url.searchParams.get("key");
        if (!key) {
          return jsonResponse({ error: "Thiếu tham số key của file cần xóa" }, 400);
        }
        try {
          await env.MY_BUCKET.delete(key);
          return jsonResponse({
            status: "success",
            message: `Đã xóa file '${key}' khỏi Cloudflare R2 thành công!`
          });
        } catch (e) {
          return jsonResponse({ error: "Lỗi xóa file R2: " + e.message }, 500);
        }
      }

      // POST /api/r2/export-all-excel : Xuất toàn bộ phiếu và lưu file Excel mới lên R2
      if (pathname === "/api/r2/export-all-excel" && method === "POST") {
        try {
          const { results: allDocs } = await env.DB.prepare(
            "SELECT file_name, raw_json FROM documents ORDER BY id DESC"
          ).all();

          if (!allDocs || allDocs.length === 0) {
            return jsonResponse({ error: "Chưa có dữ liệu nào trong CSDL D1 để xuất Excel." }, 400);
          }

          const recordsData = [];
          for (const doc of allDocs) {
            let jsonData = null;
            if (doc.raw_json) {
              try {
                jsonData = typeof doc.raw_json === "string" ? JSON.parse(doc.raw_json) : doc.raw_json;
              } catch (_) {}
            }
            if (!jsonData) {
              try {
                const obj = await env.MY_BUCKET.get(`output/${doc.file_name}`);
                if (obj) jsonData = JSON.parse(await obj.text());
              } catch (_) {}
            }
            if (jsonData) {
              recordsData.push({ data: jsonData, filename: doc.file_name });
            }
          }

          if (recordsData.length === 0) {
            return jsonResponse({ error: "Không tìm thấy dữ liệu JSON hợp lệ để xuất Excel." }, 400);
          }

          const excelBuffer = await createBatchExcel(recordsData);
          const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
          const excelFileName = `nhat_ky_xe_tong_hop_${timestamp}.xlsx`;
          const r2Key = `excel_exports/${excelFileName}`;

          await env.MY_BUCKET.put(r2Key, excelBuffer, {
            httpMetadata: {
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
          });

          const pubBase = (env.R2_PUBLIC_URL || "").replace(/\/$/, "");
          const pubUrl = pubBase ? `${pubBase}/${r2Key}` : `/${r2Key}`;

          return jsonResponse({
            status: "success",
            message: `Đã xuất ${recordsData.length} phiếu ra Excel và lưu thành công lên Cloudflare R2!`,
            file_name: excelFileName,
            r2_key: r2Key,
            total_sheets: recordsData.length,
            public_url: pubUrl
          });
        } catch (e) {
          return jsonResponse({ error: "Lỗi xuất & lưu Excel lên R2: " + e.message }, 500);
        }
      }

      if (
        (pathname === "/api/d1/status" ||
          pathname === "/api/database/status" ||
          pathname === "/api/status") &&
        method === "GET"
      ) {
        const total = await countDocuments(env.DB);
        return jsonResponse({
          status: "connected",
          db_type: "Cloudflare D1 Serverless SQL",
          database: "ocr",
          total_documents: total
        });
      }

      // 404 cho các đường dẫn khác
      return jsonResponse({ error: "Endpoint không tồn tại", path: pathname }, 404);
    } catch (err) {
      console.error("[Worker Unhandled Error]", err);
      return jsonResponse(
        {
          error: "Lỗi xử lý máy chủ nội bộ (Worker Error)",
          message: err.message || String(err),
          stack: err.stack || ""
        },
        500
      );
    }
  }
};
