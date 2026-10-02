/**
 * Module OCR AI Vision cho Cloudflare Worker:
 * - Gọi trực tiếp Google Gemini API (v1beta REST) với chế độ Structured JSON Output (Ưu tiên Gemini 2.5 Flash)
 * - Hỗ trợ Multi-model Fallback (gemini-2.5-flash -> gemini-2.5-flash-lite -> gemini-2.5-pro -> gemini-2.0-flash)
 * - Tự động tải từ điển viết tắt từ Cloudflare D1 để huấn luyện Prompt
 * - Xử lý tính toán khối lượng, kiểm tra đối chiếu sai số tự động
 */

export const BASE_OCR_PROMPT = `
Bạn là hệ thống OCR chuyên nghiệp đọc biểu mẫu tiếng Việt viết tay.
Nhiệm vụ duy nhất: Đọc toàn bộ biểu mẫu và trả về JSON đúng schema.
Đây là phiếu dạng: "NHẬT KÝ XE GỖ TẠI / THÔNG TIN GỖ THÀNH KHÍ"

============================================================
PHẦN 1 - HEADER
============================================================
Đọc chính xác:
- document_type
- ngay_nhap
- ngay_xe
- so_xe
- kich_thuoc_go_tron
- khoi_luong_go_tron
- kich_thuoc_xe
- don_gia (Đọc số tiền đơn giá viết tay có chữ "đơn giá" hoặc "đg" trong cột THÔNG TIN GỖ TRÒN, ví dụ: "đơn giá: 16.100.000" hoặc "14.300.000")
- tong_khoi_luong_thanh_khi (Đọc số tổng kết khối lượng gỗ thành khí ghi ở cột 'Tổng kết khối lượng xẻ cuối ngày' hoặc phần ghi chú cuối ngày, ví dụ: "0,546 m3" hoặc "1,252 m3")

QUY TẮC:
1. so_xe chỉ chứa số xẻ.
2. Tuyệt đối không nối ngày vào so_xe.
3. Không tự đổi chữ I thành số 1.
4. Không tự đổi số 1 thành chữ I.
5. Không lấy ngày trong bảng làm ngay_xe.
6. Nếu không đọc chắc thì để trống.
7. Không tự sửa dữ liệu theo suy đoán.
8. don_gia: Tìm kỹ dòng chữ viết tay có chữ "đơn giá" hoặc "đg" trong cột THÔNG TIN GỖ TRÒN (thường viết ở các ô/dòng trống bên dưới mục kích thước xẻ hoặc trong cột thông tin gỗ tròn, ví dụ: "đơn giá: 16.100.000"). Chỉ trích xuất phần số tiền (ví dụ: "16.100.000" hoặc "16100000"), nếu không có chữ đơn giá thì để trống "".
9. tong_khoi_luong_thanh_khi: Tìm số tổng khối lượng ghi ở cột 'Tổng kết khối lượng xẻ cuối ngày' hoặc phần ghi chú (ví dụ: "0,546 m3" hoặc "1,252 m3"). Chỉ trích xuất số (ví dụ: "0,546"), nếu không có thì để trống "".

============================================================
PHẦN 2 - BẢNG DỮ LIỆU
============================================================
Chỉ tạo item cho những dòng thực sự có dữ liệu.
Mỗi item gồm:
- dong (số dòng dữ liệu thực tế: 1, 2, 3...)
- ngay
- kich_thuoc_so_luong (ví dụ: 11 x 11 x 335 = 12)
- rong (cm)
- cao (cm)
- dai (cm)
- so_luong
- khoi_luong (giá trị ghi trên giấy, ví dụ 0,486)
- cong_trinh
- stt_cau_kien
- ten_cau_kien
- nha_cung_cap
- ghi_chu

============================================================
PHẦN 3 - NGÀY TRONG BẢNG
============================================================
Cố gắng tìm TẤT CẢ ngày được viết trong bảng.
Mỗi ngày tìm được phải đưa thêm vào date_events:
{
  "ngay": "7/9/2026",
  "dong_bat_dau": 3,
  "dong_ket_thuc": 5,
  "do_tin_cay": "high",
  "vi_tri": "cột ngày trong bảng"
}

============================================================
PHẦN 4 - GHI CHÚ
============================================================
Các tổng kết cuối ngày như "0,523 m3" phải giữ trong ghi_chu. Không biến tổng ngày thành dòng vật tư mới.

QUAN TRỌNG: Chỉ trả về duy nhất chuỗi JSON hợp lệ theo schema sau:
{
  "document_type": "NHẬT KÝ XẺ GỖ",
  "header": {
    "ngay_nhap": "",
    "ngay_xe": "",
    "so_xe": "",
    "kich_thuoc_go_tron": "",
    "khoi_luong_go_tron": "",
    "kich_thuoc_xe": "",
    "don_gia": "",
    "tong_khoi_luong_thanh_khi": ""
  },
  "items": [
    {
      "dong": 1,
      "ngay": "",
      "kich_thuoc_so_luong": "",
      "rong": "",
      "cao": "",
      "dai": "",
      "so_luong": "",
      "khoi_luong": "",
      "cong_trinh": "",
      "stt_cau_kien": "",
      "ten_cau_kien": "",
      "nha_cung_cap": "",
      "ghi_chu": ""
    }
  ],
  "date_events": []
}
`;

