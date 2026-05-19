/**
 * YourFit House server — SQLite database (items + login sessions).
 * Run: node server/standalone.js  or  ./start.sh
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const db = require("./database");

const ROOT = path.join(__dirname, "..");
const UPLOADS_DIR = path.join(ROOT, "uploads");
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || "yourfit-house-dev-secret-change-me";

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function sendJson(res, status, data, cookies = []) {
  const headers = { "Content-Type": "application/json", ...corsHeaders() };
  if (cookies.length > 0) headers["Set-Cookie"] = cookies;
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function imageUrl(req, imagePath) {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  const host = req.headers.host || `localhost:${PORT}`;
  return `http://${host}/uploads/${imagePath}`;
}

function withImage(req, row) {
  return { ...row, image_url: imageUrl(req, row.image_path) };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, boundary) {
  const parts = {};
  const files = {};
  const delim = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(delim) + delim.length;
  if (buffer[start] === 13) start += 2;
  else if (buffer[start] === 10) start += 1;

  while (start < buffer.length) {
    let end = buffer.indexOf(delim, start);
    if (end === -1) end = buffer.length;
    let chunkEnd = end;
    if (buffer[chunkEnd - 2] === 13 && buffer[chunkEnd - 1] === 10) chunkEnd -= 2;
    else if (buffer[chunkEnd - 1] === 10) chunkEnd -= 1;

    const headerEnd = buffer.indexOf("\r\n\r\n", start);
    if (headerEnd === -1 || headerEnd > chunkEnd) break;
    const headers = buffer.slice(start, headerEnd).toString("utf8");
    const body = buffer.slice(headerEnd + 4, chunkEnd);

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const name = nameMatch?.[1];
    if (!name) {
      start = end + delim.length;
      continue;
    }
    if (filenameMatch) files[name] = { filename: filenameMatch[1], data: body };
    else parts[name] = body.toString("utf8");
    start = end + delim.length;
    if (buffer[start] === 45) break;
    if (buffer[start] === 13) start += 2;
    else if (buffer[start] === 10) start += 1;
  }
  return { fields: parts, files };
}

function saveUploadedFile(file) {
  const ext = path.extname(file.filename).toLowerCase() || ".jpg";
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  if (!allowed.includes(ext)) throw new Error("Only image files are allowed");
  const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), file.data);
  return name;
}

function serveStatic(req, res, filePath) {
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleApi(req, res, urlPath) {
  const method = req.method;
  const session = db.getSessionFromRequest(req, SESSION_SECRET);

  if (urlPath === "/api/collections" && method === "GET") {
    return sendJson(res, 200, db.listCollections().map((r) => withImage(req, r)));
  }

  if (urlPath === "/api/products" && method === "GET") {
    return sendJson(res, 200, db.listProducts().map((r) => withImage(req, r)));
  }

  if (urlPath === "/api/newsletter" && method === "POST") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: "Valid email required" });
    }
    const result = db.addSubscriber(email);
    return sendJson(res, 200, result);
  }

  if (urlPath === "/api/admin/login" && method === "POST") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const admin = db.loginAdmin(username, password);
    if (!admin) return sendJson(res, 401, { error: "Invalid username or password" });
    const { username: name, cookie } = db.createSession(admin, SESSION_SECRET);
    return sendJson(res, 200, { ok: true, username: name }, [cookie]);
  }

  if (urlPath === "/api/admin/logout" && method === "POST") {
    const raw = db.parseCookie(req, "sid");
    if (raw) db.destroySession(raw.split(".")[0]);
    return sendJson(res, 200, { ok: true }, ["sid=; Path=/; HttpOnly; Max-Age=0"]);
  }

  if (urlPath === "/api/admin/me" && method === "GET") {
    if (!session) return sendJson(res, 401, { error: "Not logged in" });
    return sendJson(res, 200, { username: session.username });
  }

  if (urlPath.startsWith("/api/admin/") && !session) {
    return sendJson(res, 401, { error: "Unauthorized. Please log in." });
  }

  async function parseAdminBody() {
    const ct = req.headers["content-type"] || "";
    const buf = await readBody(req);
    if (ct.includes("multipart/form-data")) {
      const boundary = ct.split("boundary=")[1];
      return parseMultipart(buf, boundary);
    }
    return { fields: JSON.parse(buf.toString() || "{}"), files: {} };
  }

  if (urlPath === "/api/admin/collections" && method === "GET") {
    return sendJson(res, 200, db.listCollections().map((r) => withImage(req, r)));
  }

  if (urlPath === "/api/admin/collections" && method === "POST") {
    const { fields, files } = await parseAdminBody();
    const imagePath =
      (files.image && saveUploadedFile(files.image)) || fields.image_url?.trim();
    if (!fields.title?.trim() || !imagePath) {
      return sendJson(res, 400, { error: "Title and image are required" });
    }
    const row = db.insertCollection({
      title: fields.title.trim(),
      description: (fields.description || "").trim(),
      image_path: imagePath,
      layout: fields.layout === "large" ? "large" : "normal",
      sort_order: Number(fields.sort_order) || 0,
    });
    return sendJson(res, 201, withImage(req, row));
  }

  const colMatch = urlPath.match(/^\/api\/admin\/collections\/(\d+)$/);
  if (colMatch) {
    const id = Number(colMatch[1]);
    const existing = db.getCollection(id);
    if (!existing) return sendJson(res, 404, { error: "Collection not found" });

    if (method === "PUT") {
      const { fields, files } = await parseAdminBody();
      const imagePath =
        (files.image && saveUploadedFile(files.image)) ||
        fields.image_url?.trim() ||
        existing.image_path;
      const row = db.updateCollection(id, {
        title: (fields.title ?? existing.title).trim(),
        description: (fields.description ?? existing.description).trim(),
        image_path: imagePath,
        layout:
          fields.layout === "large"
            ? "large"
            : fields.layout === "normal"
              ? "normal"
              : existing.layout,
        sort_order:
          fields.sort_order !== undefined ? Number(fields.sort_order) : existing.sort_order,
      });
      return sendJson(res, 200, withImage(req, row));
    }
    if (method === "DELETE") {
      if (!db.deleteCollection(id)) return sendJson(res, 404, { error: "Collection not found" });
      return sendJson(res, 200, { ok: true });
    }
  }

  if (urlPath === "/api/admin/products" && method === "GET") {
    return sendJson(res, 200, db.listProducts().map((r) => withImage(req, r)));
  }

  if (urlPath === "/api/admin/products" && method === "POST") {
    const { fields, files } = await parseAdminBody();
    const imagePath =
      (files.image && saveUploadedFile(files.image)) || fields.image_url?.trim();
    if (!fields.name?.trim() || !imagePath) {
      return sendJson(res, 400, { error: "Name and image are required" });
    }
    const row = db.insertProduct({
      name: fields.name.trim(),
      meta: (fields.meta || "").trim(),
      price: Number(fields.price) || 0,
      image_path: imagePath,
      badge: ["new", "hot"].includes(fields.badge) ? fields.badge : null,
      collection_id: fields.collection_id ? Number(fields.collection_id) : null,
    });
    return sendJson(res, 201, withImage(req, row));
  }

  const prodMatch = urlPath.match(/^\/api\/admin\/products\/(\d+)$/);
  if (prodMatch) {
    const id = Number(prodMatch[1]);
    const existing = db.getProduct(id);
    if (!existing) return sendJson(res, 404, { error: "Product not found" });

    if (method === "PUT") {
      const { fields, files } = await parseAdminBody();
      const imagePath =
        (files.image && saveUploadedFile(files.image)) ||
        fields.image_url?.trim() ||
        existing.image_path;
      let badge = existing.badge;
      if (fields.badge === "new" || fields.badge === "hot") badge = fields.badge;
      else if (fields.badge === "none" || fields.badge === "") badge = null;

      const row = db.updateProduct(id, {
        name: (fields.name ?? existing.name).trim(),
        meta: (fields.meta ?? existing.meta).trim(),
        price: fields.price !== undefined ? Number(fields.price) : existing.price,
        image_path: imagePath,
        badge,
        collection_id:
          fields.collection_id !== undefined
            ? fields.collection_id
              ? Number(fields.collection_id)
              : null
            : existing.collection_id,
      });
      return sendJson(res, 200, withImage(req, row));
    }
    if (method === "DELETE") {
      if (!db.deleteProduct(id)) return sendJson(res, 404, { error: "Product not found" });
      return sendJson(res, 200, { ok: true });
    }
  }

  if (urlPath === "/api/admin/subscribers" && method === "GET") {
    return sendJson(res, 200, db.listSubscribers());
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let urlPath = url.pathname;
    if (urlPath.length > 1 && urlPath.endsWith("/")) urlPath = urlPath.slice(0, -1);

    if (req.method === "OPTIONS" && urlPath.startsWith("/api")) {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    if (urlPath.startsWith("/api")) return await handleApi(req, res, urlPath);

    if (urlPath.startsWith("/uploads/")) {
      return serveStatic(req, res, path.join(ROOT, urlPath));
    }
    if (urlPath === "/admin" || urlPath === "/admin/") {
      return serveStatic(req, res, path.join(ROOT, "admin", "index.html"));
    }
    if (urlPath.startsWith("/admin/")) {
      return serveStatic(req, res, path.join(ROOT, urlPath));
    }

    let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
    if (!path.extname(filePath)) filePath += ".html";
    if (!fs.existsSync(filePath)) filePath = path.join(ROOT, "index.html");
    return serveStatic(req, res, filePath);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message || "Server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`YourFit House running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin/`);
  console.log(`SQLite database: ${db.dbPath}`);
  console.log(`Login: admin / yourfithouse`);
});
