const express = require("express");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const router = express.Router();

router.post("/", authMiddleware, async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ message: "projectId is required" });

  const plan = req.user.plan || "starter";
  if (!["pro", "enterprise"].includes(plan))
    return res.status(403).json({ message: "Deploy requires Pro or Enterprise plan", upgrade: true, requiredPlan: "pro" });

  const { rows: proj } = await pool.query(
    "SELECT * FROM projects WHERE id=$1 AND user_id=$2", [projectId, req.user.id]
  );
  if (!proj.length) return res.status(404).json({ message: "Project not found" });

  const deployUrl = `https://brandforge-${req.user.id}-${projectId}.netlify.app`;
  const { rows }  = await pool.query(
    "INSERT INTO deployments (user_id,project_id,deploy_url,status) VALUES ($1,$2,$3,'registered') RETURNING *",
    [req.user.id, projectId, deployUrl]
  );

  res.json({
    message: "Deployment registered. Download the ZIP and drag-and-drop to netlify.com/drop",
    deployment: rows[0],
  });
});

module.exports = router;
