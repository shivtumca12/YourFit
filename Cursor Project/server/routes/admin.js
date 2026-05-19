const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { upload, imageUrl } = require("../upload");

const router = express.Router();

router.post("/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const admin = db.prepare("SELECT * FROM admin WHERE username = ?").get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  req.session.adminId = admin.id;
  req.session.adminUser = admin.username;
  res.json({ ok: true, username: admin.username });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  if (!req.session?.adminId) return res.status(401).json({ error: "Not logged in" });
  res.json({ username: req.session.adminUser });
});

// ——— Collections ———
router.get("/collections", requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, description, image_path, layout, sort_order, created_at
       FROM collections ORDER BY sort_order ASC, id ASC`
    )
    .all();
  res.json(rows.map((r) => ({ ...r, image_url: imageUrl(req, r.image_path) })));
});

router.post("/collections", requireAdmin, upload.single("image"), (req, res) => {
  const { title, description, layout, sort_order } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  const imagePath = req.file?.filename || req.body.image_url?.trim();
  if (!imagePath) return res.status(400).json({ error: "Image is required" });

  const result = db
    .prepare(
      `INSERT INTO collections (title, description, image_path, layout, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      title.trim(),
      (description || "").trim(),
      imagePath,
      layout === "large" ? "large" : "normal",
      Number(sort_order) || 0
    );

  const row = db.prepare("SELECT * FROM collections WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ ...row, image_url: imageUrl(req, row.image_path) });
});

router.put("/collections/:id", requireAdmin, upload.single("image"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM collections WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Collection not found" });

  const { title, description, layout, sort_order } = req.body;
  const imagePath =
    req.file?.filename || req.body.image_url?.trim() || existing.image_path;

  db.prepare(
    `UPDATE collections SET title = ?, description = ?, image_path = ?, layout = ?, sort_order = ?
     WHERE id = ?`
  ).run(
    (title ?? existing.title).trim(),
    (description ?? existing.description).trim(),
    imagePath,
    layout === "large" ? "large" : layout === "normal" ? "normal" : existing.layout,
    sort_order !== undefined ? Number(sort_order) : existing.sort_order,
    id
  );

  const row = db.prepare("SELECT * FROM collections WHERE id = ?").get(id);
  res.json({ ...row, image_url: imageUrl(req, row.image_path) });
});

router.delete("/collections/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare("DELETE FROM collections WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Collection not found" });
  res.json({ ok: true });
});

// ——— Products ———
router.get("/products", requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, c.title AS collection_title
       FROM products p LEFT JOIN collections c ON c.id = p.collection_id
       ORDER BY p.id DESC`
    )
    .all();
  res.json(rows.map((r) => ({ ...r, image_url: imageUrl(req, r.image_path) })));
});

router.post("/products", requireAdmin, upload.single("image"), (req, res) => {
  const { name, meta, price, badge, collection_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
  const imagePath = req.file?.filename || req.body.image_url?.trim();
  if (!imagePath) return res.status(400).json({ error: "Image is required" });

  const badgeVal = ["new", "hot"].includes(badge) ? badge : null;
  const result = db
    .prepare(
      `INSERT INTO products (name, meta, price, image_path, badge, collection_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      name.trim(),
      (meta || "").trim(),
      Number(price) || 0,
      imagePath,
      badgeVal,
      collection_id ? Number(collection_id) : null
    );

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ ...row, image_url: imageUrl(req, row.image_path) });
});

router.put("/products/:id", requireAdmin, upload.single("image"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const { name, meta, price, badge, collection_id } = req.body;
  const imagePath =
    req.file?.filename || req.body.image_url?.trim() || existing.image_path;
  const badgeVal =
    badge === "new" || badge === "hot"
      ? badge
      : badge === "none" || badge === ""
        ? null
        : existing.badge;

  db.prepare(
    `UPDATE products SET name = ?, meta = ?, price = ?, image_path = ?, badge = ?, collection_id = ?
     WHERE id = ?`
  ).run(
    (name ?? existing.name).trim(),
    (meta ?? existing.meta).trim(),
    price !== undefined ? Number(price) : existing.price,
    imagePath,
    badgeVal,
    collection_id !== undefined
      ? collection_id
        ? Number(collection_id)
        : null
      : existing.collection_id,
    id
  );

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  res.json({ ...row, image_url: imageUrl(req, row.image_path) });
});

router.delete("/products/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Product not found" });
  res.json({ ok: true });
});

router.get("/subscribers", requireAdmin, (_req, res) => {
  const rows = db
    .prepare("SELECT id, email, created_at FROM newsletter_subscribers ORDER BY created_at DESC")
    .all();
  res.json(rows);
});

module.exports = router;
