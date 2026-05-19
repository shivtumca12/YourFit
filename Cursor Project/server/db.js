const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "yourfit.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
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

function seedIfEmpty() {
  const adminCount = db.prepare("SELECT COUNT(*) AS c FROM admin").get().c;
  if (adminCount === 0) {
    const username = process.env.ADMIN_USER || "admin";
    const password = process.env.ADMIN_PASS || "yourfithouse";
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run(
      username,
      hash
    );
    console.log(`Admin created — username: ${username}`);
  }

  const collectionCount = db.prepare("SELECT COUNT(*) AS c FROM collections").get().c;
  if (collectionCount === 0) {
    const insert = db.prepare(`
      INSERT INTO collections (title, description, image_path, layout, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    const defaults = [
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
    ];
    defaults.forEach((row) => insert.run(...row));
  }

  const productCount = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  if (productCount === 0) {
    const insert = db.prepare(`
      INSERT INTO products (name, meta, price, image_path, badge)
      VALUES (?, ?, ?, ?, ?)
    `);
    const defaults = [
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
    ];
    defaults.forEach((row) => insert.run(...row));
  }
}

seedIfEmpty();

module.exports = db;
