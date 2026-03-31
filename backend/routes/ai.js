const express = require("express");
const fetch   = require("node-fetch");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { aiLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// Plan generation limits (server-enforced)
const AI_LIMITS = {
  starter:    3,
  pro:        Infinity,
  enterprise: Infinity,
};

// ── POST /api/ai/generate ─────────────────────────────────────────────────────
router.post("/generate", authMiddleware, aiLimiter, async (req, res) => {
  const { prompt, type } = req.body;

  if (!prompt || !type)
    return res.status(400).json({ message: "prompt and type are required" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY)
    return res.status(503).json({ message: "AI service not configured on server." });

  const plan  = req.user.plan || "starter";
  const limit = AI_LIMITS[plan] ?? 3;

  // ── Enforce per-user monthly limit for starter ────────────────────────────
  if (limit !== Infinity) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM ai_usage
       WHERE user_id=$1 AND created_at >= $2`,
      [req.user.id, startOfMonth]
    );
    const used = parseInt(rows[0].count);
    if (used >= limit) {
      return res.status(403).json({
        message: `Monthly AI limit reached (${limit} on ${plan} plan). Upgrade to Pro for unlimited.`,
        upgrade: true,
        used,
        limit,
      });
    }
  }

  // ── System prompts per type ───────────────────────────────────────────────
  const systemPrompts = {
    portfolio: `You are a personal branding expert. Generate a complete professional portfolio JSON. Return ONLY valid JSON, no markdown, no explanation.
Schema: {
  "name": string, "role": string, "tagline": string, "about": string,
  "projects": [{"title":string,"description":string,"tags":[string],"image":""}],
  "experience": [{"role":string,"company":string,"date":string,"bullets":[string]}],
  "skills": [{"label":string,"items":[string]}],
  "contact": {"email":string,"location":string,"linkedin":string,"website":string},
  "style": "minimal"|"bold"|"dark"|"creative"|"elegant",
  "imageCategory": string
}`,
    resume: `You are a resume writing expert. Generate a complete professional resume JSON. Return ONLY valid JSON.
Schema: {
  "name": string, "role": string, "summary": string,
  "experience": [{"role":string,"company":string,"date":string,"bullets":[string]}],
  "education": [{"degree":string,"school":string,"date":string}],
  "skills": [{"label":string,"items":[string]}],
  "contact": {"email":string,"location":string,"github":string,"linkedin":string},
  "imageCategory": string
}`,
    business_card: `You are a brand designer. Generate professional business card JSON. Return ONLY valid JSON.
Schema: {
  "name": string, "title": string, "company": string, "tagline": string,
  "contact": {"email":string,"phone":string,"website":string,"location":string},
  "style": "minimal"|"bold"|"dark"|"creative"|"elegant",
  "imageCategory": string
}`,
    presentation: `You are a presentation expert. Generate a complete slide deck JSON. Return ONLY valid JSON.
Schema: {
  "title": string, "presenter": string, "company": string,
  "slides": [{"type":string,"tag":string,"title":string,"subtitle":string,"bullets":[string],"image":""}],
  "imageCategory": string
}`,
    social_post: `You are a social media content expert. Generate an Instagram/social post JSON. Return ONLY valid JSON.
Schema: {
  "headline": string, "subtext": string, "caption": string, "hashtags": [string],
  "cta": string, "style": "minimal"|"bold"|"gradient"|"dark",
  "palette": "purple"|"blue"|"green"|"orange"|"pink",
  "imageCategory": string
}`,
    invoice: `You are a business professional. Generate a realistic invoice JSON. Return ONLY valid JSON.
Schema: {
  "from": {"company":string,"name":string,"email":string,"address":string},
  "to": {"company":string,"name":string,"email":string,"address":string},
  "invoice_number": string, "date": string, "due_date": string,
  "items": [{"description":string,"quantity":number,"rate":number}],
  "notes": string, "tax_percent": number
}`,
  };

  const systemPrompt = systemPrompts[type];
  if (!systemPrompt)
    return res.status(400).json({ message: `Unknown template type: ${type}` });

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system:     systemPrompt,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    const anthropicData = await anthropicRes.json();
    if (!anthropicRes.ok)
      throw new Error(anthropicData.error?.message || "Anthropic API error");

    const text   = anthropicData.content?.find(b => b.type === "text")?.text || "";
    const tokens = anthropicData.usage?.output_tokens || 0;

    // Parse JSON from response
    let parsed;
    try {
      const clean = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({ message: "AI returned invalid JSON. Try again." });
    }

    // ── Log usage ─────────────────────────────────────────────────────────────
    await pool.query(
      "INSERT INTO ai_usage (user_id, type, prompt, tokens_used) VALUES ($1,$2,$3,$4)",
      [req.user.id, type, prompt.slice(0, 500), tokens]
    );

    res.json({ data: parsed, tokens_used: tokens });

  } catch (err) {
    console.error("AI generate error:", err.message);
    res.status(500).json({ message: err.message || "AI generation failed" });
  }
});

// ── GET /api/ai/usage — usage stats for current user ─────────────────────────
router.get("/usage", authMiddleware, async (req, res) => {
  const plan  = req.user.plan || "starter";
  const limit = AI_LIMITS[plan] ?? 3;

  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

  const { rows } = await pool.query(
    `SELECT COUNT(*) as used, COALESCE(SUM(tokens_used),0) as tokens
     FROM ai_usage WHERE user_id=$1 AND created_at>=$2`,
    [req.user.id, startOfMonth]
  );

  res.json({
    used:      parseInt(rows[0].used),
    limit:     limit === Infinity ? null : limit,
    unlimited: limit === Infinity,
    tokens:    parseInt(rows[0].tokens),
  });
});

module.exports = router;