export async function buildOcrPrompt(env) {
  try {
    if (env.DB) {
      // Kiểm tra prompt tùy chỉnh trong system_settings
      const customSetting = await env.DB.prepare(
        "SELECT value FROM system_settings WHERE key = 'custom_prompt' LIMIT 1"
      ).first();
      if (customSetting && customSetting.value && customSetting.value.trim()) {
        return customSetting.value.trim();
      }
      // Từ điển viết tắt không còn nhúng vào prompt AI.
      // Thay vào đó, từ điển được áp dụng hậu kỳ qua applyDictionary().
    }
  } catch (err) {
    console.error("[Prompt Build Warning]", err);
  }
  return BASE_OCR_PROMPT;
}

export async function callGeminiVision({ imageBase64, mimeType = "image/jpeg", prompt, env }) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Chưa cấu hình GEMINI_API_KEY trên Cloudflare Worker.");
  }

  const defaultPool = [
    env.GEMINI_MODEL || "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.0-flash"
  ];
  const configuredModels = (env.GEMINI_FALLBACK_MODELS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const modelsPool = [...new Set([...configuredModels, ...defaultPool])];

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0
    }
  };

  let lastError = null;
  const errorLogs = [];

  for (let idx = 0; idx < modelsPool.length; idx++) {
    const model = modelsPool[idx];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          const data = await resp.json();
          const candidate = data.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;
          if (text) {
            return { text, modelUsed: model };
          }
          throw new Error("Gemini trả về candidate không có nội dung text.");
        }

        const errText = await resp.text();
        const status = resp.status;
        lastError = new Error(`HTTP ${status}: ${errText}`);
        errorLogs.push(`${model} (thử ${attempt}): HTTP ${status}`);

        // 429: Hạn mức gọi vượt quá
        if (status === 429) {
          break; // chuyển sang model tiếp theo
        }
        // 503 / 500: Server quá tải tạm thời
        if (status >= 500 && attempt < 2) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        break;
      } catch (err) {
        lastError = err;
        errorLogs.push(`${model}: ${err.message}`);
        break;
      }
    }
  }

  throw new Error(`Tất cả các model Gemini đều không phản hồi thành công. Lỗi: ${lastError?.message || ""} [${errorLogs.join("; ")}]`);
}

