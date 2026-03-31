const express = require("express");
const multer  = require("multer");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { uploadLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// Multer: memory storage, 5MB limit, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/"))
      return cb(new Error("Only image files allowed"), false);
    cb(null, true);
  },
});

// Asset limits by plan
const ASSET_LIMITS = {
  starter:    10,
  pro:        200,
  enterprise: Infinity,
};

// ── GET /api/assets — list user's uploaded assets ─────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, mime_type, size_bytes, data, created_at
       FROM assets WHERE user_id=$1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ assets: rows });
  } catch (err) {
    console.error("Get assets error:", err);
    res.status(500).json({ message: "Could not fetch assets" });
  }
});

// ── POST /api/assets/upload — upload an image ─────────────────────────────────
router.post(
  "/upload",
  authMiddleware,
  uploadLimiter,
  upload.single("image"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ message: "No image file provided" });

    const plan  = req.user.plan || "starter";
    const limit = ASSET_LIMITS[plan] ?? 10;

    try {
      // Check asset count limit
      if (limit !== Infinity) {
        const { rows } = await pool.query(
          "SELECT COUNT(*) FROM assets WHERE user_id=$1",
          [req.user.id]
        );
        if (parseInt(rows[0].count) >= limit)
          return res.status(403).json({
            message: `Asset limit reached (${limit} on ${plan} plan). Upgrade to upload more.`,
            upgrade: true,
          });
      }

      const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      const name   = req.file.originalname.slice(0, 255);

      const { rows } = await pool.query(
        `INSERT INTO assets (user_id, name, mime_type, size_bytes, data)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, name, mime_type, size_bytes, data, created_at`,
        [req.user.id, name, req.file.mimetype, req.file.size, base64]
      );

      res.status(201).json({ asset: rows[0] });

    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

// ── DELETE /api/assets/:id — delete an asset ──────────────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM assets WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ message: "Asset not found" });
    res.json({ message: "Asset deleted" });
  } catch (err) {
    console.error("Delete asset error:", err);
    res.status(500).json({ message: "Could not delete asset" });
  }
});

// Handle multer errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes("Only image")) {
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

module.exports = router;
