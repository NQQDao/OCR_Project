/**
 * Module Authentication & Security cho Cloudflare Workers
 * Sử dụng Web Crypto API (chuẩn W3C tích hợp sẵn trong Workers)
 * - Quản lý mã hóa mật khẩu (PBKDF2-SHA256 + Salt)
 * - Ký và xác thực Session Token (HMAC-SHA256)
 * - Quản lý HttpOnly Cookie an toàn
 */

const SESSION_TTL_SECONDS = 86400; // 24 giờ

/**
 * Tạo chuỗi Salt ngẫu nhiên dạng Hex
 */
export function generateSalt(length = 16) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Băm mật khẩu bằng PBKDF2-SHA256
 */
export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const saltBytes = new Uint8Array(
    saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedKey));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Kiểm tra mật khẩu người dùng nhập vào
 */
export async function verifyPassword(password, storedHash, storedSalt) {
  const computedHash = await hashPassword(password, storedSalt);
  return computedHash === storedHash;
}

/**
 * Lấy Secret key dùng để ký session (từ env hoặc secret mặc định an toàn)
 */
function getAuthSecret(env) {
  return env.AUTH_SECRET || "ocr_wood_secure_hmac_secret_key_2026_default_salt_xyz987";
}

/**
 * Ký và tạo Session Token (Payload Base64 + HMAC-SHA256 Signature)
 */
export async function createSessionToken(user, env, ttlSeconds = SESSION_TTL_SECONDS) {
  const secret = getAuthSecret(env);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role || "admin",
    full_name: user.full_name || user.username,
    iat: now,
    exp: now + ttlSeconds
  };

  const enc = new TextEncoder();
  const payloadB64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${payloadB64}.${sigB64}`;
}

/**
 * Xác thực và giải mã Session Token
 */
export async function verifySessionToken(token, env) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  const secret = getAuthSecret(env);
  const enc = new TextEncoder();

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Chuẩn hóa Base64URL về Base64
    let base64Sig = sigB64.replace(/-/g, "+").replace(/_/g, "/");
    while (base64Sig.length % 4) base64Sig += "=";
    const sigBytes = Uint8Array.from(atob(base64Sig), c => c.charCodeAt(0));

    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadB64));
    if (!isValid) return null;

    let base64Payload = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    while (base64Payload.length % 4) base64Payload += "=";
    const payloadJson = decodeURIComponent(escape(atob(base64Payload)));
    const payload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Token hết hạn (quá 24h)
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Đọc Token từ Cookie hoặc Authorization Header
 */
export function extractTokenFromRequest(request) {
  // 1. Kiểm tra Cookie
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/auth_token=([^;]+)/);
  if (match && match[1]) {
    return decodeURIComponent(match[1].trim());
  }

  // 2. Kiểm tra Authorization: Bearer <token>
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  return null;
}

/**
 * Tạo Header Set-Cookie cho phiên đăng nhập (24 giờ)
 */
export function buildAuthCookieHeader(token, ttlSeconds = SESSION_TTL_SECONDS) {
  return `auth_token=${encodeURIComponent(token)}; Path=/; Max-Age=${ttlSeconds}; HttpOnly; SameSite=Lax; Secure`;
}

/**
 * Tạo Header Set-Cookie để xóa phiên (Đăng xuất)
 */
export function buildClearCookieHeader() {
  return `auth_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}