export async function callOpenRouterVision({ imageBase64, mimeType = "image/jpeg", prompt, env }) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Chưa cấu hình OPENROUTER_API_KEY trên Cloudflare Worker.");
  }

  const defaultPool = [
    env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-pro",
    "qwen/qwen2.5-vl-72b-instruct",
    "openai/gpt-4o-mini"
  ];
  const configuredModels = (env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const modelsPool = [...new Set([...configuredModels, ...defaultPool])];

  const systemPrompt = `Bạn là hệ thống OCR thị giác chuyên dụng bóc tách biểu mẫu tiếng Việt viết tay.
Nhiệm vụ: Phân tích hình ảnh và trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc schema yêu cầu.
QUY TẮC BẮT BUỘC:
1. Chỉ trả về JSON thuần, bắt đầu bằng { và kết thúc bằng }, không bọc văn bản giải thích.
2. Không tự động đổi chữ I thành số 1, không tự đổi số 1 thành chữ I.
3. Không tự chế hoặc thêm trường dữ liệu không có trên biểu mẫu.
4. Chú ý bóc tách trường header.don_gia khi có dòng chữ viết tay "đơn giá" hoặc "đg" (ví dụ: "16.100.000").
5. Bóc tách trường header.tong_khoi_luong_thanh_khi khi có số tổng kết khối lượng xẻ cuối ngày (ví dụ: "0,546 m3").`;

  let lastError = null;
  const errorLogs = [];

  for (let idx = 0; idx < modelsPool.length; idx++) {
    const model = modelsPool[idx];
    const payload = {
      model: model,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://ocr-project.cloudflare.workers.dev",
            "X-Title": "OCR Wood Project",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          const data = await resp.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) {
            return { text, modelUsed: `openrouter/${model}` };
          }
          throw new Error("OpenRouter trả về choices rỗng.");
        }

        const errText = await resp.text();
        const status = resp.status;
        lastError = new Error(`HTTP ${status}: ${errText}`);
        errorLogs.push(`${model} (thử ${attempt}): HTTP ${status}`);

        // 429 hoặc lỗi model không tồn tại -> chuyển model fallback tiếp theo
        if (status === 429 || status === 404 || status === 400) {
          break;
        }
        if (status >= 500 && attempt < 2) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        break;
      } catch (err) {
        lastError = err;
        errorLogs.push(`${model}: ${err.message}`);
        break;
      }
    }
  }

  throw new Error(`Tất cả các model OpenRouter đều không phản hồi thành công. Lỗi: ${lastError?.message || ""} [${errorLogs.join("; ")}]`);
}

/**
 * Hàm điều phối AI Vision thông minh (Multi-provider Fallback)
 * Ưu tiên gọi OpenRouter hoặc Gemini tùy theo biến AI_PROVIDER cấu hình
 */
export async function callVision({ imageBase64, mimeType = "image/jpeg", prompt, env }) {
  const provider = (env.AI_PROVIDER || "").toLowerCase().trim();

  // 1. Nếu ưu tiên OpenRouter hoặc chỉ có OpenRouter Key
  if (provider === "openrouter" || (env.OPENROUTER_API_KEY && !env.GEMINI_API_KEY)) {
    try {
      return await callOpenRouterVision({ imageBase64, mimeType, prompt, env });
    } catch (err) {
      console.warn("[OpenRouter Thất bại - Thử Fallback sang Gemini nếu có]", err.message);
      if (env.GEMINI_API_KEY) {
        return await callGeminiVision({ imageBase64, mimeType, prompt, env });
      }
      throw err;
    }
  }

  // 2. Mặc định hoặc nếu chọn Gemini
  try {
    return await callGeminiVision({ imageBase64, mimeType, prompt, env });
  } catch (err) {
    console.warn("[Gemini Thất bại - Thử Fallback sang OpenRouter nếu có]", err.message);
    if (env.OPENROUTER_API_KEY) {
      return await callOpenRouterVision({ imageBase64, mimeType, prompt, env });
    }
    throw err;
  }
}

// ----------------------------------------------------
// TÍNH TOÁN & VALIDATION LOGIC
// ----------------------------------------------------

export function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  let s = String(value).trim().replace(/\s+/g, "");
  if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function parseDimensions(text) {
  if (!text) return null;
  const s = String(text).toLowerCase().replace(/×/g, "x").replace(/\*/g, "x");
  const numbers = s.match(/\d+(?:[.,]\d+)?/g);
  if (!numbers || numbers.length < 4) return null;
  try {
    const a = parseFloat(numbers[0].replace(",", "."));
    const b = parseFloat(numbers[1].replace(",", "."));
    const c = parseFloat(numbers[2].replace(",", "."));
    const qty = parseFloat(numbers[3].replace(",", "."));
    return { a, b, c, qty };
  } catch {
    return null;
  }
}

export function calculateVolume(item) {
  const raw = item.kich_thuoc_so_luong || "";
  let a = parseNumber(item.rong);
  let b = parseNumber(item.cao);
  let c = parseNumber(item.dai);
  let qty = parseNumber(item.so_luong);

  if (a == null || b == null || c == null || qty == null) {
    const parsed = parseDimensions(raw);
    if (parsed) {
      a = parsed.a;
      b = parsed.b;
      c = parsed.c;
      qty = parsed.qty;
    }
  }

  if (a == null || b == null || c == null || qty == null) return null;
  return (a * b * c * qty) / 1000000;
}

export function cleanDate(dateText) {
  if (!dateText) return "";
  return String(dateText).trim();
}

