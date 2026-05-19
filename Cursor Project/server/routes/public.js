const express = require("express");
const db = require("../db");
const { imageUrl } = require("../upload");

const router = express.Router();

router.get("/collections", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, description, image_path, layout, sort_order, created_at
       FROM collections ORDER BY sort_order ASC, id ASC`
    )
    .all();
  res.json(
    rows.map((r) => ({
      ...r,
      image_url: imageUrl(req, r.image_path),
    }))
  );
});

router.get("/products", (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.collection_id, p.name, p.meta, p.price, p.image_path, p.badge, p.created_at,
              c.title AS collection_title
       FROM products p
       LEFT JOIN collections c ON c.id = p.collection_id
       ORDER BY p.id DESC`
    )
    .all();
  res.json(
    rows.map((r) => ({
      ...r,
      image_url: imageUrl(req, r.image_path),
    }))
  );
});

router.post("/newsletter", (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email required" });
  }
  try {
    db.prepare("INSERT INTO newsletter_subscribers (email) VALUES (?)").run(email);
    res.json({ ok: true, message: "Subscribed successfully" });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.json({ ok: true, message: "Already subscribed" });
    }
    res.status(500).json({ error: "Could not subscribe" });
  }
});

module.exports = router;
