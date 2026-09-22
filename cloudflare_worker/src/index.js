/**
 * Cloudflare Worker: Gateway phân phối file và ảnh từ R2 Bucket (Zero Egress Fee)
 * Tự động gắn Content-Type, Cache Control và CORS cho Web UI
 */

export default {
  async fetch(request, env) {
    // Xử lý tiền kiểm CORS (Preflight request)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, PUT, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    // Lấy r2 key bỏ dấu '/' đầu tiên
    const key = decodeURIComponent(url.pathname.slice(1));

    // Trang chủ Worker
    if (!key) {
      return new Response(
        JSON.stringify({
          status: "online",
          service: "OCR Wood Storage CDN (Cloudflare R2 + Worker)",
          usage: "GET /{file_path} để tải ảnh hoặc file Excel",
        }, null, 2),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 1. GET / HEAD: Phục vụ xem/tải ảnh, file Excel, JSON
    if (request.method === "GET" || request.method === "HEAD") {
      const object = await env.MY_BUCKET.get(key, {
        range: request.headers.get("range"),
        onlyIf: request.headers,
      });

      if (!object) {
        return new Response(
          JSON.stringify({ error: "File không tồn tại trên Cloudflare R2", key }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("Access-Control-Allow-Origin", "*");

      // Cache trình duyệt 7 ngày cho ảnh, 1 giờ cho các file khác
      if (key.match(/\.(jpe?g|png|webp|gif)$/i)) {
        headers.set("Cache-Control", "public, max-age=604800, immutable");
      } else {
        headers.set("Cache-Control", "public, max-age=3600");
      }

      // Tự động gán MIME Type nếu chưa có
      if (!headers.has("content-type")) {
        if (key.endsWith(".jpg") || key.endsWith(".jpeg")) {
          headers.set("content-type", "image/jpeg");
        } else if (key.endsWith(".png")) {
          headers.set("content-type", "image/png");
        } else if (key.endsWith(".xlsx")) {
          headers.set("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        } else if (key.endsWith(".json")) {
          headers.set("content-type", "application/json; charset=utf-8");
        }
      }

      if (request.method === "HEAD") {
        return new Response(null, { headers });
      }

      return new Response(object.body, {
        headers,
        status: object.body ? 200 : 304,
      });
    }

    // 2. PUT: Cho phép Backend hoặc Client upload file lên R2
    if (request.method === "PUT") {
      const contentType = request.headers.get("content-type") || "application/octet-stream";
      await env.MY_BUCKET.put(key, request.body, {
        httpMetadata: { contentType },
      });

      return new Response(
        JSON.stringify({
          status: "success",
          message: `Đã lưu file '${key}' lên Cloudflare R2 thành công!`,
          key,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 3. DELETE: Xóa file nếu cần
    if (request.method === "DELETE") {
      await env.MY_BUCKET.delete(key);
      return new Response(
        JSON.stringify({ status: "success", message: `Đã xóa file '${key}' khỏi R2.` }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response("Method not allowed", { status: 405 });
  },
};