export function applyVerifiedDates(document) {
  const items = document.items || [];
  const events = document.date_events || [];

  for (const item of items) {
    item.ngay = cleanDate(item.ngay);
  }

  for (const ev of events) {
    const ngay = cleanDate(ev.ngay);
    if (!ngay) continue;
    const start = ev.dong_bat_dau;
    let end = ev.dong_ket_thuc;
    if (start == null) continue;
    if (end == null) end = items.length;

    for (const item of items) {
      if (item.dong >= start && item.dong <= end) {
        item.ngay = ngay;
      }
    }
  }
}

export function validateItems(items) {
  const results = [];
  for (const item of items) {
    const calculated = calculateVolume(item);
    const written = parseNumber(item.khoi_luong);
    let status = "KIỂM TRA";

    if (calculated == null && written == null) {
      status = "KHONG_CO_DU_LIEU";
    } else if (calculated == null) {
      status = "KHONG_TINH_DUOC";
    } else if (written == null) {
      status = "THIEU_KHOI_LUONG";
    } else {
      const diff = Math.abs(calculated - written);
      status = diff <= 0.002 ? "OK" : "CANH_BAO";
    }

    results.append ? null : results.push({
      dong: item.dong,
      ngay: item.ngay,
      kich_thuoc_so_luong: item.kich_thuoc_so_luong,
      khoi_luong_ghi: written,
      khoi_luong_tinh: calculated != null ? Math.round(calculated * 1000) / 1000 : null,
      chenh_lech: calculated != null && written != null ? Math.round(Math.abs(calculated - written) * 1000000) / 1000000 : null,
      trang_thai: status
    });
  }
  return results;
}

export function extractDailyTotals(items) {
  const results = [];
  for (const item of items) {
    const txtGhiChu = item.ghi_chu || "";
    const matches = [...txtGhiChu.toLowerCase().matchAll(/(\d+[.,]\d+)\s*m3/g)];
    for (const m of matches) {
      const val = parseFloat(m[1].replace(",", "."));
      if (!isNaN(val)) {
        results.push({
          dong: item.dong,
          ngay: item.ngay,
          tong_m3_ghi_tren_giay: val
        });
      }
    }
  }
  return results;
}

export function calculateDailySummary(items) {
  const groups = {};
  for (const item of items) {
    if (!item.ngay) continue;
    const vol = calculateVolume(item);
    if (vol == null) continue;
    if (!groups[item.ngay]) {
      groups[item.ngay] = { so_dong: 0, tong_m3: 0 };
    }
    groups[item.ngay].so_dong += 1;
    groups[item.ngay].tong_m3 += vol;
  }

  return Object.entries(groups).map(([ngay, data]) => ({
    ngay,
    so_dong: data.so_dong,
    tong_m3_tinh: Math.round(data.tong_m3 * 1000) / 1000
  }));
}

export function validateDailyTotals(items) {
  const calculated = {};
  for (const item of items) {
    if (!item.ngay) continue;
    const vol = calculateVolume(item);
    if (vol == null) continue;
    calculated[item.ngay] = (calculated[item.ngay] || 0) + vol;
  }

  const written = extractDailyTotals(items);
  const results = [];
  for (const record of written) {
    const ngay = record.ngay;
    const totalWritten = record.tong_m3_ghi_tren_giay;
    const totalCalc = calculated[ngay];

    if (totalCalc === undefined) {
      results.push({
        ngay,
        tong_ghi_tren_giay: totalWritten,
        tong_tinh: null,
        trang_thai: "KHONG_CO_NHOM_NGAY"
      });
      continue;
    }

    const diff = Math.abs(totalCalc - totalWritten);
    results.push({
      ngay,
      tong_ghi_tren_giay: Math.round(totalWritten * 1000) / 1000,
      tong_tinh: Math.round(totalCalc * 1000) / 1000,
      chenh_lech: Math.round(diff * 1000000) / 1000000,
      trang_thai: diff <= 0.003 ? "OK" : "CANH_BAO"
    });
  }
  return results;
}

export function buildWarnings(document, lineValidation, dailyValidation) {
  const warnings = [];
  if (!document.header?.so_xe) warnings.push("THIEU_SO_XE");
  if (!document.header?.ngay_xe) warnings.push("THIEU_NGAY_XE");

  for (const row of lineValidation) {
    if (row.trang_thai !== "OK") {
      warnings.push(`DONG_${row.dong}_${row.trang_thai}`);
    }
  }
  for (const row of dailyValidation) {
    if (row.trang_thai !== "OK") {
      warnings.push(`TONG_NGAY_${row.ngay}_${row.trang_thai}`);
    }
  }
  return warnings;
}

