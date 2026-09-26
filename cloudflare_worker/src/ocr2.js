/**
 * Module OCR AI Vision cho Cloudflare Worker:
 * - Gá»i trá»±c tiáº¿p Google Gemini API (v1beta REST) vá»›i cháº¿ Ä‘á»™ Structured JSON Output
 * - Há»— trá»£ Multi-model Fallback (gemini-3.8-flash -> gemini-3.6-flash -> gemini-3.5-flash -> gemini-flash-latest)
 * - Tá»± Ä‘á»™ng táº£i tá»« Ä‘iá»ƒn viáº¿t táº¯t tá»« Cloudflare D1 Ä‘á»ƒ huáº¥n luyá»‡n Prompt
 * - Xá»­ lÃ½ tÃ­nh toÃ¡n khá»‘i lÆ°á»£ng, kiá»ƒm tra Ä‘á»‘i chiáº¿u sai sá»‘ tá»± Ä‘á»™ng
 */

export const BASE_OCR_PROMPT = `
Báº¡n lÃ  há»‡ thá»‘ng OCR chuyÃªn nghiá»‡p Ä‘á»c biá»ƒu máº«u tiáº¿ng Viá»‡t viáº¿t tay.
Nhiá»‡m vá»¥ duy nháº¥t: Äá»c toÃ n bá»™ biá»ƒu máº«u vÃ  tráº£ vá» JSON Ä‘Ãºng schema.
ÄÃ¢y lÃ  phiáº¿u dáº¡ng: "NHáº¬T KÃ XE Gá»– Táº I / THÃ”NG TIN Gá»– THÃ€NH KHÃ"

============================================================
PHáº¦N 1 - HEADER
============================================================
Äá»c chÃ­nh xÃ¡c:
- document_type
- ngay_nhap
- ngay_xe
- so_xe
- kich_thuoc_go_tron
- khoi_luong_go_tron
- kich_thuoc_xe

QUY Táº®C:
1. so_xe chá»‰ chá»©a sá»‘ xáº».
2. Tuyá»‡t Ä‘á»‘i khÃ´ng ná»‘i ngÃ y vÃ o so_xe.
3. KhÃ´ng tá»± Ä‘á»•i chá»¯ I thÃ nh sá»‘ 1.
4. KhÃ´ng tá»± Ä‘á»•i sá»‘ 1 thÃ nh chá»¯ I.
5. KhÃ´ng láº¥y ngÃ y trong báº£ng lÃ m ngay_xe.
6. Náº¿u khÃ´ng Ä‘á»c cháº¯c thÃ¬ Ä‘á»ƒ trá»‘ng.
7. KhÃ´ng tá»± sá»­a dá»¯ liá»‡u theo suy Ä‘oÃ¡n.

============================================================
PHáº¦N 2 - Báº¢NG Dá»® LIá»†U
============================================================
Chá»‰ táº¡o item cho nhá»¯ng dÃ²ng thá»±c sá»± cÃ³ dá»¯ liá»‡u.
Má»—i item gá»“m:
- dong (sá»‘ dÃ²ng dá»¯ liá»‡u thá»±c táº¿: 1, 2, 3...)
- ngay
- kich_thuoc_so_luong (vÃ­ dá»¥: 11 x 11 x 335 = 12)
- rong (cm)
- cao (cm)
- dai (cm)
- so_luong
- khoi_luong (giÃ¡ trá»‹ ghi trÃªn giáº¥y, vÃ­ dá»¥ 0,486)
- cong_trinh
- stt_cau_kien
- ten_cau_kien
- nha_cung_cap
- ghi_chu

============================================================
PHáº¦N 3 - NGÃ€Y TRONG Báº¢NG
============================================================
Cá»‘ gáº¯ng tÃ¬m Táº¤T Cáº¢ ngÃ y Ä‘Æ°á»£c viáº¿t trong báº£ng.
Má»—i ngÃ y tÃ¬m Ä‘Æ°á»£c pháº£i Ä‘Æ°a thÃªm vÃ o date_events:
{
  "ngay": "7/9/2026",
  "dong_bat_dau": 3,
  "dong_ket_thuc": 5,
  "do_tin_cay": "high",
  "vi_tri": "cá»™t ngÃ y trong báº£ng"
}

============================================================
PHáº¦N 4 - GHI CHÃš
============================================================
CÃ¡c tá»•ng káº¿t cuá»‘i ngÃ y nhÆ° "0,523 m3" pháº£i giá»¯ trong ghi_chu. KhÃ´ng biáº¿n tá»•ng ngÃ y thÃ nh dÃ²ng váº­t tÆ° má»›i.

QUAN TRá»ŒNG: Chá»‰ tráº£ vá» duy nháº¥t chuá»—i JSON há»£p lá»‡ theo schema sau:
{
  "document_type": "NHáº¬T KÃ Xáºº Gá»–",
  "header": {
    "ngay_nhap": "",
    "ngay_xe": "",
    "so_xe": "",
    "kich_thuoc_go_tron": "",
    "khoi_luong_go_tron": "",
    "kich_thuoc_xe": ""
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
      // 1. Kiá»ƒm tra prompt tÃ¹y chá»‰nh trong system_settings
      const customSetting = await env.DB.prepare(
        "SELECT value FROM system_settings WHERE key = 'custom_prompt' LIMIT 1"
      ).first();
      if (customSetting && customSetting.value && customSetting.value.trim()) {
        return customSetting.value.trim();
      }

      // 2. Tá»± Ä‘á»™ng sinh ngá»¯ cáº£nh tá»« báº£ng abbreviations
      const { results: abbrevs } = await env.DB.prepare(
        "SELECT short, full, category, description FROM abbreviations ORDER BY category, short"
      ).all();

      if (abbrevs && abbrevs.length > 0) {
        let dictText = "\n\n============================================================\n";
        dictText += "Bá»˜ Tá»ª ÄIá»‚N CHá»® VIáº¾T Táº®T & QUY Táº®C BÃ“C TÃCH CHUYÃŠN NGÃ€NH:\n";
        dictText += "============================================================\n";
        for (const item of abbrevs) {
          dictText += `- '${item.short}' -> '${item.full}'`;
          if (item.description) dictText += ` (${item.description})`;
          dictText += "\n";
        }
        return `${BASE_OCR_PROMPT}\n${dictText}`;
      }
    }
  } catch (err) {
    console.error("[Prompt Build Warning]", err);
  }
  return BASE_OCR_PROMPT;
}

export async function callGeminiVision({ imageBase64, mimeType = "image/jpeg", prompt, env }) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("ChÆ°a cáº¥u hÃ¬nh GEMINI_API_KEY trÃªn Cloudflare Worker.");
  }

  const defaultPool = [
    env.GEMINI_MODEL || "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest"
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
          throw new Error("Gemini tráº£ vá» candidate khÃ´ng cÃ³ ná»™i dung text.");
        }

        const errText = await resp.text();
        const status = resp.status;
        lastError = new Error(`HTTP ${status}: ${errText}`);
        errorLogs.push(`${model} (thá»­ ${attempt}): HTTP ${status}`);

        // 429: Háº¡n má»©c gá»i vÆ°á»£t quÃ¡
        if (status === 429) {
          break; // chuyá»ƒn sang model tiáº¿p theo
        }
        // 503 / 500: Server quÃ¡ táº£i táº¡m thá»i
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

  throw new Error(`Táº¥t cáº£ cÃ¡c model Gemini Ä‘á»u khÃ´ng pháº£n há»“i thÃ nh cÃ´ng. Lá»—i: ${lastError?.message || ""} [${errorLogs.join("; ")}]`);
}

// ----------------------------------------------------
// TÃNH TOÃN & VALIDATION LOGIC
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
  const s = String(text).toLowerCase().replace(/Ã—/g, "x").replace(/\*/g, "x");
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
    let status = "KIá»‚M TRA";

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
    throw new Error(`KhÃ´ng Ä‘á»c Ä‘Æ°á»£c chuá»—i JSON tá»« pháº£n há»“i cá»§a AI: ${err.message}. Text: ${cleanText.slice(0, 300)}`);
  }

  applyVerifiedDates(doc);
  const items = Array.isArray(doc.items) ? doc.items : [];
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
    document_type: doc.document_type || "NHáº¬T KÃ Xáºº Gá»–",
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
e x p o r t   a s y n c   f u n c t i o n   b u i l d F a s t P r o m p t ( e n v )   {   r e t u r n   \ H ã y   q u é t   n h a n h   h ì n h   £n h   n à y   v à   t r £  v Á  Ú N G   M ØT   J S O N   v Ûi   Ën h   d ¡n g   s a u   ( k h ô n g   g i £i   t h í c h   g ì   t h ê m ) : 
 { 
     \ 
 
 s o _ x e \ :   \ . . . \ ,   / /   T r í c h   x u ¥t   m ã   s Ñ  x e / s Ñ  p h i ¿u   ( v í   d å:   1 0 7   -   I 7 0 8 5 / 1 A ) .   N ¿u   k h ô n g   c ó   t r £  v Á  c h u ×i   r ×n g . 
     \ s o _ d o n g \ :   1 5   / /   ¿m   s Ñ  l °ãn g   d ò n g   d ï  l i Çu   c ó   t r o n g   b £n g   c h i   t i ¿t   c ¥u   k i Çn .   T r £  v Á  s Ñ  n g u y ê n   ( k i Ãu   i n t ) . 
 } \ ;   } 
 
 
