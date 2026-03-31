// routes/projects.js
const express = require("express");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const router = express.Router();

const PLAN_PROJECT_LIMITS = { starter: 3, pro: 50, enterprise: Infinity };

router.get("/", authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id,type,title,data,thumbnail,created_at,updated_at FROM projects WHERE user_id=$1 ORDER BY updated_at DESC",
    [req.user.id]
  );
  res.json({ projects: rows });
});

router.post("/", authMiddleware, async (req, res) => {
  const { type, data, thumbnail } = req.body;
  if (!type || !data) return res.status(400).json({ message: "type and data required" });

  const plan  = req.user.plan || "starter";
  const limit = PLAN_PROJECT_LIMITS[plan] || 3;

  const { rows: countRows } = await pool.query(
    "SELECT COUNT(*) FROM projects WHERE user_id=$1", [req.user.id]
  );
  if (limit !== Infinity && parseInt(countRows[0].count) >= limit)
    return res.status(403).json({
      message: `Project limit reached (${limit} on ${plan} plan). Upgrade to save more.`,
      upgrade: true, requiredPlan: "pro",
    });

  const title = extractTitle(data);
  const { rows } = await pool.query(
    "INSERT INTO projects (user_id,type,title,data,thumbnail) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [req.user.id, type, title, JSON.stringify(data), thumbnail || null]
  );
  res.status(201).json({ project: rows[0] });
});

router.put("/:id", authMiddleware, async (req, res) => {
  const { data, thumbnail } = req.body;
  if (!data) return res.status(400).json({ message: "data required" });
  const { rows } = await pool.query(
    "UPDATE projects SET data=$1,title=$2,thumbnail=$3,updated_at=NOW() WHERE id=$4 AND user_id=$5 RETURNING *",
    [JSON.stringify(data), extractTitle(data), thumbnail || null, req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ message: "Project not found" });
  res.json({ project: rows[0] });
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const { rowCount } = await pool.query(
    "DELETE FROM projects WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ message: "Project not found" });
  res.json({ message: "Project deleted" });
});

function extractTitle(data) {
  if (!data) return "Untitled";
  return (data.name || data.title || data.company || data.headline || "Untitled").slice(0, 100);
}

module.exports = router;