export function parseAndValidateOcrResponse(rawText, sourceFileName, modelUsed) {
  let cleanText = rawText.trim();
  if (cleanText.startsWith("```")) {
    const lines = cleanText.split("\n");
    cleanText = lines.slice(1, lines[lines.length - 1].trim() === "```" ? -1 : undefined).join("\n").trim();
  }

  let doc = null;
  try {
    doc = JSON.parse(cleanText);
  } catch (err) {
    throw new Error(`Không đọc được chuỗi JSON từ phản hồi của AI: ${err.message}. Text: ${cleanText.slice(0, 300)}`);
  }

  applyVerifiedDates(doc);

  if (doc.header && doc.header.don_gia) {
    let dg = String(doc.header.don_gia).trim();
    dg = dg.replace(/^(?:đơn\s*giá|đg)[\s:]*/i, "").replace(/[\sđ/m3vnđ]+$/i, "").trim();
    doc.header.don_gia = dg;
  }
  if (doc.header && doc.header.tong_khoi_luong_thanh_khi) {
    let tkl = String(doc.header.tong_khoi_luong_thanh_khi).trim();
    tkl = tkl.replace(/[\sđ/m3vnđ]+$/i, "").trim();
    doc.header.tong_khoi_luong_thanh_khi = tkl;
  }
  const items = Array.isArray(doc.items) ? doc.items : [];

  if (!doc.header) doc.header = {};
  if (!doc.header.tong_khoi_luong_thanh_khi) {
    const writtenTotals = extractDailyTotals(items);
    if (writtenTotals.length > 0 && writtenTotals[0].tong_m3_ghi_tren_giay) {
      doc.header.tong_khoi_luong_thanh_khi = String(writtenTotals[0].tong_m3_ghi_tren_giay);
    } else {
      let sumVol = 0;
      items.forEach(it => {
        const v = parseNumber(it.khoi_luong);
        if (v != null) sumVol += v;
      });
      if (sumVol > 0) {
        doc.header.tong_khoi_luong_thanh_khi = String(Math.round(sumVol * 1000) / 1000);
      }
    }
  }

  const lineValidation = validateItems(items);
  const dailySummary = calculateDailySummary(items);
  const dailyValidation = validateDailyTotals(items);
  const warnings = buildWarnings(doc, lineValidation, dailyValidation);

  return {
    schema_version: "1.0",
    source: {
      file: sourceFileName,
      model: modelUsed,
      rotation_degrees: 90
    },
    document_type: doc.document_type || "NHẬT KÝ XẺ GỖ",
    header: doc.header || {},
    items,
    date_events: doc.date_events || [],
    validation: {
      line_volume: lineValidation,
      daily_summary: dailySummary,
      daily_total_validation: dailyValidation,
      warnings
    }
  };
}
export async function buildFastPrompt(env) { return `Hãy quét nhanh hình ảnh này và trả về ĐÚNG MỘT JSON với định dạng sau (không giải thích gì thêm):\n{\n  "so_xe": "...", // Trích xuất mã số xe/số phiếu (ví dụ: 107 - I7085/1A). Nếu không có trả về chuỗi rỗng.\n  "so_dong": 15 // Đếm số lượng dòng dữ liệu có trong bảng chi tiết cấu kiện. Trả về số nguyên (kiểu int).\n}`; }

// ============================================================
// Dictionary Post-Processing (thay thế cách nhúng từ điển vào prompt)
// Port từ dictionary_postprocessor.py sang JavaScript
// 3 tầng matching: Exact → Synonym → Fuzzy (Levenshtein)
// ============================================================

function levenshteinDistance(s1, s2) {
  if (s1.length < s2.length) return levenshteinDistance(s2, s1);
  if (s2.length === 0) return s1.length;
  let prevRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
  for (let i = 0; i < s1.length; i++) {
    const currRow = [i + 1];
    for (let j = 0; j < s2.length; j++) {
      currRow.push(Math.min(
        prevRow[j + 1] + 1,
        currRow[j] + 1,
        prevRow[j] + (s1[i] !== s2[j] ? 1 : 0)
      ));
    }
    prevRow = currRow;
  }
  return prevRow[s2.length];
}

function cleanFullText(full) {
  return (full || "").replace(/\s*\[.*?\]\s*$/g, "").trim();
}

