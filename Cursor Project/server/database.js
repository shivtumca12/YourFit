/**
 * SQLite database (Node built-in node:sqlite) — items + login sessions.
 */
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "yourfit.db");
const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (admin_id) REFERENCES admin(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_path TEXT NOT NULL,
    layout TEXT NOT NULL DEFAULT 'normal' CHECK(layout IN ('large', 'normal')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL,
    image_path TEXT NOT NULL,
    badge TEXT CHECK(badge IN ('new', 'hot') OR badge IS NULL),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const SESSION_DAYS = 7;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
  } catch {
    return false;
  }
}

function seedAdmin() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM admin").get().c;
  if (count > 0) return;
  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASS || "yourfithouse";
  db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run(
    username,
    hashPassword(password)
  );
  console.log(`Database: admin user created (${username})`);
}

function seedCatalog() {
  if (db.prepare("SELECT COUNT(*) AS c FROM collections").get().c > 0) return;

  const insertCol = db.prepare(`
    INSERT INTO collections (title, description, image_path, layout, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  [
    [
      "Street Essentials",
      "Oversized tees, hoodies & cargos",
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=900&q=80",
      "large",
      0,
    ],
    [
      "Performance Lab",
      "Train harder, look cleaner",
      "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&q=80",
      "normal",
      1,
    ],
    [
      "House Classics",
      "Timeless cuts, elevated fabrics",
      "https://images.unsplash.com/photo-1483985988355-763728e3685b?w=600&q=80",
      "normal",
      2,
    ],
  ].forEach((row) => insertCol.run(...row));

  const insertProd = db.prepare(`
    INSERT INTO products (name, meta, price, image_path, badge)
    VALUES (?, ?, ?, ?, ?)
  `);
  [
    [
      "House Logo Tee",
      "Heavyweight cotton · 4 colors",
      42,
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&q=80",
      "new",
    ],
    [
      "Flex Jogger",
      "4-way stretch · Tapered fit",
      68,
      "https://images.unsplash.com/photo-1556828680-8f5d1e2e8b8e?w=500&q=80",
      null,
    ],
    [
      "Thermal Half-Zip",
      "Merino blend · Layer ready",
      89,
      "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500&q=80",
      "hot",
    ],
    [
      "Studio Hoodie",
      "French terry · Relaxed drop",
      78,
      "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=500&q=80",
      null,
    ],
  ].forEach((row) => insertProd.run(...row));
}

function migrateFromJson() {
  const jsonPath = path.join(dataDir, "store.json");
  if (!fs.existsSync(jsonPath)) return;
  if (db.prepare("SELECT COUNT(*) AS c FROM collections").get().c > 0) return;

  try {
    const legacy = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    console.log("Database: migrating data from store.json …");

    if (legacy.admin?.username && db.prepare("SELECT COUNT(*) AS c FROM admin").get().c === 0) {
      db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run(
        legacy.admin.username,
        legacy.admin.password
      );
    }

    const insCol = db.prepare(`
      INSERT INTO collections (title, description, image_path, layout, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    (legacy.collections || []).forEach((c) => {
      insCol.run(
        c.title,
        c.description || "",
        c.image_path,
        c.layout || "normal",
        c.sort_order ?? 0,
        c.created_at || new Date().toISOString()
      );
    });

    const insProd = db.prepare(`
      INSERT INTO products (collection_id, name, meta, price, image_path, badge, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    (legacy.products || []).forEach((p) => {
      insProd.run(
        p.collection_id || null,
        p.name,
        p.meta || "",
        p.price,
        p.image_path,
        p.badge || null,
        p.created_at || new Date().toISOString()
      );
    });

    const insSub = db.prepare(
      "INSERT OR IGNORE INTO newsletter_subscribers (email, created_at) VALUES (?, ?)"
    );
    (legacy.subscribers || []).forEach((s) => {
      insSub.run(s.email, s.created_at || new Date().toISOString());
    });
  } catch (err) {
    console.warn("JSON migration skipped:", err.message);
  }
}

function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

// ——— Auth ———
function findAdmin(username) {
  return db.prepare("SELECT * FROM admin WHERE username = ?").get(username);
}

function loginAdmin(username, password) {
  const admin = findAdmin(username);
  if (!admin || !verifyPassword(password, admin.password_hash)) return null;
  return admin;
}

function createSession(admin, sessionSecret) {
  purgeExpiredSessions();
  const sessionId = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    "INSERT INTO sessions (id, admin_id, username, expires_at) VALUES (?, ?, ?, ?)"
  ).run(sessionId, admin.id, admin.username, expiresAt);

  const sig = crypto.createHmac("sha256", sessionSecret).update(sessionId).digest("hex");
  const cookie = `sid=${sessionId}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
  return { sessionId, username: admin.username, cookie };
}

function getSessionFromRequest(req, sessionSecret) {
  const raw = parseCookie(req, "sid");
  if (!raw) return null;
  const [sessionId, sig] = raw.split(".");
  if (!sessionId || !sig) return null;

  const expected = crypto
    .createHmac("sha256", sessionSecret)
    .update(sessionId)
    .digest("hex");
  if (sig !== expected) return null;

  purgeExpiredSessions();
  const row = db
    .prepare(
      `SELECT s.* FROM sessions s
       WHERE s.id = ? AND s.expires_at >= datetime('now')`
    )
    .get(sessionId);

  return row || null;
}

function destroySession(sessionId) {
  if (sessionId) db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function parseCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

// ——— Collections ———
function listCollections() {
  return db
    .prepare(
      `SELECT id, title, description, image_path, layout, sort_order, created_at
       FROM collections ORDER BY sort_order ASC, id ASC`
    )
    .all();
}

function getCollection(id) {
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(id);
}

function insertCollection(data) {
  const r = db
    .prepare(
      `INSERT INTO collections (title, description, image_path, layout, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(data.title, data.description, data.image_path, data.layout, data.sort_order);
  return getCollection(r.lastInsertRowid);
}

function updateCollection(id, data) {
  db.prepare(
    `UPDATE collections SET title = ?, description = ?, image_path = ?, layout = ?, sort_order = ?
     WHERE id = ?`
  ).run(data.title, data.description, data.image_path, data.layout, data.sort_order, id);
  return getCollection(id);
}

function deleteCollection(id) {
  return db.prepare("DELETE FROM collections WHERE id = ?").run(id).changes > 0;
}

// ——— Products ———
function listProducts() {
  return db
    .prepare(
      `SELECT p.id, p.collection_id, p.name, p.meta, p.price, p.image_path, p.badge, p.created_at,
              c.title AS collection_title
       FROM products p
       LEFT JOIN collections c ON c.id = p.collection_id
       ORDER BY p.id DESC`
    )
    .all();
}

function getProduct(id) {
  return db.prepare("SELECT * FROM products WHERE id = ?").get(id);
}

function insertProduct(data) {
  const r = db
    .prepare(
      `INSERT INTO products (name, meta, price, image_path, badge, collection_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.name,
      data.meta,
      data.price,
      data.image_path,
      data.badge,
      data.collection_id
    );
  return getProduct(r.lastInsertRowid);
}

function updateProduct(id, data) {
  db.prepare(
    `UPDATE products SET name = ?, meta = ?, price = ?, image_path = ?, badge = ?, collection_id = ?
     WHERE id = ?`
  ).run(
    data.name,
    data.meta,
    data.price,
    data.image_path,
    data.badge,
    data.collection_id,
    id
  );
  return getProduct(id);
}

function deleteProduct(id) {
  return db.prepare("DELETE FROM products WHERE id = ?").run(id).changes > 0;
}

// ——— Newsletter ———
function addSubscriber(email) {
  try {
    db.prepare("INSERT INTO newsletter_subscribers (email) VALUES (?)").run(email);
    return { ok: true, message: "Subscribed successfully" };
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return { ok: true, message: "Already subscribed" };
    }
    throw err;
  }
}

function listSubscribers() {
  return db
    .prepare("SELECT id, email, created_at FROM newsletter_subscribers ORDER BY created_at DESC")
    .all();
}

seedAdmin();
migrateFromJson();
seedCatalog();
purgeExpiredSessions();

console.log(`Database ready: ${dbPath}`);

module.exports = {
  db,
  dbPath,
  loginAdmin,
  createSession,
  getSessionFromRequest,
  destroySession,
  parseCookie,
  listCollections,
  getCollection,
  insertCollection,
  updateCollection,
  deleteCollection,
  listProducts,
  getProduct,
  insertProduct,
  updateProduct,
  deleteProduct,
  addSubscriber,
  listSubscribers,
};