function parseSynonyms(synValue) {
  if (!synValue) return [];
  if (Array.isArray(synValue)) return synValue;
  try {
    const parsed = JSON.parse(synValue);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return synValue.split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Hậu xử lý kết quả OCR bằng từ điển viết tắt từ D1.
 * Áp dụng 3 tầng matching: Exact → Synonym → Fuzzy (Levenshtein ≤ 2).
 * Chuẩn hóa trường cong_trinh và ten_cau_kien trong mỗi item.
 *
 * @param {Object} doc - Kết quả OCR đã parse (có items[])
 * @param {Object} env - Cloudflare Worker env (có DB binding)
 * @returns {Object} doc đã chuẩn hóa, kèm validation.dictionary_corrections
 */
export async function applyDictionary(doc, env) {
  if (!env.DB) return doc;

  try {
    const { results: abbrevs } = await env.DB.prepare(
      "SELECT id, short, full, category, description, synonyms FROM abbreviations ORDER BY category"
    ).all();

    if (!abbrevs || abbrevs.length === 0) return doc;

    // Xây bảng tra cứu
    const exactMap = new Map();
    const synonymMap = new Map();

    for (const item of abbrevs) {
      const shortLower = (item.short || "").trim().toLowerCase();
      if (shortLower) exactMap.set(shortLower, item);

      const syns = parseSynonyms(item.synonyms);
      for (const syn of syns) {
        const synLower = (syn || "").trim().toLowerCase();
        if (synLower) synonymMap.set(synLower, item);
      }
    }

    // Hàm tra cứu 3 tầng cho 1 term
    function matchTerm(text, targetCategories) {
      if (!text || !text.trim()) return null;
      const clean = text.trim().toLowerCase();

      // Tầng 1: Exact match
      const exactHit = exactMap.get(clean);
      if (exactHit && (!targetCategories || targetCategories.includes(exactHit.category))) {
        return { value: cleanFullText(exactHit.full), type: "exact" };
      }

      // Tầng 2: Synonym match
      const synHit = synonymMap.get(clean);
      if (synHit && (!targetCategories || targetCategories.includes(synHit.category))) {
        return { value: cleanFullText(synHit.full), type: "synonym" };
      }

      // Tầng 3: Fuzzy match (Levenshtein ≤ 2, chỉ khi text ≥ 3 ký tự)
      if (clean.length >= 3) {
        let bestMatch = null, bestDist = 3;
        for (const item of abbrevs) {
          if (targetCategories && !targetCategories.includes(item.category)) continue;
          const short = (item.short || "").trim().toLowerCase();
          if (!short) continue;
          const dist = levenshteinDistance(clean, short);
          if (dist <= 2 && dist < bestDist) {
            bestDist = dist;
            bestMatch = item;
          }
        }
        if (bestMatch) return { value: cleanFullText(bestMatch.full), type: "fuzzy" };
      }

      return null;
    }

    // Áp dụng lên từng item
    const corrections = [];
    const items = doc.items || [];

    for (const item of items) {
      // Chuẩn hóa cong_trinh
      if (item.cong_trinh && item.cong_trinh.trim()) {
        const result = matchTerm(item.cong_trinh, ["de_nham", "cong_trinh"]);
        if (result && result.value !== item.cong_trinh.trim()) {
          corrections.push({
            dong: item.dong, field: "cong_trinh",
            original: item.cong_trinh, corrected: result.value,
            match_type: result.type
          });
          item.cong_trinh = result.value;
        }
      }

      // Chuẩn hóa ten_cau_kien
      if (item.ten_cau_kien && item.ten_cau_kien.trim()) {
        const result = matchTerm(item.ten_cau_kien, ["cau_kien", "de_nham"]);
        if (result && result.value !== item.ten_cau_kien.trim()) {
          corrections.push({
            dong: item.dong, field: "ten_cau_kien",
            original: item.ten_cau_kien, corrected: result.value,
            match_type: result.type
          });
          item.ten_cau_kien = result.value;
        }
      }
    }

    // Ghi log corrections vào validation
    if (corrections.length > 0) {
      if (!doc.validation) doc.validation = {};
      doc.validation.dictionary_corrections = corrections;
      console.log(`[Dictionary] Da chuan hoa ${corrections.length} truong`);
    }

  } catch (err) {
    console.error("[Dictionary Post-Process Error]", err);
  }

  return doc;
}

